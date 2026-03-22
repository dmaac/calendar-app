"""
Fitsia IA — Evolution Engine
Autonomous system that continuously analyzes and improves the codebase.
Runs as a background process, dispatching improvement tasks to the agent dashboard.

Usage:
    python -m scripts.evolution_engine --interval 300  # every 5 min
    python -m scripts.evolution_engine --once           # single pass
"""

import argparse
import json
import subprocess
import time
import os
import re
from pathlib import Path
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent.parent
MOBILE_SRC = PROJECT_ROOT / "mobile" / "src"
BACKEND_SRC = PROJECT_ROOT / "backend" / "app"
DASHBOARD_URL = "http://localhost:8765"
EVOLUTION_LOG = PROJECT_ROOT / "docs" / "agent-logs" / "evolution-engine.md"

# ── Analysis Modules ────────────────────────────────────────────────

def analyze_code_quality():
    """Find code smells and improvement opportunities."""
    issues = []

    # 1. Find TODO/FIXME/HACK comments
    for ext in ["*.tsx", "*.ts", "*.py"]:
        for f in MOBILE_SRC.rglob(ext):
            try:
                content = f.read_text()
                for i, line in enumerate(content.split("\n"), 1):
                    for marker in ["TODO", "FIXME", "HACK", "XXX"]:
                        if marker in line and not "TODO:SECURITY" in line:
                            issues.append({
                                "type": "code_quality",
                                "severity": "low",
                                "file": str(f.relative_to(PROJECT_ROOT)),
                                "line": i,
                                "message": f"{marker} found: {line.strip()[:80]}",
                            })
            except Exception:
                pass

        for f in BACKEND_SRC.rglob(ext):
            try:
                content = f.read_text()
                for i, line in enumerate(content.split("\n"), 1):
                    for marker in ["TODO", "FIXME", "HACK"]:
                        if marker in line:
                            issues.append({
                                "type": "code_quality",
                                "severity": "low",
                                "file": str(f.relative_to(PROJECT_ROOT)),
                                "line": i,
                                "message": f"{marker}: {line.strip()[:80]}",
                            })
            except Exception:
                pass

    return issues


def analyze_performance():
    """Find performance anti-patterns."""
    issues = []

    for f in MOBILE_SRC.rglob("*.tsx"):
        try:
            content = f.read_text()
            fname = str(f.relative_to(PROJECT_ROOT))

            # Inline function in JSX props (causes re-renders)
            inline_fns = len(re.findall(r'onPress=\{?\(\)\s*=>', content))
            if inline_fns > 3:
                issues.append({
                    "type": "performance",
                    "severity": "medium",
                    "file": fname,
                    "message": f"{inline_fns} inline arrow functions in JSX — consider useCallback",
                })

            # Large component without React.memo
            lines = len(content.split("\n"))
            has_memo = "React.memo" in content or "memo(" in content
            if lines > 200 and not has_memo and "Screen" not in fname:
                issues.append({
                    "type": "performance",
                    "severity": "low",
                    "file": fname,
                    "message": f"Large component ({lines} lines) without React.memo",
                })

            # console.log left in production code
            console_logs = len(re.findall(r'console\.(log|warn|error)', content))
            if console_logs > 5:
                issues.append({
                    "type": "code_quality",
                    "severity": "low",
                    "file": fname,
                    "message": f"{console_logs} console.log statements — consider removing for production",
                })

        except Exception:
            pass

    return issues


def analyze_security():
    """Find potential security issues."""
    issues = []

    # Check for hardcoded secrets
    secret_patterns = [
        (r'api[_-]?key\s*[:=]\s*["\'][^"\']{10,}', "Possible hardcoded API key"),
        (r'password\s*[:=]\s*["\'][^"\']{3,}', "Possible hardcoded password"),
        (r'secret\s*[:=]\s*["\'][^"\']{10,}', "Possible hardcoded secret"),
    ]

    for ext in ["*.tsx", "*.ts", "*.py"]:
        search_dirs = [MOBILE_SRC, BACKEND_SRC]
        for search_dir in search_dirs:
            for f in search_dir.rglob(ext):
                try:
                    content = f.read_text()
                    fname = str(f.relative_to(PROJECT_ROOT))
                    if ".env" in fname or "config" in fname.lower():
                        continue
                    for pattern, msg in secret_patterns:
                        matches = re.findall(pattern, content, re.IGNORECASE)
                        if matches:
                            issues.append({
                                "type": "security",
                                "severity": "high",
                                "file": fname,
                                "message": msg,
                            })
                except Exception:
                    pass

    return issues


def analyze_accessibility():
    """Find missing accessibility props."""
    issues = []

    for f in MOBILE_SRC.rglob("*.tsx"):
        try:
            content = f.read_text()
            fname = str(f.relative_to(PROJECT_ROOT))

            # TouchableOpacity without accessibilityLabel
            touchables = len(re.findall(r'<TouchableOpacity', content))
            labels = len(re.findall(r'accessibilityLabel', content))
            if touchables > 0 and labels < touchables * 0.5:
                missing = touchables - labels
                issues.append({
                    "type": "accessibility",
                    "severity": "medium",
                    "file": fname,
                    "message": f"{missing} TouchableOpacity without accessibilityLabel",
                })

            # Images without accessibilityLabel
            images = len(re.findall(r'<Image\b', content))
            img_labels = len(re.findall(r'accessibilityLabel.*Image|Image.*accessibilityLabel', content))
            if images > 0 and img_labels < images:
                issues.append({
                    "type": "accessibility",
                    "severity": "low",
                    "file": fname,
                    "message": f"{images - img_labels} Image without accessibilityLabel",
                })

        except Exception:
            pass

    return issues


def analyze_test_coverage():
    """Check for missing tests."""
    issues = []

    # Check if test files exist for main services
    test_dir = PROJECT_ROOT / "backend" / "tests"
    services = list((BACKEND_SRC / "services").glob("*.py")) if (BACKEND_SRC / "services").exists() else []

    for service in services:
        if service.name.startswith("__"):
            continue
        test_file = test_dir / f"test_{service.name}" if test_dir.exists() else None
        if not test_file or not test_file.exists():
            issues.append({
                "type": "testing",
                "severity": "medium",
                "file": str(service.relative_to(PROJECT_ROOT)),
                "message": f"No test file found for {service.name}",
            })

    return issues


def analyze_documentation():
    """Check for missing documentation."""
    issues = []

    # Check screens without JSDoc header
    for f in (MOBILE_SRC / "screens" / "main").rglob("*.tsx"):
        try:
            content = f.read_text()
            if not content.strip().startswith("/**"):
                issues.append({
                    "type": "documentation",
                    "severity": "low",
                    "file": str(f.relative_to(PROJECT_ROOT)),
                    "message": "Missing JSDoc header comment",
                })
        except Exception:
            pass

    return issues


# ── Evolution Report ────────────────────────────────────────────────

def generate_report(all_issues):
    """Generate evolution report."""
    by_type = {}
    by_severity = {"high": 0, "medium": 0, "low": 0}

    for issue in all_issues:
        t = issue["type"]
        s = issue["severity"]
        by_type.setdefault(t, []).append(issue)
        by_severity[s] += 1

    report = []
    report.append(f"# Evolution Engine Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    report.append(f"\nTotal issues: {len(all_issues)}")
    report.append(f"High: {by_severity['high']} | Medium: {by_severity['medium']} | Low: {by_severity['low']}")
    report.append("")

    for category, issues in sorted(by_type.items()):
        report.append(f"## {category.upper()} ({len(issues)} issues)")
        for issue in issues[:10]:  # limit per category
            sev = issue['severity'].upper()
            report.append(f"- [{sev}] `{issue['file']}` — {issue['message']}")
        if len(issues) > 10:
            report.append(f"  ... and {len(issues) - 10} more")
        report.append("")

    return "\n".join(report)


def dispatch_to_dashboard(issues):
    """Send high-priority issues to the agent dashboard."""
    high_issues = [i for i in issues if i["severity"] == "high"]
    if not high_issues:
        return

    try:
        import httpx
        for issue in high_issues[:5]:
            httpx.post(f"{DASHBOARD_URL}/api/event", json={
                "agent_name": "fitsia-security-daemon",
                "event_type": "reviewing",
                "detail": f"[{issue['type']}] {issue['file']}: {issue['message']}",
            }, timeout=5)
    except Exception:
        pass


# ── Main ────────────────────────────────────────────────────────────

def run_evolution_pass():
    """Execute one full evolution analysis pass."""
    print(f"\n{'='*60}")
    print(f"EVOLUTION ENGINE — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    all_issues = []

    analyzers = [
        ("Code Quality", analyze_code_quality),
        ("Performance", analyze_performance),
        ("Security", analyze_security),
        ("Accessibility", analyze_accessibility),
        ("Testing", analyze_test_coverage),
        ("Documentation", analyze_documentation),
    ]

    for name, analyzer in analyzers:
        print(f"\nAnalyzing {name}...")
        issues = analyzer()
        all_issues.extend(issues)
        print(f"  Found {len(issues)} issues")

    # Generate report
    report = generate_report(all_issues)
    print(f"\n{report}")

    # Save report
    EVOLUTION_LOG.parent.mkdir(parents=True, exist_ok=True)
    EVOLUTION_LOG.write_text(report)
    print(f"\nReport saved to {EVOLUTION_LOG}")

    # Dispatch high-priority to dashboard
    dispatch_to_dashboard(all_issues)

    return all_issues


def main():
    parser = argparse.ArgumentParser(description="Fitsia Evolution Engine")
    parser.add_argument("--interval", type=int, default=300, help="Seconds between passes (default 300)")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    if args.once:
        run_evolution_pass()
        return

    print("Evolution Engine starting in continuous mode...")
    print(f"Interval: {args.interval}s")

    while True:
        try:
            run_evolution_pass()
        except Exception as e:
            print(f"Error in evolution pass: {e}")

        print(f"\nNext pass in {args.interval}s...")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()

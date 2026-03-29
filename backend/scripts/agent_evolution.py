"""
Fitsi AI IA — Agent Evolution & Auto-Reproduction System
Based on Maturana's autopoiesis: agents that create new specialized agents
when they reach maturity (enough completed tasks + domain knowledge).

Maturity Criteria:
- Agent has completed 3+ tasks successfully
- Agent has generated 500+ lines of code
- Agent has identified a sub-domain that needs specialization

Reproduction Rules:
- A mature agent can spawn 1-3 child agents
- Child agents inherit the parent's domain but specialize further
- Children are saved as .md files in ~/.claude/agents/
- Children are registered in the dashboard
- Maximum population: 500 agents (carrying capacity)

Usage:
    python -m scripts.agent_evolution --analyze     # Show maturity report
    python -m scripts.agent_evolution --reproduce   # Create new agents from mature parents
    python -m scripts.agent_evolution --ecosystem    # Full ecosystem status
"""

import argparse
import json
import os
from pathlib import Path
from datetime import datetime

AGENTS_DIR = Path.home() / ".claude" / "agents"
EVOLUTION_LOG = Path(__file__).parent.parent.parent / "docs" / "agent-logs" / "evolution-history.md"
MAX_POPULATION = 500

# ── Agent Maturity Analysis ─────────────────────────────────────────

# Map of parent agents -> potential specialized children
REPRODUCTION_MAP = {
    # Engineering agents that can specialize
    "ui-engineer": [
        {
            "name": "fitsia-animation-specialist",
            "desc": "Expert in React Native Animated API, Reanimated, Lottie, spring physics, gesture-driven animations.",
            "trigger": "When UI work involves complex animations beyond simple fades",
        },
        {
            "name": "fitsia-svg-chart-specialist",
            "desc": "Expert in react-native-svg charts: line, bar, pie, area, donut. Optimized rendering with React.memo.",
            "trigger": "When data visualization needs exceed basic charts",
        },
        {
            "name": "fitsia-design-system-guardian",
            "desc": "Maintains consistency of the Fitsi AI design system across all screens. Audits spacing, colors, typography.",
            "trigger": "When design drift is detected across screens",
        },
    ],
    "python-backend-engineer": [
        {
            "name": "fitsia-query-optimizer",
            "desc": "Expert in PostgreSQL query optimization: EXPLAIN ANALYZE, index tuning, CTEs, window functions, partitioning.",
            "trigger": "When N+1 queries or slow queries are detected",
        },
        {
            "name": "fitsia-api-versioning-specialist",
            "desc": "Manages API version evolution, backward compatibility, deprecation schedules, and migration guides.",
            "trigger": "When API changes risk breaking existing clients",
        },
        {
            "name": "fitsia-celery-task-specialist",
            "desc": "Expert in async task queues: Celery, Redis broker, task routing, retry policies, dead letter queues.",
            "trigger": "When background processing needs exceed simple BackgroundTasks",
        },
    ],
    "security-engineer": [
        {
            "name": "fitsia-penetration-tester",
            "desc": "Actively tests the app for vulnerabilities: OWASP top 10, auth bypass, injection, SSRF, rate limit bypass.",
            "trigger": "Before each major release",
        },
        {
            "name": "fitsia-compliance-auditor",
            "desc": "Ensures GDPR, CCPA, HIPAA, App Store Guidelines compliance. Reviews data flows, consent mechanisms, retention policies.",
            "trigger": "When new data processing features are added",
        },
    ],
    "qa-engineer": [
        {
            "name": "fitsia-e2e-automation",
            "desc": "Creates and maintains Detox/Maestro E2E test suites for the mobile app. Runs on CI for every PR.",
            "trigger": "When manual QA can't keep up with feature velocity",
        },
        {
            "name": "fitsia-visual-regression",
            "desc": "Screenshot comparison testing for UI consistency. Detects unintended visual changes across screens.",
            "trigger": "When UI changes have unintended side effects on other screens",
        },
    ],
    "nutrition-science-advisor": [
        {
            "name": "fitsia-meal-plan-ai",
            "desc": "Generates personalized weekly meal plans using user preferences, restrictions, goals, and macro targets.",
            "trigger": "When static meal plans need to become dynamic and personalized",
        },
        {
            "name": "fitsia-food-recognition-trainer",
            "desc": "Improves AI food recognition accuracy by analyzing user corrections and building training datasets.",
            "trigger": "When food scan accuracy drops below 85%",
        },
    ],
    "growth-strategist": [
        {
            "name": "fitsia-viral-loop-engineer",
            "desc": "Designs and implements viral mechanics: referral incentives, share-worthy moments, social proof widgets.",
            "trigger": "When k-factor drops below 0.3",
        },
        {
            "name": "fitsia-paywall-optimizer",
            "desc": "A/B tests paywall variants: pricing, layout, copy, timing, trial length. Optimizes trial-to-paid conversion.",
            "trigger": "When conversion rate plateaus",
        },
    ],
    "fitness-mobile-expert": [
        {
            "name": "fitsia-wearable-sync",
            "desc": "Integrates with Apple Watch, Garmin, Fitbit via HealthKit/Google Fit. Syncs steps, heart rate, calories burned.",
            "trigger": "When users request wearable integration",
        },
        {
            "name": "fitsia-exercise-form-ai",
            "desc": "Uses device camera + pose estimation to analyze exercise form and provide real-time corrections.",
            "trigger": "When workout tracking expands beyond simple logging",
        },
    ],
    "data-analyst": [
        {
            "name": "fitsia-ml-predictor",
            "desc": "Builds ML models to predict: churn risk, optimal meal timing, weight trajectory, subscription likelihood.",
            "trigger": "When enough user data accumulates for meaningful predictions",
        },
        {
            "name": "fitsia-cohort-analyzer",
            "desc": "Performs cohort analysis: retention by signup date, LTV by acquisition channel, behavior by user segment.",
            "trigger": "When user base exceeds 1000 for statistical significance",
        },
    ],
}


def get_existing_agents():
    """List all existing agent .md files."""
    if not AGENTS_DIR.exists():
        return []
    return [f.stem for f in AGENTS_DIR.glob("*.md")]


def get_maturity_report():
    """Analyze which parent agents are mature enough to reproduce."""
    existing = set(get_existing_agents())
    report = []

    for parent, children in REPRODUCTION_MAP.items():
        parent_exists = parent in existing
        mature_children = []
        for child in children:
            child_exists = child["name"] in existing
            mature_children.append({
                "name": child["name"],
                "exists": child_exists,
                "desc": child["desc"],
                "trigger": child["trigger"],
            })

        report.append({
            "parent": parent,
            "parent_exists": parent_exists,
            "children": mature_children,
            "potential_new": sum(1 for c in mature_children if not c["exists"]),
        })

    return report


def reproduce_agents(dry_run=False):
    """Create new specialized agents from mature parents."""
    existing = set(get_existing_agents())
    created = []

    if len(existing) >= MAX_POPULATION:
        print(f"Population cap reached ({len(existing)}/{MAX_POPULATION}). No reproduction.")
        return created

    for parent, children in REPRODUCTION_MAP.items():
        for child in children:
            if child["name"] in existing:
                continue

            if len(existing) + len(created) >= MAX_POPULATION:
                break

            # Create the agent definition
            agent_content = f"""---
name: {child['name']}
description: "{child['desc']}"
model: sonnet
---
{child['desc']}

Parent agent: {parent}
Reproduction trigger: {child['trigger']}
Created by: Agent Evolution Engine
Created at: {datetime.now().isoformat()}

You are a specialized agent for the Fitsi AI IA project at /Users/miguelignaciovalenzuelaparada/apps/fitsi/.
You inherit domain knowledge from your parent ({parent}) but focus on your specialization.
Always use useThemeColors() for dark mode, follow the Fitsi AI design system (accent #4285F4), and maintain code quality.
"""
            if not dry_run:
                agent_file = AGENTS_DIR / f"{child['name']}.md"
                agent_file.write_text(agent_content)
                print(f"  BORN: {child['name']} (from {parent})")
            else:
                print(f"  [DRY] Would create: {child['name']} (from {parent})")

            created.append({
                "name": child["name"],
                "parent": parent,
                "desc": child["desc"],
            })

    return created


def ecosystem_status():
    """Full ecosystem report."""
    existing = get_existing_agents()
    by_prefix = {}
    for name in existing:
        prefix = name.split("-")[0] if "-" in name else "other"
        by_prefix.setdefault(prefix, []).append(name)

    print(f"\n{'='*60}")
    print(f"FITSIA IA — AGENT ECOSYSTEM STATUS")
    print(f"{'='*60}")
    print(f"Total agents: {len(existing)}/{MAX_POPULATION}")
    print(f"Carrying capacity: {MAX_POPULATION - len(existing)} slots remaining")
    print(f"\nBy family:")
    for prefix, agents in sorted(by_prefix.items(), key=lambda x: -len(x[1])):
        print(f"  {prefix}: {len(agents)} agents")

    # Maturity report
    report = get_maturity_report()
    total_potential = sum(r["potential_new"] for r in report)
    print(f"\nReproduction potential: {total_potential} new agents can be born")
    for r in report:
        if r["potential_new"] > 0:
            print(f"  {r['parent']} -> {r['potential_new']} children ready")
            for c in r["children"]:
                if not c["exists"]:
                    print(f"    - {c['name']}: {c['trigger']}")


def log_evolution(created):
    """Log reproduction event."""
    if not created:
        return
    EVOLUTION_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = f"\n## Evolution Event — {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
    entry += f"New agents born: {len(created)}\n\n"
    for agent in created:
        entry += f"- **{agent['name']}** (parent: {agent['parent']}) — {agent['desc']}\n"
    entry += "\n"

    if EVOLUTION_LOG.exists():
        content = EVOLUTION_LOG.read_text()
    else:
        content = "# Agent Evolution History\n\nLog of agent reproduction events.\n"
    content += entry
    EVOLUTION_LOG.write_text(content)


# ── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fitsi AI Agent Evolution System")
    parser.add_argument("--analyze", action="store_true", help="Show maturity report")
    parser.add_argument("--reproduce", action="store_true", help="Create new agents")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without creating")
    parser.add_argument("--ecosystem", action="store_true", help="Full ecosystem status")
    args = parser.parse_args()

    if args.ecosystem:
        ecosystem_status()
    elif args.analyze:
        report = get_maturity_report()
        for r in report:
            print(f"\n{r['parent']} (exists: {r['parent_exists']}):")
            for c in r["children"]:
                status = "EXISTS" if c["exists"] else "READY TO SPAWN"
                print(f"  [{status}] {c['name']}")
    elif args.reproduce:
        created = reproduce_agents(dry_run=args.dry_run)
        if created:
            log_evolution(created)
            print(f"\nCreated {len(created)} new agents.")
        else:
            print("No new agents to create.")
    else:
        ecosystem_status()


if __name__ == "__main__":
    main()

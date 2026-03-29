"""
Skill Enricher — Deep skill assignment for ALL 5,000+ agents
=============================================================
Assigns specific, meaningful skills to every agent based on their
name, team, category, and description. Also sets up delegation chains.
"""

import sqlite3
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

DB_PATH = Path(__file__).parent / "agents.db"

# ══════════════════════════════════════════════════════════════
# SKILL DEFINITIONS BY AGENT NAME PATTERN
# ══════════════════════════════════════════════════════════════

# Pattern → [(skill_name, skill_type, definition)]
NAME_PATTERN_SKILLS = [
    # Testing agents
    (r"qa-|test|testing", [
        ("run_test_suite", "terminal", "pytest/jest execution with coverage report"),
        ("generate_test_data", "terminal", "Create test fixtures and factories"),
        ("validate_contract", "terminal", "API contract validation with schemas"),
        ("regression_check", "terminal", "Run regression suite, compare baselines"),
    ]),
    # Security agents
    (r"security|pen.?test|vuln|auth.*harden", [
        ("security_scan", "terminal", "OWASP scan: bandit, npm audit, trivy"),
        ("secret_detection", "terminal", "Scan for exposed secrets: trufflehog, git-secrets"),
        ("auth_audit", "terminal", "Verify auth flows: token expiry, RBAC, MFA"),
        ("dependency_audit", "terminal", "CVE check: pip-audit, npm audit, snyk"),
    ]),
    # Backend engineers
    (r"backend|fastapi|django|flask|api", [
        ("run_backend_tests", "terminal", "pytest -x backend/tests/ --tb=short"),
        ("check_migrations", "terminal", "alembic check, show pending migrations"),
        ("lint_python", "terminal", "flake8 + mypy type checking"),
        ("start_server", "terminal", "uvicorn/gunicorn startup with health check"),
        ("db_query", "terminal", "Execute SQL via psql or sqlite3"),
    ]),
    # Frontend/Mobile engineers
    (r"mobile|react.?native|frontend|flutter|ios|android", [
        ("run_mobile_tests", "terminal", "jest --coverage mobile/src/"),
        ("lint_typescript", "terminal", "eslint + tsc --noEmit"),
        ("build_mobile", "terminal", "expo build / eas build"),
        ("check_bundle_size", "terminal", "npx react-native-bundle-visualizer"),
    ]),
    # AI/ML agents
    (r"ai-|ml-|deep.?learn|computer.?vision|nlp|llm", [
        ("run_inference", "terminal", "Execute AI model inference pipeline"),
        ("evaluate_model", "terminal", "Run accuracy/F1/BLEU evaluation suite"),
        ("optimize_prompt", "terminal", "Test prompt variants, measure quality"),
        ("process_dataset", "terminal", "ETL for training data preparation"),
    ]),
    # DevOps/Infra
    (r"devops|docker|kubernetes|k8s|terraform|ci.?cd|deploy", [
        ("docker_build", "terminal", "docker build + push to registry"),
        ("run_pipeline", "terminal", "GitHub Actions / CI trigger"),
        ("health_check", "terminal", "curl health endpoints, check uptime"),
        ("scale_service", "terminal", "kubectl scale / docker-compose up"),
        ("view_logs", "terminal", "docker logs / kubectl logs analysis"),
    ]),
    # Database agents
    (r"database|postgres|mysql|redis|mongo|sql|migration", [
        ("run_migration", "terminal", "alembic upgrade head / prisma migrate"),
        ("optimize_query", "terminal", "EXPLAIN ANALYZE on slow queries"),
        ("backup_db", "terminal", "pg_dump / mongodump backup"),
        ("seed_data", "terminal", "Run seed scripts for test data"),
    ]),
    # Data engineering
    (r"data-|analytics|etl|pipeline|warehouse|dbt", [
        ("run_etl", "terminal", "Execute ETL pipeline: extract, transform, load"),
        ("dbt_run", "terminal", "dbt run + dbt test"),
        ("query_warehouse", "terminal", "BigQuery/Redshift SQL execution"),
        ("validate_data", "terminal", "Data quality checks: null, duplicates, schema"),
    ]),
    # Monitoring/Observability
    (r"monitor|observ|alert|metric|sre|incident|on.?call", [
        ("check_alerts", "terminal", "Query alertmanager / PagerDuty status"),
        ("collect_metrics", "terminal", "Prometheus/Grafana metric queries"),
        ("analyze_logs", "terminal", "grep/jq log analysis for patterns"),
        ("run_healthcheck", "terminal", "Endpoint health + latency check"),
    ]),
    # Performance
    (r"performance|load.?test|stress|capacity|benchmark", [
        ("run_load_test", "terminal", "k6/locust load test execution"),
        ("profile_app", "terminal", "CPU/memory profiling: cProfile, heaptrack"),
        ("benchmark", "terminal", "Run benchmark suite, compare baselines"),
    ]),
    # Coaches/Advisors
    (r"coach|advisor|expert|specialist|consultant", [
        ("analyze_data", "analysis", "Analyze data and generate recommendations"),
        ("generate_report", "analysis", "Create structured report from findings"),
        ("delegate_action", "delegation", "Route action items to specialists"),
    ]),
    # Leaders/Managers
    (r"lead|manager|director|vp-|chief|head-|ceo|cto|cfo|coo|cpo", [
        ("team_status", "analysis", "Aggregate team status from member reports"),
        ("delegate_task", "delegation", "Assign tasks to team members"),
        ("review_deliverable", "review", "Review and approve/reject work output"),
        ("escalate_blocker", "delegation", "Escalate blocked items to next level"),
        ("orchestrate_workflow", "orchestration", "Coordinate multi-agent workflow"),
    ]),
    # Coordinators
    (r"coordinator|orchestrat", [
        ("coordinate_team", "orchestration", "Manage parallel agent execution"),
        ("merge_results", "analysis", "Combine outputs from multiple agents"),
        ("route_task", "delegation", "Route incoming tasks to right specialist"),
        ("report_progress", "analysis", "Generate team progress summary"),
    ]),
    # Content/Marketing
    (r"content|marketing|seo|social|copy|brand|growth", [
        ("generate_content", "generation", "Create marketing/content assets"),
        ("analyze_metrics", "terminal", "Query analytics: GA, Mixpanel, Amplitude"),
        ("seo_audit", "terminal", "Run SEO analysis tools"),
    ]),
    # Nutrition/Health specific (Fitsia domain)
    (r"nutri|food|meal|calorie|diet|recipe|bmr|macro|hydrat", [
        ("calc_nutrition", "terminal", "Calculate BMR/TDEE/macros from user data"),
        ("validate_food_data", "terminal", "Verify nutrition DB entries: USDA, OpenFoodFacts"),
        ("generate_meal_plan", "generation", "Create personalized meal plans"),
        ("analyze_diet_log", "analysis", "Analyze food log for patterns and alerts"),
    ]),
    # Fitness/Exercise specific
    (r"fitness|exercise|workout|training|strength|cardio|yoga|swim|run", [
        ("build_workout", "generation", "Generate training program"),
        ("analyze_progress", "analysis", "Analyze training progress and plateaus"),
        ("calc_1rm", "terminal", "Calculate 1RM estimates from log data"),
    ]),
    # Payment/Subscription
    (r"payment|subscription|billing|monetiz|pricing|paywall|revenue", [
        ("verify_subscription", "terminal", "Check RevenueCat/Stripe subscription status"),
        ("process_webhook", "terminal", "Handle payment webhook events"),
        ("generate_invoice", "terminal", "Create subscription invoice/receipt"),
    ]),
    # Maturana autopoietic agents (generic but purposeful)
    (r"perception|metabolism|inference|coherence|prediction", [
        ("observe_system", "monitoring", "Monitor system state and detect anomalies"),
        ("process_signal", "analysis", "Process incoming signals and extract meaning"),
        ("adapt_structure", "terminal", "Modify own configuration based on perturbation"),
    ]),
    (r"communication|translation|language|pattern_recognition", [
        ("translate_message", "analysis", "Convert between TOON/JSON/text formats"),
        ("recognize_pattern", "analysis", "Detect patterns in agent interaction data"),
        ("relay_message", "delegation", "Forward messages between agents"),
    ]),
    (r"homeostasis|adaptation|identity|memory|creativity|trust", [
        ("maintain_balance", "monitoring", "Monitor and maintain system homeostasis"),
        ("store_knowledge", "terminal", "Persist learned patterns to shared_memory"),
        ("evolve_self", "terminal", "Trigger self-evolution based on performance data"),
    ]),
    (r"symbiosis|culture|care|ritual|abstraction", [
        ("collaborate", "delegation", "Initiate collaborative task with partner agent"),
        ("share_insight", "analysis", "Share learned insight with team"),
        ("maintain_ritual", "monitoring", "Execute periodic maintenance routine"),
    ]),
]

# Default skills for agents that don't match any pattern
DEFAULT_ENRICHED_SKILLS = [
    ("execute_task", "terminal", "Execute assigned task via terminal command"),
    ("report_status", "analysis", "Report current status and results"),
    ("delegate_next", "delegation", "Pass results to next agent in chain"),
    ("observe_environment", "monitoring", "Monitor system state for relevant changes"),
]


def get_matching_skills(agent_name: str, description: str = "") -> list:
    """Get skills that match an agent's name/description."""
    combined = f"{agent_name} {description}".lower()
    matched_skills = []

    for pattern, skills in NAME_PATTERN_SKILLS:
        if re.search(pattern, combined):
            for skill in skills:
                if skill not in matched_skills:
                    matched_skills.append(skill)

    if not matched_skills:
        matched_skills = DEFAULT_ENRICHED_SKILLS.copy()

    return matched_skills


def enrich_agent_batch(agents: list) -> dict:
    """Enrich a batch of agents with pattern-matched skills."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")

    stats = {"processed": 0, "skills_added": 0, "skipped": 0}

    for agent in agents:
        name = agent["name"]
        desc = agent.get("description", "")
        skills = get_matching_skills(name, desc)

        for skill_name, skill_type, skill_def in skills:
            try:
                conn.execute("""
                    INSERT OR IGNORE INTO agent_skills (agent_name, skill_name, skill_type, skill_definition)
                    VALUES (?, ?, ?, ?)
                """, (name, skill_name, skill_type, skill_def))
                stats["skills_added"] += 1
            except sqlite3.IntegrityError:
                stats["skipped"] += 1

        stats["processed"] += 1

    conn.commit()
    conn.close()
    return stats


def enrich_all_agents(num_workers: int = 10, batch_size: int = 500) -> dict:
    """Enrich ALL agents using concurrent workers."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    agents = [dict(r) for r in conn.execute("SELECT name, description FROM agent_registry").fetchall()]
    conn.close()

    total = len(agents)
    print(f"[ENRICHER] Processing {total} agents with {num_workers} workers...")

    # Split into batches
    batches = [agents[i:i+batch_size] for i in range(0, total, batch_size)]

    total_stats = {"processed": 0, "skills_added": 0, "skipped": 0}

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(enrich_agent_batch, batch): i for i, batch in enumerate(batches)}

        for future in as_completed(futures):
            batch_num = futures[future] + 1
            try:
                result = future.result()
                total_stats["processed"] += result["processed"]
                total_stats["skills_added"] += result["skills_added"]
                total_stats["skipped"] += result["skipped"]
                print(f"  [WORKER] Batch {batch_num}/{len(batches)} done: +{result['skills_added']} skills")
            except Exception as e:
                print(f"  [ERROR] Batch {batch_num}: {e}")

    return total_stats


def setup_delegation_chains() -> dict:
    """Set up delegation chains for existing teams."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row

    # Get all teams from agent_registry
    teams = conn.execute(
        "SELECT DISTINCT team FROM agent_registry WHERE team IS NOT NULL ORDER BY team"
    ).fetchall()

    chains_created = 0

    for team_row in teams:
        team = team_row["team"]
        members = conn.execute(
            "SELECT name FROM agent_registry WHERE team=? ORDER BY name LIMIT 20",
            (team,)
        ).fetchall()

        if len(members) < 2:
            continue

        member_names = [m["name"] for m in members]

        # Find or create team config
        for i, name in enumerate(member_names):
            role = "lead" if i == 0 else ("specialist" if i == len(member_names) - 1 else "member")
            delegates_to = member_names[i + 1] if i < len(member_names) - 1 else None
            receives_from = member_names[i - 1] if i > 0 else None

            try:
                conn.execute("""
                    INSERT OR IGNORE INTO agent_team_config (
                        team_name, agent_name, role_in_team, delegation_order,
                        delegates_to, receives_from, is_entry_point, is_exit_point
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (team, name, role, i, delegates_to, receives_from,
                      1 if i == 0 else 0, 1 if i == len(member_names) - 1 else 0))
                chains_created += 1
            except sqlite3.IntegrityError:
                pass

    conn.commit()
    conn.close()

    return {"teams_processed": len(teams), "chain_entries_created": chains_created}


if __name__ == "__main__":
    print("=" * 60)
    print("FITSI IA — SKILL ENRICHER")
    print("=" * 60)

    print("\n[1/2] Enriching agent skills (pattern-matched)...")
    enrich_stats = enrich_all_agents(num_workers=10, batch_size=500)
    print(f"\n  RESULTS:")
    print(f"    Agents processed: {enrich_stats['processed']}")
    print(f"    Skills added: {enrich_stats['skills_added']}")
    print(f"    Skipped (duplicates): {enrich_stats['skipped']}")

    print("\n[2/2] Setting up delegation chains...")
    chain_stats = setup_delegation_chains()
    print(f"    Teams processed: {chain_stats['teams_processed']}")
    print(f"    Chain entries: {chain_stats['chain_entries_created']}")

    # Final count
    conn = sqlite3.connect(DB_PATH)
    total_skills = conn.execute("SELECT COUNT(*) FROM agent_skills").fetchone()[0]
    total_chains = conn.execute("SELECT COUNT(*) FROM agent_team_config").fetchone()[0]
    agents_with_skills = conn.execute("SELECT COUNT(DISTINCT agent_name) FROM agent_skills").fetchone()[0]
    conn.close()

    print(f"\n  FINAL TOTALS:")
    print(f"    Total skills in DB: {total_skills:,}")
    print(f"    Agents with skills: {agents_with_skills:,}")
    print(f"    Team config entries: {total_chains:,}")
    print("\n" + "=" * 60)

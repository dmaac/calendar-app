"""
Skill Engine — Universal Agent Execution Framework
====================================================
Makes ALL 5,000 agents executable with:
- Standard state machine (pending/running/blocked/failed/completed/rolled_back)
- Terminal execution with security policies
- Full observability (agent, command, duration, result, artifacts, deps, failure reason)
- Skill storage in DB
- Team creation and task delegation chain
"""

import sqlite3
import subprocess
import os
import time
import json
import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "agents.db"

# ══════════════════════════════════════════════════════════════
# PHASE 1: DATABASE SCHEMA — Skill Engine Tables
# ══════════════════════════════════════════════════════════════

SKILL_ENGINE_SCHEMA = """
-- ═══ Agent State Machine ═══
CREATE TABLE IF NOT EXISTS agent_state_machine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    current_state TEXT NOT NULL DEFAULT 'pending'
        CHECK(current_state IN ('pending','running','blocked','failed','completed','rolled_back')),
    previous_state TEXT,
    state_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    state_reason TEXT,
    task_id TEXT,
    blocked_by_agent TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    UNIQUE(agent_name, task_id)
);
CREATE INDEX IF NOT EXISTS idx_state_agent ON agent_state_machine(agent_name);
CREATE INDEX IF NOT EXISTS idx_state_current ON agent_state_machine(current_state);
CREATE INDEX IF NOT EXISTS idx_state_task ON agent_state_machine(task_id);

-- ═══ Agent Skills (stored per agent) ═══
CREATE TABLE IF NOT EXISTS agent_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    skill_type TEXT NOT NULL DEFAULT 'terminal'
        CHECK(skill_type IN ('terminal','delegation','analysis','generation','review','orchestration','monitoring')),
    skill_definition TEXT NOT NULL,
    skill_version INTEGER DEFAULT 1,
    input_schema TEXT,
    output_schema TEXT,
    depends_on_skills TEXT,
    timeout_ms INTEGER DEFAULT 120000,
    is_active INTEGER DEFAULT 1,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    avg_duration_ms INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(agent_name, skill_name)
);
CREATE INDEX IF NOT EXISTS idx_skills_agent ON agent_skills(agent_name);
CREATE INDEX IF NOT EXISTS idx_skills_type ON agent_skills(skill_type);
CREATE INDEX IF NOT EXISTS idx_skills_active ON agent_skills(is_active);

-- ═══ Execution Policy (per agent) ═══
CREATE TABLE IF NOT EXISTS agent_execution_policy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL UNIQUE,
    working_directory TEXT DEFAULT '.',
    timeout_ms INTEGER DEFAULT 120000,
    max_concurrent_commands INTEGER DEFAULT 3,
    env_vars_allowed TEXT DEFAULT '{}',
    env_vars_blocked TEXT DEFAULT '["API_KEY","SECRET","PASSWORD","TOKEN"]',
    command_whitelist TEXT,
    command_blacklist TEXT DEFAULT '["rm -rf /","sudo rm","mkfs","dd if=","shutdown","reboot"]',
    max_output_bytes INTEGER DEFAULT 1048576,
    allow_network INTEGER DEFAULT 0,
    allow_file_write INTEGER DEFAULT 1,
    allow_file_delete INTEGER DEFAULT 0,
    sandbox_mode TEXT DEFAULT 'restricted'
        CHECK(sandbox_mode IN ('unrestricted','restricted','readonly','isolated')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_policy_agent ON agent_execution_policy(agent_name);

-- ═══ Execution Log (observability) ═══
CREATE TABLE IF NOT EXISTS agent_execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL UNIQUE,
    agent_name TEXT NOT NULL,
    task_id TEXT,
    skill_name TEXT,
    command TEXT NOT NULL,
    working_directory TEXT,
    env_vars_used TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    exit_code INTEGER,
    stdout TEXT,
    stderr TEXT,
    result_status TEXT DEFAULT 'running'
        CHECK(result_status IN ('running','success','failure','timeout','killed','skipped')),
    artifacts_created TEXT,
    dependency_execution_id TEXT,
    dependency_agent TEXT,
    failure_reason TEXT,
    tokens_consumed INTEGER DEFAULT 0,
    bytes_processed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_execlog_agent ON agent_execution_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_execlog_task ON agent_execution_log(task_id);
CREATE INDEX IF NOT EXISTS idx_execlog_status ON agent_execution_log(result_status);
CREATE INDEX IF NOT EXISTS idx_execlog_time ON agent_execution_log(started_at);

-- ═══ Agent Team Config (delegation chains) ═══
CREATE TABLE IF NOT EXISTS agent_team_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_name TEXT NOT NULL,
    team_description TEXT,
    agent_name TEXT NOT NULL,
    role_in_team TEXT NOT NULL DEFAULT 'member'
        CHECK(role_in_team IN ('lead','coordinator','member','specialist','observer')),
    delegation_order INTEGER DEFAULT 0,
    delegates_to TEXT,
    receives_from TEXT,
    is_entry_point INTEGER DEFAULT 0,
    is_exit_point INTEGER DEFAULT 0,
    max_parallel_tasks INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(team_name, agent_name)
);
CREATE INDEX IF NOT EXISTS idx_teamcfg_team ON agent_team_config(team_name);
CREATE INDEX IF NOT EXISTS idx_teamcfg_agent ON agent_team_config(agent_name);
CREATE INDEX IF NOT EXISTS idx_teamcfg_order ON agent_team_config(delegation_order);

-- ═══ Task Delegation Chain (tracks handoffs) ═══
CREATE TABLE IF NOT EXISTS task_delegation_chain (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    from_agent TEXT,
    to_agent TEXT NOT NULL,
    delegation_type TEXT DEFAULT 'sequential'
        CHECK(delegation_type IN ('sequential','parallel','conditional','fallback')),
    input_data TEXT,
    output_data TEXT,
    state TEXT DEFAULT 'pending'
        CHECK(state IN ('pending','running','blocked','failed','completed','rolled_back','skipped')),
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chain_id ON task_delegation_chain(chain_id);
CREATE INDEX IF NOT EXISTS idx_chain_task ON task_delegation_chain(task_id);
CREATE INDEX IF NOT EXISTS idx_chain_to ON task_delegation_chain(to_agent);

-- ═══ Skill Templates (reusable skill blueprints) ═══
CREATE TABLE IF NOT EXISTS skill_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name TEXT NOT NULL UNIQUE,
    template_type TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    skill_definition TEXT NOT NULL,
    input_schema TEXT,
    output_schema TEXT,
    default_timeout_ms INTEGER DEFAULT 120000,
    applicable_to_teams TEXT,
    applicable_to_categories TEXT,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tpl_type ON skill_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_tpl_category ON skill_templates(category);
"""


def migrate_skill_engine():
    """Run the skill engine migration — adds all new tables."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")

    # Use executescript for atomic multi-statement execution
    conn.executescript(SKILL_ENGINE_SCHEMA)

    conn.commit()
    conn.close()
    print("[SKILL ENGINE] Migration complete — 7 new tables created")


# ══════════════════════════════════════════════════════════════
# PHASE 2: STANDARD STATES
# ══════════════════════════════════════════════════════════════

VALID_AGENT_STATES = {
    "pending",      # Waiting to start
    "running",      # Actively executing
    "blocked",      # Waiting on dependency
    "failed",       # Execution failed
    "completed",    # Successfully finished
    "rolled_back",  # Reverted after failure
}

STATE_TRANSITIONS = {
    "pending":     ["running", "blocked", "failed"],
    "running":     ["completed", "failed", "blocked"],
    "blocked":     ["running", "failed", "rolled_back"],
    "failed":      ["pending", "rolled_back"],  # retry or rollback
    "completed":   ["pending"],                  # re-run
    "rolled_back": ["pending"],                  # retry from scratch
}


def transition_state(agent_name: str, task_id: str, new_state: str, reason: str = None) -> bool:
    """Transition an agent's state with validation and retry."""
    import time as _time
    if new_state not in VALID_AGENT_STATES:
        raise ValueError(f"Invalid state: {new_state}. Valid: {VALID_AGENT_STATES}")

    for attempt in range(5):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=60)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=30000")
            conn.row_factory = sqlite3.Row

            row = conn.execute(
                "SELECT current_state FROM agent_state_machine WHERE agent_name=? AND task_id=?",
                (agent_name, task_id)
            ).fetchone()

            if row:
                current = row["current_state"]
                allowed = STATE_TRANSITIONS.get(current, [])
                if new_state not in allowed:
                    conn.close()
                    raise ValueError(f"Cannot transition {agent_name} from '{current}' to '{new_state}'. Allowed: {allowed}")

                conn.execute("""
                    UPDATE agent_state_machine
                    SET previous_state=current_state, current_state=?, state_changed_at=?, state_reason=?
                    WHERE agent_name=? AND task_id=?
                """, (new_state, datetime.now(timezone.utc).isoformat(), reason, agent_name, task_id))
            else:
                conn.execute("""
                    INSERT INTO agent_state_machine (agent_name, task_id, current_state, state_changed_at, state_reason)
                    VALUES (?, ?, ?, ?, ?)
                """, (agent_name, task_id, new_state, datetime.now(timezone.utc).isoformat(), reason))

            conn.commit()
            conn.close()
            return True
        except sqlite3.OperationalError:
            if attempt < 4:
                _time.sleep(0.5 * (attempt + 1))
            else:
                return False  # Skip on persistent lock


# ══════════════════════════════════════════════════════════════
# PHASE 3: TERMINAL EXECUTION ENGINE WITH POLICIES
# ══════════════════════════════════════════════════════════════

def get_execution_policy(agent_name: str) -> dict:
    """Get the execution policy for an agent."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM agent_execution_policy WHERE agent_name=?", (agent_name,)).fetchone()
    conn.close()

    if row:
        return dict(row)

    # Default restrictive policy
    return {
        "agent_name": agent_name,
        "working_directory": ".",
        "timeout_ms": 120000,
        "max_concurrent_commands": 3,
        "env_vars_allowed": "{}",
        "env_vars_blocked": '["API_KEY","SECRET","PASSWORD","TOKEN"]',
        "command_whitelist": None,
        "command_blacklist": '["rm -rf /","sudo rm","mkfs","dd if=","shutdown","reboot"]',
        "max_output_bytes": 1048576,
        "allow_network": 0,
        "allow_file_write": 1,
        "allow_file_delete": 0,
        "sandbox_mode": "restricted",
    }


def validate_command(command: str, policy: dict) -> tuple:
    """Validate a command against the agent's policy. Returns (is_valid, reason)."""
    blacklist = json.loads(policy.get("command_blacklist") or "[]")
    for blocked in blacklist:
        if blocked.lower() in command.lower():
            return False, f"Command matches blacklist pattern: '{blocked}'"

    whitelist_raw = policy.get("command_whitelist")
    if whitelist_raw:
        whitelist = json.loads(whitelist_raw)
        cmd_base = command.split()[0] if command.split() else ""
        if cmd_base not in whitelist:
            return False, f"Command '{cmd_base}' not in whitelist: {whitelist}"

    return True, "OK"


def execute_command(
    agent_name: str,
    command: str,
    task_id: str = None,
    skill_name: str = None,
    working_directory: str = None,
    env_vars: dict = None,
    timeout_ms: int = None,
    dependency_execution_id: str = None,
    dependency_agent: str = None,
) -> dict:
    """
    Execute a terminal command under the agent's security policy.
    Returns full execution record with observability data.
    """
    execution_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    policy = get_execution_policy(agent_name)

    # Apply policy defaults
    if not working_directory:
        working_directory = policy.get("working_directory", ".")
    if not timeout_ms:
        timeout_ms = policy.get("timeout_ms", 120000)

    # Validate command
    is_valid, reason = validate_command(command, policy)
    if not is_valid:
        result = {
            "execution_id": execution_id,
            "agent_name": agent_name,
            "command": command,
            "result_status": "failure",
            "exit_code": -1,
            "stdout": "",
            "stderr": reason,
            "failure_reason": f"POLICY_VIOLATION: {reason}",
            "duration_ms": 0,
            "artifacts_created": "[]",
        }
        _log_execution(result, task_id, skill_name, working_directory,
                       env_vars, started_at, dependency_execution_id, dependency_agent)
        return result

    # Filter environment variables
    safe_env = os.environ.copy()
    blocked_vars = json.loads(policy.get("env_vars_blocked") or "[]")
    for var in blocked_vars:
        for key in list(safe_env.keys()):
            if var.lower() in key.lower():
                del safe_env[key]

    if env_vars:
        allowed_raw = policy.get("env_vars_allowed") or "{}"
        allowed = json.loads(allowed_raw) if isinstance(allowed_raw, str) else allowed_raw
        for k, v in env_vars.items():
            if allowed == {} or k in allowed:
                safe_env[k] = str(v)

    # Execute
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=working_directory,
            env=safe_env,
            capture_output=True,
            text=True,
            timeout=timeout_ms / 1000,
        )

        completed_at = datetime.now(timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        max_bytes = policy.get("max_output_bytes", 1048576)
        stdout = proc.stdout[:max_bytes] if proc.stdout else ""
        stderr = proc.stderr[:max_bytes] if proc.stderr else ""

        status = "success" if proc.returncode == 0 else "failure"
        failure_reason = None
        if proc.returncode != 0:
            failure_reason = f"EXIT_CODE_{proc.returncode}: {stderr[:500]}"

        result = {
            "execution_id": execution_id,
            "agent_name": agent_name,
            "command": command,
            "result_status": status,
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "failure_reason": failure_reason,
            "duration_ms": duration_ms,
            "artifacts_created": "[]",
        }

    except subprocess.TimeoutExpired:
        completed_at = datetime.now(timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        result = {
            "execution_id": execution_id,
            "agent_name": agent_name,
            "command": command,
            "result_status": "timeout",
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Command timed out after {timeout_ms}ms",
            "failure_reason": f"TIMEOUT: exceeded {timeout_ms}ms",
            "duration_ms": duration_ms,
            "artifacts_created": "[]",
        }
    except Exception as e:
        completed_at = datetime.now(timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        result = {
            "execution_id": execution_id,
            "agent_name": agent_name,
            "command": command,
            "result_status": "failure",
            "exit_code": -1,
            "stdout": "",
            "stderr": str(e),
            "failure_reason": f"EXCEPTION: {type(e).__name__}: {e}",
            "duration_ms": duration_ms,
            "artifacts_created": "[]",
        }

    _log_execution(result, task_id, skill_name, working_directory,
                   env_vars, started_at, dependency_execution_id, dependency_agent)
    return result


def _log_execution(result, task_id, skill_name, working_directory,
                   env_vars, started_at, dep_exec_id, dep_agent):
    """Log execution to the observability table with retry."""
    import time as _time
    for attempt in range(5):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=60)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=30000")
            conn.execute("""
                INSERT INTO agent_execution_log (
                    execution_id, agent_name, task_id, skill_name, command,
                    working_directory, env_vars_used, started_at, completed_at,
                    duration_ms, exit_code, stdout, stderr, result_status,
                    artifacts_created, dependency_execution_id, dependency_agent, failure_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                result["execution_id"], result["agent_name"], task_id, skill_name,
                result["command"], working_directory, json.dumps(env_vars or {}),
                started_at.isoformat(), datetime.now(timezone.utc).isoformat(),
                result["duration_ms"], result["exit_code"],
                result["stdout"][:10000], result["stderr"][:10000],
                result["result_status"], result["artifacts_created"],
                dep_exec_id, dep_agent, result.get("failure_reason"),
            ))
            conn.commit()
            conn.close()
            return
        except sqlite3.OperationalError:
            if attempt < 4:
                _time.sleep(0.5 * (attempt + 1))
            else:
                pass  # Silently skip logging on persistent lock


# ══════════════════════════════════════════════════════════════
# PHASE 4: SKILL REGISTRATION FOR ALL AGENTS
# ══════════════════════════════════════════════════════════════

# Category → default skills mapping
CATEGORY_SKILLS = {
    "engineering": [
        ("code_review", "terminal", "Review code: git diff, grep patterns, lint checks"),
        ("run_tests", "terminal", "Execute test suites: pytest, jest, detox"),
        ("build_project", "terminal", "Build artifacts: npm build, docker build, expo build"),
        ("deploy", "terminal", "Deploy to target: git push, eas submit, docker push"),
    ],
    "ai-engineering": [
        ("ai_inference", "terminal", "Run AI model inference: curl API, python scripts"),
        ("model_eval", "terminal", "Evaluate model accuracy: python eval scripts"),
        ("prompt_test", "terminal", "Test prompt variations: API calls with different prompts"),
        ("data_pipeline", "terminal", "Run data ETL: python scripts, SQL queries"),
    ],
    "quality-eng": [
        ("run_unit_tests", "terminal", "Execute unit tests: pytest -x, jest --coverage"),
        ("run_e2e_tests", "terminal", "Execute E2E tests: detox, maestro, playwright"),
        ("lint_check", "terminal", "Run linters: eslint, flake8, mypy"),
        ("security_scan", "terminal", "Run security scans: bandit, npm audit, trivy"),
    ],
    "infrastructure": [
        ("health_check", "terminal", "Check service health: curl endpoints, docker ps"),
        ("log_analysis", "terminal", "Analyze logs: grep, awk, jq on log files"),
        ("resource_monitor", "terminal", "Monitor resources: docker stats, df, free"),
        ("backup_verify", "terminal", "Verify backups: ls, sha256sum, restore test"),
    ],
    "data-eng": [
        ("query_db", "terminal", "Execute SQL queries: psql, sqlite3"),
        ("run_migration", "terminal", "Run DB migrations: alembic upgrade, prisma migrate"),
        ("data_export", "terminal", "Export data: pg_dump, csv generation"),
        ("pipeline_run", "terminal", "Run data pipelines: airflow trigger, dbt run"),
    ],
    "product-eng": [
        ("feature_build", "terminal", "Build features: code generation, file creation"),
        ("ux_audit", "terminal", "Audit UX: screenshot comparison, accessibility check"),
        ("metrics_query", "terminal", "Query product metrics: SQL, analytics API"),
    ],
    "security": [
        ("vuln_scan", "terminal", "Scan for vulnerabilities: bandit, npm audit, trivy"),
        ("secret_scan", "terminal", "Scan for secrets: git-secrets, trufflehog"),
        ("permission_audit", "terminal", "Audit permissions: file perms, API keys"),
        ("pen_test", "terminal", "Penetration testing: curl, sqlmap (authorized)"),
    ],
    "leadership": [
        ("status_report", "analysis", "Generate status reports from team data"),
        ("delegate_task", "delegation", "Delegate tasks to team members"),
        ("review_work", "review", "Review completed work from specialists"),
        ("team_orchestrate", "orchestration", "Orchestrate multi-agent workflows"),
    ],
    "monitoring": [
        ("check_health", "terminal", "Health check: curl, ping, docker ps"),
        ("collect_metrics", "terminal", "Collect metrics: prometheus query, grafana API"),
        ("alert_check", "terminal", "Check alerts: grep logs, query alert endpoints"),
    ],
    "default": [
        ("execute_task", "terminal", "Execute assigned task via terminal command"),
        ("report_status", "analysis", "Report current status and results"),
        ("delegate_next", "delegation", "Pass results to next agent in chain"),
    ],
}

# Map team prefixes to skill categories
TEAM_TO_CATEGORY = {
    "AI Engineering": "ai-engineering",
    "AI Leadership": "leadership",
    "Engineering": "engineering",
    "Backend Engineering": "engineering",
    "Mobile Core": "engineering",
    "Quality Engineering": "quality-eng",
    "QA Testing": "quality-eng",
    "Infrastructure": "infrastructure",
    "Data Engineering": "data-eng",
    "Security": "security",
    "Product Engineering": "product-eng",
    "Architecture": "engineering",
    "Tech Leads": "leadership",
    "Platform Leadership": "leadership",
    "Eng Managers": "leadership",
    "Fitsia Core": "engineering",
    "Specialized": "engineering",
    # Maturana layers
    "Autopoietic:Consensual Domain": "default",
    "Consensual Domain": "default",
    "Cognitive Domain": "ai-engineering",
    "Structural Coupling": "monitoring",
    "Languaging": "ai-engineering",
    "Autopoiesis Core": "monitoring",
    "Organizational Closure": "infrastructure",
    "Love (Legitimate Coexistence)": "default",
}


def get_skill_category(team: str) -> str:
    """Map a team name to a skill category."""
    if team in TEAM_TO_CATEGORY:
        return TEAM_TO_CATEGORY[team]
    for prefix, cat in TEAM_TO_CATEGORY.items():
        if prefix.lower() in team.lower():
            return cat
    return "default"


def register_agent_skills(agent_name: str, team: str, batch_conn=None) -> int:
    """Register default skills for an agent based on its team. Returns count of skills added."""
    category = get_skill_category(team)
    skills = CATEGORY_SKILLS.get(category, CATEGORY_SKILLS["default"])

    conn = batch_conn or sqlite3.connect(DB_PATH, timeout=30)
    count = 0

    for skill_name, skill_type, skill_def in skills:
        try:
            conn.execute("""
                INSERT OR IGNORE INTO agent_skills (agent_name, skill_name, skill_type, skill_definition)
                VALUES (?, ?, ?, ?)
            """, (agent_name, skill_name, skill_type, skill_def))
            count += 1
        except sqlite3.IntegrityError:
            pass

    if not batch_conn:
        conn.commit()
        conn.close()

    return count


def register_agent_policy(agent_name: str, team: str, batch_conn=None):
    """Register default execution policy for an agent."""
    category = get_skill_category(team)

    # Set policy based on category
    if category == "security":
        sandbox = "restricted"
        allow_net = 1
        allow_delete = 0
    elif category == "infrastructure":
        sandbox = "restricted"
        allow_net = 1
        allow_delete = 0
    elif category == "leadership":
        sandbox = "readonly"
        allow_net = 0
        allow_delete = 0
    else:
        sandbox = "restricted"
        allow_net = 0
        allow_delete = 0

    conn = batch_conn or sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("""
            INSERT OR IGNORE INTO agent_execution_policy (
                agent_name, working_directory, sandbox_mode,
                allow_network, allow_file_delete
            ) VALUES (?, ?, ?, ?, ?)
        """, (agent_name, str(Path(__file__).parent.parent), sandbox, allow_net, allow_delete))
    except sqlite3.IntegrityError:
        pass

    if not batch_conn:
        conn.commit()
        conn.close()


def register_agent_state(agent_name: str, task_id: str = "init", batch_conn=None):
    """Initialize agent state machine entry."""
    conn = batch_conn or sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("""
            INSERT OR IGNORE INTO agent_state_machine (agent_name, task_id, current_state, state_reason)
            VALUES (?, ?, 'pending', 'Initial registration')
        """, (agent_name, task_id))
    except sqlite3.IntegrityError:
        pass

    if not batch_conn:
        conn.commit()
        conn.close()


# ══════════════════════════════════════════════════════════════
# PHASE 5: BATCH POPULATION — Register all 5,000 agents
# ══════════════════════════════════════════════════════════════

def populate_all_agents(batch_size: int = 500) -> dict:
    """Register skills, policies, and states for ALL agents in the registry."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.row_factory = sqlite3.Row

    agents = conn.execute("SELECT name, team FROM agent_registry").fetchall()
    total = len(agents)

    stats = {"total": total, "skills_added": 0, "policies_added": 0, "states_added": 0, "errors": 0}

    for i in range(0, total, batch_size):
        batch = agents[i:i + batch_size]
        batch_num = (i // batch_size) + 1

        for agent in batch:
            try:
                skills_count = register_agent_skills(agent["name"], agent["team"], batch_conn=conn)
                register_agent_policy(agent["name"], agent["team"], batch_conn=conn)
                register_agent_state(agent["name"], "init", batch_conn=conn)
                stats["skills_added"] += skills_count
                stats["policies_added"] += 1
                stats["states_added"] += 1
            except Exception as e:
                stats["errors"] += 1

        conn.commit()
        print(f"  [BATCH {batch_num}] Processed {min(i + batch_size, total)}/{total} agents")

    conn.close()
    return stats


# ══════════════════════════════════════════════════════════════
# PHASE 6: TEAM CREATION — Skill Builder Squad (100 agents)
# ══════════════════════════════════════════════════════════════

def create_skill_builder_team(team_size: int = 100) -> dict:
    """Create the skill-builder-squad team of builder agents."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    now = datetime.now(timezone.utc).isoformat()

    team_name = "skill-builder-squad"
    created = 0

    # Create team lead
    lead_name = "skill-builder-lead"
    conn.execute("""
        INSERT OR REPLACE INTO agent_registry (name, display_name, team, category, description, color, status, last_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (lead_name, "Skill Builder Lead", team_name, "builder",
          "Leads the skill-builder-squad. Coordinates batch skill registration for all 5,000 agents.",
          "#FF6600", "idle", now))

    conn.execute("""
        INSERT OR REPLACE INTO agent_team_config (team_name, team_description, agent_name, role_in_team, delegation_order, is_entry_point)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (team_name, "100 agents that build and register skills for all 5,000 agents",
          lead_name, "lead", 0, 1))
    created += 1

    # Create 99 worker agents
    for i in range(1, team_size):
        worker_name = f"skill-builder-{i:03d}"
        batch_start = (i - 1) * 50
        batch_end = i * 50

        conn.execute("""
            INSERT OR REPLACE INTO agent_registry (name, display_name, team, category, description, color, status, last_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (worker_name, f"Skill Builder #{i:03d}", team_name, "builder",
              f"Builder agent processing agents {batch_start}-{batch_end}. Registers skills, policies, and state machines.",
              "#FF8800", "idle", now))

        # Chain delegation: each worker delegates to the next
        next_worker = f"skill-builder-{(i+1):03d}" if i < team_size - 1 else lead_name
        conn.execute("""
            INSERT OR REPLACE INTO agent_team_config (
                team_name, agent_name, role_in_team, delegation_order,
                delegates_to, receives_from, is_exit_point
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (team_name, worker_name, "member" if i < team_size - 1 else "specialist",
              i, next_worker, f"skill-builder-{(i-1):03d}" if i > 1 else lead_name,
              1 if i == team_size - 1 else 0))
        created += 1

    conn.commit()
    conn.close()

    return {"team_name": team_name, "agents_created": created}


# ══════════════════════════════════════════════════════════════
# SKILL TEMPLATES — Reusable blueprints
# ══════════════════════════════════════════════════════════════

SKILL_TEMPLATES = [
    ("terminal_executor", "terminal", "core", "Execute a terminal command with full policy enforcement and observability",
     json.dumps({
         "steps": [
             "1. Validate command against agent policy",
             "2. Set working directory and env vars",
             "3. Execute with timeout",
             "4. Capture stdout, stderr, exit_code",
             "5. Log to agent_execution_log",
             "6. Update agent state machine",
             "7. Report artifacts created",
         ],
         "requires": ["command", "working_directory"],
         "produces": ["execution_id", "exit_code", "stdout", "stderr", "duration_ms"],
     })),
    ("task_delegator", "delegation", "core", "Delegate a task to the next agent in the chain",
     json.dumps({
         "steps": [
             "1. Receive task input",
             "2. Determine next agent from team_config",
             "3. Create delegation_chain entry",
             "4. Transition own state to completed",
             "5. Transition next agent to pending",
             "6. Pass output_data as next agent's input_data",
         ],
         "requires": ["task_id", "output_data"],
         "produces": ["chain_id", "next_agent", "delegation_type"],
     })),
    ("team_creator", "orchestration", "core", "Create an agent team for a new task",
     json.dumps({
         "steps": [
             "1. Analyze task requirements",
             "2. Select agents by capability match",
             "3. Define delegation order",
             "4. Register team in agent_team_config",
             "5. Initialize all agent states to pending",
             "6. Set entry_point and exit_point",
             "7. Return team_name and agent list",
         ],
         "requires": ["task_description", "required_capabilities"],
         "produces": ["team_name", "agent_list", "delegation_chain"],
     })),
    ("status_reporter", "analysis", "core", "Report execution status and metrics",
     json.dumps({
         "steps": [
             "1. Query agent_execution_log for recent entries",
             "2. Query agent_state_machine for current states",
             "3. Calculate success/failure rates",
             "4. Identify bottlenecks and blocked agents",
             "5. Generate summary report",
         ],
         "requires": ["task_id_or_team_name"],
         "produces": ["summary", "success_rate", "avg_duration", "blockers"],
     })),
    ("rollback_handler", "terminal", "core", "Handle failure rollback for an agent",
     json.dumps({
         "steps": [
             "1. Detect failure from agent_state_machine",
             "2. Query execution_log for failure_reason",
             "3. Execute rollback command if defined",
             "4. Transition state to rolled_back",
             "5. Notify upstream agent",
             "6. Log rollback in execution_log",
         ],
         "requires": ["agent_name", "task_id", "failure_reason"],
         "produces": ["rollback_status", "rollback_execution_id"],
     })),
]


def seed_skill_templates():
    """Insert all skill templates into the DB."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    for tpl in SKILL_TEMPLATES:
        try:
            conn.execute("""
                INSERT OR IGNORE INTO skill_templates (template_name, template_type, category, description, skill_definition)
                VALUES (?, ?, ?, ?, ?)
            """, tpl)
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    conn.close()
    print(f"[SKILL ENGINE] Seeded {len(SKILL_TEMPLATES)} skill templates")


# ══════════════════════════════════════════════════════════════
# MAIN — Run everything
# ══════════════════════════════════════════════════════════════

def run_full_setup():
    """Run the complete skill engine setup."""
    print("=" * 60)
    print("FITSI IA — SKILL ENGINE FULL SETUP")
    print("=" * 60)

    # Step 1: Migrate DB
    print("\n[1/5] Migrating database schema...")
    migrate_skill_engine()

    # Step 2: Seed templates
    print("\n[2/5] Seeding skill templates...")
    seed_skill_templates()

    # Step 3: Create builder team
    print("\n[3/5] Creating skill-builder-squad (100 agents)...")
    team_result = create_skill_builder_team(100)
    print(f"  Team: {team_result['team_name']} — {team_result['agents_created']} agents")

    # Step 4: Populate all 5,000 agents
    print("\n[4/5] Registering skills, policies & states for ALL 5,000 agents...")
    pop_result = populate_all_agents(batch_size=500)
    print(f"  Skills added: {pop_result['skills_added']}")
    print(f"  Policies added: {pop_result['policies_added']}")
    print(f"  States initialized: {pop_result['states_added']}")
    print(f"  Errors: {pop_result['errors']}")

    # Step 5: Verify
    print("\n[5/5] Verifying...")
    conn = sqlite3.connect(DB_PATH)
    counts = {}
    for table in ["agent_skills", "agent_execution_policy", "agent_state_machine",
                   "agent_team_config", "skill_templates", "task_delegation_chain"]:
        row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
        counts[table] = row[0]
    conn.close()

    print("\n  TABLE COUNTS:")
    for table, count in counts.items():
        print(f"    {table}: {count:,}")

    print("\n" + "=" * 60)
    print("SKILL ENGINE SETUP COMPLETE")
    print("=" * 60)

    return {**pop_result, **team_result, "table_counts": counts}


if __name__ == "__main__":
    run_full_setup()

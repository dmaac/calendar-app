#!/usr/bin/env python3
"""
Fitsi IA — Claude Code Hook
Automatically activates the corporate delegation chain on every session.

Hook events:
  - PreToolUse  (any tool)    → Creates session task + activates full hierarchy chain
  - PreToolUse  (Agent)       → Spawns specific agent with delegation link
  - PostToolUse (Agent)       → Marks agent completed
  - Stop                      → Completes session task, idles all agents
  - SubagentStop              → Marks subagent completed

Delegation chain: Orchestrator → C-Suite → VP → Coordinator → Specialist
"""

import sys
import json
import os
import fcntl
import urllib.request
import urllib.error

DASHBOARD_URL = os.getenv("FITSI_DASHBOARD_URL", "http://localhost:8001")
HOOK_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(HOOK_DIR, "hook_debug.log")
STATE_FILE = os.path.join(HOOK_DIR, ".hook_state.json")

# ── Routing Rules — Fitsi Corporate Hierarchy ──────────────────────────
# Each route: Orchestrator → Executive → VP → Coordinator → Specialists
# + security daemon always in background
ROUTING_RULES = {
    "engineering": {
        "keywords": ["build", "code", "fix", "bug", "feature", "screen", "component", "endpoint", "api", "database", "migration", "implement"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "chief-technology-officer", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-engineering", "role": "vp", "delegated_by": "chief-technology-officer"},
            {"name": "fitsia-backend-coordinator", "role": "coordinator", "delegated_by": "vp-of-engineering"},
            {"name": "fitsia-frontend-coordinator", "role": "coordinator", "delegated_by": "vp-of-engineering"},
        ],
    },
    "mobile": {
        "keywords": ["mobile", "app", "expo", "react-native", "ios", "android", "navigation", "screen", "onboarding"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "chief-technology-officer", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-mobile-engineering", "role": "vp", "delegated_by": "chief-technology-officer"},
            {"name": "fitsia-frontend-coordinator", "role": "coordinator", "delegated_by": "vp-of-mobile-engineering"},
        ],
    },
    "backend": {
        "keywords": ["fastapi", "python", "backend", "endpoint", "router", "model", "alembic", "celery", "redis"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "chief-technology-officer", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-engineering", "role": "vp", "delegated_by": "chief-technology-officer"},
            {"name": "fitsia-backend-coordinator", "role": "coordinator", "delegated_by": "vp-of-engineering"},
        ],
    },
    "ai_ml": {
        "keywords": ["ai", "ml", "vision", "scan", "recognition", "model", "prediction", "recommendation", "prompt", "gpt", "claude"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "cdao-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-ai-systems", "role": "vp", "delegated_by": "cdao-fitsi"},
            {"name": "fitsia-ai-coordinator", "role": "coordinator", "delegated_by": "vp-of-ai-systems"},
        ],
    },
    "product": {
        "keywords": ["product", "ux", "onboarding", "flow", "design", "user-experience", "roadmap", "feature"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "cpo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-product", "role": "vp", "delegated_by": "cpo-fitsi"},
            {"name": "fitsia-content-coordinator", "role": "coordinator", "delegated_by": "vp-of-product"},
        ],
    },
    "growth": {
        "keywords": ["growth", "retention", "acquisition", "funnel", "conversion", "churn", "viral", "referral", "aso", "ads"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "cgo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "head-of-growth-engineering", "role": "vp", "delegated_by": "cgo-fitsi"},
            {"name": "fitsia-marketing-coordinator", "role": "coordinator", "delegated_by": "head-of-growth-engineering"},
        ],
    },
    "marketing": {
        "keywords": ["marketing", "campaign", "social", "content", "seo", "influencer", "brand", "tiktok", "instagram"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "cgo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "head-of-marketing", "role": "vp", "delegated_by": "cgo-fitsi"},
            {"name": "fitsia-marketing-coordinator", "role": "coordinator", "delegated_by": "head-of-marketing"},
        ],
    },
    "security": {
        "keywords": ["security", "vulnerability", "audit", "compliance", "privacy", "gdpr", "hipaa", "pentest", "owasp"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "ciso-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "head-of-compliance", "role": "vp", "delegated_by": "ciso-fitsi"},
        ],
    },
    "finance": {
        "keywords": ["cost", "revenue", "pricing", "subscription", "payment", "budget", "roi", "mrr", "ltv"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "cfo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "head-of-revenue", "role": "vp", "delegated_by": "cfo-fitsi"},
        ],
    },
    "operations": {
        "keywords": ["deploy", "ci/cd", "infrastructure", "monitoring", "devops", "docker", "scaling", "kubernetes"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "coo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-platform", "role": "vp", "delegated_by": "coo-fitsi"},
            {"name": "fitsia-devops-coordinator", "role": "coordinator", "delegated_by": "vp-of-platform"},
        ],
    },
    "qa": {
        "keywords": ["test", "qa", "quality", "coverage", "e2e", "unit test", "jest", "pytest", "detox"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "chief-technology-officer", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-engineering", "role": "vp", "delegated_by": "chief-technology-officer"},
            {"name": "fitsia-qa-coordinator", "role": "coordinator", "delegated_by": "vp-of-engineering"},
        ],
    },
    "science": {
        "keywords": ["nutrition", "calorie", "macro", "bmr", "tdee", "diet", "protein", "fitness", "exercise", "workout"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "cdao-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-ai-systems", "role": "vp", "delegated_by": "cdao-fitsi"},
            {"name": "fitsia-science-coordinator", "role": "coordinator", "delegated_by": "vp-of-ai-systems"},
        ],
    },
    "strategy": {
        "keywords": ["strategy", "vision", "pivot", "market", "competitor", "expansion", "roadmap"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "ceo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
        ],
    },
    "crisis": {
        "keywords": ["crash", "down", "outage", "critical", "emergency", "data-loss", "breach", "incident"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "ceo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "coo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "ciso-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
        ],
    },
    "dashboard": {
        "keywords": ["dashboard", "agent", "hook", "monitor", "graph", "d3", "websocket", "pyramid", "toon"],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "chief-technology-officer", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "vp-of-engineering", "role": "vp", "delegated_by": "chief-technology-officer"},
        ],
    },
    "general": {
        "keywords": [],
        "chain": [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": "ceo-fitsi", "role": "executive", "delegated_by": "fitsia-orchestrator"},
            {"name": "chief-technology-officer", "role": "executive", "delegated_by": "ceo-fitsi"},
            {"name": "vp-of-engineering", "role": "vp", "delegated_by": "chief-technology-officer"},
        ],
    },
}

# Agent type → coordinator mapping (when a specific agent is spawned, link it to its coordinator)
AGENT_COORDINATOR_MAP = {
    # Backend specialists → backend coordinator
    "python-backend-engineer": "fitsia-backend-coordinator",
    "backend-python-engineer": "fitsia-backend-coordinator",
    "backend-typescript-architect": "fitsia-backend-coordinator",
    "data-migration-agent": "fitsia-backend-coordinator",
    "sqlmodel-engineer": "fitsia-backend-coordinator",
    "database-engineer-postgresql": "fitsia-backend-coordinator",
    "backend-auth-engineer": "fitsia-backend-coordinator",
    "backend-testing-engineer": "fitsia-backend-coordinator",
    "api-contract-guardian": "fitsia-backend-coordinator",
    "api-design-engineer": "fitsia-backend-coordinator",
    "redis-engineer": "fitsia-backend-coordinator",
    # Frontend specialists → frontend coordinator
    "ui-engineer": "fitsia-frontend-coordinator",
    "react-native-engineer": "fitsia-frontend-coordinator",
    "mobile-architect": "fitsia-frontend-coordinator",
    "mobile-navigation-engineer": "fitsia-frontend-coordinator",
    "mobile-animation-engineer": "fitsia-frontend-coordinator",
    "mobile-performance-engineer": "fitsia-frontend-coordinator",
    "onboarding-builder": "fitsia-frontend-coordinator",
    "payment-specialist": "fitsia-frontend-coordinator",
    "ux-polish-agent": "fitsia-frontend-coordinator",
    # AI specialists → AI coordinator
    "ai-vision-expert": "fitsia-ai-coordinator",
    "ai-food-recognition-engineer": "fitsia-ai-coordinator",
    "food-database-specialist": "fitsia-ai-coordinator",
    "ai-personalization-engineer": "fitsia-ai-coordinator",
    "ai-cost-optimization-engineer": "fitsia-ai-coordinator",
    "fitness-ai-vision-expert": "fitsia-ai-coordinator",
    # QA specialists → QA coordinator
    "qa-engineer": "fitsia-qa-coordinator",
    "senior-code-reviewer": "fitsia-qa-coordinator",
    "fullstack-inspector": "fitsia-qa-coordinator",
    "unit-testing-engineer": "fitsia-qa-coordinator",
    "e2e-testing-engineer": "fitsia-qa-coordinator",
    "load-testing-engineer": "fitsia-qa-coordinator",
    # DevOps specialists → DevOps coordinator
    "devops-deployer": "fitsia-devops-coordinator",
    "devops-engineer": "fitsia-devops-coordinator",
    "docker-engineer": "fitsia-devops-coordinator",
    "terraform-engineer": "fitsia-devops-coordinator",
    "sre-engineer": "fitsia-devops-coordinator",
    # Security specialists → CISO
    "security-engineer": "ciso-fitsi",
    "penetration-tester": "ciso-fitsi",
    "api-security-engineer": "ciso-fitsi",
    # Architecture → CTO
    "software-architect": "chief-technology-officer",
    "scalability-architect": "chief-technology-officer",
    "tech-lead": "chief-technology-officer",
    # Science → science coordinator
    "nutrition-science-advisor": "fitsia-science-coordinator",
    "health-data-scientist": "fitsia-science-coordinator",
    "fitness-science-advisor": "fitsia-science-coordinator",
    # Growth/Marketing → marketing coordinator
    "growth-strategist": "fitsia-marketing-coordinator",
    "aso-specialist": "fitsia-marketing-coordinator",
    "meta-ads-specialist": "fitsia-marketing-coordinator",
    # Product → content coordinator
    "product-manager": "fitsia-content-coordinator",
    "ux-researcher": "fitsia-content-coordinator",
}


def log(msg):
    try:
        with open(LOG_FILE, "a") as f:
            from datetime import datetime
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass


def http_post(path, payload):
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{DASHBOARD_URL}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=2)
        return resp.status == 200
    except Exception as e:
        log(f"POST {path} FAIL: {e}")
        return False


def read_stdin():
    if not sys.stdin.isatty():
        try:
            raw = sys.stdin.read()
            return json.loads(raw) if raw.strip() else {}
        except Exception:
            return {}
    return {}


def load_state():
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, "r") as f:
                fcntl.flock(f, fcntl.LOCK_SH)
                raw = f.read()
                fcntl.flock(f, fcntl.LOCK_UN)
                return json.loads(raw) if raw.strip() else {}
    except Exception:
        pass
    return {}


def save_state(state):
    try:
        with open(STATE_FILE, "a+") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            f.seek(0)
            f.truncate()
            json.dump(state, f)
            fcntl.flock(f, fcntl.LOCK_UN)
    except Exception as e:
        log(f"State save error: {e}")


def route_task(prompt):
    """Classify the task and return the full delegation chain."""
    prompt_lower = prompt.lower()
    scores = {}
    for name, rule in ROUTING_RULES.items():
        if name == "general":
            continue
        score = sum(1 for kw in rule["keywords"] if kw in prompt_lower)
        if score > 0:
            scores[name] = score
    best = max(scores, key=scores.get) if scores else "general"
    rule = ROUTING_RULES[best]
    agents = list(rule["chain"])

    # Always append security daemon in background
    seen = {a["name"] for a in agents}
    if "fitsia-security-daemon" not in seen:
        agents.append({"name": "fitsia-security-daemon", "role": "security", "delegated_by": "fitsia-orchestrator"})

    return {"route": best, "agents": agents}


def build_agent_chain(agent_name, description):
    """Build delegation chain for a specific spawned agent, linking it through the hierarchy."""
    coordinator = AGENT_COORDINATOR_MAP.get(agent_name)
    if not coordinator:
        # Unknown agent → attach directly to orchestrator
        return [
            {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
            {"name": agent_name, "role": "executor", "delegated_by": "fitsia-orchestrator"},
        ]

    # Find which route contains this coordinator to get the full chain
    for route_name, rule in ROUTING_RULES.items():
        chain_names = [a["name"] for a in rule["chain"]]
        if coordinator in chain_names:
            # Use the route's chain up to the coordinator, then add the specialist
            agents = list(rule["chain"])
            # Add the specialist agent under its coordinator
            agents.append({"name": agent_name, "role": "executor", "delegated_by": coordinator})
            # Add security daemon
            seen = {a["name"] for a in agents}
            if "fitsia-security-daemon" not in seen:
                agents.append({"name": "fitsia-security-daemon", "role": "security", "delegated_by": "fitsia-orchestrator"})
            return agents

    # Fallback: orchestrator → coordinator → agent
    return [
        {"name": "fitsia-orchestrator", "role": "orchestrator", "delegated_by": None},
        {"name": coordinator, "role": "coordinator", "delegated_by": "fitsia-orchestrator"},
        {"name": agent_name, "role": "executor", "delegated_by": coordinator},
        {"name": "fitsia-security-daemon", "role": "security", "delegated_by": "fitsia-orchestrator"},
    ]


def ensure_session_task(ctx):
    """Create a session-level task with full delegation chain if not already exists."""
    session_id = ctx.get("session_id", "unknown")
    state = load_state()

    session_key = f"session:{session_id}"
    if session_key in state:
        return state[session_key]

    tool_name = ctx.get("tool_name", "")
    tool_input = ctx.get("tool_input", {})

    # Infer task description
    if tool_name == "Agent":
        desc = tool_input.get("description", "Agent task")
        prompt_text = tool_input.get("prompt", "")[:300]
    elif tool_name in ("Read", "Grep", "Glob"):
        target = tool_input.get("file_path", tool_input.get("pattern", tool_input.get("path", "")))
        desc = f"Working on: {os.path.basename(str(target))}" if target else "Code analysis"
        prompt_text = str(target)
    elif tool_name == "Edit":
        target = tool_input.get("file_path", "")
        desc = f"Editing: {os.path.basename(str(target))}" if target else "Code editing"
        prompt_text = str(target)
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")[:100]
        desc = f"Running: {cmd[:60]}"
        prompt_text = cmd
    elif tool_name == "Write":
        target = tool_input.get("file_path", "")
        desc = f"Creating: {os.path.basename(str(target))}" if target else "Creating file"
        prompt_text = str(target)
    else:
        desc = f"Fitsi session ({tool_name})"
        prompt_text = tool_name

    # Route and create full delegation chain
    routing = route_task(f"{desc} {prompt_text}")
    task_id = f"fitsi-{session_id[:8]}"

    http_post("/api/task", {
        "task_id": task_id,
        "task_name": desc,
        "agents": routing["agents"],
        "priority": "medium",
    })

    # Activate orchestrator
    http_post("/api/event", {
        "agent_name": "fitsia-orchestrator",
        "event_type": "delegating",
        "detail": f"[{routing['route']}] {desc}",
    })

    state[session_key] = task_id
    state["active_agents"] = [a["name"] for a in routing["agents"]]
    save_state(state)
    log(f"Session task: {task_id} route={routing['route']} chain={[a['name'] for a in routing['agents']]}")
    return task_id


def handle_pre_tool(ctx):
    """PreToolUse — ensure session task exists + spawn agents with delegation."""
    tool_name = ctx.get("tool_name", "")

    # 1. Ensure session task with full chain
    task_id = ensure_session_task(ctx)

    # 2. If Agent tool, spawn with delegation chain
    if tool_name == "Agent":
        tool_input = ctx.get("tool_input", {})
        agent_name = tool_input.get("subagent_type", "general-purpose")
        description = tool_input.get("description", "")
        prompt = tool_input.get("prompt", "")[:150]

        # Build full chain for this specific agent
        chain = build_agent_chain(agent_name, f"{description} {prompt}")

        # Register agent delegation in the existing task
        for agent in chain:
            # Skip agents already in the session task
            http_post("/api/event", {
                "agent_name": agent["name"],
                "event_type": "active" if agent["role"] == "executor" else "delegating",
                "detail": f"→ {agent_name}: {description}" if agent["name"] != agent_name else f"{description}: {prompt}",
            })

        # Spawn event for the specialist
        http_post("/api/event", {
            "agent_name": agent_name,
            "event_type": "spawned",
            "detail": f"{description}: {prompt}" if description else prompt,
        })

        # Track active agent
        session_id = ctx.get("session_id", "unknown")
        state = load_state()
        spawned = state.get("spawned_agents", [])
        if agent_name not in spawned:
            spawned.append(agent_name)
        state["spawned_agents"] = spawned
        save_state(state)


def handle_post_tool(ctx):
    """PostToolUse (Agent) — mark agent as completed."""
    tool_name = ctx.get("tool_name", "")
    if tool_name == "Agent":
        tool_input = ctx.get("tool_input", {})
        agent_name = tool_input.get("subagent_type", "general-purpose")
        http_post("/api/event", {
            "agent_name": agent_name,
            "event_type": "completed",
            "detail": "Agent finished",
        })


def handle_stop(ctx):
    """Stop — session ended. Complete task, idle all agents."""
    session_id = ctx.get("session_id", "unknown")
    state = load_state()
    session_key = f"session:{session_id}"
    task_id = state.pop(session_key, None)

    # Idle all agents that were active in this session
    for agent_name in state.pop("active_agents", []):
        http_post("/api/event", {
            "agent_name": agent_name,
            "event_type": "completed",
            "detail": "Session ended",
        })
    for agent_name in state.pop("spawned_agents", []):
        http_post("/api/event", {
            "agent_name": agent_name,
            "event_type": "completed",
            "detail": "Session ended",
        })

    save_state(state)

    if task_id:
        http_post(f"/api/task/{task_id}/complete", {})
        http_post("/api/event", {
            "agent_name": "fitsia-orchestrator",
            "event_type": "completed",
            "detail": "Session finished",
        })
        log(f"Session completed: {task_id}")


def handle_subagent_stop(ctx):
    """SubagentStop — mark subagent completed."""
    agent_type = ctx.get("agent_type", ctx.get("subagent_type", "unknown"))
    http_post("/api/event", {
        "agent_name": agent_type,
        "event_type": "completed",
        "detail": "Subagent stopped",
    })

    # Remove from spawned list
    state = load_state()
    spawned = state.get("spawned_agents", [])
    if agent_type in spawned:
        spawned.remove(agent_type)
        state["spawned_agents"] = spawned
        save_state(state)


def main():
    hook_type = sys.argv[1] if len(sys.argv) > 1 else ""
    ctx = read_stdin()
    tool_name = ctx.get("tool_name", "")
    hook_event = ctx.get("hook_event_name", "")

    log(f"Hook: type={hook_type}, event={hook_event}, tool={tool_name}")

    if hook_type == "pre_tool":
        handle_pre_tool(ctx)
    elif hook_type == "post_tool":
        handle_post_tool(ctx)
    elif hook_type == "stop":
        handle_stop(ctx)
    elif hook_type == "subagent_stop":
        handle_subagent_stop(ctx)
    else:
        log(f"Unknown hook_type: {hook_type}")


if __name__ == "__main__":
    main()

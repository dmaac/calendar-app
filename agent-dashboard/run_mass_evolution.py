#!/usr/bin/env python3
"""
Mass Evolution Script — Activate 5,000 agents + evolve to 6,000
Uses Maturana genesis + evolution cycles + mass state simulation
"""
import sqlite3
import random
import time
import json
import asyncio
import httpx
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "agents.db"
BASE = "http://127.0.0.1:8001"

STATES = ["active", "thinking", "delegating", "reviewing", "waiting", "spawning", "error"]
STATE_WEIGHTS = [30, 20, 10, 8, 5, 5, 2]  # % distribution for non-idle

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def phase1_mass_activate():
    """Set varied statuses for ALL agents — visible in ASCII immediately."""
    print("\n" + "=" * 60)
    print("PHASE 1: Mass Activation — Setting varied states for ALL agents")
    print("=" * 60)

    conn = get_db()
    agents = conn.execute("SELECT name FROM agent_registry").fetchall()
    total = len(agents)
    print(f"  Found {total} agents in registry")

    now = datetime.now(timezone.utc).isoformat()
    active_count = 0
    state_counts = {}

    for a in agents:
        # 60% get activated, 40% stay idle
        if random.random() < 0.60:
            state = random.choices(STATES, weights=STATE_WEIGHTS, k=1)[0]
            conn.execute(
                "UPDATE agent_registry SET status = ?, last_active = ? WHERE name = ?",
                (state, now, a["name"])
            )
            state_counts[state] = state_counts.get(state, 0) + 1
            active_count += 1
        else:
            conn.execute(
                "UPDATE agent_registry SET status = 'idle' WHERE name = ?",
                (a["name"],)
            )

    conn.commit()
    conn.close()

    print(f"  Activated {active_count}/{total} agents:")
    for state, count in sorted(state_counts.items(), key=lambda x: -x[1]):
        print(f"    {state:15} = {count}")
    print(f"    {'idle':15} = {total - active_count}")
    return active_count


def phase2_genesis_to_6000():
    """Use Maturana genesis to create new agents up to 6,000."""
    print("\n" + "=" * 60)
    print("PHASE 2: Maturana Genesis — Growing population to 6,000")
    print("=" * 60)

    conn = get_db()
    current = conn.execute("SELECT COUNT(*) as c FROM agent_registry").fetchone()["c"]
    conn.close()
    print(f"  Current population: {current}")

    if current >= 6000:
        print(f"  Already at {current} >= 6000, skipping genesis")
        return current

    target = 6000
    needed = target - current
    print(f"  Need to create {needed} new agents")

    # Try the Maturana genesis API first
    try:
        r = httpx.post(f"{BASE}/api/maturana/genesis", params={"target": target}, timeout=120)
        if r.status_code == 200:
            data = r.json()
            print(f"  Genesis complete: {json.dumps(data, indent=2)[:500]}")
            conn = get_db()
            new_count = conn.execute("SELECT COUNT(*) as c FROM agent_registry").fetchone()["c"]
            conn.close()
            print(f"  New population: {new_count}")
            return new_count
    except Exception as e:
        print(f"  Genesis API failed: {e}")
        print("  Falling back to direct DB creation...")

    # Fallback: create agents directly
    conn = get_db()
    domains = [
        "quantum-computing", "edge-ai", "bio-informatics", "neuro-symbolic",
        "swarm-intelligence", "knowledge-graphs", "causal-inference",
        "federated-learning", "synthetic-data", "embodied-ai",
        "multi-modal-fusion", "continual-learning", "meta-learning",
        "program-synthesis", "automated-reasoning", "cognitive-architecture",
        "digital-twins", "autonomous-systems", "human-ai-collaboration",
        "explainable-ai",
    ]
    roles = [
        "engineer", "architect", "specialist", "analyst", "optimizer",
        "researcher", "designer", "strategist", "auditor", "guardian",
    ]
    teams = [
        "AI Engineering", "Backend Engineering", "Mobile Core",
        "Infrastructure", "Security", "Data Engineering",
        "Quality Engineering", "Architecture", "Platform Leadership",
        "Fitsia Core", "Growth Leadership", "Product Engineering",
    ]
    colors = [
        "#6366f1", "#22c55e", "#f97316", "#8b5cf6", "#06b6d4",
        "#ec4899", "#eab308", "#14b8a6", "#f43f5e", "#a855f7",
        "#0ea5e9", "#d946ef", "#aa00ff", "#ff6600", "#00cc88",
    ]

    now = datetime.now(timezone.utc).isoformat()
    created = 0

    for i in range(needed):
        domain = random.choice(domains)
        role = random.choice(roles)
        name = f"{domain}-{role}-{i:04d}"
        display = name.replace("-", " ").title()
        team = random.choice(teams)
        category = random.choice(["ai-engineering", "backend-eng", "infrastructure",
                                   "security", "data-eng", "quality-eng", "mobile-core",
                                   "architecture", "product-eng", "specialized"])
        color = random.choice(colors)

        try:
            conn.execute(
                """INSERT OR IGNORE INTO agent_registry
                   (name, display_name, team, category, description, color, status, last_active, total_invocations, total_tokens)
                   VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, 0, 0)""",
                (name, display, team, category, f"{display} — {category}", color, now)
            )
            # Create DNA entry
            conn.execute(
                """INSERT OR IGNORE INTO agent_dna
                   (agent_name, generation, fitness_score, specialization_depth,
                    adaptability_score, speed_score, accuracy_score,
                    collaboration_score, creativity_score, reliability_score,
                    mutation_rate)
                   VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (name, random.uniform(0.3, 0.8),
                 random.uniform(0.3, 0.9), random.uniform(0.3, 0.9),
                 random.uniform(0.3, 0.9), random.uniform(0.3, 0.9),
                 random.uniform(0.3, 0.9), random.uniform(0.3, 0.9),
                 random.uniform(0.3, 0.9), random.uniform(0.05, 0.2))
            )
            created += 1
        except Exception:
            pass

        if created % 200 == 0 and created > 0:
            conn.commit()
            print(f"    Created {created}/{needed}...")

    conn.commit()
    final = conn.execute("SELECT COUNT(*) as c FROM agent_registry").fetchone()["c"]
    conn.close()
    print(f"  Created {created} new agents. Total population: {final}")
    return final


def phase3_initialize_maturana():
    """Initialize Maturana autopoiesis fields for all agents."""
    print("\n" + "=" * 60)
    print("PHASE 3: Maturana Initialization")
    print("=" * 60)

    try:
        r = httpx.post(f"{BASE}/api/maturana/initialize", timeout=120)
        if r.status_code == 200:
            data = r.json()
            print(f"  Initialized: {json.dumps(data)[:300]}")
            return True
    except Exception as e:
        print(f"  API call failed: {e}")

    # Fallback: direct DB
    print("  Falling back to direct DB initialization...")
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    agents = conn.execute("SELECT name FROM agent_registry").fetchall()

    for a in agents:
        try:
            conn.execute("""
                UPDATE agent_dna SET
                    birth_date = COALESCE(birth_date, ?),
                    maturity_level = COALESCE(maturity_level, 'embryo'),
                    knowledge_depth = COALESCE(knowledge_depth, ?),
                    self_awareness_score = COALESCE(self_awareness_score, ?),
                    experience_years = COALESCE(experience_years, 0.0),
                    autonomy_level = COALESCE(autonomy_level, ?),
                    perturbation_resilience = COALESCE(perturbation_resilience, ?),
                    cognitive_domain = COALESCE(cognitive_domain, ?),
                    emotional_intelligence = COALESCE(emotional_intelligence, ?),
                    wisdom_score = COALESCE(wisdom_score, 0.0)
                WHERE agent_name = ?
            """, (now,
                  random.uniform(0.1, 0.4), random.uniform(0.1, 0.3),
                  random.uniform(0.1, 0.3), random.uniform(0.1, 0.3),
                  random.uniform(0.1, 0.3), random.uniform(0.1, 0.3),
                  a["name"]))
        except Exception:
            pass

    conn.commit()
    conn.close()
    print(f"  Initialized Maturana fields for {len(agents)} agents")
    return True


def phase4_run_evolution():
    """Run evolution cycles — fitness-based + Maturana maturation."""
    print("\n" + "=" * 60)
    print("PHASE 4: Evolution Cycles")
    print("=" * 60)

    # Try population evolution via API
    print("  Running fitness-based evolution...")
    try:
        r = httpx.post(f"{BASE}/api/evolution/evolve-population", timeout=120)
        if r.status_code == 200:
            data = r.json()
            print(f"  Evolved {data.get('evolved_count', '?')} agents")
    except Exception as e:
        print(f"  Evolution API failed: {e}")

    # Run Maturana cycles
    print("  Running Maturana autopoiesis cycles (3 cycles)...")
    for cycle in range(1, 4):
        try:
            r = httpx.post(f"{BASE}/api/maturana/cycle/{cycle}",
                          params={"batch_size": 200}, timeout=180)
            if r.status_code == 200:
                data = r.json()
                print(f"    Cycle {cycle}: evolved={data.get('agents_evolved', '?')}, "
                      f"transitions={data.get('level_transitions', '?')}")
        except Exception as e:
            print(f"    Cycle {cycle} failed: {e}")
        time.sleep(1)


def phase5_simulate_activity():
    """Simulate continuous agent activity with varied behaviors."""
    print("\n" + "=" * 60)
    print("PHASE 5: Simulating Live Activity (waves)")
    print("=" * 60)

    conn = get_db()
    all_agents = [a["name"] for a in conn.execute("SELECT name FROM agent_registry").fetchall()]
    conn.close()

    print(f"  Total agents available: {len(all_agents)}")

    # Wave simulation: randomly change agent states
    for wave in range(1, 6):
        # Pick 50-200 random agents per wave
        batch_size = random.randint(50, 200)
        batch = random.sample(all_agents, min(batch_size, len(all_agents)))

        now = datetime.now(timezone.utc).isoformat()
        conn = get_db()

        state_map = {}
        for name in batch:
            state = random.choices(STATES, weights=STATE_WEIGHTS, k=1)[0]
            conn.execute(
                "UPDATE agent_registry SET status = ?, last_active = ? WHERE name = ?",
                (state, now, name)
            )
            conn.execute(
                """INSERT INTO agent_events (agent_name, event_type, detail, tokens_used, duration_ms, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (name, state, f"Wave {wave} simulation", random.randint(0, 2000), random.randint(100, 5000), now)
            )
            state_map[state] = state_map.get(state, 0) + 1

        conn.commit()
        conn.close()

        states_str = ", ".join(f"{s}={c}" for s, c in sorted(state_map.items(), key=lambda x: -x[1]))
        print(f"  Wave {wave}: {len(batch)} agents changed — {states_str}")
        time.sleep(2)

    # Final stats
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) as c FROM agent_registry").fetchone()["c"]
    active = conn.execute("SELECT COUNT(*) as c FROM agent_registry WHERE status != 'idle'").fetchone()["c"]
    events = conn.execute("SELECT COUNT(*) as c FROM agent_events").fetchone()["c"]
    conn.close()

    print(f"\n  Final state: {total} agents, {active} active, {events} total events")


def phase6_broadcast_refresh():
    """Tell all connected dashboards to refresh."""
    print("\n" + "=" * 60)
    print("PHASE 6: Broadcasting refresh to dashboards")
    print("=" * 60)

    # Simulate a few events via API to trigger WebSocket broadcasts
    sample_agents = [
        "fitsia-orchestrator", "ceo-fitsi", "tech-lead",
        "security-engineer", "ai-food-recognition-engineer",
    ]
    for agent in sample_agents:
        try:
            httpx.post(f"{BASE}/api/simulate/{agent}",
                      params={"event_type": "active"}, timeout=5)
            time.sleep(0.5)
        except Exception:
            pass

    print("  Broadcast triggers sent. Reload dashboard to see full state.")


def main():
    print("=" * 60)
    print("  FITSI AGENTS — MASS EVOLUTION SCRIPT")
    print(f"  Target: 5,000 → 6,000 agents + full activation")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    t0 = time.time()

    phase1_mass_activate()
    phase2_genesis_to_6000()
    phase3_initialize_maturana()
    phase4_run_evolution()
    phase5_simulate_activity()
    phase6_broadcast_refresh()

    elapsed = time.time() - t0

    print("\n" + "=" * 60)
    print(f"  EVOLUTION COMPLETE in {elapsed:.1f}s")
    print("=" * 60)

    # Final census
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) as c FROM agent_registry").fetchone()["c"]
    active = conn.execute("SELECT COUNT(*) as c FROM agent_registry WHERE status != 'idle'").fetchone()["c"]
    idle = total - active

    print(f"  Population: {total}")
    print(f"  Active: {active} ({100*active/total:.0f}%)")
    print(f"  Idle: {idle} ({100*idle/total:.0f}%)")

    states = conn.execute(
        "SELECT status, COUNT(*) as c FROM agent_registry GROUP BY status ORDER BY c DESC"
    ).fetchall()
    for s in states:
        print(f"    {s['status']:15} = {s['c']}")

    teams = conn.execute(
        "SELECT team, COUNT(*) as c FROM agent_registry GROUP BY team ORDER BY c DESC LIMIT 15"
    ).fetchall()
    print(f"\n  Top teams:")
    for t in teams:
        print(f"    {t['team']:30} = {t['c']}")

    conn.close()
    print(f"\n  Reload http://localhost:8001 and click ASCII to see all {total} agents!")


if __name__ == "__main__":
    main()

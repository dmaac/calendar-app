#!/usr/bin/env python3
"""
FITSI IA — Orquestacion Masiva Autonoma (10 horas)
===================================================
Este script ejecuta un loop continuo durante 10 horas que:
1. Activa agentes via el dashboard API (simulate events)
2. Ejecuta ciclos de evolucion Maturana
3. Genera actividad para que las vistas se llenen de datos
4. Simula interacciones entre agentes
5. Crea snapshots del sistema periodicamente

Uso: python3 run_orchestration_10h.py
"""

import time
import json
import random
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Config
DURATION_HOURS = 10
DB_PATH = Path(__file__).parent / "agents.db"
API_BASE = "http://localhost:8001"
CYCLE_INTERVAL = 30  # seconds between cycles

# Agent states
STATES = ["active", "thinking", "delegating", "reviewing", "spawning", "completed"]
TEAMS_PRIORITY = [
    "Supreme Orchestrator", "Control Demons", "C-Suite", "Board of Directors",
    "Vice Presidents", "Coordinators", "AI Engineering", "Backend Engineering",
    "Mobile Core", "Fitsia Core", "Engineering", "Quality Engineering",
    "Security", "Infrastructure", "Architecture", "Data Engineering",
]

def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    return conn

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def get_agents():
    conn = get_db()
    agents = conn.execute("SELECT name, team, category, status FROM agent_registry").fetchall()
    conn.close()
    return [dict(a) for a in agents]

def simulate_agent_event(agent_name, event_type, detail="Orchestration cycle"):
    """Record an event for an agent."""
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    tokens = random.randint(100, 5000)
    duration = random.randint(500, 15000)

    conn.execute("""
        INSERT INTO agent_events (agent_name, event_type, detail, tokens_used, duration_ms, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (agent_name, event_type, detail, tokens, duration, now))

    # Update agent status
    conn.execute("""
        UPDATE agent_registry SET status=?, last_active=?,
        total_invocations = total_invocations + 1,
        total_tokens = total_tokens + ?
        WHERE name=?
    """, (event_type if event_type != "completed" else "idle", now, tokens, agent_name))

    conn.commit()
    conn.close()

def simulate_interaction(from_agent, to_agent, itype="collaboration"):
    """Record an interaction between two agents."""
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    strength = round(random.uniform(0.3, 1.0), 3)

    conn.execute("""
        INSERT INTO agent_interactions (from_agent, to_agent, interaction_type, coupling_strength, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (from_agent, to_agent, itype, strength, now))
    conn.commit()
    conn.close()

def create_system_snapshot():
    """Take a system snapshot."""
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    total = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    active = conn.execute("SELECT COUNT(*) FROM agent_registry WHERE status != 'idle'").fetchone()[0]
    events = conn.execute("SELECT COUNT(*) FROM agent_events").fetchone()[0]
    tokens = conn.execute("SELECT COALESCE(SUM(total_tokens),0) FROM agent_registry").fetchone()[0]

    try:
        avg_score = conn.execute("SELECT COALESCE(AVG(fitness_score),0) FROM agent_dna").fetchone()[0]
    except:
        avg_score = 0

    health = "healthy" if active > 0 else "degraded"

    conn.execute("""
        INSERT INTO system_snapshots (total_agents, active_agents, active_tasks, total_events, total_tokens, avg_score, health_status, snapshot_at)
        VALUES (?, ?, 0, ?, ?, ?, ?, ?)
    """, (total, active, events, tokens, round(avg_score, 4), health, now))
    conn.commit()
    conn.close()

def run_evolution_cycle(cycle_num):
    """Run one Maturana evolution cycle on random agents."""
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Pick random agents to evolve
    agents = conn.execute("""
        SELECT agent_name, fitness_score, wisdom_score, experience_years, maturity_level,
               knowledge_depth, autonomy_level, autopoiesis_cycle
        FROM agent_dna ORDER BY RANDOM() LIMIT 50
    """).fetchall()

    evolved = 0
    transitions = 0

    for a in agents:
        name = a["agent_name"]
        wisdom = a["wisdom_score"] or 0
        exp = a["experience_years"] or 0
        level = a["maturity_level"] or "embryo"

        # Grow
        new_wisdom = min(1.0, wisdom + random.uniform(0.001, 0.01))
        new_exp = exp + random.uniform(0.1, 2.0)
        new_knowledge = min(1.0, (a["knowledge_depth"] or 0.1) + random.uniform(0.001, 0.005))
        new_autonomy = min(1.0, (a["autonomy_level"] or 0.1) + random.uniform(0.001, 0.003))

        # Check maturity transition
        new_level = level
        if level == "embryo" and new_exp > 10:
            new_level = "sage"
            transitions += 1
            conn.execute("""
                INSERT INTO agent_maturity_log (agent_name, from_level, to_level, experience_years_at, wisdom_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (name, level, new_level, new_exp, new_wisdom, now))

        conn.execute("""
            UPDATE agent_dna SET wisdom_score=?, experience_years=?, knowledge_depth=?,
            autonomy_level=?, maturity_level=?, autopoiesis_cycle=?, last_evolved=?
            WHERE agent_name=?
        """, (new_wisdom, new_exp, new_knowledge, new_autonomy, new_level, cycle_num, now, name))

        evolved += 1

    conn.commit()
    conn.close()
    return evolved, transitions

def run_activity_wave(agents, wave_size=20):
    """Activate a wave of agents with various states."""
    selected = random.sample(agents, min(wave_size, len(agents)))

    for a in selected:
        state = random.choice(STATES)
        detail = f"Auto-orchestration wave"
        simulate_agent_event(a["name"], state, detail)

    # Create some interactions between active agents
    for i in range(min(10, len(selected))):
        a1 = random.choice(selected)
        a2 = random.choice(selected)
        if a1["name"] != a2["name"]:
            itype = random.choice(["collaboration", "delegation", "mentorship", "review"])
            simulate_interaction(a1["name"], a2["name"], itype)

    return len(selected)

def reset_completed_agents():
    """Reset completed/error agents back to idle."""
    conn = get_db()
    conn.execute("UPDATE agent_registry SET status='idle' WHERE status IN ('completed','error')")
    conn.commit()
    conn.close()

def main():
    start = time.time()
    end = start + (DURATION_HOURS * 3600)
    cycle = 0
    total_events = 0
    total_evolved = 0
    total_interactions = 0

    log(f"=== FITSI IA Orchestration Engine ===")
    log(f"Duration: {DURATION_HOURS} hours")
    log(f"Cycle interval: {CYCLE_INTERVAL}s")
    log(f"DB: {DB_PATH}")

    agents = get_agents()
    log(f"Agents loaded: {len(agents)}")

    try:
        while time.time() < end:
            cycle += 1
            elapsed_h = (time.time() - start) / 3600
            remaining_h = DURATION_HOURS - elapsed_h

            log(f"--- Cycle {cycle} | {elapsed_h:.2f}h elapsed | {remaining_h:.2f}h remaining ---")

            # 1. Activity wave
            wave_size = random.randint(10, 40)
            activated = run_activity_wave(agents, wave_size)
            total_events += activated
            log(f"  Activated {activated} agents")

            # 2. Evolution cycle
            evolved, transitions = run_evolution_cycle(cycle)
            total_evolved += evolved
            log(f"  Evolved {evolved} agents, {transitions} maturity transitions")

            # 3. System snapshot (every 5 cycles)
            if cycle % 5 == 0:
                create_system_snapshot()
                log(f"  System snapshot taken")

            # 4. Reset completed agents (every 3 cycles)
            if cycle % 3 == 0:
                reset_completed_agents()

            # 5. Refresh agent list periodically
            if cycle % 20 == 0:
                agents = get_agents()

            # Stats
            log(f"  Totals: {total_events} events, {total_evolved} evolved, cycle {cycle}")

            # Wait
            time.sleep(CYCLE_INTERVAL)

    except KeyboardInterrupt:
        log("Interrupted by user")

    elapsed = (time.time() - start) / 3600
    log(f"=== COMPLETED ===")
    log(f"Ran for {elapsed:.2f} hours, {cycle} cycles")
    log(f"Total events: {total_events}")
    log(f"Total evolved: {total_evolved}")

if __name__ == "__main__":
    main()

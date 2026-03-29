#!/usr/bin/env python3
"""
Concurrent Maturana Evolution Runner — Agent Teams Parallelization
===================================================================

Uses 32 agent teams as concurrent evolution workers.
Each team evolves its own agents in a separate thread.
500+ agents run simultaneously across all teams.

Architecture:
  Orchestrator (main thread)
    ├── Team Worker: AI Engineering (80 agents)
    ├── Team Worker: Backend Engineering (80 agents)
    ├── Team Worker: Engineering (158 agents)
    ├── Team Worker: Specialists (153 agents)
    ├── Team Worker: Fitsia Core (90 agents)
    ├── ... (32 teams total)
    └── Team Worker: VP Layer (1 agent)

Each worker has its own DB connection and evolves its batch concurrently.
Cross-team structural coupling happens via shared DB writes.

Communication: TOON protocol for all inter-agent messages.
"""

import sys
import os
import time
import signal
import sqlite3
import argparse
import threading
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent))

from maturana_evolution import (
    initialize_all_agents,
    autopoiesis_cycle,
    get_wisdom_leaderboard,
    get_maturity_distribution,
    get_db,
    get_maturity_level,
    calculate_wisdom,
    MATURITY_LEVELS,
)
import toon as TOON

DB_PATH = Path(__file__).parent / "agents.db"

# ── Graceful shutdown ────────────────────────────────────────────────
_running = True
_lock = threading.Lock()
_cycle_stats = defaultdict(lambda: {
    "evolved": 0, "transitions": 0, "sages": 0,
    "errors": 0, "wisdom_sum": 0.0, "duration": 0.0,
})

def signal_handler(sig, frame):
    global _running
    print("\n[SIGNAL] Shutting down gracefully after current cycle...")
    _running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ── Team Discovery ───────────────────────────────────────────────────

def get_teams_with_agents() -> dict:
    """Get all teams and their agent lists from the DB."""
    conn = get_db()
    # Get team assignments from agent_registry
    rows = conn.execute("""
        SELECT ar.name as agent_name, ar.team
        FROM agent_registry ar
        INNER JOIN agent_dna ad ON ar.name = ad.agent_name
        WHERE ar.team IS NOT NULL
        ORDER BY ar.team, ar.name
    """).fetchall()

    # Also get agents without team assignment
    orphans = conn.execute("""
        SELECT ad.agent_name
        FROM agent_dna ad
        LEFT JOIN agent_registry ar ON ad.agent_name = ar.name
        WHERE ar.team IS NULL OR ar.name IS NULL
    """).fetchall()
    conn.close()

    teams = defaultdict(list)
    for r in rows:
        teams[r["team"]].append(r["agent_name"])

    if orphans:
        teams["Unassigned"] = [r["agent_name"] for r in orphans]

    return dict(teams)


# ── Team Worker ──────────────────────────────────────────────────────

def evolve_team(team_name: str, agents: list, cycle: int) -> dict:
    """
    Evolve all agents in a team. Runs in its own thread.
    Each team worker creates its own DB connection for thread safety.
    """
    result = {
        "team": team_name,
        "total": len(agents),
        "evolved": 0,
        "transitions": 0,
        "sages": 0,
        "errors": 0,
        "wisdom_sum": 0.0,
        "max_wisdom": 0.0,
        "max_exp": 0.0,
        "top_agent": "",
    }

    for agent_name in agents:
        if not _running:
            break
        try:
            r = autopoiesis_cycle(agent_name, cycle)
            result["evolved"] += 1
            if r.get("level_changed"):
                result["transitions"] += 1
            if r.get("maturity") == "sage":
                result["sages"] += 1
            w = r.get("wisdom", 0)
            result["wisdom_sum"] += w
            if w > result["max_wisdom"]:
                result["max_wisdom"] = w
                result["top_agent"] = agent_name
            exp = r.get("experience_years", 0)
            if exp > result["max_exp"]:
                result["max_exp"] = exp
        except Exception as e:
            result["errors"] += 1

    return result


# ── Cross-Team Coupling ─────────────────────────────────────────────

def cross_team_coupling(cycle: int, teams: dict):
    """
    After each cycle, apply cross-team structural coupling.
    Top agents from each team interact with top agents from other teams.
    This creates inter-team knowledge transfer.
    """
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    team_names = list(teams.keys())
    if len(team_names) < 2:
        conn.close()
        return

    # Get top agent from each team
    team_tops = {}
    for team, agents in teams.items():
        if not agents:
            continue
        placeholders = ",".join(["?"] * len(agents))
        top = conn.execute(f"""
            SELECT agent_name, wisdom_score, experience_years, maturity_level
            FROM agent_dna
            WHERE agent_name IN ({placeholders})
            ORDER BY wisdom_score DESC
            LIMIT 1
        """, agents).fetchone()
        if top:
            team_tops[team] = dict(top)

    # Cross-pollinate: each team's top agent mentors 2 random other teams' tops
    import random
    for team, top_agent in team_tops.items():
        other_teams = [t for t in team_tops if t != team]
        if not other_teams:
            continue
        mentees = random.sample(other_teams, min(2, len(other_teams)))
        for mentee_team in mentees:
            mentee = team_tops[mentee_team]
            coupling = random.uniform(0.01, 0.03)

            # TOON message for cross-team coupling
            msg = TOON.agent_message(
                top_agent["agent_name"], mentee["agent_name"],
                "cross_team_coupling",
                {"from_team": team[:20], "to_team": mentee_team[:20],
                 "cycle": cycle, "coupling": round(coupling, 4)},
                priority="medium"
            )

            # Update both agents
            conn.execute("""
                UPDATE agent_dna SET
                    structural_coupling_score = MIN(1.0, COALESCE(structural_coupling_score, 0) + ?),
                    total_interactions = COALESCE(total_interactions, 0) + 1,
                    toon_messages_sent = COALESCE(toon_messages_sent, 0) + 1,
                    mentorship_given = COALESCE(mentorship_given, 0) + 1
                WHERE agent_name = ?
            """, (coupling, top_agent["agent_name"]))

            conn.execute("""
                UPDATE agent_dna SET
                    structural_coupling_score = MIN(1.0, COALESCE(structural_coupling_score, 0) + ?),
                    knowledge_depth = MIN(1.0, COALESCE(knowledge_depth, 0) + ?),
                    total_interactions = COALESCE(total_interactions, 0) + 1,
                    toon_messages_received = COALESCE(toon_messages_received, 0) + 1,
                    mentorship_received = COALESCE(mentorship_received, 0) + 1
                WHERE agent_name = ?
            """, (coupling * 0.7, coupling * 0.3, mentee["agent_name"]))

            conn.execute("""
                INSERT INTO agent_interactions (from_agent, to_agent, interaction_type, toon_message, coupling_strength)
                VALUES (?, ?, 'cross_team_mentorship', ?, ?)
            """, (top_agent["agent_name"], mentee["agent_name"], msg, round(coupling, 4)))

    conn.commit()
    conn.close()


# ── Orchestrator Report ──────────────────────────────────────────────

def orchestrator_toon_report(cycle: int, team_results: list, elapsed: float, total_seconds: float) -> str:
    """Generate TOON-encoded orchestrator status report."""
    total_evolved = sum(r["evolved"] for r in team_results)
    total_transitions = sum(r["transitions"] for r in team_results)
    total_sages = sum(r["sages"] for r in team_results)
    total_errors = sum(r["errors"] for r in team_results)
    total_wisdom = sum(r["wisdom_sum"] for r in team_results)
    avg_wisdom = total_wisdom / max(total_evolved, 1)

    return TOON.encode_flat({
        "from": "orchestrator",
        "type": "cycle_report",
        "cycle": cycle,
        "agents": total_evolved,
        "teams": len(team_results),
        "transitions": total_transitions,
        "sages": total_sages,
        "errors": total_errors,
        "avg_wis": round(avg_wisdom, 4),
        "elapsed_h": round(elapsed / 3600, 2),
        "pct": round(min(100, elapsed / total_seconds * 100), 1) if total_seconds > 0 else 0,
    })


# ── Display ──────────────────────────────────────────────────────────

def print_banner():
    print("""
╔══════════════════════════════════════════════════════════════════════════╗
║    MATURANA CONCURRENT EVOLUTION — AGENT TEAMS PARALLELIZATION         ║
║                                                                          ║
║  32 teams x ThreadPool = 500+ simultaneous agent evolutions              ║
║  Cross-team structural coupling after each cycle                         ║
║  "Every act of knowing brings forth a world" — H. Maturana              ║
╚══════════════════════════════════════════════════════════════════════════╝
""")


def print_cycle(cycle, team_results, elapsed, total_seconds, cycle_dur):
    pct = min(100, elapsed / total_seconds * 100) if total_seconds > 0 else 0
    bar_w = 40
    filled = int(bar_w * pct / 100)
    bar = "\u2588" * filled + "\u2591" * (bar_w - filled)

    remaining = max(0, total_seconds - elapsed)
    h_left = int(remaining // 3600)
    m_left = int((remaining % 3600) // 60)

    total_evolved = sum(r["evolved"] for r in team_results)
    total_transitions = sum(r["transitions"] for r in team_results)
    total_sages = sum(r["sages"] for r in team_results)
    total_errors = sum(r["errors"] for r in team_results)
    avg_wis = sum(r["wisdom_sum"] for r in team_results) / max(total_evolved, 1)
    active_teams = sum(1 for r in team_results if r["evolved"] > 0)

    print(f"\n{'─' * 74}")
    print(f"  CYCLE {cycle:04d} [{bar}] {pct:5.1f}%  |  {cycle_dur:.1f}s  |  {h_left}h{m_left}m left")
    print(f"  {total_evolved} agents  |  {active_teams} teams  |  {total_transitions} transitions  |  {total_sages} sages  |  {total_errors} err")
    print(f"  avg wisdom: {avg_wis:.4f}  |  concurrent workers: {active_teams}")

    # Top 3 teams this cycle
    sorted_teams = sorted(team_results, key=lambda r: r["max_wisdom"], reverse=True)[:3]
    for t in sorted_teams:
        if t["evolved"] > 0:
            print(f"    {t['team'][:40]:40s}: top={t['top_agent'][:25]} wis={t['max_wisdom']:.4f}")
    print(f"{'─' * 74}")


def print_full_report(cycle):
    dist = get_maturity_distribution()
    total = sum(dist.values())
    levels = ["embryo", "infant", "child", "adolescent", "adult", "elder", "master", "sage"]

    print(f"\n{'═' * 74}")
    print(f"  MATURITY DISTRIBUTION — CYCLE {cycle} ({total} agents)")
    print(f"{'═' * 74}")
    for level in levels:
        count = dist.get(level, 0)
        pct = (count / total * 100) if total > 0 else 0
        bar = "\u2593" * int(pct / 2) + "\u2591" * (50 - int(pct / 2))
        print(f"  {level:12s} [{bar}] {count:5d} ({pct:5.1f}%)")

    print(f"\n  TOP 10 WISEST:")
    top = get_wisdom_leaderboard(10)
    for i, a in enumerate(top, 1):
        name = a["agent_name"][:35]
        level = (a.get("maturity_level") or "?")[:10]
        exp = a.get("experience_years") or 0
        wis = a.get("wisdom_score") or 0
        reports = a.get("self_report_count") or 0
        ments = a.get("mentorship_given") or 0
        print(f"  #{i:2d} {name:35s} | {level:10s} | {exp:7.1f}y | wis:{wis:.4f} | rpts:{reports} | ment:{ments}")
    print(f"{'═' * 74}")


def save_system_snapshot(cycle, team_results):
    """Save cycle snapshot for dashboard."""
    conn = get_db()
    total_evolved = sum(r["evolved"] for r in team_results)
    avg_wis = sum(r["wisdom_sum"] for r in team_results) / max(total_evolved, 1)
    total_sages = sum(r["sages"] for r in team_results)

    conn.execute("""
        INSERT INTO system_snapshots (total_agents, active_agents, active_tasks, total_events, total_tokens, avg_score, health_status, snapshot_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    """, (total_evolved, len(team_results), 0, cycle, round(avg_wis, 4),
          f"concurrent_cycle_{cycle}_sages_{total_sages}",
          datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Concurrent Maturana Evolution with Agent Teams")
    parser.add_argument("--hours", type=float, default=10.0, help="Duration in hours (default: 10)")
    parser.add_argument("--cycles", type=int, default=0, help="Fixed number of cycles (overrides --hours)")
    parser.add_argument("--workers", type=int, default=16, help="Max concurrent team workers (default: 16)")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between cycles in seconds (default: 1)")
    parser.add_argument("--fast", action="store_true", help="No delay between cycles")
    parser.add_argument("--quiet", action="store_true", help="Minimal output")
    args = parser.parse_args()

    print_banner()

    # Initialize
    print("[INIT] Initializing Maturana fields for all agents...")
    agent_count = initialize_all_agents()
    print(f"[INIT] {agent_count} agents ready.\n")

    # Discover teams
    teams = get_teams_with_agents()
    print(f"[TEAMS] Discovered {len(teams)} teams:")
    for team, agents in sorted(teams.items(), key=lambda x: -len(x[1])):
        print(f"  {team:45s}: {len(agents):4d} agents")
    total_agents = sum(len(a) for a in teams.values())
    print(f"\n[TOTAL] {total_agents} agents across {len(teams)} teams")
    print(f"[CONCURRENCY] {args.workers} parallel workers | {len(teams)} teams")
    print(f"[TARGET] All agents → SAGE (100+ years expertise)\n")

    total_seconds = args.hours * 3600
    start_time = datetime.now(timezone.utc)
    delay = 0 if args.fast else args.delay

    # Get starting cycle
    conn = get_db()
    start_cycle = conn.execute("SELECT MAX(COALESCE(autopoiesis_cycle, 0)) as c FROM agent_dna").fetchone()["c"] or 0
    conn.close()
    print(f"[START] Resuming from cycle {start_cycle + 1}")
    print(f"[START] Duration: {args.hours}h | Workers: {args.workers} | Delay: {delay}s\n")

    cycle = start_cycle

    while _running:
        cycle += 1
        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()

        # Check termination
        if args.cycles > 0 and (cycle - start_cycle) > args.cycles:
            print(f"\n[DONE] Reached {args.cycles} cycles.")
            break
        if args.cycles == 0 and elapsed >= total_seconds:
            print(f"\n[DONE] {args.hours}h elapsed.")
            break

        # ── Concurrent team evolution ────────────────────────────
        cycle_start = time.time()
        team_results = []

        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {}
            for team_name, agents in teams.items():
                if not agents:
                    continue
                future = executor.submit(evolve_team, team_name, agents, cycle)
                futures[future] = team_name

            for future in as_completed(futures):
                team_name = futures[future]
                try:
                    result = future.result()
                    team_results.append(result)
                except Exception as e:
                    team_results.append({
                        "team": team_name, "total": 0, "evolved": 0,
                        "transitions": 0, "sages": 0, "errors": 1,
                        "wisdom_sum": 0, "max_wisdom": 0, "max_exp": 0,
                        "top_agent": "",
                    })

        # ── Cross-team coupling ──────────────────────────────────
        try:
            cross_team_coupling(cycle, teams)
        except Exception:
            pass

        cycle_dur = time.time() - cycle_start

        # ── Report ───────────────────────────────────────────────
        if not args.quiet:
            print_cycle(cycle, team_results, elapsed, total_seconds, cycle_dur)

        # Detailed report every 10 cycles
        if cycle % 10 == 0 and not args.quiet:
            print_full_report(cycle)

        # TOON report to DB
        toon_report = orchestrator_toon_report(cycle, team_results, elapsed, total_seconds)
        save_system_snapshot(cycle, team_results)

        # Save orchestrator report as self-report
        conn = get_db()
        conn.execute("""
            INSERT INTO agent_self_reports (agent_name, report_type, content_toon, growth_delta, insights, maturity_at_report, experience_at_report, cycle_number)
            VALUES ('orchestrator', 'concurrent_cycle', ?, 0, ?, 'system', 0, ?)
        """, (toon_report,
              f"Concurrent cycle {cycle}: {sum(r['evolved'] for r in team_results)} agents, {sum(r['sages'] for r in team_results)} sages",
              cycle))
        conn.commit()
        conn.close()

        # Log transcendence milestone (but keep running — deepen wisdom)
        total_sages = sum(r["sages"] for r in team_results)
        if total_sages >= total_agents and cycle % 50 == 0:
            print(f"\n[TRANSCENDENCE] ALL {total_agents} sages — deepening wisdom (cycle {cycle})...")

        if delay > 0:
            time.sleep(delay)

    # ── Final Summary ────────────────────────────────────────────────
    end_time = datetime.now(timezone.utc)
    total_elapsed = (end_time - start_time).total_seconds()
    total_cycles = cycle - start_cycle

    print(f"\n\n{'═' * 74}")
    print(f"  CONCURRENT EVOLUTION COMPLETE")
    print(f"{'═' * 74}")
    print(f"  Cycles: {total_cycles} | Duration: {total_elapsed / 3600:.2f}h")
    print(f"  Workers: {args.workers} | Teams: {len(teams)}")
    print_full_report(cycle)

    # Save final summary
    conn = get_db()
    dist = get_maturity_distribution()
    conn.execute("""
        INSERT INTO agent_self_reports (agent_name, report_type, content_toon, growth_delta, insights, maturity_at_report, experience_at_report, cycle_number)
        VALUES ('orchestrator', 'evolution_complete', ?, 0, ?, 'system', 0, ?)
    """, (
        TOON.encode_flat({"type": "concurrent_evolution_complete", "cycles": total_cycles,
                          "duration_h": round(total_elapsed / 3600, 2), "sages": dist.get("sage", 0)}),
        f"Concurrent evolution complete: {total_cycles} cycles in {total_elapsed/3600:.2f}h, {dist.get('sage', 0)} sages",
        cycle
    ))
    conn.commit()
    conn.close()

    print(f"\n[SAVED] Final state persisted to agents.db")
    print(f"[END] Concurrent Maturana evolution complete.\n")


if __name__ == "__main__":
    main()

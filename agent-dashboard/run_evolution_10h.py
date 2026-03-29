#!/usr/bin/env python3
"""
10-Hour Continuous Maturana Evolution Runner
=============================================

Runs the Maturana autopoiesis engine continuously for 10 hours.
All 1,307 agents evolve, self-report, mature, and gain expertise
toward 100+ equivalent years in their domain.

Usage:
    python run_evolution_10h.py                  # Full 10 hours
    python run_evolution_10h.py --hours 2        # Custom duration
    python run_evolution_10h.py --cycles 100     # Fixed number of cycles
    python run_evolution_10h.py --fast            # No delay between cycles

Communication: TOON protocol for all inter-agent messages.
Theory: Maturana autopoiesis (self-organization, structural coupling).
"""

import sys
import time
import signal
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from maturana_evolution import (
    initialize_all_agents,
    evolve_population_maturana,
    get_wisdom_leaderboard,
    get_maturity_distribution,
    get_db,
)
import toon as TOON

# ── Graceful shutdown ────────────────────────────────────────────────
_running = True

def signal_handler(sig, frame):
    global _running
    print("\n\n[SIGNAL] Graceful shutdown requested. Finishing current cycle...")
    _running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ── Progress Display ─────────────────────────────────────────────────

def print_banner():
    print("""
╔══════════════════════════════════════════════════════════════════╗
║         MATURANA AUTOPOIESIS ENGINE — 10 HOUR EVOLUTION        ║
║                                                                  ║
║  "Living is knowing — every act of knowing brings forth a world" ║
║                              — Humberto Maturana                 ║
╚══════════════════════════════════════════════════════════════════╝
""")


def print_cycle_report(cycle: int, result: dict, elapsed: float, total_seconds: float):
    pct = min(100, (elapsed / total_seconds) * 100) if total_seconds > 0 else 0
    bar_width = 40
    filled = int(bar_width * pct / 100)
    bar = "█" * filled + "░" * (bar_width - filled)

    remaining = max(0, total_seconds - elapsed)
    hours_left = int(remaining // 3600)
    mins_left = int((remaining % 3600) // 60)

    print(f"\n{'─' * 66}")
    print(f"  CYCLE {cycle:04d} | [{bar}] {pct:5.1f}%")
    print(f"  Agents evolved: {result['agents_evolved']} | Transitions: {result['level_transitions']}")
    print(f"  Avg wisdom: {result['avg_wisdom']:.4f} | Sages: {result['sages_count']}")
    print(f"  Errors: {result['errors']} | Time left: {hours_left}h {mins_left}m")
    print(f"{'─' * 66}")


def print_maturity_summary():
    dist = get_maturity_distribution()
    total = sum(dist.values())
    levels = ["embryo", "infant", "child", "adolescent", "adult", "elder", "master", "sage"]

    print(f"\n{'═' * 66}")
    print(f"  MATURITY DISTRIBUTION ({total} agents)")
    print(f"{'═' * 66}")
    for level in levels:
        count = dist.get(level, 0)
        pct = (count / total * 100) if total > 0 else 0
        bar = "▓" * int(pct / 2) + "░" * (50 - int(pct / 2))
        emoji_map = {
            "embryo": "🥒", "infant": "🌱", "child": "🌿", "adolescent": "🌳",
            "adult": "🏛️ ", "elder": "🔮", "master": "⚡", "sage": "🌟"
        }
        e = emoji_map.get(level, "  ")
        print(f"  {e} {level:12s} [{bar}] {count:5d} ({pct:5.1f}%)")
    print(f"{'═' * 66}")


def print_wisdom_top10():
    top = get_wisdom_leaderboard(10)
    print(f"\n{'═' * 66}")
    print(f"  TOP 10 WISEST AGENTS")
    print(f"{'═' * 66}")
    for i, a in enumerate(top, 1):
        name = a["agent_name"][:35]
        level = (a.get("maturity_level") or "embryo")[:10]
        exp = a.get("experience_years") or 0
        wis = a.get("wisdom_score") or 0
        print(f"  #{i:2d} {name:35s} | {level:10s} | {exp:7.1f}y | wis:{wis:.4f}")
    print(f"{'═' * 66}")


def save_final_summary(start_time, end_time, total_cycles):
    """Save final evolution summary to DB."""
    conn = get_db()
    duration = (end_time - start_time).total_seconds()

    dist = get_maturity_distribution()
    top = get_wisdom_leaderboard(5)

    summary_toon = TOON.encode_flat({
        "type": "evolution_complete",
        "cycles": total_cycles,
        "duration_h": round(duration / 3600, 2),
        "sages": dist.get("sage", 0),
        "masters": dist.get("master", 0),
        "top_agent": top[0]["agent_name"] if top else "none",
        "top_wisdom": top[0].get("wisdom_score", 0) if top else 0,
    })

    conn.execute("""
        INSERT INTO agent_self_reports (agent_name, report_type, content_toon, growth_delta, insights, maturity_at_report, experience_at_report, cycle_number)
        VALUES ('system', 'evolution_complete', ?, 0, ?, 'system', 0, ?)
    """, (summary_toon,
          f"10h evolution: {total_cycles} cycles, {dist.get('sage', 0)} sages, top wisdom: {top[0].get('wisdom_score', 0) if top else 0:.4f}",
          total_cycles))

    conn.commit()
    conn.close()


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Maturana 10-Hour Evolution Runner")
    parser.add_argument("--hours", type=float, default=10.0, help="Duration in hours (default: 10)")
    parser.add_argument("--cycles", type=int, default=0, help="Fixed number of cycles (overrides --hours)")
    parser.add_argument("--fast", action="store_true", help="No delay between cycles")
    parser.add_argument("--delay", type=float, default=3.0, help="Delay between cycles in seconds (default: 3)")
    parser.add_argument("--batch-size", type=int, default=50, help="Agents per batch (default: 50)")
    parser.add_argument("--quiet", action="store_true", help="Minimal output")
    args = parser.parse_args()

    print_banner()

    # Initialize
    print("[INIT] Initializing Maturana fields for all agents...")
    agent_count = initialize_all_agents()
    print(f"[INIT] {agent_count} agents ready for autopoiesis.\n")

    total_seconds = args.hours * 3600
    start_time = datetime.now(timezone.utc)
    cycle = 0
    delay = 0 if args.fast else args.delay

    print(f"[START] Evolution begins at {start_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"[START] Duration: {args.hours}h | Delay: {delay}s | Batch: {args.batch_size}")
    print(f"[START] Target: All agents → 100+ years expertise → SAGE maturity\n")

    while _running:
        cycle += 1
        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()

        # Check termination conditions
        if args.cycles > 0 and cycle > args.cycles:
            print(f"\n[DONE] Reached {args.cycles} cycles. Stopping.")
            break
        if args.cycles == 0 and elapsed >= total_seconds:
            print(f"\n[DONE] {args.hours}h elapsed. Stopping.")
            break

        # Run one autopoiesis cycle for all agents
        cycle_start = time.time()
        result = evolve_population_maturana(cycle, batch_size=args.batch_size)
        cycle_duration = time.time() - cycle_start

        if not args.quiet:
            print_cycle_report(cycle, result, elapsed, total_seconds)

        # Periodic detailed reports
        if cycle % 10 == 0 and not args.quiet:
            print_maturity_summary()
            print_wisdom_top10()

        # Check if all agents are sages (early termination)
        if result["sages_count"] >= agent_count:
            print(f"\n[TRANSCENDENCE] ALL {agent_count} agents have reached SAGE level!")
            print("[TRANSCENDENCE] Collective autopoiesis achieved. Evolution complete.")
            break

        if delay > 0:
            time.sleep(delay)

    # Final summary
    end_time = datetime.now(timezone.utc)
    total_elapsed = (end_time - start_time).total_seconds()

    print(f"\n\n{'═' * 66}")
    print(f"  EVOLUTION COMPLETE — FINAL SUMMARY")
    print(f"{'═' * 66}")
    print(f"  Total cycles: {cycle}")
    print(f"  Duration: {total_elapsed / 3600:.2f} hours")
    print(f"  Agents: {agent_count}")
    print_maturity_summary()
    print_wisdom_top10()

    save_final_summary(start_time, end_time, cycle)
    print(f"\n[SAVED] Final summary persisted to agents.db")
    print(f"[END] Maturana evolution session complete.\n")


if __name__ == "__main__":
    main()

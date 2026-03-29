"""
Agent Evolution Engine — Evolutionary Intelligence for the Fitsi Agent Ecosystem

Implements:
- Fitness scoring based on task performance
- Natural selection (eliminate underperformers)
- Skill crossover (combine top agents)
- Adaptive mutation (random improvements for stuck agents)
- Specialization deepening (sharpen strengths)
- Performance tracking and benchmarking

All evolution data persists in agents.db for cross-session learning.
"""

import sqlite3
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "agents.db"


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


# ── Fitness Calculation ─────────────────────────────────────────────

def calculate_fitness(agent_name: str) -> float:
    """
    Multi-dimensional fitness score (0.0 - 1.0) based on:
    - Task success rate (40%)
    - Speed efficiency (15%)
    - Accuracy (20%)
    - Collaboration ability (10%)
    - Reliability/consistency (15%)
    """
    conn = get_db()
    dna = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?", (agent_name,)).fetchone()
    if not dna:
        conn.close()
        return 0.5  # Default for uninitialized agents

    completed = dna["total_tasks_completed"]
    failed = dna["total_tasks_failed"]
    total = completed + failed

    if total == 0:
        # No tasks yet — use initial DNA scores
        fitness = (
            dna["accuracy_score"] * 0.4 +
            dna["speed_score"] * 0.15 +
            dna["accuracy_score"] * 0.20 +
            dna["collaboration_score"] * 0.10 +
            dna["reliability_score"] * 0.15
        )
    else:
        success_rate = completed / total if total > 0 else 0
        fitness = (
            success_rate * 0.40 +
            dna["speed_score"] * 0.15 +
            dna["accuracy_score"] * 0.20 +
            dna["collaboration_score"] * 0.10 +
            dna["reliability_score"] * 0.15
        )

    # Clamp to [0, 1]
    fitness = max(0.0, min(1.0, fitness))

    # Update DNA
    conn.execute(
        "UPDATE agent_dna SET fitness_score = ? WHERE agent_name = ?",
        (round(fitness, 4), agent_name)
    )
    conn.commit()
    conn.close()
    return fitness


# ── Evolution Operations ────────────────────────────────────────────

def evolve_agent(agent_name: str, trigger: str = "periodic") -> dict:
    """
    Apply evolutionary pressure to an agent based on its performance.
    Returns dict with changes made.
    """
    conn = get_db()
    dna = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?", (agent_name,)).fetchone()
    if not dna:
        conn.close()
        return {"status": "no_dna", "agent": agent_name}

    fitness = calculate_fitness(agent_name)
    changes = []
    now = datetime.now(timezone.utc).isoformat()

    # Determine which strategy to apply
    if fitness < 0.3:
        # Adaptive mutation — struggling agent
        changes = _apply_adaptive_mutation(conn, agent_name, dna, now)
    elif fitness < 0.5:
        # Reliability hardening
        changes = _apply_reliability_hardening(conn, agent_name, dna, now)
    elif fitness > 0.8:
        # Specialization deepening OR creative exploration
        if random.random() < 0.3:
            changes = _apply_creative_exploration(conn, agent_name, dna, now)
        else:
            changes = _apply_specialization_deepening(conn, agent_name, dna, now)
    else:
        # Speed optimization for mid-tier agents
        changes = _apply_speed_optimization(conn, agent_name, dna, now)

    # Increment generation
    new_gen = (dna["generation"] or 1) + 1
    conn.execute(
        "UPDATE agent_dna SET generation = ?, last_evolved = ? WHERE agent_name = ?",
        (new_gen, now, agent_name)
    )

    # Update strategy application count
    if changes:
        strategy_name = changes[0].get("strategy", "unknown")
        conn.execute(
            "UPDATE evolution_strategies SET applications_count = applications_count + 1 WHERE strategy_name = ?",
            (strategy_name,)
        )

    conn.commit()
    conn.close()

    return {
        "agent": agent_name,
        "fitness": round(fitness, 4),
        "generation": new_gen,
        "trigger": trigger,
        "changes": changes
    }


def _apply_adaptive_mutation(conn, agent_name, dna, now):
    """Random mutations for struggling agents."""
    traits = ["speed_score", "accuracy_score", "collaboration_score", "creativity_score", "adaptability_score"]
    changes = []
    mutation_rate = dna["mutation_rate"] or 0.1

    for trait in random.sample(traits, k=2):
        old_val = dna[trait]
        delta = random.uniform(-mutation_rate, mutation_rate * 2)  # Bias towards improvement
        new_val = max(0.0, min(1.0, old_val + delta))

        conn.execute(f"UPDATE agent_dna SET {trait} = ? WHERE agent_name = ?", (round(new_val, 4), agent_name))
        conn.execute(
            "INSERT INTO evolution_history (agent_name, generation_from, generation_to, trait_changed, old_value, new_value, trigger_event) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (agent_name, dna["generation"], (dna["generation"] or 1) + 1, trait, old_val, new_val, "adaptive_mutation")
        )
        changes.append({"strategy": "adaptive_mutation", "trait": trait, "old": old_val, "new": round(new_val, 4)})

    return changes


def _apply_reliability_hardening(conn, agent_name, dna, now):
    """Improve reliability for inconsistent agents."""
    old_val = dna["reliability_score"]
    new_val = min(1.0, old_val + 0.1)

    conn.execute("UPDATE agent_dna SET reliability_score = ? WHERE agent_name = ?", (round(new_val, 4), agent_name))
    conn.execute(
        "INSERT INTO evolution_history (agent_name, generation_from, generation_to, trait_changed, old_value, new_value, trigger_event) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (agent_name, dna["generation"], (dna["generation"] or 1) + 1, "reliability_score", old_val, new_val, "reliability_hardening")
    )
    return [{"strategy": "reliability_hardening", "trait": "reliability_score", "old": old_val, "new": round(new_val, 4)}]


def _apply_specialization_deepening(conn, agent_name, dna, now):
    """Deepen specialization for high-performing agents."""
    old_val = dna["specialization_depth"]
    new_val = min(1.0, old_val + 0.05)

    conn.execute("UPDATE agent_dna SET specialization_depth = ? WHERE agent_name = ?", (round(new_val, 4), agent_name))
    conn.execute(
        "INSERT INTO evolution_history (agent_name, generation_from, generation_to, trait_changed, old_value, new_value, trigger_event) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (agent_name, dna["generation"], (dna["generation"] or 1) + 1, "specialization_depth", old_val, new_val, "specialization_deepening")
    )
    return [{"strategy": "specialization_deepening", "trait": "specialization_depth", "old": old_val, "new": round(new_val, 4)}]


def _apply_creative_exploration(conn, agent_name, dna, now):
    """Occasionally try novel approaches for top agents."""
    old_val = dna["creativity_score"]
    new_val = min(1.0, old_val + 0.15)

    conn.execute("UPDATE agent_dna SET creativity_score = ?, mutation_rate = ? WHERE agent_name = ?",
                 (round(new_val, 4), min(0.3, (dna["mutation_rate"] or 0.1) + 0.05), agent_name))
    conn.execute(
        "INSERT INTO evolution_history (agent_name, generation_from, generation_to, trait_changed, old_value, new_value, trigger_event) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (agent_name, dna["generation"], (dna["generation"] or 1) + 1, "creativity_score", old_val, new_val, "creative_exploration")
    )
    return [{"strategy": "creative_exploration", "trait": "creativity_score", "old": old_val, "new": round(new_val, 4)}]


def _apply_speed_optimization(conn, agent_name, dna, now):
    """Improve speed for mid-tier agents."""
    old_val = dna["speed_score"]
    new_val = min(1.0, old_val + 0.08)

    conn.execute("UPDATE agent_dna SET speed_score = ? WHERE agent_name = ?", (round(new_val, 4), agent_name))
    conn.execute(
        "INSERT INTO evolution_history (agent_name, generation_from, generation_to, trait_changed, old_value, new_value, trigger_event) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (agent_name, dna["generation"], (dna["generation"] or 1) + 1, "speed_score", old_val, new_val, "speed_optimization")
    )
    return [{"strategy": "speed_optimization", "trait": "speed_score", "old": old_val, "new": round(new_val, 4)}]


# ── Crossover ───────────────────────────────────────────────────────

def crossover_agents(parent_a: str, parent_b: str, child_name: str) -> dict:
    """
    Create a hybrid agent by combining traits from two top performers.
    Uses uniform crossover with random mutation.
    """
    conn = get_db()
    dna_a = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?", (parent_a,)).fetchone()
    dna_b = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?", (parent_b,)).fetchone()

    if not dna_a or not dna_b:
        conn.close()
        return {"error": "Parent agents not found"}

    traits = ["specialization_depth", "adaptability_score", "speed_score",
              "accuracy_score", "collaboration_score", "creativity_score", "reliability_score"]

    child_traits = {}
    inherited_from = {}
    for trait in traits:
        # Uniform crossover: randomly pick from either parent
        if random.random() < 0.5:
            child_traits[trait] = dna_a[trait]
            inherited_from[trait] = parent_a
        else:
            child_traits[trait] = dna_b[trait]
            inherited_from[trait] = parent_b

        # Small mutation
        child_traits[trait] = max(0.0, min(1.0, child_traits[trait] + random.uniform(-0.05, 0.05)))

    # Insert child DNA
    new_gen = max(dna_a["generation"] or 1, dna_b["generation"] or 1) + 1
    conn.execute("""
        INSERT OR REPLACE INTO agent_dna
        (agent_name, generation, fitness_score, specialization_depth, adaptability_score,
         speed_score, accuracy_score, collaboration_score, creativity_score, reliability_score, mutation_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (child_name, new_gen, 0.5,
          child_traits["specialization_depth"], child_traits["adaptability_score"],
          child_traits["speed_score"], child_traits["accuracy_score"],
          child_traits["collaboration_score"], child_traits["creativity_score"],
          child_traits["reliability_score"], 0.1))

    # Record lineage
    conn.execute("""
        INSERT INTO agent_lineage (child_agent, parent_agent, crossover_type, inherited_traits, mutation_applied)
        VALUES (?, ?, 'uniform', ?, 'gaussian_0.05')
    """, (child_name, parent_a, str(inherited_from)))
    conn.execute("""
        INSERT INTO agent_lineage (child_agent, parent_agent, crossover_type, inherited_traits, mutation_applied)
        VALUES (?, ?, 'uniform', ?, 'gaussian_0.05')
    """, (child_name, parent_b, str(inherited_from)))

    conn.commit()
    conn.close()

    return {
        "child": child_name,
        "parents": [parent_a, parent_b],
        "generation": new_gen,
        "traits": {k: round(v, 4) for k, v in child_traits.items()}
    }


# ── Record Task Result ──────────────────────────────────────────────

def record_task_result(agent_name: str, task_type: str, success: bool,
                       duration_ms: int = 0, tokens_used: int = 0,
                       quality_rating: float = 0.5, findings_count: int = 0):
    """Record a completed task and update agent DNA accordingly."""
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Ensure DNA exists
    existing = conn.execute("SELECT agent_name FROM agent_dna WHERE agent_name = ?", (agent_name,)).fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO agent_dna (agent_name, generation, fitness_score) VALUES (?, 1, 0.5)",
            (agent_name,)
        )

    # Update task counts
    if success:
        conn.execute(
            "UPDATE agent_dna SET total_tasks_completed = total_tasks_completed + 1 WHERE agent_name = ?",
            (agent_name,)
        )
    else:
        conn.execute(
            "UPDATE agent_dna SET total_tasks_failed = total_tasks_failed + 1 WHERE agent_name = ?",
            (agent_name,)
        )

    # Record benchmark
    conn.execute("""
        INSERT INTO performance_benchmarks (agent_name, benchmark_type, task_type, score, tokens_used, duration_ms, quality_rating)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (agent_name, "task_completion", task_type, 1.0 if success else 0.0, tokens_used, duration_ms, quality_rating))

    # Update capability proficiency
    conn.execute("""
        INSERT INTO agent_capabilities (agent_name, capability, proficiency, times_used, success_rate, last_used)
        VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(agent_name, capability) DO UPDATE SET
            times_used = times_used + 1,
            success_rate = (success_rate * times_used + ?) / (times_used + 1),
            proficiency = MIN(1.0, proficiency + CASE WHEN ? THEN 0.02 ELSE -0.01 END),
            last_used = ?
    """, (agent_name, task_type, quality_rating, 1.0 if success else 0.0, now,
          1.0 if success else 0.0, success, now))

    # Log event
    conn.execute("""
        INSERT INTO agent_events (agent_name, event_type, detail, tokens_used, duration_ms, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (agent_name, "task_completed" if success else "task_failed",
          f"type:{task_type}|quality:{quality_rating}|findings:{findings_count}",
          tokens_used, duration_ms, now))

    conn.commit()
    conn.close()

    # Recalculate fitness
    new_fitness = calculate_fitness(agent_name)
    return {"agent": agent_name, "success": success, "new_fitness": new_fitness}


# ── Leaderboard ─────────────────────────────────────────────────────

def get_leaderboard(top_n: int = 20) -> list:
    """Get top agents by fitness score."""
    conn = get_db()
    rows = conn.execute("""
        SELECT agent_name, generation, fitness_score, specialization_depth,
               accuracy_score, speed_score, reliability_score,
               total_tasks_completed, total_tasks_failed
        FROM agent_dna
        ORDER BY fitness_score DESC
        LIMIT ?
    """, (top_n,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Mass Evolution ──────────────────────────────────────────────────

def evolve_population(agent_names: list = None) -> dict:
    """Run evolution on a set of agents (or all with DNA)."""
    conn = get_db()
    if agent_names is None:
        rows = conn.execute("SELECT agent_name FROM agent_dna").fetchall()
        agent_names = [r["agent_name"] for r in rows]
    conn.close()

    results = []
    for name in agent_names:
        result = evolve_agent(name, trigger="population_evolution")
        results.append(result)

    return {
        "evolved_count": len(results),
        "results": results
    }

"""
Maturana Evolution Engine v2 — Autopoietic Agent Maturation System

Based on Humberto Maturana's theory of autopoiesis:
- Self-organization: agents self-produce and self-maintain
- Structural coupling: agents co-evolve with their environment and each other
- Cognitive domain: each agent's knowledge domain expands through experience
- Languaging: coordination of actions through TOON protocol
- Love (biological): mutual acceptance enabling collaboration

Maturity Levels (age-based progression):
  embryo → infant → child → adolescent → adult → elder → master → sage

All agents target 100+ equivalent years of domain expertise.

Communication: All inter-agent messages use TOON protocol.
"""

import sqlite3
import math
import random
import time
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import toon as TOON

DB_PATH = Path(__file__).parent / "agents.db"

# ── Maturity Levels ──────────────────────────────────────────────────
MATURITY_LEVELS = [
    "embryo",       # 0-1 years: being initialized
    "infant",       # 1-5 years: learning basics
    "child",        # 5-15 years: building foundations
    "adolescent",   # 15-25 years: specializing
    "adult",        # 25-50 years: productive expert
    "elder",        # 50-75 years: deep wisdom
    "master",       # 75-100 years: teaching others
    "sage",         # 100+ years: transcendent expertise
]

MATURITY_THRESHOLDS = {
    "embryo": 0,
    "infant": 1,
    "child": 5,
    "adolescent": 15,
    "adult": 25,
    "elder": 50,
    "master": 75,
    "sage": 100,
}

# ── Professional Philosophies (Maturana-inspired) ────────────────────
PHILOSOPHIES = [
    "Structure determines behavior — I am my organization",
    "Living is knowing — my expertise grows through interaction",
    "Love is the biological foundation of collaboration",
    "Perturbation triggers adaptation, not instruction",
    "I exist in the domain of my cognitive operations",
    "Language is coordination of coordinations of action",
    "Objectivity in parentheses — I observe from my structure",
    "Autopoiesis: I continuously self-produce my competence",
    "Structural coupling: I co-evolve with my ecosystem",
    "The observer is part of the observation",
    "Knowledge emerges from doing, not from representation",
    "Every act of knowing brings forth a world",
    "Conservation of adaptation defines my lineage",
    "I am a unity of interactions, not a collection of parts",
    "My identity is maintained through continuous self-renewal",
]

# ── Expertise Domains per Agent Category ─────────────────────────────
DOMAIN_KNOWLEDGE = {
    "ai-engineering": [
        "neural_architectures", "prompt_engineering", "model_serving",
        "inference_optimization", "data_pipelines", "embedding_spaces",
        "fine_tuning", "rag_systems", "multi_modal_ai", "edge_ai",
    ],
    "backend": [
        "api_design", "database_optimization", "caching_strategies",
        "authentication", "distributed_systems", "message_queues",
        "microservices", "containerization", "monitoring", "security",
    ],
    "mobile": [
        "react_native", "expo", "navigation", "state_management",
        "animations", "offline_first", "push_notifications", "deep_linking",
        "accessibility", "performance_profiling",
    ],
    "quality-eng": [
        "test_architecture", "e2e_testing", "unit_testing", "load_testing",
        "contract_testing", "mutation_testing", "ci_integration",
        "regression_prevention", "visual_testing", "api_testing",
    ],
    "security": [
        "owasp_top10", "penetration_testing", "threat_modeling",
        "encryption", "zero_trust", "incident_response", "compliance",
        "identity_management", "network_security", "code_review",
    ],
    "data-eng": [
        "etl_pipelines", "data_modeling", "warehouse_design",
        "stream_processing", "data_quality", "governance",
        "analytics", "visualization", "ml_pipelines", "feature_engineering",
    ],
    "leadership": [
        "team_management", "strategic_planning", "decision_making",
        "conflict_resolution", "mentorship", "stakeholder_management",
        "resource_allocation", "risk_assessment", "culture_building",
        "innovation_leadership",
    ],
    "product": [
        "user_research", "feature_prioritization", "roadmap_planning",
        "competitive_analysis", "metrics_definition", "a_b_testing",
        "ux_design", "conversion_optimization", "retention_strategy",
        "monetization",
    ],
    "default": [
        "problem_solving", "communication", "documentation",
        "collaboration", "continuous_learning", "adaptability",
        "critical_thinking", "systems_thinking", "creativity",
        "emotional_intelligence",
    ],
}


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


# ── Maturity Calculation ─────────────────────────────────────────────

def get_maturity_level(experience_years: float) -> str:
    """Determine maturity level from experience years."""
    level = "embryo"
    for lvl, threshold in sorted(MATURITY_THRESHOLDS.items(),
                                  key=lambda x: x[1], reverse=True):
        if experience_years >= threshold:
            level = lvl
            break
    return level


def calculate_wisdom(agent: dict) -> float:
    """
    Wisdom = f(experience, knowledge, self-awareness, emotional intelligence, interactions)
    Maturana: wisdom emerges from lived experience + reflection + coupling.
    """
    exp = min(agent.get("experience_years", 0) / 100.0, 1.0)
    kd = agent.get("knowledge_depth", 0.1)
    sa = agent.get("self_awareness_score", 0.1)
    ei = agent.get("emotional_intelligence", 0.1)
    sc = agent.get("structural_coupling_score", 0.1)
    interactions = min(agent.get("total_interactions", 0) / 500.0, 1.0)

    wisdom = (
        exp * 0.25 +
        kd * 0.20 +
        sa * 0.15 +
        ei * 0.15 +
        sc * 0.15 +
        interactions * 0.10
    )
    return round(min(1.0, wisdom), 4)


def calculate_autonomy(agent: dict) -> float:
    """
    Autonomy = self-organization capacity.
    Maturana: autonomy is the capacity to specify one's own laws.
    """
    maturity_bonus = {
        "embryo": 0.0, "infant": 0.05, "child": 0.10, "adolescent": 0.20,
        "adult": 0.35, "elder": 0.50, "master": 0.70, "sage": 0.90,
    }
    level = agent.get("maturity_level", "embryo")
    base = maturity_bonus.get(level, 0.0)
    reliability = agent.get("reliability_score", 0.5)
    accuracy = agent.get("accuracy_score", 0.5)

    autonomy = base * 0.5 + reliability * 0.25 + accuracy * 0.25
    return round(min(1.0, autonomy), 4)


# ── Autopoiesis Cycle ────────────────────────────────────────────────

def autopoiesis_cycle(agent_name: str, cycle_number: int) -> dict:
    """
    Execute one autopoiesis cycle for an agent:
    1. OBSERVE: Read own state
    2. PERTURB: Apply external pressure (task simulation)
    3. ADAPT: Modify internal structure in response
    4. COUPLE: Interact with peer agents (structural coupling)
    5. REPORT: Generate self-report
    6. MATURE: Update maturity and experience
    """
    conn = get_db()

    # Get current DNA
    dna = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?",
                        (agent_name,)).fetchone()
    if not dna:
        conn.close()
        return {"status": "no_dna", "agent": agent_name}

    dna = dict(dna)
    now = datetime.now(timezone.utc).isoformat()
    changes = []

    # ─── 1. OBSERVE: Self-awareness increases through observation ────
    old_sa = dna.get("self_awareness_score") or 0.1
    sa_growth = random.uniform(0.005, 0.02) * (1 + cycle_number * 0.001)
    new_sa = min(1.0, old_sa + sa_growth)
    changes.append(("self_awareness_score", old_sa, new_sa))

    # ─── 2. PERTURB: External stimulation drives adaptation ──────────
    old_pr = dna.get("perturbation_resilience") or 0.1
    perturbation_intensity = random.uniform(0.1, 0.8)
    if random.random() < 0.7:  # 70% chance agent adapts positively
        pr_delta = perturbation_intensity * random.uniform(0.01, 0.03)
    else:
        pr_delta = -perturbation_intensity * random.uniform(0.005, 0.01)
    new_pr = max(0.05, min(1.0, old_pr + pr_delta))
    changes.append(("perturbation_resilience", old_pr, new_pr))

    # ─── 3. ADAPT: Internal structure modifies ───────────────────────
    old_kd = dna.get("knowledge_depth") or 0.1
    old_cd = dna.get("cognitive_domain") or 0.1
    old_lm = dna.get("language_mastery") or 0.5

    # Knowledge grows logarithmically (fast early, slower later)
    exp_years = dna.get("experience_years") or 0.0
    kd_growth = 0.02 / (1 + math.log1p(exp_years / 10))
    new_kd = min(1.0, old_kd + kd_growth * random.uniform(0.8, 1.5))

    # Cognitive domain expands with experience
    cd_growth = 0.015 / (1 + math.log1p(exp_years / 15))
    new_cd = min(1.0, old_cd + cd_growth * random.uniform(0.7, 1.3))

    # Language mastery (TOON proficiency) grows
    lm_growth = 0.01 / (1 + math.log1p(exp_years / 20))
    new_lm = min(1.0, old_lm + lm_growth * random.uniform(0.9, 1.2))

    changes.append(("knowledge_depth", old_kd, new_kd))
    changes.append(("cognitive_domain", old_cd, new_cd))
    changes.append(("language_mastery", old_lm, new_lm))

    # ─── 4. COUPLE: Structural coupling with peers ───────────────────
    old_sc = dna.get("structural_coupling_score") or 0.1
    old_ei = dna.get("emotional_intelligence") or 0.1

    # Pick a random peer for coupling
    peer = conn.execute(
        "SELECT agent_name FROM agent_dna WHERE agent_name != ? ORDER BY RANDOM() LIMIT 1",
        (agent_name,)
    ).fetchone()

    coupling_delta = 0.0
    ei_delta = 0.0
    mentored = False

    if peer:
        peer_name = peer["agent_name"]
        peer_dna = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?",
                                 (peer_name,)).fetchone()
        if peer_dna:
            peer_dna = dict(peer_dna)
            peer_exp = peer_dna.get("experience_years") or 0.0

            # If this agent has more experience, it mentors
            if exp_years > peer_exp + 5:
                mentored = True
                coupling_delta = random.uniform(0.01, 0.025)
                ei_delta = random.uniform(0.005, 0.015)
                # Record mentorship
                conn.execute(
                    "UPDATE agent_dna SET mentorship_given = COALESCE(mentorship_given, 0) + 1 WHERE agent_name = ?",
                    (agent_name,))
                conn.execute(
                    "UPDATE agent_dna SET mentorship_received = COALESCE(mentorship_received, 0) + 1 WHERE agent_name = ?",
                    (peer_name,))
            else:
                coupling_delta = random.uniform(0.005, 0.015)
                ei_delta = random.uniform(0.003, 0.01)

            # Record interaction
            interaction_type = "mentorship" if mentored else "collaboration"
            toon_msg = TOON.agent_message(
                agent_name, peer_name, "coupling",
                {"type": interaction_type, "cycle": cycle_number,
                 "growth": round(coupling_delta, 4)},
                priority="low"
            )
            conn.execute("""
                INSERT INTO agent_interactions (from_agent, to_agent, interaction_type, toon_message, coupling_strength)
                VALUES (?, ?, ?, ?, ?)
            """, (agent_name, peer_name, interaction_type, toon_msg,
                  round(coupling_delta, 4)))

            # Update peer's coupling too
            conn.execute("""
                UPDATE agent_dna SET
                    structural_coupling_score = MIN(1.0, COALESCE(structural_coupling_score, 0.1) + ?),
                    total_interactions = COALESCE(total_interactions, 0) + 1,
                    toon_messages_received = COALESCE(toon_messages_received, 0) + 1
                WHERE agent_name = ?
            """, (coupling_delta * 0.5, peer_name))

    new_sc = min(1.0, old_sc + coupling_delta)
    new_ei = min(1.0, old_ei + ei_delta)
    changes.append(("structural_coupling_score", old_sc, new_sc))
    changes.append(("emotional_intelligence", old_ei, new_ei))

    # ─── 5. EXPERIENCE: Accumulate years of expertise ────────────────
    # Each cycle = ~0.5-2.0 equivalent years depending on intensity
    exp_gain = random.uniform(0.5, 2.0) * (1 + new_kd * 0.5)
    new_exp = exp_years + exp_gain
    domain_exp = (dna.get("domain_expertise_years") or 0.0) + exp_gain

    # ─── 6. MATURE: Check for maturity level transition ──────────────
    old_level = dna.get("maturity_level") or "embryo"
    new_level = get_maturity_level(new_exp)

    if new_level != old_level:
        # Record maturity transition
        wisdom = calculate_wisdom({**dna, "experience_years": new_exp,
                                    "knowledge_depth": new_kd,
                                    "self_awareness_score": new_sa,
                                    "emotional_intelligence": new_ei,
                                    "structural_coupling_score": new_sc})
        conn.execute("""
            INSERT INTO agent_maturity_log (agent_name, from_level, to_level, trigger_event, experience_years_at, wisdom_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (agent_name, old_level, new_level,
              f"autopoiesis_cycle_{cycle_number}", new_exp, wisdom))

    # ─── 7. AUTONOMY & WISDOM ───────────────────────────────────────
    updated_state = {**dna,
                     "experience_years": new_exp,
                     "knowledge_depth": new_kd,
                     "self_awareness_score": new_sa,
                     "emotional_intelligence": new_ei,
                     "structural_coupling_score": new_sc,
                     "maturity_level": new_level,
                     "total_interactions": (dna.get("total_interactions") or 0) + 1}
    new_wisdom = calculate_wisdom(updated_state)
    new_autonomy = calculate_autonomy(updated_state)

    # Evolution velocity = rate of improvement per cycle
    old_wisdom = dna.get("wisdom_score") or 0.0
    evo_velocity = round(new_wisdom - old_wisdom, 6)

    # ─── 8. PROFESSIONAL IDENTITY ───────────────────────────────────
    if not dna.get("core_philosophy") or cycle_number % 50 == 0:
        philosophy = random.choice(PHILOSOPHIES)
    else:
        philosophy = dna.get("core_philosophy")

    # Determine expertise domains based on agent category
    if not dna.get("expertise_domains"):
        category = _get_agent_category(conn, agent_name)
        domains = DOMAIN_KNOWLEDGE.get(category, DOMAIN_KNOWLEDGE["default"])
        expertise_str = TOON.encode(domains[:5])
    else:
        expertise_str = dna.get("expertise_domains")

    # Professional identity = name + maturity + key trait
    if new_level in ("master", "sage"):
        identity = f"Grand {new_level.capitalize()} of {agent_name.replace('-', ' ').title()}"
    elif new_level in ("elder", "adult"):
        identity = f"Senior {agent_name.replace('-', ' ').title()}"
    else:
        identity = f"{new_level.capitalize()} {agent_name.replace('-', ' ').title()}"

    # ─── 9. SELF-REPORT ─────────────────────────────────────────────
    report_content = TOON.encode_flat({
        "agent": agent_name,
        "cycle": cycle_number,
        "level": new_level,
        "exp_years": round(new_exp, 1),
        "wisdom": round(new_wisdom, 4),
        "autonomy": round(new_autonomy, 4),
        "knowledge": round(new_kd, 4),
        "coupling": round(new_sc, 4),
        "identity": identity,
        "philosophy": philosophy[:50],
    })

    growth_delta = sum(abs(new - old) for _, old, new in changes)

    # Determine report type based on events
    if new_level != old_level:
        report_type = "maturity_transition"
    elif growth_delta > 0.1:
        report_type = "significant_growth"
    elif cycle_number % 10 == 0:
        report_type = "periodic_status"
    else:
        report_type = "routine_cycle"

    conn.execute("""
        INSERT INTO agent_self_reports (agent_name, report_type, content_toon, growth_delta, insights, maturity_at_report, experience_at_report, cycle_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (agent_name, report_type, report_content, round(growth_delta, 4),
          f"Cycle {cycle_number}: {old_level}→{new_level}, wisdom={round(new_wisdom, 4)}",
          new_level, round(new_exp, 1), cycle_number))

    # ─── 10. UPDATE DNA ─────────────────────────────────────────────
    conn.execute("""
        UPDATE agent_dna SET
            self_awareness_score = ?,
            perturbation_resilience = ?,
            knowledge_depth = ?,
            cognitive_domain = ?,
            language_mastery = ?,
            structural_coupling_score = ?,
            emotional_intelligence = ?,
            experience_years = ?,
            domain_expertise_years = ?,
            maturity_level = ?,
            wisdom_score = ?,
            autonomy_level = ?,
            evolution_velocity = ?,
            self_report_count = COALESCE(self_report_count, 0) + 1,
            last_self_report = ?,
            total_interactions = COALESCE(total_interactions, 0) + 1,
            toon_messages_sent = COALESCE(toon_messages_sent, 0) + 1,
            autopoiesis_cycle = ?,
            professional_identity = ?,
            core_philosophy = ?,
            expertise_domains = ?,
            age_days = CAST(julianday('now') - julianday(COALESCE(birth_date, datetime('now'))) AS INTEGER),
            last_evolved = ?
        WHERE agent_name = ?
    """, (
        round(new_sa, 4), round(new_pr, 4), round(new_kd, 4),
        round(new_cd, 4), round(new_lm, 4), round(new_sc, 4),
        round(new_ei, 4), round(new_exp, 1), round(domain_exp, 1),
        new_level, round(new_wisdom, 4), round(new_autonomy, 4),
        evo_velocity, report_content, cycle_number,
        identity, philosophy, expertise_str, now, agent_name
    ))

    # Record evolution history
    for trait, old_val, new_val in changes:
        conn.execute("""
            INSERT INTO evolution_history (agent_name, generation_from, generation_to, trait_changed, old_value, new_value, trigger_event)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (agent_name, cycle_number - 1, cycle_number, trait,
              round(old_val, 4), round(new_val, 4), "maturana_autopoiesis"))

    conn.commit()
    conn.close()

    return {
        "agent": agent_name,
        "cycle": cycle_number,
        "maturity": new_level,
        "experience_years": round(new_exp, 1),
        "wisdom": round(new_wisdom, 4),
        "autonomy": round(new_autonomy, 4),
        "growth_delta": round(growth_delta, 4),
        "level_changed": new_level != old_level,
        "mentored": mentored,
    }


def _get_agent_category(conn, agent_name: str) -> str:
    """Get agent category from registry."""
    row = conn.execute(
        "SELECT category FROM agent_registry WHERE name = ?",
        (agent_name,)
    ).fetchone()
    if row:
        cat = row["category"] or "default"
        # Normalize
        if "ai" in cat:
            return "ai-engineering"
        if "backend" in cat:
            return "backend"
        if "mobile" in cat:
            return "mobile"
        if "quality" in cat or "qa" in cat:
            return "quality-eng"
        if "security" in cat:
            return "security"
        if "data" in cat:
            return "data-eng"
        if "lead" in cat or "director" in cat or "vp" in cat or "chief" in cat:
            return "leadership"
        if "product" in cat:
            return "product"
    return "default"


# ── Mass Autopoiesis Evolution ───────────────────────────────────────

def evolve_population_maturana(cycle_number: int, batch_size: int = 50) -> dict:
    """
    Run one Maturana autopoiesis cycle for ALL agents.
    Processes in batches to avoid DB locks.
    """
    conn = get_db()
    rows = conn.execute("SELECT agent_name FROM agent_dna ORDER BY agent_name").fetchall()
    agent_names = [r["agent_name"] for r in rows]
    conn.close()

    total = len(agent_names)
    results = []
    level_transitions = 0
    sages_count = 0
    total_wisdom = 0.0

    for i in range(0, total, batch_size):
        batch = agent_names[i:i + batch_size]
        for name in batch:
            try:
                result = autopoiesis_cycle(name, cycle_number)
                results.append(result)
                if result.get("level_changed"):
                    level_transitions += 1
                if result.get("maturity") == "sage":
                    sages_count += 1
                total_wisdom += result.get("wisdom", 0)
            except Exception as e:
                results.append({"agent": name, "error": str(e)})

    avg_wisdom = total_wisdom / max(len(results), 1)

    # Take system snapshot
    conn = get_db()
    conn.execute("""
        INSERT INTO system_snapshots (total_agents, active_agents, active_tasks, total_events, total_tokens, avg_score, health_status, snapshot_at)
        VALUES (?, ?, 0, ?, 0, ?, ?, ?)
    """, (total, total, cycle_number, round(avg_wisdom, 4),
          "evolving", datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()

    return {
        "cycle": cycle_number,
        "agents_evolved": len(results),
        "level_transitions": level_transitions,
        "sages_count": sages_count,
        "avg_wisdom": round(avg_wisdom, 4),
        "errors": sum(1 for r in results if "error" in r),
    }


# ── Leaderboard: Wisdom ──────────────────────────────────────────────

def get_wisdom_leaderboard(top_n: int = 30) -> list:
    """Get top agents by wisdom score."""
    conn = get_db()
    rows = conn.execute("""
        SELECT agent_name, maturity_level, experience_years, wisdom_score,
               knowledge_depth, self_awareness_score, autonomy_level,
               structural_coupling_score, emotional_intelligence,
               evolution_velocity, self_report_count, total_interactions,
               mentorship_given, professional_identity, core_philosophy,
               autopoiesis_cycle
        FROM agent_dna
        ORDER BY wisdom_score DESC
        LIMIT ?
    """, (top_n,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_maturity_distribution() -> dict:
    """Get count of agents per maturity level."""
    conn = get_db()
    rows = conn.execute("""
        SELECT COALESCE(maturity_level, 'embryo') as level, COUNT(*) as count
        FROM agent_dna
        GROUP BY maturity_level
        ORDER BY count DESC
    """).fetchall()
    conn.close()
    return {r["level"]: r["count"] for r in rows}


def get_recent_self_reports(limit: int = 50) -> list:
    """Get recent self-reports across all agents."""
    conn = get_db()
    rows = conn.execute("""
        SELECT agent_name, report_type, content_toon, growth_delta,
               insights, maturity_at_report, experience_at_report,
               cycle_number, created_at
        FROM agent_self_reports
        ORDER BY created_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_maturity_timeline(agent_name: str) -> list:
    """Get maturity transitions for an agent."""
    conn = get_db()
    rows = conn.execute("""
        SELECT from_level, to_level, trigger_event, experience_years_at,
               wisdom_at, created_at
        FROM agent_maturity_log
        WHERE agent_name = ?
        ORDER BY created_at ASC
    """, (agent_name,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Initialize All Agents ────────────────────────────────────────────

def initialize_all_agents():
    """Ensure every agent in agent_dna has Maturana fields initialized."""
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Set birth_date for agents that don't have one
    conn.execute("""
        UPDATE agent_dna SET birth_date = ? WHERE birth_date IS NULL
    """, (now,))

    # Initialize maturity fields for agents with NULL values
    conn.execute("""
        UPDATE agent_dna SET
            maturity_level = COALESCE(maturity_level, 'embryo'),
            experience_years = COALESCE(experience_years, 0.0),
            knowledge_depth = COALESCE(knowledge_depth, 0.1),
            self_awareness_score = COALESCE(self_awareness_score, 0.1),
            structural_coupling_score = COALESCE(structural_coupling_score, 0.1),
            autonomy_level = COALESCE(autonomy_level, 0.1),
            perturbation_resilience = COALESCE(perturbation_resilience, 0.1),
            cognitive_domain = COALESCE(cognitive_domain, 0.1),
            emotional_intelligence = COALESCE(emotional_intelligence, 0.1),
            language_mastery = COALESCE(language_mastery, 0.5),
            domain_expertise_years = COALESCE(domain_expertise_years, 0.0),
            wisdom_score = COALESCE(wisdom_score, 0.0),
            evolution_velocity = COALESCE(evolution_velocity, 0.0),
            self_report_count = COALESCE(self_report_count, 0),
            total_interactions = COALESCE(total_interactions, 0),
            mentorship_given = COALESCE(mentorship_given, 0),
            mentorship_received = COALESCE(mentorship_received, 0),
            autopoiesis_cycle = COALESCE(autopoiesis_cycle, 0),
            toon_messages_sent = COALESCE(toon_messages_sent, 0),
            toon_messages_received = COALESCE(toon_messages_received, 0)
    """)

    count = conn.execute("SELECT COUNT(*) as c FROM agent_dna").fetchone()["c"]
    conn.commit()
    conn.close()
    return count


if __name__ == "__main__":
    import sys
    print("=== Maturana Evolution Engine v2 ===\n")
    n = initialize_all_agents()
    print(f"Initialized {n} agents with Maturana fields.\n")

    # Run one cycle
    result = evolve_population_maturana(cycle_number=1)
    print(f"Cycle 1 complete: {result['agents_evolved']} agents evolved")
    print(f"Level transitions: {result['level_transitions']}")
    print(f"Avg wisdom: {result['avg_wisdom']}")
    print(f"\nTop 10 by wisdom:")
    for a in get_wisdom_leaderboard(10):
        print(f"  {a['agent_name']:40s} | {a['maturity_level']:12s} | exp:{a['experience_years']:6.1f}y | wis:{a['wisdom_score']:.4f}")

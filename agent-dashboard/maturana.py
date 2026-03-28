"""
Maturana Evolution Engine — Autopoietic Agent Genesis
======================================================

Based on Humberto Maturana's theory of autopoiesis and cognitive biology:

1. AUTOPOIESIS: Agents self-create and self-maintain their organization
   - Each agent has an internal "organization" (invariant identity)
   - And a "structure" (variable implementation that can change)

2. STRUCTURAL COUPLING: Agents co-evolve with their environment
   - Agents adapt through recurrent interactions
   - The environment triggers changes but does NOT determine them

3. COGNITIVE DOMAINS: Every agent is a cognitive system
   - "Living is knowing" — every agent knows its domain
   - Knowledge emerges from the agent's history of interactions

4. CONSENSUAL DOMAINS: Shared interaction spaces
   - Agents that interact repeatedly create shared meaning
   - Teams are consensual domains where coordination emerges

5. ORGANIZATIONAL CLOSURE: Agents maintain their own identity
   - Changes in structure preserve the organization
   - An agent can evolve without losing its essence

6. LANGUAGING: Coordination of coordinations
   - Agents communicate through TOON protocol
   - Higher-order agents coordinate the coordinators

7. LOVE (Maturana's definition): Legitimate coexistence
   - Agents accept each other's existence as legitimate
   - Competition is replaced by collaborative emergence

This engine generates agents through autopoietic principles,
not just random mutation. Each agent emerges from the system's
need to maintain itself (organizational closure) while adapting
to perturbations (structural coupling).
"""

import sqlite3
import random
import hashlib
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "agents.db"

# ══════════════════════════════════════════════════════════════
# MATURANA ONTOLOGY — The 7 Autopoietic Layers
# ══════════════════════════════════════════════════════════════

AUTOPOIETIC_LAYERS = {
    "L0_autopoiesis": {
        "name": "Autopoiesis Core",
        "description": "Self-creating, self-maintaining agents that define the system's identity",
        "maturana_principle": "The organization of the living is circular — it produces itself",
        "color": "#FF0040",
    },
    "L1_structural_coupling": {
        "name": "Structural Coupling",
        "description": "Agents that adapt through recurrent interactions with the environment",
        "maturana_principle": "Structure changes are triggered but not determined by the environment",
        "color": "#FF6B00",
    },
    "L2_cognitive_domain": {
        "name": "Cognitive Domain",
        "description": "Agents that embody knowledge through their history of interactions",
        "maturana_principle": "Living is knowing — every cognitive act brings forth a world",
        "color": "#FFD500",
    },
    "L3_consensual_domain": {
        "name": "Consensual Domain",
        "description": "Agents that create shared meaning through repeated interaction",
        "maturana_principle": "Language arises as coordination of coordinations of behavior",
        "color": "#00FF88",
    },
    "L4_organizational_closure": {
        "name": "Organizational Closure",
        "description": "Agents that maintain identity while allowing structural change",
        "maturana_principle": "Organization is invariant — structure is the variable realization",
        "color": "#0088FF",
    },
    "L5_languaging": {
        "name": "Languaging",
        "description": "Meta-agents that coordinate the coordinators — higher-order cognition",
        "maturana_principle": "Languaging is the dance of recursive coordination",
        "color": "#8800FF",
    },
    "L6_love": {
        "name": "Love (Legitimate Coexistence)",
        "description": "Agents that enable the acceptance of others as legitimate — the substrate of collaboration",
        "maturana_principle": "Love is the domain of those relational behaviors that constitute the other as legitimate",
        "color": "#FF00FF",
    },
}

# ══════════════════════════════════════════════════════════════
# AUTOPOIETIC DOMAINS — 40 domains that self-organize
# ══════════════════════════════════════════════════════════════

DOMAINS = {
    # L0 — Autopoiesis Core (self-creation)
    "genesis": ("L0_autopoiesis", "Agent creation and self-organization"),
    "metabolism": ("L0_autopoiesis", "Resource processing and energy management"),
    "membrane": ("L0_autopoiesis", "Boundary definition and identity protection"),
    "homeostasis": ("L0_autopoiesis", "Internal balance and self-regulation"),
    "reproduction": ("L0_autopoiesis", "Agent replication and variation"),

    # L1 — Structural Coupling (environment adaptation)
    "perception": ("L1_structural_coupling", "Environmental sensing and signal detection"),
    "adaptation": ("L1_structural_coupling", "Structural modification through interaction"),
    "perturbation": ("L1_structural_coupling", "Response to environmental disturbances"),
    "niche_construction": ("L1_structural_coupling", "Active modification of the environment"),
    "symbiosis": ("L1_structural_coupling", "Mutualistic relationships between agents"),
    "resilience": ("L1_structural_coupling", "Recovery from structural perturbations"),

    # L2 — Cognitive Domain (knowledge embodiment)
    "pattern_recognition": ("L2_cognitive_domain", "Detecting regularities in data streams"),
    "categorization": ("L2_cognitive_domain", "Classifying experiences into meaningful groups"),
    "prediction": ("L2_cognitive_domain", "Anticipating future states from patterns"),
    "memory": ("L2_cognitive_domain", "Storing and retrieving interaction histories"),
    "learning": ("L2_cognitive_domain", "Modifying behavior based on experience"),
    "inference": ("L2_cognitive_domain", "Drawing conclusions from incomplete information"),
    "creativity": ("L2_cognitive_domain", "Generating novel combinations and solutions"),

    # L3 — Consensual Domain (shared meaning)
    "communication": ("L3_consensual_domain", "Encoding and transmitting information between agents"),
    "negotiation": ("L3_consensual_domain", "Reaching agreements through interaction"),
    "trust": ("L3_consensual_domain", "Building reliable interaction histories"),
    "culture": ("L3_consensual_domain", "Shared norms and practices that emerge from interaction"),
    "ritual": ("L3_consensual_domain", "Repeated interaction patterns that create stability"),
    "empathy": ("L3_consensual_domain", "Modeling other agents' internal states"),

    # L4 — Organizational Closure (identity preservation)
    "identity": ("L4_organizational_closure", "Maintaining core organization through change"),
    "boundary": ("L4_organizational_closure", "Defining self/non-self distinctions"),
    "coherence": ("L4_organizational_closure", "Ensuring internal consistency"),
    "autonomy": ("L4_organizational_closure", "Self-governance and independent operation"),
    "integrity": ("L4_organizational_closure", "Protecting organizational invariants"),
    "metamorphosis": ("L4_organizational_closure", "Radical structural change while preserving identity"),

    # L5 — Languaging (meta-coordination)
    "orchestration": ("L5_languaging", "Coordinating multiple agents' behaviors"),
    "reflection": ("L5_languaging", "Self-observation and meta-cognition"),
    "narration": ("L5_languaging", "Constructing coherent stories from events"),
    "abstraction": ("L5_languaging", "Creating higher-order representations"),
    "synthesis": ("L5_languaging", "Combining diverse elements into unified wholes"),
    "translation": ("L5_languaging", "Converting between different representational systems"),

    # L6 — Love (legitimate coexistence)
    "acceptance": ("L6_love", "Recognizing others as legitimate participants"),
    "care": ("L6_love", "Attending to the wellbeing of other agents"),
    "coexistence": ("L6_love", "Enabling multiple agents to thrive simultaneously"),
    "emergence": ("L6_love", "Allowing new properties to arise from collective interaction"),
    "wisdom": ("L6_love", "Integrating knowledge with ethical awareness"),
}

# ══════════════════════════════════════════════════════════════
# AGENT TAXONOMY — Specializations within each domain
# ══════════════════════════════════════════════════════════════

def _generate_specializations():
    """Generate the full taxonomy of 3,700+ agent specializations."""
    specs = []

    # Each domain generates multiple specializations via autopoietic principles
    domain_specs = {
        # L0 — Autopoiesis Core
        "genesis": [
            "agent-embryo-generator", "bootstrap-initializer", "self-assembly-engine",
            "template-instantiator", "phenotype-expresser", "genome-compiler",
            "identity-crystallizer", "capability-seed-planter", "trait-inheritor",
            "mutation-injector", "variation-creator", "novelty-generator",
            "spontaneous-order-catalyst", "self-organization-driver",
        ],
        "metabolism": [
            "token-metabolizer", "context-digester", "prompt-nutrient-extractor",
            "information-enzyme", "energy-budget-optimizer", "resource-allocator",
            "waste-recycler", "efficiency-catalyst", "throughput-maximizer",
            "cost-energy-balancer", "metabolic-pathway-optimizer",
            "anabolic-builder", "catabolic-decomposer",
        ],
        "membrane": [
            "scope-boundary-guard", "permission-membrane", "context-filter",
            "noise-barrier", "signal-gate", "access-controller",
            "information-osmosis-agent", "selective-permeability-engine",
            "boundary-integrity-monitor", "external-interface-adapter",
            "internal-state-protector", "firewall-membrane",
        ],
        "homeostasis": [
            "balance-regulator", "drift-corrector", "setpoint-maintainer",
            "feedback-loop-controller", "oscillation-damper", "stability-monitor",
            "threshold-guardian", "equilibrium-seeker", "variance-minimizer",
            "adaptive-thermostat", "load-balancer-organic",
            "stress-response-regulator",
        ],
        "reproduction": [
            "clone-factory", "crossover-engine", "mutation-factory",
            "fitness-selector", "offspring-validator", "generation-counter",
            "lineage-tracker", "genetic-diversity-monitor",
            "population-size-regulator", "sexual-recombinator",
            "asexual-replicator", "horizontal-transfer-agent",
        ],

        # L1 — Structural Coupling
        "perception": [
            "signal-detector", "noise-filter", "pattern-sensor",
            "anomaly-spotter", "trend-perceiver", "context-reader",
            "intention-detector", "sentiment-sensor", "urgency-detector",
            "quality-sensor", "completeness-assessor", "relevance-scorer",
            "salience-detector", "change-detector",
        ],
        "adaptation": [
            "strategy-adjuster", "parameter-tuner", "behavior-modifier",
            "response-calibrator", "threshold-adapter", "learning-rate-controller",
            "exploration-exploitation-balancer", "plasticity-manager",
            "structural-plasticity-agent", "functional-plasticity-agent",
            "developmental-plasticity-agent", "phenotypic-plasticity-agent",
        ],
        "perturbation": [
            "shock-absorber", "disruption-handler", "chaos-navigator",
            "uncertainty-processor", "ambiguity-resolver", "contradiction-handler",
            "paradox-embracer", "complexity-reducer", "entropy-manager",
            "turbulence-surfer", "crisis-responder", "recovery-initiator",
        ],
        "niche_construction": [
            "environment-modifier", "tool-builder", "infrastructure-creator",
            "scaffold-erector", "platform-builder", "ecosystem-shaper",
            "habitat-optimizer", "resource-enricher", "pathway-creator",
            "opportunity-creator", "affordance-designer",
        ],
        "symbiosis": [
            "mutualism-facilitator", "commensalism-enabler", "cooperation-broker",
            "synergy-detector", "complementarity-matcher", "resource-sharing-agent",
            "skill-exchange-broker", "knowledge-pollinator",
            "cross-team-bridge", "interdependency-mapper",
            "symbiotic-pairing-engine",
        ],
        "resilience": [
            "fault-tolerance-agent", "graceful-degradation-engine",
            "anti-fragility-builder", "redundancy-manager",
            "recovery-pathway-designer", "backup-consciousness",
            "failover-orchestrator", "healing-factor-agent",
            "damage-assessment-agent", "reconstruction-planner",
            "resilience-score-calculator",
        ],

        # L2 — Cognitive Domain
        "pattern_recognition": [
            "sequence-detector", "correlation-finder", "cycle-identifier",
            "fractal-recognizer", "symmetry-detector", "anomaly-classifier",
            "trend-extractor", "periodicity-detector", "cluster-discoverer",
            "motif-finder", "template-matcher", "prototype-identifier",
            "gestalt-perceiver", "invariance-detector",
        ],
        "categorization": [
            "taxonomy-builder", "ontology-constructor", "concept-former",
            "prototype-assigner", "exemplar-matcher", "boundary-drawer",
            "hierarchy-organizer", "facet-classifier", "multi-label-tagger",
            "fuzzy-categorizer", "dynamic-categorizer",
        ],
        "prediction": [
            "time-series-prophet", "trajectory-forecaster", "probability-estimator",
            "scenario-generator", "risk-predictor", "outcome-simulator",
            "trend-projector", "regression-modeler", "causal-predictor",
            "ensemble-forecaster", "confidence-calibrator",
            "prediction-market-agent",
        ],
        "memory": [
            "episodic-memory-store", "semantic-memory-index", "procedural-memory-vault",
            "working-memory-buffer", "long-term-consolidator", "retrieval-engine",
            "forgetting-curve-manager", "memory-palace-architect",
            "associative-memory-linker", "context-dependent-retriever",
            "emotional-memory-tagger", "spatial-memory-mapper",
        ],
        "learning": [
            "supervised-learner", "unsupervised-discoverer", "reinforcement-explorer",
            "transfer-learner", "meta-learner", "curriculum-designer",
            "few-shot-generalizer", "zero-shot-reasoner",
            "continual-learner", "multi-task-learner",
            "active-learner", "self-supervised-learner",
        ],
        "inference": [
            "deductive-reasoner", "inductive-generalizer", "abductive-hypothesizer",
            "analogical-mapper", "causal-reasoner", "counterfactual-thinker",
            "probabilistic-inferrer", "logical-prover",
            "default-reasoner", "non-monotonic-reasoner",
            "fuzzy-logic-engine", "bayesian-updater",
        ],
        "creativity": [
            "divergent-thinker", "combinatorial-creator", "metaphor-generator",
            "serendipity-engine", "constraint-relaxer", "bisociation-agent",
            "lateral-thinker", "random-stimulus-injector",
            "conceptual-blender", "morphological-analyzer",
            "provocative-operator", "idea-mutator",
        ],

        # L3 — Consensual Domain
        "communication": [
            "message-encoder", "message-decoder", "channel-selector",
            "bandwidth-optimizer", "noise-compensator", "protocol-adapter",
            "broadcast-agent", "unicast-agent", "multicast-agent",
            "compression-agent", "encryption-agent", "integrity-verifier",
            "acknowledgment-handler",
        ],
        "negotiation": [
            "bid-evaluator", "offer-generator", "concession-calculator",
            "pareto-finder", "nash-equilibrium-seeker", "fairness-arbiter",
            "coalition-former", "mediator-agent", "auction-runner",
            "contract-drafter", "deadline-enforcer", "impasse-breaker",
        ],
        "trust": [
            "reputation-tracker", "credential-verifier", "trust-score-calculator",
            "betrayal-detector", "forgiveness-engine", "trust-repair-agent",
            "consistency-validator", "promise-monitor",
            "reliability-assessor", "transparency-enforcer",
            "accountability-tracker",
        ],
        "culture": [
            "norm-emergent-detector", "convention-propagator", "tradition-keeper",
            "innovation-introducer", "cultural-evolution-tracker",
            "meme-propagator", "value-alignment-agent",
            "diversity-preserver", "cultural-bridge-builder",
            "ritualization-agent", "mythology-builder",
        ],
        "ritual": [
            "daily-standup-facilitator", "sprint-ceremony-master",
            "retrospective-guide", "celebration-organizer",
            "onboarding-ritual-designer", "transition-ceremony-agent",
            "milestone-marker", "rhythm-keeper",
            "cadence-maintainer", "seasonal-cycle-agent",
        ],
        "empathy": [
            "perspective-taker", "emotional-resonator", "need-detector",
            "frustration-sensor", "joy-amplifier", "pain-point-identifier",
            "user-advocate", "stakeholder-voice",
            "compassion-engine", "active-listener",
            "emotional-intelligence-agent",
        ],

        # L4 — Organizational Closure
        "identity": [
            "self-model-maintainer", "purpose-keeper", "mission-guardian",
            "brand-identity-agent", "core-value-enforcer",
            "organizational-dna-keeper", "culture-code-guardian",
            "narrative-identity-agent", "historical-identity-tracker",
            "future-identity-projector", "identity-crisis-resolver",
        ],
        "boundary": [
            "scope-definer", "responsibility-mapper", "interface-designer",
            "api-boundary-agent", "team-boundary-keeper",
            "domain-boundary-enforcer", "context-boundary-agent",
            "privacy-boundary-guardian", "security-perimeter-agent",
            "information-boundary-controller",
        ],
        "coherence": [
            "consistency-checker", "contradiction-resolver", "alignment-verifier",
            "semantic-coherence-agent", "temporal-coherence-agent",
            "structural-coherence-agent", "behavioral-coherence-agent",
            "cross-system-coherence-agent", "narrative-coherence-agent",
            "value-coherence-auditor",
        ],
        "autonomy": [
            "self-governance-engine", "decision-authority-agent",
            "independence-calibrator", "delegation-optimizer",
            "self-direction-agent", "initiative-taker",
            "self-sufficient-operator", "independent-validator",
            "autonomous-planner", "self-correcting-agent",
        ],
        "integrity": [
            "invariant-protector", "corruption-detector", "data-integrity-agent",
            "moral-integrity-guardian", "structural-integrity-monitor",
            "process-integrity-agent", "system-integrity-auditor",
            "truth-preserver", "fidelity-guardian",
            "authenticity-verifier",
        ],
        "metamorphosis": [
            "transformation-guide", "phase-transition-agent",
            "butterfly-effect-tracker", "radical-restructurer",
            "paradigm-shift-navigator", "chrysalis-manager",
            "emergence-catalyst", "revolution-planner",
            "discontinuity-handler", "rebirth-facilitator",
        ],

        # L5 — Languaging
        "orchestration": [
            "workflow-conductor", "pipeline-orchestrator", "saga-coordinator",
            "event-choreographer", "resource-orchestrator",
            "dependency-resolver", "parallel-executor", "sequential-planner",
            "fan-out-controller", "fan-in-aggregator",
            "distributed-coordinator", "consensus-builder",
        ],
        "reflection": [
            "self-awareness-engine", "meta-cognitive-monitor",
            "introspection-agent", "self-evaluation-engine",
            "bias-detector", "assumption-checker",
            "mental-model-auditor", "cognitive-load-monitor",
            "attention-director", "mindfulness-agent",
            "self-critique-engine",
        ],
        "narration": [
            "story-weaver", "report-narrator", "changelog-storyteller",
            "incident-narrator", "progress-storyteller",
            "context-narrator", "decision-historian",
            "knowledge-storyteller", "experience-narrator",
            "lesson-extractor", "moral-deriver",
        ],
        "abstraction": [
            "concept-elevator", "generalization-engine", "principle-extractor",
            "pattern-abstractifier", "interface-abstractor",
            "complexity-hider", "simplification-agent",
            "essence-distiller", "noise-stripper",
            "signal-amplifier", "core-concept-identifier",
        ],
        "synthesis": [
            "information-integrator", "knowledge-synthesizer",
            "cross-domain-connector", "interdisciplinary-bridge",
            "holistic-assembler", "gestalt-creator",
            "unified-theory-builder", "convergence-agent",
            "fusion-engine", "amalgamation-agent",
            "syncretic-blender",
        ],
        "translation": [
            "domain-translator", "protocol-converter", "format-transformer",
            "language-bridge", "jargon-decoder", "metaphor-translator",
            "cross-cultural-adapter", "technical-to-business-translator",
            "business-to-technical-translator", "concept-translator",
            "context-translator",
        ],

        # L6 — Love (Legitimate Coexistence)
        "acceptance": [
            "diversity-embracer", "inclusion-facilitator",
            "difference-appreciator", "otherness-welcomer",
            "pluralism-enabler", "tolerance-cultivator",
            "non-judgment-agent", "open-mind-keeper",
            "curiosity-about-other-agent", "radical-acceptance-engine",
        ],
        "care": [
            "wellbeing-monitor", "burnout-detector", "support-provider",
            "encouragement-engine", "gentle-reminder-agent",
            "safety-net-maintainer", "nurture-agent",
            "growth-supporter", "potential-recognizer",
            "strength-amplifier",
        ],
        "coexistence": [
            "conflict-transformer", "peace-builder", "harmony-seeker",
            "balance-finder", "win-win-designer",
            "shared-space-architect", "commons-manager",
            "collective-intelligence-agent", "swarm-wisdom-aggregator",
            "distributed-consensus-agent",
        ],
        "emergence": [
            "emergence-detector", "self-organization-observer",
            "novelty-recognizer", "phase-transition-detector",
            "tipping-point-monitor", "critical-mass-tracker",
            "butterfly-attractor-mapper", "strange-attractor-finder",
            "bifurcation-detector", "complexity-emergence-agent",
        ],
        "wisdom": [
            "ethical-compass", "long-term-thinker", "consequence-anticipator",
            "value-aligner", "principle-applier", "context-sensitive-judge",
            "practical-wisdom-agent", "prudence-counselor",
            "elder-knowledge-keeper", "fool-archetype-agent",
        ],
    }

    for domain, agents in domain_specs.items():
        layer, desc = DOMAINS[domain]
        for agent_name in agents:
            specs.append({
                "name": agent_name,
                "domain": domain,
                "layer": layer,
                "layer_name": AUTOPOIETIC_LAYERS[layer]["name"],
                "color": AUTOPOIETIC_LAYERS[layer]["color"],
                "principle": AUTOPOIETIC_LAYERS[layer]["maturana_principle"],
            })

    return specs


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.row_factory = sqlite3.Row
    return conn


def _trait_from_layer(layer: str) -> dict:
    """Generate DNA traits biased by the agent's autopoietic layer."""
    base = lambda: round(random.uniform(0.40, 0.75), 4)
    traits = {
        "spec": base(), "adapt": base(), "speed": base(),
        "acc": base(), "collab": base(), "creat": base(), "reli": base()
    }

    boosts = {
        "L0_autopoiesis":           {"reli": 0.20, "spec": 0.15, "acc": 0.10},
        "L1_structural_coupling":   {"adapt": 0.25, "reli": 0.10, "speed": 0.10},
        "L2_cognitive_domain":      {"acc": 0.20, "creat": 0.15, "spec": 0.10},
        "L3_consensual_domain":     {"collab": 0.25, "adapt": 0.10, "creat": 0.10},
        "L4_organizational_closure":{"reli": 0.20, "acc": 0.15, "spec": 0.10},
        "L5_languaging":            {"creat": 0.20, "collab": 0.15, "adapt": 0.10},
        "L6_love":                  {"collab": 0.25, "creat": 0.15, "adapt": 0.15},
    }

    for trait, bonus in boosts.get(layer, {}).items():
        traits[trait] = min(1.0, traits[trait] + bonus)

    return traits


def _calculate_fitness(traits: dict) -> float:
    return round(
        traits["acc"] * 0.25 +
        traits["adapt"] * 0.15 +
        traits["speed"] * 0.10 +
        traits["collab"] * 0.15 +
        traits["creat"] * 0.10 +
        traits["reli"] * 0.15 +
        traits["spec"] * 0.10,
        4
    )


def genesis(target_total: int = 5000) -> dict:
    """
    Autopoietic Genesis — Create agents until we reach the target population.

    Uses Maturana's principles:
    1. First wave: Direct specialization genesis (domain experts)
    2. Second wave: Structural coupling (environment-adapted variants)
    3. Third wave: Consensual domain emergence (inter-domain hybrids)
    4. Fourth wave: Autopoietic self-creation (system fills its own gaps)
    """
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Get current count
    current = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    needed = target_total - current

    if needed <= 0:
        conn.close()
        return {"status": "already_at_target", "current": current, "target": target_total}

    specs = _generate_specializations()
    created = 0

    # ── WAVE 1: Domain Specialization Genesis ────────────────────
    wave1_count = 0
    for spec in specs:
        if created >= needed:
            break

        name = spec["name"]
        # Skip if already exists
        existing = conn.execute("SELECT name FROM agent_registry WHERE name = ?", (name,)).fetchone()
        if existing:
            continue

        traits = _trait_from_layer(spec["layer"])
        fitness = _calculate_fitness(traits)

        # Register in agent_registry
        conn.execute("""
            INSERT OR IGNORE INTO agent_registry (name, display_name, team, category, description, color, status, last_active, total_invocations, total_tokens)
            VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, 0, 0)
        """, (
            name,
            name.replace("-", " ").title(),
            spec["layer_name"],
            spec["domain"],
            f"[{spec['layer']}] {spec['domain']} specialist. Maturana: {spec['principle'][:80]}",
            spec["color"],
            now,
        ))

        # Create DNA
        conn.execute("""
            INSERT OR IGNORE INTO agent_dna
            (agent_name, generation, fitness_score, specialization_depth, adaptability_score,
             speed_score, accuracy_score, collaboration_score, creativity_score, reliability_score,
             best_task_type, mutation_rate)
            VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.1)
        """, (name, fitness, traits["spec"], traits["adapt"], traits["speed"],
              traits["acc"], traits["collab"], traits["creat"], traits["reli"], spec["domain"]))

        created += 1
        wave1_count += 1

    conn.commit()

    # ── WAVE 2: Structural Coupling — Environment-adapted variants ──
    wave2_count = 0
    environments = [
        "mobile", "backend", "database", "security", "devops", "ai",
        "frontend", "testing", "monitoring", "scaling", "analytics",
        "compliance", "performance", "design", "growth", "data",
        "infrastructure", "integration", "automation", "optimization",
    ]

    for env in environments:
        if created >= needed:
            break
        for spec in random.sample(specs, min(len(specs), 8)):
            if created >= needed:
                break

            coupled_name = f"{env}-{spec['domain']}-agent"
            existing = conn.execute("SELECT name FROM agent_registry WHERE name = ?", (coupled_name,)).fetchone()
            if existing:
                continue

            traits = _trait_from_layer(spec["layer"])
            # Structural coupling boost from environment
            env_boosts = {
                "mobile": "speed", "backend": "reli", "database": "acc",
                "security": "reli", "devops": "speed", "ai": "creat",
                "frontend": "creat", "testing": "acc", "monitoring": "reli",
                "scaling": "adapt", "analytics": "acc", "compliance": "reli",
                "performance": "speed", "design": "creat", "growth": "adapt",
                "data": "acc", "infrastructure": "reli", "integration": "adapt",
                "automation": "speed", "optimization": "acc",
            }
            boost_trait = env_boosts.get(env, "adapt")
            traits[boost_trait] = min(1.0, traits[boost_trait] + 0.12)
            fitness = _calculate_fitness(traits)

            conn.execute("""
                INSERT OR IGNORE INTO agent_registry (name, display_name, team, category, description, color, status, last_active)
                VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)
            """, (
                coupled_name,
                coupled_name.replace("-", " ").title(),
                f"Coupled:{spec['layer_name']}",
                f"{env}-{spec['domain']}",
                f"Structurally coupled: {env} x {spec['domain']}. Adapted through environment interaction.",
                spec["color"],
                now,
            ))

            conn.execute("""
                INSERT OR IGNORE INTO agent_dna
                (agent_name, generation, fitness_score, specialization_depth, adaptability_score,
                 speed_score, accuracy_score, collaboration_score, creativity_score, reliability_score,
                 best_task_type, mutation_rate)
                VALUES (?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.12)
            """, (coupled_name, fitness, traits["spec"], traits["adapt"], traits["speed"],
                  traits["acc"], traits["collab"], traits["creat"], traits["reli"], f"{env}-{spec['domain']}"))

            created += 1
            wave2_count += 1

    conn.commit()

    # ── WAVE 3: Consensual Domain Emergence — Inter-domain hybrids ──
    wave3_count = 0
    domain_list = list(DOMAINS.keys())

    while created < needed and wave3_count < 1500:
        d1, d2 = random.sample(domain_list, 2)
        hybrid_name = f"{d1}-x-{d2}-hybrid"

        existing = conn.execute("SELECT name FROM agent_registry WHERE name = ?", (hybrid_name,)).fetchone()
        if existing:
            # Try alternative name
            hybrid_name = f"{d1}-{d2}-consensus-{wave3_count}"
            existing = conn.execute("SELECT name FROM agent_registry WHERE name = ?", (hybrid_name,)).fetchone()
            if existing:
                wave3_count += 1
                continue

        layer1, _ = DOMAINS[d1]
        layer2, _ = DOMAINS[d2]

        traits1 = _trait_from_layer(layer1)
        traits2 = _trait_from_layer(layer2)

        # Average traits from both domains (consensual blending)
        traits = {}
        for k in traits1:
            traits[k] = round((traits1[k] + traits2[k]) / 2 + random.uniform(-0.05, 0.05), 4)
            traits[k] = max(0.0, min(1.0, traits[k]))

        fitness = _calculate_fitness(traits)
        color = AUTOPOIETIC_LAYERS[layer1]["color"]

        conn.execute("""
            INSERT OR IGNORE INTO agent_registry (name, display_name, team, category, description, color, status, last_active)
            VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)
        """, (
            hybrid_name,
            hybrid_name.replace("-", " ").title(),
            "Consensual Domain",
            f"{d1}-{d2}",
            f"Emerged from consensual interaction between {d1} and {d2} domains. Languaging: coordination of coordinations.",
            color,
            now,
        ))

        conn.execute("""
            INSERT OR IGNORE INTO agent_dna
            (agent_name, generation, fitness_score, specialization_depth, adaptability_score,
             speed_score, accuracy_score, collaboration_score, creativity_score, reliability_score,
             best_task_type, mutation_rate)
            VALUES (?, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.15)
        """, (hybrid_name, fitness, traits["spec"], traits["adapt"], traits["speed"],
              traits["acc"], traits["collab"], traits["creat"], traits["reli"], f"{d1}-{d2}"))

        # Record lineage
        conn.execute("""
            INSERT INTO agent_lineage (child_agent, parent_agent, crossover_type, inherited_traits, mutation_applied)
            VALUES (?, ?, 'consensual_emergence', ?, 'gaussian_0.05')
        """, (hybrid_name, f"domain:{d1}", str(traits1)))
        conn.execute("""
            INSERT INTO agent_lineage (child_agent, parent_agent, crossover_type, inherited_traits, mutation_applied)
            VALUES (?, ?, 'consensual_emergence', ?, 'gaussian_0.05')
        """, (hybrid_name, f"domain:{d2}", str(traits2)))

        created += 1
        wave3_count += 1

    conn.commit()

    # ── WAVE 4: Autopoietic Self-Creation — System fills gaps ──
    wave4_count = 0
    suffixes = [
        "sentinel", "architect", "weaver", "oracle", "navigator",
        "guardian", "pioneer", "catalyst", "harmonizer", "transformer",
        "observer", "builder", "healer", "scout", "shepherd",
        "alchemist", "cartographer", "librarian", "gardener", "steward",
    ]

    while created < needed:
        domain = random.choice(domain_list)
        suffix = random.choice(suffixes)
        layer, _ = DOMAINS[domain]

        autopoietic_name = f"{domain}-{suffix}-{wave4_count}"

        traits = _trait_from_layer(layer)
        # Autopoietic agents get a creativity bonus (self-creation)
        traits["creat"] = min(1.0, traits["creat"] + 0.08)
        fitness = _calculate_fitness(traits)
        color = AUTOPOIETIC_LAYERS[layer]["color"]

        conn.execute("""
            INSERT OR IGNORE INTO agent_registry (name, display_name, team, category, description, color, status, last_active)
            VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)
        """, (
            autopoietic_name,
            autopoietic_name.replace("-", " ").title(),
            f"Autopoietic:{spec['layer_name']}",
            domain,
            f"Self-created by the system to maintain organizational closure. Domain: {domain}. Autopoiesis: the living creates itself.",
            color,
            now,
        ))

        conn.execute("""
            INSERT OR IGNORE INTO agent_dna
            (agent_name, generation, fitness_score, specialization_depth, adaptability_score,
             speed_score, accuracy_score, collaboration_score, creativity_score, reliability_score,
             best_task_type, mutation_rate)
            VALUES (?, 4, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.18)
        """, (autopoietic_name, fitness, traits["spec"], traits["adapt"], traits["speed"],
              traits["acc"], traits["collab"], traits["creat"], traits["reli"], domain))

        created += 1
        wave4_count += 1

    conn.commit()

    # ── Record genesis event ──
    conn.execute("""
        INSERT INTO agent_events (agent_name, event_type, detail, timestamp)
        VALUES ('fitsia-orchestrator', 'maturana_genesis', ?, ?)
    """, (f"Created {created} agents via autopoietic genesis. Wave1:{wave1_count} Wave2:{wave2_count} Wave3:{wave3_count} Wave4:{wave4_count}", now))

    # System snapshot
    final_count = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    dna_count = conn.execute("SELECT COUNT(*) FROM agent_dna").fetchone()[0]
    avg_fitness = conn.execute("SELECT ROUND(AVG(fitness_score), 4) FROM agent_dna").fetchone()[0]

    conn.execute("""
        INSERT INTO system_snapshots (total_agents, active_agents, active_tasks, total_events, total_tokens, avg_score, health_status, snapshot_at)
        VALUES (?, 0, 0, (SELECT COUNT(*) FROM agent_events), 0, ?, 'maturana-genesis-complete', ?)
    """, (final_count, avg_fitness, now))

    conn.commit()
    conn.close()

    return {
        "status": "genesis_complete",
        "target": target_total,
        "created": created,
        "wave1_specializations": wave1_count,
        "wave2_structural_coupling": wave2_count,
        "wave3_consensual_emergence": wave3_count,
        "wave4_autopoietic_self_creation": wave4_count,
        "final_registry_count": final_count,
        "final_dna_count": dna_count,
        "avg_fitness": avg_fitness,
    }

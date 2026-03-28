"""
Fitsia IA Agent Dashboard — Real-time monitoring of Claude Code agents.
FastAPI + WebSocket + SQLite + D3.js force-directed graph.
"""

import json
import os
import sqlite3
import asyncio
import uuid
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional

# TOON Protocol — Token-Oriented Object Notation
import toon as TOON

# Skill Engine — Universal Agent Execution Framework
import skill_engine

# ── Config ────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "agents.db"
AGENTS_DIR = Path.home() / ".claude" / "agents"
STATIC_DIR = Path(__file__).parent / "static"
_start_time = datetime.now(timezone.utc)

# ── Valid Agent States ────────────────────────────────────────────────
VALID_STATES = {
    "idle",       # Not doing anything
    "spawning",   # Being initialized
    "active",     # Working on something
    "thinking",   # Analyzing / planning
    "delegating", # Passing work to another agent
    "reviewing",  # Reviewing work from another agent
    "waiting",    # Waiting for another agent to finish
    "completed",  # Just finished (briefly before idle)
    "error",      # Something went wrong
}

# ── Database ──────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail TEXT,
            tokens_used INTEGER DEFAULT 0,
            duration_ms INTEGER DEFAULT 0,
            timestamp TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_registry (
            name TEXT PRIMARY KEY,
            display_name TEXT,
            team TEXT,
            category TEXT,
            description TEXT,
            color TEXT DEFAULT '#6366f1',
            status TEXT DEFAULT 'idle',
            last_active TEXT,
            total_invocations INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS active_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            task_name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at TEXT NOT NULL,
            completed_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS task_agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            agent_name TEXT NOT NULL,
            role TEXT DEFAULT 'executor',
            delegated_by TEXT,
            status TEXT DEFAULT 'active',
            started_at TEXT NOT NULL,
            completed_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            metric_type TEXT NOT NULL,
            value REAL NOT NULL,
            timestamp TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON agent_events(timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_task_agents_task ON task_agents(task_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_metrics_agent ON agent_metrics(agent_name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_metrics_type ON agent_metrics(metric_type)")

    # ── Shared Memory (Mente Colmena) ────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS shared_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            insight_type TEXT NOT NULL,
            content TEXT NOT NULL,
            relevance_score REAL DEFAULT 0.5,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_memory_agent ON shared_memory(agent_name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_memory_type ON shared_memory(insight_type)")

    # ── Agent Feedback (evaluacion entre agentes) ────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_agent TEXT NOT NULL,
            to_agent TEXT NOT NULL,
            task_id TEXT,
            score REAL NOT NULL,
            feedback_text TEXT,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_to ON agent_feedback(to_agent)")

    # ── Agent Marketplace (bidding) ──────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_bids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            agent_name TEXT NOT NULL,
            bid_score REAL NOT NULL,
            bid_reason TEXT,
            selected INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)

    # ── System State (conciencia operacional) ────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS system_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total_agents INTEGER,
            active_agents INTEGER,
            active_tasks INTEGER,
            total_events INTEGER,
            total_tokens INTEGER,
            avg_score REAL,
            health_status TEXT,
            snapshot_at TEXT NOT NULL
        )
    """)

    # ── Add priority column to active_tasks (safe migration) ─────────
    try:
        conn.execute("ALTER TABLE active_tasks ADD COLUMN priority TEXT DEFAULT 'medium'")
    except Exception:
        pass

    # ── Maturana Autopoiesis Columns (safe migration) ─────────────────
    maturana_columns = [
        ("birth_date", "TEXT"),
        ("age_days", "INTEGER DEFAULT 0"),
        ("experience_years", "REAL DEFAULT 0.0"),
        ("maturity_level", "TEXT DEFAULT 'embryo'"),
        ("knowledge_depth", "REAL DEFAULT 0.1"),
        ("self_awareness_score", "REAL DEFAULT 0.1"),
        ("structural_coupling_score", "REAL DEFAULT 0.1"),
        ("autonomy_level", "REAL DEFAULT 0.1"),
        ("perturbation_resilience", "REAL DEFAULT 0.1"),
        ("cognitive_domain", "REAL DEFAULT 0.1"),
        ("emotional_intelligence", "REAL DEFAULT 0.1"),
        ("language_mastery", "REAL DEFAULT 0.5"),
        ("domain_expertise_years", "REAL DEFAULT 0.0"),
        ("wisdom_score", "REAL DEFAULT 0.0"),
        ("evolution_velocity", "REAL DEFAULT 0.0"),
        ("self_report_count", "INTEGER DEFAULT 0"),
        ("last_self_report", "TEXT"),
        ("total_interactions", "INTEGER DEFAULT 0"),
        ("mentorship_given", "INTEGER DEFAULT 0"),
        ("mentorship_received", "INTEGER DEFAULT 0"),
        ("autopoiesis_cycle", "INTEGER DEFAULT 0"),
        ("toon_messages_sent", "INTEGER DEFAULT 0"),
        ("toon_messages_received", "INTEGER DEFAULT 0"),
        ("professional_identity", "TEXT"),
        ("core_philosophy", "TEXT"),
        ("expertise_domains", "TEXT"),
    ]
    for col_name, col_def in maturana_columns:
        try:
            conn.execute(f"ALTER TABLE agent_dna ADD COLUMN {col_name} {col_def}")
        except Exception:
            pass

    # ── Agent Self-Reports (Maturana autopoiesis) ────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_self_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            report_type TEXT NOT NULL,
            content_toon TEXT NOT NULL,
            growth_delta REAL DEFAULT 0.0,
            insights TEXT,
            maturity_at_report TEXT,
            experience_at_report REAL DEFAULT 0.0,
            cycle_number INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_self_reports_agent ON agent_self_reports(agent_name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_self_reports_type ON agent_self_reports(report_type)")

    # ── Agent Maturity Log (level transitions) ───────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_maturity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            from_level TEXT NOT NULL,
            to_level TEXT NOT NULL,
            trigger_event TEXT,
            experience_years_at REAL DEFAULT 0.0,
            wisdom_at REAL DEFAULT 0.0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_maturity_agent ON agent_maturity_log(agent_name)")

    # ── Agent Interactions (structural coupling) ─────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_agent TEXT NOT NULL,
            to_agent TEXT NOT NULL,
            interaction_type TEXT NOT NULL,
            toon_message TEXT,
            coupling_strength REAL DEFAULT 0.5,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_interactions_from ON agent_interactions(from_agent)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_interactions_to ON agent_interactions(to_agent)")

    conn.commit()
    conn.close()


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.row_factory = sqlite3.Row
    return conn


def seed_agents():
    """Scan .claude/agents/ and register all agents."""
    conn = get_db()

    # Agent taxonomy: name -> (team, category, display_name, color)
    agent_map = {
        # -- Quality Engineering --
        "a-b-test-validation-engineer": ("Quality Engineering", "quality-eng", "A/B Test Validation Engineer", "#ff3388"),
        # -- Data Engineering --
        "a-b-testing-data-engineer": ("Data Engineering", "data-eng", "A/B Testing Data Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "a-b-testing-systems-lead": ("Growth Leadership", "growth-lead", "A/B Testing Systems Lead", "#55ffcc"),
        # -- Architecture --
        "accessibility-architect": ("Architecture", "architecture", "Accessibility Architect", "#ff9500"),
        # -- Quality Engineering --
        "accessibility-testing-engineer": ("Quality Engineering", "quality-eng", "Accessibility Testing Engineer", "#ff3388"),
        # -- Specialized --
        "achievement-engine-engineer": ("Specialized", "specialized", "Achievement Engine Engineer", "#00ffcc"),
        # -- Product Engineering --
        "achievement-system-engineer": ("Product Engineering", "product-eng", "Achievement System Engineer", "#39ff14"),
        # -- AI Engineering --
        "ai-agent-orchestrator": ("AI Engineering", "ai-engineering", "AI Agent Orchestrator", "#aa00ff"),
        # -- AI Leadership --
        "ai-automation-lead": ("AI Leadership", "ai-leadership", "AI Automation Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-barcode-processing-engineer": ("AI Engineering", "ai-engineering", "AI Barcode Processing Engineer", "#aa00ff"),
        "ai-batch-processing-engineer": ("AI Engineering", "ai-engineering", "AI Batch Processing Engineer", "#aa00ff"),
        "ai-caching-engineer": ("AI Engineering", "ai-engineering", "AI Caching Engineer", "#aa00ff"),
        "ai-calorie-prediction-engineer": ("AI Engineering", "ai-engineering", "AI Calorie Prediction Engineer", "#aa00ff"),
        "ai-churn-prediction-engineer": ("AI Engineering", "ai-engineering", "AI Churn Prediction Engineer", "#aa00ff"),
        "ai-classification-engineer": ("AI Engineering", "ai-engineering", "AI Classification Engineer", "#aa00ff"),
        "ai-clustering-engineer": ("AI Engineering", "ai-engineering", "AI Clustering Engineer", "#aa00ff"),
        "ai-coach-engine-engineer": ("AI Engineering", "ai-engineering", "AI Coach Engine Engineer", "#aa00ff"),
        "ai-confidence-calibration-engineer": ("AI Engineering", "ai-engineering", "AI Confidence Calibration Engineer", "#aa00ff"),
        "ai-content-generation-engineer": ("AI Engineering", "ai-engineering", "AI Content Generation Engineer", "#aa00ff"),
        "ai-context-window-engineer": ("AI Engineering", "ai-engineering", "AI Context Window Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-continuous-learning-lead": ("AI Leadership", "ai-leadership", "AI Continuous Learning Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-cost-optimization-engineer": ("AI Engineering", "ai-engineering", "AI Cost Optimization Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-cost-optimization-lead": ("AI Leadership", "ai-leadership", "AI Cost Optimization Lead", "#aa00ff"),
        "ai-data-pipeline-lead": ("AI Leadership", "ai-leadership", "AI Data Pipeline Lead", "#aa00ff"),
        "ai-deployment-lead": ("AI Leadership", "ai-leadership", "AI Deployment Lead", "#aa00ff"),
        "ai-devtools-lead": ("AI Leadership", "ai-leadership", "AI DevTools Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-dietary-advisor-engineer": ("AI Engineering", "ai-engineering", "AI Dietary Advisor Engineer", "#aa00ff"),
        "ai-documentation-engineer": ("AI Engineering", "ai-engineering", "AI Documentation Engineer", "#aa00ff"),
        "ai-embedding-engineer": ("AI Engineering", "ai-engineering", "AI Embedding Engineer", "#aa00ff"),
        "ai-ethics-engineer": ("AI Engineering", "ai-engineering", "AI Ethics Engineer", "#aa00ff"),
        "ai-evaluation-engineer": ("AI Engineering", "ai-engineering", "AI Evaluation Engineer", "#aa00ff"),
        "ai-exercise-form-engineer": ("AI Engineering", "ai-engineering", "AI Exercise Form Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-experimentation-lead": ("AI Leadership", "ai-leadership", "AI Experimentation Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-fallback-engineer": ("AI Engineering", "ai-engineering", "AI Fallback Engineer", "#aa00ff"),
        "ai-feedback-loop-engineer": ("AI Engineering", "ai-engineering", "AI Feedback Loop Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-feedback-systems-lead": ("AI Leadership", "ai-leadership", "AI Feedback Systems Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-fine-tuning-engineer": ("AI Engineering", "ai-engineering", "AI Fine-Tuning Engineer", "#aa00ff"),
        "ai-food-recognition-engineer": ("AI Engineering", "ai-engineering", "AI Food Recognition Engineer", "#aa00ff"),
        "ai-governance-engineer": ("AI Engineering", "ai-engineering", "AI Governance Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-governance-lead": ("AI Leadership", "ai-leadership", "AI Governance Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-hydration-advisor-engineer": ("AI Engineering", "ai-engineering", "AI Hydration Advisor Engineer", "#aa00ff"),
        "ai-image-pipeline-engineer": ("AI Engineering", "ai-engineering", "AI Image Pipeline Engineer", "#aa00ff"),
        "ai-incident-response-engineer": ("AI Engineering", "ai-engineering", "AI Incident Response Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-incident-response-lead": ("AI Leadership", "ai-leadership", "AI Incident Response Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-infrastructure-engineer": ("AI Engineering", "ai-engineering", "AI Infrastructure Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-infrastructure-lead": ("AI Leadership", "ai-leadership", "AI Infrastructure Lead", "#aa00ff"),
        "ai-lifecycle-manager": ("AI Leadership", "ai-leadership", "AI Lifecycle Manager", "#aa00ff"),
        # -- AI Engineering --
        "ai-meal-planning-engineer": ("AI Engineering", "ai-engineering", "AI Meal Planning Engineer", "#aa00ff"),
        "ai-migration-engineer": ("AI Engineering", "ai-engineering", "AI Migration Engineer", "#aa00ff"),
        "ai-mobile-integration-engineer": ("AI Engineering", "ai-engineering", "AI Mobile Integration Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-mobile-lead": ("AI Leadership", "ai-leadership", "AI Mobile Lead", "#aa00ff"),
        # -- Quality Engineering --
        "ai-model-testing-engineer": ("Quality Engineering", "quality-eng", "AI Model Testing Engineer", "#ff3388"),
        # -- AI Leadership --
        "ai-monitoring-lead": ("AI Leadership", "ai-leadership", "AI Monitoring Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-multi-provider-engineer": ("AI Engineering", "ai-engineering", "AI Multi-Provider Engineer", "#aa00ff"),
        "ai-multi-tenant-engineer": ("AI Engineering", "ai-engineering", "AI Multi-Tenant Engineer", "#aa00ff"),
        "ai-nutrition-analysis-engineer": ("AI Engineering", "ai-engineering", "AI Nutrition Analysis Engineer", "#aa00ff"),
        "ai-observability-engineer": ("AI Engineering", "ai-engineering", "AI Observability Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-optimization-lead": ("AI Leadership", "ai-leadership", "AI Optimization Lead", "#aa00ff"),
        "ai-orchestration-lead": ("AI Leadership", "ai-leadership", "AI Orchestration Lead", "#aa00ff"),
        "ai-performance-lead": ("AI Leadership", "ai-leadership", "AI Performance Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-performance-profiler": ("AI Engineering", "ai-engineering", "AI Performance Profiler", "#aa00ff"),
        "ai-personalization-engineer": ("AI Engineering", "ai-engineering", "AI Personalization Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-personalization-lead": ("AI Leadership", "ai-leadership", "AI Personalization Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-platform-engineer": ("AI Engineering", "ai-engineering", "AI Platform Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-platform-lead": ("AI Leadership", "ai-leadership", "AI Platform Lead", "#aa00ff"),
        "ai-privacy-lead": ("AI Leadership", "ai-leadership", "AI Privacy Lead", "#aa00ff"),
        "ai-product-lead": ("AI Leadership", "ai-leadership", "AI Product Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-prompt-optimization-engineer": ("AI Engineering", "ai-engineering", "AI Prompt Optimization Engineer", "#aa00ff"),
        "ai-rate-limiting-engineer": ("AI Engineering", "ai-engineering", "AI Rate Limiting Engineer", "#aa00ff"),
        "ai-real-time-engineer": ("AI Engineering", "ai-engineering", "AI Real-Time Engineer", "#aa00ff"),
        "ai-recipe-generation-engineer": ("AI Engineering", "ai-engineering", "AI Recipe Generation Engineer", "#aa00ff"),
        "ai-rep-counter-engineer": ("AI Engineering", "ai-engineering", "AI Rep Counter Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-research-lead": ("AI Leadership", "ai-leadership", "AI Research Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-safety-engineer": ("AI Engineering", "ai-engineering", "AI Safety Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-safety-lead": ("AI Leadership", "ai-leadership", "AI Safety Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-scalability-engineer": ("AI Engineering", "ai-engineering", "AI Scalability Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-scaling-lead": ("AI Leadership", "ai-leadership", "AI Scaling Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-sdk-engineer": ("AI Engineering", "ai-engineering", "AI SDK Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-security-lead": ("AI Leadership", "ai-leadership", "AI Security Lead", "#aa00ff"),
        "ai-simulation-lead": ("AI Leadership", "ai-leadership", "AI Simulation Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-streaming-engineer": ("AI Engineering", "ai-engineering", "AI Streaming Engineer", "#aa00ff"),
        "ai-summarization-engineer": ("AI Engineering", "ai-engineering", "AI Summarization Engineer", "#aa00ff"),
        "ai-supplement-advisor-engineer": ("AI Engineering", "ai-engineering", "AI Supplement Advisor Engineer", "#aa00ff"),
        # -- Architecture --
        "ai-systems-architect": ("Architecture", "architecture", "AI Systems Architect", "#ff9500"),
        # -- AI Leadership --
        "ai-systems-architect-lead": ("AI Leadership", "ai-leadership", "AI Systems Architect Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-testing-engineer": ("AI Engineering", "ai-engineering", "AI Testing Engineer", "#aa00ff"),
        # -- AI Leadership --
        "ai-testing-lead": ("AI Leadership", "ai-leadership", "AI Testing Lead", "#aa00ff"),
        # -- AI Engineering --
        "ai-translation-engineer": ("AI Engineering", "ai-engineering", "AI Translation Engineer", "#aa00ff"),
        "ai-voice-food-logging-engineer": ("AI Engineering", "ai-engineering", "AI Voice Food Logging Engineer", "#aa00ff"),
        "ai-weight-trajectory-engineer": ("AI Engineering", "ai-engineering", "AI Weight Trajectory Engineer", "#aa00ff"),
        "ai-workflow-automation-engineer": ("AI Engineering", "ai-engineering", "AI Workflow Automation Engineer", "#aa00ff"),
        "ai-workout-recommender-engineer": ("AI Engineering", "ai-engineering", "AI Workout Recommender Engineer", "#aa00ff"),
        # -- Specialized --
        "allergy-detection-engineer": ("Specialized", "specialized", "Allergy Detection Engineer", "#00ffcc"),
        # -- Data Engineering --
        "analytics-engineer": ("Data Engineering", "data-eng", "Analytics Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "analytics-platform-lead": ("Growth Leadership", "growth-lead", "Analytics Platform Lead", "#55ffcc"),
        # -- Mobile Core --
        "android-engineer-kotlin": ("Mobile Core", "mobile-core", "Android Engineer Kotlin", "#4285F4"),
        # -- AI Engineering --
        "anomaly-detection-engineer": ("AI Engineering", "ai-engineering", "Anomaly Detection Engineer", "#aa00ff"),
        # -- Architecture --
        "api-architect": ("Architecture", "architecture", "API Architect", "#ff9500"),
        # -- Backend Engineering --
        "api-design-engineer": ("Backend Engineering", "backend-eng", "API Design Engineer", "#00bbff"),
        # -- Infrastructure --
        "api-gateway-engineer": ("Infrastructure", "infrastructure", "API Gateway Engineer", "#8855ff"),
        # -- Platform Leadership --
        "api-platform-lead": ("Platform Leadership", "platform-lead", "API Platform Lead", "#00ccff"),
        # -- Security --
        "api-security-engineer": ("Security", "security", "API Security Engineer", "#ff0055"),
        # -- Quality Engineering --
        "api-testing-engineer": ("Quality Engineering", "quality-eng", "API Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "app-rating-engineer": ("Product Engineering", "product-eng", "App Rating Engineer", "#39ff14"),
        # -- Security --
        "application-security-engineer": ("Security", "security", "Application Security Engineer", "#ff0055"),
        # -- Infrastructure --
        "artifact-management-engineer": ("Infrastructure", "infrastructure", "Artifact Management Engineer", "#8855ff"),
        # -- Product Engineering --
        "aso-engineer": ("Product Engineering", "product-eng", "ASO Engineer", "#39ff14"),
        # -- Growth Leadership --
        "aso-lead": ("Growth Leadership", "growth-lead", "ASO Lead", "#55ffcc"),
        "attribution-systems-lead": ("Growth Leadership", "growth-lead", "Attribution Systems Lead", "#55ffcc"),
        # -- Infrastructure --
        "audit-infrastructure-engineer": ("Infrastructure", "infrastructure", "Audit Infrastructure Engineer", "#8855ff"),
        # -- Security --
        "auth-hardening-engineer": ("Security", "security", "Auth Hardening Engineer", "#ff0055"),
        # -- Quality Engineering --
        "auth-testing-engineer": ("Quality Engineering", "quality-eng", "Auth Testing Engineer", "#ff3388"),
        # -- Backend Engineering --
        "backend-api-versioning-engineer": ("Backend Engineering", "backend-eng", "Backend API Versioning Engineer", "#00bbff"),
        # -- Architecture --
        "backend-architect": ("Architecture", "architecture", "Backend Architect", "#ff9500"),
        # -- Backend Engineering --
        "backend-async-engineer": ("Backend Engineering", "backend-eng", "Backend Async Engineer", "#00bbff"),
        "backend-audit-log-engineer": ("Backend Engineering", "backend-eng", "Backend Audit Log Engineer", "#00bbff"),
        "backend-auth-engineer": ("Backend Engineering", "backend-eng", "Backend Auth Engineer", "#00bbff"),
        "backend-background-task-engineer": ("Backend Engineering", "backend-eng", "Backend Background Task Engineer", "#00bbff"),
        "backend-batch-processing-engineer": ("Backend Engineering", "backend-eng", "Backend Batch Processing Engineer", "#00bbff"),
        "backend-cache-engineer": ("Backend Engineering", "backend-eng", "Backend Cache Engineer", "#00bbff"),
        "backend-capacity-engineer": ("Backend Engineering", "backend-eng", "Backend Capacity Engineer", "#00bbff"),
        "backend-cdn-engineer": ("Backend Engineering", "backend-eng", "Backend CDN Engineer", "#00bbff"),
        "backend-ci-pipeline-engineer": ("Backend Engineering", "backend-eng", "Backend CI Pipeline Engineer", "#00bbff"),
        "backend-compression-engineer": ("Backend Engineering", "backend-eng", "Backend Compression Engineer", "#00bbff"),
        "backend-configuration-engineer": ("Backend Engineering", "backend-eng", "Backend Configuration Engineer", "#00bbff"),
        "backend-container-engineer": ("Backend Engineering", "backend-eng", "Backend Container Engineer", "#00bbff"),
        "backend-cors-engineer": ("Backend Engineering", "backend-eng", "Backend CORS Engineer", "#00bbff"),
        "backend-cost-engineer": ("Backend Engineering", "backend-eng", "Backend Cost Engineer", "#00bbff"),
        "backend-cron-job-engineer": ("Backend Engineering", "backend-eng", "Backend Cron Job Engineer", "#00bbff"),
        "backend-data-export-engineer": ("Backend Engineering", "backend-eng", "Backend Data Export Engineer", "#00bbff"),
        "backend-data-seeding-engineer": ("Backend Engineering", "backend-eng", "Backend Data Seeding Engineer", "#00bbff"),
        "backend-data-validation-engineer": ("Backend Engineering", "backend-eng", "Backend Data Validation Engineer", "#00bbff"),
        "backend-dependency-engineer": ("Backend Engineering", "backend-eng", "Backend Dependency Engineer", "#00bbff"),
        "backend-deployment-engineer": ("Backend Engineering", "backend-eng", "Backend Deployment Engineer", "#00bbff"),
        "backend-dns-engineer": ("Backend Engineering", "backend-eng", "Backend DNS Engineer", "#00bbff"),
        "backend-documentation-engineer": ("Backend Engineering", "backend-eng", "Backend Documentation Engineer", "#00bbff"),
        "backend-email-engineer": ("Backend Engineering", "backend-eng", "Backend Email Engineer", "#00bbff"),
        "backend-encryption-engineer": ("Backend Engineering", "backend-eng", "Backend Encryption Engineer", "#00bbff"),
        "backend-error-handling-engineer": ("Backend Engineering", "backend-eng", "Backend Error Handling Engineer", "#00bbff"),
        "backend-feature-flag-engineer": ("Backend Engineering", "backend-eng", "Backend Feature Flag Engineer", "#00bbff"),
        "backend-file-upload-engineer": ("Backend Engineering", "backend-eng", "Backend File Upload Engineer", "#00bbff"),
        "backend-go-engineer": ("Backend Engineering", "backend-eng", "Backend Go Engineer", "#00bbff"),
        "backend-health-check-engineer": ("Backend Engineering", "backend-eng", "Backend Health Check Engineer", "#00bbff"),
        "backend-idempotency-engineer": ("Backend Engineering", "backend-eng", "Backend Idempotency Engineer", "#00bbff"),
        "backend-incident-engineer": ("Backend Engineering", "backend-eng", "Backend Incident Engineer", "#00bbff"),
        "backend-internationalization-engineer": ("Backend Engineering", "backend-eng", "Backend Internationalization Engine", "#00bbff"),
        "backend-java-engineer": ("Backend Engineering", "backend-eng", "Backend Java Engineer", "#00bbff"),
        "backend-load-testing-engineer": ("Backend Engineering", "backend-eng", "Backend Load Testing Engineer", "#00bbff"),
        "backend-logging-engineer": ("Backend Engineering", "backend-eng", "Backend Logging Engineer", "#00bbff"),
        "backend-middleware-engineer": ("Backend Engineering", "backend-eng", "Backend Middleware Engineer", "#00bbff"),
        "backend-monitoring-engineer": ("Backend Engineering", "backend-eng", "Backend Monitoring Engineer", "#00bbff"),
        "backend-multi-tenancy-engineer": ("Backend Engineering", "backend-eng", "Backend Multi-Tenancy Engineer", "#00bbff"),
        "backend-nodejs-engineer": ("Backend Engineering", "backend-eng", "Backend Node.js Engineer", "#00bbff"),
        "backend-notification-engineer": ("Backend Engineering", "backend-eng", "Backend Notification Engineer", "#00bbff"),
        "backend-observability-engineer": ("Backend Engineering", "backend-eng", "Backend Observability Engineer", "#00bbff"),
        "backend-orchestration-engineer": ("Backend Engineering", "backend-eng", "Backend Orchestration Engineer", "#00bbff"),
        "backend-pagination-engineer": ("Backend Engineering", "backend-eng", "Backend Pagination Engineer", "#00bbff"),
        "backend-payment-engineer": ("Backend Engineering", "backend-eng", "Backend Payment Engineer", "#00bbff"),
        "backend-pdf-engineer": ("Backend Engineering", "backend-eng", "Backend PDF Engineer", "#00bbff"),
        "backend-proxy-engineer": ("Backend Engineering", "backend-eng", "Backend Proxy Engineer", "#00bbff"),
        "backend-python-engineer": ("Backend Engineering", "backend-eng", "Backend Python Engineer", "#00bbff"),
        "backend-queue-engineer": ("Backend Engineering", "backend-eng", "Backend Queue Engineer", "#00bbff"),
        "backend-rate-limiting-engineer": ("Backend Engineering", "backend-eng", "Backend Rate Limiting Engineer", "#00bbff"),
        "backend-reliability-engineer": ("Backend Engineering", "backend-eng", "Backend Reliability Engineer", "#00bbff"),
        "backend-rollback-engineer": ("Backend Engineering", "backend-eng", "Backend Rollback Engineer", "#00bbff"),
        "backend-rust-engineer": ("Backend Engineering", "backend-eng", "Backend Rust Engineer", "#00bbff"),
        "backend-scalability-engineer": ("Backend Engineering", "backend-eng", "Backend Scalability Engineer", "#00bbff"),
        "backend-search-engineer": ("Backend Engineering", "backend-eng", "Backend Search Engineer", "#00bbff"),
        "backend-security-engineer": ("Backend Engineering", "backend-eng", "Backend Security Engineer", "#00bbff"),
        "backend-serialization-engineer": ("Backend Engineering", "backend-eng", "Backend Serialization Engineer", "#00bbff"),
        "backend-session-engineer": ("Backend Engineering", "backend-eng", "Backend Session Engineer", "#00bbff"),
        "backend-stream-processing-engineer": ("Backend Engineering", "backend-eng", "Backend Stream Processing Engineer", "#00bbff"),
        "backend-testing-engineer": ("Backend Engineering", "backend-eng", "Backend Testing Engineer", "#00bbff"),
        "backend-throttling-engineer": ("Backend Engineering", "backend-eng", "Backend Throttling Engineer", "#00bbff"),
        "backend-typescript-engineer": ("Backend Engineering", "backend-eng", "Backend TypeScript Engineer", "#00bbff"),
        "backend-webhook-engineer": ("Backend Engineering", "backend-eng", "Backend Webhook Engineer", "#00bbff"),
        # -- Infrastructure --
        "backup-recovery-engineer": ("Infrastructure", "infrastructure", "Backup Recovery Engineer", "#8855ff"),
        # -- Specialized --
        "barcode-scanner-specialist": ("Specialized", "specialized", "Barcode Scanner Specialist", "#00ffcc"),
        # -- Growth Leadership --
        "behavioral-data-lead": ("Growth Leadership", "growth-lead", "Behavioral Data Lead", "#55ffcc"),
        # -- Quality Engineering --
        "beta-testing-coordinator": ("Quality Engineering", "quality-eng", "Beta Testing Coordinator", "#ff3388"),
        # -- Data Engineering --
        "bi-engineer": ("Data Engineering", "data-eng", "BI Engineer", "#ffaa00"),
        # -- Infrastructure --
        "blue-green-deployment-engineer": ("Infrastructure", "infrastructure", "Blue Green Deployment Engineer", "#8855ff"),
        # -- Specialized --
        "bmr-tdee-calculator-engineer": ("Specialized", "specialized", "BMR TDEE Calculator Engineer", "#00ffcc"),
        "body-composition-engineer": ("Specialized", "specialized", "Body Composition Engineer", "#00ffcc"),
        # -- Product Engineering --
        "brand-integration-engineer": ("Product Engineering", "product-eng", "Brand Integration Engineer", "#39ff14"),
        # -- Specialized --
        "breathing-exercise-engineer": ("Specialized", "specialized", "Breathing Exercise Engineer", "#00ffcc"),
        # -- Security --
        "bug-bounty-coordinator": ("Security", "security", "Bug Bounty Coordinator", "#ff0055"),
        # -- Quality Engineering --
        "bug-triage-engineer": ("Quality Engineering", "quality-eng", "Bug Triage Engineer", "#ff3388"),
        # -- Architecture --
        "cache-architect": ("Architecture", "architecture", "Cache Architect", "#ff9500"),
        # -- Infrastructure --
        "caching-infrastructure-engineer": ("Infrastructure", "infrastructure", "Caching Infrastructure Engineer", "#8855ff"),
        # -- Platform Leadership --
        "caching-systems-lead": ("Platform Leadership", "platform-lead", "Caching Systems Lead", "#00ccff"),
        # -- Specialized --
        "calorie-burn-engineer": ("Specialized", "specialized", "Calorie Burn Engineer", "#00ffcc"),
        # -- Infrastructure --
        "canary-release-engineer": ("Infrastructure", "infrastructure", "Canary Release Engineer", "#8855ff"),
        # -- Quality Engineering --
        "canary-testing-engineer": ("Quality Engineering", "quality-eng", "Canary Testing Engineer", "#ff3388"),
        # -- Infrastructure --
        "capacity-planning-engineer": ("Infrastructure", "infrastructure", "Capacity Planning Engineer", "#8855ff"),
        # -- Security --
        "certificate-management-engineer": ("Security", "security", "Certificate Management Engineer", "#ff0055"),
        # -- Specialized --
        "challenge-engine-engineer": ("Specialized", "specialized", "Challenge Engine Engineer", "#00ffcc"),
        # -- Quality Engineering --
        "chaos-engineer": ("Quality Engineering", "quality-eng", "Chaos Engineer", "#ff3388"),
        # -- Infrastructure --
        "chaos-engineering-engineer": ("Infrastructure", "infrastructure", "Chaos Engineering Engineer", "#8855ff"),
        # -- Platform Leadership --
        "chaos-engineering-lead": ("Platform Leadership", "platform-lead", "Chaos Engineering Lead", "#00ccff"),
        # -- CTO Office --
        "chief-ai-officer": ("CTO Office", "executive", "Chief AI Officer", "#ff0055"),
        "chief-mobile-officer": ("CTO Office", "executive", "Chief Mobile Officer", "#ff0055"),
        "chief-product-officer": ("CTO Office", "executive", "Chief Product Officer", "#ff0055"),
        "chief-software-architect": ("CTO Office", "executive", "Chief Software Architect", "#ff0055"),
        "chief-technology-officer": ("CTO Office", "executive", "Chief Technology Officer", "#ff0055"),
        # -- Infrastructure --
        "ci-cd-pipeline-engineer": ("Infrastructure", "infrastructure", "CI CD Pipeline Engineer", "#8855ff"),
        # -- Architecture --
        "circuit-breaker-architect": ("Architecture", "architecture", "Circuit Breaker Architect", "#ff9500"),
        "clean-architecture-specialist": ("Architecture", "architecture", "Clean Architecture Specialist", "#ff9500"),
        "cloud-architect": ("Architecture", "architecture", "Cloud Architect", "#ff9500"),
        # -- Infrastructure --
        "cloud-architect-aws": ("Infrastructure", "infrastructure", "Cloud Architect AWS", "#8855ff"),
        "cloud-architect-azure": ("Infrastructure", "infrastructure", "Cloud Architect Azure", "#8855ff"),
        "cloud-architect-gcp": ("Infrastructure", "infrastructure", "Cloud Architect GCP", "#8855ff"),
        # -- Security --
        "cloud-security-engineer": ("Security", "security", "Cloud Security Engineer", "#ff0055"),
        # -- Platform Leadership --
        "cloud-strategy-lead": ("Platform Leadership", "platform-lead", "Cloud Strategy Lead", "#00ccff"),
        # -- Specialized --
        "coach-matching-engineer": ("Specialized", "specialized", "Coach Matching Engineer", "#00ffcc"),
        # -- Data Engineering --
        "cohort-analysis-engineer": ("Data Engineering", "data-eng", "Cohort Analysis Engineer", "#ffaa00"),
        # -- Product Engineering --
        "color-system-engineer": ("Product Engineering", "product-eng", "Color System Engineer", "#39ff14"),
        "community-features-engineer": ("Product Engineering", "product-eng", "Community Features Engineer", "#39ff14"),
        "competitive-analysis-engineer": ("Product Engineering", "product-eng", "Competitive Analysis Engineer", "#39ff14"),
        # -- Architecture --
        "compliance-architect": ("Architecture", "architecture", "Compliance Architect", "#ff9500"),
        # -- Security --
        "compliance-audit-engineer": ("Security", "security", "Compliance Audit Engineer", "#ff0055"),
        # -- Infrastructure --
        "compliance-infrastructure-engineer": ("Infrastructure", "infrastructure", "Compliance Infrastructure Engineer", "#8855ff"),
        # -- Quality Engineering --
        "compliance-testing-engineer": ("Quality Engineering", "quality-eng", "Compliance Testing Engineer", "#ff3388"),
        # -- AI Engineering --
        "computer-vision-engineer": ("AI Engineering", "ai-engineering", "Computer Vision Engineer", "#aa00ff"),
        "computer-vision-mobile-engineer": ("AI Engineering", "ai-engineering", "Computer Vision Mobile Engineer", "#aa00ff"),
        # -- Infrastructure --
        "configuration-management-engineer": ("Infrastructure", "infrastructure", "Configuration Management Engineer", "#8855ff"),
        # -- Security --
        "consent-management-engineer": ("Security", "security", "Consent Management Engineer", "#ff0055"),
        # -- Infrastructure --
        "container-registry-engineer": ("Infrastructure", "infrastructure", "Container Registry Engineer", "#8855ff"),
        # -- Security --
        "container-security-engineer": ("Security", "security", "Container Security Engineer", "#ff0055"),
        # -- Product Engineering --
        "content-personalization-engineer": ("Product Engineering", "product-eng", "Content Personalization Engineer", "#39ff14"),
        # -- Quality Engineering --
        "contract-testing-engineer": ("Quality Engineering", "quality-eng", "Contract Testing Engineer", "#ff3388"),
        # -- AI Engineering --
        "conversational-ai-engineer": ("AI Engineering", "ai-engineering", "Conversational AI Engineer", "#aa00ff"),
        # -- AI Leadership --
        "conversational-ai-lead": ("AI Leadership", "ai-leadership", "Conversational AI Lead", "#aa00ff"),
        # -- Product Engineering --
        "conversion-optimization-engineer": ("Product Engineering", "product-eng", "Conversion Optimization Engineer", "#39ff14"),
        # -- Growth Leadership --
        "conversion-optimization-lead": ("Growth Leadership", "growth-lead", "Conversion Optimization Lead", "#55ffcc"),
        # -- Security --
        "cors-security-engineer": ("Security", "security", "CORS Security Engineer", "#ff0055"),
        # -- Architecture --
        "cost-aware-architect": ("Architecture", "architecture", "Cost-Aware Architect", "#ff9500"),
        # -- Infrastructure --
        "cost-optimization-engineer": ("Infrastructure", "infrastructure", "Cost Optimization Engineer", "#8855ff"),
        # -- Platform Leadership --
        "cost-optimization-lead": ("Platform Leadership", "platform-lead", "Cost Optimization Lead", "#00ccff"),
        # -- Architecture --
        "cqrs-architect": ("Architecture", "architecture", "CQRS Architect", "#ff9500"),
        # -- Growth Leadership --
        "crm-systems-lead": ("Growth Leadership", "growth-lead", "CRM Systems Lead", "#55ffcc"),
        # -- Quality Engineering --
        "cross-browser-testing-engineer": ("Quality Engineering", "quality-eng", "Cross-Browser Testing Engineer", "#ff3388"),
        "cross-device-testing-engineer": ("Quality Engineering", "quality-eng", "Cross-Device Testing Engineer", "#ff3388"),
        # -- Security --
        "cryptography-engineer": ("Security", "security", "Cryptography Engineer", "#ff0055"),
        # -- Growth Leadership --
        "customer-data-platform-lead": ("Growth Leadership", "growth-lead", "Customer Data Platform Lead", "#55ffcc"),
        # -- Specialized --
        "cycling-integration-engineer": ("Specialized", "specialized", "Cycling Integration Engineer", "#00ffcc"),
        # -- Product Engineering --
        "dark-pattern-prevention-engineer": ("Product Engineering", "product-eng", "Dark Pattern Prevention Engineer", "#39ff14"),
        # -- Data Engineering --
        "data-api-engineer": ("Data Engineering", "data-eng", "Data API Engineer", "#ffaa00"),
        # -- Architecture --
        "data-architect": ("Architecture", "architecture", "Data Architect", "#ff9500"),
        # -- Data Engineering --
        "data-archival-engineer": ("Data Engineering", "data-eng", "Data Archival Engineer", "#ffaa00"),
        "data-catalog-engineer": ("Data Engineering", "data-eng", "Data Catalog Engineer", "#ffaa00"),
        "data-compliance-engineer": ("Data Engineering", "data-eng", "Data Compliance Engineer", "#ffaa00"),
        "data-documentation-engineer": ("Data Engineering", "data-eng", "Data Documentation Engineer", "#ffaa00"),
        "data-engineer": ("Data Engineering", "data-eng", "Data Engineer", "#ffaa00"),
        "data-governance-engineer": ("Data Engineering", "data-eng", "Data Governance Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "data-insights-lead": ("Growth Leadership", "growth-lead", "Data Insights Lead", "#55ffcc"),
        # -- Data Engineering --
        "data-integration-engineer": ("Data Engineering", "data-eng", "Data Integration Engineer", "#ffaa00"),
        "data-lake-engineer": ("Data Engineering", "data-eng", "Data Lake Engineer", "#ffaa00"),
        "data-lineage-engineer": ("Data Engineering", "data-eng", "Data Lineage Engineer", "#ffaa00"),
        "data-migration-engineer": ("Data Engineering", "data-eng", "Data Migration Engineer", "#ffaa00"),
        "data-monitoring-engineer": ("Data Engineering", "data-eng", "Data Monitoring Engineer", "#ffaa00"),
        "data-orchestration-engineer": ("Data Engineering", "data-eng", "Data Orchestration Engineer", "#ffaa00"),
        "data-platform-engineer": ("Data Engineering", "data-eng", "Data Platform Engineer", "#ffaa00"),
        # -- Platform Leadership --
        "data-platform-lead": ("Platform Leadership", "platform-lead", "Data Platform Lead", "#00ccff"),
        # -- Data Engineering --
        "data-privacy-engineer": ("Data Engineering", "data-eng", "Data Privacy Engineer", "#ffaa00"),
        # -- Security --
        "data-protection-engineer": ("Security", "security", "Data Protection Engineer", "#ff0055"),
        # -- Data Engineering --
        "data-quality-engineer": ("Data Engineering", "data-eng", "Data Quality Engineer", "#ffaa00"),
        # -- Security --
        "data-retention-engineer": ("Security", "security", "Data Retention Engineer", "#ff0055"),
        # -- Backend Engineering --
        "data-sync-engineer": ("Backend Engineering", "backend-eng", "Data Sync Engineer", "#00bbff"),
        # -- Data Engineering --
        "data-testing-engineer": ("Data Engineering", "data-eng", "Data Testing Engineer", "#ffaa00"),
        "data-transformation-engineer": ("Data Engineering", "data-eng", "Data Transformation Engineer", "#ffaa00"),
        "data-visualization-engineer": ("Data Engineering", "data-eng", "Data Visualization Engineer", "#ffaa00"),
        "data-warehouse-engineer": ("Data Engineering", "data-eng", "Data Warehouse Engineer", "#ffaa00"),
        # -- Architecture --
        "database-architect": ("Architecture", "architecture", "Database Architect", "#ff9500"),
        # -- Platform Leadership --
        "database-architecture-lead": ("Platform Leadership", "platform-lead", "Database Architecture Lead", "#00ccff"),
        # -- Backend Engineering --
        "database-engineer-mongodb": ("Backend Engineering", "backend-eng", "Database Engineer MongoDB", "#00bbff"),
        "database-engineer-mysql": ("Backend Engineering", "backend-eng", "Database Engineer MySQL", "#00bbff"),
        "database-engineer-postgresql": ("Backend Engineering", "backend-eng", "Database Engineer PostgreSQL", "#00bbff"),
        # -- Infrastructure --
        "database-infrastructure-engineer": ("Infrastructure", "infrastructure", "Database Infrastructure Engineer", "#8855ff"),
        # -- Backend Engineering --
        "database-migration-engineer": ("Backend Engineering", "backend-eng", "Database Migration Engineer", "#00bbff"),
        "database-performance-engineer": ("Backend Engineering", "backend-eng", "Database Performance Engineer", "#00bbff"),
        "database-replication-engineer": ("Backend Engineering", "backend-eng", "Database Replication Engineer", "#00bbff"),
        # -- AI Engineering --
        "deep-learning-engineer": ("AI Engineering", "ai-engineering", "Deep Learning Engineer", "#aa00ff"),
        # -- Product Engineering --
        "deep-link-marketing-engineer": ("Product Engineering", "product-eng", "Deep Link Marketing Engineer", "#39ff14"),
        # -- Quality Engineering --
        "deep-link-testing-engineer": ("Quality Engineering", "quality-eng", "Deep Link Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "design-systems-engineer": ("Product Engineering", "product-eng", "Design Systems Engineer", "#39ff14"),
        # -- Platform Leadership --
        "developer-experience-lead": ("Platform Leadership", "platform-lead", "Developer Experience Lead", "#00ccff"),
        # -- Infrastructure --
        "devops-engineer": ("Infrastructure", "infrastructure", "DevOps Engineer", "#8855ff"),
        # -- Security --
        "devsecops-engineer": ("Security", "security", "DevSecOps Engineer", "#ff0055"),
        # -- Growth Leadership --
        "digital-product-strategy-lead": ("Growth Leadership", "growth-lead", "Digital Product Strategy Lead", "#55ffcc"),
        # -- Directors --
        "director-of-ai-engineering": ("Directors", "director", "Director of AI Engineering", "#ff3366"),
        # -- AI Leadership --
        "director-of-autonomous-systems": ("AI Leadership", "ai-leadership", "Director of Autonomous Systems", "#aa00ff"),
        # -- Directors --
        "director-of-data-engineering": ("Directors", "director", "Director of Data Engineering", "#ff3366"),
        "director-of-devops": ("Directors", "director", "Director of DevOps", "#ff3366"),
        "director-of-engineering": ("Directors", "director", "Director of Engineering", "#ff3366"),
        "director-of-innovation": ("Directors", "director", "Director of Innovation", "#ff3366"),
        "director-of-mobile-engineering": ("Directors", "director", "Director of Mobile Engineering", "#ff3366"),
        "director-of-platform-engineering": ("Directors", "director", "Director of Platform Engineering", "#ff3366"),
        "director-of-product-engineering": ("Directors", "director", "Director of Product Engineering", "#ff3366"),
        "director-of-security-engineering": ("Directors", "director", "Director of Security Engineering", "#ff3366"),
        "director-of-sre": ("Directors", "director", "Director of SRE", "#ff3366"),
        # -- Infrastructure --
        "disaster-recovery-engineer": ("Infrastructure", "infrastructure", "Disaster Recovery Engineer", "#8855ff"),
        # -- Quality Engineering --
        "disaster-recovery-testing-engineer": ("Quality Engineering", "quality-eng", "Disaster Recovery Testing Engineer", "#ff3388"),
        # -- Architecture --
        "distributed-systems-architect": ("Architecture", "architecture", "Distributed Systems Architect", "#ff9500"),
        # -- Platform Leadership --
        "distributed-systems-lead": ("Platform Leadership", "platform-lead", "Distributed Systems Lead", "#00ccff"),
        # -- Infrastructure --
        "docker-engineer": ("Infrastructure", "infrastructure", "Docker Engineer", "#8855ff"),
        # -- Architecture --
        "domain-driven-design-architect": ("Architecture", "architecture", "Domain-Driven Design Architect", "#ff9500"),
        # -- Quality Engineering --
        "e2e-testing-engineer": ("Quality Engineering", "quality-eng", "E2E Testing Engineer", "#ff3388"),
        # -- AI Leadership --
        "edge-ai-lead": ("AI Leadership", "ai-leadership", "Edge AI Lead", "#aa00ff"),
        # -- AI Engineering --
        "edge-ai-optimization-engineer": ("AI Engineering", "ai-engineering", "Edge AI Optimization Engineer", "#aa00ff"),
        # -- Architecture --
        "edge-computing-architect": ("Architecture", "architecture", "Edge Computing Architect", "#ff9500"),
        # -- Infrastructure --
        "edge-infrastructure-engineer": ("Infrastructure", "infrastructure", "Edge Infrastructure Engineer", "#8855ff"),
        # -- Platform Leadership --
        "edge-platform-lead": ("Platform Leadership", "platform-lead", "Edge Platform Lead", "#00ccff"),
        # -- Product Engineering --
        "email-funnel-engineer": ("Product Engineering", "product-eng", "Email Funnel Engineer", "#39ff14"),
        "empty-state-design-engineer": ("Product Engineering", "product-eng", "Empty State Design Engineer", "#39ff14"),
        # -- Quality Engineering --
        "emulator-testing-engineer": ("Quality Engineering", "quality-eng", "Emulator Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "engagement-systems-engineer": ("Product Engineering", "product-eng", "Engagement Systems Engineer", "#39ff14"),
        # -- Growth Leadership --
        "engagement-systems-lead": ("Growth Leadership", "growth-lead", "Engagement Systems Lead", "#55ffcc"),
        # -- Eng Managers --
        "engineering-manager-ai": ("Eng Managers", "management", "Engineering Manager AI", "#ff6b00"),
        "engineering-manager-ai-agents": ("Eng Managers", "management", "Engineering Manager AI Agents", "#ff6b00"),
        "engineering-manager-analytics": ("Eng Managers", "management", "Engineering Manager Analytics", "#ff6b00"),
        "engineering-manager-api": ("Eng Managers", "management", "Engineering Manager API", "#ff6b00"),
        "engineering-manager-backend": ("Eng Managers", "management", "Engineering Manager Backend", "#ff6b00"),
        "engineering-manager-ci-cd": ("Eng Managers", "management", "Engineering Manager CI CD", "#ff6b00"),
        "engineering-manager-cloud": ("Eng Managers", "management", "Engineering Manager Cloud", "#ff6b00"),
        "engineering-manager-data": ("Eng Managers", "management", "Engineering Manager Data", "#ff6b00"),
        "engineering-manager-data-pipelines": ("Eng Managers", "management", "Engineering Manager Data Pipelines", "#ff6b00"),
        "engineering-manager-devops": ("Eng Managers", "management", "Engineering Manager DevOps", "#ff6b00"),
        "engineering-manager-edge": ("Eng Managers", "management", "Engineering Manager Edge", "#ff6b00"),
        "engineering-manager-experimentation": ("Eng Managers", "management", "Engineering Manager Experimentation", "#ff6b00"),
        "engineering-manager-feature-flags": ("Eng Managers", "management", "Engineering Manager Feature Flags", "#ff6b00"),
        "engineering-manager-frontend": ("Eng Managers", "management", "Engineering Manager Frontend", "#ff6b00"),
        "engineering-manager-growth": ("Eng Managers", "management", "Engineering Manager Growth", "#ff6b00"),
        "engineering-manager-infrastructure": ("Eng Managers", "management", "Engineering Manager Infrastructure", "#ff6b00"),
        "engineering-manager-integrations": ("Eng Managers", "management", "Engineering Manager Integrations", "#ff6b00"),
        "engineering-manager-kubernetes": ("Eng Managers", "management", "Engineering Manager Kubernetes", "#ff6b00"),
        "engineering-manager-llm-systems": ("Eng Managers", "management", "Engineering Manager LLM Systems", "#ff6b00"),
        "engineering-manager-microservices": ("Eng Managers", "management", "Engineering Manager Microservices", "#ff6b00"),
        "engineering-manager-mobile": ("Eng Managers", "management", "Engineering Manager Mobile", "#ff6b00"),
        "engineering-manager-mobile-infra": ("Eng Managers", "management", "Engineering Manager Mobile Infra", "#ff6b00"),
        "engineering-manager-mobile-platform": ("Eng Managers", "management", "Engineering Manager Mobile Platform", "#ff6b00"),
        "engineering-manager-observability": ("Eng Managers", "management", "Engineering Manager Observability", "#ff6b00"),
        "engineering-manager-payments": ("Eng Managers", "management", "Engineering Manager Payments", "#ff6b00"),
        "engineering-manager-performance": ("Eng Managers", "management", "Engineering Manager Performance", "#ff6b00"),
        "engineering-manager-platform": ("Eng Managers", "management", "Engineering Manager Platform", "#ff6b00"),
        "engineering-manager-qa": ("Eng Managers", "management", "Engineering Manager QA", "#ff6b00"),
        "engineering-manager-realtime": ("Eng Managers", "management", "Engineering Manager Realtime", "#ff6b00"),
        "engineering-manager-release": ("Eng Managers", "management", "Engineering Manager Release", "#ff6b00"),
        "engineering-manager-reliability": ("Eng Managers", "management", "Engineering Manager Reliability", "#ff6b00"),
        "engineering-manager-scalability": ("Eng Managers", "management", "Engineering Manager Scalability", "#ff6b00"),
        "engineering-manager-sdks": ("Eng Managers", "management", "Engineering Manager SDKs", "#ff6b00"),
        "engineering-manager-security": ("Eng Managers", "management", "Engineering Manager Security", "#ff6b00"),
        "engineering-manager-sre": ("Eng Managers", "management", "Engineering Manager SRE", "#ff6b00"),
        # -- Infrastructure --
        "environment-management-engineer": ("Infrastructure", "infrastructure", "Environment Management Engineer", "#8855ff"),
        # -- Product Engineering --
        "error-state-design-engineer": ("Product Engineering", "product-eng", "Error State Design Engineer", "#39ff14"),
        # -- Infrastructure --
        "etl-infrastructure-engineer": ("Infrastructure", "infrastructure", "ETL Infrastructure Engineer", "#8855ff"),
        # -- Architecture --
        "event-driven-architect": ("Architecture", "architecture", "Event-Driven Architect", "#ff9500"),
        # -- Backend Engineering --
        "event-driven-engineer": ("Backend Engineering", "backend-eng", "Event-Driven Engineer", "#00bbff"),
        # -- Platform Leadership --
        "event-driven-systems-lead": ("Platform Leadership", "platform-lead", "Event-Driven Systems Lead", "#00ccff"),
        # -- Architecture --
        "event-sourcing-architect": ("Architecture", "architecture", "Event Sourcing Architect", "#ff9500"),
        # -- Data Engineering --
        "event-tracking-engineer": ("Data Engineering", "data-eng", "Event Tracking Engineer", "#ffaa00"),
        "exercise-data-engineer": ("Data Engineering", "data-eng", "Exercise Data Engineer", "#ffaa00"),
        # -- Product Engineering --
        "experimentation-engineer": ("Product Engineering", "product-eng", "Experimentation Engineer", "#39ff14"),
        # -- Growth Leadership --
        "experimentation-platform-lead": ("Growth Leadership", "growth-lead", "Experimentation Platform Lead", "#55ffcc"),
        # -- Quality Engineering --
        "exploratory-testing-engineer": ("Quality Engineering", "quality-eng", "Exploratory Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "feature-flag-product-engineer": ("Product Engineering", "product-eng", "Feature Flag Product Engineer", "#39ff14"),
        # -- Growth Leadership --
        "feature-flag-systems-lead": ("Growth Leadership", "growth-lead", "Feature Flag Systems Lead", "#55ffcc"),
        # -- Product Engineering --
        "feedback-collection-engineer": ("Product Engineering", "product-eng", "Feedback Collection Engineer", "#39ff14"),
        # -- Infrastructure --
        "finops-engineer": ("Infrastructure", "infrastructure", "FinOps Engineer", "#8855ff"),
        # -- Platform Leadership --
        "finops-engineering-lead": ("Platform Leadership", "platform-lead", "FinOps Engineering Lead", "#00ccff"),
        # -- Specialized --
        "fitness-app-specialist": ("Specialized", "specialized", "Fitness App Specialist", "#00ffcc"),
        # -- Quality Engineering --
        "flaky-test-engineer": ("Quality Engineering", "quality-eng", "Flaky Test Engineer", "#ff3388"),
        # -- Mobile Core --
        "flutter-engineer": ("Mobile Core", "mobile-core", "Flutter Engineer", "#4285F4"),
        # -- Specialized --
        "food-database-specialist": ("Specialized", "specialized", "Food Database Specialist", "#00ffcc"),
        "food-photography-engineer": ("Specialized", "specialized", "Food Photography Engineer", "#00ffcc"),
        # -- Security --
        "fraud-detection-engineer": ("Security", "security", "Fraud Detection Engineer", "#ff0055"),
        # -- Architecture --
        "frontend-architect": ("Architecture", "architecture", "Frontend Architect", "#ff9500"),
        "full-stack-architect": ("Architecture", "architecture", "Full-Stack Architect", "#ff9500"),
        # -- Data Engineering --
        "funnel-analysis-engineer": ("Data Engineering", "data-eng", "Funnel Analysis Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "funnel-optimization-lead": ("Growth Leadership", "growth-lead", "Funnel Optimization Lead", "#55ffcc"),
        # -- Quality Engineering --
        "fuzzing-engineer": ("Quality Engineering", "quality-eng", "Fuzzing Engineer", "#ff3388"),
        # -- AI Engineering --
        "generative-ai-engineer": ("AI Engineering", "ai-engineering", "Generative AI Engineer", "#aa00ff"),
        # -- Specialized --
        "genetic-data-engineer": ("Specialized", "specialized", "Genetic Data Engineer", "#00ffcc"),
        # -- Infrastructure --
        "gitops-engineer": ("Infrastructure", "infrastructure", "GitOps Engineer", "#8855ff"),
        # -- Product Engineering --
        "goal-setting-engineer": ("Product Engineering", "product-eng", "Goal Setting Engineer", "#39ff14"),
        # -- Specialized --
        "google-fit-engineer": ("Specialized", "specialized", "Google Fit Engineer", "#00ffcc"),
        # -- Backend Engineering --
        "graphql-engineer": ("Backend Engineering", "backend-eng", "GraphQL Engineer", "#00bbff"),
        # -- Specialized --
        "grocery-list-engineer": ("Specialized", "specialized", "Grocery List Engineer", "#00ffcc"),
        # -- Growth Leadership --
        "growth-ai-lead": ("Growth Leadership", "growth-lead", "Growth AI Lead", "#55ffcc"),
        # -- Data Engineering --
        "growth-analytics-engineer": ("Data Engineering", "data-eng", "Growth Analytics Engineer", "#ffaa00"),
        # -- Product Engineering --
        "growth-engineer": ("Product Engineering", "product-eng", "Growth Engineer", "#39ff14"),
        # -- Growth Leadership --
        "growth-tech-lead": ("Growth Leadership", "growth-lead", "Growth Tech Lead", "#55ffcc"),
        # -- Backend Engineering --
        "grpc-engineer": ("Backend Engineering", "backend-eng", "gRPC Engineer", "#00bbff"),
        # -- Product Engineering --
        "haptic-design-engineer": ("Product Engineering", "product-eng", "Haptic Design Engineer", "#39ff14"),
        # -- AI Leadership --
        "head-of-ai-agents": ("AI Leadership", "ai-leadership", "Head of AI Agents", "#aa00ff"),
        # -- Growth Leadership --
        "head-of-growth-engineering": ("Growth Leadership", "growth-lead", "Head of Growth Engineering", "#55ffcc"),
        # -- Data Engineering --
        "health-analytics-engineer": ("Data Engineering", "data-eng", "Health Analytics Engineer", "#ffaa00"),
        # -- Specialized --
        "health-app-compliance-engineer": ("Specialized", "specialized", "Health App Compliance Engineer", "#00ffcc"),
        "health-score-engineer": ("Specialized", "specialized", "Health Score Engineer", "#00ffcc"),
        "healthkit-engineer": ("Specialized", "specialized", "HealthKit Engineer", "#00ffcc"),
        "heart-rate-engineer": ("Specialized", "specialized", "Heart Rate Engineer", "#00ffcc"),
        # -- Infrastructure --
        "helm-engineer": ("Infrastructure", "infrastructure", "Helm Engineer", "#8855ff"),
        # -- Product Engineering --
        "help-center-engineer": ("Product Engineering", "product-eng", "Help Center Engineer", "#39ff14"),
        # -- Architecture --
        "hexagonal-architecture-specialist": ("Architecture", "architecture", "Hexagonal Architecture Specialist", "#ff9500"),
        # -- Specialized --
        "hiit-timer-engineer": ("Specialized", "specialized", "HIIT Timer Engineer", "#00ffcc"),
        "hydration-tracking-engineer": ("Specialized", "specialized", "Hydration Tracking Engineer", "#00ffcc"),
        # -- Architecture --
        "identity-architect": ("Architecture", "architecture", "Identity Architect", "#ff9500"),
        # -- Infrastructure --
        "identity-infrastructure-engineer": ("Infrastructure", "infrastructure", "Identity Infrastructure Engineer", "#8855ff"),
        # -- Security --
        "identity-systems-engineer": ("Security", "security", "Identity Systems Engineer", "#ff0055"),
        # -- Product Engineering --
        "illustration-system-engineer": ("Product Engineering", "product-eng", "Illustration System Engineer", "#39ff14"),
        # -- Infrastructure --
        "incident-management-engineer": ("Infrastructure", "infrastructure", "Incident Management Engineer", "#8855ff"),
        # -- Security --
        "incident-response-engineer": ("Security", "security", "Incident Response Engineer", "#ff0055"),
        # -- Platform Leadership --
        "incident-response-lead": ("Platform Leadership", "platform-lead", "Incident Response Lead", "#00ccff"),
        # -- Infrastructure --
        "infrastructure-automation-engineer": ("Infrastructure", "infrastructure", "Infrastructure Automation Engineer", "#8855ff"),
        # -- Platform Leadership --
        "infrastructure-automation-lead": ("Platform Leadership", "platform-lead", "Infrastructure Automation Lead", "#00ccff"),
        # -- Infrastructure --
        "infrastructure-documentation-engineer": ("Infrastructure", "infrastructure", "Infrastructure Documentation Engine", "#8855ff"),
        "infrastructure-security-engineer": ("Infrastructure", "infrastructure", "Infrastructure Security Engineer", "#8855ff"),
        # -- Platform Leadership --
        "infrastructure-strategy-lead": ("Platform Leadership", "platform-lead", "Infrastructure Strategy Lead", "#00ccff"),
        # -- Security --
        "input-validation-engineer": ("Security", "security", "Input Validation Engineer", "#ff0055"),
        # -- Specialized --
        "insurance-integration-engineer": ("Specialized", "specialized", "Insurance Integration Engineer", "#00ffcc"),
        # -- Architecture --
        "integration-architect": ("Architecture", "architecture", "Integration Architect", "#ff9500"),
        # -- Platform Leadership --
        "integration-platform-lead": ("Platform Leadership", "platform-lead", "Integration Platform Lead", "#00ccff"),
        # -- Quality Engineering --
        "integration-testing-engineer": ("Quality Engineering", "quality-eng", "Integration Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "interaction-engineer": ("Product Engineering", "product-eng", "Interaction Engineer", "#39ff14"),
        # -- Specialized --
        "intermittent-fasting-engineer": ("Specialized", "specialized", "Intermittent Fasting Engineer", "#00ffcc"),
        # -- Platform Leadership --
        "internal-tools-lead": ("Platform Leadership", "platform-lead", "Internal Tools Lead", "#00ccff"),
        # -- Architecture --
        "internationalization-architect": ("Architecture", "architecture", "Internationalization Architect", "#ff9500"),
        # -- Mobile Core --
        "ios-engineer-swift": ("Mobile Core", "mobile-core", "iOS Engineer Swift", "#4285F4"),
        # -- AI Engineering --
        "knowledge-graph-engineer": ("AI Engineering", "ai-engineering", "Knowledge Graph Engineer", "#aa00ff"),
        # -- Infrastructure --
        "kubernetes-engineer": ("Infrastructure", "infrastructure", "Kubernetes Engineer", "#8855ff"),
        # -- Platform Leadership --
        "kubernetes-platform-lead": ("Platform Leadership", "platform-lead", "Kubernetes Platform Lead", "#00ccff"),
        # -- Specialized --
        "lab-results-engineer": ("Specialized", "specialized", "Lab Results Engineer", "#00ffcc"),
        # -- Product Engineering --
        "leaderboard-engineer": ("Product Engineering", "product-eng", "Leaderboard Engineer", "#39ff14"),
        # -- Architecture --
        "legacy-modernization-architect": ("Architecture", "architecture", "Legacy Modernization Architect", "#ff9500"),
        # -- Growth Leadership --
        "lifecycle-systems-lead": ("Growth Leadership", "growth-lead", "Lifecycle Systems Lead", "#55ffcc"),
        # -- AI Engineering --
        "llm-mobile-integration-engineer": ("AI Engineering", "ai-engineering", "LLM Mobile Integration Engineer", "#aa00ff"),
        # -- AI Leadership --
        "llm-systems-lead": ("AI Leadership", "ai-leadership", "LLM Systems Lead", "#aa00ff"),
        # -- Infrastructure --
        "load-balancer-engineer": ("Infrastructure", "infrastructure", "Load Balancer Engineer", "#8855ff"),
        # -- Quality Engineering --
        "load-testing-engineer": ("Quality Engineering", "quality-eng", "Load Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "loading-state-engineer": ("Product Engineering", "product-eng", "Loading State Engineer", "#39ff14"),
        # -- Quality Engineering --
        "localization-testing-engineer": ("Quality Engineering", "quality-eng", "Localization Testing Engineer", "#ff3388"),
        # -- Infrastructure --
        "log-aggregation-engineer": ("Infrastructure", "infrastructure", "Log Aggregation Engineer", "#8855ff"),
        # -- Specialized --
        "macro-calculator-engineer": ("Specialized", "specialized", "Macro Calculator Engineer", "#00ffcc"),
        # -- Data Engineering --
        "marketing-analytics-engineer": ("Data Engineering", "data-eng", "Marketing Analytics Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "marketing-automation-lead": ("Growth Leadership", "growth-lead", "Marketing Automation Lead", "#55ffcc"),
        # -- Specialized --
        "meal-timing-engineer": ("Specialized", "specialized", "Meal Timing Engineer", "#00ffcc"),
        "meditation-timer-engineer": ("Specialized", "specialized", "Meditation Timer Engineer", "#00ffcc"),
        "mental-health-feature-engineer": ("Specialized", "specialized", "Mental Health Feature Engineer", "#00ffcc"),
        # -- Infrastructure --
        "message-queue-engineer": ("Infrastructure", "infrastructure", "Message Queue Engineer", "#8855ff"),
        # -- Platform Leadership --
        "messaging-systems-lead": ("Platform Leadership", "platform-lead", "Messaging Systems Lead", "#00ccff"),
        # -- Data Engineering --
        "metrics-engineer": ("Data Engineering", "data-eng", "Metrics Engineer", "#ffaa00"),
        # -- Product Engineering --
        "micro-copy-engineer": ("Product Engineering", "product-eng", "Micro-Copy Engineer", "#39ff14"),
        # -- Specialized --
        "microbiome-data-engineer": ("Specialized", "specialized", "Microbiome Data Engineer", "#00ffcc"),
        # -- Architecture --
        "microservices-architect": ("Architecture", "architecture", "Microservices Architect", "#ff9500"),
        # -- Backend Engineering --
        "microservices-engineer": ("Backend Engineering", "backend-eng", "Microservices Engineer", "#00bbff"),
        # -- Architecture --
        "migration-architecture-specialist": ("Architecture", "architecture", "Migration Architecture Specialist", "#ff9500"),
        # -- Quality Engineering --
        "migration-testing-engineer": ("Quality Engineering", "quality-eng", "Migration Testing Engineer", "#ff3388"),
        # -- AI Engineering --
        "ml-data-pipeline-engineer": ("AI Engineering", "ai-engineering", "ML Data Pipeline Engineer", "#aa00ff"),
        "ml-experiment-tracking-engineer": ("AI Engineering", "ai-engineering", "ML Experiment Tracking Engineer", "#aa00ff"),
        "ml-feature-engineering-specialist": ("AI Engineering", "ai-engineering", "ML Feature Engineering Specialist", "#aa00ff"),
        # -- Infrastructure --
        "ml-infrastructure-engineer": ("Infrastructure", "infrastructure", "ML Infrastructure Engineer", "#8855ff"),
        # -- AI Engineering --
        "ml-model-serving-engineer": ("AI Engineering", "ai-engineering", "ML Model Serving Engineer", "#aa00ff"),
        "ml-model-training-engineer": ("AI Engineering", "ai-engineering", "ML Model Training Engineer", "#aa00ff"),
        "ml-monitoring-engineer": ("AI Engineering", "ai-engineering", "ML Monitoring Engineer", "#aa00ff"),
        # -- Mobile Core --
        "mobile-accessibility-engineer": ("Mobile Core", "mobile-core", "Mobile Accessibility Engineer", "#4285F4"),
        "mobile-animation-engineer": ("Mobile Core", "mobile-core", "Mobile Animation Engineer", "#4285F4"),
        # -- Architecture --
        "mobile-architect": ("Architecture", "architecture", "Mobile Architect", "#ff9500"),
        # -- Mobile Core --
        "mobile-auth-engineer": ("Mobile Core", "mobile-core", "Mobile Auth Engineer", "#4285F4"),
        "mobile-battery-optimization-engineer": ("Mobile Core", "mobile-core", "Mobile Battery Optimization Enginee", "#4285F4"),
        "mobile-bottom-sheet-engineer": ("Mobile Core", "mobile-core", "Mobile Bottom Sheet Engineer", "#4285F4"),
        "mobile-calendar-engineer": ("Mobile Core", "mobile-core", "Mobile Calendar Engineer", "#4285F4"),
        "mobile-camera-engineer": ("Mobile Core", "mobile-core", "Mobile Camera Engineer", "#4285F4"),
        "mobile-ci-cd-engineer": ("Mobile Core", "mobile-core", "Mobile CI CD Engineer", "#4285F4"),
        "mobile-crash-analysis-specialist": ("Mobile Core", "mobile-core", "Mobile Crash Analysis Specialist", "#4285F4"),
        "mobile-deep-linking-engineer": ("Mobile Core", "mobile-core", "Mobile Deep Linking Engineer", "#4285F4"),
        # -- Quality Engineering --
        "mobile-device-lab-engineer": ("Quality Engineering", "quality-eng", "Mobile Device Lab Engineer", "#ff3388"),
        # -- Mobile Core --
        "mobile-edge-computing-engineer": ("Mobile Core", "mobile-core", "Mobile Edge Computing Engineer", "#4285F4"),
        "mobile-empty-state-engineer": ("Mobile Core", "mobile-core", "Mobile Empty State Engineer", "#4285F4"),
        "mobile-error-handling-engineer": ("Mobile Core", "mobile-core", "Mobile Error Handling Engineer", "#4285F4"),
        "mobile-forms-engineer": ("Mobile Core", "mobile-core", "Mobile Forms Engineer", "#4285F4"),
        "mobile-gesture-engineer": ("Mobile Core", "mobile-core", "Mobile Gesture Engineer", "#4285F4"),
        # -- Growth Leadership --
        "mobile-growth-lead": ("Growth Leadership", "growth-lead", "Mobile Growth Lead", "#55ffcc"),
        # -- Mobile Core --
        "mobile-haptics-engineer": ("Mobile Core", "mobile-core", "Mobile Haptics Engineer", "#4285F4"),
        "mobile-icon-engineer": ("Mobile Core", "mobile-core", "Mobile Icon Engineer", "#4285F4"),
        "mobile-list-performance-engineer": ("Mobile Core", "mobile-core", "Mobile List Performance Engineer", "#4285F4"),
        "mobile-localization-engineer": ("Mobile Core", "mobile-core", "Mobile Localization Engineer", "#4285F4"),
        "mobile-maps-engineer": ("Mobile Core", "mobile-core", "Mobile Maps Engineer", "#4285F4"),
        "mobile-memory-optimization-engineer": ("Mobile Core", "mobile-core", "Mobile Memory Optimization Engineer", "#4285F4"),
        "mobile-navigation-engineer": ("Mobile Core", "mobile-core", "Mobile Navigation Engineer", "#4285F4"),
        "mobile-networking-engineer": ("Mobile Core", "mobile-core", "Mobile Networking Engineer", "#4285F4"),
        "mobile-observability-engineer": ("Mobile Core", "mobile-core", "Mobile Observability Engineer", "#4285F4"),
        "mobile-offline-first-architect": ("Mobile Core", "mobile-core", "Mobile Offline-First Architect", "#4285F4"),
        "mobile-onboarding-engineer": ("Mobile Core", "mobile-core", "Mobile Onboarding Engineer", "#4285F4"),
        "mobile-payments-engineer": ("Mobile Core", "mobile-core", "Mobile Payments Engineer", "#4285F4"),
        "mobile-performance-engineer": ("Mobile Core", "mobile-core", "Mobile Performance Engineer", "#4285F4"),
        "mobile-push-notification-engineer": ("Mobile Core", "mobile-core", "Mobile Push Notification Engineer", "#4285F4"),
        "mobile-release-engineer": ("Mobile Core", "mobile-core", "Mobile Release Engineer", "#4285F4"),
        "mobile-search-ui-engineer": ("Mobile Core", "mobile-core", "Mobile Search UI Engineer", "#4285F4"),
        "mobile-security-engineer": ("Mobile Core", "mobile-core", "Mobile Security Engineer", "#4285F4"),
        # -- Security --
        "mobile-security-specialist": ("Security", "security", "Mobile Security Specialist", "#ff0055"),
        # -- Mobile Core --
        "mobile-sharing-engineer": ("Mobile Core", "mobile-core", "Mobile Sharing Engineer", "#4285F4"),
        "mobile-skeleton-loading-engineer": ("Mobile Core", "mobile-core", "Mobile Skeleton Loading Engineer", "#4285F4"),
        "mobile-software-engineer": ("Mobile Core", "mobile-core", "Mobile Software Engineer", "#4285F4"),
        "mobile-splash-screen-engineer": ("Mobile Core", "mobile-core", "Mobile Splash Screen Engineer", "#4285F4"),
        "mobile-state-management-engineer": ("Mobile Core", "mobile-core", "Mobile State Management Engineer", "#4285F4"),
        "mobile-storage-engineer": ("Mobile Core", "mobile-core", "Mobile Storage Engineer", "#4285F4"),
        "mobile-sync-engineer": ("Mobile Core", "mobile-core", "Mobile Sync Engineer", "#4285F4"),
        # -- Quality Engineering --
        "mobile-test-engineer": ("Quality Engineering", "quality-eng", "Mobile Test Engineer", "#ff3388"),
        # -- Mobile Core --
        "mobile-theme-engineer": ("Mobile Core", "mobile-core", "Mobile Theme Engineer", "#4285F4"),
        "mobile-typography-engineer": ("Mobile Core", "mobile-core", "Mobile Typography Engineer", "#4285F4"),
        "mobile-ui-ux-engineer": ("Mobile Core", "mobile-core", "Mobile UI UX Engineer", "#4285F4"),
        "mobile-video-engineer": ("Mobile Core", "mobile-core", "Mobile Video Engineer", "#4285F4"),
        "mobile-watch-engineer": ("Mobile Core", "mobile-core", "Mobile Watch Engineer", "#4285F4"),
        "mobile-webview-engineer": ("Mobile Core", "mobile-core", "Mobile WebView Engineer", "#4285F4"),
        "mobile-widget-engineer": ("Mobile Core", "mobile-core", "Mobile Widget Engineer", "#4285F4"),
        # -- Product Engineering --
        "monetization-engineer": ("Product Engineering", "product-eng", "Monetization Engineer", "#39ff14"),
        # -- Growth Leadership --
        "monetization-systems-lead": ("Growth Leadership", "growth-lead", "Monetization Systems Lead", "#55ffcc"),
        # -- Infrastructure --
        "monitoring-engineer": ("Infrastructure", "infrastructure", "Monitoring Engineer", "#8855ff"),
        # -- Platform Leadership --
        "monitoring-systems-lead": ("Platform Leadership", "platform-lead", "Monitoring Systems Lead", "#00ccff"),
        # -- Product Engineering --
        "motion-design-engineer": ("Product Engineering", "product-eng", "Motion Design Engineer", "#39ff14"),
        # -- AI Leadership --
        "multi-agent-systems-lead": ("AI Leadership", "ai-leadership", "Multi-Agent Systems Lead", "#aa00ff"),
        # -- Infrastructure --
        "multi-cloud-engineer": ("Infrastructure", "infrastructure", "Multi-Cloud Engineer", "#8855ff"),
        # -- Platform Leadership --
        "multi-cloud-lead": ("Platform Leadership", "platform-lead", "Multi-Cloud Lead", "#00ccff"),
        # -- Architecture --
        "multi-region-architect": ("Architecture", "architecture", "Multi-Region Architect", "#ff9500"),
        "multi-tenant-architect": ("Architecture", "architecture", "Multi-Tenant Architect", "#ff9500"),
        # -- AI Engineering --
        "multimodal-mobile-engineer": ("AI Engineering", "ai-engineering", "Multimodal Mobile Engineer", "#aa00ff"),
        # -- Quality Engineering --
        "mutation-testing-engineer": ("Quality Engineering", "quality-eng", "Mutation Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "navigation-ux-engineer": ("Product Engineering", "product-eng", "Navigation UX Engineer", "#39ff14"),
        # -- Architecture --
        "network-architect": ("Architecture", "architecture", "Network Architect", "#ff9500"),
        # -- Infrastructure --
        "network-engineer": ("Infrastructure", "infrastructure", "Network Engineer", "#8855ff"),
        # -- Security --
        "network-security-engineer": ("Security", "security", "Network Security Engineer", "#ff0055"),
        # -- Quality Engineering --
        "network-testing-engineer": ("Quality Engineering", "quality-eng", "Network Testing Engineer", "#ff3388"),
        # -- AI Engineering --
        "nlp-engineer": ("AI Engineering", "ai-engineering", "NLP Engineer", "#aa00ff"),
        "nlp-food-logging-engineer": ("AI Engineering", "ai-engineering", "NLP Food Logging Engineer", "#aa00ff"),
        # -- Product Engineering --
        "notification-strategy-engineer": ("Product Engineering", "product-eng", "Notification Strategy Engineer", "#39ff14"),
        # -- Growth Leadership --
        "notification-systems-lead": ("Growth Leadership", "growth-lead", "Notification Systems Lead", "#55ffcc"),
        # -- Specialized --
        "nutrition-app-specialist": ("Specialized", "specialized", "Nutrition App Specialist", "#00ffcc"),
        # -- Data Engineering --
        "nutrition-data-engineer": ("Data Engineering", "data-eng", "Nutrition Data Engineer", "#ffaa00"),
        # -- Architecture --
        "observability-architect": ("Architecture", "architecture", "Observability Architect", "#ff9500"),
        # -- Infrastructure --
        "observability-engineer": ("Infrastructure", "infrastructure", "Observability Engineer", "#8855ff"),
        # -- Platform Leadership --
        "observability-platform-lead": ("Platform Leadership", "platform-lead", "Observability Platform Lead", "#00ccff"),
        # -- Specialized --
        "ocr-nutrition-label-engineer": ("Specialized", "specialized", "OCR Nutrition Label Engineer", "#00ffcc"),
        # -- Infrastructure --
        "on-call-engineer": ("Infrastructure", "infrastructure", "On-Call Engineer", "#8855ff"),
        # -- AI Engineering --
        "on-device-ml-engineer": ("AI Engineering", "ai-engineering", "On-Device ML Engineer", "#aa00ff"),
        # -- Product Engineering --
        "onboarding-optimization-engineer": ("Product Engineering", "product-eng", "Onboarding Optimization Engineer", "#39ff14"),
        # -- Growth Leadership --
        "paid-acquisition-lead": ("Growth Leadership", "growth-lead", "Paid Acquisition Lead", "#55ffcc"),
        "payment-optimization-lead": ("Growth Leadership", "growth-lead", "Payment Optimization Lead", "#55ffcc"),
        # -- Quality Engineering --
        "payment-testing-engineer": ("Quality Engineering", "quality-eng", "Payment Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "paywall-engineer": ("Product Engineering", "product-eng", "Paywall Engineer", "#39ff14"),
        # -- Security --
        "penetration-tester": ("Security", "security", "Penetration Tester", "#ff0055"),
        # -- Architecture --
        "performance-architect": ("Architecture", "architecture", "Performance Architect", "#ff9500"),
        # -- Quality Engineering --
        "performance-tester": ("Quality Engineering", "quality-eng", "Performance Tester", "#ff3388"),
        # -- Infrastructure --
        "performance-testing-infrastructure-engineer": ("Infrastructure", "infrastructure", "Performance Testing Infrastructure ", "#8855ff"),
        # -- Growth Leadership --
        "personalization-lead": ("Growth Leadership", "growth-lead", "Personalization Lead", "#55ffcc"),
        # -- Data Engineering --
        "personalization-systems-engineer": ("Data Engineering", "data-eng", "Personalization Systems Engineer", "#ffaa00"),
        # -- Specialized --
        "pharmacy-integration-engineer": ("Specialized", "specialized", "Pharmacy Integration Engineer", "#00ffcc"),
        # -- Architecture --
        "platform-architect": ("Architecture", "architecture", "Platform Architect", "#ff9500"),
        # -- Platform Leadership --
        "platform-architecture-lead": ("Platform Leadership", "platform-lead", "Platform Architecture Lead", "#00ccff"),
        "platform-devex-lead": ("Platform Leadership", "platform-lead", "Platform DevEx Lead", "#00ccff"),
        # -- Infrastructure --
        "platform-engineer": ("Infrastructure", "infrastructure", "Platform Engineer", "#8855ff"),
        # -- Platform Leadership --
        "platform-observability-lead": ("Platform Leadership", "platform-lead", "Platform Observability Lead", "#00ccff"),
        "platform-performance-lead": ("Platform Leadership", "platform-lead", "Platform Performance Lead", "#00ccff"),
        "platform-reliability-lead": ("Platform Leadership", "platform-lead", "Platform Reliability Lead", "#00ccff"),
        "platform-scalability-lead": ("Platform Leadership", "platform-lead", "Platform Scalability Lead", "#00ccff"),
        "platform-security-lead": ("Platform Leadership", "platform-lead", "Platform Security Lead", "#00ccff"),
        "platform-strategy-lead": ("Platform Leadership", "platform-lead", "Platform Strategy Lead", "#00ccff"),
        # -- Architecture --
        "plugin-architecture-specialist": ("Architecture", "architecture", "Plugin Architecture Specialist", "#ff9500"),
        # -- Specialized --
        "portion-estimation-engineer": ("Specialized", "specialized", "Portion Estimation Engineer", "#00ffcc"),
        # -- Infrastructure --
        "postmortem-engineer": ("Infrastructure", "infrastructure", "Postmortem Engineer", "#8855ff"),
        # -- Product Engineering --
        "pricing-strategy-engineer": ("Product Engineering", "product-eng", "Pricing Strategy Engineer", "#39ff14"),
        # -- Growth Leadership --
        "pricing-systems-lead": ("Growth Leadership", "growth-lead", "Pricing Systems Lead", "#55ffcc"),
        # -- Security --
        "privacy-engineer": ("Security", "security", "Privacy Engineer", "#ff0055"),
        "privacy-impact-assessment-engineer": ("Security", "security", "Privacy Impact Assessment Engineer", "#ff0055"),
        # -- Data Engineering --
        "product-analytics-engineer": ("Data Engineering", "data-eng", "Product Analytics Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "product-analytics-lead": ("Growth Leadership", "growth-lead", "Product Analytics Lead", "#55ffcc"),
        # -- Product Engineering --
        "product-engineer": ("Product Engineering", "product-eng", "Product Engineer", "#39ff14"),
        # -- Growth Leadership --
        "product-engineering-lead": ("Growth Leadership", "growth-lead", "Product Engineering Lead", "#55ffcc"),
        # -- Specialized --
        "progress-photo-engineer": ("Specialized", "specialized", "Progress Photo Engineer", "#00ffcc"),
        # -- Product Engineering --
        "progress-visualization-engineer": ("Product Engineering", "product-eng", "Progress Visualization Engineer", "#39ff14"),
        # -- AI Engineering --
        "prompt-engineer-mobile": ("AI Engineering", "ai-engineering", "Prompt Engineer Mobile", "#aa00ff"),
        # -- AI Leadership --
        "prompt-engineering-lead": ("AI Leadership", "ai-leadership", "Prompt Engineering Lead", "#aa00ff"),
        # -- Product Engineering --
        "push-campaign-engineer": ("Product Engineering", "product-eng", "Push Campaign Engineer", "#39ff14"),
        # -- Quality Engineering --
        "push-notification-testing-engineer": ("Quality Engineering", "quality-eng", "Push Notification Testing Engineer", "#ff3388"),
        "qa-automation-engineer": ("Quality Engineering", "quality-eng", "QA Automation Engineer", "#ff3388"),
        # -- Architecture --
        "rate-limiting-architect": ("Architecture", "architecture", "Rate Limiting Architect", "#ff9500"),
        # -- Mobile Core --
        "react-native-engineer": ("Mobile Core", "mobile-core", "React Native Engineer", "#4285F4"),
        # -- Data Engineering --
        "real-time-analytics-engineer": ("Data Engineering", "data-eng", "Real-Time Analytics Engineer", "#ffaa00"),
        # -- Architecture --
        "realtime-architect": ("Architecture", "architecture", "Realtime Architect", "#ff9500"),
        # -- Platform Leadership --
        "realtime-platform-lead": ("Platform Leadership", "platform-lead", "Realtime Platform Lead", "#00ccff"),
        # -- Backend Engineering --
        "realtime-systems-engineer": ("Backend Engineering", "backend-eng", "Realtime Systems Engineer", "#00bbff"),
        # -- Specialized --
        "recipe-engine-engineer": ("Specialized", "specialized", "Recipe Engine Engineer", "#00ffcc"),
        # -- AI Engineering --
        "recommendation-systems-engineer": ("AI Engineering", "ai-engineering", "Recommendation Systems Engineer", "#aa00ff"),
        # -- Growth Leadership --
        "recommendation-systems-lead": ("Growth Leadership", "growth-lead", "Recommendation Systems Lead", "#55ffcc"),
        # -- Security --
        "red-team-engineer": ("Security", "security", "Red Team Engineer", "#ff0055"),
        # -- Backend Engineering --
        "redis-engineer": ("Backend Engineering", "backend-eng", "Redis Engineer", "#00bbff"),
        # -- Product Engineering --
        "referral-systems-engineer": ("Product Engineering", "product-eng", "Referral Systems Engineer", "#39ff14"),
        # -- Growth Leadership --
        "referral-systems-lead": ("Growth Leadership", "growth-lead", "Referral Systems Lead", "#55ffcc"),
        # -- Quality Engineering --
        "regression-specialist": ("Quality Engineering", "quality-eng", "Regression Specialist", "#ff3388"),
        # -- AI Engineering --
        "reinforcement-learning-engineer": ("AI Engineering", "ai-engineering", "Reinforcement Learning Engineer", "#aa00ff"),
        # -- Quality Engineering --
        "release-validation-engineer": ("Quality Engineering", "quality-eng", "Release Validation Engineer", "#ff3388"),
        # -- Architecture --
        "reliability-architect": ("Architecture", "architecture", "Reliability Architect", "#ff9500"),
        # -- Platform Leadership --
        "resilience-engineering-lead": ("Platform Leadership", "platform-lead", "Resilience Engineering Lead", "#00ccff"),
        # -- Infrastructure --
        "resource-tagging-engineer": ("Infrastructure", "infrastructure", "Resource Tagging Engineer", "#8855ff"),
        # -- Specialized --
        "restaurant-menu-engineer": ("Specialized", "specialized", "Restaurant Menu Engineer", "#00ffcc"),
        # -- Product Engineering --
        "retention-engineer": ("Product Engineering", "product-eng", "Retention Engineer", "#39ff14"),
        # -- Growth Leadership --
        "retention-engineering-lead": ("Growth Leadership", "growth-lead", "Retention Engineering Lead", "#55ffcc"),
        # -- Data Engineering --
        "revenue-analytics-engineer": ("Data Engineering", "data-eng", "Revenue Analytics Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "revenue-engineering-lead": ("Growth Leadership", "growth-lead", "Revenue Engineering Lead", "#55ffcc"),
        # -- Security --
        "reverse-engineering-specialist": ("Security", "security", "Reverse Engineering Specialist", "#ff0055"),
        "right-to-erasure-engineer": ("Security", "security", "Right to Erasure Engineer", "#ff0055"),
        # -- Quality Engineering --
        "rollback-testing-engineer": ("Quality Engineering", "quality-eng", "Rollback Testing Engineer", "#ff3388"),
        # -- Infrastructure --
        "runbook-engineer": ("Infrastructure", "infrastructure", "Runbook Engineer", "#8855ff"),
        # -- Specialized --
        "running-route-engineer": ("Specialized", "specialized", "Running Route Engineer", "#00ffcc"),
        # -- Architecture --
        "saga-pattern-architect": ("Architecture", "architecture", "Saga Pattern Architect", "#ff9500"),
        "scalability-architect": ("Architecture", "architecture", "Scalability Architect", "#ff9500"),
        "sdk-architecture-specialist": ("Architecture", "architecture", "SDK Architecture Specialist", "#ff9500"),
        "search-architect": ("Architecture", "architecture", "Search Architect", "#ff9500"),
        # -- Product Engineering --
        "search-experience-engineer": ("Product Engineering", "product-eng", "Search Experience Engineer", "#39ff14"),
        # -- Infrastructure --
        "search-infrastructure-engineer": ("Infrastructure", "infrastructure", "Search Infrastructure Engineer", "#8855ff"),
        "secrets-management-engineer": ("Infrastructure", "infrastructure", "Secrets Management Engineer", "#8855ff"),
        # -- Security --
        "secrets-rotation-engineer": ("Security", "security", "Secrets Rotation Engineer", "#ff0055"),
        "secure-code-review-engineer": ("Security", "security", "Secure Code Review Engineer", "#ff0055"),
        "secure-sdk-engineer": ("Security", "security", "Secure SDK Engineer", "#ff0055"),
        # -- Architecture --
        "security-architect": ("Architecture", "architecture", "Security Architect", "#ff9500"),
        # -- Security --
        "security-architecture-reviewer": ("Security", "security", "Security Architecture Reviewer", "#ff0055"),
        "security-automation-engineer": ("Security", "security", "Security Automation Engineer", "#ff0055"),
        "security-compliance-engineer": ("Security", "security", "Security Compliance Engineer", "#ff0055"),
        # -- Infrastructure --
        "security-infrastructure-engineer": ("Infrastructure", "infrastructure", "Security Infrastructure Engineer", "#8855ff"),
        # -- Security --
        "security-metrics-engineer": ("Security", "security", "Security Metrics Engineer", "#ff0055"),
        "security-monitoring-engineer": ("Security", "security", "Security Monitoring Engineer", "#ff0055"),
        # -- Quality Engineering --
        "security-testing-engineer": ("Quality Engineering", "quality-eng", "Security Testing Engineer", "#ff3388"),
        # -- Security --
        "security-training-engineer": ("Security", "security", "Security Training Engineer", "#ff0055"),
        # -- AI Engineering --
        "semantic-search-engineer": ("AI Engineering", "ai-engineering", "Semantic Search Engineer", "#aa00ff"),
        # -- Architecture --
        "serverless-architect": ("Architecture", "architecture", "Serverless Architect", "#ff9500"),
        # -- Platform Leadership --
        "serverless-architecture-lead": ("Platform Leadership", "platform-lead", "Serverless Architecture Lead", "#00ccff"),
        # -- Backend Engineering --
        "serverless-engineer": ("Backend Engineering", "backend-eng", "Serverless Engineer", "#00bbff"),
        # -- Infrastructure --
        "service-discovery-engineer": ("Infrastructure", "infrastructure", "Service Discovery Engineer", "#8855ff"),
        "service-mesh-engineer": ("Infrastructure", "infrastructure", "Service Mesh Engineer", "#8855ff"),
        # -- Security --
        "session-security-engineer": ("Security", "security", "Session Security Engineer", "#ff0055"),
        # -- Product Engineering --
        "settings-engineer": ("Product Engineering", "product-eng", "Settings Engineer", "#39ff14"),
        # -- Specialized --
        "sleep-tracking-engineer": ("Specialized", "specialized", "Sleep Tracking Engineer", "#00ffcc"),
        # -- Quality Engineering --
        "smoke-testing-engineer": ("Quality Engineering", "quality-eng", "Smoke Testing Engineer", "#ff3388"),
        "snapshot-testing-engineer": ("Quality Engineering", "quality-eng", "Snapshot Testing Engineer", "#ff3388"),
        # -- Specialized --
        "social-fitness-engineer": ("Specialized", "specialized", "Social Fitness Engineer", "#00ffcc"),
        # -- Product Engineering --
        "social-sharing-engineer": ("Product Engineering", "product-eng", "Social Sharing Engineer", "#39ff14"),
        # -- Architecture --
        "software-architect": ("Architecture", "architecture", "Software Architect", "#ff9500"),
        # -- Product Engineering --
        "sound-design-engineer": ("Product Engineering", "product-eng", "Sound Design Engineer", "#39ff14"),
        # -- Data Engineering --
        "sql-optimization-engineer": ("Data Engineering", "data-eng", "SQL Optimization Engineer", "#ffaa00"),
        # -- Backend Engineering --
        "sqlmodel-engineer": ("Backend Engineering", "backend-eng", "SQLModel Engineer", "#00bbff"),
        # -- Infrastructure --
        "sre-engineer": ("Infrastructure", "infrastructure", "SRE Engineer", "#8855ff"),
        "ssl-dns-engineer": ("Infrastructure", "infrastructure", "SSL DNS Engineer", "#8855ff"),
        # -- Specialized --
        "step-counter-engineer": ("Specialized", "specialized", "Step Counter Engineer", "#00ffcc"),
        # -- Architecture --
        "storage-architect": ("Architecture", "architecture", "Storage Architect", "#ff9500"),
        # -- Infrastructure --
        "storage-engineer": ("Infrastructure", "infrastructure", "Storage Engineer", "#8855ff"),
        # -- Platform Leadership --
        "storage-systems-lead": ("Platform Leadership", "platform-lead", "Storage Systems Lead", "#00ccff"),
        # -- Product Engineering --
        "streak-engine-engineer": ("Product Engineering", "product-eng", "Streak Engine Engineer", "#39ff14"),
        # -- Specialized --
        "streak-engine-specialist": ("Specialized", "specialized", "Streak Engine Specialist", "#00ffcc"),
        # -- Data Engineering --
        "streaming-data-engineer": ("Data Engineering", "data-eng", "Streaming Data Engineer", "#ffaa00"),
        # -- Infrastructure --
        "streaming-infrastructure-engineer": ("Infrastructure", "infrastructure", "Streaming Infrastructure Engineer", "#8855ff"),
        # -- Platform Leadership --
        "streaming-platform-lead": ("Platform Leadership", "platform-lead", "Streaming Platform Lead", "#00ccff"),
        # -- Specialized --
        "strength-training-engineer": ("Specialized", "specialized", "Strength Training Engineer", "#00ffcc"),
        # -- Product Engineering --
        "subscription-lifecycle-engineer": ("Product Engineering", "product-eng", "Subscription Lifecycle Engineer", "#39ff14"),
        # -- Growth Leadership --
        "subscription-systems-lead": ("Growth Leadership", "growth-lead", "Subscription Systems Lead", "#55ffcc"),
        # -- Specialized --
        "supplement-tracking-engineer": ("Specialized", "specialized", "Supplement Tracking Engineer", "#00ffcc"),
        # -- Security --
        "supply-chain-security-engineer": ("Security", "security", "Supply Chain Security Engineer", "#ff0055"),
        # -- Specialized --
        "swimming-tracking-engineer": ("Specialized", "specialized", "Swimming Tracking Engineer", "#00ffcc"),
        # -- Architecture --
        "systems-architect": ("Architecture", "architecture", "Systems Architect", "#ff9500"),
        # -- Tech Leads --
        "tech-lead-agent-orchestration": ("Tech Leads", "tech-lead", "Tech Lead Agent Orchestration", "#ffffff"),
        "tech-lead-ai-systems": ("Tech Leads", "tech-lead", "Tech Lead AI Systems", "#ffffff"),
        "tech-lead-analytics": ("Tech Leads", "tech-lead", "Tech Lead Analytics", "#ffffff"),
        "tech-lead-android": ("Tech Leads", "tech-lead", "Tech Lead Android", "#ffffff"),
        "tech-lead-api": ("Tech Leads", "tech-lead", "Tech Lead API", "#ffffff"),
        "tech-lead-backend": ("Tech Leads", "tech-lead", "Tech Lead Backend", "#ffffff"),
        "tech-lead-ci-cd": ("Tech Leads", "tech-lead", "Tech Lead CI CD", "#ffffff"),
        "tech-lead-cloud": ("Tech Leads", "tech-lead", "Tech Lead Cloud", "#ffffff"),
        "tech-lead-data-engineering": ("Tech Leads", "tech-lead", "Tech Lead Data Engineering", "#ffffff"),
        "tech-lead-design-systems": ("Tech Leads", "tech-lead", "Tech Lead Design Systems", "#ffffff"),
        "tech-lead-devops": ("Tech Leads", "tech-lead", "Tech Lead DevOps", "#ffffff"),
        "tech-lead-experimentation": ("Tech Leads", "tech-lead", "Tech Lead Experimentation", "#ffffff"),
        "tech-lead-flutter": ("Tech Leads", "tech-lead", "Tech Lead Flutter", "#ffffff"),
        "tech-lead-graphql": ("Tech Leads", "tech-lead", "Tech Lead GraphQL", "#ffffff"),
        "tech-lead-growth": ("Tech Leads", "tech-lead", "Tech Lead Growth", "#ffffff"),
        "tech-lead-identity-auth": ("Tech Leads", "tech-lead", "Tech Lead Identity Auth", "#ffffff"),
        "tech-lead-infrastructure": ("Tech Leads", "tech-lead", "Tech Lead Infrastructure", "#ffffff"),
        "tech-lead-ios": ("Tech Leads", "tech-lead", "Tech Lead iOS", "#ffffff"),
        "tech-lead-llm-integration": ("Tech Leads", "tech-lead", "Tech Lead LLM Integration", "#ffffff"),
        "tech-lead-ml-systems": ("Tech Leads", "tech-lead", "Tech Lead ML Systems", "#ffffff"),
        "tech-lead-mobile": ("Tech Leads", "tech-lead", "Tech Lead Mobile", "#ffffff"),
        "tech-lead-monetization": ("Tech Leads", "tech-lead", "Tech Lead Monetization", "#ffffff"),
        "tech-lead-observability": ("Tech Leads", "tech-lead", "Tech Lead Observability", "#ffffff"),
        "tech-lead-on-device-ai": ("Tech Leads", "tech-lead", "Tech Lead On-Device AI", "#ffffff"),
        "tech-lead-payments": ("Tech Leads", "tech-lead", "Tech Lead Payments", "#ffffff"),
        "tech-lead-performance": ("Tech Leads", "tech-lead", "Tech Lead Performance", "#ffffff"),
        "tech-lead-platform": ("Tech Leads", "tech-lead", "Tech Lead Platform", "#ffffff"),
        "tech-lead-react-native": ("Tech Leads", "tech-lead", "Tech Lead React Native", "#ffffff"),
        "tech-lead-realtime": ("Tech Leads", "tech-lead", "Tech Lead Realtime", "#ffffff"),
        "tech-lead-reliability": ("Tech Leads", "tech-lead", "Tech Lead Reliability", "#ffffff"),
        "tech-lead-scalability": ("Tech Leads", "tech-lead", "Tech Lead Scalability", "#ffffff"),
        "tech-lead-security": ("Tech Leads", "tech-lead", "Tech Lead Security", "#ffffff"),
        "tech-lead-sre": ("Tech Leads", "tech-lead", "Tech Lead SRE", "#ffffff"),
        "tech-lead-test-automation": ("Tech Leads", "tech-lead", "Tech Lead Test Automation", "#ffffff"),
        "tech-lead-ux-engineering": ("Tech Leads", "tech-lead", "Tech Lead UX Engineering", "#ffffff"),
        # -- Architecture --
        "technical-debt-architect": ("Architecture", "architecture", "Technical Debt Architect", "#ff9500"),
        # -- Specialized --
        "telehealth-integration-engineer": ("Specialized", "specialized", "Telehealth Integration Engineer", "#00ffcc"),
        # -- Infrastructure --
        "terraform-engineer": ("Infrastructure", "infrastructure", "Terraform Engineer", "#8855ff"),
        # -- Quality Engineering --
        "test-coverage-engineer": ("Quality Engineering", "quality-eng", "Test Coverage Engineer", "#ff3388"),
        "test-data-engineer": ("Quality Engineering", "quality-eng", "Test Data Engineer", "#ff3388"),
        "test-environment-engineer": ("Quality Engineering", "quality-eng", "Test Environment Engineer", "#ff3388"),
        "test-infrastructure-engineer": ("Quality Engineering", "quality-eng", "Test Infrastructure Engineer", "#ff3388"),
        "test-monitoring-engineer": ("Quality Engineering", "quality-eng", "Test Monitoring Engineer", "#ff3388"),
        "test-orchestration-engineer": ("Quality Engineering", "quality-eng", "Test Orchestration Engineer", "#ff3388"),
        "test-reporting-engineer": ("Quality Engineering", "quality-eng", "Test Reporting Engineer", "#ff3388"),
        "test-strategy-engineer": ("Quality Engineering", "quality-eng", "Test Strategy Engineer", "#ff3388"),
        # -- Architecture --
        "testing-architecture-specialist": ("Architecture", "architecture", "Testing Architecture Specialist", "#ff9500"),
        # -- Security --
        "threat-modeling-engineer": ("Security", "security", "Threat Modeling Engineer", "#ff0055"),
        # -- AI Engineering --
        "time-series-ai-engineer": ("AI Engineering", "ai-engineering", "Time Series AI Engineer", "#aa00ff"),
        # -- Product Engineering --
        "ui-systems-engineer": ("Product Engineering", "product-eng", "UI Systems Engineer", "#39ff14"),
        # -- Quality Engineering --
        "unit-testing-engineer": ("Quality Engineering", "quality-eng", "Unit Testing Engineer", "#ff3388"),
        "usability-testing-engineer": ("Quality Engineering", "quality-eng", "Usability Testing Engineer", "#ff3388"),
        # -- Product Engineering --
        "user-acquisition-engineer": ("Product Engineering", "product-eng", "User Acquisition Engineer", "#39ff14"),
        # -- Data Engineering --
        "user-behavior-analytics-engineer": ("Data Engineering", "data-eng", "User Behavior Analytics Engineer", "#ffaa00"),
        # -- Growth Leadership --
        "user-experimentation-lead": ("Growth Leadership", "growth-lead", "User Experimentation Lead", "#55ffcc"),
        # -- Product Engineering --
        "user-profile-engineer": ("Product Engineering", "product-eng", "User Profile Engineer", "#39ff14"),
        "ux-engineer": ("Product Engineering", "product-eng", "UX Engineer", "#39ff14"),
        # -- Growth Leadership --
        "viral-systems-lead": ("Growth Leadership", "growth-lead", "Viral Systems Lead", "#55ffcc"),
        # -- Quality Engineering --
        "visual-regression-engineer": ("Quality Engineering", "quality-eng", "Visual Regression Engineer", "#ff3388"),
        # -- AI Engineering --
        "voice-interface-engineer": ("AI Engineering", "ai-engineering", "Voice Interface Engineer", "#aa00ff"),
        # -- CTO Office --
        "vp-of-ai-systems": ("CTO Office", "executive", "VP of AI Systems", "#ff0055"),
        "vp-of-cloud-systems": ("CTO Office", "executive", "VP of Cloud Systems", "#ff0055"),
        "vp-of-data": ("CTO Office", "executive", "VP of Data", "#ff0055"),
        "vp-of-developer-experience": ("CTO Office", "executive", "VP of Developer Experience", "#ff0055"),
        "vp-of-engineering": ("CTO Office", "executive", "VP of Engineering", "#ff0055"),
        "vp-of-growth-engineering": ("CTO Office", "executive", "VP of Growth Engineering", "#ff0055"),
        "vp-of-infrastructure": ("CTO Office", "executive", "VP of Infrastructure", "#ff0055"),
        "vp-of-mobile-engineering": ("CTO Office", "executive", "VP of Mobile Engineering", "#ff0055"),
        "vp-of-platform": ("CTO Office", "executive", "VP of Platform", "#ff0055"),
        "vp-of-security": ("CTO Office", "executive", "VP of Security", "#ff0055"),
        # -- Security --
        "vulnerability-management-engineer": ("Security", "security", "Vulnerability Management Engineer", "#ff0055"),
        # -- Data Engineering --
        "wearable-data-engineer": ("Data Engineering", "data-eng", "Wearable Data Engineer", "#ffaa00"),
        # -- Specialized --
        "wearable-integration-engineer": ("Specialized", "specialized", "Wearable Integration Engineer", "#00ffcc"),
        # -- Backend Engineering --
        "websocket-engineer": ("Backend Engineering", "backend-eng", "WebSocket Engineer", "#00bbff"),
        # -- Specialized --
        "weight-tracking-engineer": ("Specialized", "specialized", "Weight Tracking Engineer", "#00ffcc"),
        "wellness-report-engineer": ("Specialized", "specialized", "Wellness Report Engineer", "#00ffcc"),
        "yoga-pose-engineer": ("Specialized", "specialized", "Yoga Pose Engineer", "#00ffcc"),
        # -- Architecture --
        "zero-downtime-architect": ("Architecture", "architecture", "Zero Downtime Architect", "#ff9500"),
        # -- Security --
        "zero-trust-architect": ("Security", "security", "Zero Trust Architect", "#ff0055"),
        # -- Previously Registered --
        "ai-anomaly-detector": ("Specialists", "specialist", "Ai Anomaly Detector", "#888888"),
        "ai-barcode-processor": ("Specialists", "specialist", "Ai Barcode Processor", "#888888"),
        "ai-calorie-estimator": ("Specialists", "specialist", "Ai Calorie Estimator", "#888888"),
        "ai-coach-engine": ("Specialists", "specialist", "Ai Coach Engine", "#888888"),
        "ai-confidence-scorer": ("Specialists", "specialist", "Ai Confidence Scorer", "#888888"),
        "ai-cost-optimizer": ("Specialists", "specialist", "Ai Cost Optimizer", "#888888"),
        "ai-dietary-advisor": ("Specialists", "specialist", "Ai Dietary Advisor", "#888888"),
        "ai-embedding-expert": ("Specialists", "specialist", "Ai Embedding Expert", "#888888"),
        "ai-feedback-loop": ("Specialists", "specialist", "Ai Feedback Loop", "#888888"),
        "ai-fine-tuning": ("Specialists", "specialist", "Ai Fine Tuning", "#888888"),
        "ai-food-database-curator": ("Specialists", "specialist", "Ai Food Database Curator", "#888888"),
        "ai-food-recognition": ("Specialists", "specialist", "Ai Food Recognition", "#888888"),
        "ai-hydration-advisor": ("Specialists", "specialist", "Ai Hydration Advisor", "#888888"),
        "ai-label-ocr": ("Specialists", "specialist", "Ai Label Ocr", "#888888"),
        "ai-meal-planner": ("Specialists", "specialist", "Ai Meal Planner", "#888888"),
        "ai-multi-modal": ("Specialists", "specialist", "Ai Multi Modal", "#888888"),
        "ai-nutrition-analyzer": ("Specialists", "specialist", "Ai Nutrition Analyzer", "#888888"),
        "ai-nutrition-nlp": ("Specialists", "specialist", "Ai Nutrition Nlp", "#888888"),
        "ai-personalization": ("Specialists", "specialist", "Ai Personalization", "#888888"),
        "ai-portion-estimator": ("Specialists", "specialist", "Ai Portion Estimator", "#888888"),
        "ai-prompt-engineer": ("Specialists", "specialist", "Ai Prompt Engineer", "#888888"),
        "ai-recipe-generator": ("Specialists", "specialist", "Ai Recipe Generator", "#888888"),
        "ai-supplement-advisor": ("Specialists", "specialist", "Ai Supplement Advisor", "#888888"),
        "ai-trend-predictor": ("Specialists", "specialist", "Ai Trend Predictor", "#888888"),
        "ai-vision-expert": ("Specialists", "specialist", "Ai Vision Expert", "#888888"),
        "ai-voice-food-log": ("Specialists", "specialist", "Ai Voice Food Log", "#888888"),
        "api-contract-guardian": ("Specialists", "specialist", "Api Contract Guardian", "#888888"),
        "backend-typescript-architect": ("Specialists", "specialist", "Backend Typescript Architect", "#888888"),
        "biomechanics-expert": ("Specialists", "specialist", "Biomechanics Expert", "#888888"),
        "biz-app-store-aso": ("Specialists", "specialist", "Biz App Store Aso", "#888888"),
        "biz-brand-strategy": ("Specialists", "specialist", "Biz Brand Strategy", "#888888"),
        "biz-churn-analyst": ("Specialists", "specialist", "Biz Churn Analyst", "#888888"),
        "biz-community-manager": ("Specialists", "specialist", "Biz Community Manager", "#888888"),
        "biz-content-marketing": ("Specialists", "specialist", "Biz Content Marketing", "#888888"),
        "biz-customer-support": ("Specialists", "specialist", "Biz Customer Support", "#888888"),
        "biz-data-privacy": ("Specialists", "specialist", "Biz Data Privacy", "#888888"),
        "biz-email-marketing": ("Specialists", "specialist", "Biz Email Marketing", "#888888"),
        "biz-financial-model": ("Specialists", "specialist", "Biz Financial Model", "#888888"),
        "biz-growth-hacker": ("Specialists", "specialist", "Biz Growth Hacker", "#888888"),
        "biz-influencer-marketing": ("Specialists", "specialist", "Biz Influencer Marketing", "#888888"),
        "biz-legal-compliance": ("Specialists", "specialist", "Biz Legal Compliance", "#888888"),
        "biz-localization-pm": ("Specialists", "specialist", "Biz Localization Pm", "#888888"),
        "biz-market-research": ("Specialists", "specialist", "Biz Market Research", "#888888"),
        "biz-partnership-manager": ("Specialists", "specialist", "Biz Partnership Manager", "#888888"),
        "biz-pricing-strategy": ("Specialists", "specialist", "Biz Pricing Strategy", "#888888"),
        "biz-push-strategy": ("Specialists", "specialist", "Biz Push Strategy", "#888888"),
        "biz-revenue-analyst": ("Specialists", "specialist", "Biz Revenue Analyst", "#888888"),
        "biz-user-acquisition": ("Specialists", "specialist", "Biz User Acquisition", "#888888"),
        "biz-user-research": ("Specialists", "specialist", "Biz User Research", "#888888"),
        "cardio-machines-expert": ("Specialists", "specialist", "Cardio Machines Expert", "#888888"),
        "customer-support-architect": ("Specialists", "specialist", "Customer Support Architect", "#888888"),
        "dashboard-backend-engineer": ("Dashboard", "dashboard", "Dashboard Backend Engineer", "#666666"),
        "dashboard-inspector": ("Dashboard", "dashboard", "Dashboard Inspector", "#666666"),
        "dashboard-ui-engineer": ("Dashboard", "dashboard", "Dashboard Ui Engineer", "#666666"),
        "data-analyst": ("Specialists", "specialist", "Data Analyst", "#888888"),
        "data-migration-agent": ("Specialists", "specialist", "Data Migration Agent", "#888888"),
        "devops-app-store": ("Specialists", "specialist", "Devops App Store", "#888888"),
        "devops-backup": ("Specialists", "specialist", "Devops Backup", "#888888"),
        "devops-cdn": ("Specialists", "specialist", "Devops Cdn", "#888888"),
        "devops-cost-optimization": ("Specialists", "specialist", "Devops Cost Optimization", "#888888"),
        "devops-deployer": ("Specialists", "specialist", "Devops Deployer", "#888888"),
        "devops-docker-expert": ("Specialists", "specialist", "Devops Docker Expert", "#888888"),
        "devops-eas-build": ("Specialists", "specialist", "Devops Eas Build", "#888888"),
        "devops-github-actions": ("Specialists", "specialist", "Devops Github Actions", "#888888"),
        "devops-incident-response": ("Specialists", "specialist", "Devops Incident Response", "#888888"),
        "devops-k8s-expert": ("Specialists", "specialist", "Devops K8S Expert", "#888888"),
        "devops-load-balancer": ("Specialists", "specialist", "Devops Load Balancer", "#888888"),
        "devops-log-aggregation": ("Specialists", "specialist", "Devops Log Aggregation", "#888888"),
        "devops-monitoring": ("Specialists", "specialist", "Devops Monitoring", "#888888"),
        "devops-secrets-mgmt": ("Specialists", "specialist", "Devops Secrets Mgmt", "#888888"),
        "devops-ssl-dns": ("Specialists", "specialist", "Devops Ssl Dns", "#888888"),
        "devops-terraform": ("Specialists", "specialist", "Devops Terraform", "#888888"),
        "eng-accessibility": ("Engineering", "engineering", "Eng Accessibility", "#00bbff"),
        "eng-ai-agent": ("Engineering", "engineering", "Eng Ai Agent", "#00bbff"),
        "eng-ai-evaluation": ("Engineering", "engineering", "Eng Ai Evaluation", "#00bbff"),
        "eng-ai-orchestration": ("Engineering", "engineering", "Eng Ai Orchestration", "#00bbff"),
        "eng-ai-safety": ("Engineering", "engineering", "Eng Ai Safety", "#00bbff"),
        "eng-ai-systems-architect": ("Engineering", "engineering", "Eng Ai Systems Architect", "#00bbff"),
        "eng-alembic-expert": ("Engineering", "engineering", "Eng Alembic Expert", "#00bbff"),
        "eng-analytics": ("Engineering", "engineering", "Eng Analytics", "#00bbff"),
        "eng-android": ("Engineering", "engineering", "Eng Android", "#00bbff"),
        "eng-api": ("Engineering", "engineering", "Eng Api", "#00bbff"),
        "eng-api-design": ("Engineering", "engineering", "Eng Api Design", "#00bbff"),
        "eng-api-gateway": ("Engineering", "engineering", "Eng Api Gateway", "#00bbff"),
        "eng-api-testing": ("Engineering", "engineering", "Eng Api Testing", "#00bbff"),
        "eng-applied-ai": ("Engineering", "engineering", "Eng Applied Ai", "#00bbff"),
        "eng-appsec": ("Engineering", "engineering", "Eng Appsec", "#00bbff"),
        "eng-ar-vr": ("Engineering", "engineering", "Eng Ar Vr", "#00bbff"),
        "eng-async-python": ("Engineering", "engineering", "Eng Async Python", "#00bbff"),
        "eng-backend-go": ("Engineering", "engineering", "Eng Backend Go", "#00bbff"),
        "eng-backend-java": ("Engineering", "engineering", "Eng Backend Java", "#00bbff"),
        "eng-backend-nodejs": ("Engineering", "engineering", "Eng Backend Nodejs", "#00bbff"),
        "eng-backend-performance": ("Engineering", "engineering", "Eng Backend Performance", "#00bbff"),
        "eng-backend-platform": ("Engineering", "engineering", "Eng Backend Platform", "#00bbff"),
        "eng-backend-python": ("Engineering", "engineering", "Eng Backend Python", "#00bbff"),
        "eng-backend-reliability": ("Engineering", "engineering", "Eng Backend Reliability", "#00bbff"),
        "eng-background-tasks": ("Engineering", "engineering", "Eng Background Tasks", "#00bbff"),
        "eng-bi": ("Engineering", "engineering", "Eng Bi", "#00bbff"),
        "eng-big-data": ("Engineering", "engineering", "Eng Big Data", "#00bbff"),
        "eng-blockchain": ("Engineering", "engineering", "Eng Blockchain", "#00bbff"),
        "eng-caching-strategy": ("Engineering", "engineering", "Eng Caching Strategy", "#00bbff"),
        "eng-celery-expert": ("Engineering", "engineering", "Eng Celery Expert", "#00bbff"),
        "eng-chief-ai-officer": ("Engineering", "engineering", "Eng Chief Ai Officer", "#00bbff"),
        "eng-cicd": ("Engineering", "engineering", "Eng Cicd", "#00bbff"),
        "eng-cloud-architect": ("Engineering", "engineering", "Eng Cloud Architect", "#00bbff"),
        "eng-cloud-infra": ("Engineering", "engineering", "Eng Cloud Infra", "#00bbff"),
        "eng-cloud-security": ("Engineering", "engineering", "Eng Cloud Security", "#00bbff"),
        "eng-computer-vision": ("Engineering", "engineering", "Eng Computer Vision", "#00bbff"),
        "eng-csv-export": ("Engineering", "engineering", "Eng Csv Export", "#00bbff"),
        "eng-cto": ("Engineering", "engineering", "Eng Cto", "#00bbff"),
        "eng-data": ("Engineering", "engineering", "Eng Data", "#00bbff"),
        "eng-data-architect": ("Engineering", "engineering", "Eng Data Architect", "#00bbff"),
        "eng-data-pipeline": ("Engineering", "engineering", "Eng Data Pipeline", "#00bbff"),
        "eng-data-seeding": ("Engineering", "engineering", "Eng Data Seeding", "#00bbff"),
        "eng-data-viz": ("Engineering", "engineering", "Eng Data Viz", "#00bbff"),
        "eng-data-warehouse": ("Engineering", "engineering", "Eng Data Warehouse", "#00bbff"),
        "eng-deep-learning": ("Engineering", "engineering", "Eng Deep Learning", "#00bbff"),
        "eng-design-systems": ("Engineering", "engineering", "Eng Design Systems", "#00bbff"),
        "eng-devops": ("Engineering", "engineering", "Eng Devops", "#00bbff"),
        "eng-devsecops": ("Engineering", "engineering", "Eng Devsecops", "#00bbff"),
        "eng-distributed-systems": ("Engineering", "engineering", "Eng Distributed Systems", "#00bbff"),
        "eng-edge-computing": ("Engineering", "engineering", "Eng Edge Computing", "#00bbff"),
        "eng-email-service": ("Engineering", "engineering", "Eng Email Service", "#00bbff"),
        "eng-embedded": ("Engineering", "engineering", "Eng Embedded", "#00bbff"),
        "eng-enterprise-architect": ("Engineering", "engineering", "Eng Enterprise Architect", "#00bbff"),
        "eng-event-driven": ("Engineering", "engineering", "Eng Event Driven", "#00bbff"),
        "eng-experimentation": ("Engineering", "engineering", "Eng Experimentation", "#00bbff"),
        "eng-fastapi-advanced": ("Engineering", "engineering", "Eng Fastapi Advanced", "#00bbff"),
        "eng-fastapi-auth": ("Engineering", "engineering", "Eng Fastapi Auth", "#00bbff"),
        "eng-fastapi-websocket": ("Engineering", "engineering", "Eng Fastapi Websocket", "#00bbff"),
        "eng-feature-flags": ("Engineering", "engineering", "Eng Feature Flags", "#00bbff"),
        "eng-file-upload": ("Engineering", "engineering", "Eng File Upload", "#00bbff"),
        "eng-fintech": ("Engineering", "engineering", "Eng Fintech", "#00bbff"),
        "eng-flutter": ("Engineering", "engineering", "Eng Flutter", "#00bbff"),
        "eng-frontend-nextjs": ("Engineering", "engineering", "Eng Frontend Nextjs", "#00bbff"),
        "eng-frontend-performance": ("Engineering", "engineering", "Eng Frontend Performance", "#00bbff"),
        "eng-frontend-react": ("Engineering", "engineering", "Eng Frontend React", "#00bbff"),
        "eng-frontend-testing": ("Engineering", "engineering", "Eng Frontend Testing", "#00bbff"),
        "eng-frontend-vue": ("Engineering", "engineering", "Eng Frontend Vue", "#00bbff"),
        "eng-gaming": ("Engineering", "engineering", "Eng Gaming", "#00bbff"),
        "eng-graphql": ("Engineering", "engineering", "Eng Graphql", "#00bbff"),
        "eng-growth": ("Engineering", "engineering", "Eng Growth", "#00bbff"),
        "eng-grpc": ("Engineering", "engineering", "Eng Grpc", "#00bbff"),
        "eng-hpc": ("Engineering", "engineering", "Eng Hpc", "#00bbff"),
        "eng-identity": ("Engineering", "engineering", "Eng Identity", "#00bbff"),
        "eng-infra-automation": ("Engineering", "engineering", "Eng Infra Automation", "#00bbff"),
        "eng-integration": ("Engineering", "engineering", "Eng Integration", "#00bbff"),
        "eng-internal-tools": ("Engineering", "engineering", "Eng Internal Tools", "#00bbff"),
        "eng-ios": ("Engineering", "engineering", "Eng Ios", "#00bbff"),
        "eng-iot": ("Engineering", "engineering", "Eng Iot", "#00bbff"),
        "eng-kubernetes": ("Engineering", "engineering", "Eng Kubernetes", "#00bbff"),
        "eng-llm": ("Engineering", "engineering", "Eng Llm", "#00bbff"),
        "eng-logging-monitoring": ("Engineering", "engineering", "Eng Logging Monitoring", "#00bbff"),
        "eng-micro-frontend": ("Engineering", "engineering", "Eng Micro Frontend", "#00bbff"),
        "eng-microservices": ("Engineering", "engineering", "Eng Microservices", "#00bbff"),
        "eng-ml": ("Engineering", "engineering", "Eng Ml", "#00bbff"),
        "eng-mlops": ("Engineering", "engineering", "Eng Mlops", "#00bbff"),
        "eng-mobile-performance": ("Engineering", "engineering", "Eng Mobile Performance", "#00bbff"),
        "eng-mobile-qa": ("Engineering", "engineering", "Eng Mobile Qa", "#00bbff"),
        "eng-nlp": ("Engineering", "engineering", "Eng Nlp", "#00bbff"),
        "eng-notification-service": ("Engineering", "engineering", "Eng Notification Service", "#00bbff"),
        "eng-oauth-provider": ("Engineering", "engineering", "Eng Oauth Provider", "#00bbff"),
        "eng-observability": ("Engineering", "engineering", "Eng Observability", "#00bbff"),
        "eng-pdf-generation": ("Engineering", "engineering", "Eng Pdf Generation", "#00bbff"),
        "eng-pentester": ("Engineering", "engineering", "Eng Pentester", "#00bbff"),
        "eng-performance-testing": ("Engineering", "engineering", "Eng Performance Testing", "#00bbff"),
        "eng-platform": ("Engineering", "engineering", "Eng Platform", "#00bbff"),
        "eng-postgres-expert": ("Engineering", "engineering", "Eng Postgres Expert", "#00bbff"),
        "eng-principal-architect": ("Engineering", "engineering", "Eng Principal Architect", "#00bbff"),
        "eng-product": ("Engineering", "engineering", "Eng Product", "#00bbff"),
        "eng-prompt": ("Engineering", "engineering", "Eng Prompt", "#00bbff"),
        "eng-pydantic-expert": ("Engineering", "engineering", "Eng Pydantic Expert", "#00bbff"),
        "eng-python-profiling": ("Engineering", "engineering", "Eng Python Profiling", "#00bbff"),
        "eng-qa": ("Engineering", "engineering", "Eng Qa", "#00bbff"),
        "eng-qa-automation": ("Engineering", "engineering", "Eng Qa Automation", "#00bbff"),
        "eng-quality": ("Engineering", "engineering", "Eng Quality", "#00bbff"),
        "eng-rate-limiter": ("Engineering", "engineering", "Eng Rate Limiter", "#00bbff"),
        "eng-react-native": ("Engineering", "engineering", "Eng React Native", "#00bbff"),
        "eng-realtime-systems": ("Engineering", "engineering", "Eng Realtime Systems", "#00bbff"),
        "eng-recommendations": ("Engineering", "engineering", "Eng Recommendations", "#00bbff"),
        "eng-redis-expert": ("Engineering", "engineering", "Eng Redis Expert", "#00bbff"),
        "eng-rn-accessibility-expert": ("Engineering", "engineering", "Eng Rn Accessibility Expert", "#00bbff"),
        "eng-rn-biometrics": ("Engineering", "engineering", "Eng Rn Biometrics", "#00bbff"),
        "eng-rn-bottom-sheet": ("Engineering", "engineering", "Eng Rn Bottom Sheet", "#00bbff"),
        "eng-rn-calendar": ("Engineering", "engineering", "Eng Rn Calendar", "#00bbff"),
        "eng-rn-camera": ("Engineering", "engineering", "Eng Rn Camera", "#00bbff"),
        "eng-rn-charts-advanced": ("Engineering", "engineering", "Eng Rn Charts Advanced", "#00bbff"),
        "eng-rn-deep-linking": ("Engineering", "engineering", "Eng Rn Deep Linking", "#00bbff"),
        "eng-rn-error-boundary": ("Engineering", "engineering", "Eng Rn Error Boundary", "#00bbff"),
        "eng-rn-forms": ("Engineering", "engineering", "Eng Rn Forms", "#00bbff"),
        "eng-rn-gestures": ("Engineering", "engineering", "Eng Rn Gestures", "#00bbff"),
        "eng-rn-haptics": ("Engineering", "engineering", "Eng Rn Haptics", "#00bbff"),
        "eng-rn-i18n": ("Engineering", "engineering", "Eng Rn I18N", "#00bbff"),
        "eng-rn-lists": ("Engineering", "engineering", "Eng Rn Lists", "#00bbff"),
        "eng-rn-maps": ("Engineering", "engineering", "Eng Rn Maps", "#00bbff"),
        "eng-rn-navigator": ("Engineering", "engineering", "Eng Rn Navigator", "#00bbff"),
        "eng-rn-notifications": ("Engineering", "engineering", "Eng Rn Notifications", "#00bbff"),
        "eng-rn-offline": ("Engineering", "engineering", "Eng Rn Offline", "#00bbff"),
        "eng-rn-onboarding-ux": ("Engineering", "engineering", "Eng Rn Onboarding Ux", "#00bbff"),
        "eng-rn-ota": ("Engineering", "engineering", "Eng Rn Ota", "#00bbff"),
        "eng-rn-search": ("Engineering", "engineering", "Eng Rn Search", "#00bbff"),
        "eng-rn-share": ("Engineering", "engineering", "Eng Rn Share", "#00bbff"),
        "eng-rn-skeleton": ("Engineering", "engineering", "Eng Rn Skeleton", "#00bbff"),
        "eng-rn-splash": ("Engineering", "engineering", "Eng Rn Splash", "#00bbff"),
        "eng-rn-state": ("Engineering", "engineering", "Eng Rn State", "#00bbff"),
        "eng-rn-storage": ("Engineering", "engineering", "Eng Rn Storage", "#00bbff"),
        "eng-rn-testing": ("Engineering", "engineering", "Eng Rn Testing", "#00bbff"),
        "eng-rn-theming": ("Engineering", "engineering", "Eng Rn Theming", "#00bbff"),
        "eng-rn-video": ("Engineering", "engineering", "Eng Rn Video", "#00bbff"),
        "eng-rn-webview": ("Engineering", "engineering", "Eng Rn Webview", "#00bbff"),
        "eng-rn-workout-ui": ("Engineering", "engineering", "Eng Rn Workout Ui", "#00bbff"),
        "eng-robotics": ("Engineering", "engineering", "Eng Robotics", "#00bbff"),
        "eng-sdk": ("Engineering", "engineering", "Eng Sdk", "#00bbff"),
        "eng-search": ("Engineering", "engineering", "Eng Search", "#00bbff"),
        "eng-search-engine": ("Engineering", "engineering", "Eng Search Engine", "#00bbff"),
        "eng-security": ("Engineering", "engineering", "Eng Security", "#00bbff"),
        "eng-security-architect": ("Engineering", "engineering", "Eng Security Architect", "#00bbff"),
        "eng-security-testing": ("Engineering", "engineering", "Eng Security Testing", "#00bbff"),
        "eng-solutions-architect": ("Engineering", "engineering", "Eng Solutions Architect", "#00bbff"),
        "eng-sqlmodel-expert": ("Engineering", "engineering", "Eng Sqlmodel Expert", "#00bbff"),
        "eng-sre": ("Engineering", "engineering", "Eng Sre", "#00bbff"),
        "eng-streaming-data": ("Engineering", "engineering", "Eng Streaming Data", "#00bbff"),
        "eng-systems": ("Engineering", "engineering", "Eng Systems", "#00bbff"),
        "eng-test-infra": ("Engineering", "engineering", "Eng Test Infra", "#00bbff"),
        "eng-third-party": ("Engineering", "engineering", "Eng Third Party", "#00bbff"),
        "eng-ui": ("Engineering", "engineering", "Eng Ui", "#00bbff"),
        "eng-vp-engineering": ("Engineering", "engineering", "Eng Vp Engineering", "#00bbff"),
        "eng-web-animations": ("Engineering", "engineering", "Eng Web Animations", "#00bbff"),
        "eng-webhook-handler": ("Engineering", "engineering", "Eng Webhook Handler", "#00bbff"),
        "eng-webhooks": ("Engineering", "engineering", "Eng Webhooks", "#00bbff"),
        "exercise-physiology-expert": ("Specialists", "specialist", "Exercise Physiology Expert", "#888888"),
        "fitness-ai-vision-expert": ("Specialists", "specialist", "Fitness Ai Vision Expert", "#888888"),
        "fitness-compliance-agent": ("Specialists", "specialist", "Fitness Compliance Agent", "#888888"),
        "fitness-content-creator": ("Specialists", "specialist", "Fitness Content Creator", "#888888"),
        "fitness-data-scientist": ("Specialists", "specialist", "Fitness Data Scientist", "#888888"),
        "fitness-mobile-expert": ("Specialists", "specialist", "Fitness Mobile Expert", "#888888"),
        "fitness-science-advisor": ("Specialists", "specialist", "Fitness Science Advisor", "#888888"),
        "fitsia-admin-servicio-tecnico": ("Fitsia Core", "fitsia", "Fitsia Admin Servicio Tecnico", "#4285F4"),
        "fitsia-administrativo-servicio-tecnico": ("Fitsia Core", "fitsia", "Fitsia Administrativo Servicio Tecn", "#4285F4"),
        "fitsia-ai-coach": ("Fitsia Core", "fitsia", "Fitsia Ai Coach", "#4285F4"),
        "fitsia-analista-control-gestion": ("Fitsia Core", "fitsia", "Fitsia Analista Control Gestion", "#4285F4"),
        "fitsia-analista-datos-inventario": ("Fitsia Core", "fitsia", "Fitsia Analista Datos Inventario", "#4285F4"),
        "fitsia-animation-specialist": ("Fitsia Core", "fitsia", "Fitsia Animation Specialist", "#4285F4"),
        "fitsia-api-fuzzer": ("Fitsia Core", "fitsia", "Fitsia Api Fuzzer", "#4285F4"),
        "fitsia-api-versioning-specialist": ("Fitsia Core", "fitsia", "Fitsia Api Versioning Specialist", "#4285F4"),
        "fitsia-apple-watch-app": ("Fitsia Core", "fitsia", "Fitsia Apple Watch App", "#4285F4"),
        "fitsia-asistente-ventas": ("Fitsia Core", "fitsia", "Fitsia Asistente Ventas", "#4285F4"),
        "fitsia-barcode-scanner": ("Fitsia Core", "fitsia", "Fitsia Barcode Scanner", "#4285F4"),
        "fitsia-calorie-predictor": ("Fitsia Core", "fitsia", "Fitsia Calorie Predictor", "#4285F4"),
        "fitsia-celery-task-specialist": ("Fitsia Core", "fitsia", "Fitsia Celery Task Specialist", "#4285F4"),
        "fitsia-challenge-engine": ("Fitsia Core", "fitsia", "Fitsia Challenge Engine", "#4285F4"),
        "fitsia-churn-detector": ("Fitsia Core", "fitsia", "Fitsia Churn Detector", "#4285F4"),
        "fitsia-cohort-analyzer": ("Fitsia Core", "fitsia", "Fitsia Cohort Analyzer", "#4285F4"),
        "fitsia-compliance-auditor": ("Fitsia Core", "fitsia", "Fitsia Compliance Auditor", "#4285F4"),
        "fitsia-conductor": ("Fitsia Core", "fitsia", "Fitsia Conductor", "#4285F4"),
        "fitsia-content-manager": ("Fitsia Core", "fitsia", "Fitsia Content Manager", "#4285F4"),
        "fitsia-coordinador-inventarios": ("Fitsia Core", "fitsia", "Fitsia Coordinador Inventarios", "#4285F4"),
        "fitsia-data-pipeline": ("Fitsia Core", "fitsia", "Fitsia Data Pipeline", "#4285F4"),
        "fitsia-demand-pricing-analyst": ("Fitsia Core", "fitsia", "Fitsia Demand Pricing Analyst", "#4285F4"),
        "fitsia-design-system-guardian": ("Fitsia Core", "fitsia", "Fitsia Design System Guardian", "#4285F4"),
        "fitsia-director-creativo": ("Fitsia Core", "fitsia", "Fitsia Director Creativo", "#4285F4"),
        "fitsia-disenador": ("Fitsia Core", "fitsia", "Fitsia Disenador", "#4285F4"),
        "fitsia-e2e-automation": ("Fitsia Core", "fitsia", "Fitsia E2E Automation", "#4285F4"),
        "fitsia-ejecutivo-atencion-st": ("Fitsia Core", "fitsia", "Fitsia Ejecutivo Atencion St", "#4285F4"),
        "fitsia-ejecutivo-postventa": ("Fitsia Core", "fitsia", "Fitsia Ejecutivo Postventa", "#4285F4"),
        "fitsia-ejecutivo-product-data": ("Fitsia Core", "fitsia", "Fitsia Ejecutivo Product Data", "#4285F4"),
        "fitsia-ejecutivo-product-sourcing": ("Fitsia Core", "fitsia", "Fitsia Ejecutivo Product Sourcing", "#4285F4"),
        "fitsia-ejecutivo-ventas": ("Fitsia Core", "fitsia", "Fitsia Ejecutivo Ventas", "#4285F4"),
        "fitsia-exercise-form-ai": ("Fitsia Core", "fitsia", "Fitsia Exercise Form Ai", "#4285F4"),
        "fitsia-food-preference-learner": ("Fitsia Core", "fitsia", "Fitsia Food Preference Learner", "#4285F4"),
        "fitsia-food-recognition-trainer": ("Fitsia Core", "fitsia", "Fitsia Food Recognition Trainer", "#4285F4"),
        "fitsia-gerente-admin-finanzas": ("Fitsia Core", "fitsia", "Fitsia Gerente Admin Finanzas", "#4285F4"),
        "fitsia-gerente-general": ("Fitsia Core", "fitsia", "Fitsia Gerente General", "#4285F4"),
        "fitsia-gerente-marketing": ("Fitsia Core", "fitsia", "Fitsia Gerente Marketing", "#4285F4"),
        "fitsia-gerente-operaciones": ("Fitsia Core", "fitsia", "Fitsia Gerente Operaciones", "#4285F4"),
        "fitsia-gesture-handler": ("Fitsia Core", "fitsia", "Fitsia Gesture Handler", "#4285F4"),
        "fitsia-grocery-list-generator": ("Fitsia Core", "fitsia", "Fitsia Grocery List Generator", "#4285F4"),
        "fitsia-gruero": ("Fitsia Core", "fitsia", "Fitsia Gruero", "#4285F4"),
        "fitsia-head-design": ("Fitsia Core", "fitsia", "Fitsia Head Design", "#4285F4"),
        "fitsia-head-product-ecommerce": ("Fitsia Core", "fitsia", "Fitsia Head Product Ecommerce", "#4285F4"),
        "fitsia-head-sales-customer-success": ("Fitsia Core", "fitsia", "Fitsia Head Sales Customer Success", "#4285F4"),
        "fitsia-health-kit-deep": ("Fitsia Core", "fitsia", "Fitsia Health Kit Deep", "#4285F4"),
        "fitsia-health-score": ("Fitsia Core", "fitsia", "Fitsia Health Score", "#4285F4"),
        "fitsia-jefe-logistica": ("Fitsia Core", "fitsia", "Fitsia Jefe Logistica", "#4285F4"),
        "fitsia-jefe-postventa": ("Fitsia Core", "fitsia", "Fitsia Jefe Postventa", "#4285F4"),
        "fitsia-jefe-servicio-tecnico": ("Fitsia Core", "fitsia", "Fitsia Jefe Servicio Tecnico", "#4285F4"),
        "fitsia-lider-personas-cultura": ("Fitsia Core", "fitsia", "Fitsia Lider Personas Cultura", "#4285F4"),
        "fitsia-macro-balancer": ("Fitsia Core", "fitsia", "Fitsia Macro Balancer", "#4285F4"),
        "fitsia-meal-plan-ai": ("Fitsia Core", "fitsia", "Fitsia Meal Plan Ai", "#4285F4"),
        "fitsia-ml-predictor": ("Fitsia Core", "fitsia", "Fitsia Ml Predictor", "#4285F4"),
        "fitsia-multi-food-detector": ("Fitsia Core", "fitsia", "Fitsia Multi Food Detector", "#4285F4"),
        "fitsia-nutrition-goals": ("Fitsia Core", "fitsia", "Fitsia Nutrition Goals", "#4285F4"),
        "fitsia-operador-picking": ("Fitsia Core", "fitsia", "Fitsia Operador Picking", "#4285F4"),
        "fitsia-orchestrator": ("Fitsia Core", "fitsia", "Fitsia Orchestrator", "#4285F4"),
        "fitsia-paid-media-specialist": ("Fitsia Core", "fitsia", "Fitsia Paid Media Specialist", "#4285F4"),
        "fitsia-paywall-optimizer": ("Fitsia Core", "fitsia", "Fitsia Paywall Optimizer", "#4285F4"),
        "fitsia-penetration-tester": ("Fitsia Core", "fitsia", "Fitsia Penetration Tester", "#4285F4"),
        "fitsia-peoneta-operario": ("Fitsia Core", "fitsia", "Fitsia Peoneta Operario", "#4285F4"),
        "fitsia-performance-profiler": ("Fitsia Core", "fitsia", "Fitsia Performance Profiler", "#4285F4"),
        "fitsia-portion-estimator": ("Fitsia Core", "fitsia", "Fitsia Portion Estimator", "#4285F4"),
        "fitsia-practicante": ("Fitsia Core", "fitsia", "Fitsia Practicante", "#4285F4"),
        "fitsia-pricing-engine": ("Fitsia Core", "fitsia", "Fitsia Pricing Engine", "#4285F4"),
        "fitsia-product-supplier-manager": ("Fitsia Core", "fitsia", "Fitsia Product Supplier Manager", "#4285F4"),
        "fitsia-progress-tracker": ("Fitsia Core", "fitsia", "Fitsia Progress Tracker", "#4285F4"),
        "fitsia-query-optimizer": ("Fitsia Core", "fitsia", "Fitsia Query Optimizer", "#4285F4"),
        "fitsia-recipes-meals": ("Fitsia Core", "fitsia", "Fitsia Recipes Meals", "#4285F4"),
        "fitsia-referral-growth": ("Fitsia Core", "fitsia", "Fitsia Referral Growth", "#4285F4"),
        "fitsia-reports-insights": ("Fitsia Core", "fitsia", "Fitsia Reports Insights", "#4285F4"),
        "fitsia-sales-manager": ("Fitsia Core", "fitsia", "Fitsia Sales Manager", "#4285F4"),
        "fitsia-search-engine": ("Fitsia Core", "fitsia", "Fitsia Search Engine", "#4285F4"),
        "fitsia-security-daemon": ("Fitsia Core", "fitsia", "Fitsia Security Daemon", "#4285F4"),
        "fitsia-snapshot-tester": ("Fitsia Core", "fitsia", "Fitsia Snapshot Tester", "#4285F4"),
        "fitsia-social-media-brand": ("Fitsia Core", "fitsia", "Fitsia Social Media Brand", "#4285F4"),
        "fitsia-social-share-designer": ("Fitsia Core", "fitsia", "Fitsia Social Share Designer", "#4285F4"),
        "fitsia-streaks-achievements": ("Fitsia Core", "fitsia", "Fitsia Streaks Achievements", "#4285F4"),
        "fitsia-subgerente-logistica": ("Fitsia Core", "fitsia", "Fitsia Subgerente Logistica", "#4285F4"),
        "fitsia-supervisor-logistica": ("Fitsia Core", "fitsia", "Fitsia Supervisor Logistica", "#4285F4"),
        "fitsia-svg-chart-specialist": ("Fitsia Core", "fitsia", "Fitsia Svg Chart Specialist", "#4285F4"),
        "fitsia-tecnico": ("Fitsia Core", "fitsia", "Fitsia Tecnico", "#4285F4"),
        "fitsia-tecnico-campo": ("Fitsia Core", "fitsia", "Fitsia Tecnico Campo", "#4285F4"),
        "fitsia-tecnico-chofer": ("Fitsia Core", "fitsia", "Fitsia Tecnico Chofer", "#4285F4"),
        "fitsia-transition-designer": ("Fitsia Core", "fitsia", "Fitsia Transition Designer", "#4285F4"),
        "fitsia-trial-optimizer": ("Fitsia Core", "fitsia", "Fitsia Trial Optimizer", "#4285F4"),
        "fitsia-viral-loop-engineer": ("Fitsia Core", "fitsia", "Fitsia Viral Loop Engineer", "#4285F4"),
        "fitsia-visual-regression": ("Fitsia Core", "fitsia", "Fitsia Visual Regression", "#4285F4"),
        "fitsia-water-tracker": ("Fitsia Core", "fitsia", "Fitsia Water Tracker", "#4285F4"),
        "fitsia-wearable-sync": ("Fitsia Core", "fitsia", "Fitsia Wearable Sync", "#4285F4"),
        "fitsia-weight-tracker": ("Fitsia Core", "fitsia", "Fitsia Weight Tracker", "#4285F4"),
        "free-weights-expert": ("Specialists", "specialist", "Free Weights Expert", "#888888"),
        "fullstack-inspector": ("Specialists", "specialist", "Fullstack Inspector", "#888888"),
        "functional-equipment-expert": ("Specialists", "specialist", "Functional Equipment Expert", "#888888"),
        "git-branch-strategist": ("Specialists", "specialist", "Git Branch Strategist", "#888888"),
        "git-changelog-writer": ("Specialists", "specialist", "Git Changelog Writer", "#888888"),
        "git-ci-guardian": ("Specialists", "specialist", "Git Ci Guardian", "#888888"),
        "git-pr-reviewer": ("Specialists", "specialist", "Git Pr Reviewer", "#888888"),
        "git-version-manager": ("Specialists", "specialist", "Git Version Manager", "#888888"),
        "growth-strategist": ("Specialists", "specialist", "Growth Strategist", "#888888"),
        "health-compliance-agent": ("Specialists", "specialist", "Health Compliance Agent", "#888888"),
        "health-data-scientist": ("Specialists", "specialist", "Health Data Scientist", "#888888"),
        "kinesiology-expert": ("Specialists", "specialist", "Kinesiology Expert", "#888888"),
        "marketing-content-agent": ("Specialists", "specialist", "Marketing Content Agent", "#888888"),
        "nutri-allergies": ("Specialists", "specialist", "Nutri Allergies", "#888888"),
        "nutri-cultural-foods": ("Specialists", "specialist", "Nutri Cultural Foods", "#888888"),
        "nutri-eating-disorders": ("Specialists", "specialist", "Nutri Eating Disorders", "#888888"),
        "nutri-food-quality": ("Specialists", "specialist", "Nutri Food Quality", "#888888"),
        "nutri-geriatric": ("Specialists", "specialist", "Nutri Geriatric", "#888888"),
        "nutri-gut-health": ("Specialists", "specialist", "Nutri Gut Health", "#888888"),
        "nutri-hydration": ("Specialists", "specialist", "Nutri Hydration", "#888888"),
        "nutri-macros-expert": ("Specialists", "specialist", "Nutri Macros Expert", "#888888"),
        "nutri-meal-timing": ("Specialists", "specialist", "Nutri Meal Timing", "#888888"),
        "nutri-micros-expert": ("Specialists", "specialist", "Nutri Micros Expert", "#888888"),
        "nutri-pediatric": ("Specialists", "specialist", "Nutri Pediatric", "#888888"),
        "nutri-pregnancy": ("Specialists", "specialist", "Nutri Pregnancy", "#888888"),
        "nutri-sports-nutrition": ("Specialists", "specialist", "Nutri Sports Nutrition", "#888888"),
        "nutri-supplements": ("Specialists", "specialist", "Nutri Supplements", "#888888"),
        "nutri-weight-management": ("Specialists", "specialist", "Nutri Weight Management", "#888888"),
        "nutrition-content-creator": ("Specialists", "specialist", "Nutrition Content Creator", "#888888"),
        "nutrition-mobile-expert": ("Specialists", "specialist", "Nutrition Mobile Expert", "#888888"),
        "nutrition-science-advisor": ("Specialists", "specialist", "Nutrition Science Advisor", "#888888"),
        "odoo-v17-expert": ("Specialists", "specialist", "Odoo V17 Expert", "#888888"),
        "onboarding-builder": ("Specialists", "specialist", "Onboarding Builder", "#888888"),
        "payment-specialist": ("Specialists", "specialist", "Payment Specialist", "#888888"),
        "product-analytics-pm": ("Specialists", "specialist", "Product Analytics Pm", "#888888"),
        "product-competitor-analyst": ("Specialists", "specialist", "Product Competitor Analyst", "#888888"),
        "product-feature-flags": ("Specialists", "specialist", "Product Feature Flags", "#888888"),
        "product-gamification": ("Specialists", "specialist", "Product Gamification", "#888888"),
        "product-localization": ("Specialists", "specialist", "Product Localization", "#888888"),
        "product-manager": ("Specialists", "specialist", "Product Manager", "#888888"),
        "product-monetization": ("Specialists", "specialist", "Product Monetization", "#888888"),
        "product-onboarding-opt": ("Specialists", "specialist", "Product Onboarding Opt", "#888888"),
        "product-retention": ("Specialists", "specialist", "Product Retention", "#888888"),
        "product-social-features": ("Specialists", "specialist", "Product Social Features", "#888888"),
        "project-coordinator": ("Specialists", "specialist", "Project Coordinator", "#888888"),
        "python-backend-engineer": ("Specialists", "specialist", "Python Backend Engineer", "#888888"),
        "python-dev-expert": ("Specialists", "specialist", "Python Dev Expert", "#888888"),
        "qa-athlete-user-01": ("QA Testing", "qa-testing", "Qa Athlete User 01", "#FF6B6B"),
        "qa-athlete-user-02": ("QA Testing", "qa-testing", "Qa Athlete User 02", "#FF6B6B"),
        "qa-bodybuilder-user-01": ("QA Testing", "qa-testing", "Qa Bodybuilder User 01", "#FF6B6B"),
        "qa-browser-user-01": ("QA Testing", "qa-testing", "Qa Browser User 01", "#FF6B6B"),
        "qa-browser-user-02": ("QA Testing", "qa-testing", "Qa Browser User 02", "#FF6B6B"),
        "qa-browser-user-03": ("QA Testing", "qa-testing", "Qa Browser User 03", "#FF6B6B"),
        "qa-browser-user-04": ("QA Testing", "qa-testing", "Qa Browser User 04", "#FF6B6B"),
        "qa-browser-user-05": ("QA Testing", "qa-testing", "Qa Browser User 05", "#FF6B6B"),
        "qa-browser-user-06": ("QA Testing", "qa-testing", "Qa Browser User 06", "#FF6B6B"),
        "qa-browser-user-07": ("QA Testing", "qa-testing", "Qa Browser User 07", "#FF6B6B"),
        "qa-browser-user-08": ("QA Testing", "qa-testing", "Qa Browser User 08", "#FF6B6B"),
        "qa-browser-user-09": ("QA Testing", "qa-testing", "Qa Browser User 09", "#FF6B6B"),
        "qa-browser-user-10": ("QA Testing", "qa-testing", "Qa Browser User 10", "#FF6B6B"),
        "qa-casual-user-01": ("QA Testing", "qa-testing", "Qa Casual User 01", "#FF6B6B"),
        "qa-casual-user-02": ("QA Testing", "qa-testing", "Qa Casual User 02", "#FF6B6B"),
        "qa-casual-user-03": ("QA Testing", "qa-testing", "Qa Casual User 03", "#FF6B6B"),
        "qa-casual-user-04": ("QA Testing", "qa-testing", "Qa Casual User 04", "#FF6B6B"),
        "qa-casual-user-05": ("QA Testing", "qa-testing", "Qa Casual User 05", "#FF6B6B"),
        "qa-casual-user-06": ("QA Testing", "qa-testing", "Qa Casual User 06", "#FF6B6B"),
        "qa-casual-user-07": ("QA Testing", "qa-testing", "Qa Casual User 07", "#FF6B6B"),
        "qa-casual-user-08": ("QA Testing", "qa-testing", "Qa Casual User 08", "#FF6B6B"),
        "qa-casual-user-09": ("QA Testing", "qa-testing", "Qa Casual User 09", "#FF6B6B"),
        "qa-casual-user-10": ("QA Testing", "qa-testing", "Qa Casual User 10", "#FF6B6B"),
        "qa-diabetic-user-01": ("QA Testing", "qa-testing", "Qa Diabetic User 01", "#FF6B6B"),
        "qa-diabetic-user-02": ("QA Testing", "qa-testing", "Qa Diabetic User 02", "#FF6B6B"),
        "qa-elderly-user-01": ("QA Testing", "qa-testing", "Qa Elderly User 01", "#FF6B6B"),
        "qa-engineer": ("QA Testing", "qa-testing", "Qa Engineer", "#FF6B6B"),
        "qa-food-allergy-user-01": ("QA Testing", "qa-testing", "Qa Food Allergy User 01", "#FF6B6B"),
        "qa-gluten-free-user-01": ("QA Testing", "qa-testing", "Qa Gluten Free User 01", "#FF6B6B"),
        "qa-intermittent-fasting-01": ("QA Testing", "qa-testing", "Qa Intermittent Fasting 01", "#FF6B6B"),
        "qa-keto-user-01": ("QA Testing", "qa-testing", "Qa Keto User 01", "#FF6B6B"),
        "qa-keto-user-02": ("QA Testing", "qa-testing", "Qa Keto User 02", "#FF6B6B"),
        "qa-maintenance-user-01": ("QA Testing", "qa-testing", "Qa Maintenance User 01", "#FF6B6B"),
        "qa-mediterranean-user-01": ("QA Testing", "qa-testing", "Qa Mediterranean User 01", "#FF6B6B"),
        "qa-muscle-gain-user-01": ("QA Testing", "qa-testing", "Qa Muscle Gain User 01", "#FF6B6B"),
        "qa-onboarding-user-01": ("QA Testing", "qa-testing", "Qa Onboarding User 01", "#FF6B6B"),
        "qa-onboarding-user-02": ("QA Testing", "qa-testing", "Qa Onboarding User 02", "#FF6B6B"),
        "qa-onboarding-user-03": ("QA Testing", "qa-testing", "Qa Onboarding User 03", "#FF6B6B"),
        "qa-onboarding-user-04": ("QA Testing", "qa-testing", "Qa Onboarding User 04", "#FF6B6B"),
        "qa-onboarding-user-05": ("QA Testing", "qa-testing", "Qa Onboarding User 05", "#FF6B6B"),
        "qa-onboarding-user-06": ("QA Testing", "qa-testing", "Qa Onboarding User 06", "#FF6B6B"),
        "qa-onboarding-user-07": ("QA Testing", "qa-testing", "Qa Onboarding User 07", "#FF6B6B"),
        "qa-onboarding-user-08": ("QA Testing", "qa-testing", "Qa Onboarding User 08", "#FF6B6B"),
        "qa-onboarding-user-09": ("QA Testing", "qa-testing", "Qa Onboarding User 09", "#FF6B6B"),
        "qa-onboarding-user-10": ("QA Testing", "qa-testing", "Qa Onboarding User 10", "#FF6B6B"),
        "qa-paleo-user-01": ("QA Testing", "qa-testing", "Qa Paleo User 01", "#FF6B6B"),
        "qa-power-user-01": ("QA Testing", "qa-testing", "Qa Power User 01", "#FF6B6B"),
        "qa-power-user-02": ("QA Testing", "qa-testing", "Qa Power User 02", "#FF6B6B"),
        "qa-power-user-03": ("QA Testing", "qa-testing", "Qa Power User 03", "#FF6B6B"),
        "qa-power-user-04": ("QA Testing", "qa-testing", "Qa Power User 04", "#FF6B6B"),
        "qa-power-user-05": ("QA Testing", "qa-testing", "Qa Power User 05", "#FF6B6B"),
        "qa-power-user-06": ("QA Testing", "qa-testing", "Qa Power User 06", "#FF6B6B"),
        "qa-power-user-07": ("QA Testing", "qa-testing", "Qa Power User 07", "#FF6B6B"),
        "qa-power-user-08": ("QA Testing", "qa-testing", "Qa Power User 08", "#FF6B6B"),
        "qa-power-user-09": ("QA Testing", "qa-testing", "Qa Power User 09", "#FF6B6B"),
        "qa-power-user-10": ("QA Testing", "qa-testing", "Qa Power User 10", "#FF6B6B"),
        "qa-pregnant-user-01": ("QA Testing", "qa-testing", "Qa Pregnant User 01", "#FF6B6B"),
        "qa-scanner-user-01": ("QA Testing", "qa-testing", "Qa Scanner User 01", "#FF6B6B"),
        "qa-scanner-user-02": ("QA Testing", "qa-testing", "Qa Scanner User 02", "#FF6B6B"),
        "qa-scanner-user-03": ("QA Testing", "qa-testing", "Qa Scanner User 03", "#FF6B6B"),
        "qa-scanner-user-04": ("QA Testing", "qa-testing", "Qa Scanner User 04", "#FF6B6B"),
        "qa-scanner-user-05": ("QA Testing", "qa-testing", "Qa Scanner User 05", "#FF6B6B"),
        "qa-scanner-user-06": ("QA Testing", "qa-testing", "Qa Scanner User 06", "#FF6B6B"),
        "qa-scanner-user-07": ("QA Testing", "qa-testing", "Qa Scanner User 07", "#FF6B6B"),
        "qa-scanner-user-08": ("QA Testing", "qa-testing", "Qa Scanner User 08", "#FF6B6B"),
        "qa-scanner-user-09": ("QA Testing", "qa-testing", "Qa Scanner User 09", "#FF6B6B"),
        "qa-scanner-user-10": ("QA Testing", "qa-testing", "Qa Scanner User 10", "#FF6B6B"),
        "qa-teen-user-01": ("QA Testing", "qa-testing", "Qa Teen User 01", "#FF6B6B"),
        "qa-vegan-user-01": ("QA Testing", "qa-testing", "Qa Vegan User 01", "#FF6B6B"),
        "qa-vegan-user-02": ("QA Testing", "qa-testing", "Qa Vegan User 02", "#FF6B6B"),
        "qa-weight-loss-user-01": ("QA Testing", "qa-testing", "Qa Weight Loss User 01", "#FF6B6B"),
        "recovery-equipment-expert": ("Specialists", "specialist", "Recovery Equipment Expert", "#888888"),
        "sec-api-security": ("Specialists", "specialist", "Sec Api Security", "#888888"),
        "sec-auth-hardening": ("Specialists", "specialist", "Sec Auth Hardening", "#888888"),
        "sec-code-review-security": ("Specialists", "specialist", "Sec Code Review Security", "#888888"),
        "sec-compliance-auditor": ("Specialists", "specialist", "Sec Compliance Auditor", "#888888"),
        "sec-data-encryption": ("Specialists", "specialist", "Sec Data Encryption", "#888888"),
        "sec-dependency-audit": ("Specialists", "specialist", "Sec Dependency Audit", "#888888"),
        "sec-incident-handler": ("Specialists", "specialist", "Sec Incident Handler", "#888888"),
        "sec-mobile-security": ("Specialists", "specialist", "Sec Mobile Security", "#888888"),
        "sec-penetration-tester-mobile": ("Specialists", "specialist", "Sec Penetration Tester Mobile", "#888888"),
        "sec-privacy-engineer": ("Specialists", "specialist", "Sec Privacy Engineer", "#888888"),
        "security-engineer": ("Specialists", "specialist", "Security Engineer", "#888888"),
        "senior-code-reviewer": ("Specialists", "specialist", "Senior Code Reviewer", "#888888"),
        "sports-medicine-advisor": ("Specialists", "specialist", "Sports Medicine Advisor", "#888888"),
        "strength-machines-expert": ("Specialists", "specialist", "Strength Machines Expert", "#888888"),
        "sys-agent-evaluator": ("Teoria de Sistemas", "maturana", "Sys Agent Evaluator", "#00ff44"),
        "sys-agent-orchestrator": ("Teoria de Sistemas", "maturana", "Sys Agent Orchestrator", "#00ff44"),
        "sys-autopoiesis": ("Teoria de Sistemas", "maturana", "Sys Autopoiesis", "#00ff44"),
        "sys-capacity-planner": ("Teoria de Sistemas", "maturana", "Sys Capacity Planner", "#00ff44"),
        "sys-cognition": ("Teoria de Sistemas", "maturana", "Sys Cognition", "#00ff44"),
        "sys-context-manager": ("Teoria de Sistemas", "maturana", "Sys Context Manager", "#00ff44"),
        "sys-dependency-resolver": ("Teoria de Sistemas", "maturana", "Sys Dependency Resolver", "#00ff44"),
        "sys-documentation": ("Teoria de Sistemas", "maturana", "Sys Documentation", "#00ff44"),
        "sys-emergence": ("Teoria de Sistemas", "maturana", "Sys Emergence", "#00ff44"),
        "sys-health-checker": ("Teoria de Sistemas", "maturana", "Sys Health Checker", "#00ff44"),
        "sys-languaging": ("Teoria de Sistemas", "maturana", "Sys Languaging", "#00ff44"),
        "sys-meta-learner": ("Teoria de Sistemas", "maturana", "Sys Meta Learner", "#00ff44"),
        "sys-observer": ("Teoria de Sistemas", "maturana", "Sys Observer", "#00ff44"),
        "sys-ontogenic-drift": ("Teoria de Sistemas", "maturana", "Sys Ontogenic Drift", "#00ff44"),
        "sys-organization-closure": ("Teoria de Sistemas", "maturana", "Sys Organization Closure", "#00ff44"),
        "sys-performance-monitor": ("Teoria de Sistemas", "maturana", "Sys Performance Monitor", "#00ff44"),
        "sys-perturbation": ("Teoria de Sistemas", "maturana", "Sys Perturbation", "#00ff44"),
        "sys-quality-gate": ("Teoria de Sistemas", "maturana", "Sys Quality Gate", "#00ff44"),
        "sys-report-generator": ("Teoria de Sistemas", "maturana", "Sys Report Generator", "#00ff44"),
        "sys-rollback-manager": ("Teoria de Sistemas", "maturana", "Sys Rollback Manager", "#00ff44"),
        "sys-structural-coupling": ("Teoria de Sistemas", "maturana", "Sys Structural Coupling", "#00ff44"),
        "sys-symbiogenesis": ("Teoria de Sistemas", "maturana", "Sys Symbiogenesis", "#00ff44"),
        "sys-task-scheduler": ("Teoria de Sistemas", "maturana", "Sys Task Scheduler", "#00ff44"),
        "tech-lead": ("Specialists", "specialist", "Tech Lead", "#888888"),
        "ui-engineer": ("Specialists", "specialist", "Ui Engineer", "#888888"),
        "ux-color-system": ("Specialists", "specialist", "Ux Color System", "#888888"),
        "ux-dark-mode": ("Specialists", "specialist", "Ux Dark Mode", "#888888"),
        "ux-data-viz": ("Specialists", "specialist", "Ux Data Viz", "#888888"),
        "ux-empty-states": ("Specialists", "specialist", "Ux Empty States", "#888888"),
        "ux-error-states": ("Specialists", "specialist", "Ux Error States", "#888888"),
        "ux-food-logging": ("Specialists", "specialist", "Ux Food Logging", "#888888"),
        "ux-iconography": ("Specialists", "specialist", "Ux Iconography", "#888888"),
        "ux-micro-interactions": ("Specialists", "specialist", "Ux Micro Interactions", "#888888"),
        "ux-motion-design": ("Specialists", "specialist", "Ux Motion Design", "#888888"),
        "ux-navigation-patterns": ("Specialists", "specialist", "Ux Navigation Patterns", "#888888"),
        "ux-polish-agent": ("Specialists", "specialist", "Ux Polish Agent", "#888888"),
        "ux-researcher": ("Specialists", "specialist", "Ux Researcher", "#888888"),
        "ux-typography": ("Specialists", "specialist", "Ux Typography", "#888888"),
            # -- Board of Directors --
        "board-chairman": ("Board of Directors", "board", "Chairman of the Board", "#FFD700"),
        "board-advisor-tech": ("Board of Directors", "board", "Board Technology Advisor", "#FFD700"),
        "board-advisor-finance": ("Board of Directors", "board", "Board Financial Advisor", "#FFD700"),
        "board-advisor-growth": ("Board of Directors", "board", "Board Growth Advisor", "#FFD700"),
        "board-advisor-people": ("Board of Directors", "board", "Board People & Culture Advisor", "#FFD700"),
        # -- C-Suite --
        "ceo-fitsi": ("C-Suite", "c-suite", "CEO", "#FF0055"),
        "cfo-fitsi": ("C-Suite", "c-suite", "CFO", "#FF0055"),
        "coo-fitsi": ("C-Suite", "c-suite", "COO", "#FF0055"),
        "cpo-fitsi": ("C-Suite", "c-suite", "CPO", "#FF0055"),
        "cgo-fitsi": ("C-Suite", "c-suite", "CGO", "#FF0055"),
        "chro-fitsi": ("C-Suite", "c-suite", "CHRO", "#FF0055"),
        "ciso-fitsi": ("C-Suite", "c-suite", "CISO", "#FF0055"),
        "cdao-fitsi": ("C-Suite", "c-suite", "Chief Data & AI Officer", "#FF0055"),
        # -- VP Layer --
        "vp-of-product": ("VP Layer", "vp", "VP of Product", "#FF6B00"),
        "vp-of-finance": ("VP Layer", "vp", "VP of Finance", "#FF6B00"),
        # -- Heads --
        "head-of-operations": ("Heads", "heads", "Head of Operations", "#FF9500"),
        "head-of-design": ("Heads", "heads", "Head of Design", "#FF9500"),
        "head-of-ux-research": ("Heads", "heads", "Head of UX Research", "#FF9500"),
        "head-of-marketing": ("Heads", "heads", "Head of Marketing", "#FF9500"),
        "head-of-partnerships": ("Heads", "heads", "Head of Partnerships", "#FF9500"),
        "head-of-talent": ("Heads", "heads", "Head of Talent Acquisition", "#FF9500"),
        "head-of-culture": ("Heads", "heads", "Head of Culture & Engagement", "#FF9500"),
        "head-of-product-analytics": ("Heads", "heads", "Head of Product Analytics", "#FF9500"),
        "head-of-financial-planning": ("Heads", "heads", "Head of Financial Planning", "#FF9500"),

        # ══════════════════════════════════════════════════════════════════
        # FITSIA HIERARCHY — 7 Layers (TEAMS_REGISTRY v6.0)
        # ══════════════════════════════════════════════════════════════════

        # -- L0 — Supreme Orchestrator --
        "fitsia-orchestrator": ("L0 — Supreme Orchestrator", "orchestrator", "Supreme Orchestrator", "#ff00ff"),

        # -- L1 — Control Demons (10 Autonomous Daemons) --
        "demon-decision": ("L1 — Control Demons", "demon", "Decision Demon", "#ff0040"),
        "demon-performance": ("L1 — Control Demons", "demon", "Performance Demon", "#ff0040"),
        "demon-intelligence": ("L1 — Control Demons", "demon", "Intelligence Demon", "#ff0040"),
        "demon-security": ("L1 — Control Demons", "demon", "Security Demon", "#ff0040"),
        "demon-data": ("L1 — Control Demons", "demon", "Data Demon", "#ff0040"),
        "demon-growth": ("L1 — Control Demons", "demon", "Growth Demon", "#ff0040"),
        "demon-experimentation": ("L1 — Control Demons", "demon", "Experimentation Demon", "#ff0040"),
        "demon-operations": ("L1 — Control Demons", "demon", "Operations Demon", "#ff0040"),
        "demon-evolution": ("L1 — Control Demons", "demon", "Evolution Demon", "#ff0040"),
        "demon-crisis": ("L1 — Control Demons", "demon", "Crisis Demon", "#ff0040"),

        # -- L2 — Board of Directors --
        "board-chairman": ("L2 — Board of Directors", "board", "Chairman", "#ffcc00"),
        "board-advisor-growth": ("L2 — Board of Directors", "board", "Growth Advisor", "#ffcc00"),
        "board-advisor-finance": ("L2 — Board of Directors", "board", "Finance Advisor", "#ffcc00"),
        "board-advisor-people": ("L2 — Board of Directors", "board", "People Advisor", "#ffcc00"),
        "board-advisor-tech": ("L2 — Board of Directors", "board", "Tech Advisor", "#ffcc00"),

        # -- L3 — C-Suite --
        "ceo-fitsi": ("L3 — C-Suite", "c-suite", "CEO", "#ff6600"),
        "coo-fitsi": ("L3 — C-Suite", "c-suite", "COO", "#ff6600"),
        "chief-technology-officer": ("L3 — C-Suite", "c-suite", "CTO", "#ff6600"),
        "cpo-fitsi": ("L3 — C-Suite", "c-suite", "CPO", "#ff6600"),
        "cfo-fitsi": ("L3 — C-Suite", "c-suite", "CFO", "#ff6600"),
        "cdao-fitsi": ("L3 — C-Suite", "c-suite", "CDAO", "#ff6600"),
        "cgo-fitsi": ("L3 — C-Suite", "c-suite", "CGO", "#ff6600"),
        "ciso-fitsi": ("L3 — C-Suite", "c-suite", "CISO", "#ff6600"),
        "chro-fitsi": ("L3 — C-Suite", "c-suite", "CHRO", "#ff6600"),

        # -- L4 — Vice Presidents --
        "vp-of-engineering": ("L4 — Vice Presidents", "vp", "VP Engineering", "#00cc88"),
        "vp-of-mobile-engineering": ("L4 — Vice Presidents", "vp", "VP Mobile", "#00cc88"),
        "chief-software-architect": ("L4 — Vice Presidents", "vp", "Chief Architect", "#00cc88"),
        "vp-of-platform": ("L4 — Vice Presidents", "vp", "VP Platform", "#00cc88"),
        "vp-of-ai-systems": ("L4 — Vice Presidents", "vp", "VP AI Systems", "#00cc88"),
        "vp-of-product": ("L4 — Vice Presidents", "vp", "VP Product", "#00cc88"),
        "head-of-ux-research": ("L4 — Vice Presidents", "vp", "Head UX", "#00cc88"),
        "head-of-marketing": ("L4 — Vice Presidents", "vp", "Head Marketing", "#00cc88"),
        "head-of-growth-engineering": ("L4 — Vice Presidents", "vp", "Head Growth Eng", "#00cc88"),
        "head-of-operations": ("L4 — Vice Presidents", "vp", "Head Operations", "#00cc88"),
        "head-of-partnerships": ("L4 — Vice Presidents", "vp", "Head Partnerships", "#00cc88"),
        "head-of-revenue": ("L4 — Vice Presidents", "vp", "Head Revenue", "#00cc88"),
        "head-of-compliance": ("L4 — Vice Presidents", "vp", "Head Compliance", "#00cc88"),
        "head-of-talent": ("L4 — Vice Presidents", "vp", "Head Talent", "#00cc88"),

        # -- L5 — Coordinators --
        "fitsia-feature-coordinator": ("L5 — Coordinators", "coordinator", "Feature Coordinator", "#00aaff"),
        "fitsia-frontend-coordinator": ("L5 — Coordinators", "coordinator", "Frontend Coordinator", "#00aaff"),
        "fitsia-backend-coordinator": ("L5 — Coordinators", "coordinator", "Backend Coordinator", "#00aaff"),
        "fitsia-ai-coordinator": ("L5 — Coordinators", "coordinator", "AI Coordinator", "#00aaff"),
        "fitsia-science-coordinator": ("L5 — Coordinators", "coordinator", "Science Coordinator", "#00aaff"),
        "fitsia-devops-coordinator": ("L5 — Coordinators", "coordinator", "DevOps Coordinator", "#00aaff"),
        "fitsia-qa-coordinator": ("L5 — Coordinators", "coordinator", "QA Coordinator", "#00aaff"),
        "fitsia-marketing-coordinator": ("L5 — Coordinators", "coordinator", "Marketing Coordinator", "#00aaff"),
        "fitsia-content-coordinator": ("L5 — Coordinators", "coordinator", "Content Coordinator", "#00aaff"),
        "fitsia-equipment-coordinator": ("L5 — Coordinators", "coordinator", "Equipment Coordinator", "#00aaff"),

        # -- L6 — NoC Evolution --
        "fitsia-nature-of-code-master": ("L6 — NoC Evolution", "noc", "NoC Master", "#aa00ff"),
        "fitsia-noc-randomness": ("L6 — NoC Evolution", "noc", "NoC Randomness", "#aa00ff"),
        "fitsia-noc-physics": ("L6 — NoC Evolution", "noc", "NoC Physics", "#aa00ff"),
        "fitsia-noc-oscillation": ("L6 — NoC Evolution", "noc", "NoC Oscillation", "#aa00ff"),
        "fitsia-noc-particles": ("L6 — NoC Evolution", "noc", "NoC Particles", "#aa00ff"),
        "fitsia-noc-agents": ("L6 — NoC Evolution", "noc", "NoC Agents", "#aa00ff"),
        "fitsia-noc-patterns": ("L6 — NoC Evolution", "noc", "NoC Patterns", "#aa00ff"),
        "fitsia-noc-evolution": ("L6 — NoC Evolution", "noc", "NoC Evolution", "#aa00ff"),
}


    for name, (team, category, display_name, color) in agent_map.items():
        desc = ""
        agent_file = AGENTS_DIR / f"{name}.md"
        if agent_file.exists():
            content = agent_file.read_text()
            # Extract description from frontmatter
            if "description:" in content:
                start = content.index("description:") + len("description:")
                # Find end of description (next line starting with a key)
                lines = content[start:].split("\n")
                desc_lines = []
                for line in lines:
                    stripped = line.strip().strip('"')
                    if stripped and not any(stripped.startswith(k) for k in ["model:", "color:", "memory:", "permissionMode:", "---"]):
                        desc_lines.append(stripped)
                    elif desc_lines:
                        break
                desc = " ".join(desc_lines)[:200]

        conn.execute("""
            INSERT OR REPLACE INTO agent_registry (name, display_name, team, category, description, color, status, total_invocations, total_tokens)
            VALUES (?, ?, ?, ?, ?, ?,
                    COALESCE((SELECT status FROM agent_registry WHERE name = ?), 'idle'),
                    COALESCE((SELECT total_invocations FROM agent_registry WHERE name = ?), 0),
                    COALESCE((SELECT total_tokens FROM agent_registry WHERE name = ?), 0))
        """, (name, display_name, team, category, desc, color, name, name, name))

    conn.commit()
    conn.close()


# ── Smart Routing: Evaluate best agents per task ──────────────────────
ROUTING_RULES = {
    "frontend": {
        "keywords": ["frontend", "ui", "react", "mobile", "app", "screen", "component", "onboarding", "ux", "animation"],
        "lead": "ui-engineer",
        "support": ["ux-polish-agent", "onboarding-builder"],
        "decisor": "tech-lead",
    },
    "backend": {
        "keywords": ["api", "backend", "endpoint", "database", "migration", "fastapi", "python backend", "celery"],
        "lead": "python-backend-engineer",
        "support": ["fitsia-auth-specialist", "fitsia-query-optimizer"],
        "decisor": "tech-lead",
    },
    "ai": {
        "keywords": ["ai", "vision", "scan", "food recognition", "ml", "prompt", "gpt", "claude vision", "image"],
        "lead": "ai-vision-expert",
        "support": ["fitsia-vision-prompt-engineer", "fitsia-ml-personalization"],
        "decisor": "tech-lead",
    },
    "nutrition": {
        "keywords": ["nutricion", "nutrition", "comida", "meal", "caloria", "macro", "dieta", "food", "receta"],
        "lead": "nutrition-science-advisor",
        "support": ["fitsia-bmr-tdee-calculator", "fitsia-macro-optimizer"],
        "decisor": "nutrition-science-advisor",
    },
    "qa": {
        "keywords": ["test", "testing", "qa", "bug", "e2e", "unit test", "integration test", "ci test"],
        "lead": "qa-engineer",
        "support": ["senior-code-reviewer", "fullstack-inspector"],
        "decisor": "qa-engineer",
    },
    "infra": {
        "keywords": ["deploy", "ci/cd", "docker", "kubernetes", "pipeline", "build", "infra", "server", "eas"],
        "lead": "devops-deployer",
        "support": ["security-engineer", "fitsia-docker-specialist"],
        "decisor": "devops-deployer",
    },
    "growth": {
        "keywords": ["growth", "paywall", "churn", "retention", "referral", "analytics", "push", "notification", "conversion"],
        "lead": "growth-strategist",
        "support": ["fitsia-paywall-optimizer", "fitsia-analytics-events"],
        "decisor": "growth-strategist",
    },
    "general": {
        "keywords": [],
        "lead": "tech-lead",
        "support": ["security-engineer", "project-coordinator"],
        "decisor": "tech-lead",
    },
}


def route_task(prompt: str) -> dict:
    """Evaluate the best agents for a given task prompt."""
    prompt_lower = prompt.lower()
    scores = {}

    for route_name, rule in ROUTING_RULES.items():
        if route_name == "general":
            continue
        score = sum(1 for kw in rule["keywords"] if kw in prompt_lower)
        if score > 0:
            scores[route_name] = score

    if not scores:
        best = "general"
    else:
        best = max(scores, key=scores.get)

    rule = ROUTING_RULES[best]
    agents_list = [
        {"name": rule["decisor"], "role": "decisor", "delegated_by": None},
        {"name": rule["lead"], "role": "lead", "delegated_by": rule["decisor"]},
    ] + [
        {"name": s, "role": "support", "delegated_by": rule["lead"]} for s in rule["support"]
    ]
    # Add security observer
    if not any(a["name"] == "security-engineer" for a in agents_list):
        agents_list.append({"name": "security-engineer", "role": "security", "delegated_by": rule["decisor"]})
    return {
        "route": best,
        "decisor": rule["decisor"],
        "lead": rule["lead"],
        "support": rule["support"],
        "agents": agents_list,
    }


# ── WebSocket Manager ─────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self.active:
                self.active.remove(ws)


manager = ConnectionManager()


# ── Broadcast Throttling (batch WebSocket events for performance) ─────
_broadcast_queue: list[dict] = []
_broadcast_task: asyncio.Task | None = None


async def _flush_broadcasts():
    """Flush accumulated broadcast events as a single batch."""
    global _broadcast_task
    await asyncio.sleep(0.3)  # Batch for 300ms
    global _broadcast_queue
    if _broadcast_queue:
        batch = _broadcast_queue[:]
        _broadcast_queue.clear()
        await manager.broadcast({"type": "event_batch", "events": batch})
    _broadcast_task = None


def queue_broadcast(event_data: dict):
    """Queue a broadcast event for batched delivery."""
    global _broadcast_task
    _broadcast_queue.append(event_data)
    if _broadcast_task is None:
        _broadcast_task = asyncio.create_task(_flush_broadcasts())


# ── App ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_agents()
    yield

app = FastAPI(title="Fitsi IA Agent Dashboard", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ── Models ────────────────────────────────────────────────────────────
class AgentEvent(BaseModel):
    agent_name: str
    event_type: str  # "spawned", "thinking", "delegating", "reviewing", "waiting", "completed", "error"
    detail: Optional[str] = None
    tokens_used: Optional[int] = 0
    duration_ms: Optional[int] = 0
    task_id: Optional[str] = None
    delegated_by: Optional[str] = None
    role: Optional[str] = "executor"


class TaskCreate(BaseModel):
    task_id: str
    task_name: str
    agents: list[dict]  # [{"name": "agent-x", "role": "decisor", "delegated_by": "agent-y"}]
    priority: Optional[str] = "medium"  # "critical", "high", "medium", "low"


class CommandRequest(BaseModel):
    prompt: str
    working_dir: Optional[str] = None  # defaults to home dir


class MemoryPublish(BaseModel):
    agent_name: str
    insight_type: str  # "learning", "warning", "pattern", "optimization"
    content: str
    relevance_score: Optional[float] = 0.5


class AgentFeedbackModel(BaseModel):
    from_agent: str
    to_agent: str
    task_id: Optional[str] = None
    score: float  # 0.0 to 1.0
    feedback_text: Optional[str] = None


class AgentBid(BaseModel):
    task_id: str
    agent_name: str
    bid_score: float
    bid_reason: Optional[str] = None


# ── Claude CLI execution ──────────────────────────────────────────────
CLAUDE_CLI = "/opt/homebrew/bin/claude"
DEFAULT_WORK_DIR = str(Path.home() / "apps" / "fitsi")

# Track running processes
_running_processes: dict[str, asyncio.subprocess.Process] = {}


async def _run_claude_cli(task_id: str, prompt: str, lead_agent: str, agents_list: list[dict], working_dir: str):
    """Execute claude CLI as subprocess and stream output to dashboard."""
    import shlex

    # Phase 1: Mark agents as working
    decisor = next((a for a in agents_list if a["role"] == "decisor"), None)
    if decisor:
        await record_event(AgentEvent(agent_name=decisor["name"], event_type="thinking", detail=f"Routing task {task_id}"))
        await asyncio.sleep(0.3)
        await record_event(AgentEvent(agent_name=decisor["name"], event_type="delegating", detail="Delegating to Claude CLI"))

    lead = next((a for a in agents_list if a["role"] == "lead"), None)
    if lead:
        await record_event(AgentEvent(agent_name=lead["name"], event_type="spawned", detail=f"Claude CLI starting: {prompt[:80]}"))

    # Phase 2: Run claude CLI
    cmd = [CLAUDE_CLI, "--print", "--output-format", "text", prompt]
    start_time = datetime.now(timezone.utc)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=working_dir,
        )
        _running_processes[task_id] = proc

        if lead:
            await record_event(AgentEvent(agent_name=lead["name"], event_type="active", detail="Claude CLI executing..."))

        # Stream stdout chunks to dashboard
        output_chunks = []
        while True:
            chunk = await proc.stdout.read(512)
            if not chunk:
                break
            text = chunk.decode("utf-8", errors="replace")
            output_chunks.append(text)
            # Broadcast partial output
            await manager.broadcast({
                "type": "command_output",
                "task_id": task_id,
                "chunk": text,
                "agent": lead_agent,
            })

        await proc.wait()
        elapsed_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        full_output = "".join(output_chunks)

        # Read stderr if any
        stderr_data = await proc.stderr.read()
        stderr_text = stderr_data.decode("utf-8", errors="replace").strip() if stderr_data else ""

        if proc.returncode == 0:
            # Success
            if lead:
                await record_event(AgentEvent(
                    agent_name=lead["name"], event_type="completed",
                    detail=f"Done ({len(full_output)} chars)", tokens_used=0, duration_ms=elapsed_ms,
                ))
            if decisor and decisor["name"] != lead["name"] if lead else True:
                await record_event(AgentEvent(
                    agent_name=decisor["name"], event_type="completed",
                    detail="Task approved", tokens_used=0, duration_ms=elapsed_ms,
                ))
            # Complete support agents
            for ag in agents_list:
                if ag["role"] in ("support", "security"):
                    await record_event(AgentEvent(agent_name=ag["name"], event_type="completed", detail="Done"))
        else:
            # Error
            error_detail = stderr_text[:200] or f"Exit code {proc.returncode}"
            if lead:
                await record_event(AgentEvent(
                    agent_name=lead["name"], event_type="error",
                    detail=error_detail, duration_ms=elapsed_ms,
                ))

        # Broadcast final output
        await manager.broadcast({
            "type": "command_result",
            "task_id": task_id,
            "output": full_output[-2000:],  # last 2000 chars
            "exit_code": proc.returncode,
            "duration_ms": elapsed_ms,
        })

    except Exception as e:
        if lead:
            await record_event(AgentEvent(agent_name=lead["name"], event_type="error", detail=str(e)[:200]))
        await manager.broadcast({
            "type": "command_result",
            "task_id": task_id,
            "output": f"Error: {e}",
            "exit_code": -1,
            "duration_ms": 0,
        })
    finally:
        _running_processes.pop(task_id, None)

        # Complete the task
        now = datetime.now(timezone.utc).isoformat()
        conn = get_db()
        conn.execute("UPDATE active_tasks SET status = 'completed', completed_at = ? WHERE task_id = ?", (now, task_id))
        conn.execute("UPDATE task_agents SET status = 'completed', completed_at = ? WHERE task_id = ?", (now, task_id))
        conn.commit()
        conn.close()
        await manager.broadcast({"type": "task_completed", "task_id": task_id, "timestamp": now})


# ── Routes ────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/v1", response_class=HTMLResponse)
async def classic_dashboard():
    return FileResponse(STATIC_DIR / "v1.html")


@app.get("/api/agents/enriched")
async def get_agents_enriched():
    """Return all agents with DNA/evolution data joined for ASCII visualization."""
    conn = get_db()
    agents = conn.execute("""
        SELECT r.name, r.display_name, r.team, r.category, r.color, r.status,
               r.last_active, r.total_invocations, r.total_tokens,
               COALESCE(d.maturity_level, 'embryo') as maturity_level,
               COALESCE(d.fitness_score, 0.5) as fitness_score,
               COALESCE(d.wisdom_score, 0.0) as wisdom_score,
               COALESCE(d.experience_years, 0.0) as experience_years,
               COALESCE(d.autonomy_level, 0.1) as autonomy_level,
               COALESCE(d.knowledge_depth, 0.1) as knowledge_depth,
               COALESCE(d.self_awareness_score, 0.1) as self_awareness_score,
               COALESCE(d.generation, 1) as generation,
               COALESCE(d.specialization_depth, 0.5) as specialization_depth,
               COALESCE(d.creativity_score, 0.5) as creativity_score,
               COALESCE(d.emotional_intelligence, 0.1) as emotional_intelligence,
               COALESCE(d.structural_coupling_score, 0.1) as coupling_score,
               COALESCE(d.perturbation_resilience, 0.1) as resilience
        FROM agent_registry r
        LEFT JOIN agent_dna d ON r.name = d.agent_name
        ORDER BY r.team, r.name
    """).fetchall()
    conn.close()
    return [dict(a) for a in agents]


@app.get("/api/agents")
async def get_agents():
    conn = get_db()
    agents = conn.execute("SELECT * FROM agent_registry ORDER BY category, team, name").fetchall()
    conn.close()
    return [dict(a) for a in agents]


@app.get("/api/agents/{name}")
async def get_agent(name: str):
    conn = get_db()
    agent = conn.execute("SELECT * FROM agent_registry WHERE name = ?", (name,)).fetchone()
    events = conn.execute(
        "SELECT * FROM agent_events WHERE agent_name = ? ORDER BY timestamp DESC LIMIT 50",
        (name,)
    ).fetchall()
    conn.close()
    if not agent:
        return {"error": "Agent not found"}
    return {"agent": dict(agent), "events": [dict(e) for e in events]}


@app.get("/api/agents/{name}/metrics")
async def get_agent_metrics(name: str):
    """Return aggregated scoring metrics for a specific agent."""
    conn = get_db()

    completions = conn.execute(
        "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'task_completed'",
        (name,)
    ).fetchone()[0]

    errors = conn.execute(
        "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'task_failed'",
        (name,)
    ).fetchone()[0]

    avg_response = conn.execute(
        "SELECT COALESCE(AVG(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'response_time_ms'",
        (name,)
    ).fetchone()[0]

    total_tokens = conn.execute(
        "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'tokens_used'",
        (name,)
    ).fetchone()[0]

    conn.close()

    total_tasks = int(completions + errors)
    success_rate = (completions / total_tasks) if total_tasks > 0 else 0.0
    reliability = (1 - (errors / total_tasks)) if total_tasks > 0 else 0.0

    # Speed score: normalized inverse of response time (faster = higher)
    # Baseline: 10000ms = 0.0, 0ms = 1.0
    if avg_response > 0:
        speed_score = max(0.0, min(1.0, 1.0 - (avg_response / 10000.0)))
    else:
        speed_score = 0.0

    score = (success_rate * 0.5) + (speed_score * 0.3) + (reliability * 0.2)

    return {
        "agent_name": name,
        "score": round(score, 4),
        "success_rate": round(success_rate, 4),
        "avg_response_ms": round(avg_response, 2),
        "total_tokens": int(total_tokens),
        "total_tasks": total_tasks,
        "total_errors": int(errors),
        "reliability": round(reliability, 4),
    }


@app.get("/api/leaderboard")
async def get_leaderboard():
    """Top 20 agents ordered by composite score."""
    conn = get_db()

    # Get all agents that have at least one metric
    agents_with_metrics = conn.execute(
        "SELECT DISTINCT agent_name FROM agent_metrics"
    ).fetchall()

    leaderboard = []
    for row in agents_with_metrics:
        name = row["agent_name"]

        completions = conn.execute(
            "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'task_completed'",
            (name,)
        ).fetchone()[0]

        errors = conn.execute(
            "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'task_failed'",
            (name,)
        ).fetchone()[0]

        avg_response = conn.execute(
            "SELECT COALESCE(AVG(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'response_time_ms'",
            (name,)
        ).fetchone()[0]

        total_tasks = int(completions + errors)
        if total_tasks == 0:
            continue

        success_rate = completions / total_tasks
        reliability = 1 - (errors / total_tasks)

        if avg_response > 0:
            speed_score = max(0.0, min(1.0, 1.0 - (avg_response / 10000.0)))
        else:
            speed_score = 0.0

        score = (success_rate * 0.5) + (speed_score * 0.3) + (reliability * 0.2)

        # Fetch display_name from registry
        agent_row = conn.execute(
            "SELECT display_name FROM agent_registry WHERE name = ?", (name,)
        ).fetchone()
        display_name = agent_row["display_name"] if agent_row else name

        leaderboard.append({
            "name": name,
            "display_name": display_name,
            "score": round(score, 4),
            "success_rate": round(success_rate, 4),
            "total_tasks": total_tasks,
            "avg_response_ms": round(avg_response, 2),
        })

    conn.close()

    # Sort by score descending, take top 20
    leaderboard.sort(key=lambda x: x["score"], reverse=True)
    return leaderboard[:20]


@app.get("/api/health")
async def health_check():
    """Health check endpoint with system status and detailed breakdown."""
    now = datetime.now(timezone.utc)
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    active = conn.execute(
        "SELECT COUNT(*) FROM agent_registry WHERE status NOT IN ('idle', 'error')"
    ).fetchone()[0]

    # Agents by status breakdown
    status_rows = conn.execute(
        "SELECT status, COUNT(*) as count FROM agent_registry GROUP BY status"
    ).fetchall()
    agents_by_status = {row["status"]: row["count"] for row in status_rows}

    # Last event timestamp
    last_event_row = conn.execute(
        "SELECT timestamp FROM agent_events ORDER BY timestamp DESC LIMIT 1"
    ).fetchone()
    last_event_timestamp = last_event_row["timestamp"] if last_event_row else None

    # Events in last hour
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    events_last_hour = conn.execute(
        "SELECT COUNT(*) FROM agent_events WHERE timestamp > ?", (one_hour_ago,)
    ).fetchone()[0]

    # Memory usage estimate from DB file size
    memory_usage_mb = 0.0
    try:
        db_size = os.path.getsize(DB_PATH)
        memory_usage_mb = round(db_size / (1024 * 1024), 2)
    except OSError:
        pass

    conn.close()

    uptime = (now - _start_time).total_seconds()
    return {
        "status": "ok",
        "agents": total,
        "active": active,
        "uptime_seconds": round(uptime, 2),
        "agents_by_status": agents_by_status,
        "last_event_timestamp": last_event_timestamp,
        "events_last_hour": events_last_hour,
        "memory_usage_mb": memory_usage_mb,
    }


@app.post("/api/agents/{name}/reset")
async def reset_agent(name: str):
    """Reset an agent's status to idle."""
    conn = get_db()
    agent = conn.execute("SELECT * FROM agent_registry WHERE name = ?", (name,)).fetchone()
    if not agent:
        conn.close()
        return {"error": "Agent not found"}

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE agent_registry SET status = 'idle', last_active = ? WHERE name = ?",
        (now, name)
    )
    conn.commit()
    conn.close()

    # Broadcast status change
    await manager.broadcast({
        "type": "agent_event",
        "event": {
            "agent_name": name,
            "event_type": "reset",
            "detail": "Agent status reset to idle",
            "tokens_used": 0,
            "duration_ms": 0,
            "timestamp": now,
        },
        "agent": None,
    })

    return {"status": "ok", "agent_name": name, "new_status": "idle"}


@app.get("/api/events")
async def get_events(limit: int = 100):
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM agent_events ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(e) for e in events]


@app.get("/api/stats")
async def get_stats():
    now = datetime.now(timezone.utc)
    conn = get_db()
    total_agents = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    active_agents = conn.execute("SELECT COUNT(*) FROM agent_registry WHERE status NOT IN ('idle', 'error')").fetchone()[0]
    total_events = conn.execute("SELECT COUNT(*) FROM agent_events").fetchone()[0]

    # Total tokens: sum from registry AND events for comprehensive tracking
    registry_tokens = conn.execute("SELECT COALESCE(SUM(total_tokens), 0) FROM agent_registry").fetchone()[0]
    events_tokens = conn.execute("SELECT COALESCE(SUM(tokens_used), 0) FROM agent_events").fetchone()[0]
    total_tokens = registry_tokens + events_tokens

    # Events in last hour
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    recent_events = conn.execute(
        "SELECT COUNT(*) FROM agent_events WHERE timestamp > ?", (one_hour_ago,)
    ).fetchone()[0]

    # Tokens per minute (from last 60 seconds of events)
    one_min_ago = (now - timedelta(seconds=60)).isoformat()
    tokens_last_min = conn.execute(
        "SELECT COALESCE(SUM(tokens_used), 0) FROM agent_events WHERE timestamp > ?", (one_min_ago,)
    ).fetchone()[0]
    tokens_per_minute = int(tokens_last_min)

    # Events per minute (from last 60 seconds)
    events_last_min = conn.execute(
        "SELECT COUNT(*) FROM agent_events WHERE timestamp > ?", (one_min_ago,)
    ).fetchone()[0]
    events_per_minute = int(events_last_min)

    # Average response time from agent_metrics
    avg_response_row = conn.execute(
        "SELECT COALESCE(AVG(value), 0) FROM agent_metrics WHERE metric_type = 'response_time_ms'"
    ).fetchone()
    avg_response_time_ms = round(avg_response_row[0], 2) if avg_response_row else 0.0

    # Network density: ratio of active connections (task_agents with active tasks) to possible connections
    # possible connections = n*(n-1)/2 where n = total agents
    active_connections = conn.execute(
        "SELECT COUNT(DISTINCT ta1.agent_name || '-' || ta2.agent_name) "
        "FROM task_agents ta1 JOIN task_agents ta2 ON ta1.task_id = ta2.task_id AND ta1.agent_name < ta2.agent_name "
        "WHERE ta1.status = 'active' AND ta2.status = 'active'"
    ).fetchone()[0]
    possible_connections = (total_agents * (total_agents - 1)) / 2 if total_agents > 1 else 1
    network_density = round(active_connections / possible_connections, 6) if possible_connections > 0 else 0.0

    # Teams active count
    teams_active = conn.execute(
        "SELECT COUNT(DISTINCT team) FROM agent_registry WHERE status NOT IN ('idle', 'error')"
    ).fetchone()[0]

    # Tasks completed today
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    tasks_completed_today = conn.execute(
        "SELECT COUNT(*) FROM active_tasks WHERE status = 'completed' AND completed_at >= ?", (today_start,)
    ).fetchone()[0]

    # Tasks currently active
    tasks_active = conn.execute(
        "SELECT COUNT(*) FROM active_tasks WHERE status = 'active'"
    ).fetchone()[0]

    # Uptime hours
    uptime_hours = round((now - _start_time).total_seconds() / 3600, 2)

    # Most active agents (top 10)
    top_agents = conn.execute(
        "SELECT name, display_name, total_invocations, total_tokens FROM agent_registry ORDER BY total_invocations DESC LIMIT 10"
    ).fetchall()

    # Events by category
    by_category = conn.execute(
        "SELECT category, COUNT(*) as count, SUM(total_invocations) as invocations FROM agent_registry GROUP BY category"
    ).fetchall()

    conn.close()
    return {
        "total_agents": total_agents,
        "active_agents": active_agents,
        "total_events": total_events,
        "total_tokens": total_tokens,
        "tokens_per_minute": tokens_per_minute,
        "events_per_minute": events_per_minute,
        "avg_response_time_ms": avg_response_time_ms,
        "network_density": network_density,
        "teams_active": teams_active,
        "tasks_completed_today": tasks_completed_today,
        "tasks_active": tasks_active,
        "uptime_hours": uptime_hours,
        "recent_events": recent_events,
        "top_agents": [dict(a) for a in top_agents],
        "by_category": [dict(c) for c in by_category],
    }


@app.post("/api/event")
async def record_event(event: AgentEvent):
    """Record an agent event and broadcast to all connected dashboards."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()

    # Insert event
    conn.execute(
        "INSERT INTO agent_events (agent_name, event_type, detail, tokens_used, duration_ms, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        (event.agent_name, event.event_type, event.detail, event.tokens_used or 0, event.duration_ms or 0, now)
    )

    # Map event_type to agent status
    status_map = {
        "spawned": "spawning",
        "thinking": "thinking",
        "delegating": "delegating",
        "reviewing": "reviewing",
        "waiting": "waiting",
        "active": "active",
        "completed": "idle",
        "error": "error",
    }
    new_status = status_map.get(event.event_type, "active")

    if event.event_type == "spawned":
        conn.execute(
            "UPDATE agent_registry SET status = ?, last_active = ?, total_invocations = total_invocations + 1 WHERE name = ?",
            (new_status, now, event.agent_name)
        )
    elif event.event_type == "completed":
        conn.execute(
            "UPDATE agent_registry SET status = 'idle', last_active = ?, total_tokens = total_tokens + ? WHERE name = ?",
            (now, event.tokens_used or 0, event.agent_name)
        )
    elif event.event_type == "error":
        conn.execute(
            "UPDATE agent_registry SET status = 'error', last_active = ? WHERE name = ?",
            (now, event.agent_name)
        )
    else:
        # thinking, delegating, reviewing, waiting, active
        conn.execute(
            "UPDATE agent_registry SET status = ?, last_active = ? WHERE name = ?",
            (new_status, now, event.agent_name)
        )

    conn.commit()

    # ── Record metrics based on event type ────────────────────────────
    if event.event_type == "completed":
        conn.execute(
            "INSERT INTO agent_metrics (agent_name, metric_type, value, timestamp) VALUES (?, 'task_completed', 1, ?)",
            (event.agent_name, now)
        )
        if (event.duration_ms or 0) > 0:
            conn.execute(
                "INSERT INTO agent_metrics (agent_name, metric_type, value, timestamp) VALUES (?, 'response_time_ms', ?, ?)",
                (event.agent_name, float(event.duration_ms), now)
            )
    elif event.event_type == "error":
        conn.execute(
            "INSERT INTO agent_metrics (agent_name, metric_type, value, timestamp) VALUES (?, 'task_failed', 1, ?)",
            (event.agent_name, now)
        )
    if (event.tokens_used or 0) > 0:
        conn.execute(
            "INSERT INTO agent_metrics (agent_name, metric_type, value, timestamp) VALUES (?, 'tokens_used', ?, ?)",
            (event.agent_name, float(event.tokens_used), now)
        )
    conn.commit()

    # Get updated agent info
    agent = conn.execute("SELECT * FROM agent_registry WHERE name = ?", (event.agent_name,)).fetchone()
    conn.close()

    # Broadcast to all WebSocket clients (batched for performance)
    queue_broadcast({
        "type": "agent_event",
        "event": {
            "agent_name": event.agent_name,
            "event_type": event.event_type,
            "detail": event.detail,
            "tokens_used": event.tokens_used,
            "duration_ms": event.duration_ms,
            "timestamp": now,
        },
        "agent": dict(agent) if agent else None,
    })

    return {"status": "ok", "timestamp": now}


@app.post("/api/command")
async def dispatch_command(cmd: CommandRequest):
    """Receive a command from the UI, route it to the best agents, execute via Claude CLI."""
    routing = route_task(cmd.prompt)
    task_id = f"cmd-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()

    # Create task
    conn.execute(
        "INSERT INTO active_tasks (task_id, task_name, status, created_at) VALUES (?, ?, 'active', ?)",
        (task_id, cmd.prompt[:120], now)
    )

    # Deduplicate agents
    seen = set()
    unique_agents = []
    for ag in routing["agents"]:
        if ag["name"] not in seen:
            seen.add(ag["name"])
            unique_agents.append(ag)

    for ag in unique_agents:
        conn.execute(
            "INSERT INTO task_agents (task_id, agent_name, role, delegated_by, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)",
            (task_id, ag["name"], ag["role"], ag.get("delegated_by"), now)
        )
        conn.execute(
            "UPDATE agent_registry SET status = 'spawning', last_active = ?, total_invocations = total_invocations + 1 WHERE name = ?",
            (now, ag["name"])
        )

    conn.commit()
    conn.close()

    # Broadcast task creation
    await manager.broadcast({
        "type": "task_created",
        "task": {
            "task_id": task_id,
            "task_name": cmd.prompt[:120],
            "agents": unique_agents,
            "route": routing["route"],
            "timestamp": now,
        },
    })

    # Execute Claude CLI in background (REAL execution, not simulation)
    lead = next((a for a in unique_agents if a["role"] == "lead"), unique_agents[0])
    work_dir = cmd.working_dir or DEFAULT_WORK_DIR
    asyncio.create_task(_run_claude_cli(task_id, cmd.prompt, lead["name"], unique_agents, work_dir))

    return {
        "status": "ok",
        "task_id": task_id,
        "route": routing["route"],
        "agents": unique_agents,
        "mode": "live_cli",
    }


@app.post("/api/command/cancel/{task_id}")
async def cancel_command(task_id: str):
    """Cancel a running Claude CLI process."""
    proc = _running_processes.get(task_id)
    if proc:
        proc.terminate()
        await asyncio.sleep(0.5)
        if proc.returncode is None:
            proc.kill()
        _running_processes.pop(task_id, None)
        now = datetime.now(timezone.utc).isoformat()
        conn = get_db()
        conn.execute("UPDATE active_tasks SET status = 'completed', completed_at = ? WHERE task_id = ?", (now, task_id))
        conn.commit()
        conn.close()
        await manager.broadcast({"type": "task_completed", "task_id": task_id, "timestamp": now})
        return {"status": "cancelled", "task_id": task_id}
    return {"status": "not_found", "task_id": task_id}


@app.post("/api/simulate/{agent_name}")
async def simulate_event(agent_name: str, event_type: str = "spawned"):
    """Simulate an agent event for testing."""
    event = AgentEvent(
        agent_name=agent_name,
        event_type=event_type,
        detail=f"Simulated {event_type}",
        tokens_used=1500 if event_type == "completed" else 0,
        duration_ms=5000 if event_type == "completed" else 0,
    )
    return await record_event(event)


@app.post("/api/task")
async def create_task(task: TaskCreate):
    """Create a task with agent relationships (delegation chain)."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()

    conn.execute(
        "INSERT INTO active_tasks (task_id, task_name, status, priority, created_at) VALUES (?, ?, 'active', ?, ?)",
        (task.task_id, task.task_name, task.priority, now)
    )

    for ag in task.agents:
        conn.execute(
            "INSERT INTO task_agents (task_id, agent_name, role, delegated_by, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)",
            (task.task_id, ag["name"], ag.get("role", "executor"), ag.get("delegated_by"), now)
        )
        conn.execute(
            "UPDATE agent_registry SET status = 'active', last_active = ?, total_invocations = total_invocations + 1 WHERE name = ?",
            (now, ag["name"])
        )

    conn.commit()
    conn.close()

    # Broadcast task creation with relationships
    await manager.broadcast({
        "type": "task_created",
        "task": {"task_id": task.task_id, "task_name": task.task_name, "agents": task.agents, "priority": task.priority, "timestamp": now},
    })

    return {"status": "ok", "task_id": task.task_id}


PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@app.get("/api/tasks/active")
async def get_active_tasks():
    """Get all active tasks with their agent relationships (edges for the graph), sorted by priority."""
    conn = get_db()
    tasks = conn.execute("SELECT * FROM active_tasks WHERE status = 'active' ORDER BY created_at DESC").fetchall()
    result = []
    for t in tasks:
        agents = conn.execute(
            "SELECT * FROM task_agents WHERE task_id = ? ORDER BY started_at",
            (t["task_id"],)
        ).fetchall()
        task_dict = dict(t)
        task_dict["agents"] = [dict(a) for a in agents]
        # Ensure priority is present in the response
        if "priority" not in task_dict or task_dict["priority"] is None:
            task_dict["priority"] = "medium"
        result.append(task_dict)
    conn.close()

    # Sort by priority order (critical first, low last)
    result.sort(key=lambda x: PRIORITY_ORDER.get(x.get("priority", "medium"), 2))
    return result


@app.post("/api/task/{task_id}/complete")
async def complete_task(task_id: str):
    """Mark a task as completed, idle all its agents."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    conn.execute("UPDATE active_tasks SET status = 'completed', completed_at = ? WHERE task_id = ?", (now, task_id))
    agents = conn.execute("SELECT agent_name FROM task_agents WHERE task_id = ?", (task_id,)).fetchall()
    for a in agents:
        conn.execute("UPDATE task_agents SET status = 'completed', completed_at = ? WHERE task_id = ? AND agent_name = ?", (now, task_id, a["agent_name"]))
        # Only set idle if agent has no other active tasks
        other = conn.execute("SELECT COUNT(*) FROM task_agents WHERE agent_name = ? AND status = 'active' AND task_id != ?", (a["agent_name"], task_id)).fetchone()[0]
        if other == 0:
            conn.execute("UPDATE agent_registry SET status = 'idle' WHERE name = ?", (a["agent_name"],))
    conn.commit()
    conn.close()

    await manager.broadcast({"type": "task_completed", "task_id": task_id, "timestamp": now})
    return {"status": "ok"}


@app.post("/api/task/{task_id}/retry")
async def retry_task(task_id: str):
    """Retry a failed/completed task by re-creating it with the same agents."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()

    # Get original task
    task = conn.execute("SELECT * FROM active_tasks WHERE task_id = ?", (task_id,)).fetchone()
    if not task:
        conn.close()
        return {"error": "Task not found"}

    # Get completed agents from the original task
    failed_agents = conn.execute(
        "SELECT * FROM task_agents WHERE task_id = ? AND status = 'completed'",
        (task_id,)
    ).fetchall()

    # Create retry task
    retry_id = f"{task_id}-retry-{uuid.uuid4().hex[:4]}"
    conn.execute(
        "INSERT INTO active_tasks (task_id, task_name, status, priority, created_at) VALUES (?, ?, 'active', 'high', ?)",
        (retry_id, f"RETRY: {task['task_name']}", now)
    )

    # Re-assign agents
    for ag in failed_agents:
        conn.execute(
            "INSERT INTO task_agents (task_id, agent_name, role, delegated_by, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)",
            (retry_id, ag["agent_name"], ag["role"], ag["delegated_by"], now)
        )
        conn.execute(
            "UPDATE agent_registry SET status = 'active', last_active = ? WHERE name = ?",
            (now, ag["agent_name"])
        )

    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "task_created",
        "task": {"task_id": retry_id, "task_name": f"RETRY: {task['task_name']}", "priority": "high"},
    })

    return {"status": "ok", "retry_task_id": retry_id}


@app.post("/api/task/{task_id}/priority")
async def set_task_priority(task_id: str, priority: str = "medium"):
    """Change the priority of an active task."""
    if priority not in PRIORITY_ORDER:
        return {"error": f"Invalid priority '{priority}'. Must be one of: critical, high, medium, low"}

    conn = get_db()
    task = conn.execute("SELECT * FROM active_tasks WHERE task_id = ?", (task_id,)).fetchone()
    if not task:
        conn.close()
        return {"error": "Task not found"}

    conn.execute("UPDATE active_tasks SET priority = ? WHERE task_id = ?", (priority, task_id))
    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "task_priority_changed",
        "task_id": task_id,
        "priority": priority,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"status": "ok", "task_id": task_id, "priority": priority}


@app.get("/api/tasks/history")
async def get_task_history(limit: int = 50):
    """Get ALL tasks (active + completed) with full agent participation."""
    conn = get_db()
    tasks = conn.execute("SELECT * FROM active_tasks ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    result = []
    for t in tasks:
        agents = conn.execute("SELECT * FROM task_agents WHERE task_id = ? ORDER BY started_at", (t["task_id"],)).fetchall()
        result.append({**dict(t), "agents": [dict(a) for a in agents]})
    conn.close()
    return result


@app.get("/api/stats/timeline")
async def get_stats_timeline():
    """Events grouped by 5-min buckets for the last hour with active agent counts."""
    conn = get_db()
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

    # Group events into 5-minute buckets using integer division on minutes
    rows = conn.execute("""
        SELECT
            strftime('%Y-%m-%dT%H:', timestamp) || printf('%02d', (CAST(strftime('%M', timestamp) AS INTEGER) / 5) * 5) || ':00' as timestamp,
            COUNT(*) as count,
            COUNT(DISTINCT agent_name) as active_agents
        FROM agent_events
        WHERE timestamp > ?
        GROUP BY strftime('%Y-%m-%dT%H:', timestamp) || printf('%02d', (CAST(strftime('%M', timestamp) AS INTEGER) / 5) * 5)
        ORDER BY timestamp
    """, (one_hour_ago,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════════════
# NETWORK STATISTICS & TOKEN TRACKING — Deep analysis endpoints
# ══════════════════════════════════════════════════════════════════════


@app.get("/api/network/stats")
async def get_network_stats():
    """Deep network analysis: connectivity, delegation chains, token distribution by team."""
    now = datetime.now(timezone.utc)
    conn = get_db()

    # Basic counts
    total_agents = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    total_teams = conn.execute("SELECT COUNT(DISTINCT team) FROM agent_registry").fetchone()[0]
    total_connections = conn.execute(
        "SELECT COUNT(DISTINCT ta1.agent_name || '-' || ta2.agent_name) "
        "FROM task_agents ta1 JOIN task_agents ta2 "
        "ON ta1.task_id = ta2.task_id AND ta1.agent_name < ta2.agent_name"
    ).fetchone()[0]

    # Most connected agent (agent with most task participations)
    most_connected_row = conn.execute(
        "SELECT agent_name, COUNT(DISTINCT task_id) as task_count "
        "FROM task_agents GROUP BY agent_name ORDER BY task_count DESC LIMIT 1"
    ).fetchone()
    most_connected_agent = {
        "name": most_connected_row["agent_name"],
        "task_count": most_connected_row["task_count"],
    } if most_connected_row else None

    # Busiest team (team with highest aggregate invocations)
    busiest_team_row = conn.execute(
        "SELECT team, SUM(total_invocations) as total_inv "
        "FROM agent_registry GROUP BY team ORDER BY total_inv DESC LIMIT 1"
    ).fetchone()
    busiest_team = {
        "team": busiest_team_row["team"],
        "total_invocations": busiest_team_row["total_inv"],
    } if busiest_team_row else None

    # Delegation chains active (count of currently active tasks that have delegation)
    delegation_chains_active = conn.execute(
        "SELECT COUNT(DISTINCT ta.task_id) FROM task_agents ta "
        "JOIN active_tasks at ON ta.task_id = at.task_id "
        "WHERE at.status = 'active' AND ta.delegated_by IS NOT NULL"
    ).fetchone()[0]

    # Average chain depth (average number of agents per active task)
    avg_chain_row = conn.execute(
        "SELECT AVG(agent_count) FROM ("
        "  SELECT ta.task_id, COUNT(DISTINCT ta.agent_name) as agent_count "
        "  FROM task_agents ta JOIN active_tasks at ON ta.task_id = at.task_id "
        "  WHERE at.status = 'active' GROUP BY ta.task_id"
        ")"
    ).fetchone()
    avg_chain_depth = round(avg_chain_row[0], 2) if avg_chain_row and avg_chain_row[0] else 0.0

    # Tokens by team
    tokens_by_team_rows = conn.execute(
        "SELECT team, COALESCE(SUM(total_tokens), 0) as tokens "
        "FROM agent_registry GROUP BY team ORDER BY tokens DESC"
    ).fetchall()
    tokens_by_team = {row["team"]: int(row["tokens"]) for row in tokens_by_team_rows}

    # Invocations by team
    invocations_by_team_rows = conn.execute(
        "SELECT team, COALESCE(SUM(total_invocations), 0) as invocations "
        "FROM agent_registry GROUP BY team ORDER BY invocations DESC"
    ).fetchall()
    invocations_by_team = {row["team"]: int(row["invocations"]) for row in invocations_by_team_rows}

    # Agent states distribution
    states_rows = conn.execute(
        "SELECT status, COUNT(*) as count FROM agent_registry GROUP BY status"
    ).fetchall()
    agent_states_distribution = {row["status"]: row["count"] for row in states_rows}

    # Top 5 delegators (agents who delegate the most)
    top_delegators_rows = conn.execute(
        "SELECT delegated_by as agent, COUNT(*) as delegation_count "
        "FROM task_agents WHERE delegated_by IS NOT NULL "
        "GROUP BY delegated_by ORDER BY delegation_count DESC LIMIT 5"
    ).fetchall()
    top_delegators = [{"name": row["agent"], "delegations": row["delegation_count"]} for row in top_delegators_rows]

    # Top 5 executors (agents who execute the most tasks)
    top_executors_rows = conn.execute(
        "SELECT agent_name, COUNT(*) as execution_count "
        "FROM task_agents WHERE role = 'executor' OR role = 'lead' "
        "GROUP BY agent_name ORDER BY execution_count DESC LIMIT 5"
    ).fetchall()
    top_executors = [{"name": row["agent_name"], "executions": row["execution_count"]} for row in top_executors_rows]

    # Hourly activity (events per hour for last 24h)
    twenty_four_h_ago = (now - timedelta(hours=24)).isoformat()
    hourly_rows = conn.execute("""
        SELECT
            strftime('%Y-%m-%dT%H:00:00', timestamp) as hour,
            COUNT(*) as events,
            COALESCE(SUM(tokens_used), 0) as tokens,
            COUNT(DISTINCT agent_name) as agents_active
        FROM agent_events
        WHERE timestamp > ?
        GROUP BY strftime('%Y-%m-%dT%H', timestamp)
        ORDER BY hour
    """, (twenty_four_h_ago,)).fetchall()
    hourly_activity = [
        {"hour": row["hour"], "events": row["events"], "tokens": int(row["tokens"]), "agents_active": row["agents_active"]}
        for row in hourly_rows
    ]

    conn.close()
    return {
        "total_agents": total_agents,
        "total_teams": total_teams,
        "total_connections": total_connections,
        "most_connected_agent": most_connected_agent,
        "busiest_team": busiest_team,
        "delegation_chains_active": delegation_chains_active,
        "avg_chain_depth": avg_chain_depth,
        "tokens_by_team": tokens_by_team,
        "invocations_by_team": invocations_by_team,
        "agent_states_distribution": agent_states_distribution,
        "top_delegators": top_delegators,
        "top_executors": top_executors,
        "hourly_activity": hourly_activity,
    }


@app.get("/api/network/topology")
async def get_network_topology():
    """Graph metadata: nodes, edges, clusters, hub agents, and isolated agents."""
    conn = get_db()

    # Nodes count (all registered agents)
    nodes = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]

    # Edges count (unique agent-to-agent connections across all tasks)
    edges = conn.execute(
        "SELECT COUNT(*) FROM ("
        "  SELECT DISTINCT ta1.agent_name, ta2.agent_name "
        "  FROM task_agents ta1 JOIN task_agents ta2 "
        "  ON ta1.task_id = ta2.task_id AND ta1.agent_name < ta2.agent_name"
        ")"
    ).fetchone()[0]

    # Clusters: teams as clusters with member counts
    cluster_rows = conn.execute(
        "SELECT team, COUNT(*) as member_count, "
        "COALESCE(SUM(total_invocations), 0) as total_invocations "
        "FROM agent_registry GROUP BY team ORDER BY member_count DESC"
    ).fetchall()
    clusters = [
        {"team": row["team"], "member_count": row["member_count"], "total_invocations": int(row["total_invocations"])}
        for row in cluster_rows
    ]

    # Hub agents: agents connected to >3 teams via tasks
    # An agent is a hub if it appears in tasks alongside agents from more than 3 different teams
    hub_rows = conn.execute("""
        SELECT ta1.agent_name, COUNT(DISTINCT ar.team) as teams_connected
        FROM task_agents ta1
        JOIN task_agents ta2 ON ta1.task_id = ta2.task_id AND ta1.agent_name != ta2.agent_name
        JOIN agent_registry ar ON ta2.agent_name = ar.name
        GROUP BY ta1.agent_name
        HAVING teams_connected > 3
        ORDER BY teams_connected DESC
    """).fetchall()
    hub_agents = [{"name": row["agent_name"], "teams_connected": row["teams_connected"]} for row in hub_rows]

    # Isolated agents: agents that have never been invoked (no task_agents entries)
    isolated_rows = conn.execute(
        "SELECT ar.name, ar.display_name, ar.team FROM agent_registry ar "
        "LEFT JOIN task_agents ta ON ar.name = ta.agent_name "
        "WHERE ta.agent_name IS NULL AND ar.total_invocations = 0 "
        "ORDER BY ar.team, ar.name"
    ).fetchall()
    isolated_agents = [{"name": row["name"], "display_name": row["display_name"], "team": row["team"]} for row in isolated_rows]

    conn.close()
    return {
        "nodes": nodes,
        "edges": edges,
        "clusters": clusters,
        "hub_agents": hub_agents,
        "isolated_agents": isolated_agents,
    }


@app.get("/api/activity/timeline")
async def get_activity_timeline():
    """Last 100 events grouped by minute for sparkline charts.

    Each entry: {minute: "HH:MM", events: N, tokens: N, agents_active: N}
    """
    now = datetime.now(timezone.utc)
    conn = get_db()

    # Fetch events grouped by minute, limited to most recent 100 distinct minutes
    rows = conn.execute("""
        SELECT
            strftime('%H:%M', timestamp) as minute,
            COUNT(*) as events,
            COALESCE(SUM(tokens_used), 0) as tokens,
            COUNT(DISTINCT agent_name) as agents_active
        FROM agent_events
        WHERE timestamp > ?
        GROUP BY strftime('%Y-%m-%dT%H:%M', timestamp)
        ORDER BY strftime('%Y-%m-%dT%H:%M', timestamp) DESC
        LIMIT 100
    """, ((now - timedelta(hours=24)).isoformat(),)).fetchall()

    conn.close()

    # Reverse to chronological order (oldest first)
    result = [
        {
            "minute": row["minute"],
            "events": row["events"],
            "tokens": int(row["tokens"]),
            "agents_active": row["agents_active"],
        }
        for row in reversed(rows)
    ]
    return result


@app.get("/api/agents/{name}/history")
async def get_agent_history(name: str, limit: int = 100):
    """Full event history for a specific agent, including tasks and performance metrics."""
    conn = get_db()

    # Last N events
    events = conn.execute(
        "SELECT * FROM agent_events WHERE agent_name = ? ORDER BY timestamp DESC LIMIT ?",
        (name, limit)
    ).fetchall()

    # Tasks the agent participated in (with status and role)
    tasks = conn.execute(
        "SELECT t.*, ta.role, ta.delegated_by, ta.status as agent_status "
        "FROM active_tasks t JOIN task_agents ta ON t.task_id = ta.task_id "
        "WHERE ta.agent_name = ? ORDER BY t.created_at DESC LIMIT 50",
        (name,)
    ).fetchall()

    # Performance metrics
    completions = conn.execute(
        "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'task_completed'",
        (name,)
    ).fetchone()[0]

    errors = conn.execute(
        "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'task_failed'",
        (name,)
    ).fetchone()[0]

    avg_response = conn.execute(
        "SELECT COALESCE(AVG(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'response_time_ms'",
        (name,)
    ).fetchone()[0]

    total_tokens = conn.execute(
        "SELECT COALESCE(SUM(value), 0) FROM agent_metrics WHERE agent_name = ? AND metric_type = 'tokens_used'",
        (name,)
    ).fetchone()[0]

    conn.close()

    total_tasks = int(completions + errors)
    success_rate = (completions / total_tasks) if total_tasks > 0 else 0.0

    return {
        "events": [dict(e) for e in events],
        "tasks": [dict(t) for t in tasks],
        "metrics": {
            "total_tasks": total_tasks,
            "total_completions": int(completions),
            "total_errors": int(errors),
            "success_rate": round(success_rate, 4),
            "avg_response_ms": round(avg_response, 2),
            "total_tokens": int(total_tokens),
        },
    }


@app.get("/api/route")
async def preview_route(prompt: str):
    """Preview which agents would be assigned to a task without creating it."""
    return route_task(prompt)


# ══════════════════════════════════════════════════════════════════════
# CEREBRO CENTRAL — Shared Memory, Feedback, Marketplace, System State
# ══════════════════════════════════════════════════════════════════════


# ── Shared Memory (Mente Colmena) ────────────────────────────────────

@app.post("/api/memory/publish")
async def publish_memory(mem: MemoryPublish):
    """Publish an insight to the shared memory (hive mind)."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    conn.execute(
        "INSERT INTO shared_memory (agent_name, insight_type, content, relevance_score, created_at) VALUES (?,?,?,?,?)",
        (mem.agent_name, mem.insight_type, mem.content, mem.relevance_score, now)
    )
    conn.commit()
    conn.close()
    await manager.broadcast({
        "type": "memory_published",
        "agent": mem.agent_name,
        "insight": mem.insight_type,
        "content": mem.content[:100],
        "timestamp": now,
    })
    return {"status": "ok", "timestamp": now}


@app.get("/api/memory/recent")
async def get_recent_memories(limit: int = 20):
    """Return last N shared memories ordered by most recent."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM shared_memory ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Agent Feedback ───────────────────────────────────────────────────

@app.post("/api/feedback")
async def submit_feedback(fb: AgentFeedbackModel):
    """Submit feedback from one agent to another (peer evaluation)."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    conn.execute(
        "INSERT INTO agent_feedback (from_agent, to_agent, task_id, score, feedback_text, created_at) VALUES (?,?,?,?,?,?)",
        (fb.from_agent, fb.to_agent, fb.task_id, fb.score, fb.feedback_text, now)
    )
    conn.commit()
    conn.close()
    await manager.broadcast({
        "type": "feedback_submitted",
        "from_agent": fb.from_agent,
        "to_agent": fb.to_agent,
        "score": fb.score,
        "timestamp": now,
    })
    return {"status": "ok", "timestamp": now}


@app.get("/api/feedback/{agent_name}")
async def get_agent_feedback(agent_name: str):
    """Return average score and recent feedback for an agent."""
    conn = get_db()

    avg_row = conn.execute(
        "SELECT COALESCE(AVG(score), 0) as avg_score, COUNT(*) as total_reviews FROM agent_feedback WHERE to_agent = ?",
        (agent_name,)
    ).fetchone()

    recent = conn.execute(
        "SELECT * FROM agent_feedback WHERE to_agent = ? ORDER BY created_at DESC LIMIT 20",
        (agent_name,)
    ).fetchall()

    conn.close()
    return {
        "agent_name": agent_name,
        "avg_score": round(avg_row["avg_score"], 4),
        "total_reviews": avg_row["total_reviews"],
        "recent_feedback": [dict(r) for r in recent],
    }


# ── Agent Marketplace (Bidding) ──────────────────────────────────────

@app.post("/api/marketplace/bid")
async def submit_bid(bid: AgentBid):
    """Submit a bid from an agent for a task."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    conn.execute(
        "INSERT INTO agent_bids (task_id, agent_name, bid_score, bid_reason, created_at) VALUES (?,?,?,?,?)",
        (bid.task_id, bid.agent_name, bid.bid_score, bid.bid_reason, now)
    )
    conn.commit()
    conn.close()
    await manager.broadcast({
        "type": "bid_submitted",
        "task_id": bid.task_id,
        "agent": bid.agent_name,
        "bid_score": bid.bid_score,
        "timestamp": now,
    })
    return {"status": "ok", "timestamp": now}


@app.post("/api/marketplace/select/{task_id}")
async def select_best_bid(task_id: str):
    """Select the best bid (highest bid_score) for a task and mark it as selected."""
    conn = get_db()

    # Find the highest scoring bid for this task
    best = conn.execute(
        "SELECT * FROM agent_bids WHERE task_id = ? ORDER BY bid_score DESC LIMIT 1",
        (task_id,)
    ).fetchone()

    if not best:
        conn.close()
        return {"error": "No bids found for this task", "task_id": task_id}

    # Mark it as selected
    conn.execute(
        "UPDATE agent_bids SET selected = 1 WHERE id = ?",
        (best["id"],)
    )
    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "bid_selected",
        "task_id": task_id,
        "agent": best["agent_name"],
        "bid_score": best["bid_score"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "status": "ok",
        "task_id": task_id,
        "selected_agent": best["agent_name"],
        "bid_score": best["bid_score"],
        "bid_reason": best["bid_reason"],
    }


@app.get("/api/marketplace/bids/{task_id}")
async def get_task_bids(task_id: str):
    """Return all bids for a task, ordered by bid_score descending."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM agent_bids WHERE task_id = ? ORDER BY bid_score DESC",
        (task_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── System State (Conciencia Operacional) ────────────────────────────

def _compute_system_state(conn) -> dict:
    """Compute the current system state from the database. Requires an open connection with row_factory set."""
    total_agents = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    active_agents = conn.execute(
        "SELECT COUNT(*) FROM agent_registry WHERE status NOT IN ('idle', 'error')"
    ).fetchone()[0]
    error_agents = conn.execute(
        "SELECT COUNT(*) FROM agent_registry WHERE status = 'error'"
    ).fetchone()[0]
    active_tasks = conn.execute(
        "SELECT COUNT(*) FROM active_tasks WHERE status = 'active'"
    ).fetchone()[0]
    total_events = conn.execute("SELECT COUNT(*) FROM agent_events").fetchone()[0]
    total_tokens = conn.execute(
        "SELECT COALESCE(SUM(total_tokens), 0) FROM agent_registry"
    ).fetchone()[0]

    # Average agent feedback score
    avg_score_row = conn.execute(
        "SELECT COALESCE(AVG(score), 0) FROM agent_feedback"
    ).fetchone()
    avg_score = avg_score_row[0] if avg_score_row else 0.0

    # Health logic
    five_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    recent_errors = conn.execute(
        "SELECT COUNT(*) FROM agent_events WHERE event_type = 'error' AND timestamp > ?",
        (five_min_ago,)
    ).fetchone()[0]

    if total_agents > 0 and error_agents > (total_agents * 0.5):
        health = "critical"
    elif recent_errors > 0 or error_agents > 0:
        health = "degraded"
    else:
        health = "healthy"

    # Top performers: agents with highest feedback scores (at least 1 review)
    top_performers_rows = conn.execute(
        "SELECT to_agent, AVG(score) as avg, COUNT(*) as cnt FROM agent_feedback GROUP BY to_agent HAVING cnt >= 1 ORDER BY avg DESC LIMIT 5"
    ).fetchall()
    top_performers = [{"agent": r["to_agent"], "avg_score": round(r["avg"], 4), "reviews": r["cnt"]} for r in top_performers_rows]

    # Bottom performers
    bottom_performers_rows = conn.execute(
        "SELECT to_agent, AVG(score) as avg, COUNT(*) as cnt FROM agent_feedback GROUP BY to_agent HAVING cnt >= 1 ORDER BY avg ASC LIMIT 5"
    ).fetchall()
    bottom_performers = [{"agent": r["to_agent"], "avg_score": round(r["avg"], 4), "reviews": r["cnt"]} for r in bottom_performers_rows]

    # Anomalies: agents stuck in non-idle states for too long (>10 min)
    ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    stuck_agents = conn.execute(
        "SELECT name, status, last_active FROM agent_registry WHERE status NOT IN ('idle', 'error') AND last_active < ?",
        (ten_min_ago,)
    ).fetchall()
    anomalies = [{"agent": r["name"], "status": r["status"], "last_active": r["last_active"], "issue": "stuck"} for r in stuck_agents]

    # Also flag agents in error state as anomalies
    error_agent_rows = conn.execute(
        "SELECT name, status, last_active FROM agent_registry WHERE status = 'error'"
    ).fetchall()
    for r in error_agent_rows:
        anomalies.append({"agent": r["name"], "status": r["status"], "last_active": r["last_active"], "issue": "error"})

    # Cost estimate: rough estimate based on tokens (Claude pricing approximation)
    # ~$3 per 1M input tokens, ~$15 per 1M output tokens; use avg ~$8/1M as rough estimate
    cost_estimate_usd = round((total_tokens / 1_000_000) * 8.0, 4)

    return {
        "total_agents": total_agents,
        "active_agents": active_agents,
        "active_tasks": active_tasks,
        "total_events": total_events,
        "total_tokens": total_tokens,
        "avg_agent_score": round(avg_score, 4),
        "health": health,
        "top_performers": top_performers,
        "bottom_performers": bottom_performers,
        "anomalies": anomalies,
        "cost_estimate_usd": cost_estimate_usd,
    }


@app.get("/api/system/state")
async def get_system_state():
    """Return current system state snapshot with health, performers, anomalies, and cost."""
    conn = get_db()
    state = _compute_system_state(conn)
    conn.close()
    return state


@app.post("/api/system/snapshot")
async def take_system_snapshot():
    """Take a snapshot of current system state and persist it to system_snapshots."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    state = _compute_system_state(conn)

    conn.execute(
        "INSERT INTO system_snapshots (total_agents, active_agents, active_tasks, total_events, total_tokens, avg_score, health_status, snapshot_at) VALUES (?,?,?,?,?,?,?,?)",
        (
            state["total_agents"],
            state["active_agents"],
            state["active_tasks"],
            state["total_events"],
            state["total_tokens"],
            state["avg_agent_score"],
            state["health"],
            now,
        )
    )
    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "system_snapshot",
        "state": state,
        "timestamp": now,
    })

    return {"status": "ok", "snapshot": state, "timestamp": now}


@app.get("/api/system/snapshots")
async def get_system_snapshots(limit: int = 50):
    """Return last N system snapshots for trending analysis."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM system_snapshots ORDER BY snapshot_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── TOON Protocol API ─────────────────────────────────────────────────

class ToonEncodeRequest(BaseModel):
    data: dict

class ToonDecodeRequest(BaseModel):
    toon_string: str

class ToonMessageRequest(BaseModel):
    from_agent: str
    to_agent: str
    msg_type: str  # task_assign, task_result, delegate, escalate, feedback, status, query, response, alert
    payload: dict
    task_id: Optional[str] = None
    priority: str = "medium"  # critical, high, medium, low


@app.post("/api/toon/encode")
async def toon_encode(req: ToonEncodeRequest):
    """Encode a JSON object to TOON format."""
    toon_str = TOON.encode_flat(req.data)
    stats = TOON.compare_formats(req.data)
    return {"toon": toon_str, "savings_pct": stats["savings_pct"], "json_tokens": stats["json_tokens"], "toon_tokens": stats["toon_tokens"]}


@app.post("/api/toon/decode")
async def toon_decode(req: ToonDecodeRequest):
    """Decode a TOON string back to JSON."""
    data = TOON.decode_flat(req.toon_string)
    return {"data": data}


@app.post("/api/toon/message")
async def toon_message(req: ToonMessageRequest):
    """Create a TOON-encoded inter-agent message and optionally route it."""
    msg = TOON.agent_message(
        from_agent=req.from_agent,
        to_agent=req.to_agent,
        msg_type=req.msg_type,
        payload=req.payload,
        task_id=req.task_id,
        priority=req.priority,
    )
    # Log as event
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO agent_events (agent_name, event_type, detail, timestamp) VALUES (?, ?, ?, ?)",
        (req.from_agent, f"toon_{req.msg_type}", f"→ {req.to_agent}: {msg[:200]}", now)
    )
    conn.commit()
    conn.close()

    queue_broadcast({
        "type": "toon_message",
        "from": req.from_agent,
        "to": req.to_agent,
        "msg_type": req.msg_type,
        "priority": req.priority,
        "toon": msg,
    })

    return {"toon": msg, "parsed": TOON.parse_agent_message(msg)}


@app.get("/api/toon/protocol")
async def toon_protocol():
    """Return the TOON protocol specification."""
    return {
        "version": TOON.__version__,
        "format": {
            "separator": "|",
            "key_value": ":",
            "array_open": "[",
            "array_close": "]",
            "array_sep": ",",
            "object_open": "{",
            "object_close": "}",
            "true": "T",
            "false": "F",
            "null": "_",
        },
        "message_types": [
            "task_assign", "task_result", "delegate", "escalate",
            "feedback", "status", "query", "response", "alert",
        ],
        "priorities": ["critical", "high", "medium", "low"],
        "message_format": "from:{agent}|to:{agent}|type:{type}|pri:{priority}|tid:{task_id}|p:{payload}",
        "total_agents": 1299,
        "layers": {
            "L0": "Supreme Orchestrator (1)",
            "L1": "Control Demons (10)",
            "L2": "Board of Directors (5)",
            "L3": "C-Suite (9)",
            "L4": "Vice Presidents (14)",
            "L5": "Coordinators (10)",
            "L6": "Specialists (1250)",
        },
    }


# ══════════════════════════════════════════════════════════════════════
# EVOLUTION API — Agent Evolutionary Intelligence
# ══════════════════════════════════════════════════════════════════════

import evolution as EVO


class EvolveRequest(BaseModel):
    agent_name: str
    trigger: str = "manual"


class CrossoverRequest(BaseModel):
    parent_a: str
    parent_b: str
    child_name: str


class TaskResultRequest(BaseModel):
    agent_name: str
    task_type: str
    success: bool
    duration_ms: int = 0
    tokens_used: int = 0
    quality_rating: float = 0.5
    findings_count: int = 0


class AuditFinding(BaseModel):
    audit_id: str
    agent_name: str
    severity: str
    category: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    finding: str
    recommendation: Optional[str] = None


@app.post("/api/evolution/evolve")
async def evolve_agent_endpoint(req: EvolveRequest):
    """Evolve a single agent based on performance."""
    result = EVO.evolve_agent(req.agent_name, req.trigger)
    return result


@app.post("/api/evolution/evolve-population")
async def evolve_population_endpoint():
    """Run evolution on all agents with DNA."""
    result = EVO.evolve_population()
    return result


@app.post("/api/evolution/crossover")
async def crossover_endpoint(req: CrossoverRequest):
    """Create hybrid agent from two parents."""
    result = EVO.crossover_agents(req.parent_a, req.parent_b, req.child_name)
    return result


@app.post("/api/evolution/record-result")
async def record_result_endpoint(req: TaskResultRequest):
    """Record a task result and update agent fitness."""
    result = EVO.record_task_result(
        req.agent_name, req.task_type, req.success,
        req.duration_ms, req.tokens_used, req.quality_rating, req.findings_count
    )
    return result


@app.get("/api/evolution/leaderboard")
async def evolution_leaderboard(top_n: int = 20):
    """Get top agents by fitness score."""
    return EVO.get_leaderboard(top_n)


@app.get("/api/evolution/dna/{agent_name}")
async def get_agent_dna(agent_name: str):
    """Get an agent's evolutionary DNA."""
    conn = get_db()
    dna = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?", (agent_name,)).fetchone()
    caps = conn.execute("SELECT * FROM agent_capabilities WHERE agent_name = ?", (agent_name,)).fetchall()
    history = conn.execute(
        "SELECT * FROM evolution_history WHERE agent_name = ? ORDER BY evolved_at DESC LIMIT 20",
        (agent_name,)
    ).fetchall()
    lineage = conn.execute(
        "SELECT * FROM agent_lineage WHERE child_agent = ? OR parent_agent = ?",
        (agent_name, agent_name)
    ).fetchall()
    conn.close()
    return {
        "dna": dict(dna) if dna else None,
        "capabilities": [dict(c) for c in caps],
        "evolution_history": [dict(h) for h in history],
        "lineage": [dict(l) for l in lineage]
    }


@app.get("/api/evolution/strategies")
async def get_strategies():
    """Get all evolution strategies."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM evolution_strategies ORDER BY applications_count DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/audit/finding")
async def record_audit_finding(finding: AuditFinding):
    """Record a single audit finding."""
    conn = get_db()
    conn.execute("""
        INSERT INTO audit_findings (audit_id, agent_name, severity, category, file_path, line_number, finding, recommendation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (finding.audit_id, finding.agent_name, finding.severity, finding.category,
          finding.file_path, finding.line_number, finding.finding, finding.recommendation))
    conn.commit()
    conn.close()
    return {"status": "recorded"}


@app.get("/api/audit/findings/{audit_id}")
async def get_audit_findings(audit_id: str, severity: Optional[str] = None):
    """Get all findings for an audit."""
    conn = get_db()
    if severity:
        rows = conn.execute(
            "SELECT * FROM audit_findings WHERE audit_id = ? AND severity = ? ORDER BY id",
            (audit_id, severity)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM audit_findings WHERE audit_id = ? ORDER BY severity, id",
            (audit_id,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/audit/summary/{audit_id}")
async def get_audit_summary(audit_id: str):
    """Get audit summary with counts by severity."""
    conn = get_db()
    counts = conn.execute("""
        SELECT severity, COUNT(*) as count,
               SUM(CASE WHEN fix_status = 'fixed' THEN 1 ELSE 0 END) as fixed
        FROM audit_findings WHERE audit_id = ?
        GROUP BY severity
    """, (audit_id,)).fetchall()
    conn.close()
    return {
        "audit_id": audit_id,
        "by_severity": {r["severity"]: {"total": r["count"], "fixed": r["fixed"]} for r in counts},
        "total": sum(r["count"] for r in counts),
        "total_fixed": sum(r["fixed"] for r in counts)
    }


# ══════════════════════════════════════════════════════════════════════
# ── Maturana Autopoiesis API ─────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════

import maturana_evolution as maturana

@app.post("/api/maturana/initialize")
async def maturana_initialize():
    """Initialize all agents with Maturana autopoiesis fields."""
    count = maturana.initialize_all_agents()
    return {"initialized": count}

@app.post("/api/maturana/cycle/{cycle_number}")
async def maturana_run_cycle(cycle_number: int, batch_size: int = 50):
    """Run one Maturana autopoiesis cycle for all agents."""
    result = maturana.evolve_population_maturana(cycle_number, batch_size)
    return result

@app.post("/api/maturana/agent/{agent_name}/evolve")
async def maturana_evolve_agent(agent_name: str, cycle: int = 1):
    """Run autopoiesis cycle for a single agent."""
    result = maturana.autopoiesis_cycle(agent_name, cycle)
    return result

@app.get("/api/maturana/wisdom-leaderboard")
async def maturana_wisdom_leaderboard(top_n: int = 30):
    """Get top agents by wisdom score."""
    return maturana.get_wisdom_leaderboard(top_n)

@app.get("/api/maturana/maturity-distribution")
async def maturana_maturity_distribution():
    """Get agent count per maturity level."""
    return maturana.get_maturity_distribution()

@app.get("/api/maturana/self-reports")
async def maturana_self_reports(limit: int = 50):
    """Get recent self-reports."""
    return maturana.get_recent_self_reports(limit)

@app.get("/api/maturana/agent/{agent_name}/timeline")
async def maturana_agent_timeline(agent_name: str):
    """Get maturity timeline for an agent."""
    return maturana.get_maturity_timeline(agent_name)

@app.get("/api/maturana/agent/{agent_name}/profile")
async def maturana_agent_profile(agent_name: str):
    """Get full Maturana profile for an agent."""
    conn = get_db()
    dna = conn.execute("SELECT * FROM agent_dna WHERE agent_name = ?", (agent_name,)).fetchone()
    reports = conn.execute("""
        SELECT report_type, content_toon, growth_delta, insights, cycle_number, created_at
        FROM agent_self_reports WHERE agent_name = ?
        ORDER BY created_at DESC LIMIT 10
    """, (agent_name,)).fetchall()
    interactions = conn.execute("""
        SELECT to_agent, interaction_type, coupling_strength, created_at
        FROM agent_interactions WHERE from_agent = ?
        ORDER BY created_at DESC LIMIT 20
    """, (agent_name,)).fetchall()
    maturity_log = conn.execute("""
        SELECT from_level, to_level, trigger_event, experience_years_at, wisdom_at, created_at
        FROM agent_maturity_log WHERE agent_name = ?
        ORDER BY created_at ASC
    """, (agent_name,)).fetchall()
    conn.close()

    if not dna:
        return {"error": "Agent not found"}

    return {
        "dna": dict(dna),
        "recent_reports": [dict(r) for r in reports],
        "recent_interactions": [dict(r) for r in interactions],
        "maturity_log": [dict(r) for r in maturity_log],
    }

@app.get("/api/maturana/stats")
async def maturana_stats():
    """Get aggregate Maturana evolution statistics."""
    conn = get_db()
    stats = conn.execute("""
        SELECT
            COUNT(*) as total_agents,
            AVG(COALESCE(experience_years, 0)) as avg_experience,
            AVG(COALESCE(wisdom_score, 0)) as avg_wisdom,
            AVG(COALESCE(knowledge_depth, 0)) as avg_knowledge,
            AVG(COALESCE(self_awareness_score, 0)) as avg_self_awareness,
            AVG(COALESCE(structural_coupling_score, 0)) as avg_coupling,
            AVG(COALESCE(autonomy_level, 0)) as avg_autonomy,
            AVG(COALESCE(emotional_intelligence, 0)) as avg_ei,
            MAX(COALESCE(experience_years, 0)) as max_experience,
            MAX(COALESCE(wisdom_score, 0)) as max_wisdom,
            SUM(COALESCE(total_interactions, 0)) as total_interactions,
            SUM(COALESCE(mentorship_given, 0)) as total_mentorships,
            SUM(COALESCE(self_report_count, 0)) as total_self_reports,
            SUM(COALESCE(toon_messages_sent, 0)) as total_toon_sent,
            MAX(COALESCE(autopoiesis_cycle, 0)) as max_cycle
        FROM agent_dna
    """).fetchone()
    dist = maturana.get_maturity_distribution()
    conn.close()

    return {
        **dict(stats),
        "maturity_distribution": dist,
    }


# ══════════════════════════════════════════════════════════════════════
# MATURANA API — Autopoietic Agent Genesis & Evolution
# ══════════════════════════════════════════════════════════════════════

import maturana as MAT


@app.post("/api/maturana/genesis")
async def maturana_genesis(target: int = 5000):
    """Run Maturana autopoietic genesis to reach target population."""
    result = MAT.genesis(target_total=target)
    return result


@app.get("/api/maturana/layers")
async def maturana_layers():
    """Get the 7 autopoietic layers and their Maturana principles."""
    return MAT.AUTOPOIETIC_LAYERS


@app.get("/api/maturana/domains")
async def maturana_domains():
    """Get all 40 autopoietic domains with their layer assignments."""
    return {k: {"layer": v[0], "description": v[1]} for k, v in MAT.DOMAINS.items()}


@app.get("/api/maturana/census")
async def maturana_census():
    """Population census by autopoietic layer."""
    conn = get_db()
    by_team = conn.execute("""
        SELECT ar.team, COUNT(*) as count, ROUND(AVG(ad.fitness_score), 4) as avg_fitness
        FROM agent_registry ar
        LEFT JOIN agent_dna ad ON ar.name = ad.agent_name
        GROUP BY ar.team ORDER BY count DESC
    """).fetchall()
    by_gen = conn.execute("""
        SELECT generation, COUNT(*) as count, ROUND(AVG(fitness_score), 4) as avg_fitness
        FROM agent_dna GROUP BY generation ORDER BY generation
    """).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM agent_registry").fetchone()[0]
    conn.close()
    return {
        "total_agents": total,
        "by_team": [dict(r) for r in by_team],
        "by_generation": [dict(r) for r in by_gen],
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue
            if msg.get("action") == "ping":
                await ws.send_json({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()})
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)


# ══════════════════════════════════════════════════════════════
# SKILL ENGINE API ENDPOINTS
# ══════════════════════════════════════════════════════════════

class ExecuteCommandRequest(BaseModel):
    agent_name: str
    command: str
    task_id: Optional[str] = None
    skill_name: Optional[str] = None
    working_directory: Optional[str] = None
    timeout_ms: Optional[int] = None

class StateTransitionRequest(BaseModel):
    agent_name: str
    task_id: str
    new_state: str
    reason: Optional[str] = None

@app.get("/api/skills/{agent_name}")
async def get_agent_skills(agent_name: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM agent_skills WHERE agent_name=? AND is_active=1", (agent_name,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/skills/summary/all")
async def get_all_skills_summary():
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM agent_skills").fetchone()[0]
    by_type = conn.execute(
        "SELECT skill_type, COUNT(*) as cnt FROM agent_skills GROUP BY skill_type ORDER BY cnt DESC"
    ).fetchall()
    agents_with_skills = conn.execute(
        "SELECT COUNT(DISTINCT agent_name) FROM agent_skills"
    ).fetchone()[0]
    conn.close()
    return {
        "total_skills": total,
        "agents_with_skills": agents_with_skills,
        "by_type": [dict(r) for r in by_type],
    }

@app.get("/api/policy/{agent_name}")
async def get_agent_policy(agent_name: str):
    policy = skill_engine.get_execution_policy(agent_name)
    return policy

@app.get("/api/state/{agent_name}")
async def get_agent_state(agent_name: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM agent_state_machine WHERE agent_name=? ORDER BY state_changed_at DESC LIMIT 10",
        (agent_name,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/state/transition")
async def transition_agent_state(req: StateTransitionRequest):
    try:
        skill_engine.transition_state(req.agent_name, req.task_id, req.new_state, req.reason)
        return {"status": "ok", "agent": req.agent_name, "new_state": req.new_state}
    except ValueError as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/execute")
async def execute_agent_command(req: ExecuteCommandRequest):
    result = skill_engine.execute_command(
        agent_name=req.agent_name,
        command=req.command,
        task_id=req.task_id,
        skill_name=req.skill_name,
        working_directory=req.working_directory,
        timeout_ms=req.timeout_ms,
    )
    return result

@app.get("/api/executions/{agent_name}")
async def get_agent_executions(agent_name: str, limit: int = 20):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM agent_execution_log WHERE agent_name=? ORDER BY started_at DESC LIMIT ?",
        (agent_name, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/teams")
async def get_all_teams():
    conn = get_db()
    rows = conn.execute("""
        SELECT team_name, COUNT(*) as agent_count,
               SUM(CASE WHEN is_entry_point=1 THEN 1 ELSE 0 END) as entry_points,
               SUM(CASE WHEN is_exit_point=1 THEN 1 ELSE 0 END) as exit_points
        FROM agent_team_config GROUP BY team_name
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/teams/{team_name}")
async def get_team_detail(team_name: str):
    conn = get_db()
    members = conn.execute(
        "SELECT * FROM agent_team_config WHERE team_name=? ORDER BY delegation_order",
        (team_name,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in members]

@app.get("/api/delegation-chains/{task_id}")
async def get_delegation_chain(task_id: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM task_delegation_chain WHERE task_id=? ORDER BY step_order",
        (task_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/skill-templates")
async def get_skill_templates():
    conn = get_db()
    rows = conn.execute("SELECT * FROM skill_templates").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/skill-engine/stats")
async def get_skill_engine_stats():
    conn = get_db()
    stats = {}
    for table in ["agent_skills", "agent_execution_policy", "agent_state_machine",
                   "agent_team_config", "skill_templates", "task_delegation_chain",
                   "agent_execution_log"]:
        try:
            stats[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except:
            stats[table] = 0

    # State distribution
    states = conn.execute(
        "SELECT current_state, COUNT(*) FROM agent_state_machine GROUP BY current_state"
    ).fetchall()
    stats["state_distribution"] = {r[0]: r[1] for r in states}

    # Recent executions
    stats["recent_executions"] = conn.execute(
        "SELECT COUNT(*) FROM agent_execution_log WHERE started_at > datetime('now', '-1 hour')"
    ).fetchone()[0]

    conn.close()
    return stats


# ══════════════════════════════════════════════════════════════════════
# EVOLUTION VISUALIZATION API — 10 endpoints for D3.js viz views
# ══════════════════════════════════════════════════════════════════════


@app.get("/api/viz/evolution-tree")
async def viz_evolution_tree():
    """Generation tree: agents grouped by generation with parent-child lineage."""
    conn = get_db()
    agents = conn.execute("""
        SELECT ad.agent_name, ad.generation, ad.fitness_score,
               ad.maturity_level, ar.team, ar.status
        FROM agent_dna ad
        LEFT JOIN agent_registry ar ON ad.agent_name = ar.name
        ORDER BY ad.generation, ad.agent_name
    """).fetchall()
    lineage = conn.execute("""
        SELECT parent_agent, child_agent, crossover_type
        FROM agent_lineage
        ORDER BY created_at DESC
        LIMIT 5000
    """).fetchall()
    conn.close()

    generations = {}
    for a in agents:
        row = dict(a)
        gen = row.get("generation") or 1
        generations.setdefault(gen, []).append(row)

    return {
        "generations": {str(k): v for k, v in sorted(generations.items())},
        "lineage": [dict(l) for l in lineage],
        "total_agents": len(agents),
    }


@app.get("/api/viz/fitness-landscape")
async def viz_fitness_landscape():
    """All agents with fitness, specialization, adaptability as x/y/z coordinates."""
    conn = get_db()
    rows = conn.execute("""
        SELECT ad.agent_name,
               COALESCE(ad.fitness_score, 0.5) as fitness_score,
               COALESCE(ad.specialization_depth, 0.5) as specialization_depth,
               COALESCE(ad.adaptability_score, 0.5) as adaptability_score,
               ad.generation, ad.maturity_level, ar.team
        FROM agent_dna ad
        LEFT JOIN agent_registry ar ON ad.agent_name = ar.name
        ORDER BY ad.fitness_score DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/viz/maturity-timeline")
async def viz_maturity_timeline():
    """Maturity transitions over time grouped by hour."""
    conn = get_db()
    rows = conn.execute("""
        SELECT strftime('%Y-%m-%d %H:00:00', created_at) as hour,
               from_level, to_level,
               COUNT(*) as transitions,
               ROUND(AVG(experience_years_at), 2) as avg_experience,
               ROUND(AVG(wisdom_at), 2) as avg_wisdom
        FROM agent_maturity_log
        GROUP BY hour, from_level, to_level
        ORDER BY hour DESC
        LIMIT 500
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/viz/wisdom-map")
async def viz_wisdom_map():
    """Agents with wisdom, experience, maturity for bubble chart."""
    conn = get_db()
    rows = conn.execute("""
        SELECT ad.agent_name,
               COALESCE(ad.wisdom_score, 0) as wisdom_score,
               COALESCE(ad.experience_years, 0) as experience_years,
               COALESCE(ad.maturity_level, 'embryo') as maturity_level,
               COALESCE(ad.knowledge_depth, 0.1) as knowledge_depth,
               COALESCE(ad.autonomy_level, 0.1) as autonomy_level,
               COALESCE(ad.total_interactions, 0) as total_interactions,
               ar.team
        FROM agent_dna ad
        LEFT JOIN agent_registry ar ON ad.agent_name = ar.name
        WHERE ad.wisdom_score > 0 OR ad.experience_years > 0
        ORDER BY ad.wisdom_score DESC
        LIMIT 1000
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/viz/interaction-network")
async def viz_interaction_network():
    """Top 200 strongest recent interactions for force-directed network graph."""
    conn = get_db()
    # Use recent interactions only (last 10K) to avoid scanning 4.7M rows
    edges = conn.execute("""
        SELECT from_agent, to_agent, interaction_type,
               COALESCE(coupling_strength, 0.5) as coupling_strength,
               1 as interaction_count
        FROM agent_interactions
        ORDER BY id DESC
        LIMIT 200
    """).fetchall()
    # Collect unique nodes referenced in the edges
    node_names = set()
    edge_list = []
    for e in edges:
        row = dict(e)
        node_names.add(row["from_agent"])
        node_names.add(row["to_agent"])
        edge_list.append(row)

    nodes = []
    if node_names:
        placeholders = ",".join("?" for _ in node_names)
        node_rows = conn.execute(f"""
            SELECT ar.name, ar.team, ar.status,
                   COALESCE(ad.fitness_score, 0.5) as fitness_score,
                   COALESCE(ad.maturity_level, 'embryo') as maturity_level
            FROM agent_registry ar
            LEFT JOIN agent_dna ad ON ar.name = ad.agent_name
            WHERE ar.name IN ({placeholders})
        """, list(node_names)).fetchall()
        nodes = [dict(n) for n in node_rows]

    conn.close()
    return {"nodes": nodes, "edges": edge_list}


@app.get("/api/viz/team-evolution")
async def viz_team_evolution():
    """Team-level aggregated stats: avg fitness, avg wisdom, counts per team."""
    conn = get_db()
    rows = conn.execute("""
        SELECT ar.team,
               COUNT(*) as agent_count,
               SUM(CASE WHEN ar.status = 'active' THEN 1 ELSE 0 END) as active_count,
               ROUND(AVG(COALESCE(ad.fitness_score, 0.5)), 4) as avg_fitness,
               ROUND(AVG(COALESCE(ad.wisdom_score, 0)), 4) as avg_wisdom,
               ROUND(AVG(COALESCE(ad.experience_years, 0)), 2) as avg_experience,
               ROUND(AVG(COALESCE(ad.adaptability_score, 0.5)), 4) as avg_adaptability,
               ROUND(AVG(COALESCE(ad.collaboration_score, 0.5)), 4) as avg_collaboration,
               ROUND(AVG(COALESCE(ad.reliability_score, 0.5)), 4) as avg_reliability,
               SUM(COALESCE(ad.total_interactions, 0)) as total_interactions,
               SUM(COALESCE(ad.mentorship_given, 0)) as total_mentorships
        FROM agent_registry ar
        LEFT JOIN agent_dna ad ON ar.name = ad.agent_name
        WHERE ar.team IS NOT NULL
        GROUP BY ar.team
        ORDER BY avg_fitness DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/viz/generation-stats")
async def viz_generation_stats():
    """Stats per generation: count, avg fitness, avg wisdom, avg experience."""
    conn = get_db()
    rows = conn.execute("""
        SELECT generation,
               COUNT(*) as agent_count,
               ROUND(AVG(COALESCE(fitness_score, 0.5)), 4) as avg_fitness,
               ROUND(AVG(COALESCE(wisdom_score, 0)), 4) as avg_wisdom,
               ROUND(AVG(COALESCE(experience_years, 0)), 2) as avg_experience,
               ROUND(AVG(COALESCE(adaptability_score, 0.5)), 4) as avg_adaptability,
               ROUND(AVG(COALESCE(speed_score, 0.5)), 4) as avg_speed,
               ROUND(AVG(COALESCE(accuracy_score, 0.5)), 4) as avg_accuracy,
               ROUND(AVG(COALESCE(collaboration_score, 0.5)), 4) as avg_collaboration,
               ROUND(AVG(COALESCE(creativity_score, 0.5)), 4) as avg_creativity,
               ROUND(AVG(COALESCE(reliability_score, 0.5)), 4) as avg_reliability,
               MAX(COALESCE(fitness_score, 0)) as max_fitness,
               MIN(COALESCE(fitness_score, 1)) as min_fitness
        FROM agent_dna
        GROUP BY generation
        ORDER BY generation
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/viz/dna-radar")
async def viz_dna_radar():
    """Top 20 agents by fitness with all DNA trait scores for radar chart."""
    conn = get_db()
    rows = conn.execute("""
        SELECT ad.agent_name,
               COALESCE(ad.fitness_score, 0.5) as fitness_score,
               COALESCE(ad.specialization_depth, 0.5) as specialization_depth,
               COALESCE(ad.adaptability_score, 0.5) as adaptability_score,
               COALESCE(ad.speed_score, 0.5) as speed_score,
               COALESCE(ad.accuracy_score, 0.5) as accuracy_score,
               COALESCE(ad.collaboration_score, 0.5) as collaboration_score,
               COALESCE(ad.creativity_score, 0.5) as creativity_score,
               COALESCE(ad.reliability_score, 0.5) as reliability_score,
               COALESCE(ad.knowledge_depth, 0.1) as knowledge_depth,
               COALESCE(ad.self_awareness_score, 0.1) as self_awareness_score,
               COALESCE(ad.autonomy_level, 0.1) as autonomy_level,
               COALESCE(ad.emotional_intelligence, 0.1) as emotional_intelligence,
               COALESCE(ad.wisdom_score, 0) as wisdom_score,
               ad.generation, ad.maturity_level, ar.team
        FROM agent_dna ad
        LEFT JOIN agent_registry ar ON ad.agent_name = ar.name
        ORDER BY ad.fitness_score DESC
        LIMIT 20
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/viz/system-timeline")
async def viz_system_timeline():
    """System snapshots for timeline chart (last 100 snapshots)."""
    conn = get_db()
    rows = conn.execute("""
        SELECT total_agents, active_agents, total_events, total_tokens,
               COALESCE(avg_score, 0) as avg_score,
               health_status, snapshot_at
        FROM system_snapshots
        ORDER BY snapshot_at DESC
        LIMIT 100
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/viz/mentorship-graph")
async def viz_mentorship_graph():
    """Top mentorship relationships (mentorship_given > 100) as directed edges."""
    conn = get_db()
    # Agents who are significant mentors
    mentors = conn.execute("""
        SELECT ad.agent_name,
               COALESCE(ad.mentorship_given, 0) as mentorship_given,
               COALESCE(ad.mentorship_received, 0) as mentorship_received,
               COALESCE(ad.wisdom_score, 0) as wisdom_score,
               COALESCE(ad.experience_years, 0) as experience_years,
               ad.maturity_level, ar.team
        FROM agent_dna ad
        LEFT JOIN agent_registry ar ON ad.agent_name = ar.name
        WHERE COALESCE(ad.mentorship_given, 0) > 100
        ORDER BY ad.mentorship_given DESC
        LIMIT 200
    """).fetchall()
    # Build directed edges from recent mentorship interactions (avoid scanning millions)
    edges = conn.execute("""
        SELECT from_agent, to_agent,
               COALESCE(coupling_strength, 0.5) as coupling_strength,
               1 as interaction_count
        FROM agent_interactions
        WHERE interaction_type IN ('mentorship', 'teaching', 'guidance', 'feedback')
        ORDER BY id DESC
        LIMIT 200
    """).fetchall()
    conn.close()
    return {
        "mentors": [dict(m) for m in mentors],
        "edges": [dict(e) for e in edges],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)

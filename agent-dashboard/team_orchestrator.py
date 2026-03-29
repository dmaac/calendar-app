#!/usr/bin/env python3
"""
Team Orchestrator — Real agent teams that execute claude CLI,
pass results between each other, and update the dashboard in real-time.
"""
import subprocess
import json
import time
import httpx
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

DB_PATH = Path(__file__).parent / "agents.db"
BASE = "http://127.0.0.1:8001"
CLAUDE = "/opt/homebrew/bin/claude"
WORK_DIR = str(Path.home() / "apps" / "fitsi")

# ── Shared Memory: results pass between teams ──────────────────
TEAM_RESULTS = {}


def dashboard_event(agent: str, event_type: str):
    """Update agent state on dashboard via API."""
    try:
        httpx.post(f"{BASE}/api/simulate/{agent}", params={"event_type": event_type}, timeout=3)
    except Exception:
        pass


def dashboard_memory(agent: str, content: str, insight_type: str = "pattern"):
    """Publish result to shared memory on dashboard."""
    try:
        httpx.post(f"{BASE}/api/memory/publish", json={
            "agent_name": agent,
            "insight_type": insight_type,
            "content": content[:500],
            "relevance": 0.9,
        }, timeout=3)
    except Exception:
        pass


def run_claude(prompt: str) -> str:
    """Execute real claude CLI and extract text result from JSON output."""
    try:
        result = subprocess.run(
            [CLAUDE, "-p", prompt, "--output-format", "json", "--max-turns", "3"],
            capture_output=True, text=True, cwd=WORK_DIR, timeout=180,
        )
        if result.returncode != 0:
            return f"ERROR: exit {result.returncode}: {result.stderr[:200]}"

        # Parse JSON array output — extract text blocks from assistant messages
        texts = []
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            # The output is a JSON array, try parsing each line or the whole thing
            try:
                obj = json.loads(line)
                if isinstance(obj, list):
                    for item in obj:
                        _extract_text(item, texts)
                else:
                    _extract_text(obj, texts)
            except json.JSONDecodeError:
                pass

        # Also try parsing entire output as one JSON array
        if not texts:
            try:
                arr = json.loads(result.stdout)
                if isinstance(arr, list):
                    for item in arr:
                        _extract_text(item, texts)
            except json.JSONDecodeError:
                pass

        return "\n".join(texts) if texts else "(no text output)"
    except subprocess.TimeoutExpired:
        return "ERROR: timeout after 180s"
    except Exception as e:
        return f"ERROR: {e}"


def _extract_text(obj: dict, texts: list):
    """Extract text content from a claude JSON output object."""
    if not isinstance(obj, dict):
        return
    # Assistant message with text content
    if obj.get("type") == "assistant":
        msg = obj.get("message", {})
        for block in msg.get("content", []):
            if block.get("type") == "text" and len(block.get("text", "")) > 10:
                texts.append(block["text"])
    # Result message
    if obj.get("type") == "result" and obj.get("result"):
        if len(obj["result"]) > 10:
            texts.append(obj["result"])


def activate_team(team: dict):
    """Mark all team agents as active on dashboard."""
    for agent in team["agents"]:
        dashboard_event(agent, "spawned")
        time.sleep(0.1)
    time.sleep(0.3)
    dashboard_event(team["agents"][0], "active")  # lead
    for agent in team["agents"][1:]:
        dashboard_event(agent, "thinking")


def complete_team(team: dict):
    """Mark all team agents as completed on dashboard."""
    for agent in team["agents"]:
        dashboard_event(agent, "completed")
        time.sleep(0.1)


def execute_team(team: dict) -> str:
    """Execute a single team: activate agents, run CLI, store result."""
    name = team["name"]
    lead = team["agents"][0]

    print(f"\n{'='*60}")
    print(f"  TEAM: {name}")
    print(f"  Lead: {lead}")
    print(f"  Agents: {', '.join(team['agents'])}")
    print(f"  Mission: {team['mission'][:80]}")
    if team.get("input_from"):
        print(f"  Input from: {', '.join(team['input_from'])}")
    print(f"{'='*60}")

    # Activate agents on dashboard
    activate_team(team)

    # Build prompt with context from previous teams
    prompt = team["prompt"]
    if team.get("input_from"):
        context_parts = []
        for src in team["input_from"]:
            if src in TEAM_RESULTS:
                context_parts.append(f"--- Resultado de {src} ---\n{TEAM_RESULTS[src][:1500]}")
        if context_parts:
            prompt = "CONTEXTO DE EQUIPOS ANTERIORES:\n\n" + "\n\n".join(context_parts) + "\n\n---\n\nTU MISION:\n" + prompt

    # Mark lead as delegating
    dashboard_event(lead, "delegating")
    for a in team["agents"][1:]:
        dashboard_event(a, "active")

    # Execute real claude CLI
    print(f"  Ejecutando claude CLI...")
    t0 = time.time()
    result = run_claude(prompt)
    elapsed = time.time() - t0
    print(f"  Completado en {elapsed:.1f}s ({len(result)} chars)")

    # Store result for downstream teams
    TEAM_RESULTS[name] = result

    # Publish to shared memory
    dashboard_memory(lead, f"[{name}] {result[:400]}")

    # Complete agents
    complete_team(team)

    # Print summary
    print(f"\n  RESULTADO ({name}):")
    print(f"  {'-'*50}")
    for line in result.split('\n')[:15]:
        print(f"  {line}")
    if result.count('\n') > 15:
        print(f"  ... ({result.count(chr(10)) - 15} lineas mas)")

    return result


# ══════════════════════════════════════════════════════════════
# TEAM DEFINITIONS — DAG of interconnected teams
# ══════════════════════════════════════════════════════════════

TEAMS = [
    # ── WAVE 1: Parallel recon teams ──────────────────
    {
        "name": "Alpha: Security Recon",
        "wave": 1,
        "agents": ["penetration-tester", "api-security-engineer", "security-engineer"],
        "mission": "Auditoria de seguridad del backend",
        "input_from": None,
        "prompt": (
            "Eres un equipo de seguridad. Analiza la seguridad del backend en ~/apps/fitsi/backend/app/. "
            "1) Busca endpoints sin autenticacion (grep por rutas sin get_current_user). "
            "2) Busca hardcoded secrets o API keys en el codigo (grep por api_key, secret, password en archivos .py). "
            "3) Verifica que hay rate limiting (grep por slowapi o RateLimiter). "
            "Responde con hallazgos concretos, maximo 20 lineas."
        ),
    },
    {
        "name": "Beta: Architecture Recon",
        "wave": 1,
        "agents": ["software-architect", "backend-architect", "clean-architecture-specialist"],
        "mission": "Analisis de arquitectura y deuda tecnica",
        "input_from": None,
        "prompt": (
            "Eres un equipo de arquitectura. Analiza ~/apps/fitsi/backend/app/services/. "
            "1) Cuenta lineas de codigo por archivo (wc -l *.py). "
            "2) Identifica los 3 servicios mas grandes. "
            "3) Busca imports circulares entre servicios. "
            "4) Evalua si la separacion de concerns es correcta. "
            "Responde con datos concretos, maximo 20 lineas."
        ),
    },
    {
        "name": "Gamma: Frontend Recon",
        "wave": 1,
        "agents": ["react-native-engineer", "mobile-architect", "ui-engineer"],
        "mission": "Analisis del frontend mobile",
        "input_from": None,
        "prompt": (
            "Eres un equipo de frontend. Analiza ~/apps/fitsi/mobile/src/. "
            "1) Cuenta cuantas pantallas hay en screens/ (ls screens/**/*.tsx | wc -l). "
            "2) Cuenta cuantos componentes hay en components/. "
            "3) Busca componentes que se repiten o tienen logica duplicada. "
            "4) Verifica si hay hooks custom que no se usan (grep imports en src/). "
            "Responde con datos concretos, maximo 20 lineas."
        ),
    },

    # ── WAVE 2: Cross-analysis teams (receive Wave 1 results) ──
    {
        "name": "Delta: Security x Architecture",
        "wave": 2,
        "agents": ["fuzzy-categorizer", "deductive-reasoner", "probabilistic-inferrer"],
        "mission": "Cruzar seguridad con arquitectura",
        "input_from": ["Alpha: Security Recon", "Beta: Architecture Recon"],
        "prompt": (
            "Recibes resultados de dos equipos: uno de seguridad y otro de arquitectura. "
            "Tu mision: "
            "1) Los servicios mas grandes tienen problemas de seguridad? "
            "2) Los endpoints sin auth estan en modulos criticos? "
            "3) La deuda tecnica crea vulnerabilidades? "
            "Cruza los datos y genera 5 hallazgos priorizados. Maximo 20 lineas."
        ),
    },
    {
        "name": "Epsilon: Frontend x Backend Alignment",
        "wave": 2,
        "agents": ["coherence-x-creativity-hybrid", "ontology-constructor", "efficiency-catalyst"],
        "mission": "Verificar alineacion frontend-backend",
        "input_from": ["Beta: Architecture Recon", "Gamma: Frontend Recon"],
        "prompt": (
            "Recibes analisis del backend (arquitectura) y del frontend (pantallas/componentes). "
            "Tu mision: "
            "1) Hay pantallas sin endpoint correspondiente? "
            "2) Hay endpoints sin pantalla que los consuma? "
            "3) La cantidad de servicios vs pantallas esta balanceada? "
            "Cruza los datos y sugiere 3 mejoras. Maximo 20 lineas."
        ),
    },

    # ── WAVE 3: Final synthesis (receives Wave 2 results) ──────
    {
        "name": "Omega: Strategic Synthesis",
        "wave": 3,
        "agents": ["motif-finder", "prediction-market-agent", "self-supervised-learner"],
        "mission": "Sintesis estrategica final de todos los equipos",
        "input_from": ["Delta: Security x Architecture", "Epsilon: Frontend x Backend Alignment"],
        "prompt": (
            "Eres el equipo SAGE final. Recibes analisis cruzados de seguridad, arquitectura y frontend. "
            "Tu mision: "
            "1) Cual es el UNICO cambio mas impactante que deberia hacerse primero? "
            "2) Hay un patron comun en todos los hallazgos? "
            "3) Genera un plan de 5 pasos priorizados para las proximas 2 semanas. "
            "Se muy concreto y accionable. Maximo 25 lineas."
        ),
    },
]


def main():
    print("=" * 60)
    print("  FITSI TEAM ORCHESTRATOR — Real Agent Execution")
    print(f"  Teams: {len(TEAMS)} | Waves: 3")
    print(f"  Total agents: {sum(len(t['agents']) for t in TEAMS)}")
    print(f"  Started: {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 60)

    t0 = time.time()

    # Execute by waves
    for wave in [1, 2, 3]:
        wave_teams = [t for t in TEAMS if t["wave"] == wave]
        print(f"\n{'#'*60}")
        print(f"  WAVE {wave} — {len(wave_teams)} teams {'(parallel)' if wave == 1 else '(sequential)'}")
        print(f"{'#'*60}")

        if wave == 1:
            # Wave 1: Run in parallel (3 recon teams)
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = {pool.submit(execute_team, t): t["name"] for t in wave_teams}
                for future in as_completed(futures):
                    name = futures[future]
                    try:
                        future.result()
                    except Exception as e:
                        print(f"  ERROR in {name}: {e}")
                        TEAM_RESULTS[name] = f"ERROR: {e}"
        else:
            # Waves 2-3: Sequential (need previous results)
            for team in wave_teams:
                try:
                    execute_team(team)
                except Exception as e:
                    print(f"  ERROR in {team['name']}: {e}")
                    TEAM_RESULTS[team["name"]] = f"ERROR: {e}"

    elapsed = time.time() - t0

    # ── Final Report ──────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  ORCHESTRATION COMPLETE — {elapsed:.0f}s total")
    print(f"{'='*60}")
    print(f"\n  Results chain:")
    for team in TEAMS:
        name = team["name"]
        result = TEAM_RESULTS.get(name, "NO RESULT")
        status = "OK" if not result.startswith("ERROR") else "FAIL"
        chars = len(result)
        inputs = team.get("input_from") or ["(none)"]
        print(f"    [{status}] {name}")
        print(f"         Agents: {', '.join(team['agents'])}")
        print(f"         Input from: {', '.join(inputs)}")
        print(f"         Output: {chars} chars")
        print()

    # Print final Omega synthesis
    omega = TEAM_RESULTS.get("Omega: Strategic Synthesis", "")
    if omega and not omega.startswith("ERROR"):
        print(f"\n{'='*60}")
        print(f"  FINAL SYNTHESIS (Omega Team)")
        print(f"{'='*60}")
        print(omega)

    # Publish final synthesis to dashboard
    dashboard_memory("motif-finder", f"ORCHESTRATION COMPLETE: {len(TEAMS)} teams, {elapsed:.0f}s, "
                     f"{sum(len(r) for r in TEAM_RESULTS.values())} total chars", "optimization")


if __name__ == "__main__":
    main()

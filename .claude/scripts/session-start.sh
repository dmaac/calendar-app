#!/bin/bash
# ============================================================
# SESSION START HOOK — Cal AI Token & Memory System
# Ejecutado al inicio de cada sesión de Claude Code
# ============================================================

SHARED_DIR="/Users/marco/calendar-app/.claude/agents/shared"
BUDGET_FILE="$SHARED_DIR/token_budget.json"
STATE_FILE="$SHARED_DIR/session_state.json"
MEMORY_FILE="$SHARED_DIR/agent_memory.json"

# Crear directorio si no existe
mkdir -p "$SHARED_DIR"

SESSION_ID="session_$(date +%s)"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── 1. Inicializar token budget para nueva sesión ──────────
cat > "$BUDGET_FILE" << EOF
{
  "session_id": "$SESSION_ID",
  "started_at": "$TIMESTAMP",
  "model": "claude-sonnet-4-6",
  "context_window_estimate": 200000,
  "estimated_used": 15000,
  "estimated_remaining": 185000,
  "budget_mode": "FULL",
  "budget_pct_remaining": 92,
  "tool_call_count": 0,
  "last_updated": "$TIMESTAMP",
  "mode_thresholds": {
    "FULL": "100-60% — operación normal, respuestas completas",
    "REDUCED": "60-30% — omitir ejemplos, respuestas concisas",
    "MINIMAL": "30-10% — solo esencial, checkpoint pronto",
    "EMERGENCY": "<10% — escribir checkpoint ahora, no iniciar tareas nuevas"
  }
}
EOF

# ── 2. Actualizar contador de sesiones y session_id ────────
if command -v jq &>/dev/null && [ -f "$STATE_FILE" ]; then
  TOTAL=$(jq '.meta.total_sessions // 0' "$STATE_FILE")
  NEW_TOTAL=$((TOTAL + 1))
  jq --arg sid "$SESSION_ID" --arg ts "$TIMESTAMP" --argjson total "$NEW_TOTAL" \
    '.meta.last_session_id = $sid | .meta.total_sessions = $total | .meta.last_checkpoint = $ts' \
    "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
fi

# ── 3. Leer estado previo para contexto de handoff ─────────
PREV_CONTEXT=""
PENDING_TASKS=""
ACTIVE_AGENTS=""
LAST_FOCUS=""

if command -v jq &>/dev/null; then
  if [ -f "$STATE_FILE" ]; then
    LAST_FOCUS=$(jq -r '.shared_context.current_focus // ""' "$STATE_FILE")
    PENDING_TASKS=$(jq -r '.current_sprint.tasks_pending | if length > 0 then "Tareas pendientes: " + (map("• " + .) | join(", ")) else "" end' "$STATE_FILE" 2>/dev/null)
  fi
  if [ -f "$MEMORY_FILE" ]; then
    ACTIVE_AGENTS=$(jq -r '._agents | to_entries | map(select(.value.status == "in_progress")) | if length > 0 then "Agentes en progreso: " + (map(.key + " (" + .value.progress + ")") | join(", ")) else "" end' "$MEMORY_FILE" 2>/dev/null)
  fi
fi

# ── 4. Construir mensaje de contexto ──────────────────────
MSG="🚀 Cal AI Agent System — Nueva sesión iniciada ($SESSION_ID)"
[ -n "$LAST_FOCUS" ] && MSG="$MSG | Foco anterior: $LAST_FOCUS"
[ -n "$PENDING_TASKS" ] && MSG="$MSG | $PENDING_TASKS"
[ -n "$ACTIVE_AGENTS" ] && MSG="$MSG | $ACTIVE_AGENTS"
MSG="$MSG | Budget: 185K tokens disponibles (modo FULL) | Estado en .claude/agents/shared/"

# Output JSON para Claude Code (sanitize quotes/backslashes to prevent malformed JSON)
jq -n --arg msg "$MSG" '{"systemMessage": $msg}'

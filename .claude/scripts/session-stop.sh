#!/bin/bash
# ============================================================
# SESSION STOP HOOK — Cal AI Token & Memory System
# Ejecutado cuando Claude termina de responder (Stop event)
# Escribe checkpoint del estado actual para la próxima sesión
# ============================================================

SHARED_DIR="/Users/marco/calendar-app/.claude/agents/shared"
STATE_FILE="$SHARED_DIR/session_state.json"
BUDGET_FILE="$SHARED_DIR/token_budget.json"
MEMORY_FILE="$SHARED_DIR/agent_memory.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── 1. Actualizar timestamp del último checkpoint ──────────
if command -v jq &>/dev/null && [ -f "$STATE_FILE" ]; then
  jq --arg ts "$TIMESTAMP" \
    '.meta.last_checkpoint = $ts' \
    "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && \
    mv "${STATE_FILE}.tmp" "$STATE_FILE"
fi

# ── 2. Leer stats finales de la sesión ────────────────────
TOKENS_USED=""
TOKENS_PCT=""
MODE=""
if command -v jq &>/dev/null && [ -f "$BUDGET_FILE" ]; then
  TOKENS_USED=$(jq '.estimated_used // 0' "$BUDGET_FILE")
  TOKENS_PCT=$(jq '.budget_pct_remaining // 100' "$BUDGET_FILE")
  MODE=$(jq -r '.budget_mode // "FULL"' "$BUDGET_FILE")
fi

# ── 3. Construir mensaje de resumen ───────────────────────
MSG="✅ Checkpoint guardado ($TIMESTAMP)"
[ -n "$TOKENS_USED" ] && MSG="$MSG | Tokens usados esta sesión: ~${TOKENS_USED} (${TOKENS_PCT}% restante, modo: $MODE)"
MSG="$MSG | Estado en .claude/agents/shared/"

jq -n --arg msg "$MSG" '{"systemMessage": $msg}'

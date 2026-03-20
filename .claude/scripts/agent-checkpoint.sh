#!/bin/bash
# ============================================================
# AGENT CHECKPOINT — Script auxiliar
# Los agentes llaman esto para guardar su estado de trabajo.
# Uso: ./agent-checkpoint.sh <agent_name> <status> <progress> <task> <next_step>
# ============================================================

MEMORY_FILE="/Users/marco/calendar-app/.claude/agents/shared/agent_memory.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

AGENT_NAME="${1:-unknown}"
STATUS="${2:-in_progress}"    # in_progress | completed | blocked | paused
PROGRESS="${3:-0%}"
LAST_TASK="${4:-}"
NEXT_STEP="${5:-}"

if command -v jq &>/dev/null && [ -f "$MEMORY_FILE" ]; then
  jq \
    --arg agent "$AGENT_NAME" \
    --arg status "$STATUS" \
    --arg progress "$PROGRESS" \
    --arg task "$LAST_TASK" \
    --arg next "$NEXT_STEP" \
    --arg ts "$TIMESTAMP" \
    '._agents[$agent] = {
       "status": $status,
       "progress": $progress,
       "last_task": $task,
       "next_step": $next,
       "last_updated": $ts
     } | ._last_updated = $ts' \
    "$MEMORY_FILE" > "${MEMORY_FILE}.tmp" 2>/dev/null && \
    mv "${MEMORY_FILE}.tmp" "$MEMORY_FILE"
  echo "✅ Checkpoint guardado para $AGENT_NAME ($STATUS - $PROGRESS)"
else
  echo "❌ Error: jq no disponible o archivo no encontrado"
  exit 1
fi

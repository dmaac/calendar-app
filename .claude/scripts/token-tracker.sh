#!/bin/bash
# ============================================================
# TOKEN TRACKER — PostToolUse Hook
# Estima tokens consumidos en cada tool call y actualiza budget
# Se ejecuta después de CADA herramienta usada por Claude
# ============================================================

BUDGET_FILE="/Users/marco/calendar-app/.claude/agents/shared/token_budget.json"

# Leer input del tool call (stdin)
INPUT=$(cat)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Estimar tokens: 1 token ≈ 3.5 chars, +150 overhead por tool call
CHAR_COUNT=$(printf '%s' "$INPUT" | wc -c | tr -d ' ')
ESTIMATED_TOKENS=$(( (CHAR_COUNT / 4) + 150 ))

# Actualizar budget file con jq (si está disponible)
if command -v jq &>/dev/null && [ -f "$BUDGET_FILE" ]; then
  CURRENT_USED=$(jq '.estimated_used // 15000' "$BUDGET_FILE")
  CONTEXT_WINDOW=$(jq '.context_window_estimate // 200000' "$BUDGET_FILE")

  NEW_USED=$((CURRENT_USED + ESTIMATED_TOKENS))
  NEW_REMAINING=$((CONTEXT_WINDOW - NEW_USED))

  # Clamp al mínimo 0
  [ "$NEW_REMAINING" -lt 0 ] && NEW_REMAINING=0

  # Calcular porcentaje
  PCT=$((NEW_REMAINING * 100 / CONTEXT_WINDOW))

  # Determinar modo basado en % restante
  if   [ "$PCT" -gt 60 ]; then MODE="FULL"
  elif [ "$PCT" -gt 30 ]; then MODE="REDUCED"
  elif [ "$PCT" -gt 10 ]; then MODE="MINIMAL"
  else MODE="EMERGENCY"
  fi

  # Si entramos a EMERGENCY, agregar system message
  OUTPUT_JSON="{}"
  if [ "$MODE" = "EMERGENCY" ]; then
    OUTPUT_JSON='{"systemMessage": "⚠️ EMERGENCY: <10% tokens restantes. Escribir checkpoint en agent_memory.json AHORA antes de continuar."}'
  elif [ "$MODE" = "MINIMAL" ] && [ "$PCT" -lt 15 ]; then
    OUTPUT_JSON='{"systemMessage": "⚠️ MINIMAL: 15% tokens restantes. Priorizar tareas críticas y preparar checkpoint."}'
  fi

  # Actualizar JSON
  jq \
    --argjson used "$NEW_USED" \
    --argjson remaining "$NEW_REMAINING" \
    --argjson pct "$PCT" \
    --arg mode "$MODE" \
    --arg ts "$TIMESTAMP" \
    '.estimated_used = $used |
     .estimated_remaining = $remaining |
     .budget_pct_remaining = $pct |
     .budget_mode = $mode |
     .tool_call_count += 1 |
     .last_updated = $ts' \
    "$BUDGET_FILE" > "${BUDGET_FILE}.tmp" 2>/dev/null && \
    mv "${BUDGET_FILE}.tmp" "$BUDGET_FILE"

  printf '%s' "$OUTPUT_JSON"
fi

exit 0

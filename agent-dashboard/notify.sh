#!/bin/bash
# Notify the Agent Dashboard when Claude Code spawns/completes an agent
# Usage: notify.sh <agent_name> <event_type> [detail]
# Event types: spawned, active, thinking, delegating, reviewing, completed, error

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:8001}"
AGENT_NAME="${1:-unknown}"
EVENT_TYPE="${2:-active}"
DETAIL="${3:-}"

curl -s -X POST "${DASHBOARD_URL}/api/event" \
  -H "Content-Type: application/json" \
  -d "{\"agent_name\":\"${AGENT_NAME}\",\"event_type\":\"${EVENT_TYPE}\",\"detail\":\"${DETAIL}\"}" \
  > /dev/null 2>&1 &

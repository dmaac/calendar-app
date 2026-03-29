# Memoria Compartida — Fitsi AI Agent System

> Este archivo es leído por los 44 agentes del sistema.
> Actualizar al inicio/fin de cada sesión importante.

## Cómo usar esta memoria

### Al INICIAR trabajo (cualquier agente)
1. Leer `token_budget.json` → saber en qué modo operar
2. Leer `agent_memory.json` → ver si hay trabajo pendiente de sesiones anteriores
3. Leer `session_state.json` → contexto del sprint actual

### Al TERMINAR o ante interrupción
1. Escribir tu estado en `agent_memory.json`:
   ```bash
   bash .claude/scripts/agent-checkpoint.sh \
     "<tu-nombre>" "in_progress|completed|blocked" "XX%" \
     "<qué estabas haciendo>" "<próximo paso>"
   ```
2. Si el budget es EMERGENCY (<10%), hacer esto PRIMERO antes de cualquier otra cosa

## Estado actual del proyecto

Ver `session_state.json` para:
- Sprint goal actual
- Tareas pendientes
- Contexto compartido

## Reglas de token por modo

| Modo | Comportamiento requerido |
|------|------------------------|
| FULL | Respuestas completas |
| REDUCED | Sin ejemplos, directo al punto |
| MINIMAL | Una línea por punto, sin contexto |
| EMERGENCY | Solo checkpoint, nada más |

## Agents activos (ver agent_memory.json para estado actual)

El sistema tiene 44 agentes (43 especializados + 1 token-monitor).
Ver `WORKFLOW.md` para el organigrama completo.

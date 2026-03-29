# Estrategia de Agentes — Optimización de Tokens

> Regla #1: Un agente, una tarea, un resultado. No más.

---

## Principios de Eficiencia



### 2. Usar el modelo correcto por tarea
| Tarea | Modelo | Tokens aprox |
|-------|--------|-------------|
| Buscar/explorar código | `haiku` | ~5k |
| Editar 1-3 archivos | `sonnet` | ~15k |
| Diseño/arquitectura | `sonnet` | ~25k |
| Revisión profunda multi-archivo | `opus` | ~80k |
| Inspección completa del proyecto | `opus` | ~150k |

### 3. Scope acotado por invocación
```
MAL:  "Revisa todo el proyecto y arregla todo"     → 150k tokens
BIEN: "Fix el N+1 en GET /meals/ línea 172"        → 10k tokens
```

### 4. No releer lo que ya se leyó
- Si ya tienes el output de un agente, pásalo como contexto al siguiente
- No pidas al agente 2 que vuelva a leer los mismos 50 archivos que leyó el agente 1

---

## Sistema de Turnos (Token Budget)

### Presupuesto diario sugerido: ~500k tokens

| Turno | Tokens | Qué hacer |
|-------|--------|-----------|
| Mañana (T1) | ~150k | 1 agente opus para tarea compleja O 3 sonnet para tareas medias |
| Mediodía (T2) | ~150k | Siguientes tareas basadas en resultados de T1 |
| Tarde (T3) | ~150k | Review/QA de lo hecho + fix de lo que falló |
| Buffer | ~50k | Preguntas rápidas, exploraciones con haiku |

---

## Cadenas de Agentes (no todo a la vez)

### Patrón: Scout → Worker → Reviewer

```
Ronda 1: SCOUT (haiku/sonnet, ~10k tokens)
  → Explora, identifica el problema exacto, archivos involucrados
  → Output: lista de archivos + líneas + descripción del fix

Ronda 2: WORKER (sonnet, ~20k tokens)  
  → Recibe el output del scout como contexto
  → Ejecuta el fix en los archivos identificados
  → Output: archivos modificados

Ronda 3: REVIEWER (sonnet, ~15k tokens)
  → Lee SOLO los archivos modificados (no todo el proyecto)
  → Valida que el fix es correcto
  → Output: aprobado o fix adicional necesario
```

**Total: ~45k tokens en vez de ~150k con un solo agente opus**

---

## Cola de Trabajo por Prioridad

### Cómo pedir trabajo a Claude:

```
"Ejecuta la siguiente tarea con el agente [X].
Scope: [archivo:línea específica]  
Criterio de éxito: [qué debe pasar cuando termine]
NO leas archivos fuera del scope."
```

### Ejemplo real:
```
"Usa python-backend-engineer para fix el N+1 en 
backend/app/routers/meals.py líneas 172-195.
Reemplaza el loop de get_food_by_id por un JOIN.
Solo toca ese archivo y meal_service.py si es necesario.
Criterio: 1 query en vez de N+1."
```

---

## Tareas Clasificadas por Costo

### MICRO (5-15k tokens) — Usa sonnet o haiku
- Fix de 1-5 líneas en 1 archivo
- Agregar un import faltante
- Cambiar un valor de config
- Crear un archivo simple (mock, .env)

### SMALL (15-40k tokens) — Usa sonnet
- Refactorizar 1 función
- Crear 1 endpoint nuevo
- Crear 1 screen nueva basada en patrón existente
- Escribir tests para 1 módulo

### MEDIUM (40-80k tokens) — Usa sonnet u opus
- Implementar 1 feature completa (front + back)
- Fix un bug que cruza múltiples archivos
- Crear migration + model + router + service
- Setup de infraestructura (Docker, CI)

### LARGE (80-150k tokens) — Usa opus, máximo 1 por turno
- Auditoría completa del proyecto
- Diseño de arquitectura nueva
- Refactoring que toca 10+ archivos
- Implementación de sistema complejo (Celery, payments)

---

## Reglas de Auto-Control

### Para el agente principal (tú, Claude):
1. Antes de lanzar un agente, pregúntate: "¿puedo hacer esto yo directo en 5 líneas?"
   - Si SÍ → hazlo directo, no lances agente
2. Antes de lanzar opus, pregúntate: "¿sonnet puede hacer esto?"
   - Si SÍ → usa sonnet
3. Nunca lanzar el mismo tipo de búsqueda 2 veces
   - Si ya leíste un archivo, no lo vuelvas a leer
4. Máximo 3 agentes paralelos por mensaje
5. Si un agente falla, NO relanzar igual — cambiar el approach
6. Pasar contexto entre agentes via resumen, no re-exploración

### Para los sub-agentes:
1. Lee SOLO los archivos del scope asignado
2. Si necesitas contexto de otro archivo, pide lo mínimo (líneas específicas)
3. Termina con un resumen de <5 líneas de lo que hiciste
4. Si la tarea es más grande de lo esperado, PARA y reporta — no sigas gastando tokens
5. No hagas mejoras no solicitadas

---

## Orden de Ejecución Recomendado (Fase 1)

Cada tarea es 1 invocación. No combinar.

### Semana 1 — Miguel (dev/miguel)
```
Día 1:
  T1: [sonnet] python-backend-engineer → Fix N+1 en GET /meals/ (meals.py:172)
  T2: [sonnet] python-backend-engineer → Fix N+1 en GET /meals/history (meals.py:123)
  T3: [sonnet] data-migration-agent → Crear migration con 4 indexes faltantes

Día 2:
  T1: [sonnet] python-backend-engineer → Fix asyncio.gather shared session (ai_scan_service.py:369)
  T2: [sonnet] api-contract-guardian → Fix paginated response en searchFoods + getMeals
  T3: [sonnet] qa-engineer → Fix CI pipeline: run all 8 test files

Día 3:
  T1: [sonnet] python-backend-engineer → Wire Redis cache a dashboard endpoint
  T2: [sonnet] python-backend-engineer → Wire Redis cache a profile endpoint
  T3: [sonnet] qa-engineer → Write 5 auth endpoint tests
```

### Semana 1 — Marco (dev/marco)
```
Día 1:
  T1: [sonnet] devops-deployer → Optimize Dockerfile (multi-stage, workers)
  T2: [sonnet] devops-deployer → Fix CI pipeline stages (lint + test + build)
  T3: [sonnet] security-engineer → Audit auth flow + CORS hardening

Día 2:
  T1: [sonnet] ui-engineer → Fix PUT /food/logs → use JSON body instead of query params
  T2: [sonnet] nutrition-mobile-expert → Add error boundary component
  T3: [sonnet] qa-engineer → Write 5 frontend component tests

Día 3:
  T1: [sonnet] devops-deployer → Setup staging docker-compose
  T2: [sonnet] python-backend-engineer → Add GZip + cursor pagination to food logs
  T3: [haiku] senior-code-reviewer → Quick review of week's changes
```

---

## Comando Rápido para Invocar

```
"[modelo] agente → tarea (scope exacto)"
```

Ejemplos:
- `[sonnet] qa-engineer → write test for LoginScreen (mobile/src/screens/LoginScreen.tsx)`
- `[haiku] Explore → find all files that import ai_scan_service`
- `[opus] fullstack-inspector → full audit of dev/miguel branch before PR to develop`

---

## Cuándo usar OPUS (caro pero necesario)

Solo en estos casos:
1. Inspección completa pre-PR (fullstack-inspector)
2. Diseño de arquitectura nueva (scalability-architect)
3. Feature compleja que cruza 10+ archivos
4. Debugging de un bug que no se encuentra con sonnet

Para todo lo demás: **sonnet** (o haiku para búsquedas).

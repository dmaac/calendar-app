# CLAUDE.md — Contexto persistente del proyecto

> Este archivo es leído automáticamente por Claude Code al iniciar cada sesión.
> Mantenerlo actualizado es crítico para continuar el trabajo sin perder contexto.

---

## ¿Qué es este proyecto?

**Fitsi AI** — App de tracking de calorías con IA.
- El usuario saca una foto a su comida → la IA identifica los nutrientes → se registra automáticamente.
- Onboarding de 30 pasos que recopila datos del usuario para generar un plan personalizado.
- Modelo de negocio: freemium con paywall (suscripción mensual/anual + one-time offer).

**Usuario objetivo:** Personas que quieren perder/mantener/ganar peso sin el esfuerzo de contar calorías manualmente.

---

## Stack técnico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Mobile + Web | React Native + Expo | 54.x |
| Web rendering | react-native-web | 0.21 |
| Backend | FastAPI (Python) | latest |
| Base de datos | PostgreSQL | 15 |
| Cache + Queues | Redis | 7 |
| Storage imágenes | S3 / Cloudflare R2 | — |
| AI Vision | GPT-4o Vision + Claude Vision | — |
| Task queue | Celery | — |
| Navegación | React Navigation v7 | — |
| Icons | @expo/vector-icons | 15.x |
| Charts | react-native-svg | 15.x |
| Auth storage | AsyncStorage | 2.x |

---

## Estructura del proyecto

```
calendar-app/
├── CLAUDE.md                    ← ESTE ARCHIVO (leer siempre)
├── TASKS.md                     ← tracker de tareas (leer siempre)
├── backend/
│   ├── app/
│   │   ├── core/               config, seguridad, db
│   │   ├── models/             SQLModel models
│   │   ├── routers/            endpoints API
│   │   ├── services/           lógica de negocio + AI
│   │   └── main.py
│   ├── alembic/                migraciones DB
│   └── requirements.txt
└── mobile/
    └── src/
        ├── screens/
        │   ├── onboarding/     ← 30 módulos del onboarding
        │   └── main/           ← pantallas principales post-onboarding
        ├── components/         componentes reutilizables
        ├── hooks/              custom hooks
        ├── services/           llamadas API
        ├── context/            AuthContext, OnboardingContext
        ├── navigation/         AppNavigator
        ├── theme/              design system
        └── types/              TypeScript types
```

---

## Design System (Fitsi AI — Norte Digital palette)

```typescript
// Colores Light
bg:        '#FFFFFF'
surface:   '#F5F5F5'   // cards, opciones
black:     '#1A1A2E'   // texto principal
gray:      '#666666'   // subtítulos
grayLight: '#E0E0E0'   // bordes
accent:    '#4285F4'   // azul principal (highlights, CTAs)
primary:   '#4285F4'   // botones primarios
disabled:  '#BDBDBD'   // botón deshabilitado
white:     '#FFFFFF'
success:   '#34A853'   // Google green

// Colores Dark
bg:        '#0D0D1A'
surface:   '#1A1A2E'
accent:    '#5B9CF6'   // azul claro (dark mode)

// Tipografía
title:   28px bold 800
subtitle: 14px regular gray
option:  16px medium 500
button:  16px bold 700

// Componentes
- Botón primario: pill negro, height 56, borderRadius 999
- Option card: borderRadius 14, bg surface, height 56+
- Progress bar: height 3px, top de pantalla
- Back button: circle 36px, bg surface
```

---

## Diseño del modelo de datos (PostgreSQL)

### Tablas principales

**users** — autenticación
- id (UUID PK), email, password_hash, provider (email/apple/google), provider_id, is_active, is_premium, created_at

**onboarding_profiles** — datos del onboarding completo
- user_id (FK), gender, workouts_week, heard_from, used_other_apps
- height_cm, weight_kg, unit_system, birth_date
- goal (lose/maintain/gain), target_weight_kg, weight_speed_kg
- pain_points (TEXT[]), diet_type, accomplishments (TEXT[])
- health_connected, notifications_enabled, referral_code
- daily_calories, daily_carbs_g, daily_protein_g, daily_fats_g, health_score
- completed_at

**food_logs** — registro de comidas
- user_id (FK), logged_at, meal_type (breakfast/lunch/dinner/snack)
- image_url (S3), image_hash (SHA256 para cache)
- food_name, calories, carbs_g, protein_g, fats_g, fiber_g, sugar_g, sodium_mg
- ai_provider, ai_confidence, ai_raw_response (JSONB), was_edited

**ai_scan_cache** — evitar llamadas API duplicadas (ahorra $$$)
- image_hash (UNIQUE), food_name, macros, ai_response (JSONB), hit_count

**daily_summaries** — pre-calculado para dashboards
- user_id, date (UNIQUE pair), totales del día, meals_logged, streak_days

**subscriptions** — modelo freemium
- user_id, plan (free/monthly/yearly/lifetime), status, price_paid, discount_pct, store

**referrals** — sistema de referidos
- referrer_id, referred_id, code (UNIQUE), converted, reward_given

---

## Los 30 módulos del onboarding

| # | Módulo | Estado | Archivo |
|---|--------|--------|---------|
| 01 | Splash Screen | ⬜ PENDIENTE | `onboarding/Step01Splash.tsx` |
| 02 | Welcome Screen | ⬜ PENDIENTE | `onboarding/Step02Welcome.tsx` |
| 03 | Gender | ⬜ PENDIENTE | `onboarding/Step03Gender.tsx` |
| 04 | Workouts/week | ⬜ PENDIENTE | `onboarding/Step04Workouts.tsx` |
| 05 | Source (heard from) | ⬜ PENDIENTE | `onboarding/Step05Source.tsx` |
| 06 | Used other apps | ⬜ PENDIENTE | `onboarding/Step06OtherApps.tsx` |
| 07 | Social proof chart | ⬜ PENDIENTE | `onboarding/Step07SocialProof.tsx` |
| 08 | Height & Weight | ⬜ PENDIENTE | `onboarding/Step08HeightWeight.tsx` |
| 09 | Birthday | ⬜ PENDIENTE | `onboarding/Step09Birthday.tsx` |
| 10 | Goal | ⬜ PENDIENTE | `onboarding/Step10Goal.tsx` |
| 11 | Target weight (ruler) | ⬜ PENDIENTE | `onboarding/Step11TargetWeight.tsx` |
| 12 | Affirmation | ⬜ PENDIENTE | `onboarding/Step12Affirmation.tsx` |
| 13 | Speed slider | ⬜ PENDIENTE | `onboarding/Step13Speed.tsx` |
| 14 | 2X Comparison chart | ⬜ PENDIENTE | `onboarding/Step14Comparison.tsx` |
| 15 | Pain points | ⬜ PENDIENTE | `onboarding/Step15PainPoints.tsx` |
| 16 | Diet type | ⬜ PENDIENTE | `onboarding/Step16Diet.tsx` |
| 17 | Accomplish | ⬜ PENDIENTE | `onboarding/Step17Accomplish.tsx` |
| 18 | Progress chart | ⬜ PENDIENTE | `onboarding/Step18ProgressChart.tsx` |
| 19 | Trust / Privacy | ⬜ PENDIENTE | `onboarding/Step19Trust.tsx` |
| 20 | Health connect | ⬜ PENDIENTE | `onboarding/Step20Health.tsx` |
| 21 | Reviews / Social proof | ⬜ PENDIENTE | `onboarding/Step21Reviews.tsx` |
| 22 | Flexibility highlight | ⬜ PENDIENTE | `onboarding/Step22Flexibility.tsx` |
| 23 | Notifications | ⬜ PENDIENTE | `onboarding/Step23Notifications.tsx` |
| 24 | Referral code | ⬜ PENDIENTE | `onboarding/Step24Referral.tsx` |
| 25 | Account creation | ⬜ PENDIENTE | `onboarding/Step25Account.tsx` |
| 26 | Plan building (loading) | ⬜ PENDIENTE | `onboarding/Step26PlanBuilding.tsx` |
| 27 | Plan ready | ⬜ PENDIENTE | `onboarding/Step27PlanReady.tsx` |
| 28 | Paywall principal | ⬜ PENDIENTE | `onboarding/Step28Paywall.tsx` |
| 29 | Spin the wheel | ⬜ PENDIENTE | `onboarding/Step29SpinWheel.tsx` |
| 30 | Paywall descuento | ⬜ PENDIENTE | `onboarding/Step30PaywallDiscount.tsx` |

Leyenda: ⬜ PENDIENTE | 🔄 EN PROGRESO | ✅ COMPLETO | ❌ CON ERRORES

---

## Estado actual del backend

### Tablas existentes (modelo original)
- user, activity — esquema básico de la v1

### Tablas que hay que agregar (migración pendiente)
- onboarding_profiles, food_logs, ai_scan_cache, daily_summaries, subscriptions, referrals

### Endpoints que hay que crear
- POST /api/onboarding — guardar progreso del onboarding paso a paso
- POST /api/food/scan — recibir imagen, llamar AI, retornar nutrientes
- GET  /api/food/logs — historial de comidas del usuario
- GET  /api/dashboard/today — resumen del día
- POST /api/subscriptions — crear/actualizar suscripción

---

## Instrucciones para Claude al retomar

1. **Leer este archivo COMPLETO** antes de escribir cualquier código
2. **Leer TASKS.md** para saber exactamente en qué paso quedamos
3. El módulo actual siempre está marcado como 🔄 EN PROGRESO
4. No romper lo que ya está ✅ COMPLETO
5. Cada módulo tiene su propio archivo en `mobile/src/screens/onboarding/`
6. La DB se maneja con Alembic — nunca editar tablas directamente en producción
7. Los componentes compartidos van en `mobile/src/components/`
8. El design system está en `mobile/src/theme/index.ts`

---

## Figma reference

- Board: Fitsi AI Onboarding - Broken down (Community)
- File key: `VgUp4jmiVXFFqZpbgQIanp`
- API Token: en `~/.claude/settings.json` bajo mcpServers.figma
- Para re-fetchear imágenes: `curl -H "X-Figma-Token: <token>" "https://api.figma.com/v1/files/VgUp4jmiVXFFqZpbgQIanp"`

---

---

## TOON Protocol — Inter-Agent Communication

**ALL inter-agent communication MUST use TOON format** (Token-Oriented Object Notation).
TOON reduces prompt tokens by ~40-60% vs JSON. It is the MANDATORY protocol for all 1,299 agents.

### Format
```
key:value|key:value|nested:{k:v|k:v}|list:[a,b,c]
Booleans: T/F | Null: _ | Numbers: bare
```

### Agent Message Standard
```
from:{agent}|to:{agent}|type:{msg_type}|pri:{priority}|tid:{task_id}|p:{payload}
```

### Message Types
`task_assign` `task_result` `delegate` `escalate` `feedback` `status` `query` `response` `alert`

### Implementation
- Encoder/Decoder: `agent-dashboard/toon.py`
- Skill: `/toon` (always available)
- API: `POST /api/toon/encode`, `POST /api/toon/decode`, `POST /api/toon/message`
- Protocol spec: `GET /api/toon/protocol`

---

*Última actualización: 2026-03-22*
*Próximo paso: ver TASKS.md*

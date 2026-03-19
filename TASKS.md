# TASKS.md — Tracker de progreso

> Leer esto ANTES de continuar cualquier trabajo.
> Actualizar al terminar cada tarea.

---

## ✅ FASE 0 — Fundamentos (COMPLETO)

### TAREA 0.1 — Limpiar OnboardingScreen monolítico ✅
### TAREA 0.2 — Crear design system base ✅ (`mobile/src/theme/index.ts`)
### TAREA 0.3 — Crear componentes compartidos del onboarding ✅
- `OnboardingLayout`, `ProgressBar`, `BackButton`, `PrimaryButton`, `OptionCard`, `ScrollPicker`, `RulerSlider`
### TAREA 0.4 — Crear OnboardingContext ✅ (`mobile/src/context/OnboardingContext.tsx`)
### TAREA 0.5 — Crear OnboardingNavigator ✅ (`mobile/src/screens/onboarding/OnboardingNavigator.tsx`)

### TAREA 0.6 — Modelos DB ✅ COMPLETO
- `backend/app/models/onboarding_profile.py` — OnboardingProfile (todos los campos del onboarding)
- `backend/app/models/ai_food_log.py` — AIFoodLog (image_hash indexado, macros, ai_raw_response)
- `backend/app/models/ai_scan_cache.py` — AIScanCache (image_hash UNIQUE, shared cache)
- `backend/app/models/subscription.py` — Subscription (plan/status, FK user)
- Tablas creadas automáticamente via `create_db_and_tables()` al iniciar

### TAREA 0.7 — Endpoints backend del onboarding ✅ COMPLETO
- `backend/app/routers/onboarding.py`
- `POST /api/onboarding/save-step` — guardar paso individual
- `POST /api/onboarding/complete` — completar + calcular plan (Mifflin-St Jeor)
- `GET  /api/onboarding/profile` — obtener perfil guardado
- Schemas en `backend/app/schemas/onboarding.py`
- Service en `backend/app/services/onboarding_service.py`

---

## ✅ FASE 1 — Módulos 01-06 (COMPLETO)

| Módulo | Archivo | Estado |
|--------|---------|--------|
| 01 Splash | `Step01Splash.tsx` | ✅ |
| 02 Welcome | `Step02Welcome.tsx` | ✅ |
| 03 Gender | `Step03Gender.tsx` | ✅ |
| 04 Workouts | `Step04Workouts.tsx` | ✅ |
| 05 Source | `Step05Source.tsx` | ✅ |
| 06 OtherApps | `Step06OtherApps.tsx` | ✅ |

---

## ✅ FASE 2 — Módulos 07-14 (COMPLETO)

| Módulo | Archivo | Estado |
|--------|---------|--------|
| 07 Social Proof chart | `Step07SocialProof.tsx` | ✅ |
| 08 Height & Weight | `Step08HeightWeight.tsx` | ✅ |
| 09 Birthday | `Step09Birthday.tsx` | ✅ |
| 10 Goal | `Step10Goal.tsx` | ✅ |
| 11 Target Weight (ruler) | `Step11TargetWeight.tsx` | ✅ |
| 12 Affirmation | `Step12Affirmation.tsx` | ✅ |
| 13 Speed slider | `Step13Speed.tsx` | ✅ |
| 14 2X Comparison chart | `Step14Comparison.tsx` | ✅ |

---

## ✅ FASE 3 — Módulos 15-23 (COMPLETO)

| Módulo | Archivo | Estado |
|--------|---------|--------|
| 15 Pain Points | `Step15PainPoints.tsx` | ✅ |
| 16 Diet type | `Step16Diet.tsx` | ✅ |
| 17 Accomplish | `Step17Accomplish.tsx` | ✅ |
| 18 Progress chart (SVG) | `Step18ProgressChart.tsx` | ✅ |
| 19 Trust / Privacy | `Step19Trust.tsx` | ✅ |
| 20 Health connect | `Step20Health.tsx` | ✅ |
| 21 Reviews | `Step21Reviews.tsx` | ✅ |
| 22 Flexibility | `Step22Flexibility.tsx` | ✅ |
| 23 Notifications | `Step23Notifications.tsx` | ✅ |

---

## ✅ FASE 4 — Módulos 24-30 (COMPLETO)

| Módulo | Archivo | Estado |
|--------|---------|--------|
| 24 Referral code | `Step24Referral.tsx` | ✅ |
| 25 Account creation | `Step25Account.tsx` | ✅ |
| 26 Plan building (loading) | `Step26PlanBuilding.tsx` | ✅ |
| 27 Plan ready | `Step27PlanReady.tsx` | ✅ |
| 28 Paywall principal | `Step28Paywall.tsx` | ✅ |
| 29 Spin wheel | `Step29SpinWheel.tsx` | ✅ |
| 30 Paywall descuento | `Step30PaywallDiscount.tsx` | ✅ |

**OnboardingNavigator**: ✅ Todos los 30 pasos cableados

---

## ✅ FASE 5 — Backend + AI (COMPLETO)

### TAREA 5.1 — Modelos DB ✅
### TAREA 5.2 — Endpoints onboarding ✅
### TAREA 5.3 — Auth completa ✅
- Email/password, Apple Sign In, Google OAuth, rolling refresh tokens
- `backend/app/routers/auth.py`, `core/security.py`, `core/token_store.py`
- `mobile/src/services/auth.service.ts`, `mobile/src/context/AuthContext.tsx`

### TAREA 5.4 — AI Food Scan ✅ COMPLETO
- `POST /api/food/scan` — GPT-4o Vision, SHA256 cache (Redis + DB), auto-log
- `GET  /api/food/logs` — historial con filtro por fecha
- `GET  /api/food/logs/{id}` — detalle
- `PUT  /api/food/logs/{id}` — editar (was_edited=True)
- `DELETE /api/food/logs/{id}` — eliminar
- `backend/app/services/ai_scan_service.py`
- `backend/app/routers/ai_food.py`

### TAREA 5.5 — Dashboard ✅ COMPLETO
- `GET /api/dashboard/today?date=YYYY-MM-DD`
- Totales vs targets, streak calculado, meals_logged
- `.env.example` actualizado con OPENAI_API_KEY

---

## ⬜ FASE 6 — Pantallas principales (post-onboarding)

### TAREA 6.1 — HomeScreen
- Dashboard de calorías del día, macros, progreso

### TAREA 6.2 — ScanScreen
- Cámara, preview, AI scan, resultado, confirmación

### TAREA 6.3 — LogScreen
- Historial de comidas con búsqueda manual

### TAREA 6.4 — ProfileScreen
- Datos del usuario, edición de metas, suscripción

---

## Notas de sesión

| Fecha | Qué se hizo | Dónde quedamos |
|-------|-------------|----------------|
| 2026-03-17 | Setup inicial, diseño DB, CLAUDE.md | FASE 0 |
| 2026-03-17 | FASE 0-1 completa: design system, componentes base, context, navigator, módulos 01-06 | Inicio FASE 2 |
| 2026-03-18 | FASE 2 completa: módulos 07-14 (charts, pickers, sliders) | Inicio FASE 3 |
| 2026-03-18 | FASE 3+4 completa: módulos 15-30, navigator actualizado con 30 pasos | **Próximo: FASE 5 (Backend)** |
| 2026-03-18 | FASE 5 completa: auth (Apple/Google/email), AI food scan (GPT-4o + cache), dashboard, food logs CRUD | **Próximo: FASE 6 (Pantallas principales)** |

---

*Para continuar: empezar por la primera tarea ⬜ PENDIENTE de la fase más baja numerada.*

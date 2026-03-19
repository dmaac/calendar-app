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

---

## ✅ FASE 1 — Módulos 01-06 (COMPLETO)

| Módulo | Archivo | Estado |
|--------|---------|--------|
| 01 Splash | `Step01Splash.tsx` | ✅ |
| 02 Welcome | `Step02Welcome.tsx` | ✅ bug fixes aplicados |
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
| 09 Birthday | `Step09Birthday.tsx` | ✅ bug fix day index |
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
| 23 Notifications | `Step23Notifications.tsx` | ✅ real permissions + scheduling |

---

## ✅ FASE 4 — Módulos 24-30 (COMPLETO)

| Módulo | Archivo | Estado |
|--------|---------|--------|
| 24 Referral code | `Step24Referral.tsx` | ✅ |
| 25 Account creation | `Step25Account.tsx` | ✅ |
| 26 Plan building (loading) | `Step26PlanBuilding.tsx` | ✅ |
| 27 Plan ready | `Step27PlanReady.tsx` | ✅ theme colors fix |
| 28 Paywall principal | `Step28Paywall.tsx` | ✅ |
| 29 Spin wheel | `Step29SpinWheel.tsx` | ✅ |
| 30 Paywall descuento | `Step30PaywallDiscount.tsx` | ✅ VITALICIO fix |

**OnboardingNavigator**: ✅ Todos los 30 pasos cableados

---

## ✅ FASE 5 — Backend + AI (COMPLETO)

### TAREA 5.1 — Modelos DB ✅
### TAREA 5.2 — Endpoints onboarding ✅
### TAREA 5.3 — Auth completa ✅
- Email/password, Apple Sign In, Google OAuth, rolling refresh tokens
### TAREA 5.4 — AI Food Scan ✅ COMPLETO
- `POST /api/food/scan` — GPT-4o Vision, SHA256 cache (Redis + DB), auto-log
- `GET  /api/food/logs` — historial con filtro por fecha
- `PUT  /api/food/logs/{id}` — editar
- `DELETE /api/food/logs/{id}` — eliminar
### TAREA 5.5 — Dashboard ✅ COMPLETO
- `GET /api/dashboard/today?date=YYYY-MM-DD`
- Totales vs targets, streak calculado, water_ml real

---

## ✅ FASE 6 — Pantallas principales (COMPLETO)

### TAREA 6.1 — HomeScreen ✅
- SVG calorie ring, macro bars, streak badge, pull-to-refresh
- `mobile/src/screens/main/HomeScreen.tsx`

### TAREA 6.2 — ScanScreen ✅
- expo-image-picker, AI scan flow, result display, meal type selector
- `mobile/src/screens/main/ScanScreen.tsx`

### TAREA 6.3 — LogScreen ✅ (ampliado)
- Comidas por tipo, eliminar, water tracking con botones rápidos
- Modal "Añadir" con opciones: Scan IA | Manual
- `mobile/src/screens/main/LogScreen.tsx`

### TAREA 6.4 — AddFoodScreen ✅ (NUEVO)
- Formulario manual: nombre, calorías, macros, porción
- Selector de tipo de comida con chips
- `mobile/src/screens/main/AddFoodScreen.tsx`

### TAREA 6.5 — ProfileScreen ✅
- Avatar, stats, datos personales, plan nutricional, Premium banner
- `mobile/src/screens/main/ProfileScreen.tsx`

### TAREA 6.6 — PaywallScreen ✅
- UI completa, selector mensual/anual, ready para RevenueCat
- `mobile/src/screens/main/PaywallScreen.tsx`

---

## ✅ FASE 7 — Features adicionales (COMPLETO)

### TAREA 7.1 — Backend: Manual food log ✅
- `POST /api/food/manual` — log sin foto, ai_provider="manual"

### TAREA 7.2 — Backend: Water tracking ✅
- `POST /api/food/water` — acumula ml en DailyNutritionSummary
- `GET /api/dashboard/today` ahora retorna water_ml real

### TAREA 7.3 — Backend: Subscriptions ✅
- `POST /api/subscriptions` — crea/reemplaza suscripción, actualiza is_premium
- `GET  /api/subscriptions/current` — obtiene suscripción activa
- `DELETE /api/subscriptions/current` — cancela suscripción
- `backend/app/routers/subscriptions.py`

### TAREA 7.4 — LogStack navigation ✅
- MainNavigator tiene LogStack (LogScreen + AddFoodScreen)

### TAREA 7.5 — Bug fixes audit ✅
- Step09Birthday: day index off-by-one corregido
- OnboardingContext: macro split 40/30/30 (alineado con backend)
- Step02Welcome: botón "🌐 EN" eliminado
- Step30PaywallDiscount: "FOREVER" → "VITALICIO"
- Step27PlanReady: colores hardcoded → theme colors
- PaywallScreen: `textDecoration` → `textDecorationLine`

---

## ⬜ TAREAS MANUALES (requieren config externa)

| Tarea | Bloqueo | Detalles |
|-------|---------|---------|
| RevenueCat SDK | Config | Instalar `react-native-purchases`, crear productos en App Store Connect / Play Console, reemplazar TODO en `PaywallScreen.handleSubscribe` |
| OPENAI_API_KEY | Credencial | Agregar a `backend/.env` para habilitar AI food scan |
| Apple Sign In | Credenciales | APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY en `backend/.env` |
| Google OAuth | Credenciales | EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS / _ANDROID / _WEB en `mobile/.env` |
| IP del servidor (dev) | Config | Cambiar `localhost` por IP real en `mobile/src/services/api.ts` para probar en dispositivo físico |
| Push notifications server | Config | APNS certificate + expo-notifications server setup para enviar push desde backend |
| App Store / Play Store | Config | Bundle ID, certificados, provisioning profiles |
| Dominio + HTTPS | Infra | Para producción: nginx reverse proxy + SSL en el servidor |

---

## Notas de sesión

| Fecha | Qué se hizo |
|-------|-------------|
| 2026-03-17 | Setup inicial, diseño DB, CLAUDE.md |
| 2026-03-17 | FASE 0-1: design system, componentes, context, navigator, módulos 01-06 |
| 2026-03-18 | FASE 2: módulos 07-14 (charts, pickers, sliders) |
| 2026-03-18 | FASE 3+4: módulos 15-30, navigator 30 pasos |
| 2026-03-18 | FASE 5: auth (Apple/Google/email), AI food scan (GPT-4o + cache), dashboard |
| 2026-03-18 | FASE 6: pantallas principales (Home, Scan, Log, Profile, Paywall), navegación |
| 2026-03-19 | Bug fixes audit, FASE 7: AddFoodScreen, water tracking, subscriptions backend, notif scheduling |

---

*El proyecto está funcionalmente completo. Solo quedan tareas que requieren credenciales externas.*

# Fitsi IA — Push Notification Strategy

> Version: 1.0 | Last updated: 2026-03-19
> Target: Latin America (UTC-3 to UTC-8)
> All times are in the user's LOCAL timezone.

---

## Global Rules

### Frequency Caps

| Window | Max notifications |
|---|---|
| Per day | 2 |
| Per week | 9 |
| Per 30 days | 30 |

- Never send more than 1 notification in any 3-hour window.
- If a notification goes unread for 24 hours, suppress the same template for 48 hours before retrying.
- A user who has opened the app in the last 2 hours does NOT receive a "come back" nudge.

### Quiet Hours

- **Quiet hours:** 22:00 – 08:00 local time (no sends).
- **Weekend quiet hours:** 23:00 – 09:00 (users sleep in).
- Messages queued during quiet hours fire at the start of the active window (08:00 / 09:00) — except meal reminders, which are dropped if the mealtime already passed.

### Eligibility Filters (apply before every send)

1. User has granted push permission.
2. User has completed onboarding.
3. Account is active (logged in within the last 30 days).
4. User has not disabled the specific notification category in settings.

### Opt-Out Categories (user-configurable in app settings)

- Meal reminders
- Streak / motivation
- Weekly summary
- Promotional / upgrade

---

## Notification Templates

---

### 1. Morning Breakfast Reminder

**Category:** Meal reminder
**Trigger:** Daily recurring at 08:30 local time, only if no breakfast log exists yet for today
**Audience:** All users (free + premium)

| Field | Content |
|---|---|
| Title | Buenos días, {{first_name}} |
| Body | ¿Ya desayunaste? Registra tu desayuno y arranca el día con pie derecho. 🌅 |
| CTA deep link | `fitsiai://scan?meal=breakfast` |
| Badge | +1 |
| Sound | default |

**Suppression:** Do not send if user opened the app after 07:00 today.

---

### 2. Lunch Reminder

**Category:** Meal reminder
**Trigger:** Daily at 13:00 local time, only if no lunch log exists yet
**Audience:** All users

| Field | Content |
|---|---|
| Title | Hora del almuerzo |
| Body | No olvides registrar lo que comiste. 2 segundos con la cámara y listo. 📸 |
| CTA deep link | `fitsiai://scan?meal=lunch` |
| Badge | +1 |
| Sound | default |

**Suppression:** Do not send if total calories logged today already exceed 60% of daily target (user is actively tracking).

---

### 3. Dinner Reminder

**Category:** Meal reminder
**Trigger:** Daily at 20:00 local time, only if no dinner log exists yet
**Audience:** All users

| Field | Content |
|---|---|
| Title | Casi termina el día |
| Body | ¿Ya anotaste la cena? Cierra bien tu registro de hoy. 🍽️ |
| CTA deep link | `fitsiai://scan?meal=dinner` |
| Badge | +1 |
| Sound | default |

**Suppression:** Do not send if dinner is already logged. Do not send if user has 0 logs today (they are likely not active — use re-engagement template instead).

---

### 4. Calorie Goal Nearly Reached

**Category:** Streak / motivation
**Trigger:** Real-time — fires when `calories_consumed / calories_target >= 0.90` for the first time that day
**Audience:** All users
**Timing:** Only fires between 12:00 and 21:00 (avoids early morning edge cases)

| Field | Content |
|---|---|
| Title | ¡Casi en tu objetivo! |
| Body | Te quedan solo {{remaining_kcal}} kcal para hoy. Elige bien tu próxima comida. 💪 |
| CTA deep link | `fitsiai://home` |
| Badge | +1 |
| Sound | default |

**Suppression:** Fire once per day maximum. Do not fire if calories already exceeded (use template #5 instead).

---

### 5. Calorie Goal Exceeded

**Category:** Streak / motivation
**Trigger:** Real-time — fires when `calories_consumed > calories_target` for the first time that day
**Audience:** All users
**Timing:** Only fires between 12:00 and 21:00

| Field | Content |
|---|---|
| Title | Superaste tu objetivo de hoy |
| Body | No hay problema, mañana es un día nuevo. Mantén el registro y sigue avanzando. 🔄 |
| CTA deep link | `fitsiai://log` |
| Badge | +1 |
| Sound | default |

**Suppression:** Fire once per day maximum. Tone is non-judgmental — do not use language around "failing".

---

### 6. Streak at Risk

**Category:** Streak / motivation
**Trigger:** Daily at 21:30 local time, only if streak > 0 AND the user has logged 0 meals today
**Audience:** All users with streak_days >= 1

| Field | Content |
|---|---|
| Title | Tu racha de {{streak_days}} días está en riesgo 🔥 |
| Body | Solo necesitas registrar una comida para mantenerla viva. ¡No la pierdas ahora! |
| CTA deep link | `fitsiai://scan` |
| Badge | +1 |
| Sound | default |

**Copy variants by streak length:**
- 1–3 days: "Tu racha de {{streak_days}} días está empezando — ¡no la rompas!"
- 4–9 days: "Tu racha de {{streak_days}} días está en riesgo 🔥"
- 10–29 days: "¡{{streak_days}} días seguidos! No los desperdicies."
- 30+ days: "{{streak_days}} días de racha. Eres increíble — no lo dejes ir ahora."

---

### 7. New Streak Milestone

**Category:** Streak / motivation
**Trigger:** Real-time — fires when `streak_days` reaches 3, 7, 14, 30, 60, 90
**Audience:** All users

| Field | Content |
|---|---|
| Title | ¡{{streak_days}} días de racha! 🔥 |
| Body | Llevas {{streak_days}} días registrando tus comidas. Eso es un hábito que está cambiando tu vida. |
| CTA deep link | `fitsiai://home` |
| Badge | +1 |
| Sound | celebration (custom sound, fallback to default) |

---

### 8. Weekly Summary

**Category:** Weekly summary
**Trigger:** Every Monday at 09:00 local time
**Audience:** Users with at least 3 logs in the previous 7 days

| Field | Content |
|---|---|
| Title | Tu semana en Fitsi IA |
| Body | Registraste {{days_logged}}/7 días la semana pasada. Tu promedio: {{avg_calories}} kcal/día. ¡Revisa tu progreso! |
| CTA deep link | `fitsiai://history` |
| Badge | +1 |
| Sound | default |

**Suppression:** Do not send if user has 0 logs in the last 7 days (they are inactive — use re-engagement instead).

---

### 9. Free User Upgrade Nudge (Scan Limit Hit)

**Category:** Promotional / upgrade
**Trigger:** Fires 30 minutes after a user hits the 3-scan daily limit for the second time in a week
**Audience:** Free users only
**Frequency cap override:** Max once per 5 days (this is a monetization nudge, not a utility message)

| Field | Content |
|---|---|
| Title | Te quedaste sin escaneos por segunda vez |
| Body | Pasa a Premium y escanea sin límite. 7 días gratis, cancela cuando quieras. 👑 |
| CTA deep link | `fitsiai://paywall?source=push_scan_limit` |
| Badge | +1 |
| Sound | default |

**A/B test variant body:** "¿Cansado del límite de 3 escaneos? Premium te da ilimitados — pruébalo gratis por 7 días."

---

### 10. Re-engagement (Lapsed User)

**Category:** Streak / motivation
**Trigger:** User has not opened the app for exactly 3 days (fired at 10:00 local time on day 3)
**Audience:** Users inactive for 3 days who previously had at least 5 total logs
**Frequency cap override:** Max once every 7 days

| Field | Content |
|---|---|
| Title | Te extrañamos, {{first_name}} |
| Body | Han pasado 3 días. Tu plan sigue esperándote — en 10 segundos vuelves a estar al día. 💚 |
| CTA deep link | `fitsiai://home` |
| Badge | +1 |
| Sound | default |

**Day 7 variant (if still inactive after 7 days):**
- Title: "¿Sigues ahí, {{first_name}}?"
- Body: "Sabemos que la vida se complica. Cuando estés listo, aquí estamos. 1 foto y vas. 📸"

**Day 14 variant (last attempt):**
- Title: "Una última cosa antes de que te vayas"
- Body: "Tu historial y tu plan personal siguen guardados. Vuelve cuando quieras — no empezarás de cero."

Do NOT send re-engagement after 14 days of inactivity to avoid spam classification.

---

## Notification Permission Prompt Strategy

The permission prompt (iOS) should only be shown at high-intent moments — never on first launch.

**Recommended timing:** Step23Notifications in onboarding, after the user has already selected their goal and seen their personalized plan. The value prop is clear by this point.

**Pre-permission message (shown before the system prompt):**
> "Activa las notificaciones para recordatorios de comida y alertas de tu racha. Puedes apagarlas cuando quieras."

**If declined:** retry after the first time the user hits the scan limit (they are highly engaged). Never ask more than twice.

---

## Payload Structure (reference implementation)

```json
{
  "to": "{{expo_push_token}}",
  "title": "Tu racha de 7 días está en riesgo 🔥",
  "body": "Solo necesitas registrar una comida para mantenerla viva.",
  "data": {
    "deep_link": "fitsiai://scan",
    "template_id": "streak_at_risk",
    "user_id": "{{uuid}}",
    "sent_at": "2026-03-19T21:30:00Z"
  },
  "sound": "default",
  "badge": 1,
  "ttl": 3600,
  "priority": "normal"
}
```

**TTL guidelines:**
- Meal reminders: 3600s (1 hour) — drop if not delivered before mealtime ends
- Streak at risk: 7200s (2 hours)
- Weekly summary: 86400s (24 hours)
- Re-engagement: 86400s (24 hours)

---

## Analytics Events to Track for Notifications

| Event | Properties |
|---|---|
| `push_sent` | `template_id`, `user_id`, `send_time` |
| `push_delivered` | `template_id`, `user_id`, `delivery_latency_ms` |
| `push_opened` | `template_id`, `user_id`, `time_to_open_ms`, `deep_link` |
| `push_dismissed` | `template_id`, `user_id` |
| `push_opted_out` | `category`, `user_id` |

**Key metrics to monitor weekly:**
- Open rate by template (target: >15% for utility, >8% for promotional)
- Opt-out rate (alert if any template exceeds 3% opt-out/week)
- Conversion rate for template #9 (upgrade nudge) — measures revenue impact

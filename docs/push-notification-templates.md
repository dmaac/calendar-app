# Fitsi AI — Push Notification Templates Library

> Version: 1.0 | Last updated: 2026-03-22
> Total templates: 50
> Cross-references: push-strategy.md (global rules, payload structure), retention-strategy.md (lifecycle sequences)
> All times are in the user's LOCAL timezone. Quiet hours: 22:00-08:00 weekdays, 23:00-09:00 weekends.

---

## Global Rules (from push-strategy.md)

- Max 2 notifications/day, 9/week, 30/month
- Never send 2 notifications within a 3-hour window
- Respect user-configurable opt-out categories: meal reminders, streak/motivation, weekly summary, promotional/upgrade
- All templates support `{{first_name}}` personalization (fallback: empty string)
- Deep links use `fitsiai://` scheme

---

## Category 1: Meal Reminders (10 templates)

### MR-01: Breakfast — Standard
| Field | Content |
|-------|---------|
| **Template ID** | `meal_breakfast_standard` |
| **Title** | Buenos dias, {{first_name}} |
| **Body** | Ya desayunaste? Registra tu desayuno y arranca el dia con pie derecho |
| **Emoji** | sunrise (in title area) |
| **Deep Link** | `fitsiai://scan?meal=breakfast` |
| **Timing** | 08:30 local time |
| **Trigger** | Daily, no breakfast log exists today |
| **Segment** | All users (free + premium) |
| **Suppression** | User opened app after 07:00 today |

### MR-02: Breakfast — Motivational
| Field | Content |
|-------|---------|
| **Template ID** | `meal_breakfast_motivational` |
| **Title** | Un buen dia empieza con un buen registro |
| **Body** | Desayuna conscientemente hoy. Escanea lo que comas y tu cuerpo te lo agradecera |
| **Emoji** | coffee |
| **Deep Link** | `fitsiai://scan?meal=breakfast` |
| **Timing** | 08:15 local time |
| **Trigger** | Daily, no breakfast log, user has 3+ day streak |
| **Segment** | Users with active streak |
| **Suppression** | User opened app after 07:00 today |

### MR-03: Breakfast — Weekend
| Field | Content |
|-------|---------|
| **Template ID** | `meal_breakfast_weekend` |
| **Title** | Brunch time, {{first_name}}? |
| **Body** | Los fines de semana tambien cuentan. Registra tu brunch y mantente al dia |
| **Emoji** | pancakes |
| **Deep Link** | `fitsiai://scan?meal=breakfast` |
| **Timing** | 10:00 local time (later on weekends) |
| **Trigger** | Saturday/Sunday only, no breakfast log |
| **Segment** | All users |
| **Suppression** | User opened app after 09:00 today |

### MR-04: Lunch — Standard
| Field | Content |
|-------|---------|
| **Template ID** | `meal_lunch_standard` |
| **Title** | Hora del almuerzo |
| **Body** | No olvides registrar lo que comiste. 2 segundos con la camara y listo |
| **Emoji** | camera |
| **Deep Link** | `fitsiai://scan?meal=lunch` |
| **Timing** | 13:00 local time |
| **Trigger** | Daily, no lunch log exists |
| **Segment** | All users |
| **Suppression** | Total calories logged today exceed 60% of daily target |

### MR-05: Lunch — Progress Check
| Field | Content |
|-------|---------|
| **Template ID** | `meal_lunch_progress` |
| **Title** | Llevas {{calories_so_far}} kcal hoy |
| **Body** | Registra tu almuerzo y mira como vas con tu objetivo de {{calories_target}} kcal |
| **Emoji** | chart |
| **Deep Link** | `fitsiai://scan?meal=lunch` |
| **Timing** | 12:45 local time |
| **Trigger** | Daily, no lunch log, at least 1 breakfast logged |
| **Segment** | Users who logged breakfast today |
| **Suppression** | User opened app in last 2 hours |

### MR-06: Dinner — Standard
| Field | Content |
|-------|---------|
| **Template ID** | `meal_dinner_standard` |
| **Title** | Casi termina el dia |
| **Body** | Ya anotaste la cena? Cierra bien tu registro de hoy |
| **Emoji** | plate |
| **Deep Link** | `fitsiai://scan?meal=dinner` |
| **Timing** | 20:00 local time |
| **Trigger** | Daily, no dinner log exists |
| **Segment** | All users |
| **Suppression** | User has 0 logs today (use re-engagement instead) |

### MR-07: Dinner — Goal Closing
| Field | Content |
|-------|---------|
| **Template ID** | `meal_dinner_goal` |
| **Title** | Te quedan {{remaining_kcal}} kcal para hoy |
| **Body** | Elige bien tu cena y cierra el dia en tu objetivo. Tu puedes |
| **Emoji** | target |
| **Deep Link** | `fitsiai://scan?meal=dinner` |
| **Timing** | 19:30 local time |
| **Trigger** | No dinner log, calories between 50-80% of target |
| **Segment** | Users with 2+ meals logged today |
| **Suppression** | Already received MR-06 today |

### MR-08: Snack — Afternoon
| Field | Content |
|-------|---------|
| **Template ID** | `meal_snack_afternoon` |
| **Title** | Hora de la merienda? |
| **Body** | Si comiste algo entre comidas, registralo rapido. Cada detalle cuenta |
| **Emoji** | apple |
| **Deep Link** | `fitsiai://scan?meal=snack` |
| **Timing** | 16:30 local time |
| **Trigger** | User has logged lunch but no snack, calories <70% of target |
| **Segment** | Users with lunch logged today |
| **Suppression** | User opened app in last 2 hours; never send if already at 2 pushes today |

### MR-09: Quick Log Reminder
| Field | Content |
|-------|---------|
| **Template ID** | `meal_quick_log` |
| **Title** | 10 segundos es todo lo que necesitas |
| **Body** | Saca tu celular, toma una foto, y listo. No dejes que se te olvide lo que comiste |
| **Emoji** | stopwatch |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 14:00 local time |
| **Trigger** | User has 0 logs today AND it's past noon |
| **Segment** | Users who logged yesterday but not today |
| **Suppression** | Already received any meal reminder today |

### MR-10: End of Day Summary Prompt
| Field | Content |
|-------|---------|
| **Template ID** | `meal_eod_prompt` |
| **Title** | Te falta registrar algo? |
| **Body** | Si comiste algo que no anotaste hoy, todavia estas a tiempo. Cierra tu dia completo |
| **Emoji** | clipboard |
| **Deep Link** | `fitsiai://log` |
| **Timing** | 21:00 local time |
| **Trigger** | User has 1-2 meals logged (incomplete day) |
| **Segment** | Users with partial logging today |
| **Suppression** | User opened app in last hour; streak-at-risk notification takes priority |

---

## Category 2: Hydration Reminders (5 templates)

### HY-01: Morning Water
| Field | Content |
|-------|---------|
| **Template ID** | `hydration_morning` |
| **Title** | Empieza el dia con agua |
| **Body** | Tu cuerpo necesita hidratarse despues de dormir. Registra tu primer vaso |
| **Emoji** | water drop |
| **Deep Link** | `fitsiai://log?section=water` |
| **Timing** | 09:00 local time |
| **Trigger** | 0 water logged today |
| **Segment** | Users who have used water tracking at least once |
| **Suppression** | User already logged water today; user opened app after 08:00 |

### HY-02: Midday Hydration Check
| Field | Content |
|-------|---------|
| **Template ID** | `hydration_midday` |
| **Title** | Llevas {{water_ml}}ml de {{water_goal}}ml |
| **Body** | Vas por buen camino con el agua. Un vaso mas y llegas a la mitad del dia |
| **Emoji** | water glass |
| **Deep Link** | `fitsiai://log?section=water` |
| **Timing** | 13:30 local time |
| **Trigger** | Water logged >0 but <50% of daily goal |
| **Segment** | Active water trackers |
| **Suppression** | Already received HY-01 within 3 hours |

### HY-03: Afternoon Water Push
| Field | Content |
|-------|---------|
| **Template ID** | `hydration_afternoon` |
| **Title** | No te olvides del agua |
| **Body** | La tarde es cuando mas se nos olvida tomar agua. Un vaso rapido? |
| **Emoji** | sweat drop |
| **Deep Link** | `fitsiai://log?section=water` |
| **Timing** | 16:00 local time |
| **Trigger** | Water <60% of goal at 4pm |
| **Segment** | Active water trackers |
| **Suppression** | User opened app in last 2 hours |

### HY-04: Water Goal Almost There
| Field | Content |
|-------|---------|
| **Template ID** | `hydration_almost` |
| **Title** | Casi llegas a tu meta de agua! |
| **Body** | Te faltan solo {{remaining_ml}}ml. Un vaso mas y lo logras hoy |
| **Emoji** | trophy |
| **Deep Link** | `fitsiai://log?section=water` |
| **Timing** | Real-time, between 14:00-20:00 |
| **Trigger** | Water reaches 80-95% of goal |
| **Segment** | Active water trackers |
| **Suppression** | Fire once per day maximum |

### HY-05: Water Goal Achieved
| Field | Content |
|-------|---------|
| **Template ID** | `hydration_achieved` |
| **Title** | Meta de agua cumplida! |
| **Body** | {{water_ml}}ml hoy. Tu cuerpo te lo agradece. Sigue asi manana tambien |
| **Emoji** | check mark |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time, between 10:00-21:00 |
| **Trigger** | Water reaches 100% of goal |
| **Segment** | Active water trackers |
| **Suppression** | Fire once per day maximum; do not send if daily push limit reached |

---

## Category 3: Streak Motivation (10 templates)

### ST-01: Streak at Risk — Early Streak (1-3 days)
| Field | Content |
|-------|---------|
| **Template ID** | `streak_risk_early` |
| **Title** | Tu racha de {{streak_days}} dias esta empezando |
| **Body** | No la rompas ahora! Solo necesitas registrar una comida para mantenerla viva |
| **Emoji** | fire |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 21:30 local time |
| **Trigger** | streak 1-3 days AND 0 meals logged today |
| **Segment** | Users with streak 1-3 |
| **Suppression** | User opened app after 20:00 |

### ST-02: Streak at Risk — Building Streak (4-9 days)
| Field | Content |
|-------|---------|
| **Template ID** | `streak_risk_building` |
| **Title** | Tu racha de {{streak_days}} dias esta en riesgo |
| **Body** | Llevas casi una semana. No dejes que se pierda por un dia. Escanea algo rapido |
| **Emoji** | fire |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 21:30 local time |
| **Trigger** | streak 4-9 days AND 0 meals logged today |
| **Segment** | Users with streak 4-9 |
| **Suppression** | User opened app after 20:00 |

### ST-03: Streak at Risk — Strong Streak (10-29 days)
| Field | Content |
|-------|---------|
| **Template ID** | `streak_risk_strong` |
| **Title** | {{streak_days}} dias seguidos! |
| **Body** | No los desperdicies. Estas a punto de un logro increible. Una foto y listo |
| **Emoji** | fire |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 21:00 local time (earlier — higher stakes) |
| **Trigger** | streak 10-29 days AND 0 meals logged today |
| **Segment** | Users with streak 10-29 |
| **Suppression** | User opened app after 19:00 |

### ST-04: Streak at Risk — Epic Streak (30+ days)
| Field | Content |
|-------|---------|
| **Template ID** | `streak_risk_epic` |
| **Title** | {{streak_days}} dias de racha. Eres increible |
| **Body** | No lo dejes ir ahora. Este habito es tuyo. Registra algo y sigue adelante |
| **Emoji** | crown |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 20:30 local time (even earlier — maximum urgency) |
| **Trigger** | streak 30+ days AND 0 meals logged today |
| **Segment** | Users with streak 30+ |
| **Suppression** | User opened app after 19:00 |

### ST-05: Streak Milestone — 3 Days
| Field | Content |
|-------|---------|
| **Template ID** | `streak_milestone_3` |
| **Title** | 3 dias de racha! |
| **Body** | Ya estas formando un habito. Los estudios dicen que 3 dias son la semilla del cambio |
| **Emoji** | seedling |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time (on meal log that triggers the milestone) |
| **Trigger** | streak_days reaches exactly 3 |
| **Segment** | All users |
| **Suppression** | None — milestone events always fire |

### ST-06: Streak Milestone — 7 Days
| Field | Content |
|-------|---------|
| **Template ID** | `streak_milestone_7` |
| **Title** | 1 semana completa! |
| **Body** | 7 dias seguidos registrando. Eres parte del 20% mas constante de nuestros usuarios |
| **Emoji** | star |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time |
| **Trigger** | streak_days reaches exactly 7 |
| **Segment** | All users |
| **Suppression** | None |

### ST-07: Streak Milestone — 14 Days
| Field | Content |
|-------|---------|
| **Template ID** | `streak_milestone_14` |
| **Title** | 2 semanas! Esto ya es un habito |
| **Body** | Llevas 14 dias registrando tus comidas. Tu relacion con la comida esta cambiando |
| **Emoji** | muscle |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time |
| **Trigger** | streak_days reaches exactly 14 |
| **Segment** | All users |
| **Suppression** | None |

### ST-08: Streak Milestone — 30 Days
| Field | Content |
|-------|---------|
| **Template ID** | `streak_milestone_30` |
| **Title** | 1 MES! Eres imparable |
| **Body** | 30 dias seguidos. Esto ya no es un reto, es parte de quien eres. Comparte tu logro |
| **Emoji** | trophy |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time |
| **Trigger** | streak_days reaches exactly 30 |
| **Segment** | All users |
| **Suppression** | None — use celebration sound |

### ST-09: Streak Milestone — 60 Days
| Field | Content |
|-------|---------|
| **Template ID** | `streak_milestone_60` |
| **Title** | 60 dias de racha! |
| **Body** | Dos meses sin fallar. Eres parte del 5% mas dedicado. Nadie te para |
| **Emoji** | diamond |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time |
| **Trigger** | streak_days reaches exactly 60 |
| **Segment** | All users |
| **Suppression** | None — use celebration sound |

### ST-10: Streak Milestone — 90 Days
| Field | Content |
|-------|---------|
| **Template ID** | `streak_milestone_90` |
| **Title** | 90 DIAS. Legendario |
| **Body** | Tres meses de constancia. Has desbloqueado el badge Legendario. Esto es para siempre |
| **Emoji** | crown + fire |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time |
| **Trigger** | streak_days reaches exactly 90 |
| **Segment** | All users |
| **Suppression** | None — use celebration sound |

---

## Category 4: Win-Back / Re-engagement (10 templates)

### WB-01: Day 1 Inactive — Gentle
| Field | Content |
|-------|---------|
| **Template ID** | `winback_1d_gentle` |
| **Title** | Tu registro de hoy esta vacio |
| **Body** | Todavia puedes registrar algo antes de dormir. 10 segundos y ya |
| **Emoji** | clock |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 20:00 local time |
| **Trigger** | 0 meals logged today, user was active yesterday |
| **Segment** | Users who logged yesterday |
| **Suppression** | Only send if no streak-at-risk was sent; max 1/day |

### WB-02: Day 3 Inactive — Miss You
| Field | Content |
|-------|---------|
| **Template ID** | `winback_3d_miss` |
| **Title** | Te extraniamos, {{first_name}} |
| **Body** | Han pasado 3 dias. Tu plan sigue esperandote — en 10 segundos vuelves a estar al dia |
| **Emoji** | green heart |
| **Deep Link** | `fitsiai://home` |
| **Timing** | 10:00 local time |
| **Trigger** | 3 days since last app open |
| **Segment** | Users with 5+ total logs (invested users) |
| **Suppression** | Max once per 7 days |

### WB-03: Day 3 Inactive — Streak Lost
| Field | Content |
|-------|---------|
| **Template ID** | `winback_3d_streak` |
| **Title** | Tu racha se reinicio |
| **Body** | Pero tu progreso no. Vuelve y empieza una nueva racha hoy. Lo importante es seguir |
| **Emoji** | refresh |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 10:00 local time |
| **Trigger** | 3 days inactive AND had streak >= 3 days when they left |
| **Segment** | Users who had active streaks |
| **Suppression** | Max once per 7 days; do not send if WB-02 was sent |

### WB-04: Day 5 Inactive — Fresh Start
| Field | Content |
|-------|---------|
| **Template ID** | `winback_5d_fresh` |
| **Title** | Nuevo dia, nueva oportunidad |
| **Body** | No importa cuantos dias pasaron. Lo que importa es empezar hoy. Una foto y vas |
| **Emoji** | sunrise |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | 09:00 local time |
| **Trigger** | 5 days inactive |
| **Segment** | Users who completed onboarding |
| **Suppression** | Max once per 7 days |

### WB-05: Day 7 Inactive — Question
| Field | Content |
|-------|---------|
| **Template ID** | `winback_7d_question` |
| **Title** | Sigues ahi, {{first_name}}? |
| **Body** | Sabemos que la vida se complica. Cuando estes listo, aqui estamos. 1 foto y vas |
| **Emoji** | camera |
| **Deep Link** | `fitsiai://home` |
| **Timing** | 10:00 local time |
| **Trigger** | 7 days since last app open |
| **Segment** | Users with 5+ total logs |
| **Suppression** | Max once per 7 days |

### WB-06: Day 7 Inactive — Stats Recap
| Field | Content |
|-------|---------|
| **Template ID** | `winback_7d_stats` |
| **Title** | Tu resumen sigue aqui |
| **Body** | Registraste {{total_meals}} comidas y tu mejor racha fue {{best_streak}} dias. No pierdas ese progreso |
| **Emoji** | bar chart |
| **Deep Link** | `fitsiai://progress` |
| **Timing** | 11:00 local time |
| **Trigger** | 7 days inactive, user has 10+ total meals logged |
| **Segment** | High-engagement users who went inactive |
| **Suppression** | Do not send if WB-05 was sent within 48h |

### WB-07: Day 14 Inactive — Last Push
| Field | Content |
|-------|---------|
| **Template ID** | `winback_14d_last` |
| **Title** | Una ultima cosa antes de que te vayas |
| **Body** | Tu historial y tu plan personal siguen guardados. Vuelve cuando quieras — no empezaras de cero |
| **Emoji** | lock |
| **Deep Link** | `fitsiai://home` |
| **Timing** | 10:00 local time |
| **Trigger** | 14 days since last app open |
| **Segment** | All inactive users who completed onboarding |
| **Suppression** | This is the LAST push attempt. No push notifications after this for inactive users |

### WB-08: Day 14 Inactive — Feedback Request
| Field | Content |
|-------|---------|
| **Template ID** | `winback_14d_feedback` |
| **Title** | Nos ayudas con 1 pregunta? |
| **Body** | Que nos falto? [Muy complicado] [No me sirvio] [Use otra app] [Otro]. Tu opinion nos importa |
| **Emoji** | speech bubble |
| **Deep Link** | `fitsiai://feedback` |
| **Timing** | 11:00 local time |
| **Trigger** | 14 days inactive, alternative to WB-07 |
| **Segment** | Users who logged 3-10 meals total (tried but didn't stick) |
| **Suppression** | Use instead of WB-07 for medium-engagement churned users |

### WB-09: Day 30 Inactive — New Feature
| Field | Content |
|-------|---------|
| **Template ID** | `winback_30d_feature` |
| **Title** | Algo nuevo en Fitsi AI |
| **Body** | Desde la ultima vez que entraste, agregamos {{new_feature}}. Pruebalo gratis |
| **Emoji** | sparkle |
| **Deep Link** | `fitsiai://home` |
| **Timing** | 10:00 local time |
| **Trigger** | 30 days inactive AND a new feature was released since their last session |
| **Segment** | Churned users who previously had 10+ sessions |
| **Suppression** | EMAIL ONLY after Day 14. This push is an exception: only send if a genuinely new feature was shipped |

### WB-10: Premium Lapsed — Win-Back Offer
| Field | Content |
|-------|---------|
| **Template ID** | `winback_premium_lapsed` |
| **Title** | Tu plan Premium expiro |
| **Body** | Quieres volver? Te damos 30% de descuento este mes. Tus datos siguen seguros |
| **Emoji** | crown |
| **Deep Link** | `fitsiai://paywall?source=push_winback&discount=30` |
| **Timing** | Day 3 after subscription cancellation, 10:00 local time |
| **Trigger** | Premium subscription cancelled or expired |
| **Segment** | Former premium users |
| **Suppression** | Max once per 14 days; do not send if user explicitly cancelled via app (only for involuntary churn) |

---

## Category 5: Achievement Celebrations (5 templates)

### AC-01: First Meal Logged
| Field | Content |
|-------|---------|
| **Template ID** | `achievement_first_meal` |
| **Title** | Tu primera comida registrada! |
| **Body** | Acabas de dar el primer paso. Registra 2 comidas mas hoy y empieza tu racha |
| **Emoji** | party popper |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Immediate (within 1 minute of first log) |
| **Trigger** | `first_food_logged` event fires |
| **Segment** | New users |
| **Suppression** | Fire once per account; do not send if user is still in-app (show in-app celebration instead) |

### AC-02: New Badge Earned
| Field | Content |
|-------|---------|
| **Template ID** | `achievement_badge` |
| **Title** | Nuevo badge: {{badge_name}}! |
| **Body** | Desbloqueaste "{{badge_name}}". Revisalo en tu perfil y comparte tu logro |
| **Emoji** | medal |
| **Deep Link** | `fitsiai://achievements` |
| **Timing** | Immediate |
| **Trigger** | Any badge unlocked |
| **Segment** | All users |
| **Suppression** | Max 1 badge notification per day (batch if multiple earned) |

### AC-03: Personal Record — Longest Streak
| Field | Content |
|-------|---------|
| **Template ID** | `achievement_record_streak` |
| **Title** | Nuevo record personal! |
| **Body** | {{streak_days}} dias es tu racha mas larga de todas. Sigue asi, no hay limite |
| **Emoji** | trophy |
| **Deep Link** | `fitsiai://home` |
| **Timing** | Real-time |
| **Trigger** | Current streak exceeds user's all-time best streak |
| **Segment** | All users |
| **Suppression** | Fire once per new record (not daily) |

### AC-04: Macro Goal Perfect Day
| Field | Content |
|-------|---------|
| **Template ID** | `achievement_macro_perfect` |
| **Title** | Dia perfecto! |
| **Body** | Hoy cumpliste con calorias, proteina, carbs Y grasas. Eso es control total |
| **Emoji** | bullseye |
| **Deep Link** | `fitsiai://home` |
| **Timing** | 21:30 local time (end of day summary) |
| **Trigger** | All 4 macros within 90-110% of target at end of day |
| **Segment** | All users |
| **Suppression** | Max once per day; only if user is not in-app |

### AC-05: Weight Milestone
| Field | Content |
|-------|---------|
| **Template ID** | `achievement_weight` |
| **Title** | Bajaste {{weight_lost_kg}}kg! |
| **Body** | Desde que empezaste has perdido {{weight_lost_kg}}kg. Tu constancia esta dando resultados |
| **Emoji** | down arrow + star |
| **Deep Link** | `fitsiai://progress` |
| **Timing** | Real-time (on weight log entry) |
| **Trigger** | Weight drops below a milestone (every 1kg for first 5kg, then every 2kg) |
| **Segment** | Users with goal="lose" who log weight |
| **Suppression** | Max once per milestone |

---

## Category 6: Weekly Summary (5 templates)

### WS-01: Great Week
| Field | Content |
|-------|---------|
| **Template ID** | `weekly_great` |
| **Title** | Tu semana en Fitsi AI |
| **Body** | Registraste {{days_logged}}/7 dias. Promedio: {{avg_calories}} kcal/dia. Excelente semana! |
| **Emoji** | star |
| **Deep Link** | `fitsiai://progress?tab=weekly` |
| **Timing** | Monday 09:00 local time |
| **Trigger** | Weekly, user logged 5-7 days last week |
| **Segment** | Highly engaged users |
| **Suppression** | None for this category |

### WS-02: Good Week
| Field | Content |
|-------|---------|
| **Template ID** | `weekly_good` |
| **Title** | Tu resumen semanal |
| **Body** | {{days_logged}}/7 dias registrados. Promedio: {{avg_calories}} kcal. Vamos por mas esta semana |
| **Emoji** | chart |
| **Deep Link** | `fitsiai://progress?tab=weekly` |
| **Timing** | Monday 09:00 local time |
| **Trigger** | Weekly, user logged 3-4 days last week |
| **Segment** | Moderate engagement users |
| **Suppression** | None |

### WS-03: Needs Improvement Week
| Field | Content |
|-------|---------|
| **Template ID** | `weekly_improve` |
| **Title** | Tu semana pasada |
| **Body** | Registraste {{days_logged}}/7 dias. No esta mal, pero esta semana puedes superarte. Empieza hoy |
| **Emoji** | muscle |
| **Deep Link** | `fitsiai://scan` |
| **Timing** | Monday 09:30 local time |
| **Trigger** | Weekly, user logged 1-2 days last week |
| **Segment** | Low engagement users (still active) |
| **Suppression** | Do not send if re-engagement push was sent in last 48h |

### WS-04: Macro Insight
| Field | Content |
|-------|---------|
| **Template ID** | `weekly_macro_insight` |
| **Title** | Dato de la semana |
| **Body** | Tu proteina promedio fue {{avg_protein}}g (meta: {{protein_target}}g). {{insight_text}} |
| **Emoji** | lightbulb |
| **Deep Link** | `fitsiai://progress?tab=weekly` |
| **Timing** | Wednesday 10:00 local time |
| **Trigger** | User has 4+ days of data in the last 7 days |
| **Segment** | Users with sufficient data |
| **Suppression** | Max once per week; alternate between protein, carbs, and fat insights |

**Insight text variants:**
- If below target: "Intenta agregar mas {{macro}} esta semana. Prueba con {{food_suggestion}}."
- If on target: "Vas perfecto con tu {{macro}}. Sigue asi!"
- If above target: "Estas un poco arriba en {{macro}}. Revisa tus cenas de la semana."

### WS-05: Monthly Wrap-Up
| Field | Content |
|-------|---------|
| **Template ID** | `weekly_monthly_wrap` |
| **Title** | Tu mes en Fitsi AI |
| **Body** | Mes {{month_number}}: {{total_meals}} comidas, {{days_logged}} dias, mejor racha: {{best_streak}}. Revisa tu progreso completo |
| **Emoji** | calendar |
| **Deep Link** | `fitsiai://progress?tab=monthly` |
| **Timing** | 1st of each month, 09:00 local time |
| **Trigger** | Monthly, user was active in the previous month |
| **Segment** | All active users |
| **Suppression** | None for monthly summaries |

---

## Category 7: Feature Discovery (5 templates)

### FD-01: Barcode Scanner
| Field | Content |
|-------|---------|
| **Template ID** | `feature_barcode` |
| **Title** | Sabias que puedes escanear codigos de barras? |
| **Body** | Alimentos empaquetados? Escanea el codigo de barras y obtiene los nutrientes al instante |
| **Emoji** | barcode |
| **Deep Link** | `fitsiai://scan?mode=barcode` |
| **Timing** | 12:00 local time |
| **Trigger** | User has 5+ AI scans but 0 barcode scans, Day 7+ since signup |
| **Segment** | Users who haven't tried barcode scanning |
| **Suppression** | Fire once per user ever |

### FD-02: AI Coach
| Field | Content |
|-------|---------|
| **Template ID** | `feature_coach` |
| **Title** | Preguntale a Fitsi lo que quieras |
| **Body** | Tu coach de nutricion IA puede responder dudas como "cuanta proteina necesito?" o "que ceno hoy?" |
| **Emoji** | speech bubble |
| **Deep Link** | `fitsiai://coach` |
| **Timing** | 18:00 local time |
| **Trigger** | User has 10+ meals logged but 0 coach messages, Day 10+ since signup |
| **Segment** | Users who haven't tried AI coach |
| **Suppression** | Fire once per user ever |

### FD-03: Water Tracking
| Field | Content |
|-------|---------|
| **Template ID** | `feature_water` |
| **Title** | Tambien puedes registrar tu agua |
| **Body** | Hidratarte bien es clave para tu metabolismo. Empieza a trackear tu agua hoy |
| **Emoji** | water drop |
| **Deep Link** | `fitsiai://log?section=water` |
| **Timing** | 10:00 local time |
| **Trigger** | User has 3+ meals logged but 0 water logs, Day 3+ since signup |
| **Segment** | Users who haven't tried water tracking |
| **Suppression** | Fire once per user ever |

### FD-04: Recipes
| Field | Content |
|-------|---------|
| **Template ID** | `feature_recipes` |
| **Title** | No sabes que cocinar? |
| **Body** | Fitsi sugiere recetas basadas en los macros que te faltan hoy. Prueba una esta noche |
| **Emoji** | cooking |
| **Deep Link** | `fitsiai://recipes` |
| **Timing** | 17:00 local time (before dinner planning) |
| **Trigger** | User has 14+ days active but 0 recipe views, premium user |
| **Segment** | Premium users who haven't explored recipes |
| **Suppression** | Fire once per user ever |

### FD-05: Weekly Report
| Field | Content |
|-------|---------|
| **Template ID** | `feature_report` |
| **Title** | Tu primer reporte semanal esta listo |
| **Body** | Despues de 7 dias ya tenemos suficientes datos para mostrarte patrones. Revisa tu reporte |
| **Emoji** | chart |
| **Deep Link** | `fitsiai://progress?tab=weekly` |
| **Timing** | Monday 09:00 local time (first Monday after 7 days of usage) |
| **Trigger** | User has 7+ days since signup AND has never viewed a weekly report |
| **Segment** | Users completing their first week |
| **Suppression** | Fire once per user ever; takes priority over WS-01/02/03 for first-timers |

---

## Template Selection Logic

When multiple templates are eligible for the same user at the same time, use this priority order:

```
1. Achievement celebrations (AC-*) — highest priority, rare and high-emotion
2. Streak at risk (ST-01 to ST-04) — time-sensitive, direct retention impact
3. Win-back (WB-*) — re-engagement takes priority for inactive users
4. Meal reminders (MR-*) — daily utility
5. Hydration (HY-*) — secondary tracking
6. Weekly/Monthly summary (WS-*) — informational
7. Feature discovery (FD-*) — lowest priority, educational
```

Never send two notifications from the same category in the same day (except milestone celebrations which are exempt from this rule).

---

## Localization Notes

All templates above are in Spanish (LATAM). English translations should follow the same template IDs with `_en` suffix.

**Translation priority:**
1. Meal reminders (MR-*) — highest daily volume
2. Streak motivation (ST-*) — retention critical
3. Win-back (WB-*) — re-engagement
4. Weekly summary (WS-*) — regular touchpoint
5. Achievements (AC-*) — celebrations
6. Hydration (HY-*) — secondary
7. Feature discovery (FD-*) — one-time

---

## A/B Testing Variants

For each high-volume template, maintain 2-3 copy variants for ongoing optimization:

| Template | Variant A (Control) | Variant B | Metric |
|----------|-------------------|-----------|--------|
| MR-04 (Lunch) | "No olvides registrar lo que comiste" | "Tu almuerzo de hoy vale la pena registrarlo" | Open rate |
| ST-02 (Streak Risk 4-9d) | "Tu racha de X dias esta en riesgo" | "X dias de esfuerzo. No los pierdas en 1 dia" | Scan within 1h |
| WB-02 (Day 3) | "Te extraniamos, {{first_name}}" | "{{first_name}}, tu plan sigue listo" | Return rate |
| WS-01 (Great Week) | "Registraste X/7 dias" | "Solo el 15% de usuarios registra como tu" | Open rate |

Rotate variants weekly. Ship the winner after 2 weeks of data.

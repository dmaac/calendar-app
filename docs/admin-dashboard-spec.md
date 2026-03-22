# Admin Dashboard Specification — Fitsi IA

> Spec tecnica para el dashboard de administracion web. Stack recomendado: Next.js + TailwindCSS + Recharts.

---

## 1. Overview

Dashboard web interno para que el equipo de Fitsi gestione usuarios, vea metricas, administre suscripciones y modere contenido.

**URL**: admin.fitsi.app (protegido con auth + 2FA)
**Acceso**: Solo equipo interno con roles definidos
**Stack**: Next.js 14 + TailwindCSS + shadcn/ui + Recharts
**API**: Consume el mismo backend FastAPI de Fitsi (/api/admin/*)

---

## 2. Navegacion Principal

```
+--------------------------------------------------+
|  FITSI ADMIN                    [avatar] [logout] |
+--------------------------------------------------+
|            |                                      |
|  Dashboard |   [Contenido principal]              |
|  Users     |                                      |
|  Revenue   |                                      |
|  Support   |                                      |
|  Content   |                                      |
|  Push      |                                      |
|  Settings  |                                      |
|            |                                      |
+--------------------------------------------------+
```

---

## 3. Seccion: Dashboard (Home)

### Wireframe
```
+--------------------------------------------------+
|  Dashboard                          [date picker] |
+--------------------------------------------------+
|                                                   |
|  [DAU: 1,234]  [MAU: 15.2K]  [Revenue: $12.4K]  |
|  [New Users: 89]  [Churn: 2.1%]  [ARPU: $8.20]  |
|                                                   |
|  +--- Usuarios Activos (30 dias) ---------------+ |
|  |  [Line chart: DAU over time]                  | |
|  +-----------------------------------------------+ |
|                                                   |
|  +--- Revenue (30 dias) ------------------------+ |
|  |  [Bar chart: daily revenue]                   | |
|  +-----------------------------------------------+ |
|                                                   |
|  +--- Conversion Funnel -------------------------+ |
|  |  Registro -> Onboarding -> Trial -> Premium   | |
|  |  [Funnel chart with % at each stage]          | |
|  +-----------------------------------------------+ |
|                                                   |
|  +--- Top Metrics Today ------------------------+ |
|  |  Scans: 3,421  |  Meals logged: 8,102        | |
|  |  Water logs: 2,890  |  New reviews: 12        | |
|  +-----------------------------------------------+ |
+--------------------------------------------------+
```

### Datos Requeridos (API)
- `GET /api/admin/metrics/overview` — DAU, MAU, revenue, churn, ARPU
- `GET /api/admin/metrics/timeseries?metric=dau&days=30`
- `GET /api/admin/metrics/funnel`

---

## 4. Seccion: Users

### Lista de Usuarios
```
+--------------------------------------------------+
|  Users (15,234 total)           [+ Export CSV]    |
+--------------------------------------------------+
|  [Search: email, name, ID]  [Filter: plan, status]|
+--------------------------------------------------+
|  Email           | Name    | Plan    | Last Active|
|  juan@mail.com   | Juan P. | Premium | 2h ago     |
|  maria@mail.com  | Maria L.| Free    | 3 days ago |
|  carlos@mail.com | Carlos  | Trial   | 1h ago     |
|  ...             | ...     | ...     | ...        |
+--------------------------------------------------+
|  [< Prev]  Page 1 of 152  [Next >]               |
+--------------------------------------------------+
```

### Perfil de Usuario (click en fila)
```
+--------------------------------------------------+
|  [< Back to Users]        User: juan@mail.com     |
+--------------------------------------------------+
|                                                   |
|  PROFILE                    SUBSCRIPTION          |
|  Name: Juan Perez           Plan: Premium Monthly |
|  Email: juan@mail.com       Status: Active        |
|  Registered: 2026-01-15     Since: 2026-02-01     |
|  Gender: Male               Revenue: $29.97       |
|  Goal: Lose weight          Next billing: Apr 1   |
|  Height: 178cm              |                     |
|  Weight: 82kg               ACTIONS               |
|  Target: 75kg               [Extend Trial]        |
|  Diet: Classic              [Gift Premium]        |
|                             [Refund]              |
|  ACTIVITY                   [Suspend Account]     |
|  Last active: 2h ago        [Delete Account]      |
|  Total scans: 234                                 |
|  Streak: 12 days            SUPPORT HISTORY       |
|  Meals logged: 1,456        Ticket #456 - Billing |
|  App version: 1.2.0         Ticket #123 - Bug     |
|  Device: iPhone 15                                |
|  OS: iOS 18.2                                     |
+--------------------------------------------------+
```

### API Endpoints
- `GET /api/admin/users?page=1&per_page=50&q=search&plan=premium`
- `GET /api/admin/users/:id`
- `POST /api/admin/users/:id/extend-trial` — body: `{ days: 7 }`
- `POST /api/admin/users/:id/gift-premium` — body: `{ months: 1 }`
- `POST /api/admin/users/:id/refund` — body: `{ transaction_id, reason }`
- `POST /api/admin/users/:id/suspend`
- `DELETE /api/admin/users/:id`

---

## 5. Seccion: Revenue

### Wireframe
```
+--------------------------------------------------+
|  Revenue                        [This month v]    |
+--------------------------------------------------+
|                                                   |
|  [MRR: $12,400]  [ARR: $148.8K]  [Avg LTV: $82] |
|                                                   |
|  +--- Revenue by Plan --------------------------+ |
|  |  Monthly: $8,200 (66%)                        | |
|  |  Yearly: $3,800 (31%)                         | |
|  |  Lifetime: $400 (3%)                          | |
|  |  [Pie chart]                                  | |
|  +-----------------------------------------------+ |
|                                                   |
|  +--- Daily Revenue ----------------------------+ |
|  |  [Bar chart: last 30 days]                    | |
|  +-----------------------------------------------+ |
|                                                   |
|  +--- Refunds ----------------------------------+ |
|  |  Date     | User       | Amount | Reason     | |
|  |  Mar 20   | juan@...   | $9.99  | Accidental | |
|  |  Mar 18   | maria@...  | $9.99  | Bug        | |
|  +-----------------------------------------------+ |
+--------------------------------------------------+
```

---

## 6. Seccion: Support

### Wireframe
```
+--------------------------------------------------+
|  Support Tickets            [Open: 12] [Resolved] |
+--------------------------------------------------+
|  [Search tickets]  [Filter: category, priority]   |
+--------------------------------------------------+
|  #ID  | User        | Category | Priority | Status|
|  #456 | juan@...    | Billing  | High     | Open  |
|  #455 | maria@...   | Bug      | Medium   | Open  |
|  #454 | carlos@...  | Account  | Low      | Done  |
+--------------------------------------------------+
|                                                   |
|  +--- Ticket Detail ----------------------------+ |
|  |  #456 — "Me cobraron dos veces"              | |
|  |  From: juan@mail.com | Priority: High        | |
|  |  Category: Billing | Created: Mar 22, 10:30  | |
|  |                                               | |
|  |  [User message]                               | |
|  |  [Agent reply input]                          | |
|  |  [Reply]  [Escalate to L3]  [Close ticket]   | |
|  +-----------------------------------------------+ |
+--------------------------------------------------+
```

### Metricas de Soporte (cards arriba)
- Tickets abiertos, CSAT promedio, FRT promedio, Resolution rate

---

## 7. Seccion: Push Notifications

### Wireframe
```
+--------------------------------------------------+
|  Push Notifications              [+ New Campaign] |
+--------------------------------------------------+
|                                                   |
|  +--- New Push Campaign ------------------------+ |
|  |  Title: [___________________________]         | |
|  |  Body:  [___________________________]         | |
|  |                                               | |
|  |  Audience:                                    | |
|  |  ( ) All users                                | |
|  |  ( ) Premium only                             | |
|  |  ( ) Free users only                          | |
|  |  ( ) Inactive > 7 days                        | |
|  |  ( ) Custom segment: [select]                 | |
|  |                                               | |
|  |  Schedule:                                    | |
|  |  ( ) Send now                                 | |
|  |  ( ) Schedule: [date picker] [time picker]    | |
|  |                                               | |
|  |  [Preview]  [Send / Schedule]                 | |
|  +-----------------------------------------------+ |
|                                                   |
|  +--- History -----------------------------------+ |
|  |  Date    | Title          | Sent  | Opened   | |
|  |  Mar 20  | "New recipes!" | 12.3K | 34%      | |
|  |  Mar 15  | "Your streak"  | 8.1K  | 42%      | |
|  +-----------------------------------------------+ |
+--------------------------------------------------+
```

---

## 8. Seccion: Content Moderation

### Wireframe
```
+--------------------------------------------------+
|  Content Moderation                               |
+--------------------------------------------------+
|  [Groups tab]  [Reviews tab]  [Reports tab]       |
+--------------------------------------------------+
|                                                   |
|  GROUPS                                           |
|  Name              | Members | Reports | Action   |
|  Weight Loss Club  | 1,200   | 0       | [View]   |
|  Spam Group        | 3       | 5       | [Delete] |
|                                                   |
|  REPORTED CONTENT                                 |
|  Type    | Content          | Reporter | Action   |
|  Message | "Buy cheap..."   | juan@... | [Delete] |
|  Group   | "Inappropriate"  | maria@.. | [Review] |
+--------------------------------------------------+
```

---

## 9. Seccion: Data Export

### Wireframe
```
+--------------------------------------------------+
|  Data Export                                       |
+--------------------------------------------------+
|                                                   |
|  Export Type:                                     |
|  ( ) Users list (CSV)                            |
|  ( ) Revenue report (CSV)                        |
|  ( ) Food logs (CSV, anonymized)                 |
|  ( ) Support tickets (CSV)                       |
|  ( ) Custom query                                |
|                                                   |
|  Filters:                                        |
|  Date range: [from] - [to]                       |
|  Plan: [all / free / premium]                    |
|  Status: [active / inactive / churned]           |
|                                                   |
|  [Generate Export]                                |
|                                                   |
|  Recent Exports:                                 |
|  users_2026-03-22.csv   | 15,234 rows | [Download]|
|  revenue_2026-03.csv    | 31 rows     | [Download]|
+--------------------------------------------------+
```

---

## 10. Auth y Seguridad

### Roles
| Rol | Permisos |
|-----|----------|
| **Super Admin** | Todo, incluyendo user deletion y settings |
| **Admin** | Todo excepto settings y user deletion |
| **Support** | Users (read), Support tickets (read/write) |
| **Analyst** | Dashboard (read), Export (read), Users (read) |
| **Marketing** | Push notifications, Dashboard (read) |

### Seguridad
- Login con email + password + 2FA obligatorio
- Session timeout: 4 horas
- Audit log de todas las acciones admin
- IP whitelist opcional
- Rate limiting en API admin endpoints

---

## 11. Implementacion por Fases

### Fase 1 — MVP (2 semanas)
- [ ] Auth con roles basicos
- [ ] Dashboard con metricas principales
- [ ] Users: lista, busqueda, perfil basico

### Fase 2 — Operaciones (2 semanas)
- [ ] Revenue: graficos, refunds
- [ ] Support: tickets basicos
- [ ] Users: acciones (extend trial, gift premium)

### Fase 3 — Growth (2 semanas)
- [ ] Push notifications
- [ ] Content moderation
- [ ] Data export

### Fase 4 — Scale (ongoing)
- [ ] Custom segments
- [ ] A/B test management
- [ ] Advanced analytics (cohort, retention curves)

---

*Documento creado: 2026-03-22*
*Responsable: Ironside Head de Producto + Gerente de Operaciones*

# Fitsi IA — Audit Framework

> Authoritative reference for the full-stack audit of Fitsi IA.
> All auditors across all 8 fronts MUST use this document as their source of truth for objectives, scoring, constraints, and checklists.

---

## 1. Audit Objectives

| # | Objective | Success Criteria |
|---|-----------|-----------------|
| O1 | **Bug Discovery** | Identify every bug that prevents normal app usage — crashes, broken flows, data loss, dead-end screens |
| O2 | **Code Quality** | Surface critical code smells, duplicated logic, unmaintained abstractions, and tech debt that slows development |
| O3 | **Security Posture** | Confirm the app is safe for App Store submission — no leaked secrets, no injection vectors, no insecure storage |
| O4 | **Performance** | Measure real-device performance — startup time, screen transitions, API latency, memory usage, bundle size |
| O5 | **App Store Compliance** | Verify the app meets Apple App Store Review Guidelines and Google Play policies (privacy, IAP, content) |
| O6 | **Architecture Health** | Evaluate whether the codebase can scale to 500K users and support a team of 3-5 developers |
| O7 | **Data Integrity** | Confirm that user data flows correctly end-to-end: onboarding -> DB -> API -> UI, with no silent data loss |
| O8 | **Ship Readiness** | Determine the minimum set of fixes required before a v1.0 public release |

---

## 2. Impact Scoring

Every finding MUST be tagged with exactly one priority level.

| Priority | Label | Definition | SLA |
|----------|-------|------------|-----|
| **P0** | BLOCKER | App crashes, data loss, or complete feature failure. User cannot proceed. | Fix before ANY testing continues |
| **P1** | CRITICAL | A principal feature is broken but the app does not crash. User can work around it with effort. | Fix before release |
| **P2** | HIGH | Degraded UX, poor performance (>3s latency, >300MB RAM), security gap that does not leak data immediately. | Fix before release (can be last) |
| **P3** | MEDIUM | Code smell, inconsistency, minor UX friction, missing edge-case handling. | Schedule for v1.1 |
| **P4** | LOW | Polish, documentation gaps, nice-to-have improvements, minor style inconsistencies. | Backlog |

### Scoring Tiebreakers

When in doubt between two levels:
- If it affects **paying users** or **revenue flow** (paywall, subscription, IAP), escalate one level.
- If it affects **onboarding completion rate**, escalate one level.
- If it only affects **developer experience** (not end users), keep or demote one level.

---

## 3. Constraints

These constraints are NON-NEGOTIABLE. Any proposed fix that violates them must be flagged and escalated.

| # | Constraint | Rationale |
|---|-----------|-----------|
| C1 | **Do not change the color palette** — accent `#4285F4`, dark-mode accent `#5B9CF6`, and all colors defined in `mobile/src/theme/index.ts` | Brand identity is locked |
| C2 | **Do not break existing functionality** — every fix must be verified against the current working state | Regression is worse than the original bug |
| C3 | **Do not add heavy dependencies** — no new native modules that break Expo Go, no packages >500KB gzipped without Tech Lead approval | Maintain fast dev cycle and small bundle |
| C4 | **Maintain Expo Go compatibility** for development builds | Dev team uses Expo Go on physical devices for rapid iteration |
| C5 | **Do not modify database schemas without migration** — all DB changes go through Alembic | Data integrity in staging/production |
| C6 | **Do not remove the Fitsi mascot** or reduce its integration | Product decision, not negotiable |
| C7 | **Keep the 30-step onboarding flow** — steps can be fixed/polished but not removed or reordered | Conversion funnel is designed intentionally |
| C8 | **RevenueCat is the IAP layer** — do not replace or bypass it | Already integrated, contracts in place |

---

## 4. Dependencies Between Fronts

```
                    ┌──────────────┐
                    │  1. FRONTEND  │
                    └──────┬───────┘
                           │ depends on API contracts
                    ┌──────▼───────┐
                    │  2. BACKEND   │
                    └──────┬───────┘
                           │ depends on DB schema
                    ┌──────▼───────┐
                    │  3. DATABASE  │
                    └──────────────┘

  ┌──────────────┐
  │   4. AI/ML    │──── depends on API keys configured + backend endpoints
  └──────────────┘

  ┌──────────────┐
  │ 5. SECURITY   │──── runs in parallel, blocks release if P0/P1 found
  └──────────────┘

  ┌──────────────┐
  │ 6. PERFORMANCE│──── depends on frontend + backend being stable
  └──────────────┘

  ┌──────────────┐
  │   7. QA/E2E   │──── depends on all other fronts being at least P2-clean
  └──────────────┘

  ┌──────────────┐
  │  8. RELEASE   │──── depends on security clean + QA pass + compliance
  └──────────────┘
```

### Execution Order

1. **Phase 1 (parallel)**: Frontend, Backend, Database, AI/ML, Security — all can start simultaneously
2. **Phase 2 (after Phase 1 fixes)**: Performance, QA/E2E
3. **Phase 3 (after Phase 2)**: Release readiness

### Blocking Rules

- Security P0/P1 findings **block release** regardless of other fronts.
- Backend API contract changes **require frontend re-audit** of affected screens.
- Database schema changes **require backend re-audit** of affected endpoints.

---

## 5. Audit Checklists by Front

### Front 1: FRONTEND (Mobile — React Native / Expo)

| # | Question | Expected Evidence |
|---|----------|-------------------|
| F1 | Does `npx tsc --noEmit` pass with zero errors? | Clean compiler output |
| F2 | Does the app launch on iOS simulator without crashes? | Successful boot to home screen |
| F3 | Does the app launch on Android emulator without crashes? | Successful boot to home screen |
| F4 | Can a new user complete the full 30-step onboarding without getting stuck? | Screen recording or step-by-step log |
| F5 | Do all 5 bottom tabs render correctly and navigate without errors? | Tab-by-tab screenshot |
| F6 | Does the food scan camera flow work end-to-end (capture -> AI -> result -> log)? | Logged meal with macros |
| F7 | Are there any hardcoded strings that should be i18n keys? | Grep results |
| F8 | Are there unused imports, dead code, or unreachable screens? | Static analysis output |
| F9 | Does dark mode render correctly on all main screens (no white flashes, readable text)? | Dark mode screenshots |
| F10 | Are all navigation routes registered and reachable (no orphan screens)? | Navigation tree dump |

### Front 2: BACKEND (FastAPI / Python)

| # | Question | Expected Evidence |
|---|----------|-------------------|
| B1 | Does the server start without errors (`uvicorn app.main:app`)? | Startup log |
| B2 | Do all endpoints in `/docs` (Swagger) return valid responses for happy-path inputs? | Swagger test results |
| B3 | Does user registration + login flow work (email, Apple, Google)? | Auth token returned |
| B4 | Does `POST /api/food/scan` accept an image and return structured macros? | JSON response with calories, protein, carbs, fats |
| B5 | Are all database queries using parameterized inputs (no SQL injection)? | Code review evidence |
| B6 | Does the onboarding profile save and retrieve correctly for all 30 fields? | Round-trip test |
| B7 | Are error responses consistent (standard error schema, proper HTTP codes)? | Error response samples |
| B8 | Is there rate limiting on auth endpoints and AI scan? | Rate limit test results |
| B9 | Are all environment variables documented and validated at startup? | `.env.example` + startup validation code |
| B10 | Do Alembic migrations run cleanly from scratch (`alembic upgrade head`)? | Migration log |

### Front 3: DATABASE (PostgreSQL / Alembic)

| # | Question | Expected Evidence |
|---|----------|-------------------|
| D1 | Does `alembic upgrade head` run without errors on a fresh database? | Migration log |
| D2 | Are all foreign keys properly defined with ON DELETE behavior? | Schema dump |
| D3 | Are there indexes on all columns used in WHERE clauses and JOINs? | Index list vs query patterns |
| D4 | Is `daily_summaries` being populated correctly (no stale/missing data)? | Query results |
| D5 | Are there any tables defined in models but missing migrations? | Model vs migration diff |
| D6 | Is `ai_scan_cache` being used effectively (hit rate > 0 for duplicate images)? | Cache hit stats |
| D7 | Are UUID primary keys used consistently across all tables? | Schema review |
| D8 | Is there a backup/restore strategy documented? | Documentation or script |

### Front 4: AI/ML (GPT-4o Vision + Claude Vision)

| # | Question | Expected Evidence |
|---|----------|-------------------|
| A1 | Are AI API keys configured and valid (not expired, not rate-limited)? | Successful API call |
| A2 | Does the AI correctly identify at least 8/10 common foods from photos? | Test matrix with results |
| A3 | Is there a fallback when the primary AI provider fails (timeout, 500, rate limit)? | Error handling code review |
| A4 | Are AI responses validated before being stored (no garbage data in food_logs)? | Validation logic review |
| A5 | Is the AI scan cache working (same image hash returns cached result)? | Cache hit test |
| A6 | Are API costs being tracked/logged per request? | Cost logging code |
| A7 | Is the AI prompt engineered to return structured JSON (not free text)? | Prompt review |
| A8 | What is the average latency for an AI scan request? Target: <5 seconds. | Latency measurements |

### Front 5: SECURITY

| # | Question | Expected Evidence |
|---|----------|-------------------|
| S1 | Are there any secrets (API keys, passwords, tokens) committed in the repo? | `git log` + grep for patterns |
| S2 | Is the JWT implementation secure (proper signing, expiration, refresh flow)? | Token analysis |
| S3 | Are all API endpoints that should require auth actually protected? | Unauthenticated request test per endpoint |
| S4 | Is user input sanitized before database queries AND before rendering? | Code review of input paths |
| S5 | Is HTTPS enforced for all API communication? | Network traffic inspection |
| S6 | Are passwords hashed with bcrypt/argon2 (not MD5/SHA1)? | Password storage code review |
| S7 | Is AsyncStorage/SecureStore used appropriately (no tokens in AsyncStorage)? | Storage usage audit |
| S8 | Is there a Content Security Policy for the web build? | CSP header check |
| S9 | Are third-party dependencies free of known vulnerabilities? | `npm audit` + `pip audit` results |
| S10 | Is the dev bypass (`DevBypass`) disabled in production builds? | Build config review |

### Front 6: PERFORMANCE

| # | Question | Expected Evidence |
|---|----------|-------------------|
| P1 | What is the app startup time (cold start) on a mid-range device? Target: <3s. | Timed measurement |
| P2 | What is the JS bundle size? Target: <5MB. | `npx expo export` output |
| P3 | Are large lists using FlatList with proper optimization props (not ScrollView)? | Code review |
| P4 | Are images optimized (compressed, proper dimensions, cached)? | Image audit |
| P5 | Is there excessive re-rendering on main screens? (React DevTools Profiler) | Profiler output |
| P6 | What is the API p95 latency for the 5 most-hit endpoints? Target: <500ms. | Load test results |
| P7 | Is the app memory usage stable over 10 minutes of usage? Target: <250MB. | Memory profile |
| P8 | Are expensive computations memoized (useMemo, useCallback, React.memo)? | Code review of hot paths |
| P9 | Is there lazy loading for non-initial screens? | Navigation config review |
| P10 | Are network requests deduplicated (no double-fetching on mount)? | Network log review |

### Front 7: QA / END-TO-END

| # | Question | Expected Evidence |
|---|----------|-------------------|
| Q1 | Can a brand-new user go from app launch -> onboarding -> home screen -> scan food -> see logged meal? | Full flow recording |
| Q2 | Can a returning user log in and see their historical data? | Login + data display test |
| Q3 | Does the paywall flow work (display plans, initiate purchase via RevenueCat)? | Paywall flow test |
| Q4 | Does the app handle network loss gracefully (offline mode, retry, error messages)? | Airplane mode test |
| Q5 | Does the app handle permission denials gracefully (camera, notifications, health)? | Permission denial test |
| Q6 | Are there any screens that show a blank/loading state forever? | Screen-by-screen check |
| Q7 | Does the water tracking feature save and display correctly? | Water log test |
| Q8 | Does the weight tracking chart update when new data is added? | Weight entry test |
| Q9 | Do push notifications arrive correctly (if configured)? | Notification test |
| Q10 | Does the app recover cleanly from a force-kill and relaunch? | Kill + relaunch test |

### Front 8: RELEASE READINESS

| # | Question | Expected Evidence |
|---|----------|-------------------|
| R1 | Is `app.json` / `eas.json` configured correctly (bundle ID, version, build number)? | Config review |
| R2 | Is the App Store listing content ready (screenshots, description, keywords)? | Listing draft |
| R3 | Does the app comply with Apple's App Review Guidelines Section 3 (IAP rules)? | IAP flow review |
| R4 | Is a Privacy Policy URL configured and accessible? | URL check |
| R5 | Is App Tracking Transparency (ATT) handled correctly? | ATT prompt test |
| R6 | Are all required app icons and splash screens provided at correct resolutions? | Asset audit |
| R7 | Is the app signed correctly for TestFlight distribution? | EAS build test |
| R8 | Is there a rollback plan if the first release has critical bugs? | Documented plan |
| R9 | Are analytics events firing correctly for key conversion events? | Analytics event log |
| R10 | Is the Terms of Service URL configured and accessible? | URL check |

---

## 6. Finding Report Format

Every finding MUST use this format:

```markdown
### [FRONT-ID] Finding Title

- **Priority**: P0 / P1 / P2 / P3 / P4
- **Front**: Frontend / Backend / Database / AI / Security / Performance / QA / Release
- **File(s)**: exact file path(s) and line numbers
- **Description**: What is wrong and why it matters
- **Reproduction**: Steps to reproduce (if applicable)
- **Suggested Fix**: Concrete fix with code snippet or approach
- **Effort Estimate**: S (< 1h) / M (1-4h) / L (4-8h) / XL (> 8h)
```

---

## 7. Audit Deliverables

Each front produces:

1. **Findings list** — all issues found, scored and formatted per Section 6
2. **Summary stats** — count of P0/P1/P2/P3/P4 findings
3. **Top 3 risks** — the three most impactful issues from this front
4. **Recommended fix order** — prioritized list of fixes

The Tech Lead consolidates all 8 fronts into a final **AUDIT-REPORT.md** with:
- Executive summary (ship/no-ship recommendation)
- Cross-front dependency graph of fixes
- Sprint plan for remediation (P0 first, then P1, etc.)

---

*Document version: 1.0*
*Created: 2026-03-22*
*Owner: Tech Lead*

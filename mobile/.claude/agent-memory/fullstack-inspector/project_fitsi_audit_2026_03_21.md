---
name: Fitsi IA Full Stack Audit 2026-03-21
description: Full-stack inspection results — 3 critical blockers (missing .env, EAS placeholder, empty OpenAI key), 26 total issues. API contract verified, all 27 endpoints match. Architecture is solid.
type: project
---

Full-stack audit completed on 2026-03-21, branch `production`.

**Verdict:** NEEDS FIXES BEFORE LAUNCH (configuration issues, not code defects).

**Why:** Three critical blockers are all configuration — missing mobile .env file, placeholder EAS project ID, empty OpenAI API key. Code quality and API alignment are strong.

**How to apply:** Before any production deployment, verify the three criticals are resolved. The subscription verification gap (no path from pending_verification to active on backend) is the biggest code-level risk for payment flow.

Key findings:
- All 27 frontend API calls have matching backend endpoints with correct types.
- Auth flow (JWT + rolling refresh + SecureStore) is production-grade.
- `datetime.utcnow` used in all 11 model files — deprecated since Python 3.12.
- `react-native-purchases` blocks Expo Go testing of paywall screens.
- Two overlapping daily summary endpoints with different field naming conventions.
- No receipt verification endpoint/task — subscriptions stuck at pending_verification.
- devBypass() in AuthContext has no __DEV__ guard.

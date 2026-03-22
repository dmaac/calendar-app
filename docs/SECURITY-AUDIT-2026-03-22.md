# Fitsi IA Security Audit Report
**Date:** 2026-03-22
**Auditor:** security-engineer
**Scope:** Full-stack security audit (backend + mobile) for App Store submission

---

## Executive Summary

The Fitsi IA codebase has a **solid security foundation** with several mature controls already in place. The backend demonstrates good security engineering with JWT type-checking, refresh token rotation, brute-force protection, CORS validation in production, security headers middleware, HTTPS redirection, rate limiting, and proper password hashing (PBKDF2-SHA256 with 600k rounds). The mobile app correctly stores tokens in SecureStore (Keychain/EncryptedSharedPreferences).

However, there are **2 CRITICAL** and **3 HIGH** findings that must be resolved before production/App Store submission, plus several MEDIUM and LOW findings for post-launch hardening.

---

## Findings

### P0 — CRITICAL (Fix before deployment)

#### P0-1: Anthropic API Key Exposed in Local .env
- **File:** `backend/.env:26`
- **Detail:** Live Anthropic API key (`sk-ant-api03-R3PVg1R...`) is present in the local `.env`. While `.env` is correctly in `.gitignore` and NOT tracked by git, this key pattern was found only in this file. If the repo is ever cloned/shared, or `.env` is accidentally committed, it would expose billing access.
- **Risk:** Financial (unauthorized AI API usage), data exfiltration via Claude API
- **Status:** NOT in git history (verified). Low immediate risk but hygiene concern.
- **Recommendation:** Rotate the key via Anthropic dashboard. Use a secrets manager (Vault, AWS Secrets Manager, Doppler) for production. Consider using a restricted API key with spend limits.

#### P0-2: Supabase Service Role Key in Local .env
- **File:** `backend/.env:33`
- **Detail:** Supabase service role JWT (`eyJhbGciOiJI...`) is in `.env`. This key bypasses Row Level Security and grants FULL database access. If leaked, an attacker can read/modify/delete all data.
- **Risk:** Complete database compromise, health data exposure (HIPAA/GDPR breach)
- **Status:** NOT in git history (verified). Low immediate risk but catastrophic if leaked.
- **Recommendation:** Rotate immediately. Never store service keys locally — use environment injection at deploy time. The anon key (also in `.env`) is lower risk since it respects RLS.

---

### P1 — HIGH (Fix before App Store submission)

#### P1-1: Health Data Not Encrypted at Rest (Column-Level)
- **Files:** `backend/app/models/*.py`
- **Detail:** Sensitive health data (weight_kg, height_cm, calories, food logs, nutrition profiles) is stored as plain-text columns in PostgreSQL. No column-level encryption (pgcrypto, SQLAlchemy EncryptedType) is used.
- **Risk:** If the database is compromised (SQL injection, backup theft, insider threat), all health data is immediately readable. Apple App Store requires privacy protections for health data.
- **OWASP:** M2 (Insecure Data Storage), A02:2021 (Cryptographic Failures)
- **Recommendation:** For App Store launch, rely on PostgreSQL's Transparent Data Encryption (TDE) or Supabase's at-rest encryption (which is enabled by default on Supabase managed instances). Document this in your App Store privacy manifest. Column-level encryption can be added post-launch for highest-sensitivity fields (weight, medical conditions).

#### P1-2: No Certificate Pinning in Mobile App
- **Files:** `mobile/src/services/apiClient.ts`, `mobile/src/services/auth.service.ts`
- **Detail:** No SSL/TLS certificate pinning is configured. The app relies on system trust store, which can be bypassed by installing a custom CA (e.g., Charles Proxy, mitmproxy).
- **Risk:** Man-in-the-middle attacks on Wi-Fi can intercept auth tokens and health data. App Store reviewers may flag this for health apps.
- **OWASP:** M3 (Insecure Communication)
- **Recommendation:** Implement certificate pinning using `react-native-ssl-pinning` or configure it in the Expo config plugin. Pin to the leaf certificate or intermediate CA for your API domain.

#### P1-3: No Jailbreak/Root Detection
- **Files:** None found (searched for jailbreak/root detection code)
- **Detail:** No jailbreak (iOS) or root (Android) detection is implemented. On compromised devices, attackers can dump Keychain/Keystore, intercept API calls, and bypass security controls.
- **Risk:** Token theft on compromised devices, health data exposure
- **OWASP:** M8 (Code Tampering), M9 (Reverse Engineering)
- **Recommendation:** Add `jail-monkey` or `expo-device` checks. Display a warning on jailbroken/rooted devices. Consider refusing to store tokens on compromised devices.

---

### P2 — MEDIUM (Fix in next sprint)

#### P2-1: Docker Compose Default Database Credentials
- **File:** `docker-compose.yml:25-27`
- **Detail:** Default credentials (`fitsiai` / `fitsiai_secret`) are hardcoded as fallbacks. While the prod compose overrides these with env vars, the defaults could be used accidentally.
- **Recommendation:** Remove default values — require explicit env vars (`${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}`).

#### P2-2: CORS Wildcard in Development (No Production Validation Pre-deploy)
- **File:** `backend/app/core/config.py:62`
- **Detail:** Default `cors_origins` is `["*"]`. While there's a validator that blocks wildcard in production, the check depends on `ENV=production` being set. If someone deploys without setting `ENV`, CORS is wide open.
- **Recommendation:** Change default to empty list `[]` and require explicit configuration.

#### P2-3: AI Coach Prompt Injection Surface
- **File:** `backend/app/services/ai_coach_service.py:419`
- **Detail:** User messages are passed directly to the LLM. While the system prompt is server-controlled and user messages are sent as the `user` role (not injected into the system prompt), there's no input sanitization. A user could attempt prompt injection to extract system prompt details or generate harmful content.
- **Recommendation:** Add a content filter on user input (reject messages with known injection patterns). Consider adding output validation before returning AI responses to the client.

#### P2-4: Account Deletion is Soft-Delete Only
- **File:** `backend/app/routers/auth.py:335-354`
- **Detail:** Account deletion (`DELETE /auth/me`) deactivates and scrubs PII but does not delete food logs, nutrition profiles, or other health data. GDPR Article 17 requires complete erasure upon request.
- **Recommendation:** Add a background job that purges all user-related data after the 30-day retention period mentioned in the code comment. Document the retention period in the privacy policy.

#### P2-5: Redis Unavailability Degrades Security
- **Files:** `backend/app/routers/auth.py`, `backend/app/core/security.py`
- **Detail:** When Redis is unavailable, token blacklisting, login lockout, and refresh token rotation all degrade to "allow through". An attacker could exploit this window to reuse revoked tokens.
- **Recommendation:** Add monitoring/alerting for Redis unavailability. Consider a circuit breaker that blocks auth operations entirely when Redis is down, rather than silently degrading.

#### P2-6: Rate Limiting Disabled in Development/Test
- **File:** `backend/app/routers/auth.py:21-31`
- **Detail:** Rate limiting is disabled when `ENV` is `development` or `testing`. If the app is accidentally deployed with `ENV=development`, brute-force and enumeration protections are disabled.
- **Recommendation:** Tie rate limiting to a dedicated feature flag rather than the environment variable.

#### P2-7: Password Policy Missing Special Character + Breach Check
- **File:** `backend/app/core/security.py:29-49`
- **Detail:** Password policy requires 8+ chars, upper, lower, digit — but no special character and no check against breached password lists (HaveIBeenPwned).
- **Recommendation:** Add HaveIBeenPwned k-anonymity check for production. Consider minimum 10 characters for a health app handling sensitive data.

---

### P3 — LOW (Post-launch backlog)

#### P3-1: Dev Bypass with Hardcoded Credentials
- **File:** `mobile/src/context/AuthContext.tsx:256`
- **Detail:** Dev bypass creates a user with `dev@fitsiai.com` / `DevPass1234`. This is guarded by `__DEV__` (stripped in production builds), so it's safe — but should be verified in the release build.
- **Recommendation:** Verify `__DEV__` is false in the production `.ipa`/`.apk`. Consider removing the dev bypass entirely before App Store submission.

#### P3-2: Error Details Exposed in Non-Production
- **Files:** Various routers
- **Detail:** Some error handlers return `str(e)` which could leak internal details (stack traces, file paths) in development mode. In production, the security headers middleware and error handling appear adequate.
- **Recommendation:** Ensure all error handlers in production return generic messages.

#### P3-3: OpenAPI/Docs Exposed in Development
- **File:** `backend/app/main.py:425-448`
- **Detail:** OpenAPI spec and Swagger UI are correctly disabled in production (`docs_url=None`). This is already implemented correctly.
- **Status:** RESOLVED (good implementation)

#### P3-4: Missing Content-Length Limits on File Upload
- **File:** `backend/app/routers/ai_food.py` (food scan endpoint)
- **Detail:** The RequestValidationMiddleware exists but should verify maximum file upload size for image scanning endpoints to prevent resource exhaustion.
- **Recommendation:** Verify the middleware enforces a reasonable limit (e.g., 10MB) for image uploads.

---

## Positive Security Controls (Already Implemented)

| Control | Status | Location |
|---------|--------|----------|
| JWT with type distinction (access/refresh) | GOOD | `security.py:70,123` |
| Token blacklisting (JTI-based) | GOOD | `security.py:94-110` |
| Refresh token rotation (rolling) | GOOD | `auth.py:233-241` |
| Revoked token reuse detection | GOOD | `auth.py:223-231` |
| Brute-force protection (5 attempts, 15min lockout) | GOOD | `auth.py:130-160` |
| Rate limiting (slowapi) on auth endpoints | GOOD | `auth.py:81,118,206` |
| Password hashing (PBKDF2-SHA256, 600k rounds) | GOOD | `security.py:15-18` |
| Password strength validation | GOOD | `security.py:29-49` |
| Secret key minimum length validation (32 chars) | GOOD | `config.py:77-101` |
| CORS wildcard blocked in production | GOOD | `config.py:104-112` |
| Security headers (XSS, HSTS, CSP, etc.) | GOOD | `main.py:194-212` |
| HTTPS redirect in production | GOOD | `main.py:217-239` |
| API docs disabled in production | GOOD | `main.py:426-448` |
| App version enforcement (426) | GOOD | `main.py:244-273` |
| Tokens in SecureStore (not AsyncStorage) | GOOD | `auth.service.ts:7-33` |
| Generic login error (no user enumeration) | GOOD | `auth.py:163-167` |
| GDPR account deletion endpoint | GOOD | `auth.py:335-354` |
| GDPR data export endpoint | GOOD | `export.py:192-434` |
| SQL injection prevention (parameterized queries) | GOOD | All queries use SQLModel/parameterized |
| Admin endpoints require is_admin flag | GOOD | `admin.py:78-85` |
| IDOR prevention (all queries filter by current_user.id) | GOOD | All data endpoints |
| Docker prod: read-only fs, no-new-privileges, cap_drop ALL | GOOD | `docker-compose.prod.yml` |
| Request correlation IDs (X-Request-ID) | GOOD | `main.py:177-189` |
| Structured request logging | GOOD | `main.py:278-333` |
| Graceful shutdown with in-flight request draining | GOOD | `main.py:338-356` |

---

## OWASP Mobile Top 10 Mapping

| # | Vulnerability | Status | Finding |
|---|---------------|--------|---------|
| M1 | Improper Platform Usage | LOW | Dev bypass guarded by `__DEV__` |
| M2 | Insecure Data Storage | MEDIUM | Health data not encrypted at column-level (P1-1) |
| M3 | Insecure Communication | HIGH | No certificate pinning (P1-2) |
| M4 | Insecure Authentication | LOW | Strong JWT implementation, rotation, blacklisting |
| M5 | Insufficient Cryptography | LOW | Good key lengths, PBKDF2 with 600k rounds |
| M6 | Insecure Authorization | LOW | All endpoints filter by authenticated user |
| M7 | Client Code Quality | LOW | TypeScript + strict mode |
| M8 | Code Tampering | MEDIUM | No jailbreak/root detection (P1-3) |
| M9 | Reverse Engineering | MEDIUM | No obfuscation (acceptable for RN) |
| M10 | Extraneous Functionality | LOW | Dev bypass guarded, docs disabled in prod |

## OWASP API Security Top 10 Mapping

| # | Vulnerability | Status | Finding |
|---|---------------|--------|---------|
| API1 | Broken Object Level Authorization | PASS | All queries scoped to current_user.id |
| API2 | Broken Authentication | PASS | Rate limited, lockout, token rotation |
| API3 | Broken Object Property Level Authorization | PASS | Response models limit exposed fields |
| API4 | Unrestricted Resource Consumption | LOW | Rate limiting + request validation middleware |
| API5 | Broken Function Level Authorization | PASS | Admin endpoints require is_admin flag |
| API6 | Unrestricted Access to Sensitive Business Flows | LOW | Registration rate limited (5/min) |
| API7 | Server Side Request Forgery | N/A | No server-side URL fetching from user input (webhooks validate HTTPS in prod) |
| API8 | Security Misconfiguration | MEDIUM | Default DB creds in compose, CORS default |
| API9 | Improper Inventory Management | LOW | Docs disabled in prod, versioning middleware |
| API10 | Unsafe Consumption of APIs | LOW | AI responses not sanitized before client render |

---

## Action Items Summary

| Priority | Finding | Action | Effort |
|----------|---------|--------|--------|
| **P0** | API keys in .env | Rotate Anthropic + Supabase keys, use secrets manager | 1h |
| **P1** | Health data encryption | Document Supabase at-rest encryption in privacy manifest | 2h |
| **P1** | No cert pinning | Add react-native-ssl-pinning | 4h |
| **P1** | No root/jailbreak detection | Add jail-monkey or equivalent | 2h |
| **P2** | Docker default creds | Remove defaults, require explicit env | 30min |
| **P2** | CORS default wildcard | Change default to empty list | 15min |
| **P2** | Prompt injection | Add input filter for coach messages | 2h |
| **P2** | Soft-delete only | Add background purge job for GDPR compliance | 4h |
| **P2** | Redis degradation | Add alerting + consider hard-fail mode | 2h |

---

*Report generated: 2026-03-22 by security-engineer*
*Next audit recommended: Before production launch and after each major feature release*

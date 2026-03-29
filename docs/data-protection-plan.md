# Fitsi IA — Data Protection Plan

> **Version:** 1.0
> **Last Updated:** 2026-03-22
> **Owner:** Security Engineer
> **Classification:** INTERNAL — CONFIDENTIAL
> **Review Cadence:** Quarterly (next review: 2026-06-22)

---

## Table of Contents

1. [Data Classification](#1-data-classification)
2. [Encryption — At Rest and In Transit](#2-encryption--at-rest-and-in-transit)
3. [Access Control Matrix](#3-access-control-matrix)
4. [Audit Logging](#4-audit-logging)
5. [Data Retention Schedule](#5-data-retention-schedule)
6. [Breach Response Plan](#6-breach-response-plan)
7. [GDPR Compliance Checklist](#7-gdpr-compliance-checklist)
8. [CCPA Compliance Checklist](#8-ccpa-compliance-checklist)
9. [Data Processing Agreement (DPA) Template](#9-data-processing-agreement-dpa-template)

---

## 1. Data Classification

All data collected and processed by Fitsi IA is classified into four tiers based on sensitivity and regulatory impact.

### Tier 1 — CRITICAL (Health-Related PII / PHI-Adjacent)

These fields describe a user's physical body, health conditions, and dietary behavior. While Fitsi is not a covered entity under HIPAA (no healthcare provider relationship), this data is treated with PHI-equivalent protections because it can reveal health conditions.

| Data Field | Table | Why Critical |
|---|---|---|
| `height_cm` | `onboarding_profile` | Body measurement — reveals physical characteristics |
| `weight_kg` | `onboarding_profile` | Body measurement — health indicator |
| `target_weight_kg` | `onboarding_profile` | Reveals health goals (weight loss/gain) |
| `birth_date` | `onboarding_profile` | Age + body data = health profile |
| `gender` | `onboarding_profile`, `nutrition_profile` | Protected characteristic + health context |
| `goal` (lose/maintain/gain) | `onboarding_profile` | Health objective |
| `diet_type` | `onboarding_profile` | May reveal medical conditions (celiac, diabetes) |
| `pain_points` | `onboarding_profile` | Self-reported health struggles |
| `health_connected` | `onboarding_profile` | Reveals Apple Health / Google Fit usage |
| `daily_calories`, macro targets | `onboarding_profile` | Medical-grade nutrition plan |
| `health_score` | `onboarding_profile` | Algorithmic health assessment |
| Food scan images | S3/R2 (via `image_url`) | Photos of what a person eats — dietary behavior |
| `food_name`, macros, `meal_type` | `ai_food_log` | Detailed dietary intake record |
| `ai_raw_response` | `ai_food_log` | Raw AI analysis of food — may contain health inferences |

**Controls Required:**
- Encryption at rest (AES-256 or database-level TDE)
- Field-level access restrictions (no bulk export without DPO approval)
- Minimum 2FA for any admin accessing raw data
- Data anonymization before use in analytics
- Right to erasure within 30 days of request

### Tier 2 — HIGH (Personally Identifiable Information)

Standard PII that can identify a person.

| Data Field | Table | Notes |
|---|---|---|
| `email` | `user` | Primary identifier, used for login |
| `first_name`, `last_name` | `user` | Direct identifiers |
| `hashed_password` | `user` | PBKDF2-SHA256 (600k rounds) — cannot be reversed, but breach = credential stuffing risk |
| `provider_id` | `user` | Apple/Google OAuth identifier — links to external identity |
| Push notification token | `push_token` | Device-specific, can be correlated to identity |
| IP address | Request logs | Logged on failed login attempts — geolocation risk |
| `referral_code` | `onboarding_profile` | Can link two users together |

**Controls Required:**
- Encryption at rest
- Access restricted to backend services and authorized admins
- Scrubbed on account deletion (GDPR Art. 17)
- Never exposed in API responses beyond the owning user
- Never logged in plaintext (passwords, tokens)

### Tier 3 — MEDIUM (Financial / Transaction Data)

Payment and subscription records.

| Data Field | Table | Notes |
|---|---|---|
| `plan`, `status` | `subscription` | Subscription tier — business data |
| `price_paid`, `currency` | `subscription` | Transaction value |
| `discount_pct` | `subscription` | Pricing data |
| `store_tx_id` | `subscription` | Apple/Google transaction reference |
| `trial_ends_at`, `current_period_ends_at` | `subscription` | Billing cycle data |

**Controls Required:**
- No raw credit card numbers stored (RevenueCat handles PCI-DSS)
- Access restricted to billing/admin roles
- Retained per financial regulations (typically 7 years for tax compliance)
- Transaction IDs are opaque references — no PII extraction possible

### Tier 4 — LOW (Operational / Non-Sensitive)

Data that has minimal privacy impact if disclosed.

| Data Field | Table | Notes |
|---|---|---|
| `workouts_per_week` | `onboarding_profile` | Lifestyle preference (no health condition) |
| `heard_from` | `onboarding_profile` | Marketing attribution |
| `used_other_apps` | `onboarding_profile` | Market research |
| `accomplishments` | `onboarding_profile` | User goals (generic) |
| `notifications_enabled` | `onboarding_profile` | Preference flag |
| `unit_system` | `onboarding_profile` | Metric/imperial preference |
| `weekly_speed_kg` | `onboarding_profile` | Weight change rate setting |
| `water_ml` | `daily_nutrition_summary` | Hydration tracking |
| `was_edited` | `ai_food_log` | UI state flag |
| Cache data | `ai_scan_cache`, Redis | Ephemeral performance data |

**Controls Required:**
- Standard encryption at rest (database-level)
- No special access restrictions beyond authentication
- Can be aggregated for analytics without anonymization

---

## 2. Encryption — At Rest and In Transit

### 2.1 In Transit

| Channel | Protocol | Configuration | Status |
|---|---|---|---|
| Mobile App <-> Backend API | TLS 1.2+ (HTTPS) | HTTPSRedirectMiddleware forces HTTPS in production; HSTS header with 2-year max-age, includeSubDomains, preload | ACTIVE |
| Backend <-> PostgreSQL | TLS | `sslmode=require` in connection string (production) | REQUIRED |
| Backend <-> Redis | TLS | `rediss://` URI scheme in production | REQUIRED |
| Backend <-> OpenAI API | TLS 1.2+ | httpx client to `https://api.openai.com` | ACTIVE |
| Backend <-> Apple JWKS | TLS 1.2+ | httpx client to `https://appleid.apple.com` | ACTIVE |
| Backend <-> Google OAuth | TLS 1.2+ | httpx client to `https://oauth2.googleapis.com` | ACTIVE |
| Mobile <-> RevenueCat SDK | TLS 1.2+ | RevenueCat SDK handles transport | ACTIVE |
| Mobile <-> Expo Push Service | TLS 1.2+ | Expo SDK handles transport | ACTIVE |
| Food images upload | TLS 1.2+ | Multipart form over HTTPS to backend | ACTIVE |

**Mobile-Specific:**
- Certificate pinning: Not yet implemented (recommended for v2.0)
- `X-App-Version` and `X-Platform` headers sent on every request
- Tokens transmitted exclusively in `Authorization: Bearer` header, never in URL query parameters
- 30-second default timeout, 60-second timeout for AI scan calls

### 2.2 At Rest

| Storage Layer | Encryption Method | Key Management | Notes |
|---|---|---|---|
| PostgreSQL (RDS / managed) | AES-256 via Transparent Data Encryption (TDE) | AWS KMS / provider-managed | Enable at database instance level |
| PostgreSQL backups | AES-256 | Same KMS key as live DB | Automated by managed service |
| Redis | In-memory (volatile) | N/A — data expires via TTL | Refresh tokens: 30-day TTL; Cache: 30-day TTL; Lockout counters: 15-min TTL |
| S3 / Cloudflare R2 (food images) | AES-256 (SSE-S3 or SSE-KMS) | Provider-managed or CMK | Enable server-side encryption on bucket |
| Mobile device — tokens | iOS Keychain / Android EncryptedSharedPreferences | Hardware-backed (Secure Enclave / TEE) | expo-secure-store, NOT AsyncStorage |
| Mobile device — onboarding draft | AsyncStorage | Software encryption (OS-level) | Non-sensitive preferences only |
| Hashed passwords | PBKDF2-SHA256 (600,000 rounds) | Salt per-hash (passlib) | One-way; cannot be decrypted |
| JWT tokens | HMAC-SHA256 (HS256) | SECRET_KEY (min 32 chars, env var) | Separate keys for access vs refresh tokens |

### 2.3 Key Rotation Policy

| Secret | Rotation Frequency | Procedure |
|---|---|---|
| `SECRET_KEY` (access tokens) | Every 90 days | Deploy new key, old key remains valid for max token lifetime (30 min) |
| `REFRESH_SECRET_KEY` | Every 90 days | Deploy new key, force refresh on next use (rolling refresh handles this) |
| `OPENAI_API_KEY` | Every 90 days or on suspected compromise | Rotate in OpenAI dashboard, update env var |
| Database password | Every 90 days | Rotate via secrets manager, update connection string |
| Apple/Google OAuth keys | Annually or on compromise | Rotate via respective developer portals |
| RevenueCat API keys | Annually or on compromise | Rotate via RevenueCat dashboard |

---

## 3. Access Control Matrix

### 3.1 System Roles

| Role | Description | Population |
|---|---|---|
| **End User** | Mobile app user (authenticated) | All registered users |
| **Backend Service** | API server process | Automated |
| **AI Processor** | OpenAI API (external) | Automated |
| **Admin** | Operations team member | Named individuals only |
| **DPO** | Data Protection Officer | 1 designated person |
| **DevOps** | Infrastructure management | Named individuals only |

### 3.2 Data Access by Role

| Data Category | End User | Backend Service | AI Processor | Admin | DPO | DevOps |
|---|---|---|---|---|---|---|
| **Own PII** (email, name) | READ/UPDATE/DELETE | READ/WRITE | NONE | READ (with audit) | READ (with audit) | NONE |
| **Own Health Data** (weight, height, diet) | READ/UPDATE/DELETE | READ/WRITE | NONE | READ (with audit) | READ (with audit) | NONE |
| **Own Food Logs** (scans, macros) | READ/UPDATE/DELETE | READ/WRITE | NONE | READ (with audit) | READ (with audit) | NONE |
| **Food Images** | READ/DELETE (own) | READ/WRITE | READ (base64, ephemeral) | READ (with audit) | READ (with audit) | NONE |
| **Own Subscription** | READ | READ/WRITE | NONE | READ/WRITE | READ | NONE |
| **Own Push Token** | Implicit (device) | READ/WRITE | NONE | NONE | NONE | NONE |
| **Other Users' Data** | NONE | NONE | NONE | Aggregated only | READ (with audit + justification) | NONE |
| **Hashed Passwords** | NONE | VERIFY only | NONE | NONE | NONE | NONE |
| **JWT Secrets** | NONE | USE (sign/verify) | NONE | NONE | NONE | MANAGE (env vars) |
| **API Keys** (OpenAI, OAuth) | NONE | USE | N/A | NONE | NONE | MANAGE (env vars) |
| **Server Logs** | NONE | WRITE | NONE | READ | READ | READ |
| **Database Backups** | NONE | NONE | NONE | NONE | AUTHORIZE | EXECUTE |
| **Aggregated Analytics** | NONE | COMPUTE | NONE | READ | READ | READ |

### 3.3 Access Control Enforcement

| Mechanism | Implementation | Location |
|---|---|---|
| Authentication | JWT Bearer tokens (HS256) | `security.py` — `verify_token()` |
| Authorization (own data) | `user_id` from JWT `sub` claim, enforced in every query | All routers — `get_current_user()` |
| Token blacklist | Redis-backed JTI check | `token_store.py` — `is_access_token_blacklisted()` |
| Deactivated user rejection | `is_active` check in `get_current_user()` | `auth.py:32-75` |
| Brute force protection | 5-attempt lockout (15 min), per-email Redis counter | `token_store.py` — `is_login_locked()` |
| Rate limiting (IP) | slowapi — per-endpoint limits | `auth.py` decorators |
| Rate limiting (user) | Redis-backed per-user counters | `token_store.py` — `check_user_rate_limit()` |
| Admin access | Not yet implemented — **ACTION REQUIRED** | Needs admin role + 2FA |
| Database access | Connection string in env var only | `config.py` — no default in production |
| Secret management | Env vars validated at startup (min 32 chars) | `config.py` validators |

### 3.4 ACTION ITEMS — Access Control Gaps

| Gap | Priority | Recommendation |
|---|---|---|
| No admin role system | HIGH | Implement `role` field on User model (`user`, `admin`, `dpo`), enforce in middleware |
| No 2FA for admin actions | HIGH | Add TOTP-based 2FA for admin endpoints |
| `/api/stats/users` has no auth | CRITICAL | Add `get_current_user` + admin role check |
| Database direct access not audited | MEDIUM | Enable PostgreSQL `pgaudit` extension |
| No IP allowlist for admin endpoints | MEDIUM | Add middleware restricting admin routes to VPN/office IPs |

---

## 4. Audit Logging

### 4.1 What Is Logged

| Event | Log Level | Fields Captured | Location |
|---|---|---|---|
| Every API request | INFO | endpoint, method, status_code, duration_ms, user_id | `RequestLoggingMiddleware` in `main.py` |
| Failed login attempt | WARNING | email (hashed recommended), IP address | `auth.py` — `login_user()` |
| Account lockout triggered | WARNING | email, IP, fail_count | `auth.py` — `login_user()` |
| Login on locked account | WARNING | email, IP | `auth.py` — `login_user()` |
| Login on deactivated account | WARNING | user_id, IP | `auth.py` — `login_user()` |
| Revoked token reuse (theft detection) | WARNING | user_id, jti | `auth.py` — `refresh_token()` |
| Account deletion (GDPR) | INFO | user_id | `auth.py` — `delete_account()` |
| Redis unavailable during login | WARNING | user_id | `auth.py` — `login_user()` |
| Redis unavailable during OAuth | WARNING | user_id | `auth.py` — `apple_login()`, `google_login()` |
| OpenAI API error | ERROR | status_code (no key/payload) | `ai_scan_service.py` |
| Health check degraded | WARNING | component (db/redis) | `main.py` — `_health_check_impl()` |

### 4.2 What MUST NOT Be Logged

| Data | Reason |
|---|---|
| Passwords (plain or hashed) | Credential exposure risk |
| Full JWT tokens | Token theft via log exfiltration |
| API keys (OpenAI, OAuth, RevenueCat) | Secret exposure |
| Full request/response bodies | May contain PII, health data, food images |
| Database connection strings | Credential exposure |
| Email addresses in plaintext in production logs | PII exposure — hash or mask to `j***@example.com` |

### 4.3 Log Retention and Security

| Aspect | Policy |
|---|---|
| Retention period | 90 days (hot) + 1 year (cold/archived) |
| Storage | Centralized log aggregator (e.g., CloudWatch, Datadog) |
| Access | DevOps + DPO only; access logged |
| Encryption | Encrypted at rest in log storage |
| Tampering protection | Append-only log streams; no delete permission for non-root |
| PII in logs | Minimize; hash emails in production log output |

### 4.4 ACTION ITEMS — Audit Logging Gaps

| Gap | Priority | Recommendation |
|---|---|---|
| Email logged in plaintext on failed login | MEDIUM | Hash or mask email before logging in production |
| No centralized log aggregation configured | HIGH | Set up CloudWatch / Datadog / Grafana Loki |
| No alerting on security events | HIGH | Alert on: 5+ lockouts/hour, revoked token reuse, unusual admin access |
| Food scan access not individually logged | LOW | Log user_id + image_hash on each scan (already in request logs) |

---

## 5. Data Retention Schedule

| Data Type | Retention Period | Justification | Deletion Method |
|---|---|---|---|
| **User account (active)** | Indefinite while active | Service delivery | N/A |
| **User account (deleted)** | 30 days post-deletion request | GDPR Art. 17 — grace period for undo + legal hold | Hard delete PII, anonymize: `deleted_{id}@removed.fitsiai.com` |
| **Onboarding profile** | Lifetime of account | Required for nutrition plan recalculation | Scrubbed on account deletion |
| **Food logs (`ai_food_log`)** | 3 years from creation | User value (history, trends); analytics | Batch purge after 3 years; immediate on account deletion |
| **Food images (S3/R2)** | 1 year from upload | Cache for re-analysis; storage cost management | S3 lifecycle policy auto-deletes after 1 year; immediate on account deletion |
| **AI scan cache** | 90 days (Redis) / 1 year (DB) | Cost optimization (avoid re-calling OpenAI) | Redis TTL auto-expires; DB batch purge quarterly |
| **AI raw responses** | 90 days | Debugging and model quality monitoring | Batch nullify `ai_raw_response` column after 90 days |
| **Daily nutrition summaries** | 3 years | Dashboard and progress tracking | Batch purge with food logs |
| **Subscription records** | 7 years from transaction | Tax/financial compliance (Chile SII, US IRS) | Archive to cold storage after 7 years |
| **Push tokens** | Until revoked or inactive 90 days | Push notification delivery | Auto-deactivate on delivery failure; purge inactive quarterly |
| **Refresh tokens (Redis)** | 30 days (TTL) | Authentication session | Auto-expires via Redis TTL |
| **Access tokens** | 30 minutes (JWT exp) | Authentication | Self-expiring; blacklist entries expire with token |
| **Failed login counters (Redis)** | 15 minutes (TTL) | Brute force protection | Auto-expires via Redis TTL |
| **Request logs** | 90 days (hot) + 1 year (cold) | Debugging, security forensics | Auto-rotated by log aggregator |
| **Security event logs** | 2 years | Incident investigation, compliance audit | Archived in cold storage |

### 5.1 Automated Retention Enforcement

```
Recommended cron/task schedule:

DAILY:
  - Purge push_token where is_active=false AND updated_at < 90 days ago
  - Nullify ai_raw_response where created_at < 90 days ago

WEEKLY:
  - Hard-delete user records where is_active=false AND updated_at < 30 days ago
  - Cascade-delete associated: onboarding_profile, ai_food_log, nutrition_profile,
    daily_nutrition_summary, meal_log, subscription (archive first), push_token

MONTHLY:
  - S3/R2 lifecycle check: verify images older than 1 year are deleted
  - Purge ai_scan_cache where created_at > 1 year

QUARTERLY:
  - Archive subscription records older than 7 years to cold storage
  - Audit data retention compliance (DPO review)
```

---

## 6. Breach Response Plan

### 6.1 Incident Severity Levels

| Level | Definition | Examples | Response Time |
|---|---|---|---|
| **SEV-1 CRITICAL** | Active exfiltration of Tier 1/2 data | Database dump stolen, API key compromised with active abuse | Immediate (within 1 hour) |
| **SEV-2 HIGH** | Confirmed unauthorized access, no confirmed exfiltration | Unauthorized admin login, SQL injection detected | Within 4 hours |
| **SEV-3 MEDIUM** | Vulnerability discovered, no exploitation confirmed | CVE in dependency, misconfigured CORS | Within 24 hours |
| **SEV-4 LOW** | Security improvement needed, no immediate risk | Missing header, outdated TLS cipher suite | Within 1 week |

### 6.2 Breach Response Procedure

#### Phase 1 — Detection & Triage (0-1 hours)

1. **Detect** — Alert triggered by:
   - Monitoring system (unusual traffic, error spikes, revoked token reuse alerts)
   - User report
   - External disclosure (security researcher, press)
   - Dependency vulnerability disclosure

2. **Triage** — Security Engineer determines:
   - What data was potentially affected? (Tier 1/2/3/4)
   - How many users are potentially impacted?
   - Is the breach ongoing or contained?
   - Assign severity level (SEV-1 through SEV-4)

3. **Escalation**:
   - SEV-1/2: Notify CTO + DPO immediately (phone call, not just Slack)
   - SEV-3/4: Notify via standard channels within business hours

#### Phase 2 — Containment (1-4 hours)

| Action | Command / Steps |
|---|---|
| Revoke all user tokens | `FLUSHDB` on Redis (nuclear option) or targeted `revoke_all_user_tokens()` |
| Rotate compromised secrets | Update SECRET_KEY, REFRESH_SECRET_KEY, OPENAI_API_KEY in env; redeploy |
| Block attacker IP | WAF rule or security group update |
| Disable compromised endpoint | Feature flag or emergency deploy removing route |
| Take affected system offline | If active exfiltration cannot be stopped |
| Preserve evidence | Snapshot database, preserve logs (DO NOT delete anything) |
| Disable compromised admin accounts | Direct database update: `UPDATE user SET is_active=false WHERE id=X` |

#### Phase 3 — Investigation (4-72 hours)

1. **Scope determination:**
   - Which tables/records were accessed?
   - Time range of unauthorized access
   - Number of affected users
   - Attack vector identification

2. **Evidence collection:**
   - Request logs from the incident period
   - Database audit logs (if pgaudit is enabled)
   - Redis command logs
   - Cloud provider access logs (AWS CloudTrail, etc.)

3. **Root cause analysis:**
   - Was it a code vulnerability? (SQL injection, IDOR, auth bypass)
   - Was it a stolen credential? (API key, admin password, database password)
   - Was it a third-party breach? (OpenAI, RevenueCat, Expo)

#### Phase 4 — Notification (within 72 hours of confirmation)

**GDPR Requirement (Art. 33/34):**
- Supervisory authority: Notify within 72 hours of becoming aware
- Affected users: Notify "without undue delay" if high risk to rights/freedoms

**Notification must include:**
- Nature of the breach (what data, how many users)
- Contact details of DPO
- Likely consequences
- Measures taken or proposed

**Notification channels:**
- Email to affected users (using stored email before account scrubbing)
- In-app banner on next login
- Status page update (if public)
- Regulatory filing (GDPR: national DPA; CCPA: California AG if 500+ CA residents)

**Template — User Notification Email:**
```
Subject: Important Security Notice from Fitsi IA

Dear [User],

We are writing to inform you of a security incident that may have affected
your Fitsi IA account.

What happened: [Brief factual description]
What data was involved: [Specific data types, e.g., "email address and
nutrition tracking data"]
What we have done: [Steps taken to contain and remediate]
What you should do: [Change password, monitor accounts, etc.]

We take the security of your data extremely seriously. If you have questions,
please contact our Data Protection Officer at dpo@fitsiai.app.

Sincerely,
The Fitsi IA Team
```

#### Phase 5 — Remediation (1-14 days)

1. Fix the root cause vulnerability
2. Deploy the fix to production
3. Verify the fix with penetration testing
4. Force password reset for affected users (if credentials exposed)
5. Revoke and re-issue all tokens
6. Update this Data Protection Plan with lessons learned
7. Conduct post-incident review with all stakeholders

#### Phase 6 — Post-Incident (14-30 days)

1. Write and distribute post-mortem document
2. Update security monitoring to detect similar incidents
3. Review and update access controls
4. Retrain team on security practices if needed
5. Update breach response plan based on lessons learned

---

## 7. GDPR Compliance Checklist

Applicable to all EU/EEA users. Even without an EU entity, GDPR applies if the app is available to EU users.

### 7.1 Lawful Basis for Processing

| Processing Activity | Lawful Basis | Notes |
|---|---|---|
| Account creation (email, name) | Contract performance (Art. 6(1)(b)) | Required to provide the service |
| Onboarding health data collection | Explicit consent (Art. 9(2)(a)) | Health data = special category; requires explicit consent |
| Food scanning and logging | Contract performance + Explicit consent | Core service feature; health data requires consent |
| AI analysis via OpenAI | Legitimate interest (Art. 6(1)(f)) + Explicit consent | Consent for health data transfer to processor |
| Push notifications | Consent (Art. 6(1)(a)) | Opt-in during onboarding (Step 23) |
| Analytics / aggregated reporting | Legitimate interest (Art. 6(1)(f)) | Only on anonymized/aggregated data |
| Subscription/payment processing | Contract performance (Art. 6(1)(b)) | Required for paid features |
| Marketing emails | Consent (Art. 6(1)(a)) | Separate opt-in required; not yet implemented |

### 7.2 Data Subject Rights

| Right | Article | Implementation Status |
|---|---|---|
| **Right of Access** (Art. 15) | User can request all data held about them | PARTIAL — `/auth/me` returns profile; need full data export endpoint |
| **Right to Rectification** (Art. 16) | User can correct inaccurate data | IMPLEMENTED — Profile edit, food log edit |
| **Right to Erasure** (Art. 17) | User can delete their account and all data | IMPLEMENTED — `DELETE /auth/me` soft-deletes + PII scrub; hard delete after 30 days |
| **Right to Restriction** (Art. 18) | User can restrict processing | NOT IMPLEMENTED — Need `processing_restricted` flag |
| **Right to Data Portability** (Art. 20) | User can export data in machine-readable format | NOT IMPLEMENTED — Need JSON/CSV export endpoint |
| **Right to Object** (Art. 21) | User can object to processing based on legitimate interest | NOT IMPLEMENTED — Need objection mechanism |
| **Rights related to automated decision-making** (Art. 22) | User can request human review of automated decisions | PARTIAL — AI food scan is automated; user can edit results |

### 7.3 GDPR Compliance ACTION ITEMS

| Item | Priority | Status |
|---|---|---|
| Privacy Policy accessible before account creation | HIGH | CHECK — must be shown at Step 25 (Account) |
| Explicit consent checkbox for health data processing | CRITICAL | NOT IMPLEMENTED — Required before collecting Tier 1 data |
| Cookie/tracking consent (if web version) | HIGH | NOT IMPLEMENTED for web |
| Data export endpoint (`GET /auth/me/export`) | HIGH | NOT IMPLEMENTED |
| Data portability format (JSON + CSV) | MEDIUM | NOT IMPLEMENTED |
| Processing restriction flag | MEDIUM | NOT IMPLEMENTED |
| Consent withdrawal mechanism | HIGH | PARTIAL — account deletion exists; need granular consent management |
| DPO contact displayed in app | HIGH | NOT IMPLEMENTED — add to Settings screen |
| Privacy Policy link in every email | MEDIUM | NOT YET APPLICABLE (no marketing emails) |
| Records of Processing Activities (ROPA) | HIGH | This document serves as initial ROPA |
| Data Protection Impact Assessment (DPIA) | HIGH | Required for systematic health data processing — DOCUMENT NEEDED |
| Under-16 age gate | MEDIUM | Birth date collected at Step 9; need age check + parental consent mechanism |

---

## 8. CCPA Compliance Checklist

Applicable if the app has California users and meets CCPA thresholds ($25M revenue, 50K+ CA consumers, or 50%+ revenue from data sale).

### 8.1 Consumer Rights (CCPA/CPRA)

| Right | Status |
|---|---|
| **Right to Know** — what personal info is collected | PARTIAL — Privacy Policy exists; need specific categories disclosure |
| **Right to Delete** | IMPLEMENTED — `DELETE /auth/me` |
| **Right to Opt-Out of Sale** | N/A — Fitsi does not sell personal data |
| **Right to Non-Discrimination** | IMPLEMENTED — no service degradation for exercising rights |
| **Right to Correct** | IMPLEMENTED — profile/log editing |
| **Right to Limit Use of Sensitive PI** | NOT IMPLEMENTED — need toggle for health data processing limits |

### 8.2 CCPA ACTION ITEMS

| Item | Priority | Status |
|---|---|---|
| "Do Not Sell My Personal Information" link (if applicable) | LOW | N/A unless data sharing model changes |
| Privacy Policy updated for CCPA categories | MEDIUM | REVIEW NEEDED |
| Verified consumer request process | MEDIUM | NOT IMPLEMENTED — need identity verification for data requests |
| Annual privacy training for employees handling PI | MEDIUM | NOT SCHEDULED |
| Respond to requests within 45 days | MEDIUM | Process documented above; tooling needed |

---

## 9. Data Processing Agreement (DPA) Template

This template should be executed with each third-party data processor before sharing user data.

---

### DATA PROCESSING AGREEMENT

**Between:**
- **Data Controller:** Ironside SpA, operating as Fitsi IA ("Controller")
- **Data Processor:** [Processor Name] ("Processor")

**Effective Date:** [Date]

---

#### 1. Definitions

- **Personal Data**: Any information relating to an identified or identifiable natural person, as defined in GDPR Art. 4(1).
- **Processing**: Any operation performed on Personal Data, as defined in GDPR Art. 4(2).
- **Sub-processor**: Any third party engaged by the Processor to process Personal Data on behalf of the Controller.

#### 2. Scope and Purpose of Processing

The Processor shall process Personal Data only for the following purposes:

| Processor | Data Shared | Purpose | Lawful Basis |
|---|---|---|---|
| **OpenAI** (GPT-4o Vision) | Food images (base64), no user identifiers | AI nutritional analysis of food photos | Legitimate interest + explicit consent for health data |
| **RevenueCat** | User ID (numeric), subscription events | Subscription management, receipt validation | Contract performance |
| **Expo (EAS)** | Push tokens, device metadata | Push notification delivery | Consent |
| **Apple** (Sign in with Apple) | Apple user ID, email (optional) | Authentication | Contract performance |
| **Google** (Google Sign-In) | Google user ID, email, name | Authentication | Contract performance |
| **AWS / Cloudflare** (hosting) | All data (as infrastructure provider) | Data storage and compute | Contract performance |
| **PostgreSQL hosting provider** | All database records | Persistent data storage | Contract performance |

#### 3. Processor Obligations

The Processor shall:

3.1. Process Personal Data only on documented instructions from the Controller, including with regard to transfers of Personal Data to a third country.

3.2. Ensure that persons authorized to process the Personal Data have committed themselves to confidentiality.

3.3. Implement appropriate technical and organizational security measures, including:
   - Encryption of Personal Data in transit and at rest
   - Ability to ensure ongoing confidentiality, integrity, availability
   - Regular testing and evaluation of security measures

3.4. Not engage another processor (sub-processor) without prior specific written authorization of the Controller. If authorized, impose equivalent data protection obligations.

3.5. Assist the Controller in responding to data subject requests (access, rectification, erasure, portability, restriction, objection).

3.6. Delete or return all Personal Data upon termination of services, and delete existing copies unless legally required to retain.

3.7. Make available to the Controller all information necessary to demonstrate compliance, and allow for and contribute to audits.

3.8. Immediately inform the Controller if an instruction infringes GDPR or other data protection law.

#### 4. Data Breach Notification

4.1. The Processor shall notify the Controller without undue delay (and in any event within 24 hours) after becoming aware of a Personal Data breach.

4.2. The notification shall include:
   - Nature of the breach
   - Categories and approximate number of data subjects affected
   - Likely consequences
   - Measures taken or proposed to address the breach

#### 5. International Data Transfers

5.1. The Processor shall not transfer Personal Data to a country outside the EEA without appropriate safeguards:
   - EU Standard Contractual Clauses (SCCs)
   - Binding Corporate Rules (BCRs)
   - EU-US Data Privacy Framework (if certified)

5.2. Current transfer assessment:

| Processor | Location | Transfer Mechanism |
|---|---|---|
| OpenAI | USA | EU-US Data Privacy Framework + SCCs |
| RevenueCat | USA | SCCs |
| Expo | USA | SCCs |
| Apple | USA/Ireland | EU-US Data Privacy Framework |
| Google | USA/Global | EU-US Data Privacy Framework + SCCs |
| AWS | Region-specific | EU region available (eu-west-1); SCCs for US |

#### 6. Sub-processors

6.1. The Controller authorizes the following sub-processors as of the Effective Date:

[To be populated per processor — each processor must disclose their sub-processors]

6.2. The Processor shall inform the Controller of any intended changes concerning the addition or replacement of sub-processors, giving the Controller the opportunity to object.

#### 7. Audit Rights

7.1. The Controller (or a mandated auditor) may audit the Processor's compliance with this DPA once per calendar year, with 30 days' written notice.

7.2. The Processor shall provide SOC 2 Type II or equivalent certification annually as an alternative to on-site audits.

#### 8. Duration and Termination

8.1. This DPA shall remain in effect for the duration of the underlying service agreement.

8.2. Upon termination:
   - Processor shall cease processing within 30 days
   - Processor shall delete or return all Personal Data within 60 days
   - Processor shall certify deletion in writing

#### 9. Liability

9.1. Each party's liability under this DPA shall be subject to the limitations of the underlying service agreement.

9.2. The Processor shall be liable for damages caused by processing that does not comply with this DPA or the Controller's lawful instructions.

#### 10. Governing Law

This DPA shall be governed by the laws of [Chile / EU Member State, depending on user jurisdiction].

---

**SIGNATURES:**

For the Controller: _________________________ Date: _________
Name: _________________ Title: _________________

For the Processor: _________________________ Date: _________
Name: _________________ Title: _________________

---

### 9.1 DPA Status by Processor

| Processor | DPA Required | DPA Signed | ACTION |
|---|---|---|---|
| **OpenAI** | YES — processes food images | NO | Execute DPA; review OpenAI's standard DPA at https://openai.com/policies/data-processing-addendum |
| **RevenueCat** | YES — processes user IDs + subscription data | NO | Execute DPA; review RevenueCat's DPA |
| **Expo (EAS)** | YES — processes push tokens | NO | Review Expo's privacy terms |
| **Apple** | YES — processes auth identifiers | IMPLICIT (App Store terms) | Verify App Store terms cover GDPR requirements |
| **Google** | YES — processes auth identifiers | IMPLICIT (Firebase/Cloud terms) | Verify Google Cloud DPA covers GDPR |
| **AWS / Cloudflare** | YES — infrastructure provider | REVIEW | Execute standard infrastructure DPA |
| **PostgreSQL hosting** | YES — stores all data | REVIEW | Execute DPA with database hosting provider |

---

## Appendix A — Data Flow Diagram

```
                                ┌─────────────────┐
                                │   MOBILE APP     │
                                │  (React Native)  │
                                └────────┬─────────┘
                                         │ HTTPS (TLS 1.2+)
                                         │ Bearer Token in Header
                                         │ X-App-Version, X-Platform
                                         ▼
                              ┌──────────────────────┐
                              │   FASTAPI BACKEND     │
                              │   (Python 3.11+)      │
                              │                        │
                              │  Middlewares:           │
                              │  - HTTPS Redirect      │
                              │  - Security Headers    │
                              │  - App Version Check   │
                              │  - Request Logging     │
                              │  - CORS                │
                              │  - Rate Limiting       │
                              └──┬────┬────┬────┬─────┘
                                 │    │    │    │
                    ┌────────────┘    │    │    └────────────┐
                    ▼                 ▼    ▼                 ▼
            ┌──────────────┐  ┌──────────┐ ┌──────────┐  ┌──────────┐
            │  PostgreSQL   │  │  Redis   │ │  OpenAI  │  │  S3/R2   │
            │  (encrypted)  │  │ (tokens, │ │ (GPT-4o  │  │ (food    │
            │               │  │  cache,  │ │  Vision) │  │  images) │
            │ Tables:       │  │  lockout)│ │          │  │          │
            │ - user        │  │          │ │ Receives:│  │ Encrypted│
            │ - onboarding  │  │ TTL-based│ │ base64   │  │ at rest  │
            │ - ai_food_log │  │ expiry   │ │ images   │  │ (SSE)    │
            │ - subscription│  │          │ │ ONLY     │  │          │
            │ - etc.        │  │          │ │ (no PII) │  │          │
            └──────────────┘  └──────────┘ └──────────┘  └──────────┘
                                                │
                                         ┌──────┘
                                         ▼
                              ┌──────────────────────┐
                              │  RevenueCat SDK       │
                              │  (mobile-side)        │
                              │  Receives: user_id    │
                              │  Manages: subscriptions│
                              └──────────────────────┘
```

## Appendix B — Regulatory Contact Information

| Role | Contact | Responsibility |
|---|---|---|
| Data Protection Officer | dpo@fitsiai.app (TO BE ASSIGNED) | GDPR compliance oversight, breach notification |
| Security Engineer | security@fitsiai.app | Technical security, incident response |
| Legal Counsel | [TO BE ASSIGNED] | Regulatory filings, DPA review |
| Chile Data Protection Authority | Consejo para la Transparencia | Chilean data protection oversight |
| EU Lead Supervisory Authority | [Depends on EU establishment, if any] | GDPR enforcement |
| California AG | oag.ca.gov | CCPA enforcement |

---

*This document must be reviewed quarterly and updated whenever:*
- *A new data type is collected*
- *A new third-party processor is integrated*
- *A security incident occurs*
- *Regulatory requirements change*
- *The application architecture changes materially*

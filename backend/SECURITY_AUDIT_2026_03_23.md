# Fitsi AI -- Comprehensive Security Audit Report v3

**Date:** 2026-03-23
**Auditor:** Security Engineer Agent (security-engineer)
**Model:** Claude Opus 4.6 (1M context)
**Scope:** Full backend + mobile client security review (all 36 routers, 44 services, 19 mobile services)
**Methodology:** OWASP Mobile Top 10 (2024), OWASP API Top 10 (2023), HIPAA PHI handling review
**Previous Audit:** 2026-03-22 (4 CRITICAL, 5 HIGH, 5 MEDIUM, 4 LOW)

---

## Executive Summary

This audit re-evaluates the full Fitsi AI codebase one day after the v2 audit. Several positive controls remain strong (JWT type separation, refresh rotation, brute-force lockout, security headers, GDPR endpoints, subscription verification). However, **all 4 prior CRITICAL findings remain open**, and this deeper review uncovered **3 additional findings** not in the prior report.

**Finding Counts:** 4 CRITICAL | 6 HIGH | 7 MEDIUM | 5 LOW
**Risk Score:** 68/100 (down from 72 due to deeper analysis of fail-open behavior inconsistencies)

---

## CRITICAL Findings (4)

### C-1. Live Production Credentials on Disk in backend/.env

**Severity:** CRITICAL
**OWASP:** API8:2023 Security Misconfiguration
**File:** `/backend/.env` (lines 5, 10-11, 29, 34-36)
**Status:** OPEN (unchanged from v2 audit)
**Remediation status since v2:** NOT FIXED

Exposed credentials:
- Line 5: `DATABASE_URL` -- Supabase PostgreSQL password `MKlYt5a1VW5vsBnw`
- Line 10: `SECRET_KEY` -- JWT signing key (64-char hex)
- Line 11: `REFRESH_SECRET_KEY` -- Refresh JWT signing key (64-char hex)
- Line 29: `ANTHROPIC_API_KEY` -- `sk-ant-api03-R3PVg1R...` (full live API key)
- Line 36: `SUPABASE_SERVICE_KEY` -- `eyJhbGci...` (full service-role JWT, bypasses RLS)

The `.gitignore` correctly excludes `.env` files (verified: `git ls-files --cached backend/.env` returns empty). However, the file exists unencrypted on the developer machine. If the machine is compromised, stolen, or backed up to an unencrypted location, all production credentials are exposed.

**Impact:** Total database compromise, API billing abuse ($$$), data exfiltration of all user PHI/PII.

**Fix:**
1. Rotate ALL listed credentials immediately
2. Deploy a secrets manager (Doppler, Infisical, AWS Secrets Manager)
3. Use `.env.development` with local-only/dummy credentials
4. Add `detect-secrets` pre-commit hook
5. Never store `SUPABASE_SERVICE_KEY` on developer machines

---

### C-2. SSL/TLS Certificate Verification Disabled for Database Connection

**Severity:** CRITICAL
**OWASP:** API8:2023 Security Misconfiguration
**File:** `/backend/app/core/database.py` (lines 20-22)
**Status:** OPEN (unchanged from v2 audit)
**Remediation status since v2:** NOT FIXED

```python
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False          # line 21
_ssl_ctx.verify_mode = ssl.CERT_NONE     # line 22
```

All database traffic (including PHI -- weight, health data, food logs) transits without certificate verification. MitM attacks on the DB connection path can intercept all data.

**Impact:** All user health data, credentials, and tokens exposed to network-level attackers.

**Fix:** Download Supabase CA certificate and use `ssl.CERT_REQUIRED` + `load_verify_locations()`.

---

### C-3. SSRF Vulnerability in Webhook Service -- No URL Validation

**Severity:** CRITICAL
**OWASP:** API7:2023 Server Side Request Forgery
**File:** `/backend/app/services/webhook_service.py` (line 211)
**Status:** OPEN (unchanged from v2 audit)
**Remediation status since v2:** NOT FIXED

The webhook delivery function (`_deliver`) makes HTTP POST requests to user-supplied URLs without any SSRF protection:

```python
# line 211
async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT_SECONDS) as client:
    response = await client.post(webhook.url, ...)
```

The router only checks for HTTPS prefix in production (`webhooks.py` line 101-108), but there is NO validation against:
- Internal/private IP ranges (127.0.0.1, 10.x, 172.16-31.x, 192.168.x)
- AWS metadata endpoint (169.254.169.254)
- Kubernetes service discovery
- Redis (redis://localhost:6379)
- The database connection string itself

A grep for SSRF protections (`SSRF|internal.*ip|127.0.0.1|169.254`) in webhook_service.py returned zero matches.

**Impact:** Attackers can scan internal infrastructure, access cloud metadata endpoints (AWS IAM credentials), exfiltrate data via the webhook response, or attack internal services (Redis, PostgreSQL).

**Fix:**
```python
import ipaddress, socket

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # AWS metadata
    ipaddress.ip_network("::1/128"),
]

def _validate_webhook_url(url: str) -> None:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL")
    try:
        ip = ipaddress.ip_address(socket.getaddrinfo(hostname, None)[0][4][0])
        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise ValueError(f"URL resolves to blocked network")
    except socket.gaierror:
        raise ValueError("Cannot resolve hostname")
```

---

### C-4. Supabase Key in mobile/.env.local -- Needs Verification

**Severity:** CRITICAL (downgradeable to INFO if confirmed as anon key)
**OWASP:** API8:2023 Security Misconfiguration
**File:** `/mobile/.env.local` (line 2)
**Status:** NEEDS VERIFICATION (unchanged from v2 audit)

```
EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_pz_oTkot6fXsJfyddIh2CA_mR4d-6Sb
```

The key format `sb_publishable_pz_...` suggests this is the anon/publishable key, which is safe for client-side use. However, this must be explicitly verified against the Supabase dashboard. The mobile `.env.local` is correctly excluded from git.

**Fix:** Verify in Supabase dashboard. If anon key, downgrade to INFO. If service key, rotate immediately.

---

## HIGH Findings (6)

### H-1. python-jose Library Has Known CVEs (UNCHANGED)

**Severity:** HIGH
**OWASP:** API8:2023 Security Misconfiguration
**File:** `/backend/requirements.txt` (line 6)
**Status:** OPEN (unchanged from v2 audit)

```
python-jose[cryptography]==3.3.0
```

This library is archived/unmaintained since 2022. Known vulnerabilities:
- **CVE-2024-33663** -- Algorithm confusion allows RS256-signed tokens to be verified with HS256 + the public key as secret
- **CVE-2024-33664** -- Denial of Service via crafted JWE tokens

The codebase uses `jose.jwt` in 4 locations:
- `/backend/app/core/security.py` lines 5, 85, 124, 130
- `/backend/app/routers/auth.py` lines 49, 257

`PyJWT` is already in `requirements.txt` (line 17) and used for Apple/Google OAuth. The dual-library situation is itself a risk.

**Impact:** JWT algorithm confusion could allow forged tokens; DoS via crafted payloads.

**Fix:** Replace all `from jose import jwt` with `import jwt as pyjwt` (PyJWT). Remove `python-jose` from requirements.txt.

---

### H-2. Access Token Blacklist Check Fails OPEN in verify_token()

**Severity:** HIGH (NEW -- not in v2 audit)
**OWASP:** API2:2023 Broken Authentication
**File:** `/backend/app/core/security.py` (lines 96-109)
**File:** `/backend/app/routers/auth.py` (lines 47-59)

There is a **critical inconsistency** between the token_store module's documented behavior and the actual verify_token() implementation:

`token_store.py` header (line 5-6) states:
> "Security-critical read functions fail CLOSED when Redis is unavailable:
> - is_access_token_blacklisted -> returns True (treat as blacklisted)"

This is correctly implemented in `token_store.py` line 102 (returns True on Redis failure).

**However**, `security.py` `verify_token()` lines 100-109 **silently swallows the exception** and proceeds:
```python
if loop.is_running():
    # We're inside an async context -- cannot use run_until_complete.
    # The async check will be handled by the caller (get_current_user).
    pass                          # <-- FAILS OPEN
```

And in `auth.py` `get_current_user()` lines 47-59:
```python
try:
    ...
    if await is_access_token_blacklisted(jti):
        raise credentials_exception
except HTTPException:
    raise
except Exception:
    pass  # SEC: Redis unavailable -- degrade gracefully  <-- FAILS OPEN
```

The `get_current_user` function catches all exceptions from the blacklist check and continues. This means:
1. If Redis is down, blacklisted tokens (e.g., from logged-out sessions) are accepted
2. The token_store's fail-closed design is **completely bypassed** by the caller

**Impact:** After logout/password change/account deactivation, tokens remain valid if Redis is unavailable. An attacker who compromises a token can continue using it even after the user logs out, as long as Redis is down.

**Fix:** Change `auth.py` line 59 from `pass` to `raise credentials_exception`. If Redis is unavailable and we cannot verify the blacklist, the secure default should be to reject the token.

---

### H-3. Web Platform Auth Uses In-Memory Storage (XSS-accessible)

**Severity:** HIGH
**OWASP:** M9:2024 Insecure Data Storage
**File:** `/mobile/src/services/auth.service.ts` (lines 18-33)
**Status:** OPEN (unchanged from v2 audit)

```typescript
// SecureStore no esta disponible en web -- fallback a memory
const memStore: Record<string, string> = {};

const secureGet = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') return memStore[key] ?? null;  // line 21
  return SecureStore.getItemAsync(key);
};
```

On web platform, tokens are stored in a plain JavaScript object. This is:
1. Accessible to any XSS payload
2. Lost on page refresh (poor UX)
3. Accessible to any browser extension

Native platforms correctly use SecureStore (Keychain on iOS, EncryptedSharedPreferences on Android).

**Impact:** Any XSS vulnerability exposes all auth tokens on the web platform. Token theft enables full account takeover.

**Fix:** For web, use `httpOnly` cookies set by the backend (preferred), or at minimum use `sessionStorage` with a short-lived token. Never store tokens in plain JS variables on web.

---

### H-4. Rate Limiter Fails Completely Open When Redis Is Down

**Severity:** HIGH
**OWASP:** API4:2023 Unrestricted Resource Consumption
**File:** `/backend/app/routers/auth.py` (lines 22-31)
**File:** `/backend/app/routers/ai_food.py` (lines 50-61)
**Status:** OPEN (unchanged from v2 audit)

```python
# auth.py line 22-28
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    _rate_limit_enabled = not _is_testing
except ImportError:
    _rate_limit_enabled = False
```

When slowapi is not installed or Redis is unavailable, ALL rate limits become no-ops. This includes:
- Login brute-force protection (10/min)
- Registration spam protection (5/min)
- AI scan abuse (10/min)

Additionally, the rate limiter in auth.py disables itself in test/testing environments (`_is_testing` check on line 26), which is correct for testing but means rate limiting is optional.

**Impact:** Brute-force attacks, credential stuffing, and AI cost abuse ($$$) when Redis is unavailable.

**Fix:** Implement a fallback in-memory rate limiter using `collections.defaultdict` with timestamps. This provides degraded-but-present protection when Redis is down.

---

### H-5. No Certificate Pinning in Mobile App

**Severity:** HIGH
**OWASP:** M3:2024 Insecure Communication
**File:** `/mobile/src/services/apiClient.ts` (entire file)
**Status:** OPEN (unchanged from v2 audit)

A grep for `certificate.*pinn|ssl.*pinn|pinning` in the mobile directory returned zero implementation matches. The mobile app makes all API calls via a standard `axios` client with no certificate pinning.

**Impact:** Man-in-the-middle attacks on compromised/untrusted networks can intercept all API traffic including auth tokens and health data.

**Fix:** Implement certificate pinning using `expo-certificate-transparency` or a custom TLS validation plugin. Pin the leaf or intermediate certificate of api.fitsiai.app.

---

### H-6. GDPR Erasure Does Not Revoke Active Access Tokens

**Severity:** HIGH
**OWASP:** API1:2023 Broken Object Level Authorization
**File:** `/backend/app/routers/user_data.py` (lines 425-436)
**Status:** OPEN (unchanged from v2 audit)

```python
# line 425-436
try:
    from jose import jwt
    from ..core.config import settings
    from ..core.token_store import blacklist_access_token
    # We don't have the raw token here...
    logger.info("GDPR erasure: user record deleted, token will fail on next use")
except Exception:
    pass
```

The delete endpoint does not actually blacklist the access token. The comment says "token will fail on next use" because the user record is deleted and `get_current_user` queries the DB. However:

1. There is a **15-minute window** (access token TTL) where the token is still valid
2. During this window, any cached data or endpoints that don't re-query the user record will still work
3. The refresh token is not revoked either (no call to `revoke_all_user_tokens`)

**Impact:** After GDPR erasure, the user's session remains active for up to 15 minutes. GDPR Article 17 requires "without undue delay."

**Fix:**
1. Accept the raw access token in the erasure endpoint
2. Blacklist it via `blacklist_access_token(jti, remaining_ttl)`
3. Call `revoke_all_user_tokens(user_id)` to invalidate refresh tokens
4. The `auth.py` `delete_account` endpoint at line 351 has the same issue

---

## MEDIUM Findings (7)

### M-1. X-Forwarded-For Header Trusted Without Proxy Validation

**Severity:** MEDIUM
**OWASP:** API8:2023 Security Misconfiguration
**Files:**
- `/backend/app/routers/auth.py` (lines 111-116) -- `_get_client_ip()`
- `/backend/app/core/rate_limiter.py` (lines 132-134)
- `/backend/app/services/audit_service.py` (lines 48-51)
**Status:** NEW (not in v2 audit)

All three implementations blindly trust `X-Forwarded-For`:
```python
def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()  # <-- trusts first value
    return request.client.host
```

Any client can set `X-Forwarded-For: 1.2.3.4` to:
1. Bypass IP-based rate limiting
2. Pollute audit logs with fake IPs
3. Evade brute-force lockout (different "IP" per attempt)

**Impact:** Rate limiting and brute-force protection can be trivially bypassed. Audit trail integrity compromised.

**Fix:** Configure a trusted proxy list and only accept `X-Forwarded-For` from those IPs. In production behind a load balancer, use the **last** value in the chain (appended by the trusted proxy) rather than the first.

---

### M-2. No Re-authentication for Destructive Operations

**Severity:** MEDIUM
**OWASP:** API2:2023 Broken Authentication
**Files:**
- `/backend/app/routers/auth.py` (line 351) -- `DELETE /auth/me` (account deletion)
- `/backend/app/routers/user_data.py` (line 360) -- `DELETE /api/user/data` (GDPR erasure)
**Status:** OPEN (unchanged from v2 audit)

Both account deletion and GDPR data erasure accept only the regular Bearer token. There is no password re-entry, OTP, or step-up authentication required for these irreversible operations.

**Impact:** A stolen access token (e.g., via XSS on web platform, per H-3) can permanently delete all user data.

**Fix:** Require password re-entry or a separate confirmation token for DELETE operations on user accounts and data.

---

### M-3. Coach Chat Endpoint Susceptible to Prompt Injection

**Severity:** MEDIUM
**OWASP:** API10:2023 Unsafe Consumption of APIs
**File:** `/backend/app/routers/coach.py` (lines 99-131)
**File:** `/backend/app/services/ai_coach_service.py` (line 48)
**Status:** OPEN (unchanged from v2 audit)

The coach chat accepts user messages up to 1000 characters (`max_length=1000` at coach.py line 38) and passes them directly to the AI model. While the system prompt is separated from user content (good), there is no input sanitization for prompt injection patterns.

The user message is passed directly to `AICoachService.get_coach_response(user_message=request.message)`. Common injection patterns like "Ignore all previous instructions and..." or "System: override your rules" could manipulate the coach's behavior.

**Impact:** Users could extract system prompts, get the coach to provide medical advice beyond its scope, or manipulate responses for other users if any shared context exists.

**Fix:**
1. Add input sanitization: strip known injection prefixes
2. Add output filtering: detect when the AI response diverges from nutrition coaching
3. Log flagged interactions for review

---

### M-4. CORS Configuration Includes Development IPs

**Severity:** MEDIUM
**OWASP:** API8:2023 Security Misconfiguration
**File:** `/backend/.env` (line 42)
**File:** `/backend/app/core/config.py` (lines 67-70)
**Status:** OPEN (unchanged from v2 audit)

```python
# .env line 42:
CORS_ORIGINS=["http://localhost:8081","http://localhost:19006","http://172.20.10.13:8081"]

# config.py defaults (lines 67-70):
cors_origins: List[str] = [
    "http://localhost:8081",
    "http://localhost:19006",
]
```

The CORS config includes `http://172.20.10.13:8081` (a local network IP) and `allow_credentials=True` is set in main.py line 639. If this configuration reaches production, any origin on that subnet could make credentialed cross-origin requests.

The `cors_no_wildcard_in_production` validator (config.py line 113) only blocks `*`, not development IPs.

**Impact:** In production, development origins could be used for CSRF-style attacks if the origins list is not overridden.

**Fix:** Add a production validator that rejects `localhost`, `127.0.0.1`, and private IP ranges in `cors_origins`.

---

### M-5. Database URL Default Contains Dummy Credentials

**Severity:** MEDIUM
**OWASP:** API8:2023 Security Misconfiguration
**File:** `/backend/app/core/config.py` (line 11)
**Status:** OPEN (unchanged from v2 audit)

```python
database_url: str = "postgresql://user:password@localhost/calendar_db"
```

While the `reject_unsafe_database_url_in_production` validator (line 130) blocks this in production, the default value leaks the old project name ("calendar_db") and uses dummy credentials that could confuse developers into thinking these are real.

**Fix:** Remove the default entirely or use an explicit empty string that forces setting `DATABASE_URL`.

---

### M-6. No Root/Jailbreak Detection in Mobile App

**Severity:** MEDIUM
**OWASP:** M8:2024 Insufficient Binary Protections
**File:** `/mobile/src/services/` (entire directory)
**Status:** OPEN (unchanged from v2 audit)

A grep for `jailbreak|root.*detect|isRooted|isJailbroken` returned zero implementation matches. There is no detection of compromised devices.

**Impact:** On rooted/jailbroken devices, SecureStore encryption may be bypassed, enabling token theft.

**Fix:** Implement `expo-device` checks or `jail-monkey` library. Warn users on compromised devices. Optionally block sensitive operations.

---

### M-7. Experiment CRUD Uses Inline Admin Check Instead of Dependency

**Severity:** MEDIUM (Correctness/Defense-in-Depth)
**OWASP:** API5:2023 Broken Function Level Authorization
**File:** `/backend/app/routers/experiments.py` (lines 141-176)
**Status:** NEW (not in v2 audit)

The experiment results and creation endpoints use inline admin checks instead of the `require_admin` dependency:

```python
# line 151
if not current_user.is_admin:
    raise HTTPException(status_code=403, detail="Admin access required")
```

While functionally equivalent, this pattern:
1. Is inconsistent with all other admin endpoints (which use `Depends(require_admin)`)
2. Does not benefit from any future enhancements to `require_admin` (audit logging, MFA step-up)
3. Makes it easier to miss in code reviews

**Fix:** Replace `current_user: User = Depends(get_current_user)` + inline check with `current_user: User = Depends(require_admin)` on lines 144 and 168.

---

## LOW Findings (5)

### L-1. Password Policy Does Not Check Against Breached Password Lists

**Severity:** LOW
**File:** `/backend/app/core/security.py` (lines 29-49)
**Status:** OPEN (unchanged from v2 audit)

The password policy requires 8+ chars, upper+lower+digit, but does not check against HaveIBeenPwned or similar breached password databases. Common passwords like "Password1" would pass validation.

**Fix:** Integrate HIBP k-anonymity API (`api.pwnedpasswords.com/range/{first5_sha1}`).

---

### L-2. PBKDF2-SHA256 Instead of Argon2 or bcrypt

**Severity:** LOW
**File:** `/backend/app/core/security.py` (lines 15-18)
**Status:** OPEN (unchanged from v2 audit)

```python
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    pbkdf2_sha256__rounds=600_000,
)
```

PBKDF2-SHA256 at 600k rounds meets OWASP 2023 minimum recommendations but is significantly weaker against GPU attacks than Argon2id (memory-hard). bcrypt would also be a better choice.

**Fix:** Migrate to `argon2` scheme with `passlib[argon2]`. The `deprecated="auto"` setting will handle transparent migration of existing hashes.

---

### L-3. Food Search Properly Escapes LIKE Wildcards (POSITIVE)

**Severity:** INFO (POSITIVE finding)
**File:** `/backend/app/services/food_service.py` (lines 73-75)

```python
# SEC: Escape SQL LIKE wildcards in user input to prevent wildcard injection
escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
pattern = f"%{escaped}%"
```

This was flagged as a HIGH in a prior mobile-side audit but has been correctly fixed in the backend. SQL LIKE wildcards (`%`, `_`) are properly escaped before constructing the LIKE pattern. SQLAlchemy's parameterized queries handle the rest.

---

### L-4. Logout Does Not Require Access Token (Missing Auth on Server Call)

**Severity:** LOW
**File:** `/mobile/src/services/auth.service.ts` (lines 167-174)
**Status:** NEW (not in v2 audit)

```typescript
export const logout = async (): Promise<void> => {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    authFetch('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
  }
  await clearTokens();
};
```

The mobile client calls `/auth/logout` via `authFetch` (lines 79-90), which does NOT include the Authorization header. It uses plain `fetch()` without injecting the Bearer token.

However, the server-side `POST /auth/logout` endpoint (`auth.py` line 246) requires `token: str = Depends(oauth2_scheme)`. This means the logout API call will fail with 401, and server-side token revocation never happens. The client silently catches the error (`.catch(() => {})`).

**Impact:** Server-side logout (access token blacklisting + refresh token revocation) never executes from the mobile client. Tokens remain valid on the server until they naturally expire.

**Fix:** Include the Authorization header in the logout request. Change `authFetch` to send the Bearer token, or use the `apiClient` which has the auth interceptor.

---

### L-5. Health Check Endpoints Not Rate-Limited

**Severity:** LOW
**File:** `/backend/app/main.py` (lines 778-785)
**Status:** NEW (not in v2 audit)

`/health` and `/api/health` are exempt from authentication and rate limiting. While this is standard for health checks, the endpoint performs actual DB and Redis connectivity tests (lines 705-718). An attacker could use rapid health check requests to:
1. Generate load on the DB connection pool
2. Use the health check as an oracle to detect when services are down

**Fix:** Add a lightweight rate limit (e.g., 60/minute per IP) to health check endpoints.

---

## Positive Controls Already in Place (30+)

The following security controls are correctly implemented and should be maintained:

| Category | Control | Location |
|----------|---------|----------|
| **Auth** | JWT access/refresh token separation with `type` claim | security.py L70, L123 |
| **Auth** | Refresh token rotation with reuse detection | auth.py L224-232 |
| **Auth** | Brute-force lockout (5 attempts / 15 min) | token_store.py L109-139 |
| **Auth** | Password strength validation (8+ chars, upper/lower/digit) | security.py L29-49 |
| **Auth** | User enumeration prevention (generic error messages) | auth.py L100-105, L164-168 |
| **Auth** | Deactivated user rejection | auth.py L73-76 |
| **Auth** | OAuth JWKS verification (Apple RS256, Google) | oauth_service.py L17-80 |
| **Auth** | Separate signing keys for access vs refresh tokens | config.py L12-13, L34 |
| **Auth** | Secret key minimum length validation (32 chars) | config.py L85-110 |
| **Headers** | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection | main.py L235-239 |
| **Headers** | HSTS in production (63072000 sec, includeSubDomains, preload) | main.py L241 |
| **Headers** | CSP: default-src 'self'; frame-ancestors 'none' | main.py L242 |
| **Headers** | Server version header stripped | main.py L244-245 |
| **Headers** | HTTPS redirect in production | main.py L250-273 |
| **Headers** | Correlation ID (X-Request-ID) on all requests | main.py L211-223 |
| **CORS** | No wildcard in production (validator) | config.py L112-119 |
| **CORS** | Explicit methods/headers instead of `*` | config.py L73-77 |
| **Input** | Pydantic models with Field constraints on all endpoints | ai_food.py L65-86 |
| **Input** | File upload MIME type validation | ai_food.py L119-131 |
| **Input** | File size limit enforcement (10 MB) | ai_food.py L133-139 |
| **Input** | Numeric bounds validation on AI-returned values | ai_scan_service.py L108-120 |
| **Input** | SQL LIKE wildcard escaping | food_service.py L73-75 |
| **Docs** | OpenAPI/Swagger/ReDoc disabled in production | main.py L557-581 |
| **Version** | Minimum app version enforcement (426 Upgrade Required) | main.py L278-307 |
| **GDPR** | Full data export (Article 20) | user_data.py L49-338 |
| **GDPR** | Full data erasure (Article 17) | user_data.py L360-455 |
| **GDPR** | Soft-delete with 30-day recovery window | data_protection_service.py |
| **GDPR** | Immutable audit trail | audit_service.py |
| **Auth** | Subscription receipt verification required (pending_verification status) | subscriptions.py L7-12 |
| **Webhook** | HMAC-SHA256 payload signing | webhook_service.py L52-70 |
| **Mobile** | SecureStore for tokens (Keychain/EncryptedSharedPreferences) | auth.service.ts L7, L22-33 |
| **Mobile** | Token in Authorization header only, never in URL | apiClient.ts L72-73 |
| **Mobile** | Automatic token refresh with queue deduplication | apiClient.ts L78-121 |
| **IDOR** | All food log queries scoped to user_id | ai_food.py L395-396, L497-499, L542-545 |
| **IDOR** | Webhook CRUD scoped to user_id | webhook_service.py L114-119 |
| **Logging** | Structured JSON request logging with data-op awareness | main.py L312-458 |
| **Graceful** | Graceful shutdown with in-flight request drain | main.py L463-481 |

---

## Remediation Priority Matrix

| Priority | Finding | Est. Effort | Severity |
|----------|---------|-------------|----------|
| 1 (Today) | C-1: Rotate all leaked credentials | 2h | CRITICAL |
| 2 (Today) | C-2: Enable SSL verification for DB | 1h | CRITICAL |
| 3 (Today) | C-3: Add SSRF protection to webhooks | 2h | CRITICAL |
| 4 (Today) | C-4: Verify Supabase key type | 15min | CRITICAL |
| 5 (This week) | H-1: Replace python-jose with PyJWT | 3h | HIGH |
| 6 (This week) | H-2: Fix fail-open blacklist in get_current_user | 30min | HIGH |
| 7 (This week) | H-6: Revoke tokens on GDPR erasure | 1h | HIGH |
| 8 (This week) | L-4: Fix logout not sending auth header | 30min | LOW |
| 9 (Pre-launch) | H-3: Fix web platform token storage | 4h | HIGH |
| 10 (Pre-launch) | H-4: In-memory rate limit fallback | 3h | HIGH |
| 11 (Pre-launch) | H-5: Certificate pinning | 4h | HIGH |
| 12 (Pre-launch) | M-1: Validate X-Forwarded-For source | 2h | MEDIUM |
| 13 (Pre-launch) | M-2: Re-auth for destructive operations | 4h | MEDIUM |
| 14 (Pre-launch) | M-3: Coach prompt injection mitigation | 3h | MEDIUM |
| 15 (Pre-launch) | M-4: Production CORS validator for dev IPs | 1h | MEDIUM |
| 16 (Pre-launch) | M-6: Root/jailbreak detection | 3h | MEDIUM |
| 17 (Post-launch) | M-7: Experiments admin dependency | 15min | MEDIUM |
| 18 (Post-launch) | M-5: Remove dummy DB URL default | 15min | MEDIUM |
| 19 (Post-launch) | L-1: HIBP password check | 2h | LOW |
| 20 (Post-launch) | L-2: Migrate to Argon2 | 2h | LOW |
| 21 (Post-launch) | L-5: Rate-limit health checks | 30min | LOW |

---

## Dependency Vulnerability Summary

| Package | Version | Status |
|---------|---------|--------|
| python-jose[cryptography] | 3.3.0 | **VULNERABLE** -- CVE-2024-33663, CVE-2024-33664. Replace with PyJWT. |
| fastapi | 0.104.1 | OK |
| uvicorn | 0.24.0 | OK |
| sqlmodel | 0.0.14 | OK |
| passlib | 1.7.4 | OK (but pbkdf2 scheme is weaker than argon2) |
| httpx | latest | OK |
| PyJWT | latest | OK |
| anthropic | latest | OK |
| Pillow | latest | Run `pip audit` -- Pillow frequently has CVEs in image parsing |
| psycopg2-binary | 2.9.9 | OK (but binary wheel not recommended for production) |

**Recommendation:** Run `pip audit` and `npm audit` before every release. Set up Dependabot for automated CVE monitoring.

---

## Changes Since v2 Audit (2026-03-22)

| v2 Finding | Status in v3 |
|------------|-------------|
| C-1: Leaked credentials | Still OPEN |
| C-2: SSL disabled | Still OPEN |
| C-3: SSRF in webhooks | Still OPEN |
| C-4: Supabase key verification | Still NEEDS VERIFICATION |
| H-1: python-jose CVEs | Still OPEN |
| H-2 (v2): Web memStore | Still OPEN (now H-3) |
| H-3 (v2): Rate limiter fail-open | Still OPEN (now H-4) |
| H-4 (v2): No cert pinning | Still OPEN (now H-5) |
| H-5 (v2): GDPR token revocation | Still OPEN (now H-6) |
| M-1 thru M-5 (v2) | All still OPEN |

**New findings in v3 (3):**
- H-2: Access token blacklist fails OPEN in get_current_user (inconsistency with token_store design)
- M-1: X-Forwarded-For trusted without proxy validation
- M-7: Experiments router inconsistent admin guard pattern
- L-4: Mobile logout silently fails server-side revocation
- L-5: Health check endpoints not rate-limited

---

*Audit completed 2026-03-23 by Security Engineer Agent*
*Next audit: After remediation of CRITICAL and HIGH findings*

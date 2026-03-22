# Fitsi IA — Security Architecture

Last updated: 2026-03-22

---

## 1. Authentication

### Password-based (email/password)

- **Hashing**: PBKDF2-SHA256 with 600,000 rounds (OWASP 2023 recommendation).
  - Library: `passlib.context.CryptContext` (see `app/core/security.py`).
- **Password policy**: minimum 8 characters, at least one uppercase, one lowercase, one digit.
- **Brute force protection**: Account lockout after 5 failed login attempts (15-minute cooldown, Redis-backed).
- **User enumeration prevention**: Login and registration endpoints return generic error messages that do not reveal whether an email is registered.

### JWT tokens

- **Access tokens**: HS256, 30-minute expiry, include a unique `jti` claim for blacklisting.
  - Type-tagged (`"type": "access"`) to prevent refresh tokens from being used as access tokens.
- **Refresh tokens**: HS256, 30-day expiry, signed with a separate `REFRESH_SECRET_KEY`.
  - **Rolling rotation**: on each refresh, the old token is revoked and a new pair is issued.
  - **Reuse detection**: if a revoked refresh token is presented, ALL tokens for that user are revoked (potential theft signal).
- **Token blacklisting**: Redis-backed. If Redis is unavailable, the system degrades gracefully (tokens remain valid until expiry).
- **Secret key enforcement**: Both `SECRET_KEY` and `REFRESH_SECRET_KEY` must be >= 32 characters; the app refuses to start without them.

### OAuth (Apple / Google)

- **Apple Sign-In**: RS256 JWT verification using Apple's public JWKS. Audience claim is validated against `APPLE_CLIENT_ID`.
- **Google Sign-In**: Currently uses the `tokeninfo` endpoint (see Known TODOs below for migration plan).
- **User linking**: OAuth users are linked by `provider + provider_id`. If an email match is found, the existing account is linked to the new provider.

### Account deletion (GDPR Article 17)

- `DELETE /auth/me` deactivates the account and scrubs PII (email, name, password hash, provider ID).
- Deactivated users are rejected by `get_current_user` even if a valid token exists.

---

## 2. Rate Limiting

Rate limiting is provided by `slowapi` (backed by the in-memory Limiter). Limits are IP-based via `get_remote_address`.

| Endpoint | Limit | Rationale |
|----------|-------|-----------|
| `POST /auth/register` | 5/min | Prevent enumeration/spam |
| `POST /auth/login` | 10/min | Mitigate brute force |
| `POST /auth/refresh` | 20/min | Prevent token stuffing |
| `POST /auth/apple` | 10/min | OAuth abuse prevention |
| `POST /auth/google` | 10/min | OAuth abuse prevention |
| `POST /api/food/scan` | 10/min | AI cost control + abuse prevention |
| `GET /api/risk/*` (read) | 30/min | General API protection |
| `POST /api/risk/*` (write) | 10/min | Mutation rate control |
| `GET /api/ai/usage` | 30/min | General API protection |

Rate limiting is disabled in test/development environments to avoid flaky tests.

---

## 3. Middleware Security Stack

The middleware stack is ordered from outermost to innermost in `app/main.py`:

1. **CorrelationIDMiddleware** — Assigns `X-Request-ID` for request tracing.
2. **HTTPSRedirectMiddleware** — Redirects HTTP to HTTPS in production (respects `X-Forwarded-Proto`).
3. **SecurityHeadersMiddleware** — Adds:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Strict-Transport-Security` (production only, 2-year max-age with preload)
   - `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'` (production only)
   - Strips `Server` header to prevent version disclosure.
4. **AppVersionMiddleware** — Rejects clients below `MIN_APP_VERSION` with 426 Upgrade Required.
5. **RequestLoggingMiddleware** — Structured JSON logging of all requests (method, path, status, duration, user_id, request_id).
6. **PerformanceMiddleware** — Adds `X-Response-Time` header, logs slow requests.
7. **RequestValidationMiddleware** — Rejects oversized request bodies early.
8. **APIVersionMiddleware** — API versioning via `Accept-Version` header or URL prefix.
9. **ResponseCacheMiddleware** — Auto-invalidates cache on mutating requests.
10. **ETagMiddleware** — Returns 304 Not Modified when content is unchanged.
11. **IdempotencyMiddleware** — Deduplicates POST requests with `X-Idempotency-Key`.
12. **GZipMiddleware** — Compresses responses >= 500 bytes.
13. **CORSMiddleware** — Explicit origins, methods, and headers (never `*` in production).

---

## 4. CORS Policy

- **Development**: `http://localhost:8081` (Metro), `http://localhost:19006` (Expo web).
- **Production**: Must be explicitly set via `CORS_ORIGINS` environment variable. Wildcard `*` is rejected with a startup error.
- Methods: `GET, POST, PUT, DELETE, OPTIONS`.
- Headers: Explicit allowlist (`Authorization`, `Content-Type`, `Accept`, etc.).
- `allow_credentials: true`.

---

## 5. Circuit Breaker Pattern

External service calls (OpenAI, Claude) are protected by an in-memory circuit breaker (`app/core/circuit_breaker.py`):

- **States**: CLOSED (normal) -> OPEN (reject all) -> HALF_OPEN (probe).
- **Trip condition**: 5 failures within 60 seconds.
- **Recovery**: 30-second cooldown, then one probe request allowed.
- **Admin visibility**: `GET /api/circuit-breakers` shows all breaker states.

---

## 6. AI Cost Kill Switch

`AI_EXPENSIVE_ENABLED` (default: `true`) controls whether expensive AI models (Sonnet, Opus) are used.

- When set to `false`, all AI requests are downgraded to template/Haiku tier.
- Toggled via environment variable — no deploy required.
- Usage tracked at `GET /api/ai/usage`.

---

## 7. Data Protection

### Upload validation

- **Image uploads** (`POST /api/food/scan`):
  - MIME type check: only JPEG, PNG, WebP, HEIC/HEIF accepted.
  - Size limit: 10 MB maximum (enforced server-side after reading bytes).
  - Content type validated before processing.

### Input validation

- Pydantic models enforce numeric bounds on all food log fields (0-99,999 range).
- SQL LIKE wildcards (`%`, `_`) are escaped in food search queries.
- `meal_type` values are validated against a fixed allowlist.

### Free-tier quota enforcement

- Server-side scan limit (3/day for free users) is the authoritative gate.
- Client-side check is UX-only; the backend enforces the actual quota.

### Secrets management

- `.env` files are gitignored in both `backend/` and `mobile/`.
- `SECRET_KEY` and `REFRESH_SECRET_KEY` validation prevents startup with weak/missing keys.
- API keys (OpenAI, Anthropic, Supabase) are loaded from environment variables only.

---

## 8. Production Hardening

- **OpenAPI/Swagger docs disabled** in production (`docs_url`, `redoc_url`, `openapi_url` all set to `None`).
- **DATABASE_URL validator**: Logs a CRITICAL warning if production DATABASE_URL contains `localhost`, `127.0.0.1`, or default dummy credentials.
- **Graceful shutdown**: Drains in-flight requests (up to 30 seconds) before stopping.
- **Health endpoints**: `/health` and `/api/health` check DB, Redis, and service availability.

---

## 9. Known TODOs (address before production)

| Priority | File | Issue |
|----------|------|-------|
| **Medium** | `app/services/oauth_service.py` | Google token verification uses deprecated `tokeninfo` endpoint. Migrate to `google-auth` library's `id_token.verify_oauth2_token()` for local JWT verification. |
| **Medium** | `app/core/security.py` | Consider migrating from PBKDF2-SHA256 to argon2 or bcrypt for stronger GPU-attack resistance. Current 600K rounds are acceptable per OWASP. |
| **Medium** | `app/core/config.py` | Default DATABASE_URL contains dummy credentials. Consider requiring it explicitly (no default) in production. |
| **Low** | `app/routers/ai_food.py` | Rate limiting is IP-based. For production, upgrade to per-user limiting to prevent bypass via VPN/mobile IP rotation. |
| **Low** | `app/core/security.py` | Consider adding special character requirement to password policy or checking against breached password lists (HaveIBeenPwned API). |

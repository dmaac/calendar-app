---
name: P0 Security Remediation 2026-03-23
description: Six critical vulnerabilities fixed - SSL cert validation, fail-closed auth, SSRF blocking, rate limiter fallback, IP spoofing prevention, GDPR token revocation
type: project
---

On 2026-03-23, fixed all 6 P0 critical findings from the security audit:

1. **SSL CERT_NONE -> CERT_REQUIRED** in database.py: Now verifies server identity with system CA bundle. Supports custom CA via DATABASE_SSL_CA_FILE env var.

2. **Auth blacklist fail-closed** in auth.py: get_current_user now raises credentials_exception when blacklist check fails (any exception), instead of silently continuing.

3. **SSRF protection** in webhook_service.py: Added _validate_webhook_url() that resolves hostnames and blocks private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, link-local, IPv4-mapped IPv6). Validated at both creation and delivery time (DNS rebinding defense).

4. **Rate limiter in-memory fallback** in rate_limiter.py + auth.py: When Redis is unavailable, uses an in-memory sliding window instead of allowing all requests. Thread-safe with periodic cleanup.

5. **X-Forwarded-For hardening**: Created app/core/ip_utils.py with trusted proxy validation. Only trusts X-Forwarded-For from configured TRUSTED_PROXY_IPS, uses rightmost IP. Updated auth.py, rate_limiter.py, and audit_service.py to use centralized utility.

6. **GDPR erasure token revocation** in user_data.py: DELETE /api/user/data now captures the raw Bearer token and calls revoke_all_user_tokens() + blacklist_access_token() after data deletion.

**Why:** These were P0 critical vulnerabilities that could allow MITM on DB connections, auth bypass via blacklist evasion, internal network scanning via webhook SSRF, rate limit bypass during Redis outages, IP-based bypass via header spoofing, and continued access after GDPR erasure.

**How to apply:** Any future changes to auth, rate limiting, webhook delivery, or GDPR erasure must maintain these fail-closed security properties. When adding new IP-dependent features, use app/core/ip_utils.get_client_ip().

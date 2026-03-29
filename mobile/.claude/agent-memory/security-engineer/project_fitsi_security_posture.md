---
name: Fitsi IA Security Posture
description: Summary of Fitsi IA security posture as of 2026-03-21 — key controls in place and critical gaps requiring remediation before production launch.
type: project
---

Fitsi IA has a solid security baseline with token type separation, rolling refresh with reuse detection, SecureStore usage, security headers, AI output sanitization, and server-side quota enforcement.

**Why:** First comprehensive audit performed 2026-03-21. App is approaching production launch with App Store submission imminent.

**How to apply:**
- Three CRITICAL findings must be resolved before App Store submission: (1) devBypass function has no __DEV__ guard in body — callable in production, (2) account deletion UI is fake with no backend endpoint — GDPR/App Store violation, (3) secret key management needs vault integration for production.
- Five HIGH findings for pre-launch: LIKE injection in food search, optional rate limiting, no certificate pinning, no root/jailbreak detection, weak password policy.
- Backend .env is properly gitignored and NOT tracked in git (verified).
- Google OAuth token verification uses deprecated tokeninfo endpoint with audience check bypass when client_id is empty.
- Google OAuth nonce in mobile is hardcoded string "nonce" instead of random value.

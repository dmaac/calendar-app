# SPRINT-1 — App Store Submission
**Goal:** Ship Cal AI to the App Store. All code is complete; this sprint covers credentials, SDK integrations, infra, and store setup.
**Dates:** 2026-03-19 → 2026-04-02 (2 weeks)

---

## DONE

| # | Task | Assignee | Points | Priority | Notes |
|---|------|----------|--------|----------|-------|
| T01 | Full onboarding flow (30 steps) | frontend-agent | 8 | P0 | Phases 0–4 complete |
| T02 | Auth system (email, Apple, Google OAuth) | backend-agent | 5 | P0 | Phase 5.3 complete |
| T03 | AI food scan endpoint (GPT-4o + SHA256 cache) | backend-agent | 5 | P0 | Phase 5.4 complete |
| T04 | Main screens (Home, Scan, Log, Profile, Paywall) | frontend-agent | 8 | P0 | Phase 6 complete |
| T05 | Subscriptions backend + water tracking + manual log | backend-agent | 3 | P1 | Phase 7 complete |

---

## IN-PROGRESS

| # | Task | Assignee | Points | Priority | Notes |
|---|------|----------|--------|----------|-------|
| T06 | RevenueCat SDK integration | frontend-agent | 5 | P0 | Install `react-native-purchases`, wire `PaywallScreen.handleSubscribe`, create products in App Store Connect |
| T07 | Apple Sign In credentials | backend-agent | 3 | P0 | Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY in `backend/.env` |
| T08 | Production server + HTTPS (nginx + SSL) | devops-agent | 5 | P0 | Domain, reverse proxy, TLS cert; update API base URL in `mobile/src/services/api.ts` |

---

## TODO

| # | Task | Assignee | Points | Priority | Notes |
|---|------|----------|--------|----------|-------|
| T09 | OPENAI_API_KEY in production env | devops-agent | 1 | P0 | Add to `backend/.env`; required for AI scan to work |
| T10 | Google OAuth credentials (iOS + Android + Web) | frontend-agent | 2 | P1 | Set EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS/ANDROID/WEB in `mobile/.env` |
| T11 | App Store Connect setup (Bundle ID, provisioning, certs) | devops-agent | 3 | P0 | Bundle ID, signing certificates, provisioning profiles |
| T12 | Push notifications server (APNS + expo-server) | backend-agent | 3 | P1 | APNS certificate, expo-notifications server-side send |
| T13 | App Store metadata & screenshots | product-agent | 3 | P1 | Title, description, keywords, 6.5" + 5.5" screenshots |
| T14 | Privacy Policy & Terms of Service pages | product-agent | 2 | P0 | Required by App Store review; host at production domain |
| T15 | QA pass on physical device (iPhone) | qa-agent | 3 | P0 | End-to-end flow: onboarding → scan → paywall → subscription |

---

## Summary

| Status | Count | Points |
|--------|-------|--------|
| DONE | 5 | 29 |
| IN-PROGRESS | 3 | 13 |
| TODO | 7 | 17 |
| **Total** | **15** | **59** |

**P0 blockers remaining:** T06, T07, T08, T09, T11, T14, T15

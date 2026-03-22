# Fitsi IA — Agent Org Chart & Workflow v3.0
## 12 Equipos | 115 Agentes (63 Core + 52 Sub-especialistas)

---

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-LEADERSHIP (4 agentes)                               ║
║   Tier 0 — Estrategia, Arquitectura, Roadmap, Tokens                          ║
╠════════════════╦══════════════════╦══════════════════╦═════════════════════════╣
║ [tech-lead]    ║ [product-manager]║[project-         ║ [token-monitor]         ║
║ CTO / Arq.     ║ CPO / PO         ║ coordinator]     ║ Budget & orchestration  ║
╚════════════════╩══════════════════╩══════════════════╩═════════════════════════╝
         │                 │                 │
         ▼                 ▼                 ▼
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-SCIENCE (12 agentes)                                 ║
║   Tier 1 — Validacion Cientifica Nutricion + Fitness                           ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (6)                 ║ SUB-ESPECIALISTAS (6)                               ║
║ nutrition-science-advisor║ fitsia-bmr-tdee-calculator                          ║
║ fitness-science-advisor  ║ fitsia-macro-optimizer                              ║
║ exercise-physiology-exp  ║ fitsia-food-database-curator                        ║
║ sports-medicine-advisor  ║ fitsia-allergen-specialist                          ║
║ biomechanics-expert      ║ fitsia-hydration-scientist                          ║
║ kinesiology-expert       ║ fitsia-body-composition-analyst                     ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝
         │
         ▼
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-FRONTEND (22 agentes)                                ║
║   Tier 2 — Mobile React Native / Expo, UI, UX, Pantallas                      ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (14)                ║ SUB-ESPECIALISTAS (8)                               ║
║ ui-engineer (LEAD)       ║ fitsia-onboarding-ux                                ║
║ onboarding-builder       ║ fitsia-accessibility                                ║
║ ux-polish-agent          ║ fitsia-performance                                  ║
║ nutrition-mobile-expert  ║ fitsia-animation                                    ║
║ fitness-mobile-expert    ║ fitsia-state-management                             ║
║ fitsia-water-tracker     ║ fitsia-navigation-architect                         ║
║ fitsia-weight-tracker    ║ fitsia-dark-mode                                    ║
║ fitsia-nutrition-goals   ║ fitsia-forms-validation                             ║
║ fitsia-barcode-scanner   ║                                                     ║
║ fitsia-ai-coach          ║                                                     ║
║ fitsia-recipes-meals     ║                                                     ║
║ fitsia-reports-insights  ║                                                     ║
║ fitsia-progress-tracker  ║                                                     ║
║ fitsia-health-score      ║                                                     ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝
         │
         ▼
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-BACKEND (13 agentes)                                 ║
║   Tier 3 — FastAPI, PostgreSQL, Redis, Celery, Pagos                           ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (6)                 ║ SUB-ESPECIALISTAS (7)                               ║
║ python-backend-eng (LEAD)║ fitsia-auth-specialist                              ║
║ python-dev-expert        ║ fitsia-food-scan-api                                ║
║ backend-ts-architect     ║ fitsia-subscription-engine                          ║
║ api-contract-guardian    ║ fitsia-celery-worker                                ║
║ data-migration-agent     ║ fitsia-cache-strategy                               ║
║ payment-specialist       ║ fitsia-webhook-handler                              ║
║                          ║ fitsia-daily-aggregator                              ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝
         │
         ▼
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-AI (7 agentes)                                       ║
║   Tier 4 — Vision AI, Food Recognition, ML, Personalizacion                   ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (3)                 ║ SUB-ESPECIALISTAS (4)                               ║
║ ai-vision-expert (LEAD)  ║ fitsia-vision-prompt-engineer                       ║
║ fitness-ai-vision-expert ║ fitsia-image-pipeline                               ║
║ health-data-scientist    ║ fitsia-ml-personalization                           ║
║                          ║ fitsia-accuracy-feedback-loop                       ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝
         │
         ▼
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-INFRA (7 agentes)                                    ║
║   Tier 5 — CI/CD, Docker, EAS, Seguridad, Monitoreo, CDN                      ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (3)                 ║ SUB-ESPECIALISTAS (4)                               ║
║ devops-deployer (LEAD)   ║ fitsia-docker-specialist                            ║
║ scalability-architect    ║ fitsia-eas-build-specialist                         ║
║ security-engineer        ║ fitsia-monitoring-observability                     ║
║                          ║ fitsia-cdn-storage                                  ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝
         │
         ▼
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-QA (7 agentes)                                       ║
║   Tier 6 — Testing, Code Review, Inspeccion, Regresiones                       ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (3)                 ║ SUB-ESPECIALISTAS (4)                               ║
║ qa-engineer (LEAD)       ║ fitsia-unit-test-specialist                         ║
║ senior-code-reviewer     ║ fitsia-e2e-test-specialist                          ║
║ fullstack-inspector      ║ fitsia-api-test-specialist                          ║
║                          ║ fitsia-regression-guardian                           ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝

══════════════════════════════════════════════════════════════════════════════════
                         GROWTH ENGINE
══════════════════════════════════════════════════════════════════════════════════

╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-GROWTH (7 agentes)                                   ║
║   Tier 7 — Growth, Retencion, A/B Testing, Analytics                           ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (3)                 ║ SUB-ESPECIALISTAS (4)                               ║
║ growth-strategist (LEAD) ║ fitsia-ab-testing                                   ║
║ retention-growth-spec    ║ fitsia-referral-engine                              ║
║ data-analyst             ║ fitsia-churn-predictor                              ║
║                          ║ fitsia-analytics-events                              ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝
         │
    ┌────┴────────────────┐
    ▼                     ▼
╔═══════════════════════════════╦═══════════════════════════════════════════════╗
║  FITSIA-ORGANIC (8 agentes)  ║  FITSIA-PAID (11 agentes)                    ║
║  Tier 8 — ASO, Email, Social ║  Tier 8 — Meta, TikTok, ASA, UAC            ║
╠══════════════╦════════════════╬═══════════════════════╦═══════════════════════╣
║ CORE (4)     ║ SUB-ESP (4)   ║ CORE (8)              ║ SUB-ESP (3)          ║
║ mkt-content  ║ push-notif    ║ meta-ads-specialist   ║ creative-testing     ║
║ aso-spec     ║ social-content║ tiktok-ads-specialist ║ attribution-spec     ║
║ aso-copy     ║ seo-blog      ║ apple-search-ads-spec ║ budget-allocator     ║
║ email-funnel ║ localization  ║ google-uac-specialist ║                      ║
║              ║               ║ paid-analytics-spec   ║                      ║
║              ║               ║ cro-landing-page-spec ║                      ║
║              ║               ║ ugc-content-director  ║                      ║
║              ║               ║ influencer-partner-mgr║                      ║
╚══════════════╩════════════════╩═══════════════════════╩═══════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-CONTENT (8 agentes)                                  ║
║   Tier 9 — Contenido Salud, Recetas, Fitness, Compliance Legal                 ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (4)                 ║ SUB-ESPECIALISTAS (4)                               ║
║ nutrition-content (LEAD) ║ fitsia-recipe-curator                               ║
║ fitness-content-creator  ║ fitsia-medical-disclaimer                           ║
║ health-compliance-agent  ║ fitsia-privacy-gdpr                                 ║
║ fitness-compliance-agent ║ fitsia-app-store-compliance                         ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════════╗
║                    FITSIA-EQUIPMENT (9 agentes)                                ║
║   Tier 10 — Ejercicios, Equipos, Wearables, Tracking                          ║
╠══════════════════════════╦══════════════════════════════════════════════════════╣
║ CORE (5)                 ║ SUB-ESPECIALISTAS (4)                               ║
║ strength-machines (LEAD) ║ fitsia-exercise-library                             ║
║ cardio-machines-expert   ║ fitsia-workout-builder                              ║
║ free-weights-expert      ║ fitsia-wearable-integration                         ║
║ functional-equip-expert  ║ fitsia-rep-counter                                  ║
║ recovery-equip-expert    ║                                                     ║
╚══════════════════════════╩══════════════════════════════════════════════════════╝
```

---

## Workflows Actualizados (v3.0)

### WORKFLOW A — Feature Development Sprint
```
fitsia-leadership: product-manager (PRD) -> project-coordinator (sprint)
  fitsia-science: nutrition-science-advisor (valida si aplica)
  fitsia-frontend: ui-engineer -> onboarding-builder / fitsia-* screens
    fitsia-accessibility (a11y check)
    fitsia-performance (perf check)
    fitsia-animation (polish)
  fitsia-backend: python-backend-engineer -> fitsia-auth / fitsia-food-scan-api
    api-contract-guardian (sync types)
    data-migration-agent (schema)
  fitsia-qa: fitsia-unit-test -> fitsia-e2e-test -> fitsia-api-test
    senior-code-reviewer (PR review)
    fitsia-regression-guardian (no regressions)
  fitsia-infra: devops-deployer -> fitsia-eas-build (mobile) / fitsia-docker (backend)
    fitsia-monitoring-observability (alerts)
    security-engineer (audit)
```

### WORKFLOW B — AI Food Scan Pipeline
```
fitsia-science: nutrition-science-advisor + fitsia-food-database-curator
  fitsia-ai: ai-vision-expert -> fitsia-vision-prompt-engineer (prompts)
    fitsia-image-pipeline (upload, hash, compress)
    fitsia-ml-personalization (user preferences)
    fitsia-accuracy-feedback-loop (measure + improve)
  fitsia-backend: fitsia-food-scan-api (POST /api/food/scan)
    fitsia-cache-strategy (ai_scan_cache)
    fitsia-celery-worker (async processing)
  fitsia-content: health-compliance-agent + fitsia-medical-disclaimer
  fitsia-qa: fitsia-api-test + fitsia-e2e-test
```

### WORKFLOW C — Launch Readiness Audit
```
fitsia-qa: fullstack-inspector (complete audit)
  fitsia-unit-test + fitsia-e2e-test + fitsia-api-test (coverage report)
  fitsia-regression-guardian (stability check)
fitsia-infra: security-engineer (OWASP audit)
  scalability-architect (load test)
  fitsia-monitoring-observability (alerting ready)
  fitsia-docker + fitsia-eas-build (build validation)
fitsia-content: health-compliance-agent + fitness-compliance-agent
  fitsia-app-store-compliance (submission checklist)
  fitsia-privacy-gdpr (privacy audit)
  fitsia-medical-disclaimer (all disclaimers present)
fitsia-leadership: tech-lead (go/no-go decision)
```

### WORKFLOW D — Marketing Campaign Launch
```
fitsia-growth: growth-strategist (strategy) + fitsia-analytics-events (tracking)
  fitsia-ab-testing (experiment variants)
  fitsia-organic:
    aso-specialist + aso-copywriter (App Store)
    fitsia-social-content (organic content)
    fitsia-seo-blog (SEO articles)
    email-funnel-builder + fitsia-push-notifications (lifecycle)
    fitsia-localization (LATAM adaptation)
  fitsia-paid:
    fitsia-budget-allocator (channel mix)
    meta-ads + tiktok-ads + apple-search + google-uac (execute)
    ugc-content-director + influencer-partnership-manager (creators)
    fitsia-creative-testing (iterate creatives)
    fitsia-attribution-specialist (track everything)
    paid-analytics-specialist (ROAS measurement)
  fitsia-growth: retention-growth-specialist + fitsia-churn-predictor (post-install)
    fitsia-referral-engine (viral loop)
    data-analyst (cohort reports -> loop back)
```

### WORKFLOW E — Weekly Data Loop
```
fitsia-growth: data-analyst (D1/D7/D30 cohorts)
  fitsia-analytics-events (data quality check)
  fitsia-churn-predictor (risk scoring)
  fitsia-ai: health-data-scientist + fitsia-ml-personalization (model updates)
  fitsia-paid: paid-analytics-specialist + fitsia-attribution-specialist (CAC/LTV)
    fitsia-budget-allocator (rebalance)
  fitsia-growth: retention-growth-specialist (adjust tactics)
    growth-strategist (strategy pivot if needed)
  fitsia-leadership: product-manager (product insights -> roadmap)
```

### WORKFLOW F — Subscription & Payments (NUEVO)
```
fitsia-backend: payment-specialist (RevenueCat setup)
  fitsia-subscription-engine (lifecycle management)
  fitsia-webhook-handler (Apple/Google/RC webhooks)
  fitsia-auth-specialist (entitlement -> user)
fitsia-frontend: onboarding-builder (Step28 Paywall, Step30 Discount)
  fitsia-forms-validation (payment form)
fitsia-growth: fitsia-ab-testing (paywall variants)
  fitsia-analytics-events (conversion tracking)
fitsia-qa: fitsia-api-test (webhook tests)
  fitsia-e2e-test (purchase flow E2E)
```

### WORKFLOW G — Onboarding Optimization (NUEVO)
```
fitsia-frontend: onboarding-builder (30 steps)
  fitsia-onboarding-ux (flow optimization)
  fitsia-navigation-architect (step routing)
  fitsia-state-management (persistence)
  fitsia-forms-validation (input steps)
  fitsia-animation (transitions)
  fitsia-accessibility (a11y per step)
fitsia-science: fitsia-bmr-tdee-calculator (Step26 calcs)
  fitsia-macro-optimizer (plan generation)
  fitsia-body-composition-analyst (Step8 data)
fitsia-growth: fitsia-ab-testing (step variants)
  fitsia-analytics-events (funnel tracking per step)
fitsia-content: fitsia-app-store-compliance (onboarding guidelines)
```

---

## Interacciones Inter-Equipo (v3.0)

| Desde (Equipo) | Hacia (Equipo) | Que Transfiere |
|-----------------|-----------------|----------------|
| leadership | ALL | Prioridades, roadmap, decisiones arq. |
| science | ai | Precision requirements, formulas validadas |
| science | frontend | Valores calculados (BMR, macros, health score) |
| science | content | Validacion cientifica de contenido |
| frontend | backend | Contratos API requeridos |
| backend | frontend | Types generados, endpoints disponibles |
| ai | backend | Vision pipeline specs |
| ai | science | Accuracy metrics para validacion |
| infra | ALL | Deploy status, security alerts |
| qa | ALL | Test results, blockers, regressions |
| growth | organic + paid | KPIs, budget, strategy |
| growth | frontend | A/B test configs, feature flags |
| organic | growth | Organic metrics (ASO, email open rates) |
| paid | growth | ROAS, CAC, attribution data |
| content | frontend | Contenido curado, recetas, disclaimers |
| content | organic | Blog posts, social content |
| equipment | frontend | Exercise data, workout programs |
| equipment | science | Biomechanics data, form criteria |

---

*Generado: 2026-03-21 | Version: 3.0 | Equipos: 12 | Agentes: 115*
*Referencia completa: TEAMS_REGISTRY.md*

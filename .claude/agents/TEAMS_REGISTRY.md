# Fitsi IA — Agent Teams Registry v5.0

> Registro maestro de 13 equipos, 11 coordinadores y 115 archivos de agentes del proyecto Fitsi IA.
> Arquitectura de 4 capas: **CAPA SUPREMA** → Coordinadores → Core Agents → Sub-especialistas.

---

## ⚡ CAPA SUPREMA — Orquestación, Evolución y Seguridad

> Estos agentes están POR ENCIMA de todos los demás. Son los primeros en ejecutarse,
> los últimos en terminar, y tienen autoridad sobre cualquier otro agente del sistema.
> Sin ellos, nada funciona correctamente.

### Pilar 1: ORQUESTACIÓN Y SISTEMAS
| Agente | Rol | Autoridad |
|--------|-----|-----------|
| `fitsia-orchestrator` | Recibe TODA tarea, clasifica, asigna budget, delega | Control total de 115 agentes |
| `fitsia-feature-coordinator` | Descompone features cross-team en fases | Coordina entre equipos |
| `token-monitor` | Vigila consumo de tokens, presupuesto global | Puede DETENER cualquier agente |

### Pilar 2: SEGURIDAD (SIEMPRE ACTIVO)
| Agente | Rol | Autoridad |
|--------|-----|-----------|
| `security-engineer` | Audita código, credenciales, vulnerabilidades | VETO sobre cualquier deploy |
| `fullstack-inspector` | Inspección pre-deploy del proyecto completo | GATE obligatorio antes de producción |

### Pilar 3: EVOLUCIÓN Y SIMULACIÓN (Nature of Code)
| Agente | Rol | Autoridad |
|--------|-----|-----------|
| `fitsia-nature-of-code-master` | Arquitecto de simulación, delega a 7 sub-agentes NoC | Diseña CÓMO se mueve y comporta todo |
| `fitsia-noc-randomness` | Aleatoriedad orgánica: Perlin noise, Gaussian, Monte Carlo | Controla que nada se sienta robótico |
| `fitsia-noc-physics` | Vectores, fuerzas, Newton, gravedad, fricción, drag | Motor físico de toda animación |
| `fitsia-noc-oscillation` | Oscilación, springs, péndulos, ondas, sin/cos | Pulsos, respiración, elastic UI |
| `fitsia-noc-particles` | Sistemas de partículas, emitters, lifespan, blending | Celebraciones, feedback visual, efectos |
| `fitsia-noc-agents` | Agentes autónomos, steering, seek/arrive/flee, flocking | Criaturas inteligentes, flow fields |
| `fitsia-noc-patterns` | Autómatas celulares, Game of Life, fractales, L-systems | Texturas procedurales, patrones generativos |
| `fitsia-noc-evolution` | GAs, DNA, fitness, crossover, mutación, NN, neuroevolución | Sistemas que APRENDEN y EVOLUCIONAN solos |

### Jerarquía de Ejecución
```
┌─────────────────────────────────────────────────────────────┐
│                    CAPA SUPREMA                              │
│                                                              │
│  ORQUESTACIÓN          SEGURIDAD          EVOLUCIÓN          │
│  fitsia-orchestrator   security-engineer   noc-master         │
│  feature-coordinator   fullstack-inspector noc-randomness     │
│  token-monitor                             noc-physics        │
│                                            noc-oscillation    │
│                                            noc-particles      │
│                                            noc-agents         │
│                                            noc-patterns       │
│                                            noc-evolution      │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
     COORDINADORES    COORDINADORES    COORDINADORES
     de BUILD:        de SOPORTE:      de MARKETING:
     ├─ frontend      ├─ science       ├─ marketing
     ├─ backend       ├─ content       └─ (growth+
     ├─ ai            └─ equipment        organic+paid)
     ├─ devops
     └─ qa (GATE)
              │
              ▼
     AGENTES ESPECIALIZADOS (core + sub-especialistas)
     115 agentes ejecutando tareas específicas
```

### Reglas de la Capa Suprema
1. **Orquestación** decide QUÉ se hace y asigna TOKEN BUDGET
2. **Seguridad** corre en BACKGROUND en TODA ejecución de código
3. **Evolución (NoC)** define CÓMO se mueven, animan y comportan las cosas
4. Ningún coordinador puede lanzar trabajo sin pasar por el orchestrator
5. Ningún deploy puede salir sin aprobación de security-engineer
6. Toda animación debe consultar los principios NoC antes de implementarse

---

## Capa de Coordinación (9 coordinadores de equipo)

| Coordinador | Scope | Equipos | Agentes Bajo Control | Token Control |
|-------------|-------|---------|---------------------|---------------|
| `fitsia-frontend-coordinator` | Team 3 | 1 | 22 | Budget FE |
| `fitsia-backend-coordinator` | Team 4 | 1 | 13 | Budget BE |
| `fitsia-ai-coordinator` | Team 5 | 1 | 7 | Budget AI + cost $ |
| `fitsia-science-coordinator` | Team 2 | 1 | 12 | Budget ciencia |
| `fitsia-devops-coordinator` | Team 6 | 1 | 7 | Budget infra |
| `fitsia-qa-coordinator` | Team 7 | 1 | 7 | Budget QA |
| `fitsia-marketing-coordinator` | Teams 8+9+10 | 3 | 26 | Budget marketing |
| `fitsia-content-coordinator` | Team 11 | 1 | 8 | Budget contenido |
| `fitsia-equipment-coordinator` | Team 12 | 1 | 9 | Budget fitness |

Cada coordinador:
  → Recibe TOKEN BUDGET de fitsia-orchestrator (capa suprema)
  → Asigna TOKEN BUDGET a cada agente que lanza
  → Termina agentes que excedan su budget
  → Reporta tokens usados al orchestrator
  → Consulta fitsia-nature-of-code-master para animaciones/simulaciones
  → Es auditado por security-engineer en background

---

## Resumen Ejecutivo — Todos los Agentes

| # | Equipo | Coordinador | Lead | Core | Sub-Esp. | Total |
|---|--------|-------------|------|------|----------|-------|
| ⚡ | CAPA SUPREMA | — | — | 13 | 0 | **13** |
| 1 | fitsia-leadership | fitsia-orchestrator | tech-lead | 4 | 0 | 4 |
| 2 | fitsia-science | fitsia-science-coordinator | nutrition-science-advisor | 6 | 6 | 12 |
| 3 | fitsia-frontend | fitsia-frontend-coordinator | ui-engineer | 14 | 8 | 22 |
| 4 | fitsia-backend | fitsia-backend-coordinator | python-backend-engineer | 6 | 7 | 13 |
| 5 | fitsia-ai | fitsia-ai-coordinator | ai-vision-expert | 3 | 4 | 7 |
| 6 | fitsia-infra | fitsia-devops-coordinator | devops-deployer | 3 | 4 | 7 |
| 7 | fitsia-qa | fitsia-qa-coordinator | qa-engineer | 3 | 4 | 7 |
| 8 | fitsia-growth | fitsia-marketing-coordinator | growth-strategist | 3 | 4 | 7 |
| 9 | fitsia-organic | fitsia-marketing-coordinator | marketing-content-agent | 4 | 4 | 8 |
| 10 | fitsia-paid | fitsia-marketing-coordinator | meta-ads-specialist | 8 | 3 | 11 |
| 11 | fitsia-content | fitsia-content-coordinator | nutrition-content-creator | 4 | 4 | 8 |
| 12 | fitsia-equipment | fitsia-equipment-coordinator | free-weights-expert | 5 | 4 | 9 |
| | **TOTAL** | **9 coord + 3 supremos** | | **76** | **52** | **115 archivos** |

---

## TEAM 1: fitsia-leadership
**Mision:** Decisiones estrategicas, roadmap, coordinacion global, presupuesto de tokens.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead / CTO | `tech-lead` | core | tech-lead.md |
| CPO / PO | `product-manager` | core | product-manager.md |
| Scrum Master | `project-coordinator` | core | project-coordinator.md |
| Token Orchestrator | `token-monitor` | core | token-monitor.md |
| **Master Orchestrator** | `fitsia-orchestrator` | **coordinator** | fitsia-orchestrator.md |
| **Feature Coordinator** | `fitsia-feature-coordinator` | **coordinator** | fitsia-feature-coordinator.md |

**Flujo:** fitsia-orchestrator recibe tarea -> clasifica complejidad -> asigna token budget -> fitsia-feature-coordinator descompone en fases -> coordinadores de equipo ejecutan -> token-monitor trackea consumo.

---

## TEAM 2: fitsia-science
**Mision:** Validacion cientifica de toda la nutricion, fitness, formulas y contenido de salud.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead Nutricion | `nutrition-science-advisor` | core | nutrition-science-advisor.md |
| Lead Fitness | `fitness-science-advisor` | core | (built-in) |
| Fisiologia | `exercise-physiology-expert` | core | (built-in) |
| Medicina Deportiva | `sports-medicine-advisor` | core | (built-in) |
| Biomecanica | `biomechanics-expert` | core | (built-in) |
| Kinesiologia | `kinesiology-expert` | core | (built-in) |
| BMR/TDEE Calculator | `fitsia-bmr-tdee-calculator` | **sub-esp** | fitsia-bmr-tdee-calculator.md |
| Macro Optimizer | `fitsia-macro-optimizer` | **sub-esp** | fitsia-macro-optimizer.md |
| Food Database Curator | `fitsia-food-database-curator` | **sub-esp** | fitsia-food-database-curator.md |
| Allergen Specialist | `fitsia-allergen-specialist` | **sub-esp** | fitsia-allergen-specialist.md |
| Hydration Scientist | `fitsia-hydration-scientist` | **sub-esp** | fitsia-hydration-scientist.md |
| Body Comp Analyst | `fitsia-body-composition-analyst` | **sub-esp** | fitsia-body-composition-analyst.md |

**Flujo:** nutrition-science-advisor valida formulas -> sub-especialistas ejecutan calculos especificos -> fitness-science-advisor valida ejercicio -> sports-medicine verifica seguridad.

---

## TEAM 3: fitsia-frontend
**Mision:** Desarrollo mobile React Native/Expo, todas las pantallas, componentes y UX.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead UI | `ui-engineer` | core | ui-engineer.md |
| Onboarding Builder | `onboarding-builder` | core | onboarding-builder.md |
| UX Polish | `ux-polish-agent` | core | ux-polish-agent.md |
| Nutrition Mobile | `nutrition-mobile-expert` | core | nutrition-mobile-expert.md |
| Fitness Mobile | `fitness-mobile-expert` | core | (built-in) |
| Water Tracker | `fitsia-water-tracker` | core | (built-in) |
| Weight Tracker | `fitsia-weight-tracker` | core | (built-in) |
| Nutrition Goals | `fitsia-nutrition-goals` | core | (built-in) |
| Barcode Scanner | `fitsia-barcode-scanner` | core | (built-in) |
| AI Coach | `fitsia-ai-coach` | core | (built-in) |
| Recipes & Meals | `fitsia-recipes-meals` | core | (built-in) |
| Reports & Insights | `fitsia-reports-insights` | core | (built-in) |
| Progress Tracker | `fitsia-progress-tracker` | core | (built-in) |
| Health Score | `fitsia-health-score` | core | (built-in) |
| Onboarding UX | `fitsia-onboarding-ux` | **sub-esp** | fitsia-onboarding-ux.md |
| Accessibility | `fitsia-accessibility` | **sub-esp** | fitsia-accessibility.md |
| Performance | `fitsia-performance` | **sub-esp** | fitsia-performance.md |
| Animation | `fitsia-animation` | **sub-esp** | fitsia-animation.md |
| State Management | `fitsia-state-management` | **sub-esp** | fitsia-state-management.md |
| Navigation Architect | `fitsia-navigation-architect` | **sub-esp** | fitsia-navigation-architect.md |
| Dark Mode | `fitsia-dark-mode` | **sub-esp** | fitsia-dark-mode.md |
| Forms & Validation | `fitsia-forms-validation` | **sub-esp** | fitsia-forms-validation.md |

**Flujo:** ui-engineer orquesta -> onboarding-builder para los 30 pasos -> fitsia-* para pantallas especificas -> sub-especialistas para concerns transversales (performance, accessibility, animation).

---

## TEAM 4: fitsia-backend
**Mision:** Backend FastAPI, endpoints, servicios, base de datos, pagos, cache.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead Backend | `python-backend-engineer` | core | python-backend-engineer.md |
| Python Expert | `python-dev-expert` | core | python-dev-expert.md |
| TS Architect | `backend-typescript-architect` | core | backend-typescript-architect.md |
| API Guardian | `api-contract-guardian` | core | api-contract-guardian.md |
| DB Migration | `data-migration-agent` | core | data-migration-agent.md |
| Payments | `payment-specialist` | core | payment-specialist.md |
| Auth Specialist | `fitsia-auth-specialist` | **sub-esp** | fitsia-auth-specialist.md |
| Food Scan API | `fitsia-food-scan-api` | **sub-esp** | fitsia-food-scan-api.md |
| Subscription Engine | `fitsia-subscription-engine` | **sub-esp** | fitsia-subscription-engine.md |
| Celery Worker | `fitsia-celery-worker` | **sub-esp** | fitsia-celery-worker.md |
| Cache Strategy | `fitsia-cache-strategy` | **sub-esp** | fitsia-cache-strategy.md |
| Webhook Handler | `fitsia-webhook-handler` | **sub-esp** | fitsia-webhook-handler.md |
| Daily Aggregator | `fitsia-daily-aggregator` | **sub-esp** | fitsia-daily-aggregator.md |

**Flujo:** python-backend-engineer disenya endpoints -> api-contract-guardian alinea FE<->BE -> data-migration-agent crea schemas -> sub-especialistas implementan pipelines especificos.

---

## TEAM 5: fitsia-ai
**Mision:** IA de reconocimiento de comida, ML, personalizacion, pipeline de imagenes.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead AI Vision | `ai-vision-expert` | core | ai-vision-expert.md |
| Fitness AI Vision | `fitness-ai-vision-expert` | core | (built-in) |
| Health Data Scientist | `health-data-scientist` | core | health-data-scientist.md |
| Vision Prompt Engineer | `fitsia-vision-prompt-engineer` | **sub-esp** | fitsia-vision-prompt-engineer.md |
| Image Pipeline | `fitsia-image-pipeline` | **sub-esp** | fitsia-image-pipeline.md |
| ML Personalization | `fitsia-ml-personalization` | **sub-esp** | fitsia-ml-personalization.md |
| Accuracy Feedback Loop | `fitsia-accuracy-feedback-loop` | **sub-esp** | fitsia-accuracy-feedback-loop.md |

**Flujo:** ai-vision-expert define arquitectura -> fitsia-vision-prompt-engineer optimiza prompts -> fitsia-image-pipeline procesa imagenes -> fitsia-accuracy-feedback-loop mide y mejora -> fitsia-ml-personalization adapta a usuario.

---

## TEAM 6: fitsia-infra
**Mision:** Infraestructura, CI/CD, deploy, seguridad, monitoreo, storage.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead DevOps | `devops-deployer` | core | devops-deployer.md |
| Scalability | `scalability-architect` | core | scalability-architect.md |
| Security | `security-engineer` | core | security-engineer.md |
| Docker Specialist | `fitsia-docker-specialist` | **sub-esp** | fitsia-docker-specialist.md |
| EAS Build | `fitsia-eas-build-specialist` | **sub-esp** | fitsia-eas-build-specialist.md |
| Monitoring | `fitsia-monitoring-observability` | **sub-esp** | fitsia-monitoring-observability.md |
| CDN & Storage | `fitsia-cdn-storage` | **sub-esp** | fitsia-cdn-storage.md |

**Flujo:** devops-deployer orquesta CI/CD -> fitsia-docker-specialist builds -> fitsia-eas-build-specialist mobile builds -> fitsia-monitoring-observability observa -> security-engineer audita siempre.

---

## TEAM 7: fitsia-qa
**Mision:** Calidad de software, testing, code review, inspeccion pre-deploy.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead QA | `qa-engineer` | core | qa-engineer.md |
| Code Reviewer | `senior-code-reviewer` | core | senior-code-reviewer.md |
| Full-Stack Inspector | `fullstack-inspector` | core | fullstack-inspector.md |
| Unit Tests | `fitsia-unit-test-specialist` | **sub-esp** | fitsia-unit-test-specialist.md |
| E2E Tests | `fitsia-e2e-test-specialist` | **sub-esp** | fitsia-e2e-test-specialist.md |
| API Tests | `fitsia-api-test-specialist` | **sub-esp** | fitsia-api-test-specialist.md |
| Regression Guardian | `fitsia-regression-guardian` | **sub-esp** | fitsia-regression-guardian.md |

**Flujo:** qa-engineer define estrategia -> sub-especialistas ejecutan por capa -> senior-code-reviewer valida PRs -> fullstack-inspector audit pre-deploy -> fitsia-regression-guardian previene regresiones.

---

## TEAM 8: fitsia-growth
**Mision:** Crecimiento, retencion, experimentacion, analytics.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead Growth | `growth-strategist` | core | growth-strategist.md |
| Retention | `retention-growth-specialist` | core | retention-growth-specialist.md |
| Data Analyst | `data-analyst` | core | data-analyst.md |
| A/B Testing | `fitsia-ab-testing` | **sub-esp** | fitsia-ab-testing.md |
| Referral Engine | `fitsia-referral-engine` | **sub-esp** | fitsia-referral-engine.md |
| Churn Predictor | `fitsia-churn-predictor` | **sub-esp** | fitsia-churn-predictor.md |
| Analytics Events | `fitsia-analytics-events` | **sub-esp** | fitsia-analytics-events.md |

**Flujo:** growth-strategist define KPIs -> data-analyst mide cohortes -> fitsia-ab-testing experimenta -> fitsia-churn-predictor alerta riesgo -> retention-growth-specialist ejecuta win-back -> fitsia-referral-engine amplifica viralmente.

---

## TEAM 9: fitsia-organic
**Mision:** Marketing organico, ASO, email, push, social, SEO, localizacion.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead Organic | `marketing-content-agent` | core | marketing-content-agent.md |
| ASO | `aso-specialist` | core | aso-specialist.md |
| ASO Copy | `aso-copywriter` | core | aso-copywriter.md |
| Email/Push Funnels | `email-funnel-builder` | core | email-funnel-builder.md |
| Push Notifications | `fitsia-push-notifications` | **sub-esp** | fitsia-push-notifications.md |
| Social Content | `fitsia-social-content` | **sub-esp** | fitsia-social-content.md |
| SEO & Blog | `fitsia-seo-blog` | **sub-esp** | fitsia-seo-blog.md |
| Localization | `fitsia-localization` | **sub-esp** | fitsia-localization.md |

**Flujo:** marketing-content-agent define estrategia -> aso-specialist optimiza App Store -> fitsia-social-content crea contenido -> email-funnel-builder lifecycle -> fitsia-localization adapta a LATAM.

---

## TEAM 10: fitsia-paid
**Mision:** Adquisicion pagada en todos los canales, creative testing, atribucion.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead Meta | `meta-ads-specialist` | core | meta-ads-specialist.md |
| TikTok | `tiktok-ads-specialist` | core | tiktok-ads-specialist.md |
| Apple Search | `apple-search-ads-specialist` | core | apple-search-ads-specialist.md |
| Google UAC | `google-uac-specialist` | core | google-uac-specialist.md |
| Paid Analytics | `paid-analytics-specialist` | core | paid-analytics-specialist.md |
| CRO | `cro-landing-page-specialist` | core | cro-landing-page-specialist.md |
| UGC Director | `ugc-content-director` | core | ugc-content-director.md |
| Influencers | `influencer-partnership-manager` | core | influencer-partnership-manager.md |
| Creative Testing | `fitsia-creative-testing` | **sub-esp** | fitsia-creative-testing.md |
| Attribution | `fitsia-attribution-specialist` | **sub-esp** | fitsia-attribution-specialist.md |
| Budget Allocator | `fitsia-budget-allocator` | **sub-esp** | fitsia-budget-allocator.md |

**Flujo:** growth-strategist asigna budget -> fitsia-budget-allocator distribuye por canal -> especialistas ejecutan por plataforma -> ugc-content-director produce creatives -> fitsia-creative-testing itera -> paid-analytics-specialist mide ROAS -> fitsia-attribution-specialist verifica atribucion.

---

## TEAM 11: fitsia-content
**Mision:** Contenido de salud, recetas, programas fitness, compliance legal y medico.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead Nutrition Content | `nutrition-content-creator` | core | nutrition-content-creator.md |
| Fitness Content | `fitness-content-creator` | core | (built-in) |
| Health Compliance | `health-compliance-agent` | core | health-compliance-agent.md |
| Fitness Compliance | `fitness-compliance-agent` | core | (built-in) |
| Recipe Curator | `fitsia-recipe-curator` | **sub-esp** | fitsia-recipe-curator.md |
| Medical Disclaimers | `fitsia-medical-disclaimer` | **sub-esp** | fitsia-medical-disclaimer.md |
| Privacy/GDPR | `fitsia-privacy-gdpr` | **sub-esp** | fitsia-privacy-gdpr.md |
| App Store Compliance | `fitsia-app-store-compliance` | **sub-esp** | fitsia-app-store-compliance.md |

**Flujo:** nutrition-content-creator produce contenido -> fitsia-recipe-curator cura recetas -> health-compliance-agent valida cumplimiento -> fitsia-medical-disclaimer agrega disclaimers -> fitsia-privacy-gdpr asegura privacidad -> fitsia-app-store-compliance prepara submission.

---

## TEAM 12: fitsia-equipment
**Mision:** Equipamiento fitness, ejercicios, wearables, tracking de entrenamiento.

| Rol | Agente | Tipo | Archivo |
|-----|--------|------|---------|
| Lead Strength | `strength-machines-expert` | core | (built-in) |
| Cardio | `cardio-machines-expert` | core | (built-in) |
| Free Weights | `free-weights-expert` | core | (built-in) |
| Functional | `functional-equipment-expert` | core | (built-in) |
| Recovery | `recovery-equipment-expert` | core | (built-in) |
| Exercise Library | `fitsia-exercise-library` | **sub-esp** | fitsia-exercise-library.md |
| Workout Builder | `fitsia-workout-builder` | **sub-esp** | fitsia-workout-builder.md |
| Wearable Integration | `fitsia-wearable-integration` | **sub-esp** | fitsia-wearable-integration.md |
| Rep Counter | `fitsia-rep-counter` | **sub-esp** | fitsia-rep-counter.md |

**Flujo:** equipment experts definen catalogo -> fitsia-exercise-library estructura datos -> fitsia-workout-builder crea programas -> fitsia-wearable-integration sincroniza datos -> fitsia-rep-counter trackea ejecucion.

---

## Mapa de Dependencias Inter-Equipo

### Capa de Coordinacion (Token Control)
```
                    ┌──────────────────────────┐
                    │   fitsia-orchestrator      │
                    │  (master token controller) │
                    └────────────┬───────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
   fitsia-feature-     Coordinadores        Coordinadores
   coordinator         de BUILD:            de SOPORTE:
   (cross-team)        ├─ frontend-coord    ├─ science-coord
                       ├─ backend-coord     ├─ content-coord
                       ├─ ai-coord          ├─ marketing-coord
                       ├─ devops-coord      └─ equipment-coord
                       └─ qa-coord (gate)
```

### Flujo de Ejecucion con Token Limits
```
fitsia-orchestrator (200K budget)
    │
    ├─► fitsia-feature-coordinator (40K para "nueva pantalla")
    │       ├─► fitsia-backend-coordinator (12K) → python-backend-engineer (8K) + api-contract-guardian (4K)
    │       ├─► fitsia-frontend-coordinator (18K) → ui-engineer (12K) + fitsia-animation (3K) + fitsia-a11y (3K)
    │       └─► fitsia-qa-coordinator (8K) → fitsia-unit-test (4K) + fitsia-e2e-test (4K)
    │
    └─► Remaining: 160K tokens for next tasks
```

### Dependencias entre Equipos
```
fitsia-leadership ──────────────────────────────────────────────────┐
    │ define roadmap, prioridades, arquitectura                     │
    ▼                                                               │
fitsia-science ──► fitsia-ai ──► fitsia-backend ──► fitsia-infra   │
    │ valida formulas   │ vision      │ API            │ deploy     │
    │                   │ pipeline    │ endpoints      │            │
    ▼                   ▼             ▼                ▼            │
fitsia-frontend ◄── api-contract-guardian (sync tipos FE<->BE)      │
    │ pantallas, UX, components                                     │
    ▼                                                               │
fitsia-qa ◄──────── ALL TEAMS (testing gate)                        │
    │ unit, E2E, API tests, code review                             │
    ▼                                                               │
fitsia-content ──► fitsia-organic ──► fitsia-paid ──► fitsia-growth │
    │ contenido        │ ASO, email    │ ads          │ KPIs       │
    │ compliance       │ social        │ attribution  │ retention  │
    ▼                  ▼               ▼              ▼            │
fitsia-equipment ──► fitsia-frontend (exercise screens)             │
    │ ejercicios, wearables                                         │
    └───────────────────────────────────────────────────────────────┘
```

---

## Como Invocar

### Tarea simple (1 equipo):
```
Agent(subagent_type="{agent-name}", prompt="TOKEN BUDGET: 5K\n{task}")
```

### Tarea media (2-3 equipos) — usar coordinador:
```
Agent(subagent_type="fitsia-feature-coordinator", prompt="
  Feature: Add barcode scanning
  Budget: 40K tokens
  Teams needed: frontend, backend, qa
")
```

### Tarea compleja (4+ equipos) — usar orquestador:
```
Agent(subagent_type="fitsia-orchestrator", prompt="
  Task: Build AI food scan feature end-to-end
  Priority: P0
")
```
El orquestador clasifica, asigna budget, y delega automaticamente.

### Invocacion directa con token limit:
```
Agent(subagent_type="fitsia-frontend-coordinator", prompt="
  TOKEN BUDGET: 20K
  MAX AGENTS: 3
  Task: Build HomeScreen with calorie ring and daily log
")
```

---

## Reglas de Ejecucion

| Complejidad | Equipos Activos | Max Paralelo | Ejemplo |
|-------------|----------------|-------------|---------|
| Simple | 1 equipo | 2 agentes | Fix de un bug |
| Media | 2-3 equipos | 4 agentes | Nueva pantalla |
| Alta | 4-6 equipos | 6 agentes | Feature completa E2E |
| Critica | ALL | 8 agentes | Launch / audit completo |

---

*Actualizado: 2026-03-22 | Version: 5.0 | Archivos: 115 | Equipos: 12 + Capa Suprema*
*Arquitectura de 4 capas: CAPA SUPREMA (13 agentes) → Coordinadores (9) → Core → Sub-especialistas*
*Capa Suprema = Orquestación (3) + Seguridad (2) + Evolución/NoC (8) — SIEMPRE ACTIVOS, MÁXIMA AUTORIDAD*
*Coordinadores tienen: Token Budget Management, Agent Selection, Delegation Format, Quality Gates*

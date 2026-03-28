# Fitsi IA -- Comprehensive Stress Test Plan

> Version: 2.0
> Date: 2026-03-22
> Author: Stress Test Architect (Backend Load Testing Agent)
> Runner: `backend/scripts/stress_test_v2.py`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Infrastructure Constraints](#2-infrastructure-constraints)
3. [Endpoint Priority Matrix](#3-endpoint-priority-matrix)
4. [Test Scenarios](#4-test-scenarios)
5. [Pass/Fail Criteria](#5-passfail-criteria)
6. [Pre-requisites](#6-pre-requisites)
7. [Execution Guide](#7-execution-guide)
8. [Rate Limiter Strategy](#8-rate-limiter-strategy)
9. [Baseline Recording Protocol](#9-baseline-recording-protocol)
10. [Known Bottlenecks and Mitigations](#10-known-bottlenecks-and-mitigations)

---

## 1. Executive Summary

This plan defines 10 stress test scenarios for the Fitsi IA backend API, ranging from
a 10-user smoke test to a 1000-user stress test and specialized bottleneck probes.
The test runner (`stress_test_v2.py`) is a standalone Python script that uses only
`httpx` (already in requirements.txt) and the standard library. No external
dependencies such as Locust or k6 are required.

Each scenario specifies user count, ramp-up profile, duration, target RPS,
endpoints exercised, and quantitative pass/fail criteria.

---

## 2. Infrastructure Constraints

These are the hard limits that dictate our test ceilings.

| Resource              | Limit                    | Notes                                      |
|-----------------------|--------------------------|----------------------------------------------|
| Gunicorn workers      | 8 (UvicornWorker)        | 120s timeout, recycle at 2000 req/worker     |
| DB pool baseline      | 20 connections           | Configurable via `DB_POOL_SIZE`              |
| DB pool overflow      | +40 connections          | Total max = 60, controlled by `DB_MAX_OVERFLOW` |
| DB pool timeout       | 30s                      | Requests queue for a connection up to 30s    |
| Redis max connections | 50                       | 512 MB memory in production                  |
| Backend Docker (prod) | 2 CPUs, 1 GB RAM         | OOM kill at ~1 GB RSS                        |
| Rate limits (auth)    | 5/min register, 10/min login | IP-based via slowapi                     |
| Rate limits (scan)    | 10/min per IP            | Plus free-tier: 3 scans/day/user             |
| Max payload (scan)    | 10 MB                    | HEIC/JPEG/PNG/WebP only                      |

### Derived Theoretical Ceiling

With 8 workers and an average response time of ~50ms (baseline):
- Theoretical max RPS = 8 workers * (1000ms / 50ms) = ~160 RPS
- With I/O-bound async handlers, actual ceiling is likely 300-500 RPS before degradation.
- DB connection pool (60 max) is the binding constraint under sustained load.

---

## 3. Endpoint Priority Matrix

### Critical Path (must respond < 200ms at p50)

These are hit on every app session open. Latency here directly affects perceived performance.

| Endpoint                              | Method | Auth | DB Heavy | Notes                    |
|---------------------------------------|--------|------|----------|--------------------------|
| `POST /auth/login`                    | POST   | No   | Yes      | Rate limited 10/min      |
| `GET /auth/me`                        | GET    | Yes  | Yes      | Every screen transition  |
| `GET /api/dashboard/today`            | GET    | Yes  | Yes      | Home screen              |
| `GET /api/food/logs?date=YYYY-MM-DD`  | GET    | Yes  | Yes      | Main feed                |
| `GET /meals/summary?target_date=...`  | GET    | Yes  | Yes      | Calorie ring             |
| `GET /api/onboarding/profile`         | GET    | Yes  | Yes      | Profile + targets        |

### Revenue Path (must never fail under load)

Failures here lose money. Zero tolerance for 5xx.

| Endpoint                              | Method | Auth | DB Heavy | Notes                    |
|---------------------------------------|--------|------|----------|--------------------------|
| `POST /api/food/scan`                 | POST   | Yes  | Yes + AI | AI provider call, 10/min |
| `POST /api/food/manual`              | POST   | Yes  | Yes      | Manual meal logging      |
| `GET /api/subscriptions/current`      | GET    | Yes  | Yes      | Paywall gate             |
| `POST /auth/register`                | POST   | No   | Yes      | New user conversion      |
| `POST /api/onboarding/save-step`     | POST   | Yes  | Yes      | Onboarding funnel        |

### Standard (must respond < 500ms at p50)

| Endpoint                              | Method | Auth | DB Heavy | Notes                    |
|---------------------------------------|--------|------|----------|--------------------------|
| `GET /api/food/search?q=...`          | GET    | Yes  | Yes      | Typeahead search         |
| `GET /foods/?offset=0&limit=20`       | GET    | Yes  | Moderate | Paginated catalog        |
| `GET /nutrition-profile/`             | GET    | Yes  | Yes      | Macro targets            |
| `POST /api/food/water`               | POST   | Yes  | Yes      | Water tracking           |
| `GET /api/favorites/`                | GET    | Yes  | Yes      | Quick-log favorites      |
| `GET /api/calories/balance`           | GET    | Yes  | Yes      | Calorie balance          |
| `GET /api/workouts/`                 | GET    | Yes  | Yes      | Workout history          |
| `GET /api/insights/daily`            | GET    | Yes  | Yes      | Daily tips               |
| `GET /api/progress/status`           | GET    | Yes  | Yes      | XP, streaks, level       |
| `GET /api/recommendations`           | GET    | Yes  | Yes      | Meal suggestions         |

### Background (can tolerate < 3000ms at p95)

| Endpoint                              | Method | Auth | DB Heavy | Notes                    |
|---------------------------------------|--------|------|----------|--------------------------|
| `GET /api/export/csv`                | GET    | Yes  | Heavy    | Data export              |
| `GET /api/export/json`               | GET    | Yes  | Heavy    | GDPR export              |
| `GET /api/analytics/summary`         | GET    | Admin| Heavy    | Admin dashboard          |
| `GET /api/risk/daily`                | GET    | Yes  | Heavy    | Risk calculation         |
| `GET /api/alerts/daily`             | GET    | Yes  | Moderate | Alert evaluation         |
| `GET /api/health/alerts`            | GET    | Yes  | Moderate | Health alerts            |
| `GET /health`                        | GET    | No   | Light    | LB probe                 |

---

## 4. Test Scenarios

### Scenario 1: Smoke Test

**Purpose:** Verify all endpoints are reachable and return correct status codes.
No performance assertions -- purely functional.

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 10                                   |
| Ramp-up         | All 10 simultaneously                |
| Duration        | 30 seconds                           |
| Expected RPS    | ~5-10                                |
| Endpoints       | All Critical + Revenue + Standard    |
| Pass criteria   | 0% error rate, all endpoints return 2xx/3xx |
| Fail criteria   | Any 5xx or connection refused        |

### Scenario 2: Baseline Load

**Purpose:** Establish performance baselines for all endpoints. These numbers
become the reference for regression detection.

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 50                                   |
| Ramp-up         | 10 users/second over 5 seconds       |
| Duration        | 60 seconds                           |
| Expected RPS    | 30-60                                |
| Endpoints       | All Critical Path + Revenue Path     |
| Pass criteria   | p50 < 100ms, p95 < 300ms, p99 < 800ms, error < 0.5% |
| Fail criteria   | p95 > 500ms or error > 1%            |

**Output:** Baseline numbers are saved to the JSON report and should be
committed to `backend/results/baselines/` for CI comparison.

### Scenario 3: Normal Load

**Purpose:** Simulate typical daily usage during business hours.

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 200                                  |
| Ramp-up         | 20 users/second over 10 seconds      |
| Duration        | 120 seconds                          |
| Expected RPS    | 100-200                              |
| Endpoints       | Weighted mix: 40% dashboard/meals, 25% food logs, 15% profile, 10% search, 10% misc |
| Pass criteria   | p50 < 200ms, p95 < 800ms, p99 < 2000ms, error < 1% |
| Fail criteria   | p95 > 1000ms or error > 2%           |

### Scenario 4: Peak Load

**Purpose:** Simulate peak hour traffic (lunch time, most users logging food).

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 500                                  |
| Ramp-up         | 50 users/second over 10 seconds      |
| Duration        | 120 seconds                          |
| Expected RPS    | 200-400                              |
| Endpoints       | Heavy on writes: 30% manual log, 20% dashboard, 20% food logs, 15% search, 15% misc |
| Pass criteria   | p50 < 300ms, p95 < 1500ms, p99 < 3000ms, error < 2% |
| Fail criteria   | p95 > 3000ms or error > 5%           |

### Scenario 5: Stress Test

**Purpose:** Find the degradation point. Push beyond expected capacity.

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 1000                                 |
| Ramp-up         | 100 users/second over 10 seconds     |
| Duration        | 180 seconds                          |
| Expected RPS    | 300-600                              |
| Endpoints       | Full mix with emphasis on DB-heavy endpoints |
| Pass criteria   | p50 < 500ms, p95 < 3000ms, error < 5% |
| Fail criteria   | p95 > 5000ms or error > 10% or server crash |

**Critical observations to record:**
- At what user count does p95 cross 1000ms?
- At what user count do DB pool exhaustion errors (HTTP 500) appear?
- Memory usage trajectory (check via /health endpoint inflight_requests).

### Scenario 6: Spike Test

**Purpose:** Simulate a sudden traffic spike (viral event, push notification blast).

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 500 (instant)                        |
| Ramp-up         | 0 to 500 in 1 second (no ramp)      |
| Duration        | 60 seconds                           |
| Expected RPS    | 300-500 burst, settling to 200-300   |
| Endpoints       | Dashboard + food logs (what users do when opening from a push) |
| Pass criteria   | Server recovers within 10s, no crash, error < 10% in first 10s, < 2% after |
| Fail criteria   | Server unreachable for > 5s, or does not recover |

### Scenario 7: Soak Test

**Purpose:** Detect memory leaks, connection leaks, and gradual degradation.

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 200                                  |
| Ramp-up         | 20 users/second over 10 seconds      |
| Duration        | 1800 seconds (30 minutes)            |
| Expected RPS    | 100-200 sustained                    |
| Endpoints       | Full realistic mix                   |
| Pass criteria   | p95 at minute 30 is within 20% of p95 at minute 5, error rate stable |
| Fail criteria   | p95 increases > 50% over the run, or error rate trends upward |

**Health check monitoring:** The runner polls `/health` every 30 seconds during this
test and records `inflight_requests`, `db_connected`, `redis_connected` in a time series.

### Scenario 8: Rate Limit Stress

**Purpose:** Verify that rate limiting correctly throttles abusive clients
without affecting legitimate traffic.

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 20                                   |
| Ramp-up         | Instant                              |
| Duration        | 60 seconds                           |
| Expected RPS    | 50-100                               |
| Endpoints       | Only auth endpoints: `/auth/login`, `/auth/register`, `/auth/refresh` |
| Pass criteria   | > 50% of requests beyond limit receive 429, zero 5xx |
| Fail criteria   | Rate limiter does not trigger, or causes 5xx |

**Methodology:** Each virtual user fires rapid sequential requests (no wait time)
to trigger the per-IP rate limits. The test counts how many 429 vs 200 responses
are received.

### Scenario 9: AI Scan Bottleneck

**Purpose:** Test the food scan pipeline under concurrent load. Since AI calls
take 2-5 seconds each, this probes worker starvation.

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 50                                   |
| Ramp-up         | 10 users/second                      |
| Duration        | 120 seconds                          |
| Expected RPS    | 5-20 (scan is slow by nature)        |
| Endpoints       | `POST /api/food/scan` only (with 1x1px test image) |
| Pass criteria   | p50 < 5000ms, p95 < 15000ms, error < 10% |
| Fail criteria   | Timeouts > 30s or worker deadlock    |

**Note:** This test uses a minimal valid JPEG (1x1 pixel) to avoid AI provider
costs. The purpose is to stress the upload pipeline, file processing, DB writes,
and worker concurrency -- not the AI model itself. If the AI provider is mocked
or returns cached results, the latency targets should be adjusted downward.

### Scenario 10: Database Connection Exhaustion

**Purpose:** Deliberately max out the DB pool (60 connections) and observe
behavior -- does the app gracefully queue, timeout with 503, or crash?

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Users           | 200                                  |
| Ramp-up         | All 200 simultaneously               |
| Duration        | 60 seconds                           |
| Expected RPS    | 100-300                              |
| Endpoints       | Only DB-heavy endpoints: `/api/export/csv`, `/meals/summary`, `/api/food/logs` |
| Pass criteria   | Server returns 503 or queues gracefully, no crash, recovery within 10s after load drops |
| Fail criteria   | Server crashes, or connections leak after test ends |

**Health monitoring:** After the test completes, the runner waits 15 seconds and
then checks `/health` to verify DB shows "connected" (no leaked connections).

---

## 5. Pass/Fail Criteria

### Global Thresholds

These apply to all scenarios unless the scenario specifies stricter targets.

| Metric                      | Threshold         | Severity     |
|-----------------------------|-------------------|--------------|
| p50 latency                 | < 200ms           | Warning      |
| p95 latency                 | < 1000ms          | Failure      |
| p99 latency                 | < 3000ms          | Failure      |
| Error rate (non-429)        | < 1%              | Failure      |
| Zero 5xx under normal load  | 0 occurrences     | Critical     |
| DB connections              | Never exceed 55/60 | Warning at 50 |
| Health endpoint             | Always returns 200 | Critical     |
| Server recovery after spike | Within 10 seconds | Failure      |

### Per-Tier Latency Targets

| Endpoint Tier   | p50 Target | p95 Target | p99 Target |
|-----------------|------------|------------|------------|
| Critical Path   | < 100ms    | < 300ms    | < 800ms    |
| Revenue Path    | < 200ms    | < 500ms    | < 1500ms   |
| Standard        | < 300ms    | < 1000ms   | < 2000ms   |
| Background      | < 1000ms   | < 3000ms   | < 10000ms  |

### Error Classification

| Status Code | Classification  | Counted as Error? |
|-------------|-----------------|-------------------|
| 2xx         | Success         | No                |
| 3xx         | Redirect        | No                |
| 401         | Auth expected   | No (when token expired) |
| 409         | Conflict        | No (register duplicate) |
| 422         | Validation      | No (bad input)    |
| 429         | Rate limited    | No (expected in scenario 8) |
| 5xx         | Server error    | YES               |
| 0 (timeout) | Connection fail | YES               |

---

## 6. Pre-requisites

### Before Running Tests

1. **Seed test users:**
   ```bash
   cd backend/
   python -m scripts.seed_users --count 1000
   ```

2. **Verify server is running:**
   ```bash
   curl -s http://localhost:8000/health | python3 -m json.tool
   ```

3. **Confirm httpx is installed:**
   ```bash
   pip install httpx   # already in requirements.txt
   ```

4. **Disable rate limiting for load tests (recommended):**
   Set `ENV=testing` in the backend environment, or uninstall slowapi temporarily.
   Without this, scenarios 1-7 will see many 429 responses from auth endpoints since
   all virtual users share the same IP (localhost).

5. **Increase DB pool for stress scenarios (optional):**
   ```bash
   export DB_POOL_SIZE=30
   export DB_MAX_OVERFLOW=60
   ```

---

## 7. Execution Guide

### Run All Scenarios

```bash
cd backend/
python -m scripts.stress_test_v2 --base-url http://localhost:8000
```

### Run a Specific Scenario

```bash
python -m scripts.stress_test_v2 --scenario smoke --base-url http://localhost:8000
python -m scripts.stress_test_v2 --scenario baseline
python -m scripts.stress_test_v2 --scenario normal
python -m scripts.stress_test_v2 --scenario peak
python -m scripts.stress_test_v2 --scenario stress
python -m scripts.stress_test_v2 --scenario spike
python -m scripts.stress_test_v2 --scenario soak
python -m scripts.stress_test_v2 --scenario rate_limit
python -m scripts.stress_test_v2 --scenario ai_scan
python -m scripts.stress_test_v2 --scenario db_exhaust
```

### Output

Each run produces:
- Console report with latency percentiles, RPS, error rates
- JSON report at `backend/results/stress_v2_YYYYMMDD_HHMMSS.json`
- Health check time series (for soak and exhaust scenarios)

---

## 8. Rate Limiter Strategy

The rate limiter is IP-based (slowapi + `get_remote_address`). During load tests
from a single machine, ALL virtual users share one IP, causing false rate limiting.

### Mitigation Options (choose one)

1. **Set ENV=testing** -- auth.py disables rate limiting when `ENV` is `test` or `testing`.
2. **Uninstall slowapi** -- `pip uninstall slowapi` (the codebase handles ImportError gracefully).
3. **Use the test runner's built-in throttle** -- `stress_test_v2.py` respects rate limits
   by spacing auth requests and reusing tokens across multiple API calls per login.

### Scenario 8 Exception

Scenario 8 (Rate Limit Stress) deliberately keeps rate limiting enabled to verify
it works. Run it separately with the default ENV.

---

## 9. Baseline Recording Protocol

After the first successful baseline run, save the results:

```bash
mkdir -p backend/results/baselines/
cp backend/results/stress_v2_*.json backend/results/baselines/baseline_$(date +%Y%m%d).json
```

### Regression Detection

Compare new runs against the baseline:
- If p95 increases by more than 30%, flag as regression.
- If error rate increases by more than 0.5 percentage points, flag as regression.
- If RPS drops by more than 20%, flag as regression.

The JSON report includes a `baselines_comparison` section when a baseline file
is found in `backend/results/baselines/`.

---

## 10. Known Bottlenecks and Mitigations

### 1. DB Connection Pool (60 max)

**Risk:** Under 500+ concurrent users, all 60 connections are occupied. New
requests queue for up to 30 seconds (pool_timeout), then fail with `TimeoutError`.

**Mitigation:** The 30-second timeout means requests degrade gracefully rather
than crashing. However, increasing `DB_POOL_SIZE` to 30 and `DB_MAX_OVERFLOW`
to 50 (total 80) should be tested in staging.

### 2. AI Scan Worker Starvation

**Risk:** Each AI scan blocks a worker for 2-5 seconds. With 8 workers and 8
concurrent scans, all workers are occupied and no other requests can be served.

**Mitigation:** AI scans should be offloaded to a background task queue (Celery)
with the API returning a 202 Accepted + poll endpoint. This is architecturally
planned but not yet implemented.

### 3. Rate Limiter False Positives

**Risk:** In Docker/Kubernetes, all pods behind a load balancer may share the
same IP from the app's perspective, causing legitimate users to be rate limited.

**Mitigation:** Upgrade to per-user rate limiting (using JWT subject as key)
rather than IP-based limiting. The TODO in `ai_food.py` line 54 already flags this.

### 4. Memory (1 GB Container Limit)

**Risk:** Under sustained load with many concurrent connections, the Python
process can exceed 1 GB and get OOM-killed.

**Mitigation:** Monitor RSS via the soak test. Gunicorn's `max_requests=2000`
setting recycles workers to reclaim leaked memory.

### 5. Redis Connection Pool (50 max)

**Risk:** Token blacklist checks, caching, and rate limiting all use Redis.
Under 500+ concurrent users, Redis connections may be exhausted.

**Mitigation:** Connection pooling is already configured. Monitor with
`redis-cli info clients` during stress tests. If needed, increase to 100.

---

## Appendix A: Endpoint-to-Scenario Mapping

| Endpoint                       | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|--------------------------------|----|----|----|----|----|----|----|----|----|----|
| POST /auth/login               | x  | x  | x  | x  | x  | x  | x  | x  |    |     |
| POST /auth/register            | x  | x  |    |    |    |    |    | x  |    |     |
| GET /auth/me                   | x  | x  | x  | x  | x  | x  | x  |    |    |     |
| GET /api/dashboard/today       | x  | x  | x  | x  | x  | x  | x  |    |    |     |
| GET /api/food/logs             | x  | x  | x  | x  | x  | x  | x  |    |    | x   |
| POST /api/food/manual          | x  | x  | x  | x  | x  |    | x  |    |    |     |
| POST /api/food/scan            | x  |    |    |    |    |    |    |    | x  |     |
| POST /api/food/water           | x  | x  | x  | x  | x  |    | x  |    |    |     |
| GET /api/food/search           | x  |    | x  | x  | x  |    | x  |    |    |     |
| GET /api/onboarding/profile    | x  | x  | x  | x  | x  |    | x  |    |    |     |
| POST /api/onboarding/save-step | x  |    |    |    | x  |    |    |    |    |     |
| GET /api/subscriptions/current | x  | x  | x  | x  | x  |    | x  |    |    |     |
| GET /meals/summary             | x  | x  | x  | x  | x  | x  | x  |    |    | x   |
| GET /foods/                    | x  |    | x  |    | x  |    | x  |    |    |     |
| GET /nutrition-profile/        | x  |    | x  |    | x  |    | x  |    |    |     |
| GET /api/favorites/            | x  |    | x  | x  | x  |    | x  |    |    |     |
| GET /api/calories/balance      |    |    | x  |    | x  |    | x  |    |    |     |
| GET /api/progress/status       |    |    | x  |    | x  |    | x  |    |    |     |
| GET /api/export/csv            |    |    |    |    |    |    |    |    |    | x   |
| POST /auth/refresh             |    |    |    |    |    |    |    | x  |    |     |
| GET /health                    | x  | x  | x  | x  | x  | x  | x  |    |    | x   |

## Appendix B: Virtual User Behavior Weights

For scenarios that use a "realistic mix," the following weights replicate
production traffic distribution observed from the existing Locust profiles:

| Action             | Weight | Approx % of traffic |
|--------------------|--------|---------------------|
| View dashboard     | 5      | 22%                 |
| List food logs     | 4      | 17%                 |
| Log meal manually  | 3      | 13%                 |
| View profile       | 2      | 9%                  |
| Log water          | 2      | 9%                  |
| Search foods       | 2      | 9%                  |
| Check subscription | 1      | 4%                  |
| View history       | 1      | 4%                  |
| Meals summary      | 1      | 4%                  |
| Get /auth/me       | 1      | 4%                  |
| Nutrition profile  | 1      | 4%                  |

---

*End of Stress Test Plan*

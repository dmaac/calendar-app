# Fitsi IA — Scalability Plan

> Living document describing how to scale the Fitsi backend from MVP to 1M+ users.

---

## 1. Current Architecture (MVP — 0-10K users)

```
                    ┌──────────────┐
   Mobile App ────> │  FastAPI      │ ──> PostgreSQL (single instance)
                    │  (Uvicorn)    │ ──> Redis (cache + sessions)
                    └──────────────┘ ──> OpenAI API (food scanning)
```

**Stack**: FastAPI + asyncpg + Redis + PostgreSQL 15 + OpenAI GPT-4o Vision

**Current configuration**:
- Single Uvicorn process (4 workers via gunicorn in production)
- PostgreSQL connection pool: `pool_size=20, max_overflow=40, pool_recycle=3600, pool_pre_ping=True`
- Redis: shared pool with `max_connections=50`
- GZip compression on responses >= 500 bytes
- Structured request logging middleware
- Rate limiting via sliding-window Redis sorted sets

---

## 2. Horizontal Scaling Plan

### Load Balancer + N App Servers

```
                       ┌─────────────────┐
                       │   ALB / Nginx    │
                       │  (Layer 7 LB)   │
                       └────┬───┬───┬────┘
                            │   │   │
                    ┌───────┘   │   └───────┐
                    ▼           ▼           ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ App (1)  │ │ App (2)  │ │ App (N)  │
              │ FastAPI  │ │ FastAPI  │ │ FastAPI  │
              └────┬─────┘ └────┬─────┘ └────┬─────┘
                   │            │            │
         ┌─────────────────────────────────────────┐
         │           Shared Infrastructure          │
         │                                         │
         │  PostgreSQL ──── PgBouncer (pooler)     │
         │  Redis Cluster ── cache + rate limits   │
         │  S3 / R2 ── food images                 │
         │  OpenAI API ── via circuit breaker      │
         └─────────────────────────────────────────┘
```

**Key principles**:
- All app instances are **stateless** — no in-process state
- Sessions and tokens stored in Redis
- File uploads go directly to S3/R2 (pre-signed URLs)
- Auto-scaling based on CPU and request latency

### Kubernetes / ECS Configuration

```yaml
# Kubernetes HPA example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: fitsi-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: fitsi-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
```

---

## 3. Database Scaling

### Phase 1: Connection Pooling (current)

Already implemented in `app/core/database.py`:
- `pool_size=20` — baseline persistent connections
- `max_overflow=40` — burst to 60 total connections
- `pool_pre_ping=True` — detects dead connections before checkout
- `pool_recycle=3600` — prevents stale connections

### Phase 2: External Pooler — PgBouncer (10K-100K users)

When running multiple app server instances, each has its own pool.
With 10 instances x 60 connections = 600 connections — too many for PostgreSQL.

**Solution**: PgBouncer in `transaction` mode between app servers and PostgreSQL.

```ini
# pgbouncer.ini
[databases]
fitsi = host=db.internal port=5432 dbname=fitsi_prod

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 10
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
```

App servers connect to PgBouncer (port 6432) instead of PostgreSQL directly.

### Phase 3: Read Replicas (100K+ users)

```
Writes ──> Primary PostgreSQL
Reads  ──> Read Replica 1, Read Replica 2
```

Route read-heavy queries (dashboards, food search, history) to replicas.
Implementation: create a second read-only engine in `database.py`.

```python
# Read replica engine (add to database.py when needed)
read_engine = create_async_engine(
    settings.database_url_read_replica,
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
)
```

### Phase 4: Table Partitioning (500K+ users)

Partition high-volume tables by date:

```sql
-- Partition food_logs by month
CREATE TABLE ai_food_log (
    id SERIAL,
    user_id INTEGER NOT NULL,
    logged_at TIMESTAMP NOT NULL,
    ...
) PARTITION BY RANGE (logged_at);

CREATE TABLE ai_food_log_2026_01 PARTITION OF ai_food_log
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Auto-create monthly partitions via pg_partman
```

### Phase 5: Sharding (1M+ users)

Shard by `user_id` using Citus extension or application-level routing.
Each shard holds a range of user IDs with their complete data.

---

## 4. Cache Layer

### Architecture

```
Request ──> L1 (in-process, per-instance, 30s TTL)
        ──> L2 (Redis cluster, shared, 2min-30day TTL)
        ──> L3 (CDN, static assets + cacheable API responses)
        ──> Database (origin)
```

### Redis Cluster Setup

```
┌─────────────────────────────────────────┐
│            Redis Cluster (6 nodes)       │
│                                         │
│  Master 1 ── Replica 1   (slots 0-5460) │
│  Master 2 ── Replica 2   (slots 5461-10922) │
│  Master 3 ── Replica 3   (slots 10923-16383) │
└─────────────────────────────────────────┘
```

### What We Cache

| Data | TTL | Key Pattern | Invalidation |
|------|-----|-------------|-------------|
| User profiles | 5 min | `user:{id}:profile` | On profile update |
| Daily summaries | 2 min | `user:{id}:daily:{date}` | On food log |
| AI scan results | 30 days | `ai_scan:{image_hash}` | Immutable |
| Food search | 1 hour | `cached:food_search:...` | Time-based |
| Subscriptions | 15 min | `user:{id}:subscription` | On purchase |

### Cache Warming

On app startup, `warm_cache()` in `app/core/cache.py`:
- Resets hit/miss stats counters
- Pre-loads frequently accessed data if needed

### Stampede Protection

Implemented in `cache_get_or_refresh()`:
- Uses Redis `SET NX` as a distributed lock
- Only one caller refreshes; others wait and read the fresh value
- Prevents thundering herd on cache expiry of popular keys

### Cache Stats Endpoint

`GET /api/cache/stats` returns:
```json
{
  "hits": 15234,
  "misses": 342,
  "hit_ratio": 0.9780,
  "total_requests": 15576,
  "total_keys": 8421
}
```

---

## 5. CDN for Static Assets

### Configuration (Cloudflare / CloudFront)

```
Mobile App ──> CDN Edge (global)
               │
               ├── Food images (S3/R2 origin)
               ├── App assets (icons, fonts)
               └── Cacheable API responses (Cache-Control headers)
```

**Cache rules**:
- Food images: `Cache-Control: public, max-age=31536000, immutable` (images never change)
- API responses: `Cache-Control: private, max-age=120` (per-user, short TTL)
- Static assets: `Cache-Control: public, max-age=86400`

### Image Optimization

- Accept uploads up to 10MB
- Resize server-side to 1024px max dimension
- Convert to WebP format
- Store original + optimized version in S3/R2
- Serve optimized via CDN

---

## 6. Rate Limiting

Implemented in `app/core/rate_limiter.py`:

| Tier | Requests/min | Burst | Total effective |
|------|-------------|-------|----------------|
| Free | 30 | +10 | 40/min |
| Premium | 120 | +10 | 130/min |
| Admin | 600 | +50 | 650/min |

**Algorithm**: Sliding window using Redis sorted sets (ZRANGEBYSCORE).

**Headers returned**:
- `X-RateLimit-Limit` — requests allowed per minute
- `X-RateLimit-Remaining` — requests left in current window
- `X-RateLimit-Reset` — epoch timestamp when the window resets
- `Retry-After` — seconds to wait (only when rate limited)

**Identification**: User ID from JWT when authenticated, IP address when anonymous.

---

## 7. Circuit Breaker (External Services)

Implemented in `app/core/circuit_breaker.py`:

```
CLOSED ──(5 failures in 60s)──> OPEN ──(30s cooldown)──> HALF_OPEN
   ^                                                        │
   └──────────────(success)─────────────────────────────────┘

HALF_OPEN ──(failure)──> OPEN (re-open)
```

**Protected services**:
- OpenAI API (food scanning) — `failure_threshold=5, window=60s, recovery=30s`
- Future: Apple/Google IAP verification, push notification services

**Fallback behavior**: Returns `503 Service Temporarily Unavailable` with friendly message.

---

## 8. Background Tasks

Implemented in `app/core/background_tasks.py`:

| Task | Trigger | Description |
|------|---------|-------------|
| `send_notification_async` | After food scan, achievements | Push notification via FCM/APNs |
| `calculate_daily_summary_async` | After food log | Aggregate daily calories/macros |
| `cleanup_expired_tokens_async` | Periodic (24h) | Clean orphaned Redis keys |

**Current**: FastAPI BackgroundTasks (in-process, single server).

**Migration path to Celery** (when needed at 50K+ users):

```python
# Replace:
bg.add_task(calculate_daily_summary_async, user_id, date)

# With:
calculate_daily_summary.delay(user_id, str(date))
```

```python
# celery_app.py
from celery import Celery

app = Celery("fitsi", broker="redis://localhost:6379/1")
app.conf.task_routes = {
    "app.tasks.notifications.*": {"queue": "notifications"},
    "app.tasks.summaries.*": {"queue": "summaries"},
}
```

---

## 9. Monitoring Stack

### Prometheus + Grafana + Alerting

```
App instances ──> Prometheus (scrape /metrics)
                       │
                       ▼
                  Grafana Dashboards
                       │
                       ▼
                  Alertmanager ──> PagerDuty / Slack
```

### Key Metrics to Monitor

| Metric | Warning | Critical |
|--------|---------|----------|
| Request latency p95 | > 500ms | > 2000ms |
| Request latency p99 | > 1000ms | > 5000ms |
| Error rate (5xx) | > 1% | > 5% |
| DB connection pool utilization | > 70% | > 90% |
| Redis memory usage | > 70% | > 90% |
| Cache hit ratio | < 80% | < 50% |
| Circuit breaker state | half_open | open |
| Queue depth (Celery) | > 1000 | > 5000 |
| OpenAI API latency p95 | > 5s | > 15s |

### SLO Targets

| Endpoint | Availability | Latency (p95) |
|----------|-------------|---------------|
| Health check | 99.99% | < 50ms |
| Auth (login/register) | 99.9% | < 200ms |
| Food log CRUD | 99.9% | < 300ms |
| AI food scan | 99.5% | < 8s |
| Dashboard/summary | 99.9% | < 500ms |

---

## 10. Estimated Costs Per Tier

All estimates are monthly, AWS us-east-1 pricing. Actual costs vary.

### 1K Users (~$50-80/mo)

| Component | Spec | Cost |
|-----------|------|------|
| App server | 1x t3.small (2 vCPU, 2GB) | $15 |
| PostgreSQL | RDS db.t3.micro (1 vCPU, 1GB, 20GB) | $15 |
| Redis | ElastiCache cache.t3.micro | $12 |
| S3 (images) | ~5GB stored, 10K requests | $1 |
| OpenAI API | ~3K scans x $0.01 | $30 |
| **Total** | | **~$73/mo** |

### 10K Users (~$250-400/mo)

| Component | Spec | Cost |
|-----------|------|------|
| App server | 2x t3.medium (2 vCPU, 4GB) + ALB | $60 |
| PostgreSQL | RDS db.t3.medium (2 vCPU, 4GB, 100GB) | $70 |
| Redis | ElastiCache cache.t3.small (1.5GB) | $25 |
| S3 + CloudFront | ~50GB, CDN bandwidth | $20 |
| OpenAI API | ~30K scans x $0.01 | $300 |
| Monitoring | CloudWatch + basic Grafana | $15 |
| **Total** | | **~$490/mo** |

### 100K Users (~$2,000-3,500/mo)

| Component | Spec | Cost |
|-----------|------|------|
| App server | 4x t3.large (ECS Fargate) + ALB | $250 |
| PostgreSQL | RDS db.r6g.large (2 vCPU, 16GB) + 1 read replica | $500 |
| PgBouncer | 1x t3.small | $15 |
| Redis | ElastiCache cache.r6g.large (13GB, cluster) | $200 |
| S3 + CloudFront | ~500GB, high bandwidth | $100 |
| OpenAI API | ~300K scans x $0.008 (volume discount) | $2,400 |
| Celery workers | 2x t3.medium (spot instances) | $30 |
| Monitoring | Datadog or Grafana Cloud | $100 |
| **Total** | | **~$3,595/mo** |

### 1M Users (~$15,000-25,000/mo)

| Component | Spec | Cost |
|-----------|------|------|
| App server | 8-16x c6g.xlarge (EKS) + NLB | $1,500 |
| PostgreSQL | RDS db.r6g.2xlarge + 3 read replicas (or Citus) | $3,000 |
| PgBouncer | 2x t3.medium (HA) | $60 |
| Redis | ElastiCache cluster (3 shards, 6 nodes) | $800 |
| S3 + CloudFront | ~5TB, global distribution | $500 |
| OpenAI API | ~3M scans x $0.005 (enterprise pricing) | $15,000 |
| Celery workers | 4x c6g.large (spot) | $150 |
| Search (Meilisearch) | 1x r6g.large for food database | $200 |
| Monitoring | Datadog full stack | $500 |
| **Total** | | **~$21,710/mo** |

> **Note**: OpenAI API is the dominant cost at scale. Key strategies to reduce:
> - Aggressive image hash caching (ai_scan_cache table)
> - Use cheaper models for simple/common foods
> - Batch processing during off-peak hours
> - Negotiate enterprise pricing at 100K+ scans/mo

---

## 11. Migration Checklist

### Phase 1: MVP to Growth (current -> 10K)
- [x] Connection pooling with `pool_pre_ping`
- [x] Redis caching with TTL tiers
- [x] Cache stampede protection
- [x] Rate limiting (per-user, sliding window)
- [x] Circuit breaker for OpenAI
- [x] Background task framework
- [x] GZip compression
- [x] Structured request logging
- [ ] Add Prometheus `/metrics` endpoint
- [ ] Set up Grafana dashboards
- [ ] Deploy behind ALB with 2+ instances
- [ ] Enable RDS automated backups

### Phase 2: Growth to Scale (10K -> 100K)
- [ ] Deploy PgBouncer between app and database
- [ ] Add PostgreSQL read replica
- [ ] Migrate to ECS Fargate or EKS
- [ ] Set up auto-scaling policies
- [ ] Migrate background tasks to Celery + Redis broker
- [ ] Add CDN (CloudFront) for food images
- [ ] Implement cursor-based pagination for all list endpoints
- [ ] Add database table partitioning (food_logs by month)

### Phase 3: Scale to Hyperscale (100K -> 1M+)
- [ ] Redis cluster with multiple shards
- [ ] Database sharding (Citus or application-level)
- [ ] Dedicated search service (Meilisearch/Elasticsearch)
- [ ] Multi-AZ / multi-region deployment
- [ ] Event-driven architecture (Kafka/SQS)
- [ ] Negotiate enterprise API pricing with OpenAI

---

*Last updated: 2026-03-22*

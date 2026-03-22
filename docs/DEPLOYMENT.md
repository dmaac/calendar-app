# Deployment Guide — Fitsi IA

## Architecture Overview

```
Internet
   │
   ├─ :80  ─→ nginx (redirect to HTTPS)
   └─ :443 ─→ nginx (TLS termination, rate limiting, security headers)
                │
                └─→ backend:8000 (gunicorn + uvicorn workers)
                       │
                       ├─→ db:5432      (PostgreSQL 15)
                       └─→ redis:6379   (Redis 7 — cache + queues)
```

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- Domain name pointing to your server (e.g., `api.fitsiai.app`)
- SSL certificate (Let's Encrypt recommended)

## Quick Start — Single Server / VPS

### 1. Clone and configure

```bash
git clone <repository-url>
cd calendar-app

# Create compose-level env from template
cp .env.production.example .env

# Create backend app-level env from template
cp backend/.env.example backend/.env
```

### 2. Generate secrets

```bash
# PostgreSQL password
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)" >> .env

# Redis password
echo "REDIS_PASSWORD=$(openssl rand -base64 32)" >> .env

# Backend auth secrets
cd backend
echo "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> .env
echo "REFRESH_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> .env
cd ..
```

### 3. SSL certificates

```bash
# Option A: Let's Encrypt (recommended for production)
sudo certbot certonly --standalone -d api.fitsiai.app
sudo cp /etc/letsencrypt/live/api.fitsiai.app/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/api.fitsiai.app/privkey.pem nginx/certs/

# Option B: Self-signed (testing only)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
  -subj "/CN=api.fitsiai.app"
```

### 4. Deploy

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 5. Run database migrations

```bash
docker compose exec backend alembic upgrade head
```

### 6. Verify

```bash
# Health check
curl -f https://api.fitsiai.app/health

# Check all containers are healthy
docker compose ps
```

## Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base services (dev/staging) |
| `docker-compose.prod.yml` | Production overlay (security hardening, nginx, resource limits) |
| `backend/Dockerfile` | Multi-stage build (builder + production) |
| `backend/gunicorn.conf.py` | Gunicorn production config (workers, timeouts, JSON logging) |
| `nginx/nginx.conf` | Reverse proxy, TLS, rate limiting, security headers |
| `nginx/proxy_params_fitsiai` | Shared proxy headers |
| `.env.production.example` | Template for compose-level env vars |
| `backend/.env.example` | Template for backend app-level env vars |

## Security Features

### Docker Containers
- Non-root user in backend container
- `read_only: true` filesystem (tmpfs for writable paths)
- `no-new-privileges` security option
- `cap_drop: ALL` (nginx gets `NET_BIND_SERVICE` only)
- Resource limits (CPU + memory) on all services
- tini as PID 1 for proper signal handling

### Nginx
- HTTP to HTTPS redirect
- TLS 1.2/1.3 only with strong cipher suites
- HSTS with preload
- X-Content-Type-Options, X-Frame-Options, X-XSS-Protection headers
- Rate limiting per endpoint: API (30r/s), auth (5r/s), AI scan (2r/s)
- Server version hidden (`server_tokens off`)
- 10MB max request body

### Backend
- Gunicorn worker recycling (`max_requests`) to prevent memory leaks
- Graceful shutdown with 30s grace period
- JSON structured logging for log aggregation
- Health check endpoint at `/health`

## CI/CD Pipeline

### CI (`.github/workflows/ci.yml`)

Runs on every PR and push to `main`/`develop`:

```
backend-lint ──┐
backend-typecheck ──┤
backend-test ──────┼──→ backend-docker ──→ ci-gate
mobile-lint ──────┤
mobile-typecheck ──┤
mobile-test ──────┘
```

### Deploy (`.github/workflows/deploy.yml`)

Triggers on push to `main` (backend paths only):

1. Runs full CI
2. Builds multi-arch Docker image (amd64 + arm64)
3. Pushes to GitHub Container Registry (GHCR)
4. Auto-deploys to staging
5. Production deploy via manual `workflow_dispatch`

### Required GitHub Secrets

| Secret | Used In | Purpose |
|--------|---------|---------|
| `GITHUB_TOKEN` | deploy.yml | GHCR authentication (automatic) |

For VPS deployment, add:
| Secret | Used In | Purpose |
|--------|---------|---------|
| `DEPLOY_SSH_KEY` | deploy.yml | SSH key for deployment target |
| `DEPLOY_HOST` | deploy.yml | Server hostname/IP |

## Scaling

### Vertical (single server)

Adjust in `.env`:
```bash
GUNICORN_WORKERS=8    # More workers for more CPU cores
```

Adjust resource limits in `docker-compose.prod.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: "4.0"
```

### Horizontal (multi-server)

Replace containerized PostgreSQL and Redis with managed services:
- **Database**: RDS PostgreSQL or Cloud SQL
- **Cache**: ElastiCache Redis or Memorystore
- **Container orchestration**: ECS Fargate, EKS, or Cloud Run
- **Load balancer**: ALB or Cloud Load Balancing (replaces nginx)

## Monitoring

### Health Check

```bash
curl https://api.fitsiai.app/health
# Returns: {"status": "healthy", "timestamp": "..."}
```

### Logs

```bash
# All services
docker compose logs -f

# Backend only (JSON structured)
docker compose logs -f backend

# Nginx access logs (JSON)
docker compose logs -f nginx
```

### Recommended Additions

- **Error tracking**: Sentry (set `SENTRY_DSN` in backend/.env)
- **Metrics**: Prometheus + Grafana
- **Uptime**: UptimeRobot or Checkly on `/health`

## Rollback

```bash
# List available image tags
docker image ls ghcr.io/<org>/backend

# Roll back to a specific version
IMAGE_TAG=<previous-sha> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend

# Or via GitHub Actions: trigger workflow_dispatch with the previous commit SHA
```

## Backup

### Database

```bash
# Manual backup
docker compose exec db pg_dump -U fitsiai fitsiai_db > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T db psql -U fitsiai fitsiai_db < backup_20260321.sql
```

For automated backups, use a cron job or managed database service with point-in-time recovery.

## Certificate Renewal (Let's Encrypt)

```bash
# Test renewal
sudo certbot renew --dry-run

# Set up auto-renewal cron
echo "0 3 * * * certbot renew --post-hook 'docker compose restart nginx'" | sudo crontab -
```

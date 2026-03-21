# =============================================================================
# Fitsi — Backend Dockerfile (multi-stage, production-ready)
# =============================================================================
# Build:  docker build -t fitsi-backend .
# Run:    docker run -p 8000:8000 --env-file .env fitsi-backend
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: builder — compile wheels so the final image stays small
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

# Prevent .pyc files and enable unbuffered output during build
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /build

# System deps needed to compile psycopg2, asyncpg, etc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc \
       libpq-dev \
       python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps into an isolated prefix so we can COPY them cleanly.
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: production — minimal runtime image
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS production

# Prevent .pyc files, enable unbuffered stdout/stderr for container logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Labels (OCI standard)
LABEL org.opencontainers.image.title="fitsi-backend" \
      org.opencontainers.image.description="Fitsi — FastAPI backend" \
      org.opencontainers.image.source="https://github.com/fitsi/calendar-app"

WORKDIR /app

# Runtime-only system packages (no compiler, no dev headers)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libpq5 \
       curl \
       tini \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built Python packages from builder
COPY --from=builder /install /usr/local

# Create a non-root user
RUN groupadd --gid 1001 appgroup \
    && useradd --uid 1001 --gid appgroup --no-create-home --shell /bin/false appuser

# Copy application code
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY gunicorn.conf.py .

# Make sure appuser owns everything under /app
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

# Health check — hit the /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Graceful shutdown: gunicorn listens for SIGTERM by default
STOPSIGNAL SIGTERM

# Use tini as PID 1 for proper signal handling (SIGTERM → graceful shutdown)
ENTRYPOINT ["tini", "--"]

# Production server via gunicorn config file
CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]

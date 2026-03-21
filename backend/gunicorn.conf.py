# =============================================================================
# Gunicorn configuration for Cal AI Backend (production)
# =============================================================================
# Usage:  gunicorn app.main:app -c gunicorn.conf.py
# Docs:   https://docs.gunicorn.org/en/stable/settings.html
# =============================================================================
import multiprocessing
import os

# ---------------------------------------------------------------------------
# Server socket
# ---------------------------------------------------------------------------
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")

# ---------------------------------------------------------------------------
# Worker processes
# ---------------------------------------------------------------------------
# Formula: min(2 * CPU + 1, MAX_WORKERS)
# Override with GUNICORN_WORKERS env var for container-based scaling.
_max_workers = int(os.getenv("GUNICORN_MAX_WORKERS", "8"))
workers = int(
    os.getenv(
        "GUNICORN_WORKERS",
        str(min(multiprocessing.cpu_count() * 2 + 1, _max_workers)),
    )
)

# Uvicorn's ASGI worker for async FastAPI
worker_class = "uvicorn.workers.UvicornWorker"

# ---------------------------------------------------------------------------
# Timeouts
# ---------------------------------------------------------------------------
# How long a worker can take to handle a request before being killed.
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))

# Time to finish in-flight requests during graceful shutdown (SIGTERM).
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))

# Seconds to wait for requests on a Keep-Alive connection.
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
accesslog = "-"  # stdout
errorlog = "-"   # stderr
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# Structured JSON access log (useful for log aggregation)
access_log_format = (
    '{"remote_ip":"%(h)s","request_method":"%(m)s",'
    '"request_path":"%(U)s","status":"%(s)s",'
    '"response_length":"%(B)s","request_time":"%(D)s",'
    '"user_agent":"%(a)s"}'
)

# ---------------------------------------------------------------------------
# Process naming
# ---------------------------------------------------------------------------
proc_name = "calai-backend"

# ---------------------------------------------------------------------------
# Server mechanics
# ---------------------------------------------------------------------------
# Preload app so workers fork from an already-imported process (saves RAM).
preload_app = True

# Restart workers after this many requests to prevent memory leaks.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "2000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "200"))

# Write a temporary file to signal liveness to process managers.
tmp_upload_dir = None

# ---------------------------------------------------------------------------
# SSL (optional — typically handled by reverse proxy / load balancer)
# ---------------------------------------------------------------------------
# keyfile = os.getenv("GUNICORN_SSL_KEYFILE")
# certfile = os.getenv("GUNICORN_SSL_CERTFILE")

# ---------------------------------------------------------------------------
# Hooks
# ---------------------------------------------------------------------------
def on_starting(server):
    """Called just before the master process is initialized."""
    pass


def post_fork(server, worker):
    """Called just after a worker has been forked."""
    server.log.info("Worker spawned (pid: %s)", worker.pid)


def pre_exec(server):
    """Called just before a new master process is forked."""
    server.log.info("Forked child, re-executing.")


def when_ready(server):
    """Called just after the server is started."""
    server.log.info("Server is ready. Spawning workers.")


def worker_int(worker):
    """Called when a worker receives the INT or QUIT signal."""
    worker.log.info("Worker received INT or QUIT signal (pid: %s)", worker.pid)


def worker_abort(worker):
    """Called when a worker receives the SIGABRT signal (timeout)."""
    worker.log.info("Worker received SIGABRT (pid: %s)", worker.pid)

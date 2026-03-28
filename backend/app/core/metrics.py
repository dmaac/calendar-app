"""
Prometheus-compatible Metrics
------------------------------
Lightweight, in-process metrics collector that exposes counters, histograms,
and gauges in Prometheus text exposition format at GET /metrics.

No external dependencies required -- uses stdlib only.

Metric categories:
- HTTP: request counts, durations, active connections, error rates
- AI: scan latency by provider, cache hit rate, cost tracking
- Data: mutation counts, delete counts, integrity checks
- Business: active users (unique user_ids seen in rolling window)
- Batch: job runs, durations, errors, dead letters
- System: app info, uptime
"""

import time
import threading
from collections import defaultdict
from typing import Dict, List, Optional, Set


class _Counter:
    """Thread-safe monotonic counter."""

    def __init__(self, name: str, help_text: str, labels: Optional[List[str]] = None):
        self.name = name
        self.help_text = help_text
        self.labels = labels or []
        self._values: Dict[tuple, float] = defaultdict(float)
        self._lock = threading.Lock()

    def inc(self, value: float = 1.0, **label_values) -> None:
        key = tuple(label_values.get(l, "") for l in self.labels)
        with self._lock:
            self._values[key] += value

    def get(self, **label_values) -> float:
        """Read the current value for a specific label combination."""
        key = tuple(label_values.get(l, "") for l in self.labels)
        with self._lock:
            return self._values.get(key, 0.0)

    def total(self) -> float:
        """Sum across all label combinations."""
        with self._lock:
            return sum(self._values.values())

    def collect(self) -> str:
        lines = [
            f"# HELP {self.name} {self.help_text}",
            f"# TYPE {self.name} counter",
        ]
        with self._lock:
            if not self._values:
                lines.append(f"{self.name} 0")
            for key, value in sorted(self._values.items()):
                if self.labels:
                    label_str = ",".join(
                        f'{l}="{v}"' for l, v in zip(self.labels, key)
                    )
                    lines.append(f"{self.name}{{{label_str}}} {value}")
                else:
                    lines.append(f"{self.name} {value}")
        return "\n".join(lines)


class _Histogram:
    """Thread-safe histogram with sum, count, and configurable buckets."""

    DEFAULT_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)

    def __init__(
        self,
        name: str,
        help_text: str,
        labels: Optional[List[str]] = None,
        buckets: Optional[tuple] = None,
    ):
        self.name = name
        self.help_text = help_text
        self.labels = labels or []
        self.buckets = buckets or self.DEFAULT_BUCKETS
        self._sums: Dict[tuple, float] = defaultdict(float)
        self._counts: Dict[tuple, int] = defaultdict(int)
        self._bucket_counts: Dict[tuple, Dict[float, int]] = {}
        self._lock = threading.Lock()

    def observe(self, value: float, **label_values) -> None:
        key = tuple(label_values.get(l, "") for l in self.labels)
        with self._lock:
            self._sums[key] += value
            self._counts[key] += 1
            if key not in self._bucket_counts:
                self._bucket_counts[key] = {b: 0 for b in self.buckets}
            for b in self.buckets:
                if value <= b:
                    self._bucket_counts[key][b] += 1

    def total_count(self) -> int:
        """Total observation count across all label combinations."""
        with self._lock:
            return sum(self._counts.values())

    def collect(self) -> str:
        lines = [
            f"# HELP {self.name} {self.help_text}",
            f"# TYPE {self.name} histogram",
        ]
        with self._lock:
            for key in sorted(self._sums.keys()):
                label_parts = []
                if self.labels:
                    label_parts = [f'{l}="{v}"' for l, v in zip(self.labels, key)]

                cumulative = 0
                for b in self.buckets:
                    cumulative += self._bucket_counts.get(key, {}).get(b, 0)
                    bucket_labels = label_parts + [f'le="{b}"']
                    lines.append(f'{self.name}_bucket{{{",".join(bucket_labels)}}} {cumulative}')

                inf_labels = label_parts + ['le="+Inf"']
                lines.append(f'{self.name}_bucket{{{",".join(inf_labels)}}} {self._counts[key]}')

                if label_parts:
                    lbl = ",".join(label_parts)
                    lines.append(f"{self.name}_sum{{{lbl}}} {self._sums[key]:.6f}")
                    lines.append(f"{self.name}_count{{{lbl}}} {self._counts[key]}")
                else:
                    lines.append(f"{self.name}_sum {self._sums[key]:.6f}")
                    lines.append(f"{self.name}_count {self._counts[key]}")
        return "\n".join(lines)


class _Gauge:
    """Thread-safe gauge (can go up and down)."""

    def __init__(self, name: str, help_text: str):
        self.name = name
        self.help_text = help_text
        self._value: float = 0.0
        self._lock = threading.Lock()

    def set(self, value: float) -> None:
        with self._lock:
            self._value = value

    def inc(self, value: float = 1.0) -> None:
        with self._lock:
            self._value += value

    def dec(self, value: float = 1.0) -> None:
        with self._lock:
            self._value -= value

    def get(self) -> float:
        with self._lock:
            return self._value

    def collect(self) -> str:
        with self._lock:
            val = self._value
        return (
            f"# HELP {self.name} {self.help_text}\n"
            f"# TYPE {self.name} gauge\n"
            f"{self.name} {val}"
        )


# ── Active user tracker ─────────────────────────────────────────────────────
# Tracks unique user_ids seen in a rolling window to report active user count
# without querying the database.

class _ActiveUserTracker:
    """Rolling-window unique user counter.

    Records (timestamp, user_id) pairs and expires entries older than
    ``window_seconds``.  The gauge is updated on each record() call.
    """

    def __init__(self, window_seconds: int = 86_400):
        self._window = window_seconds
        self._entries: List[tuple] = []  # [(timestamp, user_id), ...]
        self._lock = threading.Lock()

    def record(self, user_id: str) -> None:
        """Record that *user_id* was seen now."""
        if not user_id:
            return
        now = time.monotonic()
        with self._lock:
            self._entries.append((now, user_id))
            self._prune(now)

    def count(self) -> int:
        """Return the number of unique users in the current window."""
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            unique: Set[str] = set()
            for _, uid in self._entries:
                unique.add(uid)
            return len(unique)

    def _prune(self, now: float) -> None:
        cutoff = now - self._window
        while self._entries and self._entries[0][0] < cutoff:
            self._entries.pop(0)


# Singleton active user tracker (24h window)
_active_users = _ActiveUserTracker(window_seconds=86_400)


def record_active_user(user_id: str) -> None:
    """Record a user as active.  Called from request middleware."""
    _active_users.record(user_id)


def get_active_user_count() -> int:
    """Return the number of unique users seen in the last 24 hours."""
    return _active_users.count()


# ---- Singleton metrics registry ----

REQUEST_COUNT = _Counter(
    name="http_requests_total",
    help_text="Total number of HTTP requests",
    labels=["method", "endpoint", "status"],
)

REQUEST_DURATION = _Histogram(
    name="http_request_duration_seconds",
    help_text="HTTP request duration in seconds",
    labels=["method", "endpoint"],
)

ACTIVE_CONNECTIONS = _Gauge(
    name="http_active_connections",
    help_text="Number of currently active HTTP connections",
)

DB_QUERY_DURATION = _Histogram(
    name="db_query_duration_seconds",
    help_text="Database query duration in seconds",
    labels=["operation"],
)

APP_INFO = _Gauge(
    name="app_info",
    help_text="Application metadata (always 1)",
)
APP_INFO.set(1)

# ---- Error rate tracking ----

ERROR_COUNT = _Counter(
    name="http_errors_total",
    help_text="Total number of HTTP error responses (4xx and 5xx)",
    labels=["method", "endpoint", "status"],
)

UNHANDLED_EXCEPTION_COUNT = _Counter(
    name="unhandled_exceptions_total",
    help_text="Total number of unhandled exceptions caught by error middleware",
    labels=["exception_type", "endpoint"],
)

# ---- AI scan metrics ----

AI_SCAN_DURATION = _Histogram(
    name="ai_scan_duration_seconds",
    help_text="AI food scan end-to-end latency in seconds",
    labels=["provider", "cache_hit"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 15.0, 30.0),
)

AI_SCAN_COUNT = _Counter(
    name="ai_scans_total",
    help_text="Total number of AI food scans",
    labels=["provider", "cache_hit", "outcome"],
)

AI_SCAN_COST = _Counter(
    name="ai_scan_cost_usd_total",
    help_text="Cumulative estimated AI scan cost in USD",
    labels=["provider"],
)

# ---- Active users metric (gauge updated on collect) ----

ACTIVE_USERS_24H = _Gauge(
    name="active_users_24h",
    help_text="Number of unique authenticated users in the last 24 hours",
)

# ---- Slow request counter ----

SLOW_REQUEST_COUNT = _Counter(
    name="slow_requests_total",
    help_text="Total number of requests exceeding the slow threshold (1s)",
    labels=["method", "endpoint"],
)

# ---- Data operations metrics ----

DATA_DELETE_COUNT = _Counter(
    name="data_deletes_total",
    help_text="Total number of DELETE operations by table",
    labels=["table"],
)

DATA_MUTATION_COUNT = _Counter(
    name="data_mutations_total",
    help_text="Total number of data-mutating operations (POST/PUT/PATCH) by table and type",
    labels=["table", "operation"],
)

INTEGRITY_CHECK_COUNT = _Counter(
    name="integrity_checks_total",
    help_text="Total number of data integrity checks run",
    labels=["result"],
)

INTEGRITY_ALERTS = _Counter(
    name="integrity_alerts_total",
    help_text="Total number of data integrity alerts raised",
    labels=["severity"],
)

# ---- Health check result tracking ----

HEALTH_CHECK_COUNT = _Counter(
    name="health_checks_total",
    help_text="Total number of health check invocations",
    labels=["result"],
)

# ---- Batch job metrics ----

BATCH_JOB_RUNS = _Counter(
    name="batch_job_runs_total",
    help_text="Total number of batch job executions",
    labels=["job"],
)

BATCH_JOB_DURATION = _Histogram(
    name="batch_job_duration_seconds",
    help_text="Wall-clock duration of batch job executions in seconds",
    labels=["job"],
    buckets=(0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0),
)

BATCH_JOB_USERS_PROCESSED = _Counter(
    name="batch_job_users_processed_total",
    help_text="Total number of users successfully processed by batch jobs",
    labels=["job"],
)

BATCH_JOB_ERRORS = _Counter(
    name="batch_job_errors_total",
    help_text="Total number of per-user errors in batch jobs",
    labels=["job"],
)

NOTIFICATION_DEAD_LETTERS = _Counter(
    name="notification_dead_letters_total",
    help_text="Total number of notifications sent to dead letter queue",
    labels=["notification_type"],
)

_ALL_METRICS = [
    REQUEST_COUNT, REQUEST_DURATION, ACTIVE_CONNECTIONS, DB_QUERY_DURATION, APP_INFO,
    ERROR_COUNT, UNHANDLED_EXCEPTION_COUNT,
    AI_SCAN_DURATION, AI_SCAN_COUNT, AI_SCAN_COST,
    ACTIVE_USERS_24H, SLOW_REQUEST_COUNT,
    DATA_DELETE_COUNT, DATA_MUTATION_COUNT, INTEGRITY_CHECK_COUNT, INTEGRITY_ALERTS,
    HEALTH_CHECK_COUNT,
    BATCH_JOB_RUNS, BATCH_JOB_DURATION, BATCH_JOB_USERS_PROCESSED, BATCH_JOB_ERRORS,
    NOTIFICATION_DEAD_LETTERS,
]


def collect_metrics() -> str:
    """Collect all metrics in Prometheus text exposition format.

    Updates dynamic gauges (e.g. active users) before serializing.
    """
    # Refresh dynamic gauges
    ACTIVE_USERS_24H.set(get_active_user_count())

    return "\n\n".join(m.collect() for m in _ALL_METRICS) + "\n"


def metrics_snapshot() -> dict:
    """Return a JSON-friendly summary of key metrics for the /health endpoint."""
    total_requests = REQUEST_COUNT.total()
    total_errors = ERROR_COUNT.total()
    error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0.0

    return {
        "total_requests": int(total_requests),
        "total_errors": int(total_errors),
        "error_rate_pct": round(error_rate, 2),
        "active_connections": int(ACTIVE_CONNECTIONS.get()),
        "active_users_24h": get_active_user_count(),
        "ai_scans_total": int(AI_SCAN_COUNT.total()),
        "slow_requests_total": int(SLOW_REQUEST_COUNT.total()),
    }

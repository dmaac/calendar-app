"""
Prometheus-compatible Metrics
------------------------------
Lightweight, in-process metrics collector that exposes counters, histograms,
and gauges in Prometheus text exposition format at GET /metrics.

No external dependencies required -- uses stdlib only.
"""

import time
import threading
from collections import defaultdict
from typing import Dict, List, Optional


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

_ALL_METRICS = [REQUEST_COUNT, REQUEST_DURATION, ACTIVE_CONNECTIONS, DB_QUERY_DURATION, APP_INFO]


def collect_metrics() -> str:
    """Collect all metrics in Prometheus text exposition format."""
    return "\n\n".join(m.collect() for m in _ALL_METRICS) + "\n"

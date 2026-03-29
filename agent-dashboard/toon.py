"""
TOON — Token-Oriented Object Notation

Compact serialization format that reduces AI prompt tokens by ~60% vs JSON.
All inter-agent communication in Fitsi IA uses TOON as the standard protocol.

Format rules:
  - Key-value pairs separated by `|`
  - Keys and values separated by `:`
  - Arrays use `[` `]` with `,` separator
  - Nested objects use `{` `}` with `|` separator
  - No quotes around strings (unless they contain reserved chars)
  - No whitespace padding
  - Booleans: `T` / `F`
  - Null: `_`
  - Numbers are bare (42, 3.14)
  - Strings containing |:,[]{}  must be escaped with backslash

Example:
  JSON (94 tokens):
    {"agent": "ceo-fitsi", "task": "review Q1", "priority": "high",
     "data": {"revenue": 50000, "churn": 0.03}, "tags": ["growth", "strategy"]}

  TOON (41 tokens):
    agent:ceo-fitsi|task:review Q1|priority:high|data:{revenue:50000|churn:0.03}|tags:[growth,strategy]

Protocol version: 1.0
"""

from __future__ import annotations
import re
from typing import Any

__version__ = "1.0.0"

# Reserved characters that need escaping in string values
_RESERVED = set('|:,[]{}')
_ESCAPE_RE = re.compile(r'([|:,\[\]{}\\])')
_UNESCAPE_RE = re.compile(r'\\([|:,\[\]{}\\])')


def encode(obj: Any) -> str:
    """Encode a Python object to TOON format."""
    if obj is None:
        return "_"
    if isinstance(obj, bool):
        return "T" if obj else "F"
    if isinstance(obj, (int, float)):
        return str(obj)
    if isinstance(obj, str):
        return _escape_str(obj)
    if isinstance(obj, (list, tuple)):
        return "[" + ",".join(encode(item) for item in obj) + "]"
    if isinstance(obj, dict):
        pairs = []
        for k, v in obj.items():
            pairs.append(f"{_escape_str(str(k))}:{encode(v)}")
        return "{" + "|".join(pairs) + "}"
    return _escape_str(str(obj))


def encode_flat(obj: dict) -> str:
    """Encode a top-level dict without outer braces (most common case)."""
    if not isinstance(obj, dict):
        return encode(obj)
    pairs = []
    for k, v in obj.items():
        pairs.append(f"{_escape_str(str(k))}:{encode(v)}")
    return "|".join(pairs)


def decode(s: str) -> Any:
    """Decode a TOON string back to a Python object."""
    s = s.strip()
    if not s:
        return None
    parser = _Parser(s)
    return parser.parse()


def decode_flat(s: str) -> dict:
    """Decode a flat TOON string (no outer braces) to a dict."""
    s = s.strip()
    if not s:
        return {}
    if s.startswith("{") and s.endswith("}"):
        return decode(s)
    return decode("{" + s + "}")


def _escape_str(s: str) -> str:
    """Escape reserved characters in a string value."""
    if not s:
        return '""'
    if any(c in _RESERVED for c in s):
        return _ESCAPE_RE.sub(r'\\\1', s)
    return s


def _unescape_str(s: str) -> str:
    """Unescape a TOON string value."""
    return _UNESCAPE_RE.sub(r'\1', s)


class _Parser:
    """Recursive descent parser for TOON format."""

    def __init__(self, text: str):
        self.text = text
        self.pos = 0

    def parse(self) -> Any:
        return self._parse_value()

    def _parse_value(self) -> Any:
        if self.pos >= len(self.text):
            return None
        c = self.text[self.pos]
        if c == '{':
            return self._parse_object()
        if c == '[':
            return self._parse_array()
        if c == '_':
            self.pos += 1
            return None
        if c == 'T' and self._peek_delimiter(1):
            self.pos += 1
            return True
        if c == 'F' and self._peek_delimiter(1):
            self.pos += 1
            return False
        if c == '"':
            return self._parse_quoted()
        return self._parse_raw()

    def _peek_delimiter(self, offset: int) -> bool:
        """Check if char at pos+offset is a delimiter or end."""
        p = self.pos + offset
        if p >= len(self.text):
            return True
        return self.text[p] in '|,]}'

    def _parse_object(self) -> dict:
        self.pos += 1  # skip {
        result = {}
        while self.pos < len(self.text) and self.text[self.pos] != '}':
            key = self._parse_key()
            if self.pos < len(self.text) and self.text[self.pos] == ':':
                self.pos += 1  # skip :
            value = self._parse_value()
            result[key] = value
            if self.pos < len(self.text) and self.text[self.pos] == '|':
                self.pos += 1  # skip |
        if self.pos < len(self.text):
            self.pos += 1  # skip }
        return result

    def _parse_array(self) -> list:
        self.pos += 1  # skip [
        result = []
        while self.pos < len(self.text) and self.text[self.pos] != ']':
            value = self._parse_value()
            result.append(value)
            if self.pos < len(self.text) and self.text[self.pos] == ',':
                self.pos += 1  # skip ,
        if self.pos < len(self.text):
            self.pos += 1  # skip ]
        return result

    def _parse_key(self) -> str:
        start = self.pos
        while self.pos < len(self.text) and self.text[self.pos] not in ':|}':
            if self.text[self.pos] == '\\':
                self.pos += 2
            else:
                self.pos += 1
        return _unescape_str(self.text[start:self.pos])

    def _parse_raw(self) -> Any:
        start = self.pos
        while self.pos < len(self.text) and self.text[self.pos] not in '|,]}':
            if self.text[self.pos] == '\\':
                self.pos += 2
            else:
                self.pos += 1
        raw = self.text[start:self.pos]
        # Try numeric
        try:
            if '.' in raw:
                return float(raw)
            return int(raw)
        except ValueError:
            return _unescape_str(raw)

    def _parse_quoted(self) -> str:
        self.pos += 1  # skip opening "
        start = self.pos
        while self.pos < len(self.text) and self.text[self.pos] != '"':
            if self.text[self.pos] == '\\':
                self.pos += 2
            else:
                self.pos += 1
        result = self.text[start:self.pos]
        if self.pos < len(self.text):
            self.pos += 1  # skip closing "
        return result


# ── Agent Communication Protocol ─────────────────────────────────────

def agent_message(
    from_agent: str,
    to_agent: str,
    msg_type: str,
    payload: dict,
    task_id: str | None = None,
    priority: str = "medium",
) -> str:
    """Create a TOON-encoded inter-agent message.

    Standard message types:
      - task_assign: Assign work to an agent
      - task_result: Return results from completed work
      - delegate: Delegate to a sub-agent
      - escalate: Escalate to a higher layer
      - feedback: Performance feedback
      - status: Status update
      - query: Ask for information
      - response: Answer a query
      - alert: System alert (from demons)
    """
    msg = {
        "from": from_agent,
        "to": to_agent,
        "type": msg_type,
        "pri": priority,
    }
    if task_id:
        msg["tid"] = task_id
    msg["p"] = payload
    return encode_flat(msg)


def parse_agent_message(toon_str: str) -> dict:
    """Parse a TOON-encoded agent message back to dict."""
    data = decode_flat(toon_str)
    return {
        "from_agent": data.get("from", ""),
        "to_agent": data.get("to", ""),
        "msg_type": data.get("type", ""),
        "priority": data.get("pri", "medium"),
        "task_id": data.get("tid"),
        "payload": data.get("p", {}),
    }


# ── Token Savings Calculator ─────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """Rough token estimate (1 token ≈ 4 chars for English)."""
    return max(1, len(text) // 4)


def compare_formats(obj: dict) -> dict:
    """Compare token usage between JSON and TOON for a given object."""
    import json
    json_str = json.dumps(obj, separators=(',', ':'))
    toon_str = encode_flat(obj)
    json_tokens = estimate_tokens(json_str)
    toon_tokens = estimate_tokens(toon_str)
    savings_pct = round((1 - toon_tokens / json_tokens) * 100, 1) if json_tokens > 0 else 0
    return {
        "json_chars": len(json_str),
        "toon_chars": len(toon_str),
        "json_tokens": json_tokens,
        "toon_tokens": toon_tokens,
        "savings_pct": savings_pct,
        "json": json_str,
        "toon": toon_str,
    }


# ── Convenience: TOON Protocol Header ────────────────────────────────

PROTOCOL_HEADER = """TOON Protocol v1.0 — Token-Oriented Object Notation
All inter-agent messages use TOON format for 60% token reduction.
Format: key:value|key:value|nested:{k:v|k:v}|list:[a,b,c]
Booleans: T/F | Null: _ | Strings with reserved chars: escape with \\
Message: from:agent|to:agent|type:msg_type|pri:priority|tid:task_id|p:{payload}
"""


if __name__ == "__main__":
    # Demo
    print("=== TOON Format Demo ===\n")

    sample = {
        "agent": "ceo-fitsi",
        "task": "review Q1 strategy",
        "priority": "high",
        "data": {"revenue": 50000, "churn": 0.03, "active_users": 12500},
        "tags": ["growth", "strategy", "q1"],
        "approved": True,
        "notes": None,
    }

    stats = compare_formats(sample)
    print(f"JSON ({stats['json_tokens']} tokens, {stats['json_chars']} chars):")
    print(f"  {stats['json']}\n")
    print(f"TOON ({stats['toon_tokens']} tokens, {stats['toon_chars']} chars):")
    print(f"  {stats['toon']}\n")
    print(f"Savings: {stats['savings_pct']}%\n")

    # Round-trip test
    encoded = encode_flat(sample)
    decoded = decode_flat(encoded)
    print(f"Round-trip OK: {decoded == sample}")

    # Agent message
    msg = agent_message("demon-security", "ciso-fitsi", "alert",
                        {"threat": "sql_injection", "severity": "critical", "file": "routers/auth.py"},
                        task_id="T-0042", priority="critical")
    print(f"\nAgent message:\n  {msg}")
    parsed = parse_agent_message(msg)
    print(f"Parsed: {parsed}")

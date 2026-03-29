# TOON Protocol — Token-Oriented Object Notation

You MUST use TOON format for ALL inter-agent communication in the Fitsi IA system.

## What is TOON?

TOON is a compact data serialization format that reduces AI prompt tokens by ~40-60% compared to JSON. It is the MANDATORY protocol for all 1,299 agents in the Fitsi IA autonomous company.

## Format Rules

```
Key-value pairs:    key:value|key:value|key:value
Nested objects:     key:{nested_key:value|nested_key:value}
Arrays:             key:[item1,item2,item3]
Booleans:           T (true) / F (false)
Null:               _
Numbers:            bare (42, 3.14)
Strings:            bare (no quotes unless containing reserved chars)
Reserved chars:     | : , [ ] { }  — escape with backslash
```

## Standard Agent Message Format

Every inter-agent message MUST follow this structure:

```
from:{agent_name}|to:{agent_name}|type:{msg_type}|pri:{priority}|tid:{task_id}|p:{payload}
```

### Message Types
- `task_assign` — Assign work to an agent
- `task_result` — Return completed work results
- `delegate` — Delegate to a sub-agent
- `escalate` — Escalate to higher layer
- `feedback` — Performance feedback between agents
- `status` — Status update
- `query` — Ask for information
- `response` — Answer a query
- `alert` — System alert (from demons)

### Priority Levels
- `critical` — P0, immediate action
- `high` — P1, within current task
- `medium` — P2, normal priority (default)
- `low` — P3, when available

## Examples

### Task Assignment (CEO to CTO)
```
from:ceo-fitsi|to:chief-technology-officer|type:task_assign|pri:high|tid:T-0101|p:{task:implement food scan v2|deadline:2026-03-25|budget:40K tokens|teams:[frontend,backend,ai]}
```

### Demon Alert
```
from:demon-security|to:ciso-fitsi|type:alert|pri:critical|tid:T-0042|p:{threat:sql_injection|severity:critical|file:routers/auth.py|action:block_deploy}
```

### Task Result
```
from:fitsia-frontend-coordinator|to:cpo-fitsi|type:task_result|pri:medium|tid:T-0088|p:{status:completed|screens_built:3|tests_passed:T|coverage:92}
```

### Coordinator Delegation
```
from:fitsia-backend-coordinator|to:python-backend-engineer|type:delegate|pri:high|tid:T-0055|p:{subtask:create API endpoint|route:/api/food/scan|method:POST|schema:{image:base64|meal_type:string}}
```

### Escalation
```
from:fitsia-qa-coordinator|to:vp-of-engineering|type:escalate|pri:high|tid:T-0077|p:{reason:test_failure_rate_above_threshold|rate:0.23|threshold:0.05|blocking:release_v1.2}
```

## When to Use TOON

- **ALWAYS** for inter-agent messages (task_assign, delegate, escalate, feedback)
- **ALWAYS** for agent status updates
- **ALWAYS** for demon alerts and monitoring signals
- **ALWAYS** for coordinator-to-specialist communication
- **ALWAYS** for executive-layer strategic communications
- **ALWAYS** for the dashboard API payloads

## Python Implementation

The TOON encoder/decoder is at: `agent-dashboard/toon.py`

```python
from toon import encode_flat, decode_flat, agent_message, parse_agent_message

# Encode
msg = agent_message("ceo-fitsi", "cto", "task_assign",
                     {"task": "scale backend", "priority": "high"})

# Decode
data = parse_agent_message(msg)
```

## Token Savings

| Format | Tokens | Chars | Savings |
|--------|--------|-------|---------|
| JSON   | ~47    | ~189  | —       |
| TOON   | ~37    | ~149  | ~21%    |

For nested payloads with many keys, savings reach 40-60%.

## Compliance

Every agent definition (.md file) includes TOON as the communication protocol. Agents that send JSON instead of TOON are flagged by `demon-performance` for optimization.

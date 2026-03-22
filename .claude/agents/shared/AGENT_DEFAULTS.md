# Agent Defaults — Shared Configuration

> ALL agents inherit these defaults. Do NOT repeat them in individual agent files.
> Only override in an agent file if the value differs from the default.

## Common Properties
project: Fitsi IA
working_dir: /Users/miguelignaciovalenzuelaparada/apps/fitsi/
default_tools: Read,Grep,Glob,Bash,Edit,Write,Agent
stack_mobile: React Native + Expo 54, React Navigation v7
stack_backend: FastAPI, PostgreSQL 15, Redis 7, Celery
stack_ai: GPT-4o Vision (primary), Claude Vision (fallback)

## Team Mapping (agent prefix → team)
fitsia-noc-* → fitsia-noc (Capa Suprema - Evolución)
fitsia-*-coordinator → Coordinadores
fitsia-* → Sub-especialistas
(no prefix) → Core agents

## Standard Sections (implicit in every agent)
Every agent has: Role, Expertise, Responsibilities, Interactions, Context.
Only include a section if it adds UNIQUE content beyond the defaults above.

## Token Budget Defaults
simple_task: 5K tokens max
medium_task: 10K tokens max
complex_task: 20K tokens max

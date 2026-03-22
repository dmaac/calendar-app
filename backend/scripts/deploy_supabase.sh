#!/bin/bash
# Quick deploy script for Supabase
set -e

cd "$(dirname "$0")/.."

echo "=== Fitsia IA — Supabase Deployment ==="
echo ""

echo "[1/4] Checking Supabase connection..."
python3 -c "
from app.core.database import engine
from sqlmodel import Session, text
with Session(engine) as s:
    r = s.exec(text('SELECT version()')).first()
    print(f'  Connected to: {r[0][:60]}')
"

echo ""
echo "[2/4] Running migrations..."
alembic upgrade head

echo ""
echo "[3/4] Seeding initial data..."
python3 -m scripts.seed_users --count 10

echo ""
echo "[4/4] Starting server..."
uvicorn app.main:app --host 0.0.0.0 --port 8000

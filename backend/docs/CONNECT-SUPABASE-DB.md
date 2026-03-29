# Connecting Fitsi Backend to Supabase PostgreSQL

This guide explains how to switch the backend database from local PostgreSQL to Supabase's managed PostgreSQL.

## Prerequisites

- A Supabase project (current project ID: `gxjqwjkrnoetkeujhhwi`)
- The database password you set when creating the project
- Backend running with `alembic` available

## Step 1: Get the Connection String

1. Go to **https://supabase.com/dashboard/project/gxjqwjkrnoetkeujhhwi/settings/database**
2. Scroll to **Connection string**
3. Select the **URI** tab
4. Copy the connection string — it looks like:
   ```
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password

> **Important**: Use the **Transaction (port 6543)** pooler connection for web apps.
> The **Session (port 5432)** pooler is for long-lived connections (migrations, scripts).

## Step 2: Update .env

Open `backend/.env` and replace the `DATABASE_URL` line:

```bash
# Before (local dev)
DATABASE_URL=postgresql://miguelignaciovalenzuelaparada@localhost:5432/calendar_db

# After (Supabase)
DATABASE_URL=postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

For **migrations only** (Alembic needs a direct connection, not pooled), you may also want to add:

```bash
# Direct connection for migrations (port 5432, not 6543)
DATABASE_URL_DIRECT=postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

## Step 3: Run Migrations

```bash
cd backend
source venv/bin/activate

# Apply all migrations to the Supabase database
alembic upgrade head
```

This creates all tables (users, food_logs, ai_scan_cache, etc.) in Supabase.

## Step 4: Seed Initial Data (Optional)

```bash
# Seed test users
python -m scripts.seed_users --count 10

# Seed food database
python seed_foods.py
```

## Step 5: Verify

```bash
# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Test health endpoint
curl http://localhost:8000/health
# Should show: "db_connected": true

# Test registration
curl -s -X POST http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"TestPass1234","first_name":"Test","last_name":"User"}'
```

## Step 6: Verify in Supabase Dashboard

1. Go to **https://supabase.com/dashboard/project/gxjqwjkrnoetkeujhhwi/editor**
2. You should see the `user` table with your test user
3. Browse other tables to confirm migrations ran correctly

## Troubleshooting

### "connection refused" or timeout
- Make sure you're using the correct port (6543 for pooler, 5432 for direct)
- Check that your IP is not blocked by Supabase network restrictions

### "password authentication failed"
- Double-check your database password in the Supabase dashboard
- Make sure `[YOUR-PASSWORD]` is URL-encoded if it contains special characters

### Alembic migrations fail
- Use the **direct connection** (port 5432) for migrations, not the pooler (port 6543)
- Set `DATABASE_URL_DIRECT` in .env and update `alembic/env.py` if needed

### SSL errors
- Supabase requires SSL. If your driver complains, append `?sslmode=require` to the URL:
  ```
  postgresql://...@...supabase.com:6543/postgres?sslmode=require
  ```

## Rollback to Local

To switch back to local PostgreSQL for development:

```bash
DATABASE_URL=postgresql://miguelignaciovalenzuelaparada@localhost:5432/calendar_db
```

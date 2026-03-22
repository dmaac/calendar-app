# Supabase Setup Guide for Fitsia IA

## 1. Create Supabase Project
1. Go to https://supabase.com and sign up
2. Create new project (region: us-east-1 for LATAM)
3. Save the password (you'll need it)

## 2. Get Connection String
1. Go to Settings > Database
2. Copy "Connection string" (URI format)
3. Replace [YOUR-PASSWORD] with your password
4. Set in backend/.env: DATABASE_URL=postgresql://...

## 3. Get API Keys
1. Go to Settings > API
2. Copy "anon public" key -> SUPABASE_ANON_KEY
3. Copy "service_role" key -> SUPABASE_SERVICE_KEY
4. Copy "URL" -> SUPABASE_URL

## 4. Create Storage Buckets
1. Go to Storage in Supabase dashboard
2. Create bucket: "food-scans" (public)
3. Create bucket: "profile-photos" (public)

## 5. Run Migrations
```bash
cd backend
alembic upgrade head
```

## 6. Seed Data
```bash
python -m scripts.seed_users --count 10
```

## 7. Start Backend
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 8. Update Mobile App
In mobile/.env or mobile/src/services/api.ts:
Set BASE_URL to your deployed backend URL.

#!/usr/bin/env python3
"""
Seed script — Generate 1000 realistic simulated users for load testing.

Usage:
    cd backend/
    python -m scripts.seed_users            # default 1000 users
    python -m scripts.seed_users --count 500

Idempotent: skips users whose email already exists.
Uses batch inserts for speed (~30s for 1000 users).
"""

import argparse
import asyncio
import random
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, async_engine, create_db_and_tables
from app.core.security import get_password_hash
from app.models.daily_nutrition_summary import DailyNutritionSummary
from app.models.food import Food
from app.models.meal_log import MealLog
from app.models.onboarding_profile import OnboardingProfile
from app.models.subscription import Subscription
from app.models.user import User

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"  # All seed users share one password (load test only)

FIRST_NAMES_ES = [
    "Miguel", "Sofia", "Santiago", "Valentina", "Matias", "Isabella",
    "Sebastian", "Camila", "Alejandro", "Fernanda", "Diego", "Catalina",
    "Nicolas", "Javiera", "Felipe", "Constanza", "Andres", "Martina",
    "Gabriel", "Francisca", "Tomas", "Antonia", "Joaquin", "Josefa",
    "Benjamin", "Emilia", "Vicente", "Macarena", "Lucas", "Amanda",
    "Daniel", "Paula", "Carlos", "Andrea", "Pablo", "Carolina",
    "Cristobal", "Daniela", "Ignacio", "Florencia",
]
FIRST_NAMES_EN = [
    "James", "Emma", "Liam", "Olivia", "Noah", "Ava", "William", "Sophia",
    "Oliver", "Mia", "Elijah", "Charlotte", "Lucas", "Amelia", "Mason",
    "Harper", "Logan", "Evelyn", "Alexander", "Abigail", "Ethan", "Emily",
    "Jacob", "Elizabeth", "Michael", "Avery", "Benjamin", "Ella", "Henry",
    "Scarlett", "Sebastian", "Grace", "Jack", "Chloe", "Daniel", "Victoria",
    "Owen", "Riley", "Samuel", "Aria",
]
FIRST_NAMES = FIRST_NAMES_ES + FIRST_NAMES_EN

LAST_NAMES_ES = [
    "Garcia", "Rodriguez", "Martinez", "Lopez", "Gonzalez", "Hernandez",
    "Perez", "Sanchez", "Ramirez", "Torres", "Flores", "Rivera",
    "Gomez", "Diaz", "Cruz", "Morales", "Reyes", "Gutierrez",
    "Ortiz", "Ramos", "Silva", "Vargas", "Castro", "Romero",
    "Mendoza", "Ruiz", "Alvarez", "Jimenez", "Medina", "Aguilar",
]
LAST_NAMES_EN = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Davis", "Miller",
    "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White",
    "Harris", "Martin", "Thompson", "Young", "Allen", "King",
]
LAST_NAMES = LAST_NAMES_ES + LAST_NAMES_EN

GOALS = ["lose", "maintain", "gain"]
GOAL_WEIGHTS = [0.60, 0.25, 0.15]

DIET_TYPES = ["classic", "vegetarian", "vegan", "keto", "paleo", "mediterranean", "pescatarian"]
MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]
PROVIDERS = ["email", "apple", "google"]
PROVIDER_WEIGHTS = [0.80, 0.15, 0.05]

HEARD_FROM = ["instagram", "tiktok", "friend", "google_search", "app_store", "youtube", "other"]
PAIN_POINTS = ["lack_of_time", "cravings", "motivation", "knowledge", "consistency", "emotional_eating"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def mifflin_st_jeor(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """Calculate BMR using Mifflin-St Jeor equation."""
    if gender == "male":
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
    return bmr


def calc_daily_calories(bmr: float, workouts_per_week: int, goal: str) -> int:
    """Apply activity multiplier and goal adjustment."""
    # Activity multiplier based on workouts per week
    if workouts_per_week <= 1:
        multiplier = 1.2
    elif workouts_per_week <= 3:
        multiplier = 1.375
    elif workouts_per_week <= 5:
        multiplier = 1.55
    else:
        multiplier = 1.725

    tdee = bmr * multiplier

    if goal == "lose":
        return max(1200, int(tdee - 500))
    elif goal == "gain":
        return int(tdee + 300)
    return int(tdee)


def calc_macros(calories: int, goal: str) -> tuple[int, int, int]:
    """Return (protein_g, carbs_g, fats_g) based on goal."""
    if goal == "lose":
        protein_pct, carbs_pct, fat_pct = 0.35, 0.35, 0.30
    elif goal == "gain":
        protein_pct, carbs_pct, fat_pct = 0.30, 0.45, 0.25
    else:
        protein_pct, carbs_pct, fat_pct = 0.30, 0.40, 0.30

    protein_g = int((calories * protein_pct) / 4)
    carbs_g = int((calories * carbs_pct) / 4)
    fats_g = int((calories * fat_pct) / 9)
    return protein_g, carbs_g, fats_g


def random_date_range(days_back: int = 30) -> list[date]:
    """Return list of dates from `days_back` days ago to yesterday."""
    today = date.today()
    return [today - timedelta(days=d) for d in range(days_back, 0, -1)]


# ---------------------------------------------------------------------------
# Seed food catalog (reusable foods for meal logs)
# ---------------------------------------------------------------------------

SEED_FOODS = [
    ("Chicken Breast", "Generic", 100, "g", 165, 31.0, 0.0, 3.6, 0.0, 0.0),
    ("Brown Rice", "Generic", 100, "g", 112, 2.3, 24.0, 0.8, 1.8, 0.4),
    ("Banana", "Generic", 120, "g", 105, 1.3, 27.0, 0.4, 3.1, 14.0),
    ("Scrambled Eggs", "Generic", 150, "g", 210, 14.0, 2.0, 16.0, 0.0, 1.5),
    ("Greek Yogurt", "Chobani", 170, "g", 100, 17.0, 6.0, 0.7, 0.0, 4.0),
    ("Salmon Fillet", "Generic", 150, "g", 280, 37.0, 0.0, 13.0, 0.0, 0.0),
    ("Avocado Toast", "Generic", 180, "g", 320, 8.0, 30.0, 20.0, 7.0, 2.0),
    ("Caesar Salad", "Generic", 250, "g", 350, 18.0, 15.0, 25.0, 3.0, 3.0),
    ("Protein Shake", "MyProtein", 400, "ml", 220, 35.0, 12.0, 4.0, 2.0, 6.0),
    ("Oatmeal", "Quaker", 250, "g", 300, 10.0, 55.0, 6.0, 8.0, 1.0),
    ("Turkey Sandwich", "Generic", 200, "g", 380, 25.0, 35.0, 14.0, 3.0, 5.0),
    ("Mixed Nuts", "Generic", 30, "g", 175, 5.0, 6.0, 16.0, 2.0, 1.0),
    ("Apple", "Generic", 180, "g", 95, 0.5, 25.0, 0.3, 4.4, 19.0),
    ("Pasta Bolognese", "Generic", 300, "g", 480, 22.0, 55.0, 18.0, 4.0, 8.0),
    ("Grilled Chicken Salad", "Generic", 280, "g", 280, 30.0, 12.0, 12.0, 4.0, 3.0),
    ("Lentil Soup", "Generic", 300, "ml", 230, 18.0, 40.0, 1.0, 16.0, 4.0),
    ("Protein Bar", "Quest", 60, "g", 200, 21.0, 22.0, 7.0, 14.0, 1.0),
    ("Steak", "Generic", 200, "g", 500, 46.0, 0.0, 34.0, 0.0, 0.0),
    ("Smoothie Bowl", "Generic", 350, "g", 380, 12.0, 65.0, 10.0, 8.0, 30.0),
    ("Tuna Wrap", "Generic", 220, "g", 340, 28.0, 30.0, 12.0, 3.0, 2.0),
]


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------

async def ensure_seed_foods(session: AsyncSession) -> list[int]:
    """Ensure seed foods exist and return their IDs."""
    # Check if seed foods already exist
    result = await session.exec(
        select(Food).where(Food.name.in_([f[0] for f in SEED_FOODS]))
    )
    existing = {f.name: f.id for f in result.all()}

    new_foods = []
    for name, brand, serving, unit, cal, pro, carb, fat, fiber, sugar in SEED_FOODS:
        if name not in existing:
            new_foods.append(Food(
                name=name, brand=brand, serving_size=serving, serving_unit=unit,
                calories=cal, protein_g=pro, carbs_g=carb, fat_g=fat,
                fiber_g=fiber, sugar_g=sugar, is_verified=True, created_by=None,
            ))

    if new_foods:
        session.add_all(new_foods)
        await session.commit()
        # Re-fetch IDs
        result = await session.exec(
            select(Food).where(Food.name.in_([f[0] for f in SEED_FOODS]))
        )
        existing = {f.name: f.id for f in result.all()}

    return list(existing.values())


async def seed_users(session: AsyncSession, count: int = 1000) -> None:
    """Create seed users with full profiles, meal logs, and subscriptions."""

    t0 = time.time()

    # Pre-hash password once (all seed users share the same password)
    hashed_pw = get_password_hash(SEED_PASSWORD)

    # Ensure food catalog
    print(f"[1/7] Ensuring seed food catalog ({len(SEED_FOODS)} items)...")
    food_ids = await ensure_seed_foods(session)

    # ----- Check existing seed users -----
    print(f"[2/7] Checking for existing seed users...")
    result = await session.exec(
        select(User.email).where(User.email.like(f"%@{SEED_EMAIL_DOMAIN}"))
    )
    existing_emails = set(result.all())

    dates_30d = random_date_range(30)

    # ----- Create users in batches -----
    BATCH = 100
    total_created = 0
    total_skipped = 0

    for batch_start in range(0, count, BATCH):
        batch_end = min(batch_start + BATCH, count)
        batch_num = batch_start // BATCH + 1
        total_batches = (count + BATCH - 1) // BATCH
        print(f"[3/7] Creating users batch {batch_num}/{total_batches} "
              f"({batch_start+1}-{batch_end})...")

        new_users = []
        for i in range(batch_start, batch_end):
            idx = i + 1
            email = f"user_{idx:04d}@{SEED_EMAIL_DOMAIN}"
            if email in existing_emails:
                total_skipped += 1
                continue

            provider = random.choices(PROVIDERS, weights=PROVIDER_WEIGHTS, k=1)[0]
            user = User(
                email=email,
                first_name=random.choice(FIRST_NAMES),
                last_name=random.choice(LAST_NAMES),
                hashed_password=hashed_pw if provider == "email" else None,
                provider=provider,
                provider_id=f"seed_{provider}_{idx}" if provider != "email" else None,
                is_premium=random.random() < 0.30,
                is_active=True,
                created_at=datetime.now(timezone.utc) - timedelta(days=random.randint(1, 90)),
                updated_at=datetime.now(timezone.utc),
            )
            new_users.append(user)

        if new_users:
            session.add_all(new_users)
            await session.flush()  # Assigns IDs without committing
            total_created += len(new_users)

    await session.commit()
    print(f"    -> Created {total_created}, skipped {total_skipped} existing")

    if total_created == 0 and total_skipped > 0:
        print("    All users already exist. Nothing more to do.")
        return

    # ----- Fetch all seed user IDs + their creation data -----
    print(f"[4/7] Fetching seed user IDs...")
    result = await session.exec(
        select(User).where(User.email.like(f"%@{SEED_EMAIL_DOMAIN}"))
    )
    seed_users_list = result.all()
    print(f"    -> Found {len(seed_users_list)} seed users")

    # Check which users already have onboarding profiles
    result = await session.exec(
        select(OnboardingProfile.user_id).where(
            OnboardingProfile.user_id.in_([u.id for u in seed_users_list])
        )
    )
    users_with_profiles = set(result.all())

    # ----- Create onboarding profiles -----
    print(f"[5/7] Creating onboarding profiles + subscriptions...")
    profiles_batch = []
    subs_batch = []

    for user in seed_users_list:
        if user.id in users_with_profiles:
            continue

        gender = random.choice(["male", "female"])
        age = random.randint(18, 65)
        height = round(random.uniform(150, 195), 1)
        weight = round(random.uniform(50, 120), 1)
        goal = random.choices(GOALS, weights=GOAL_WEIGHTS, k=1)[0]
        workouts = random.randint(0, 7)

        # Target weight based on goal
        if goal == "lose":
            target_weight = round(weight - random.uniform(5, 20), 1)
        elif goal == "gain":
            target_weight = round(weight + random.uniform(5, 15), 1)
        else:
            target_weight = weight

        # Calculate nutrition using Mifflin-St Jeor
        bmr = mifflin_st_jeor(weight, height, age, gender)
        daily_cals = calc_daily_calories(bmr, workouts, goal)
        protein_g, carbs_g, fats_g = calc_macros(daily_cals, goal)

        birth_date = date.today() - timedelta(days=age * 365 + random.randint(0, 364))

        profile = OnboardingProfile(
            user_id=user.id,
            gender=gender,
            workouts_per_week=workouts,
            heard_from=random.choice(HEARD_FROM),
            used_other_apps=random.random() < 0.6,
            height_cm=height,
            weight_kg=weight,
            unit_system=random.choice(["metric", "imperial"]),
            birth_date=birth_date,
            goal=goal,
            target_weight_kg=target_weight,
            weekly_speed_kg=round(random.choice([0.25, 0.5, 0.75, 1.0]), 2),
            pain_points=str(random.sample(PAIN_POINTS, k=random.randint(1, 3))),
            diet_type=random.choice(DIET_TYPES),
            daily_calories=daily_cals,
            daily_protein_g=protein_g,
            daily_carbs_g=carbs_g,
            daily_fats_g=fats_g,
            health_score=round(random.uniform(40, 95), 1),
            completed_at=datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30)),
            notifications_enabled=random.random() < 0.7,
            health_connected=random.random() < 0.3,
        )
        profiles_batch.append(profile)

        # Subscription
        sub_roll = random.random()
        if sub_roll < 0.55:
            plan, sub_status = "free", "active"
            price = 0.0
        elif sub_roll < 0.85:
            plan, sub_status = "monthly", "active"
            price = 9.99
        elif sub_roll < 0.95:
            plan, sub_status = "yearly", "active"
            price = 59.99
        else:
            plan, sub_status = "lifetime", "active"
            price = 149.99

        if plan != "free":
            subs_batch.append(Subscription(
                user_id=user.id,
                plan=plan,
                status=sub_status,
                price_paid=price,
                currency="USD",
                store=random.choice(["apple", "google"]),
                store_tx_id=f"seed_tx_{user.id}_{plan}",
                created_at=datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30)),
                updated_at=datetime.now(timezone.utc),
            ))

    if profiles_batch:
        session.add_all(profiles_batch)
    if subs_batch:
        session.add_all(subs_batch)
    await session.commit()
    print(f"    -> {len(profiles_batch)} profiles, {len(subs_batch)} subscriptions")

    # ----- Create meal logs + daily summaries (the heavy part) -----
    print(f"[6/7] Generating 30 days of meal logs + daily summaries...")

    # Check which users already have meal logs
    result = await session.exec(
        select(MealLog.user_id).where(
            MealLog.user_id.in_([u.id for u in seed_users_list])
        ).distinct()
    )
    users_with_logs = set(result.all())

    users_needing_logs = [u for u in seed_users_list if u.id not in users_with_logs]
    total_logs = 0
    total_summaries = 0

    for chunk_start in range(0, len(users_needing_logs), BATCH):
        chunk = users_needing_logs[chunk_start:chunk_start + BATCH]
        chunk_num = chunk_start // BATCH + 1
        total_chunks = (len(users_needing_logs) + BATCH - 1) // BATCH
        print(f"    Meal logs chunk {chunk_num}/{total_chunks}...")

        meals_batch = []
        summaries_batch = []

        for user in chunk:
            # Get this user's profile for calorie targets
            for day in dates_30d:
                # 15% chance of no log for this day (simulate inconsistency)
                if random.random() < 0.15:
                    continue

                num_meals = random.randint(2, 5)
                day_calories = 0.0
                day_protein = 0.0
                day_carbs = 0.0
                day_fat = 0.0
                day_fiber = 0.0
                day_sugar = 0.0

                for _ in range(num_meals):
                    food_id = random.choice(food_ids)
                    servings = round(random.uniform(0.5, 2.5), 1)

                    # Look up food macros from our catalog
                    food_data = SEED_FOODS[food_ids.index(food_id) % len(SEED_FOODS)]
                    cal = food_data[4] * servings
                    pro = food_data[5] * servings
                    carb = food_data[6] * servings
                    fat = food_data[7] * servings
                    fiber = food_data[8] * servings
                    sugar = food_data[9] * servings

                    day_calories += cal
                    day_protein += pro
                    day_carbs += carb
                    day_fat += fat
                    day_fiber += fiber
                    day_sugar += sugar

                    meals_batch.append(MealLog(
                        user_id=user.id,
                        date=day,
                        meal_type=random.choice(MEAL_TYPES),
                        food_id=food_id,
                        servings=servings,
                        total_calories=round(cal, 1),
                        total_protein=round(pro, 1),
                        total_carbs=round(carb, 1),
                        total_fat=round(fat, 1),
                        total_fiber=round(fiber, 1),
                        total_sugar=round(sugar, 1),
                        created_at=datetime.combine(day, datetime.min.time()) + timedelta(hours=random.randint(6, 22)),
                    ))

                summaries_batch.append(DailyNutritionSummary(
                    user_id=user.id,
                    date=day,
                    total_calories=round(day_calories, 1),
                    total_protein=round(day_protein, 1),
                    total_carbs=round(day_carbs, 1),
                    total_fat=round(day_fat, 1),
                    target_calories=2000.0,
                    water_ml=round(random.uniform(500, 3000), 0),
                ))

        if meals_batch:
            session.add_all(meals_batch)
            total_logs += len(meals_batch)
        if summaries_batch:
            session.add_all(summaries_batch)
            total_summaries += len(summaries_batch)

        await session.commit()

    print(f"    -> {total_logs} meal logs, {total_summaries} daily summaries")

    # ----- Referrals (simple: 10% of users have a referral_code set) -----
    print(f"[7/7] Setting referral codes...")
    referral_count = 0
    for user in seed_users_list:
        if random.random() < 0.10:
            # Update onboarding profile with referral code
            result = await session.exec(
                select(OnboardingProfile).where(OnboardingProfile.user_id == user.id)
            )
            profile = result.first()
            if profile and not profile.referral_code:
                profile.referral_code = f"REF{user.id:06d}"
                session.add(profile)
                referral_count += 1

    await session.commit()
    print(f"    -> {referral_count} referral codes set")

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"SEED COMPLETE in {elapsed:.1f}s")
    print(f"  Users:       {len(seed_users_list)}")
    print(f"  Profiles:    {len(profiles_batch)}")
    print(f"  Meal logs:   {total_logs}")
    print(f"  Summaries:   {total_summaries}")
    print(f"  Subs:        {len(subs_batch)}")
    print(f"  Referrals:   {referral_count}")
    print(f"{'='*60}")


async def main():
    parser = argparse.ArgumentParser(description="Seed Fitsi IA database with test users")
    parser.add_argument("--count", type=int, default=1000, help="Number of users to create")
    args = parser.parse_args()

    print(f"Fitsi IA — Seed Script")
    print(f"Database: {settings.database_url[:50]}...")
    print(f"Target users: {args.count}")
    print(f"{'='*60}")

    # Ensure tables exist
    await create_db_and_tables()

    async with AsyncSessionLocal() as session:
        await seed_users(session, count=args.count)


if __name__ == "__main__":
    asyncio.run(main())

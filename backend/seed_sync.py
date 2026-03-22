"""
Synchronous seed script — works with the async codebase by using psycopg2 directly.
Creates 20 users + 25 foods in the already-migrated DB.

Passwords: User1pass1, User2pass2, ... (meets policy: uppercase + lowercase + digit)
"""
import os
import sys
from datetime import datetime, timedelta
import random

sys.path.insert(0, os.path.dirname(__file__))

# Import only the password hasher (sync, no DB dependency)
from passlib.context import CryptContext
import psycopg2

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# ─── Config ──────────────────────────────────────────────────────────────────
DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://miguelignaciovalenzuelaparada@localhost:5432/calendar_db",
)

FIRST_NAMES = [
    "Juan", "María", "Carlos", "Ana", "Luis", "Carmen", "José", "Isabel",
    "Miguel", "Laura", "Pedro", "Sofía", "Diego", "Valentina", "Javier",
    "Camila", "Ricardo", "Daniela", "Fernando", "Gabriela",
]
LAST_NAMES = [
    "García", "Rodríguez", "Martínez", "López", "González", "Pérez", "Sánchez",
    "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Cruz", "Morales",
    "Reyes", "Gutiérrez", "Ortiz", "Jiménez", "Hernández",
]

COMMON_FOODS = [
    ("Chicken Breast", "Generic", 100, "g", 165, 31.0, 0.0, 3.6, 0.0, 0.0),
    ("White Rice (cooked)", "Generic", 100, "g", 130, 2.7, 28.2, 0.3, 0.4, 0.0),
    ("Whole Eggs", "Generic", 100, "g", 155, 13.0, 1.1, 11.0, 0.0, 1.1),
    ("Banana", "Generic", 100, "g", 89, 1.1, 22.8, 0.3, 2.6, 12.2),
    ("Oatmeal (dry)", "Generic", 100, "g", 389, 16.9, 66.3, 6.9, 10.6, 0.0),
    ("Salmon (Atlantic)", "Generic", 100, "g", 208, 20.4, 0.0, 13.4, 0.0, 0.0),
    ("Broccoli", "Generic", 100, "g", 34, 2.8, 6.6, 0.4, 2.6, 1.7),
    ("Sweet Potato", "Generic", 100, "g", 86, 1.6, 20.1, 0.1, 3.0, 4.2),
    ("Greek Yogurt", "Generic", 100, "g", 59, 10.2, 3.6, 0.4, 0.0, 3.2),
    ("Almonds", "Generic", 100, "g", 579, 21.2, 21.6, 49.9, 12.5, 4.4),
    ("Avocado", "Generic", 100, "g", 160, 2.0, 8.5, 14.7, 6.7, 0.7),
    ("Whole Milk", "Generic", 100, "ml", 61, 3.2, 4.8, 3.3, 0.0, 5.0),
    ("Whole Wheat Bread", "Generic", 100, "g", 247, 13.0, 41.3, 3.4, 6.0, 5.6),
    ("Pasta (cooked)", "Generic", 100, "g", 131, 5.0, 25.0, 1.1, 1.8, 0.6),
    ("Apple", "Generic", 100, "g", 52, 0.3, 13.8, 0.2, 2.4, 10.4),
    ("Orange", "Generic", 100, "g", 47, 0.9, 11.8, 0.1, 2.4, 9.4),
    ("Ground Beef 85%", "Generic", 100, "g", 250, 26.1, 0.0, 15.0, 0.0, 0.0),
    ("Tuna (canned)", "Generic", 100, "g", 116, 25.5, 0.0, 0.8, 0.0, 0.0),
    ("Spinach (raw)", "Generic", 100, "g", 23, 2.9, 3.6, 0.4, 2.2, 0.4),
    ("Olive Oil", "Generic", 100, "ml", 884, 0.0, 0.0, 100.0, 0.0, 0.0),
    ("Peanut Butter", "Generic", 100, "g", 588, 25.1, 20.0, 50.4, 6.0, 9.2),
    ("Brown Rice", "Generic", 100, "g", 111, 2.6, 23.0, 0.9, 1.8, 0.4),
    ("Cottage Cheese", "Generic", 100, "g", 72, 12.4, 2.7, 1.0, 0.0, 2.7),
    ("Whey Protein", "Generic", 100, "g", 375, 78.0, 9.0, 3.0, 0.0, 3.0),
    ("Turkey Breast", "Generic", 100, "g", 135, 30.0, 0.0, 1.0, 0.0, 0.0),
]


def seed():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    now = datetime.utcnow()

    print("=" * 60)
    print("  SEED: 20 usuarios + 25 alimentos")
    print("=" * 60)

    # ── Users ────────────────────────────────────────────────────────────────
    print("\n--- Usuarios ---")
    for i in range(1, 21):
        email = f"user{i}@fitsiai.com"
        # Password meets policy: uppercase + lowercase + digit
        password = f"User{i}pass{i}"
        hashed = pwd_context.hash(password)
        first = FIRST_NAMES[i - 1]
        last = LAST_NAMES[i - 1]

        cur.execute(
            """
            INSERT INTO "user" (email, first_name, last_name, hashed_password, is_active, provider, is_premium, created_at, updated_at)
            VALUES (%s, %s, %s, %s, true, 'email', false, %s, %s)
            ON CONFLICT (email) DO UPDATE SET hashed_password = EXCLUDED.hashed_password,
                first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name
            RETURNING id
            """,
            (email, first, last, hashed, now, now),
        )
        user_id = cur.fetchone()[0]
        print(f"  {i:2d}. {email:25s} | {password:15s} | {first} {last}")

    # ── Foods ────────────────────────────────────────────────────────────────
    print("\n--- Alimentos ---")
    for name, brand, size, unit, cal, prot, carb, fat, fiber, sugar in COMMON_FOODS:
        cur.execute(
            """
            INSERT INTO food (name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, is_verified, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true, %s)
            ON CONFLICT DO NOTHING
            """,
            (name, brand, size, unit, cal, prot, carb, fat, fiber, sugar, now),
        )
    print(f"  Insertados {len(COMMON_FOODS)} alimentos")

    conn.commit()
    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("  CREDENCIALES")
    print("=" * 60)
    print(f"  Email:    user{{1-20}}@fitsiai.com")
    print(f"  Password: User{{N}}pass{{N}}  (ej: User1pass1)")
    print("=" * 60)
    print("\nSeed completado.")


if __name__ == "__main__":
    seed()

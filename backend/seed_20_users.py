"""
Seed script to populate the database with 20 test users.

This script creates 20 different users with unique emails and passwords.
All passwords follow the format: userpass{number} (e.g., userpass1, userpass2, etc.)
All emails follow the format: user{number}@calendar.com (e.g., user1@calendar.com)

GENERATED USERS:
================
user1@calendar.com  / userpass1
user2@calendar.com  / userpass2
user3@calendar.com  / userpass3
user4@calendar.com  / userpass4
user5@calendar.com  / userpass5
user6@calendar.com  / userpass6
user7@calendar.com  / userpass7
user8@calendar.com  / userpass8
user9@calendar.com  / userpass9
user10@calendar.com / userpass10
user11@calendar.com / userpass11
user12@calendar.com / userpass12
user13@calendar.com / userpass13
user14@calendar.com / userpass14
user15@calendar.com / userpass15
user16@calendar.com / userpass16
user17@calendar.com / userpass17
user18@calendar.com / userpass18
user19@calendar.com / userpass19
user20@calendar.com / userpass20

Each user also has 2-3 sample activities created for them.
"""

import os
import sys
from datetime import datetime, timedelta
from sqlmodel import Session, create_engine, select
import random

# Add the current directory to Python path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.models.user import User, UserCreate
from app.models.activity import Activity, ActivityCreate, ActivityStatus
from app.services.user_service import UserService
from app.services.activity_service import ActivityService
from app.core.database import create_db_and_tables
from app.core.security import get_password_hash

# Sample first and last names for variety
FIRST_NAMES = [
    "Juan", "María", "Carlos", "Ana", "Luis", "Carmen", "José", "Isabel",
    "Miguel", "Laura", "Pedro", "Sofía", "Diego", "Valentina", "Javier",
    "Camila", "Ricardo", "Daniela", "Fernando", "Gabriela"
]

LAST_NAMES = [
    "García", "Rodríguez", "Martínez", "López", "González", "Pérez", "Sánchez",
    "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Cruz", "Morales",
    "Reyes", "Gutiérrez", "Ortiz", "Jiménez", "Hernández"
]

# Sample activities for users
ACTIVITY_TEMPLATES = [
    {
        "title": "Reunión de Equipo",
        "description": "Reunión semanal del equipo para coordinar tareas",
        "duration_hours": 1
    },
    {
        "title": "Revisión de Proyecto",
        "description": "Revisión del progreso del proyecto actual",
        "duration_hours": 2
    },
    {
        "title": "Capacitación Técnica",
        "description": "Sesión de capacitación en nuevas tecnologías",
        "duration_hours": 3
    },
    {
        "title": "Presentación de Resultados",
        "description": "Presentación de resultados del mes",
        "duration_hours": 1.5
    },
    {
        "title": "Planning Session",
        "description": "Sesión de planificación estratégica",
        "duration_hours": 2
    },
    {
        "title": "Code Review",
        "description": "Revisión de código y mejores prácticas",
        "duration_hours": 1
    },
    {
        "title": "Cliente Meeting",
        "description": "Reunión con cliente para feedback",
        "duration_hours": 1.5
    },
    {
        "title": "Sprint Retrospective",
        "description": "Retrospectiva del sprint anterior",
        "duration_hours": 1
    },
    {
        "title": "Desarrollo Backend",
        "description": "Sesión de desarrollo de nuevas funcionalidades",
        "duration_hours": 4
    },
    {
        "title": "Testing QA",
        "description": "Pruebas de calidad y detección de bugs",
        "duration_hours": 2
    }
]

def create_20_users():
    """Create 20 test users with sample activities"""

    print("="*70)
    print("  CREANDO 20 USUARIOS DE PRUEBA")
    print("="*70)
    print()

    print("Creando database y tablas...")
    create_db_and_tables()

    # Create engine and session
    engine = create_engine(settings.database_url, echo=False)

    with Session(engine) as session:
        user_service = UserService(session)
        activity_service = ActivityService(session)

        created_users = []

        print(f"\nCreando usuarios...")
        print("-"*70)

        for i in range(1, 21):
            email = f"user{i}@calendar.com"
            password = f"userpass{i}"
            first_name = FIRST_NAMES[i-1]
            last_name = LAST_NAMES[i-1]

            # Check if user already exists
            statement = select(User).where(User.email == email)
            existing_user = session.exec(statement).first()

            if existing_user:
                print(f"  {i:2d}. ✓ Usuario {email} ya existe (actualizando password)")
                existing_user.hashed_password = get_password_hash(password)
                existing_user.first_name = first_name
                existing_user.last_name = last_name
                session.add(existing_user)
                session.commit()
                session.refresh(existing_user)
                user = existing_user
            else:
                # Create new user
                user_data = UserCreate(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    password=password,
                    is_active=True
                )
                user = user_service.create_user(user_data)
                print(f"  {i:2d}. ✓ Creado: {email:25s} | {first_name} {last_name}")

            created_users.append(user)

            # Create 2-3 random activities for each user
            num_activities = random.randint(2, 3)
            today = datetime.now()

            for j in range(num_activities):
                # Random day in the next 30 days
                days_ahead = random.randint(1, 30)
                hour = random.randint(8, 16)  # Between 8 AM and 4 PM

                activity_template = random.choice(ACTIVITY_TEMPLATES)

                start_time = today + timedelta(days=days_ahead, hours=hour)
                end_time = start_time + timedelta(hours=activity_template["duration_hours"])

                activity_title = f"{activity_template['title']} - {first_name}"

                # Check if activity already exists
                statement = select(Activity).where(
                    Activity.user_id == user.id,
                    Activity.title == activity_title
                )
                existing_activity = session.exec(statement).first()

                if not existing_activity:
                    try:
                        activity_create = ActivityCreate(
                            title=activity_title,
                            description=activity_template["description"],
                            start_time=start_time.isoformat(),
                            end_time=end_time.isoformat(),
                            status=ActivityStatus.SCHEDULED
                        )
                        activity_service.create_activity(activity_create, user.id)
                    except Exception as e:
                        # Skip if there's an error (e.g., duplicate title)
                        pass

        print("-"*70)
        print(f"\n✅ Total usuarios creados/actualizados: {len(created_users)}")

        print("\n" + "="*70)
        print("  CREDENCIALES DE LOS 20 USUARIOS")
        print("="*70)
        print(f"\n{'#':<4} {'Email':<25} {'Password':<15} {'Nombre':<30}")
        print("-"*70)

        for i in range(1, 21):
            email = f"user{i}@calendar.com"
            password = f"userpass{i}"
            name = f"{FIRST_NAMES[i-1]} {LAST_NAMES[i-1]}"
            print(f"{i:<4} {email:<25} {password:<15} {name:<30}")

        print("="*70)

        print("\n" + "="*70)
        print("  RESUMEN")
        print("="*70)
        print(f"  Total Usuarios: 20")
        print(f"  Formato Email:  user{{1-20}}@calendar.com")
        print(f"  Formato Pass:   userpass{{1-20}}")
        print(f"  Actividades:    2-3 por usuario")
        print("="*70)

        print("\n" + "="*70)
        print("  SERVIDOR")
        print("="*70)
        print(f"  API URL:  http://{settings.server_host}:{settings.server_port}")
        print(f"  API Docs: http://{settings.server_host}:{settings.server_port}/docs")
        print("="*70)

        print("\n✅ Proceso completado exitosamente!")
        print("\nPuedes hacer login con cualquiera de estos usuarios.")
        print("\nEjemplo:")
        print("  Email:    user1@calendar.com")
        print("  Password: userpass1")

if __name__ == "__main__":
    create_20_users()
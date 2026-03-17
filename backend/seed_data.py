"""
Seed script to populate the database with example activities for the next month.

TEST USER CREDENTIALS:
=====================
Email: test@calendar.com
Password: testpass123
First Name: Test
Last Name: User
Status: Active (is_active=True)

SERVER INFORMATION:
==================
Host: localhost
Port: 8000
API URL: http://localhost:8000
API Docs: http://localhost:8000/docs
API Redoc: http://localhost:8000/redoc

This script creates:
- 1 test user with the credentials above
- 5 example activities scheduled for next month
"""

import os
import sys
from datetime import datetime, timedelta
from sqlmodel import Session, create_engine, select

# Add the current directory to Python path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.models.user import User, UserCreate
from app.models.activity import Activity, ActivityCreate, ActivityStatus
from app.services.user_service import UserService
from app.services.activity_service import ActivityService
from app.core.database import create_db_and_tables
from app.core.security import get_password_hash

def create_seed_data():
    """Create seed data with a test user and 5 example activities for next month"""

    print("Creating database and tables...")
    create_db_and_tables()

    # Create engine and session
    engine = create_engine(settings.database_url, echo=True)

    with Session(engine) as session:
        user_service = UserService(session)
        activity_service = ActivityService(session)

        # Check if test user already exists
        test_email = "test@calendar.com"
        test_password = "testpass123"
        statement = select(User).where(User.email == test_email)
        existing_user = session.exec(statement).first()

        if existing_user:
            print(f"Test user with email {test_email} already exists.")
            print(f"Updating password to ensure it's set to: {test_password}")
            # Update password to ensure it matches the documented credentials
            existing_user.hashed_password = get_password_hash(test_password)
            session.add(existing_user)
            session.commit()
            session.refresh(existing_user)
            test_user = existing_user
            print(f"Password updated successfully.")
        else:
            # Create test user with all parameters documented
            print("Creating test user...")
            test_user_data = UserCreate(
                email=test_email,          # Email: test@calendar.com
                first_name="Test",          # First name: Test
                last_name="User",           # Last name: User
                password=test_password,     # Password: testpass123 (will be hashed)
                is_active=True              # Active status: True
            )
            test_user = user_service.create_user(test_user_data)
            print(f"Created test user: {test_user.email}")

        # Calculate dates for next month
        today = datetime.now()
        next_month_start = today.replace(day=1) + timedelta(days=32)
        next_month_start = next_month_start.replace(day=1)

        # Define 5 example activities for next month
        example_activities = [
            {
                "title": "Reunión de Planificación de Proyecto",
                "description": "Reunión semanal del equipo para revisar el progreso del proyecto y planificar las siguientes tareas",
                "start_time": next_month_start + timedelta(days=2, hours=9),
                "end_time": next_month_start + timedelta(days=2, hours=10, minutes=30),
                "status": ActivityStatus.SCHEDULED
            },
            {
                "title": "Presentación de Resultados Trimestrales",
                "description": "Presentación de los resultados del trimestre al equipo directivo",
                "start_time": next_month_start + timedelta(days=7, hours=14),
                "end_time": next_month_start + timedelta(days=7, hours=16),
                "status": ActivityStatus.SCHEDULED
            },
            {
                "title": "Capacitación en Nuevas Herramientas",
                "description": "Sesión de capacitación sobre las nuevas herramientas de desarrollo implementadas",
                "start_time": next_month_start + timedelta(days=12, hours=10),
                "end_time": next_month_start + timedelta(days=12, hours=12),
                "status": ActivityStatus.SCHEDULED
            },
            {
                "title": "Revisión de Código y Calidad",
                "description": "Sesión dedicada a revisar el código desarrollado y asegurar estándares de calidad",
                "start_time": next_month_start + timedelta(days=18, hours=15),
                "end_time": next_month_start + timedelta(days=18, hours=17),
                "status": ActivityStatus.SCHEDULED
            },
            {
                "title": "Demo del Producto para Clientes",
                "description": "Demostración del producto actualizado para clientes potenciales",
                "start_time": next_month_start + timedelta(days=25, hours=11),
                "end_time": next_month_start + timedelta(days=25, hours=12, minutes=30),
                "status": ActivityStatus.SCHEDULED
            }
        ]

        # Create activities
        print(f"\nCreating 5 example activities for {next_month_start.strftime('%B %Y')}...")

        for i, activity_data in enumerate(example_activities, 1):
            try:
                # Check if activity already exists
                statement = select(Activity).where(
                    Activity.user_id == test_user.id,
                    Activity.title == activity_data["title"]
                )
                existing_activity = session.exec(statement).first()

                if existing_activity:
                    print(f"  {i}. Activity '{activity_data['title']}' already exists. Skipping.")
                    continue

                activity_create = ActivityCreate(**activity_data)
                activity = activity_service.create_activity(activity_create, test_user.id)
                print(f"  {i}. Created: '{activity.title}' on {activity.start_time.strftime('%Y-%m-%d %H:%M')}")

            except Exception as e:
                print(f"  {i}. Error creating activity '{activity_data['title']}': {e}")

        print(f"\nSeed data creation completed!")
        print(f"\n" + "="*60)
        print(f"TEST USER CREDENTIALS:")
        print(f"="*60)
        print(f"  Email:      {test_user.email}")
        print(f"  Password:   testpass123")
        print(f"  First Name: {test_user.first_name}")
        print(f"  Last Name:  {test_user.last_name}")
        print(f"  Status:     {'Active' if test_user.is_active else 'Inactive'}")
        print(f"="*60)
        print(f"\n" + "="*60)
        print(f"SERVER INFORMATION:")
        print(f"="*60)
        print(f"  Host:       {settings.server_host}")
        print(f"  Port:       {settings.server_port}")
        print(f"  API URL:    http://{settings.server_host}:{settings.server_port}")
        print(f"  API Docs:   http://{settings.server_host}:{settings.server_port}/docs")
        print(f"  API Redoc:  http://{settings.server_host}:{settings.server_port}/redoc")
        print(f"="*60)
        print(f"\nYou can now login with these credentials and see the example activities.")
        print(f"\nTo start the server, run:")
        print(f"  ./start_server.sh")

if __name__ == "__main__":
    create_seed_data()
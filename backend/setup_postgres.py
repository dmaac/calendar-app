"""
Script to help setup PostgreSQL database and update configuration
"""

import os
import subprocess
import sys

def install_postgresql_deps():
    """Install PostgreSQL dependencies"""
    print("Installing PostgreSQL dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary==2.9.9"])
        print("✅ PostgreSQL dependencies installed successfully")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install PostgreSQL dependencies")
        return False

def update_env_for_postgres():
    """Update .env file to use PostgreSQL"""
    env_path = ".env"

    if not os.path.exists(env_path):
        print("❌ .env file not found. Please copy from .env.example first.")
        return False

    with open(env_path, 'r') as f:
        content = f.read()

    # Replace SQLite URL with PostgreSQL URL
    if "sqlite:" in content:
        content = content.replace(
            "DATABASE_URL=sqlite:///./calendar.db",
            "DATABASE_URL=postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db"
        )

        with open(env_path, 'w') as f:
            f.write(content)

        print("✅ Updated .env file to use PostgreSQL")
        return True
    else:
        print("ℹ️  .env file already configured for PostgreSQL")
        return True

def create_postgres_docker_compose():
    """Create a docker-compose file for PostgreSQL"""
    docker_compose_content = """version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: calendar_db
      POSTGRES_USER: calendar_user
      POSTGRES_PASSWORD: calendar_pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U calendar_user -d calendar_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://calendar_user:calendar_pass@postgres:5432/calendar_db
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - .:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

volumes:
  postgres_data:
"""

    with open("docker-compose.postgres.yml", "w") as f:
        f.write(docker_compose_content)

    print("✅ Created docker-compose.postgres.yml for PostgreSQL setup")

def print_instructions():
    """Print setup instructions"""
    print("\n" + "="*60)
    print("📋 PostgreSQL Setup Instructions")
    print("="*60)
    print()
    print("1. Start PostgreSQL with Docker:")
    print("   docker-compose -f docker-compose.postgres.yml up -d postgres")
    print()
    print("2. Wait for PostgreSQL to be ready, then run migrations:")
    print("   alembic upgrade head")
    print()
    print("3. Run the seed script to populate data:")
    print("   python seed_data.py")
    print()
    print("4. Start the API server:")
    print("   uvicorn app.main:app --reload")
    print()
    print("5. Or start everything with Docker:")
    print("   docker-compose -f docker-compose.postgres.yml up")
    print()
    print("🔗 Database connection details:")
    print("   Host: localhost")
    print("   Port: 5432")
    print("   Database: calendar_db")
    print("   User: calendar_user")
    print("   Password: calendar_pass")
    print()

if __name__ == "__main__":
    print("🚀 Setting up PostgreSQL configuration...")
    print()

    success = True

    # Install dependencies
    if not install_postgresql_deps():
        success = False

    # Update environment
    if success and not update_env_for_postgres():
        success = False

    # Create docker compose
    if success:
        create_postgres_docker_compose()

    if success:
        print("\n✅ PostgreSQL setup completed successfully!")
        print_instructions()
    else:
        print("\n❌ PostgreSQL setup failed. Please check the errors above.")
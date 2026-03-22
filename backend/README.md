# Fitsi IA API Backend

FastAPI backend for Fitsi IA with PostgreSQL database, SQLModel ORM, and JWT authentication.

## Features

- 🚀 RESTful API with automatic OpenAPI documentation
- 🔐 User authentication with JWT tokens
- 📅 Activity CRUD operations with user isolation
- 🗄️ PostgreSQL database with SQLModel ORM
- ✅ Data validation with Pydantic
- 🏗️ Object-oriented architecture with service layer
- 🐳 Docker support for easy deployment
- 📊 Sample data with test user for quick testing

## Quick Start

### Prerequisites
- Python 3.8+
- PostgreSQL 12+

### Setup Instructions

1. **Create PostgreSQL Database**:
   ```bash
   # Create database user and database
   psql postgres -c "CREATE USER calendar_user WITH PASSWORD 'calendar_pass';"
   psql postgres -c "CREATE DATABASE calendar_db OWNER calendar_user;"
   psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE calendar_db TO calendar_user;"
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set Environment Variables**:
   ```bash
   cp .env.example .env
   # The .env file is already configured with the correct PostgreSQL settings
   ```

4. **Initialize Database with Sample Data**:
   ```bash
   python seed_data.py
   ```

5. **Run the Server**:
   ```bash
   uvicorn app.main:app --reload
   ```

6. **Access API Documentation**:
   - Swagger UI: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc

### Test User Credentials

After running the seed script, you can use these credentials to test the API:

- **Email**: `test@calendar.com`
- **Password**: `testpassword123`

The test user comes with 5 sample activities for October 2025.

## Environment Variables

The `.env` file contains the following configuration:

```bash
DATABASE_URL=postgresql://calendar_user:calendar_pass@localhost:5432/calendar_db
SECRET_KEY=your-secret-key-here-calendar-app-development-2024
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## API Endpoints

### Authentication

#### `POST /auth/register`
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "password": "securepassword123"
}
```

#### `POST /auth/login`
Login with email and password to receive JWT token.

**Request Body (Form Data):**
```bash
username=test@calendar.com&password=testpassword123
```

**Content-Type:** `application/x-www-form-urlencoded`

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "test@calendar.com",
    "first_name": "Test",
    "last_name": "User",
    "is_active": true
  }
}
```

#### `GET /auth/me`
Get current user profile (requires authentication).

### Activities

#### `GET /activities`
List user activities with optional date filtering.

**Query Parameters:**
- `start_date` (optional): Filter activities from this date (YYYY-MM-DD)
- `end_date` (optional): Filter activities to this date (YYYY-MM-DD)

#### `POST /activities`
Create a new activity (requires authentication).

**Request Body:**
```json
{
  "title": "Team Meeting",
  "description": "Weekly team sync",
  "start_time": "2025-10-15T09:00:00",
  "end_time": "2025-10-15T10:00:00",
  "status": "SCHEDULED"
}
```

#### `GET /activities/{id}`
Get a specific activity by ID (requires authentication).

#### `PUT /activities/{id}`
Update an existing activity (requires authentication).

#### `DELETE /activities/{id}`
Delete an activity (requires authentication).

## Database Models

### User Model
```python
class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    activities: List["Activity"] = Relationship(back_populates="user")
```

### Activity Model
```python
class Activity(ActivityBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    user: "User" = Relationship(back_populates="activities")
```

## Testing the API

### Using curl

1. **Login to get access token:**
```bash
curl -X POST "http://localhost:8000/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@calendar.com&password=testpassword123"
```

2. **Get activities (use the token from login response):**
```bash
curl -X GET "http://localhost:8000/activities/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

3. **Create a new activity:**
```bash
curl -X POST "http://localhost:8000/activities" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -d '{
    "title": "New Meeting",
    "description": "Important discussion",
    "start_time": "2025-10-30T14:00:00",
    "end_time": "2025-10-30T15:00:00",
    "status": "SCHEDULED"
  }'
```

### Using Swagger UI

1. Go to http://localhost:8000/docs
2. Click on "Authorize" button
3. Login with the test credentials to get a token
4. Use the token to authorize and test the endpoints

## Docker Usage

### Using Docker Compose

```bash
# Start PostgreSQL and API with Docker
docker-compose -f docker-compose.postgres.yml up -d

# Check logs
docker-compose -f docker-compose.postgres.yml logs -f api
```

### Manual Docker Setup

```bash
# Build the image
docker build -t calendar-api .

# Run with Docker
docker run -p 8000:8000 --env-file .env calendar-api
```

## Development

### Project Structure

```
backend/
├── app/
│   ├── core/           # Core configuration and database
│   ├── models/         # SQLModel database models
│   ├── schemas/        # Pydantic schemas
│   ├── services/       # Business logic layer
│   ├── routers/        # FastAPI route handlers
│   └── main.py         # FastAPI application
├── tests/              # Test files
├── requirements.txt    # Python dependencies
├── seed_data.py       # Database seeding script
└── README.md          # This file
```

### Running Tests

```bash
# Run tests (if test files are present)
pytest

# Run with coverage
pytest --cov=app
```

## Activity Status Options

- `SCHEDULED` - Activity is planned for the future
- `COMPLETED` - Activity has been finished
- `CANCELLED` - Activity has been cancelled

## Troubleshooting

### Common Issues

1. **Database connection error:**
   - Ensure PostgreSQL is running
   - Check database credentials in `.env`
   - Verify database and user exist

2. **Authentication errors:**
   - Ensure you're using the correct JWT token
   - Check token expiration (default: 30 minutes)

3. **Permission errors:**
   - Users can only access their own activities
   - Ensure you're authenticated for protected endpoints
# Calendar API Documentation

## Base URL
```
http://localhost:8000
```

## Authentication

All API endpoints (except registration and login) require authentication via JWT tokens.

### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## Endpoints

### Authentication

#### Register User
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request` - Email already registered
- `422 Validation Error` - Invalid input data

---

#### Login User
```http
POST /auth/login
```

**Request Body (Form Data):**
```
username=user@example.com
password=securepassword123
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid credentials
- `400 Bad Request` - Inactive user

---

#### Get Current User
```http
GET /auth/me
```

**Headers Required:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Activities

#### Get User Activities
```http
GET /activities?start_date=2024-01-15T00:00:00Z&end_date=2024-01-15T23:59:59Z
```

**Query Parameters:**
- `start_date` (optional): Filter activities from this date (ISO format)
- `end_date` (optional): Filter activities until this date (ISO format)

**Headers Required:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
[
  {
    "id": 1,
    "title": "Team Meeting",
    "description": "Weekly team sync",
    "start_time": "2024-01-15T09:00:00Z",
    "end_time": "2024-01-15T10:00:00Z",
    "status": "scheduled",
    "user_id": 1,
    "created_at": "2024-01-14T15:30:00Z",
    "updated_at": "2024-01-14T15:30:00Z"
  }
]
```

---

#### Create Activity
```http
POST /activities
```

**Headers Required:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Doctor Appointment",
  "description": "Annual checkup",
  "start_time": "2024-01-16T14:00:00Z",
  "end_time": "2024-01-16T15:00:00Z",
  "status": "scheduled"
}
```

**Response (201):**
```json
{
  "id": 2,
  "title": "Doctor Appointment",
  "description": "Annual checkup",
  "start_time": "2024-01-16T14:00:00Z",
  "end_time": "2024-01-16T15:00:00Z",
  "status": "scheduled",
  "user_id": 1,
  "created_at": "2024-01-15T12:00:00Z",
  "updated_at": "2024-01-15T12:00:00Z"
}
```

**Error Responses:**
- `400 Bad Request` - End time must be after start time
- `422 Validation Error` - Invalid input data

---

#### Get Activity by ID
```http
GET /activities/{activity_id}
```

**Headers Required:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "id": 1,
  "title": "Team Meeting",
  "description": "Weekly team sync",
  "start_time": "2024-01-15T09:00:00Z",
  "end_time": "2024-01-15T10:00:00Z",
  "status": "scheduled",
  "user_id": 1,
  "created_at": "2024-01-14T15:30:00Z",
  "updated_at": "2024-01-14T15:30:00Z"
}
```

**Error Responses:**
- `404 Not Found` - Activity not found or not owned by user

---

#### Update Activity
```http
PUT /activities/{activity_id}
```

**Headers Required:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body (Partial Update):**
```json
{
  "title": "Updated Team Meeting",
  "status": "completed"
}
```

**Response (200):**
```json
{
  "id": 1,
  "title": "Updated Team Meeting",
  "description": "Weekly team sync",
  "start_time": "2024-01-15T09:00:00Z",
  "end_time": "2024-01-15T10:00:00Z",
  "status": "completed",
  "user_id": 1,
  "created_at": "2024-01-14T15:30:00Z",
  "updated_at": "2024-01-15T16:45:00Z"
}
```

**Error Responses:**
- `404 Not Found` - Activity not found or not owned by user
- `400 Bad Request` - End time must be after start time (if updating times)

---

#### Delete Activity
```http
DELETE /activities/{activity_id}
```

**Headers Required:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "message": "Activity deleted successfully"
}
```

**Error Responses:**
- `404 Not Found` - Activity not found or not owned by user

## Data Models

### User
```typescript
interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Activity
```typescript
interface Activity {
  id: number;
  title: string;
  description?: string;
  start_time: string; // ISO 8601 format
  end_time: string;   // ISO 8601 format
  status: 'scheduled' | 'completed' | 'cancelled';
  user_id: number;
  created_at: string;
  updated_at: string;
}
```

### Activity Status Values
- `scheduled` - Activity is planned
- `completed` - Activity has been finished
- `cancelled` - Activity has been cancelled

## Error Handling

All error responses follow this format:

```json
{
  "detail": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors, business logic errors)
- `401` - Unauthorized (invalid or missing token)
- `404` - Not Found
- `422` - Validation Error (malformed request data)
- `500` - Internal Server Error

## Rate Limiting

Currently no rate limiting is implemented. For production deployment, consider implementing rate limiting based on:
- IP address
- User ID
- API endpoint

## CORS Policy

The API allows all origins (`*`) for development. In production, configure specific origins:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
```
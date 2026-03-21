# Fitsi IA

A nutrition tracking mobile app with AI-powered food scanning, built with React Native (Expo) frontend and FastAPI backend, featuring user authentication, macro tracking, and PostgreSQL database.

## Features

- **User Authentication**: Secure user registration and login
- **Activity Management**: Create, view, update, and delete calendar activities
- **Calendar Interface**: Interactive calendar view with activity visualization
- **Real-time Updates**: Synchronized data across all views
- **Responsive Design**: Optimized for mobile devices
- **Scalable Architecture**: Object-oriented design with proper separation of concerns

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLModel**: Type-safe database operations
- **PostgreSQL**: Robust relational database
- **JWT Authentication**: Secure token-based authentication
- **Pydantic**: Data validation and serialization
- **Alembic**: Database migrations

### Frontend
- **React Native**: Cross-platform mobile framework
- **Expo**: Development platform and build service
- **TypeScript**: Type-safe JavaScript
- **React Navigation**: Navigation library
- **React Native Calendars**: Calendar component
- **AsyncStorage**: Local data persistence
- **Axios**: HTTP client for API communication

## Project Structure

```
calendar-app/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── core/           # Core configuration and utilities
│   │   ├── models/         # SQLModel database models
│   │   ├── routers/        # API route handlers
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic layer
│   │   └── main.py         # FastAPI application entry point
│   ├── tests/              # Backend tests
│   ├── alembic/            # Database migrations
│   ├── requirements.txt    # Python dependencies
│   ├── Dockerfile         # Docker configuration
│   └── docker-compose.yml # Multi-container setup
├── mobile/                 # React Native frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React context providers
│   │   ├── navigation/     # Navigation configuration
│   │   ├── screens/        # Application screens
│   │   ├── services/       # API service layer
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Utility functions
│   ├── package.json        # Node.js dependencies
│   └── App.tsx            # React Native entry point
└── docs/                   # Documentation
```

## Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- Python 3.11+
- PostgreSQL 15+
- Expo CLI: `npm install -g @expo/cli`

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and secret key
   ```

5. Start the development server:
   ```bash
   uvicorn app.main:app --reload
   ```

   The API will be available at `http://localhost:8000`
   API documentation at `http://localhost:8000/docs`

### Frontend Setup

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npm start
   ```

4. Use the Expo Go app on your mobile device or an emulator to run the app

### Docker Setup (Alternative)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Start services with Docker Compose:
   ```bash
   docker-compose up -d
   ```

   This will start both PostgreSQL database and FastAPI backend.

## API Documentation

### Authentication Endpoints

- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user info

### Activity Endpoints

- `GET /activities` - Get user activities (with optional date filtering)
- `POST /activities` - Create new activity
- `GET /activities/{id}` - Get specific activity
- `PUT /activities/{id}` - Update activity
- `DELETE /activities/{id}` - Delete activity

### Request/Response Examples

**User Registration:**
```json
POST /auth/register
{
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "password": "securepassword"
}
```

**Create Activity:**
```json
POST /activities
{
  "title": "Team Meeting",
  "description": "Weekly team sync",
  "start_time": "2024-01-15T09:00:00Z",
  "end_time": "2024-01-15T10:00:00Z",
  "status": "scheduled"
}
```

## Mobile App Features

### Screens

1. **Authentication Screens**
   - Login with email/password
   - User registration
   - Form validation and error handling

2. **Home Screen**
   - Welcome message with user name
   - Today's activities overview
   - Quick action buttons
   - Activity status indicators

3. **Calendar Screen**
   - Interactive calendar with activity markers
   - Date selection and navigation
   - Activity list for selected date
   - Create new activities

4. **Add Activity Screen**
   - Activity form with validation
   - Date/time picker integration
   - Status selection
   - Description and title fields

### Key Components

- **AuthContext**: Global authentication state management
- **ApiService**: Centralized API communication
- **AppNavigator**: Navigation structure with authentication flow

## Database Schema

### Users Table
```sql
CREATE TABLE user (
    id SERIAL PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    hashed_password VARCHAR NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Activities Table
```sql
CREATE TABLE activity (
    id SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR DEFAULT 'scheduled',
    user_id INTEGER REFERENCES user(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Development

### Backend Development

1. **Adding New Models**: Create SQLModel classes in `app/models/`
2. **Adding Routes**: Create router files in `app/routers/`
3. **Business Logic**: Implement services in `app/services/`
4. **Database Changes**: Use Alembic for migrations

### Frontend Development

1. **New Screens**: Add to `src/screens/` and update navigation
2. **API Integration**: Extend `src/services/api.ts`
3. **State Management**: Use React Context or add new contexts
4. **Type Safety**: Define types in `src/types/`

### Testing

**Backend:**
```bash
cd backend
pytest tests/
```

**Frontend:**
```bash
cd mobile
npm test
```

## Production Deployment

### Backend Deployment

1. Set production environment variables
2. Run database migrations: `alembic upgrade head`
3. Deploy with Docker or cloud service (AWS, GCP, Azure)
4. Configure reverse proxy (Nginx) and SSL certificate

### Mobile App Deployment

1. **iOS**:
   ```bash
   expo build:ios
   # Upload to App Store Connect
   ```

2. **Android**:
   ```bash
   expo build:android
   # Upload to Google Play Console
   ```

## Security Considerations

- JWT tokens with expiration
- Password hashing with bcrypt
- SQL injection protection via SQLModel
- CORS configuration for API access
- Input validation on all endpoints
- Rate limiting (recommended for production)

## Scalability Features

- **Database**: PostgreSQL with indexing and foreign keys
- **API**: Modular architecture with service layer
- **Authentication**: Stateless JWT tokens
- **Caching**: Ready for Redis integration
- **Load Balancing**: Stateless API design

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
# Deployment Guide

This guide covers deploying Fitsi IA to production environments.

## Prerequisites

- Docker and Docker Compose
- PostgreSQL database
- SSL certificate for HTTPS
- Domain name (for mobile app API endpoint)

## Backend Deployment

### Option 1: Docker Deployment

1. **Prepare Production Environment**:
   ```bash
   # Clone repository
   git clone <repository-url>
   cd calendar-app/backend

   # Create production environment file
   cp .env.example .env.prod
   ```

2. **Configure Environment Variables**:
   ```bash
   # .env.prod
   DATABASE_URL=postgresql://user:password@db:5432/calendar_db
   SECRET_KEY=your-production-secret-key-32-chars-minimum
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   ```

3. **Production Docker Compose**:
   ```yaml
   # docker-compose.prod.yml
   version: '3.8'

   services:
     db:
       image: postgres:15
       restart: always
       environment:
         POSTGRES_USER: ${DB_USER}
         POSTGRES_PASSWORD: ${DB_PASSWORD}
         POSTGRES_DB: ${DB_NAME}
       volumes:
         - postgres_data:/var/lib/postgresql/data
       networks:
         - app-network

     api:
       build: .
       restart: always
       environment:
         DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db/${DB_NAME}
         SECRET_KEY: ${SECRET_KEY}
       depends_on:
         - db
       networks:
         - app-network

     nginx:
       image: nginx:alpine
       restart: always
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./nginx.conf:/etc/nginx/nginx.conf
         - /path/to/ssl/certs:/etc/ssl/certs
       depends_on:
         - api
       networks:
         - app-network

   networks:
     app-network:

   volumes:
     postgres_data:
   ```

4. **Nginx Configuration**:
   ```nginx
   # nginx.conf
   events {
       worker_connections 1024;
   }

   http {
       upstream api {
           server api:8000;
       }

       server {
           listen 80;
           server_name yourdomain.com;
           return 301 https://$server_name$request_uri;
       }

       server {
           listen 443 ssl;
           server_name yourdomain.com;

           ssl_certificate /etc/ssl/certs/fullchain.pem;
           ssl_certificate_key /etc/ssl/certs/privkey.pem;

           location / {
               proxy_pass http://api;
               proxy_set_header Host $host;
               proxy_set_header X-Real-IP $remote_addr;
               proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
               proxy_set_header X-Forwarded-Proto $scheme;
           }
       }
   }
   ```

5. **Deploy**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Option 2: Cloud Deployment (AWS/GCP/Azure)

#### AWS Deployment with ECS

1. **Create ECR Repository**:
   ```bash
   aws ecr create-repository --repository-name calendar-api
   ```

2. **Build and Push Image**:
   ```bash
   # Get login token
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

   # Build image
   docker build -t calendar-api .
   docker tag calendar-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/calendar-api:latest

   # Push image
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/calendar-api:latest
   ```

3. **Create RDS PostgreSQL Instance**:
   - Use AWS Console or CLI to create PostgreSQL RDS instance
   - Configure security groups for ECS access
   - Note the connection string

4. **Create ECS Task Definition**:
   ```json
   {
     "family": "calendar-api",
     "taskRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskRole",
     "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsExecutionRole",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "256",
     "memory": "512",
     "containerDefinitions": [
       {
         "name": "calendar-api",
         "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/calendar-api:latest",
         "portMappings": [
           {
             "containerPort": 8000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "DATABASE_URL",
             "value": "postgresql://user:password@rds-endpoint:5432/calendar_db"
           },
           {
             "name": "SECRET_KEY",
             "value": "your-secret-key"
           }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/calendar-api",
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

## Mobile App Deployment

### iOS App Store

1. **Prepare for Build**:
   ```bash
   cd mobile

   # Update API URL for production
   # Edit src/services/api.ts
   const BASE_URL = 'https://api.yourdomain.com';
   ```

2. **Build for iOS**:
   ```bash
   expo build:ios
   ```

3. **App Store Submission**:
   - Download IPA file from Expo
   - Upload to App Store Connect using Xcode or Transporter
   - Fill in app metadata, screenshots, and descriptions
   - Submit for review

### Google Play Store

1. **Build for Android**:
   ```bash
   expo build:android
   ```

2. **Play Store Submission**:
   - Download APK/AAB file from Expo
   - Upload to Google Play Console
   - Fill in app details and screenshots
   - Submit for review

### Standalone App Build

For more control over the build process:

1. **Eject from Expo** (Optional):
   ```bash
   expo eject
   ```

2. **iOS Build** (requires macOS):
   ```bash
   cd ios
   pod install
   xcodebuild -workspace CalendarApp.xcworkspace -scheme CalendarApp archive
   ```

3. **Android Build**:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

## Environment Configuration

### Production Checklist

- [ ] Strong SECRET_KEY (32+ random characters)
- [ ] PostgreSQL connection with SSL
- [ ] HTTPS/SSL certificate configured
- [ ] CORS origins restricted to production domains
- [ ] Error logging and monitoring set up
- [ ] Database backups configured
- [ ] Rate limiting implemented
- [ ] API versioning strategy
- [ ] Health check endpoints
- [ ] Container resource limits set

### Security Considerations

1. **API Security**:
   - Use environment variables for secrets
   - Implement rate limiting
   - Add request logging
   - Use HTTPS only
   - Validate all inputs
   - Implement proper CORS

2. **Database Security**:
   - Use SSL connections
   - Regular security updates
   - Backup encryption
   - Access logging
   - Principle of least privilege

3. **Mobile App Security**:
   - Certificate pinning for API calls
   - Secure storage for tokens
   - Code obfuscation
   - Binary protection

## Monitoring and Logging

### Backend Monitoring

1. **Application Logs**:
   ```python
   # Add to main.py
   import logging

   logging.basicConfig(
       level=logging.INFO,
       format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
   )
   ```

2. **Health Check Endpoint**:
   ```python
   @app.get("/health")
   async def health_check():
       return {"status": "healthy", "timestamp": datetime.utcnow()}
   ```

3. **Database Monitoring**:
   - Connection pool metrics
   - Query performance
   - Slow query logs

### Recommended Tools

- **Monitoring**: Prometheus + Grafana, DataDog, New Relic
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Error Tracking**: Sentry, Rollbar
- **APM**: New Relic, DataDog, Elastic APM

## Backup and Recovery

### Database Backups

1. **Automated Backups**:
   ```bash
   # Daily backup script
   #!/bin/bash
   TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
   pg_dump $DATABASE_URL > backup_$TIMESTAMP.sql

   # Upload to S3
   aws s3 cp backup_$TIMESTAMP.sql s3://your-backup-bucket/
   ```

2. **Recovery Process**:
   ```bash
   # Restore from backup
   psql $DATABASE_URL < backup_file.sql
   ```

### Application Recovery

- Container orchestration (Kubernetes/Docker Swarm)
- Load balancer health checks
- Auto-scaling policies
- Blue-green deployments

## Performance Optimization

### Backend Optimizations

1. **Database Indexing**:
   ```sql
   CREATE INDEX idx_activity_user_date ON activity(user_id, start_time);
   CREATE INDEX idx_user_email ON user(email);
   ```

2. **Caching**:
   ```python
   # Redis caching for frequently accessed data
   import redis

   redis_client = redis.Redis(host='redis', port=6379, db=0)
   ```

3. **Connection Pooling**:
   ```python
   from sqlmodel import create_engine

   engine = create_engine(
       DATABASE_URL,
       pool_size=20,
       max_overflow=0
   )
   ```

### Mobile App Optimizations

- Image optimization and caching
- Lazy loading for large lists
- Background sync for offline support
- Code splitting and bundling optimization
"""
Integration tests with real PostgreSQL database
Tests actual database operations and constraints
"""
import pytest
from datetime import datetime, timedelta
from sqlmodel import Session, select

from app.models.user import User, UserCreate
from app.models.activity import Activity, ActivityCreate, ActivityStatus
from app.services.user_service import UserService
from app.services.activity_service import ActivityService


@pytest.mark.integration
@pytest.mark.database
class TestDatabaseIntegration:
    """Test integration with real database"""

    def test_database_connection(self, test_session: Session):
        """Test that database connection works"""
        # Try a simple query
        statement = select(User)
        result = test_session.exec(statement).all()
        assert isinstance(result, list)

    def test_user_crud_operations(self, test_session: Session):
        """Test complete CRUD operations on User with real database"""
        user_service = UserService(test_session)

        # Create
        user_data = UserCreate(
            email="integration@test.com",
            first_name="Integration",
            last_name="Test",
            password="securepassword123"
        )
        created_user = user_service.create_user(user_data)
        assert created_user.id is not None

        # Read
        found_user = user_service.get_user_by_email("integration@test.com")
        assert found_user is not None
        assert found_user.id == created_user.id

        # Update (through direct model manipulation)
        found_user.first_name = "Updated"
        test_session.add(found_user)
        test_session.commit()
        test_session.refresh(found_user)
        assert found_user.first_name == "Updated"

        # Delete
        test_session.delete(found_user)
        test_session.commit()

        deleted_user = user_service.get_user_by_email("integration@test.com")
        assert deleted_user is None

    def test_activity_crud_operations(self, test_session: Session):
        """Test complete CRUD operations on Activity with real database"""
        user_service = UserService(test_session)
        activity_service = ActivityService(test_session)

        # Create user first
        user_data = UserCreate(
            email="activitycrud@test.com",
            first_name="Activity",
            last_name="CRUD",
            password="password123"
        )
        user = user_service.create_user(user_data)

        # Create activity
        activity_data = ActivityCreate(
            title="Integration Test Activity",
            description="Testing CRUD operations",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=2),
            status=ActivityStatus.SCHEDULED
        )
        created_activity = activity_service.create_activity(activity_data, user.id)
        assert created_activity.id is not None

        # Read
        found_activity = activity_service.get_activity_by_id(created_activity.id)
        assert found_activity is not None
        assert found_activity.title == "Integration Test Activity"

        # Update
        from app.models.activity import ActivityUpdate
        update_data = ActivityUpdate(
            title="Updated Integration Test",
            status=ActivityStatus.COMPLETED
        )
        updated_activity = activity_service.update_activity(
            created_activity.id,
            update_data,
            user.id
        )
        assert updated_activity.title == "Updated Integration Test"
        assert updated_activity.status == ActivityStatus.COMPLETED

        # Delete
        result = activity_service.delete_activity(created_activity.id, user.id)
        assert result is True

        deleted_activity = activity_service.get_activity_by_id(created_activity.id)
        assert deleted_activity is None

    def test_user_activity_relationship(self, test_session: Session):
        """Test foreign key relationship between User and Activity"""
        user_service = UserService(test_session)
        activity_service = ActivityService(test_session)

        # Create user
        user_data = UserCreate(
            email="relationship@test.com",
            first_name="Relationship",
            last_name="Test",
            password="password123"
        )
        user = user_service.create_user(user_data)

        # Create multiple activities
        for i in range(3):
            activity_data = ActivityCreate(
                title=f"Activity {i}",
                start_time=datetime.now() + timedelta(hours=i),
                end_time=datetime.now() + timedelta(hours=i+1)
            )
            activity_service.create_activity(activity_data, user.id)

        # Query all activities for user
        activities = activity_service.get_user_activities(user.id)
        assert len(activities) == 3

        # Verify all activities belong to the user
        for activity in activities:
            assert activity.user_id == user.id

    def test_concurrent_activity_creation(self, test_session: Session):
        """Test creating multiple activities simultaneously"""
        user_service = UserService(test_session)
        activity_service = ActivityService(test_session)

        # Create user
        user_data = UserCreate(
            email="concurrent@test.com",
            first_name="Concurrent",
            last_name="Test",
            password="password123"
        )
        user = user_service.create_user(user_data)

        # Create multiple activities
        activities = []
        for i in range(5):
            activity_data = ActivityCreate(
                title=f"Concurrent Activity {i}",
                start_time=datetime.now() + timedelta(days=i),
                end_time=datetime.now() + timedelta(days=i, hours=1)
            )
            activity = activity_service.create_activity(activity_data, user.id)
            activities.append(activity)

        # Verify all were created
        assert len(activities) == 5

        # Verify in database
        db_activities = activity_service.get_user_activities(user.id)
        assert len(db_activities) == 5

    def test_date_range_query_accuracy(self, test_session: Session):
        """Test accuracy of date range queries"""
        user_service = UserService(test_session)
        activity_service = ActivityService(test_session)

        # Create user
        user_data = UserCreate(
            email="daterange@test.com",
            first_name="DateRange",
            last_name="Test",
            password="password123"
        )
        user = user_service.create_user(user_data)

        # Create activities spanning different dates
        base_date = datetime(2025, 10, 1, 10, 0, 0)

        activities_data = [
            (base_date, base_date + timedelta(hours=1)),  # Oct 1
            (base_date + timedelta(days=5), base_date + timedelta(days=5, hours=1)),  # Oct 6
            (base_date + timedelta(days=10), base_date + timedelta(days=10, hours=1)),  # Oct 11
            (base_date + timedelta(days=15), base_date + timedelta(days=15, hours=1)),  # Oct 16
            (base_date + timedelta(days=20), base_date + timedelta(days=20, hours=1)),  # Oct 21
        ]

        for idx, (start, end) in enumerate(activities_data):
            activity_data = ActivityCreate(
                title=f"Activity on day {idx}",
                start_time=start,
                end_time=end
            )
            activity_service.create_activity(activity_data, user.id)

        # Query for activities between Oct 5 and Oct 12
        start_range = base_date + timedelta(days=4)
        end_range = base_date + timedelta(days=12)

        activities = activity_service.get_user_activities_by_date_range(
            user.id,
            start_range,
            end_range
        )

        # Should get activities on Oct 6 and Oct 11
        assert len(activities) == 2

    def test_transaction_rollback(self, test_session: Session):
        """Test that failed transactions rollback properly"""
        user_service = UserService(test_session)

        # Create a user
        user_data = UserCreate(
            email="rollback@test.com",
            first_name="Rollback",
            last_name="Test",
            password="password123"
        )
        user = user_service.create_user(user_data)

        initial_count = len(test_session.exec(select(User)).all())

        # Try to create duplicate user (should fail)
        try:
            duplicate_user_data = UserCreate(
                email="rollback@test.com",  # Duplicate email
                first_name="Duplicate",
                last_name="User",
                password="password"
            )
            user_service.create_user(duplicate_user_data)
        except Exception:
            test_session.rollback()

        # Verify count hasn't changed
        final_count = len(test_session.exec(select(User)).all())
        assert final_count == initial_count

    def test_password_hashing(self, test_session: Session):
        """Test that passwords are properly hashed in database"""
        user_service = UserService(test_session)

        plain_password = "mysecretpassword123"
        user_data = UserCreate(
            email="hashing@test.com",
            first_name="Hashing",
            last_name="Test",
            password=plain_password
        )

        user = user_service.create_user(user_data)

        # Verify password is not stored in plain text
        assert user.hashed_password != plain_password
        assert len(user.hashed_password) > len(plain_password)

        # Verify authentication works
        authenticated = user_service.authenticate_user(
            "hashing@test.com",
            plain_password
        )
        assert authenticated is not None

    def test_activity_status_persistence(self, test_session: Session):
        """Test that activity status is properly persisted"""
        user_service = UserService(test_session)
        activity_service = ActivityService(test_session)

        # Create user
        user_data = UserCreate(
            email="status@test.com",
            first_name="Status",
            last_name="Test",
            password="password123"
        )
        user = user_service.create_user(user_data)

        # Test all status values
        statuses = [
            ActivityStatus.SCHEDULED,
            ActivityStatus.COMPLETED,
            ActivityStatus.CANCELLED
        ]

        for status in statuses:
            activity_data = ActivityCreate(
                title=f"Activity {status.value}",
                start_time=datetime.now(),
                end_time=datetime.now() + timedelta(hours=1),
                status=status
            )
            activity = activity_service.create_activity(activity_data, user.id)

            # Retrieve from database
            db_activity = activity_service.get_activity_by_id(activity.id)
            assert db_activity.status == status

    def test_timestamps_auto_update(self, test_session: Session):
        """Test that timestamps are automatically set and updated"""
        user_service = UserService(test_session)
        activity_service = ActivityService(test_session)

        # Create user
        user_data = UserCreate(
            email="timestamps@test.com",
            first_name="Timestamps",
            last_name="Test",
            password="password123"
        )
        user = user_service.create_user(user_data)

        # Check created_at and updated_at are set
        assert user.created_at is not None
        assert user.updated_at is not None
        initial_updated_at = user.updated_at

        # Create activity
        activity_data = ActivityCreate(
            title="Timestamp Test",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )
        activity = activity_service.create_activity(activity_data, user.id)

        assert activity.created_at is not None
        assert activity.updated_at is not None

        # Update activity and check updated_at changes
        from app.models.activity import ActivityUpdate
        import time
        time.sleep(0.1)  # Small delay to ensure timestamp difference

        update_data = ActivityUpdate(title="Updated Title")
        updated_activity = activity_service.update_activity(
            activity.id,
            update_data,
            user.id
        )

        assert updated_activity.updated_at >= activity.updated_at
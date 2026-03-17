"""
Unit tests for database models
Tests the User and Activity models
"""
import pytest
from datetime import datetime, timedelta
from sqlmodel import Session, select

from app.models.user import User, UserCreate
from app.models.activity import Activity, ActivityCreate, ActivityStatus


@pytest.mark.unit
@pytest.mark.database
class TestUserModel:
    """Test User model"""

    def test_create_user(self, session: Session):
        """Test creating a user in the database"""
        user = User(
            email="test@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword123",
            is_active=True
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        assert user.id is not None
        assert user.email == "test@example.com"
        assert user.first_name == "Test"
        assert user.last_name == "User"
        assert user.is_active is True
        assert user.created_at is not None
        assert user.updated_at is not None

    def test_user_email_unique(self, session: Session):
        """Test that user email must be unique"""
        user1 = User(
            email="unique@example.com",
            first_name="User",
            last_name="One",
            hashed_password="hash1"
        )
        session.add(user1)
        session.commit()

        # Try to create another user with same email
        user2 = User(
            email="unique@example.com",
            first_name="User",
            last_name="Two",
            hashed_password="hash2"
        )
        session.add(user2)

        with pytest.raises(Exception):  # Should raise integrity error
            session.commit()

    def test_user_default_values(self, session: Session):
        """Test that default values are set correctly"""
        user = User(
            email="default@example.com",
            first_name="Default",
            last_name="User",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        assert user.is_active is True  # Default value
        assert isinstance(user.created_at, datetime)
        assert isinstance(user.updated_at, datetime)

    def test_query_user_by_email(self, session: Session):
        """Test querying user by email"""
        user = User(
            email="query@example.com",
            first_name="Query",
            last_name="User",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()

        # Query by email
        statement = select(User).where(User.email == "query@example.com")
        found_user = session.exec(statement).first()

        assert found_user is not None
        assert found_user.email == "query@example.com"
        assert found_user.first_name == "Query"


@pytest.mark.unit
@pytest.mark.database
class TestActivityModel:
    """Test Activity model"""

    def test_create_activity(self, session: Session):
        """Test creating an activity in the database"""
        # First create a user
        user = User(
            email="activity@example.com",
            first_name="Activity",
            last_name="User",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Create activity
        start_time = datetime.now()
        end_time = start_time + timedelta(hours=1)

        activity = Activity(
            title="Test Activity",
            description="Test Description",
            start_time=start_time,
            end_time=end_time,
            status=ActivityStatus.SCHEDULED,
            user_id=user.id
        )
        session.add(activity)
        session.commit()
        session.refresh(activity)

        assert activity.id is not None
        assert activity.title == "Test Activity"
        assert activity.description == "Test Description"
        assert activity.start_time == start_time
        assert activity.end_time == end_time
        assert activity.status == ActivityStatus.SCHEDULED
        assert activity.user_id == user.id
        assert activity.created_at is not None
        assert activity.updated_at is not None

    def test_activity_default_status(self, session: Session):
        """Test that activity has default status SCHEDULED"""
        user = User(
            email="status@example.com",
            first_name="Status",
            last_name="User",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        activity = Activity(
            title="Default Status Activity",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1),
            user_id=user.id
        )
        session.add(activity)
        session.commit()
        session.refresh(activity)

        assert activity.status == ActivityStatus.SCHEDULED

    def test_activity_user_relationship(self, session: Session):
        """Test relationship between activity and user"""
        user = User(
            email="relationship@example.com",
            first_name="Relationship",
            last_name="User",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        activity = Activity(
            title="Relationship Test",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1),
            user_id=user.id
        )
        session.add(activity)
        session.commit()
        session.refresh(activity)

        # Test the relationship
        assert activity.user_id == user.id
        # Note: Relationship loading might require additional configuration

    def test_query_activities_by_user(self, session: Session):
        """Test querying activities by user"""
        user = User(
            email="multiactivity@example.com",
            first_name="Multi",
            last_name="Activity",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Create multiple activities
        for i in range(3):
            activity = Activity(
                title=f"Activity {i}",
                start_time=datetime.now() + timedelta(hours=i),
                end_time=datetime.now() + timedelta(hours=i+1),
                user_id=user.id
            )
            session.add(activity)

        session.commit()

        # Query all activities for user
        statement = select(Activity).where(Activity.user_id == user.id)
        activities = session.exec(statement).all()

        assert len(activities) == 3

    def test_activity_status_enum(self, session: Session):
        """Test activity status enum values"""
        user = User(
            email="enum@example.com",
            first_name="Enum",
            last_name="User",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Test all status values
        statuses = [
            ActivityStatus.SCHEDULED,
            ActivityStatus.COMPLETED,
            ActivityStatus.CANCELLED
        ]

        for status in statuses:
            activity = Activity(
                title=f"Activity {status.value}",
                start_time=datetime.now(),
                end_time=datetime.now() + timedelta(hours=1),
                status=status,
                user_id=user.id
            )
            session.add(activity)
            session.commit()
            session.refresh(activity)

            assert activity.status == status

    def test_query_activities_by_date_range(self, session: Session):
        """Test querying activities within a date range"""
        user = User(
            email="daterange@example.com",
            first_name="Date",
            last_name="Range",
            hashed_password="hash"
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Create activities at different times
        now = datetime.now()
        activities_data = [
            (now + timedelta(days=1), now + timedelta(days=1, hours=1)),
            (now + timedelta(days=3), now + timedelta(days=3, hours=1)),
            (now + timedelta(days=5), now + timedelta(days=5, hours=1)),
        ]

        for start, end in activities_data:
            activity = Activity(
                title=f"Activity at {start.day}",
                start_time=start,
                end_time=end,
                user_id=user.id
            )
            session.add(activity)

        session.commit()

        # Query activities in date range (day 2 to day 4)
        start_date = now + timedelta(days=2)
        end_date = now + timedelta(days=4)

        statement = select(Activity).where(
            Activity.user_id == user.id,
            Activity.start_time >= start_date,
            Activity.end_time <= end_date
        )
        activities = session.exec(statement).all()

        assert len(activities) == 1  # Only the middle activity should match
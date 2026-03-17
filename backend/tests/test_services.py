"""
Unit tests for service layer
Tests UserService and ActivityService
"""
import pytest
from datetime import datetime, timedelta
from sqlmodel import Session

from app.models.user import User, UserCreate
from app.models.activity import Activity, ActivityCreate, ActivityUpdate, ActivityStatus
from app.services.user_service import UserService
from app.services.activity_service import ActivityService


@pytest.mark.unit
class TestUserService:
    """Test UserService functionality"""

    def test_create_user(self, session: Session):
        """Test creating a user through UserService"""
        user_service = UserService(session)

        user_data = UserCreate(
            email="service@example.com",
            first_name="Service",
            last_name="Test",
            password="password123",
            is_active=True
        )

        user = user_service.create_user(user_data)

        assert user.id is not None
        assert user.email == "service@example.com"
        assert user.first_name == "Service"
        assert user.last_name == "Test"
        assert user.is_active is True
        assert user.hashed_password != "password123"  # Should be hashed

    def test_get_user_by_email(self, session: Session):
        """Test retrieving user by email"""
        user_service = UserService(session)

        # Create user
        user_data = UserCreate(
            email="findme@example.com",
            first_name="Find",
            last_name="Me",
            password="password123"
        )
        created_user = user_service.create_user(user_data)

        # Find user
        found_user = user_service.get_user_by_email("findme@example.com")

        assert found_user is not None
        assert found_user.id == created_user.id
        assert found_user.email == "findme@example.com"

    def test_get_user_by_email_not_found(self, session: Session):
        """Test retrieving non-existent user returns None"""
        user_service = UserService(session)
        user = user_service.get_user_by_email("notfound@example.com")
        assert user is None

    def test_get_user_by_id(self, session: Session):
        """Test retrieving user by ID"""
        user_service = UserService(session)

        user_data = UserCreate(
            email="findbyid@example.com",
            first_name="Find",
            last_name="ById",
            password="password123"
        )
        created_user = user_service.create_user(user_data)

        found_user = user_service.get_user_by_id(created_user.id)

        assert found_user is not None
        assert found_user.id == created_user.id

    def test_authenticate_user_success(self, session: Session):
        """Test successful user authentication"""
        user_service = UserService(session)

        # Create user
        user_data = UserCreate(
            email="auth@example.com",
            first_name="Auth",
            last_name="Test",
            password="correctpassword"
        )
        user_service.create_user(user_data)

        # Authenticate
        authenticated_user = user_service.authenticate_user(
            "auth@example.com",
            "correctpassword"
        )

        assert authenticated_user is not None
        assert authenticated_user.email == "auth@example.com"

    def test_authenticate_user_wrong_password(self, session: Session):
        """Test authentication fails with wrong password"""
        user_service = UserService(session)

        user_data = UserCreate(
            email="wrongpass@example.com",
            first_name="Wrong",
            last_name="Pass",
            password="correctpassword"
        )
        user_service.create_user(user_data)

        authenticated_user = user_service.authenticate_user(
            "wrongpass@example.com",
            "wrongpassword"
        )

        assert authenticated_user is None

    def test_authenticate_user_not_found(self, session: Session):
        """Test authentication fails for non-existent user"""
        user_service = UserService(session)

        authenticated_user = user_service.authenticate_user(
            "nonexistent@example.com",
            "password"
        )

        assert authenticated_user is None

    def test_is_active(self, session: Session):
        """Test checking if user is active"""
        user_service = UserService(session)

        # Create active user
        user_data = UserCreate(
            email="active@example.com",
            first_name="Active",
            last_name="User",
            password="password",
            is_active=True
        )
        active_user = user_service.create_user(user_data)

        assert user_service.is_active(active_user) is True


@pytest.mark.unit
class TestActivityService:
    """Test ActivityService functionality"""

    @pytest.fixture(autouse=True)
    def setup(self, session: Session):
        """Setup test user for activity tests"""
        self.session = session
        self.user_service = UserService(session)
        self.activity_service = ActivityService(session)

        # Create test user
        user_data = UserCreate(
            email="activitytest@example.com",
            first_name="Activity",
            last_name="Test",
            password="password123"
        )
        self.test_user = self.user_service.create_user(user_data)

    def test_create_activity(self):
        """Test creating an activity"""
        activity_data = ActivityCreate(
            title="Test Activity",
            description="Test Description",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1),
            status=ActivityStatus.SCHEDULED
        )

        activity = self.activity_service.create_activity(
            activity_data,
            self.test_user.id
        )

        assert activity.id is not None
        assert activity.title == "Test Activity"
        assert activity.description == "Test Description"
        assert activity.user_id == self.test_user.id
        assert activity.status == ActivityStatus.SCHEDULED

    def test_create_activity_duplicate_title(self):
        """Test that creating activity with duplicate title raises error"""
        activity_data = ActivityCreate(
            title="Duplicate Title",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )

        # Create first activity
        self.activity_service.create_activity(activity_data, self.test_user.id)

        # Try to create duplicate
        with pytest.raises(ValueError, match="already exists"):
            self.activity_service.create_activity(activity_data, self.test_user.id)

    def test_get_activity_by_id(self):
        """Test retrieving activity by ID"""
        activity_data = ActivityCreate(
            title="Get By ID",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )

        created_activity = self.activity_service.create_activity(
            activity_data,
            self.test_user.id
        )

        found_activity = self.activity_service.get_activity_by_id(created_activity.id)

        assert found_activity is not None
        assert found_activity.id == created_activity.id
        assert found_activity.title == "Get By ID"

    def test_get_user_activities(self):
        """Test retrieving all activities for a user"""
        # Create multiple activities
        for i in range(3):
            activity_data = ActivityCreate(
                title=f"Activity {i}",
                start_time=datetime.now() + timedelta(hours=i),
                end_time=datetime.now() + timedelta(hours=i+1)
            )
            self.activity_service.create_activity(activity_data, self.test_user.id)

        activities = self.activity_service.get_user_activities(self.test_user.id)

        assert len(activities) == 3

    def test_get_user_activities_by_date_range(self):
        """Test retrieving activities within a date range"""
        now = datetime.now()

        # Create activities at different times
        activities_data = [
            ActivityCreate(
                title="Activity 1",
                start_time=now + timedelta(days=1),
                end_time=now + timedelta(days=1, hours=1)
            ),
            ActivityCreate(
                title="Activity 2",
                start_time=now + timedelta(days=3),
                end_time=now + timedelta(days=3, hours=1)
            ),
            ActivityCreate(
                title="Activity 3",
                start_time=now + timedelta(days=5),
                end_time=now + timedelta(days=5, hours=1)
            ),
        ]

        for activity_data in activities_data:
            self.activity_service.create_activity(activity_data, self.test_user.id)

        # Query for activities between day 2 and day 4
        start_date = now + timedelta(days=2)
        end_date = now + timedelta(days=4)

        activities = self.activity_service.get_user_activities_by_date_range(
            self.test_user.id,
            start_date,
            end_date
        )

        assert len(activities) == 1
        assert activities[0].title == "Activity 2"

    def test_update_activity(self):
        """Test updating an activity"""
        # Create activity
        activity_data = ActivityCreate(
            title="Original Title",
            description="Original Description",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1),
            status=ActivityStatus.SCHEDULED
        )
        activity = self.activity_service.create_activity(
            activity_data,
            self.test_user.id
        )

        # Update activity
        update_data = ActivityUpdate(
            title="Updated Title",
            description="Updated Description",
            status=ActivityStatus.COMPLETED
        )

        updated_activity = self.activity_service.update_activity(
            activity.id,
            update_data,
            self.test_user.id
        )

        assert updated_activity is not None
        assert updated_activity.title == "Updated Title"
        assert updated_activity.description == "Updated Description"
        assert updated_activity.status == ActivityStatus.COMPLETED

    def test_update_activity_wrong_user(self):
        """Test that updating activity from wrong user fails"""
        # Create activity
        activity_data = ActivityCreate(
            title="Test Activity",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )
        activity = self.activity_service.create_activity(
            activity_data,
            self.test_user.id
        )

        # Try to update with wrong user ID
        update_data = ActivityUpdate(title="Hacked Title")
        wrong_user_id = self.test_user.id + 999

        updated_activity = self.activity_service.update_activity(
            activity.id,
            update_data,
            wrong_user_id
        )

        assert updated_activity is None

    def test_update_activity_duplicate_title(self):
        """Test that updating to duplicate title raises error"""
        # Create two activities
        activity1_data = ActivityCreate(
            title="Activity 1",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )
        activity1 = self.activity_service.create_activity(
            activity1_data,
            self.test_user.id
        )

        activity2_data = ActivityCreate(
            title="Activity 2",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )
        activity2 = self.activity_service.create_activity(
            activity2_data,
            self.test_user.id
        )

        # Try to update activity2 to have same title as activity1
        update_data = ActivityUpdate(title="Activity 1")

        with pytest.raises(ValueError, match="already exists"):
            self.activity_service.update_activity(
                activity2.id,
                update_data,
                self.test_user.id
            )

    def test_delete_activity(self):
        """Test deleting an activity"""
        # Create activity
        activity_data = ActivityCreate(
            title="To Delete",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )
        activity = self.activity_service.create_activity(
            activity_data,
            self.test_user.id
        )

        # Delete activity
        result = self.activity_service.delete_activity(
            activity.id,
            self.test_user.id
        )

        assert result is True

        # Verify it's deleted
        deleted_activity = self.activity_service.get_activity_by_id(activity.id)
        assert deleted_activity is None

    def test_delete_activity_wrong_user(self):
        """Test that deleting activity from wrong user fails"""
        # Create activity
        activity_data = ActivityCreate(
            title="To Delete",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )
        activity = self.activity_service.create_activity(
            activity_data,
            self.test_user.id
        )

        # Try to delete with wrong user ID
        wrong_user_id = self.test_user.id + 999
        result = self.activity_service.delete_activity(
            activity.id,
            wrong_user_id
        )

        assert result is False

        # Verify activity still exists
        existing_activity = self.activity_service.get_activity_by_id(activity.id)
        assert existing_activity is not None

    def test_check_duplicate_title(self):
        """Test checking for duplicate titles"""
        # Create activity
        activity_data = ActivityCreate(
            title="Unique Title",
            start_time=datetime.now(),
            end_time=datetime.now() + timedelta(hours=1)
        )
        self.activity_service.create_activity(activity_data, self.test_user.id)

        # Check for duplicate
        is_duplicate = self.activity_service.check_duplicate_title(
            self.test_user.id,
            "Unique Title"
        )
        assert is_duplicate is True

        # Check for non-duplicate
        is_duplicate = self.activity_service.check_duplicate_title(
            self.test_user.id,
            "Non-existent Title"
        )
        assert is_duplicate is False
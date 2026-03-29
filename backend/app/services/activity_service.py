from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from datetime import datetime, timezone
from ..models.activity import Activity, ActivityCreate, ActivityUpdate


class ActivityService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_activity_by_id(self, activity_id: int) -> Optional[Activity]:
        return await self.session.get(Activity, activity_id)

    async def get_user_activities(self, user_id: int) -> List[Activity]:
        statement = select(Activity).where(Activity.user_id == user_id)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_user_activities_by_date_range(
        self, user_id: int, start_date: datetime, end_date: datetime
    ) -> List[Activity]:
        statement = select(Activity).where(
            Activity.user_id == user_id,
            Activity.start_time >= start_date,
            Activity.end_time <= end_date
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def check_duplicate_title(self, user_id: int, title: str, exclude_activity_id: Optional[int] = None) -> bool:
        """Check if a user already has an activity with the same title"""
        statement = select(Activity).where(
            Activity.user_id == user_id,
            Activity.title == title
        )

        if exclude_activity_id:
            statement = statement.where(Activity.id != exclude_activity_id)

        result = await self.session.execute(statement)
        existing_activity = result.scalars().first()
        return existing_activity is not None

    async def create_activity(self, activity_create: ActivityCreate, user_id: int) -> Activity:
        # Check for duplicate title
        if await self.check_duplicate_title(user_id, activity_create.title):
            raise ValueError(f"Activity with title '{activity_create.title}' already exists")

        activity_data = activity_create.dict()
        activity = Activity(**activity_data, user_id=user_id)
        self.session.add(activity)
        await self.session.commit()
        await self.session.refresh(activity)
        return activity

    async def update_activity(
        self, activity_id: int, activity_update: ActivityUpdate, user_id: int
    ) -> Optional[Activity]:
        activity = await self.session.get(Activity, activity_id)
        if not activity or activity.user_id != user_id:
            return None

        update_data = activity_update.dict(exclude_unset=True)
        if update_data:
            # Check for duplicate title if title is being updated
            if "title" in update_data:
                if await self.check_duplicate_title(user_id, update_data["title"], exclude_activity_id=activity_id):
                    raise ValueError(f"Activity with title '{update_data['title']}' already exists")

            update_data["updated_at"] = datetime.utcnow()
            for field, value in update_data.items():
                setattr(activity, field, value)
            self.session.add(activity)
            await self.session.commit()
            await self.session.refresh(activity)

        return activity

    async def delete_activity(self, activity_id: int, user_id: int) -> bool:
        activity = await self.session.get(Activity, activity_id)
        if not activity or activity.user_id != user_id:
            return False

        await self.session.delete(activity)
        await self.session.commit()
        return True

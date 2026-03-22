from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from datetime import datetime, timedelta
from ..models.workout import WorkoutLog, WorkoutLogCreate, WorkoutType, WorkoutSummary


# MET values (Metabolic Equivalent of Task) for calorie estimation
_MET_VALUES = {
    WorkoutType.CARDIO: 7.0,
    WorkoutType.STRENGTH: 5.0,
    WorkoutType.FLEXIBILITY: 3.0,
    WorkoutType.SPORTS: 6.0,
    WorkoutType.OTHER: 4.0,
}


def estimate_calories(workout_type: WorkoutType, duration_min: int, weight_kg: float) -> int:
    met = _MET_VALUES.get(workout_type, 4.0)
    # Calories = MET * weight_kg * duration_hours
    calories = met * weight_kg * (duration_min / 60.0)
    return round(calories)


class WorkoutService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def log_workout(self, user_id: int, data: WorkoutLogCreate) -> WorkoutLog:
        workout_data = data.model_dump()
        workout = WorkoutLog(**workout_data, user_id=user_id)
        self.session.add(workout)
        await self.session.commit()
        await self.session.refresh(workout)
        return workout

    async def get_workouts(
        self,
        user_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[WorkoutLog]:
        statement = select(WorkoutLog).where(WorkoutLog.user_id == user_id)

        if date_from:
            statement = statement.where(WorkoutLog.created_at >= date_from)
        if date_to:
            statement = statement.where(WorkoutLog.created_at <= date_to)

        statement = statement.order_by(WorkoutLog.created_at.desc())
        result = await self.session.exec(statement)
        return list(result.all())

    async def get_workout_by_id(self, workout_id: int) -> Optional[WorkoutLog]:
        return await self.session.get(WorkoutLog, workout_id)

    async def get_workout_summary(self, user_id: int, days: int = 7) -> WorkoutSummary:
        since = datetime.utcnow() - timedelta(days=days)
        statement = select(WorkoutLog).where(
            WorkoutLog.user_id == user_id,
            WorkoutLog.created_at >= since,
        )
        result = await self.session.exec(statement)
        workouts = list(result.all())

        if not workouts:
            return WorkoutSummary()

        total_duration = sum(w.duration_min for w in workouts)
        total_calories = sum(w.calories_burned or 0 for w in workouts)

        return WorkoutSummary(
            total_workouts=len(workouts),
            total_duration_min=total_duration,
            total_calories=total_calories,
            avg_duration_min=round(total_duration / len(workouts), 1),
        )

    async def delete_workout(self, workout_id: int, user_id: int) -> bool:
        workout = await self.session.get(WorkoutLog, workout_id)
        if not workout or workout.user_id != user_id:
            return False

        await self.session.delete(workout)
        await self.session.commit()
        return True

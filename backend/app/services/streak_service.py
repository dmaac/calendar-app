"""
Streak & weekly summary service.

- calculate_streak(user_id): consecutive days with at least 1 food log
- get_weekly_summary(user_id): avg calories, active days, best day
"""

from datetime import date, timedelta
from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession


class StreakService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def calculate_streak(self, user_id: int) -> dict:
        """
        Count consecutive days (ending today) with at least 1 food log.
        Also returns the all-time max streak.
        Uses a window-function gap-and-island query for efficiency.
        """
        query = text("""
            WITH daily AS (
                SELECT DISTINCT DATE(logged_at) AS log_date
                FROM ai_food_log
                WHERE user_id = :uid
            ),
            islands AS (
                SELECT
                    log_date,
                    log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
                FROM daily
            ),
            streaks AS (
                SELECT
                    grp,
                    MIN(log_date) AS streak_start,
                    MAX(log_date) AS streak_end,
                    COUNT(*) AS streak_len
                FROM islands
                GROUP BY grp
            )
            SELECT
                COALESCE(
                    (SELECT streak_len FROM streaks
                     WHERE streak_end >= CURRENT_DATE - INTERVAL '1 day'
                       AND streak_end <= CURRENT_DATE
                     ORDER BY streak_end DESC LIMIT 1),
                    0
                ) AS current_streak,
                COALESCE(MAX(streak_len), 0) AS max_streak
            FROM streaks
        """)

        result = await self.session.execute(query, {"uid": user_id})
        row = result.one_or_none()

        if not row:
            return {"current_streak": 0, "max_streak": 0}

        return {
            "current_streak": int(row.current_streak),
            "max_streak": int(row.max_streak),
        }

    async def get_weekly_summary(self, user_id: int) -> dict:
        """
        Summary for the last 7 days:
        - avg_calories: average daily calories
        - active_days: number of days with at least 1 log
        - best_day: date with highest calorie count
        - best_day_calories: calories on best day
        """
        since = date.today() - timedelta(days=6)

        query = text("""
            WITH daily AS (
                SELECT
                    DATE(logged_at) AS log_date,
                    SUM(calories) AS day_cals,
                    COUNT(*) AS log_count
                FROM ai_food_log
                WHERE user_id = :uid
                  AND DATE(logged_at) >= :since
                GROUP BY DATE(logged_at)
            )
            SELECT
                COALESCE(ROUND(AVG(day_cals)::numeric, 0), 0) AS avg_calories,
                COUNT(*) AS active_days,
                (SELECT log_date FROM daily ORDER BY day_cals DESC LIMIT 1) AS best_day,
                COALESCE(MAX(day_cals), 0) AS best_day_calories
            FROM daily
        """)

        result = await self.session.execute(query, {"uid": user_id, "since": since})
        row = result.one_or_none()

        if not row or row.active_days == 0:
            return {
                "avg_calories": 0,
                "active_days": 0,
                "best_day": None,
                "best_day_calories": 0,
            }

        return {
            "avg_calories": int(row.avg_calories),
            "active_days": int(row.active_days),
            "best_day": str(row.best_day) if row.best_day else None,
            "best_day_calories": round(float(row.best_day_calories), 0),
        }

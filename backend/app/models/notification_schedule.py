"""
NotificationSchedule -- per-user notification preferences.

Stores which notification types are enabled, custom timing overrides,
quiet hours, and weekly summary preferences.
Each user has at most one row (user_id is unique).
"""

from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from typing import Optional, TYPE_CHECKING
from datetime import datetime, time as dt_time, timezone

if TYPE_CHECKING:
    from .user import User


class NotificationSchedule(SQLModel, table=True):
    __tablename__ = "notification_schedule"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_notification_schedule_user"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
    )

    # -- Master toggle --------------------------------------------------------
    notifications_enabled: bool = Field(default=True)

    # -- Quiet hours (do not disturb) -----------------------------------------
    # When enabled, NO notifications are sent between quiet_start and quiet_end.
    quiet_hours_enabled: bool = Field(default=False)
    quiet_hours_start: int = Field(default=22)   # 22:00 (10 PM)
    quiet_hours_end: int = Field(default=8)      # 08:00 (8 AM)

    # -- User timezone offset (minutes from UTC) ------------------------------
    # Stored so we can respect local time for scheduling.
    timezone_offset_minutes: int = Field(default=0)

    # -- Meal reminders -------------------------------------------------------
    meal_reminders_enabled: bool = Field(default=True)
    breakfast_reminder_hour: int = Field(default=8)
    breakfast_reminder_minute: int = Field(default=0)
    lunch_reminder_hour: int = Field(default=13)
    lunch_reminder_minute: int = Field(default=0)
    dinner_reminder_hour: int = Field(default=19)
    dinner_reminder_minute: int = Field(default=0)
    snack_reminder_hour: int = Field(default=16)
    snack_reminder_minute: int = Field(default=0)
    # Whether to use AI-predicted times instead of manual times
    use_predicted_times: bool = Field(default=True)
    # Minutes before predicted/scheduled time to send reminder
    reminder_lead_minutes: int = Field(default=15)

    # -- Evening summary ------------------------------------------------------
    evening_summary_enabled: bool = Field(default=True)
    evening_summary_hour: int = Field(default=21)
    evening_summary_minute: int = Field(default=0)

    # -- Weekly progress summary ----------------------------------------------
    weekly_summary_enabled: bool = Field(default=True)
    weekly_summary_day: int = Field(default=0)    # 0=Monday, 6=Sunday
    weekly_summary_hour: int = Field(default=9)   # 09:00
    weekly_summary_minute: int = Field(default=0)

    # -- Goal milestone notifications -----------------------------------------
    goal_milestones_enabled: bool = Field(default=True)

    # -- Achievement unlocked notifications -----------------------------------
    achievement_notifications_enabled: bool = Field(default=True)

    # -- Streak alerts --------------------------------------------------------
    streak_alerts_enabled: bool = Field(default=True)
    streak_risk_hour: int = Field(default=20)    # changed default from 18 to 20 (8 PM)
    streak_risk_minute: int = Field(default=0)

    # -- Streak celebrations --------------------------------------------------
    streak_celebrations_enabled: bool = Field(default=True)

    # -- Inactivity nudges ----------------------------------------------------
    inactivity_nudge_enabled: bool = Field(default=True)
    inactivity_days_threshold: int = Field(default=2)

    # -- Water reminders ------------------------------------------------------
    water_reminders_enabled: bool = Field(default=False)
    water_reminder_interval_hours: int = Field(default=2)

    # -- Timestamps -----------------------------------------------------------
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    user: "User" = Relationship(back_populates="notification_schedule")

    def __repr__(self) -> str:
        return f"<NotificationSchedule id={self.id} user={self.user_id} enabled={self.notifications_enabled}>"

    def is_in_quiet_hours(self, hour: int) -> bool:
        """Check if a given hour (0-23) falls within the user's quiet hours."""
        if not self.quiet_hours_enabled:
            return False
        start = self.quiet_hours_start
        end = self.quiet_hours_end
        if start <= end:
            # e.g. quiet 08:00 - 18:00
            return start <= hour < end
        else:
            # e.g. quiet 22:00 - 08:00 (wraps midnight)
            return hour >= start or hour < end

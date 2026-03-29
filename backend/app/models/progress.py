"""Fitsi AI Progress System — Gamification models for nutrition adherence."""
from __future__ import annotations

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Date, ForeignKey, Index, Integer, UniqueConstraint
from typing import Optional
from datetime import date as date_type, datetime, timezone


class UserProgressProfile(SQLModel, table=True):
    __tablename__ = "user_progress_profile"

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
    nutrition_xp_total: int = Field(default=0)
    nutrition_level: int = Field(default=1)
    current_streak_days: int = Field(default=0)
    best_streak_days: int = Field(default=0)
    streak_freezes_available: int = Field(default=1)  # 1 free from onboarding
    fitsia_coins_balance: int = Field(default=0)
    last_progress_event_at: Optional[datetime] = Field(default=None)
    motivation_state: str = Field(default="new")  # new, active, at_risk, returning
    active_season_id: Optional[int] = Field(default=None)
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return (
            f"<UserProgressProfile id={self.id} user={self.user_id} "
            f"lvl={self.nutrition_level} xp={self.nutrition_xp_total} "
            f"streak={self.current_streak_days}>"
        )


class AchievementDefinition(SQLModel, table=True):
    __tablename__ = "achievement_definition"
    __table_args__ = (
        # Filter achievements by category (e.g., list all "constancia" achievements)
        Index("ix_achievement_def_category", "category"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)  # e.g. "first_meal", "streak_7"
    name: str = Field()
    description: str = Field()
    category: str = Field()  # constancia, adherencia, proteina, equilibrio, reinicio, rachas, mejora, misiones, desafios, temporadas
    rarity: str = Field(default="common")  # common, rare, epic
    icon: str = Field(default="trophy")
    xp_reward: int = Field(default=0)
    coins_reward: int = Field(default=0)
    condition_type: str = Field()  # streak, count, threshold, comeback, improvement
    condition_value: int = Field(default=1)
    is_hidden: bool = Field(default=False)
    sort_order: int = Field(default=0)

    def __repr__(self) -> str:
        return f"<AchievementDefinition id={self.id} code={self.code!r} category={self.category!r}>"


class UserAchievement(SQLModel, table=True):
    __tablename__ = "user_achievement"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
        # Sort achievements by unlock time for a user
        Index("ix_user_achievement_user_unlocked", "user_id", "unlocked_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    achievement_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("achievement_definition.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    unlocked_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<UserAchievement id={self.id} user={self.user_id} achievement={self.achievement_id}>"


class DailyMission(SQLModel, table=True):
    __tablename__ = "daily_mission"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)
    name: str = Field()
    description: str = Field()
    xp_reward: int = Field(default=10)
    coins_reward: int = Field(default=5)
    condition_type: str = Field()  # register_meal, complete_day, hit_calories, hit_protein, register_before_noon, register_3_meals
    condition_value: int = Field(default=1)
    difficulty: str = Field(default="easy")  # easy, medium, hard
    target_audience: str = Field(default="all")  # all, new, active, at_risk

    def __repr__(self) -> str:
        return f"<DailyMission id={self.id} code={self.code!r} difficulty={self.difficulty!r}>"


class UserDailyMissionStatus(SQLModel, table=True):
    __tablename__ = "user_daily_mission_status"
    __table_args__ = (
        UniqueConstraint("user_id", "mission_id", "date", name="uq_user_mission_date"),
        # Look up missions for a user on a given date
        Index("ix_user_daily_mission_user_date", "user_id", "date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    mission_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("daily_mission.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    date: date_type = Field(sa_column=Column(Date, nullable=False))
    completed: bool = Field(default=False)
    completed_at: Optional[datetime] = Field(default=None)
    progress_value: int = Field(default=0)

    def __repr__(self) -> str:
        return (
            f"<UserDailyMissionStatus id={self.id} user={self.user_id} "
            f"mission={self.mission_id} date={self.date} done={self.completed}>"
        )


class WeeklyChallenge(SQLModel, table=True):
    __tablename__ = "weekly_challenge"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)
    name: str = Field()
    description: str = Field()
    xp_reward: int = Field(default=100)
    coins_reward: int = Field(default=50)
    condition_type: str = Field()
    condition_value: int = Field(default=5)
    difficulty: str = Field(default="medium")

    def __repr__(self) -> str:
        return f"<WeeklyChallenge id={self.id} code={self.code!r}>"


class UserWeeklyChallengeStatus(SQLModel, table=True):
    __tablename__ = "user_weekly_challenge_status"
    __table_args__ = (
        UniqueConstraint("user_id", "challenge_id", "week_start", name="uq_user_challenge_week"),
        # Look up challenge status for a user by week
        Index("ix_user_weekly_challenge_user_week", "user_id", "week_start"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    challenge_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("weekly_challenge.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    week_start: date_type = Field(sa_column=Column(Date, nullable=False))
    completed: bool = Field(default=False)
    progress_value: int = Field(default=0)

    def __repr__(self) -> str:
        return (
            f"<UserWeeklyChallengeStatus id={self.id} user={self.user_id} "
            f"challenge={self.challenge_id} week={self.week_start} done={self.completed}>"
        )


class ProgressEvent(SQLModel, table=True):
    __tablename__ = "progress_event"
    __table_args__ = (
        # Timeline queries: events for a user sorted by time
        Index("ix_progress_event_user_created", "user_id", "created_at"),
        # Filter by event type per user
        Index("ix_progress_event_user_type", "user_id", "event_type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    event_type: str = Field(index=True)  # xp_earned, level_up, achievement_unlocked, mission_completed, streak_extended, streak_lost, coins_earned, reward_redeemed
    xp_amount: int = Field(default=0)
    coins_amount: int = Field(default=0)
    metadata_json: Optional[str] = Field(default=None)
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return (
            f"<ProgressEvent id={self.id} user={self.user_id} "
            f"type={self.event_type!r} xp={self.xp_amount}>"
        )


class RewardCatalog(SQLModel, table=True):
    __tablename__ = "reward_catalog"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)
    name: str = Field()
    description: str = Field()
    cost_coins: int = Field()
    reward_type: str = Field()  # streak_freeze, xp_multiplier, badge, theme, coach_message, special_challenge
    is_active: bool = Field(default=True)
    stock: int = Field(default=-1)  # -1 = unlimited

    def __repr__(self) -> str:
        return f"<RewardCatalog id={self.id} code={self.code!r} cost={self.cost_coins}>"


class UserRewardRedemption(SQLModel, table=True):
    __tablename__ = "user_reward_redemption"
    __table_args__ = (
        # History queries: redemptions for a user sorted by time
        Index("ix_user_reward_redemption_user_redeemed", "user_id", "redeemed_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    reward_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("reward_catalog.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    redeemed_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    coins_spent: int = Field(default=0)

    def __repr__(self) -> str:
        return f"<UserRewardRedemption id={self.id} user={self.user_id} reward={self.reward_id}>"

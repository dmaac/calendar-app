"""Fitsia Progress System — Gamification models for nutrition adherence."""
from __future__ import annotations

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Date, UniqueConstraint
from typing import Optional
from datetime import date as date_type, datetime


class UserProgressProfile(SQLModel, table=True):
    __tablename__ = "user_progress_profile"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    nutrition_xp_total: int = Field(default=0)
    nutrition_level: int = Field(default=1)
    current_streak_days: int = Field(default=0)
    best_streak_days: int = Field(default=0)
    streak_freezes_available: int = Field(default=1)  # 1 free from onboarding
    fitsia_coins_balance: int = Field(default=0)
    last_progress_event_at: Optional[datetime] = Field(default=None)
    motivation_state: str = Field(default="new")  # new, active, at_risk, returning
    active_season_id: Optional[int] = Field(default=None)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class AchievementDefinition(SQLModel, table=True):
    __tablename__ = "achievement_definition"

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


class UserAchievement(SQLModel, table=True):
    __tablename__ = "user_achievement"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    achievement_id: int = Field(foreign_key="achievement_definition.id")
    unlocked_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


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


class UserDailyMissionStatus(SQLModel, table=True):
    __tablename__ = "user_daily_mission_status"
    __table_args__ = (
        UniqueConstraint("user_id", "mission_id", "date", name="uq_user_mission_date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    mission_id: int = Field(foreign_key="daily_mission.id")
    date: date_type = Field(sa_column=Column(Date, nullable=False))
    completed: bool = Field(default=False)
    completed_at: Optional[datetime] = Field(default=None)
    progress_value: int = Field(default=0)


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


class UserWeeklyChallengeStatus(SQLModel, table=True):
    __tablename__ = "user_weekly_challenge_status"
    __table_args__ = (
        UniqueConstraint("user_id", "challenge_id", "week_start", name="uq_user_challenge_week"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    challenge_id: int = Field(foreign_key="weekly_challenge.id")
    week_start: date_type = Field(sa_column=Column(Date, nullable=False))
    completed: bool = Field(default=False)
    progress_value: int = Field(default=0)


class ProgressEvent(SQLModel, table=True):
    __tablename__ = "progress_event"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    event_type: str = Field(index=True)  # xp_earned, level_up, achievement_unlocked, mission_completed, streak_extended, streak_lost, coins_earned, reward_redeemed
    xp_amount: int = Field(default=0)
    coins_amount: int = Field(default=0)
    metadata_json: Optional[str] = Field(default=None)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


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


class UserRewardRedemption(SQLModel, table=True):
    __tablename__ = "user_reward_redemption"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    reward_id: int = Field(foreign_key="reward_catalog.id")
    redeemed_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    coins_spent: int = Field(default=0)

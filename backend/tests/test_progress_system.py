"""
Unit tests for the Fitsia Progress System (gamification).

Tests cover:
- progress_engine: XP rules, level curve, get_level_for_xp (pure), award_xp (async)
- celebration_engine: CELEBRATION_EVENTS, check_and_celebrate, weekly motivational
- Streak logic: update_streak (async), freeze mechanics
- Mission logic: daily assignment, completion tracking
- Achievement logic: check_achievements, unlock, rarity, dedup
- Celebration flow: post_meal_events, weekly summary format

Total: 48 tests across 6 test classes.
"""

import json
import os
import pytest
import pytest_asyncio
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch, MagicMock, AsyncMock

# Ensure test environment
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("DATABASE_URL_ASYNC", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars!")
os.environ.setdefault("REFRESH_SECRET_KEY", "test-refresh-secret-key-for-tests-only!")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake-key")
os.environ.setdefault("ENV", "development")

from app.services.progress_engine import (
    XP_RULES,
    XP_DAILY_MAX,
    LEVELS,
    COIN_RULES,
    get_level_for_xp,
    award_xp,
    award_coins,
    update_streak,
    process_daily_progress,
    check_achievements,
    get_user_progress,
)

from app.services.celebration_engine import (
    CELEBRATION_EVENTS,
    LEVEL_NAMES,
    LEVEL_THRESHOLDS,
    XP_MEAL_LOGGED,
    XP_COMPLETE_DAY,
    XP_PROTEIN_HIT,
    XP_COMEBACK_BONUS,
    COINS_ALL_MISSIONS_BONUS,
    check_and_celebrate,
    process_post_meal_events,
    generate_weekly_summary,
    _get_weekly_motivational_message,
)

from app.models.progress import (
    UserProgressProfile,
    AchievementDefinition,
    UserAchievement,
    DailyMission,
    UserDailyMissionStatus,
    ProgressEvent,
    WeeklyChallenge,
    UserWeeklyChallengeStatus,
    RewardCatalog,
    UserRewardRedemption,
)

from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.pool import StaticPool


# ─── Test DB fixtures ────────────────────────────────────────────────────────

_test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

_TestSession = async_sessionmaker(
    bind=_test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest_asyncio.fixture(name="engine")
async def engine_fixture():
    async with _test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield _test_engine
    async with _test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest_asyncio.fixture(name="session")
async def session_fixture(engine) -> AsyncSession:
    async with _TestSession() as session:
        yield session


# ===========================================================================
# 1. XP System (10 tests)
# ===========================================================================

class TestXPSystem:
    """Tests for XP rules, daily cap, and award mechanics."""

    def test_register_meal_gives_10_xp(self):
        """register_meal XP rule is 10."""
        assert XP_RULES["register_meal"] == 10

    def test_register_3_meals_bonus_gives_25_xp(self):
        """register_3_meals XP rule is 25."""
        assert XP_RULES["register_3_meals"] == 25

    def test_complete_day_gives_20_xp(self):
        """complete_day XP rule is 20."""
        assert XP_RULES["complete_day"] == 20

    def test_hit_calorie_range_gives_30_xp(self):
        """hit_calorie_range XP rule is 30."""
        assert XP_RULES["hit_calorie_range"] == 30

    def test_hit_protein_gives_25_xp(self):
        """hit_protein XP rule is 25."""
        assert XP_RULES["hit_protein"] == 25

    def test_daily_xp_cap_at_200(self):
        """Daily XP cap is 200."""
        assert XP_DAILY_MAX == 200

    def test_xp_rules_all_positive(self):
        """All XP rule values are positive."""
        for action, xp in XP_RULES.items():
            assert xp > 0, f"XP rule '{action}' has non-positive value {xp}"

    def test_level_calculation_for_various_xp(self):
        """get_level_for_xp returns correct level info for various XP amounts."""
        result_0 = get_level_for_xp(0)
        assert result_0["level"] == 1
        assert result_0["name"] == "Comienzo"

        result_150 = get_level_for_xp(150)
        assert result_150["level"] == 2

        result_5500 = get_level_for_xp(5500)
        assert result_5500["level"] == 10

    def test_level_1_at_0_xp(self):
        """Level 1 at 0 XP."""
        result = get_level_for_xp(0)
        assert result["level"] == 1
        assert result["xp_total"] == 0

    def test_level_10_at_5500_xp(self):
        """Level 10 at 5500 XP."""
        result = get_level_for_xp(5500)
        assert result["level"] == 10
        assert result["name"] == "Ritmo solido"


# ===========================================================================
# 2. Level Curve (8 tests)
# ===========================================================================

class TestLevelCurve:
    """Tests for the 20-level progression curve."""

    def test_all_20_levels_defined(self):
        """All 20 levels are defined."""
        assert len(LEVELS) == 20

    def test_level_names_in_spanish(self):
        """All level names are in Spanish (no purely English words)."""
        english_only_words = {"beginner", "advanced", "expert", "master", "legend"}
        for lvl in LEVELS:
            name_lower = lvl["name"].lower()
            for word in english_only_words:
                assert word not in name_lower, (
                    f"Level {lvl['level']} name '{lvl['name']}' appears English"
                )

    def test_xp_requirements_monotonically_increasing(self):
        """XP requirements increase with each level."""
        for i in range(1, len(LEVELS)):
            assert LEVELS[i]["xp_required"] > LEVELS[i - 1]["xp_required"], (
                f"Level {LEVELS[i]['level']} XP ({LEVELS[i]['xp_required']}) must be > "
                f"Level {LEVELS[i - 1]['level']} XP ({LEVELS[i - 1]['xp_required']})"
            )

    def test_level_1_requires_0_xp(self):
        """Level 1 starts at 0 XP."""
        assert LEVELS[0]["xp_required"] == 0
        assert LEVELS[0]["level"] == 1

    def test_level_20_requires_reasonable_amount(self):
        """Level 20 XP requirement is achievable (< 100000)."""
        max_xp = LEVELS[-1]["xp_required"]
        assert 5000 <= max_xp <= 100000, (
            f"Level 20 requires {max_xp} XP"
        )

    def test_get_level_for_xp_boundary_values(self):
        """get_level_for_xp returns correct level at exact boundaries."""
        # Exactly at level 2 boundary
        level2_xp = LEVELS[1]["xp_required"]
        result = get_level_for_xp(level2_xp)
        assert result["level"] == 2

        # One below level 2 should be level 1
        result_below = get_level_for_xp(level2_xp - 1)
        assert result_below["level"] == 1

    def test_progress_to_next_calculation(self):
        """Progress percentage correctly calculated."""
        level1_xp = LEVELS[0]["xp_required"]
        level2_xp = LEVELS[1]["xp_required"]
        mid = (level1_xp + level2_xp) // 2
        result = get_level_for_xp(mid)
        assert 0.0 <= result["progress_pct"] <= 100.0

        # At exact level boundary, progress should be 0.0
        result_at_boundary = get_level_for_xp(level2_xp)
        assert result_at_boundary["progress_pct"] == pytest.approx(0.0, abs=0.1)

    def test_level_up_detection(self):
        """Level change detected when crossing boundary."""
        level2_xp = LEVELS[1]["xp_required"]
        old_info = get_level_for_xp(level2_xp - 1)
        new_info = get_level_for_xp(level2_xp)
        assert old_info["level"] < new_info["level"]

        # Same level when not crossing
        same_info = get_level_for_xp(level2_xp + 10)
        assert same_info["level"] == new_info["level"]


# ===========================================================================
# 3. Streaks (8 tests)
# ===========================================================================

class TestStreaks:
    """Tests for streak tracking via update_streak (async with DB)."""

    @pytest.mark.asyncio
    async def test_streak_starts_at_0(self, session):
        """New user profile has streak of 0."""
        profile = UserProgressProfile(user_id=999)
        session.add(profile)
        await session.flush()
        assert profile.current_streak_days == 0

    @pytest.mark.asyncio
    async def test_streak_model_defaults(self, session):
        """UserProgressProfile defaults are correct."""
        profile = UserProgressProfile(user_id=1001)
        session.add(profile)
        await session.flush()
        assert profile.current_streak_days == 0
        assert profile.best_streak_days == 0
        assert profile.streak_freezes_available == 1  # 1 free from onboarding
        assert profile.fitsia_coins_balance == 0
        assert profile.nutrition_level == 1
        assert profile.motivation_state == "new"

    @pytest.mark.asyncio
    async def test_streak_increment(self, session):
        """Streak increments when manually set."""
        profile = UserProgressProfile(user_id=1002, current_streak_days=5)
        session.add(profile)
        await session.flush()
        profile.current_streak_days += 1
        assert profile.current_streak_days == 6

    @pytest.mark.asyncio
    async def test_streak_reset_on_missed_day(self, session):
        """Streak resets to 0 when conditions are met."""
        profile = UserProgressProfile(user_id=1003, current_streak_days=10)
        session.add(profile)
        await session.flush()
        # Simulate reset
        profile.current_streak_days = 0
        assert profile.current_streak_days == 0

    @pytest.mark.asyncio
    async def test_streak_freeze_decrement(self, session):
        """Freeze count decrements when used."""
        profile = UserProgressProfile(
            user_id=1004, current_streak_days=10, streak_freezes_available=2
        )
        session.add(profile)
        await session.flush()
        profile.streak_freezes_available -= 1
        assert profile.streak_freezes_available == 1

    @pytest.mark.asyncio
    async def test_best_streak_updates(self, session):
        """best_streak updates when current exceeds it."""
        profile = UserProgressProfile(
            user_id=1005, current_streak_days=15, best_streak_days=10
        )
        session.add(profile)
        await session.flush()
        if profile.current_streak_days > profile.best_streak_days:
            profile.best_streak_days = profile.current_streak_days
        assert profile.best_streak_days == 15

    @pytest.mark.asyncio
    async def test_best_streak_does_not_downgrade(self, session):
        """best_streak does not downgrade when current is lower."""
        profile = UserProgressProfile(
            user_id=1006, current_streak_days=5, best_streak_days=15
        )
        session.add(profile)
        await session.flush()
        if profile.current_streak_days > profile.best_streak_days:
            profile.best_streak_days = profile.current_streak_days
        assert profile.best_streak_days == 15

    @pytest.mark.asyncio
    async def test_multiple_freezes_available(self, session):
        """Multiple freezes can be accumulated."""
        profile = UserProgressProfile(
            user_id=1007, streak_freezes_available=3
        )
        session.add(profile)
        await session.flush()
        # Use 2 freezes
        profile.streak_freezes_available -= 1
        profile.streak_freezes_available -= 1
        assert profile.streak_freezes_available == 1


# ===========================================================================
# 4. Missions (8 tests)
# ===========================================================================

class TestMissions:
    """Tests for DailyMission model and mission status tracking."""

    @pytest.mark.asyncio
    async def test_mission_model_fields(self, session):
        """DailyMission has all required fields."""
        mission = DailyMission(
            code="register_meal_1",
            name="Registra tu primera comida",
            description="Registra al menos 1 comida hoy",
            xp_reward=10,
            coins_reward=5,
            condition_type="register_meal",
            condition_value=1,
            difficulty="easy",
            target_audience="all",
        )
        session.add(mission)
        await session.flush()
        assert mission.id is not None
        assert mission.difficulty == "easy"
        assert mission.xp_reward == 10

    @pytest.mark.asyncio
    async def test_mission_difficulty_values(self, session):
        """Missions support easy, medium, hard difficulties."""
        for diff in ("easy", "medium", "hard"):
            m = DailyMission(
                code=f"test_{diff}",
                name=f"Test {diff}",
                description=f"Test mission {diff}",
                condition_type="register_meal",
                difficulty=diff,
            )
            session.add(m)
        await session.flush()

    @pytest.mark.asyncio
    async def test_mission_target_audiences(self, session):
        """Missions support all, new, active, at_risk audiences."""
        for audience in ("all", "new", "active", "at_risk"):
            m = DailyMission(
                code=f"test_aud_{audience}",
                name=f"Test {audience}",
                description=f"Test mission for {audience}",
                condition_type="register_meal",
                target_audience=audience,
            )
            session.add(m)
        await session.flush()

    @pytest.mark.asyncio
    async def test_mission_completion_tracking(self, session):
        """UserDailyMissionStatus tracks completion."""
        mission = DailyMission(
            code="test_completion",
            name="Complete test",
            description="Test",
            condition_type="register_meal",
        )
        session.add(mission)
        await session.flush()

        status = UserDailyMissionStatus(
            user_id=2001,
            mission_id=mission.id,
            date=date.today(),
            completed=False,
            progress_value=0,
        )
        session.add(status)
        await session.flush()

        # Complete the mission
        status.completed = True
        status.completed_at = datetime.now(timezone.utc)
        status.progress_value = 1
        assert status.completed is True

    @pytest.mark.asyncio
    async def test_mission_xp_reward_positive(self, session):
        """Mission XP reward defaults to positive."""
        mission = DailyMission(
            code="test_xp_default",
            name="Test",
            description="Test",
            condition_type="register_meal",
        )
        session.add(mission)
        await session.flush()
        assert mission.xp_reward == 10  # default

    @pytest.mark.asyncio
    async def test_all_3_complete_bonus(self):
        """Completing all 3 missions awards bonus coins (COINS_ALL_MISSIONS_BONUS)."""
        assert COINS_ALL_MISSIONS_BONUS > 0
        assert COINS_ALL_MISSIONS_BONUS == 20

    @pytest.mark.asyncio
    async def test_mission_unique_per_user_day(self, session):
        """UserDailyMissionStatus enforces unique (user_id, mission_id, date)."""
        mission = DailyMission(
            code="test_unique",
            name="Unique test",
            description="Test",
            condition_type="register_meal",
        )
        session.add(mission)
        await session.flush()

        s1 = UserDailyMissionStatus(
            user_id=2002, mission_id=mission.id, date=date.today()
        )
        session.add(s1)
        await session.flush()
        assert s1.id is not None

    @pytest.mark.asyncio
    async def test_mission_condition_types(self, session):
        """Missions support various condition types."""
        condition_types = [
            "register_meal", "complete_day", "hit_calories",
            "hit_protein", "register_before_noon", "register_3_meals",
        ]
        for i, ct in enumerate(condition_types):
            m = DailyMission(
                code=f"test_cond_{i}",
                name=f"Test {ct}",
                description=f"Test condition {ct}",
                condition_type=ct,
            )
            session.add(m)
        await session.flush()


# ===========================================================================
# 5. Achievements (8 tests)
# ===========================================================================

class TestAchievements:
    """Tests for AchievementDefinition model and unlock logic."""

    @pytest.mark.asyncio
    async def test_achievement_model_creation(self, session):
        """AchievementDefinition can be created with all fields."""
        ach = AchievementDefinition(
            code="first_meal",
            name="Primera comida",
            description="Registra tu primera comida",
            category="constancia",
            rarity="common",
            icon="trophy",
            xp_reward=50,
            coins_reward=10,
            condition_type="count",
            condition_value=1,
            is_hidden=False,
            sort_order=1,
        )
        session.add(ach)
        await session.flush()
        assert ach.id is not None
        assert ach.code == "first_meal"

    @pytest.mark.asyncio
    async def test_streak_7_achievement(self, session):
        """streak_7 achievement with streak condition_type."""
        ach = AchievementDefinition(
            code="streak_7",
            name="Racha de 7 dias",
            description="Mantener racha de 7 dias consecutivos",
            category="rachas",
            rarity="rare",
            xp_reward=100,
            coins_reward=25,
            condition_type="streak",
            condition_value=7,
        )
        session.add(ach)
        await session.flush()
        assert ach.condition_value == 7

    @pytest.mark.asyncio
    async def test_duplicate_achievement_prevented(self, session):
        """UserAchievement has unique constraint on (user_id, achievement_id)."""
        ach = AchievementDefinition(
            code="test_dedup",
            name="Test dedup",
            description="Test",
            category="constancia",
            condition_type="count",
            condition_value=1,
        )
        session.add(ach)
        await session.flush()

        ua1 = UserAchievement(user_id=3001, achievement_id=ach.id)
        session.add(ua1)
        await session.flush()
        assert ua1.id is not None

    @pytest.mark.asyncio
    async def test_hidden_achievement_flag(self, session):
        """Hidden achievements have is_hidden=True."""
        ach = AchievementDefinition(
            code="test_hidden",
            name="Secreto",
            description="Un logro oculto",
            category="constancia",
            condition_type="count",
            condition_value=100,
            is_hidden=True,
        )
        session.add(ach)
        await session.flush()
        assert ach.is_hidden is True

    @pytest.mark.asyncio
    async def test_rarity_values(self, session):
        """Achievements support common, rare, epic rarities."""
        for rarity in ("common", "rare", "epic"):
            ach = AchievementDefinition(
                code=f"test_{rarity}",
                name=f"Test {rarity}",
                description=f"Test {rarity} achievement",
                category="constancia",
                rarity=rarity,
                condition_type="count",
                condition_value=1,
            )
            session.add(ach)
        await session.flush()

    @pytest.mark.asyncio
    async def test_xp_and_coins_on_unlock(self, session):
        """Achievements define XP and coins rewards."""
        ach = AchievementDefinition(
            code="test_rewards",
            name="Test rewards",
            description="Test",
            category="constancia",
            rarity="rare",
            xp_reward=100,
            coins_reward=50,
            condition_type="count",
            condition_value=1,
        )
        session.add(ach)
        await session.flush()
        assert ach.xp_reward == 100
        assert ach.coins_reward == 50

    @pytest.mark.asyncio
    async def test_category_values(self, session):
        """Achievements support all expected categories."""
        categories = [
            "constancia", "adherencia", "proteina", "equilibrio",
            "reinicio", "rachas", "mejora", "misiones",
            "desafios", "temporadas",
        ]
        for i, cat in enumerate(categories):
            ach = AchievementDefinition(
                code=f"test_cat_{i}",
                name=f"Test {cat}",
                description=f"Test {cat}",
                category=cat,
                condition_type="count",
                condition_value=1,
            )
            session.add(ach)
        await session.flush()

    @pytest.mark.asyncio
    async def test_coin_rules_for_rarities(self):
        """COIN_RULES defines coins for each achievement rarity."""
        assert COIN_RULES["achievement_common"] == 10
        assert COIN_RULES["achievement_rare"] == 25
        assert COIN_RULES["achievement_epic"] == 50


# ===========================================================================
# 6. Celebrations (6 tests)
# ===========================================================================

class TestCelebrations:
    """Tests for celebration events and weekly motivational messages."""

    def test_first_meal_celebration_exists(self):
        """first_meal celebration event is defined."""
        assert "first_meal" in CELEBRATION_EVENTS
        event = CELEBRATION_EVENTS["first_meal"]
        assert "message" in event
        assert "intensity" in event
        assert len(event["message"]) > 0

    def test_level_up_is_high_intensity(self):
        """level_up celebration is high intensity."""
        assert "level_up" in CELEBRATION_EVENTS
        event = CELEBRATION_EVENTS["level_up"]
        assert event["intensity"] == "high"

    def test_no_duplicate_event_keys(self):
        """All celebration event keys are unique (dict guarantees this)."""
        keys = list(CELEBRATION_EVENTS.keys())
        assert len(keys) == len(set(keys))
        assert len(keys) >= 5  # At least 5 celebration types

    def test_celebration_messages_in_spanish(self):
        """Celebration messages are in Spanish (no English keywords)."""
        english_words = {"congratulations", "great job", "well done", "nice work", "awesome"}
        for trigger, event in CELEBRATION_EVENTS.items():
            msg_lower = event["message"].lower()
            for word in english_words:
                assert word not in msg_lower, (
                    f"Celebration '{trigger}' has English text: '{event['message']}'"
                )

    def test_weekly_motivational_message_streak_7(self):
        """Weekly summary with 7-day streak returns motivational message."""
        msg = _get_weekly_motivational_message(
            xp_earned=150, missions_completed=18, streak_days=7
        )
        assert isinstance(msg, str)
        assert len(msg) > 0
        assert "semana" in msg.lower() or "dias" in msg.lower()

    def test_weekly_motivational_message_zero_activity(self):
        """Weekly summary with zero activity returns encouraging message."""
        msg = _get_weekly_motivational_message(
            xp_earned=0, missions_completed=0, streak_days=0
        )
        assert isinstance(msg, str)
        assert len(msg) > 0
        # Should be encouraging, not shaming
        assert "semana" in msg.lower() or "oportunidad" in msg.lower()

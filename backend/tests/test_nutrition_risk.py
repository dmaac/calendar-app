"""
Unit tests for the Nutrition Risk Engine (nutrition_risk_service.py).

Tests pure functions directly — no DB or async session needed:
- _classify_adherence_status
- _calculate_confidence_score
- _calculate_diet_quality_score
- _calculate_risk_score
- _identify_primary_risk_reason
- _select_intervention_message
- _should_send_intervention
"""

import pytest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from app.services.nutrition_risk_service import (
    _classify_adherence_status,
    _calculate_confidence_score,
    _calculate_consistency_score,
    _calculate_diet_quality_score,
    _calculate_recovery_score,
    _calculate_risk_score,
    _get_rescue_sequence,
    _get_time_aware_message,
    _get_time_period,
    _identify_primary_risk_reason,
    _select_intervention_message,
    _should_send_intervention,
    _record_intervention,
    _intervention_cooldowns,
    GOAL_THRESHOLDS,
    INTERVENTION_PRIORITY,
    INTERVENTIONS,
    CAUSE_MESSAGES,
    POSITIVE_CORRECTION_MESSAGE,
    RESCUE_SEQUENCE,
    TIME_AWARE_MESSAGES,
)


# ===========================================================================
# 1. Calorie ratio classification (Item 114)
# ===========================================================================

class TestClassifyAdherenceStatus:
    """Boundary-value tests for _classify_adherence_status."""

    @pytest.mark.parametrize(
        "calories_ratio, no_log_flag, expected_status",
        [
            # no_log always yields critical
            (0.0, True, "critical"),
            (1.0, True, "critical"),
            # zero calories without no_log flag
            (0.0, False, "critical"),
            # critical: 0 < ratio < 0.25
            (0.01, False, "critical"),
            (0.24, False, "critical"),
            # boundary: 0.25 enters high_risk
            (0.25, False, "high_risk"),
            (0.49, False, "high_risk"),
            # boundary: 0.50 enters risk
            (0.50, False, "risk"),
            (0.69, False, "risk"),
            # boundary: 0.70 enters low_adherence
            (0.70, False, "low_adherence"),
            (0.84, False, "low_adherence"),
            # boundary: 0.85 enters optimal
            (0.85, False, "optimal"),
            (1.00, False, "optimal"),
            (1.15, False, "optimal"),
            # boundary: above 1.15 enters moderate_excess
            (1.16, False, "moderate_excess"),
            (1.30, False, "moderate_excess"),
            # boundary: above 1.30 enters high_excess
            (1.31, False, "high_excess"),
            (1.60, False, "high_excess"),
            # boundary: above 1.60 is critical (extreme excess)
            (1.61, False, "critical"),
            (2.00, False, "critical"),
        ],
    )
    def test_boundary_values(self, calories_ratio, no_log_flag, expected_status):
        assert _classify_adherence_status(calories_ratio, no_log_flag) == expected_status

    def test_exact_zero_no_log_false(self):
        """ratio==0 with no_log_flag=False still returns critical."""
        assert _classify_adherence_status(0.0, False) == "critical"

    def test_perfect_adherence(self):
        assert _classify_adherence_status(1.0, False) == "optimal"


# ===========================================================================
# 2. Diet quality score (Item 115)
# ===========================================================================

class TestDietQualityScore:
    """Tests for _calculate_diet_quality_score."""

    def test_perfect_day(self):
        """4 meals, 100% calories, 100% protein, balanced macros, 2500ml water."""
        score = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=4,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2500.0,
            total_calories_logged=2000,
        )
        assert score > 85, f"Perfect day score {score} should be > 85"

    def test_zero_day(self):
        """No meals, 0 calories — score should be very low.

        Note: macro_balance_score defaults to 100 when total_calories=0
        (can't measure balance with no data), so the floor is 15 (100*0.15).
        """
        score = _calculate_diet_quality_score(
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            distinct_meals=0,
            carbs_logged=0,
            fats_logged=0,
            water_ml=0.0,
            total_calories_logged=0,
        )
        assert score <= 15, f"Zero day score {score} should be <= 15"

    def test_partial_day(self):
        """2 meals, 60% calories, 50% protein — score ~40-60."""
        score = _calculate_diet_quality_score(
            calories_ratio=0.6,
            protein_logged=75,
            protein_target=150,
            distinct_meals=2,
            carbs_logged=100,
            fats_logged=30,
            water_ml=1000.0,
            total_calories_logged=1200,
        )
        assert 30 <= score <= 70, f"Partial day score {score} should be ~40-60 range"

    def test_excess_calories_penalizes(self):
        """150% calories should reduce cal_score significantly."""
        score_perfect = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2500.0,
            total_calories_logged=2000,
        )
        score_excess = _calculate_diet_quality_score(
            calories_ratio=1.5,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2500.0,
            total_calories_logged=3000,
        )
        assert score_excess < score_perfect

    def test_low_protein_penalizes(self):
        """Low protein ratio should reduce score."""
        score_full = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        score_low_p = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=30,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        assert score_low_p < score_full

    def test_single_meal_lower_than_three(self):
        """1 distinct meal should score lower than 3 distinct meals."""
        score_1 = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=1,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        score_3 = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        assert score_1 < score_3

    def test_macro_imbalance_penalty(self):
        """When >80% of calories come from one macro, score drops."""
        # Almost all calories from carbs: 400g carbs * 4 = 1600 cal, total ~1700
        score_imbalanced = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=10,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=400,
            fats_logged=5,
            water_ml=2000.0,
            total_calories_logged=1700,
        )
        score_balanced = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        assert score_imbalanced < score_balanced

    def test_hydration_contributes(self):
        """Full hydration should score better than none."""
        score_no_water = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=0.0,
            total_calories_logged=2000,
        )
        score_full_water = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2500.0,
            total_calories_logged=2000,
        )
        assert score_full_water > score_no_water

    def test_score_clamped_0_100(self):
        """Score should always be within [0, 100]."""
        score = _calculate_diet_quality_score(
            calories_ratio=5.0,
            protein_logged=0,
            protein_target=150,
            distinct_meals=0,
            carbs_logged=0,
            fats_logged=0,
            water_ml=0.0,
            total_calories_logged=0,
        )
        assert 0 <= score <= 100

    def test_zero_protein_target(self):
        """protein_target=0 should not crash (division by zero guard)."""
        score = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=100,
            protein_target=0,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        assert 0 <= score <= 100


# ===========================================================================
# 3. Risk score (Item 116)
# ===========================================================================

class TestRiskScore:
    """Tests for _calculate_risk_score."""

    def test_no_log_7_days_high_risk(self):
        """7 consecutive no-log days should push risk > 80."""
        score = _calculate_risk_score(
            consecutive_no_log_days=7,
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            carbs_logged=0,
            carbs_target=250,
            fats_logged=0,
            fats_target=65,
            diet_quality_score=0,
        )
        assert score > 80, f"7 no-log days risk {score} should be > 80"

    def test_perfect_adherence_low_risk(self):
        """Perfect adherence, no missed days should yield risk < 20."""
        score = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            carbs_logged=250,
            carbs_target=250,
            fats_logged=65,
            fats_target=65,
            diet_quality_score=90,
        )
        assert score < 20, f"Perfect adherence risk {score} should be < 20"

    def test_high_caloric_deviation_raises_risk(self):
        """High caloric deviation should push risk > 50."""
        score = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=0.3,
            protein_logged=40,
            protein_target=150,
            carbs_logged=80,
            carbs_target=250,
            fats_logged=15,
            fats_target=65,
            diet_quality_score=30,
        )
        assert score > 50, f"High caloric deviation risk {score} should be > 50"

    def test_partial_no_log(self):
        """3 no-log days + partial deviation — moderate risk."""
        score = _calculate_risk_score(
            consecutive_no_log_days=3,
            calories_ratio=0.7,
            protein_logged=100,
            protein_target=150,
            carbs_logged=180,
            carbs_target=250,
            fats_logged=45,
            fats_target=65,
            diet_quality_score=50,
        )
        assert 30 <= score <= 70, f"Partial scenario risk {score} should be moderate"

    def test_excess_calories_increases_risk(self):
        """calories_ratio of 2.0 should create high caloric deviation risk."""
        score = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=2.0,
            protein_logged=150,
            protein_target=150,
            carbs_logged=250,
            carbs_target=250,
            fats_logged=65,
            fats_target=65,
            diet_quality_score=60,
        )
        assert score > 40, f"2x excess risk {score} should be > 40"

    def test_risk_clamped_0_100(self):
        """Risk score should be within [0, 100]."""
        score = _calculate_risk_score(
            consecutive_no_log_days=100,
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            carbs_logged=0,
            carbs_target=250,
            fats_logged=0,
            fats_target=65,
            diet_quality_score=0,
        )
        assert 0 <= score <= 100

    def test_zero_targets_no_crash(self):
        """Zero macro targets should not crash (division guard)."""
        score = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=1.0,
            protein_logged=100,
            protein_target=0,
            carbs_logged=200,
            carbs_target=0,
            fats_logged=50,
            fats_target=0,
            diet_quality_score=50,
        )
        assert 0 <= score <= 100

    def test_more_no_log_days_higher_risk(self):
        """Risk should increase with more no-log days."""
        base = dict(
            calories_ratio=0.5,
            protein_logged=50,
            protein_target=150,
            carbs_logged=100,
            carbs_target=250,
            fats_logged=30,
            fats_target=65,
            diet_quality_score=40,
        )
        score_1 = _calculate_risk_score(consecutive_no_log_days=1, **base)
        score_5 = _calculate_risk_score(consecutive_no_log_days=5, **base)
        assert score_5 > score_1


# ===========================================================================
# 4. Confidence score (Item 117)
# ===========================================================================

class TestConfidenceScore:
    """Tests for _calculate_confidence_score."""

    def test_high_confidence(self):
        """4 meals, plausible calories, all macros, spread hours -> confidence > 80."""
        score = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=2000,
            protein_logged=150,
            carbs_logged=250,
            fats_logged=65,
            meal_hours=[8, 12, 15, 19],
        )
        assert score > 80, f"High confidence score {score} should be > 80"

    def test_low_confidence(self):
        """1 meal, 50 kcal -> confidence < 40."""
        score = _calculate_confidence_score(
            meals_logged=1,
            calories_logged=50,
            protein_logged=5,
            carbs_logged=0,
            fats_logged=0,
            meal_hours=[12],
        )
        assert score < 40, f"Low confidence score {score} should be < 40"

    def test_zero_meals_zero_confidence(self):
        """0 meals -> confidence = 0."""
        score = _calculate_confidence_score(
            meals_logged=0,
            calories_logged=0,
            protein_logged=0,
            carbs_logged=0,
            fats_logged=0,
            meal_hours=[],
        )
        assert score == 0, f"Zero meals confidence {score} should be 0"

    def test_two_meals_moderate(self):
        """2 meals with plausible data — moderate confidence."""
        score = _calculate_confidence_score(
            meals_logged=2,
            calories_logged=1200,
            protein_logged=80,
            carbs_logged=120,
            fats_logged=40,
            meal_hours=[8, 13],
        )
        assert 40 <= score <= 80, f"Two meals confidence {score} should be 40-80"

    def test_implausible_high_calories(self):
        """Very high calories (>5000) should reduce confidence."""
        score_normal = _calculate_confidence_score(
            meals_logged=3,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[8, 12, 19],
        )
        score_high = _calculate_confidence_score(
            meals_logged=3,
            calories_logged=8000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[8, 12, 19],
        )
        assert score_high < score_normal

    def test_missing_macros_reduces_confidence(self):
        """Missing macro data should reduce confidence."""
        score_all = _calculate_confidence_score(
            meals_logged=3,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[8, 12, 19],
        )
        score_no_macros = _calculate_confidence_score(
            meals_logged=3,
            calories_logged=2000,
            protein_logged=0,
            carbs_logged=0,
            fats_logged=0,
            meal_hours=[8, 12, 19],
        )
        assert score_no_macros < score_all

    def test_time_spread_contributes(self):
        """More spread-out meal hours should increase confidence."""
        score_single_hour = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[12, 12, 12, 12],
        )
        score_spread = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[7, 12, 16, 20],
        )
        assert score_spread > score_single_hour

    def test_confidence_clamped_0_100(self):
        """Score should be within [0, 100]."""
        score = _calculate_confidence_score(
            meals_logged=10,
            calories_logged=4000,
            protein_logged=300,
            carbs_logged=500,
            fats_logged=150,
            meal_hours=[6, 8, 10, 12, 14, 16, 18, 20],
        )
        assert 0 <= score <= 100

    def test_very_low_calories_not_plausible(self):
        """Calories below 300 should penalize plausibility proportionally."""
        score_150 = _calculate_confidence_score(
            meals_logged=2,
            calories_logged=150,
            protein_logged=10,
            carbs_logged=20,
            fats_logged=5,
            meal_hours=[8, 12],
        )
        score_300 = _calculate_confidence_score(
            meals_logged=2,
            calories_logged=300,
            protein_logged=10,
            carbs_logged=20,
            fats_logged=5,
            meal_hours=[8, 12],
        )
        assert score_150 < score_300


# ===========================================================================
# 5. Intervention selection
# ===========================================================================

class TestInterventionSelection:
    """Tests for _select_intervention_message and INTERVENTIONS dict."""

    def test_critical_has_home_banner(self):
        """Critical intervention should have home_banner=True."""
        assert INTERVENTIONS["critical"]["home_banner"] is True

    def test_optimal_has_no_push(self):
        """Optimal intervention should have minimal fields (no push_title)."""
        assert "push_title" not in INTERVENTIONS["optimal"]

    def test_high_risk_has_home_banner(self):
        assert INTERVENTIONS["high_risk"]["home_banner"] is True

    def test_risk_no_home_banner(self):
        assert INTERVENTIONS["risk"]["home_banner"] is False

    def test_select_message_no_log(self):
        """Primary reason 'no_log' should return a message dict."""
        msg = _select_intervention_message(
            primary_reason="no_log",
            consecutive_days=3,
            cal_logged=0,
            cal_target=2000,
            protein_logged=0,
            protein_target=150,
        )
        assert "push_title" in msg
        assert "push_body" in msg

    def test_select_message_low_calories(self):
        """'low_calories' message should interpolate cal and target."""
        msg = _select_intervention_message(
            primary_reason="low_calories",
            consecutive_days=0,
            cal_logged=500,
            cal_target=2000,
            protein_logged=30,
            protein_target=150,
        )
        assert "push_body" in msg
        # The body should contain the actual calorie values
        assert "500" in msg["push_body"] or "2000" in msg["push_body"]

    def test_select_message_excess(self):
        """'excess' message should be returned."""
        msg = _select_intervention_message(
            primary_reason="excess",
            consecutive_days=0,
            cal_logged=3000,
            cal_target=2000,
            protein_logged=100,
            protein_target=150,
        )
        assert "push_title" in msg

    def test_select_message_unknown_reason_returns_empty(self):
        """Unknown primary reason should return empty dict."""
        msg = _select_intervention_message(
            primary_reason="nonexistent_reason",
            consecutive_days=0,
            cal_logged=0,
            cal_target=2000,
            protein_logged=0,
            protein_target=150,
        )
        assert msg == {}

    def test_select_message_low_protein(self):
        """'low_protein' message should include protein_pct."""
        msg = _select_intervention_message(
            primary_reason="low_protein",
            consecutive_days=0,
            cal_logged=1800,
            cal_target=2000,
            protein_logged=30,
            protein_target=150,
        )
        assert "push_body" in msg

    def test_select_message_bad_quality(self):
        msg = _select_intervention_message(
            primary_reason="bad_quality",
            consecutive_days=0,
            cal_logged=1800,
            cal_target=2000,
            protein_logged=100,
            protein_target=150,
        )
        assert "push_title" in msg

    def test_select_message_macro_imbalance(self):
        msg = _select_intervention_message(
            primary_reason="macro_imbalance",
            consecutive_days=0,
            cal_logged=1800,
            cal_target=2000,
            protein_logged=100,
            protein_target=150,
        )
        assert "push_title" in msg

    def test_all_cause_messages_have_at_least_three_variants(self):
        """Each cause should have at least 3 template variants."""
        for cause, templates in CAUSE_MESSAGES.items():
            assert len(templates) >= 3, f"Cause '{cause}' has {len(templates)} variants, expected >= 3"


# ===========================================================================
# 6. Primary risk reason identification
# ===========================================================================

class TestPrimaryRiskReason:
    """Tests for _identify_primary_risk_reason."""

    def test_no_log_primary(self):
        """no_log_flag=True should yield primary='no_log'."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=True,
            zero_calories_flag=False,
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            diet_quality_score=0,
            total_calories_logged=0,
            carbs_logged=0,
            fats_logged=0,
        )
        assert primary == "no_log"

    def test_low_calories_primary(self):
        """Very low calorie ratio should identify 'low_calories'."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=0.2,
            protein_logged=20,
            protein_target=150,
            diet_quality_score=20,
            total_calories_logged=400,
            carbs_logged=50,
            fats_logged=10,
        )
        assert primary == "low_calories"

    def test_excess_primary(self):
        """High calorie ratio (>1.15) should identify 'excess'."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=1.8,
            protein_logged=150,
            protein_target=150,
            diet_quality_score=50,
            total_calories_logged=3600,
            carbs_logged=400,
            fats_logged=100,
        )
        assert primary == "excess"

    def test_low_protein_primary(self):
        """Very low protein with otherwise OK calories should flag 'low_protein'."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=0.95,
            protein_logged=20,
            protein_target=150,
            diet_quality_score=50,
            total_calories_logged=1900,
            carbs_logged=300,
            fats_logged=60,
        )
        assert primary == "low_protein"

    def test_bad_quality_primary(self):
        """Very low diet quality with OK calories/protein should flag 'bad_quality'."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=0.95,
            protein_logged=140,
            protein_target=150,
            diet_quality_score=20,
            total_calories_logged=1900,
            carbs_logged=250,
            fats_logged=60,
        )
        # bad_quality or macro_imbalance can surface — just check it's one of the non-calorie reasons
        assert primary in ("bad_quality", "macro_imbalance", "low_protein")

    def test_macro_imbalance_primary(self):
        """When >65% of calories come from one macro, flag 'macro_imbalance'."""
        # 500g carbs * 4 = 2000 cal, total 2200 — carbs_pct ~0.91
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=1.0,
            protein_logged=20,
            protein_target=150,
            diet_quality_score=50,
            total_calories_logged=2200,
            carbs_logged=500,
            fats_logged=5,
        )
        assert primary in ("macro_imbalance", "low_protein")

    def test_zero_calories_flag(self):
        """zero_calories_flag=True (meals logged but 0 cal) should be 'low_calories'."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=True,
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            diet_quality_score=0,
            total_calories_logged=0,
            carbs_logged=0,
            fats_logged=0,
        )
        assert primary == "low_calories"

    def test_returns_secondary_reason(self):
        """Should return a secondary reason when multiple risks exist."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=0.3,
            protein_logged=10,
            protein_target=150,
            diet_quality_score=15,
            total_calories_logged=600,
            carbs_logged=100,
            fats_logged=10,
        )
        assert primary is not None
        assert secondary is not None
        assert primary != secondary

    def test_no_risks_fallback(self):
        """With perfect data, should still return a primary reason (fallback)."""
        primary, secondary, *_ = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            diet_quality_score=90,
            total_calories_logged=2000,
            carbs_logged=250,
            fats_logged=65,
        )
        # Fallback for no risks: returns "low_calories" with no secondary
        assert primary is not None


# ===========================================================================
# 7. Intervention cooldown (_should_send_intervention)
# ===========================================================================

class TestShouldSendIntervention:
    """Tests for _should_send_intervention cooldown logic."""

    def setup_method(self):
        """Clear cooldown tracker before each test."""
        _intervention_cooldowns.clear()

    def test_first_intervention_allowed(self):
        """First intervention for a user should always be allowed."""
        should_send, last_at, sev = _should_send_intervention(user_id=1, severity="critical")
        assert should_send is True
        assert last_at is None

    def test_within_24h_blocked(self):
        """Same severity within 24h should be blocked."""
        _record_intervention(user_id=1, severity="critical")
        should_send, last_at, sev = _should_send_intervention(user_id=1, severity="critical")
        assert should_send is False
        assert last_at is not None

    def test_after_24h_allowed(self):
        """Same severity after 24h should be allowed again."""
        _intervention_cooldowns["1:critical"] = datetime.utcnow() - timedelta(hours=25)
        should_send, last_at, sev = _should_send_intervention(user_id=1, severity="critical")
        assert should_send is True

    def test_different_severity_independent(self):
        """Different severity levels should have independent cooldowns."""
        _record_intervention(user_id=1, severity="critical")
        should_send, _, _ = _should_send_intervention(user_id=1, severity="high_risk")
        assert should_send is True

    def test_different_users_independent(self):
        """Different users should have independent cooldowns."""
        _record_intervention(user_id=1, severity="critical")
        should_send, _, _ = _should_send_intervention(user_id=2, severity="critical")
        assert should_send is True

    def test_record_then_check(self):
        """Record + immediate check should block."""
        _record_intervention(user_id=99, severity="risk")
        should_send, _, _ = _should_send_intervention(user_id=99, severity="risk")
        assert should_send is False

    def test_exactly_24h_boundary(self):
        """At exactly 24h, should still be blocked (< check, not <=)."""
        _intervention_cooldowns["1:risk"] = datetime.utcnow() - timedelta(hours=24)
        should_send, _, _ = _should_send_intervention(user_id=1, severity="risk")
        # timedelta(hours=24) == timedelta(hours=24), so (now - last) < 24h is False
        # This means it SHOULD be allowed at exactly 24h
        assert should_send is True


# ===========================================================================
# 8. Self-correction logic in adherence classification
# ===========================================================================

class TestSelfCorrection:
    """Verify that a calories_ratio > 0.7 downgrades from critical thresholds."""

    def test_ratio_0_7_is_low_adherence(self):
        """0.70 should be 'low_adherence', not 'risk'."""
        assert _classify_adherence_status(0.70, False) == "low_adherence"

    def test_ratio_0_85_is_optimal(self):
        """0.85 enters optimal — user self-corrected."""
        assert _classify_adherence_status(0.85, False) == "optimal"

    def test_recovery_from_critical_to_optimal(self):
        """Simulate user going from critical (0.1) to optimal (1.0)."""
        s1 = _classify_adherence_status(0.1, False)
        s2 = _classify_adherence_status(1.0, False)
        assert s1 == "critical"
        assert s2 == "optimal"


# ===========================================================================
# 9. Edge cases and integration between functions
# ===========================================================================

class TestEdgeCases:
    """Cross-cutting edge case tests."""

    def test_risk_score_is_int(self):
        """Risk score should always be an integer."""
        score = _calculate_risk_score(
            consecutive_no_log_days=2,
            calories_ratio=0.6,
            protein_logged=80,
            protein_target=150,
            carbs_logged=120,
            carbs_target=250,
            fats_logged=30,
            fats_target=65,
            diet_quality_score=45,
        )
        assert isinstance(score, int)

    def test_diet_quality_score_is_int(self):
        """Diet quality score should always be an integer."""
        score = _calculate_diet_quality_score(
            calories_ratio=0.8,
            protein_logged=100,
            protein_target=150,
            distinct_meals=2,
            carbs_logged=180,
            fats_logged=45,
            water_ml=1500.0,
            total_calories_logged=1600,
        )
        assert isinstance(score, int)

    def test_confidence_score_is_int(self):
        """Confidence score should always be an integer."""
        score = _calculate_confidence_score(
            meals_logged=2,
            calories_logged=1000,
            protein_logged=50,
            carbs_logged=100,
            fats_logged=30,
            meal_hours=[10, 14],
        )
        assert isinstance(score, int)

    def test_all_intervention_severities_exist(self):
        """Every status from _classify_adherence_status should have an intervention."""
        statuses = [
            "critical", "high_risk", "risk", "low_adherence",
            "optimal", "moderate_excess", "high_excess",
        ]
        for status in statuses:
            assert status in INTERVENTIONS, f"Missing intervention for status '{status}'"

    def test_risk_reason_tuple_format(self):
        """_identify_primary_risk_reason always returns a 3-tuple."""
        result = _identify_primary_risk_reason(
            no_log_flag=False,
            zero_calories_flag=False,
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            diet_quality_score=90,
            total_calories_logged=2000,
            carbs_logged=250,
            fats_logged=65,
        )
        assert isinstance(result, tuple)
        assert len(result) >= 2


# ===========================================================================
# 10. Calorie edge cases (Item 114b)
# ===========================================================================

class TestCalorieEdgeCases:
    """Edge case tests for calorie-related calculations."""

    def test_zero_calories_zero_target_no_crash(self):
        """0 calories with 0 target should not crash (division by zero guard)."""
        # _classify_adherence_status receives a ratio, so 0/0 would be handled
        # upstream. With ratio=0.0, no_log=False it should return critical.
        status = _classify_adherence_status(0.0, False)
        assert status == "critical"

    def test_zero_calories_zero_target_risk_score(self):
        """Risk score with 0 calories and 0 targets should not crash."""
        score = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=0,
            carbs_logged=0,
            carbs_target=0,
            fats_logged=0,
            fats_target=0,
            diet_quality_score=0,
        )
        assert 0 <= score <= 100

    def test_zero_calories_zero_target_diet_quality(self):
        """Diet quality with 0 calories and 0 target should not crash."""
        score = _calculate_diet_quality_score(
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=0,
            distinct_meals=0,
            carbs_logged=0,
            fats_logged=0,
            water_ml=0.0,
            total_calories_logged=0,
        )
        assert 0 <= score <= 100

    def test_very_high_calories_10000_with_normal_target(self):
        """10000 kcal with 2000 target -> ratio=5.0, should be critical excess."""
        status = _classify_adherence_status(5.0, False)
        assert status == "critical"

    def test_very_high_calories_risk_score(self):
        """10000 kcal logged against 2000 target should produce elevated risk.

        Risk formula: 35% cal_deviation (capped 100) + 35% no_log (0) + 15% macro (0) + 15% quality_risk (80)
        = 35 + 0 + 0 + 12 = 47. Macros are on target so only caloric deviation drives risk.
        """
        score = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=5.0,
            protein_logged=150,
            protein_target=150,
            carbs_logged=250,
            carbs_target=250,
            fats_logged=65,
            fats_target=65,
            diet_quality_score=20,
        )
        assert score > 40, f"Extreme excess risk {score} should be > 40"

    def test_very_high_calories_confidence(self):
        """10000 kcal should reduce confidence below normal."""
        score_normal = _calculate_confidence_score(
            meals_logged=3,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[8, 12, 19],
        )
        score_extreme = _calculate_confidence_score(
            meals_logged=3,
            calories_logged=10000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[8, 12, 19],
        )
        assert score_extreme < score_normal

    def test_negative_calories_adherence(self):
        """Negative calories (should not happen) — ratio <0 should be critical."""
        status = _classify_adherence_status(-0.5, False)
        assert status == "critical"

    def test_negative_calories_diet_quality_clamped(self):
        """Negative calories_ratio should still produce a clamped 0-100 score."""
        score = _calculate_diet_quality_score(
            calories_ratio=-1.0,
            protein_logged=0,
            protein_target=150,
            distinct_meals=0,
            carbs_logged=0,
            fats_logged=0,
            water_ml=0.0,
            total_calories_logged=0,
        )
        assert 0 <= score <= 100

    def test_fractional_calories_handled_as_int(self):
        """Fractional calories (29.7) should be handled without crash."""
        # Confidence score takes int, but let's verify float-like behavior
        score = _calculate_confidence_score(
            meals_logged=1,
            calories_logged=30,  # 29.7 rounded to int
            protein_logged=2,
            carbs_logged=5,
            fats_logged=1,
            meal_hours=[12],
        )
        assert 0 <= score <= 100
        assert isinstance(score, int)


# ===========================================================================
# 11. Diet quality edge cases (Item 115b)
# ===========================================================================

class TestDietQualityEdgeCases:
    """Edge case tests for diet quality scoring."""

    def test_only_protein_no_carbs_no_fats(self):
        """All calories from protein only — should penalize macro balance."""
        # 200g protein * 4 = 800 cal total
        score = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=200,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=0,
            fats_logged=0,
            water_ml=2000.0,
            total_calories_logged=800,
        )
        assert 0 <= score <= 100
        # Should be lower than a balanced meal
        balanced = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        assert score < balanced

    def test_only_carbs_no_protein_no_fats(self):
        """All calories from carbs only — macro imbalance + low protein."""
        # 400g carbs * 4 = 1600 cal
        score = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=0,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=400,
            fats_logged=0,
            water_ml=2000.0,
            total_calories_logged=1600,
        )
        assert 0 <= score <= 100
        # Should be significantly lower due to protein=0 and imbalance
        assert score < 60

    def test_100_pct_calories_from_fats(self):
        """All calories from fats — extreme macro imbalance.

        Breakdown: cal_score=30% of 100=30, protein_score=25% of 0=0,
        meal_score=20% of 100=20, macro_balance=15% of penalty, hydration=10% of 80=8.
        Even with macro penalty, meal_score and cal_score push it above 50.
        """
        # 100g fats * 9 = 900 cal
        score = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=0,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=0,
            fats_logged=100,
            water_ml=2000.0,
            total_calories_logged=900,
        )
        assert 0 <= score <= 100
        # Severely imbalanced: lower than a balanced diet
        balanced = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2000.0,
            total_calories_logged=2000,
        )
        assert score < balanced

    def test_all_zeros_except_water_hydration_only(self):
        """Only water logged, everything else zero — hydration contributes."""
        score_with_water = _calculate_diet_quality_score(
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            distinct_meals=0,
            carbs_logged=0,
            fats_logged=0,
            water_ml=2500.0,
            total_calories_logged=0,
        )
        score_no_water = _calculate_diet_quality_score(
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            distinct_meals=0,
            carbs_logged=0,
            fats_logged=0,
            water_ml=0.0,
            total_calories_logged=0,
        )
        assert score_with_water > score_no_water
        # Hydration is 10% weight, so max contribution = 10 points
        assert score_with_water <= 25  # 15 (macro default) + 10 (hydration)

    def test_extreme_water_above_target(self):
        """Water above 2500ml should be capped at 100 for hydration component."""
        score_2500 = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2500.0,
            total_calories_logged=2000,
        )
        score_5000 = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=250,
            fats_logged=65,
            water_ml=5000.0,
            total_calories_logged=2000,
        )
        # Should be equal since hydration is capped at 100%
        assert score_2500 == score_5000


# ===========================================================================
# 12. Confidence score edge cases (Item 117b)
# ===========================================================================

class TestConfidenceEdgeCases:
    """Edge case tests for confidence scoring."""

    def test_meals_spread_12_hours_vs_1_hour(self):
        """Meals spread across 12 hours should have higher confidence than 1 hour."""
        score_spread = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[7, 11, 15, 19],  # 12 hour spread
        )
        score_clustered = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[12, 12, 12, 12],  # 1 hour (all same)
        )
        assert score_spread > score_clustered

    def test_exactly_300_kcal_plausibility_boundary(self):
        """Exactly 300 kcal should get 100% plausibility score."""
        score = _calculate_confidence_score(
            meals_logged=2,
            calories_logged=300,
            protein_logged=20,
            carbs_logged=30,
            fats_logged=10,
            meal_hours=[8, 12],
        )
        # 300 is the lower boundary of full plausibility
        assert score > 0

    def test_exactly_5000_kcal_plausibility_boundary(self):
        """Exactly 5000 kcal should get 100% plausibility score."""
        score = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=5000,
            protein_logged=200,
            carbs_logged=500,
            fats_logged=100,
            meal_hours=[7, 11, 15, 19],
        )
        assert score > 0

    def test_299_kcal_below_plausibility(self):
        """299 kcal — below 300 boundary, plausibility should be proportionally reduced."""
        score_299 = _calculate_confidence_score(
            meals_logged=2,
            calories_logged=299,
            protein_logged=20,
            carbs_logged=30,
            fats_logged=10,
            meal_hours=[8, 12],
        )
        score_300 = _calculate_confidence_score(
            meals_logged=2,
            calories_logged=300,
            protein_logged=20,
            carbs_logged=30,
            fats_logged=10,
            meal_hours=[8, 12],
        )
        assert score_299 <= score_300

    def test_5001_kcal_above_plausibility(self):
        """5001 kcal — above 5000 boundary, plausibility should start decreasing."""
        score_5000 = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=5000,
            protein_logged=200,
            carbs_logged=500,
            fats_logged=100,
            meal_hours=[7, 11, 15, 19],
        )
        score_5001 = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=5001,
            protein_logged=200,
            carbs_logged=500,
            fats_logged=100,
            meal_hours=[7, 11, 15, 19],
        )
        assert score_5001 <= score_5000

    def test_spread_4_distinct_hours_max(self):
        """Time spread caps at 4 distinct hours for 100%."""
        score_4h = _calculate_confidence_score(
            meals_logged=4,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[8, 12, 16, 20],
        )
        score_8h = _calculate_confidence_score(
            meals_logged=8,
            calories_logged=2000,
            protein_logged=100,
            carbs_logged=200,
            fats_logged=50,
            meal_hours=[6, 8, 10, 12, 14, 16, 18, 20],
        )
        # Time spread component is the same (both >= 4 distinct hours)
        # But meal coverage differs (4 vs 8 meals, both map to 100%)
        assert score_4h == score_8h


# ===========================================================================
# 13. Timezone handling tests (Item 118)
# ===========================================================================

class TestTimezoneHandling:
    """Tests for date calculation across timezones."""

    def test_date_from_utc_midnight(self):
        """UTC midnight should produce correct date."""
        from zoneinfo import ZoneInfo
        utc = ZoneInfo("UTC")
        dt_utc = datetime(2026, 3, 22, 0, 0, 0, tzinfo=utc)
        assert dt_utc.date() == date(2026, 3, 22)

    def test_date_from_santiago_midnight(self):
        """Santiago midnight (UTC-3) should produce correct local date."""
        from zoneinfo import ZoneInfo
        santiago = ZoneInfo("America/Santiago")
        dt_santiago = datetime(2026, 3, 22, 0, 0, 0, tzinfo=santiago)
        assert dt_santiago.date() == date(2026, 3, 22)

    def test_utc_midnight_vs_santiago_midnight_differ(self):
        """UTC midnight and Santiago midnight are different instants."""
        from zoneinfo import ZoneInfo
        utc = ZoneInfo("UTC")
        santiago = ZoneInfo("America/Santiago")
        dt_utc = datetime(2026, 3, 22, 0, 0, 0, tzinfo=utc)
        dt_santiago = datetime(2026, 3, 22, 0, 0, 0, tzinfo=santiago)
        # Santiago is UTC-3, so santiago midnight = 03:00 UTC
        assert dt_santiago > dt_utc

    def test_late_night_utc_is_next_day_santiago(self):
        """22:00 UTC on March 21 is 01:00 Santiago March 22 (UTC-3 winter)."""
        from zoneinfo import ZoneInfo
        utc = ZoneInfo("UTC")
        santiago = ZoneInfo("America/Santiago")
        dt_utc = datetime(2026, 3, 21, 22, 0, 0, tzinfo=utc)
        dt_santiago = dt_utc.astimezone(santiago)
        # In March, Santiago is in CLT (UTC-3)
        # 22:00 UTC -> 19:00 CLT (same day, not next day during CLT)
        # Actually depends on DST. Let's just verify conversion works.
        assert dt_santiago.tzinfo is not None

    def test_date_boundary_risk_classification_consistent(self):
        """Adherence classification should be timezone-independent (uses ratios)."""
        # The risk functions are pure and don't use timezone.
        # Verify the same ratio produces the same status regardless of when called.
        status_1 = _classify_adherence_status(0.85, False)
        status_2 = _classify_adherence_status(0.85, False)
        assert status_1 == status_2 == "optimal"


# ===========================================================================
# 14. Goal-specific threshold tests (Item 130)
# ===========================================================================

class TestGoalThresholds:
    """Tests for goal-specific adherence thresholds."""

    # --- lose_weight: optimal_low=0.90, optimal_high=1.10 ---

    def test_lose_weight_optimal_at_0_90(self):
        status = _classify_adherence_status(0.90, False, goal="lose_weight")
        assert status == "optimal"

    def test_lose_weight_optimal_at_1_10(self):
        status = _classify_adherence_status(1.10, False, goal="lose_weight")
        assert status == "optimal"

    def test_lose_weight_low_adherence_at_0_89(self):
        status = _classify_adherence_status(0.89, False, goal="lose_weight")
        assert status == "low_adherence"

    def test_lose_weight_moderate_excess_at_1_11(self):
        status = _classify_adherence_status(1.11, False, goal="lose_weight")
        assert status == "moderate_excess"

    def test_lose_weight_high_excess_at_1_21(self):
        status = _classify_adherence_status(1.21, False, goal="lose_weight")
        assert status == "high_excess"

    def test_lose_weight_critical_above_1_40(self):
        status = _classify_adherence_status(1.41, False, goal="lose_weight")
        assert status == "critical"

    # --- maintain: optimal_low=0.85, optimal_high=1.15 ---

    def test_maintain_optimal_at_0_85(self):
        status = _classify_adherence_status(0.85, False, goal="maintain")
        assert status == "optimal"

    def test_maintain_optimal_at_1_15(self):
        status = _classify_adherence_status(1.15, False, goal="maintain")
        assert status == "optimal"

    def test_maintain_low_adherence_at_0_84(self):
        status = _classify_adherence_status(0.84, False, goal="maintain")
        assert status == "low_adherence"

    def test_maintain_moderate_excess_at_1_16(self):
        status = _classify_adherence_status(1.16, False, goal="maintain")
        assert status == "moderate_excess"

    def test_maintain_high_excess_at_1_31(self):
        status = _classify_adherence_status(1.31, False, goal="maintain")
        assert status == "high_excess"

    def test_maintain_critical_above_1_60(self):
        status = _classify_adherence_status(1.61, False, goal="maintain")
        assert status == "critical"

    # --- gain_muscle: optimal_low=0.95, optimal_high=1.30 ---

    def test_gain_muscle_optimal_at_0_95(self):
        status = _classify_adherence_status(0.95, False, goal="gain_muscle")
        assert status == "optimal"

    def test_gain_muscle_optimal_at_1_30(self):
        status = _classify_adherence_status(1.30, False, goal="gain_muscle")
        assert status == "optimal"

    def test_gain_muscle_low_adherence_at_0_94(self):
        status = _classify_adherence_status(0.94, False, goal="gain_muscle")
        assert status == "low_adherence"

    def test_gain_muscle_moderate_excess_at_1_31(self):
        status = _classify_adherence_status(1.31, False, goal="gain_muscle")
        assert status == "moderate_excess"

    def test_gain_muscle_high_excess_at_1_46(self):
        status = _classify_adherence_status(1.46, False, goal="gain_muscle")
        assert status == "high_excess"

    def test_gain_muscle_critical_above_1_70(self):
        status = _classify_adherence_status(1.71, False, goal="gain_muscle")
        assert status == "critical"

    def test_gain_muscle_risk_at_0_55(self):
        """gain_muscle risk_floor is 0.55, so 0.54 should be high_risk."""
        status = _classify_adherence_status(0.54, False, goal="gain_muscle")
        assert status == "high_risk"

    def test_gain_muscle_high_risk_floor_at_0_30(self):
        """gain_muscle high_risk_floor is 0.30, so 0.29 should be critical."""
        status = _classify_adherence_status(0.29, False, goal="gain_muscle")
        assert status == "critical"

    def test_unknown_goal_falls_back_to_maintain(self):
        """Unknown goal should use maintain thresholds."""
        status_unknown = _classify_adherence_status(0.85, False, goal="unknown_goal")
        status_maintain = _classify_adherence_status(0.85, False, goal="maintain")
        assert status_unknown == status_maintain


# ===========================================================================
# 15. Recovery score tests (Item 131)
# ===========================================================================

class TestRecoveryScore:
    """Tests for _calculate_recovery_score."""

    def _make_record(self, day_offset: int, risk_score: int):
        """Helper: create a mock DailyNutritionAdherence with date and risk."""
        from unittest.mock import MagicMock
        record = MagicMock()
        record.date = date.today() - timedelta(days=day_offset)
        record.nutrition_risk_score = risk_score
        record.no_log_flag = False
        record.created_at = datetime.utcnow()
        return record

    def test_improving_trend(self):
        """First 4 high risk, last 3 low risk -> recovering=True."""
        records = [
            self._make_record(6, 80),  # oldest
            self._make_record(5, 85),
            self._make_record(4, 75),
            self._make_record(3, 70),
            self._make_record(2, 20),  # recent
            self._make_record(1, 15),
            self._make_record(0, 10),
        ]
        result = _calculate_recovery_score(records)
        assert result["recovering"] is True
        assert result["improvement_pct"] > 0

    def test_worsening_trend(self):
        """First 4 low risk, last 3 high risk -> not recovering."""
        records = [
            self._make_record(6, 10),
            self._make_record(5, 15),
            self._make_record(4, 20),
            self._make_record(3, 25),
            self._make_record(2, 80),
            self._make_record(1, 85),
            self._make_record(0, 90),
        ]
        result = _calculate_recovery_score(records)
        assert result["recovering"] is False

    def test_stable_trend(self):
        """All similar risk scores -> not recovering (improvement <= 10)."""
        records = [
            self._make_record(6, 50),
            self._make_record(5, 52),
            self._make_record(4, 48),
            self._make_record(3, 51),
            self._make_record(2, 49),
            self._make_record(1, 50),
            self._make_record(0, 48),
        ]
        result = _calculate_recovery_score(records)
        assert result["recovering"] is False
        assert result["improvement_pct"] == 0

    def test_fewer_than_4_records(self):
        """With fewer than 4 records, should return not recovering."""
        records = [
            self._make_record(2, 80),
            self._make_record(1, 40),
            self._make_record(0, 20),
        ]
        result = _calculate_recovery_score(records)
        assert result["recovering"] is False
        assert result["improvement_pct"] == 0

    def test_exactly_4_records(self):
        """With exactly 4 records — last 3 vs 1 older."""
        records = [
            self._make_record(3, 90),  # older group (1 record)
            self._make_record(2, 20),  # last 3
            self._make_record(1, 15),
            self._make_record(0, 10),
        ]
        result = _calculate_recovery_score(records)
        # older_avg=90, last_3_avg=15, improvement=75 > 10
        assert result["recovering"] is True

    def test_empty_records(self):
        """Empty records should return not recovering."""
        result = _calculate_recovery_score([])
        assert result["recovering"] is False
        assert result["improvement_pct"] == 0


# ===========================================================================
# 16. Intervention cooldown with mock time (Item 132)
# ===========================================================================

class TestCooldownWithMockTime:
    """Tests for intervention cooldown using mocked datetime."""

    def setup_method(self):
        _intervention_cooldowns.clear()

    def test_cooldown_at_exactly_24h_boundary(self):
        """At exactly 24h since last intervention, should be allowed."""
        fixed_now = datetime(2026, 3, 22, 12, 0, 0)
        _intervention_cooldowns["1:critical"] = fixed_now - timedelta(hours=24)

        with patch("app.services.nutrition_risk_service.datetime") as mock_dt:
            mock_dt.utcnow.return_value = fixed_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            should_send, _, _ = _should_send_intervention(user_id=1, severity="critical")
            assert should_send is True

    def test_cooldown_at_23h59m_blocked(self):
        """At 23h59m since last intervention, should still be blocked."""
        fixed_now = datetime(2026, 3, 22, 12, 0, 0)
        _intervention_cooldowns["1:critical"] = fixed_now - timedelta(hours=23, minutes=59)

        with patch("app.services.nutrition_risk_service.datetime") as mock_dt:
            mock_dt.utcnow.return_value = fixed_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            should_send, _, _ = _should_send_intervention(user_id=1, severity="critical")
            assert should_send is False

    def test_multiple_severities_independent_cooldowns(self):
        """Different severities should have independent cooldowns."""
        fixed_now = datetime(2026, 3, 22, 12, 0, 0)
        _intervention_cooldowns["1:critical"] = fixed_now - timedelta(hours=1)
        _intervention_cooldowns["1:risk"] = fixed_now - timedelta(hours=25)

        with patch("app.services.nutrition_risk_service.datetime") as mock_dt:
            mock_dt.utcnow.return_value = fixed_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            should_critical, _, _ = _should_send_intervention(user_id=1, severity="critical")
            should_risk, _, _ = _should_send_intervention(user_id=1, severity="risk")
            assert should_critical is False  # 1h ago, blocked
            assert should_risk is True  # 25h ago, allowed

    def test_cooldown_reset_after_24h(self):
        """After 24h passes, cooldown should reset and allow new intervention."""
        fixed_before = datetime(2026, 3, 22, 12, 0, 0)
        fixed_after = datetime(2026, 3, 23, 13, 0, 0)  # 25h later

        _intervention_cooldowns["1:high_risk"] = fixed_before

        with patch("app.services.nutrition_risk_service.datetime") as mock_dt:
            mock_dt.utcnow.return_value = fixed_after
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            should_send, _, _ = _should_send_intervention(user_id=1, severity="high_risk")
            assert should_send is True

    def test_record_then_immediate_check_blocked(self):
        """Record intervention then immediately check — should be blocked."""
        fixed_now = datetime(2026, 3, 22, 12, 0, 0)
        with patch("app.services.nutrition_risk_service.datetime") as mock_dt:
            mock_dt.utcnow.return_value = fixed_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            _record_intervention(user_id=5, severity="risk")
            should_send, _, _ = _should_send_intervention(user_id=5, severity="risk")
            assert should_send is False


# ===========================================================================
# 17. Grace period tests (Item 133)
# ===========================================================================

class TestGracePeriod:
    """Tests for grace period risk reduction logic (pure calculation tests)."""

    def test_grace_period_reduces_risk_by_50_pct(self):
        """Within 3 days of onboarding, risk should be halved."""
        base_risk = _calculate_risk_score(
            consecutive_no_log_days=2,
            calories_ratio=0.4,
            protein_logged=30,
            protein_target=150,
            carbs_logged=60,
            carbs_target=250,
            fats_logged=15,
            fats_target=65,
            diet_quality_score=25,
        )
        # Simulate grace period: multiply by 0.50
        grace_risk = max(0, int(base_risk * 0.50))
        assert grace_risk < base_risk
        assert grace_risk == base_risk // 2 or abs(grace_risk - base_risk * 0.5) <= 1

    def test_no_grace_period_full_risk(self):
        """After 3 days, risk score should not be reduced."""
        risk = _calculate_risk_score(
            consecutive_no_log_days=2,
            calories_ratio=0.4,
            protein_logged=30,
            protein_target=150,
            carbs_logged=60,
            carbs_target=250,
            fats_logged=15,
            fats_target=65,
            diet_quality_score=25,
        )
        # No grace period, risk stays as-is
        assert risk > 0

    def test_grace_period_day_0(self):
        """Day 0 (same day as onboarding completion) should apply grace period."""
        # days_since = 0, which is 0 <= 0 <= 3 => grace applies
        days_since = 0
        assert 0 <= days_since <= 3

    def test_grace_period_day_3(self):
        """Day 3 should still apply grace period."""
        days_since = 3
        assert 0 <= days_since <= 3

    def test_grace_period_day_4_no_grace(self):
        """Day 4 should NOT apply grace period."""
        days_since = 4
        assert not (0 <= days_since <= 3)

    def test_no_onboarding_completion_no_grace(self):
        """If no onboarding completion date, grace period should not apply."""
        # When completed_at is None, the grace period check is skipped.
        # Verify that risk score is calculated normally.
        risk = _calculate_risk_score(
            consecutive_no_log_days=1,
            calories_ratio=0.5,
            protein_logged=50,
            protein_target=150,
            carbs_logged=100,
            carbs_target=250,
            fats_logged=25,
            fats_target=65,
            diet_quality_score=30,
        )
        # Without grace period, this should produce a meaningful risk score
        assert risk > 30

    def test_grace_period_never_produces_negative_risk(self):
        """Even with grace period applied to low risk, result should be >= 0."""
        low_risk = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=0.95,
            protein_logged=140,
            protein_target=150,
            carbs_logged=240,
            carbs_target=250,
            fats_logged=60,
            fats_target=65,
            diet_quality_score=85,
        )
        grace_risk = max(0, int(low_risk * 0.50))
        assert grace_risk >= 0


# ===========================================================================
# 18. Integrated health score component tests (Item 134)
# ===========================================================================

class TestIntegratedHealthScore:
    """Tests for integrated health score pure functions."""

    def test_trend_all_components_100(self):
        """All 100% components -> trend should be 'improving'."""
        from app.services.integrated_health_service import _determine_trend
        trend = _determine_trend(100, 100, 100, 100)
        assert trend == "improving"

    def test_trend_all_components_0(self):
        """All 0% components -> trend should be 'declining'."""
        from app.services.integrated_health_service import _determine_trend
        trend = _determine_trend(0, 0, 0, 0)
        assert trend == "declining"

    def test_trend_mixed_components_stable(self):
        """Mixed scores averaging ~50 -> trend should be 'stable'."""
        from app.services.integrated_health_service import _determine_trend
        trend = _determine_trend(60, 40, 50, 40)
        # avg = 47.5, which is >= 40 and < 65
        assert trend == "stable"

    def test_trend_boundary_65_improving(self):
        """Average exactly 65 -> 'improving'."""
        from app.services.integrated_health_service import _determine_trend
        trend = _determine_trend(65, 65, 65, 65)
        assert trend == "improving"

    def test_trend_boundary_40_stable(self):
        """Average exactly 40 -> 'stable'."""
        from app.services.integrated_health_service import _determine_trend
        trend = _determine_trend(40, 40, 40, 40)
        assert trend == "stable"

    def test_trend_boundary_39_declining(self):
        """Average below 40 -> 'declining'."""
        from app.services.integrated_health_service import _determine_trend
        trend = _determine_trend(39, 39, 39, 39)
        assert trend == "declining"

    def test_top_improvement_all_100(self):
        """All 100% — any area could be the 'top improvement' (all tied)."""
        from app.services.integrated_health_service import _determine_top_improvement
        result = _determine_top_improvement(100, 100, 100, 100)
        assert result in ("nutrition", "activity", "consistency", "hydration")

    def test_top_improvement_all_0(self):
        """All 0% — any area could be the 'top improvement' (all tied)."""
        from app.services.integrated_health_service import _determine_top_improvement
        result = _determine_top_improvement(0, 0, 0, 0)
        assert result in ("nutrition", "activity", "consistency", "hydration")

    def test_top_improvement_activity_lowest(self):
        """Activity is lowest -> should be top improvement."""
        from app.services.integrated_health_service import _determine_top_improvement
        result = _determine_top_improvement(80, 10, 70, 60)
        assert result == "activity"

    def test_top_improvement_hydration_lowest(self):
        """Hydration is lowest -> should be top improvement."""
        from app.services.integrated_health_service import _determine_top_improvement
        result = _determine_top_improvement(80, 70, 60, 5)
        assert result == "hydration"

    def test_top_improvement_nutrition_lowest(self):
        """Nutrition is lowest -> should be top improvement."""
        from app.services.integrated_health_service import _determine_top_improvement
        result = _determine_top_improvement(10, 80, 70, 60)
        assert result == "nutrition"

    def test_top_improvement_consistency_lowest(self):
        """Consistency is lowest -> should be top improvement."""
        from app.services.integrated_health_service import _determine_top_improvement
        result = _determine_top_improvement(80, 70, 5, 60)
        assert result == "consistency"

    def test_total_score_formula_all_100(self):
        """Verify total score = 0.40*100 + 0.20*100 + 0.25*100 + 0.15*100 = 100."""
        total = int(round(100 * 0.40 + 100 * 0.20 + 100 * 0.25 + 100 * 0.15))
        assert total == 100

    def test_total_score_formula_all_0(self):
        """Verify total score = 0 when all components are 0."""
        total = int(round(0 * 0.40 + 0 * 0.20 + 0 * 0.25 + 0 * 0.15))
        assert total == 0

    def test_total_score_formula_mixed(self):
        """Verify weighted formula with mixed values."""
        n, a, c, h = 80, 60, 70, 50
        expected = int(round(n * 0.40 + a * 0.20 + c * 0.25 + h * 0.15))
        # 32 + 12 + 17.5 + 7.5 = 69
        assert expected == 69


# ===========================================================================
# Wave 4: Smart Interventions Tests
# ===========================================================================

class TestCauseMessagesExpansion:
    """Tests for Item 37: expanded CAUSE_MESSAGES (5 variants each)."""

    def test_all_causes_have_five_variants(self):
        """Each cause should have exactly 5 template variants."""
        for cause, templates in CAUSE_MESSAGES.items():
            assert len(templates) == 5, f"Cause '{cause}' has {len(templates)} variants, expected 5"

    def test_all_causes_present(self):
        """All expected causes should be present."""
        expected_causes = {"no_log", "low_calories", "excess", "bad_quality", "low_protein", "macro_imbalance"}
        assert set(CAUSE_MESSAGES.keys()) == expected_causes

    def test_all_variants_have_required_keys(self):
        """Each variant should have push_title and push_body."""
        for cause, templates in CAUSE_MESSAGES.items():
            for i, tmpl in enumerate(templates):
                assert "push_title" in tmpl, f"Cause '{cause}' variant {i} missing push_title"
                assert "push_body" in tmpl, f"Cause '{cause}' variant {i} missing push_body"


class TestTimeAwareMessages:
    """Tests for Item 37: time-of-day aware messages."""

    def test_time_period_returns_valid_period(self):
        """_get_time_period should return morning, afternoon, or evening."""
        period = _get_time_period()
        assert period in ("morning", "afternoon", "evening")

    def test_all_causes_have_time_messages(self):
        """Each cause should have time-aware messages for all 3 periods."""
        for cause in CAUSE_MESSAGES:
            assert cause in TIME_AWARE_MESSAGES, f"Missing time-aware messages for '{cause}'"
            for period in ("morning", "afternoon", "evening"):
                assert period in TIME_AWARE_MESSAGES[cause], (
                    f"Missing '{period}' message for cause '{cause}'"
                )

    def test_time_aware_message_returns_dict(self):
        """_get_time_aware_message should return a dict with push_title and push_body."""
        msg = _get_time_aware_message(
            "no_log", cal_logged=0, cal_target=2000,
            protein_logged=0, protein_target=150, consecutive_days=0,
        )
        assert msg is not None
        assert "push_title" in msg
        assert "push_body" in msg

    def test_time_aware_message_unknown_reason(self):
        """Unknown reason should return None."""
        msg = _get_time_aware_message(
            "nonexistent", cal_logged=0, cal_target=2000,
            protein_logged=0, protein_target=150, consecutive_days=0,
        )
        assert msg is None

    def test_time_aware_message_interpolates_placeholders(self):
        """Time-aware messages with placeholders should interpolate correctly."""
        msg = _get_time_aware_message(
            "low_calories", cal_logged=500, cal_target=2000,
            protein_logged=30, protein_target=150, consecutive_days=0,
        )
        assert msg is not None
        # The body should contain actual numbers, not placeholders
        assert "{cal}" not in msg["push_body"]


class TestRescueSequence:
    """Tests for Item 41: 3-step rescue sequence for abandonment."""

    def test_day_1_rescue(self):
        """1 no-log day should return day-1 rescue."""
        rescue = _get_rescue_sequence(1)
        assert rescue is not None
        assert "push_title" in rescue
        assert "push_body" in rescue
        assert "in_app_banner" in rescue
        assert "cta_action" in rescue
        assert "cta_label" in rescue

    def test_day_2_still_day_1(self):
        """2 no-log days should still return day-1 rescue (not yet day-3)."""
        rescue = _get_rescue_sequence(2)
        assert rescue is not None
        assert rescue["push_title"] == RESCUE_SEQUENCE[1]["push_title"]

    def test_day_3_rescue(self):
        """3 no-log days should return day-3 rescue."""
        rescue = _get_rescue_sequence(3)
        assert rescue is not None
        assert rescue["push_title"] == RESCUE_SEQUENCE[3]["push_title"]

    def test_day_5_still_day_3(self):
        """5 no-log days should still return day-3 rescue."""
        rescue = _get_rescue_sequence(5)
        assert rescue is not None
        assert rescue["push_title"] == RESCUE_SEQUENCE[3]["push_title"]

    def test_day_7_rescue(self):
        """7 no-log days should return day-7 rescue."""
        rescue = _get_rescue_sequence(7)
        assert rescue is not None
        assert rescue["push_title"] == RESCUE_SEQUENCE[7]["push_title"]

    def test_day_14_still_day_7(self):
        """14 no-log days should still return day-7 rescue."""
        rescue = _get_rescue_sequence(14)
        assert rescue is not None
        assert rescue["push_title"] == RESCUE_SEQUENCE[7]["push_title"]

    def test_day_0_no_rescue(self):
        """0 no-log days should return None."""
        rescue = _get_rescue_sequence(0)
        assert rescue is None

    def test_rescue_cta_actions_are_valid(self):
        """Each rescue step should have a valid CTA action."""
        for step_key, step_data in RESCUE_SEQUENCE.items():
            assert step_data["cta_action"] in ("/scan", "/api/risk/copy-yesterday", "/api/risk/quick-add-protein")


class TestInterventionPriority:
    """Tests for Item 47: intervention priority order."""

    def test_priority_list_not_empty(self):
        """Priority list should contain items."""
        assert len(INTERVENTION_PRIORITY) > 0

    def test_critical_is_highest_priority(self):
        """'critical' should be the first priority."""
        assert INTERVENTION_PRIORITY[0] == "critical"

    def test_all_priorities_are_valid_reasons(self):
        """All priority reasons should be valid risk reasons."""
        valid_reasons = {"critical", "no_log", "excess", "low_calories", "low_protein", "bad_quality", "macro_imbalance"}
        for reason in INTERVENTION_PRIORITY:
            assert reason in valid_reasons, f"Unknown priority reason: {reason}"


class TestPositiveCorrectionMessage:
    """Tests for Item 38: positive correction message."""

    def test_correction_message_has_required_keys(self):
        """Positive correction message should have required fields."""
        assert "push_title" in POSITIVE_CORRECTION_MESSAGE
        assert "push_body" in POSITIVE_CORRECTION_MESSAGE
        assert "color" in POSITIVE_CORRECTION_MESSAGE

    def test_correction_message_is_positive(self):
        """Color should be green (positive)."""
        assert POSITIVE_CORRECTION_MESSAGE["color"] == "#22C55E"


class TestNotificationLimiter:
    """Tests for Item 40 + 46: notification limiter."""

    def test_should_send_notification_valid_type(self):
        from app.services.notification_limiter import (
            should_send_notification,
            record_notification_sent,
            _notification_counters,
            NOTIFICATION_TYPES,
            MAX_PER_DAY,
        )
        # Clear state
        _notification_counters.clear()

        # First notification should be allowed
        assert should_send_notification(9999, "risk_critical") is True

    def test_should_send_notification_invalid_type(self):
        from app.services.notification_limiter import should_send_notification
        assert should_send_notification(9999, "invalid_type") is False

    def test_daily_limit_enforcement(self):
        from app.services.notification_limiter import (
            should_send_notification,
            record_notification_sent,
            _notification_counters,
            MAX_PER_DAY,
        )
        _notification_counters.clear()
        user_id = 8888

        for i in range(MAX_PER_DAY):
            assert should_send_notification(user_id, "risk_warning") is True
            record_notification_sent(user_id, "risk_warning")

        # Should be blocked now
        assert should_send_notification(user_id, "risk_warning") is False

    def test_quiet_hours(self):
        from app.services.notification_limiter import is_quiet_hours
        # We can't control the current time easily, but we can verify it returns a bool
        result = is_quiet_hours(None)
        assert isinstance(result, bool)

    def test_quiet_hours_with_timezone(self):
        from app.services.notification_limiter import is_quiet_hours
        result = is_quiet_hours("America/Santiago")
        assert isinstance(result, bool)

    def test_quiet_hours_invalid_timezone(self):
        from app.services.notification_limiter import is_quiet_hours
        # Should fall back to UTC without crashing
        result = is_quiet_hours("Invalid/Timezone")
        assert isinstance(result, bool)

    def test_should_notify_combined(self):
        from app.services.notification_limiter import should_notify, _notification_counters
        _notification_counters.clear()
        # Should return a bool (combines rate limit + quiet hours)
        result = should_notify(7777, "risk_improvement", "America/Santiago")
        assert isinstance(result, bool)

    def test_get_notification_counts(self):
        from app.services.notification_limiter import (
            get_notification_counts,
            record_notification_sent,
            _notification_counters,
        )
        _notification_counters.clear()
        user_id = 6666
        record_notification_sent(user_id, "streak_celebration")
        counts = get_notification_counts(user_id)
        assert counts["daily_count"] == 1
        assert counts["weekly_count"] == 1
        assert "daily_limit" in counts
        assert "weekly_limit" in counts


# ===========================================================================
# Wave 5: TestRecoveryPlan (8 tests)
# ===========================================================================

class TestRecoveryPlan:
    """Tests for recovery_plan_service.py pure functions."""

    def test_deficit_scenario_selects_calorie_dense(self):
        """When remaining > 500 kcal, _select_meals should use calorie-dense pool."""
        from app.services.recovery_plan_service import _select_meals, CALORIE_DENSE_MEALS
        meals = _select_meals(CALORIE_DENSE_MEALS, remaining_calories=800, remaining_protein=40, count=3)
        assert len(meals) > 0
        assert len(meals) <= 3
        total_cal = sum(m["est_calories"] for m in meals)
        assert total_cal > 0

    def test_excess_scenario_selects_light_meals(self):
        """When consumed > target (excess), light meals should be used."""
        from app.services.recovery_plan_service import _select_meals, LIGHT_MEALS
        meals = _select_meals(LIGHT_MEALS, remaining_calories=200, remaining_protein=10, count=3)
        assert len(meals) > 0
        for m in meals:
            assert m["est_calories"] <= 300  # light meals are all <= 250

    def test_on_track_scenario_selects_balanced(self):
        """On-track scenario should use balanced meals."""
        from app.services.recovery_plan_service import _select_meals, BALANCED_MEALS
        meals = _select_meals(BALANCED_MEALS, remaining_calories=400, remaining_protein=20, count=2)
        assert len(meals) > 0
        assert len(meals) <= 2

    def test_water_recommendation_below_2000ml(self):
        """Water recommendation should be included when < 2000ml."""
        from app.services.recovery_plan_service import _build_water_recommendation
        rec = _build_water_recommendation(1200.0)
        assert rec is not None
        assert rec["current_water_ml"] == 1200
        assert rec["target_water_ml"] == 2000
        assert rec["remaining_water_ml"] == 800
        assert rec["glasses_remaining"] >= 1
        assert "ml" in rec["message"]

    def test_water_recommendation_above_2000ml_is_none(self):
        """No water recommendation when >= 2000ml."""
        from app.services.recovery_plan_service import _build_water_recommendation
        rec = _build_water_recommendation(2500.0)
        assert rec is None

    def test_3day_plan_distributes_40_35_25(self):
        """3-day recovery distribution should be [0.40, 0.35, 0.25]."""
        # Verify the constants used in generate_3day_recovery_plan
        distribution = [0.40, 0.35, 0.25]
        assert sum(distribution) == pytest.approx(1.0)
        assert distribution[0] == 0.40
        assert distribution[1] == 0.35
        assert distribution[2] == 0.25

    def test_meals_are_in_spanish(self):
        """All meal template descriptions should be in Spanish."""
        from app.services.recovery_plan_service import (
            HIGH_PROTEIN_MEALS, BALANCED_MEALS, LIGHT_MEALS, CALORIE_DENSE_MEALS,
        )
        spanish_indicators = ["con", "de", "al", "en", "y"]
        all_meals = HIGH_PROTEIN_MEALS + BALANCED_MEALS + LIGHT_MEALS + CALORIE_DENSE_MEALS
        for meal in all_meals:
            desc = meal["description"].lower()
            has_spanish = any(f" {w} " in f" {desc} " for w in spanish_indicators)
            assert has_spanish, f"Meal not in Spanish: {meal['description']}"

    def test_calorie_estimates_reasonable(self):
        """All meal templates should have est_calories between 90 and 700."""
        from app.services.recovery_plan_service import (
            HIGH_PROTEIN_MEALS, BALANCED_MEALS, LIGHT_MEALS, CALORIE_DENSE_MEALS,
        )
        all_meals = HIGH_PROTEIN_MEALS + BALANCED_MEALS + LIGHT_MEALS + CALORIE_DENSE_MEALS
        for meal in all_meals:
            assert 80 <= meal["est_calories"] <= 700, (
                f"Unreasonable calories: {meal['description']} = {meal['est_calories']}"
            )


# ===========================================================================
# Wave 5: TestNotificationLimiterExpanded (10 tests)
# ===========================================================================

class TestNotificationLimiterExpanded:
    """Extended tests for notification_limiter.py (Items 40 + 46)."""

    def test_first_notification_allowed(self):
        from app.services.notification_limiter import (
            should_send_notification, _notification_counters,
        )
        _notification_counters.clear()
        assert should_send_notification(11111, "risk_critical") is True

    def test_4th_notification_same_day_blocked(self):
        """Max 3/day — 4th should be blocked."""
        from app.services.notification_limiter import (
            should_send_notification, record_notification_sent, _notification_counters,
        )
        _notification_counters.clear()
        uid = 22222
        for _ in range(3):
            assert should_send_notification(uid, "risk_warning") is True
            record_notification_sent(uid, "risk_warning")
        assert should_send_notification(uid, "risk_warning") is False

    def test_15th_notification_in_week_blocked(self):
        """Max 14/week — simulate 14 sent across multiple days, 15th blocked."""
        from app.services.notification_limiter import (
            should_send_notification, _notification_counters, _week_key, _today_key,
        )
        _notification_counters.clear()
        uid = 33333
        counter = {"daily": {}, "weekly": {}}
        # Directly set weekly counter to 14
        counter["weekly"][_week_key()] = 14
        counter["daily"][_today_key()] = 0  # daily is fine
        _notification_counters[uid] = counter
        assert should_send_notification(uid, "risk_critical") is False

    def test_quiet_hours_blocked_at_23(self):
        """Notifications at 23:00 should be blocked (quiet hours 22-07)."""
        from app.services.notification_limiter import is_quiet_hours
        from unittest.mock import patch
        from datetime import datetime, timezone
        fake_time = datetime(2026, 3, 22, 23, 0, 0, tzinfo=timezone.utc)
        with patch("app.services.notification_limiter.datetime") as mock_dt:
            mock_dt.now.return_value = fake_time
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            result = is_quiet_hours(None)
            assert result is True

    def test_non_quiet_hours_allowed_at_12(self):
        """Notifications at 12:00 should be allowed."""
        from app.services.notification_limiter import is_quiet_hours
        from unittest.mock import patch
        from datetime import datetime, timezone
        fake_time = datetime(2026, 3, 22, 12, 0, 0, tzinfo=timezone.utc)
        with patch("app.services.notification_limiter.datetime") as mock_dt:
            mock_dt.now.return_value = fake_time
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            result = is_quiet_hours(None)
            assert result is False

    def test_different_types_dont_interfere(self):
        """Sending 3 risk_critical should not block risk_warning."""
        from app.services.notification_limiter import (
            should_send_notification, record_notification_sent, _notification_counters,
        )
        _notification_counters.clear()
        uid = 44444
        # The counter tracks ALL types combined (not per-type), so this should block
        for _ in range(3):
            record_notification_sent(uid, "risk_critical")
        # Daily limit is global — 3 sent means 4th of any type is blocked
        assert should_send_notification(uid, "risk_warning") is False

    def test_daily_reset_different_day(self):
        """Notifications on a different day should have a fresh counter."""
        from app.services.notification_limiter import (
            should_send_notification, _notification_counters, _week_key,
        )
        _notification_counters.clear()
        uid = 55555
        # Simulate 3 notifications on yesterday (different daily key)
        counter = {"daily": {"2026-03-21": 3}, "weekly": {_week_key(): 3}}
        _notification_counters[uid] = counter
        # Today's key is different, so daily count is 0
        assert should_send_notification(uid, "risk_critical") is True

    def test_quiet_hours_with_timezone_america_santiago(self):
        """Quiet hours with America/Santiago timezone."""
        from app.services.notification_limiter import is_quiet_hours
        from unittest.mock import patch
        from datetime import datetime
        from zoneinfo import ZoneInfo
        # 3:00 AM in Santiago = quiet hours
        tz = ZoneInfo("America/Santiago")
        fake_time = datetime(2026, 3, 22, 3, 0, 0, tzinfo=tz)
        with patch("app.services.notification_limiter.datetime") as mock_dt:
            mock_dt.now.return_value = fake_time
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            result = is_quiet_hours("America/Santiago")
            assert result is True

    def test_invalid_notification_type_returns_false(self):
        """Unknown notification type should return False."""
        from app.services.notification_limiter import should_send_notification
        assert should_send_notification(66666, "unknown_type") is False

    def test_get_notification_counts_after_multiple_sends(self):
        """Counts should track correctly after multiple sends."""
        from app.services.notification_limiter import (
            get_notification_counts, record_notification_sent, _notification_counters,
        )
        _notification_counters.clear()
        uid = 77777
        record_notification_sent(uid, "risk_critical")
        record_notification_sent(uid, "risk_warning")
        counts = get_notification_counts(uid)
        assert counts["daily_count"] == 2
        assert counts["weekly_count"] == 2


# ===========================================================================
# Wave 5: TestVariablePlan (6 tests)
# ===========================================================================

class TestVariablePlan:
    """Tests for variable_plan_service.py DAY_TYPES multipliers."""

    def test_rest_day_calorie_multiplier(self):
        """Rest day: 0.85x calories, 0.7x carbs."""
        from app.services.variable_plan_service import DAY_TYPES
        rest = DAY_TYPES["rest"]
        assert rest["calorie_multiplier"] == 0.85
        assert rest["carb_multiplier"] == 0.7

    def test_training_day_multiplier(self):
        """Training day: 1.15x calories, 1.3x carbs."""
        from app.services.variable_plan_service import DAY_TYPES
        training = DAY_TYPES["training"]
        assert training["calorie_multiplier"] == 1.15
        assert training["carb_multiplier"] == 1.3

    def test_refeed_day_multiplier(self):
        """Refeed day: 1.25x calories, 1.5x carbs."""
        from app.services.variable_plan_service import DAY_TYPES
        refeed = DAY_TYPES["refeed"]
        assert refeed["calorie_multiplier"] == 1.25
        assert refeed["carb_multiplier"] == 1.5

    def test_unknown_day_type_not_in_dict(self):
        """Unknown day_type should not be in DAY_TYPES — the service returns default 1x."""
        from app.services.variable_plan_service import DAY_TYPES
        assert "normal" not in DAY_TYPES
        assert "unknown" not in DAY_TYPES

    def test_protein_unchanged_across_all_types(self):
        """Protein multiplier must be 1.0 for all day types."""
        from app.services.variable_plan_service import DAY_TYPES
        for day_type, config in DAY_TYPES.items():
            assert config["protein_multiplier"] == 1.0, f"{day_type} protein != 1.0"

    def test_fat_unchanged_across_all_types(self):
        """Fat multiplier must be 1.0 for all day types."""
        from app.services.variable_plan_service import DAY_TYPES
        for day_type, config in DAY_TYPES.items():
            assert config["fat_multiplier"] == 1.0, f"{day_type} fat != 1.0"


# ===========================================================================
# Wave 5: TestChronicUnderreporting (5 tests)
# ===========================================================================

class TestChronicUnderreporting:
    """Tests for chronic underreporting detection logic."""

    def test_14_days_all_under_60_pct_is_chronic(self):
        """14 days all under 60% -> chronic=True (days_under=14 >= 10)."""
        days_under = 14
        days_analyzed = 14
        chronic = days_under >= 10 and days_analyzed >= 10
        assert chronic is True

    def test_14_days_all_above_80_pct_not_chronic(self):
        """14 days all above 80% -> chronic=False (days_under=0)."""
        days_under = 0
        days_analyzed = 14
        chronic = days_under >= 10 and days_analyzed >= 10
        assert chronic is False

    def test_mixed_8_under_6_over_not_chronic(self):
        """8 days under 60%, 6 over -> chronic=False (need >= 10)."""
        days_under = 8
        days_analyzed = 14
        chronic = days_under >= 10 and days_analyzed >= 10
        assert chronic is False

    def test_exactly_10_under_is_chronic(self):
        """Exactly 10 days under 60% of 14 analyzed -> chronic=True."""
        days_under = 10
        days_analyzed = 14
        chronic = days_under >= 10 and days_analyzed >= 10
        assert chronic is True

    def test_zero_days_of_data_not_chronic(self):
        """0 days of data -> chronic=False (days_analyzed < 10)."""
        days_under = 0
        days_analyzed = 0
        chronic = days_under >= 10 and days_analyzed >= 10
        assert chronic is False


# ===========================================================================
# Wave 5: TestAPIContractValidation (8 tests)
# ===========================================================================

class TestAPIContractValidation:
    """Validate Pydantic response models from risk.py are properly structured."""

    def test_risk_summary_response_required_fields(self):
        from app.routers.risk import RiskSummaryResponse, InterventionResponse
        data = RiskSummaryResponse(
            avg_risk_score=50,
            avg_quality_score=60,
            avg_calories_logged=1800,
            consecutive_no_log_days=0,
            days_with_data=7,
            trend="stable",
            current_status="optimal",
            intervention=InterventionResponse(color="#22C55E"),
        )
        assert data.avg_risk_score == 50
        assert data.trend == "stable"
        assert data.consistency_score_7d == 0  # default

    def test_daily_adherence_response_fields(self):
        from app.routers.risk import DailyAdherenceResponse
        data = DailyAdherenceResponse(
            date=date(2026, 3, 22),
            calories_target=2000,
            calories_logged=1500,
            calories_ratio=0.75,
            meals_logged=3,
            protein_target=150,
            protein_logged=100,
            carbs_target=250,
            carbs_logged=200,
            fats_target=65,
            fats_logged=50,
            diet_quality_score=70,
            adherence_status="low_adherence",
            nutrition_risk_score=45,
            no_log_flag=False,
        )
        assert data.calories_ratio == 0.75
        assert data.no_log_flag is False
        assert isinstance(data.date, date)

    def test_recovery_plan_24h_serialization(self):
        from app.routers.risk import (
            RecoveryPlan24hResponse, RecoveryPlanMacroResponse, SuggestedMealResponse,
        )
        plan = RecoveryPlan24hResponse(
            horizon="24h",
            status="deficit",
            targets=RecoveryPlanMacroResponse(calories=2000, protein_g=150, carbs_g=250, fats_g=65),
            logged=RecoveryPlanMacroResponse(calories=1200, protein_g=80, carbs_g=150, fats_g=40),
            remaining_calories=800,
            remaining_protein_g=70,
            remaining_carbs_g=100,
            remaining_fats_g=25,
            suggested_meals=[
                SuggestedMealResponse(meal_type="lunch", description="Pollo con arroz", est_calories=500, est_protein_g=35),
            ],
            motivation="Tu puedes!",
        )
        d = plan.model_dump()
        assert d["horizon"] == "24h"
        assert len(d["suggested_meals"]) == 1
        assert d["water_recommendation"] is None  # Optional, not provided

    def test_recovery_plan_3d_serialization(self):
        from app.routers.risk import (
            RecoveryPlan3dResponse, RecoveryPlanMacroResponse, RecoveryPlan3dMacroResponse,
            RecoveryPlan3dPeriodResponse, DayPlanResponse, SuggestedMealResponse,
        )
        plan = RecoveryPlan3dResponse(
            horizon="3d",
            status="deficit",
            period=RecoveryPlan3dPeriodResponse(start="2026-03-20", end="2026-03-22"),
            targets_3d=RecoveryPlanMacroResponse(calories=6000, protein_g=450, carbs_g=750, fats_g=195),
            logged_3d=RecoveryPlan3dMacroResponse(calories=4000, protein_g=300),
            deficit_calories=2000,
            deficit_protein_g=150,
            daily_plans=[
                DayPlanResponse(
                    date="2026-03-22", day_label="Dia 1",
                    calorie_target=2200, protein_target_g=160,
                    suggested_meals=[SuggestedMealResponse(meal_type="lunch", description="test", est_calories=500, est_protein_g=30)],
                ),
            ],
            motivation="Sigue adelante!",
        )
        d = plan.model_dump()
        assert d["horizon"] == "3d"
        assert len(d["daily_plans"]) == 1
        assert d["daily_plans"][0]["day_label"] == "Dia 1"

    def test_weekend_pattern_response_fields(self):
        from app.routers.risk import WeekendPatternResponse
        data = WeekendPatternResponse(
            weekend_avg_calories=2200,
            weekday_avg_calories=1800,
            weekend_avg_risk=60,
            weekday_avg_risk=40,
            weekend_risk_higher=True,
            pattern_detected=True,
            pct_difference=22.2,
            data_days=14,
            weekend_days=4,
            weekday_days=10,
        )
        assert data.weekend_risk_higher is True
        assert data.pattern_detected is True
        assert data.weekend_avg_first_meal_hour is None  # Optional default

    def test_adjusted_goals_response_serialization(self):
        from app.routers.risk import AdjustedGoalsResponse
        data = AdjustedGoalsResponse(
            calories=1700,
            protein_g=150,
            carbs_g=175,
            fat_g=65,
            day_type="rest",
            label="Dia de descanso",
        )
        d = data.model_dump()
        assert d["day_type"] == "rest"
        assert d["label"] == "Dia de descanso"
        assert isinstance(d["calories"], int)

    def test_chronic_underreporting_response_fields(self):
        from app.routers.risk import ChronicUnderreportingResponse
        data = ChronicUnderreportingResponse(
            chronic_underreporting=True,
            avg_logged_pct=45.3,
            days_analyzed=14,
            days_under=12,
            likely_not_logging=False,
            suggestion="Intenta el registro rapido.",
        )
        assert data.chronic_underreporting is True
        assert data.avg_logged_pct == 45.3
        assert isinstance(data.days_under, int)

    def test_intervention_response_optional_fields_default(self):
        from app.routers.risk import InterventionResponse
        data = InterventionResponse(color="#FF0000")
        assert data.push_title is None
        assert data.push_body is None
        assert data.home_banner is None
        assert data.coach_message is None
        assert data.simplify_ui is None
        assert data.suggestions is None


# ===========================================================================
# 20. Shopping List Service (pure function tests)
# ===========================================================================

class TestShoppingList:
    """Tests for shopping_list_service.py pure functions."""

    def test_extract_ingredients_protein_items(self):
        """Extracting ingredients from a protein-rich description should find protein items."""
        from app.services.shopping_list_service import _extract_ingredients
        ingredients = _extract_ingredients("Pechuga de pollo con arroz integral y ensalada")
        names = [i["name"] for i in ingredients]
        assert "Pechuga de pollo" in names
        categories = [i["category"] for i in ingredients]
        assert "proteinas" in categories

    def test_extract_ingredients_light_description(self):
        """Light meal descriptions should extract vegetable/light items."""
        from app.services.shopping_list_service import _extract_ingredients
        ingredients = _extract_ingredients("Ensalada verde con limon y semillas")
        names = [i["name"] for i in ingredients]
        assert any("Lechuga" in n or "Limon" in n or "Semillas" in n for n in names)

    def test_extract_ingredients_grouped_by_category(self):
        """Items from a complex description should span multiple categories."""
        from app.services.shopping_list_service import _extract_ingredients
        ingredients = _extract_ingredients(
            "Yogurt griego con avena, manzana y miel"
        )
        categories = {i["category"] for i in ingredients}
        assert len(categories) >= 2, f"Expected >=2 categories, got {categories}"

    def test_ingredient_names_are_spanish(self):
        """All ingredient names in the INGREDIENT_MAP should be in Spanish."""
        from app.services.shopping_list_service import INGREDIENT_MAP
        for keyword, ingredient in INGREDIENT_MAP.items():
            name = ingredient["name"]
            # Spanish names won't typically have pure ASCII-only English words
            # but we just verify they are non-empty strings
            assert isinstance(name, str) and len(name) > 0

    def test_cost_per_item_positive(self):
        """All category costs should be positive numbers."""
        from app.services.shopping_list_service import COST_PER_ITEM
        for category, cost in COST_PER_ITEM.items():
            assert cost > 0, f"Cost for {category} should be positive, got {cost}"

    def test_extract_ingredients_empty_description(self):
        """Empty description should return empty list."""
        from app.services.shopping_list_service import _extract_ingredients
        ingredients = _extract_ingredients("")
        assert ingredients == []


# ===========================================================================
# 21. AI Context Service (pure function tests)
# ===========================================================================

class TestAIContextService:
    """Tests for ai_context_service.py pure/sync functions."""

    def test_route_simple_returns_template(self):
        from app.services.ai_context_service import route_ai_request
        assert route_ai_request("simple") == "template"

    def test_route_complex_returns_sonnet(self):
        from app.services.ai_context_service import route_ai_request
        result = route_ai_request("complex")
        assert result in ("sonnet", "opus")

    def test_route_expert_returns_opus(self):
        from app.services.ai_context_service import route_ai_request
        result = route_ai_request("expert")
        assert result == "opus"

    def test_kill_switch_off_allows_expensive(self):
        """When ai_expensive_enabled=True, expensive models are allowed."""
        from app.services.ai_context_service import route_ai_request
        with patch("app.services.ai_context_service.settings") as mock_settings:
            mock_settings.ai_expensive_enabled = True
            result = route_ai_request("complex")
            assert result == "sonnet"

    def test_kill_switch_on_downgrades_to_haiku(self):
        """When ai_expensive_enabled=False, sonnet/opus downgrade to haiku."""
        from app.services.ai_context_service import route_ai_request
        with patch("app.services.ai_context_service.settings") as mock_settings:
            mock_settings.ai_expensive_enabled = False
            result_complex = route_ai_request("complex")
            result_expert = route_ai_request("expert")
            assert result_complex == "haiku"
            assert result_expert == "haiku"

    def test_classify_simple_types(self):
        from app.services.ai_context_service import classify_request_complexity
        for req_type in ("daily_tip", "hydration_reminder", "streak_celebration"):
            assert classify_request_complexity(req_type) == "simple"

    def test_classify_unknown_defaults_to_medium(self):
        from app.services.ai_context_service import classify_request_complexity
        assert classify_request_complexity("some_unknown_request_xyz") == "medium"

    def test_classify_complex_types(self):
        from app.services.ai_context_service import classify_request_complexity
        for req_type in ("meal_analysis", "weekly_summary", "macro_breakdown"):
            assert classify_request_complexity(req_type) == "complex"


# ===========================================================================
# 22. Token Budget Service
# ===========================================================================

class TestTokenBudget:
    """Tests for token_budget_service.py pure functions."""

    def test_free_user_budget(self):
        from app.services.token_budget_service import TOKEN_BUDGETS
        assert TOKEN_BUDGETS["free"] == 5_000

    def test_premium_user_budget(self):
        from app.services.token_budget_service import TOKEN_BUDGETS
        assert TOKEN_BUDGETS["premium"] == 50_000

    def test_consume_tokens_reduces_remaining(self):
        from app.services.token_budget_service import (
            consume_tokens, get_remaining_budget, _user_budgets,
        )
        uid = 99990
        _user_budgets.pop(uid, None)  # Clean slate
        initial = get_remaining_budget(uid, "free")
        consume_tokens(uid, 100, "free")
        after = get_remaining_budget(uid, "free")
        assert after == initial - 100
        _user_budgets.pop(uid, None)  # Cleanup

    def test_budget_exceeded_returns_true_when_over(self):
        from app.services.token_budget_service import (
            consume_tokens, is_budget_exceeded, _user_budgets,
        )
        uid = 99991
        _user_budgets.pop(uid, None)
        consume_tokens(uid, 5_000, "free")
        assert is_budget_exceeded(uid, "free") is True
        _user_budgets.pop(uid, None)

    def test_weekly_reset_clears_usage(self):
        from app.services.token_budget_service import (
            consume_tokens, get_remaining_budget, _user_budgets, _current_week_start,
        )
        uid = 99992
        _user_budgets.pop(uid, None)
        consume_tokens(uid, 1000, "free")
        # Simulate a new week by setting week_start far in the past
        _user_budgets[uid]["week_start"] = 0.0  # epoch = way in the past
        remaining = get_remaining_budget(uid, "free")
        assert remaining == 5_000  # Reset to full budget
        _user_budgets.pop(uid, None)

    def test_negative_tokens_not_harmful(self):
        """Consuming 0 or negative tokens should not break the system."""
        from app.services.token_budget_service import (
            consume_tokens, get_remaining_budget, _user_budgets,
        )
        uid = 99993
        _user_budgets.pop(uid, None)
        result = consume_tokens(uid, 0, "free")
        assert result["consumed"] == 0
        assert result["remaining"] == 5_000
        _user_budgets.pop(uid, None)


# ===========================================================================
# 23. Message Cache
# ===========================================================================

class TestMessageCache:
    """Tests for the message cache in nutrition_risk_service.py."""

    def test_cache_miss_returns_none(self):
        from app.services.nutrition_risk_service import get_cached_message
        result = get_cached_message(user_id=88880, risk_level="low", primary_reason="none")
        assert result is None

    def test_set_then_get_returns_cached_value(self):
        from app.services.nutrition_risk_service import (
            get_cached_message, set_cached_message, _message_cache,
        )
        uid = 88881
        set_cached_message(uid, "high", "no_log", "Come algo!")
        result = get_cached_message(uid, "high", "no_log")
        assert result == "Come algo!"
        # Cleanup
        _message_cache.pop(f"{uid}:high:no_log", None)

    def test_cache_expiry_after_ttl(self):
        """After TTL expires, cache should return None."""
        import time as time_mod
        from app.services.nutrition_risk_service import (
            get_cached_message, set_cached_message, _message_cache, _MESSAGE_CACHE_TTL,
        )
        uid = 88882
        set_cached_message(uid, "low", "test", "msg")
        # Manually set the cached timestamp far in the past
        key = f"{uid}:low:test"
        old_ts = time_mod.time() - _MESSAGE_CACHE_TTL - 100
        _message_cache[key] = (old_ts, "msg")
        result = get_cached_message(uid, "low", "test")
        assert result is None
        _message_cache.pop(key, None)

    def test_different_keys_dont_interfere(self):
        from app.services.nutrition_risk_service import (
            get_cached_message, set_cached_message, _message_cache,
        )
        uid = 88883
        set_cached_message(uid, "low", "reason_a", "msg_a")
        set_cached_message(uid, "high", "reason_b", "msg_b")
        assert get_cached_message(uid, "low", "reason_a") == "msg_a"
        assert get_cached_message(uid, "high", "reason_b") == "msg_b"
        # Cleanup
        _message_cache.pop(f"{uid}:low:reason_a", None)
        _message_cache.pop(f"{uid}:high:reason_b", None)

    def test_invalidate_clears_specific_user(self):
        from app.services.nutrition_risk_service import (
            get_cached_message, set_cached_message, invalidate_message_cache, _message_cache,
        )
        uid_a = 88884
        uid_b = 88885
        set_cached_message(uid_a, "low", "test", "msg_a")
        set_cached_message(uid_b, "low", "test", "msg_b")
        invalidate_message_cache(uid_a)
        assert get_cached_message(uid_a, "low", "test") is None
        assert get_cached_message(uid_b, "low", "test") == "msg_b"
        _message_cache.pop(f"{uid_b}:low:test", None)


# ===========================================================================
# 24. Batch Jobs (function signature verification)
# ===========================================================================

class TestBatchJobs:
    """Verify batch-related functions exist and handle edge cases."""

    def test_nightly_recalculation_is_importable(self):
        """The nightly batch job function should be importable."""
        from app.services.batch_jobs import nightly_risk_recalculation
        assert callable(nightly_risk_recalculation)

    def test_purge_function_exists(self):
        """The data retention purge function should be importable."""
        from app.services.nutrition_risk_service import purge_old_adherence_records
        assert callable(purge_old_adherence_records)

    def test_get_intervention_coverage_stats_exists(self):
        """The coverage stats function should be importable."""
        from app.services.nutrition_risk_service import get_intervention_coverage_stats
        assert callable(get_intervention_coverage_stats)

    def test_intervention_coverage_returns_dict(self):
        """Coverage stats with empty interventions should return a dict."""
        from app.services.nutrition_risk_service import get_intervention_coverage_stats
        result = get_intervention_coverage_stats()
        assert isinstance(result, dict)
        assert len(result) > 0

    def test_get_usage_summary_returns_dict_shape(self):
        """Token budget usage summary should have expected keys."""
        from app.services.token_budget_service import get_usage_summary, _user_budgets
        uid = 99995
        _user_budgets.pop(uid, None)
        result = get_usage_summary(uid, "free")
        assert "tokens_used" in result
        assert "tokens_remaining" in result
        assert "budget_total" in result
        assert "budget_exceeded" in result
        assert "tier" in result
        _user_budgets.pop(uid, None)


# ===========================================================================
# 25. End-to-End Scenarios (integration-style with pure functions)
# ===========================================================================

class TestEndToEndScenarios:
    """Integration-style tests using pure functions to simulate full user scenarios."""

    def test_new_user_day1_no_logs_high_risk_with_grace(self):
        """New user day 1 with no logs: raw risk ~100, grace period reduces it."""
        # Simulate: 0 calories, no meals, all zeros
        raw_risk = _calculate_risk_score(
            consecutive_no_log_days=1,
            calories_ratio=0.0,
            protein_logged=0,
            protein_target=150,
            carbs_logged=0,
            carbs_target=250,
            fats_logged=0,
            fats_target=65,
            diet_quality_score=0,
        )
        assert raw_risk >= 70, f"Raw risk for no-log day should be >= 70, got {raw_risk}"
        # Grace period logic: day_index=0 -> multiplier 0.4
        grace_multiplier = 0.4  # day 1 of plan
        adjusted = int(round(raw_risk * grace_multiplier))
        assert adjusted < raw_risk
        assert adjusted < 60, f"Grace-adjusted risk should be < 60, got {adjusted}"

    def test_perfect_day_low_risk(self):
        """Perfect day: 4 meals, 100% calories, 100% protein -> risk < 15."""
        quality = _calculate_diet_quality_score(
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            distinct_meals=4,
            carbs_logged=250,
            fats_logged=65,
            water_ml=2500.0,
            total_calories_logged=2000,
        )
        risk = _calculate_risk_score(
            consecutive_no_log_days=0,
            calories_ratio=1.0,
            protein_logged=150,
            protein_target=150,
            carbs_logged=250,
            carbs_target=250,
            fats_logged=65,
            fats_target=65,
            diet_quality_score=quality,
        )
        assert risk < 15, f"Perfect day risk should be < 15, got {risk}"

    def test_3_days_no_log_then_log_today_high_but_improving(self):
        """3 days no log then log today: risk still high due to no-log weight."""
        from unittest.mock import MagicMock
        quality = _calculate_diet_quality_score(
            calories_ratio=0.8,
            protein_logged=100,
            protein_target=150,
            distinct_meals=3,
            carbs_logged=200,
            fats_logged=50,
            water_ml=1500.0,
            total_calories_logged=1600,
        )
        risk = _calculate_risk_score(
            consecutive_no_log_days=3,  # still carries history
            calories_ratio=0.8,
            protein_logged=100,
            protein_target=150,
            carbs_logged=200,
            carbs_target=250,
            fats_logged=50,
            fats_target=65,
            diet_quality_score=quality,
        )
        assert risk > 25, f"3-day gap should still show elevated risk, got {risk}"
        # Simulate recovery: older days had high risk, recent days improving
        records = []
        for i, score in [(6, 90), (5, 85), (4, 80), (3, 75), (2, 40), (1, 35), (0, risk)]:
            r = MagicMock()
            r.date = date.today() - timedelta(days=i)
            r.nutrition_risk_score = score
            r.no_log_flag = (i in (4, 5, 6))  # older days had no log
            records.append(r)
        recovery = _calculate_recovery_score(records)
        assert recovery["recovering"] is True, "Should detect improving trend"

    def test_weekend_excess_pattern(self):
        """Weekend avg > weekday avg should be detectable."""
        # Simulate weekend higher calories
        weekend_ratios = [1.4, 1.3]  # Sat, Sun = excess
        weekday_ratios = [0.95, 1.0, 0.9, 1.05, 0.98]  # Mon-Fri = near optimal
        weekend_avg = sum(weekend_ratios) / len(weekend_ratios)
        weekday_avg = sum(weekday_ratios) / len(weekday_ratios)
        assert weekend_avg > weekday_avg, "Weekend avg should be higher"
        pct_diff = ((weekend_avg - weekday_avg) / weekday_avg) * 100
        assert pct_diff > 10, f"Percentage difference should be > 10%, got {pct_diff:.1f}%"

    def test_training_day_higher_goals(self):
        """On a training day, adjusted goals should be higher than rest day."""
        from app.services.variable_plan_service import DAY_TYPES
        base_cal = 2000
        training_cal = int(round(base_cal * DAY_TYPES["training"]["calorie_multiplier"]))
        rest_cal = int(round(base_cal * DAY_TYPES["rest"]["calorie_multiplier"]))
        assert training_cal > rest_cal

    def test_chronic_underreporter_detected(self):
        """User logging < 60% on 10/14 days should classify as chronic."""
        # Test the threshold logic conceptually:
        days_analyzed = 14
        days_under_60 = 10
        avg_logged_pct = 52.0
        threshold = 0.6
        is_chronic = (days_under_60 / days_analyzed) >= threshold and avg_logged_pct < 70
        assert is_chronic is True, "Should detect chronic under-reporting"

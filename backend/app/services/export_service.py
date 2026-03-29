"""
Export Service
--------------
Generates executive-grade nutrition report PDFs and provides data-query helpers
for export endpoints.

PDF reports are produced using ReportLab with:
- 5-page professional layout
- Executive summary with key metrics dashboard
- Calorie analysis with bar charts and pie charts
- Macronutrient breakdown with progress bars
- Meal patterns and AI-generated insights
- Weight and body composition tracking

Also provides:
- get_daily_totals(): per-day aggregated nutrition data (reusable by router)
- get_food_logs_query(): base query builder with soft-delete filtering
"""

import io
import logging
import math
from collections import Counter, defaultdict
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.calorie_adjustment import WeightLog
from ..models.onboarding_profile import OnboardingProfile
from ..models.progress import UserProgressProfile
from ..models.user import User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Design constants
# ---------------------------------------------------------------------------
_DARK_BLUE = "#1A1A2E"
_ACCENT_BLUE = "#4285F4"
_LIGHT_BLUE = "#5B9CF6"
_GREEN = "#34A853"
_RED = "#EA4335"
_ORANGE = "#FBBC04"
_GRAY = "#666666"
_LIGHT_GRAY = "#E0E0E0"
_SURFACE = "#F5F5F5"
_WHITE = "#FFFFFF"
_PROTEIN_COLOR = "#4285F4"
_CARBS_COLOR = "#FBBC04"
_FATS_COLOR = "#EA4335"
_FIBER_COLOR = "#34A853"


# ---------------------------------------------------------------------------
# Reusable query helpers (used by both PDF generation and router endpoints)
# ---------------------------------------------------------------------------

async def get_user_export_profile(user_id: int, session: AsyncSession) -> dict:
    """Gather user profile + onboarding data for export/report headers.

    Returns a dict with name, email, goal, and daily macro targets plus
    physical stats for the report.
    Always filters by the given user_id to prevent cross-user data leaks.
    """
    result = await session.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    result = await session.execute(
        select(OnboardingProfile).where(
            OnboardingProfile.user_id == user_id,
            OnboardingProfile.deleted_at.is_(None),
        )
    )
    profile = result.scalar_one_or_none()

    # Streak from progress profile
    result = await session.execute(
        select(UserProgressProfile).where(
            UserProgressProfile.user_id == user_id,
        )
    )
    progress = result.scalars().first()

    # Calculate age from birth_date
    age = None
    if profile and profile.birth_date:
        today = date.today()
        age = today.year - profile.birth_date.year - (
            (today.month, today.day) < (profile.birth_date.month, profile.birth_date.day)
        )

    # Calculate BMI
    bmi = None
    if profile and profile.height_cm and profile.weight_kg and profile.height_cm > 0:
        height_m = profile.height_cm / 100.0
        bmi = round(profile.weight_kg / (height_m * height_m), 1)

    return {
        "name": f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email if user else "Usuario",
        "email": user.email if user else "",
        "goal": profile.goal if profile else "N/A",
        "target_calories": profile.daily_calories or 2000 if profile else 2000,
        "target_protein_g": profile.daily_protein_g or 150 if profile else 150,
        "target_carbs_g": profile.daily_carbs_g or 200 if profile else 200,
        "target_fats_g": profile.daily_fats_g or 65 if profile else 65,
        "height_cm": profile.height_cm if profile else None,
        "weight_kg": profile.weight_kg if profile else None,
        "target_weight_kg": profile.target_weight_kg if profile else None,
        "age": age,
        "bmi": bmi,
        "health_score": profile.health_score if profile else None,
        "current_streak": progress.current_streak_days if progress else 0,
        "best_streak": progress.best_streak_days if progress else 0,
        "gender": profile.gender if profile else None,
        "diet_type": profile.diet_type if profile else None,
    }


async def get_daily_totals(
    user_id: int,
    start_date: date,
    end_date: date,
    session: AsyncSession,
) -> list[dict]:
    """Get per-day nutrition totals for the date range.

    Excludes soft-deleted records.
    Returns a list of dicts with keys: date, calories, protein_g, carbs_g, fats_g,
    fiber_g, meals.
    """
    start_dt = datetime.combine(start_date, dt_time.min)
    end_dt = datetime.combine(end_date, dt_time.max)

    result = await session.execute(
        select(
            func.date(AIFoodLog.logged_at).label("log_date"),
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("protein_g"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0).label("carbs_g"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0).label("fats_g"),
            func.coalesce(func.sum(AIFoodLog.fiber_g), 0).label("fiber_g"),
            func.count(AIFoodLog.id).label("meals"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.deleted_at.is_(None),
            AIFoodLog.logged_at >= start_dt,
            AIFoodLog.logged_at <= end_dt,
        )
        .group_by(func.date(AIFoodLog.logged_at))
        .order_by(func.date(AIFoodLog.logged_at))
    )

    return [
        {
            "date": str(row.log_date),
            "calories": round(float(row.calories), 1),
            "protein_g": round(float(row.protein_g), 1),
            "carbs_g": round(float(row.carbs_g), 1),
            "fats_g": round(float(row.fats_g), 1),
            "fiber_g": round(float(row.fiber_g), 1),
            "meals": row.meals,
        }
        for row in result.all()
    ]


async def get_food_log_rows(
    user_id: int,
    start_date: date,
    end_date: date,
    session: AsyncSession,
    limit: int = 500,
) -> list[dict]:
    """Get individual food log entries for the report.

    Excludes soft-deleted records. Returns up to `limit` rows, newest first.
    Includes full detail for analysis.
    """
    start_dt = datetime.combine(start_date, dt_time.min)
    end_dt = datetime.combine(end_date, dt_time.max)

    result = await session.execute(
        select(AIFoodLog)
        .where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.deleted_at.is_(None),
            AIFoodLog.logged_at >= start_dt,
            AIFoodLog.logged_at <= end_dt,
        )
        .order_by(AIFoodLog.logged_at.desc())
        .limit(limit)
    )

    rows = []
    for log in result.scalars().all():
        food_name = log.food_name or ""
        rows.append({
            "date": log.logged_at.strftime("%Y-%m-%d") if log.logged_at else "",
            "time": log.logged_at.strftime("%H:%M") if log.logged_at else "",
            "hour": log.logged_at.hour if log.logged_at else 0,
            "weekday": log.logged_at.weekday() if log.logged_at else 0,  # 0=Mon, 6=Sun
            "meal_type": log.meal_type or "",
            "food_name": food_name,
            "food_name_short": food_name[:30] + "..." if len(food_name) > 30 else food_name,
            "calories": round(log.calories, 0) if log.calories is not None else 0,
            "protein_g": round(log.protein_g, 1) if log.protein_g is not None else 0,
            "carbs_g": round(log.carbs_g, 1) if log.carbs_g is not None else 0,
            "fats_g": round(log.fats_g, 1) if log.fats_g is not None else 0,
            "fiber_g": round(log.fiber_g, 1) if log.fiber_g is not None else 0,
        })
    return rows


async def get_weight_history(
    user_id: int,
    start_date: date,
    end_date: date,
    session: AsyncSession,
) -> list[dict]:
    """Get weight log entries for the date range."""
    result = await session.execute(
        select(WeightLog)
        .where(
            WeightLog.user_id == user_id,
            WeightLog.date >= start_date,
            WeightLog.date <= end_date,
        )
        .order_by(WeightLog.date.asc())
    )
    return [
        {"date": str(w.date), "weight_kg": round(w.weight_kg, 1)}
        for w in result.scalars().all()
    ]


# ---------------------------------------------------------------------------
# PDF generation — premium multi-page report
# ---------------------------------------------------------------------------

def _generate_pdf_bytes(
    user_data: dict,
    daily_totals: list,
    food_logs: list,
    weight_history: list,
    start_date: date,
    end_date: date,
) -> bytes:
    """Generate a premium 5-page PDF nutrition report using ReportLab."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, PageBreak, KeepTogether,
        )
        from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle
        from reportlab.graphics.charts.piecharts import Pie
        from reportlab.graphics.charts.barcharts import VerticalBarChart
        from reportlab.graphics import renderPDF
    except ImportError:
        return _generate_fallback_pdf(user_data, daily_totals, food_logs, start_date, end_date)

    # ------------------------------------------------------------------
    # Color shortcuts
    # ------------------------------------------------------------------
    dark_blue = colors.HexColor(_DARK_BLUE)
    accent_blue = colors.HexColor(_ACCENT_BLUE)
    light_blue = colors.HexColor(_LIGHT_BLUE)
    green = colors.HexColor(_GREEN)
    red = colors.HexColor(_RED)
    orange = colors.HexColor(_ORANGE)
    gray_text = colors.HexColor(_GRAY)
    light_gray = colors.HexColor(_LIGHT_GRAY)
    surface = colors.HexColor(_SURFACE)
    protein_color = colors.HexColor(_PROTEIN_COLOR)
    carbs_color = colors.HexColor(_CARBS_COLOR)
    fats_color = colors.HexColor(_FATS_COLOR)
    fiber_color = colors.HexColor(_FIBER_COLOR)

    # ------------------------------------------------------------------
    # Pre-compute all metrics
    # ------------------------------------------------------------------
    num_days = len(daily_totals)
    total_range_days = (end_date - start_date).days + 1
    total_meals = sum(d["meals"] for d in daily_totals) if daily_totals else 0

    total_cal = sum(d["calories"] for d in daily_totals) if daily_totals else 0
    total_protein = sum(d["protein_g"] for d in daily_totals) if daily_totals else 0
    total_carbs = sum(d["carbs_g"] for d in daily_totals) if daily_totals else 0
    total_fats = sum(d["fats_g"] for d in daily_totals) if daily_totals else 0
    total_fiber = sum(d["fiber_g"] for d in daily_totals) if daily_totals else 0

    avg_cal = round(total_cal / num_days) if num_days > 0 else 0
    avg_protein = round(total_protein / num_days, 1) if num_days > 0 else 0
    avg_carbs = round(total_carbs / num_days, 1) if num_days > 0 else 0
    avg_fats = round(total_fats / num_days, 1) if num_days > 0 else 0
    avg_fiber = round(total_fiber / num_days, 1) if num_days > 0 else 0
    avg_meals_per_day = round(total_meals / num_days, 1) if num_days > 0 else 0

    target_cal = user_data["target_calories"]
    target_protein = user_data["target_protein_g"]
    target_carbs = user_data["target_carbs_g"]
    target_fats = user_data["target_fats_g"]

    # Adherence: days within +/-10% of calorie target
    adherent_days = 0
    days_over = 0
    days_under = 0
    best_day_cal = 0
    worst_day_cal = float("inf") if num_days > 0 else 0
    best_day_date = ""
    worst_day_date = ""

    for d in daily_totals:
        cal = d["calories"]
        lower = target_cal * 0.90
        upper = target_cal * 1.10
        if lower <= cal <= upper:
            adherent_days += 1
        if cal > target_cal:
            days_over += 1
        else:
            days_under += 1
        if cal > best_day_cal:
            best_day_cal = cal
            best_day_date = d["date"]
        if cal < worst_day_cal:
            worst_day_cal = cal
            worst_day_date = d["date"]

    adherence_pct = round((adherent_days / num_days) * 100) if num_days > 0 else 0

    # Calories by meal type
    meal_type_cals = defaultdict(float)
    meal_type_counts = defaultdict(int)
    for log in food_logs:
        mt = log["meal_type"].lower() if log["meal_type"] else "otro"
        meal_type_cals[mt] += log["calories"]
        meal_type_counts[mt] += 1

    # Food frequency
    food_counter = Counter()
    food_protein_totals = defaultdict(float)
    food_carbs_totals = defaultdict(float)
    for log in food_logs:
        name = log["food_name"]
        if name:
            food_counter[name] += 1
            food_protein_totals[name] += log["protein_g"]
            food_carbs_totals[name] += log["carbs_g"]

    top_10_foods = food_counter.most_common(10)
    top_5_protein = sorted(food_protein_totals.items(), key=lambda x: x[1], reverse=True)[:5]
    top_5_carbs = sorted(food_carbs_totals.items(), key=lambda x: x[1], reverse=True)[:5]

    # Weekend vs weekday analysis
    weekday_cals = []
    weekend_cals = []
    for log in food_logs:
        wd = log["weekday"]
        if wd >= 5:  # Saturday=5, Sunday=6
            weekend_cals.append(log["calories"])
        else:
            weekday_cals.append(log["calories"])

    avg_weekday_cal = round(sum(weekday_cals) / len(weekday_cals)) if weekday_cals else 0
    avg_weekend_cal = round(sum(weekend_cals) / len(weekend_cals)) if weekend_cals else 0

    # Meal timing distribution
    morning_count = sum(1 for l in food_logs if 5 <= l["hour"] < 12)
    afternoon_count = sum(1 for l in food_logs if 12 <= l["hour"] < 17)
    evening_count = sum(1 for l in food_logs if 17 <= l["hour"] < 22)
    night_count = sum(1 for l in food_logs if l["hour"] >= 22 or l["hour"] < 5)

    # Weekly averages for trend
    weekly_avgs = []
    if daily_totals:
        week_data = defaultdict(list)
        for d in daily_totals:
            dt = datetime.strptime(d["date"], "%Y-%m-%d")
            week_key = dt.isocalendar()[1]
            week_data[week_key].append(d["calories"])
        for wk in sorted(week_data.keys()):
            vals = week_data[wk]
            weekly_avgs.append(round(sum(vals) / len(vals)))

    # ------------------------------------------------------------------
    # Styles
    # ------------------------------------------------------------------
    buffer = io.BytesIO()

    def _footer(canvas, doc):
        """Draw footer on every page."""
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor(_GRAY))
        canvas.drawString(50, 30, "Fitsi AI  --  Confidencial")
        canvas.drawRightString(letter[0] - 50, 30, f"Pagina {doc.page}")
        # Thin line above footer
        canvas.setStrokeColor(colors.HexColor(_LIGHT_GRAY))
        canvas.setLineWidth(0.5)
        canvas.line(50, 42, letter[0] - 50, 42)
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=50,
        leftMargin=50,
        topMargin=50,
        bottomMargin=55,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=26,
        spaceAfter=4,
        textColor=dark_blue,
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=12,
        spaceAfter=12,
        textColor=gray_text,
        fontName="Helvetica",
    )
    section_header = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=8,
        spaceBefore=4,
        textColor=dark_blue,
        fontName="Helvetica-Bold",
    )
    subsection_header = ParagraphStyle(
        "SubsectionHeader",
        parent=styles["Heading2"],
        fontSize=13,
        spaceAfter=6,
        spaceBefore=12,
        textColor=accent_blue,
        fontName="Helvetica-Bold",
    )
    body_style = ParagraphStyle(
        "BodyText",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=4,
        textColor=dark_blue,
        fontName="Helvetica",
        leading=14,
    )
    small_style = ParagraphStyle(
        "SmallText",
        parent=styles["Normal"],
        fontSize=8,
        textColor=gray_text,
        fontName="Helvetica",
    )
    metric_value_style = ParagraphStyle(
        "MetricValue",
        parent=styles["Normal"],
        fontSize=22,
        textColor=dark_blue,
        fontName="Helvetica-Bold",
        alignment=TA_CENTER,
    )
    metric_label_style = ParagraphStyle(
        "MetricLabel",
        parent=styles["Normal"],
        fontSize=8,
        textColor=gray_text,
        fontName="Helvetica",
        alignment=TA_CENTER,
    )
    centered_style = ParagraphStyle(
        "Centered",
        parent=body_style,
        alignment=TA_CENTER,
    )

    elements = []
    page_width = letter[0] - 100  # 50pt margins each side

    # ====================================================================
    # Helper: build a metric card (value + label in a bordered box)
    # ====================================================================
    def _metric_card(value_text, label_text, color_hex=_ACCENT_BLUE):
        """Return a Table acting as a metric card."""
        card_data = [
            [Paragraph(f'<font color="{color_hex}">{value_text}</font>', metric_value_style)],
            [Paragraph(label_text, metric_label_style)],
        ]
        card = Table(card_data, colWidths=[page_width / 3 - 8])
        card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 1, light_gray),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        return card

    # ====================================================================
    # Helper: progress bar drawing
    # ====================================================================
    def _progress_bar_drawing(current, target, bar_color, width=300, height=20):
        """Return a Drawing with a progress bar."""
        total_width = width + 50
        d = Drawing(total_width, height)
        # Background
        d.add(Rect(0, 2, width, height - 4, fillColor=colors.HexColor(_SURFACE),
                    strokeColor=colors.HexColor(_LIGHT_GRAY), strokeWidth=0.5, rx=4, ry=4))
        # Fill
        if target > 0:
            pct = min(current / target, 1.5)  # cap at 150% for visual
            fill_width = max(2, width * min(pct, 1.0))
            fill_color = bar_color if pct <= 1.1 else colors.HexColor(_RED)
            d.add(Rect(0, 2, fill_width, height - 4, fillColor=fill_color,
                        strokeColor=None, rx=4, ry=4))
        # Label
        pct_text = f"{round(current / target * 100)}%" if target > 0 else "N/A"
        d.add(String(width + 5, 5, pct_text,
                     fontName="Helvetica-Bold", fontSize=9,
                     fillColor=colors.HexColor(_DARK_BLUE)))
        return d

    # ====================================================================
    # Helper: pie chart drawing
    # ====================================================================
    def _pie_chart_drawing(data_dict, color_list, width=220, height=180, title_text=""):
        """Return a Drawing with a pie chart."""
        d = Drawing(width, height)

        if not data_dict or sum(data_dict.values()) == 0:
            d.add(String(width / 2, height / 2, "Sin datos",
                         fontName="Helvetica", fontSize=10,
                         fillColor=colors.HexColor(_GRAY), textAnchor="middle"))
            return d

        pc = Pie()
        pc.x = 20
        pc.y = 20
        pc.width = min(width - 40, height - 50)
        pc.height = min(width - 40, height - 50)
        pc.data = list(data_dict.values())
        pc.labels = [f"{k} ({v:.0f})" for k, v in data_dict.items()]

        for i, col in enumerate(color_list[:len(data_dict)]):
            pc.slices[i].fillColor = colors.HexColor(col) if isinstance(col, str) else col
            pc.slices[i].strokeColor = colors.white
            pc.slices[i].strokeWidth = 1.5

        pc.slices.fontName = "Helvetica"
        pc.slices.fontSize = 7
        pc.sideLabels = True
        pc.sideLabelsOffset = 0.08

        d.add(pc)

        if title_text:
            d.add(String(width / 2, height - 8, title_text,
                         fontName="Helvetica-Bold", fontSize=9,
                         fillColor=colors.HexColor(_DARK_BLUE), textAnchor="middle"))
        return d

    # ====================================================================
    # Helper: vertical bar chart drawing
    # ====================================================================
    def _bar_chart_drawing(labels, values, target_value=None,
                           bar_color=_ACCENT_BLUE, width=480, height=200,
                           title_text=""):
        """Return a Drawing with a vertical bar chart."""
        d = Drawing(width, height)

        if not values:
            d.add(String(width / 2, height / 2, "Sin datos",
                         fontName="Helvetica", fontSize=10,
                         fillColor=colors.HexColor(_GRAY), textAnchor="middle"))
            return d

        bc = VerticalBarChart()
        bc.x = 45
        bc.y = 30
        bc.width = width - 70
        bc.height = height - 60
        bc.data = [values]
        bc.categoryAxis.categoryNames = labels

        bc.bars[0].fillColor = colors.HexColor(bar_color)
        bc.bars[0].strokeColor = None

        bc.categoryAxis.labels.fontName = "Helvetica"
        bc.categoryAxis.labels.fontSize = 6
        bc.categoryAxis.labels.angle = 45 if len(labels) > 10 else 0
        bc.categoryAxis.labels.boxAnchor = "ne" if len(labels) > 10 else "n"

        bc.valueAxis.labels.fontName = "Helvetica"
        bc.valueAxis.labels.fontSize = 7
        bc.valueAxis.valueMin = 0
        if values:
            bc.valueAxis.valueMax = max(max(values) * 1.2, 100)
            bc.valueAxis.valueStep = max(1, round(max(values) / 5, -1))
            if bc.valueAxis.valueStep == 0:
                bc.valueAxis.valueStep = 100

        bc.valueAxis.strokeColor = colors.HexColor(_LIGHT_GRAY)
        bc.categoryAxis.strokeColor = colors.HexColor(_LIGHT_GRAY)

        d.add(bc)

        # Target line
        if target_value and values:
            max_val = bc.valueAxis.valueMax
            if max_val > 0:
                y_pos = bc.y + (target_value / max_val) * bc.height
                y_pos = min(y_pos, bc.y + bc.height)
                d.add(Line(bc.x, y_pos, bc.x + bc.width, y_pos,
                           strokeColor=colors.HexColor(_RED),
                           strokeWidth=1.5,
                           strokeDashArray=[4, 3]))
                d.add(String(bc.x + bc.width + 3, y_pos - 3,
                             f"Meta: {target_value}",
                             fontName="Helvetica", fontSize=7,
                             fillColor=colors.HexColor(_RED)))

        if title_text:
            d.add(String(width / 2, height - 8, title_text,
                         fontName="Helvetica-Bold", fontSize=10,
                         fillColor=colors.HexColor(_DARK_BLUE), textAnchor="middle"))
        return d

    # ====================================================================
    # Helper: no-data placeholder
    # ====================================================================
    no_data_msg = "No hay datos suficientes para este periodo."

    def _no_data_paragraph():
        return Paragraph(
            f'<font color="{_GRAY}"><i>{no_data_msg}</i></font>',
            body_style,
        )

    # ====================================================================
    # PAGE 1 — Executive Summary
    # ====================================================================

    # Header with brand bar
    header_data = [[
        Paragraph("Fitsi AI", ParagraphStyle("Brand", parent=title_style, fontSize=28)),
        Paragraph(
            f"Reporte Nutricional<br/>"
            f'<font size="10" color="{_GRAY}">'
            f"{start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')}"
            f"</font>",
            ParagraphStyle("HeaderRight", parent=title_style, fontSize=16, alignment=TA_RIGHT),
        ),
    ]]
    header_table = Table(header_data, colWidths=[page_width * 0.4, page_width * 0.6])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_table)

    # Blue accent line
    elements.append(Spacer(1, 6))
    elements.append(HRFlowable(width="100%", thickness=3, color=accent_blue))
    elements.append(Spacer(1, 16))

    # User info card
    elements.append(Paragraph("Perfil del Usuario", subsection_header))

    goal_labels = {
        "lose": "Perder peso",
        "maintain": "Mantener peso",
        "gain": "Ganar peso",
    }
    goal_display = goal_labels.get(user_data["goal"], user_data["goal"] or "N/A")

    info_left = [
        ["Nombre", user_data["name"]],
        ["Edad", f"{user_data['age']} anios" if user_data["age"] else "No registrada"],
        ["Genero", (user_data["gender"] or "No registrado").capitalize()],
        ["Dieta", (user_data["diet_type"] or "Sin restriccion").capitalize()],
    ]
    info_right = [
        ["Altura", f"{user_data['height_cm']:.0f} cm" if user_data["height_cm"] else "N/A"],
        ["Peso", f"{user_data['weight_kg']:.1f} kg" if user_data["weight_kg"] else "N/A"],
        ["IMC", f"{user_data['bmi']}" if user_data["bmi"] else "N/A"],
        ["Objetivo", goal_display],
    ]

    col_w = page_width / 4
    info_data = []
    for i in range(len(info_left)):
        info_data.append([
            Paragraph(f'<b>{info_left[i][0]}</b>', small_style),
            Paragraph(str(info_left[i][1]), body_style),
            Paragraph(f'<b>{info_right[i][0]}</b>', small_style),
            Paragraph(str(info_right[i][1]), body_style),
        ])

    info_table = Table(info_data, colWidths=[col_w * 0.6, col_w * 1.0, col_w * 0.6, col_w * 1.0])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), surface),
        ("BOX", (0, 0), (-1, -1), 0.5, light_gray),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 16))

    # Key Metrics Dashboard
    elements.append(Paragraph("Metricas Clave", subsection_header))

    if num_days > 0:
        # Row 1: calories, adherence, streak
        cal_diff = avg_cal - target_cal
        cal_indicator = f"{'+'if cal_diff > 0 else ''}{cal_diff}"
        cal_color = _GREEN if abs(cal_diff) <= target_cal * 0.1 else (_RED if cal_diff > 0 else _ORANGE)

        row1 = [[
            _metric_card(f"{avg_cal}", "Calorias promedio/dia", cal_color),
            _metric_card(f"{adherence_pct}%", "Adherencia al plan", _GREEN if adherence_pct >= 70 else _RED),
            _metric_card(f"{user_data['current_streak']}", "Dias de racha actual", _ACCENT_BLUE),
        ]]
        row1_table = Table(row1, colWidths=[page_width / 3] * 3)
        row1_table.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(row1_table)
        elements.append(Spacer(1, 8))

        # Row 2: protein, total meals, health score
        health_score_text = f"{user_data['health_score']:.0f}/100" if user_data["health_score"] else "N/A"
        health_color = _GREEN if user_data["health_score"] and user_data["health_score"] >= 70 else _ORANGE

        row2 = [[
            _metric_card(f"{avg_protein}g", "Proteina promedio/dia", _PROTEIN_COLOR),
            _metric_card(f"{total_meals}", "Comidas registradas", _ACCENT_BLUE),
            _metric_card(health_score_text, "Health Score", health_color),
        ]]
        row2_table = Table(row2, colWidths=[page_width / 3] * 3)
        row2_table.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(row2_table)
        elements.append(Spacer(1, 12))

        # Macro summary table
        elements.append(Paragraph("Resumen de Macronutrientes vs Objetivo", subsection_header))
        macro_header = ["Nutriente", "Promedio/dia", "Objetivo", "Diferencia", "Cumplimiento"]
        macro_rows = [macro_header]

        for label, avg_val, tgt_val, clr in [
            ("Calorias (kcal)", avg_cal, target_cal, _ACCENT_BLUE),
            ("Proteina (g)", avg_protein, target_protein, _PROTEIN_COLOR),
            ("Carbohidratos (g)", avg_carbs, target_carbs, _CARBS_COLOR),
            ("Grasas (g)", avg_fats, target_fats, _FATS_COLOR),
        ]:
            diff = round(avg_val - tgt_val, 1)
            diff_str = f"{'+'if diff > 0 else ''}{diff}"
            pct = round((avg_val / tgt_val) * 100) if tgt_val > 0 else 0
            macro_rows.append([label, f"{avg_val}", f"{tgt_val}", diff_str, f"{pct}%"])

        macro_table = Table(macro_rows, colWidths=[
            page_width * 0.28, page_width * 0.18, page_width * 0.18,
            page_width * 0.18, page_width * 0.18,
        ])
        macro_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), dark_blue),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, light_gray),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, surface]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(macro_table)
    else:
        elements.append(_no_data_paragraph())

    # ====================================================================
    # PAGE 2 — Calorie Analysis
    # ====================================================================
    elements.append(PageBreak())
    elements.append(Paragraph("Analisis de Calorias", section_header))
    elements.append(HRFlowable(width="100%", thickness=2, color=accent_blue))
    elements.append(Spacer(1, 12))

    if num_days > 0:
        # Daily calorie bar chart
        chart_labels = [d["date"][-5:] for d in daily_totals]  # MM-DD format
        chart_values = [d["calories"] for d in daily_totals]

        bar_chart = _bar_chart_drawing(
            chart_labels, chart_values,
            target_value=target_cal,
            bar_color=_ACCENT_BLUE,
            width=int(page_width),
            height=200,
            title_text="Calorias Diarias vs Meta",
        )
        elements.append(bar_chart)
        elements.append(Spacer(1, 12))

        # Stats row
        elements.append(Paragraph("Estadisticas de Calorias", subsection_header))

        stats_data = [
            ["Promedio diario", f"{avg_cal} kcal",
             "Dias activos", f"{num_days} de {total_range_days}"],
            ["Mejor dia (max cal)", f"{best_day_date[-5:]}  ({best_day_cal:.0f} kcal)",
             "Peor dia (min cal)", f"{worst_day_date[-5:]}  ({worst_day_cal:.0f} kcal)"],
            ["Dias sobre meta", f"{days_over}",
             "Dias bajo meta", f"{days_under}"],
            ["Meta diaria", f"{target_cal} kcal",
             "Diferencia promedio", f"{'+' if avg_cal > target_cal else ''}{avg_cal - target_cal} kcal"],
        ]
        stats_table = Table(stats_data, colWidths=[
            page_width * 0.25, page_width * 0.25, page_width * 0.25, page_width * 0.25,
        ])
        stats_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), gray_text),
            ("TEXTCOLOR", (2, 0), (2, -1), gray_text),
            ("BACKGROUND", (0, 0), (-1, -1), surface),
            ("BOX", (0, 0), (-1, -1), 0.5, light_gray),
            ("GRID", (0, 0), (-1, -1), 0.5, light_gray),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(stats_table)
        elements.append(Spacer(1, 16))

        # Weekly average trend
        if weekly_avgs and len(weekly_avgs) > 1:
            elements.append(Paragraph("Tendencia Semanal de Calorias", subsection_header))
            week_labels = [f"Sem {i + 1}" for i in range(len(weekly_avgs))]
            weekly_chart = _bar_chart_drawing(
                week_labels, weekly_avgs,
                target_value=target_cal,
                bar_color=_LIGHT_BLUE,
                width=int(page_width * 0.7),
                height=150,
                title_text="Promedio Semanal",
            )
            elements.append(weekly_chart)
            elements.append(Spacer(1, 12))

        # Calorie distribution by meal type (pie chart)
        if meal_type_cals:
            elements.append(Paragraph("Distribucion de Calorias por Tipo de Comida", subsection_header))

            meal_labels_map = {
                "breakfast": "Desayuno",
                "lunch": "Almuerzo",
                "dinner": "Cena",
                "snack": "Snack",
            }
            pie_data = {}
            for mt, cal in sorted(meal_type_cals.items(), key=lambda x: x[1], reverse=True):
                label = meal_labels_map.get(mt, mt.capitalize())
                pie_data[label] = round(cal)

            pie_colors = [_ACCENT_BLUE, _GREEN, _ORANGE, _RED, _LIGHT_BLUE, _GRAY]
            pie_drawing = _pie_chart_drawing(pie_data, pie_colors, width=350, height=200)
            elements.append(pie_drawing)
    else:
        elements.append(_no_data_paragraph())

    # ====================================================================
    # PAGE 3 — Macronutrient Breakdown
    # ====================================================================
    elements.append(PageBreak())
    elements.append(Paragraph("Desglose de Macronutrientes", section_header))
    elements.append(HRFlowable(width="100%", thickness=2, color=accent_blue))
    elements.append(Spacer(1, 12))

    if num_days > 0:
        # Progress bars for each macro
        elements.append(Paragraph("Cumplimiento Diario Promedio", subsection_header))

        bar_width = int(page_width * 0.58)

        for label, avg_val, tgt_val, bar_col in [
            ("Proteina", avg_protein, target_protein, protein_color),
            ("Carbohidratos", avg_carbs, target_carbs, carbs_color),
            ("Grasas", avg_fats, target_fats, fats_color),
            ("Fibra", avg_fiber, 25.0, fiber_color),
        ]:
            pct = round((avg_val / tgt_val) * 100) if tgt_val > 0 else 0
            row_data = [[
                Paragraph(f'<b>{label}</b><br/>'
                          f'<font size="8" color="{_GRAY}">'
                          f'{avg_val}g / {tgt_val}g objetivo</font>',
                          body_style),
                _progress_bar_drawing(avg_val, tgt_val, bar_col, width=bar_width, height=18),
            ]]
            row_table = Table(row_data, colWidths=[page_width * 0.32, page_width * 0.68])
            row_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(row_table)

        elements.append(Spacer(1, 16))

        # Macro ratio pie charts: actual vs recommended
        elements.append(Paragraph("Ratio de Macros: Actual vs Recomendado", subsection_header))

        total_macro_cals = (avg_protein * 4) + (avg_carbs * 4) + (avg_fats * 9)
        if total_macro_cals > 0:
            actual_prot_pct = round((avg_protein * 4 / total_macro_cals) * 100)
            actual_carb_pct = round((avg_carbs * 4 / total_macro_cals) * 100)
            actual_fat_pct = 100 - actual_prot_pct - actual_carb_pct
        else:
            actual_prot_pct = actual_carb_pct = actual_fat_pct = 0

        target_macro_cals = (target_protein * 4) + (target_carbs * 4) + (target_fats * 9)
        if target_macro_cals > 0:
            target_prot_pct = round((target_protein * 4 / target_macro_cals) * 100)
            target_carb_pct = round((target_carbs * 4 / target_macro_cals) * 100)
            target_fat_pct = 100 - target_prot_pct - target_carb_pct
        else:
            target_prot_pct = target_carb_pct = target_fat_pct = 0

        actual_pie_data = {
            f"Prot {actual_prot_pct}%": actual_prot_pct,
            f"Carb {actual_carb_pct}%": actual_carb_pct,
            f"Grasa {actual_fat_pct}%": actual_fat_pct,
        }
        target_pie_data = {
            f"Prot {target_prot_pct}%": target_prot_pct,
            f"Carb {target_carb_pct}%": target_carb_pct,
            f"Grasa {target_fat_pct}%": target_fat_pct,
        }
        macro_colors = [_PROTEIN_COLOR, _CARBS_COLOR, _FATS_COLOR]

        pie_row = [[
            _pie_chart_drawing(actual_pie_data, macro_colors, width=240, height=170, title_text="Tu Ratio Actual"),
            _pie_chart_drawing(target_pie_data, macro_colors, width=240, height=170, title_text="Ratio Recomendado"),
        ]]
        pie_table = Table(pie_row, colWidths=[page_width * 0.5, page_width * 0.5])
        pie_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        elements.append(pie_table)
        elements.append(Spacer(1, 16))

        # Top 5 protein sources
        if top_5_protein:
            elements.append(Paragraph("Top 5 Fuentes de Proteina", subsection_header))
            prot_rows = [["#", "Alimento", "Proteina Total (g)"]]
            for i, (name, val) in enumerate(top_5_protein, 1):
                display_name = name[:40] + "..." if len(name) > 40 else name
                prot_rows.append([str(i), display_name, f"{val:.1f}g"])

            prot_table = Table(prot_rows, colWidths=[page_width * 0.08, page_width * 0.62, page_width * 0.30])
            prot_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), accent_blue),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 0), (2, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, light_gray),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, surface]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(prot_table)
            elements.append(Spacer(1, 10))

        # Top 5 carb sources
        if top_5_carbs:
            elements.append(Paragraph("Top 5 Fuentes de Carbohidratos", subsection_header))
            carb_rows = [["#", "Alimento", "Carbohidratos Total (g)"]]
            for i, (name, val) in enumerate(top_5_carbs, 1):
                display_name = name[:40] + "..." if len(name) > 40 else name
                carb_rows.append([str(i), display_name, f"{val:.1f}g"])

            carb_table = Table(carb_rows, colWidths=[page_width * 0.08, page_width * 0.62, page_width * 0.30])
            carb_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), carbs_color),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 0), (2, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, light_gray),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, surface]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(carb_table)
    else:
        elements.append(_no_data_paragraph())

    # ====================================================================
    # PAGE 4 — Meal Patterns & Insights
    # ====================================================================
    elements.append(PageBreak())
    elements.append(Paragraph("Patrones Alimenticios e Insights", section_header))
    elements.append(HRFlowable(width="100%", thickness=2, color=accent_blue))
    elements.append(Spacer(1, 12))

    if food_logs:
        # Most frequent foods (top 10)
        if top_10_foods:
            elements.append(Paragraph("Alimentos Mas Frecuentes (Top 10)", subsection_header))
            freq_rows = [["#", "Alimento", "Veces Registrado", "Frecuencia"]]
            for i, (name, count) in enumerate(top_10_foods, 1):
                display_name = name[:40] + "..." if len(name) > 40 else name
                pct_freq = round((count / total_meals) * 100, 1) if total_meals > 0 else 0
                freq_rows.append([str(i), display_name, str(count), f"{pct_freq}%"])

            freq_table = Table(freq_rows, colWidths=[
                page_width * 0.06, page_width * 0.52, page_width * 0.20, page_width * 0.22,
            ])
            freq_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), dark_blue),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, light_gray),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, surface]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(freq_table)
            elements.append(Spacer(1, 14))

        # Meal timing distribution
        elements.append(Paragraph("Distribucion Horaria de Comidas", subsection_header))
        timing_data = {
            "Maniana (5-12h)": morning_count,
            "Tarde (12-17h)": afternoon_count,
            "Noche (17-22h)": evening_count,
            "Madrugada (22-5h)": night_count,
        }
        timing_colors = [_ORANGE, _ACCENT_BLUE, _GREEN, _GRAY]
        timing_pie = _pie_chart_drawing(timing_data, timing_colors, width=320, height=180,
                                        title_text="Horario de Comidas")
        elements.append(timing_pie)
        elements.append(Spacer(1, 12))

        # Key stats table
        elements.append(Paragraph("Resumen de Patrones", subsection_header))
        pattern_rows = [
            ["Promedio de comidas/dia", f"{avg_meals_per_day}"],
            ["Total de comidas registradas", f"{total_meals}"],
            ["Dias con registro", f"{num_days} de {total_range_days}"],
            ["Calorias promedio lunes-viernes", f"{avg_weekday_cal} kcal" if weekday_cals else "Sin datos"],
            ["Calorias promedio fin de semana", f"{avg_weekend_cal} kcal" if weekend_cals else "Sin datos"],
        ]
        if avg_weekday_cal > 0 and avg_weekend_cal > 0:
            diff_we = avg_weekend_cal - avg_weekday_cal
            pattern_rows.append([
                "Diferencia fin de semana",
                f"{'+'if diff_we > 0 else ''}{diff_we} kcal ({'mas' if diff_we > 0 else 'menos'} que semana)",
            ])

        pattern_table = Table(pattern_rows, colWidths=[page_width * 0.55, page_width * 0.45])
        pattern_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), gray_text),
            ("BACKGROUND", (0, 0), (-1, -1), surface),
            ("BOX", (0, 0), (-1, -1), 0.5, light_gray),
            ("GRID", (0, 0), (-1, -1), 0.3, light_gray),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(pattern_table)
        elements.append(Spacer(1, 14))

        # AI-generated insights
        elements.append(Paragraph("Insights Basados en tus Datos", subsection_header))

        insights = []

        # Insight 1: Calorie adherence
        if adherence_pct >= 80:
            insights.append(
                f"Excelente adherencia al plan ({adherence_pct}%). "
                f"Estas manteniendo tus calorias dentro del rango objetivo la mayoria de los dias."
            )
        elif adherence_pct >= 50:
            insights.append(
                f"Adherencia moderada ({adherence_pct}%). "
                f"Intenta ser mas consistente con tu meta de {target_cal} kcal para mejores resultados."
            )
        elif num_days > 0:
            insights.append(
                f"Tu adherencia es baja ({adherence_pct}%). "
                f"Considera ajustar tu meta calorica o planificar tus comidas con anticipacion."
            )

        # Insight 2: Protein check
        if target_protein > 0 and avg_protein < target_protein * 0.8:
            deficit = round(target_protein - avg_protein, 1)
            insights.append(
                f"Tu consumo de proteina ({avg_protein}g/dia) esta {deficit}g por debajo de tu objetivo. "
                f"Agrega fuentes como pollo, pescado, huevos o legumbres para alcanzar los {target_protein}g."
            )
        elif target_protein > 0 and avg_protein >= target_protein * 0.95:
            insights.append(
                f"Buen trabajo con la proteina. Estas alcanzando {round(avg_protein / target_protein * 100)}% "
                f"de tu objetivo diario de {target_protein}g."
            )

        # Insight 3: Weekend pattern
        if avg_weekday_cal > 0 and avg_weekend_cal > 0:
            we_diff_pct = round(((avg_weekend_cal - avg_weekday_cal) / avg_weekday_cal) * 100)
            if we_diff_pct > 20:
                insights.append(
                    f"Los fines de semana consumes {we_diff_pct}% mas calorias que entre semana. "
                    f"Esto puede ralentizar tu progreso hacia tu objetivo."
                )
            elif we_diff_pct < -15:
                insights.append(
                    f"Los fines de semana consumes {abs(we_diff_pct)}% menos calorias. "
                    f"Asegurate de mantener una alimentacion suficiente todos los dias."
                )

        # Insight 4: Meal frequency
        if avg_meals_per_day < 2.5 and total_meals > 0:
            insights.append(
                f"Registras {avg_meals_per_day} comidas/dia en promedio. "
                f"Distribuir tu ingesta en 3-4 comidas puede mejorar tu metabolismo y saciedad."
            )
        elif avg_meals_per_day >= 4.5:
            insights.append(
                f"Registras {avg_meals_per_day} comidas/dia en promedio. "
                f"Tu distribucion es buena, pero asegurate de que los snacks no excedan tu meta calorica."
            )

        # Insight 5: Consistency
        if num_days > 0 and total_range_days > 0:
            logging_pct = round((num_days / total_range_days) * 100)
            if logging_pct < 60:
                insights.append(
                    f"Solo registraste comidas {num_days} de {total_range_days} dias ({logging_pct}%). "
                    f"La consistencia en el registro es clave para obtener resultados precisos."
                )

        if not insights:
            insights.append("Sigue registrando tus comidas para generar insights personalizados.")

        for i, insight in enumerate(insights[:5], 1):
            bullet_color = _GREEN if i <= 2 else _ACCENT_BLUE
            elements.append(Paragraph(
                f'<font color="{bullet_color}"><b>{i}.</b></font> {insight}',
                body_style,
            ))
            elements.append(Spacer(1, 4))
    else:
        elements.append(_no_data_paragraph())

    # ====================================================================
    # PAGE 5 — Weight & Body Composition
    # ====================================================================
    elements.append(PageBreak())
    elements.append(Paragraph("Peso y Composicion Corporal", section_header))
    elements.append(HRFlowable(width="100%", thickness=2, color=accent_blue))
    elements.append(Spacer(1, 12))

    has_weight_data = len(weight_history) >= 2

    if has_weight_data:
        # Weight history bar chart
        w_labels = [w["date"][-5:] for w in weight_history]
        w_values = [w["weight_kg"] for w in weight_history]

        weight_chart = _bar_chart_drawing(
            w_labels, w_values,
            target_value=user_data["target_weight_kg"],
            bar_color=_GREEN,
            width=int(page_width),
            height=200,
            title_text="Historial de Peso (kg)",
        )
        elements.append(weight_chart)
        elements.append(Spacer(1, 12))

        # Weight stats
        first_w = weight_history[0]["weight_kg"]
        last_w = weight_history[-1]["weight_kg"]
        weight_change = round(last_w - first_w, 1)
        min_w = min(w["weight_kg"] for w in weight_history)
        max_w = max(w["weight_kg"] for w in weight_history)

        elements.append(Paragraph("Estadisticas de Peso", subsection_header))
        weight_stats = [
            ["Peso inicial (periodo)", f"{first_w} kg",
             "Peso actual", f"{last_w} kg"],
            ["Cambio en periodo", f"{'+'if weight_change > 0 else ''}{weight_change} kg",
             "Rango", f"{min_w} - {max_w} kg"],
        ]

        ws_table = Table(weight_stats, colWidths=[page_width * 0.25] * 4)
        ws_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), gray_text),
            ("TEXTCOLOR", (2, 0), (2, -1), gray_text),
            ("BACKGROUND", (0, 0), (-1, -1), surface),
            ("BOX", (0, 0), (-1, -1), 0.5, light_gray),
            ("GRID", (0, 0), (-1, -1), 0.5, light_gray),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(ws_table)
        elements.append(Spacer(1, 12))
    else:
        elements.append(Paragraph(
            '<font color="#666666"><i>'
            "No hay suficientes registros de peso para mostrar una tendencia. "
            "Registra tu peso regularmente para ver tu progreso aqui."
            "</i></font>",
            body_style,
        ))
        elements.append(Spacer(1, 12))

    # BMI Section
    elements.append(Paragraph("Indice de Masa Corporal (IMC)", subsection_header))

    bmi = user_data["bmi"]
    if bmi:
        # BMI classification
        if bmi < 18.5:
            bmi_class = "Bajo peso"
            bmi_color = _ORANGE
        elif bmi < 25.0:
            bmi_class = "Normal"
            bmi_color = _GREEN
        elif bmi < 30.0:
            bmi_class = "Sobrepeso"
            bmi_color = _ORANGE
        else:
            bmi_class = "Obesidad"
            bmi_color = _RED

        # BMI visual scale
        bmi_drawing = Drawing(int(page_width), 50)

        # Background bar with gradient zones
        bar_y = 20
        bar_h = 16
        zone_width = page_width / 4

        zones = [
            (0, colors.HexColor("#5B9CF6"), "Bajo peso"),
            (1, colors.HexColor("#34A853"), "Normal"),
            (2, colors.HexColor("#FBBC04"), "Sobrepeso"),
            (3, colors.HexColor("#EA4335"), "Obesidad"),
        ]
        for idx, color_val, label in zones:
            bmi_drawing.add(Rect(
                idx * zone_width, bar_y, zone_width, bar_h,
                fillColor=color_val, strokeColor=None,
            ))
            bmi_drawing.add(String(
                idx * zone_width + zone_width / 2, bar_y + bar_h + 4, label,
                fontName="Helvetica", fontSize=7,
                fillColor=colors.HexColor(_DARK_BLUE), textAnchor="middle",
            ))

        # Round corners on edges
        bmi_drawing.add(Rect(0, bar_y, 3, bar_h, fillColor=colors.HexColor("#5B9CF6"), strokeColor=None))
        bmi_drawing.add(Rect(page_width - 3, bar_y, 3, bar_h, fillColor=colors.HexColor("#EA4335"), strokeColor=None))

        # Scale labels
        scale_points = [("18.5", 0.25), ("25", 0.5), ("30", 0.75)]
        for label, pos in scale_points:
            x = pos * page_width
            bmi_drawing.add(String(x, bar_y - 10, label,
                                   fontName="Helvetica", fontSize=7,
                                   fillColor=colors.HexColor(_GRAY), textAnchor="middle"))

        # Position marker for user's BMI
        # Map BMI to position: 15=0%, 40=100%
        bmi_pos = max(0, min(1, (bmi - 15) / 25))
        marker_x = bmi_pos * page_width
        bmi_drawing.add(Circle(marker_x, bar_y + bar_h / 2, 6,
                               fillColor=colors.HexColor(_DARK_BLUE),
                               strokeColor=colors.white, strokeWidth=2))
        bmi_drawing.add(String(marker_x, bar_y - 14, f"{bmi}",
                               fontName="Helvetica-Bold", fontSize=8,
                               fillColor=colors.HexColor(_DARK_BLUE), textAnchor="middle"))

        elements.append(bmi_drawing)
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(
            f'<b>Tu IMC: {bmi}</b> - '
            f'<font color="{bmi_color}"><b>{bmi_class}</b></font>',
            centered_style,
        ))
    else:
        elements.append(Paragraph(
            '<font color="#666666"><i>IMC no disponible. Completa tu perfil con altura y peso.</i></font>',
            body_style,
        ))

    elements.append(Spacer(1, 16))

    # Goal progress section
    elements.append(Paragraph("Progreso hacia tu Objetivo", subsection_header))

    current_weight = user_data["weight_kg"]
    target_weight = user_data["target_weight_kg"]

    if current_weight and target_weight:
        weight_diff = round(abs(current_weight - target_weight), 1)
        goal_text = user_data["goal"]

        if goal_text == "lose" and has_weight_data:
            latest_weight = weight_history[-1]["weight_kg"]
            initial_weight = current_weight  # from profile (onboarding)
            total_to_lose = initial_weight - target_weight
            already_lost = initial_weight - latest_weight
            progress_pct = round((already_lost / total_to_lose) * 100) if total_to_lose > 0 else 0
            progress_pct = max(0, min(progress_pct, 100))

            elements.append(Paragraph(
                f"<b>Objetivo:</b> Llegar a {target_weight} kg (perder {total_to_lose:.1f} kg total)",
                body_style,
            ))
            elements.append(Paragraph(
                f"<b>Progreso:</b> Has perdido {max(0, already_lost):.1f} kg ({progress_pct}% completado)",
                body_style,
            ))

            # Estimated time to goal
            if has_weight_data and len(weight_history) >= 2:
                days_elapsed = (
                    datetime.strptime(weight_history[-1]["date"], "%Y-%m-%d")
                    - datetime.strptime(weight_history[0]["date"], "%Y-%m-%d")
                ).days
                if days_elapsed > 0 and already_lost > 0:
                    remaining = total_to_lose - already_lost
                    rate_per_day = already_lost / days_elapsed
                    if rate_per_day > 0:
                        days_remaining = round(remaining / rate_per_day)
                        weeks_remaining = round(days_remaining / 7)
                        elements.append(Paragraph(
                            f"<b>Tiempo estimado:</b> ~{weeks_remaining} semanas al ritmo actual "
                            f"({rate_per_day * 7:.1f} kg/semana)",
                            body_style,
                        ))

            # Progress bar
            elements.append(Spacer(1, 6))
            goal_bar = _progress_bar_drawing(
                progress_pct, 100, green, width=int(page_width * 0.7), height=22,
            )
            elements.append(goal_bar)

        elif goal_text == "gain" and has_weight_data:
            latest_weight = weight_history[-1]["weight_kg"]
            total_to_gain = target_weight - current_weight
            already_gained = latest_weight - current_weight
            progress_pct = round((already_gained / total_to_gain) * 100) if total_to_gain > 0 else 0
            progress_pct = max(0, min(progress_pct, 100))

            elements.append(Paragraph(
                f"<b>Objetivo:</b> Llegar a {target_weight} kg (ganar {total_to_gain:.1f} kg total)",
                body_style,
            ))
            elements.append(Paragraph(
                f"<b>Progreso:</b> Has ganado {max(0, already_gained):.1f} kg ({progress_pct}% completado)",
                body_style,
            ))
            elements.append(Spacer(1, 6))
            goal_bar = _progress_bar_drawing(
                progress_pct, 100, green, width=int(page_width * 0.7), height=22,
            )
            elements.append(goal_bar)

        elif goal_text == "maintain":
            elements.append(Paragraph(
                f"<b>Objetivo:</b> Mantener tu peso en ~{target_weight} kg",
                body_style,
            ))
            if has_weight_data:
                latest_weight = weight_history[-1]["weight_kg"]
                drift = round(latest_weight - target_weight, 1)
                elements.append(Paragraph(
                    f"<b>Estado actual:</b> {latest_weight} kg "
                    f"({'+'if drift > 0 else ''}{drift} kg vs objetivo)",
                    body_style,
                ))
        else:
            elements.append(Paragraph(
                f"<b>Peso actual:</b> {current_weight} kg | "
                f"<b>Peso objetivo:</b> {target_weight} kg | "
                f"<b>Diferencia:</b> {weight_diff} kg",
                body_style,
            ))
    else:
        elements.append(Paragraph(
            '<font color="#666666"><i>'
            "Completa tu perfil con peso actual y peso objetivo para ver tu progreso."
            "</i></font>",
            body_style,
        ))

    # Final spacer and generation timestamp
    elements.append(Spacer(1, 24))
    elements.append(HRFlowable(width="100%", thickness=1, color=light_gray))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        f"Generado por Fitsi AI el {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC",
        ParagraphStyle("FooterNote", parent=small_style, fontSize=8,
                        textColor=colors.HexColor("#999999")),
    ))

    # Build
    doc.build(elements, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def _generate_fallback_pdf(
    user_data: dict,
    daily_totals: list,
    food_logs: list,
    start_date: date,
    end_date: date,
) -> bytes:
    """Fallback: generate a minimal PDF without ReportLab (plain text in PDF wrapper)."""
    lines = [
        "Fitsi AI - Reporte Nutricional",
        f"Periodo: {start_date} - {end_date}",
        f"Usuario: {user_data['name']}",
        f"Meta: {user_data['goal']}",
        f"Calorias objetivo: {user_data['target_calories']} kcal",
        "",
        "--- Resumen Diario ---",
    ]

    for d in daily_totals:
        lines.append(
            f"  {d['date']}: {d['calories']:.0f} kcal, "
            f"P:{d['protein_g']:.1f}g, C:{d['carbs_g']:.1f}g, G:{d['fats_g']:.1f}g "
            f"({d['meals']} comidas)"
        )

    lines.append("")
    lines.append("--- Ultimas Comidas ---")
    for log in food_logs[:20]:
        name = log.get("food_name_short") or log.get("food_name", "")
        lines.append(
            f"  {log['date']} {log['time']} [{log['meal_type']}] "
            f"{name} - {log['calories']:.0f} kcal"
        )

    text = "\n".join(lines)

    # Minimal PDF 1.4 structure
    content = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    pdf_lines = [
        "%PDF-1.4",
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
        "/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
        f"4 0 obj<</Length {len(content) + 50}>>stream",
        f"BT /F1 10 Tf 50 742 Td ({content}) Tj ET",
        "endstream endobj",
        "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj",
        "xref",
        "trailer<</Size 6/Root 1 0 R>>",
        "%%EOF",
    ]
    return "\n".join(pdf_lines).encode("latin-1")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def generate_nutrition_report_pdf(
    user_id: int,
    session: AsyncSession,
    days: int = 7,
) -> bytes:
    """
    Main entry point: generate a premium PDF nutrition report for the user.

    Args:
        user_id: The user to generate the report for.
        session: Database session.
        days: Number of days to include (default 7).

    Returns:
        PDF file as bytes.

    Raises:
        Exception: If PDF generation fails (caller should catch and return 500).
    """
    if days < 1:
        days = 1
    elif days > 365:
        days = 365

    end_date = date.today()
    start_date = end_date - timedelta(days=days)

    user_data = await get_user_export_profile(user_id, session)
    daily_totals = await get_daily_totals(user_id, start_date, end_date, session)
    food_logs = await get_food_log_rows(user_id, start_date, end_date, session, limit=500)
    weight_data = await get_weight_history(user_id, start_date, end_date, session)

    pdf_bytes = _generate_pdf_bytes(
        user_data, daily_totals, food_logs, weight_data, start_date, end_date,
    )

    logger.info(
        "PDF report generated: user_id=%s days=%d daily_rows=%d food_rows=%d "
        "weight_rows=%d size=%d bytes",
        user_id, days, len(daily_totals), len(food_logs), len(weight_data),
        len(pdf_bytes),
    )

    return pdf_bytes

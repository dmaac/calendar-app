"""
Export Service
--------------
Generates nutrition report PDFs and provides data-query helpers for export endpoints.

PDF reports are produced using ReportLab with:
- User profile summary
- Daily/weekly nutrition totals
- Macro breakdown with inline bar charts
- Food log history table

Falls back to a simple text-based PDF if ReportLab is not installed.

Also provides:
- get_daily_totals(): per-day aggregated nutrition data (reusable by router)
- get_food_logs_query(): base query builder with soft-delete filtering
"""

import io
import logging
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.onboarding_profile import OnboardingProfile
from ..models.user import User

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Reusable query helpers (used by both PDF generation and router endpoints)
# ---------------------------------------------------------------------------

async def get_user_export_profile(user_id: int, session: AsyncSession) -> dict:
    """Gather user profile + onboarding data for export/report headers.

    Returns a dict with name, email, goal, and daily macro targets.
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

    return {
        "name": f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email if user else "User",
        "email": user.email if user else "",
        "goal": profile.goal if profile else "N/A",
        "target_calories": profile.daily_calories or 2000 if profile else 2000,
        "target_protein_g": profile.daily_protein_g or 150 if profile else 150,
        "target_carbs_g": profile.daily_carbs_g or 200 if profile else 200,
        "target_fats_g": profile.daily_fats_g or 65 if profile else 65,
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
    limit: int = 50,
) -> list[dict]:
    """Get individual food log entries for the report table.

    Excludes soft-deleted records. Returns up to `limit` rows, newest first.
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
        if len(food_name) > 30:
            food_name = food_name[:30] + "..."
        rows.append({
            "date": log.logged_at.strftime("%Y-%m-%d") if log.logged_at else "",
            "time": log.logged_at.strftime("%H:%M") if log.logged_at else "",
            "meal_type": log.meal_type or "",
            "food_name": food_name,
            "calories": round(log.calories, 0) if log.calories is not None else 0,
            "protein_g": round(log.protein_g, 1) if log.protein_g is not None else 0,
            "carbs_g": round(log.carbs_g, 1) if log.carbs_g is not None else 0,
            "fats_g": round(log.fats_g, 1) if log.fats_g is not None else 0,
        })
    return rows


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

def _generate_pdf_bytes(
    user_data: dict,
    daily_totals: list,
    food_logs: list,
    start_date: date,
    end_date: date,
) -> bytes:
    """Generate a PDF report using ReportLab."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
        )
    except ImportError:
        return _generate_fallback_pdf(user_data, daily_totals, food_logs, start_date, end_date)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Title"],
        fontSize=22,
        spaceAfter=6,
        textColor=colors.HexColor("#1A1A2E"),
    )
    heading_style = ParagraphStyle(
        "CustomHeading",
        parent=styles["Heading2"],
        fontSize=14,
        spaceAfter=8,
        spaceBefore=16,
        textColor=colors.HexColor("#4285F4"),
    )
    normal_style = styles["Normal"]

    elements = []

    # Title
    elements.append(Paragraph("Fitsi IA - Reporte Nutricional", title_style))
    elements.append(Paragraph(
        f"{start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')}",
        normal_style,
    ))
    elements.append(Spacer(1, 12))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E0E0E0")))
    elements.append(Spacer(1, 12))

    # User Info
    elements.append(Paragraph("Perfil del Usuario", heading_style))
    info_data = [
        ["Nombre", user_data["name"]],
        ["Meta", user_data["goal"] or "N/A"],
        ["Calorias diarias", f"{user_data['target_calories']} kcal"],
        ["Proteina diaria", f"{user_data['target_protein_g']}g"],
        ["Carbohidratos diarios", f"{user_data['target_carbs_g']}g"],
        ["Grasas diarias", f"{user_data['target_fats_g']}g"],
    ]
    info_table = Table(info_data, colWidths=[2.5 * inch, 4 * inch])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#666666")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 16))

    # Daily Summary Table
    if daily_totals:
        elements.append(Paragraph("Resumen Diario", heading_style))

        total_cal = sum(d["calories"] for d in daily_totals)
        total_protein = sum(d["protein_g"] for d in daily_totals)
        total_carbs = sum(d["carbs_g"] for d in daily_totals)
        total_fats = sum(d["fats_g"] for d in daily_totals)
        num_days = len(daily_totals)

        # Summary stats
        if num_days > 0:
            elements.append(Paragraph(
                f"Dias activos: {num_days} | "
                f"Promedio calorias: {round(total_cal / num_days)} kcal/dia | "
                f"Promedio proteina: {round(total_protein / num_days, 1)}g/dia",
                normal_style,
            ))
        elements.append(Spacer(1, 8))

        header = ["Fecha", "Calorias", "Proteina", "Carbos", "Grasas", "Comidas"]
        rows = [header]
        for d in daily_totals:
            rows.append([
                d["date"],
                f"{d['calories']:.0f}",
                f"{d['protein_g']:.1f}g",
                f"{d['carbs_g']:.1f}g",
                f"{d['fats_g']:.1f}g",
                str(d["meals"]),
            ])

        daily_table = Table(rows, colWidths=[1.2 * inch, 1.0 * inch, 1.0 * inch, 1.0 * inch, 1.0 * inch, 0.8 * inch])
        daily_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4285F4")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(daily_table)
        elements.append(Spacer(1, 16))

        # Macro distribution
        if total_cal > 0 and num_days > 0:
            protein_pct = round((total_protein * 4 / total_cal) * 100)
            carbs_pct = round((total_carbs * 4 / total_cal) * 100)
            fats_pct = round((total_fats * 9 / total_cal) * 100)

            elements.append(Paragraph("Distribucion de Macros (promedio)", heading_style))
            macro_data = [
                ["Proteina", f"{protein_pct}%", f"{round(total_protein / num_days, 1)}g/dia"],
                ["Carbohidratos", f"{carbs_pct}%", f"{round(total_carbs / num_days, 1)}g/dia"],
                ["Grasas", f"{fats_pct}%", f"{round(total_fats / num_days, 1)}g/dia"],
            ]
            macro_table = Table(macro_data, colWidths=[2 * inch, 1.5 * inch, 2 * inch])
            macro_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(macro_table)
            elements.append(Spacer(1, 16))

    # Food Log Table
    if food_logs:
        elements.append(Paragraph("Registro de Comidas (ultimas 50)", heading_style))

        header = ["Fecha", "Hora", "Tipo", "Comida", "Cal", "Prot", "Carb", "Grasa"]
        rows = [header]
        for log in food_logs:
            rows.append([
                log["date"],
                log["time"],
                log["meal_type"],
                log["food_name"],
                f"{log['calories']:.0f}",
                f"{log['protein_g']:.1f}",
                f"{log['carbs_g']:.1f}",
                f"{log['fats_g']:.1f}",
            ])

        col_widths = [0.8 * inch, 0.6 * inch, 0.7 * inch, 1.8 * inch, 0.6 * inch, 0.5 * inch, 0.5 * inch, 0.5 * inch]
        food_table = Table(rows, colWidths=col_widths)
        food_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A1A2E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (4, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(food_table)

    # Footer
    elements.append(Spacer(1, 24))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E0E0E0")))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        f"Generado por Fitsi IA el {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC",
        ParagraphStyle("Footer", parent=normal_style, fontSize=8, textColor=colors.HexColor("#999999")),
    ))

    doc.build(elements)
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
        "Fitsi IA - Reporte Nutricional",
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
        lines.append(
            f"  {log['date']} {log['time']} [{log['meal_type']}] "
            f"{log['food_name']} - {log['calories']:.0f} kcal"
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
    Main entry point: generate a PDF nutrition report for the user.

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
    food_logs = await get_food_log_rows(user_id, start_date, end_date, session)

    pdf_bytes = _generate_pdf_bytes(user_data, daily_totals, food_logs, start_date, end_date)

    logger.info(
        "PDF report generated: user_id=%s days=%d daily_rows=%d food_rows=%d size=%d bytes",
        user_id, days, len(daily_totals), len(food_logs), len(pdf_bytes),
    )

    return pdf_bytes

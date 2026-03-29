"""
NotificationService -- handles push notification delivery via Expo Push API.

Responsibilities:
- Deliver push notifications to user devices
- Handle Expo API errors gracefully (deactivate invalid tokens, retry transient failures)
- Log every notification to NotificationLog for analytics and idempotency
- Provide notification history and analytics queries
- Enforce quiet hours before sending
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.notification_log import NotificationLog
from ..models.notification_schedule import NotificationSchedule
from ..models.push_token import PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

# Maximum retries for transient Expo API failures
_MAX_RETRIES = 3
_RETRY_BACKOFF_SECONDS = [1, 3, 10]


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------
    # Token management
    # ------------------------------------------------------------------

    async def _get_active_tokens(self, user_id: int) -> list[str]:
        statement = select(PushToken.token).where(
            PushToken.user_id == user_id,
            PushToken.is_active == True,  # noqa: E712
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def _deactivate_token(self, token: str, user_id: int) -> None:
        """Mark a push token as inactive (device unregistered)."""
        stmt = select(PushToken).where(PushToken.token == token)
        res = await self.session.execute(stmt)
        push_token = res.scalars().first()
        if push_token:
            push_token.is_active = False
            self.session.add(push_token)
            await self.session.commit()
            logger.warning(
                "Deactivated invalid push token for user_id=%s token=%.20s...",
                user_id, token,
            )

    # ------------------------------------------------------------------
    # Quiet hours check
    # ------------------------------------------------------------------

    async def _is_in_quiet_hours(self, user_id: int) -> bool:
        """Check if the current time falls within the user's quiet hours."""
        stmt = select(NotificationSchedule).where(
            NotificationSchedule.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        schedule = result.scalars().first()
        if schedule is None:
            return False

        now_utc = datetime.now(timezone.utc)
        # Adjust to user's local time
        offset = timedelta(minutes=schedule.timezone_offset_minutes)
        local_now = now_utc + offset
        return schedule.is_in_quiet_hours(local_now.hour)

    # ------------------------------------------------------------------
    # Idempotency check
    # ------------------------------------------------------------------

    async def _check_idempotency(self, idempotency_key: str) -> bool:
        """Return True if a notification with this key was already sent today."""
        stmt = select(NotificationLog.id).where(
            NotificationLog.idempotency_key == idempotency_key,
        )
        result = await self.session.execute(stmt)
        return result.first() is not None

    # ------------------------------------------------------------------
    # Core send method
    # ------------------------------------------------------------------

    async def send_push(
        self,
        user_id: int,
        title: str,
        body: str,
        data: Optional[dict] = None,
        notification_type: str = "general",
        category: str = "transactional",
        idempotency_key: Optional[str] = None,
        respect_quiet_hours: bool = True,
    ) -> list[dict]:
        """
        Send a push notification to all of a user's active devices.

        Args:
            user_id: Target user ID
            title: Notification title
            body: Notification body text
            data: Optional data payload for deep linking
            notification_type: Classification for analytics
            category: transactional | engagement | achievement | summary
            idempotency_key: If provided, prevents duplicate sends
            respect_quiet_hours: If True, skips send during user's quiet hours

        Returns:
            List of Expo push ticket dicts
        """
        # 1. Idempotency guard
        if idempotency_key:
            if await self._check_idempotency(idempotency_key):
                logger.info(
                    "Skipping duplicate notification: key=%s user_id=%s",
                    idempotency_key, user_id,
                )
                return []

        # 2. Quiet hours guard
        if respect_quiet_hours and await self._is_in_quiet_hours(user_id):
            logger.info(
                "Skipping notification during quiet hours: user_id=%s type=%s",
                user_id, notification_type,
            )
            return []

        # 3. Get active tokens
        tokens = await self._get_active_tokens(user_id)
        if not tokens:
            logger.info("No active push tokens for user_id=%s", user_id)
            return []

        # 4. Build Expo messages
        messages = [
            {
                "to": token,
                "sound": "default",
                "title": title,
                "body": body,
                **({"data": data} if data else {}),
            }
            for token in tokens
        ]

        # 5. Send with retry
        tickets = await self._send_with_retry(messages, user_id)

        # 6. Log the notification
        await self._log_notification(
            user_id=user_id,
            notification_type=notification_type,
            category=category,
            title=title,
            body=body,
            data=data,
            tickets=tickets,
            tokens=tokens,
            idempotency_key=idempotency_key,
        )

        # 7. Handle invalid tokens
        await self._handle_ticket_errors(tickets, tokens, user_id)

        return tickets

    async def _send_with_retry(
        self,
        messages: list[dict],
        user_id: int,
    ) -> list[dict]:
        """Send push messages with exponential backoff retry for transient failures."""
        last_error: Optional[Exception] = None

        for attempt in range(_MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        EXPO_PUSH_URL,
                        json=messages,
                        headers={
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                        },
                    )
                    response.raise_for_status()
                    result = response.json()
                    return result.get("data", [])

            except httpx.TimeoutException as exc:
                last_error = exc
                logger.warning(
                    "Expo push timeout (attempt %d/%d) for user_id=%s: %s",
                    attempt + 1, _MAX_RETRIES, user_id, exc,
                )
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code
                # Only retry on 5xx server errors
                if status_code >= 500:
                    last_error = exc
                    logger.warning(
                        "Expo push server error %d (attempt %d/%d) for user_id=%s",
                        status_code, attempt + 1, _MAX_RETRIES, user_id,
                    )
                else:
                    # 4xx errors are not retryable
                    logger.error(
                        "Expo push client error %d for user_id=%s: %s",
                        status_code, user_id, exc.response.text,
                    )
                    raise
            except httpx.RequestError as exc:
                last_error = exc
                logger.warning(
                    "Expo push network error (attempt %d/%d) for user_id=%s: %s",
                    attempt + 1, _MAX_RETRIES, user_id, exc,
                )

            # Wait before retry (skip wait on last attempt)
            if attempt < _MAX_RETRIES - 1:
                import asyncio
                await asyncio.sleep(_RETRY_BACKOFF_SECONDS[attempt])

        # All retries exhausted
        logger.error(
            "Expo push failed after %d retries for user_id=%s: %s",
            _MAX_RETRIES, user_id, last_error,
        )
        raise last_error  # type: ignore[misc]

    async def _handle_ticket_errors(
        self,
        tickets: list[dict],
        tokens: list[str],
        user_id: int,
    ) -> None:
        """Process Expo ticket responses and deactivate invalid tokens."""
        for ticket, token in zip(tickets, tokens):
            if ticket.get("status") == "error":
                error_type = ticket.get("details", {}).get("error", "")
                if error_type == "DeviceNotRegistered":
                    await self._deactivate_token(token, user_id)
                elif error_type == "InvalidCredentials":
                    logger.error(
                        "Invalid Expo push credentials for user_id=%s", user_id,
                    )
                else:
                    logger.warning(
                        "Expo push error for user_id=%s token=%.20s: %s - %s",
                        user_id, token, error_type, ticket.get("message", ""),
                    )

    # ------------------------------------------------------------------
    # Notification logging
    # ------------------------------------------------------------------

    async def _log_notification(
        self,
        user_id: int,
        notification_type: str,
        category: str,
        title: str,
        body: str,
        data: Optional[dict],
        tickets: list[dict],
        tokens: list[str],
        idempotency_key: Optional[str],
    ) -> None:
        """Record the notification in the log table for analytics."""
        now = datetime.now(timezone.utc)
        # Generate idempotency key if not provided
        if not idempotency_key:
            idempotency_key = f"{notification_type}:{user_id}:{now.isoformat()}"

        # Determine overall delivery status from tickets
        if not tickets:
            status = "failed"
        elif all(t.get("status") == "ok" for t in tickets):
            status = "sent"
        elif any(t.get("status") == "ok" for t in tickets):
            status = "sent"  # at least one device got it
        else:
            status = "failed"

        # Extract first ticket ID for reference
        ticket_id = None
        for t in tickets:
            if t.get("id"):
                ticket_id = t["id"]
                break

        failure_reason = None
        if status == "failed" and tickets:
            errors = [t.get("message", "") for t in tickets if t.get("status") == "error"]
            failure_reason = "; ".join(errors)[:500] if errors else None

        try:
            log_entry = NotificationLog(
                user_id=user_id,
                notification_type=notification_type,
                category=category,
                title=title,
                body=body,
                data_json=json.dumps(data) if data else None,
                channel="push",
                expo_ticket_id=ticket_id,
                delivery_status=status,
                failure_reason=failure_reason,
                idempotency_key=idempotency_key,
                sent_at=now,
            )
            self.session.add(log_entry)
            await self.session.commit()
        except Exception as exc:
            # Log entry failure should never block notification delivery
            logger.error("Failed to log notification: %s", exc)
            await self.session.rollback()

    # ------------------------------------------------------------------
    # Analytics: track opens and dismissals
    # ------------------------------------------------------------------

    async def mark_notification_opened(
        self,
        notification_log_id: int,
        user_id: int,
    ) -> bool:
        """Mark a notification as opened by the user."""
        stmt = select(NotificationLog).where(
            NotificationLog.id == notification_log_id,
            NotificationLog.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        log = result.scalars().first()
        if not log:
            return False

        if log.opened_at is None:
            log.opened_at = datetime.now(timezone.utc)
            self.session.add(log)
            await self.session.commit()
        return True

    async def mark_notification_dismissed(
        self,
        notification_log_id: int,
        user_id: int,
    ) -> bool:
        """Mark a notification as dismissed by the user."""
        stmt = select(NotificationLog).where(
            NotificationLog.id == notification_log_id,
            NotificationLog.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        log = result.scalars().first()
        if not log:
            return False

        if log.dismissed_at is None:
            log.dismissed_at = datetime.now(timezone.utc)
            self.session.add(log)
            await self.session.commit()
        return True

    # ------------------------------------------------------------------
    # Analytics: query notification stats
    # ------------------------------------------------------------------

    async def get_notification_stats(
        self,
        user_id: int,
        days: int = 30,
    ) -> dict:
        """
        Return notification analytics for a user over the last N days.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Total sent
        total_stmt = select(func.count(NotificationLog.id)).where(
            NotificationLog.user_id == user_id,
            NotificationLog.sent_at >= since,
        )
        total_result = await self.session.execute(total_stmt)
        total_sent = total_result.scalar() or 0

        # Successfully delivered
        delivered_stmt = select(func.count(NotificationLog.id)).where(
            NotificationLog.user_id == user_id,
            NotificationLog.sent_at >= since,
            NotificationLog.delivery_status == "sent",
        )
        delivered_result = await self.session.execute(delivered_stmt)
        total_delivered = delivered_result.scalar() or 0

        # Opened
        opened_stmt = select(func.count(NotificationLog.id)).where(
            NotificationLog.user_id == user_id,
            NotificationLog.sent_at >= since,
            NotificationLog.opened_at != None,  # noqa: E711
        )
        opened_result = await self.session.execute(opened_stmt)
        total_opened = opened_result.scalar() or 0

        # Dismissed
        dismissed_stmt = select(func.count(NotificationLog.id)).where(
            NotificationLog.user_id == user_id,
            NotificationLog.sent_at >= since,
            NotificationLog.dismissed_at != None,  # noqa: E711
        )
        dismissed_result = await self.session.execute(dismissed_stmt)
        total_dismissed = dismissed_result.scalar() or 0

        # Failed
        failed_stmt = select(func.count(NotificationLog.id)).where(
            NotificationLog.user_id == user_id,
            NotificationLog.sent_at >= since,
            NotificationLog.delivery_status == "failed",
        )
        failed_result = await self.session.execute(failed_stmt)
        total_failed = failed_result.scalar() or 0

        # Breakdown by type
        type_stmt = select(
            NotificationLog.notification_type,
            func.count(NotificationLog.id),
        ).where(
            NotificationLog.user_id == user_id,
            NotificationLog.sent_at >= since,
        ).group_by(NotificationLog.notification_type)
        type_result = await self.session.execute(type_stmt)
        by_type = {row[0]: row[1] for row in type_result.all()}

        open_rate = round(total_opened / total_delivered * 100, 1) if total_delivered > 0 else 0.0

        return {
            "period_days": days,
            "total_sent": total_sent,
            "total_delivered": total_delivered,
            "total_opened": total_opened,
            "total_dismissed": total_dismissed,
            "total_failed": total_failed,
            "open_rate_percent": open_rate,
            "by_type": by_type,
        }

    async def get_notification_history(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """Return recent notification history for a user."""
        stmt = (
            select(NotificationLog)
            .where(NotificationLog.user_id == user_id)
            .order_by(NotificationLog.sent_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        logs = result.scalars().all()

        return [
            {
                "id": log.id,
                "notification_type": log.notification_type,
                "category": log.category,
                "title": log.title,
                "body": log.body,
                "channel": log.channel,
                "delivery_status": log.delivery_status,
                "sent_at": log.sent_at.isoformat() if log.sent_at else None,
                "opened_at": log.opened_at.isoformat() if log.opened_at else None,
                "dismissed_at": log.dismissed_at.isoformat() if log.dismissed_at else None,
            }
            for log in logs
        ]

    # ------------------------------------------------------------------
    # Dead letter queue: record permanently failed notifications
    # ------------------------------------------------------------------

    async def send_to_dead_letter(
        self,
        user_id: int,
        notification_type: str,
        title: str,
        body: str,
        error_message: str,
        data: Optional[dict] = None,
    ) -> None:
        """Record a notification that could not be delivered after all retries.

        Stores the failed notification in NotificationLog with
        delivery_status='dead_letter' so it can be inspected, retried,
        or purged later.
        """
        from ..core.metrics import NOTIFICATION_DEAD_LETTERS

        NOTIFICATION_DEAD_LETTERS.inc(notification_type=notification_type)

        try:
            log_entry = NotificationLog(
                user_id=user_id,
                notification_type=notification_type,
                category="dead_letter",
                title=title,
                body=body,
                data_json=json.dumps(data) if data else None,
                channel="push",
                delivery_status="dead_letter",
                failure_reason=error_message[:500],
                idempotency_key=f"dlq:{notification_type}:{user_id}:{datetime.now(timezone.utc).isoformat()}",
                sent_at=datetime.now(timezone.utc),
            )
            self.session.add(log_entry)
            await self.session.commit()
            logger.warning(
                "Notification sent to dead letter queue: user_id=%s type=%s error=%s",
                user_id, notification_type, error_message[:100],
            )
        except Exception as exc:
            logger.error(
                "Failed to record dead letter for user_id=%s: %s", user_id, exc,
            )
            await self.session.rollback()

    async def get_dead_letters(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Return pending dead-letter notifications for admin review."""
        stmt = (
            select(NotificationLog)
            .where(NotificationLog.delivery_status == "dead_letter")
            .order_by(NotificationLog.sent_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        logs = result.scalars().all()

        return [
            {
                "id": log.id,
                "user_id": log.user_id,
                "notification_type": log.notification_type,
                "title": log.title,
                "body": log.body,
                "failure_reason": log.failure_reason,
                "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            }
            for log in logs
        ]

    async def retry_dead_letter(self, dead_letter_id: int) -> dict:
        """Retry a specific dead-letter notification.

        Looks up the original notification parameters and re-sends via
        send_push. On success the dead_letter record's status is updated
        to 'retried'. On failure it remains in the dead letter queue.

        Returns:
            {"success": bool, "tickets": [...], "error": str | None}
        """
        stmt = select(NotificationLog).where(
            NotificationLog.id == dead_letter_id,
            NotificationLog.delivery_status == "dead_letter",
        )
        result = await self.session.execute(stmt)
        log = result.scalars().first()

        if not log:
            return {"success": False, "tickets": [], "error": "Dead letter not found"}

        try:
            data = json.loads(log.data_json) if log.data_json else None
            tickets = await self.send_push(
                user_id=log.user_id,
                title=log.title,
                body=log.body,
                data=data,
                notification_type=log.notification_type,
                category="retry",
                respect_quiet_hours=False,
            )

            # Mark the original dead letter as retried
            log.delivery_status = "retried"
            self.session.add(log)
            await self.session.commit()

            logger.info(
                "Dead letter %d retried successfully for user_id=%s",
                dead_letter_id, log.user_id,
            )
            return {"success": True, "tickets": tickets, "error": None}

        except Exception as exc:
            logger.error(
                "Dead letter %d retry failed for user_id=%s: %s",
                dead_letter_id, log.user_id, exc,
            )
            return {"success": False, "tickets": [], "error": str(exc)}

    async def get_dead_letter_count(self) -> int:
        """Return the number of pending dead-letter notifications."""
        stmt = select(func.count(NotificationLog.id)).where(
            NotificationLog.delivery_status == "dead_letter",
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    # ------------------------------------------------------------------
    # Convenience methods (backward-compatible)
    # ------------------------------------------------------------------

    async def send_meal_reminder(self, user_id: int, meal_type: str) -> list[dict]:
        titles = {
            "breakfast": "Hora del desayuno!",
            "lunch": "Hora del almuerzo!",
            "dinner": "Hora de cenar!",
            "snack": "Hora del snack!",
        }
        title = titles.get(meal_type, "Hora de comer!")
        body = "Registra tu comida en Fitsi para mantener tu streak."
        today = datetime.now(timezone.utc).date().isoformat()
        return await self.send_push(
            user_id,
            title,
            body,
            data={"type": "meal_reminder", "meal_type": meal_type},
            notification_type="meal_reminder",
            category="engagement",
            idempotency_key=f"meal_reminder:{user_id}:{today}:{meal_type}",
        )

    async def send_water_reminder(self, user_id: int) -> list[dict]:
        now = datetime.now(timezone.utc)
        # Use hour-level idempotency so we don't spam within the same hour
        key = f"water_reminder:{user_id}:{now.date().isoformat()}:{now.hour}"
        return await self.send_push(
            user_id,
            "Recuerda beber agua!",
            "Mantente hidratado. Registra tu consumo de agua.",
            data={"type": "water_reminder"},
            notification_type="water_reminder",
            category="engagement",
            idempotency_key=key,
        )

    async def send_streak_congrats(self, user_id: int, days: int) -> list[dict]:
        today = datetime.now(timezone.utc).date().isoformat()
        return await self.send_push(
            user_id,
            f"Llevas {days} dias seguidos!",
            "Sigue asi! Tu constancia esta dando resultados.",
            data={"type": "streak_congrats", "days": days},
            notification_type="streak_celebration",
            category="achievement",
            idempotency_key=f"streak_congrats:{user_id}:{today}:{days}",
        )

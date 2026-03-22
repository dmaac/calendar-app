import logging
from typing import Optional

import httpx
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.push_token import PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_active_tokens(self, user_id: int) -> list[str]:
        statement = select(PushToken.token).where(
            PushToken.user_id == user_id,
            PushToken.is_active == True,
        )
        result = await self.session.exec(statement)
        return list(result.all())

    async def send_push(
        self,
        user_id: int,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> list[dict]:
        tokens = await self._get_active_tokens(user_id)
        if not tokens:
            logger.info("No active push tokens for user_id=%s", user_id)
            return []

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

        async with httpx.AsyncClient(timeout=10.0) as client:
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

        tickets = result.get("data", [])
        # Deactivate tokens that Expo reports as invalid
        for ticket, token in zip(tickets, tokens):
            if ticket.get("status") == "error" and ticket.get("details", {}).get("error") == "DeviceNotRegistered":
                logger.warning("Deactivating invalid push token for user_id=%s", user_id)
                stmt = select(PushToken).where(PushToken.token == token)
                res = await self.session.exec(stmt)
                push_token = res.first()
                if push_token:
                    push_token.is_active = False
                    self.session.add(push_token)
                    await self.session.commit()

        return tickets

    async def send_meal_reminder(self, user_id: int, meal_type: str) -> list[dict]:
        titles = {
            "breakfast": "Hora del desayuno!",
            "lunch": "Hora del almuerzo!",
            "dinner": "Hora de cenar!",
            "snack": "Hora del snack!",
        }
        title = titles.get(meal_type, "Hora de comer!")
        body = "Registra tu comida en Fitsi para mantener tu streak."
        return await self.send_push(user_id, title, body, data={"type": "meal_reminder", "meal_type": meal_type})

    async def send_water_reminder(self, user_id: int) -> list[dict]:
        return await self.send_push(
            user_id,
            "Recuerda beber agua!",
            "Mantente hidratado. Registra tu consumo de agua.",
            data={"type": "water_reminder"},
        )

    async def send_streak_congrats(self, user_id: int, days: int) -> list[dict]:
        return await self.send_push(
            user_id,
            f"Llevas {days} dias seguidos!",
            "Sigue asi! Tu constancia esta dando resultados.",
            data={"type": "streak_congrats", "days": days},
        )

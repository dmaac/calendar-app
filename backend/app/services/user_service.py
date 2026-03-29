from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from ..models.user import User, UserCreate
from ..core.security import get_password_hash, verify_password, needs_rehash


class UserService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_user_by_email(self, email: str) -> Optional[User]:
        statement = select(User).where(User.email == email)
        result = await self.session.execute(statement)
        return result.scalars().first()

    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        return await self.session.get(User, user_id)

    async def create_user(self, user_create: UserCreate) -> User:
        hashed_password = get_password_hash(user_create.password)
        user_data = user_create.model_dump()
        del user_data["password"]

        user = User(**user_data, hashed_password=hashed_password)
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        user = await self.get_user_by_email(email)
        if not user:
            return None
        if not user.hashed_password:
            return None
        if not verify_password(password, user.hashed_password):
            return None

        # SEC: Transparent re-hash — upgrade old pbkdf2_sha256 hashes to bcrypt
        # on successful login. This is a one-time migration per user.
        if needs_rehash(user.hashed_password):
            try:
                user.hashed_password = get_password_hash(password)
                self.session.add(user)
                await self.session.commit()
                await self.session.refresh(user)
            except Exception:
                # Non-critical: if re-hash fails, the old hash still works
                await self.session.rollback()

        return user

    def is_active(self, user: User) -> bool:
        return user.is_active

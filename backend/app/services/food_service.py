from typing import List, Optional, Tuple
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func, col
from ..models.food import Food, FoodCreate, FoodUpdate
from ..models.meal_log import MealLog
from ..models.user_food_favorite import UserFoodFavorite


class FoodService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_food_by_id(self, food_id: int) -> Optional[Food]:
        return await self.session.get(Food, food_id)

    async def get_foods_by_ids(self, food_ids: List[int]) -> dict:
        """Batch-load foods by a list of IDs. Returns a dict mapping food_id -> Food."""
        if not food_ids:
            return {}
        statement = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        result = await self.session.exec(statement)
        return {food.id: food for food in result.all()}

    async def search_foods(self, query: str, limit: int = 20, offset: int = 0) -> Tuple[List[Food], int]:
        count_stmt = select(func.count()).select_from(Food).where(
            Food.name.ilike(f"%{query}%")  # type: ignore
        )
        total_result = await self.session.exec(count_stmt)
        total = total_result.one()

        statement = select(Food).where(
            Food.name.ilike(f"%{query}%")  # type: ignore
        ).offset(offset).limit(limit)
        result = await self.session.exec(statement)
        items = list(result.all())
        return items, total

    async def get_all_foods(self, limit: int = 50, offset: int = 0) -> Tuple[List[Food], int]:
        count_stmt = select(func.count()).select_from(Food)
        total_result = await self.session.exec(count_stmt)
        total = total_result.one()

        statement = select(Food).offset(offset).limit(limit)
        result = await self.session.exec(statement)
        items = list(result.all())
        return items, total

    async def create_food(self, food_create: FoodCreate) -> Food:
        food = Food(**food_create.dict())
        self.session.add(food)
        await self.session.commit()
        await self.session.refresh(food)
        return food

    async def update_food(self, food_id: int, food_update: FoodUpdate) -> Optional[Food]:
        food = await self.session.get(Food, food_id)
        if not food:
            return None

        update_data = food_update.dict(exclude_unset=True)
        if update_data:
            for field, value in update_data.items():
                setattr(food, field, value)
            self.session.add(food)
            await self.session.commit()
            await self.session.refresh(food)

        return food

    async def delete_food(self, food_id: int) -> bool:
        food = await self.session.get(Food, food_id)
        if not food:
            return False
        await self.session.delete(food)
        await self.session.commit()
        return True

    # --- Favorites ---

    async def add_favorite(self, user_id: int, food_id: int) -> UserFoodFavorite:
        # Check if already favorited
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        result = await self.session.exec(statement)
        existing = result.first()
        if existing:
            return existing

        favorite = UserFoodFavorite(user_id=user_id, food_id=food_id)
        self.session.add(favorite)
        await self.session.commit()
        await self.session.refresh(favorite)
        return favorite

    async def get_favorites(self, user_id: int) -> List[UserFoodFavorite]:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id
        ).order_by(col(UserFoodFavorite.created_at).desc())  # type: ignore
        result = await self.session.exec(statement)
        return list(result.all())

    async def remove_favorite(self, user_id: int, food_id: int) -> bool:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        result = await self.session.exec(statement)
        favorite = result.first()
        if not favorite:
            return False
        await self.session.delete(favorite)
        await self.session.commit()
        return True

    # --- Recents ---

    async def get_recent_foods(self, user_id: int, limit: int = 20) -> List[Food]:
        """Get the last N distinct foods the user logged, ordered by most recent."""
        # Get distinct food_ids ordered by most recent meal log
        statement = (
            select(MealLog.food_id, func.max(MealLog.created_at).label("last_used"))
            .where(MealLog.user_id == user_id)
            .group_by(MealLog.food_id)
            .order_by(func.max(MealLog.created_at).desc())
            .limit(limit)
        )
        result = await self.session.exec(statement)
        results = result.all()
        food_ids = [row[0] for row in results]

        if not food_ids:
            return []

        # Fetch the food objects
        foods_stmt = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        foods_result = await self.session.exec(foods_stmt)
        foods = list(foods_result.all())

        # Preserve the order from the original query
        food_map = {f.id: f for f in foods}
        return [food_map[fid] for fid in food_ids if fid in food_map]

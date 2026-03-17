from typing import List, Optional, Tuple
from sqlmodel import Session, select, func, col
from ..models.food import Food, FoodCreate, FoodUpdate
from ..models.meal_log import MealLog
from ..models.user_food_favorite import UserFoodFavorite


class FoodService:
    def __init__(self, session: Session):
        self.session = session

    def get_food_by_id(self, food_id: int) -> Optional[Food]:
        return self.session.get(Food, food_id)

    def search_foods(self, query: str, limit: int = 20, offset: int = 0) -> Tuple[List[Food], int]:
        count_stmt = select(func.count()).select_from(Food).where(
            Food.name.ilike(f"%{query}%")  # type: ignore
        )
        total = self.session.exec(count_stmt).one()

        statement = select(Food).where(
            Food.name.ilike(f"%{query}%")  # type: ignore
        ).offset(offset).limit(limit)
        items = list(self.session.exec(statement).all())
        return items, total

    def get_all_foods(self, limit: int = 50, offset: int = 0) -> Tuple[List[Food], int]:
        count_stmt = select(func.count()).select_from(Food)
        total = self.session.exec(count_stmt).one()

        statement = select(Food).offset(offset).limit(limit)
        items = list(self.session.exec(statement).all())
        return items, total

    def create_food(self, food_create: FoodCreate) -> Food:
        food = Food(**food_create.dict())
        self.session.add(food)
        self.session.commit()
        self.session.refresh(food)
        return food

    def update_food(self, food_id: int, food_update: FoodUpdate) -> Optional[Food]:
        food = self.session.get(Food, food_id)
        if not food:
            return None

        update_data = food_update.dict(exclude_unset=True)
        if update_data:
            for field, value in update_data.items():
                setattr(food, field, value)
            self.session.add(food)
            self.session.commit()
            self.session.refresh(food)

        return food

    def delete_food(self, food_id: int) -> bool:
        food = self.session.get(Food, food_id)
        if not food:
            return False
        self.session.delete(food)
        self.session.commit()
        return True

    # --- Favorites ---

    def add_favorite(self, user_id: int, food_id: int) -> UserFoodFavorite:
        # Check if already favorited
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        existing = self.session.exec(statement).first()
        if existing:
            return existing

        favorite = UserFoodFavorite(user_id=user_id, food_id=food_id)
        self.session.add(favorite)
        self.session.commit()
        self.session.refresh(favorite)
        return favorite

    def get_favorites(self, user_id: int) -> List[UserFoodFavorite]:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id
        ).order_by(col(UserFoodFavorite.created_at).desc())  # type: ignore
        return list(self.session.exec(statement).all())

    def remove_favorite(self, user_id: int, food_id: int) -> bool:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        favorite = self.session.exec(statement).first()
        if not favorite:
            return False
        self.session.delete(favorite)
        self.session.commit()
        return True

    # --- Recents ---

    def get_recent_foods(self, user_id: int, limit: int = 20) -> List[Food]:
        """Get the last N distinct foods the user logged, ordered by most recent."""
        # Get distinct food_ids ordered by most recent meal log
        statement = (
            select(MealLog.food_id, func.max(MealLog.created_at).label("last_used"))
            .where(MealLog.user_id == user_id)
            .group_by(MealLog.food_id)
            .order_by(func.max(MealLog.created_at).desc())
            .limit(limit)
        )
        results = self.session.exec(statement).all()
        food_ids = [row[0] for row in results]

        if not food_ids:
            return []

        # Fetch the food objects
        foods_stmt = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        foods = list(self.session.exec(foods_stmt).all())

        # Preserve the order from the original query
        food_map = {f.id: f for f in foods}
        return [food_map[fid] for fid in food_ids if fid in food_map]

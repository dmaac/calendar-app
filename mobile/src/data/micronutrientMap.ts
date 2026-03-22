/**
 * micronutrientMap.ts -- Estimated micronutrient content by food category
 *
 * Maps food categories (from foodDatabase.ts) to average micronutrient
 * densities per 100g. These are rough estimates based on USDA FoodData
 * Central category averages, NOT exact values for specific foods.
 *
 * Used by MicronutrientDashboard to provide ballpark estimates.
 * A proper implementation would map individual food_name strings to
 * specific USDA FoodData Central entries via NDB numbers.
 *
 * Units match MicronutrientData interface:
 *   vitaminA: mcg RAE, vitaminB12: mcg, vitaminC: mg, vitaminD: mcg
 *   iron: mg, calcium: mg, zinc: mg, magnesium: mg
 *
 * Sources: USDA FoodData Central, 2024 release.
 */
import type { FoodCategory } from './foodDatabase';

export interface MicronutrientProfile {
  vitaminA: number;
  vitaminB12: number;
  vitaminC: number;
  vitaminD: number;
  iron: number;
  calcium: number;
  zinc: number;
  magnesium: number;
}

/**
 * Average micronutrient content per 100g for each food category.
 *
 * These are category-level averages, not food-specific. Accuracy is
 * limited -- this is a heuristic estimation layer.
 */
export const micronutrientsByCategory: Record<FoodCategory, MicronutrientProfile> = {
  fruit: {
    vitaminA: 30,       // Moderate (beta-carotene in some fruits)
    vitaminB12: 0,      // Not present in plant foods
    vitaminC: 35,       // Good source -- citrus, berries, kiwi
    vitaminD: 0,        // Not present in fruits
    iron: 0.3,          // Minimal
    calcium: 15,        // Low
    zinc: 0.1,          // Minimal
    magnesium: 10,      // Low-moderate
  },
  vegetable: {
    vitaminA: 180,      // High in dark leafy greens, carrots (beta-carotene)
    vitaminB12: 0,      // Not present in plant foods
    vitaminC: 30,       // Moderate (peppers, broccoli higher)
    vitaminD: 0,        // Not present
    iron: 1.2,          // Moderate (spinach, kale)
    calcium: 45,        // Moderate (broccoli, kale)
    zinc: 0.4,          // Low-moderate
    magnesium: 20,      // Moderate
  },
  protein: {
    vitaminA: 15,       // Low (liver is exception but uncommon)
    vitaminB12: 2.0,    // Good source -- meat, fish, eggs
    vitaminC: 0,        // Destroyed by cooking; minimal in raw meat
    vitaminD: 1.5,      // Moderate (fatty fish higher, eggs)
    iron: 2.0,          // Good source (heme iron, better absorbed)
    calcium: 15,        // Low (dairy-based proteins higher)
    zinc: 3.5,          // Good source -- meat, shellfish
    magnesium: 25,      // Moderate
  },
  carbohydrate: {
    vitaminA: 0,        // Minimal in grains
    vitaminB12: 0,      // Not present (unless fortified)
    vitaminC: 0,        // Not present in grains
    vitaminD: 0,        // Not present (unless fortified)
    iron: 1.5,          // Moderate (fortified cereals, whole grains)
    calcium: 20,        // Low (some fortified)
    zinc: 1.0,          // Moderate (whole grains)
    magnesium: 35,      // Good source (whole grains, oats)
  },
  fat_snack: {
    vitaminA: 5,        // Minimal
    vitaminB12: 0.1,    // Minimal (some in dairy-based snacks)
    vitaminC: 0,        // Not present
    vitaminD: 0.2,      // Minimal (some in dairy fat)
    iron: 0.8,          // Low-moderate (nuts contain some)
    calcium: 30,        // Moderate (nuts, seeds, cheese)
    zinc: 1.2,          // Moderate (nuts, seeds)
    magnesium: 45,      // Good source (nuts, seeds, dark chocolate)
  },
};

/**
 * Estimate micronutrients from a food log entry.
 * Uses category-based heuristic if a category is available,
 * otherwise returns a balanced average estimate.
 *
 * @param category - Food category from the food database
 * @param grams - Estimated weight consumed in grams
 * @returns Estimated micronutrient content for the consumed amount
 */
export function estimateMicronutrients(
  category: FoodCategory | undefined,
  grams: number,
): MicronutrientProfile {
  const factor = grams / 100;

  if (category && category in micronutrientsByCategory) {
    const profile = micronutrientsByCategory[category];
    return {
      vitaminA: profile.vitaminA * factor,
      vitaminB12: profile.vitaminB12 * factor,
      vitaminC: profile.vitaminC * factor,
      vitaminD: profile.vitaminD * factor,
      iron: profile.iron * factor,
      calcium: profile.calcium * factor,
      zinc: profile.zinc * factor,
      magnesium: profile.magnesium * factor,
    };
  }

  // Fallback: average across all categories
  const avg: MicronutrientProfile = {
    vitaminA: 46,
    vitaminB12: 0.42,
    vitaminC: 13,
    vitaminD: 0.34,
    iron: 1.16,
    calcium: 25,
    zinc: 1.04,
    magnesium: 27,
  };

  return {
    vitaminA: avg.vitaminA * factor,
    vitaminB12: avg.vitaminB12 * factor,
    vitaminC: avg.vitaminC * factor,
    vitaminD: avg.vitaminD * factor,
    iron: avg.iron * factor,
    calcium: avg.calcium * factor,
    zinc: avg.zinc * factor,
    magnesium: avg.magnesium * factor,
  };
}

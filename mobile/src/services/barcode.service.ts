/**
 * barcode.service.ts
 * Looks up food products by barcode using the Open Food Facts API.
 * Returns normalized nutrition data per 100g.
 */

export interface BarcodeProduct {
  name: string;
  brand: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  serving_size: string | null;
  image_url: string | null;
}

/**
 * Looks up a barcode on Open Food Facts.
 * Returns null if not found or data is unusable.
 */
export async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'FitsiIA/1.0 (mobile app)' },
  });

  if (!res.ok) return null;

  const json = await res.json();

  if (json.status !== 1 || !json.product) return null;

  const p = json.product;
  const n = p.nutriments ?? {};

  // Require at least a name and calories to be useful
  const name = p.product_name || p.product_name_en;
  if (!name) return null;

  const calories = n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0;

  return {
    name: name.trim(),
    brand: (p.brands ?? '').trim(),
    calories: Math.round(Number(calories)),
    protein_g: Math.round(Number(n.proteins_100g ?? n.proteins ?? 0) * 10) / 10,
    carbs_g: Math.round(Number(n.carbohydrates_100g ?? n.carbohydrates ?? 0) * 10) / 10,
    fat_g: Math.round(Number(n.fat_100g ?? n.fat ?? 0) * 10) / 10,
    fiber_g: n.fiber_100g != null ? Math.round(Number(n.fiber_100g) * 10) / 10 : null,
    serving_size: p.serving_size ?? null,
    image_url: p.image_front_small_url ?? p.image_front_url ?? null,
  };
}

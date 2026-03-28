/**
 * barcode.service.ts
 * Looks up food products by barcode using Open Food Facts API.
 * Features:
 * - Local AsyncStorage cache of previously looked-up products
 * - Scan history (last 10 barcodes) persisted across sessions
 * - Fallback to Fitsi backend if OpenFoodFacts fails
 * - Normalized nutrition data per 100g
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  barcode: string;
}

export interface ScanHistoryItem {
  barcode: string;
  product: BarcodeProduct;
  scanned_at: string; // ISO date string
}

// ─── Storage keys ───────────────────────────────────────────────────────────

const CACHE_PREFIX = '@fitsi_barcode:';
const HISTORY_KEY = '@fitsi_barcode_history';
const MAX_HISTORY = 10;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Local cache helpers ────────────────────────────────────────────────────

interface CachedEntry {
  product: BarcodeProduct;
  timestamp: number;
}

async function getCachedProduct(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${barcode}`);
    if (!raw) return null;
    const entry: CachedEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${barcode}`);
      return null;
    }
    return entry.product;
  } catch {
    return null;
  }
}

async function setCachedProduct(barcode: string, product: BarcodeProduct): Promise<void> {
  try {
    const entry: CachedEntry = { product, timestamp: Date.now() };
    await AsyncStorage.setItem(`${CACHE_PREFIX}${barcode}`, JSON.stringify(entry));
  } catch {
    // Cache write failure is non-critical — silently ignore
  }
}

// ─── Scan history ───────────────────────────────────────────────────────────

/** Returns the last N scanned products (newest first). */
export async function getScanHistory(): Promise<ScanHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScanHistoryItem[];
  } catch {
    return [];
  }
}

/** Adds a product to scan history. Deduplicates by barcode, keeps last MAX_HISTORY. */
async function addToScanHistory(product: BarcodeProduct): Promise<void> {
  try {
    const history = await getScanHistory();

    // Remove existing entry for this barcode (if re-scanned)
    const filtered = history.filter((h) => h.barcode !== product.barcode);

    // Prepend new entry (newest first)
    const newItem: ScanHistoryItem = {
      barcode: product.barcode,
      product,
      scanned_at: new Date().toISOString(),
    };
    const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);

    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // History write failure is non-critical
  }
}

/** Clears all scan history. */
export async function clearScanHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore
  }
}

// ─── Open Food Facts lookup ─────────────────────────────────────────────────

/** Partial shape of the Open Food Facts v2 API product response. */
interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    serving_size?: string;
    image_front_small_url?: string;
    image_front_url?: string;
    nutriments?: Record<string, number | string | undefined>;
  };
}

function parseOpenFoodFactsResponse(json: OpenFoodFactsResponse, barcode: string): BarcodeProduct | null {
  if (json.status !== 1 || !json.product) return null;

  const p = json.product;
  const n = p.nutriments ?? {};

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
    barcode,
  };
}

async function fetchFromOpenFoodFacts(code: string): Promise<BarcodeProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FitsiIA/1.0 (mobile app)' },
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const json = (await res.json()) as OpenFoodFactsResponse;
    return parseOpenFoodFactsResponse(json, code);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Fitsi backend fallback ─────────────────────────────────────────────────

async function fetchFromBackend(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await api.get(`/api/food/barcode/${encodeURIComponent(code)}`);
    const d = res.data;
    if (!d || !d.food_name) return null;

    return {
      name: d.food_name,
      brand: d.brand ?? '',
      calories: Math.round(Number(d.calories ?? 0)),
      protein_g: Math.round(Number(d.protein_g ?? 0) * 10) / 10,
      carbs_g: Math.round(Number(d.carbs_g ?? 0) * 10) / 10,
      fat_g: Math.round(Number(d.fats_g ?? d.fat_g ?? 0) * 10) / 10,
      fiber_g: d.fiber_g != null ? Math.round(Number(d.fiber_g) * 10) / 10 : null,
      serving_size: d.serving_size ?? null,
      image_url: d.image_url ?? null,
      barcode: code,
    };
  } catch {
    return null;
  }
}

// ─── Main lookup function ───────────────────────────────────────────────────

/**
 * Looks up a barcode with the following priority:
 * 1. Local cache (AsyncStorage) — instant
 * 2. Open Food Facts API — primary source
 * 3. Fitsi backend — fallback if OFF fails
 *
 * On success: caches the product and adds it to scan history.
 * Returns null if not found in any source.
 */
export async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
  // 1. Check local cache
  const cached = await getCachedProduct(code);
  if (cached) {
    // Still add to history to update scanned_at timestamp
    await addToScanHistory(cached);
    return cached;
  }

  // 2. Try Open Food Facts
  let product = await fetchFromOpenFoodFacts(code);

  // 3. Fallback to Fitsi backend
  if (!product) {
    product = await fetchFromBackend(code);
  }

  // Cache and record history on success
  if (product) {
    await setCachedProduct(code, product);
    await addToScanHistory(product);
  }

  return product;
}

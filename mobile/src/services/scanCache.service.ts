/**
 * scanCache.service.ts
 * Local cache for food scan results using AsyncStorage.
 * Keeps recent scans available offline and tracks sync status.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SCAN_CACHE_KEY = '@fitsi_scan_cache';
const MAX_CACHE_ITEMS = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CachedScan {
  id: string;
  imageUri: string;
  result: {
    food_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    confidence: number;
    ai_provider: string;
  };
  timestamp: string;
  synced: boolean;
}

async function loadScans(): Promise<CachedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveScans(scans: CachedScan[]): Promise<void> {
  await AsyncStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(scans));
}

/** Save a scan result to local cache. */
export async function cacheScanResult(scan: CachedScan): Promise<void> {
  const scans = await loadScans();
  // Avoid duplicates by id
  const filtered = scans.filter((s) => s.id !== scan.id);
  filtered.unshift(scan);
  // Trim to max items
  const trimmed = filtered.slice(0, MAX_CACHE_ITEMS);
  await saveScans(trimmed);
}

/** Get all cached scans, newest first. */
export async function getCachedScans(): Promise<CachedScan[]> {
  return loadScans();
}

/** Mark a scan as synced (saved to backend DB). */
export async function markScanSynced(id: string): Promise<void> {
  const scans = await loadScans();
  const idx = scans.findIndex((s) => s.id === id);
  if (idx >= 0) {
    scans[idx].synced = true;
    await saveScans(scans);
  }
}

/** Remove scans older than 7 days. */
export async function cleanOldScans(): Promise<void> {
  const scans = await loadScans();
  const cutoff = Date.now() - MAX_AGE_MS;
  const fresh = scans.filter((s) => new Date(s.timestamp).getTime() > cutoff);
  if (fresh.length !== scans.length) {
    await saveScans(fresh);
  }
}

/**
 * Reusable formatting utilities for the Fitsi app.
 */

const MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/** "1,234 kcal" */
export function formatCalories(n: number): string {
  return `${n.toLocaleString('es-CL')} kcal`;
}

/** "42g" or "42 mg" */
export function formatMacro(n: number, unit: string = 'g'): string {
  return `${n}${unit}`;
}

/** "72.5 kg" */
export function formatWeight(n: number): string {
  return `${n % 1 === 0 ? n : n.toFixed(1)} kg`;
}

/** "22 Mar 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "1h 30m" or "45m" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** "1.2K" or "12.5M" or raw number if < 1000 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

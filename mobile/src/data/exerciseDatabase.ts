/**
 * exerciseDatabase.ts — Local exercise database with MET values for Fitsi AI
 *
 * 50 common exercises organized by category.
 * MET values sourced from the Compendium of Physical Activities (Ainsworth et al., 2011).
 *
 * Calorie calculation:
 *   kcal/min = MET * weightKg * 3.5 / 200
 *   (simplified Compendium formula)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ExerciseCategory =
  | 'running'
  | 'walking'
  | 'cycling'
  | 'swimming'
  | 'weights'
  | 'yoga'
  | 'hiit'
  | 'sports';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** Metabolic Equivalent of Task — energy cost relative to rest */
  met: number;
  icon: string; // Ionicons name
  color: string;
}

// ─── Category metadata ──────────────────────────────────────────────────────

export interface CategoryInfo {
  key: ExerciseCategory;
  label: string;
  icon: string;
  color: string;
}

export const EXERCISE_CATEGORIES: CategoryInfo[] = [
  { key: 'running',  label: 'Running',    icon: 'walk-outline',        color: '#EA4335' },
  { key: 'walking',  label: 'Walking',    icon: 'footsteps-outline',   color: '#F59E0B' },
  { key: 'cycling',  label: 'Cycling',    icon: 'bicycle-outline',     color: '#10B981' },
  { key: 'swimming', label: 'Swimming',   icon: 'water-outline',       color: '#3B82F6' },
  { key: 'weights',  label: 'Weights',    icon: 'barbell-outline',     color: '#6366F1' },
  { key: 'yoga',     label: 'Yoga',       icon: 'body-outline',        color: '#8B5CF6' },
  { key: 'hiit',     label: 'HIIT',       icon: 'flash-outline',       color: '#EF4444' },
  { key: 'sports',   label: 'Sports',     icon: 'football-outline',    color: '#F97316' },
];

// ─── Exercise Database (50 exercises) ───────────────────────────────────────

export const exerciseDatabase: Exercise[] = [
  // ── Running (7) ───────────────────────────────────────────────────────────
  { id: 'ex-run01', name: 'Correr (ritmo suave)',       category: 'running', met: 7.0,  icon: 'walk-outline',      color: '#EA4335' },
  { id: 'ex-run02', name: 'Correr (ritmo moderado)',    category: 'running', met: 9.8,  icon: 'walk-outline',      color: '#EA4335' },
  { id: 'ex-run03', name: 'Correr (ritmo rapido)',      category: 'running', met: 11.5, icon: 'walk-outline',      color: '#EA4335' },
  { id: 'ex-run04', name: 'Sprint / Intervalos',        category: 'running', met: 14.0, icon: 'walk-outline',      color: '#EA4335' },
  { id: 'ex-run05', name: 'Trail running',              category: 'running', met: 10.0, icon: 'walk-outline',      color: '#EA4335' },
  { id: 'ex-run06', name: 'Trotar en cinta',            category: 'running', met: 8.0,  icon: 'walk-outline',      color: '#EA4335' },
  { id: 'ex-run07', name: 'Correr escaleras',           category: 'running', met: 15.0, icon: 'walk-outline',      color: '#EA4335' },

  // ── Walking (5) ───────────────────────────────────────────────────────────
  { id: 'ex-wlk01', name: 'Caminar (paseo)',            category: 'walking', met: 3.0,  icon: 'footsteps-outline', color: '#F59E0B' },
  { id: 'ex-wlk02', name: 'Caminar rapido',             category: 'walking', met: 4.5,  icon: 'footsteps-outline', color: '#F59E0B' },
  { id: 'ex-wlk03', name: 'Power walking',              category: 'walking', met: 5.0,  icon: 'footsteps-outline', color: '#F59E0B' },
  { id: 'ex-wlk04', name: 'Senderismo',                 category: 'walking', met: 6.0,  icon: 'footsteps-outline', color: '#F59E0B' },
  { id: 'ex-wlk05', name: 'Caminar en pendiente',       category: 'walking', met: 5.5,  icon: 'footsteps-outline', color: '#F59E0B' },

  // ── Cycling (6) ───────────────────────────────────────────────────────────
  { id: 'ex-cyc01', name: 'Bicicleta (recreativo)',     category: 'cycling', met: 4.0,  icon: 'bicycle-outline',   color: '#10B981' },
  { id: 'ex-cyc02', name: 'Bicicleta (moderado)',       category: 'cycling', met: 6.8,  icon: 'bicycle-outline',   color: '#10B981' },
  { id: 'ex-cyc03', name: 'Bicicleta (intenso)',        category: 'cycling', met: 10.0, icon: 'bicycle-outline',   color: '#10B981' },
  { id: 'ex-cyc04', name: 'Spinning / Indoor cycling',  category: 'cycling', met: 8.5,  icon: 'bicycle-outline',   color: '#10B981' },
  { id: 'ex-cyc05', name: 'Mountain bike',              category: 'cycling', met: 8.5,  icon: 'bicycle-outline',   color: '#10B981' },
  { id: 'ex-cyc06', name: 'Bicicleta estacionaria',     category: 'cycling', met: 5.5,  icon: 'bicycle-outline',   color: '#10B981' },

  // ── Swimming (5) ──────────────────────────────────────────────────────────
  { id: 'ex-swm01', name: 'Nadar (libre, suave)',       category: 'swimming', met: 5.8,  icon: 'water-outline',    color: '#3B82F6' },
  { id: 'ex-swm02', name: 'Nadar (libre, moderado)',    category: 'swimming', met: 7.0,  icon: 'water-outline',    color: '#3B82F6' },
  { id: 'ex-swm03', name: 'Nadar (libre, intenso)',     category: 'swimming', met: 9.8,  icon: 'water-outline',    color: '#3B82F6' },
  { id: 'ex-swm04', name: 'Nadar (espalda)',            category: 'swimming', met: 4.8,  icon: 'water-outline',    color: '#3B82F6' },
  { id: 'ex-swm05', name: 'Nadar (pecho)',              category: 'swimming', met: 10.3, icon: 'water-outline',    color: '#3B82F6' },

  // ── Weights (8) ───────────────────────────────────────────────────────────
  { id: 'ex-wgt01', name: 'Pesas (general)',            category: 'weights', met: 5.0,  icon: 'barbell-outline',   color: '#6366F1' },
  { id: 'ex-wgt02', name: 'Pesas (intenso)',            category: 'weights', met: 6.0,  icon: 'barbell-outline',   color: '#6366F1' },
  { id: 'ex-wgt03', name: 'Sentadillas / Squats',       category: 'weights', met: 5.5,  icon: 'barbell-outline',   color: '#6366F1' },
  { id: 'ex-wgt04', name: 'Peso muerto / Deadlift',     category: 'weights', met: 6.0,  icon: 'barbell-outline',   color: '#6366F1' },
  { id: 'ex-wgt05', name: 'Press de banca',             category: 'weights', met: 5.0,  icon: 'barbell-outline',   color: '#6366F1' },
  { id: 'ex-wgt06', name: 'Maquinas / Cables',          category: 'weights', met: 3.5,  icon: 'barbell-outline',   color: '#6366F1' },
  { id: 'ex-wgt07', name: 'Calistenia / Bodyweight',    category: 'weights', met: 4.0,  icon: 'barbell-outline',   color: '#6366F1' },
  { id: 'ex-wgt08', name: 'Kettlebell',                 category: 'weights', met: 6.0,  icon: 'barbell-outline',   color: '#6366F1' },

  // ── Yoga (5) ──────────────────────────────────────────────────────────────
  { id: 'ex-yog01', name: 'Yoga (Hatha)',               category: 'yoga',    met: 2.5,  icon: 'body-outline',      color: '#8B5CF6' },
  { id: 'ex-yog02', name: 'Yoga (Vinyasa)',             category: 'yoga',    met: 4.0,  icon: 'body-outline',      color: '#8B5CF6' },
  { id: 'ex-yog03', name: 'Yoga (Power)',               category: 'yoga',    met: 5.0,  icon: 'body-outline',      color: '#8B5CF6' },
  { id: 'ex-yog04', name: 'Pilates',                    category: 'yoga',    met: 3.0,  icon: 'body-outline',      color: '#8B5CF6' },
  { id: 'ex-yog05', name: 'Estiramientos / Stretching', category: 'yoga',    met: 2.3,  icon: 'body-outline',      color: '#8B5CF6' },

  // ── HIIT (6) ──────────────────────────────────────────────────────────────
  { id: 'ex-hit01', name: 'HIIT (general)',             category: 'hiit',    met: 8.0,  icon: 'flash-outline',     color: '#EF4444' },
  { id: 'ex-hit02', name: 'Tabata',                     category: 'hiit',    met: 9.0,  icon: 'flash-outline',     color: '#EF4444' },
  { id: 'ex-hit03', name: 'CrossFit / WOD',             category: 'hiit',    met: 9.0,  icon: 'flash-outline',     color: '#EF4444' },
  { id: 'ex-hit04', name: 'Circuito de ejercicios',     category: 'hiit',    met: 8.0,  icon: 'flash-outline',     color: '#EF4444' },
  { id: 'ex-hit05', name: 'Saltar la cuerda',           category: 'hiit',    met: 11.0, icon: 'flash-outline',     color: '#EF4444' },
  { id: 'ex-hit06', name: 'Burpees',                    category: 'hiit',    met: 8.0,  icon: 'flash-outline',     color: '#EF4444' },

  // ── Sports (8) ────────────────────────────────────────────────────────────
  { id: 'ex-spt01', name: 'Futbol',                     category: 'sports',  met: 7.0,  icon: 'football-outline',  color: '#F97316' },
  { id: 'ex-spt02', name: 'Basketball',                 category: 'sports',  met: 6.5,  icon: 'basketball-outline', color: '#F97316' },
  { id: 'ex-spt03', name: 'Tenis',                      category: 'sports',  met: 7.3,  icon: 'tennisball-outline', color: '#F97316' },
  { id: 'ex-spt04', name: 'Padel',                      category: 'sports',  met: 6.0,  icon: 'tennisball-outline', color: '#F97316' },
  { id: 'ex-spt05', name: 'Voleibol',                   category: 'sports',  met: 4.0,  icon: 'football-outline',  color: '#F97316' },
  { id: 'ex-spt06', name: 'Boxeo / Kickboxing',         category: 'sports',  met: 7.8,  icon: 'fitness-outline',   color: '#F97316' },
  { id: 'ex-spt07', name: 'Artes marciales',            category: 'sports',  met: 6.0,  icon: 'fitness-outline',   color: '#F97316' },
  { id: 'ex-spt08', name: 'Escalada (indoor)',          category: 'sports',  met: 5.8,  icon: 'trending-up',       color: '#F97316' },
];

// ─── Calorie Calculation ────────────────────────────────────────────────────

/**
 * Calculate calories burned using the standard MET formula.
 *
 * Formula: kcal/min = MET * weightKg * 3.5 / 200
 *
 * @param met        - MET value of the exercise
 * @param weightKg   - User's body weight in kilograms
 * @param durationMin - Duration of exercise in minutes
 * @returns Estimated calories burned (rounded to nearest integer)
 */
export function calculateCalories(met: number, weightKg: number, durationMin: number): number {
  if (met <= 0 || weightKg <= 0 || durationMin <= 0) return 0;
  return Math.round((met * weightKg * 3.5 / 200) * durationMin);
}

/**
 * Estimate kcal/min for a given exercise and weight.
 * Useful for displaying real-time calorie estimates while user adjusts duration.
 */
export function caloriesPerMinute(met: number, weightKg: number): number {
  if (met <= 0 || weightKg <= 0) return 0;
  return met * weightKg * 3.5 / 200;
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Search exercises by name (case-insensitive, accent-tolerant).
 * Returns all exercises if query is empty.
 */
export function searchExercises(query: string, category?: ExerciseCategory): Exercise[] {
  let results = exerciseDatabase;

  if (category) {
    results = results.filter((ex) => ex.category === category);
  }

  if (!query.trim()) return results;

  const normalized = normalizeText(query);
  return results.filter((ex) => normalizeText(ex.name).includes(normalized));
}

/**
 * Get exercises by category.
 */
export function getExercisesByCategory(category: ExerciseCategory): Exercise[] {
  return exerciseDatabase.filter((ex) => ex.category === category);
}

/**
 * Find a single exercise by ID.
 */
export function getExerciseById(id: string): Exercise | undefined {
  return exerciseDatabase.find((ex) => ex.id === id);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Remove diacritics and lowercase for accent-tolerant search. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

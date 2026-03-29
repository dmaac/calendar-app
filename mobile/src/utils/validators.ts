/**
 * Reusable validation utilities for the Fitsi app.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

export function isValidPassword(s: string): PasswordValidation {
  const errors: string[] = [];
  if (s.length < 8) errors.push('Debe tener al menos 8 caracteres');
  if (!/[A-Z]/.test(s)) errors.push('Debe incluir al menos una mayuscula');
  if (!/[a-z]/.test(s)) errors.push('Debe incluir al menos una minuscula');
  if (!/\d/.test(s)) errors.push('Debe incluir al menos un numero');
  return { valid: errors.length === 0, errors };
}

/** Valid weight range: 20-300 kg */
export function isValidWeight(n: number): boolean {
  return Number.isFinite(n) && n >= 20 && n <= 300;
}

/** Valid height range: 100-250 cm */
export function isValidHeight(n: number): boolean {
  return Number.isFinite(n) && n >= 100 && n <= 250;
}

/** Valid calorie range: 0-10000 */
export function isValidCalories(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 10000;
}

/**
 * rates.js
 * Regla única para las tasas de esfuerzo en los formularios de la librería.
 *
 * La tasa es un % del esfuerzo estándar: 1 = 100%, 1.5 = 150%, 0.25 = 25%.
 * - Todo campo de tasa arranca con 1 ESCRITO (a la vista): nada se completa por detrás.
 * - No se puede terminar de configurar con una tasa vacía o en 0.
 * - Acepta cualquier decimal (0.25, 0.30, 1.75…): paso de 0.01.
 */

export const DEFAULT_RATE = 1;

/** Tasa válida: un número mayor que 0. */
export const isValidRate = (v) => v !== '' && v !== null && v !== undefined && Number(v) > 0;

/** Propiedades comunes de los <input> de tasa. */
export const RATE_INPUT_PROPS = { type: 'number', step: '0.01', min: '0.01' };

/**
 * Tasa → % de esfuerzo como lo escribe TQC: 1.5 → "+50%", 0.12 → "−88%", 1 → "0%".
 * (tasa = 1 + %)
 */
export const rateAsEffortPct = (v) => {
  if (!isValidRate(v)) return '';
  const pct = Math.round((Number(v) - 1) * 1000) / 10;
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${Math.abs(pct)}%` : '0%';
};

/** Valor del <input> → número o '' (vacío se conserva para que el bloqueo lo vea). */
export const rateFromInput = (value) => (value === '' ? '' : parseFloat(value));

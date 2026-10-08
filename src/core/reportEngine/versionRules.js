/**
 * versionRules.js
 * Reglas de los nombres de versión de las plataformas con versión (LATAM, VOD, OFF AIR...).
 *
 * El número final del nombre ("LAT_ORI_HD 3", "BRA_SUB_HD 11") está atado a una duración.
 * Esa relación es una TABLA, un número por fila, que se edita en Librerías → Versiones →
 * "Números finales de versión" (libraryStore.suffixRules): [{ id, number, duration }].
 *
 * Para qué se usa:
 *  - Al registrar una versión: da la duración y solo deja elegir categorías de esa duración.
 *    La categoría (serie o película) la elige el usuario: la duración sola no lo decide.
 *  - En la auditoría: explica por qué una versión no registrada no se puede crear todavía.
 * NO se usa para contar: una versión que no está registrada no se cuenta ni se estima.
 */

// Tabla inicial (la que estaba fija en el código). El usuario la amplía en la librería.
export const DEFAULT_SUFFIX_RULES = [
  [1, 30], [2, 30], [3, 30], [4, 30],
  [5, 60], [6, 60],
  [9, 120], [10, 120],
].map(([number, duration]) => ({ id: `sfx-${number}`, number, duration }));

/**
 * Tabla en su forma actual: un número por fila, sin repetidos, ordenada. También acepta el
 * formato de la primera versión del gestor ({ from, to, duration }), que se expande a un
 * número por fila.
 */
export function normalizeSuffixRules(rules) {
  const out = [];
  const seen = new Set();
  (rules || []).forEach((r) => {
    const duration = Number(r.duration);
    const numbers = r.number !== undefined
      ? [Number(r.number)]
      : Array.from({ length: Math.max(0, Number(r.to) - Number(r.from) + 1) }, (_, i) => Number(r.from) + i);
    numbers.forEach((number) => {
      if (!Number.isInteger(number) || number < 1 || !(duration > 0) || seen.has(number)) return;
      seen.add(number);
      out.push({ id: r.number !== undefined ? r.id : `${r.id}-${number}`, number, duration });
    });
  });
  return out.sort((a, b) => a.number - b.number);
}

const SUFFIX_REGEX = /\s(\d+)(?:\s+\S+)?$/;

/** Número final del nombre ("LAT_ORI_HD 3" → 3), o null si no tiene. */
export function suffixNumber(name) {
  const match = String(name || '').match(SUFFIX_REGEX);
  return match ? parseInt(match[1], 10) : null;
}

/** Duración para un número final según la tabla (null si no está en la tabla). */
export function durationForSuffix(n, rules = DEFAULT_SUFFIX_RULES) {
  const rule = normalizeSuffixRules(rules).find((r) => r.number === n);
  return rule ? rule.duration : null;
}

/**
 * Duración por número final, con 30 min si no hay número o no está en la tabla. Solo la usa
 * la carga masiva de versiones para proponer una duración (nunca el conteo).
 */
export function detectDurationFromSuffix(name, rules = DEFAULT_SUFFIX_RULES) {
  const n = suffixNumber(name);
  return (n === null ? null : durationForSuffix(n, rules)) ?? 30;
}

/**
 * Valida el número final SIN valor por defecto: distingue "sin número" (ej. códigos de
 * IBERIA) de "número que no está en la tabla" (ej. 7, 8, 13).
 * @returns {{ duration: number|null, invalidSuffix: number|null }}
 */
export function checkVersionSuffix(name, rules = DEFAULT_SUFFIX_RULES) {
  const n = suffixNumber(name);
  if (n === null) return { duration: null, invalidSuffix: null };
  const duration = durationForSuffix(n, rules);
  return duration !== null ? { duration, invalidSuffix: null } : { duration: null, invalidSuffix: n };
}

/**
 * Texto corto de la tabla para mensajes, juntando números seguidos con la misma duración:
 * "1-4 → 30 min, 5-6 → 60 min, 9-11 → 120 min".
 */
export function describeSuffixRules(rules = DEFAULT_SUFFIX_RULES) {
  const list = normalizeSuffixRules(rules);
  const parts = [];
  list.forEach((r, i) => {
    const prev = list[i - 1];
    const last = parts[parts.length - 1];
    if (last && prev && r.number === prev.number + 1 && r.duration === prev.duration) last.to = r.number;
    else parts.push({ from: r.number, to: r.number, duration: r.duration });
  });
  return parts.map((p) => `${p.from === p.to ? p.from : `${p.from}-${p.to}`} → ${p.duration} min`).join(', ');
}

/** Problema de un número nuevo contra la tabla (null si está bien). */
export function suffixRuleProblem(rule, rules = []) {
  const number = Number(rule.number);
  const duration = Number(rule.duration);
  if (!Number.isInteger(number) || number < 1) return 'El número final debe ser un entero desde 1.';
  if (!Number.isInteger(duration) || duration < 1) return 'La duración debe ser un número de minutos mayor que 0.';
  const taken = normalizeSuffixRules(rules).find((r) => r.number === number);
  if (taken) return `El número ${number} ya está en la tabla (${taken.duration} min).`;
  return null;
}

/**
 * Detecta sub-plataforma LATAM/BRAZIL desde el prefijo LAT_/BRA_ del nombre.
 * Ej: LAT_ORI_SQZ_HD 3 → 'LATAM'  |  BRA_SAP_CC_SQZ_HD 5 → 'BRAZIL'
 * @param {string} name
 * @returns {string|null} 'LATAM' | 'BRAZIL' | null
 */
export function detectSubPlatform(name) {
  if (!name) return null;
  const upper = String(name).trim().toUpperCase();
  if (/\bLAT(AM)?\b|_LAT_|_LAT\b|\bLAT_/.test(upper)) return 'LATAM';
  if (/\bBRA(SIL)?\b|_BRA_|_BRA\b|\bBRA_/.test(upper)) return 'BRAZIL';
  return null;
}

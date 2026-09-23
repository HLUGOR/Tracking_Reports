/**
 * versionRules.js
 * Fuente única de las reglas de negocio para nombres de versión de plataformas
 * con logica_de_versiones (LATAM, VOD, OFF AIR, etc.).
 *
 * Numeración cerrada de la operación: solo existen sufijos 1-4, 5-6 y 9-10.
 * No son rangos arbitrarios — la operación no genera otra numeración, así que
 * NO se deben ampliar las bandas sin confirmar con el negocio.
 *
 * Antes esta regla vivía copiada en VersionMatcher.js y en LibraryView.jsx
 * (hasta 3 copias de la misma lógica). Este archivo es la única fuente; los
 * demás módulos importan de aquí.
 */

const SUFFIX_REGEX = /\s(\d+)(?:\s+\S+)?$/;

/**
 * Lee el sufijo numérico final del nombre y lo traduce a minutos si pertenece
 * a la numeración soportada.
 * @param {string} name
 * @returns {{ suffix: number|null, duration: number|null }}
 *   suffix:   el número encontrado al final del nombre (null si no hay sufijo)
 *   duration: minutos si el sufijo es válido (1-4→30, 5-6→60, 9-10→120); null si no
 */
function parseSuffix(name) {
  const match = String(name || '').match(SUFFIX_REGEX);
  if (!match) return { suffix: null, duration: null };
  const n = parseInt(match[1], 10);
  let duration = null;
  if (n >= 1 && n <= 4) duration = 30;
  else if (n >= 5 && n <= 6) duration = 60;
  else if (n >= 9 && n <= 10) duration = 120;
  return { suffix: n, duration };
}

/**
 * Duración por sufijo, con el fallback histórico de 30 min cuando no hay
 * sufijo o el sufijo no es válido. Usado por el motor de reportes (versiones
 * no registradas) y por la importación masiva de versiones.
 * @param {string} name
 * @returns {number} minutos
 */
export function detectDurationFromSuffix(name) {
  const { duration } = parseSuffix(name);
  return duration ?? 30;
}

/**
 * Valida el sufijo SIN aplicar el fallback de 30 min — distingue "sin sufijo"
 * (ej. códigos estilo IBERIA, que no siguen esta convención) de "sufijo fuera
 * de la numeración soportada" (ej. 7, 8, 11+). Usado por el formulario manual
 * de creación de versión para bloquear altas con numeración inválida.
 * @param {string} name
 * @returns {{ duration: number|null, invalidSuffix: number|null }}
 */
export function checkVersionSuffix(name) {
  const { suffix, duration } = parseSuffix(name);
  if (duration !== null) return { duration, invalidSuffix: null };
  if (suffix === null) return { duration: null, invalidSuffix: null };
  return { duration: null, invalidSuffix: suffix };
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

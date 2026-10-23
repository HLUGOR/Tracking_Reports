/**
 * VersionMatcher.js
 * Cruza el nombre de versión del Excel contra la librería de versiones (libraryStore).
 * Equivalente a classifyVersionUnified() + detectPlatformFromVersion() de server.cjs
 *
 * Para logica_de_versiones:
 *   1º busca en librería (coincidencia exacta, case-insensitive)
 *   2º si no está → fallback numérico por sufijo del nombre (replica logicas.json):
 *      - sufijo 1-4  → 30 min
 *      - sufijo 5-6  → 60 min
 *      - sufijo 9-10 → 120 min
 *      - default     → 30 min
 *
 * Detección de sub-plataforma (LAT vs BRA):
 *   El nombre de versión puede contener el prefijo LAT o BRA para separar
 *   LATAM de BRAZIL en métricas, aunque ambas pertenezcan a la plataforma LATAM.
 *   Ej: LAT_ORI_SQZ_HD 3 → LATAM | BRA_SAP_CC_SQZ_HD 5 → BRAZIL
 */

import { detectDurationFromSuffix, detectSubPlatform } from './versionRules';

// logica_duracion_rangos: bandas de DURATION (minutos) → duración con la que cuenta la fila.
// El orden es el de las casillas de la plataforma (1ª = 30, 2ª = 60, 3ª = 120).
export const DURACION_BANDS = [
  { from: 10, to: 30, minutes: 30 },
  { from: 40, to: 60, minutes: 60 },
  { from: 100, to: 240, minutes: 120 },
];
const DURACION_MIN = DURACION_BANDS[0].from;
const DURACION_MAX = DURACION_BANDS[DURACION_BANDS.length - 1].to;

class VersionMatcher {
  /**
   * Normaliza nombre de editor (trim + Title Case)
   */
  static normalizeEditorName(name) {
    const trimmed = (name || 'Sin asignar').trim();
    if (!trimmed) return 'Sin asignar';
    // \b\w no reconoce letras acentuadas como parte de la palabra ("jesús" → "JesúS");
    // se usa \p{L} para capitalizar solo la primera letra de cada palabra.
    return trimmed.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase());
  }

  /**
   * Detecta sub-plataforma (LATAM o BRAZIL) desde el nombre de versión.
   * Replica detectPlatformFromVersion() de server.cjs.
   *
   * LAT_ORI_SQZ_HD 3  → 'LATAM'
   * BRA_SAP_CC_SQZ_HD 5 → 'BRAZIL'
   * IBERIA_...          → null (no aplica)
   *
   * @param {string} versionName
   * @returns {string|null} 'LATAM' | 'BRAZIL' | null
   */
  static detectSubPlatform(versionName) {
    return detectSubPlatform(versionName);
  }

  /**
   * Clasifica una versión de IBERIA buscándola en la librería (versions/categories),
   * igual que classify() para logica_de_versiones — pero SIN el fallback numérico
   * por sufijo: si el nombre no está registrado, se marca como no registrada y el
   * caller la descarta (los códigos de IBERIA son genéricos, no hay sufijo del que
   * adivinar una duración razonable).
   *
   * @param {string} versionName
   * @param {Array}  versions    - libraryStore.versions
   * @param {Array}  categories  - libraryStore.categories
   * @param {number|string|null} platformId - id de la plataforma de la fila que se está
   *   clasificando. Si hay varias versiones con el mismo nombre en distintas plataformas,
   *   se prefiere la de esta plataforma; si no hay ninguna, cae a la primera coincidencia
   *   global (mismo comportamiento histórico).
   * @returns {{ category_key: string|null, duration_minutes: number, registered: boolean, subPlatform: null }}
   */
  static classifyIberia(versionName, versions = [], categories = [], platformId = null) {
    const trimmed = (versionName || '').trim();
    if (!trimmed) {
      return { category_key: null, duration_minutes: 0, registered: false, subPlatform: null };
    }

    const found = this.findVersionByName(trimmed, versions, platformId);
    if (!found) {
      return { category_key: null, duration_minutes: 0, registered: false, subPlatform: null };
    }

    const cat = categories.find((c) => c.id === found.categoryId);
    const duration = Number(found.duration) || Number(cat?.duration) || 0;
    return {
      category_key: cat?.id || found.categoryId || 'desconocido',
      duration_minutes: duration,
      registered: true,
      subPlatform: null,
    };
  }

  /**
   * Detecta duración por sufijo numérico del nombre de versión.
   * Replica las reglas de fallback de logicas.json.
   * @param {string} versionName
   * @returns {number} duration_minutes
   */
  static detectDurationFromSuffix(versionName) {
    return detectDurationFromSuffix(versionName);
  }

  /**
   * Busca una versión por nombre (exacto, case-insensitive). Si el nombre existe en más
   * de una plataforma, prefiere la que coincide con platformId (la plataforma de la fila
   * que se está clasificando) para que el motor nunca pueda tomar por accidente la
   * duración/categoría de otra plataforma. Si no hay ninguna coincidencia en esa
   * plataforma, cae a la primera coincidencia global — el mismo comportamiento histórico,
   * que sostiene el diseño de "librería global" (una plataforma nueva hereda versiones
   * ya registradas por otra sin tener que volver a crearlas).
   *
   * @param {string} trimmed     - nombre ya trim()eado
   * @param {Array}  versions    - libraryStore.versions
   * @param {number|string|null} platformId
   * @returns {Object|undefined}
   */
  static findVersionByName(trimmed, versions, platformId) {
    const matches = versions.filter(
      (v) => (v.name || '').trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (matches.length === 0) return undefined;
    if (platformId == null) return matches[0];
    return matches.find((v) => String(v.platformId) === String(platformId)) || matches[0];
  }

  /**
   * Busca la versión en la librería. Si no está registrada, aplica fallback numérico.
   * También detecta sub-plataforma (LAT/BRA) para plataformas tipo LATAM.
   *
   * @param {string} versionName - Versión que viene del Excel (columna VERSION)
   * @param {Array}  versions    - libraryStore.versions
   * @param {Array}  categories  - libraryStore.categories
   * @param {number|string|null} platformId - id de la plataforma de la fila que se está
   *   clasificando (ver findVersionByName).
   * @returns {{
   *   category_key: string|null,
   *   duration_minutes: number,
   *   registered: boolean,
   *   subPlatform: string|null   // 'LATAM' | 'BRAZIL' | null
   * }}
   */
  static classify(versionName, versions = [], categories = [], platformId = null) {
    if (!versionName || !versionName.trim()) {
      return { category_key: null, duration_minutes: 0, registered: false, subPlatform: null };
    }

    const trimmed = versionName.trim();
    const subPlatform = this.detectSubPlatform(trimmed);

    // 1. Buscar coincidencia exacta (case-insensitive) en la librería,
    //    priorizando la propia plataforma de esta fila (ver findVersionByName).
    const found = this.findVersionByName(trimmed, versions, platformId);

    if (found) {
      const cat = categories.find((c) => c.id === found.categoryId);
      // Duración: primero la de la versión, luego la de la categoría como fallback
      const duration = Number(found.duration) || Number(cat?.duration) || 0;
      return {
        category_key: cat?.id || found.categoryId || 'desconocido',
        duration_minutes: duration,
        registered: true,
        subPlatform,
      };
    }

    // 2. No encontrada → fallback numérico (registered: false para que el caller sepa)
    const fallbackMinutes = this.detectDurationFromSuffix(trimmed);
    return {
      category_key: 'unregistered',
      duration_minutes: fallbackMinutes,
      registered: false,
      subPlatform,
    };
  }

  /**
   * Para plataformas logica_duracion_rangos: clasifica por la columna DURATION (columna L del input)
   * en una de 3 bandas fijas. La fila cuenta con la duración de la banda, no con la escrita:
   *   10 a 30   → 30 min   (casilla 1)
   *   40 a 60   → 60 min   (casilla 2)
   *   100 a 240 → 120 min  (casilla 3)
   * Valores entre bandas (31-39, 61-99) se redondean a la banda de borde más cercano
   * (empate → la menor: 35 → 30, 80 → 60) y la fila sale con rounded: true para que el
   * caller la avise en la auditoría. Vacío, 0, texto o fuera
   * de 10-240 no se adivinan: registered: false.
   *
   * categorias = [{key, duration, effortRate}, ...]: 1ª = 30, 2ª = 60, 3ª = 120.
   * (El formato antiguo de strings se convierte al cargar los datos: utils/platformCasillas.js)
   *
   * @param {number} minutes - DURATION ya convertida a minutos
   * @returns {{ category_key: string|null, duration_minutes: number, registered: boolean, rounded: boolean, subPlatform: null }}
   */
  static classifyByDuration(minutes, platformConfig) {
    const fail = { category_key: null, duration_minutes: 0, registered: false, rounded: false, subPlatform: null };
    const m = Number(minutes);
    if (!(m >= DURACION_MIN && m <= DURACION_MAX)) return fail;

    const idx = DURACION_BANDS.findIndex((b) => m >= b.from && m <= b.to);
    const inBand = idx >= 0;
    // Entre bandas: la de borde más cercano (empate → la menor)
    const dist = (b) => (m < b.from ? b.from - m : m - b.to);
    const target = inBand ? idx : DURACION_BANDS.reduce((best, b, i) => (dist(b) < dist(DURACION_BANDS[best]) ? i : best), 0);
    const cat = (platformConfig?.categorias || [])[target];
    if (!cat?.key) return fail;
    return {
      category_key: cat.key,
      duration_minutes: DURACION_BANDS[target].minutes,
      registered: true,
      rounded: !inBand,
      subPlatform: null,
    };
  }
}

export default VersionMatcher;

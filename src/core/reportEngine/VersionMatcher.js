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

class VersionMatcher {
  /**
   * Normaliza nombre de editor (trim + Title Case)
   */
  static normalizeEditorName(name) {
    const trimmed = (name || 'Sin asignar').trim();
    if (!trimmed) return 'Sin asignar';
    return trimmed.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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
   * Para plataformas logica_sin_version: clasifica por columna SEASON.
   * season != '0' y no vacío → primera categoría (serie)
   * season = '0' o vacío    → segunda categoría (película)
   *
   * Soporta dos formatos:
   * 1. Antiguo: categorias = ['serie_45min', 'pelicula_120min'], duracion_serie_minutos: 45, duracion_pelicula_minutos: 120
   * 2. Nuevo:  categorias = [{key: 'serie_45min', duration: 45}, {key: 'pelicula_120min', duration: 120}]
   *
   * SIN valores por defecto: si la categoría correspondiente no tiene una duración
   * configurada (> 0), no se adivina ningún número — se devuelve registered: false
   * para que el caller descarte la fila y quede visible en la auditoría, en vez de
   * contarla con un valor inventado (60/120 no son un respaldo válido, son un dato
   * de negocio que el administrador tiene que haber configurado).
   *
   * @returns {{ category_key: string|null, duration_minutes: number, registered: boolean, subPlatform: null }}
   */
  static classifyBySeason(seasonVal, platformConfig) {
    const season = String(seasonVal || '').trim();
    const isPelicula = season === '' || season === '0';

    const cats = platformConfig?.categorias || [];
    const isNewFormat = cats.length > 0 && typeof cats[0] === 'object';

    let key, duration;
    if (isNewFormat) {
      // Nuevo formato: array de objetos {key, duration}. Primera = serie, segunda = película.
      const cat = isPelicula ? cats[1] : cats[0];
      key = cat?.key;
      duration = Number(cat?.duration) || 0;
    } else {
      // Formato antiguo: array de strings directos (migración)
      key = isPelicula ? cats[1] : cats[0];
      duration = Number(isPelicula
        ? platformConfig?.duracion_pelicula_minutos
        : platformConfig?.duracion_serie_minutos) || 0;
    }

    if (duration <= 0) {
      return { category_key: null, duration_minutes: 0, registered: false, subPlatform: null };
    }
    return {
      category_key: key || (isPelicula ? 'pelicula' : 'serie'),
      duration_minutes: duration,
      registered: true,
      subPlatform: null,
    };
  }
}

export default VersionMatcher;

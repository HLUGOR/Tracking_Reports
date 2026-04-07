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
    if (!versionName) return null;
    const upper = versionName.trim().toUpperCase();
    if (/\bLAT(AM)?\b|_LAT_|_LAT\b|\bLAT_/.test(upper)) return 'LATAM';
    if (/\bBRA(SIL)?\b|_BRA_|_BRA\b|\bBRA_/.test(upper)) return 'BRAZIL';
    return null;
  }

  /**
   * Detecta duración por sufijo numérico del nombre de versión.
   * Replica las reglas de fallback de logicas.json.
   * @param {string} versionName
   * @returns {number} duration_minutes
   */
  static detectDurationFromSuffix(versionName) {
    const match = String(versionName || '').match(/\s(\d+)(?:\s+\S+)?$/);
    if (!match) return 30;
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= 4) return 30;
    if (n >= 5 && n <= 6) return 60;
    if (n >= 9 && n <= 10) return 120;
    return 30;
  }

  /**
   * Busca la versión en la librería. Si no está registrada, aplica fallback numérico.
   * También detecta sub-plataforma (LAT/BRA) para plataformas tipo LATAM.
   *
   * @param {string} versionName - Versión que viene del Excel (columna VERSION)
   * @param {Array}  versions    - libraryStore.versions
   * @param {Array}  categories  - libraryStore.categories
   * @returns {{
   *   category_key: string|null,
   *   duration_minutes: number,
   *   registered: boolean,
   *   subPlatform: string|null   // 'LATAM' | 'BRAZIL' | null
   * }}
   */
  static classify(versionName, versions = [], categories = []) {
    if (!versionName || !versionName.trim()) {
      return { category_key: null, duration_minutes: 0, registered: false, subPlatform: null };
    }

    const trimmed = versionName.trim();
    const subPlatform = this.detectSubPlatform(trimmed);

    // 1. Buscar coincidencia exacta (case-insensitive) en la librería
    const found = versions.find(
      (v) => (v.name || '').trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (found) {
      const cat = categories.find((c) => c.id === found.categoryId);
      // Duración: primero la de la versión, luego la de la categoría como fallback
      const duration = Number(found.duration) || Number(cat?.duration) || 0;
      return {
        category_key: cat?.name || found.categoryId || 'desconocido',
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
   * season != '0' y no vacío → serie
   * season = '0' o vacío    → película
   */
  static classifyBySeason(seasonVal, platformConfig) {
    const season = String(seasonVal || '').trim();
    const duracionSerie = platformConfig?.duracion_serie_minutos || 45;
    const duracionPelicula = platformConfig?.duracion_pelicula_minutos || 120;
    const categorySerie = platformConfig?.categorias?.[0] || 'serie';
    const categoryPelicula = platformConfig?.categorias?.[1] || 'pelicula';

    if (season === '' || season === '0') {
      return { category_key: categoryPelicula, duration_minutes: duracionPelicula, registered: true, subPlatform: null };
    }
    return { category_key: categorySerie, duration_minutes: duracionSerie, registered: true, subPlatform: null };
  }
}

export default VersionMatcher;

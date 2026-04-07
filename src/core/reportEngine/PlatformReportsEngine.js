/**
 * PlatformReportsEngine.js
 * Motor principal de reportes de plataforma × editor × categoría.
 *
 * Es el equivalente client-side de buildPlatformVersionReport() de server.cjs.
 * Fuente de datos: Excel (excelStore) + Librería (libraryStore) en lugar de SQLite.
 *
 * Lógicas soportadas:
 *   - logica_de_versiones : busca VERSION en la librería → categoría + duración reales
 *   - logica_sin_version  : usa columna SEASON → serie (season != '0') o película (season = '0')
 *   - iberia_especial     : igual que logica_de_versiones, pero sin fallback (si no está registrada, no cuenta)
 *
 * Columnas esperadas del Excel (post-mapeo por ColumnMapper):
 *   EDITOR, VERSION, PLATFORM, SEASON, AIR_DATE, APPROVED_DATE
 */

import VersionMatcher from './VersionMatcher';

// ─── Configuración de plataformas (mirror de plataforma_config.json) ─────────
// Se inicializa desde libraryStore.platforms al llamar al motor.
// Esta config se puede extender desde LibraryView en el futuro.
const DEFAULT_PLATAFORMA_CONFIG = {
  'SONY ONE': {
    logica: 'logica_sin_version',
    duracion_serie_minutos: 45,
    duracion_pelicula_minutos: 120,
    categorias: ['serie_45min', 'pelicula_120min'],
  },
  AMAZON: {
    logica: 'logica_sin_version',
    duracion_serie_minutos: 60,
    duracion_pelicula_minutos: 120,
    categorias: ['serie_amazon_60min', 'pelicula_amazon_120min'],
  },
};

// Lógica por defecto para plataformas no configuradas explícitamente
const DEFAULT_LOGICA = 'logica_de_versiones';

class PlatformReportsEngine {
  /**
   * Construye el reporte plataforma × editor × categoría.
   *
   * @param {Array}  rows       - Filas del Excel (ya mapeadas por ColumnMapper)
   * @param {Date}   startDate  - Fecha de inicio del filtro
   * @param {Date}   endDate    - Fecha de fin del filtro
   * @param {Object} library    - { platforms, categories, versions } de libraryStore
   * @param {string} dateField  - Columna de fecha a usar para filtrar (default: 'approved_date')
   *                              Opciones: 'approved_date', 'air_date', 'all' (sin filtro de fecha)
   * @returns {Object} resultado del reporte
   */
  static buildReport(rows, startDate, endDate, library = {}, dateField = 'approved_date') {
    const { platforms = [], categories = [], versions = [] } = library;

    // Construir mapa de plataformas válidas desde la librería
    // (plataforma existe si está registrada en libraryStore.platforms)
    const validPlatforms = new Set(
      platforms.map((p) => (p.name || '').trim().toUpperCase())
    );

    // Construir mapa de configuración: primero las de libraryStore, fallback a DEFAULT
    // Las plataformas en libraryStore tienen: { name, logica, duracion_serie_minutos, duracion_pelicula_minutos, categorias }
    const plataformaConfig = {};
    platforms.forEach((p) => {
      const key = (p.name || '').trim().toUpperCase();
      plataformaConfig[key] = p;
    });
    // Agregar las de DEFAULT que no estén en librería
    Object.entries(DEFAULT_PLATAFORMA_CONFIG).forEach(([key, cfg]) => {
      if (!plataformaConfig[key]) plataformaConfig[key] = cfg;
    });

    // ── Mapa de categorías por plataforma (replica getCategoriesForPlatform de server.cjs) ──
    // Permite resolver claves genéricas ('unregistered') al nombre real de la categoría
    // configurada por plataforma, usando la duración como clave de matching.
    const platformIdToName = {};
    platforms.forEach((p) => {
      platformIdToName[p.id] = (p.name || '').trim().toUpperCase();
    });

    // platformCategoryMap: NOMBRE_PLATAFORMA → [{id, name, duration, color}]
    // IMPORTANTE: se usa c.id como clave interna única para evitar que dos categorías con el
    // mismo nombre (ej: "serie" 30min y "serie" 60min) acumulen en el mismo bucket.
    const platformCategoryMap = {};
    categories.forEach((c) => {
      const platName = platformIdToName[c.platformId];
      if (!platName) return;
      if (!platformCategoryMap[platName]) platformCategoryMap[platName] = [];
      platformCategoryMap[platName].push({
        id: String(c.id),
        name: c.name,
        duration: Number(c.duration) || 0,
        color: c.color || '#ccc',
      });
    });

    // Resuelve cualquier clave cruda al ID único de la categoría configurada para esa plataforma.
    // Usa DURACIÓN EXACTA como fuente de verdad — replica resolveToConfigured() de server.cjs.
    // Devuelve el ID de la categoría (string) para garantizar unicidad en byCategory.
    const resolveCategoryForPlatform = (rawKey, durationMin, effectivePlatform) => {
      const platCats = platformCategoryMap[effectivePlatform] || [];
      if (platCats.length === 0) return rawKey;
      const numDur = Number(durationMin) || 0;
      if (numDur > 0) {
        const byDuration = platCats.find((c) => c.duration === numDur);
        if (byDuration) return byDuration.id; // ID único → sin colisión entre "serie 30" y "serie 60"
        return rawKey; // duración sin categoría → clave cruda (se ve como 'unregistered')
      }
      // Sin duración → usar ID si el nombre coincide
      const byName = platCats.find((c) => c.name === rawKey);
      return byName ? byName.id : rawKey;
    };

    // Parsear fechas límite
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate + 'T23:59:59');

    // Conjuntos de auditoría
    const unregisteredVersions = new Set();
    const unregisteredPlatforms = new Set();
    const discardedRows = [];

    // Mapa principal: platform → editor → category → { count, minutes }
    const platformMap = {};

    rows.forEach((row) => {
      // ── Leer y normalizar campos del Excel (post-mapeo) ──────────────────
      const editor = VersionMatcher.normalizeEditorName(row.editor || row.EDITOR);
      const version = String(row.version || row.VERSION || '').trim();
      const platform = String(row.platform || row.PLATFORM || '').trim().toUpperCase();
      const season = String(row.season || row.SEASON || '').trim();
      // ── Filtro por fecha (usa dateField: por defecto APPROVED_DATE) ────────
      // dateField puede ser: 'approved_date', 'air_date', o 'all' (sin filtro)
      let passesDateFilter = true;
      if (dateField !== 'all') {
        const dateRaw = row[dateField] || row[dateField.toUpperCase()] || '';
        const rowDate = this.parseDate(dateRaw);
        passesDateFilter = rowDate && rowDate >= start && rowDate <= end;
      }
      if (!passesDateFilter) return;

      // ── Validar plataforma ────────────────────────────────────────────────
      if (!platform) {
        discardedRows.push({ row, reason: 'PLATFORM vacío' });
        return;
      }
      if (!validPlatforms.has(platform)) {
        unregisteredPlatforms.add(platform);
        discardedRows.push({ row, reason: `PLATFORM no registrada: ${platform}` });
        return;
      }

      // ── Determinar lógica de la plataforma ────────────────────────────────
      const cfg = plataformaConfig[platform];
      const logica = cfg?.logica || DEFAULT_LOGICA;

      // ── Clasificar según lógica ───────────────────────────────────────────
      let classified;

      if (logica === 'logica_sin_version') {
        // Usar columna SEASON, no la librería de versiones
        classified = VersionMatcher.classifyBySeason(season, cfg);
      } else if (logica === 'iberia_especial') {
        // Solo librería, SIN fallback: si no está registrada → no cuenta
        classified = VersionMatcher.classify(version, versions, categories);
        if (!classified.registered) {
          unregisteredVersions.add(version);
          discardedRows.push({ row, reason: `IBERIA: versión no registrada: ${version}` });
          return;
        }
      } else {
        // logica_de_versiones: buscar en librería primero.
        // Si no está → fallback numérico por sufijo (replica Tracking_Project).
        // La fila SÍ suma minutos (con la duración del fallback), pero se registra en audit.
        classified = VersionMatcher.classify(version, versions, categories);
        if (!classified.registered) {
          unregisteredVersions.add(version);
          // classified.duration_minutes ya viene del fallback numérico (no es 0)
        }
      }

      // ── Solo contar si duration_minutes > 0 ──────────────────────────────
      if (!classified || classified.duration_minutes <= 0) return;

      const { category_key: rawCategoryKey, duration_minutes } = classified;

      // ── Determinar plataforma efectiva (LAT/BRA override) ─────────────────
      // Para logica_de_versiones: si el nombre de versión contiene prefijo LAT o BRA,
      // la fila se agrupa bajo la sub-plataforma detectada (LATAM o BRAZIL) en lugar
      // de la plataforma del Excel. Esto separa métricas aunque el Excel diga "LATAM".
      // Para iberia_especial: no aplica override (IBERIA no se sub-divide).
      // Para logica_sin_version: no aplica override (no usa versiones).
      const effectivePlatform =
        logica === 'logica_de_versiones' && classified.subPlatform
          ? classified.subPlatform
          : platform;

      // ── Resolver clave de categoría a la categoría configurada de la plataforma ──
      // Replica resolveReportCategory() de server.cjs:
      // 'unregistered' → busca la categoría de la plataforma con duración exacta.
      // Si ya coincide con una categoría de la plataforma → la deja igual.
      // Si no hay match → usa la key cruda (solo afecta a esa plataforma).
      const category_key = resolveCategoryForPlatform(rawCategoryKey, duration_minutes, effectivePlatform);

      // ── Acumular en platformMap ───────────────────────────────────────────
      if (!platformMap[effectivePlatform]) platformMap[effectivePlatform] = {};
      if (!platformMap[effectivePlatform][editor]) {
        platformMap[effectivePlatform][editor] = {
          editor,
          byCategory: {},
          totalCount: 0,
          totalMinutes: 0,
        };
      }
      if (!platformMap[effectivePlatform][editor].byCategory[category_key]) {
        platformMap[effectivePlatform][editor].byCategory[category_key] = { count: 0, minutes: 0 };
      }
      platformMap[effectivePlatform][editor].byCategory[category_key].count++;
      platformMap[effectivePlatform][editor].byCategory[category_key].minutes += duration_minutes;
      platformMap[effectivePlatform][editor].totalCount++;
      platformMap[effectivePlatform][editor].totalMinutes += duration_minutes;
    });

    // ── Construir output final ────────────────────────────────────────────
    const platformsResult = Object.entries(platformMap)
      .map(([platform, editorsObj]) => {
        const editors = Object.values(editorsObj).sort(
          (a, b) => b.totalMinutes - a.totalMinutes
        );
        const totalCount = editors.reduce((s, e) => s + e.totalCount, 0);
        const totalMinutes = editors.reduce((s, e) => s + e.totalMinutes, 0);

        // Totales por categoría (sumado de todos los editores)
        const totalByCategory = {};
        editors.forEach((e) => {
          Object.entries(e.byCategory).forEach(([cat, val]) => {
            if (!totalByCategory[cat]) totalByCategory[cat] = { count: 0, minutes: 0 };
            totalByCategory[cat].count += val.count;
            totalByCategory[cat].minutes += val.minutes;
          });
        });

        return { platform, editors, totalCount, totalMinutes, totalByCategory,
          // Categorías configuradas para esta plataforma (orden definido en LibraryView).
          // El frontend usa esta lista para los encabezados de columna, igual que
          // platformData.categories en server.cjs → PlatformVersionReport.js.
          // category_key es el ID único — el frontend lo usa para hacer lookup de label/color
          categories: (platformCategoryMap[platform] || []).map((c) => ({
            category_key: c.id,
            label: c.name,
            duration_minutes: c.duration,
            color: c.color,
          })),
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    const grandTotal = platformsResult.reduce(
      (s, p) => ({ count: s.count + p.totalCount, minutes: s.minutes + p.totalMinutes }),
      { count: 0, minutes: 0 }
    );

    return {
      period: { start, end },
      platforms: platformsResult,
      grandTotal,
      audit: {
        unregisteredVersions: [...unregisteredVersions],
        unregisteredPlatforms: [...unregisteredPlatforms],
        discardedCount: discardedRows.length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Parsea una cadena de fecha a Date.
   * Soporta: YYYY-MM-DD, DD/MM/YYYY, ISO con hora, número serial de Excel.
   * @param {string|number} dateStr
   * @returns {Date|null}
   */
  static parseDate(dateStr) {
    if (!dateStr && dateStr !== 0) return null;

    // Número serial de Excel (días desde 1/1/1900)
    if (typeof dateStr === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + dateStr * 86400000);
    }

    const s = String(dateStr).trim();
    if (!s) return null;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');

    // DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [day, month, year] = s.split('/');
      return new Date(year, month - 1, day);
    }

    // ISO con hora
    if (s.includes('T')) return new Date(s);

    // Intento genérico
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
}

export default PlatformReportsEngine;

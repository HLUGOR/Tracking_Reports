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
 *   - logica_comerciales  : suma DURATION en timecode (HH:MM:SS), cuenta assets
 *   - logica_bp_i         : suma MINUTOS netos (números simples), cuenta assets
 *
 * Columnas esperadas del Excel (post-mapeo por ColumnMapper):
 *   EDITOR, VERSION, PLATFORM, SEASON, AIR_DATE, APPROVED_DATE, DURATION (comerciales), MINUTOS (bp&i)
 */

import VersionMatcher from './VersionMatcher';

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

    // Construir mapa de plataformas válidas: solo las registradas en libraryStore
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

    // ── Mapa de categorías por plataforma (replica getCategoriesForPlatform de server.cjs) ──
    // Permite resolver claves genéricas ('unregistered') al nombre real de la categoría
    // configurada por plataforma, usando la duración como clave de matching.
    const platformIdToName = {};
    platforms.forEach((p) => {
      platformIdToName[String(p.id)] = (p.name || '').trim().toUpperCase();
    });

    // platformCategoryMap: NOMBRE_PLATAFORMA → [{id, name, duration, color}]
    // IMPORTANTE: se usa c.id como clave interna única para evitar que dos categorías con el
    // mismo nombre (ej: "serie" 30min y "serie" 60min) acumulen en el mismo bucket.
    const platformCategoryMap = {};
    categories.forEach((c) => {
      const platName = platformIdToName[String(c.platformId)];
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
    const resolveCategoryForPlatform = (rawKey, durationMin, effectivePlatform, fallbackPlatform) => {
      // Si la sub-plataforma (ej: BRAZIL) no tiene categorías propias, usar las del padre (ej: LATAM)
      const platCats = (platformCategoryMap[effectivePlatform]?.length > 0
        ? platformCategoryMap[effectivePlatform]
        : platformCategoryMap[fallbackPlatform]) || [];
      if (platCats.length === 0) return rawKey;
      const numDur = Number(durationMin) || 0;
      // Si rawKey ya es un ID válido de categoría de esta plataforma → usar directamente
      const byId = platCats.find((c) => c.id === String(rawKey));
      if (byId) return byId.id;

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
        // Lógica independiente: usa mapa propio de IBERIA, sin depender del store.
        // Si no está en el mapa → no cuenta (sin fallback).
        classified = VersionMatcher.classifyIberia(version);
        if (!classified.registered) {
          unregisteredVersions.add(version);
          discardedRows.push({ row, reason: `IBERIA: versión no registrada: ${version}` });
          return;
        }
      } else if (logica === 'logica_comerciales') {
        // Lógica Comerciales: cuenta assets y acumula DURATION en timecode.
        // No usa VERSION ni SEASON. DURATION está en formato HH:MM:SS o HH:MM:SS:FF.
        const durationRaw = String(row.duration || row.DURATION || '').trim();
        const durationSecs = PlatformReportsEngine.parseTimecode(durationRaw);
        classified = {
          category_key: null,
          duration_minutes: durationSecs / 60,
          duration_seconds: durationSecs,
          isComerciales: true,
        };
      } else if (logica === 'logica_youtube') {
        // Lógica YouTube: acumula CLIP y SHORT como conteos independientes por editor.
        // Lee columnas 'CLIP' y 'SHORT' (case-insensitive) directamente del Excel.
        const clipKey   = Object.keys(row).find((k) => k.trim().toLowerCase() === 'clip');
        const shortKey  = Object.keys(row).find((k) => k.trim().toLowerCase() === 'short');
        const clipVal   = parseInt(clipKey  ? row[clipKey]  : 0, 10) || 0;
        const shortVal  = parseInt(shortKey ? row[shortKey] : 0, 10) || 0;
        classified = {
          category_key: null,
          duration_minutes: 0,
          duration_seconds: 0,
          isYoutube: true,
          clips: clipVal,
          shorts: shortVal,
        };
      } else if (logica === 'logica_bp_i') {
        // Lógica BP&I: cuenta assets y acumula MINUTOS netos (números simples).
        // No usa VERSION ni SEASON. Acepta columna llamada 'MINUTOS' o 'DURATION' (case-insensitive).
        // Diferencia con logica_comerciales: interpreta el valor como número, no timecode.
        const minutosKey = Object.keys(row).find(
          (k) => ['minutos', 'duration'].includes(k.trim().toLowerCase())
        );
        const minutesRaw = String(minutosKey ? row[minutosKey] : '').trim();
        const minutes = parseFloat(minutesRaw) || 0;
        classified = {
          category_key: null,
          duration_minutes: minutes,
          duration_seconds: 0, // no aplica para BP&I
          isBPI: true,
        };
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

      // ── Solo contar si hay classified; para comerciales/BP&I/YouTube se permiten duraciones 0 ──
      if (!classified) return;
      if (!classified.isComerciales && !classified.isBPI && !classified.isYoutube && classified.duration_minutes <= 0) return;

      const { category_key: rawCategoryKey, duration_minutes } = classified;

      // ── Determinar plataforma efectiva (LAT/BRA override) ─────────────────
      // Solo aplica cuando la plataforma del Excel ES LATAM: el prefijo LAT_/BRA_
      // separa LATAM de BRAZIL. Para OFF AIR, VOD y otras plataformas que usan la
      // librería global de versiones, el prefijo LAT_/BRA_ NO debe re-asignar la fila.
      const effectivePlatform =
        logica === 'logica_de_versiones' && classified.subPlatform && platform === 'LATAM'
          ? classified.subPlatform
          : platform;

      // ── Resolver clave de categoría a la categoría configurada de la plataforma ──
      // Replica resolveReportCategory() de server.cjs:
      // 'unregistered' → busca la categoría de la plataforma con duración exacta.
      // Si ya coincide con una categoría de la plataforma → la deja igual.
      // Si no hay match → usa la key cruda (solo afecta a esa plataforma).
      // Pasa 'platform' como fallback: si BRAZIL no tiene categorías, usa las de LATAM
      const category_key = resolveCategoryForPlatform(rawCategoryKey, duration_minutes, effectivePlatform, platform);

      // ── Acumular en platformMap ───────────────────────────────────────────
      if (!platformMap[effectivePlatform]) platformMap[effectivePlatform] = {};
      if (!platformMap[effectivePlatform][editor]) {
        platformMap[effectivePlatform][editor] = {
          editor,
          byCategory: {},
          totalCount: 0,
          totalMinutes: 0,
          totalSeconds: 0,
        };
      }
      // Para logica_comerciales y logica_bp_i no acumulamos por categoría (category_key es null)
      // Para logica_youtube acumulamos CLIPS y SHORTS en byCategory
      if (classified.isYoutube) {
        if (!platformMap[effectivePlatform][editor].byCategory['clips']) {
          platformMap[effectivePlatform][editor].byCategory['clips'] = { count: 0, minutes: 0 };
        }
        if (!platformMap[effectivePlatform][editor].byCategory['shorts']) {
          platformMap[effectivePlatform][editor].byCategory['shorts'] = { count: 0, minutes: 0 };
        }
        platformMap[effectivePlatform][editor].byCategory['clips'].count  += classified.clips;
        platformMap[effectivePlatform][editor].byCategory['shorts'].count += classified.shorts;
        platformMap[effectivePlatform][editor].totalCount += (classified.clips + classified.shorts);
      } else if (category_key !== null) {
        if (!platformMap[effectivePlatform][editor].byCategory[category_key]) {
          platformMap[effectivePlatform][editor].byCategory[category_key] = { count: 0, minutes: 0 };
        }
        platformMap[effectivePlatform][editor].byCategory[category_key].count++;
        platformMap[effectivePlatform][editor].byCategory[category_key].minutes += duration_minutes;
        platformMap[effectivePlatform][editor].totalCount++;
      } else {
        platformMap[effectivePlatform][editor].totalCount++;
      }
      platformMap[effectivePlatform][editor].totalMinutes += duration_minutes;
      platformMap[effectivePlatform][editor].totalSeconds += (classified.duration_seconds || 0);
    });

    // ── Construir output final ────────────────────────────────────────────
    const platformsResult = Object.entries(platformMap)
      .map(([platform, editorsObj]) => {
        const cfg = plataformaConfig[platform];
        const logica = cfg?.logica || DEFAULT_LOGICA;
        const editors = Object.values(editorsObj).sort(
          (a, b) => b.totalMinutes - a.totalMinutes
        );
        const totalCount = editors.reduce((s, e) => s + e.totalCount, 0);
        const totalMinutes = editors.reduce((s, e) => s + e.totalMinutes, 0);
        const totalSeconds = editors.reduce((s, e) => s + (e.totalSeconds || 0), 0);

        // Totales por categoría (sumado de todos los editores)
        const totalByCategory = {};
        editors.forEach((e) => {
          Object.entries(e.byCategory).forEach(([cat, val]) => {
            if (!totalByCategory[cat]) totalByCategory[cat] = { count: 0, minutes: 0 };
            totalByCategory[cat].count += val.count;
            totalByCategory[cat].minutes += val.minutes;
          });
        });

        // ── Construir lista de categorías según lógica ────────────────────
        let categoriesResult;

        if (logica === 'logica_sin_version') {
          // Categorías vienen de la config estática, no del store.
          // cfg.categorias = ['serie_45min', 'pelicula_120min'] (formato antiguo)
          const cfgCats = cfg?.categorias || [];
          const durSerie = cfg?.duracion_serie_minutos || 45;
          const durPelicula = cfg?.duracion_pelicula_minutos || 120;
          categoriesResult = cfgCats.map((cat, idx) => {
            const isLast = idx === cfgCats.length - 1;
            const dur = isLast ? durPelicula : durSerie;
            // Extraer nombre legible: 'serie_45min' → 'serie', 'pelicula_120min' → 'pelicula'
            const name = String(cat).replace(/_\d+min$/i, '').replace(/_/g, ' ');
            return { category_key: cat, label: name, duration_minutes: dur, color: '#ccc' };
          });
        } else {
          // Categorías del store (logica_de_versiones, iberia_especial, etc.)
          const subPlatformParent = { 'BRAZIL': 'LATAM', 'LATAM': 'LATAM' };
          const resolvedCatMap =
            platformCategoryMap[platform]?.length > 0
              ? platformCategoryMap[platform]
              : platformCategoryMap[subPlatformParent[platform]] || [];

          categoriesResult = resolvedCatMap.map((c) => {
            let duration = c.duration || 0;
            if (!duration) {
              const m = (c.name || '').match(/(\d+)\s*(?:min)?\s*$/i);
              if (m) duration = Number(m[1]);
            }
            return { category_key: c.id, label: c.name, duration_minutes: duration, color: c.color };
          });
        }

        return { platform, logica, editors, totalCount, totalMinutes, totalSeconds, totalByCategory,
          categories: categoriesResult,
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
  /**
   * Parsea un timecode HH:MM:SS o HH:MM:SS:FF a segundos totales.
   * @param {string} tc - timecode (ej: "00:01:30:00" o "00:01:30")
   * @returns {number} segundos totales
   */
  static parseTimecode(tc) {
    if (!tc) return 0;
    const parts = String(tc).trim().split(':');
    if (parts.length < 3) return 0;
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    // parts[3] = frames → se ignora
    return h * 3600 + m * 60 + s;
  }

  /**
   * Calcula horas de esfuerzo por editor agrupadas por effortGroup de plataforma.
   *
   * Reglas por lógica:
   *   - logica_de_versiones / iberia_especial / logica_sin_version:
   *       Horas = Σ(count_categoría × effortRate_categoría)
   *   - logica_comerciales:
   *       Horas = totalSeconds / 3600
   *   - logica_bp_i:
   *       Horas = totalMinutes / 60
   *   - logica_youtube:
   *       Horas = totalCount (1 hora por clip/short, sin effortRate)
   *
   * @param {Object} platformResult - Resultado de buildReport()
   * @param {Object} library        - { platforms, categories } de libraryStore
   * @param {number} baseHours      - Horas base para % ocupación (default: 192)
   * @returns {{ editors, effortGroups, baseHours }}
   */
  static buildEffortReport(platformResult, library, baseHours = 192) {
    const { platforms: libPlatforms = [], categories: libCategories = [] } = library;

    // categoryId (string) → { effortRate, durationHours }
    const categoryInfoMap = {};
    libCategories.forEach((c) => {
      const rate = parseFloat(c.effortRate);
      const dur = Number(c.duration) || 0;
      if (!isNaN(rate) && rate > 0) {
        categoryInfoMap[String(c.id)] = { effortRate: rate, durationHours: dur / 60 };
      }
    });

    // platformName → { effortGroup, logica, platformEffortRate, categoryKeyRateMap }
    const platCfgMap = {};
    libPlatforms.forEach((p) => {
      const name = (p.name || '').trim().toUpperCase();
      const rawRate = parseFloat(p.platformEffortRate);
      // Para logica_sin_version: mapa key → { effortRate, durationHours } desde p.categorias
      const categoryKeyRateMap = {};
      (p.categorias || []).forEach((cat) => {
        const rate = parseFloat(cat.effortRate);
        const dur = Number(cat.duration) || 0;
        if (cat.key && !isNaN(rate) && rate > 0) {
          categoryKeyRateMap[cat.key] = { effortRate: rate, durationHours: dur / 60 };
        }
      });
      platCfgMap[name] = {
        effortGroup: (p.effortGroup || '').trim() || 'OTROS',
        logica: p.logica || 'logica_de_versiones',
        platformEffortRate: !isNaN(rawRate) && rawRate > 0 ? rawRate : 1,
        categoryKeyRateMap,
      };
    });

    // Collect ordered distinct groups (OTROS always last)
    const groupOrderMap = new Map();
    libPlatforms.forEach((p) => {
      const g = (p.effortGroup || '').trim();
      if (g && !groupOrderMap.has(g)) groupOrderMap.set(g, groupOrderMap.size);
    });
    if (!groupOrderMap.has('OTROS')) groupOrderMap.set('OTROS', groupOrderMap.size);
    const effortGroups = [...groupOrderMap.keys()].sort(
      (a, b) => groupOrderMap.get(a) - groupOrderMap.get(b)
    );

    // Sub-plataformas derivadas: heredan config de su plataforma padre
    // BRAZIL se genera automáticamente desde versiones de LATAM, no existe como entrada en libraryStore
    const subPlatformParentMap = { 'BRAZIL': 'LATAM' };

    // editor → { byGroup: { groupName: hours }, totalHours, pctOcupacion, pctFreeTime }
    const editorMap = {};

    (platformResult.platforms || []).forEach((plt) => {
      const platName = (plt.platform || '').trim().toUpperCase();
      const parentName = subPlatformParentMap[platName];
      const cfg = platCfgMap[platName] || (parentName ? platCfgMap[parentName] : null) || { effortGroup: 'OTROS', logica: 'logica_de_versiones', platformEffortRate: 1, categoryKeyRateMap: {} };
      const { effortGroup, logica, platformEffortRate, categoryKeyRateMap } = cfg;

      plt.editors.forEach((ed) => {
        if (!editorMap[ed.editor]) {
          editorMap[ed.editor] = { editor: ed.editor, byGroup: {} };
        }
        if (!editorMap[ed.editor].byGroup[effortGroup]) {
          editorMap[ed.editor].byGroup[effortGroup] = 0;
        }

        let hours = 0;
        if (logica === 'logica_comerciales') {
          hours = ((ed.totalSeconds || 0) / 3600) * platformEffortRate;
        } else if (logica === 'logica_bp_i') {
          hours = ((ed.totalMinutes || 0) / 60) * platformEffortRate;
        } else if (logica === 'logica_youtube') {
          hours = (ed.totalCount || 0) * platformEffortRate;
        } else if (logica === 'logica_sin_version') {
          // count × (duracion_min / 60) × effortRate por cada key
          Object.entries(ed.byCategory || {}).forEach(([catKey, catData]) => {
            const info = categoryKeyRateMap[catKey];
            if (info != null) hours += (catData.count || 0) * info.durationHours * info.effortRate;
          });
          // Fallback: si no hay tasas por key, usar totalMinutes × platformEffortRate
          if (hours === 0 && Object.keys(categoryKeyRateMap).length === 0) {
            hours = ((ed.totalMinutes || 0) / 60) * platformEffortRate;
          }
        } else {
          // logica_de_versiones, iberia_especial: count × (duracion_min / 60) × effortRate
          Object.entries(ed.byCategory || {}).forEach(([catId, catData]) => {
            const info = categoryInfoMap[String(catId)];
            if (info != null) {
              hours += (catData.count || 0) * info.durationHours * info.effortRate;
            }
          });
        }

        editorMap[ed.editor].byGroup[effortGroup] += hours;
      });
    });

    const editors = Object.values(editorMap)
      .map((ed) => {
        const totalHours = Object.values(ed.byGroup).reduce((s, h) => s + h, 0);
        const pctOcupacion = baseHours > 0 ? (totalHours / baseHours) * 100 : 0;
        const pctFreeTime = Math.max(0, 100 - pctOcupacion);
        return {
          editor: ed.editor,
          byGroup: ed.byGroup,
          totalHours: Math.round(totalHours * 10) / 10,
          pctOcupacion: Math.round(pctOcupacion),
          pctFreeTime: Math.round(pctFreeTime),
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);

    return { editors, effortGroups, baseHours };
  }

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

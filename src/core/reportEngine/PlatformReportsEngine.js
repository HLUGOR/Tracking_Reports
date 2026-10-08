/**
 * PlatformReportsEngine.js
 * Motor principal de reportes de plataforma × editor × categoría.
 *
 * Es el equivalente client-side de buildPlatformVersionReport() de server.cjs.
 * Fuente de datos: Excel (excelStore) + Librería (libraryStore) en lugar de SQLite.
 *
 * Lógicas soportadas:
 *   - logica_de_versiones : busca VERSION en la librería → categoría + duración reales.
 *                           Si no está registrada NO se cuenta (no se estima nada).
 *   - logica_sin_version  : usa columna SEASON → serie (season != '0') o película (season = '0')
 *   - iberia_especial     : igual que logica_de_versiones, pero sin fallback (si no está registrada, no cuenta)
 *   - logica_comerciales  : suma DURATION en timecode (HH:MM:SS), cuenta assets
 *   - logica_bp_i         : suma MINUTOS netos (números simples), cuenta assets
 *   - logica_por_duracion : suma DURATION (minutos o tiempo HH:MM:SS), cuenta assets;
 *                           horas = minutos ÷ 60 × tasa de la plataforma (COMPLIANCE)
 *   - logica_duracion_categorias : DURATION decide la categoría (la de la librería con esa
 *                           duración exacta, ej. 30/60/120) y cada categoría tiene su tasa.
 *                           VERSION = "REPROSS" marca la fila como REPROCESO: va a su
 *                           columna "R" (clave "R:<id categoría>") con su propia tasa.
 *
 * Columnas esperadas del Excel (post-mapeo por ColumnMapper):
 *   EDITOR, VERSION, PLATFORM, SEASON, AIR_DATE, APPROVED_DATE, DURATION (comerciales), MINUTOS (bp&i)
 */

import VersionMatcher from './VersionMatcher';
import { checkVersionSuffix, DEFAULT_SUFFIX_RULES } from './versionRules';
import { parseInputDate, approvedDateOf } from '../utils/dateUtils';
import { buildEditorIndex, editorKey } from '../utils/editorRegistry';

// Agrupa filas de auditoría por plataforma + motivo:
// [{ platform, motivo, count, values: [hasta 10 valores distintos], rows: [nº de fila del Excel] }],
// de más a menos filas.
const groupByReason = (list) => Object.values(list.reduce((acc, d) => {
  const k = `${d.platform}|${d.motivo}`;
  if (!acc[k]) acc[k] = { platform: d.platform, motivo: d.motivo, count: 0, values: [], rows: [] };
  acc[k].count++;
  if (d.value && acc[k].values.length < 10 && !acc[k].values.includes(d.value)) acc[k].values.push(d.value);
  if (d.rowNum) acc[k].rows.push(d.rowNum);
  return acc;
}, {})).sort((a, b) => b.count - a.count);

// Reproceso (logica_duracion_categorias): VERSION = "REPROSS". En byCategory la fila va
// a la clave "R:<id de la categoría>" para contarla y tasarla aparte de lo nuevo.
export const REPROCESS_MARK = 'REPROSS';
export const REPROCESS_PREFIX = 'R:';
export const isReprocessKey = (key) => String(key).startsWith(REPROCESS_PREFIX);

// Lógica por defecto para plataformas no configuradas explícitamente
const DEFAULT_LOGICA = 'logica_de_versiones';

class PlatformReportsEngine {
  /**
   * Construye el reporte plataforma × editor × categoría.
   *
   * @param {Array}  rows       - Filas del Excel (ya mapeadas por ColumnMapper)
   * @param {Date}   startDate  - Fecha de inicio del filtro
   * @param {Date}   endDate    - Fecha de fin del filtro
   * @param {Object} library    - { platforms, categories, versions, editors } de libraryStore.
   *                              Si trae editors, el EDITOR de cada fila tiene que estar
   *                              registrado (Apellido Nombre); si no, la fila no se cuenta.
   * @param {string} dateField  - Columna de fecha a usar para filtrar (default: 'approved_date')
   *                              Opciones: 'approved_date', 'air_date', 'all' (sin filtro de fecha)
   * @returns {Object} resultado del reporte
   */
  static buildReport(rows, startDate, endDate, library = {}, dateField = 'approved_date') {
    const { platforms = [], categories = [], versions = [] } = library;
    // Registro de editores (solo si la librería lo trae): nombre exacto "Apellido Nombre"
    const editorIndex = Array.isArray(library.editors) ? buildEditorIndex(library.editors) : null;
    // Tabla de números finales de versión → duración (Librerías → Versiones)
    const suffixRules = library.suffixRules || DEFAULT_SUFFIX_RULES;
    // Motivo de auditoría de una versión no registrada: si su número final no está en la
    // tabla, hay que agregarlo primero; si está, solo falta crear la versión.
    const unregisteredMotivo = (version) => (checkVersionSuffix(version, suffixRules).invalidSuffix !== null
      ? 'versión no registrada — su número final no está en la tabla (agrégalo en Librerías → Versiones → Números finales) y luego créala'
      : 'versión no registrada — créala en Librerías → Versiones');

    // Construir mapa de plataformas válidas: solo las registradas en libraryStore
    const validPlatforms = new Set(
      platforms.map((p) => (p.name || '').trim().toUpperCase())
    );

    // Construir mapa de configuración: primero las de libraryStore, fallback a DEFAULT
    // Las plataformas en libraryStore tienen: { name, logica, categorias, ... }
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
    // Parsear fechas límite (AAAA-MM-DD de los selectores de la pantalla). Fin = último
    // instante de ese día.
    const start = parseInputDate(startDate);
    const endDay = parseInputDate(endDate);
    const end = endDay ? new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999) : null;

    // Conjuntos de auditoría.
    // Regla del negocio: una VERSION que no está en la librería no se cuenta, no se suma
    // ni se muestra, y no se le estima ninguna duración. Solo aparece en la auditoría.
    const unregisteredVersionsDiscarded = new Set();
    const unregisteredPlatforms = new Set();
    // Filas cuya APPROVED_DATE está vacía o no es una fecha MM/DD/AAAA válida.
    // valor tal como vino → cantidad de filas
    const invalidApprovedDates = {}; // valor → { count, rows }
    // Filas dentro del rango de fechas (con "Todos los registros", todas)
    let rowsInRange = 0;
    // Filas que sí se contaron (dentro del rango y sin ningún problema)
    let countedRows = 0;
    const discardedRows = [];
    // Registra una fila no contada con su motivo (para el desglose de la auditoría).
    // motivo: texto fijo en español (se traduce en la vista); value: dato de la fila que lo causó.
    const discard = (row, platform, motivo, value = '') => {
      discardedRows.push({ row, platform, motivo, value, rowNum: row.__row });
    };
    // Filas que SÍ se cuentan pero con un dato que hay que revisar (alerta en la auditoría)
    const warnedRows = [];
    const warn = (row, platform, motivo, value = '') => {
      warnedRows.push({ row, platform, motivo, value, rowNum: row.__row });
    };

    // Mapa principal: platform → editor → category → { count, minutes }
    const platformMap = {};

    rows.forEach((row) => {
      // ── Leer y normalizar campos del Excel (post-mapeo) ──────────────────
      const rawEditor = String(row.editor ?? row.EDITOR ?? '').trim();
      let editor = VersionMatcher.normalizeEditorName(rawEditor);
      const version = String(row.version || row.VERSION || '').trim();
      const platform = String(row.platform || row.PLATFORM || '').trim().toUpperCase();
      const season = String(row.season || row.SEASON || '').trim();
      // ── Fecha de aprobación: toda fila debe traerla (MM/DD/AAAA) ───────────
      // Si falta o no es válida se anota en la auditoría. Con "Todos los registros" la
      // fila se cuenta igual; con un rango de fechas no se puede ubicar y queda fuera.
      const approvedRaw = approvedDateOf(row);
      if (!parseInputDate(approvedRaw)) {
        const shown = String(approvedRaw ?? '').trim();
        invalidApprovedDates[shown] ??= { count: 0, rows: [] };
        invalidApprovedDates[shown].count++;
        if (row.__row) invalidApprovedDates[shown].rows.push(row.__row);
      }

      // ── Filtro por fecha ('approved_date', 'air_date' o 'all' = sin filtro) ──
      if (dateField !== 'all') {
        const dateRaw = dateField === 'approved_date'
          ? approvedRaw
          : (row[dateField] ?? row[dateField.toUpperCase()] ?? '');
        const rowDate = parseInputDate(dateRaw);
        if (!rowDate) {
          discard(row, platform, 'sin fecha válida (no se puede ubicar en el rango)', String(dateRaw ?? '').trim());
          return;
        }
        if (!start || !end || rowDate < start || rowDate > end) return;
      }
      rowsInRange++;

      // ── Validar plataforma ────────────────────────────────────────────────
      if (!platform) {
        discard(row, '', 'PLATFORM vacío');
        return;
      }
      if (!validPlatforms.has(platform)) {
        unregisteredPlatforms.add(platform);
        discard(row, platform, 'plataforma no registrada');
        return;
      }

      // ── Validar editor: nombre registrado tal cual ("Apellido Nombre") ────────
      if (editorIndex) {
        if (!rawEditor) {
          discard(row, platform, 'sin EDITOR');
          return;
        }
        const registered = editorIndex[editorKey(rawEditor)];
        if (!registered) {
          discard(row, platform, 'editor no registrado — corregir en el input (Apellido Nombre)', rawEditor);
          return;
        }
        editor = registered;
      }

      // ── Determinar lógica de la plataforma ────────────────────────────────
      const cfg = plataformaConfig[platform];
      const logica = cfg?.logica || DEFAULT_LOGICA;

      // ── Clasificar según lógica ───────────────────────────────────────────
      let classified;

      if (logica === 'logica_sin_version') {
        // Usar columna SEASON, no la librería de versiones.
        // Sin fallback: si la categoría de serie o película no tiene duración
        // configurada, no se adivina — se descarta y queda visible en auditoría.
        classified = VersionMatcher.classifyBySeason(season, cfg);
        if (!classified.registered) {
          discard(row, platform, season === '' || season === '0'
            ? 'categoría de película sin duración configurada'
            : 'categoría de serie sin duración configurada');
          return;
        }
      } else if (logica === 'logica_duracion_categorias') {
        // DURATION decide la categoría: la de esta plataforma con esa duración exacta.
        // Sin categoría registrada para esa duración → no cuenta y queda en la auditoría
        // (las categorías se agregan en la librería, no se adivinan).
        const durationRaw = String(row.duration || row.DURATION || '').trim();
        const minutes = PlatformReportsEngine.parseMinutes(durationRaw);
        if (minutes <= 0) {
          discard(row, platform, PlatformReportsEngine.durationProblem(durationRaw), durationRaw);
          return;
        }
        const cat = (platformCategoryMap[platform] || []).find((c) => c.duration === minutes);
        if (!cat) {
          discard(row, platform, 'duración sin categoría registrada', durationRaw);
          return;
        }
        const isReprocess = version.toUpperCase() === REPROCESS_MARK;
        if (version && !isReprocess) warn(row, platform, 'VERSION no reconocida (dato basura; se contó como nuevo)', version);
        classified = {
          category_key: isReprocess ? `${REPROCESS_PREFIX}${cat.id}` : cat.id,
          duration_minutes: minutes,
          duration_seconds: 0,
          isDurCat: true,
        };
      } else if ((logica === 'iberia_especial' || logica === 'logica_de_versiones') && !version) {
        discard(row, platform, 'sin VERSION');
        return;
      } else if (logica === 'iberia_especial') {
        // Igual que logica_de_versiones (busca en la librería), pero SIN fallback
        // numérico por sufijo: si el nombre no está registrado, no cuenta.
        classified = VersionMatcher.classifyIberia(version, versions, categories, cfg?.id);
        if (!classified.registered) {
          unregisteredVersionsDiscarded.add(version);
          discard(row, platform, unregisteredMotivo(version), version);
          return;
        }
      } else if (logica === 'logica_comerciales') {
        // Lógica Comerciales: cuenta assets y acumula DURATION en timecode.
        // No usa VERSION ni SEASON. DURATION está en formato HH:MM:SS o HH:MM:SS:FF.
        const durationRaw = String(row.duration || row.DURATION || '').trim();
        const durationSecs = PlatformReportsEngine.parseTimecode(durationRaw);
        // Cómo calcular COMERCIALES está pendiente (reunión TQC): la pieza se sigue
        // contando, pero si la duración no es un tiempo válido queda como alerta.
        if (!durationRaw) warn(row, platform, 'sin DURATION (0 minutos)');
        else if (!PlatformReportsEngine.isValidTimecode(durationRaw)) {
          const problem = PlatformReportsEngine.durationProblem(durationRaw);
          warn(row, platform, problem === 'DURATION no es un número de minutos'
            ? 'DURATION no es un tiempo HH:MM:SS' : problem, durationRaw);
        }
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
        // Acepta minutos ("30") o tiempo ("00:30:00"), igual que logica_por_duracion.
        // Vacía o con texto: no se cuenta y queda en la auditoría (antes contaba 0 min).
        const minutes = PlatformReportsEngine.parseMinutes(minutesRaw);
        if (minutes <= 0) {
          discard(row, platform, PlatformReportsEngine.durationProblem(minutesRaw), minutesRaw);
          return;
        }
        classified = {
          category_key: null,
          duration_minutes: minutes,
          duration_seconds: 0, // no aplica para BP&I
          isBPI: true,
        };
      } else if (logica === 'logica_por_duracion') {
        // Lógica por duración (plataformas digitales tipo COMPLIANCE): los minutos salen
        // de la columna DURATION, en minutos ("30") o en tiempo ("00:30:00" / "00:30:00:00").
        // Sin valor por defecto: si DURATION está vacía o en 0, la fila no se cuenta y
        // queda en la auditoría.
        const durationRaw = String(row.duration || row.DURATION || '').trim();
        const minutes = PlatformReportsEngine.parseMinutes(durationRaw);
        if (minutes <= 0) {
          discard(row, platform, PlatformReportsEngine.durationProblem(durationRaw), durationRaw);
          return;
        }
        classified = {
          category_key: null,
          duration_minutes: minutes,
          duration_seconds: 0,
          isPorDuracion: true,
        };
      } else {
        // logica_de_versiones: la VERSION tiene que estar en la librería. Si no está,
        // no se cuenta (antes se estimaba la duración por el número final del nombre).
        classified = VersionMatcher.classify(version, versions, categories, cfg?.id);
        if (!classified.registered) {
          unregisteredVersionsDiscarded.add(version);
          discard(row, platform, unregisteredMotivo(version), version);
          return;
        }
      }

      // ── Solo contar si hay classified; para comerciales/BP&I/YouTube se permiten duraciones 0 ──
      if (!classified) return;
      if (!classified.isComerciales && !classified.isBPI && !classified.isYoutube && classified.duration_minutes <= 0) {
        discard(row, platform, 'versión sin duración configurada', version);
        return;
      }

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
      // por_duracion no usa categorías: los minutos van directo al total del editor.
      const category_key = classified.isPorDuracion
        ? null
        : classified.isDurCat
          ? rawCategoryKey
          : resolveCategoryForPlatform(rawCategoryKey, duration_minutes, effectivePlatform, platform);

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
      // Para logica_comerciales, logica_bp_i y logica_por_duracion no acumulamos por categoría (category_key es null)
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
      countedRows++;
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
          // Categorías de la propia plataforma: [0] = serie, [1] = película, objetos
          // {key, duration, effortRate}. La clave es el texto de la casilla (el mismo que usa
          // classifyBySeason en byCategory).
          categoriesResult = (cfg?.categorias || []).slice(0, 2).map((cat) => ({
            category_key: cat.key, label: cat.key, duration_minutes: Number(cat.duration) || 0, color: '#ccc',
          }));
        } else {
          // Categorías del store (logica_de_versiones, iberia_especial, etc.)
          const subPlatformParent = { 'BRAZIL': 'LATAM', 'LATAM': 'LATAM' };
          const resolvedCatMap =
            platformCategoryMap[platform]?.length > 0
              ? platformCategoryMap[platform]
              : platformCategoryMap[subPlatformParent[platform]] || [];

          categoriesResult = resolvedCatMap.flatMap((c) => {
            let duration = c.duration || 0;
            if (!duration) {
              const m = (c.name || '').match(/(\d+)\s*(?:min)?\s*$/i);
              if (m) duration = Number(m[1]);
            }
            const base = { category_key: c.id, label: c.name, duration_minutes: duration, color: c.color };
            // Columna de reproceso solo si esta categoría tiene reproceso en el período
            const rKey = `${REPROCESS_PREFIX}${c.id}`;
            return totalByCategory[rKey]
              ? [base, { ...base, category_key: rKey, isReprocess: true, baseKey: c.id }]
              : [base];
          });
        }
        const hasReprocess = Object.keys(totalByCategory).some(isReprocessKey);

        return { platform, logica, editors, totalCount, totalMinutes, totalSeconds, totalByCategory,
          categories: categoriesResult,
          hasReprocess,
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    const grandTotal = platformsResult.reduce(
      (s, p) => ({ count: s.count + p.totalCount, minutes: s.minutes + p.totalMinutes }),
      { count: 0, minutes: 0 }
    );

    return {
      period: { start, end },
      rowsInRange,
      countedRows,
      platforms: platformsResult,
      grandTotal,
      audit: {
        unregisteredVersionsDiscarded: [...unregisteredVersionsDiscarded],
        unregisteredPlatforms: [...unregisteredPlatforms],
        // [{ value: 'texto que vino' ('' = vacía), count }]
        invalidApprovedDates: Object.entries(invalidApprovedDates)
          .map(([value, d]) => ({ value, count: d.count, rows: d.rows }))
          .sort((a, b) => b.count - a.count),
        discardedCount: discardedRows.length,
        // Desglose: [{ platform, motivo, count, values: [hasta 10 valores distintos] }]
        discardedByReason: groupByReason(discardedRows),
        // Filas contadas con alerta (mismo formato)
        warnings: groupByReason(warnedRows),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Minutos y horas de esfuerzo de UNA fila, calculados con exactamente el mismo código
   * que los Reportes Plataformas y Editores. Lo usa el Reporte Series para que una fila
   * valga lo mismo en los tres reportes: una plataforma tiene una sola tasa, la de la
   * librería, en cualquier reporte.
   * Una fila que esos reportes no cuentan (plataforma no registrada, versión IBERIA no
   * registrada, sin duración...) devuelve 0 minutos y 0 horas.
   * @returns {{ minutes: number, hours: number }}
   */
  static evaluateRow(row, library) {
    const rep = this.buildReport([row], null, null, library, 'all');
    const plt = rep.platforms[0];
    if (!plt) return { minutes: 0, hours: 0 };
    const minutes = plt.logica === 'logica_comerciales' ? plt.totalSeconds / 60 : plt.totalMinutes;
    const eff = this.buildEffortReport(rep, library, 192);
    // Suma sin redondear (totalHours viene redondeado a 1 decimal para mostrar)
    const hours = eff.editors.reduce(
      (s, ed) => s + Object.values(ed.byGroup).reduce((a, h) => a + h, 0), 0
    );
    return { minutes, hours };
  }

  /**
   * Minutos de un valor de DURATION: número de minutos ("30") o tiempo ("00:30:00" /
   * "00:30:00:00"). Devuelve 0 si está vacío o no es ninguna de las dos cosas.
   */
  static parseMinutes(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return 0;
    if (s.includes(':')) return this.isValidTimecode(s) ? this.parseTimecode(s) / 60 : 0;
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : 0;
  }

  /**
   * Motivo de auditoría para una DURATION que no se pudo leer:
   *  - tiempo con minutos o segundos mayores a 59 (ej. "00:90:00")
   *  - cualquier otro texto (ej. "NAN", "REPROSS")
   */
  static durationProblem(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return 'sin DURATION';
    if (/^\d{1,2}:\d{2}:\d{2}(:\d{2})?$/.test(s)) return 'DURATION con tiempo inválido (minutos o segundos mayores a 59)';
    return 'DURATION no es un número de minutos';
  }

  /** Tiempo HH:MM:SS o HH:MM:SS:FF bien formado (minutos y segundos de 00 a 59). */
  static isValidTimecode(tc) {
    const m = String(tc ?? '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?::\d{2})?$/);
    return !!m && Number(m[2]) < 60 && Number(m[3]) < 60;
  }

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
   *   - logica_bp_i / logica_por_duracion:
   *       Horas = totalMinutes / 60 × platformEffortRate
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

    // Regla del negocio: la tasa es un % del esfuerzo estándar (1 = 100%, 1.5 = 150%,
    // 0.75 = 75%). Sin tasa configurada = estándar = 1, en cualquier lógica.
    const rateOrStandard = (v) => {
      const r = parseFloat(v);
      return !isNaN(r) && r > 0 ? r : 1;
    };

    // categoryId (string) → { effortRate, durationHours }
    const categoryInfoMap = {};
    libCategories.forEach((c) => {
      const dur = Number(c.duration) || 0;
      categoryInfoMap[String(c.id)] = { effortRate: rateOrStandard(c.effortRate), durationHours: dur / 60 };
      categoryInfoMap[`${REPROCESS_PREFIX}${c.id}`] = { effortRate: rateOrStandard(c.reprocessRate), durationHours: dur / 60 };
    });

    // platformName → { effortGroup, logica, platformEffortRate, rateMap }
    const platCfgMap = {};
    libPlatforms.forEach((p) => {
      const name = (p.name || '').trim().toUpperCase();
      // Para logica_sin_version: mapa key → { effortRate, durationHours } desde p.categorias.
      // Cada casilla sin tasa cuenta con el estándar (1).
      const categoryKeyRateMap = {};
      (p.categorias || []).forEach((cat) => {
        const dur = Number(cat.duration) || 0;
        if (cat.key) {
          categoryKeyRateMap[cat.key] = { effortRate: rateOrStandard(cat.effortRate), durationHours: dur / 60 };
        }
      });
      platCfgMap[name] = {
        effortGroup: (p.effortGroup || '').trim() || 'OTROS',
        logica: p.logica || 'logica_de_versiones',
        platformEffortRate: rateOrStandard(p.platformEffortRate),
        // Un solo mapa de tarifas por plataforma: las claves de byCategory son ids de
        // categoría (logica_de_versiones / iberia_especial) o el texto de la casilla
        // (logica_sin_version). Nunca coinciden entre sí, así que se pueden buscar en
        // el mismo mapa sin tener que decidir de antemano según la lógica.
        rateMap: { ...categoryInfoMap, ...categoryKeyRateMap },
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
    // Grupos con horas de reproceso: su columna "<grupo> REPROSS" va justo después
    const reprocessGroups = new Set();
    // Grupos de las plataformas que vienen en el input: solo esos se muestran como columnas
    const usedGroups = new Set();

    (platformResult.platforms || []).forEach((plt) => {
      const platName = (plt.platform || '').trim().toUpperCase();
      const parentName = subPlatformParentMap[platName];
      const cfg = platCfgMap[platName] || (parentName ? platCfgMap[parentName] : null) || { effortGroup: 'OTROS', logica: 'logica_de_versiones', platformEffortRate: 1, rateMap: categoryInfoMap };
      const { effortGroup, logica, platformEffortRate, rateMap } = cfg;
      usedGroups.add(effortGroup);

      plt.editors.forEach((ed) => {
        if (!editorMap[ed.editor]) {
          editorMap[ed.editor] = { editor: ed.editor, byGroup: {} };
        }
        if (!editorMap[ed.editor].byGroup[effortGroup]) {
          editorMap[ed.editor].byGroup[effortGroup] = 0;
        }

        let hours = 0;
        if (logica === 'logica_comerciales') {
          hours = (ed.totalCount || 0) * platformEffortRate;
        } else if (logica === 'logica_bp_i' || logica === 'logica_por_duracion') {
          hours = ((ed.totalMinutes || 0) / 60) * platformEffortRate;
        } else if (logica === 'logica_youtube') {
          hours = (ed.totalCount || 0) * platformEffortRate;
        } else {
          // logica_de_versiones, iberia_especial, logica_sin_version:
          // count × (duracion_min / 60) × effortRate, buscando en el mapa único de tarifas.
          Object.entries(ed.byCategory || {}).forEach(([catKey, catData]) => {
            const info = rateMap[String(catKey)];
            if (info == null) return;
            const h = (catData.count || 0) * info.durationHours * info.effortRate;
            if (isReprocessKey(catKey)) {
              // Reproceso: columna aparte (por ahora, hasta que TQC confirme)
              const rGroup = `${effortGroup} ${REPROCESS_MARK}`;
              reprocessGroups.add(effortGroup);
              editorMap[ed.editor].byGroup[rGroup] = (editorMap[ed.editor].byGroup[rGroup] || 0) + h;
            } else {
              hours += h;
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

    // Solo columnas de grupos presentes en el input (OTROS incluido si alguna plataforma
    // no tiene grupo: sus horas suman al total, así que tienen que verse).
    const allGroups = effortGroups.filter((g) => usedGroups.has(g)).flatMap((g) => (reprocessGroups.has(g) ? [g, `${g} ${REPROCESS_MARK}`] : [g]));
    return { editors, effortGroups: allGroups, baseHours };
  }
}

export default PlatformReportsEngine;

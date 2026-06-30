class SerieReportsEngine {
  /**
   * Agrupa filas por SERIE y calcula horas de esfuerzo usando logica_series de la librería.
   * @param {Array}  rows      - Filas del Excel (excelRows del store)
   * @param {string} startDate - 'YYYY-MM-DD' | null
   * @param {string} endDate   - 'YYYY-MM-DD' | null
   * @param {string} dateField - 'approved_date' | 'air_date' | 'all'
   * @param {Object} library   - { versions, categories, platforms } de libraryStore
   * @returns {Object} { series, grandTotal, grandEffortHours, grandCount, totalSeries, generatedAt }
   */
  static buildReport(rows, startDate = null, endDate = null, dateField = 'all', library = {}) {
    const start = startDate ? new Date(startDate) : null;
    const end   = endDate   ? new Date(endDate + 'T23:59:59') : null;

    const { versions = [], categories = [], platforms = [] } = library;

    // Mapa version → duración en minutos desde la librería
    const versionDurationMap = {};
    versions.forEach((v) => {
      if (!v.name) return;
      const cat = categories.find((c) => String(c.id) === String(v.categoryId));
      if (cat) versionDurationMap[v.name.trim().toUpperCase()] = Number(cat.duration) || 0;
    });

    // Mapa plataforma → seriesConfig { effortRate, enabled }
    // Si una plataforma tiene seriesLogica: 'logica_series' → usa seriesEffortRate
    // Si no tiene seriesLogica → sigue apareciendo en el reporte con effortRate = 1
    const platformSeriesConfig = {};
    platforms.forEach((p) => {
      const name = (p.name || '').trim().toUpperCase();
      platformSeriesConfig[name] = {
        effortRate: p.seriesLogica === 'logica_series'
          ? (parseFloat(p.seriesEffortRate) || 1)
          : 1,
      };
    });

    const serieMap = {};

    rows.forEach((row) => {
      // Filtro de fecha opcional
      if (dateField !== 'all' && start && end) {
        const dateRaw = row[dateField] || row[dateField.toUpperCase()] || '';
        const rowDate = this.parseDate(dateRaw);
        if (!rowDate || rowDate < start || rowDate > end) return;
      }

      const serie   = this.getCol(row, 'SERIE');
      const hn      = this.getCol(row, 'HN');
      const version = this.getCol(row, 'VERSION');

      // Parsear duración: timecode HH:MM:SS[:FF] → minutos; número plano → minutos directo
      const durationRaw = this.getCol(row, 'DURATION');
      let duration = 0;
      if (durationRaw.includes(':')) {
        duration = SerieReportsEngine.parseTimecode(durationRaw) / 60;
      } else {
        duration = parseFloat(durationRaw) || 0;
      }

      // Fallback: buscar duración en librería por VERSION cuando el Excel no trae DURATION
      if (duration === 0 && version) {
        duration = versionDurationMap[version.toUpperCase()] || 0;
      }

      if (!serie) return;

      // Tasa de esfuerzo configurada en la librería para esta plataforma
      const platform = this.getCol(row, 'PLATFORM').toUpperCase();
      const effortRate = platformSeriesConfig[platform]?.effortRate ?? 1;
      const effortHours = (duration / 60) * effortRate;

      if (!serieMap[serie]) {
        serieMap[serie] = { serie, hns: new Set(), totalDuration: 0, totalEffortHours: 0, count: 0 };
      }

      if (hn) serieMap[serie].hns.add(hn);
      serieMap[serie].totalDuration  += duration;
      serieMap[serie].totalEffortHours += effortHours;
      serieMap[serie].count++;
    });

    const result = Object.values(serieMap)
      .map((s) => ({
        serie:            s.serie,
        hns:              [...s.hns],
        hnCount:          s.hns.size,
        totalDuration:    parseFloat(s.totalDuration.toFixed(2)),
        totalEffortHours: parseFloat(s.totalEffortHours.toFixed(2)),
        count:            s.count,
      }))
      .sort((a, b) => a.serie.localeCompare(b.serie));

    const grandTotal = parseFloat(
      result.reduce((sum, r) => sum + r.totalDuration, 0).toFixed(2)
    );
    const grandEffortHours = parseFloat(
      result.reduce((sum, r) => sum + r.totalEffortHours, 0).toFixed(2)
    );
    const grandCount = result.reduce((sum, r) => sum + r.count, 0);

    return {
      series:          result,
      grandTotal,
      grandEffortHours,
      grandCount,
      totalSeries:     result.length,
      generatedAt:     new Date().toISOString(),
    };
  }

  static getCol(row, colName) {
    if (row[colName] !== undefined) return String(row[colName] ?? '').trim();
    const key = Object.keys(row).find(
      (k) => k.trim().toUpperCase() === colName.toUpperCase()
    );
    return key ? String(row[key] ?? '').trim() : '';
  }

  static parseTimecode(tc) {
    if (!tc) return 0;
    const parts = String(tc).trim().split(':');
    if (parts.length < 3) return 0;
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }

  static parseDate(dateStr) {
    if (!dateStr && dateStr !== 0) return null;
    if (typeof dateStr === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + dateStr * 86400000);
    }
    const s = String(dateStr).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [day, month, year] = s.split('/');
      return new Date(year, month - 1, day);
    }
    if (s.includes('T')) return new Date(s);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
}

export default SerieReportsEngine;

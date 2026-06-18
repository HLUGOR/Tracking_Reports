class SerieReportsEngine {
  /**
   * Agrupa filas por SERIE y suma DURATION (valor numérico variable).
   * @param {Array}  rows      - Filas del Excel (excelRows del store)
   * @param {string} startDate - 'YYYY-MM-DD' | null
   * @param {string} endDate   - 'YYYY-MM-DD' | null
   * @param {string} dateField - 'approved_date' | 'air_date' | 'all'
   * @returns {Object} { series, grandTotal, grandCount, totalSeries, generatedAt }
   */
  static buildReport(rows, startDate = null, endDate = null, dateField = 'all') {
    const start = startDate ? new Date(startDate) : null;
    const end   = endDate   ? new Date(endDate + 'T23:59:59') : null;

    const serieMap = {};

    rows.forEach((row) => {
      // Filtro de fecha opcional
      if (dateField !== 'all' && start && end) {
        const dateRaw = row[dateField] || row[dateField.toUpperCase()] || '';
        const rowDate = this.parseDate(dateRaw);
        if (!rowDate || rowDate < start || rowDate > end) return;
      }

      const serie    = this.getCol(row, 'SERIE');
      const hn       = this.getCol(row, 'HN');
      const duration = parseFloat(this.getCol(row, 'DURATION') || row.duration || 0) || 0;

      if (!serie) return;

      if (!serieMap[serie]) {
        serieMap[serie] = { serie, hns: new Set(), totalDuration: 0, count: 0 };
      }

      if (hn) serieMap[serie].hns.add(hn);
      serieMap[serie].totalDuration += duration;
      serieMap[serie].count++;
    });

    const result = Object.values(serieMap)
      .map((s) => ({
        serie:         s.serie,
        hns:           [...s.hns],
        hnCount:       s.hns.size,
        totalDuration: parseFloat(s.totalDuration.toFixed(2)),
        count:         s.count,
      }))
      .sort((a, b) => a.serie.localeCompare(b.serie));

    const grandTotal = parseFloat(
      result.reduce((sum, r) => sum + r.totalDuration, 0).toFixed(2)
    );
    const grandCount = result.reduce((sum, r) => sum + r.count, 0);

    return {
      series:      result,
      grandTotal,
      grandCount,
      totalSeries: result.length,
      generatedAt: new Date().toISOString(),
    };
  }

  static getCol(row, colName) {
    if (row[colName] !== undefined) return String(row[colName] ?? '').trim();
    const key = Object.keys(row).find(
      (k) => k.trim().toUpperCase() === colName.toUpperCase()
    );
    return key ? String(row[key] ?? '').trim() : '';
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

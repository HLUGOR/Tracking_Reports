import PlatformReportsEngine from './PlatformReportsEngine';
import { parseInputDate, approvedDateOf } from '../utils/dateUtils';

class SerieReportsEngine {
  /**
   * Agrupa filas por SERIE. Los minutos y las horas de esfuerzo de cada fila se calculan
   * con el mismo código que los Reportes Plataformas y Editores
   * (PlatformReportsEngine.evaluateRow): una plataforma tiene UNA sola tasa, la de la
   * librería, y vale igual en todos los reportes.
   * @param {Array}  rows      - Filas del Excel (excelRows del store)
   * @param {string} startDate - 'YYYY-MM-DD' | null
   * @param {string} endDate   - 'YYYY-MM-DD' | null
   * @param {string} dateField - 'approved_date' | 'air_date' | 'all'
   * @param {Object} library   - { versions, categories, platforms } de libraryStore
   * @returns {Object} { series, grandTotal, grandEffortHours, grandCount, totalSeries, generatedAt }
   */
  static buildReport(rows, startDate = null, endDate = null, dateField = 'all', library = {}) {
    const start  = parseInputDate(startDate);
    const endDay = parseInputDate(endDate);
    const end    = endDay ? new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999) : null;
    // Filas con SERIE cuya APPROVED_DATE falta o no es MM/DD/AAAA válida
    let invalidDateCount = 0;

    const serieMap = {};

    rows.forEach((row) => {
      const serie   = this.getCol(row, 'SERIE');
      const hn      = this.getCol(row, 'HN');
      if (!serie) return;

      // Fecha de aprobación: si falta o no es válida se cuenta para el aviso. Con
      // "Todos los registros" la fila entra igual; con un rango no se puede ubicar.
      const approvedRaw = approvedDateOf(row);
      const approvedOk = !!parseInputDate(approvedRaw);
      if (!approvedOk) invalidDateCount++;

      // Filtro de fecha opcional
      if (dateField !== 'all') {
        const dateRaw = dateField === 'approved_date'
          ? approvedRaw
          : (row[dateField] ?? row[dateField.toUpperCase()] ?? '');
        const rowDate = parseInputDate(dateRaw);
        if (!rowDate || !start || !end || rowDate < start || rowDate > end) return;
      }

      const { minutes: duration, hours: effortHours } = PlatformReportsEngine.evaluateRow(row, library);

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
      invalidDateCount,
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
}

export default SerieReportsEngine;

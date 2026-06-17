import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import excelStore from '../../store/excelStore';
import SerieReportsEngine from '../../core/reportEngine/SerieReportsEngine';
import './SerieReportsView.css';

function toHours(minutes) {
  const h = minutes / 60;
  return parseFloat(h.toFixed(2));
}

function SerieReportsView() {
  const rows = excelStore((s) => s.excelRows);

  const today    = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate,   setEndDate]   = useState(today);
  const [dateField, setDateField] = useState('all');

  const [reportData, setReportData] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const handleGenerate = () => {
    if (dateField !== 'all' && (!startDate || !endDate)) {
      setError('Selecciona ambas fechas o elige "Sin filtro de fecha".');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = SerieReportsEngine.buildReport(
        rows,
        dateField !== 'all' ? startDate : null,
        dateField !== 'all' ? endDate   : null,
        dateField
      );
      setReportData(result);
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!reportData) return;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TrackingReports';
    wb.created = new Date();

    const ws = wb.addWorksheet('Por Serie');

    const COLOR = {
      header:   '1E293B',
      total:    '0F172A',
      altRow:   'F8FAFC',
      white:    'FFFFFF',
    };

    const fontWhite = { name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' }, bold: true };
    const fontDark  = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } };
    const fontTotal = { name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' }, bold: true };

    const border = {
      top:    { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
    const borderTotal = {
      top:    { style: 'medium', color: { argb: 'FF1E293B' } },
      left:   { style: 'thin',   color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right:  { style: 'thin',   color: { argb: 'FFE2E8F0' } },
    };

    ws.columns = [
      { width: 42 },
      { width: 30 },
      { width: 18 },
    ];

    // Título
    const periodoStr = dateField === 'all'
      ? 'Todos los registros'
      : `${startDate} → ${endDate}`;

    const titleRow = ws.addRow([`REPORTE POR SERIE  •  ${periodoStr}`]);
    ws.mergeCells('A1:C1');
    const tc = titleRow.getCell(1);
    tc.value = `REPORTE POR SERIE  •  ${periodoStr}`;
    tc.font  = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    tc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.header } };
    tc.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const genRow = ws.addRow([`Generado: ${new Date(reportData.generatedAt).toLocaleString('es-MX')}`]);
    ws.mergeCells('A2:C2');
    genRow.getCell(1).font      = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    genRow.getCell(1).alignment = { horizontal: 'center' };

    ws.addRow([]);

    // Header
    const hdrRow = ws.addRow(['Serie', 'HN', 'Horas Totales']);
    hdrRow.height = 20;
    ['A', 'B', 'C'].forEach((col, i) => {
      const cell = hdrRow.getCell(col);
      cell.value     = ['Serie', 'HN', 'Horas Totales'][i];
      cell.font      = fontWhite;
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.header } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = border;
    });

    // Filas de datos
    reportData.series.forEach((row, idx) => {
      const isAlt = idx % 2 === 1;
      const r = ws.addRow([row.serie, row.hn, toHours(row.totalDuration)]);

      const fillColor = isAlt ? 'FFF8FAFC' : 'FFFFFFFF';

      const cellA = r.getCell('A');
      cellA.value     = row.serie;
      cellA.font      = fontDark;
      cellA.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
      cellA.alignment = { horizontal: 'left', vertical: 'middle' };
      cellA.border    = border;

      const cellB = r.getCell('B');
      cellB.value     = row.hn;
      cellB.font      = fontDark;
      cellB.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
      cellB.alignment = { horizontal: 'left', vertical: 'middle' };
      cellB.border    = border;

      const cellC = r.getCell('C');
      cellC.value     = toHours(row.totalDuration);
      cellC.font      = fontDark;
      cellC.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
      cellC.alignment = { horizontal: 'center', vertical: 'middle' };
      cellC.numFmt    = '0.##';
      cellC.border    = border;
    });

    // Grand Total
    const totRow = ws.addRow(['Grand Total', '', toHours(reportData.grandTotal)]);
    totRow.height = 18;
    ['A', 'B', 'C'].forEach((col) => {
      const cell = totRow.getCell(col);
      cell.font      = fontTotal;
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.total } };
      cell.alignment = { horizontal: col === 'A' ? 'left' : 'center', vertical: 'middle' };
      cell.border    = borderTotal;
      if (col === 'C') cell.numFmt = '0.##';
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = `reporte_por_serie_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="serie-reports">
      <h2>📺 Reporte por Serie</h2>

      {/* Filtros */}
      <div className="sr-filters">
        <div className="sr-filter-group">
          <label>Filtrar por fecha:</label>
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            disabled={loading}
          >
            <option value="all">🔓 Sin filtro de fecha</option>
            <option value="approved_date">✅ APPROVED_DATE</option>
            <option value="air_date">📅 AIR_DATE</option>
          </select>
        </div>

        {dateField !== 'all' && (
          <>
            <div className="sr-filter-group">
              <label>Desde:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="sr-filter-group">
              <label>Hasta:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </>
        )}

        <button
          className="sr-btn-generate"
          onClick={handleGenerate}
          disabled={loading || rows.length === 0}
        >
          {loading ? '⏳ Generando...' : '▶ Generar Reporte'}
        </button>

        {reportData && (
          <button className="sr-btn-export" onClick={handleExportExcel}>
            ⬇ Descargar Excel
          </button>
        )}
      </div>

      {error && <div className="sr-error">{error}</div>}
      {rows.length === 0 && (
        <div className="sr-empty">⬆️ Carga un archivo Excel para generar el reporte.</div>
      )}

      {/* Resultado */}
      {reportData && (
        <>
          <div className="sr-summary">
            <span>
              🗓 Período:{' '}
              {dateField === 'all' ? 'Todos los registros' : `${startDate} → ${endDate}`}
            </span>
            <span>📺 Series únicas: <strong>{reportData.totalSeries}</strong></span>
            <span>📦 Total assets: <strong>{reportData.grandCount}</strong></span>
            <span>⏱ Total horas: <strong>{toHours(reportData.grandTotal)}h</strong></span>
          </div>

          <div className="sr-table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th className="sr-th-serie">Serie</th>
                  <th className="sr-th-hn">HN</th>
                  <th className="sr-th-dur">Horas Totales</th>
                </tr>
              </thead>
              <tbody>
                {reportData.series.map((row, idx) => (
                  <tr key={row.serie} className={idx % 2 === 1 ? 'sr-alt' : ''}>
                    <td className="sr-td-serie">{row.serie}</td>
                    <td className="sr-td-hn">{row.hn}</td>
                    <td className="sr-td-dur">{toHours(row.totalDuration)}h</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="sr-total-row">
                  <td colSpan={2}><strong>Grand Total</strong></td>
                  <td><strong>{toHours(reportData.grandTotal)}h</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default SerieReportsView;

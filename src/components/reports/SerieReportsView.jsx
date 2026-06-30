import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import excelStore from '../../store/excelStore';
import libraryStore from '../../store/libraryStore';
import SerieReportsEngine from '../../core/reportEngine/SerieReportsEngine';
import './SerieReportsView.css';

function SerieReportsView() {
  const rows       = excelStore((s) => s.excelRows);
  const versions   = libraryStore((s) => s.versions);
  const categories = libraryStore((s) => s.categories);
  const platforms  = libraryStore((s) => s.platforms);

  const today    = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [startDate,      setStartDate]      = useState(monthAgo);
  const [endDate,        setEndDate]        = useState(today);
  const [dateField,      setDateField]      = useState('all');
  const [reportData,     setReportData]     = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [expandedSeries, setExpandedSeries] = useState(new Set());

  const toggleSerie = (serie) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(serie)) next.delete(serie);
      else next.add(serie);
      return next;
    });
  };

  const expandAll   = () => setExpandedSeries(new Set(reportData?.series.map((r) => r.serie)));
  const collapseAll = () => setExpandedSeries(new Set());

  const handleGenerate = () => {
    if (dateField !== 'all' && (!startDate || !endDate)) {
      setError('Selecciona ambas fechas o elige "Sin filtro de fecha".');
      return;
    }
    setError(null);
    setLoading(true);
    setExpandedSeries(new Set());
    try {
      const result = SerieReportsEngine.buildReport(
        rows,
        dateField !== 'all' ? startDate : null,
        dateField !== 'all' ? endDate   : null,
        dateField,
        { versions, categories, platforms }
      );
      setReportData(result);
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!reportData) return;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TrackingReports';
    wb.created = new Date();

    const ws = wb.addWorksheet('Por Serie');
    ws.properties.outlineLevelRow = 1;
    ws.properties.summaryBelow    = false;

    const COLOR = { header: '1E293B', total: '0F172A', subRow: 'EFF6FF', altRow: 'F8FAFC' };

    const fontWhite = { name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' }, bold: true };
    const fontDark  = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } };
    const fontSub   = { name: 'Calibri', size: 10, color: { argb: 'FF334155' }, italic: true };
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

    ws.columns = [{ width: 42 }, { width: 32 }, { width: 18 }];

    // Título
    const periodoStr = dateField === 'all'
      ? 'Todos los registros'
      : `${startDate} → ${endDate}`;

    const titleRow = ws.addRow([`REPORTE POR SERIE  •  ${periodoStr}`]);
    ws.mergeCells('A1:C1');
    const tc = titleRow.getCell(1);
    tc.value     = `REPORTE POR SERIE  •  ${periodoStr}`;
    tc.font      = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    tc.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.header } };
    tc.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const genRow = ws.addRow([`Generado: ${new Date(reportData.generatedAt).toLocaleString('es-MX')}`]);
    ws.mergeCells('A2:C2');
    genRow.getCell(1).font      = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    genRow.getCell(1).alignment = { horizontal: 'center' };

    ws.addRow([]);

    // Header con auto-filtro
    const hdrRow = ws.addRow(['Serie', 'HN', 'Horas de Esfuerzo']);
    hdrRow.height = 20;
    ['A', 'B', 'C'].forEach((col, i) => {
      const cell     = hdrRow.getCell(col);
      cell.value     = ['Serie', 'HN', 'Horas de Esfuerzo'][i];
      cell.font      = fontWhite;
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.header } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = border;
    });
    ws.autoFilter = { from: 'A4', to: 'C4' };

    // Filas por serie + sub-filas por HN (agrupadas)
    reportData.series.forEach((row, idx) => {
      const isAlt   = idx % 2 === 1;
      const fillHex = isAlt ? 'FFF8FAFC' : 'FFFFFFFF';

      // Fila principal (serie)
      const serieRow = ws.addRow([row.serie, `${row.hnCount} HN(s)`, row.totalEffortHours]);
      serieRow.height = 18;

      const cA = serieRow.getCell('A');
      cA.value = row.serie; cA.font = { ...fontDark, bold: true };
      cA.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillHex } };
      cA.alignment = { horizontal: 'left', vertical: 'middle' }; cA.border = border;

      const cB = serieRow.getCell('B');
      cB.value = `${row.hnCount} HN(s)`; cB.font = fontDark;
      cB.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillHex } };
      cB.alignment = { horizontal: 'left', vertical: 'middle' }; cB.border = border;

      const cC = serieRow.getCell('C');
      cC.value = row.totalEffortHours; cC.font = { ...fontDark, bold: true };
      cC.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillHex } };
      cC.alignment = { horizontal: 'center', vertical: 'middle' };
      cC.numFmt = '0.##'; cC.border = border;

      // Sub-filas por HN (outline level 1 → colapsables con [-]/[+] de Excel)
      row.hns.forEach((hn) => {
        const hnRow        = ws.addRow(['', hn, '']);
        hnRow.outlineLevel = 1;
        hnRow.height       = 16;

        const hA = hnRow.getCell('A');
        hA.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.subRow } };
        hA.border = border;

        const hB = hnRow.getCell('B');
        hB.value     = hn; hB.font = fontSub;
        hB.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.subRow } };
        hB.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
        hB.border    = border;

        const hC = hnRow.getCell('C');
        hC.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.subRow } };
        hC.border = border;
      });
    });

    // Grand Total
    const totRow = ws.addRow(['Grand Total', '', reportData.grandEffortHours]);
    totRow.height = 18;
    ['A', 'B', 'C'].forEach((col) => {
      const cell     = totRow.getCell(col);
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="serie-reports">
      <h2>📺 Reporte por Serie</h2>

      {/* Filtros */}
      <div className="sr-filters">
        <div className="sr-filter-group">
          <label>Filtrar por fecha:</label>
          <select value={dateField} onChange={(e) => setDateField(e.target.value)} disabled={loading}>
            <option value="all">🔓 Sin filtro de fecha</option>
            <option value="approved_date">✅ APPROVED_DATE</option>
            <option value="air_date">📅 AIR_DATE</option>
          </select>
        </div>

        {dateField !== 'all' && (
          <>
            <div className="sr-filter-group">
              <label>Desde:</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} />
            </div>
            <div className="sr-filter-group">
              <label>Hasta:</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={loading} />
            </div>
          </>
        )}

        <button className="sr-btn-generate" onClick={handleGenerate} disabled={loading || rows.length === 0}>
          {loading ? '⏳ Generando...' : '▶ Generar Reporte'}
        </button>

        {reportData && (
          <button className="sr-btn-export" onClick={handleExportExcel}>
            ⬇ Descargar Excel
          </button>
        )}
      </div>

      {error && <div className="sr-error">{error}</div>}
      {rows.length === 0 && <div className="sr-empty">⬆️ Carga un archivo Excel para generar el reporte.</div>}

      {/* Resultado */}
      {reportData && (
        <>
          <div className="sr-summary">
            <span>🗓 Período: {dateField === 'all' ? 'Todos los registros' : `${startDate} → ${endDate}`}</span>
            <span>📺 Series únicas: <strong>{reportData.totalSeries}</strong></span>
            <span>📦 Total assets: <strong>{reportData.grandCount}</strong></span>
            <span>⏱ Horas de Esfuerzo: <strong>{reportData.grandEffortHours}h</strong></span>
          </div>

          <div className="sr-expand-controls">
            <button className="sr-btn-expand" onClick={expandAll}>▼ Expandir todo</button>
            <button className="sr-btn-expand" onClick={collapseAll}>▶ Colapsar todo</button>
          </div>

          <div className="sr-table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th className="sr-th-serie">Serie</th>
                  <th className="sr-th-hn">HN</th>
                  <th className="sr-th-dur">Horas de Esfuerzo</th>
                </tr>
              </thead>
              <tbody>
                {reportData.series.map((row, idx) => {
                  const isExpanded = expandedSeries.has(row.serie);
                  return (
                    <React.Fragment key={row.serie}>
                      <tr className={`sr-serie-row ${idx % 2 === 1 ? 'sr-alt' : ''}`}>
                        <td className="sr-td-serie">{row.serie}</td>
                        <td className="sr-td-hn-toggle">
                          <button
                            className="sr-toggle-btn"
                            onClick={() => toggleSerie(row.serie)}
                            title={isExpanded ? 'Colapsar HNs' : 'Ver HNs'}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          <span className="sr-hn-count">
                            {row.hnCount} HN{row.hnCount !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="sr-td-dur">{row.totalEffortHours}h</td>
                      </tr>

                      {isExpanded && row.hns.map((hn) => (
                        <tr key={`${row.serie}__${hn}`} className="sr-hn-subrow">
                          <td className="sr-td-sub-empty"></td>
                          <td className="sr-td-hn-item">{hn}</td>
                          <td className="sr-td-sub-empty"></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="sr-total-row">
                  <td colSpan={2}><strong>Grand Total</strong></td>
                  <td><strong>{reportData.grandEffortHours}h</strong></td>
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

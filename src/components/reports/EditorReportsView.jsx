/**
 * EditorReportsView.jsx - Vista de reportes por editor (cross-platform)
 * Usa PlatformReportsEngine para procesar los datos reales y pivota
 * el resultado para una vista centrada en el editor.
 */

import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import excelStore from '../../store/excelStore';
import libraryStore from '../../store/libraryStore';
import PlatformReportsEngine from '../../core/reportEngine/PlatformReportsEngine';
import './EditorReportsView.css';

function EditorReportsView() {
  const rows    = excelStore((s) => s.excelRows);
  const library = libraryStore((s) => ({
    platforms:  s.platforms,
    categories: s.categories,
    versions:   s.versions,
  }));

  const today    = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate,   setEndDate]   = useState(today);
  const [dateField, setDateField] = useState('approved_date');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState(null);

  // â”€â”€ Generar reporte â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleGenerate = () => {
    if (dateField !== 'all' && (!startDate || !endDate)) {
      setError('Selecciona ambas fechas o elige "Sin filtro de fecha".');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      // Reutilizar exactamente el mismo engine que PlatformReportsView
      const platResult = PlatformReportsEngine.buildReport(
        rows,
        startDate || '2000-01-01',
        endDate   || today,
        library,
        dateField
      );

      // Pivotar: platform × editor → editor × platform
      const editorMap = {};
      platResult.platforms.forEach((plt) => {
        plt.editors.forEach((ed) => {
          if (!editorMap[ed.editor]) {
            editorMap[ed.editor] = {
              editor:       ed.editor,
              totalCount:   0,
              totalMinutes: 0,
              totalSeconds: 0,
              byPlatform:   {},
            };
          }
          editorMap[ed.editor].totalCount   += ed.totalCount;
          editorMap[ed.editor].totalMinutes += ed.totalMinutes;
          editorMap[ed.editor].totalSeconds += ed.totalSeconds || 0;
          editorMap[ed.editor].byPlatform[plt.platform] = {
            count:   ed.totalCount,
            minutes: Math.round(ed.totalMinutes),
          };
        });
      });

      const editors = Object.values(editorMap)
        .sort((a, b) => b.totalCount - a.totalCount);

      const platforms = platResult.platforms.map((p) => p.platform);

      const totalItems   = editors.reduce((s, e) => s + e.totalCount,   0);
      const totalMinutes = editors.reduce((s, e) => s + e.totalMinutes, 0);

      setReportData({
        editors,
        platforms,
        summary: {
          totalEditors:  editors.length,
          totalItems,
          totalMinutes:  Math.round(totalMinutes),
          totalPlatforms: platforms.length,
        },
        generatedAt: new Date().toISOString(),
        period: dateField === 'all' ? 'Todos los registros' : `${startDate} → ${endDate}`,
      });
    } catch (err) {
      console.error('Error generando reporte editores:', err);
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // â”€â”€ Exportar Excel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleExportExcel = async () => {
    if (!reportData) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Editores');

    // Cabeceras: Editor | <plataformas...> | Total Items | Total Min
    const headers = ['Editor', ...reportData.platforms, 'Total Items', 'Total Min'];
    ws.columns = headers.map((_, i) => ({ width: i === 0 ? 28 : 14 }));

    const hdr = ws.addRow(headers);
    hdr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center' };
    });

    reportData.editors.forEach((ed, idx) => {
      const platCounts = reportData.platforms.map((p) => ed.byPlatform[p]?.count || 0);
      const row = ws.addRow([ed.editor, ...platCounts, ed.totalCount, Math.round(ed.totalMinutes)]);
      const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF1F5F9';
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { horizontal: typeof cell.value === 'number' ? 'center' : 'left' };
      });
    });

    // Fila TOTAL
    const totRow = ws.addRow([
      'TOTAL',
      ...reportData.platforms.map((p) =>
        reportData.editors.reduce((s, e) => s + (e.byPlatform[p]?.count || 0), 0)
      ),
      reportData.summary.totalItems,
      reportData.summary.totalMinutes,
    ]);
    totRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.alignment = { horizontal: 'center' };
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_editores_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="editor-reports">
      <h2>📊 Reportes por Editor</h2>

      {/* Filtros */}
      <div className="filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem', background: '#fff', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 4px #0001' }}>
        <div className="filter-group">
          <label>Filtrar por fecha:</label>
          <select value={dateField} onChange={(e) => setDateField(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <option value="all">🗓 Sin filtro de fecha</option>
            <option value="approved_date">✅ Fecha aprobación</option>
            <option value="air_date">📡 Fecha aire</option>
          </select>
        </div>
        {dateField !== 'all' && (
          <>
            <div className="filter-group">
              <label>Fecha Inicio:</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            <div className="filter-group">
              <label>Fecha Fin:</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
          </>
        )}
        <button onClick={handleGenerate} disabled={loading} style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
          {loading ? '⏳ Generando…' : '📈 Generar Reporte'}
        </button>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.75rem 1rem', color: '#b91c1c', marginBottom: '1rem' }}>{error}</div>}

      {/* Resumen */}
      {reportData && (
        <>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total Editores',   value: reportData.summary.totalEditors },
              { label: 'Total Items',      value: reportData.summary.totalItems },
              { label: 'Total Minutos',    value: reportData.summary.totalMinutes },
              { label: 'Plataformas',      value: reportData.summary.totalPlatforms },
            ].map((s) => (
              <div key={s.label} style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: '10px', padding: '1rem', color: '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.85, marginBottom: '0.3rem' }}>{s.label}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Tabla detalle */}
          <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px #0001', overflow: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#1e3a8a', color: '#fff' }}>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left' }}>Editor</th>
                  {reportData.platforms.map((p) => (
                    <th key={p} style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>{p}</th>
                  ))}
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Total Items</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Total Min</th>
                </tr>
              </thead>
              <tbody>
                {reportData.editors.map((ed, idx) => (
                  <tr key={ed.editor} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '0.5rem 1rem', fontWeight: 500 }}>{ed.editor}</td>
                    {reportData.platforms.map((p) => (
                      <td key={p} style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: ed.byPlatform[p] ? '#1e3a8a' : '#cbd5e1' }}>
                        {ed.byPlatform[p]?.count || 'â€”'}
                      </td>
                    ))}
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>{ed.totalCount}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{Math.round(ed.totalMinutes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#e2e8f0', fontWeight: 700 }}>
                  <td style={{ padding: '0.5rem 1rem' }}>TOTAL</td>
                  {reportData.platforms.map((p) => (
                    <td key={p} style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                      {reportData.editors.reduce((s, e) => s + (e.byPlatform[p]?.count || 0), 0)}
                    </td>
                  ))}
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{reportData.summary.totalItems}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{reportData.summary.totalMinutes}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Exportar */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleExportExcel} style={{ padding: '0.5rem 1.25rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
              📥 Descargar Excel
            </button>
          </div>
        </>
      )}

      {!reportData && !loading && rows.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '3rem' }}>
          <p>Carga un Excel primero para generar el reporte.</p>
        </div>
      )}
    </div>
  );
}

export default EditorReportsView;

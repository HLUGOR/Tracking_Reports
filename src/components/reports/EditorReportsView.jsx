/**
 * EditorReportsView.jsx - Vista de reportes por editor (cross-platform)
 * Usa PlatformReportsEngine para procesar los datos reales y pivota
 * el resultado para una vista centrada en el editor.
 * Incluye tabla de Horas de Esfuerzo por grupo de plataforma.
 */

import React, { useState, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import ExcelJS from 'exceljs';
import excelStore from '../../store/excelStore';
import libraryStore from '../../store/libraryStore';
import PlatformReportsEngine from '../../core/reportEngine/PlatformReportsEngine';
import './EditorReportsView.css';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Base de horas mensual para calcular % de ocupación
const BASE_HORAS = 192;

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
  const chartRef = useRef(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState(null);
  // Controla qué tabla se muestra: 'assets' | 'effort'
  const [activeView, setActiveView] = useState('effort');

  // ── Generar reporte ────────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (dateField !== 'all' && (!startDate || !endDate)) {
      setError('Selecciona ambas fechas o elige "Sin filtro de fecha".');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const platResult = PlatformReportsEngine.buildReport(
        rows,
        startDate || '2000-01-01',
        endDate   || today,
        library,
        dateField
      );

      // ── Vista por assets (tabla existente) ──────────────────────────────
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

      // ── Vista de esfuerzo (nueva tabla) ─────────────────────────────────
      const effortResult = PlatformReportsEngine.buildEffortReport(
        platResult,
        library,
        BASE_HORAS
      );

      setReportData({
        editors,
        platforms,
        summary: {
          totalEditors:  editors.length,
          totalItems,
          totalMinutes:  Math.round(totalMinutes),
          totalPlatforms: platforms.length,
        },
        effort: effortResult,
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

  // ── Exportar Excel ─────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!reportData) return;
    const wb = new ExcelJS.Workbook();

    // ── Hoja 1: Horas de Esfuerzo ──────────────────────────────────────────
    if (reportData.effort?.editors?.length > 0) {
      const ws2 = wb.addWorksheet('Horas de Esfuerzo');
      ws2.views = [{ showGridLines: false }];
      const groups = reportData.effort.effortGroups.filter(g => g !== 'OTROS');
      const totalCols = groups.length + 4;

      ws2.columns = [
        { width: 26 },
        ...groups.map(() => ({ width: 17 })),
        { width: 16 },
        { width: 22 },
        { width: 16 },
      ];

      const titleRow = ws2.addRow([`⚡ Reporte Horas de Esfuerzo — ${reportData.period || ''}`]);
      ws2.mergeCells(1, 1, 1, totalCols);
      titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
      titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.height = 24;

      const infoRow = ws2.addRow([`Base de cálculo: ${BASE_HORAS}h por editor`]);
      ws2.mergeCells(2, 1, 2, totalCols);
      infoRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF475569' } };
      infoRow.getCell(1).alignment = { horizontal: 'center' };
      ws2.addRow([]);

      const headers2 = [
        'Editor',
        ...groups.map((g) => `Horas ${g}`),
        'TOTAL Horas',
        `% Ocupación\n(base ${BASE_HORAS}h)`,
        '% Free Time',
      ];
      const hdr2 = ws2.addRow(headers2);
      hdr2.height = 32;
      hdr2.eachCell((cell, colNum) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF3B82F6' } } };
        if (colNum === 1) cell.alignment = { horizontal: 'left', vertical: 'middle' };
        if (colNum === groups.length + 2) cell.font = { bold: true, color: { argb: 'FFFBBF24' }, size: 11 };
        if (colNum === groups.length + 3) cell.font = { bold: true, color: { argb: 'FFA5F3FC' }, size: 11 };
        if (colNum === groups.length + 4) cell.font = { bold: true, color: { argb: 'FF86EFAC' }, size: 11 };
      });

      reportData.effort.editors.forEach((ed, idx) => {
        const row = ws2.addRow([
          ed.editor,
          ...groups.map((g) => Math.round((ed.byGroup[g] || 0) * 10) / 10),
          ed.totalHours,
          ed.pctOcupacion,
          ed.pctFreeTime,
        ]);
        row.height = 20;
        const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
        row.eachCell((cell, colNum) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' };
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
          if (colNum === 1) cell.font = { bold: true, color: { argb: 'FF1E293B' } };
          if (colNum === groups.length + 2) {
            cell.font = { bold: true, color: { argb: 'FF1E293B' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
          }
          if (typeof cell.value === 'number' && cell.value === 0 && colNum !== groups.length + 3 && colNum !== groups.length + 4) {
            cell.font = { color: { argb: 'FFCBD5E1' } };
          }
        });
        const pctCell = row.getCell(groups.length + 3);
        const pct = ed.pctOcupacion;
        pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pct >= 70 ? 'FFFEF2F2' : 'FFF0FDF4' } };
        pctCell.font = { bold: true, color: { argb: pct >= 70 ? 'FFB91C1C' : 'FF15803D' } };
        pctCell.value = `${pct}%`;
        const freeCell = row.getCell(groups.length + 4);
        freeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        freeCell.font = { bold: true, color: { argb: 'FF15803D' } };
        freeCell.value = `${ed.pctFreeTime}%`;
      });

      const totRow = ws2.addRow([
        'TOTAL',
        ...groups.map((g) => Math.round(reportData.effort.editors.reduce((s, e) => s + (e.byGroup[g] || 0), 0) * 10) / 10),
        Math.round(reportData.effort.editors.reduce((s, e) => s + e.totalHours, 0) * 10) / 10,
        '', '',
      ]);
      totRow.height = 22;
      totRow.eachCell((cell, colNum) => {
        cell.font = { bold: true, color: { argb: 'FF1E293B' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = { top: { style: 'medium', color: { argb: 'FF94A3B8' } } };
      });
    }

    // ── Hoja 2: Gráfica Ocupación ─────────────────────────────────────────
    if (chartRef.current) {
      const wsChart = wb.addWorksheet('Gráfica Ocupación');
      wsChart.views = [{ showGridLines: false }];
      const canvas = chartRef.current.canvas;
      const imgDataUrl = canvas.toDataURL('image/png');
      const base64 = imgDataUrl.split(',')[1];
      const imageId = wb.addImage({ base64, extension: 'png' });
      const imgW = Math.min(canvas.width, 900);
      const imgH = Math.round(imgW * (canvas.height / canvas.width));
      wsChart.addImage(imageId, {
        tl: { col: 0.5, row: 1 },
        ext: { width: imgW, height: imgH },
      });
      const titleChart = wsChart.addRow([`📊 Ocupación y Free Time por Editor (base ${BASE_HORAS}h)`]);
      titleChart.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
    }

    // ── Hoja 3: Assets por Plataforma ─────────────────────────────────────
    const wsAssets = wb.addWorksheet('Assets por Plataforma');
    wsAssets.views = [{ showGridLines: false }];
    const headersAssets = ['Editor', ...reportData.platforms, 'Total Items', 'Total Min'];
    wsAssets.columns = headersAssets.map((_, i) => ({ width: i === 0 ? 28 : 14 }));
    const hdrAssets = wsAssets.addRow(headersAssets);
    hdrAssets.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center' };
    });
    reportData.editors.forEach((ed, idx) => {
      const row = wsAssets.addRow([
        ed.editor,
        ...reportData.platforms.map((p) => ed.byPlatform[p]?.count || 0),
        ed.totalCount,
        Math.round(ed.totalMinutes),
      ]);
      const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF1F5F9';
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { horizontal: typeof cell.value === 'number' ? 'center' : 'left' };
      });
    });
    const totAssets = wsAssets.addRow([
      'TOTAL',
      ...reportData.platforms.map((p) => reportData.editors.reduce((s, e) => s + (e.byPlatform[p]?.count || 0), 0)),
      reportData.summary.totalItems,
      reportData.summary.totalMinutes,
    ]);
    totAssets.eachCell((cell) => {
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

  // ── Helpers de color ───────────────────────────────────────────────────────
  const pctColor = (pct) => {
    if (pct >= 70) return '#b91c1c';  // Rojo a partir del 70%
    return '#15803d';  // Verde para menos del 70%
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.75rem 1rem', color: '#b91c1c', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

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

          {/* Toggle de vistas */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              onClick={() => setActiveView('effort')}
              style={{
                padding: '0.45rem 1.1rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', border: 'none',
                background: activeView === 'effort' ? '#1e3a8a' : '#e2e8f0',
                color: activeView === 'effort' ? '#fff' : '#475569',
              }}
            >
              ⚡ Horas de Esfuerzo
            </button>
            <button
              onClick={() => setActiveView('assets')}
              style={{
                padding: '0.45rem 1.1rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', border: 'none',
                background: activeView === 'assets' ? '#1e3a8a' : '#e2e8f0',
                color: activeView === 'assets' ? '#fff' : '#475569',
              }}
            >
              📦 Assets por Plataforma
            </button>
          </div>

          {/* ── TABLA HORAS DE ESFUERZO ─────────────────────────────────── */}
          {activeView === 'effort' && reportData.effort && (
            <>
              {reportData.effort.editors.length === 0 ? (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem 1.25rem', color: '#92400e', marginBottom: '1rem' }}>
                  <strong>⚠ Sin datos de esfuerzo.</strong> Para calcular las horas, debes configurar:
                  <ul style={{ margin: '0.5rem 0 0 1.25rem', lineHeight: 1.8 }}>
                    <li>Campo <strong>"Grupo de Esfuerzo"</strong> en cada plataforma (Librería → Plataformas)</li>
                    <li>Campo <strong>"Tasa de Esfuerzo"</strong> en las categorías (Librería → Categorías)</li>
                  </ul>
                </div>
              ) : (
                <>
                <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px #0002', overflow: 'auto', marginBottom: '1.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: 'linear-gradient(90deg, #1e3a8a, #1d4ed8)' }}>
                        <th style={{ padding: '0.75rem 1.1rem', textAlign: 'left', color: '#fff', fontWeight: 700, letterSpacing: '0.03em' }}>
                          Editor
                        </th>
                        {reportData.effort.effortGroups.filter(g => g !== 'OTROS').map((g) => (
                          <th key={g} style={{ padding: '0.75rem 0.85rem', textAlign: 'center', color: '#fff', fontWeight: 700, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                            Horas {g}
                          </th>
                        ))}
                        <th style={{ padding: '0.75rem 0.85rem', textAlign: 'center', color: '#fbbf24', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          TOTAL Horas
                        </th>
                        <th style={{ padding: '0.75rem 0.85rem', textAlign: 'center', color: '#a5f3fc', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          % Ocupación
                          <div style={{ fontSize: '0.7rem', fontWeight: 400, opacity: 0.85 }}>Base {BASE_HORAS}h</div>
                        </th>
                        <th style={{ padding: '0.75rem 0.85rem', textAlign: 'center', color: '#86efac', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          % Free Time
                        </th>
                        <th style={{ padding: '0.75rem 0.85rem', textAlign: 'center', color: '#e5e7eb', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.effort.editors.map((ed, idx) => (
                        <tr
                          key={ed.editor}
                          style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#f8fafc')}
                        >
                          <td style={{ padding: '0.55rem 1.1rem', fontWeight: 600, color: '#1e293b', borderLeft: '3px solid #6366f1' }}>
                            {ed.editor}
                          </td>
                          {reportData.effort.effortGroups.filter(g => g !== 'OTROS').map((g) => {
                            const h = Math.round((ed.byGroup[g] || 0) * 10) / 10;
                            return (
                              <td key={g} style={{ padding: '0.55rem 0.85rem', textAlign: 'center', color: h > 0 ? '#1e3a8a' : '#cbd5e1', fontWeight: h > 0 ? 600 : 400 }}>
                                {h > 0 ? h : 0}
                              </td>
                            );
                          })}
                          <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center', fontWeight: 700, color: '#1e293b', background: 'rgba(99,102,241,0.06)' }}>
                            {ed.totalHours}
                          </td>
                          <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontWeight: 700,
                              fontSize: '0.85rem',
                              background: ed.pctOcupacion >= 70 ? '#fef2f2' : '#f0fdf4',
                              color: pctColor(ed.pctOcupacion),
                            }}>
                              {ed.pctOcupacion}%
                            </span>
                          </td>
                          <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontWeight: 700,
                              fontSize: '0.85rem', background: '#f0fdf4', color: '#15803d',
                            }}>
                              {ed.pctFreeTime}%
                            </span>
                          </td>
                          <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center', minWidth: '140px' }}>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              justifyContent: 'center'
                            }}>
                              {/* Barra bicolor: verde hasta 70%, rojo a partir de 70% */}
                              <div style={{ 
                                width: '100px', 
                                height: '14px', 
                                background: '#e2e8f0', 
                                borderRadius: '7px', 
                                overflow: 'hidden',
                                flexShrink: 0,
                                position: 'relative'
                              }}>
                                {/* Parte verde (hasta 70% o hasta el valor si es menor) */}
                                <div style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  height: '100%',
                                  width: `${Math.min(ed.pctOcupacion, 70)}%`,
                                  backgroundColor: '#10b981',
                                  borderRadius: ed.pctOcupacion <= 70 ? '7px' : '7px 0 0 7px'
                                }}></div>
                                {/* Parte roja (solo si supera 70%) */}
                                {ed.pctOcupacion > 70 && (
                                  <div style={{
                                    position: 'absolute',
                                    left: '70%',
                                    top: 0,
                                    height: '100%',
                                    width: `${ed.pctOcupacion - 70}%`,
                                    backgroundColor: '#ef4444',
                                    borderRadius: '0 7px 7px 0'
                                  }}></div>
                                )}
                                {/* Línea marcadora del 70% */}
                                <div style={{
                                  position: 'absolute',
                                  left: '70%',
                                  top: 0,
                                  width: '1px',
                                  height: '100%',
                                  backgroundColor: '#94a3b8',
                                  zIndex: 1
                                }}></div>
                              </div>
                              {/* Texto del porcentaje */}
                              <span style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: 700, 
                                color: ed.pctOcupacion >= 70 ? '#dc2626' : '#059669',
                                minWidth: '30px',
                                textAlign: 'left'
                              }}>
                                {ed.pctOcupacion}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#e2e8f0', fontWeight: 700 }}>
                        <td style={{ padding: '0.6rem 1.1rem', color: '#1e293b' }}>TOTAL</td>
                        {reportData.effort.effortGroups.filter(g => g !== 'OTROS').map((g) => (
                          <td key={g} style={{ padding: '0.6rem 0.85rem', textAlign: 'center', color: '#1e293b' }}>
                            {Math.round(reportData.effort.editors.reduce((s, e) => s + (e.byGroup[g] || 0), 0) * 10) / 10}
                          </td>
                        ))}
                        <td style={{ padding: '0.6rem 0.85rem', textAlign: 'center', color: '#1e293b' }}>
                          {Math.round(reportData.effort.editors.reduce((s, e) => s + e.totalHours, 0) * 10) / 10}
                        </td>
                        <td colSpan={3} style={{ padding: '0.6rem 0.85rem', textAlign: 'center', color: '#475569', fontSize: '0.8rem' }}>
                          Promedio por editor
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* ── GRÁFICA: Ocupación y Free Time por Editor ──────── */}
                {reportData.effort.editors.length > 0 && (() => {
                  const editors = reportData.effort.editors;
                  const barData = {
                    labels: editors.map(e => e.editor),
                    datasets: [
                      {
                        label: '% Ocupación Óptima',
                        data: editors.map(e => Math.min(e.pctOcupacion, 70)),
                        backgroundColor: '#6366f1',
                        borderRadius: 4,
                        borderSkipped: false,
                      },
                      {
                        label: '% Sobrecargado',
                        data: editors.map(e => e.pctOcupacion > 70 ? e.pctOcupacion - 70 : 0),
                        backgroundColor: '#f97316',
                        borderRadius: 4,
                        borderSkipped: false,
                      },
                      {
                        label: '% Free Time',
                        data: editors.map(e => e.pctFreeTime),
                        backgroundColor: '#86efac',
                        borderRadius: 4,
                        borderSkipped: false,
                      },
                    ],
                  };
                  const barOptions = {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: { stacked: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#e2e8f0' } },
                      y: { stacked: true, grid: { display: false }, ticks: { font: { weight: 600, size: 12 }, color: '#1e293b' } },
                    },
                    plugins: {
                      legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12, weight: 600 } } },
                      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}%` } },
                    },
                  };
                  return (
                    <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px #0002', padding: '1.5rem 2rem', marginBottom: '1.5rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e3a8a', marginBottom: '1rem' }}>📊 Ocupación y Free Time por Editor (base {BASE_HORAS}h)</div>
                      <div style={{ height: Math.max(editors.length * 44, 180) }}>
                        <Bar ref={chartRef} data={barData} options={barOptions} />
                      </div>
                      {/* Leyenda de colores para ocupación */}
                      <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>⚠️ Estándar de ocupación:</div>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '12px', height: '12px', backgroundColor: '#6366f1', borderRadius: '2px' }}></div>
                            <span style={{ color: '#475569' }}>Óptimo ({"<"} 70%)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '12px', height: '12px', backgroundColor: '#f97316', borderRadius: '2px' }}></div>
                            <span style={{ color: '#475569' }}>Sobrecargado (≥ 70%)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                </>
              )}
            </>
          )}

          {/* ── TABLA ASSETS POR PLATAFORMA ─────────────────────────────── */}
          {activeView === 'assets' && (
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
                          {ed.byPlatform[p]?.count || 0}
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
          )}

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

/**
 * PlatformReportsView.jsx - Vista de reportes por plataforma / versión
 * Usa PlatformReportsEngine + libraryStore + excelStore
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import excelStore from '../../store/excelStore';
import libraryStore from '../../store/libraryStore';
import PlatformReportsEngine from '../../core/reportEngine/PlatformReportsEngine';
import './PlatformReportsView.css';

// Formatea minutos a "Xh Ym" o "Xm"
function formatMinutes(mins) {
  return Math.round(mins).toString();
}

// Formatea una fecha ISO a locale
function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PlatformReportsView() {
  const rows = excelStore((s) => s.excelRows);
  const library = libraryStore((s) => ({
    platforms: s.platforms,
    categories: s.categories,
    versions: s.versions,
  }));

  // ── Controles del reporte ──────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate]     = useState(today);
  const [dateField, setDateField] = useState('approved_date');

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  // Qué plataformas están expandidas
  const [expandedPlatforms, setExpandedPlatforms] = useState({});
  // Qué editores están expandidos dentro de su plataforma
  const [expandedEditors, setExpandedEditors] = useState({});

  // ── Generar reporte ────────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (dateField !== 'all' && (!startDate || !endDate)) {
      setError('Selecciona ambas fechas o elige "Sin filtro de fecha".');
      return;
    }
    setError(null);
    setLoading(true);
    setExpandedPlatforms({});
    setExpandedEditors({});

    try {
      const result = PlatformReportsEngine.buildReport(
        rows,
        startDate || '2000-01-01',
        endDate   || today,
        library,
        dateField
      );
      setReportData(result);
      // Expandir la primera plataforma automáticamente
      if (result.platforms.length > 0) {
        setExpandedPlatforms({ [result.platforms[0].platform]: true });
      }
    } catch (err) {
      console.error('Error generando reporte:', err);
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle expansión ───────────────────────────────────────────────────────
  const togglePlatform = (platform) =>
    setExpandedPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));

  const toggleEditor = (key) =>
    setExpandedEditors((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Export Excel ───────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (!reportData) return;

    const wb = XLSX.utils.book_new();
    const periodoStr = dateField === 'all'
      ? 'Todos los registros'
      : `${startDate} → ${endDate}`;

    // ── Una hoja por plataforma (igual que Tracking_Project) ─────────────────
    // Columnas: Editor | [cat1] | [cat2] | ... | Minutos | Total
    // "Minutos" = total minutos del editor, "Total" = total ítems del editor
    reportData.platforms.forEach((plt) => {
      // Categorías que realmente usa esta plataforma (sin 'unregistered' si no hay)
      const platCats = [];
      plt.editors.forEach((ed) => {
        Object.keys(ed.byCategory).forEach((cat) => {
          if (!platCats.includes(cat)) platCats.push(cat);
        });
      });
      // Mover 'unregistered' al final si existe
      const sortedCats = [
        ...platCats.filter((c) => c !== 'unregistered'),
        ...platCats.filter((c) => c === 'unregistered'),
      ];

      const wsData = [];

      // Título de hoja
      wsData.push([`${plt.platform} — ${periodoStr}`]);
      wsData.push([]);

      // Encabezado: Editor | [categorías] | Minutos | Total
      wsData.push(['Editor', ...sortedCats, 'Minutos', 'Total']);

      // Una fila por editor
      plt.editors.forEach((ed) => {
        const catCounts = sortedCats.map((cat) => ed.byCategory[cat]?.count || 0);
        wsData.push([ed.editor, ...catCounts, ed.totalMinutes, ed.totalCount]);
      });

      // Fila TOTAL
      const totalCatCounts = sortedCats.map((cat) => plt.totalByCategory[cat]?.count || 0);
      wsData.push(['TOTAL', ...totalCatCounts, plt.totalMinutes, plt.totalCount]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 26 },                              // Editor
        ...sortedCats.map(() => ({ wch: 16 })),   // categorías
        { wch: 12 },                              // Minutos
        { wch: 10 },                              // Total
      ];

      // Nombre de hoja: máx 31 chars, sin caracteres inválidos (igual que Tracking_Project)
      const sheetName = plt.platform.replace(/[\\/*?[\]:]/g, '_').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // ── Hoja "Resumen": una fila por plataforma con totales ───────────────────
    // Columnas: Plataforma | [todas las categorías] | Minutos | Total
    const allCats = [];
    reportData.platforms.forEach((plt) => {
      Object.keys(plt.totalByCategory).forEach((cat) => {
        if (!allCats.includes(cat)) allCats.push(cat);
      });
    });
    const sortedAllCats = [
      ...allCats.filter((c) => c !== 'unregistered'),
      ...allCats.filter((c) => c === 'unregistered'),
    ];

    const wsResumen = [];
    wsResumen.push([`Resumen — ${periodoStr}`]);
    wsResumen.push([`Generado: ${new Date(reportData.generatedAt).toLocaleString('es-MX')}`]);
    wsResumen.push([]);
    wsResumen.push(['Plataforma', ...sortedAllCats, 'Minutos', 'Total']);

    reportData.platforms.forEach((plt) => {
      const catCounts = sortedAllCats.map((cat) => plt.totalByCategory[cat]?.count || 0);
      wsResumen.push([plt.platform, ...catCounts, plt.totalMinutes, plt.totalCount]);
    });

    // Fila gran total
    const grandCatCounts = sortedAllCats.map((cat) =>
      reportData.platforms.reduce((s, p) => s + (p.totalByCategory[cat]?.count || 0), 0)
    );
    wsResumen.push(['GRAN TOTAL', ...grandCatCounts, reportData.grandTotal.minutes, reportData.grandTotal.count]);

    const wsRes = XLSX.utils.aoa_to_sheet(wsResumen);
    wsRes['!cols'] = [
      { wch: 16 },
      ...sortedAllCats.map(() => ({ wch: 16 })),
      { wch: 12 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');

    // ── Hoja "Auditoría" ───────────────────────────────────────────────────────
    const auditData = [
      ['AUDITORÍA DEL REPORTE'],
      [],
      ['Plataformas no registradas (descartadas):'],
      ...reportData.audit.unregisteredPlatforms.map((p) => ['', p]),
      [],
      ['Versiones no registradas (fallback numérico aplicado):'],
      ...reportData.audit.unregisteredVersions.map((v) => ['', v]),
      [],
      ['Filas descartadas (total):', reportData.audit.discardedCount],
    ];
    const wsAudit = XLSX.utils.aoa_to_sheet(auditData);
    wsAudit['!cols'] = [{ wch: 42 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsAudit, 'Auditoría');

    // Nombre del archivo
    const ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `reporte_plataformas_${ts}.xlsx`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="platform-reports">
      <h2>📊 Reporte por Plataforma / Versión</h2>

      {/* ── Filtros ── */}
      <div className="pr-filters">
        {/* Selector de campo de fecha */}
        <div className="pr-filter-group">
          <label>Filtrar por fecha:</label>
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            disabled={loading}
          >
            <option value="approved_date">✅ APPROVED_DATE</option>
            <option value="air_date">📅 AIR_DATE</option>
            <option value="all">🔓 Sin filtro de fecha</option>
          </select>
        </div>

        {/* Rango de fechas (oculto si dateField === 'all') */}
        {dateField !== 'all' && (
          <>
            <div className="pr-filter-group">
              <label>Desde:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="pr-filter-group">
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
          className="pr-btn-generate"
          onClick={handleGenerate}
          disabled={loading || rows.length === 0}
        >
          {loading ? '⏳ Generando...' : '▶ Generar Reporte'}
        </button>

        {reportData && (
          <button
            className="pr-btn-export"
            onClick={handleExportExcel}
          >
            ⬇ Descargar Excel
          </button>
        )}
      </div>

      {error && <div className="pr-error">{error}</div>}
      {rows.length === 0 && (
        <div className="pr-empty">⬆️ Carga un archivo Excel para generar el reporte.</div>
      )}

      {/* ── Resultado ── */}
      {reportData && (
        <>
          {/* Resumen general */}
          <div className="pr-summary">
            <span>
              🗓 Período:{' '}
              {dateField === 'all'
                ? 'Todos los registros'
                : `${startDate} → ${endDate}`}
            </span>
            <span>🎬 Total registros procesados: <strong>{rows.length - reportData.audit.discardedCount}</strong></span>
            <span>⏱ Total minutos: <strong>{formatMinutes(reportData.grandTotal.minutes)}</strong></span>
            <span>📦 Ítems: <strong>{reportData.grandTotal.count}</strong></span>
            <span className="pr-generated">Generado: {formatDate(reportData.generatedAt)}</span>
          </div>

          {/* Plataformas */}
          {reportData.platforms.length === 0 ? (
            <div className="pr-empty">
              No se encontraron registros para el período y filtros seleccionados.
            </div>
          ) : (
            <div className="pr-platforms">
              {reportData.platforms.map((plt) => (
                <div key={plt.platform} className="pr-platform-card">
                  {/* Header plataforma */}
                  <div
                    className="pr-platform-header"
                    onClick={() => togglePlatform(plt.platform)}
                  >
                    <span className="pr-platform-toggle">
                      {expandedPlatforms[plt.platform] ? '▼' : '▶'}
                    </span>
                    <span className="pr-platform-name">🌐 {plt.platform}</span>
                    <span className="pr-platform-stats">
                      {plt.totalCount} ítems · {formatMinutes(plt.totalMinutes)}
                    </span>
                  </div>

                  {/* Contenido plataforma */}
                  {expandedPlatforms[plt.platform] && (
                    <div className="pr-platform-body">
                      {/* Totales por categoría */}
                      {Object.keys(plt.totalByCategory).length > 0 && (
                        <div className="pr-category-totals">
                          <span className="pr-cat-title">Totales por categoría:</span>
                          {/* Usar orden de plt.categories si está disponible (categorías configuradas),
                              luego cualquier extra que aparezca en los datos */}
                          {(() => {
                            const configuredKeys = (plt.categories || []).map((c) => c.category_key);
                            const dataKeys = Object.keys(plt.totalByCategory);
                            const orderedKeys = [
                              ...new Set([
                                ...configuredKeys.filter((k) => dataKeys.includes(k)),
                                ...dataKeys.filter((k) => !configuredKeys.includes(k)),
                              ])
                            ];
                            return orderedKeys.map((cat) => {
                              const val = plt.totalByCategory[cat];
                              if (!val) return null;
                              const catDef = (plt.categories || []).find((c) => c.category_key === cat);
                              const label = catDef ? `${catDef.label} (${catDef.duration_minutes} min)` : cat;
                              return (
                                <span key={cat} className="pr-cat-chip" style={catDef?.color ? { borderLeft: `4px solid ${catDef.color}` } : {}}>
                                  {label}: {val.count} ({formatMinutes(val.minutes)})
                                </span>
                              );
                            });
                          })()}
                        </div>
                      )}

                      {/* Editores */}
                      {plt.editors.map((ed) => {
                        const edKey = `${plt.platform}::${ed.editor}`;
                        return (
                          <div key={edKey} className="pr-editor-row">
                            {/* Header editor */}
                            <div
                              className="pr-editor-header"
                              onClick={() => toggleEditor(edKey)}
                            >
                              <span className="pr-editor-toggle">
                                {expandedEditors[edKey] ? '▼' : '▶'}
                              </span>
                              <span className="pr-editor-name">👤 {ed.editor}</span>
                              <span className="pr-editor-stats">
                                {ed.totalCount} ítems · {formatMinutes(ed.totalMinutes)}
                              </span>
                            </div>

                            {/* Desglose por categoría del editor */}
                            {expandedEditors[edKey] && (
                              <table className="pr-cat-table">
                                <thead>
                                  <tr>
                                    <th>Categoría</th>
                                    <th>Ítems</th>
                                    <th>Minutos</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(ed.byCategory).map(([cat, val]) => {
                                    const catDef = (plt.categories || []).find((c) => c.category_key === cat);
                                    const label = catDef ? `${catDef.label} (${catDef.duration_minutes} min)` : cat;
                                    return (
                                      <tr key={cat}>
                                        <td style={catDef?.color ? { borderLeft: `3px solid ${catDef.color}`, paddingLeft: '8px' } : {}}>
                                          {label}
                                        </td>
                                        <td>{val.count}</td>
                                        <td>{formatMinutes(val.minutes)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="pr-total-row">
                                    <td><strong>TOTAL</strong></td>
                                    <td><strong>{ed.totalCount}</strong></td>
                                    <td><strong>{formatMinutes(ed.totalMinutes)}</strong></td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Auditoría ── */}
          <div className="pr-audit">
            <h3>🔍 Auditoría</h3>
            <div className="pr-audit-grid">
              {/* Plataformas no registradas */}
              <div className="pr-audit-block">
                <h4>🚫 Plataformas no registradas ({reportData.audit.unregisteredPlatforms.length})</h4>
                {reportData.audit.unregisteredPlatforms.length === 0 ? (
                  <p className="pr-audit-ok">✅ Todas las plataformas están registradas</p>
                ) : (
                  <ul>
                    {reportData.audit.unregisteredPlatforms.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Versiones no registradas */}
              <div className="pr-audit-block">
                <h4>
                  ⚠️ Versiones no registradas ({reportData.audit.unregisteredVersions.length})
                </h4>
                {reportData.audit.unregisteredVersions.length === 0 ? (
                  <p className="pr-audit-ok">✅ Todas las versiones se encontraron en la librería</p>
                ) : (
                  <ul>
                    {reportData.audit.unregisteredVersions.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Filas descartadas */}
              <div className="pr-audit-block">
                <h4>🗑 Filas descartadas: {reportData.audit.discardedCount}</h4>
                <p className="pr-audit-info">
                  Filas excluidas por fecha fuera de rango, plataforma no registrada
                  (en el modo IBERIA) o versión sin categoría válida.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PlatformReportsView;

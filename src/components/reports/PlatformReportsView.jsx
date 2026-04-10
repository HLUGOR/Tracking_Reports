/**
 * PlatformReportsView.jsx - Vista de reportes por plataforma / versión
 * Usa PlatformReportsEngine + libraryStore + excelStore
 */

import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import excelStore from '../../store/excelStore';
import libraryStore from '../../store/libraryStore';
import PlatformReportsEngine from '../../core/reportEngine/PlatformReportsEngine';
import './PlatformReportsView.css';

// Formatea minutos a entero
function formatMinutes(mins) {
  return Math.round(mins).toString();
}

/**
 * Construye el label de categoría para encabezados.
 * Si el nombre ya incluye la duración (ej: "serie_30min", "Serie 60min", "30", "120") la deja así.
 * Si no, agrega " (Xmin)" al final para que cada columna sea inequívoca.
 */
function buildCategoryLabel(cat) {
  // Nombre base: eliminar sufijos de duración sueltos como "60", "120", "45min", "(60 min)", etc.
  const rawName = (cat.label || cat.name || cat.category_key || '').trim();
  const cleanName = rawName
    .replace(/\s*\(\d+\s*min\)/gi, '')   // quita "(60 min)" o "(60min)"
    .replace(/\s+\d+\s*min\b/gi, '')      // quita " 45min" o " 120 min"
    .replace(/\s+\d+\s*$/, '')            // quita número suelto al final " 60"
    .trim();
  const dur = Number(cat.duration_minutes || cat.duration || 0);
  if (dur <= 0) return cleanName || rawName;
  return `${cleanName || rawName} (${dur} min)`;
}

// Formatea segundos totales a H:MM:SS (para COMERCIALES)
function formatTimecode(seconds) {
  const totalSecs = Math.round(Number(seconds) || 0);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Convierte segundos a minutos decimales con 2 decimales
function secondsToMinutes(seconds) {
  return (Number(seconds || 0) / 60).toFixed(2);
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
  const handleExportExcel = async () => {
    if (!reportData) return;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TrackingReports';
    wb.created = new Date();

    const periodoStr = dateField === 'all'
      ? 'Todos los registros'
      : `${startDate} → ${endDate}`;

    // ── Paleta de colores ──────────────────────────────────────────────────
    const COLOR = {
      headerDark:   '1E293B', // slate-900  → fondo header plataforma
      headerBlue:   '1D4ED8', // blue-700   → fondo header categorías
      headerGreen:  '15803D', // green-700  → fondo Minutos/Total
      totalRow:     '0F172A', // slate-950  → fondo fila TOTAL
      summaryBg:    'DBEAFE', // blue-100   → fondo resumen
      auditBg:      'FEF9C3', // yellow-100 → auditoría
      altRow:       'F8FAFC', // slate-50   → filas alternas
      white:        'FFFFFF',
      comercialesBg:'1E40AF', // blue-800   → header COMERCIALES
    };

    const fontWhite = { name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' }, bold: true };
    const fontDark  = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } };
    const fontBold  = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' }, bold: true };
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

    const applyHeaderCell = (cell, text, bgColor) => {
      cell.value = text;
      cell.font = fontWhite;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
    };

    const applyDataCell = (cell, value, isAlt = false, align = 'center') => {
      cell.value = value;
      cell.font = fontDark;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? 'FFF8FAFC' : 'FFFFFFFF' } };
      cell.alignment = { horizontal: align, vertical: 'middle' };
      cell.border = border;
    };

    const applyTotalCell = (cell, value) => {
      cell.value = value;
      cell.font = fontTotal;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.totalRow } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderTotal;
    };

    // ── Una hoja por plataforma ─────────────────────────────────────────────
    for (const plt of reportData.platforms) {
      const sheetName = plt.platform.replace(/[\\/*?[\]:]/g, '_').slice(0, 31);
      const ws = wb.addWorksheet(sheetName);

      // ── COMERCIALES ────────────────────────────────────────────────────────
      if (plt.logica === 'logica_comerciales') {
        ws.columns = [
          { width: 28 }, { width: 14 }, { width: 14 }, { width: 12 },
        ];

        // Fila título (merge A1:D1)
        const titleRow = ws.addRow([`${plt.platform}  •  ${periodoStr}`]);
        ws.mergeCells(`A${titleRow.number}:D${titleRow.number}`);
        const tc = titleRow.getCell(1);
        tc.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.comercialesBg } };
        tc.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 28;
        ws.addRow([]);

        // Encabezado
        const hdr = ws.addRow([plt.platform, 'TIEMPO', 'MINUTOS', 'TOTAL']);
        hdr.height = 20;
        ['A','B','C','D'].forEach((col, i) => {
          applyHeaderCell(hdr.getCell(col), [plt.platform,'TIEMPO','MINUTOS','TOTAL'][i], COLOR.headerDark);
        });

        // Filas editores
        plt.editors.forEach((ed, idx) => {
          const row = ws.addRow([
            ed.editor,
            formatTimecode(ed.totalSeconds),
            parseFloat(secondsToMinutes(ed.totalSeconds)),
            ed.totalCount,
          ]);
          const isAlt = idx % 2 === 1;
          applyDataCell(row.getCell('A'), ed.editor, isAlt, 'left');
          applyDataCell(row.getCell('B'), formatTimecode(ed.totalSeconds), isAlt);
          applyDataCell(row.getCell('C'), parseFloat(secondsToMinutes(ed.totalSeconds)), isAlt);
          applyDataCell(row.getCell('D'), ed.totalCount, isAlt);
        });

        // Fila TOTAL
        const totRow = ws.addRow([
          'TOTAL',
          formatTimecode(plt.totalSeconds),
          parseFloat(secondsToMinutes(plt.totalSeconds)),
          plt.totalCount,
        ]);
        totRow.height = 18;
        ['A','B','C','D'].forEach((col) => applyTotalCell(totRow.getCell(col), totRow.getCell(col).value));
        continue;
      }

      // ── BP&I ───────────────────────────────────────────────────────────────
      if (plt.logica === 'logica_bp_i') {
        ws.columns = [
          { width: 28 }, { width: 14 }, { width: 12 },
        ];

        // Fila título (merge A1:C1)
        const titleRow = ws.addRow([`${plt.platform}  •  ${periodoStr}`]);
        ws.mergeCells(`A${titleRow.number}:C${titleRow.number}`);
        const tc = titleRow.getCell(1);
        tc.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // blue-900 para BP&I
        tc.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 28;
        ws.addRow([]);

        // Encabezado
        const hdr = ws.addRow(['Editor', 'MINUTOS', 'TOTAL']);
        hdr.height = 20;
        ['A','B','C'].forEach((col, i) => {
          applyHeaderCell(hdr.getCell(col), ['Editor','MINUTOS','TOTAL'][i], COLOR.headerDark);
        });

        // Filas editores
        plt.editors.forEach((ed, idx) => {
          const row = ws.addRow([
            ed.editor,
            Math.round(ed.totalMinutes),
            ed.totalCount,
          ]);
          const isAlt = idx % 2 === 1;
          applyDataCell(row.getCell('A'), ed.editor, isAlt, 'left');
          applyDataCell(row.getCell('B'), Math.round(ed.totalMinutes), isAlt);
          applyDataCell(row.getCell('C'), ed.totalCount, isAlt);
        });

        // Fila TOTAL
        const totRow = ws.addRow([
          'TOTAL',
          Math.round(plt.totalMinutes),
          plt.totalCount,
        ]);
        totRow.height = 18;
        ['A','B','C'].forEach((col) => applyTotalCell(totRow.getCell(col), totRow.getCell(col).value));
        continue;
      }

      // ── YOUTUBE ───────────────────────────────────────────────────────────
      if (plt.logica === 'logica_youtube') {
        ws.columns = [
          { width: 28 }, { width: 14 }, { width: 14 }, { width: 12 },
        ];

        // Fila título (merge A1:D1)
        const titleRow = ws.addRow([`${plt.platform}  •  ${periodoStr}`]);
        ws.mergeCells(`A${titleRow.number}:D${titleRow.number}`);
        const tc = titleRow.getCell(1);
        tc.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } }; // rojo YouTube
        tc.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 28;
        ws.addRow([]);

        // Encabezado
        const hdr = ws.addRow(['Editor', 'CLIPS', 'SHORT', 'TOTAL']);
        hdr.height = 20;
        ['A','B','C','D'].forEach((col, i) => {
          applyHeaderCell(hdr.getCell(col), ['Editor','CLIPS','SHORT','TOTAL'][i], COLOR.headerDark);
        });

        // Filas editores
        plt.editors.forEach((ed, idx) => {
          const clips  = ed.byCategory['clips']?.count  || 0;
          const shorts = ed.byCategory['shorts']?.count || 0;
          const row = ws.addRow([ed.editor, clips, shorts, ed.totalCount]);
          const isAlt = idx % 2 === 1;
          applyDataCell(row.getCell('A'), ed.editor, isAlt, 'left');
          applyDataCell(row.getCell('B'), clips,  isAlt);
          applyDataCell(row.getCell('C'), shorts, isAlt);
          applyDataCell(row.getCell('D'), ed.totalCount, isAlt);
        });

        // Fila TOTAL
        const totClips  = plt.totalByCategory['clips']?.count  || 0;
        const totShorts = plt.totalByCategory['shorts']?.count || 0;
        const ytTotRow  = ws.addRow(['TOTAL', totClips, totShorts, plt.totalCount]);
        ytTotRow.height = 18;
        ['A','B','C','D'].forEach((col) => applyTotalCell(ytTotRow.getCell(col), ytTotRow.getCell(col).value));
        continue;
      }

      // ── LÓGICA ESTÁNDAR ────────────────────────────────────────────────────
      const platCats = [];
      plt.editors.forEach((ed) => {
        Object.keys(ed.byCategory).forEach((cat) => {
          if (!platCats.includes(cat)) platCats.push(cat);
        });
      });
      // Mapa clave → duration_minutes para ordenar
      const catDurationMap = {};
      (plt.categories || []).forEach((cat) => {
        catDurationMap[cat.category_key] = cat.duration_minutes || 0;
      });
      const sortedCats = [
        ...platCats
          .filter((c) => c !== 'unregistered')
          .sort((a, b) => (catDurationMap[a] || 0) - (catDurationMap[b] || 0)),
        ...platCats.filter((c) => c === 'unregistered'),
      ];
      const categoryLabelMap = {};
      (plt.categories || []).forEach((cat) => {
        categoryLabelMap[cat.category_key] = buildCategoryLabel(cat);
      });
      const headerCats = sortedCats.map((cat) => categoryLabelMap[cat] || cat);
      const totalCols = 1 + sortedCats.length + 2; // Editor + cats + Minutos + Total

      ws.columns = [
        { width: 28 },
        ...sortedCats.map(() => ({ width: 16 })),
        { width: 13 },
        { width: 11 },
      ];

      // Fila título (merge toda la fila)
      const lastColLetter = String.fromCharCode(64 + totalCols);
      const titleRow = ws.addRow([`${plt.platform}  •  ${periodoStr}`]);
      ws.mergeCells(`A${titleRow.number}:${lastColLetter}${titleRow.number}`);
      const tc = titleRow.getCell(1);
      tc.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.headerDark } };
      tc.alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.height = 28;
      ws.addRow([]);

      // Encabezado
      const hdrRow = ws.addRow(['Editor', ...headerCats, 'Minutos', 'Total']);
      hdrRow.height = 20;
      hdrRow.getCell(1).value = 'Editor';
      applyHeaderCell(hdrRow.getCell(1), 'Editor', COLOR.headerDark);
      headerCats.forEach((_, i) => {
        applyHeaderCell(hdrRow.getCell(2 + i), headerCats[i], COLOR.headerBlue);
      });
      applyHeaderCell(hdrRow.getCell(2 + sortedCats.length), 'Minutos', COLOR.headerGreen);
      applyHeaderCell(hdrRow.getCell(3 + sortedCats.length), 'Total', COLOR.headerGreen);

      // Filas editores
      plt.editors.forEach((ed, idx) => {
        const catCounts = sortedCats.map((cat) => ed.byCategory[cat]?.count || 0);
        const row = ws.addRow([ed.editor, ...catCounts, Math.round(ed.totalMinutes), ed.totalCount]);
        const isAlt = idx % 2 === 1;
        applyDataCell(row.getCell(1), ed.editor, isAlt, 'left');
        catCounts.forEach((_, i) => applyDataCell(row.getCell(2 + i), catCounts[i], isAlt));
        applyDataCell(row.getCell(2 + sortedCats.length), Math.round(ed.totalMinutes), isAlt);
        applyDataCell(row.getCell(3 + sortedCats.length), ed.totalCount, isAlt);
      });

      // Fila TOTAL
      const totalCatCounts = sortedCats.map((cat) => plt.totalByCategory[cat]?.count || 0);
      const totRow = ws.addRow(['TOTAL', ...totalCatCounts, Math.round(plt.totalMinutes), plt.totalCount]);
      totRow.height = 18;
      for (let i = 1; i <= totalCols; i++) applyTotalCell(totRow.getCell(i), totRow.getCell(i).value);
    }

    // ── Hoja RESUMEN ───────────────────────────────────────────────────────
    const wsRes = wb.addWorksheet('Resumen');

    // Recopilar todas las categorías (solo plataformas con categorías; las sin categorías como COMERCIALES y BP&I no tienen)
    const allCatKeys = [];
    const allCatLabelMap = {};
    reportData.platforms.forEach((plt) => {
      
      (plt.categories || []).forEach((cat) => {
        if (!allCatKeys.includes(cat.category_key)) {
          allCatKeys.push(cat.category_key);
          allCatLabelMap[cat.category_key] = buildCategoryLabel(cat);
        }
      });
      Object.keys(plt.totalByCategory).forEach((key) => {
        if (!allCatKeys.includes(key)) allCatKeys.push(key);
      });
    });
    const sortedAllCats = [
      ...allCatKeys
        .filter((c) => c !== 'unregistered')
        .sort((a, b) => {
          // Buscar duration_minutes de cada clave en cualquier plataforma
          const durA = reportData.platforms.flatMap(p => p.categories || []).find(c => c.category_key === a)?.duration_minutes || 0;
          const durB = reportData.platforms.flatMap(p => p.categories || []).find(c => c.category_key === b)?.duration_minutes || 0;
          return durA - durB;
        }),
      ...allCatKeys.filter((c) => c === 'unregistered'),
    ];
    const allCatLabels = sortedAllCats.map((k) => allCatLabelMap[k] || k);
    const totalResumen = 1 + sortedAllCats.length + 2;
    const lastResCol = String.fromCharCode(64 + totalResumen);

    wsRes.columns = [
      { width: 22 },
      ...sortedAllCats.map(() => ({ width: 16 })),
      { width: 13 },
      { width: 11 },
    ];

    // Título resumen
    const resTitleRow = wsRes.addRow([`RESUMEN GENERAL  •  ${periodoStr}`]);
    wsRes.mergeCells(`A1:${lastResCol}1`);
    const rtc = resTitleRow.getCell(1);
    rtc.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    rtc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.headerDark } };
    rtc.alignment = { horizontal: 'center', vertical: 'middle' };
    resTitleRow.height = 28;

    const genRow = wsRes.addRow([`Generado: ${new Date(reportData.generatedAt).toLocaleString('es-MX')}`]);
    wsRes.mergeCells(`A2:${lastResCol}2`);
    genRow.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    genRow.getCell(1).alignment = { horizontal: 'center' };
    wsRes.addRow([]);

    const resHdr = wsRes.addRow(['Plataforma', ...allCatLabels, 'Minutos', 'Total']);
    resHdr.height = 20;
    applyHeaderCell(resHdr.getCell(1), 'Plataforma', COLOR.headerDark);
    allCatLabels.forEach((_, i) => applyHeaderCell(resHdr.getCell(2 + i), allCatLabels[i], COLOR.headerBlue));
    applyHeaderCell(resHdr.getCell(2 + sortedAllCats.length), 'Minutos', COLOR.headerGreen);
    applyHeaderCell(resHdr.getCell(3 + sortedAllCats.length), 'Total', COLOR.headerGreen);

    reportData.platforms.forEach((plt, idx) => {
      const catCounts = sortedAllCats.map((cat) => plt.totalByCategory[cat]?.count || 0);
      // Para COMERCIALES los minutos se calculan desde segundos
      const plMinutes = plt.logica === 'logica_comerciales'
        ? Math.round(plt.totalSeconds / 60)
        : Math.round(plt.totalMinutes);
      const row = wsRes.addRow([plt.platform, ...catCounts, plMinutes, plt.totalCount]);
      const isAlt = idx % 2 === 1;
      applyDataCell(row.getCell(1), plt.platform, isAlt, 'left');
      catCounts.forEach((_, i) => applyDataCell(row.getCell(2 + i), catCounts[i], isAlt));
      applyDataCell(row.getCell(2 + sortedAllCats.length), plMinutes, isAlt);
      applyDataCell(row.getCell(3 + sortedAllCats.length), plt.totalCount, isAlt);
    });

    // Gran total resumen (todas las plataformas)
    const grandCatCounts = sortedAllCats.map((cat) =>
      reportData.platforms.reduce((s, p) => s + (p.totalByCategory[cat]?.count || 0), 0)
    );
    const resumenGrandMinutes = reportData.platforms.reduce((s, p) =>
      s + (p.logica === 'logica_comerciales' ? p.totalSeconds / 60 : p.totalMinutes), 0
    );
    const resumenGrandCount = reportData.platforms.reduce((s, p) => s + p.totalCount, 0);
    const grandRow = wsRes.addRow(['GRAN TOTAL', ...grandCatCounts, Math.round(resumenGrandMinutes), resumenGrandCount]);
    grandRow.height = 18;
    for (let i = 1; i <= totalResumen; i++) applyTotalCell(grandRow.getCell(i), grandRow.getCell(i).value);

    // ── Hoja AUDITORÍA ─────────────────────────────────────────────────────
    const wsAudit = wb.addWorksheet('Auditoría');
    wsAudit.columns = [{ width: 44 }, { width: 42 }];

    const auditTitle = wsAudit.addRow(['AUDITORÍA DEL REPORTE']);
    wsAudit.mergeCells('A1:B1');
    const atc = auditTitle.getCell(1);
    atc.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    atc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92400E' } };
    atc.alignment = { horizontal: 'center', vertical: 'middle' };
    auditTitle.height = 24;
    wsAudit.addRow([]);

    const addAuditSection = (title, items, emptyMsg) => {
      const secRow = wsAudit.addRow([title]);
      wsAudit.mergeCells(`A${secRow.number}:B${secRow.number}`);
      secRow.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF78350F' } };
      secRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
      if (items.length === 0) {
        const r = wsAudit.addRow(['', emptyMsg]);
        r.getCell(2).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF16A34A' } };
      } else {
        items.forEach((v) => {
          const r = wsAudit.addRow(['', v]);
          r.getCell(2).font = { name: 'Calibri', size: 10, color: { argb: 'FF92400E' } };
        });
      }
      wsAudit.addRow([]);
    };

    addAuditSection('🚫 Plataformas no registradas (descartadas):', reportData.audit.unregisteredPlatforms, '✅ Todas registradas');
    addAuditSection('⚠️ Versiones no registradas (fallback aplicado):', reportData.audit.unregisteredVersions, '✅ Todas registradas');
    const discRow = wsAudit.addRow(['Filas descartadas (total):', reportData.audit.discardedCount]);
    discRow.getCell(1).font = fontBold;
    discRow.getCell(2).font = { ...fontBold, color: { argb: 'FFB91C1C' } };

    // ── Descargar ──────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `reporte_plataformas_${ts}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
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
            onClick={() => handleExportExcel()}
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
                      {plt.totalCount} ítems ·{' '}
                      {plt.logica === 'logica_comerciales'
                        ? `${secondsToMinutes(plt.totalSeconds)} min`
                        : `${formatMinutes(plt.totalMinutes)} min`}
                    </span>
                  </div>

                  {/* Contenido plataforma */}
                  {expandedPlatforms[plt.platform] && (
                    <div className="pr-platform-body">

                      {/* ── Lógica Comerciales: tabla plana EDITOR | TIEMPO | MINUTOS | TOTAL ── */}
                      {plt.logica === 'logica_comerciales' ? (
                        <table className="pr-cat-table pr-comerciales-table">
                          <thead>
                            <tr>
                              <th>{plt.platform}</th>
                              <th>TIEMPO</th>
                              <th>MINUTOS</th>
                              <th>TOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plt.editors.map((ed) => (
                              <tr key={ed.editor}>
                                <td>{ed.editor}</td>
                                <td>{formatTimecode(ed.totalSeconds)}</td>
                                <td>{secondsToMinutes(ed.totalSeconds)}</td>
                                <td>{ed.totalCount}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="pr-total-row">
                              <td><strong>TOTAL</strong></td>
                              <td><strong>{formatTimecode(plt.totalSeconds)}</strong></td>
                              <td><strong>{secondsToMinutes(plt.totalSeconds)}</strong></td>
                              <td><strong>{plt.totalCount}</strong></td>
                            </tr>
                          </tfoot>
                        </table>
                      ) : plt.logica === 'logica_bp_i' ? (
                        <table className="pr-cat-table pr-bp-i-table">
                          <thead>
                            <tr>
                              <th>Editor</th>
                              <th>MINUTOS</th>
                              <th>TOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plt.editors.map((ed) => (
                              <tr key={ed.editor}>
                                <td>{ed.editor}</td>
                                <td>{Math.round(ed.totalMinutes)}</td>
                                <td>{ed.totalCount}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="pr-total-row">
                              <td><strong>TOTAL</strong></td>
                              <td><strong>{Math.round(plt.totalMinutes)}</strong></td>
                              <td><strong>{plt.totalCount}</strong></td>
                            </tr>
                          </tfoot>
                        </table>
                      ) : plt.logica === 'logica_youtube' ? (
                        <table className="pr-cat-table pr-youtube-table">
                          <thead>
                            <tr>
                              <th>Editor</th>
                              <th>CLIPS</th>
                              <th>SHORT</th>
                              <th>TOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plt.editors.map((ed) => (
                              <tr key={ed.editor}>
                                <td>{ed.editor}</td>
                                <td>{ed.byCategory['clips']?.count || 0}</td>
                                <td>{ed.byCategory['shorts']?.count || 0}</td>
                                <td>{ed.totalCount}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="pr-total-row">
                              <td><strong>TOTAL</strong></td>
                              <td><strong>{plt.totalByCategory['clips']?.count || 0}</strong></td>
                              <td><strong>{plt.totalByCategory['shorts']?.count || 0}</strong></td>
                              <td><strong>{plt.totalCount}</strong></td>
                            </tr>
                          </tfoot>
                        </table>
                      ) : (
                        <>
                          {/* Totales por categoría (lógica estándar) */}
                          {Object.keys(plt.totalByCategory).length > 0 && (
                            <div className="pr-category-totals">
                              <span className="pr-cat-title">Totales por categoría:</span>
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
                                  const label = catDef ? buildCategoryLabel(catDef) : cat;
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
                                <div
                                  className="pr-editor-header"
                                  onClick={() => toggleEditor(edKey)}
                                >
                                  <span className="pr-editor-toggle">
                                    {expandedEditors[edKey] ? '▼' : '▶'}
                                  </span>
                                  <span className="pr-editor-name">👤 {ed.editor}</span>
                                  <span className="pr-editor-stats">
                                    {ed.totalCount} ítems · {formatMinutes(ed.totalMinutes)} min
                                  </span>
                                </div>
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
                                        const label = catDef ? buildCategoryLabel(catDef) : cat;
                                        return (
                                          <tr key={cat}>
                                            <td style={catDef?.color ? { borderLeft: `3px solid ${catDef.color}`, paddingLeft: '8px' } : {}}>
                                              {label}
                                            </td>
                                            <td>{val.count}</td>
                                            <td>{formatMinutes(val.minutes)} min</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="pr-total-row">
                                        <td><strong>TOTAL</strong></td>
                                        <td><strong>{ed.totalCount}</strong></td>
                                        <td><strong>{formatMinutes(ed.totalMinutes)} min</strong></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
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

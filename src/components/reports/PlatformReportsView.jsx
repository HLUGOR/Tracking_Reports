/**
 * PlatformReportsView.jsx - Vista de reportes por plataforma / versión
 * Usa PlatformReportsEngine + libraryStore + excelStore
 */

import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import excelStore from '../../store/excelStore';
import libraryStore from '../../store/libraryStore';
import PlatformReportsEngine from '../../core/reportEngine/PlatformReportsEngine';
import { buildCategoryLabel } from '../../core/utils/categoryLabel';
import useTranslation from '../../i18n/useTranslation';
import { translate } from '../../i18n/translations';
import './PlatformReportsView.css';
import { formatPeriod } from '../../core/utils/dateUtils';

// El Excel exportado SIEMPRE va en inglés, sin importar el idioma activo en pantalla.
const e = (text) => translate(text, 'en');

// Una línea del desglose de filas no contadas: "GSN VOD — DURATION no es un número de
// minutos: "REPROSS", "NAN" (12 filas)". tr = traductor (pantalla: t; Excel: e).
const formatDiscardReason = (d, tr) => {
  const vals = d.values?.length ? `: ${d.values.map((v) => `"${v}"`).join(', ')}` : '';
  const who = d.platform ? `${d.platform} — ` : '';
  return `${who}${tr(d.motivo)}${vals} (${d.count} ${tr(d.count === 1 ? 'fila' : 'filas')})`;
};

// Una línea del aviso de fechas: "vacía (3 filas)" o ""25/06/2026" (2 filas)".
const formatInvalidDate = (d, tr) =>
  `${d.value === '' ? tr('vacía') : `"${d.value}"`} (${d.count} ${tr(d.count === 1 ? 'fila' : 'filas')})`;

// Formatea minutos a entero
function formatMinutes(mins) {
  return Math.round(mins).toString();
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
function formatDate(isoStr, language = 'es') {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString(language === 'en' ? 'en-US' : 'es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PlatformReportsView() {
  const { t, language } = useTranslation();
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
  const [dateField, setDateField] = useState('all');

  const [reportData, setReportData] = useState(null);
  // Filas cuya fecha de aprobación falta o no es MM/DD/AAAA válida (auditoría)
  const invalidDatesTotal = (reportData?.audit?.invalidApprovedDates || []).reduce((s, d) => s + d.count, 0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  // Qué plataformas están expandidas
  const [expandedPlatforms, setExpandedPlatforms] = useState({});
  // Qué editores están expandidos dentro de su plataforma
  const [expandedEditors, setExpandedEditors] = useState({});

  // ── Generar reporte ────────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (dateField !== 'all' && (!startDate || !endDate)) {
      setError(t('Selecciona ambas fechas o elige "Sin filtro de fecha".'));
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
      ? e('Todos los registros')
      : formatPeriod(startDate, endDate);

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
        const hdr = ws.addRow([plt.platform, e('TIEMPO'), e('MINUTOS'), e('TOTAL')]);
        hdr.height = 20;
        ['A','B','C','D'].forEach((col, i) => {
          applyHeaderCell(hdr.getCell(col), [plt.platform, e('TIEMPO'), e('MINUTOS'), e('TOTAL')][i], COLOR.headerDark);
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
          e('TOTAL'),
          formatTimecode(plt.totalSeconds),
          parseFloat(secondsToMinutes(plt.totalSeconds)),
          plt.totalCount,
        ]);
        totRow.height = 18;
        ['A','B','C','D'].forEach((col) => applyTotalCell(totRow.getCell(col), totRow.getCell(col).value));
        continue;
      }

      // ── BP&I y por duración ───────────────────────────────────────────────────────────
      if (plt.logica === 'logica_bp_i' || plt.logica === 'logica_por_duracion') {
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
        const hdr = ws.addRow([e('Editor'), e('MINUTOS'), e('TOTAL')]);
        hdr.height = 20;
        ['A','B','C'].forEach((col, i) => {
          applyHeaderCell(hdr.getCell(col), [e('Editor'), e('MINUTOS'), e('TOTAL')][i], COLOR.headerDark);
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
          e('TOTAL'),
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
        const hdr = ws.addRow([e('Editor'), e('CLIPS'), e('SHORT'), e('TOTAL')]);
        hdr.height = 20;
        ['A','B','C','D'].forEach((col, i) => {
          applyHeaderCell(hdr.getCell(col), [e('Editor'), e('CLIPS'), e('SHORT'), e('TOTAL')][i], COLOR.headerDark);
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
        const ytTotRow  = ws.addRow([e('TOTAL'), totClips, totShorts, plt.totalCount]);
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
      const hdrRow = ws.addRow([e('Editor'), ...headerCats, e('Minutos'), e('Total')]);
      hdrRow.height = 20;
      hdrRow.getCell(1).value = e('Editor');
      applyHeaderCell(hdrRow.getCell(1), e('Editor'), COLOR.headerDark);
      headerCats.forEach((_, i) => {
        applyHeaderCell(hdrRow.getCell(2 + i), headerCats[i], COLOR.headerBlue);
      });
      applyHeaderCell(hdrRow.getCell(2 + sortedCats.length), e('Minutos'), COLOR.headerGreen);
      applyHeaderCell(hdrRow.getCell(3 + sortedCats.length), e('Total'), COLOR.headerGreen);

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
      const totRow = ws.addRow([e('TOTAL'), ...totalCatCounts, Math.round(plt.totalMinutes), plt.totalCount]);
      totRow.height = 18;
      for (let i = 1; i <= totalCols; i++) applyTotalCell(totRow.getCell(i), totRow.getCell(i).value);
    }

    // ── Hoja RESUMEN ───────────────────────────────────────────────────────
    const wsRes = wb.addWorksheet(e('Resumen'));

    // Una columna por tipo de contenido (nombre + duración), juntando todas las
    // plataformas: cada plataforma tiene su propia categoría "serie (60 min)" en la
    // librería, pero en el resumen deben sumar en la misma columna. Solo se incluyen
    // tipos con al menos un ítem en el período (sin columnas llenas de ceros).
    const summaryCols = {}; // clave en minúsculas → { label, duration, unregistered }
    const countsByPlatform = reportData.platforms.map((plt) => {
      const counts = {};
      Object.entries(plt.totalByCategory).forEach(([key, val]) => {
        if (!val.count) return;
        const def = (plt.categories || []).find((c) => c.category_key === key);
        const label = def ? buildCategoryLabel(def) : String(key);
        const colKey = label.toLowerCase();
        summaryCols[colKey] ??= { label, duration: def?.duration_minutes || 0, unregistered: key === 'unregistered' };
        counts[colKey] = (counts[colKey] || 0) + val.count;
      });
      return counts;
    });
    const sortedAllCats = Object.keys(summaryCols).sort((a, b) =>
      (summaryCols[a].unregistered - summaryCols[b].unregistered)
      || (summaryCols[a].duration - summaryCols[b].duration)
      || summaryCols[a].label.localeCompare(summaryCols[b].label)
    );
    const allCatLabels = sortedAllCats.map((k) => summaryCols[k].label);
    const totalResumen = 1 + sortedAllCats.length + 2;
    const lastResCol = String.fromCharCode(64 + totalResumen);

    wsRes.columns = [
      { width: 22 },
      ...sortedAllCats.map(() => ({ width: 16 })),
      { width: 13 },
      { width: 11 },
    ];

    // Título resumen
    const resTitleRow = wsRes.addRow([`${e('RESUMEN GENERAL')}  •  ${periodoStr}`]);
    wsRes.mergeCells(`A1:${lastResCol}1`);
    const rtc = resTitleRow.getCell(1);
    rtc.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    rtc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR.headerDark } };
    rtc.alignment = { horizontal: 'center', vertical: 'middle' };
    resTitleRow.height = 28;

    const genRow = wsRes.addRow([`${e('Generado:')} ${new Date(reportData.generatedAt).toLocaleString('en-US')}`]);
    wsRes.mergeCells(`A2:${lastResCol}2`);
    genRow.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    genRow.getCell(1).alignment = { horizontal: 'center' };
    wsRes.addRow([]);

    const resHdr = wsRes.addRow([e('Plataforma'), ...allCatLabels, e('Minutos'), e('Total')]);
    resHdr.height = 20;
    applyHeaderCell(resHdr.getCell(1), e('Plataforma'), COLOR.headerDark);
    allCatLabels.forEach((_, i) => applyHeaderCell(resHdr.getCell(2 + i), allCatLabels[i], COLOR.headerBlue));
    applyHeaderCell(resHdr.getCell(2 + sortedAllCats.length), e('Minutos'), COLOR.headerGreen);
    applyHeaderCell(resHdr.getCell(3 + sortedAllCats.length), e('Total'), COLOR.headerGreen);

    reportData.platforms.forEach((plt, idx) => {
      const catCounts = sortedAllCats.map((col) => countsByPlatform[idx][col] || 0);
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
    const grandCatCounts = sortedAllCats.map((col) =>
      countsByPlatform.reduce((s, counts) => s + (counts[col] || 0), 0)
    );
    const resumenGrandMinutes = reportData.platforms.reduce((s, p) =>
      s + (p.logica === 'logica_comerciales' ? p.totalSeconds / 60 : p.totalMinutes), 0
    );
    const resumenGrandCount = reportData.platforms.reduce((s, p) => s + p.totalCount, 0);
    const grandRow = wsRes.addRow([e('GRAN TOTAL'), ...grandCatCounts, Math.round(resumenGrandMinutes), resumenGrandCount]);
    grandRow.height = 18;
    for (let i = 1; i <= totalResumen; i++) applyTotalCell(grandRow.getCell(i), grandRow.getCell(i).value);

    // ── Hoja AUDITORÍA ─────────────────────────────────────────────────────
    const wsAudit = wb.addWorksheet(e('Auditoría'));
    wsAudit.columns = [{ width: 44 }, { width: 42 }];

    const auditTitle = wsAudit.addRow([e('AUDITORÍA DEL REPORTE')]);
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

    addAuditSection(e('🚫 Plataformas no registradas (descartadas):'), reportData.audit.unregisteredPlatforms, e('✅ Todas registradas'));
    addAuditSection(e('⚠️ Versiones no registradas — CONTADAS con duración estimada:'), reportData.audit.unregisteredVersionsFallback, e('✅ Todas registradas'));
    addAuditSection(e('🔴 Versiones no registradas — EXCLUIDAS del reporte (0 minutos, sin fallback posible):'), reportData.audit.unregisteredVersionsDiscarded, e('✅ Todas registradas'));
    addAuditSection(
      e('📅 Filas sin fecha de aprobación válida (MM/DD/AAAA)'),
      (reportData.audit.invalidApprovedDates || []).map((d) => formatInvalidDate(d, e)),
      e('✅ Todas las filas traen fecha de aprobación')
    );
    const discRow = wsAudit.addRow([e('Filas descartadas (total):'), reportData.audit.discardedCount]);
    discRow.getCell(1).font = fontBold;
    discRow.getCell(2).font = { ...fontBold, color: { argb: 'FFB91C1C' } };
    (reportData.audit.discardedByReason || []).forEach((d) => {
      const r = wsAudit.addRow(['', formatDiscardReason(d, e)]);
      r.getCell(2).font = { name: 'Calibri', size: 10, color: { argb: 'FF92400E' } };
    });

    // ── Descargar ──────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `platform_report_${ts}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="platform-reports">
      <h2>📊 {t('Reporte por Plataforma / Versión')}</h2>

      {/* ── Filtros ── */}
      <div className="pr-filters">
        {/* Selector de campo de fecha */}
        <div className="pr-filter-group">
          <label>{t('Filtrar por fecha:')}</label>
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            disabled={loading}
          >
            <option value="approved_date">✅ {t('APPROVED_DATE')}</option>
            <option value="air_date">📅 {t('AIR_DATE')}</option>
            <option value="all">🔓 {t('Sin filtro de fecha')}</option>
          </select>
        </div>

        {/* Rango de fechas (oculto si dateField === 'all') */}
        {dateField !== 'all' && (
          <>
            <div className="pr-filter-group">
              <label>{t('Desde:')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="pr-filter-group">
              <label>{t('Hasta:')}</label>
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
          {loading ? `⏳ ${t('Generando...')}` : `▶ ${t('Generar Reporte')}`}
        </button>

        {reportData && (
          <button
            className="pr-btn-export"
            onClick={() => handleExportExcel()}
          >
            ⬇ {t('Descargar Excel')}
          </button>
        )}
      </div>

      {error && <div className="pr-error">{error}</div>}
      {rows.length === 0 && (
        <div className="pr-empty">⬆️ {t('Carga un archivo Excel para generar el reporte.')}</div>
      )}

      {/* ── Resultado ── */}
      {reportData && (
        <>
          {/* Resumen general */}
          <div className="pr-summary">
            <span>
              🗓 {t('Período:')}{' '}
              {dateField === 'all'
                ? t('Todos los registros')
                : formatPeriod(startDate, endDate)}
            </span>
            <span>🎬 {t('Total registros procesados:')} <strong>{rows.length - reportData.audit.discardedCount}</strong></span>
            <span>⏱ {t('Total minutos:')} <strong>{formatMinutes(reportData.grandTotal.minutes)}</strong></span>
            <span>📦 {t('Ítems:')} <strong>{reportData.grandTotal.count}</strong></span>
            <span className="pr-generated">{t('Generado:')} {formatDate(reportData.generatedAt, language)}</span>
          </div>

          {/* Plataformas */}
          {reportData.platforms.length === 0 ? (
            <div className="pr-empty">
              {t('No se encontraron registros para el período y filtros seleccionados.')}
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
                      {plt.totalCount} {t('ítems')} ·{' '}
                      {plt.logica === 'logica_comerciales'
                        ? `${secondsToMinutes(plt.totalSeconds)} ${t('min')}`
                        : `${formatMinutes(plt.totalMinutes)} ${t('min')}`}
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
                              <th>{t('TIEMPO')}</th>
                              <th>{t('MINUTOS')}</th>
                              <th>{t('TOTAL')}</th>
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
                              <td><strong>{t('TOTAL')}</strong></td>
                              <td><strong>{formatTimecode(plt.totalSeconds)}</strong></td>
                              <td><strong>{secondsToMinutes(plt.totalSeconds)}</strong></td>
                              <td><strong>{plt.totalCount}</strong></td>
                            </tr>
                          </tfoot>
                        </table>
                      ) : (plt.logica === 'logica_bp_i' || plt.logica === 'logica_por_duracion') ? (
                        <table className="pr-cat-table pr-bp-i-table">
                          <thead>
                            <tr>
                              <th>{t('Editor')}</th>
                              <th>{t('MINUTOS')}</th>
                              <th>{t('TOTAL')}</th>
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
                              <td><strong>{t('TOTAL')}</strong></td>
                              <td><strong>{Math.round(plt.totalMinutes)}</strong></td>
                              <td><strong>{plt.totalCount}</strong></td>
                            </tr>
                          </tfoot>
                        </table>
                      ) : plt.logica === 'logica_youtube' ? (
                        <table className="pr-cat-table pr-youtube-table">
                          <thead>
                            <tr>
                              <th>{t('Editor')}</th>
                              <th>{t('CLIPS')}</th>
                              <th>{t('SHORT')}</th>
                              <th>{t('TOTAL')}</th>
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
                              <td><strong>{t('TOTAL')}</strong></td>
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
                              <span className="pr-cat-title">{t('Totales por categoría:')}</span>
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
                                    {ed.totalCount} {t('ítems')} · {formatMinutes(ed.totalMinutes)} {t('min')}
                                  </span>
                                </div>
                                {expandedEditors[edKey] && (
                                  <table className="pr-cat-table">
                                    <thead>
                                      <tr>
                                        <th>{t('Categoría')}</th>
                                        <th>{t('Ítems')}</th>
                                        <th>{t('Minutos')}</th>
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
                                            <td>{formatMinutes(val.minutes)} {t('min')}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="pr-total-row">
                                        <td><strong>{t('TOTAL')}</strong></td>
                                        <td><strong>{ed.totalCount}</strong></td>
                                        <td><strong>{formatMinutes(ed.totalMinutes)} {t('min')}</strong></td>
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
            <h3>🔍 {t('Auditoría')}</h3>
            <div className="pr-audit-grid">
              {/* Plataformas no registradas */}
              <div className="pr-audit-block">
                <h4>🚫 {t('Plataformas no registradas')} ({reportData.audit.unregisteredPlatforms.length})</h4>
                {reportData.audit.unregisteredPlatforms.length === 0 ? (
                  <p className="pr-audit-ok">✅ {t('Todas las plataformas están registradas')}</p>
                ) : (
                  <ul>
                    {reportData.audit.unregisteredPlatforms.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Versiones no registradas — contadas con estimación */}
              <div className="pr-audit-block">
                <h4>
                  ⚠️ {t('No registradas — contadas con duración estimada')} ({reportData.audit.unregisteredVersionsFallback.length})
                </h4>
                <p className="pr-audit-info">{t('Sí suman minutos al editor (duración adivinada por el nombre).')}</p>
                {reportData.audit.unregisteredVersionsFallback.length === 0 ? (
                  <p className="pr-audit-ok">✅ {t('Todas las versiones se encontraron en la librería')}</p>
                ) : (
                  <ul>
                    {reportData.audit.unregisteredVersionsFallback.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Versiones no registradas — excluidas sin fallback */}
              <div className="pr-audit-block">
                <h4 style={{ color: '#b91c1c' }}>
                  🔴 {t('No registradas — EXCLUIDAS del reporte')} ({reportData.audit.unregisteredVersionsDiscarded.length})
                </h4>
                <p className="pr-audit-info">
                  <strong>{t('No suman ningún minuto')}</strong> — {t('la fila se descartó por completo (ej. IBERIA sin código conocido).')}
                </p>
                {reportData.audit.unregisteredVersionsDiscarded.length === 0 ? (
                  <p className="pr-audit-ok">✅ {t('Ninguna versión excluida')}</p>
                ) : (
                  <ul>
                    {reportData.audit.unregisteredVersionsDiscarded.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Fecha de aprobación faltante o no válida */}
              <div className="pr-audit-block">
                <h4 style={invalidDatesTotal > 0 ? { color: '#b91c1c' } : undefined}>
                  📅 {t('Filas sin fecha de aprobación válida (MM/DD/AAAA)')} ({invalidDatesTotal})
                </h4>
                {invalidDatesTotal === 0 ? (
                  <p className="pr-audit-ok">✅ {t('Todas las filas traen fecha de aprobación')}</p>
                ) : (
                  <>
                    <p className="pr-audit-info">
                      {t('Con "Todos los registros" se cuentan igual; con un rango de fechas quedan fuera porque no se pueden ubicar.')}
                    </p>
                    <ul>
                      {reportData.audit.invalidApprovedDates.map((d) => (
                        <li key={d.value}>{formatInvalidDate(d, t)}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Filas descartadas */}
              <div className="pr-audit-block">
                <h4>🗑 {t('Filas descartadas:')} {reportData.audit.discardedCount}</h4>
                <p className="pr-audit-info">
                  {t('Filas que no suman minutos ni horas a ningún editor. Motivo de cada una:')}
                </p>
                {(reportData.audit.discardedByReason || []).length > 0 && (
                  <ul>
                    {reportData.audit.discardedByReason.map((d) => (
                      <li key={`${d.platform}|${d.motivo}`}>{formatDiscardReason(d, t)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PlatformReportsView;

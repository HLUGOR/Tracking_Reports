/**
 * translations.js
 * Diccionario español → inglés para el texto de interfaz de los 3 reportes
 * (Plataformas, Editores, Series). NO traduce datos del usuario (nombres de
 * editor, plataforma, categoría o versión) — solo texto fijo de la interfaz.
 *
 * Uso: t('Texto en español') devuelve el inglés si el idioma activo es 'en',
 * o el mismo texto en español si no hay traducción o el idioma es 'es'.
 * La clave es siempre el texto español tal como aparece en el JSX — así no
 * hace falta inventar códigos de clave ni mantenerlos sincronizados a mano.
 */

const es_en = {
  // ── Comunes a los 3 reportes ──────────────────────────────────────────
  'Filtrar por fecha:': 'Filter by date:',
  'Desde:': 'From:',
  'Hasta:': 'To:',
  'Generando...': 'Generating...',
  'Generar Reporte': 'Generate Report',
  'Descargar Excel': 'Download Excel',
  'Sin filtro de fecha': 'No date filter',
  'Todos los registros': 'All records',
  'Generado:': 'Generated:',
  'Editor': 'Editor',
  'Categoría': 'Category',
  'Categorías': 'Categories',
  'Ítems': 'Items',
  'Minutos': 'Minutes',
  'TOTAL': 'TOTAL',
  'Total': 'Total',
  'ítems': 'items',
  'min': 'min',

  // ── Reporte de Plataformas ────────────────────────────────────────────
  'Reporte por Plataforma / Versión': 'Report by Platform / Version',
  'APPROVED_DATE': 'APPROVED_DATE',
  'AIR_DATE': 'AIR_DATE',
  'Carga un archivo Excel para generar el reporte.': 'Upload an Excel file to generate the report.',
  'Selecciona ambas fechas o elige "Sin filtro de fecha".': 'Select both dates or choose "No date filter".',
  'Período:': 'Period:',
  'Total registros procesados:': 'Total records processed:',
  'Total minutos:': 'Total minutes:',
  'Ítems:': 'Items:',
  'No se encontraron registros para el período y filtros seleccionados.': 'No records found for the selected period and filters.',
  'TIEMPO': 'TIME',
  'MINUTOS': 'MINUTES',
  'CLIPS': 'CLIPS',
  'SHORT': 'SHORT',
  'Totales por categoría:': 'Totals by category:',
  'Auditoría': 'Audit',
  'Plataformas no registradas': 'Unregistered platforms',
  'Todas las plataformas están registradas': 'All platforms are registered',
  'No registradas — contadas con duración estimada': 'Unregistered — counted with estimated duration',
  'Sí suman minutos al editor (duración adivinada por el nombre).': 'They do count minutes for the editor (duration guessed from the name).',
  'Todas las versiones se encontraron en la librería': 'All versions were found in the library',
  'No registradas — EXCLUIDAS del reporte': 'Unregistered — EXCLUDED from the report',
  'No suman ningún minuto': 'They add no minutes at all',
  'la fila se descartó por completo (ej. IBERIA sin código conocido).': 'the row was discarded entirely (e.g. IBERIA with an unknown code).',
  'Ninguna versión excluida': 'No version excluded',
  'Filas descartadas:': 'Discarded rows:',
  'Filas excluidas por fecha fuera de rango, plataforma no registrada (en el modo IBERIA) o versión sin categoría válida.':
    'Rows excluded due to out-of-range date, unregistered platform (IBERIA mode), or version without a valid category.',

  // ── Reporte de Editores ───────────────────────────────────────────────
  'Reportes por Editor': 'Editor Reports',
  'Reporte de Editores': 'Editor Report',
  'Base de Horas': 'Base Hours',
  'Editor / Plataforma': 'Editor / Platform',
  'Horas de Esfuerzo': 'Effort Hours',
  '% Ocupación': '% Occupancy',
  '% Libre': '% Free',
  'Horas Totales': 'Total Hours',
  'Óptimo': 'Optimal',
  'Sobrecarga': 'Overload',
  'No Óptimo (70-80%)': 'Not Optimal (70-80%)',
  'Ocupación por editor': 'Occupancy by editor',
  'Generando…': 'Generating…',
  'Fecha aprobación': 'Approval date',
  'Fecha aire': 'Air date',
  'Fecha Inicio:': 'Start Date:',
  'Fecha Fin:': 'End Date:',
  'Total Editores': 'Total Editors',
  'Total Items': 'Total Items',
  'Total Minutos': 'Total Minutes',
  'Plataformas': 'Platforms',
  'Assets por Plataforma': 'Assets by Platform',
  'Sin datos de esfuerzo.': 'No effort data.',
  'Para calcular las horas, debes configurar:': 'To calculate hours, you must configure:',
  'Campo "Grupo de Esfuerzo" en cada plataforma (Librería → Plataformas)': 'The "Effort Group" field on each platform (Library → Platforms)',
  'Campo "Tasa de Esfuerzo" en las categorías (Librería → Categorías)': 'The "Effort Rate" field on categories (Library → Categories)',
  'Horas': 'Hours',
  'TOTAL Horas': 'TOTAL Hours',
  'Base': 'Base',
  'Estado': 'Status',
  'Promedio por editor': 'Average per editor',
  '% Óptimo (0-70%)': '% Optimal (0-70%)',
  '% Sobrecarga (≥80%)': '% Overload (≥80%)',
  'Ocupación y Free Time por Editor': 'Occupancy and Free Time by Editor',
  'Estándar de ocupación:': 'Occupancy standard:',
  'Óptimo (0-70%)': 'Optimal (0-70%)',
  'Sobrecargado (≥80%)': 'Overloaded (≥80%)',
  'Carga un Excel primero para generar el reporte.': 'Upload an Excel file first to generate the report.',

  // ── Reporte por Serie ──────────────────────────────────────────────────
  'Reporte por Serie': 'Report by Series',
  'Serie': 'Series',
  'HNs': 'HNs',
  'Duración Total': 'Total Duration',
  'Horas de Esfuerzo Totales': 'Total Effort Hours',
  'Total Series': 'Total Series',
  'Series únicas:': 'Unique series:',
  'Total assets:': 'Total assets:',
  'Horas de Esfuerzo:': 'Effort Hours:',
  'Expandir todo': 'Expand all',
  'Colapsar todo': 'Collapse all',
  'Colapsar HNs': 'Collapse HNs',
  'Ver HNs': 'View HNs',

  // ── App.jsx (header, menú lateral, pie de página) ──────────────────────
  'Reportes, Librerías y Métricas - Sin Servidor': 'Reports, Libraries & Metrics - Serverless',
  'Cargar Excel': 'Upload Excel',
  'Reporte Plataformas': 'Platform Report',
  'Reporte Series': 'Series Report',
  'Reporte Editores': 'Editor Report',
  'Librerías': 'Libraries',
  'Carga un archivo Excel primero': 'Upload an Excel file first',
  'TrackingReports v1.0 | Aplicación Standalone | © 2026': 'TrackingReports v1.0 | Standalone App | © 2026',

  // ── ExcelUpload.jsx (pantalla de carga) ─────────────────────────────────
  'Cargar Archivo Excel': 'Upload Excel File',
  'Procesando archivo...': 'Processing file...',
  'Arrastra tu archivo aquí': 'Drag your file here',
  'o haz clic para seleccionar': 'or click to select',
  'Formatos aceptados: .xlsx, .xls, .csv': 'Accepted formats: .xlsx, .xls, .csv',
  'Leyendo archivo...': 'Reading file...',
  'Validando estructura...': 'Validating structure...',
  'Configura el mapeo de columnas...': 'Configure the column mapping...',
  'Error:': 'Error:',
  'Archivo:': 'File:',
  'Tamaño:': 'Size:',
  'Instrucciones': 'Instructions',
  'Carga tu archivo Excel usando drag & drop o haz clic': 'Upload your Excel file using drag & drop or click',
  'Configura el mapeo de columnas (solo una vez por archivo)': 'Configure the column mapping (only once per file)',
  'Una vez cargado, ve a la pestaña "Reportes" para generar análisis': 'Once uploaded, go to the "Reports" tab to generate analysis',
  'Descargar Template Excel': 'Download Excel Template',
  'filas cargadas correctamente. Mapeo guardado.': 'rows loaded successfully. Mapping saved.',

  // ── Excel exportado (siempre en inglés, sin importar el idioma en pantalla) ──
  'Resumen': 'Summary',
  'RESUMEN GENERAL': 'GENERAL SUMMARY',
  'Plataforma': 'Platform',
  'GRAN TOTAL': 'GRAND TOTAL',
  'AUDITORÍA DEL REPORTE': 'REPORT AUDIT',
  '🚫 Plataformas no registradas (descartadas):': '🚫 Unregistered platforms (discarded):',
  '⚠️ Versiones no registradas — CONTADAS con duración estimada:': '⚠️ Unregistered versions — COUNTED with estimated duration:',
  '🔴 Versiones no registradas — EXCLUIDAS del reporte (0 minutos, sin fallback posible):': '🔴 Unregistered versions — EXCLUDED from the report (0 minutes, no fallback possible):',
  '✅ Todas registradas': '✅ All registered',
  'Filas descartadas (total):': 'Discarded rows (total):',
  'Por Serie': 'By Series',
  'REPORTE POR SERIE': 'REPORT BY SERIES',
  'HN': 'HN',
  'HN(s)': 'HN(s)',
  'Base de cálculo:': 'Calculation base:',
  'h por editor': 'h per editor',
  'Gráfica Ocupación': 'Occupancy Chart',
  'Total Min': 'Total Min',
  'Reporte Horas de Esfuerzo': 'Effort Hours Report',
};

const en_by_es = es_en;

export function translate(text, language) {
  if (language !== 'en') return text;
  return en_by_es[text] ?? text;
}

export default es_en;

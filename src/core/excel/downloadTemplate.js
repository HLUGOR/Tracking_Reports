import * as XLSX from 'xlsx';

/**
 * Plantilla del Excel de entrada (botón "Descargar Template Excel" en Cargar Excel).
 * Hoja 1 "Template": solo los encabezados, en el mismo orden que el input que genera la
 * macro (es la hoja que lee la app). Hoja 2 "Instrucciones": qué va en cada columna.
 */
export function downloadTemplateExcel() {
  const headers = [
    'PLATFORM', 'HN', 'SERIE', 'SEASON', 'EPS TITLE', 'EPS#',
    'CLIP', 'SHORT', 'VERSION', 'EDITOR', 'DURATION', 'APPROVED_DATE',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));

  const instrucciones = [
    ['Columna', 'Qué va', 'Ejemplo'],
    ['PLATFORM', 'Nombre de la plataforma, igual que en Librerías → Plataformas', 'LATAM / FAST GLOBAL'],
    ['HN', 'Código HN del asset', 'U8105884'],
    ['SERIE', 'Nombre de la serie o película (Reporte Series)', 'DESIGNING WOMEN'],
    ['SEASON', 'Temporada. SONY ONE / AMAZON: vacío o 0 = película, otro valor = serie', '3'],
    ['EPS TITLE', 'Título del episodio', 'CANDIDATE, THE'],
    ['EPS#', 'Número de episodio', 'EP# 0302'],
    ['CLIP', 'YOUTUBE: cantidad de clips', '2'],
    ['SHORT', 'YOUTUBE: cantidad de shorts', '1'],
    ['VERSION', 'LATAM / VOD / OFF AIR / IBERIA: versión registrada en Librerías → Versiones. FAST GLOBAL: REPROSS = reproceso', 'LAT_ORI_HD 3 / REPROSS'],
    ['EDITOR', 'Apellido Nombre, tal cual está en Librerías → Editores', 'Guerrero Jose'],
    ['DURATION', 'Minutos ("30") o tiempo HH:MM:SS[:FF] con minutos y segundos de 00 a 59', '30 / 00:01:30:00'],
    ['APPROVED_DATE', 'Fecha de aprobación, formato MM/DD/AAAA (mes primero)', '06/15/2026'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInfo['!cols'] = [{ wch: 16 }, { wch: 90 }, { wch: 26 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Instrucciones');
  XLSX.writeFile(wb, 'TEMPLATE_TRACKINGREPORT.xlsx');
}

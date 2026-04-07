import * as XLSX from 'xlsx';

export function downloadTemplateExcel() {
  // Define las columnas del template
  const headers = [
    'EDITOR',
    'VERSION',
    'PLATFORM',
    'SEASON',
    'AIR_DATE',
    'APPROVED_DATE',
  ];
  // Crea una hoja con solo los headers
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  // Genera el archivo y lo descarga
  XLSX.writeFile(wb, 'TEMPLATE_TRACKINGREPORT.xlsx');
}

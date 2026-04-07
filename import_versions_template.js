/**
 * Script para generar el archivo Excel de importación de versiones
 * Ejecutar: node import_versions_template.js
 */

const XLSX = require('xlsx');
const fs = require('fs');

// Lista completa de versiones extraídas de la entrada del usuario
const versions = [
  // 120 min
  'BRA_ORI_SQZ_HD 10',
  'BRA_SAP_CC_CEN_SQZ_HD 10',
  'BRA_SAP_CC_CEN_SQZ_HD 9',
  'BRA_SAP_CC_CREDITS_HD 10',
  'BRA_SAP_CC_CREDITS_HD 9',
  'BRA_SAP_CC_SQZ_CREDITS_HD 10',
  'BRA_SAP_CC_SQZ_CREDITS_HD 9',
  'BRA_SAP_CC_SQZ_HD 10',
  'BRA_SAP_CC_SQZ_HD 9',
  'BRA_ORI_HD 9',
  'BRA_ORI_SQZ_CREDITS_HD 9',
  'BRA_SAP_CC_CEN_SQZ_CREDITS_HD 9',
  'BRA_SAP_CC_CEN_SQZ_CREDITS_HD 10',
  'BRA_ORI_CC_SQZ_CREDITS_HD 9',
  'BRA_ORI_CC_SQZ_CREDITS_HD 10',
  'LAT_ORI_SQZ_HD 10',
  'LAT_SAP_CC_CEN_SQZ_HD 10',
  'LAT_SAP_CC_CEN_SQZ_HD 9',
  'LAT_SAP_CC_CREDITS_HD 10',
  'LAT_SAP_CC_CREDITS_HD 9',
  'LAT_SAP_CC_SQZ_CREDITS_HD 10',
  'LAT_SAP_CC_SQZ_CREDITS_HD 9',
  'LAT_SAP_CC_SQZ_HD 10',
  'LAT_SAP_CC_SQZ_HD 9',
  'LAT_ORI_HD 9',
  'LAT_ORI_SQZ_CREDITS_HD 9',
  'LAT_SAP_CC_CEN_SQZ_CREDITS_HD 9',
  'LAT_SAP_CC_CEN_SQZ_CREDITS_HD 10',
  'LAT_ORI_CC_SQZ_CREDITS_HD 9',
  'LAT_ORI_CC_SQZ_CREDITS_HD 10',
  'LAT_ORI_CEN_SQZ_CREDITS_HD 9',
  
  // 60 minutos
  'BRA_ORI_HD 5',
  'BRA_ORI_HD 6',
  'BRA_SAP_CC_HD 5',
  'BRA_SAP_CC_HD 6',
  'BRA_SAP_CC_SQZ_HD 5',
  'BRA_SAP_CC_SQZ_HD 6',
  'LAT_ORI_HD 5',
  'LAT_ORI_HD 6',
  'LAT_SAP_CC_HD 5',
  'LAT_SAP_CC_HD 6',
  'LAT_SAP_CC_SQZ_HD 5',
  'LAT_SAP_CC_SQZ_HD 6',
  
  // 30 minutos
  'BRA_ORI_SQZ_HD 4',
  'BRA_SAP_CC_HD 3',
  'BRA_SAP_CC_HD 4',
  'BRA_ORI_SQZ_HD 3',
  'BRA_ORI_HD 3',
  'BRA_ORI_HD 4',
  'LAT_ORI_HD 1 AXN',
  'LAT_ORI_HD 1 SONY',
  'LAT_ORI_SQZ_HD 4',
  'LAT_SAP_CC_HD 3',
  'LAT_SAP_CC_HD 4',
  'LAT_ORI_SQZ_HD 3',
  'LAT_ORI_HD 3',
  'LAT_ORI_HD 4',
  'BRA_ORI_SQZ_HD 2',
  
  // 120 mins (variación)
  'e- FCHD1BSubtOpSCr',
  'p- F HD Ci5BAFRISCr',
  'p- FHD5BlocuAFRISCr',
  'p- F HD Ci6BAFRISCr',
  'e- FCHD1BSubt-OpSCr',
  
  // 60mins (variación)
  'e- F HD4Bsubt-OpSCr',
  'p- FHD4BVOAFRISCTUR',
  'p- FHD4BVOAFRISCr',
  'e- FHD4Bsubt-OpSCAD',
];

// Crear datos para Excel
const data = [
  ['name', 'category'], // Encabezados
  ...versions.map((v) => [v, '']), // Una fila per versión, categoría vacía
];

// Crear worksheet y workbook
const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();

// Ancho de columnas
ws['!cols'] = [{ wch: 40 }, { wch: 25 }];

// Agregar worksheet
XLSX.utils.book_append_sheet(wb, ws, 'Versiones');

// Escribir archivo
const filename = 'import_versions.xlsx';
XLSX.writeFile(wb, filename);

console.log(`✅ Archivo generado: ${filename}`);
console.log(`📊 Total de versiones: ${versions.length}`);
console.log(`💾 Ubicación: ${process.cwd()}/${filename}`);

/**
 * ExcelParser.js - Parseador de archivos Excel
 * Convierte archivos .xlsx en arrays de objetos JavaScript
 */

import * as XLSX from 'xlsx';

class ExcelParser {
  /**
   * Lee archivo Excel y convierte a array de objetos
   * @param {File} file - Archivo subido por usuario
   * @param {Object} options - Opciones { headerRow: 0, trimValues: true }
   * @returns {Promise<{rows: Array, headers: Array, fileName: string}>}
   */
  static async parseFile(file, options = {}) {
    const { headerRow = 0, trimValues = true, sheetName = 0 } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          // Seleccionar hoja
          const sheet = workbook.Sheets[
            sheetName === 0 ? workbook.SheetNames[0] : sheetName
          ];

          if (!sheet) {
            reject(new Error('No se encontró la hoja especificada'));
            return;
          }

          // Convertir a JSON (con headers en primera fila)
          const rows = XLSX.utils.sheet_to_json(sheet, {
            defval: '',
            header: 1, // Retorna array de arrays
          });

          if (rows.length === 0) {
            reject(new Error('El archivo está vacío'));
            return;
          }

          // Headers (primera fila)
          const headers = rows[headerRow] || [];

          // Datos (desde headerRow+1 en adelante)
          // __row = número de fila en el Excel (encabezado en la fila headerRow + 1), para
          // que la auditoría diga exactamente qué fila del input hay que corregir.
          const dataRows = rows.slice(headerRow + 1).map((row, i) => {
            const obj = { __row: headerRow + 2 + i };
            headers.forEach((header, idx) => {
              const key = trimValues && typeof header === 'string' 
                ? header.trim() 
                : header;
              const value = row[idx];
              const text = trimValues && typeof value === 'string' ? value.trim() : value;
              // La macro que arma el input escribe "NAN" / "nan" en las celdas vacías: se
              // trata como celda vacía (DURATION "NAN" = sin DURATION, EDITOR "nan" = sin EDITOR).
              obj[key] = typeof text === 'string' && /^nan$/i.test(text.trim()) ? '' : text;
            });
            return obj;
          });

          resolve({
            rows: dataRows,
            headers: headers,
            fileName: file.name,
            fileSize: file.size,
            uploadedAt: new Date().toISOString(),
            rowCount: dataRows.length,
            sheetNames: workbook.SheetNames,
          });
        } catch (error) {
          reject(new Error(`Error al procesar Excel: ${error.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('Error al leer el archivo'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Valida que el Excel tenga las columnas requeridas
   * @param {Array} headers - Headers del Excel
   * @param {Array} requiredHeaders - Columnas obligatorias
   * @returns {Object} - { isValid: bool, missingHeaders: Array }
   */
  static validateHeaders(headers, requiredHeaders = []) {
    const normalized = headers.map((h) =>
      typeof h === 'string' ? h.toLowerCase().trim() : String(h)
    );

    const missing = requiredHeaders.filter(
      (req) =>
        !normalized.includes(
          typeof req === 'string' ? req.toLowerCase().trim() : String(req)
        )
    );

    return {
      isValid: missing.length === 0,
      missingHeaders: missing,
      headers: headers,
    };
  }

  /**
   * Obtiene lista de hojas disponibles en workbook
   * @param {File} file
   * @returns {Promise<Array>}
   */
  static getSheetNames(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          resolve(workbook.SheetNames);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
}

export default ExcelParser;

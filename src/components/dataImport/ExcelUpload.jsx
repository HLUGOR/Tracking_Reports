/**
 * ExcelUpload.jsx - Componente para cargar archivos Excel
 */

import React, { useRef, useState } from 'react';
import ExcelParser from '../../core/excel/ExcelParser';
import ExcelValidator from '../../core/excel/ExcelValidator';
import ColumnMapper from './ColumnMapper';
import excelStore from '../../store/excelStore';
import './ExcelUpload.css';
import { downloadTemplateExcel } from '../../core/excel/downloadTemplate';
import useTranslation from '../../i18n/useTranslation';

function ExcelUpload({ onSuccess }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState(''); // 'success' | 'error' | 'warning'
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [parsedData, setParsedData] = useState(null); // Guardar datos parseados mientras se mapea
  const [currentFileName, setCurrentFileName] = useState('');

  // Extraer acciones del store al nivel del componente (no dentro de callbacks)
  const setExcelRows = excelStore((state) => state.setExcelRows);
  const setHeaders = excelStore((state) => state.setHeaders);
  const setValidationResult = excelStore((state) => state.setValidationResult);



  /**
   * Maneja el cambio de archivo
   */
  const handleFileSelect = async (file) => {
    if (!file) return;

    setLoading(true);
    setMessage('');

    try {
      // Parsear Excel
      setMessage(`📂 ${t('Leyendo archivo...')}`);
      const parseResult = await ExcelParser.parseFile(file);

      // Validar datos
      setMessage(`✓ ${t('Validando estructura...')}`);
      const validation = ExcelValidator.validateData(parseResult.rows, {
        minRows: 1,
        maxRows: 1000000,
        requiredColumns: [],
      });

      // Guardar datos y mostrar ColumnMapper
      setCurrentFileName(file.name);
      setParsedData({
        ...parseResult,
        validation,
      });
      setShowColumnMapper(true);
      setMessage(`🗺️ ${t('Configura el mapeo de columnas...')}`);
    } catch (error) {
      console.error('Error al cargar Excel:', error);
      setMsgType('error');
      setMessage(`❌ ${t('Error:')} ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Maneja la confirmación del mapeo de columnas
   */
  const handleMappingComplete = (mapping) => {
    if (!parsedData) return;

    setShowColumnMapper(false);

    // Aplicar el mapeo: renombrar las claves de cada fila al nombre estándar
    // mapping = { editor: 'Columna A', version: 'Columna B', ... }
    // Resultado: row.editor = row['Columna A'], row.version = row['Columna B'], etc.
    const mappedRows = parsedData.rows.map((row) => {
      const newRow = { ...row }; // conservar todas las columnas originales
      Object.entries(mapping).forEach(([standardKey, originalCol]) => {
        if (originalCol && originalCol.trim() !== '') {
          newRow[standardKey] = row[originalCol];
        }
      });
      return newRow;
    });

    // Actualizar estado
    setHeaders(parsedData.headers);
    setExcelRows(mappedRows);
    setValidationResult(parsedData.validation);

    setMsgType('success');
    setMessage(
      `✅ ${parsedData.rowCount} ${t('filas cargadas correctamente. Mapeo guardado.')}`
    );

    // Mostrar mensaje de éxito por 2 segundos
    setTimeout(() => {
      setMessage('');
    }, 2000);

    // Callback de éxito
    if (onSuccess) {
      setTimeout(() => onSuccess(), 500);
    }

    // Limpiar datos
    setParsedData(null);
    setCurrentFileName('');
  };

  /**
   * Cancela el mapeo y vuelve a la carga
   */
  const handleMappingCancel = () => {
    setShowColumnMapper(false);
    setParsedData(null);
    setCurrentFileName('');
    setMessage('');
    fileInputRef.current.value = '';
  };

  /**
   * Manejadores de drag and drop
   */
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  /**
   * Manejador del input file
   */
  const handleInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <div className="excel-upload">
      <div className="upload-container">
        <h2>📥 {t('Cargar Archivo Excel')}</h2>

        {/* Drag and Drop Zone */}
        <div
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleInputChange}
            disabled={loading}
            className="file-input"
          />

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>{t('Procesando archivo...')}</p>
            </div>
          ) : (
            <div className="idle-state">
              <div className="icon">📊</div>
              <h3>{t('Arrastra tu archivo aquí')}</h3>
              <p>{t('o haz clic para seleccionar')}</p>
              <p className="hint">
                {t('Formatos aceptados: .xlsx, .xls, .csv')}
              </p>
            </div>
          )}
        </div>

        {/* Message Display */}
        {message && (
          <div className={`message message-${msgType}`}>
            {message}
          </div>
        )}

        {/* File Info */}
        {fileInputRef.current?.files?.[0] && !loading && (
          <div className="file-info">
            <p>
              📄 {t('Archivo:')} <strong>{fileInputRef.current.files[0].name}</strong>
            </p>
            <p>
              💾 {t('Tamaño:')}{' '}
              <strong>
                {(fileInputRef.current.files[0].size / 1024).toFixed(2)} KB
              </strong>
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="instructions">
          <h3>ℹ️ {t('Instrucciones')}</h3>
          <ol>
            <li>
              {t('Carga tu archivo Excel usando drag & drop o haz clic')}
            </li>
            <li>
              {t('Configura el mapeo de columnas (solo una vez por archivo)')}
            </li>
            <li>
              {t('Una vez cargado, ve a la pestaña "Reportes" para generar análisis')}
            </li>
          </ol>
        </div>

        <button
          className="btn btn-secondary"
          style={{ marginBottom: '1rem' }}
          onClick={downloadTemplateExcel}
        >
          📥 {t('Descargar Template Excel')}
        </button>
      </div>

      {/* ColumnMapper Modal */}
      {showColumnMapper && parsedData && (
        <ColumnMapper
          fileName={currentFileName}
          headers={parsedData.headers}
          onMappingComplete={handleMappingComplete}
          onCancel={handleMappingCancel}
        />
      )}
    </div>
  );
}

export default ExcelUpload;

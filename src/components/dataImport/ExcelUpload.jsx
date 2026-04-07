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

function ExcelUpload({ onSuccess }) {
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
      setMessage('📂 Leyendo archivo...');
      const parseResult = await ExcelParser.parseFile(file);

      // Validar datos
      setMessage('✓ Validando estructura...');
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
      setMessage('🗺️ Configura el mapeo de columnas...');
    } catch (error) {
      console.error('Error al cargar Excel:', error);
      setMsgType('error');
      setMessage(`❌ Error: ${error.message}`);
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

    // Actualizar estado
    setHeaders(parsedData.headers);
    setExcelRows(parsedData.rows);
    setValidationResult(parsedData.validation);

    setMsgType('success');
    setMessage(
      `✅ ${parsedData.rowCount} filas cargadas correctamente. Mapeo guardado.`
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
        <h2>📥 Cargar Archivo Excel</h2>

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
              <p>Procesando archivo...</p>
            </div>
          ) : (
            <div className="idle-state">
              <div className="icon">📊</div>
              <h3>Arrastra tu archivo aquí</h3>
              <p>o haz clic para seleccionar</p>
              <p className="hint">
                Formatos aceptados: .xlsx, .xls, .csv
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
              📄 Archivo: <strong>{fileInputRef.current.files[0].name}</strong>
            </p>
            <p>
              💾 Tamaño:{' '}
              <strong>
                {(fileInputRef.current.files[0].size / 1024).toFixed(2)} KB
              </strong>
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="instructions">
          <h3>ℹ️ Instrucciones</h3>
          <ol>
            <li>
              Carga tu archivo Excel usando drag & drop o haz clic
            </li>
            <li>
              Configura el mapeo de columnas (solo una vez por archivo)
            </li>
            <li>
              Una vez cargado, ve a la pestaña "Reportes" para generar anál isis
            </li>
          </ol>
        </div>

        <button
          className="btn btn-secondary"
          style={{ marginBottom: '1rem' }}
          onClick={downloadTemplateExcel}
        >
          📥 Descargar Template Excel
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

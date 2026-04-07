/**
 * ColumnMapper.jsx - Interfaz para mapear columnas de Excel
 * Permite al usuario mapear columnas del Excel a campos esperados
 */

import React, { useState } from 'react';
import '../../styles/ColumnMapper.css';
import libraryStore from '../../store/libraryStore';
import excelStore from '../../store/excelStore';

function ColumnMapper({ fileName, headers, onMappingComplete, onCancel }) {
  const [mapping, setMapping] = useState(
    libraryStore((state) => state.getColumnMapping(fileName)) || {}
  );
  const [errors, setErrors] = useState([]);

  const requiredFields = [
    { key: 'editor', label: '👤 EDITOR', description: 'Nombre del editor responsable' },
    { key: 'version', label: '📦 VERSION', description: 'Versión del contenido' },
    { key: 'platform', label: '🌐 PLATFORM', description: 'Plataforma de distribución' },
    { key: 'season', label: '🎬 SEASON', description: 'Temporada (para plataformas sin versión)' },
    { key: 'approved_date', label: '✅ APPROVED_DATE', description: 'Fecha de aprobación' },
  ];

  const optionalFields = [
    { key: 'air_date', label: '📅 AIR_DATE', description: 'Fecha de emisión/aire (opcional)' },
  ];

  // Validar mapeo
  const validateMapping = (currentMapping) => {
    const newErrors = [];
    const requiredKeys = requiredFields.map((f) => f.key);

    requiredKeys.forEach((key) => {
      if (!currentMapping[key] || currentMapping[key].trim() === '') {
        newErrors.push(`Campo requerido: ${requiredFields.find((f) => f.key === key).label}`);
      }
    });

    return newErrors;
  };

  const handleMapColumn = (fieldKey, columnName) => {
    const newMapping = { ...mapping, [fieldKey]: columnName };
    setMapping(newMapping);

    // Validar en tiempo real
    const newErrors = validateMapping(newMapping);
    setErrors(newErrors);
  };

  const handleSaveMapping = () => {
    const validationErrors = validateMapping(mapping);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Guardar en librería
    libraryStore.getState().saveColumnMapping(fileName, mapping);

    // Actualizar Excel store con mapeo
    excelStore.getState().setColumnMapping(mapping);

    onMappingComplete(mapping);
  };



  return (
    <div className="column-mapper-overlay">
      <div className="column-mapper-modal">
        <div className="mapper-header">
          <h2>🗺️ Mapeo de Columnas</h2>
          <p className="mapper-subtitle">
            Asigna las columnas de tu Excel a los campos esperados (solo una vez)
          </p>
          <p className="mapper-filename">Archivo: <strong>{fileName}</strong></p>
        </div>

        <div className="mapper-content">
          <div className="mapper-section">
            <h3>📌 Campos Obligatorios</h3>
            <div className="mapper-grid">
              {requiredFields.map((field) => (
                <div key={field.key} className="mapper-field">
                  <label htmlFor={`select-${field.key}`}>{field.label}</label>
                  <p className="field-description">{field.description}</p>
                  <select
                    id={`select-${field.key}`}
                    value={mapping[field.key] || ''}
                    onChange={(e) => handleMapColumn(field.key, e.target.value)}
                    className={`mapper-select ${!mapping[field.key] ? 'empty' : ''}`}
                  >
                    <option value="">-- Selecciona una columna --</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="mapper-section">
            <h3>✨ Campos Opcionales</h3>
            <div className="mapper-grid">
              {optionalFields.map((field) => (
                <div key={field.key} className="mapper-field">
                  <label htmlFor={`select-${field.key}`}>{field.label}</label>
                  <p className="field-description">{field.description}</p>
                  <select
                    id={`select-${field.key}`}
                    value={mapping[field.key] || ''}
                    onChange={(e) => handleMapColumn(field.key, e.target.value)}
                    className="mapper-select"
                  >
                    <option value="">-- Sin mapeo --</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview de datos */}
          <div className="mapper-section">
            <h3>👁️ Vista Previa de Mapeo</h3>
            <div className="mapper-preview">
              <table className="preview-table">
                <thead>
                  <tr>
                    {requiredFields.map((f) => (
                      <th key={f.key}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {requiredFields.map((f) => (
                      <td key={f.key}>
                        {mapping[f.key] ? (
                          <span className="mapped">{mapping[f.key]}</span>
                        ) : (
                          <span className="unmapped">Sin mapear</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Errores */}
          {errors.length > 0 && (
            <div className="mapper-errors">
              <h4>⚠️ Errores de validación:</h4>
              <ul>
                {errors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mapper-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            ❌ Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveMapping}
            disabled={errors.length > 0}
          >
            ✅ Confirmar Mapeo
          </button>
        </div>
      </div>
    </div>
  );
}

export default ColumnMapper;

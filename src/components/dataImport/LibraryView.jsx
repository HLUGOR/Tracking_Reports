/**
 * LibraryView.jsx - Gestión de Librería de Datos
 * Permite crear/editar plataformas, categorías, versiones, duraciones
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import '../../styles/LibraryView.css';
import libraryStore from '../../store/libraryStore';
import VersionMatcher from '../../core/reportEngine/VersionMatcher';

/**
 * Auto-detecta la duración en minutos leyendo el sufijo numérico del nombre de versión.
 * Replica la lógica de fallback de logicas.json (logica_de_versiones):
 *   1-4   → 30 min  (series cortas)
 *   5-6   → 60 min  (series largas)
 *   9-10  → 120 min (películas)
 *   otros → 30 min  (default)
 */
function detectDurationFromName(name) {
  if (!name) return 30;
  const match = String(name).match(/\s(\d+)(?:\s+\S+)?$/);
  if (!match) return 30;
  const n = parseInt(match[1], 10);
  if (n >= 1 && n <= 4) return 30;
  if (n >= 5 && n <= 6) return 60;
  if (n >= 9 && n <= 10) return 120;
  return 30;
}

/**
 * Detecta sub-plataforma LAT/BRA desde el nombre de versión.
 * Replica detectPlatformFromVersion() de server.cjs.
 * Ej: LAT_ORI_SQZ_HD 3 → 'LATAM'  |  BRA_SAP_CC_SQZ_HD 5 → 'BRAZIL'
 */
function detectSubPlatformFromName(name) {
  if (!name) return null;
  const upper = String(name).trim().toUpperCase();
  if (/\bLAT(AM)?\b|_LAT_|_LAT\b|\bLAT_/.test(upper)) return 'LATAM';
  if (/\bBRA(SIL)?\b|_BRA_|_BRA\b|\bBRA_/.test(upper)) return 'BRAZIL';
  return null;
}

function LibraryView() {
  const [activeTab, setActiveTab] = useState('platforms'); // platforms, categories, versions
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});

  // Modal de reasignación de versiones al crear plataforma nueva con logica_de_versiones
  const [reassignModal, setReassignModal] = useState(null);
  // { newPlatformId, newPlatformName, candidates: [{id, name, currentPlatformName}], selected: Set }

  // Import masivo de versiones desde Excel
  const [importResult, setImportResult] = useState(null);

  const platforms = libraryStore((state) => state.platforms);
  const categories = libraryStore((state) => state.categories);
  const versions = libraryStore((state) => state.versions);
  const columnMappings = libraryStore((state) => state.columnMappings);

  // ===== PLATAFORMAS =====
  const handleAddPlatform = () => {
    setEditingId(null);
    setFormData({});
    setShowForm(true);
  };

  const handleSavePlatform = () => {
    if (!formData.name || !formData.logica) return;

    if (editingId) {
      libraryStore.getState().updatePlatform(editingId, formData);
      setShowForm(false);
      setFormData({});
      setEditingId(null);
      return;
    }

    // Crear la plataforma nueva y obtener su id
    libraryStore.getState().addPlatform(formData);
    const newPlatform = libraryStore.getState().platforms.find(
      (p) => p.name === formData.name && p.logica === formData.logica
    );

    setShowForm(false);
    setFormData({});
    setEditingId(null);

    // Si es logica_de_versiones, ofrecer reasignar versiones existentes de otras plataformas
    if (formData.logica === 'logica_de_versiones' && newPlatform) {
      const allVersions = libraryStore.getState().versions;
      // Candidatas: versiones sin plataforma + versiones en otras plataformas con logica_de_versiones
      const logicaVersionsPlatformIds = new Set(
        libraryStore.getState().platforms
          .filter((p) => p.id !== newPlatform.id && p.logica === 'logica_de_versiones')
          .map((p) => p.id)
      );
      const candidates = allVersions
        .filter((v) => !v.platformId || logicaVersionsPlatformIds.has(v.platformId))
        .map((v) => {
          const plt = libraryStore.getState().platforms.find((p) => p.id === v.platformId);
          return { id: v.id, name: v.name, currentPlatformName: plt?.name || '(sin plataforma)' };
        });

      if (candidates.length > 0) {
        setReassignModal({
          newPlatformId: newPlatform.id,
          newPlatformName: newPlatform.name,
          candidates,
          selected: new Set(candidates.map((c) => c.id)), // pre-seleccionar todas
        });
      }
    }
  };

  const handleDeletePlatform = (id) => {
    if (window.confirm('¿Eliminar esta plataforma y sus datos asociados?')) {
      libraryStore.getState().deletePlatform(id);
    }
  };

  // ===== CATEGORÍAS =====
  const handleAddCategory = () => {
    setEditingId(null);
    setFormData({ platformId: platforms[0]?.id || null });
    setShowForm(true);
  };

  const handleSaveCategory = () => {
    if (!formData.name || !formData.platformId) return;

    if (editingId) {
      libraryStore.getState().updateCategory(editingId, formData);
    } else {
      libraryStore.getState().addCategory(formData);
    }

    setShowForm(false);
    setFormData({});
    setEditingId(null);
  };

  const handleDeleteCategory = (id) => {
    if (window.confirm('¿Eliminar esta categoría y sus versiones asociadas?')) {
      libraryStore.getState().deleteCategory(id);
    }
  };

  // Auto-asignar versiones a categorías por duración detectada del nombre (fuente de verdad)
  const handleAutoAssignVersions = () => {
    const state = libraryStore.getState();
    if (state.categories.length === 0) { alert('Crea categorías primero.'); return; }

    // 1. Reparar IDs duplicados primero
    state.repairVersionIds();

    // 2. Leer el estado fresco con IDs ya reparados
    const freshState = libraryStore.getState();
    const allCategories = [...freshState.categories];

    let assigned = 0;
    let skipped = 0;
    const durations = {};

    // 3. Construir nuevo array con categoryId y duration correctos para cada versión
    const updatedVersions = freshState.versions.map((v) => {
      const trueDuration = VersionMatcher.detectDurationFromSuffix(v.name);
      durations[trueDuration] = (durations[trueDuration] || 0) + 1;

      const match =
        allCategories.find((c) => Number(c.duration) === trueDuration && c.platformId === v.platformId) ||
        allCategories.find((c) => Number(c.duration) === trueDuration);

      if (match) {
        assigned++;
        return { ...v, categoryId: match.id, duration: trueDuration };
      }
      skipped++;
      return v;
    });

    // 4. Guardar todo de una sola vez (sin colisiones de updateVersion)
    freshState.setVersions(updatedVersions);

    alert(`✅ ${assigned} versiones asignadas/corregidas.\n⏭ ${skipped} sin categoría coincidente.\n\nDistribución:\n${Object.entries(durations).map(([d,n])=>`${d}min: ${n}`).join('\n')}`);
  };

  // ===== VERSIONES =====
  const handleAddVersion = () => {
    setEditingId(null);
    setFormData({
      platformId: platforms[0]?.id || null,
      categoryId: categories[0]?.id || null,
    });
    setShowForm(true);
  };

  const handleSaveVersion = () => {
    if (!formData.name || !formData.platformId || !formData.categoryId) return;

    if (editingId) {
      libraryStore.getState().updateVersion(editingId, formData);
    } else {
      libraryStore.getState().addVersion(formData);
    }

    setShowForm(false);
    setFormData({});
    setEditingId(null);
  };

  // ===== IMPORT MASIVO DE VERSIONES =====
  const handleImportVersions = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Leer siempre como arrays (sin encabezado) para soportar Excel sin cabecera
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Determinar si la primera fila es encabezado o dato
        const knownNameKeys = ['name', 'Name', 'NAME', 'VERSION', 'version', 'Nombre', 'nombre', 'NOMBRE'];
        const firstCell = String(rawRows[0]?.[0] || '').trim();
        const hasHeader = knownNameKeys.includes(firstCell);
        const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

        const state = libraryStore.getState();
        const existingNames = new Set(
          state.versions.map((v) => (v.name || '').trim().toLowerCase())
        );

        let created = 0;
        let skipped = 0;
        const errors = [];

        dataRows.forEach((row, idx) => {
          const name = String(row[0] || '').trim();
          if (!name) { skipped++; return; }
          if (existingNames.has(name.toLowerCase())) { skipped++; return; }

          // Duración por sufijo (igual que VersionMatcher.detectDurationFromSuffix)
          const duration = detectDurationFromName(name);

          // Categoría opcional (columna B, índice 1)
          const catName = String(row[1] || '').trim();
          let categoryId = null;
          if (catName) {
            const found = state.categories.find(
              (c) => (c.name || '').trim().toLowerCase() === catName.toLowerCase()
            );
            categoryId = found?.id || null;
          }

          // Plataforma opcional (columna C, índice 2)
          const platName = String(row[2] || '').trim();
          let platformId = null;
          if (platName) {
            const foundPlt = state.platforms.find(
              (p) => (p.name || '').trim().toLowerCase() === platName.toLowerCase()
            );
            platformId = foundPlt?.id || null;
          }

          try {
            state.addVersion({ name, duration, categoryId, platformId });
            existingNames.add(name.toLowerCase());
            created++;
          } catch (err) {
            errors.push(`Fila ${idx + 2}: ${name} — ${err.message}`);
          }
        });

        setImportResult({ total: dataRows.length, created, skipped, errors });
      } catch (err) {
        setImportResult({ total: 0, created: 0, skipped: 0, errors: [`Error leyendo archivo: ${err.message}`] });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDeleteVersion = (id) => {
    if (window.confirm('¿Eliminar esta versión?')) {
      libraryStore.getState().deleteVersion(id);
    }
  };

  const getPlatformName = (id) => platforms.find((p) => p.id === id)?.name || 'N/A';
  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name || 'N/A';

  return (
    <div className="library-view">
      <div className="library-header">
        <h2>📚 Librería de Datos</h2>
        <p>Gesiona plataformas, categorías, versiones y duraciones</p>
      </div>

      <div className="library-tabs">
        <button
          className={`tab-btn ${activeTab === 'platforms' ? 'active' : ''}`}
          onClick={() => setActiveTab('platforms')}
        >
          🌐 Plataformas ({platforms.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          📂 Categorías ({categories.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'versions' ? 'active' : ''}`}
          onClick={() => setActiveTab('versions')}
        >
          📦 Versiones ({versions.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'mappings' ? 'active' : ''}`}
          onClick={() => setActiveTab('mappings')}
        >
          🗺️ Mapeos de Columnas ({columnMappings.length})
        </button>
      </div>

      <div className="library-content">
        {/* PLATAFORMAS */}
        {activeTab === 'platforms' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h3>Plataformas</h3>
              <button className="btn btn-primary" onClick={handleAddPlatform}>
                ➕ Nueva Plataforma
              </button>
            </div>

            {platforms.length === 0 ? (
              <div className="empty-state">
                <p>Sin plataformas aún. Crea una para empezar.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="library-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Lógica</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platforms.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          <code>{p.logica}</code>
                        </td>
                        <td>
                          <span className={`status ${p.active ? 'active' : 'inactive'}`}>
                            {p.active ? '✓ Activa' : '✗ Inactiva'}
                          </span>
                        </td>
                        <td className="actions">
                          <button
                            className="btn-icon btn-edit"
                            onClick={() => {
                              setEditingId(p.id);
                              setFormData(p);
                              setShowForm(true);
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => handleDeletePlatform(p.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CATEGORÍAS */}
        {activeTab === 'categories' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h3>Categorías</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={handleAutoAssignVersions}>
                  🔗 Auto-asignar versiones
                </button>
                <button className="btn btn-primary" onClick={handleAddCategory}>
                  ➕ Nueva Categoría
                </button>
              </div>
            </div>

            {categories.length === 0 ? (
              <div className="empty-state">
                <p>Sin categorías aún. Crea una plataforma primero.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="library-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Plataforma</th>
                      <th>Duración</th>
                      <th>Versiones</th>
                      <th>Color</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => {
                      const catVersions = versions.filter((v) => v.categoryId === c.id);
                      const durGroups = {};
                      catVersions.forEach((v) => {
                        const d = v.duration || '?';
                        durGroups[d] = (durGroups[d] || 0) + 1;
                      });
                      const durSummary = Object.entries(durGroups)
                        .map(([d, n]) => `${n}×${d}min`)
                        .join(', ');
                      return (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{getPlatformName(c.platformId)}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {c.duration
                            ? <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px', fontWeight: 600 }}>{c.duration} min</span>
                            : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {catVersions.length === 0
                            ? <span style={{ color: '#94a3b8' }}>Sin versiones</span>
                            : <><strong>{catVersions.length}</strong> versión{catVersions.length !== 1 ? 'es' : ''}{durSummary ? ` — ${durSummary}` : ''}</>}
                        </td>
                        <td>
                          <div
                            className="color-preview"
                            style={{ backgroundColor: c.color || '#ccc' }}
                          />
                        </td>
                        <td className="actions">
                          <button
                            className="btn-icon btn-edit"
                            onClick={() => {
                              setEditingId(c.id);
                              setFormData(c);
                              setShowForm(true);
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => handleDeleteCategory(c.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* VERSIONES */}
        {activeTab === 'versions' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h3>Versiones</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                  📥 Importar Excel
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportVersions} />
                </label>
                <button className="btn btn-primary" onClick={handleAddVersion}>➕ Nueva Versión</button>
              </div>
            </div>

            {importResult && (
              <div style={{
                background: importResult.errors.length > 0 ? '#fff7ed' : '#f0fdf4',
                border: `1px solid ${importResult.errors.length > 0 ? '#fed7aa' : '#bbf7d0'}`,
                borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.85rem',
                color: importResult.errors.length > 0 ? '#92400e' : '#15803d',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    ✅ <strong>{importResult.created}</strong> versiones creadas &nbsp;·&nbsp;
                    ⏭ <strong>{importResult.skipped}</strong> omitidas (ya existían)
                    {importResult.errors.length > 0 && <> &nbsp;·&nbsp; ❌ <strong>{importResult.errors.length}</strong> errores</>}
                  </span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }} onClick={() => setImportResult(null)}>✕</button>
                </div>
                {importResult.errors.length > 0 && (
                  <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, fontSize: '0.8rem' }}>
                    {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}

            {/* Aviso si hay plataformas logica_sin_version */}
            {platforms.some((p) => p.logica === 'logica_sin_version') && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px',
                padding: '0.6rem 1rem', marginBottom: '0.75rem', fontSize: '0.82rem', color: '#92400e'
              }}>
                ⚠️ Las plataformas con lógica <strong>logica_sin_version</strong> (
                {platforms.filter((p) => p.logica === 'logica_sin_version').map((p) => p.name).join(', ')}
                ) no usan versiones — clasifican por columna SEASON. Las versiones aquí solo aplican a plataformas con <strong>logica_de_versiones</strong> o <strong>iberia_especial</strong>.
              </div>
            )}

            {versions.length === 0 ? (
              <div className="empty-state">
                <p>Sin versiones aún. Crea categorías primero.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="library-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Plataforma</th>
                      <th>Categoría</th>
                      <th>Duración</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v, idx) => (
                      <tr key={`${v.id}-${idx}`}>
                        <td>{v.name}</td>
                        <td>{getPlatformName(v.platformId)}</td>
                        <td>
                          {v.duration
                            ? `${getCategoryName(v.categoryId)} (${v.duration}min)`
                            : getCategoryName(v.categoryId)}
                        </td>
                        <td>{v.duration ? `${v.duration} min` : 'N/A'}</td>
                        <td className="actions">
                          <button
                            className="btn-icon btn-edit"
                            onClick={() => {
                              setEditingId(v.id);
                              setFormData(v);
                              setShowForm(true);
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => handleDeleteVersion(v.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MAPEOS DE COLUMNAS */}
        {activeTab === 'mappings' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h3>Mapeos de Columnas</h3>
            </div>

            {columnMappings.length === 0 ? (
              <div className="empty-state">
                <p>Sin mapeos guardados aún. Carga un Excel para crear un mapeo.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="library-table">
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Mapeo</th>
                      <th>Actualizado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnMappings.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <code>{m.fileName}</code>
                        </td>
                        <td>
                          <small>
                            {Object.entries(m.mapping)
                              .map(([k, v]) => `${k}→${v}`)
                              .join(', ')}
                          </small>
                        </td>
                        <td>
                          {m.updatedAt
                            ? new Date(m.updatedAt).toLocaleDateString()
                            : new Date(m.createdAt).toLocaleDateString()}
                        </td>
                        <td className="actions">
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => {
                              libraryStore
                                .getState()
                                .deleteColumnMapping(m.fileName);
                            }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FORM MODAL */}
      {showForm && (
        <div className="form-modal-overlay">
          <div className="form-modal">
            <h3>
              {editingId
                ? `Editar ${activeTab.slice(0, -1)}`
                : `Crear nuevo ${activeTab.slice(0, -1)}`}
            </h3>

            {activeTab === 'platforms' && (
              <>
                <input
                  type="text"
                  placeholder="Nombre de la plataforma (ej: LATAM, AMAZON)"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                />
                <select
                  value={formData.logica || ''}
                  onChange={(e) => setFormData({ ...formData, logica: e.target.value })}
                >
                  <option value="">— Selecciona tipo de lógica —</option>
                  <option value="logica_de_versiones">logica_de_versiones — clasifica por VERSION (librería)</option>
                  <option value="logica_sin_version">logica_sin_version — clasifica por SEASON (sin librería)</option>
                  <option value="iberia_especial">iberia_especial — como versiones, sin fallback</option>
                </select>

                {/* Campos extra solo para logica_sin_version */}
                {formData.logica === 'logica_sin_version' && (
                  <>
                    <small style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0' }}>
                      ℹ️ Esta lógica clasifica por columna SEASON. Define las duraciones y keys de categoría:
                    </small>
                    <input
                      type="number"
                      placeholder="Duración SERIE (minutos, ej: 45)"
                      value={formData.duracion_serie_minutos || ''}
                      onChange={(e) => setFormData({ ...formData, duracion_serie_minutos: parseInt(e.target.value) })}
                    />
                    <input
                      type="number"
                      placeholder="Duración PELÍCULA (minutos, ej: 120)"
                      value={formData.duracion_pelicula_minutos || ''}
                      onChange={(e) => setFormData({ ...formData, duracion_pelicula_minutos: parseInt(e.target.value) })}
                    />
                    <input
                      type="text"
                      placeholder="Key categoría SERIE (ej: serie_45min)"
                      value={(formData.categorias && formData.categorias[0]) || ''}
                      onChange={(e) => {
                        const cats = [...(formData.categorias || ['', ''])];
                        cats[0] = e.target.value;
                        setFormData({ ...formData, categorias: cats });
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Key categoría PELÍCULA (ej: pelicula_120min)"
                      value={(formData.categorias && formData.categorias[1]) || ''}
                      onChange={(e) => {
                        const cats = [...(formData.categorias || ['', ''])];
                        cats[1] = e.target.value;
                        setFormData({ ...formData, categorias: cats });
                      }}
                    />
                  </>
                )}
              </>
            )}

            {activeTab === 'categories' && (
              <>
                <input
                  type="text"
                  placeholder="Nombre de la categoría (ej: Serie, Película)"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <select
                  value={formData.platformId || ''}
                  onChange={(e) => setFormData({ ...formData, platformId: parseInt(e.target.value) })}
                >
                  <option value="">Selecciona una plataforma</option>
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {/* Duración de la categoría */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                    ⏱ Duración de esta categoría (en minutos)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Ej: 30, 60, 120..."
                    value={formData.duration || ''}
                    onChange={e => setFormData({ ...formData, duration: e.target.value ? parseInt(e.target.value) : null })}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '120px' }}
                  />
                  <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                    Solo para agrupar visualmente. No afecta los cálculos de minutos reales.
                  </small>
                </div>
                <input
                  type="color"
                  placeholder="Color"
                  value={formData.color || '#667eea'}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </>
            )}

            {activeTab === 'versions' && (
              <>
                <input
                  type="text"
                  placeholder="Nombre de la versión (ej: BRA_SAP_CC_SQZ_HD 5)"
                  value={formData.name || ''}
                  onChange={(e) => {
                    const nombre = e.target.value;
                    const detected = detectDurationFromName(nombre);
                    setFormData({ ...formData, name: nombre, duration: detected });
                  }}
                />
                {/* Badge de duración + sub-plataforma detectadas en tiempo real */}
                {formData.name && (() => {
                  const subPlatform = detectSubPlatformFromName(formData.name);
                  return (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {/* Badge duración */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        background: formData.duration ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${formData.duration ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: '6px', padding: '0.45rem 0.75rem',
                        fontSize: '0.85rem', color: formData.duration ? '#1d4ed8' : '#94a3b8',
                      }}>
                        <span style={{ fontSize: '1rem' }}>⏱</span>
                        <span>
                          {formData.duration
                            ? <><strong>{formData.duration} min</strong> — detectado del sufijo &quot;{formData.name.match(/(\d+)(?:\s+\S+)?$/)?.[1] || '?'}&quot;</>
                            : 'Escribe el nombre para detectar la duración'}
                        </span>
                      </div>
                      {/* Badge sub-plataforma LAT/BRA */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        background: subPlatform === 'LATAM' ? '#f0fdf4' : subPlatform === 'BRAZIL' ? '#fefce8' : '#f8fafc',
                        border: `1px solid ${subPlatform === 'LATAM' ? '#bbf7d0' : subPlatform === 'BRAZIL' ? '#fde68a' : '#e2e8f0'}`,
                        borderRadius: '6px', padding: '0.45rem 0.75rem',
                        fontSize: '0.85rem',
                        color: subPlatform === 'LATAM' ? '#15803d' : subPlatform === 'BRAZIL' ? '#92400e' : '#94a3b8',
                      }}>
                        <span style={{ fontSize: '1rem' }}>
                          {subPlatform === 'LATAM' ? '🌎' : subPlatform === 'BRAZIL' ? '🇧🇷' : '🌐'}
                        </span>
                        <span>
                          {subPlatform
                            ? <><strong>{subPlatform}</strong> — detectado del prefijo</>
                            : 'Sin prefijo LAT / BRA'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <select
                  value={formData.platformId || ''}
                  onChange={(e) => setFormData({ ...formData, platformId: parseInt(e.target.value) })}
                >
                  <option value="">Selecciona una plataforma</option>
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={formData.categoryId || ''}
                  onChange={(e) => setFormData({ ...formData, categoryId: parseInt(e.target.value) })}
                >
                  <option value="">Selecciona una categoría</option>
                  {categories
                    .filter((c) => !formData.platformId || c.platformId === formData.platformId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{formData.duration ? ` (${formData.duration}min)` : ''}
                      </option>
                    ))}
                </select>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <small style={{ color: '#64748b', fontSize: '0.8rem' }}>
                    ⏱ Duración propia de esta versión (minutos). Se auto-detecta del sufijo numérico del nombre.
                  </small>
                  <input
                    type="number"
                    placeholder="Duración (min) — ej: 30, 60, 120"
                    value={formData.duration || ''}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || '' })}
                  />
                </div>
              </>
            )}

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={
                  activeTab === 'platforms'
                    ? handleSavePlatform
                    : activeTab === 'categories'
                    ? handleSaveCategory
                    : handleSaveVersion
                }
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de reasignación de versiones ───────────────────────── */}
      {reassignModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: '10px', padding: '1.5rem 2rem',
            minWidth: '420px', maxWidth: '560px', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', gap: '1rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>
              🔗 Asociar versiones a <strong>{reassignModal.newPlatformName}</strong>
            </h3>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#475569' }}>
              Se encontraron <strong>{reassignModal.candidates.length}</strong> versiones sin plataforma o en otras plataformas.
              Todas están seleccionadas — haz clic en <strong>Mover versiones</strong> para asociarlas a <strong>{reassignModal.newPlatformName}</strong>, o desmarca las que no quieras mover.
            </p>

            {/* Seleccionar todos */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={reassignModal.selected.size === reassignModal.candidates.length}
                onChange={(e) => {
                  setReassignModal((prev) => ({
                    ...prev,
                    selected: e.target.checked
                      ? new Set(prev.candidates.map((c) => c.id))
                      : new Set(),
                  }));
                }}
              />
              Seleccionar todas ({reassignModal.candidates.length})
            </label>

            {/* Lista de versiones candidatas */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {reassignModal.candidates.map((v) => (
                <label key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '0.4rem 0.6rem', borderRadius: '6px',
                  background: reassignModal.selected.has(v.id) ? '#eff6ff' : '#f8fafc',
                  border: `1px solid ${reassignModal.selected.has(v.id) ? '#bfdbfe' : '#e2e8f0'}`,
                  cursor: 'pointer', fontSize: '0.87rem',
                }}>
                  <input
                    type="checkbox"
                    checked={reassignModal.selected.has(v.id)}
                    onChange={(e) => {
                      setReassignModal((prev) => {
                        const next = new Set(prev.selected);
                        e.target.checked ? next.add(v.id) : next.delete(v.id);
                        return { ...prev, selected: next };
                      });
                    }}
                  />
                  <span style={{ flex: 1, fontWeight: 500 }}>{v.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>de: {v.currentPlatformName}</span>
                </label>
              ))}
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setReassignModal(null)}
              >
                No mover ninguna
              </button>
              <button
                className="btn btn-primary"
                disabled={reassignModal.selected.size === 0}
                onClick={() => {
                  reassignModal.selected.forEach((vId) => {
                    libraryStore.getState().updateVersion(vId, { platformId: reassignModal.newPlatformId });
                  });
                  setReassignModal(null);
                }}
              >
                Mover {reassignModal.selected.size > 0 ? `(${reassignModal.selected.size})` : ''} versiones
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LibraryView;

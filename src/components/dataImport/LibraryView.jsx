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

  // Feedback post-creación de plataforma
  const [savedPlatformInfo, setSavedPlatformInfo] = useState(null);
  // { name, logica }

  // Import masivo de versiones desde Excel
  const [importResult, setImportResult] = useState(null);

  // Mini-formulario inline para crear categoría desde el modal de versión
  const [inlineNewCat, setInlineNewCat] = useState({ active: false, name: '', duration: 30 });

  // Filtro de plataforma activo en el tab Categorías
  const [filterCatPlatformId, setFilterCatPlatformId] = useState(null);

  // Sub-tab dentro de Categorías: 'versiones' (logica_de_versiones/iberia) | 'propias' (sin_version/comerciales/etc.)
  const [catSubTab, setCatSubTab] = useState('versiones');

  // Búsqueda en el tab Versiones
  const [versionSearch, setVersionSearch] = useState('');

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

    // Normalizar categorias: siempre guardar como objetos {key, duration, effortRate}
    const normalizedData = {
      ...formData,
      categorias: (formData.categorias || []).map(cat =>
        typeof cat === 'string' ? { key: cat, duration: '', effortRate: null } : cat
      ),
    };

    if (editingId) {
      libraryStore.getState().updatePlatform(editingId, normalizedData);
      setShowForm(false);
      setFormData({});
      setEditingId(null);
      return;
    }

    // Crear la plataforma nueva y obtener su id
    libraryStore.getState().addPlatform(normalizedData);
    const newPlatform = libraryStore.getState().platforms.find(
      (p) => p.name === formData.name && p.logica === formData.logica
    );

    setShowForm(false);
    setFormData({});
    setEditingId(null);

    // Mostrar feedback contextual post-creación
    setSavedPlatformInfo({ name: formData.name, logica: formData.logica });

    // Si es logica_de_versiones: la librería de versiones es GLOBAL (classify() busca por nombre,
    // no filtra por platformId). Las versiones existentes ya funcionan para esta nueva plataforma
    // automáticamente sin necesidad de reasignar. No se muestra modal.
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

    const isNew = !editingId;

    if (editingId) {
      libraryStore.getState().updateCategory(editingId, formData);
    } else {
      libraryStore.getState().addCategory(formData);
    }

    // Auto-asignar versiones si es categoría nueva
    if (isNew && formData.duration) {
      const state = libraryStore.getState();
      
      // Obtener la categoría recién creada
      const newCategory = state.categories.find(
        (c) => c.name === formData.name && c.platformId === formData.platformId
      );
      
      if (newCategory) {
        // Asignar versiones que coincidan por duración y plataforma
        const updatedVersions = state.versions.map((v) => {
          if (v.categoryId) return v; // Ya tiene categoría
          
          // Buscar coincidencia por duración + platformId
          if (Number(v.duration) === Number(newCategory.duration) && v.platformId === newCategory.platformId) {
            return { ...v, categoryId: newCategory.id, duration: newCategory.duration };
          }
          return v;
        });
        
        // Actualizar si hubo cambios
        const hasChanges = updatedVersions.some((v, i) => v.categoryId !== state.versions[i].categoryId);
        if (hasChanges) {
          state.setVersions(updatedVersions);
        }
      }
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

  // ── PARCHE DE DATOS IBERIA ────────────────────────────────────────────────
  // NOTA DE MANTENIMIENTO: Esta función corrige versiones/categorías de IBERIA que
  // quedaron con duration:30 por una importación incorrecta (abril 2026).
  // La lógica de reporte ya NO depende del store para IBERIA (usa VersionMatcher.IBERIA_DURATION_MAP).
  // Si en el futuro las versiones de IBERIA vuelven a mostrarse con datos incorrectos
  // en la tab Versiones (N/A, 30min), ejecutar esta función desde la consola:
  //   window.__repairIberia && window.__repairIberia()
  // o reactivar el botón temporalmente (ver LibraryView línea ~185).
  const handleRepairIberia = () => {
    const state = libraryStore.getState();
    const iberiaPlatform = state.platforms.find(p => (p.name || '').toUpperCase() === 'IBERIA');
    if (!iberiaPlatform) { alert('Plataforma IBERIA no encontrada.'); return; }

    // Paso 1: Corregir duración de las categorías de IBERIA por nombre
    // "serie 60" → 60 min, "pelicula 120" → 120 min
    const CAT_DURATION_BY_NAME = {
      'serie 60': 60,
      'pelicula 120': 120,
    };
    const iberiaCategories = state.categories.filter(c => c.platformId === iberiaPlatform.id);
    iberiaCategories.forEach((cat) => {
      const correctDur = CAT_DURATION_BY_NAME[(cat.name || '').toLowerCase().trim()];
      if (correctDur && Number(cat.duration) !== correctDur) {
        libraryStore.getState().updateCategory(cat.id, { duration: correctDur });
      }
    });

    // Paso 2: Leer categorías ya corregidas
    const freshState = libraryStore.getState();
    const freshIberiaCats = freshState.categories.filter(c => c.platformId === iberiaPlatform.id);

    let fixed = 0;
    const updatedVersions = freshState.versions.map((v) => {
      const trimmed = (v.name || '').trim();
      // Búsqueda case-insensitive contra el mapa centralizado en VersionMatcher
      const entry = Object.entries(VersionMatcher.IBERIA_DURATION_MAP).find(
        ([name]) => name.toLowerCase() === trimmed.toLowerCase()
      );
      if (!entry) return v;
      const correctDuration = entry[1];

      const correctCat = freshIberiaCats.find(c => Number(c.duration) === correctDuration);
      if (!correctCat) return v;

      fixed++;
      return { ...v, duration: correctDuration, categoryId: correctCat.id, platformId: iberiaPlatform.id };
    });

    freshState.setVersions(updatedVersions);
    alert(`✅ ${fixed} versiones IBERIA reparadas con duraciones y categorías correctas.`);
  };
  // Exponer en window para uso desde consola (no hay botón visible)
  if (typeof window !== 'undefined') window.__repairIberia = handleRepairIberia;

  // ── VALIDADOR DE LIBRERÍA ─────────────────────────────────────────────────
  // Revisa que todas las versiones tengan platformId, categoryId y duration válidos.
  // Para IBERIA también verifica que el nombre esté en el mapa de classifyIberia.
  const handleValidateLibrary = () => {
    const state = libraryStore.getState();
    const issues = [];

    // Mapa plataforma id → logica
    const platLogicaMap = {};
    state.platforms.forEach(p => { platLogicaMap[p.id] = p.logica || 'logica_de_versiones'; });
    const platNameMap = {};
    state.platforms.forEach(p => { platNameMap[p.id] = p.name; });

    state.versions.forEach((v) => {
      const platName = platNameMap[v.platformId] || 'SIN PLATAFORMA';
      if (!v.platformId) {
        issues.push(`❌ "${v.name}" — sin plataforma asignada`);
      }
      if (!v.categoryId) {
        issues.push(`⚠️ "${v.name}" (${platName}) — sin categoría asignada`);
      }
      if (!v.duration || Number(v.duration) <= 0) {
        issues.push(`⚠️ "${v.name}" (${platName}) — duración 0 o no definida`);
      }
      // Validación específica IBERIA
      if (platName.toUpperCase() === 'IBERIA') {
        const inMap = VersionMatcher.IBERIA_DURATION_MAP[v.name.trim()];
        if (!inMap) {
          issues.push(`🔴 "${v.name}" (IBERIA) — no está en el mapa de versiones IBERIA (no se contará en el reporte)`);
        } else if (inMap !== Number(v.duration)) {
          issues.push(`🟡 "${v.name}" (IBERIA) — duration en store: ${v.duration}min, esperada: ${inMap}min (no afecta el reporte)`);
        }
      }
    });

    if (issues.length === 0) {
      alert('✅ Librería válida — todas las versiones tienen plataforma, categoría y duración correctas.');
    } else {
      alert(`⚠️ Se encontraron ${issues.length} problema(s):\n\n${issues.slice(0, 20).join('\n')}${
        issues.length > 20 ? `\n...y ${issues.length - 20} más (ver consola)` : ''
      }`);
      console.table(issues);
    }
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
    setInlineNewCat({ active: false, name: '', duration: 30 });
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

        let updated = 0;

        dataRows.forEach((row, idx) => {
          const name = String(row[0] || '').trim();
          if (!name) { skipped++; return; }

          // Duración: columna D (índice 3) tiene prioridad si es un número válido;
          // de lo contrario se detecta por sufijo numérico del nombre.
          const explicitDuration = row[3] !== undefined && row[3] !== '' ? parseInt(row[3], 10) : NaN;
          const duration = !isNaN(explicitDuration) && explicitDuration > 0
            ? explicitDuration
            : detectDurationFromName(name);
          


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

          // Si ya existe: actualizar duración/plataforma si el Excel trae datos explícitos
          const existing = state.versions.find(
            (v) => (v.name || '').trim().toLowerCase() === name.toLowerCase()
          );

          try {
            if (existing) {
              const needsUpdate =
                (!isNaN(explicitDuration) && explicitDuration > 0 && existing.duration !== duration) ||
                (platformId !== null && existing.platformId !== platformId);
              if (needsUpdate) {
                const updates = {};
                if (!isNaN(explicitDuration) && explicitDuration > 0) updates.duration = duration;
                if (platformId !== null) updates.platformId = platformId;
                state.updateVersion(existing.id, updates);
                updated++;
              } else {
                skipped++;
              }
            } else {
              state.addVersion({ name, duration, categoryId, platformId });
              existingNames.add(name.toLowerCase());
              created++;
            }
          } catch (err) {
            errors.push(`Fila ${idx + 2}: ${name} — ${err.message}`);
          }
        });

        setImportResult({ total: dataRows.length, created, updated, skipped, errors });
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

  // ===== EXPORT / IMPORT LIBRERÍA =====
  const handleExportLibrary = () => {
    const data = libraryStore.getState().exportLibraryData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libreria_tracking_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportLibrary = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.platforms || !data.categories || !data.versions) {
          alert('Archivo inválido: debe contener platforms, categories y versions.');
          return;
        }
        if (window.confirm(`¿Importar librería?\n\nEsto reemplazará tu librería actual con:\n• ${data.platforms.length} plataformas\n• ${data.categories.length} categorías\n• ${data.versions.length} versiones\n• ${(data.columnMappings || []).length} mapeos de columnas`)) {
          libraryStore.getState().importLibraryData(data);
          alert('✅ Librería importada correctamente.');
        }
      } catch {
        alert('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="library-view">
      <div className="library-header">
        <div>
          <h2>📚 Librería de Datos</h2>
          <p>Gesiona plataformas, categorías, versiones y duraciones</p>
        </div>
        <div className="library-header-actions">
          <button
            className="lib-btn-export"
            onClick={handleExportLibrary}
            title="💾 Hacer Respaldo&#10;Descarga toda la librería (plataformas, categorías y versiones) como archivo .json.&#10;Úsalo para guardar tu configuración o migrarla a otro dispositivo."
          >
            💾 Hacer Respaldo
          </button>
          <label
            className="lib-btn-import"
            title="♻️ Restaurar Respaldo&#10;Carga un archivo .json generado previamente con 'Hacer Respaldo'.&#10;Reemplaza completamente la librería actual (plataformas, categorías y versiones)."
            style={{ cursor: 'pointer' }}
          >
            ♻️ Restaurar Respaldo
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportLibrary}
            />
          </label>
        </div>
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
          title="Solo para logica_de_versiones e iberia_especial"
        >
          📂 Categorías ({categories.length})
          {platforms.some(p => p.logica === 'logica_de_versiones' || p.logica === 'iberia_especial') &&
            !categories.some(c => platforms.find(p => (p.logica === 'logica_de_versiones' || p.logica === 'iberia_especial') && p.id === c.platformId)) &&
            <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: '#dc2626' }}>⚠</span>
          }
        </button>
        <button
          className={`tab-btn ${activeTab === 'versions' ? 'active' : ''}`}
          onClick={() => setActiveTab('versions')}
          title="Solo para logica_de_versiones e iberia_especial"
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

            {/* Feedback card post-creación */}
            {savedPlatformInfo && (() => {
              const l = savedPlatformInfo.logica;
              const isSelfContained = l === 'logica_sin_version' || l === 'logica_comerciales' || l === 'logica_bp_i' || l === 'logica_youtube';
              return (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  background: isSelfContained ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${isSelfContained ? '#86efac' : '#fde68a'}`,
                  borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1rem',
                  fontSize: '0.875rem',
                }}>
                  <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{isSelfContained ? '✅' : '⚙️'}</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: isSelfContained ? '#15803d' : '#92400e' }}>
                      {isSelfContained
                        ? `Plataforma "${savedPlatformInfo.name}" lista para usar`
                        : `Plataforma "${savedPlatformInfo.name}" creada — requiere configuración`}
                    </strong>
                    <p style={{ margin: '0.25rem 0 0', color: isSelfContained ? '#166534' : '#78350f', lineHeight: 1.5 }}>
                      {l === 'logica_sin_version' && 'Clasifica por columna SEASON automáticamente. No necesita Categorías ni Versiones.'}
                      {l === 'logica_comerciales' && 'Cuenta assets y acumula DURATION. No necesita Categorías ni Versiones.'}
                      {l === 'logica_bp_i' && 'Cuenta assets y acumula MINUTOS netos. No necesita Categorías ni Versiones.'}
                      {l === 'logica_youtube' && 'Cuenta CLIPS y SHORTS por editor. No necesita Categorías ni Versiones.'}
                      {(l === 'logica_de_versiones' || l === 'iberia_especial') && (
                        <>Siguiente paso: ve a <strong>📂 Categorías</strong> para crear las categorías de esta plataforma, luego a <strong>📦 Versiones</strong> para registrar las versiones disponibles.</>
                      )}
                    </p>
                  </div>
                  {(l === 'logica_de_versiones' || l === 'iberia_especial') && (
                    <button
                      onClick={() => { setSavedPlatformInfo(null); setActiveTab('categories'); }}
                      style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #d97706', background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    >
                      Ir a Categorías →
                    </button>
                  )}
                  <button
                    onClick={() => setSavedPlatformInfo(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8', padding: '0 0.2rem' }}
                  >✕</button>
                </div>
              );
            })()}

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
                      <th>Grupo Esfuerzo</th>
                      <th>Estado</th>
                      <th>Config</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platforms.map((p) => {
                      const isSelfContained = p.logica === 'logica_sin_version' || p.logica === 'logica_comerciales' || p.logica === 'logica_bp_i' || p.logica === 'logica_youtube';
                      const hasCats = categories.some((c) => c.platformId === p.id);
                      return (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          <code>{p.logica}</code>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {p.effortGroup
                            ? <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '4px', padding: '2px 8px', fontSize: '0.78rem', fontWeight: 600 }}>{p.effortGroup}</span>
                            : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>}
                        </td>
                        <td>
                          <span className={`status ${p.active ? 'active' : 'inactive'}`}>
                            {p.active ? '✓ Activa' : '✗ Inactiva'}
                          </span>
                        </td>
                        <td>
                          {isSelfContained
                            ? <span style={{ fontSize: '0.78rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 8px', whiteSpace: 'nowrap' }}>✓ Lista</span>
                            : hasCats
                              ? <span style={{ fontSize: '0.78rem', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px', whiteSpace: 'nowrap' }}>✓ Con categorías</span>
                              : <button onClick={() => { setSavedPlatformInfo(null); setFilterCatPlatformId(p.id); setActiveTab('categories'); }} style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>⚠ Configurar →</button>
                          }
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CATEGORÍAS */}
        {activeTab === 'categories' && (
          <div className="tab-panel">
            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0' }}>
              <button
                onClick={() => setCatSubTab('versiones')}
                style={{
                  padding: '0.45rem 1rem', fontSize: '0.85rem', fontWeight: catSubTab === 'versiones' ? 700 : 400,
                  border: 'none', borderBottom: catSubTab === 'versiones' ? '3px solid #6366f1' : '3px solid transparent',
                  background: 'none', cursor: 'pointer', color: catSubTab === 'versiones' ? '#6366f1' : '#64748b',
                  marginBottom: '-2px',
                }}
              >
                📂 Por Versión (LATAM, OFF AIR, IBERIA, VOD)
              </button>
              <button
                onClick={() => setCatSubTab('propias')}
                style={{
                  padding: '0.45rem 1rem', fontSize: '0.85rem', fontWeight: catSubTab === 'propias' ? 700 : 400,
                  border: 'none', borderBottom: catSubTab === 'propias' ? '3px solid #f59e0b' : '3px solid transparent',
                  background: 'none', cursor: 'pointer', color: catSubTab === 'propias' ? '#92400e' : '#64748b',
                  marginBottom: '-2px',
                }}
              >
                ⚡ Tasas Propias (AMAZON, SONY ONE, COMERCIALES, BP&I, YOUTUBE)
              </button>
            </div>

            {/* Sub-tab: Plataformas con categorías propias (logica_sin_version, comerciales, bp_i, youtube) */}
            {catSubTab === 'propias' && (() => {
              const propiaPlats = platforms.filter(p =>
                p.logica === 'logica_sin_version' || p.logica === 'logica_comerciales' ||
                p.logica === 'logica_bp_i' || p.logica === 'logica_youtube'
              );
              if (propiaPlats.length === 0) return (
                <div className="empty-state"><p>No hay plataformas con tasas propias configuradas.</p></div>
              );
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {propiaPlats.map(p => {
                    const cats = p.categorias || [];
                    return (
                      <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ background: '#f8fafc', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <strong style={{ fontSize: '0.95rem' }}>{p.name}</strong>
                            <code style={{ fontSize: '0.75rem', color: '#64748b', background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px' }}>{p.logica}</code>
                            {p.effortGroup && <span style={{ fontSize: '0.78rem', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '4px', padding: '1px 8px', fontWeight: 600 }}>Grupo: {p.effortGroup}</span>}
                          </div>
                          <button
                            className="btn-icon btn-edit"
                            title="Editar plataforma y sus tasas"
                            onClick={() => {
                              setActiveTab('platforms');
                              setEditingId(p.id);
                              setFormData(p);
                              setShowForm(true);
                            }}
                          >✏️ Editar</button>
                        </div>
                        {cats.length === 0 ? (
                          <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>
                            {p.logica === 'logica_comerciales' || p.logica === 'logica_bp_i' || p.logica === 'logica_youtube'
                              ? 'Esta plataforma usa tasa única (no tiene categorías). Configura la Tasa de Esfuerzo en Editar.'
                              : 'Sin categorías configuradas. Haz clic en Editar para agregar keys.'}
                          </div>
                        ) : (
                          <table className="library-table" style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Key</th>
                                <th>Duración</th>
                                <th>Tasa Esfuerzo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cats.map((cat, idx) => {
                                const c = typeof cat === 'string' ? { key: cat, duration: '', effortRate: null } : cat;
                                return (
                                <tr key={idx}>
                                  <td><code style={{ fontSize: '0.85rem' }}>{c.key || <span style={{ color: '#94a3b8' }}>—</span>}</code></td>
                                  <td>
                                    {c.duration
                                      ? <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px', fontWeight: 600, fontSize: '0.85rem' }}>{c.duration} min</span>
                                      : <span style={{ color: '#94a3b8' }}>—</span>}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {c.effortRate != null && c.effortRate !== ''
                                      ? <span style={{ background: '#fefce8', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', padding: '2px 8px', fontSize: '0.85rem', fontWeight: 700 }}>{c.effortRate}×</span>
                                      : <span style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600 }}>⚠ Sin tasa</span>}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                        {/* Tasa única para logicas sin categorías */}
                        {(p.logica === 'logica_comerciales' || p.logica === 'logica_bp_i' || p.logica === 'logica_youtube') && (
                          <div style={{ padding: '0.6rem 1rem', borderTop: cats.length > 0 ? '1px solid #e2e8f0' : 'none', fontSize: '0.82rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>Tasa global:</span>
                            {p.platformEffortRate != null && p.platformEffortRate !== ''
                              ? <span style={{ background: '#fefce8', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', padding: '2px 8px', fontWeight: 700 }}>{p.platformEffortRate}×</span>
                              : <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ Sin tasa (usa 1×)</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Sub-tab: Categorías por versión (logica_de_versiones / iberia_especial) */}
            {catSubTab === 'versiones' && (<>
            {(() => {
              const versionPlats = platforms.filter(p => p.logica === 'logica_de_versiones' || p.logica === 'iberia_especial');
              const sinVersionPlats = platforms.filter(p => p.logica === 'logica_sin_version' || p.logica === 'logica_comerciales');
              if (platforms.length === 0) return null;
              return (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#0c4a6e', lineHeight: 1.6 }}>
                  <strong>📂 Categorías aplican a:</strong>{' '}
                  {versionPlats.length > 0
                    ? <><span style={{ color: '#1d4ed8', fontWeight: 600 }}>{versionPlats.map(p => p.name).join(', ')}</span> — clasifica por versión, requiere categorías configuradas aquí.</>                    
                    : <span style={{ color: '#94a3b8' }}>Ninguna plataforma activa usa esta configuración.</span>
                  }
                  {sinVersionPlats.length > 0 && (
                    <div style={{ marginTop: '0.3rem', color: '#64748b' }}>
                      {sinVersionPlats.map(p => p.name).join(', ')} ({sinVersionPlats.map(p => p.logica).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}) — <strong>no necesitan categorías aquí</strong>, ya están auto-configuradas.
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Filtro de plataforma */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>Filtrar por plataforma:</span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setFilterCatPlatformId(null)}
                  style={{
                    fontSize: '0.78rem', padding: '3px 10px', borderRadius: '12px', cursor: 'pointer',
                    border: `1px solid ${filterCatPlatformId === null ? '#1d4ed8' : '#cbd5e1'}`,
                    background: filterCatPlatformId === null ? '#eff6ff' : '#f8fafc',
                    color: filterCatPlatformId === null ? '#1d4ed8' : '#475569',
                    fontWeight: filterCatPlatformId === null ? 600 : 400,
                  }}
                >Todas</button>
                {platforms
                  .filter(p => p.logica === 'logica_de_versiones' || p.logica === 'iberia_especial')
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => setFilterCatPlatformId(p.id)}
                      style={{
                        fontSize: '0.78rem', padding: '3px 10px', borderRadius: '12px', cursor: 'pointer',
                        border: `1px solid ${filterCatPlatformId === p.id ? '#1d4ed8' : '#cbd5e1'}`,
                        background: filterCatPlatformId === p.id ? '#eff6ff' : '#f8fafc',
                        color: filterCatPlatformId === p.id ? '#1d4ed8' : '#475569',
                        fontWeight: filterCatPlatformId === p.id ? 600 : 400,
                      }}
                    >{p.name}</button>
                  ))}
              </div>
            </div>

            <div className="panel-header">
              <h3>
                Categorías
                {filterCatPlatformId && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 400, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px' }}>
                    {platforms.find(p => p.id === filterCatPlatformId)?.name}
                  </span>
                )}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => {
                  setEditingId(null);
                  setFormData({ platformId: filterCatPlatformId || platforms[0]?.id || null });
                  setShowForm(true);
                }}>
                  ➕ Nueva Categoría
                </button>
              </div>
            </div>

            {categories.filter(c => filterCatPlatformId === null || c.platformId === filterCatPlatformId).length === 0 ? (
              <div className="empty-state">
                {filterCatPlatformId
                  ? <p>
                      <strong>{platforms.find(p => p.id === filterCatPlatformId)?.name}</strong> no tiene categorías aún.{' '}
                      <button
                        className="btn btn-primary"
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => {
                          setEditingId(null);
                          setFormData({ platformId: filterCatPlatformId });
                          setShowForm(true);
                        }}
                      >➕ Crear primera categoría</button>
                    </p>
                  : <p>Sin categorías aún. Crea una plataforma primero.</p>
                }
              </div>
            ) : (
              <div className="table-container">
                <table className="library-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Plataforma</th>
                      <th>Duración</th>
                      <th>Tasa Esfuerzo</th>
                      <th>Versiones</th>
                      <th>Color</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.filter(c => filterCatPlatformId === null || c.platformId === filterCatPlatformId).map((c) => {
                      const catPlatform = platforms.find((p) => p.id === c.platformId);
                      const platLogica = catPlatform?.logica || 'logica_de_versiones';
                      const isVersionless = platLogica === 'logica_sin_version' || platLogica === 'logica_comerciales';

                      // Versiones directamente ligadas a esta categoría (por categoryId)
                      const ownVersions = versions.filter((v) => v.categoryId === c.id);
                      // Versiones en la librería global con la misma duración (para mostrar disponibilidad)
                      const globalMatching = c.duration
                        ? versions.filter((v) => Number(v.duration) === Number(c.duration))
                        : [];

                      return (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{getPlatformName(c.platformId)}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {c.duration
                            ? <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px', fontWeight: 600 }}>{c.duration} min</span>
                            : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {c.effortRate != null && c.effortRate !== ''
                            ? <span style={{ background: '#fefce8', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700 }}>{c.effortRate}×</span>
                            : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {isVersionless ? (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No aplica — usa SEASON</span>
                          ) : ownVersions.length > 0 ? (
                            <><strong>{ownVersions.length}</strong> versiones registradas{c.duration ? ` · ${c.duration} min c/u` : ''}</>
                          ) : globalMatching.length > 0 ? (
                            <span style={{ color: '#6366f1' }} title="Versiones de la librería global que coinciden por duración — la clasificación funciona automáticamente">
                              <strong>{globalMatching.length}</strong> en librería global · {c.duration} min
                            </span>
                          ) : (
                            <span style={{ color: '#f59e0b' }}>Sin versiones</span>
                          )}
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
            </>)}
          </div>
        )}

        {/* VERSIONES */}
        {activeTab === 'versions' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h3>Versiones</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label
                  className="btn btn-secondary"
                  style={{ cursor: 'pointer', margin: 0 }}
                  title="📥 Cargar Versiones (.xlsx)&#10;Agrega versiones en lote desde un archivo Excel.&#10;Columnas: A=Nombre, B=Categoría (opcional), C=Plataforma (opcional), D=Duración en minutos (opcional).&#10;Si la duración está vacía, se detecta automáticamente por el sufijo del nombre."
                >
                  📥 Cargar Versiones (.xlsx)
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportVersions} />
                </label>
                <button
                  className="btn btn-secondary"
                  onClick={handleValidateLibrary}
                  title="Valida que todas las versiones tengan plataforma, categoría y duración correctas. Para IBERIA verifica que estén en el mapa de versiones registradas."
                >
                  🔍 Validar librería
                </button>
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
                    ✅ <strong>{importResult.created}</strong> versiones creadas
                    {importResult.updated > 0 && <> &nbsp;·&nbsp; 🔄 <strong>{importResult.updated}</strong> actualizadas</>}
                    &nbsp;·&nbsp; ⏭ <strong>{importResult.skipped}</strong> sin cambios
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

            {/* Banner: qué plataformas aplican aquí */}
            {(() => {
              const versionPlats = platforms.filter(p => p.logica === 'logica_de_versiones' || p.logica === 'iberia_especial');
              const excludedPlats = platforms.filter(p => p.logica === 'logica_sin_version' || p.logica === 'logica_comerciales');
              if (platforms.length === 0) return null;
              return (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#0c4a6e', lineHeight: 1.6 }}>
                  <strong>📦 Versiones aplican a:</strong>{' '}
                  {versionPlats.length > 0
                    ? <><span style={{ color: '#1d4ed8', fontWeight: 600 }}>{versionPlats.map(p => p.name).join(', ')}</span> — cada versión debe estar registrada aquí para clasificar correctamente.</>                    
                    : <span style={{ color: '#94a3b8' }}>Ninguna plataforma activa usa versiones.</span>
                  }
                  {excludedPlats.length > 0 && (
                    <div style={{ marginTop: '0.3rem', color: '#64748b' }}>
                      {excludedPlats.map(p => p.name).join(', ')} — <strong>no necesitan versiones</strong>. Clasifican por SEASON o acumulan DURATION directamente.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Barra de búsqueda */}
            {versions.length > 0 && (
              <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar versión por nombre…"
                  value={versionSearch}
                  onChange={(e) => setVersionSearch(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '0.5rem 2.5rem 0.5rem 0.85rem',
                    border: '1px solid #cbd5e1', borderRadius: '6px',
                    fontSize: '0.875rem', outline: 'none',
                  }}
                />
                {versionSearch && (
                  <button
                    onClick={() => setVersionSearch('')}
                    style={{
                      position: 'absolute', right: '0.6rem', top: '50%',
                      transform: 'translateY(-50%)', background: 'none',
                      border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem',
                    }}
                  >✕</button>
                )}
              </div>
            )}

            {versions.length === 0 ? (
              <div className="empty-state">
                <p>Sin versiones aún. Crea categorías primero.</p>
              </div>
            ) : (() => {
              const filtered = versionSearch.trim()
                ? versions.filter((v) => v.name?.toLowerCase().includes(versionSearch.trim().toLowerCase()))
                : versions;
              return filtered.length === 0 ? (
                <div className="empty-state">
                  <p>No se encontró ninguna versión con <strong>"{versionSearch}"</strong>.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="library-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Lógica</th>
                        <th>Categoría</th>
                        <th>Duración</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((v, idx) => (
                        <tr key={`${v.id}-${idx}`}>
                          <td>{v.name}</td>
                          <td><code style={{ fontSize: '0.8rem' }}>{platforms.find((p) => p.id === v.platformId)?.logica || 'N/A'}</code></td>
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
              );
            })()}
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
                  <option value="logica_comerciales">logica_comerciales — cuenta assets y acumula DURATION</option>
                  <option value="logica_bp_i">logica_bp_i — cuenta assets y acumula MINUTOS netos</option>
                  <option value="logica_youtube">logica_youtube — cuenta CLIPS y SHORTS por editor</option>
                </select>

                {/* Grupo de Esfuerzo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                    📊 Grupo de Esfuerzo (columna en reporte de horas)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: LATAM, IBERIA, COMERCIALES, BP&I, OTROS"
                    value={formData.effortGroup || ''}
                    onChange={(e) => setFormData({ ...formData, effortGroup: e.target.value.toUpperCase() })}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
                  />
                  <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                    Agrupa plataformas en una misma columna de horas. Ej: LATAM y BRAZIL → grupo "LATAM".
                  </small>
                </div>

                {/* Tasa de Esfuerzo a nivel de plataforma (solo para logicas sin categorías propias) */}
                {(formData.logica === 'logica_comerciales' || formData.logica === 'logica_bp_i' || formData.logica === 'logica_youtube') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                      ⚡ Tasa de Esfuerzo (multiplicador de horas)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="Ej: 1, 1.5, 2"
                      value={formData.platformEffortRate ?? ''}
                      onChange={(e) => setFormData({ ...formData, platformEffortRate: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.875rem', width: '120px' }}
                    />
                    <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                      Multiplica las horas calculadas. Ej: 1.5 = cada hora real cuenta como 1.5h de esfuerzo.
                    </small>
                  </div>
                )}

                {/* Campos extra solo para logica_sin_version */}
                {formData.logica === 'logica_sin_version' && (
                  <>
                    <small style={{ color: '#64748b', fontSize: '0.8rem', margin: '8px 0' }}>
                      ℹ️ Esta lógica clasifica por columna SEASON. Agregá N cantidad de categorías con sus duraciones:
                    </small>
                    
                    {/* Lista de categorías dinámicas */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '0.75rem 0', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {(formData.categorias || []).map((cat, idx) => {
                        // Normalizar formato antiguo (string) a objeto al renderizar
                        const catObj = typeof cat === 'string' ? { key: cat, duration: '', effortRate: null } : cat;
                        return (
                        <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                              📌 Key {idx + 1}
                            </label>
                            <input
                              type="text"
                              placeholder={idx === 0 ? "Ej: serie_45min" : idx === 1 ? "Ej: pelicula_120min" : "Ej: especial_90min"}
                              value={catObj.key || ''}
                              onChange={(e) => {
                                const cats = [...(formData.categorias || [])];
                                cats[idx] = { ...catObj, key: e.target.value };
                                setFormData({ ...formData, categorias: cats });
                              }}
                              style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '90px' }}>
                            <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                              ⏱ Duración (min)
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Ej: 45"
                              value={catObj.duration || ''}
                              onChange={(e) => {
                                const cats = [...(formData.categorias || [])];
                                cats[idx] = { ...catObj, duration: e.target.value ? parseInt(e.target.value) : '' };
                                setFormData({ ...formData, categorias: cats });
                              }}
                              style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '80px' }}>
                            <label style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 500 }}>
                              ⚡ Tasa
                            </label>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              placeholder="Ej: 1.5"
                              value={catObj.effortRate ?? ''}
                              onChange={(e) => {
                                const cats = [...(formData.categorias || [])];
                                cats[idx] = { ...catObj, effortRate: e.target.value !== '' ? parseFloat(e.target.value) : null };
                                setFormData({ ...formData, categorias: cats });
                              }}
                              style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #fde68a', fontSize: '0.85rem', background: '#fefce8' }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const cats = formData.categorias.filter((_, i) => i !== idx);
                              setFormData({ ...formData, categorias: cats });
                            }}
                            style={{
                              padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #fca5a5', background: '#fee2e2',
                              color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, minWidth: '60px'
                            }}
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                        );
                      })}
                    </div>

                    {/* Botón agregar categoría */}
                    <button
                      type="button"
                      onClick={() => {
                        const cats = [...(formData.categorias || [])];
                        cats.push({ key: '', duration: '' });
                        setFormData({ ...formData, categorias: cats });
                      }}
                      style={{
                        padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px dashed #3b82f6', background: '#eff6ff',
                        color: '#1d4ed8', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, width: '100%', marginBottom: '0.5rem'
                      }}
                    >
                      ➕ Agregar otra categoría
                    </button>
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
                {/* Tasa de Esfuerzo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                    ⚡ Tasa de Esfuerzo (horas por asset)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="Ej: 1.5, 0.75, 3"
                    value={formData.effortRate ?? ''}
                    onChange={(e) => setFormData({ ...formData, effortRate: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '140px' }}
                  />
                  <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                    Multiplica el conteo de assets de esta categoría para calcular horas de esfuerzo del editor.
                  </small>
                </div>
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
                {/* Selector de categoría + creación inline */}
                <select
                  value={inlineNewCat.active ? '__new__' : (formData.categoryId || '')}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setInlineNewCat({ active: true, name: '', duration: formData.duration || 30 });
                    } else {
                      setInlineNewCat({ active: false, name: '', duration: 30 });
                      setFormData({ ...formData, categoryId: parseInt(e.target.value) });
                    }
                  }}
                >
                  <option value="">Selecciona una categoría</option>
                  {categories
                    .filter((c) => !formData.platformId || c.platformId === formData.platformId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.duration}min)
                      </option>
                    ))}
                  <option value="__new__">➕ Crear nueva categoría...</option>
                </select>

                {/* Mini-formulario inline para categoría nueva */}
                {inlineNewCat.active && (
                  <div style={{
                    background: '#f0fdf4', border: '1px solid #86efac',
                    borderRadius: '8px', padding: '0.75rem', display: 'flex',
                    flexDirection: 'column', gap: '0.5rem',
                  }}>
                    <strong style={{ fontSize: '0.85rem', color: '#15803d' }}>✨ Nueva categoría</strong>
                    <input
                      type="text"
                      placeholder="Nombre (ej: serie 60min)"
                      value={inlineNewCat.name}
                      onChange={(e) => setInlineNewCat({ ...inlineNewCat, name: e.target.value })}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.875rem' }}
                      autoFocus
                    />
                    <input
                      type="number"
                      placeholder="Duración (min) — ej: 30, 60, 120"
                      value={inlineNewCat.duration}
                      onChange={(e) => setInlineNewCat({ ...inlineNewCat, duration: parseInt(e.target.value) || 30 })}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.875rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                        onClick={() => {
                          if (!inlineNewCat.name.trim()) return;
                          const newCat = {
                            name: inlineNewCat.name.trim(),
                            duration: inlineNewCat.duration,
                            platformId: formData.platformId || null,
                          };
                          libraryStore.getState().addCategory(newCat);
                          // Recuperar el ID recién creado
                          const created = libraryStore.getState().categories
                            .find((c) => c.name === newCat.name && c.platformId === newCat.platformId);
                          setFormData({ ...formData, duration: inlineNewCat.duration, categoryId: created?.id || null });
                          setInlineNewCat({ active: false, name: '', duration: 30 });
                        }}
                      >
                        ✔ Agregar
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                        onClick={() => setInlineNewCat({ active: false, name: '', duration: 30 })}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
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

/**
 * LibraryView.jsx - Gestión de Librería de Datos
 * Permite crear/editar plataformas, categorías, versiones, duraciones
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import '../../styles/LibraryView.css';
import libraryStore from '../../store/libraryStore';
import { LOGICA_FAMILIES, familyOf } from '../../core/reportEngine/logicaFamilies';
import { DEFAULT_RATE, isValidRate, RATE_INPUT_PROPS, rateFromInput } from '../../core/utils/rates';
import {
  detectDurationFromSuffix as detectDurationFromName,
  checkVersionSuffix,
  detectSubPlatform as detectSubPlatformFromName,
  describeSuffixRules,
  suffixRuleProblem,
  normalizeSuffixRules,
  suffixNumber,
} from '../../core/reportEngine/versionRules';
import { buildCategoryLabel } from '../../core/utils/categoryLabel';
import { editorKey } from '../../core/utils/editorRegistry';
import PlatformWizard from './PlatformWizard';
import { CATEGORY_RATE_LOGICAS, PLATFORM_RATE_LOGICAS, platformProblems } from '../../core/utils/platformStatus';

// Tasa que se muestra/guarda: si nunca se configuró (null/undefined) se muestra 1 escrito;
// si el usuario la borró ('') queda vacía y el guardado se bloquea.
const shownRate = (v) => (v === null || v === undefined ? DEFAULT_RATE : v);

function LibraryView() {
  const [activeTab, setActiveTab] = useState('platforms'); // platforms, categories, versions
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});

  // Editar plataforma con versiones: tasas de sus categorías editadas en el mismo
  // formulario ({ categoryId: valor }). Se guardan EN la categoría (una sola tasa).
  const [catRateEdits, setCatRateEdits] = useState({});
  useEffect(() => { setCatRateEdits({}); }, [showForm, editingId]);

  // Asistente de alta de plataforma nueva (ver PlatformWizard.jsx)
  const [showWizard, setShowWizard] = useState(false);

  // Modal de reasignación de versiones al crear plataforma nueva con logica_de_versiones
  const [reassignModal, setReassignModal] = useState(null);
  // { newPlatformId, newPlatformName, candidates: [{id, name, currentPlatformName}], selected: Set }

  // Feedback post-creación de plataforma
  const [savedPlatformInfo, setSavedPlatformInfo] = useState(null);
  // { name, logica }

  // Import masivo de versiones desde Excel
  const [importResult, setImportResult] = useState(null);

  // Mini-formulario inline para crear categoría desde el modal de versión
  // Categoría creada desde el formulario de versión: nombre base + duración + tasa (obligatoria)
  const EMPTY_INLINE_CAT = { active: false, name: '', duration: '', rate: DEFAULT_RATE };
  const [inlineNewCat, setInlineNewCat] = useState(EMPTY_INLINE_CAT);

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
  const editors = libraryStore((state) => state.editors);
  const suffixRules = libraryStore((state) => state.suffixRules);

  // ===== NÚMEROS FINALES DE VERSIÓN → DURACIÓN (un número por fila) =====
  const [newSuffixRule, setNewSuffixRule] = useState({ number: '', duration: '' });
  const versionsWithNumber = (n) => versions.filter((v) => suffixNumber(v.name) === n).length;
  const handleAddSuffixRule = () => {
    const rule = { number: parseInt(newSuffixRule.number, 10), duration: parseInt(newSuffixRule.duration, 10) };
    const problem = suffixRuleProblem(rule, suffixRules);
    if (problem) { alert(`🚫 ${problem}`); return; }
    libraryStore.getState().addSuffixRule(rule);
    setNewSuffixRule({ number: '', duration: '' });
  };
  const handleChangeSuffixDuration = (rule, input) => {
    const duration = parseInt(input.value, 10);
    if (duration === rule.duration) return;
    if (!(duration > 0)) {
      alert('🚫 La duración debe ser un número de minutos mayor que 0.');
      input.value = rule.duration;
      return;
    }
    const inUse = versionsWithNumber(rule.number);
    if (inUse > 0 && !window.confirm(
      `Hay ${inUse} versiones registradas con el número ${rule.number} (${rule.duration} min).\n\n`
      + `Si cambias a ${duration} min, esas versiones quedan marcadas en "Validar librería" hasta que las pases a una categoría de ${duration} min. ¿Cambiar?`,
    )) {
      input.value = rule.duration;
      return;
    }
    libraryStore.getState().updateSuffixRule(rule.id, { duration });
  };
  const handleDeleteSuffixRule = (rule) => {
    const inUse = versionsWithNumber(rule.number);
    const msg = inUse > 0
      ? `¿Quitar el número ${rule.number} (${rule.duration} min)?\n\nHay ${inUse} versiones registradas con ese número: siguen contando (están registradas), pero no se podrán crear nuevas con ese número.`
      : `¿Quitar el número ${rule.number} (${rule.duration} min)?`;
    if (window.confirm(msg)) libraryStore.getState().deleteSuffixRule(rule.id);
  };

  // ===== EDITORES =====
  const [newEditorName, setNewEditorName] = useState('');
  const editorNameTaken = (name, exceptId = null) => {
    const k = editorKey(name);
    return editors.some((e) => e.id !== exceptId && editorKey(e.name) === k);
  };
  const handleAddEditor = () => {
    const name = newEditorName.trim();
    if (!name) return;
    if (editorNameTaken(name)) {
      alert(`"${name}" ya está registrado.`);
      return;
    }
    libraryStore.getState().addEditor(name);
    setNewEditorName('');
  };
  const handleRenameEditor = (ed, input) => {
    const name = input.value.trim();
    if (!name || name === ed.name) { input.value = ed.name; return; }
    if (editorNameTaken(name, ed.id)) {
      alert(`"${name}" ya está registrado.`);
      input.value = ed.name;
      return;
    }
    libraryStore.getState().updateEditor(ed.id, { name });
  };

  // ===== PLATAFORMAS =====
  // Alta nueva usa el asistente (PlatformWizard); no escribe nada hasta el paso final.
  // Editar una plataforma existente sigue usando el modal de un solo paso (handleSavePlatform).
  const handleAddPlatform = () => {
    setShowWizard(true);
  };

  const handleSavePlatform = () => {
    if (!formData.name || !formData.logica) return;

    // Toda tasa debe quedar escrita (1 = estándar). Nada se completa por detrás.
    const usesPlatformRate = PLATFORM_RATE_LOGICAS.includes(formData.logica);
    const platformRate = shownRate(formData.platformEffortRate);
    const casillas = (formData.categorias || []).map((c) => ({ ...c, effortRate: shownRate(c.effortRate) }));
    const isDurCat = formData.logica === 'logica_duracion_categorias';
    const usesCategoryRates = CATEGORY_RATE_LOGICAS.includes(formData.logica);
    const platCatRates = editingId && usesCategoryRates
      ? categories
        .filter((c) => String(c.platformId) === String(editingId))
        .map((c) => {
          const key = String(c.id);
          const rKey = `R:${c.id}`;
          return {
            cat: c,
            rate: key in catRateEdits ? catRateEdits[key] : shownRate(c.effortRate),
            reprocessRate: isDurCat ? (rKey in catRateEdits ? catRateEdits[rKey] : shownRate(c.reprocessRate)) : null,
          };
        })
      : [];
    const missingRates = [];
    if (usesPlatformRate && !isValidRate(platformRate)) missingRates.push('Tasa de Esfuerzo de la plataforma');
    if (formData.logica === 'logica_sin_version') {
      casillas.slice(0, 2).forEach((c, i) => {
        if (!isValidRate(c.effortRate)) missingRates.push(`Tasa de la casilla ${i === 0 ? 'serie' : 'película'}`);
      });
    }
    platCatRates.forEach(({ cat, rate, reprocessRate }) => {
      if (!isValidRate(rate)) missingRates.push(`Tasa de la categoría "${cat.name}"`);
      if (isDurCat && !isValidRate(reprocessRate)) missingRates.push(`Tasa de reproceso de "${cat.name}"`);
    });
    if (missingRates.length > 0) {
      alert(`🚫 No se puede guardar: falta la tasa (debe ser mayor que 0; 1 = estándar).\n\n• ${missingRates.join('\n• ')}`);
      return;
    }

    const normalizedData = {
      ...formData,
      categorias: formData.logica === 'logica_sin_version' ? casillas : (formData.categorias || []),
      platformEffortRate: usesPlatformRate ? parseFloat(platformRate) : (formData.platformEffortRate ?? null),
    };

    if (editingId) {
      // Tasas de las categorías de esta plataforma (con versiones): se guardan EN la categoría
      platCatRates.forEach(({ cat, rate, reprocessRate }) => {
        if (isDurCat && Number(cat.reprocessRate) !== Number(reprocessRate)) {
          libraryStore.getState().updateCategory(cat.id, { reprocessRate: parseFloat(reprocessRate) });
        }
        if (Number(cat.effortRate) !== Number(rate)) {
          libraryStore.getState().updateCategory(cat.id, { effortRate: parseFloat(rate) });
        }
      });
      libraryStore.getState().updatePlatform(editingId, normalizedData);
      setShowForm(false);
      setFormData({});
      setEditingId(null);
      return;
    }

    // Crear la plataforma nueva
    libraryStore.getState().addPlatform(normalizedData);

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
  const handleSaveCategory = () => {
    if (!formData.name || !formData.platformId) return;
    // La tasa debe quedar escrita (1 = estándar)
    const catRate = shownRate(formData.effortRate);
    if (!isValidRate(catRate)) {
      alert('🚫 No se puede guardar: falta la Tasa de Esfuerzo (debe ser mayor que 0; 1 = estándar).');
      return;
    }
    formData.effortRate = parseFloat(catRate);
    const catPlatformLogica = platforms.find((p) => String(p.id) === String(formData.platformId))?.logica;
    if (catPlatformLogica === 'logica_duracion_categorias') {
      const rRate = shownRate(formData.reprocessRate);
      if (!isValidRate(rRate)) {
        alert('🚫 No se puede guardar: falta la Tasa de reproceso (debe ser mayor que 0; 1 = estándar).');
        return;
      }
      if (!Number(formData.duration)) {
        alert('🚫 No se puede guardar: esta plataforma elige la categoría por DURATION, así que la categoría necesita su duración en minutos.');
        return;
      }
      const sameDuration = categories.find((c) => String(c.platformId) === String(formData.platformId)
        && Number(c.duration) === Number(formData.duration) && c.id !== editingId);
      if (sameDuration) {
        alert(`🚫 No se puede guardar: "${sameDuration.name}" ya es la categoría de ${formData.duration} min de esta plataforma.`);
        return;
      }
      formData.reprocessRate = parseFloat(rRate);
    }

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

  // ── VALIDADOR DE LIBRERÍA ─────────────────────────────────────────────────
  // Revisa que todas las versiones tengan platformId, categoryId y duration válidos.
  // IBERIA ya no tiene reglas propias: usa la librería igual que logica_de_versiones,
  // así que los mismos chequeos genéricos la cubren.
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
      getVersionCategoryConflicts(v).forEach((msg) => {
        issues.push(`🔴 "${v.name}" (${platName}) — ${msg}`);
      });
    });

    // Configuración de cada plataforma (categorías, casillas, tasas, grupo): la misma regla
    // que la columna "Configuración" de Librerías → Plataformas
    state.platforms.forEach((p) => {
      platformProblems(p, state.categories).forEach((problem) => {
        issues.push(`⚡ ${p.name} — falta ${problem}`);
      });
    });

    if (issues.length === 0) {
      alert('✅ Librería válida — versiones con plataforma, categoría y duración correctas, y todas las tasas configuradas.');
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
    setFormData({ platformId: null, categoryId: null });
    setInlineNewCat(EMPTY_INLINE_CAT);
    setShowForm(true);
  };

  // Nombre, duración y categoría de una versión tienen que decir lo mismo. Si la
  // categoría es de otra duración, el reporte suma los minutos de la versión pero
  // calcula las horas de esfuerzo con la tarifa de la categoría (así se perdieron
  // horas con BRA_SAP_CC_SQZ_CREDITS_HD 9: 120 min archivada en "serie (30 min)").
  const getVersionCategoryConflicts = (data) => {
    const cat = categories.find((c) => c.id === data.categoryId);
    const catDur = Number(cat?.duration) || 0;
    if (!cat || !catDur) return [];
    const conflicts = [];
    const suffixDur = checkVersionSuffix(data.name || '', suffixRules).duration;
    if (suffixDur !== null && suffixDur !== catDur) {
      conflicts.push(`El nombre sugiere ${suffixDur} min (por su sufijo), pero la categoría "${cat.name}" es de ${catDur} min.`);
    }
    const verDur = Number(data.duration) || 0;
    if (verDur && verDur !== catDur) {
      conflicts.push(`La duración de la versión (${verDur} min) no coincide con la categoría "${cat.name}" (${catDur} min).`);
    }
    return conflicts;
  };

  const handleSaveVersion = () => {
    if (!formData.platformId || !String(formData.name || '').trim() || !formData.categoryId) {
      alert('🚫 Completa los 3 pasos: plataforma, nombre de la versión y categoría.');
      return;
    }

    const { invalidSuffix, duration: numberDuration } = checkVersionSuffix(formData.name, suffixRules);
    if (invalidSuffix !== null) {
      alert(`🚫 No se puede crear esta versión.\n\nEl número final "${invalidSuffix}" no está en la tabla de números finales (${describeSuffixRules(suffixRules)}).\n\nSi ese número existe, agrégalo primero en Librerías → Versiones → "Números finales de versión".`);
      return;
    }

    // Duración: la del número final; si el nombre no tiene número (ej. IBERIA), la de la categoría
    const cat = categories.find((c) => c.id === formData.categoryId);
    const data = { ...formData, name: formData.name.trim(), duration: numberDuration ?? (Number(cat?.duration) || null) };

    const conflicts = getVersionCategoryConflicts(data);
    if (conflicts.length > 0) {
      alert(`🚫 No se puede guardar esta versión — no coincide:\n\n${conflicts.join('\n')}\n\nCorrige el nombre o elige la categoría correcta.`);
      return;
    }

    if (editingId) {
      libraryStore.getState().updateVersion(editingId, data);
    } else {
      libraryStore.getState().addVersion(data);
    }

    setShowForm(false);
    setFormData({});
    setEditingId(null);
    setInlineNewCat(EMPTY_INLINE_CAT);
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
            : detectDurationFromName(name, suffixRules);
          


          // Plataforma opcional (columna C, índice 2)
          const platName = String(row[2] || '').trim();
          let platformId = null;
          if (platName) {
            const foundPlt = state.platforms.find(
              (p) => (p.name || '').trim().toLowerCase() === platName.toLowerCase()
            );
            platformId = foundPlt?.id || null;
          }

          // Categoría opcional (columna B, índice 1)
          // IMPORTANTE: se filtra por platformId para no confundir categorías con el mismo
          // nombre en distintas plataformas (ej: "serie (60 min)" existe en LATAM y en VOD
          // con effortRate distinto). Sin este filtro, find() devuelve la primera coincidencia
          // por nombre sin importar la plataforma.
          const catName = String(row[1] || '').trim();
          let categoryId = null;
          if (catName) {
            const found = state.categories.find(
              (c) => (c.name || '').trim().toLowerCase() === catName.toLowerCase()
                && (!platformId || c.platformId === platformId)
            );
            categoryId = found?.id || null;
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
          title="Para logica_de_versiones, iberia_especial y logica_duracion_categorias"
        >
          📂 Categorías ({categories.length})
          {/* ⚠ si alguna plataforma que usa categorías todavía no tiene ninguna */}
          {platforms.some(p => CATEGORY_RATE_LOGICAS.includes(p.logica)
            && !categories.some(c => String(c.platformId) === String(p.id))) &&
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
        <button
          className={`tab-btn ${activeTab === 'editors' ? 'active' : ''}`}
          onClick={() => setActiveTab('editors')}
        >
          👤 Editores ({editors.length})
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
              const isSelfContained = l === 'logica_sin_version' || l === 'logica_comerciales' || l === 'logica_bp_i' || l === 'logica_por_duracion' || l === 'logica_youtube';
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
                      {l === 'logica_por_duracion' && 'Suma los minutos de la columna DURATION × tasa de la plataforma. No necesita Categorías ni Versiones.'}
                      {l === 'logica_youtube' && 'Cuenta CLIPS y SHORTS por editor. No necesita Categorías ni Versiones.'}
                      {(l === 'logica_de_versiones' || l === 'iberia_especial') && (
                        <>Siguiente paso: ve a <strong>📂 Categorías</strong> para crear las categorías de esta plataforma, luego a <strong>📦 Versiones</strong> para registrar las versiones disponibles.</>
                      )}
                      {l === 'logica_duracion_categorias' && (
                        <>Usa las categorías de <strong>📂 Categorías</strong>: la columna DURATION elige la categoría por su duración. Agrega más categorías ahí cuando aparezcan otras duraciones.</>
                      )}
                    </p>
                  </div>
                  {CATEGORY_RATE_LOGICAS.includes(l) && (
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
                      <th>Configuración</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platforms.map((p) => {
                      // Lo que le falta para poder calcular (misma regla que "Validar librería")
                      const problems = platformProblems(p, categories);
                      const openFix = () => {
                        setSavedPlatformInfo(null);
                        if (problems.includes('categorías')) {
                          // Sin categorías: se crean en 📂 Categorías, filtrado por esta plataforma
                          setFilterCatPlatformId(p.id);
                          setActiveTab('categories');
                        } else {
                          setEditingId(p.id);
                          setFormData(p);
                          setShowForm(true);
                        }
                      };
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
                          {problems.length === 0
                            ? <span style={{ fontSize: '0.78rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 8px', whiteSpace: 'nowrap' }}>✓ Completa</span>
                            : (
                              <button
                                onClick={openFix}
                                title={`Falta: ${problems.join(', ')}\n(clic para corregirlo)`}
                                style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', textAlign: 'left' }}
                              >
                                ⚠ Falta: {problems.slice(0, 2).join(', ')}{problems.length > 2 ? ` y ${problems.length - 2} más` : ''} →
                              </button>
                            )}
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
                📂 Por categoría (con versión y por duración)
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
                ⚡ Tasas Propias (sin versión, por duración y por conteo)
              </button>
            </div>

            {/* Sub-tab: Plataformas con categorías propias (logica_sin_version, comerciales, bp_i, youtube) */}
            {catSubTab === 'propias' && (() => {
              const propiaPlats = platforms.filter(p =>
                p.logica === 'logica_sin_version' || p.logica === 'logica_comerciales' ||
                p.logica === 'logica_bp_i' || p.logica === 'logica_por_duracion' || p.logica === 'logica_youtube'
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
                            {p.logica === 'logica_comerciales' || p.logica === 'logica_bp_i' || p.logica === 'logica_por_duracion' || p.logica === 'logica_youtube'
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
                                const c = cat;
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
                                      : <span style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600 }}>Sin tasa (cuenta 1×, estándar)</span>}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                        {/* Tasa única para logicas sin categorías */}
                        {(p.logica === 'logica_comerciales' || p.logica === 'logica_bp_i' || p.logica === 'logica_por_duracion' || p.logica === 'logica_youtube') && (
                          <div style={{ padding: '0.6rem 1rem', borderTop: cats.length > 0 ? '1px solid #e2e8f0' : 'none', fontSize: '0.82rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>Tasa global:</span>
                            {p.platformEffortRate != null && p.platformEffortRate !== ''
                              ? <span style={{ background: '#fefce8', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', padding: '2px 8px', fontWeight: 700 }}>{p.platformEffortRate}×</span>
                              : <span style={{ color: '#f59e0b', fontWeight: 600 }}>Sin tasa (cuenta 1×, estándar)</span>}
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
              const versionPlats = platforms.filter(p => CATEGORY_RATE_LOGICAS.includes(p.logica));
              const sinVersionPlats = platforms.filter(p => !CATEGORY_RATE_LOGICAS.includes(p.logica));
              if (platforms.length === 0) return null;
              return (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#0c4a6e', lineHeight: 1.6 }}>
                  <strong>📂 Categorías aplican a:</strong>{' '}
                  {versionPlats.length > 0
                    ? <><span style={{ color: '#1d4ed8', fontWeight: 600 }}>{versionPlats.map(p => p.name).join(', ')}</span> — clasifican por versión o por duración, requieren categorías configuradas aquí.</>                    
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
                  // Todas las plataformas que usan categorías (con versión y por duración con categorías)
                  .filter(p => CATEGORY_RATE_LOGICAS.includes(p.logica))
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
                  setFormData({ platformId: filterCatPlatformId || null });
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
                      const isVersionless = platLogica !== 'logica_de_versiones' && platLogica !== 'iberia_especial';

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
                            : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>1× (estándar)</span>}
                          {platLogica === 'logica_duracion_categorias' && (
                            <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '3px' }}>R: {c.reprocessRate ?? 1}×</div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {platLogica === 'logica_duracion_categorias' ? (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No aplica — la elige DURATION ({c.duration} min)</span>
                          ) : isVersionless ? (
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

            {/* Números finales de versión → duración (un número por fila, editable) */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1rem', background: '#f8fafc' }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b', marginBottom: '0.3rem' }}>
                🔢 Números finales de versión → duración
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.6rem', lineHeight: 1.5 }}>
                El número al final del nombre (ej. "LAT_ORI_HD <strong>3</strong>") dice la duración de la versión.
                Al registrar una versión solo se ofrecen las categorías de esa duración (serie o película,
                la eliges tú). Un número que no esté aquí no se puede registrar, y la Auditoría lo avisa.
              </div>
              <table className="library-table" style={{ margin: 0, maxWidth: '640px' }}>
                <thead>
                  <tr><th>Número final</th><th>Duración (min)</th><th>Categorías de esa duración</th><th></th></tr>
                </thead>
                <tbody>
                  {normalizeSuffixRules(suffixRules).map((r) => {
                    const withCats = platforms
                      .filter((p) => p.logica === 'logica_de_versiones' || p.logica === 'iberia_especial')
                      .filter((p) => categories.some((c) => String(c.platformId) === String(p.id) && Number(c.duration) === Number(r.duration)));
                    return (
                      <tr key={r.id}>
                        <td><strong>{r.number}</strong></td>
                        <td>
                          <input
                            key={`${r.id}-${r.duration}`}
                            type="number" min="1" step="1"
                            defaultValue={r.duration}
                            onBlur={(e) => handleChangeSuffixDuration(r, e.target)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{ width: '80px' }}
                          />
                        </td>
                        <td style={{ fontSize: '0.78rem', color: withCats.length ? '#475569' : '#b91c1c' }}>
                          {withCats.length ? withCats.map((p) => p.name).join(', ') : '⚠ ninguna plataforma tiene una categoría de esta duración'}
                        </td>
                        <td className="actions">
                          <button className="btn-icon btn-delete" title="Quitar este número" onClick={() => handleDeleteSuffixRule(r)}>🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td>
                      <input type="number" min="1" step="1" placeholder="Ej: 11" value={newSuffixRule.number}
                        onChange={(e) => setNewSuffixRule({ ...newSuffixRule, number: e.target.value })} style={{ width: '80px' }} />
                    </td>
                    <td>
                      <input type="number" min="1" step="1" placeholder="Ej: 120" value={newSuffixRule.duration}
                        onChange={(e) => setNewSuffixRule({ ...newSuffixRule, duration: e.target.value })} style={{ width: '80px' }} />
                    </td>
                    <td colSpan={2}>
                      <button className="btn btn-primary" onClick={handleAddSuffixRule}
                        disabled={!newSuffixRule.number || !newSuffixRule.duration}>➕ Agregar</button>
                    </td>
                  </tr>
                </tbody>
              </table>
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
              const excludedPlats = platforms.filter(p => p.logica !== 'logica_de_versiones' && p.logica !== 'iberia_especial');
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
                            {(() => {
                              // Etiqueta con la duración de la CATEGORÍA (no la de la versión), para
                              // que un desajuste entre ambas se vea en vez de quedar escondido.
                              const cat = categories.find((c) => c.id === v.categoryId);
                              if (!cat) return getCategoryName(v.categoryId);
                              const label = buildCategoryLabel({ name: cat.name, duration: cat.duration });
                              const mismatch = Number(v.duration) && Number(cat.duration) && Number(v.duration) !== Number(cat.duration);
                              return mismatch
                                ? <span style={{ color: '#b91c1c', fontWeight: 600 }} title="La duración de la versión no coincide con la de su categoría">⚠️ {label}</span>
                                : label;
                            })()}
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

        {/* EDITORES */}
        {activeTab === 'editors' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h3>Editores</h3>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Apellido Nombre (tal cual viene en el input)"
                value={newEditorName}
                onChange={(e) => setNewEditorName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddEditor(); }}
                style={{ flex: 1, padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
              <button className="btn btn-primary" onClick={handleAddEditor} disabled={!newEditorName.trim()}>
                ➕ Agregar editor
              </button>
            </div>

            {editors.length === 0 ? (
              <div className="empty-state">
                <p>Sin editores registrados. Agrégalos aquí en orden Apellido Nombre. Si un nombre del input no está aquí, la Auditoría del reporte dice en qué filas está.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="library-table">
                  <thead>
                    <tr>
                      <th>Nombre correcto (Apellido Nombre)</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...editors].sort((a, b) => a.name.localeCompare(b.name)).map((ed) => (
                      <tr key={ed.id}>
                        <td>
                          <input
                            type="text"
                            defaultValue={ed.name}
                            onBlur={(e) => handleRenameEditor(ed, e.target)}
                            style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', width: '100%' }}
                          />
                        </td>
                        <td className="actions">
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => {
                              if (window.confirm(`¿Eliminar al editor "${ed.name}" del registro? Si vuelve a aparecer en un Excel, la app preguntará por él.`)) {
                                libraryStore.getState().deleteEditor(ed.id);
                              }
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
                  {LOGICA_FAMILIES.map((fam) => (
                    <optgroup key={fam.key} label={`${fam.title} — columna ${fam.column}`}>
                      {fam.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {/* Qué hace la lógica elegida (misma descripción que el asistente) */}
                {(() => {
                  const fam = familyOf(formData.logica);
                  const opt = fam?.options.find((o) => o.value === formData.logica);
                  if (!fam || !opt) return null;
                  return (
                    <small style={{ color: '#475569', fontSize: '0.8rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.7rem', lineHeight: 1.5 }}>
                      <strong>{fam.title}</strong> — {fam.desc}<br />
                      {opt.desc}
                    </small>
                  );
                })()}

                {/* Grupo de Esfuerzo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                    📊 Grupo de Esfuerzo (columna en reporte de horas)
                  </label>
                  <input
                    type="text"
                    list="effort-group-options"
                    placeholder="Ej: LATAM, IBERIA, COMERCIALES, BP&I, OTROS"
                    value={formData.effortGroup || ''}
                    onChange={(e) => setFormData({ ...formData, effortGroup: e.target.value.toUpperCase() })}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
                  />
                  <datalist id="effort-group-options">
                    {[...new Set(platforms.map((p) => (p.effortGroup || '').trim()).filter(Boolean))].map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                  <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                    Agrupa plataformas en una misma columna de horas. Ej: LATAM y BRAZIL → grupo "LATAM".
                    Elige uno ya existente de la lista para no crear uno nuevo por error de tipeo.
                  </small>
                </div>

                {/* Tasa de Esfuerzo a nivel de plataforma (solo para logicas sin categorías propias) */}
                {(formData.logica === 'logica_comerciales' || formData.logica === 'logica_bp_i' || formData.logica === 'logica_por_duracion' || formData.logica === 'logica_youtube') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                      ⚡ Tasa de Esfuerzo — obligatoria (1 = 100%, 1.5 = 150%, 0.25 = 25%)
                    </label>
                    <input
                      {...RATE_INPUT_PROPS}
                      value={shownRate(formData.platformEffortRate)}
                      onChange={(e) => setFormData({ ...formData, platformEffortRate: rateFromInput(e.target.value) })}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.875rem', width: '120px' }}
                    />
                    <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                      Multiplica las horas calculadas. Ej: 1.5 = cada hora real cuenta como 1.5h de esfuerzo.
                    </small>
                  </div>
                )}

                {/* Tasas de plataformas con versiones: viven en cada categoría. Se muestran y
                    editan aquí para no tener que ir a 📂 Categorías; se guardan en la categoría. */}
                {editingId && CATEGORY_RATE_LOGICAS.includes(formData.logica) && (() => {
                  const platCats = categories
                    .filter((c) => String(c.platformId) === String(editingId))
                    .sort((a, b) => (Number(a.duration) || 0) - (Number(b.duration) || 0));
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                        ⚡ Tasas de Esfuerzo (una por categoría) — obligatorias (1 = 100%)
                      </label>
                      {platCats.length === 0 ? (
                        <small style={{ color: '#92400e' }}>
                          Esta plataforma no tiene categorías todavía. Créalas en 📂 Categorías.
                        </small>
                      ) : (
                        <table className="library-table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th>Categoría</th><th>Duración</th><th>Tasa</th>
                              {formData.logica === 'logica_duracion_categorias' && <th>Tasa reproceso</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {platCats.map((c) => {
                              const key = String(c.id);
                              const value = key in catRateEdits ? catRateEdits[key] : shownRate(c.effortRate);
                              return (
                                <tr key={key}>
                                  <td>{c.name}</td>
                                  <td>{c.duration ? `${c.duration} min` : '—'}</td>
                                  <td>
                                    <input
                                      {...RATE_INPUT_PROPS}
                                      value={value}
                                      onChange={(e) => setCatRateEdits({ ...catRateEdits, [key]: e.target.value })}
                                      style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', width: '90px' }}
                                    />
                                  </td>
                                  {formData.logica === 'logica_duracion_categorias' && (
                                    <td>
                                      <input
                                        {...RATE_INPUT_PROPS}
                                        value={`R:${key}` in catRateEdits ? catRateEdits[`R:${key}`] : shownRate(c.reprocessRate)}
                                        onChange={(e) => setCatRateEdits({ ...catRateEdits, [`R:${key}`]: e.target.value })}
                                        style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #fde68a', background: '#fffbeb', width: '90px' }}
                                      />
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                        Es la misma tasa que ves en 📂 Categorías: si la cambias aquí, cambia allá
                        (y en todos los reportes).
                      </small>
                    </div>
                  );
                })()}

                {/* Campos extra solo para logica_sin_version */}
                {formData.logica === 'logica_sin_version' && (
                  <>
                    <small style={{ color: '#64748b', fontSize: '0.8rem', margin: '8px 0' }}>
                      ℹ️ Esta lógica clasifica por columna SEASON: SEASON ≠ 0 → serie, SEASON = 0 o vacío → película.
                      El sistema usa la POSICIÓN (siempre serie primero, película segundo) — por eso estas dos
                      casillas son fijas: no se pueden eliminar ni reordenar, para que nunca se pueda invertir
                      cuál es cuál.
                    </small>

                    {/* Dos casillas fijas: serie primero, película segundo. Sin botón de eliminar/reordenar. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '0.75rem 0', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {[
                        { idx: 0, label: '🎬 Categoría para SERIES (SEASON ≠ 0)', placeholder: 'Ej: serie (45 min)' },
                        { idx: 1, label: '🎥 Categoría para PELÍCULAS (SEASON = 0 o vacío)', placeholder: 'Ej: pelicula (120 min)' },
                      ].map(({ idx, label, placeholder }) => {
                        const rawCat = (formData.categorias || [])[idx];
                        // Normalizar formato antiguo (string) a objeto al renderizar
                        const catObj = rawCat || { key: '', duration: '', effortRate: null };
                        const updateSlot = (patch) => {
                          const cats = [...(formData.categorias || [])];
                          while (cats.length <= idx) cats.push({ key: '', duration: '', effortRate: null });
                          cats[idx] = { ...catObj, ...patch };
                          setFormData({ ...formData, categorias: cats });
                        };
                        return (
                          <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                                {label}
                              </label>
                              <input
                                type="text"
                                placeholder={placeholder}
                                value={catObj.key || ''}
                                onChange={(e) => updateSlot({ key: e.target.value })}
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
                                placeholder="Requerido"
                                value={catObj.duration || ''}
                                onChange={(e) => updateSlot({ duration: e.target.value ? parseInt(e.target.value, 10) : '' })}
                                style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: `1px solid ${catObj.duration ? '#cbd5e1' : '#fca5a5'}`, fontSize: '0.85rem' }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '80px' }}>
                              <label style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 500 }}>
                                ⚡ Tasa
                              </label>
                              <input
                                {...RATE_INPUT_PROPS}
                                value={shownRate(catObj.effortRate)}
                                onChange={(e) => updateSlot({ effortRate: rateFromInput(e.target.value) })}
                                style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #fde68a', fontSize: '0.85rem', background: '#fefce8' }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(!(formData.categorias || [])[0]?.duration || !(formData.categorias || [])[1]?.duration) && (
                      <small style={{ color: '#b91c1c' }}>
                        ⚠️ Ambas categorías necesitan una duración mayor a 0 — si falta, esas filas se descartarán del reporte (sin adivinar un número).
                      </small>
                    )}
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
                    Determina en qué categoría cae cada fila del reporte (debe coincidir
                    con la duración real de la versión).
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
                    ⚡ Tasa de Esfuerzo — obligatoria (1 = 100%, 1.5 = 150%, 0.25 = 25%)
                  </label>
                  <input
                    {...RATE_INPUT_PROPS}
                    value={shownRate(formData.effortRate)}
                    onChange={(e) => setFormData({ ...formData, effortRate: rateFromInput(e.target.value) })}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '140px' }}
                  />
                  <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                    Multiplica el conteo de assets de esta categoría para calcular horas de esfuerzo del editor.
                  </small>
                </div>
                {platforms.find((p) => String(p.id) === String(formData.platformId))?.logica === 'logica_duracion_categorias' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 500 }}>
                      🔁 Tasa de reproceso — obligatoria (filas con REPROSS en VERSION)
                    </label>
                    <input
                      {...RATE_INPUT_PROPS}
                      value={shownRate(formData.reprocessRate)}
                      onChange={(e) => setFormData({ ...formData, reprocessRate: rateFromInput(e.target.value) })}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #fde68a', background: '#fffbeb', fontSize: '0.9rem', width: '140px' }}
                    />
                  </div>
                )}
              </>
            )}

            {activeTab === 'versions' && (() => {
              // Orden: 1) plataforma → 2) nombre (su número final da la duración) → 3) categoría
              // de esa duración. La categoría (serie o película) la elige el usuario.
              const nameCheck = checkVersionSuffix(formData.name || '', suffixRules);
              const numberDuration = nameCheck.duration;
              const versionPlatforms = platforms.filter((p) => p.logica === 'logica_de_versiones'
                || p.logica === 'iberia_especial' || String(p.id) === String(formData.platformId));
              const selectedPlatform = platforms.find((p) => String(p.id) === String(formData.platformId));
              const platformCats = selectedPlatform
                ? categories.filter((c) => String(c.platformId) === String(selectedPlatform.id))
                : [];
              const allowedCats = numberDuration
                ? platformCats.filter((c) => Number(c.duration) === numberDuration)
                : platformCats;
              const subPlatform = detectSubPlatformFromName(formData.name);
              const newCatDuration = numberDuration || parseInt(inlineNewCat.duration, 10) || 0;
              const newCatBase = inlineNewCat.name.trim().replace(/\s*\(?\d+\s*min\)?\s*$/i, '');
              const stepLabel = { fontSize: '0.82rem', color: '#334155', fontWeight: 700, marginTop: '0.3rem' };
              const badge = (bg, border, color) => ({
                display: 'flex', alignItems: 'center', gap: '0.4rem', background: bg, border: `1px solid ${border}`,
                borderRadius: '6px', padding: '0.45rem 0.75rem', fontSize: '0.85rem', color,
              });
              const createInlineCategory = () => {
                const name = `${newCatBase} (${newCatDuration} min)`;
                if (categories.some((c) => String(c.platformId) === String(selectedPlatform.id)
                  && String(c.name).trim().toLowerCase() === name.toLowerCase())) {
                  alert(`🚫 ${selectedPlatform.name} ya tiene la categoría "${name}".`);
                  return;
                }
                libraryStore.getState().addCategory({
                  name, duration: newCatDuration, color: '#667eea',
                  platformId: selectedPlatform.id, effortRate: parseFloat(inlineNewCat.rate),
                });
                const created = libraryStore.getState().categories
                  .find((c) => c.name === name && String(c.platformId) === String(selectedPlatform.id));
                setFormData({ ...formData, categoryId: created?.id || null });
                setInlineNewCat(EMPTY_INLINE_CAT);
              };
              return (
                <>
                  {/* 1. Plataforma */}
                  <label style={stepLabel}>1. Plataforma</label>
                  <select
                    value={formData.platformId || ''}
                    onChange={(e) => {
                      setInlineNewCat(EMPTY_INLINE_CAT);
                      setFormData({ ...formData, platformId: e.target.value ? parseInt(e.target.value, 10) : null, categoryId: null });
                    }}
                  >
                    <option value="">Selecciona una plataforma</option>
                    {versionPlatforms.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  {/* 2. Nombre de la versión */}
                  <label style={stepLabel}>2. Nombre de la versión</label>
                  <input
                    type="text"
                    placeholder="Ej: BRA_SAP_CC_SQZ_HD 5"
                    value={formData.name || ''}
                    onChange={(e) => {
                      const nombre = e.target.value;
                      const dur = checkVersionSuffix(nombre, suffixRules).duration;
                      const current = categories.find((c) => c.id === formData.categoryId);
                      const keepCategory = current && (!dur || Number(current.duration) === dur);
                      setFormData({ ...formData, name: nombre, categoryId: keepCategory ? formData.categoryId : null });
                    }}
                  />
                  {formData.name && nameCheck.invalidSuffix !== null && (
                    <div style={badge('#fef2f2', '#fecaca', '#b91c1c')}>
                      <span style={{ fontSize: '1.1rem' }}>🚫</span>
                      <span>
                        El número final <strong>{nameCheck.invalidSuffix}</strong> no está en la tabla
                        ({describeSuffixRules(suffixRules)}). No se puede crear esta versión: si ese número
                        existe, agrégalo primero en "Números finales de versión" (pestaña Versiones).
                      </span>
                    </div>
                  )}
                  {formData.name && nameCheck.invalidSuffix === null && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={numberDuration ? badge('#eff6ff', '#bfdbfe', '#1d4ed8') : badge('#f8fafc', '#e2e8f0', '#64748b')}>
                        <span>⏱</span>
                        <span>
                          {numberDuration
                            ? <><strong>{numberDuration} min</strong> — por su número final {suffixNumber(formData.name)}</>
                            : 'Sin número final: la duración será la de la categoría que elijas'}
                        </span>
                      </div>
                      {subPlatform && (
                        <div style={subPlatform === 'LATAM' ? badge('#f0fdf4', '#bbf7d0', '#15803d') : badge('#fefce8', '#fde68a', '#92400e')}>
                          <span>{subPlatform === 'LATAM' ? '🌎' : '🇧🇷'}</span>
                          <span><strong>{subPlatform}</strong> — por el prefijo del nombre</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. Categoría (solo las de esa duración) */}
                  <label style={stepLabel}>
                    3. Categoría {numberDuration ? `de ${numberDuration} min` : ''} — serie o película
                  </label>
                  {!selectedPlatform ? (
                    <small style={{ color: '#94a3b8' }}>Elige primero la plataforma (paso 1).</small>
                  ) : (
                    <select
                      value={inlineNewCat.active ? '__new__' : (formData.categoryId || '')}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setInlineNewCat({ ...EMPTY_INLINE_CAT, active: true });
                        } else {
                          setInlineNewCat(EMPTY_INLINE_CAT);
                          setFormData({ ...formData, categoryId: e.target.value ? parseInt(e.target.value, 10) : null });
                        }
                      }}
                    >
                      <option value="">
                        {allowedCats.length
                          ? 'Selecciona la categoría'
                          : `${selectedPlatform.name} no tiene categorías${numberDuration ? ` de ${numberDuration} min` : ''}: créala abajo`}
                      </option>
                      {allowedCats.map((c) => (
                        <option key={c.id} value={c.id}>{buildCategoryLabel(c)}</option>
                      ))}
                      <option value="__new__">➕ Crear categoría{numberDuration ? ` de ${numberDuration} min` : ''}…</option>
                    </select>
                  )}

                  {/* Crear la categoría aquí mismo: nombre base + duración + tasa (obligatoria) */}
                  {inlineNewCat.active && selectedPlatform && (
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px',
                      padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    }}>
                      <strong style={{ fontSize: '0.85rem', color: '#15803d' }}>✨ Nueva categoría de {selectedPlatform.name}</strong>
                      <input
                        type="text"
                        placeholder="Nombre: serie o película"
                        value={inlineNewCat.name}
                        onChange={(e) => setInlineNewCat({ ...inlineNewCat, name: e.target.value })}
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.875rem' }}
                        autoFocus
                      />
                      {numberDuration ? (
                        <small style={{ color: '#166534' }}>Duración: <strong>{numberDuration} min</strong> (la del número final)</small>
                      ) : (
                        <input
                          type="number" min="1" step="1"
                          placeholder="Duración (min)"
                          value={inlineNewCat.duration}
                          onChange={(e) => setInlineNewCat({ ...inlineNewCat, duration: e.target.value })}
                          style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.875rem' }}
                        />
                      )}
                      <label style={{ fontSize: '0.8rem', color: '#475569' }}>⚡ Tasa de esfuerzo — obligatoria (1 = 100%)</label>
                      <input
                        {...RATE_INPUT_PROPS}
                        value={inlineNewCat.rate ?? ''}
                        onChange={(e) => setInlineNewCat({ ...inlineNewCat, rate: rateFromInput(e.target.value) })}
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.875rem', width: '120px' }}
                      />
                      {newCatBase && newCatDuration > 0 && (
                        <small style={{ color: '#4f46e5' }}>Se creará como: <strong>{newCatBase} ({newCatDuration} min)</strong></small>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          disabled={!newCatBase || !(newCatDuration > 0) || !isValidRate(inlineNewCat.rate)}
                          onClick={createInlineCategory}
                        >
                          ✔ Crear categoría
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => setInlineNewCat(EMPTY_INLINE_CAT)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {formData.categoryId && getVersionCategoryConflicts({
                    ...formData, duration: numberDuration ?? formData.duration,
                  }).length > 0 && (
                    <div style={badge('#fef2f2', '#fecaca', '#b91c1c')}>
                      🚫 No coincide — no se podrá guardar:{' '}
                      {getVersionCategoryConflicts({ ...formData, duration: numberDuration ?? formData.duration }).join(' ')}
                    </div>
                  )}
                </>
              );
            })()}

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

      {/* Asistente de alta de plataforma nueva — nada se guarda hasta el paso final */}
      {showWizard && (
        <PlatformWizard
          onCancel={() => setShowWizard(false)}
          onComplete={({ name, logica }) => {
            setShowWizard(false);
            setSavedPlatformInfo({ name, logica });
          }}
        />
      )}
    </div>
  );
}

export default LibraryView;

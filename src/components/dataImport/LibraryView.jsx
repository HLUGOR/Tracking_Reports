/**
 * LibraryView.jsx - Gestión de Librería de Datos
 * Permite crear/editar plataformas, categorías, versiones, duraciones
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import '../../styles/LibraryView.css';
import libraryStore from '../../store/libraryStore';
import { LOGICA_FAMILIES, familyOf } from '../../core/reportEngine/logicaFamilies';
import { DEFAULT_RATE, isValidRate, RATE_INPUT_PROPS, rateFromInput, rateAsEffortPct } from '../../core/utils/rates';
import { effortCode, platformEffortCode, PLATFORM_RATE_KEY } from '../../core/reportEngine/PlatformReportsEngine';
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

// Etiqueta de campo con un botón "i": la explicación solo se ve al pulsarlo.
function FieldLabel({ text, info, strong = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: '3px' }}>
      <span style={{ fontSize: strong ? '0.88rem' : '0.8rem', color: strong ? '#1e293b' : '#475569', fontWeight: strong ? 700 : 600 }}>
        {text}
      </span>
      {info && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={open ? 'Ocultar información' : 'Ver información'}
          style={{
            marginLeft: '6px', width: '18px', height: '18px', padding: 0, borderRadius: '50%',
            border: '1px solid #a5b4fc', background: open ? '#e0e7ff' : '#fff', color: '#4f46e5',
            fontSize: '0.7rem', fontWeight: 700, lineHeight: '16px', cursor: 'pointer', verticalAlign: 'middle',
          }}
        >i</button>
      )}
      {open && (
        <div style={{
          marginTop: '4px', fontSize: '0.78rem', color: '#475569', background: '#f8fafc',
          border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.45rem 0.6rem', lineHeight: 1.5,
        }}>
          {info}
        </div>
      )}
    </div>
  );
}

function LibraryView() {
  const [activeTab, setActiveTab] = useState('platforms'); // platforms, categories, versions
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});
  // Formulario abierto: por defecto el de la pestaña activa; las categorías se crean y editan
  // desde su plataforma (pestaña Plataformas), así que su formulario se abre con formKind.
  const [formKind, setFormKind] = useState(null);
  const formTab = formKind || activeTab;
  useEffect(() => { if (!showForm) setFormKind(null); }, [showForm]);
  // Plataformas desplegadas (muestran sus categorías y tasas)
  const [expandedPlatforms, setExpandedPlatforms] = useState({});
  const togglePlatform = (id) => setExpandedPlatforms((prev) => ({ ...prev, [id]: !prev[id] }));

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

  // Sub-tab dentro de Categorías: 'versiones' (logica_de_versiones/iberia) | 'propias' (sin_version/comerciales/etc.)

  // Búsqueda en el tab Versiones
  const [versionSearch, setVersionSearch] = useState('');

  const platforms = libraryStore((state) => state.platforms);
  const categories = libraryStore((state) => state.categories);
  const versions = libraryStore((state) => state.versions);
  const columnMappings = libraryStore((state) => state.columnMappings);
  const editors = libraryStore((state) => state.editors);
  const suffixRules = libraryStore((state) => state.suffixRules);

  // ===== NÚMEROS FINALES DE VERSIÓN → DURACIÓN (un número por fila) =====
  const [suffixEditing, setSuffixEditing] = useState(false);
  // Campo "agregar número" de cada duración: { [duración]: texto } y fila de duración nueva
  const [suffixAddInputs, setSuffixAddInputs] = useState({});
  const [newSuffixGroup, setNewSuffixGroup] = useState({ duration: '', number: '' });
  const versionsWithNumber = (n) => versions.filter((v) => suffixNumber(v.name) === n).length;
  const addSuffixNumber = (number, duration) => {
    const rule = { number: parseInt(number, 10), duration: parseInt(duration, 10) };
    const problem = suffixRuleProblem(rule, suffixRules);
    if (problem) { alert(`🚫 ${problem}`); return false; }
    libraryStore.getState().addSuffixRule(rule);
    return true;
  };
  const handleDeleteSuffixRule = (rule) => {
    const inUse = versionsWithNumber(rule.number);
    const msg = inUse > 0
      ? `¿Quitar ${rule.number} segmentos (${rule.duration} min)?\n\nHay ${inUse} versiones registradas con esa cantidad de segmentos: siguen contando (están registradas), pero no se podrán crear nuevas con esa cantidad.`
      : `¿Quitar ${rule.number} segmentos (${rule.duration} min)?`;
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
    const usesCategoryRates = CATEGORY_RATE_LOGICAS.includes(formData.logica);
    const platCatRates = editingId && usesCategoryRates
      ? categories
        .filter((c) => String(c.platformId) === String(editingId))
        .map((c) => {
          const key = String(c.id);
          return { cat: c, rate: key in catRateEdits ? catRateEdits[key] : shownRate(c.effortRate) };
        })
      : [];
    const missingRates = [];
    if (usesPlatformRate && !isValidRate(platformRate)) missingRates.push('Tasa de Esfuerzo de la plataforma');
    if (formData.logica === 'logica_sin_version') {
      casillas.slice(0, 2).forEach((c, i) => {
        if (!isValidRate(c.effortRate)) missingRates.push(`Tasa de la casilla ${i === 0 ? 'serie' : 'película'}`);
      });
    }
    platCatRates.forEach(({ cat, rate }) => {
      if (!isValidRate(rate)) missingRates.push(`Tasa de la categoría "${cat.name}"`);
    });
    // Sub-tasas por EFFORT: código obligatorio y sin repetir; al menos una tasa; las
    // celdas vacías son "no aplica" (esa duración con ese código va a la Auditoría).
    const effortRates = (formData.effortRates || []).map((e) => ({
      code: effortCode(e.code),
      rates: Object.fromEntries(Object.entries(e.rates || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => [k, parseFloat(v)])),
    }));
    const effortProblems = [];
    const seenCodes = new Set();
    effortRates.forEach((e, i) => {
      const same = platformEffortCode(e.code, formData);
      if (!e.code) effortProblems.push(`Sub-tasa ${i + 1}: falta el código de EFFORT`);
      else if (!same) effortProblems.push(`EFFORT "${e.code}" es el nombre de la plataforma: eso ya es la tasa estándar`);
      else if (seenCodes.has(same)) effortProblems.push(`EFFORT "${e.code}" está repetido`);
      seenCodes.add(same);
      const values = Object.values(e.rates);
      if (values.length === 0) effortProblems.push(`EFFORT "${e.code || i + 1}": escribe al menos una tasa`);
      if (values.some((v) => !isValidRate(v))) effortProblems.push(`EFFORT "${e.code || i + 1}": las tasas deben ser mayores que 0`);
    });
    if (effortProblems.length > 0) {
      alert(`🚫 No se puede guardar — sub-tasas por EFFORT:\n\n• ${effortProblems.join('\n• ')}`);
      return;
    }

    if (missingRates.length > 0) {
      alert(`🚫 No se puede guardar: falta la tasa (debe ser mayor que 0; 1 = estándar).\n\n• ${missingRates.join('\n• ')}`);
      return;
    }

    const normalizedData = {
      ...formData,
      categorias: formData.logica === 'logica_sin_version' ? casillas : (formData.categorias || []),
      effortRates,
      displayName: String(formData.displayName || '').trim(),
      platformEffortRate: usesPlatformRate ? parseFloat(platformRate) : (formData.platformEffortRate ?? null),
    };

    if (editingId) {
      // Tasas de las categorías de esta plataforma (con versiones): se guardan EN la categoría
      platCatRates.forEach(({ cat, rate }) => {
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
    // Sub-tasas por EFFORT: vacío = no aplica; si se escribe, tiene que ser mayor que 0
    const effortSubRates = formData.effortSubRates || {};
    const badSub = Object.entries(effortSubRates).filter(([, v]) => v !== '' && v !== null && v !== undefined && !isValidRate(v));
    if (badSub.length > 0) {
      alert(`🚫 No se puede guardar: la sub-tasa de ${badSub.map(([c]) => c).join(', ')} debe ser mayor que 0 (o dejarse vacía si no aplica).`);
      return;
    }
    // La tasa debe quedar escrita (1 = estándar)
    const catRate = shownRate(formData.effortRate);
    if (!isValidRate(catRate)) {
      alert('🚫 No se puede guardar: falta la Tasa de Esfuerzo (debe ser mayor que 0; 1 = estándar).');
      return;
    }
    formData.effortRate = parseFloat(catRate);
    const catPlatformLogica = platforms.find((p) => String(p.id) === String(formData.platformId))?.logica;
    if (catPlatformLogica === 'logica_duracion_categorias') {
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
    }

    const isNew = !editingId;
    // La categoría no guarda las sub-tasas: van en la plataforma (effortRates)
    const { effortSubRates: _subRates, ...categoryData } = formData;

    if (editingId) {
      libraryStore.getState().updateCategory(editingId, categoryData);
    } else {
      libraryStore.getState().addCategory(categoryData);
    }

    // Sub-tasas → plataforma, en la clave de esta categoría (misma que usa Editar plataforma)
    {
      const st = libraryStore.getState();
      const savedCat = editingId
        ? st.categories.find((c) => c.id === editingId)
        : [...st.categories].reverse().find((c) => c.name === categoryData.name && String(c.platformId) === String(categoryData.platformId));
      const platform = st.platforms.find((x) => String(x.id) === String(categoryData.platformId));
      if (savedCat && platform && (platform.effortRates || []).length > 0) {
        const key = String(savedCat.id);
        const nextEfforts = platform.effortRates.map((e) => {
          const v = effortSubRates[e.code];
          const { [key]: _old, ...rest } = e.rates || {};
          return { ...e, rates: v === '' || v === null || v === undefined ? rest : { ...rest, [key]: parseFloat(v) } };
        });
        st.updatePlatform(platform.id, { effortRates: nextEfforts });
      }
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

  const openNewCategory = (platform) => {
    setFormKind('categories');
    setEditingId(null);
    setFormData({ platformId: platform.id, effortRate: DEFAULT_RATE });
    setShowForm(true);
  };
  const openEditCategory = (category) => {
    const platform = platforms.find((x) => String(x.id) === String(category.platformId));
    // Sub-tasas por EFFORT de esta categoría (viven en la plataforma): { código: tasa }
    const effortSubRates = Object.fromEntries((platform?.effortRates || [])
      .map((e) => [e.code, e.rates?.[String(category.id)] ?? '']));
    setFormKind('categories');
    setEditingId(category.id);
    setFormData({ ...category, effortSubRates });
    setShowForm(true);
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
      alert(`🚫 No se puede crear esta versión.\n\nEl nombre indica ${invalidSuffix} segmentos y esa cantidad no está en la tabla de segmentos (${describeSuffixRules(suffixRules)}).\n\nSi existe, agrégala primero en Librerías → Versiones → "Segmentos".`);
      return;
    }

    // Duración: la de sus segmentos (número final del nombre); si no lo tiene (ej. IBERIA), la de la categoría
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

  // Filas de tasa de una plataforma: [{ key, label, duration, rate }] en orden de duración.
  // key = la misma clave que usan las sub-tasas por EFFORT.
  const platformRateRows = (p) => {
    if (CATEGORY_RATE_LOGICAS.includes(p.logica)) {
      return categories
        .filter((c) => String(c.platformId) === String(p.id))
        .sort((a, b) => (Number(a.duration) || 0) - (Number(b.duration) || 0))
        .map((c) => ({
          key: String(c.id), label: categoryBaseName(c.name), duration: Number(c.duration) || null,
          rate: c.effortRate,
          cat: c,
        }));
    }
    if (p.logica === 'logica_sin_version') {
      return (p.categorias || []).slice(0, 2).map((c) => ({
        key: c.key, label: c.key, duration: Number(c.duration) || null, rate: c.effortRate,
      }));
    }
    return [{ key: PLATFORM_RATE_KEY, label: 'Tasa única', duration: null, rate: p.platformEffortRate }];
  };
  // Nombre de la categoría sin la duración (ya está en su columna): "pelicula (120 min)" → "pelicula"
  const categoryBaseName = (name) => String(name || '').replace(/\s*\(?\d+\s*min\)?\s*$/i, '').trim() || String(name || '');
  // Tasa para mostrar: el número y su % de TQC debajo; "—" si no hay
  const rateView = (v, missingText = '—') => (isValidRate(v)
    ? <><strong style={{ color: '#92400e' }}>{Number(v)}</strong><div style={{ fontSize: '0.7rem', color: '#64748b' }}>{rateAsEffortPct(v)}</div></>
    : <span style={{ color: '#94a3b8' }}>{missingText}</span>);
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
                        <>Sus categorías se ven al desplegarla (▶) en la lista. Luego registra sus versiones en <strong>📦 Versiones</strong>.</>
                      )}
                      {l === 'logica_duracion_categorias' && (
                        <>Sus categorías se ven al desplegarla (▶) en la lista: la columna DURATION elige la categoría por su duración.</>
                      )}
                    </p>
                  </div>
                  {CATEGORY_RATE_LOGICAS.includes(l) && (
                    <button
                      onClick={() => {
                        const created = platforms.find((x) => x.name === savedPlatformInfo.name);
                        setSavedPlatformInfo(null);
                        if (created) setExpandedPlatforms((prev) => ({ ...prev, [created.id]: true }));
                      }}
                      style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #d97706', background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    >
                      Ver sus categorías ▼
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
                      <th style={{ width: '32px' }}></th>
                      <th>Plataforma</th>
                      <th>Lógica</th>
                      <th>Categorías</th>
                      <th>Configuración</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platforms.map((p) => {
                      // Lo que le falta para poder calcular (misma regla que "Validar librería")
                      const problems = platformProblems(p, categories);
                      const isOpen = !!expandedPlatforms[p.id];
                      const openFix = () => {
                        setSavedPlatformInfo(null);
                        if (problems.includes('categorías')) {
                          // Sin categorías: se crean al desplegar la plataforma
                          setExpandedPlatforms((prev) => ({ ...prev, [p.id]: true }));
                        } else {
                          setEditingId(p.id);
                          setFormData(p);
                          setShowForm(true);
                        }
                      };
                      const fam = familyOf(p.logica);
                      const isCatLogic = CATEGORY_RATE_LOGICAS.includes(p.logica);
                      const isDurCat = p.logica === 'logica_duracion_categorias';
                      const rateRows = platformRateRows(p);
                      const efforts = p.effortRates || [];
                      const shownName = p.displayName || p.name;
                      const group = String(p.effortGroup || '').trim();
                      const catCount = isCatLogic ? rateRows.length : null;
                      return (
                      <React.Fragment key={p.id}>
                      <tr style={isOpen ? { background: '#f8fafc' } : undefined}>
                        <td>
                          <button type="button" onClick={() => togglePlatform(p.id)} title={isOpen ? 'Ocultar categorías' : 'Ver categorías y tasas'}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}>
                            {isOpen ? '▼' : '▶'}
                          </button>
                        </td>
                        <td style={{ cursor: 'pointer' }} onClick={() => togglePlatform(p.id)}>
                          <strong>{shownName}</strong>
                          {p.displayName && p.displayName !== p.name && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>en el input: {p.name}</div>
                          )}
                          {group && group.toUpperCase() !== shownName.toUpperCase() && group.toUpperCase() !== p.name.toUpperCase() && (
                            <div style={{ fontSize: '0.72rem', color: '#15803d' }}>suma en: {group}</div>
                          )}
                        </td>
                        <td title={p.logica} style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {fam ? fam.title : p.logica}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {isCatLogic
                            ? `${catCount} ${catCount === 1 ? 'categoría' : 'categorías'}`
                            : p.logica === 'logica_sin_version' ? 'serie y película' : 'tasa única'}
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
                            title="Editar plataforma y sus tasas"
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
                            title="Eliminar plataforma"
                            onClick={() => handleDeletePlatform(p.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td></td>
                          <td colSpan={5} style={{ background: '#f8fafc', padding: '0.5rem 0.75rem 0.9rem' }}>
                            {rateRows.length === 0 ? (
                              <div style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: '0.5rem' }}>
                                {shownName} no tiene categorías todavía.
                              </div>
                            ) : (
                              <table className="library-table" style={{ margin: '0 0 0.5rem', background: '#fff' }}>
                                <thead>
                                  <tr>
                                    <th rowSpan={efforts.length ? 2 : 1}>Categoría</th>
                                    <th rowSpan={efforts.length ? 2 : 1}>Duración</th>
                                    <th rowSpan={efforts.length ? 2 : 1} style={{ textAlign: 'center' }}>Tasa estándar</th>
                                    {efforts.length > 0 && (
                                      <th colSpan={efforts.length} style={{ background: '#ede9fe', color: '#5b21b6', textAlign: 'center' }}>Sub-tasas de esfuerzo (EFFORT)</th>
                                    )}
                                    {isCatLogic && !isDurCat && <th rowSpan={efforts.length ? 2 : 1}>Versiones</th>}
                                    {isCatLogic && <th rowSpan={efforts.length ? 2 : 1}></th>}
                                  </tr>
                                  {efforts.length > 0 && (
                                    <tr>
                                      {efforts.map((e) => (
                                        <th key={e.code} style={{ background: '#f5f3ff', color: '#6d28d9', textAlign: 'center' }}>{e.code}</th>
                                      ))}
                                    </tr>
                                  )}
                                </thead>
                                <tbody>
                                  {rateRows.map((r) => (
                                    <tr key={r.key}>
                                      <td>{r.label}</td>
                                      <td>{r.duration ? `${r.duration} min` : '—'}</td>
                                      <td style={{ textAlign: 'center' }}>{rateView(r.rate, '⚠ falta')}</td>
                                      {efforts.map((e) => (
                                        <td key={e.code} style={{ background: '#faf5ff', textAlign: 'center' }}>{rateView(e.rates?.[r.key])}</td>
                                      ))}
                                      {isCatLogic && !isDurCat && (
                                        <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                                          {versions.filter((v) => String(v.categoryId) === r.key).length}
                                        </td>
                                      )}
                                      {isCatLogic && (
                                        <td className="actions">
                                          <button className="btn-icon btn-edit" title="Editar categoría" onClick={() => openEditCategory(r.cat)}>✏️</button>
                                          <button className="btn-icon btn-delete" title="Eliminar categoría" onClick={() => handleDeleteCategory(r.cat.id)}>🗑️</button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {isCatLogic && (
                                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => openNewCategory(p)}>
                                  ➕ Nueva categoría para {shownName}
                                </button>
                              )}
                              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                                onClick={() => { setEditingId(p.id); setFormData(p); setShowForm(true); }}>
                                ✏️ Editar tasas y sub-tasas
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
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

            {/* Segmentos del material → duración, agrupados por duración */}
            {(() => {
              const rules = normalizeSuffixRules(suffixRules);
              const groups = [...new Set(rules.map((r) => r.duration))].sort((a, b) => a - b)
                .map((duration) => ({ duration, rules: rules.filter((r) => r.duration === duration) }));
              const versionPlats = platforms.filter((p) => p.logica === 'logica_de_versiones' || p.logica === 'iberia_especial');
              const withoutCategory = (duration) => !versionPlats.some((p) => categories.some(
                (c) => String(c.platformId) === String(p.id) && Number(c.duration) === Number(duration)));
              const chip = { display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eef2ff', border: '1px solid #c7d2fe', color: '#3730a3', borderRadius: '12px', padding: '1px 9px', fontWeight: 700, fontSize: '0.82rem', marginRight: '5px' };
              return (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '260px' }}>
                      <FieldLabel
                        strong
                        text="🔢 Segmentos → duración"
                        info={<>
                          El número al final del nombre de una versión es la cantidad de <strong>segmentos</strong> del material (ej. "LAT_ORI_HD <strong>3</strong>" = 3 segmentos), y cada cantidad de segmentos tiene una duración.
                          Al registrar una versión solo se ofrecen las categorías de esa duración (serie o película, la eliges tú).
                          Una cantidad de segmentos que no esté aquí no se puede registrar, y la Auditoría lo avisa.
                        </>}
                      />
                      {!suffixEditing && (
                        <div style={{ fontSize: '0.85rem', color: '#334155' }}>{describeSuffixRules(suffixRules) || 'Sin segmentos configurados'}</div>
                      )}
                    </div>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                      onClick={() => setSuffixEditing(!suffixEditing)}>
                      {suffixEditing ? '✔ Listo' : '✏️ Editar'}
                    </button>
                  </div>

                  {suffixEditing && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {groups.map((g) => (
                        <div key={g.duration} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                          <span style={{ width: '72px', fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{g.duration} min</span>
                          <span style={{ color: '#94a3b8', marginRight: '4px' }}>→</span>
                          {g.rules.map((r) => (
                            <span key={r.id} style={chip}>
                              {r.number}
                              <button type="button" title={`Quitar ${r.number} segmentos`} onClick={() => handleDeleteSuffixRule(r)}
                                style={{ border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}>×</button>
                            </span>
                          ))}
                          <input type="number" min="1" step="1" placeholder="nº"
                            value={suffixAddInputs[g.duration] || ''}
                            onChange={(e) => setSuffixAddInputs({ ...suffixAddInputs, [g.duration]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.target.value && addSuffixNumber(e.target.value, g.duration)) {
                                setSuffixAddInputs({ ...suffixAddInputs, [g.duration]: '' });
                              }
                            }}
                            style={{ width: '56px', padding: '0.15rem 0.35rem', fontSize: '0.8rem' }} />
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}
                            disabled={!suffixAddInputs[g.duration]}
                            onClick={() => {
                              if (addSuffixNumber(suffixAddInputs[g.duration], g.duration)) {
                                setSuffixAddInputs({ ...suffixAddInputs, [g.duration]: '' });
                              }
                            }}>➕</button>
                          {withoutCategory(g.duration) && (
                            <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>⚠ ninguna plataforma tiene categoría de {g.duration} min</span>
                          )}
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.45rem', fontSize: '0.82rem', color: '#475569' }}>
                        Duración nueva:
                        <input type="number" min="1" step="1" placeholder="min" value={newSuffixGroup.duration}
                          onChange={(e) => setNewSuffixGroup({ ...newSuffixGroup, duration: e.target.value })}
                          style={{ width: '64px', padding: '0.15rem 0.35rem' }} />
                        con segmentos
                        <input type="number" min="1" step="1" placeholder="nº" value={newSuffixGroup.number}
                          onChange={(e) => setNewSuffixGroup({ ...newSuffixGroup, number: e.target.value })}
                          style={{ width: '56px', padding: '0.15rem 0.35rem' }} />
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}
                          disabled={!newSuffixGroup.duration || !newSuffixGroup.number}
                          onClick={() => {
                            if (addSuffixNumber(newSuffixGroup.number, newSuffixGroup.duration)) setNewSuffixGroup({ duration: '', number: '' });
                          }}>➕ Agregar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
          <div className={`form-modal${formTab === 'platforms' ? ' form-modal-wide' : ''}`}>
            <h3>
              {formTab === 'platforms'
                ? `Editar plataforma${formData.name ? ` — ${formData.displayName || formData.name}` : ''}`
                : editingId
                  ? `Editar ${formTab === 'categories' ? 'categoría' : 'versión'}${formTab === 'categories' && formData.name ? ` — ${formData.name}` : ''}`
                  : `${formTab === 'categories' ? 'Nueva categoría' : 'Nueva versión'}`}
            </h3>

            {formTab === 'platforms' && (() => {
              const fam = familyOf(formData.logica);
              const opt = fam?.options.find((o) => o.value === formData.logica);
              const isCatLogic = CATEGORY_RATE_LOGICAS.includes(formData.logica);
              const isSinVersion = formData.logica === 'logica_sin_version';
              const isDurCat = formData.logica === 'logica_duracion_categorias';
              const efforts = formData.effortRates || [];
              const setEfforts = (next) => setFormData({ ...formData, effortRates: next });
              const setEffortRate = (i, key, value) => setEfforts(efforts.map((e, j) => (j === i
                ? { ...e, rates: { ...(e.rates || {}), [key]: rateFromInput(value) } } : e)));
              // Casillas de logica_sin_version (serie = 1ª, película = 2ª). Si cambia el nombre de
              // una casilla, sus sub-tasas por EFFORT se mueven a la clave nueva.
              const updateCasilla = (idx, patch) => {
                const cats = [...(formData.categorias || [])];
                while (cats.length <= idx) cats.push({ key: '', duration: '', effortRate: null });
                const oldKey = cats[idx].key;
                cats[idx] = { ...cats[idx], ...patch };
                let nextEfforts = formData.effortRates || [];
                if (patch.key !== undefined && oldKey && oldKey !== patch.key) {
                  nextEfforts = nextEfforts.map((e) => {
                    if (!e.rates || !(oldKey in e.rates)) return e;
                    const { [oldKey]: moved, ...rest } = e.rates;
                    return { ...e, rates: { ...rest, [patch.key]: moved } };
                  });
                }
                setFormData({ ...formData, categorias: cats, effortRates: nextEfforts });
              };
              let rateRows = [];
              if (isCatLogic) {
                rateRows = categories
                  .filter((c) => String(c.platformId) === String(editingId))
                  .sort((a, b) => (Number(a.duration) || 0) - (Number(b.duration) || 0))
                  .map((c) => {
                    const key = String(c.id);
                    return {
                      key, name: categoryBaseName(c.name), duration: c.duration,
                      std: key in catRateEdits ? catRateEdits[key] : shownRate(c.effortRate),
                      setStd: (v) => setCatRateEdits({ ...catRateEdits, [key]: v }),
                    };
                  });
              } else if (isSinVersion) {
                rateRows = [0, 1].map((idx) => {
                  const c = (formData.categorias || [])[idx] || { key: '', duration: '', effortRate: null };
                  return {
                    key: c.key || `__casilla${idx}`, casillaIdx: idx, name: c.key, duration: c.duration,
                    std: shownRate(c.effortRate),
                    setStd: (v) => updateCasilla(idx, { effortRate: rateFromInput(v) }),
                  };
                });
              } else if (formData.logica) {
                rateRows = [{
                  key: PLATFORM_RATE_KEY, name: 'Tasa única de la plataforma', duration: null,
                  std: shownRate(formData.platformEffortRate),
                  setStd: (v) => setFormData({ ...formData, platformEffortRate: rateFromInput(v) }),
                }];
              }
              const rateCell = (value, onChange, extra = {}) => (
                <>
                  <input {...RATE_INPUT_PROPS} placeholder="—" value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)} style={{ width: '72px', padding: '0.3rem 0.4rem', ...extra }} />
                  {rateAsEffortPct(value) && <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{rateAsEffortPct(value)}</div>}
                </>
              );
              const missingCasillaDuration = isSinVersion
                && (!(formData.categorias || [])[0]?.duration || !(formData.categorias || [])[1]?.duration);
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem 1rem' }}>
                    <div>
                      <FieldLabel text="Nombre en el input" info="Es el texto de la columna PLATFORM del Excel de entrada. La app busca la plataforma por este nombre: tiene que ser igual." />
                      <input type="text" placeholder="ej. LATAM" value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })} />
                    </div>
                    <div>
                      <FieldLabel text="Nombre para mostrar" info='Opcional. Así se ve en la librería (ej. "LATAM & Brasil Networks"). No cambia cómo se busca en el input.' />
                      <input type="text" placeholder="(igual al nombre del input)" value={formData.displayName || ''}
                        onChange={(e) => setFormData({ ...formData, displayName: e.target.value })} />
                    </div>
                    <div>
                      <FieldLabel
                        text="Lógica de cálculo"
                        info={fam && opt ? <><strong>{fam.title}</strong> — {fam.desc}<br />{opt.desc}</> : 'Elige cómo se calculan los minutos de esta plataforma.'}
                      />
                      <select value={formData.logica || ''} onChange={(e) => setFormData({ ...formData, logica: e.target.value })}>
                        <option value="">— Selecciona tipo de lógica —</option>
                        {LOGICA_FAMILIES.map((family) => (
                          <optgroup key={family.key} label={`${family.title} — columna ${family.column}`}>
                            {family.options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel text="Grupo de esfuerzo" info="Nombre de la columna donde suman sus horas en el Reporte Editores. Plataformas con el mismo grupo suman juntas (ej. LATAM y BRAZIL)." />
                      <input type="text" list="effort-group-options" placeholder="ej. LATAM" value={formData.effortGroup || ''}
                        onChange={(e) => setFormData({ ...formData, effortGroup: e.target.value.toUpperCase() })} />
                      <datalist id="effort-group-options">
                        {[...new Set(platforms.map((p) => (p.effortGroup || '').trim()).filter(Boolean))].map((g) => (
                          <option key={g} value={g} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {formData.logica && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <FieldLabel
                        strong
                        text="⚡ Tasas de esfuerzo"
                        info={<>
                          Tasa = 1 + % de esfuerzo de TQC (1.5 = +50%, 0.12 = −88%).{' '}
                          <strong>Estándar</strong> = filas con EFFORT vacío.{' '}
                          Cada <strong>sub-tasa de esfuerzo</strong> (MC, PR, CEN, 1P…) es la tasa de las filas que traen ese código en la
                          columna EFFORT del input: siguen en la misma plataforma y categoría, y suman en ella; solo
                          cambia la tasa. Una plataforma puede tener varias. Celda vacía en un EFFORT = ese código no aplica a esa
                          duración (la fila va a la Auditoría).
                          {isDurCat && <> Un código con <strong>REPROSS</strong> (REPROSS, 2P REPROSS) es reproceso: esas filas van en su columna R.</>}
                          {isSinVersion && <> La 1ª fila es la serie (SEASON con valor) y la 2ª la película (SEASON vacío o 0).</>}
                          {isCatLogic && <> Las categorías se crean al desplegar la plataforma (➕ Nueva categoría); aquí se editan sus tasas.</>}
                        </>}
                      />
                      {rateRows.length === 0 ? (
                        <small style={{ color: '#92400e' }}>Esta plataforma no tiene categorías todavía: créalas en 📂 Categorías.</small>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="library-table" style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th rowSpan={2}>Categoría</th>
                                <th rowSpan={2}>Duración</th>
                                <th rowSpan={2} style={{ textAlign: 'center' }}>Tasa estándar</th>
                                <th colSpan={efforts.length + 1} style={{ background: '#ede9fe', color: '#5b21b6', textAlign: 'center' }}>Sub-tasas de esfuerzo (EFFORT)</th>
                              </tr>
                              <tr>
                                {efforts.map((e, i) => (
                                  <th key={i} style={{ background: '#f5f3ff' }}>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
                                      <input type="text" placeholder="código" value={e.code || ''}
                                        onChange={(ev) => setEfforts(efforts.map((x, j) => (j === i ? { ...x, code: ev.target.value.toUpperCase() } : x)))}
                                        style={{ width: '90px', padding: '0.25rem 0.4rem', fontWeight: 700 }} />
                                      <button type="button" title="Quitar esta sub-tasa"
                                        onClick={() => setEfforts(efforts.filter((x, j) => j !== i))}
                                        style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                                    </div>
                                  </th>
                                ))}
                                <th>
                                  <button type="button" className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }}
                                    onClick={() => setEfforts([...efforts, { code: '', rates: {} }])}>
                                    ➕ Sub-tasa
                                  </button>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {rateRows.map((r) => (
                                <tr key={r.key}>
                                  <td>
                                    {r.casillaIdx !== undefined ? (
                                      <>
                                        <input type="text" placeholder={r.casillaIdx === 0 ? 'serie (45 min)' : 'pelicula (120 min)'}
                                          value={r.name || ''} onChange={(e) => updateCasilla(r.casillaIdx, { key: e.target.value })}
                                          style={{ width: '150px', padding: '0.3rem 0.4rem' }} />
                                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                          {r.casillaIdx === 0 ? 'Serie' : 'Película'}
                                        </div>
                                      </>
                                    ) : r.name}
                                  </td>
                                  <td>
                                    {r.casillaIdx !== undefined ? (
                                      <input type="number" min="1" placeholder="min" value={r.duration || ''}
                                        onChange={(e) => updateCasilla(r.casillaIdx, { duration: e.target.value ? parseInt(e.target.value, 10) : '' })}
                                        style={{ width: '70px', padding: '0.3rem 0.4rem', borderColor: r.duration ? undefined : '#fca5a5' }} />
                                    ) : (r.duration ? `${r.duration} min` : '—')}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>{rateCell(r.std, r.setStd)}</td>
                                  {efforts.map((e, i) => (
                                    <td key={i} style={{ background: '#faf5ff', textAlign: 'center' }}>
                                      {r.casillaIdx !== undefined && !r.name
                                        ? <span style={{ color: '#94a3b8' }}>—</span>
                                        : rateCell(e.rates?.[r.key] ?? '', (v) => setEffortRate(i, r.key, v))}
                                    </td>
                                  ))}
                                  <td></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {missingCasillaDuration && (
                        <small style={{ color: '#b91c1c' }}>⚠️ Serie y película necesitan su duración en minutos.</small>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {formTab === 'categories' && (() => {
              const platform = platforms.find((x) => String(x.id) === String(formData.platformId));
              const isDurCat = platform?.logica === 'logica_duracion_categorias';
              const efforts = platform?.effortRates || [];
              const subRates = formData.effortSubRates || {};
              const rateCell = (value, onChange, extra = {}) => (
                <>
                  <input {...RATE_INPUT_PROPS} placeholder="—" value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)} style={{ width: '72px', padding: '0.3rem 0.4rem', ...extra }} />
                  {rateAsEffortPct(value) && <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{rateAsEffortPct(value)}</div>}
                </>
              );
              return (
                <>
                  <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                    Plataforma: <strong>{platform ? (platform.displayName || platform.name) : '—'}</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px', gap: '0.5rem 0.75rem', alignItems: 'end' }}>
                    <div>
                      <FieldLabel text="Nombre" info='Ej. "serie" o "pelicula". La duración va aparte; no hace falta escribirla en el nombre.' />
                      <input type="text" placeholder="serie / pelicula" value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div>
                      <FieldLabel text="Duración (min)" info={isDurCat
                        ? 'La columna DURATION del input elige esta categoría cuando trae esta misma duración.'
                        : 'Debe coincidir con la duración real de sus versiones (según sus segmentos).'} />
                      <input type="number" min="1" step="1" placeholder="30" value={formData.duration || ''}
                        onChange={(e) => setFormData({ ...formData, duration: e.target.value ? parseInt(e.target.value, 10) : null })} />
                    </div>
                    <div>
                      <FieldLabel text="Color" />
                      <input type="color" value={formData.color || '#667eea'}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        style={{ width: '48px', height: '32px', padding: 0 }} />
                    </div>
                  </div>

                  <div style={{ marginTop: '0.4rem' }}>
                    <FieldLabel
                      strong
                      text="⚡ Tasas de esfuerzo"
                      info={<>
                        Tasa = 1 + % de esfuerzo de TQC (1.5 = +50%). <strong>Estándar</strong> = filas con EFFORT vacío.
                        {isDurCat && <> Un código con <strong>REPROSS</strong> (REPROSS, 2P REPROSS) es reproceso: esas filas van en su columna R.</>}
                        {' '}Cada EFFORT es la sub-tasa de las filas que traen ese código (vacío = no aplica: la fila va a la
                        Auditoría). Las sub-tasas (MC, PR, CEN…) se agregan en <strong>✏️ Editar tasas y sub-tasas</strong> de la plataforma.
                      </>}
                    />
                    <div style={{ overflowX: 'auto' }}>
                      <table className="library-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th rowSpan={efforts.length ? 2 : 1} style={{ textAlign: 'center' }}>Tasa estándar</th>
                            {efforts.length > 0 && (
                              <th colSpan={efforts.length} style={{ background: '#ede9fe', color: '#5b21b6', textAlign: 'center' }}>Sub-tasas de esfuerzo (EFFORT)</th>
                            )}
                          </tr>
                          {efforts.length > 0 && (
                            <tr>
                              {efforts.map((e) => (
                                <th key={e.code} style={{ background: '#f5f3ff', color: '#6d28d9', textAlign: 'center' }}>{e.code}</th>
                              ))}
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ textAlign: 'center' }}>{rateCell(shownRate(formData.effortRate), (v) => setFormData({ ...formData, effortRate: rateFromInput(v) }))}</td>
                            {efforts.map((e) => (
                              <td key={e.code} style={{ background: '#faf5ff', textAlign: 'center' }}>
                                {rateCell(subRates[e.code] ?? '', (v) => setFormData({
                                  ...formData, effortSubRates: { ...subRates, [e.code]: rateFromInput(v) },
                                }))}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}

            {formTab === 'versions' && (() => {
              // Orden: 1) plataforma → 2) nombre (sus segmentos dan la duración) → 3) categoría
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
                        El nombre indica <strong>{nameCheck.invalidSuffix} segmentos</strong> y esa cantidad no está en la tabla
                        ({describeSuffixRules(suffixRules)}). No se puede crear esta versión: si ese número
                        existe, agrégala primero en "Segmentos" (pestaña Versiones).
                      </span>
                    </div>
                  )}
                  {formData.name && nameCheck.invalidSuffix === null && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={numberDuration ? badge('#eff6ff', '#bfdbfe', '#1d4ed8') : badge('#f8fafc', '#e2e8f0', '#64748b')}>
                        <span>⏱</span>
                        <span>
                          {numberDuration
                            ? <><strong>{numberDuration} min</strong> — por sus {suffixNumber(formData.name)} segmentos</>
                            : 'Sin segmentos en el nombre: la duración será la de la categoría que elijas'}
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
                        <small style={{ color: '#166534' }}>Duración: <strong>{numberDuration} min</strong> (la de sus segmentos)</small>
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
                  formTab === 'platforms'
                    ? handleSavePlatform
                    : formTab === 'categories'
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

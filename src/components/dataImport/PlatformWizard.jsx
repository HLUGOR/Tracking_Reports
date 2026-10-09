/**
 * PlatformWizard.jsx - Asistente guiado para crear una plataforma nueva
 *
 * Reemplaza el alta directa (nombre + lógica → guardar) por un flujo de varios pasos
 * que NO escribe nada en la librería hasta el paso final. Si a la plataforma le falta
 * algo requerido (categorías/versiones para logica_de_versiones e iberia_especial;
 * ambas categorías para logica_sin_version), el botón de registro final queda
 * bloqueado con el detalle de qué falta — no queda ninguna plataforma a medias en la
 * librería, como sí podía pasar con el alta directa (ver Notas.txt, punto #6).
 *
 * Edición de plataformas existentes: sigue usando el modal de un solo paso en
 * LibraryView.jsx — este asistente es solo para alta nueva.
 */

import React, { useState, useMemo } from 'react';
import libraryStore from '../../store/libraryStore';
import { checkVersionSuffix, describeSuffixRules } from '../../core/reportEngine/versionRules';
import { LOGICA_FAMILIES } from '../../core/reportEngine/logicaFamilies';
import { DEFAULT_RATE, isValidRate, RATE_INPUT_PROPS, rateFromInput } from '../../core/utils/rates';


let _tempKeyCounter = 0;
const nextTempKey = (prefix) => `${prefix}-${++_tempKeyCounter}`;

function PlatformWizard({ onCancel, onComplete }) {
  const existingPlatforms = libraryStore((state) => state.platforms);
  const suffixRules = libraryStore((state) => state.suffixRules);
  const existingEffortGroups = useMemo(
    () => [...new Set(existingPlatforms.map((p) => (p.effortGroup || '').trim()).filter(Boolean))],
    [existingPlatforms]
  );

  const [platformData, setPlatformData] = useState({
    name: '',
    logica: '',
    effortGroup: '',
    platformEffortRate: DEFAULT_RATE, // tasa visible desde el inicio (1 = estándar)
    categorias: [], // solo logica_sin_version
  });

  const [stagedCategories, setStagedCategories] = useState([]); // [{tempKey, data:{name,duration,color,effortRate}}]
  const [stagedVersions, setStagedVersions] = useState([]); // [{tempCategoryKey, data:{name,duration}}]

  const [catForm, setCatForm] = useState({ name: '', duration: '', color: '#667eea', effortRate: DEFAULT_RATE });
  const [verForm, setVerForm] = useState({ name: '', duration: null, tempCategoryKey: '' });

  const needsCatVersions = platformData.logica === 'logica_de_versiones' || platformData.logica === 'iberia_especial';
  // Por duración con categorías (ej. FAST GLOBAL): categorías por duración, sin versiones,
  // y cada categoría con su tasa de reproceso.
  const isDurCat = platformData.logica === 'logica_duracion_categorias';
  const needsCategories = needsCatVersions || isDurCat;
  const needsSinVersionCats = platformData.logica === 'logica_sin_version';
  const needsPlatformRate = ['logica_comerciales', 'logica_bp_i', 'logica_por_duracion', 'logica_youtube'].includes(platformData.logica);

  // Pasos visibles según la lógica elegida (el 4 solo aplica a logica_de_versiones/iberia_especial)
  const stepKeys = useMemo(() => (needsCategories ? [1, 2, 3, 4, 5] : [1, 2, 3, 5]), [needsCategories]);
  const [stepIdx, setStepIdx] = useState(0);
  const step = stepKeys[stepIdx];
  const isFirstStep = stepIdx === 0;
  const isLastStep = stepIdx === stepKeys.length - 1;

  const goNext = () => setStepIdx((i) => Math.min(i + 1, stepKeys.length - 1));
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  // ── Validaciones ──────────────────────────────────────────────────────────
  const step1Valid = platformData.name.trim() !== '' && platformData.logica !== '';
  const sinVersionCatsValid =
    !needsSinVersionCats ||
    (platformData.categorias.length >= 2 &&
      platformData.categorias.every((c) => (c.key || '').trim() !== '' && Number(c.duration) > 0 && isValidRate(c.effortRate)));
  // Tasa de plataforma (lógicas por duración y por conteo): obligatoria
  const platformRateValid = !needsPlatformRate || isValidRate(platformData.platformEffortRate);

  const missing = [];
  if (!step1Valid) missing.push('Nombre y tipo de lógica (paso 1)');
  if (needsSinVersionCats && !sinVersionCatsValid) {
    missing.push('Las 2 categorías de logica_sin_version deben tener nombre, duración y tasa (paso 3)');
  }
  if (!platformRateValid) missing.push('Tasa de Esfuerzo de la plataforma (paso 3)');
  if (needsCategories && stagedCategories.length === 0) missing.push('Al menos 1 categoría (paso 4)');
  if (needsCatVersions && stagedVersions.length === 0) missing.push('Al menos 1 versión (paso 4)');
  const isComplete = missing.length === 0;

  // ── Acciones de categorías/versiones en staging (paso 4) ───────────────────
  // El nombre completo de la categoría se COMPONE de la etiqueta base + la duración
  // (ej. "serie" + 60 → "serie (60 min)"). Nunca se escribe la duración como texto
  // libre dentro del nombre, para que el nombre y la duración no puedan contradecirse
  // entre sí — el mismo problema que causó el bug de VOD/LATAM (categoryId apuntando
  // a una categoría de otra duración) pero un nivel más arriba, dentro de la propia
  // categoría.
  const composedCategoryName = (baseLabel, duration) => {
    const clean = (baseLabel || '').trim();
    return duration ? `${clean} (${duration} min)` : clean;
  };

  // En por duración con categorías la DURATION elige la categoría: no puede haber dos
  // categorías con la misma duración.
  const catDurationTaken = isDurCat && catForm.duration
    && stagedCategories.some((c) => c.data.duration === parseInt(catForm.duration, 10));
  const catFormValid = catForm.name.trim() && catForm.duration && isValidRate(catForm.effortRate) && !catDurationTaken;

  const addStagedCategory = () => {
    if (!catFormValid) return;
    const duration = parseInt(catForm.duration, 10);
    setStagedCategories((prev) => [
      ...prev,
      {
        tempKey: nextTempKey('cat'),
        data: {
          name: composedCategoryName(catForm.name, duration),
          duration,
          color: catForm.color,
          effortRate: catForm.effortRate,
        },
      },
    ]);
    setCatForm({ name: '', duration: '', color: '#667eea', effortRate: DEFAULT_RATE });
  };

  const removeStagedCategory = (tempKey) => {
    setStagedCategories((prev) => prev.filter((c) => c.tempKey !== tempKey));
    setStagedVersions((prev) => prev.filter((v) => v.tempCategoryKey !== tempKey));
  };

  const verSuffixCheck = checkVersionSuffix(verForm.name, suffixRules);
  const selectedCategory = stagedCategories.find((c) => c.tempKey === verForm.tempCategoryKey);
  // El nombre y la categoría elegida deben estar de acuerdo: si el sufijo del nombre
  // sugiere una duración (30/60/120) y no coincide con la de la categoría seleccionada,
  // es un desajuste real — se bloquea en vez de dejar pasar uno de los dos datos en
  // silencio (mismo patrón que el bug de esta captura: categoría "60 min" con una
  // versión "30 min" adentro).
  const versionCategoryMismatch =
    selectedCategory && verSuffixCheck.duration !== null && verSuffixCheck.duration !== selectedCategory.data.duration
      ? { nameSuggests: verSuffixCheck.duration, categoryIs: selectedCategory.data.duration }
      : null;
  // Duración final de la versión: siempre la de la categoría elegida (única fuente,
  // una vez confirmado que no hay desajuste con el nombre).
  const verFinalDuration = selectedCategory?.data.duration ?? null;

  const addStagedVersion = () => {
    if (!verForm.name.trim() || !verForm.tempCategoryKey) return;
    if (verSuffixCheck.invalidSuffix !== null) return; // bloqueado, igual que en Nueva Versión
    if (versionCategoryMismatch) return; // bloqueado: nombre y categoría no coinciden
    if (!verFinalDuration) return;
    setStagedVersions((prev) => [
      ...prev,
      { tempCategoryKey: verForm.tempCategoryKey, data: { name: verForm.name.trim(), duration: verFinalDuration } },
    ]);
    setVerForm({ name: '', duration: null, tempCategoryKey: verForm.tempCategoryKey });
  };

  const removeStagedVersion = (idx) => {
    setStagedVersions((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Registro final (única escritura atómica) ────────────────────────────
  const handleRegister = () => {
    if (!isComplete) return;
    const normalizedPlatform = {
      name: platformData.name.trim(),
      logica: platformData.logica,
      effortGroup: platformData.effortGroup,
      platformEffortRate: needsPlatformRate ? platformData.platformEffortRate : null,
      categorias: needsSinVersionCats ? platformData.categorias : [],
    };
    libraryStore.getState().commitPlatformSetup({
      platform: normalizedPlatform,
      categories: needsCategories ? stagedCategories : [],
      versions: needsCatVersions ? stagedVersions : [],
    });
    onComplete({ name: normalizedPlatform.name, logica: normalizedPlatform.logica });
  };

  const inputStyle = { padding: '0.5rem 0.7rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' };
  const labelStyle = { fontSize: '0.82rem', color: '#475569', fontWeight: 600 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div style={{ background: '#fff', borderRadius: '10px', padding: '1.5rem 2rem', width: '640px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>🧭 Nueva Plataforma — paso {stepIdx + 1} de {stepKeys.length}</h3>
          <div style={{ display: 'flex', gap: '4px', marginTop: '0.6rem' }}>
            {stepKeys.map((_, i) => (
              <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= stepIdx ? '#4f46e5' : '#e2e8f0' }} />
            ))}
          </div>
        </div>

        {/* PASO 1 — Identidad */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Nombre de la plataforma</label>
              <input
                type="text"
                placeholder="Ej: IBERIA, LATAM, VOD..."
                value={platformData.name}
                onChange={(e) => setPlatformData({ ...platformData, name: e.target.value })}
                style={inputStyle}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>Tipo de lógica</label>
              {LOGICA_FAMILIES.map((fam) => (
                <div key={fam.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '0.4rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                    {fam.title} <span style={{ fontWeight: 400, color: '#64748b' }}>— usa la columna {fam.column}</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '-4px' }}>{fam.desc}</div>
                  {fam.options.map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.6rem 0.75rem',
                        borderRadius: '8px', border: `1.5px solid ${platformData.logica === opt.value ? '#4f46e5' : '#e2e8f0'}`,
                        background: platformData.logica === opt.value ? '#eef2ff' : '#fff', cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="radio"
                          name="logica"
                          checked={platformData.logica === opt.value}
                          onChange={() => setPlatformData({ ...platformData, logica: opt.value })}
                        />
                        <strong style={{ fontSize: '0.88rem' }}>{opt.label}</strong>
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '1.5rem' }}>{opt.desc}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2 — Agrupación */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>📊 Grupo de Esfuerzo (opcional)</label>
              <input
                type="text"
                list="effort-group-options-wizard"
                placeholder="Ej: LATAM, IBERIA, OTROS"
                value={platformData.effortGroup}
                onChange={(e) => setPlatformData({ ...platformData, effortGroup: e.target.value.toUpperCase() })}
                style={inputStyle}
              />
              <datalist id="effort-group-options-wizard">
                {existingEffortGroups.map((g) => <option key={g} value={g} />)}
              </datalist>
              <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                Agrupa plataformas en una misma columna de horas. Ej: LATAM y BRAZIL → grupo "LATAM". Si se deja vacío, cae en "OTROS".
                Elige uno ya existente de la lista para no crear uno nuevo por error de tipeo.
                {existingEffortGroups.length > 0 && (
                  <> Grupos ya registrados: <strong>{existingEffortGroups.join(', ')}</strong>.</>
                )}
              </small>
            </div>
          </div>
        )}

        {/* PASO 3 — Tasas */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {needsPlatformRate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>
                  ⚡ Tasa de Esfuerzo de la plataforma — obligatoria (1 = 100%, 1.5 = 150%, 0.25 = 25%)
                </label>
                <input
                  {...RATE_INPUT_PROPS}
                  value={platformData.platformEffortRate ?? ''}
                  onChange={(e) => setPlatformData({ ...platformData, platformEffortRate: rateFromInput(e.target.value) })}
                  style={{ ...inputStyle, width: '160px' }}
                />
                {!platformRateValid && (
                  <small style={{ color: '#b91c1c' }}>Escribe la tasa (mayor que 0) para continuar.</small>
                )}
              </div>
            )}

            {needsSinVersionCats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <label style={labelStyle}>📂 Categorías (serie / película) — obligatorias</label>
                {[0, 1].map((idx) => {
                  const cat = platformData.categorias[idx] || { key: '', duration: '', effortRate: DEFAULT_RATE };
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder={idx === 0 ? 'Ej: serie_45min' : 'Ej: pelicula_120min'}
                        value={cat.key}
                        onChange={(e) => {
                          const cats = [...platformData.categorias];
                          cats[idx] = { ...cat, key: e.target.value };
                          setPlatformData({ ...platformData, categorias: cats });
                        }}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <input
                        type="number" min="0" placeholder="min"
                        value={cat.duration}
                        onChange={(e) => {
                          const cats = [...platformData.categorias];
                          cats[idx] = { ...cat, duration: e.target.value ? parseInt(e.target.value, 10) : '' };
                          setPlatformData({ ...platformData, categorias: cats });
                        }}
                        style={{ ...inputStyle, width: '90px' }}
                      />
                      <input
                        {...RATE_INPUT_PROPS}
                        title="Tasa de esfuerzo (1 = 100%)"
                        placeholder="tasa"
                        value={cat.effortRate ?? ''}
                        onChange={(e) => {
                          const cats = [...platformData.categorias];
                          cats[idx] = { ...cat, effortRate: rateFromInput(e.target.value) };
                          setPlatformData({ ...platformData, categorias: cats });
                        }}
                        style={{ ...inputStyle, width: '80px' }}
                      />
                    </div>
                  );
                })}
                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Nombre · minutos · tasa (1 = 100%, 1.5 = 150%, 0.25 = 25%)</small>
                {!sinVersionCatsValid && (
                  <small style={{ color: '#b91c1c' }}>Completa nombre, duración y tasa de ambas categorías para continuar.</small>
                )}
              </div>
            )}

            {!needsPlatformRate && !needsSinVersionCats && (
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Esta lógica no necesita tasas propias de plataforma — las tasas se configuran por categoría en el paso siguiente.
              </p>
            )}
          </div>
        )}

        {/* PASO 4 — Categorías (y Versiones solo en logica_de_versiones / iberia_especial) */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label style={labelStyle}>📂 Categorías de {platformData.name || 'esta plataforma'} — al menos 1</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Nombre base (ej: serie, pelicula)" value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: '150px' }} />
                <input type="number" min="0" placeholder="Duración" value={catForm.duration}
                  onChange={(e) => setCatForm({ ...catForm, duration: e.target.value })} style={{ ...inputStyle, width: '90px' }} />
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>min</span>
                <input type="color" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} />
                <input {...RATE_INPUT_PROPS} placeholder="Tasa" title="Tasa de esfuerzo (1 = 100%)" value={catForm.effortRate ?? ''}
                  onChange={(e) => setCatForm({ ...catForm, effortRate: rateFromInput(e.target.value) })}
                  style={{ ...inputStyle, width: '80px' }} />
                <button className="btn btn-secondary" onClick={addStagedCategory} disabled={!catFormValid}>
                  ➕
                </button>
              </div>
              {isDurCat && (
                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>
                  La columna DURATION del input elige la categoría (ej. 30 → serie 30, 120 → película).
                  Nombre · minutos · color · tasa. El reproceso (EFFORT con REPROSS) es una sub-tasa: se agrega
                  después en ✏️ Editar tasas y sub-tasas.
                </small>
              )}
              {catDurationTaken && (
                <small style={{ color: '#b91c1c', fontSize: '0.78rem' }}>Ya hay una categoría de {catForm.duration} min.</small>
              )}
              {catForm.name.trim() && catForm.duration && (
                <small style={{ color: '#4f46e5', fontSize: '0.78rem' }}>
                  Se creará como: <strong>{composedCategoryName(catForm.name, catForm.duration)}</strong>
                </small>
              )}
              {stagedCategories.length === 0 ? (
                <p style={{ color: '#b91c1c', fontSize: '0.82rem', marginTop: '0.5rem' }}>Aún no hay categorías agregadas.</p>
              ) : (
                <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                  {stagedCategories.map((c) => (
                    <li key={c.tempKey} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: c.data.color, display: 'inline-block' }} />
                      {c.data.name} — {c.data.duration}min · tasa {c.data.effortRate}
                      <button onClick={() => removeStagedCategory(c.tempKey)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {needsCatVersions && (
            <div>
              <label style={labelStyle}>📦 Versiones de {platformData.name || 'esta plataforma'} — al menos 1</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Nombre de la versión" value={verForm.name}
                  onChange={(e) => setVerForm({ ...verForm, name: e.target.value })}
                  style={{ ...inputStyle, flex: 1, minWidth: '160px' }} />
                <select value={verForm.tempCategoryKey} onChange={(e) => setVerForm({ ...verForm, tempCategoryKey: e.target.value })} style={inputStyle}>
                  <option value="">Categoría</option>
                  {stagedCategories.map((c) => (
                    <option key={c.tempKey} value={c.tempKey}>{c.data.name}</option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  onClick={addStagedVersion}
                  disabled={!verForm.name.trim() || !verForm.tempCategoryKey || verSuffixCheck.invalidSuffix !== null || !!versionCategoryMismatch}
                >
                  ➕
                </button>
              </div>
              {verSuffixCheck.invalidSuffix !== null && (
                <p style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  🚫 El nombre indica {verSuffixCheck.invalidSuffix} segmentos y esa cantidad no está en la tabla ({describeSuffixRules(suffixRules)}). Agrégala primero en Librerías → Versiones → "Segmentos".
                </p>
              )}
              {versionCategoryMismatch && (
                <p style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  🚫 No coincide: el nombre sugiere <strong>{versionCategoryMismatch.nameSuggests} min</strong>, pero
                  la categoría elegida ("{selectedCategory.data.name}") es de <strong>{versionCategoryMismatch.categoryIs} min</strong>.
                  Corrige el nombre o elige la categoría correcta.
                </p>
              )}
              {!versionCategoryMismatch && selectedCategory && verForm.name.trim() && verSuffixCheck.invalidSuffix === null && (
                <small style={{ color: '#15803d', fontSize: '0.78rem' }}>
                  ✓ Coincide — se registrará con {selectedCategory.data.duration} min.
                </small>
              )}
              {stagedVersions.length === 0 ? (
                <p style={{ color: '#b91c1c', fontSize: '0.82rem', marginTop: '0.5rem' }}>Aún no hay versiones agregadas.</p>
              ) : (
                <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                  {stagedVersions.map((v, idx) => {
                    const cat = stagedCategories.find((c) => c.tempKey === v.tempCategoryKey);
                    return (
                      <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {v.data.name} — {v.data.duration}min ({cat?.data.name || '?'})
                        <button onClick={() => removeStagedVersion(idx)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            )}
          </div>
        )}

        {/* PASO 5 — Resumen */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem 1rem', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div><strong>Nombre:</strong> {platformData.name || '—'}</div>
              <div><strong>Lógica:</strong> {platformData.logica || '—'}</div>
              <div><strong>Grupo de Esfuerzo:</strong> {platformData.effortGroup || 'OTROS'}</div>
              {needsPlatformRate && <div><strong>Tasa de plataforma:</strong> {platformData.platformEffortRate}</div>}
              {needsSinVersionCats && (
                <div><strong>Categorías:</strong> {platformData.categorias.map((c) => `${c.key} (${c.duration}min)`).join(', ') || '—'}</div>
              )}
              {needsCategories && (
                <div><strong>Categorías a crear:</strong> {stagedCategories.length} — {stagedCategories.map((c) => c.data.name).join(', ') || '—'}</div>
              )}
              {needsCatVersions && (
                <div><strong>Versiones a crear:</strong> {stagedVersions.length}</div>
              )}
            </div>

            {isComplete ? (
              <p style={{ color: '#15803d', fontSize: '0.88rem', margin: 0 }}>✅ Todo listo para registrar.</p>
            ) : (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#b91c1c' }}>
                🚫 No se puede registrar todavía — falta:
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                  {missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Navegación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!isFirstStep && <button className="btn btn-secondary" onClick={goBack}>← Atrás</button>}
            {!isLastStep ? (
              <button
                className="btn btn-primary"
                onClick={goNext}
                disabled={
                  (step === 1 && !step1Valid) ||
                  (step === 3 && needsSinVersionCats && !sinVersionCatsValid) ||
                  (step === 3 && !platformRateValid)
                }
              >
                Siguiente →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleRegister} disabled={!isComplete}>
                ✅ Registrar plataforma
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlatformWizard;

/**
 * EditorResolver.jsx - Aviso al cargar un Excel con editores que no están registrados.
 * La carga no continúa hasta que cada nombre desconocido se asocia a un editor
 * existente (queda guardado como alias, así la próxima vez no pregunta) o se
 * registra como editor nuevo.
 */

import React, { useState } from 'react';
import useTranslation from '../../i18n/useTranslation';
import { editorKey } from '../../core/utils/editorRegistry';

const titleCase = (s) => String(s).trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase());

function EditorResolver({ unknown, blankCount, existingEditors, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const existingNames = existingEditors.map((e) => e.name);

  const [items, setItems] = useState(() => unknown.map((u) => {
    let aliasTo = '';
    if (u.suggestion) {
      aliasTo = existingNames.includes(u.suggestion)
        ? `e:${u.suggestion}`
        : `n:${editorKey(u.suggestion)}`;
    }
    return { ...u, action: aliasTo ? 'alias' : 'new', newName: titleCase(u.display), aliasTo };
  }));
  const [errors, setErrors] = useState([]);

  const update = (key, patch) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const targetOptions = (self) => [
    ...existingNames.map((name) => ({ value: `e:${name}`, label: name })),
    ...items
      .filter((it) => it.action === 'new' && it.key !== self.key && it.newName.trim())
      .map((it) => ({ value: `n:${it.key}`, label: `${it.newName.trim()} (${t('nuevo')})` })),
  ];

  const handleConfirm = () => {
    const errs = [];
    const existingKeys = new Set(existingNames.map(editorKey));
    const newKeys = new Set();
    items.forEach((it) => {
      if (it.action === 'new') {
        const k = editorKey(it.newName);
        if (!k) errs.push(`"${it.display}": ${t('falta el nombre del editor nuevo.')}`);
        else if (existingKeys.has(k)) errs.push(`"${it.newName}" ${t('ya está registrado — elige "Es el mismo que".')}`);
        else if (newKeys.has(k)) errs.push(`"${it.newName}" ${t('está repetido como editor nuevo.')}`);
        newKeys.add(k);
      } else {
        const target = it.aliasTo.startsWith('n:') ? items.find((x) => `n:${x.key}` === it.aliasTo) : null;
        if (!it.aliasTo) errs.push(`"${it.display}": ${t('elige a qué editor corresponde.')}`);
        else if (it.aliasTo.startsWith('n:') && (!target || target.action !== 'new')) {
          errs.push(`"${it.display}": ${t('el editor elegido ya no está marcado como nuevo.')}`);
        }
      }
    });
    setErrors(errs);
    if (errs.length) return;

    const newEditors = items
      .filter((it) => it.action === 'new')
      .map((it) => ({ name: it.newName.trim(), aliases: editorKey(it.newName) !== it.key ? [it.key] : [] }));
    const aliasesByName = {};
    items.filter((it) => it.action === 'alias').forEach((it) => {
      const name = it.aliasTo.startsWith('e:')
        ? it.aliasTo.slice(2)
        : items.find((x) => `n:${x.key}` === it.aliasTo).newName.trim();
      (aliasesByName[name] ??= []).push(it.key);
    });
    onConfirm({ newEditors, aliasesByName });
  };

  const cell = { padding: '0.45rem 0.6rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', verticalAlign: 'middle' };
  const input = { padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '100%' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
      <div style={{ background: '#fff', borderRadius: '10px', padding: '1.5rem 1.75rem', width: '760px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div>
          <h3 style={{ margin: 0, color: '#1e293b' }}>👤 {t('Editores no registrados')}</h3>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem', color: '#475569' }}>
            {t('Estos nombres de la columna EDITOR no están en el registro de editores. Indica a quién corresponde cada uno antes de continuar, para que ningún trabajo quede asignado a un nombre equivocado.')}
          </p>
          {blankCount > 0 && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#92400e' }}>
              ⚠️ {blankCount} {t('filas no tienen editor — se reportarán como "Sin Asignar".')}
            </p>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={cell}>{t('Nombre en el Excel')}</th>
              <th style={cell}>{t('Filas')}</th>
              <th style={cell}>{t('¿Qué es?')}</th>
              <th style={cell}>{t('Editor')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.key}>
                <td style={cell}><strong>{it.display}</strong></td>
                <td style={cell}>{it.count}</td>
                <td style={cell}>
                  <select
                    value={it.action}
                    onChange={(e) => update(it.key, { action: e.target.value })}
                    style={input}
                  >
                    <option value="alias">{t('Es el mismo que…')}</option>
                    <option value="new">{t('Editor nuevo')}</option>
                  </select>
                </td>
                <td style={cell}>
                  {it.action === 'new' ? (
                    <input
                      value={it.newName}
                      onChange={(e) => update(it.key, { newName: e.target.value })}
                      placeholder={t('Nombre correcto')}
                      style={input}
                    />
                  ) : (
                    <select value={it.aliasTo} onChange={(e) => update(it.key, { aliasTo: e.target.value })} style={input}>
                      <option value="">{t('Elige un editor…')}</option>
                      {targetOptions(it).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {it.suggestion && (
                    <small style={{ color: '#64748b' }}>{t('Sugerencia:')} {it.suggestion}</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {errors.length > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.6rem 0.9rem', color: '#b91c1c', fontSize: '0.85rem' }}>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onCancel}>{t('Cancelar carga')}</button>
          <button className="btn btn-primary" onClick={handleConfirm}>✅ {t('Guardar y continuar')}</button>
        </div>
      </div>
    </div>
  );
}

export default EditorResolver;

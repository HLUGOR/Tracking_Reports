/**
 * LogicaPicker.jsx
 * Elegir la lógica de cálculo de una plataforma: tarjetas con el nombre de lo que hace, una
 * línea de explicación siempre visible y el código técnico en letra pequeña.
 * Lo usan el asistente de plataforma nueva y el formulario de editar plataforma.
 *
 * collapsible: en el formulario de editar muestra solo la lógica actual con un botón
 * "Cambiar", para no ocupar toda la pantalla.
 */
import React, { useState } from 'react';
import { LOGICA_FAMILIES, logicaOf } from '../../core/reportEngine/logicaFamilies';

export default function LogicaPicker({ value, onChange, collapsible = false }) {
  const [open, setOpen] = useState(false);
  const current = logicaOf(value);
  const removed = !!value && !current;
  const showAll = !collapsible || open || !current;

  const pick = (v) => {
    onChange(v);
    setOpen(false);
  };

  const card = (opt) => {
    const selected = value === opt.value;
    return (
      <label
        key={opt.value}
        style={{
          display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.6rem 0.75rem',
          borderRadius: '8px', border: `1.5px solid ${selected ? '#4f46e5' : '#e2e8f0'}`,
          background: selected ? '#eef2ff' : '#fff', cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="radio" name="logica" checked={selected} onChange={() => pick(opt.value)} />
          <strong style={{ fontSize: '0.9rem' }}>{opt.label}</strong>
          <code style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{opt.value}</code>
        </span>
        <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '1.5rem' }}>{opt.desc}</span>
        {opt.example && (
          <span style={{ fontSize: '0.74rem', color: '#4f46e5', marginLeft: '1.5rem' }}>Ej.: {opt.example}</span>
        )}
      </label>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {removed && (
        <div style={{ fontSize: '0.82rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 0.7rem' }}>
          🚫 La lógica anterior (<code>{value}</code>) ya no existe. Elige una nueva: mientras tanto las filas de esta plataforma no se cuentan.
        </div>
      )}
      {!showAll && current && (
        <>
          {card(current)}
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }}
            onClick={() => setOpen(true)}>
            Cambiar lógica
          </button>
        </>
      )}
      {showAll && LOGICA_FAMILIES.map((fam) => (
        <div key={fam.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '0.3rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
            {fam.title} <span style={{ fontWeight: 400, color: '#64748b' }}>— usa la columna {fam.column}</span>
          </div>
          {fam.options.map((opt) => card(opt))}
        </div>
      ))}
      {showAll && collapsible && current && (
        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }}
          onClick={() => setOpen(false)}>
          Cerrar
        </button>
      )}
    </div>
  );
}

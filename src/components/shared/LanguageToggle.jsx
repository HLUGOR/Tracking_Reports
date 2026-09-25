import React from 'react';
import useTranslation from '../../i18n/useTranslation';

/**
 * Botón compartido por los 3 reportes para alternar el idioma en pantalla
 * entre inglés (por defecto) y español. No afecta la exportación a Excel.
 */
function LanguageToggle() {
  const { language, toggleLanguage } = useTranslation();

  return (
    <button
      onClick={toggleLanguage}
      title={language === 'en' ? 'Switch to Spanish' : 'Cambiar a inglés'}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.4rem 0.8rem', borderRadius: '6px',
        border: '1px solid #cbd5e1', background: '#f8fafc',
        color: '#334155', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
      }}
    >
      🌐 {language === 'en' ? 'EN' : 'ES'} <span style={{ color: '#94a3b8', fontWeight: 400 }}>→ {language === 'en' ? 'ES' : 'EN'}</span>
    </button>
  );
}

export default LanguageToggle;

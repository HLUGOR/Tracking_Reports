/**
 * useTranslation.js
 * Hook compartido por los 3 reportes para el botón de idioma inglés/español.
 * Solo afecta lo que se ve en pantalla — la exportación a Excel es independiente.
 */

import uiStore from '../store/uiStore';
import { translate } from './translations';

export default function useTranslation() {
  const language = uiStore((s) => s.language);
  const toggleLanguage = uiStore((s) => s.toggleLanguage);

  const t = (text) => translate(text, language);

  return { t, language, toggleLanguage };
}

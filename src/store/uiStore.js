/**
 * uiStore.js - Preferencias de interfaz (idioma de los reportes)
 * Por defecto en inglés; el botón de cada reporte alterna a español.
 * Solo afecta la pantalla — la exportación a Excel se define por separado.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const uiStore = create(
  persist(
    (set, get) => ({
      language: 'en', // 'en' | 'es'

      setLanguage: (language) => set({ language }),

      toggleLanguage: () => set({ language: get().language === 'en' ? 'es' : 'en' }),
    }),
    {
      name: 'ui-store',
    }
  )
);

export default uiStore;

/**
 * libraryStore.js - Zustand store para Librería de Datos
 * Almacena: versiones, categorías, duraciones, plataformas
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { normalizePlatformCasillas } from '../core/utils/platformCasillas';
import { DEFAULT_SUFFIX_RULES, normalizeSuffixRules } from '../core/reportEngine/versionRules';

// Generador de IDs únicos: siempre crece (cada id es mayor que el anterior), así dos
// elementos creados en el mismo milisegundo nunca comparten id. Date.now() × 1000 queda
// muy por debajo del máximo entero exacto de JavaScript (2^53): sin redondeos.
// (Antes: el contador se reiniciaba cada 1000 y repairVersionIds usaba × 10000, que
// pasaba de 2^53 → JavaScript redondeaba y varias versiones quedaron con el mismo id.)
let _lastId = 0;
const uniqueId = () => {
  _lastId = Math.max(Date.now() * 1000, _lastId + 1);
  return _lastId;
};

// Versiones con id repetido o demasiado grande (no exacto) reciben un id nuevo. Nada
// apunta a las versiones por su id (las categorías y plataformas sí se referencian, por
// eso esas no se tocan), así que cambiarlo no rompe nada. La primera de cada id
// repetido conserva el suyo.
const repairVersionIds = (versions = []) => {
  const seen = new Set();
  return versions.map((v) => {
    const ok = Number.isSafeInteger(v.id) && !seen.has(v.id);
    const id = ok ? v.id : uniqueId();
    seen.add(id);
    return ok ? v : { ...v, id };
  });
};

const libraryStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ===== DATOS =====
        platforms: [], // [{id, name, logica, active}]
        categories: [], // [{id, name, color, duration, platformId}]
        versions: [], // [{id, name, categoryId, platformId, duration}]
        columnMappings: [], // [{id, fileName, mapping: {editor: 'col1', date: 'col2'...}}]
        editors: [], // [{id, name}] — nombre correcto "Apellido Nombre" (tal cual debe venir en el input)
        // Números finales de versión → duración, un número por fila: [{id, number, duration}]
        // (ver versionRules.js)
        suffixRules: DEFAULT_SUFFIX_RULES,

        // ===== EDITORES =====
        addEditor: (name) =>
          set((state) => ({
            editors: [...state.editors, { id: uniqueId(), name: name.trim() }],
          })),

        updateEditor: (id, updates) =>
          set((state) => ({
            editors: state.editors.map((e) => (e.id === id ? { ...e, ...updates } : e)),
          })),

        deleteEditor: (id) =>
          set((state) => ({ editors: state.editors.filter((e) => e.id !== id) })),

        // Aplica de una vez lo que el usuario decidió en el aviso de editores desconocidos:
        // ===== NÚMEROS FINALES DE VERSIÓN =====
        addSuffixRule: ({ number, duration }) =>
          set((state) => ({
            suffixRules: normalizeSuffixRules([...state.suffixRules, { id: uniqueId(), number, duration }]),
          })),
        updateSuffixRule: (id, updates) =>
          set((state) => ({ suffixRules: state.suffixRules.map((r) => (r.id === id ? { ...r, ...updates } : r)) })),
        deleteSuffixRule: (id) =>
          set((state) => ({ suffixRules: state.suffixRules.filter((r) => r.id !== id) })),

        // ===== PLATAFORMAS =====
        addPlatform: (platform) =>
          set((state) => ({
            platforms: [...state.platforms, { id: uniqueId(), active: true, ...platform }],
          })),
        
        updatePlatform: (id, updates) =>
          set((state) => ({
            platforms: state.platforms.map((p) => (p.id === id ? { ...p, ...updates } : p)),
          })),
        
        // Crea una plataforma completa (plataforma + categorías + versiones) en una sola
        // escritura atómica. Usado por el Asistente de Plataforma: nada se guarda hasta que
        // el usuario confirma el paso final, y si algo falta, no se llama a esta acción — no
        // queda ninguna plataforma a medias en la librería.
        // categories: [{ tempKey, data: {name, duration, color, effortRate} }]
        // versions:   [{ tempCategoryKey, data: {name, duration} }]
        commitPlatformSetup: ({ platform, categories = [], versions = [] }) =>
          set((state) => {
            const platformId = uniqueId();
            const newPlatform = { id: platformId, active: true, ...platform };

            const categoryIdByTempKey = {};
            const newCategories = categories.map((c) => {
              const id = uniqueId();
              categoryIdByTempKey[c.tempKey] = id;
              return { id, platformId, ...c.data };
            });

            const newVersions = versions.map((v) => ({
              id: uniqueId(),
              platformId,
              categoryId: categoryIdByTempKey[v.tempCategoryKey] ?? null,
              ...v.data,
            }));

            return {
              platforms: [...state.platforms, newPlatform],
              categories: [...state.categories, ...newCategories],
              versions: [...state.versions, ...newVersions],
            };
          }),

        deletePlatform: (id) =>
          set((state) => ({
            platforms: state.platforms.filter((p) => p.id !== id),
            categories: state.categories.filter((c) => c.platformId !== id),
            versions: state.versions.filter((v) => v.platformId !== id),
          })),
        
        getPlatformById: (id) => get().platforms.find((p) => p.id === id),
        
        // ===== CATEGORÍAS =====
        addCategory: (category) =>
          set((state) => ({
            categories: [...state.categories, { id: uniqueId(), ...category }],
          })),
        
        updateCategory: (id, updates) =>
          set((state) => ({
            categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
          })),
        
        deleteCategory: (id) =>
          set((state) => ({
            categories: state.categories.filter((c) => c.id !== id),
            versions: state.versions.filter((v) => v.categoryId !== id),
          })),
        
        getCategoriesByPlatform: (platformId) =>
          get().categories.filter((c) => c.platformId === platformId),
        
        // ===== VERSIONES =====
        addVersion: (version) =>
          set((state) => ({
            versions: [...state.versions, { id: uniqueId(), ...version }],
          })),
        
        updateVersion: (id, updates) =>
          set((state) => ({
            versions: state.versions.map((v) => (v.id === id ? { ...v, ...updates } : v)),
          })),
        
        deleteVersion: (id) =>
          set((state) => ({
            versions: state.versions.filter((v) => v.id !== id),
          })),

        // Repara IDs duplicados asignando un ID único a cada versión
        // Reemplaza todas las versiones de una vez (usado por auto-asignar masivo)
        setVersions: (versions) => set(() => ({ versions })),

        getVersionsByCategory: (categoryId) =>
          get().versions.filter((v) => v.categoryId === categoryId),
        
        getVersionsByPlatform: (platformId) =>
          get().versions.filter((v) => v.platformId === platformId),
        
        // ===== MAPEOS DE COLUMNAS =====
        saveColumnMapping: (fileName, mapping) =>
          set((state) => {
            const existing = state.columnMappings.find((m) => m.fileName === fileName);
            if (existing) {
              return {
                columnMappings: state.columnMappings.map((m) =>
                  m.fileName === fileName ? { ...m, mapping, updatedAt: new Date() } : m
                ),
              };
            }
            return {
              columnMappings: [
                ...state.columnMappings,
                { id: Date.now(), fileName, mapping, createdAt: new Date() },
              ],
            };
          }),
        
        getColumnMapping: (fileName) => {
          const mapping = get().columnMappings.find((m) => m.fileName === fileName);
          return mapping?.mapping || null;
        },
        
        deleteColumnMapping: (fileName) =>
          set((state) => ({
            columnMappings: state.columnMappings.filter((m) => m.fileName !== fileName),
          })),
        
        getAllColumnMappings: () => get().columnMappings,
        
        // ===== SINCRONIZACIÓN =====
        importLibraryData: (data) => {
          // Validar e importar con estructura correcta
          // Casillas de logica_sin_version siempre en formato actual (convierte respaldos antiguos)
          const platforms = (data.platforms || []).map(normalizePlatformCasillas);
          
          return set({
            platforms,
            categories: data.categories || [],
            versions: repairVersionIds(data.versions || []),
            columnMappings: data.columnMappings || [],
            // Respaldos anteriores al registro de editores no traen este campo:
            // en ese caso se conserva el registro actual en vez de borrarlo.
            editors: data.editors ?? get().editors,
            // Respaldos anteriores a la tabla de números finales: se conserva la actual.
            suffixRules: data.suffixRules ? normalizeSuffixRules(data.suffixRules) : get().suffixRules,
          });
        },
        
        exportLibraryData: () => {
          // Asegurar que platforms incluyan todas las tasas de esfuerzo en categorias
          const state = get();
          return {
            platforms: state.platforms.map(normalizePlatformCasillas),
            categories: state.categories,
            versions: state.versions,
            columnMappings: state.columnMappings,
            editors: state.editors,
            suffixRules: normalizeSuffixRules(state.suffixRules),
            exportedAt: new Date().toISOString(),
          };
        },
      }),
      {
        name: 'library-store', // localStorage key
        // v1: casillas de logica_sin_version convertidas una vez al formato actual.
        // Los datos guardados en el navegador antes de esto (versión 0) pasan por aquí.
        // v2: versiones con id repetido reciben un id nuevo (punto #10).
        // v3: tabla de números finales en formato "un número por fila".
        version: 3,
        migrate: (persisted, fromVersion) => {
          let state = persisted || {};
          if (fromVersion < 1) {
            state = { ...state, platforms: (state.platforms || []).map(normalizePlatformCasillas) };
          }
          if (fromVersion < 2) {
            state = { ...state, versions: repairVersionIds(state.versions || []) };
          }
          if (fromVersion < 3 && state.suffixRules) {
            state = { ...state, suffixRules: normalizeSuffixRules(state.suffixRules) };
          }
          return state;
        },
      }
    )
  )
);

export default libraryStore;

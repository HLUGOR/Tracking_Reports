/**
 * libraryStore.js - Zustand store para Librería de Datos
 * Almacena: versiones, categorías, duraciones, plataformas
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

// Generador de IDs únicos: timestamp + contador incremental para evitar colisiones
let _idCounter = 0;
const uniqueId = () => Date.now() * 1000 + (++_idCounter % 1000);

const libraryStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ===== DATOS =====
        platforms: [], // [{id, name, logica, active}]
        categories: [], // [{id, name, color, duration, platformId}]
        versions: [], // [{id, name, categoryId, platformId, duration}]
        columnMappings: [], // [{id, fileName, mapping: {editor: 'col1', date: 'col2'...}}]
        
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
        repairVersionIds: () =>
          set((state) => ({
            versions: state.versions.map((v, idx) => ({ ...v, id: Date.now() * 10000 + idx })),
          })),

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
          const platforms = (data.platforms || []).map(p => ({
            ...p,
            // Asegurar que categorias sea un array con estructura completa
            categorias: (p.categorias || []).map(cat => {
              if (typeof cat === 'string') {
                return { key: cat, duration: '', effortRate: null };
              }
              return {
                key: cat.key || cat.name || '',
                duration: cat.duration || '',
                effortRate: cat.effortRate !== undefined ? cat.effortRate : null,
              };
            }),
          }));
          
          return set({
            platforms,
            categories: data.categories || [],
            versions: data.versions || [],
            columnMappings: data.columnMappings || [],
          });
        },
        
        exportLibraryData: () => {
          // Asegurar que platforms incluyan todas las tasas de esfuerzo en categorias
          const state = get();
          return {
            platforms: state.platforms.map(p => ({
              ...p,
              // Asegurar que categorias siempre sea un array con estructura completa
              categorias: (p.categorias || []).map(cat => ({
                key: typeof cat === 'string' ? cat : cat.key,
                duration: typeof cat === 'string' ? '' : cat.duration,
                effortRate: typeof cat === 'string' ? null : cat.effortRate,
              })),
            })),
            categories: state.categories,
            versions: state.versions,
            columnMappings: state.columnMappings,
            exportedAt: new Date().toISOString(),
          };
        },
        
        // Validar y reparar estructuras incompletas de categorias
        validateAndRepairLibrary: () => {
          const state = get();
          const repairedPlatforms = state.platforms.map(p => ({
            ...p,
            categorias: (p.categorias || []).map(cat => {
              if (typeof cat === 'string') {
                return { key: cat, duration: '', effortRate: null };
              }
              return {
                key: cat.key || cat.name || '',
                duration: cat.duration !== undefined ? cat.duration : '',
                effortRate: cat.effortRate !== undefined ? cat.effortRate : null,
              };
            }),
          }));
          
          set({ platforms: repairedPlatforms });
          return repairedPlatforms;
        },
      }),
      {
        name: 'library-store', // localStorage key
      }
    )
  )
);

export default libraryStore;

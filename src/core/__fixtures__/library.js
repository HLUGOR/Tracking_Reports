/**
 * Librería y filas de ejemplo para las pruebas automáticas.
 * Pequeña a propósito: una plataforma por cada lógica, con tasas fáciles de verificar a mano.
 */

export const library = {
  platforms: [
    {
      id: 1, name: 'LATAM', logica: 'logica_de_versiones', effortGroup: 'LATAM', categorias: [],
      effortRates: [{ code: 'CEN', rates: { 10: 2, 11: 1.75, 12: 1.6 } }],
    },
    { id: 2, name: 'IBERIA', logica: 'iberia_especial', effortGroup: 'IBERIA', categorias: [] },
    {
      id: 3, name: 'SONY ONE', logica: 'logica_sin_version', effortGroup: 'DIGITAL',
      categorias: [
        { key: 'serie (45 min)', duration: 45, effortRate: 1.5 },
        { key: 'pelicula (120 min)', duration: 120, effortRate: 3 },
      ],
      effortRates: [{ code: 'MC', rates: { 'serie (45 min)': 0.16, 'pelicula (120 min)': 0.17 } }],
    },
    {
      id: 4, name: 'GSN VOD', logica: 'logica_por_duracion', effortGroup: 'COMPLIANCE', platformEffortRate: 1.5, categorias: [],
      effortRates: [{ code: 'MC', rates: { __platform__: 0.12 } }],
    },
    { id: 5, name: 'COMERCIALES', logica: 'logica_comerciales', effortGroup: 'COMERCIALES', platformEffortRate: 1.25, categorias: [] },
    { id: 6, name: 'YOUTUBE', logica: 'logica_youtube', effortGroup: 'YOUTUBE', platformEffortRate: 0.5, categorias: [] },
    { id: 7, name: 'BP&I', logica: 'logica_bp_i', effortGroup: 'BP&I', platformEffortRate: 2, categorias: [] },
    {
      id: 8, name: 'FAST GLOBAL', logica: 'logica_duracion_categorias', effortGroup: 'COMPLIANCE', categorias: [],
      effortRates: [
        { code: '1P', rates: { 30: 1.7, 31: 1.7, 32: 1.7 } },
        { code: '2P', rates: { 30: 0.6, 31: 0.6 } },
        { code: 'REPROSS', rates: { 30: 0.7, 31: 0.7, 32: 0.5 } },
        { code: '2P REPROSS', rates: { 30: 0.8 } },
      ],
    },
  ],
  categories: [
    { id: 10, name: 'serie (30 min)', duration: 30, platformId: 1, effortRate: 1.75 },
    { id: 11, name: 'serie (60 min)', duration: 60, platformId: 1, effortRate: 1.5 },
    { id: 12, name: 'pelicula (120 min)', duration: 120, platformId: 1, effortRate: 3 },
    { id: 20, name: 'serie (60 min)', duration: 60, platformId: 2, effortRate: 1.5 },
    { id: 30, name: 'Series (30 min)', duration: 30, platformId: 8, effortRate: 1 },
    { id: 31, name: 'Series (60 min)', duration: 60, platformId: 8, effortRate: 1 },
    { id: 32, name: 'Peliculas (120 min)', duration: 120, platformId: 8, effortRate: 1 },
  ],
  versions: [
    { id: 100, name: 'LAT_ORI_HD 3', categoryId: 10, platformId: 1, duration: 30 },
    { id: 101, name: 'BRA_ORI_HD 5', categoryId: 11, platformId: 1, duration: 60 },
    { id: 102, name: 'p- F HD IBERIA', categoryId: 20, platformId: 2, duration: 60 },
  ],
  // Nombres tal cual vienen en el input (Apellido Nombre)
  editors: [{ id: 1, name: 'Segura Ana' }, { id: 2, name: 'Dominguez Adair' }, { id: 3, name: 'Guerrero Jose' }],
};

/** Fila del input ya mapeada (como la deja la pantalla de carga). */
export const row = ({
  platform, version = '', season = '', duration = '', editor = 'Segura Ana',
  date = '06/15/2026', serie = '', hn = '', clip = '', short = '', excelRow, effort = '',
}) => ({
  ...(excelRow ? { __row: excelRow } : {}),
  PLATFORM: platform, VERSION: version, SEASON: season, DURATION: duration, EDITOR: editor,
  APROVED_DATE: date, SERIE: serie, HN: hn, CLIP: clip, SHORT: short, EFFORT: effort,
  platform, version, season, duration, editor, approved_date: date,
});

/**
 * Columna "Configuración" de Librerías → Plataformas (y "Validar librería"):
 * qué le falta a cada plataforma según su lógica.
 */
import { platformProblems } from '../utils/platformStatus';
import { library } from '../__fixtures__/library';

const plat = (name) => library.platforms.find((p) => p.name === name);

describe('Configuración de plataformas', () => {
  test('plataformas completas no tienen faltantes', () => {
    ['LATAM', 'IBERIA', 'SONY ONE', 'GSN VOD', 'COMERCIALES', 'FAST GLOBAL'].forEach((n) => {
      expect(platformProblems(plat(n), library.categories)).toEqual([]);
    });
  });
  test('tasa única sin tasa (como BP&I o YOUTUBE hoy) → falta la tasa de la plataforma', () => {
    expect(platformProblems({ ...plat('BP&I'), platformEffortRate: null }, library.categories)).toEqual(['tasa de la plataforma']);
  });
  test('con categorías: categoría sin tasa o plataforma sin categorías', () => {
    const cats = library.categories.map((c) => (c.id === 12 ? { ...c, effortRate: null } : c));
    expect(platformProblems(plat('LATAM'), cats)).toEqual(['tasa de "pelicula (120 min)"']);
    expect(platformProblems({ id: 99, name: 'NUEVA', logica: 'logica_de_versiones', effortGroup: 'X' }, cats)).toEqual(['categorías']);
  });
  test('por duración con categorías: también la tasa de reproceso', () => {
    const cats = library.categories.map((c) => (c.id === 30 ? { ...c, reprocessRate: null } : c));
    expect(platformProblems(plat('FAST GLOBAL'), cats)).toEqual(['tasa de reproceso de "Series (30 min)"']);
  });
  test('sin versión: casillas con duración y tasa; y sin grupo de esfuerzo', () => {
    const p = { ...plat('SONY ONE'), effortGroup: '', categorias: [{ key: 'serie', duration: 45, effortRate: 1.5 }, { key: 'peli', duration: 120, effortRate: '' }] };
    expect(platformProblems(p, library.categories)).toEqual(['grupo de esfuerzo', 'tasa de la casilla película']);
  });
});

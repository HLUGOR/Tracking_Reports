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
  test('por duración con categorías: ya no pide tasa de reproceso (es una sub-tasa EFFORT)', () => {
    expect(platformProblems(plat('FAST GLOBAL'), library.categories)).toEqual([]);
  });
  test('lógica eliminada (SEASON): la plataforma queda incompleta hasta elegir otra', () => {
    const p = { id: 99, name: 'ANTIGUA', logica: 'logica_sin_version', effortGroup: 'X' };
    expect(platformProblems(p, library.categories)).toEqual(['lógica de cálculo (la anterior ya no existe: elige otra)']);
  });
  test('por rangos de DURATION: nombre y tasa estándar de las 3 casillas y sub-tasas PR / MC completas; y sin grupo de esfuerzo', () => {
    expect(platformProblems(plat('SONY ONE'), library.categories)).toEqual([]);
    const p = {
      ...plat('SONY ONE'), effortGroup: '',
      categorias: [{ key: 'a', effortRate: 1 }, { key: 'b', effortRate: '' }, { key: '', effortRate: 3 }],
      effortRates: [{ code: 'PR', rates: { a: 0.1 } }],
    };
    expect(platformProblems(p, library.categories)).toEqual(['grupo de esfuerzo', 'tasa de la casilla de 60 min', 'nombre de la casilla de 120 min', 'tasas de "PR" en las 3 casillas']);
    // las sub-tasas son opcionales
    expect(platformProblems({ ...plat('SONY ONE'), effortRates: [] }, library.categories)).toEqual([]);
    expect(platformProblems(plat('AMAZON'), library.categories)).toEqual([]);
  });
});

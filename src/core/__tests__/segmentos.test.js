/**
 * Tabla de segmentos → duración (Librerías → Versiones → Segmentos).
 */
import {
  checkVersionSuffix, DEFAULT_SUFFIX_RULES, suffixRuleProblem, describeSuffixRules, normalizeSuffixRules,
} from '../reportEngine/versionRules';
import PlatformReportsEngine from '../reportEngine/PlatformReportsEngine';
import libraryStore from '../../store/libraryStore';
import { library, row } from '../__fixtures__/library';

const con11 = [...DEFAULT_SUFFIX_RULES, { id: 'r11', number: 11, duration: 120 }];

describe('Segmentos → duración', () => {
  test('sin la regla, el 11 no se puede registrar; con la regla, vale 120 min', () => {
    expect(checkVersionSuffix('LAT_SUB_HD 11').invalidSuffix).toBe(11);
    expect(checkVersionSuffix('LAT_SUB_HD 11', con11)).toEqual({ duration: 120, invalidSuffix: null });
  });
  test('una cantidad de segmentos por fila: no se repite y la duración es obligatoria', () => {
    expect(suffixRuleProblem({ number: 10, duration: 120 }, DEFAULT_SUFFIX_RULES)).toMatch(/ya están en la tabla/);
    expect(suffixRuleProblem({ number: 11, duration: 0 }, DEFAULT_SUFFIX_RULES)).toMatch(/duración/);
    expect(suffixRuleProblem({ number: 0, duration: 120 }, DEFAULT_SUFFIX_RULES)).toMatch(/entero/);
    expect(suffixRuleProblem({ number: 11, duration: 120 }, DEFAULT_SUFFIX_RULES)).toBeNull();
  });
  test('la tabla del primer gestor (desde-hasta) se convierte a un número por fila', () => {
    const vieja = [{ id: 'a', from: 1, to: 4, duration: 30 }, { id: 'b', from: 9, to: 10, duration: 120 }, { id: 'c', from: 11, to: 11, duration: 120 }];
    expect(normalizeSuffixRules(vieja).map((r) => [r.number, r.duration])).toEqual([[1, 30], [2, 30], [3, 30], [4, 30], [9, 120], [10, 120], [11, 120]]);
  });
  test('texto de la tabla para los mensajes', () => {
    expect(describeSuffixRules(con11)).toBe('1-4 → 30 min, 5-6 → 60 min, 9-11 → 120 min');
  });
});

describe('Auditoría de versiones no registradas', () => {
  const build = (lib) => PlatformReportsEngine.buildReport([row({ platform: 'LATAM', version: 'LAT_SUB_HD 11', excelRow: 403 })], null, null, lib, 'all');
  test('segmentos fuera de la tabla: pide agregarlos primero (con su fila)', () => {
    const d = build(library).audit.discardedByReason[0];
    expect(d.motivo).toMatch(/sus segmentos no están en la tabla/);
    expect(d.rows).toEqual([403]);
  });
  test('segmentos en la tabla: solo falta crear la versión; aun así NO se cuenta', () => {
    const rep = build({ ...library, suffixRules: con11 });
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0].motivo).toBe('versión no registrada — créala en Librerías → Versiones');
  });
});

describe('La tabla se guarda en la librería', () => {
  test('arranca con 1-4 / 5-6 / 9-10 y se puede agregar el 11', () => {
    expect(libraryStore.getState().suffixRules).toEqual(DEFAULT_SUFFIX_RULES);
    libraryStore.getState().addSuffixRule({ number: 11, duration: 120 });
    expect(describeSuffixRules(libraryStore.getState().suffixRules)).toMatch(/9-11 → 120 min/);
  });
  test('va dentro del respaldo y un respaldo viejo (sin tabla) no la borra', () => {
    const exported = libraryStore.getState().exportLibraryData();
    expect(exported.suffixRules.some((r) => r.number === 11)).toBe(true);
    libraryStore.getState().importLibraryData({ platforms: [], categories: [], versions: [] });
    expect(libraryStore.getState().suffixRules.some((r) => r.number === 11)).toBe(true);
  });
});

/**
 * Reglas básicas: fechas, tasas, sufijos de versión, SEASON y nombres de editor.
 */
import { parseInputDate, formatDisplayDate, formatPeriod } from '../utils/dateUtils';
import { isValidRate, rateFromInput } from '../utils/rates';
import { detectDurationFromSuffix, checkVersionSuffix, detectSubPlatform } from '../reportEngine/versionRules';
import VersionMatcher from '../reportEngine/VersionMatcher';
import { normalizePlatformCasillas } from '../utils/platformCasillas';
import { canonicalizeEditors } from '../utils/editorRegistry';
import { formatRowRanges } from '../utils/rowRanges';

const ymd = (d) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

describe('Fechas del input (MM/DD/AAAA)', () => {
  test('lee el mes primero', () => {
    expect(ymd(parseInputDate('06/15/2026'))).toBe('2026-6-15');
    expect(ymd(parseInputDate('6/5/2026'))).toBe('2026-6-5');
  });
  test('fechas imposibles o vacías no se corrigen: quedan como no válidas', () => {
    ['25/06/2026', '02/30/2026', '13/01/2026', '', 'hola', null].forEach((v) => {
      expect(parseInputDate(v)).toBeNull();
    });
  });
  test('acepta fecha real de Excel y AAAA-MM-DD de los selectores', () => {
    expect(ymd(parseInputDate(46203))).toBe('2026-6-30');
    expect(ymd(parseInputDate('2026-06-01'))).toBe('2026-6-1');
  });
  test('el período se muestra MM/DD/AAAA', () => {
    expect(formatDisplayDate('2026-06-01')).toBe('06/01/2026');
    expect(formatPeriod('2026-06-01', '2026-06-26')).toBe('06/01/2026 → 06/26/2026');
  });
});

describe('Tasas', () => {
  test('acepta decimales como 0.25 y 0.30', () => {
    ['1', '0.25', '0.30', '1.75'].forEach((v) => expect(isValidRate(rateFromInput(v))).toBe(true));
  });
  test('vacía, 0 o negativa no es válida', () => {
    ['', '0', '-1'].forEach((v) => expect(isValidRate(rateFromInput(v))).toBe(false));
    expect(isValidRate(null)).toBe(false);
  });
});

describe('Sufijos de versión (numeración cerrada 1-4 / 5-6 / 9-10)', () => {
  test.each([
    ['LAT_ORI_HD 1', 30], ['LAT_ORI_HD 4', 30], ['LAT_ORI_HD 5', 60], ['LAT_ORI_HD 6', 60],
    ['LAT_ORI_HD 9', 120], ['LAT_ORI_HD 10', 120], ['LAT_ORI_HD 1 SONY', 30],
  ])('%s → %i min', (name, min) => expect(detectDurationFromSuffix(name)).toBe(min));
  test('7 y 8 no existen en la numeración: el formulario los bloquea', () => {
    expect(checkVersionSuffix('LAT_ORI_HD 7').invalidSuffix).toBe(7);
    expect(checkVersionSuffix('LAT_ORI_HD 8').invalidSuffix).toBe(8);
  });
  test('LAT_ / BRA_ decide LATAM o BRAZIL', () => {
    expect(detectSubPlatform('LAT_ORI_SQZ_HD 3')).toBe('LATAM');
    expect(detectSubPlatform('BRA_SAP_CC_SQZ_HD 5')).toBe('BRAZIL');
    expect(detectSubPlatform('p- F HD IBERIA')).toBeNull();
  });
});

describe('Regla de SEASON (sin versión)', () => {
  const cfg = { categorias: [{ key: 'serie', duration: 45 }, { key: 'pelicula', duration: 120 }] };
  test('SEASON vacío o 0 → película; con valor → serie', () => {
    expect(VersionMatcher.classifyBySeason('', cfg).duration_minutes).toBe(120);
    expect(VersionMatcher.classifyBySeason('0', cfg).duration_minutes).toBe(120);
    expect(VersionMatcher.classifyBySeason('3', cfg).duration_minutes).toBe(45);
  });
  test('sin duración configurada no se inventa: no registrada', () => {
    const r = VersionMatcher.classifyBySeason('3', { categorias: [{ key: 'serie', duration: '' }, { key: 'p', duration: 120 }] });
    expect(r.registered).toBe(false);
  });
  test('un respaldo con el formato antiguo conserva la duración', () => {
    const p = normalizePlatformCasillas({
      name: 'SONY ONE', categorias: ['serie_45min', 'pelicula_120min'],
      duracion_serie_minutos: 45, duracion_pelicula_minutos: 120,
    });
    expect(p.categorias.map((c) => c.duration)).toEqual([45, 120]);
    expect('duracion_serie_minutos' in p).toBe(false);
  });
});

describe('Editores', () => {
  test('nombres con acento se escriben bien (Jesús, no JesúS)', () => {
    expect(VersionMatcher.normalizeEditorName('jesús díaz')).toBe('Jesús Díaz');
    expect(VersionMatcher.normalizeEditorName('LUIS CEDEÑO')).toBe('Luis Cedeño');
  });
  test('solo el nombre registrado tal cual: se ignoran mayúsculas y espacios, no el orden', () => {
    const editors = [{ name: 'Guerrero Jose' }];
    const rows = [{ editor: 'GUERRERO  JOSE' }, { editor: 'Jose Guerrero' }, { editor: '' }];
    expect(canonicalizeEditors(rows, editors).map((r) => r.editor)).toEqual(['Guerrero Jose', 'Jose Guerrero', '']);
  });
});

describe('Números de fila en la auditoría', () => {
  test('se muestran en tramos cortos', () => {
    expect(formatRowRanges([290, 283, 284, 285, 285])).toBe('283-285, 290');
    expect(formatRowRanges([])).toBe('');
  });
});

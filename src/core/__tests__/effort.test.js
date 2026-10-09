/**
 * Columna EFFORT del input: sub-tasas por proceso dentro de una misma plataforma.
 * Vacío (o el nombre de la plataforma) = tasa estándar.
 */
import PlatformReportsEngine from '../reportEngine/PlatformReportsEngine';
import { library, row } from '../__fixtures__/library';

const evalRow = (r) => PlatformReportsEngine.evaluateRow(r, library);
const build = (rows) => PlatformReportsEngine.buildReport(rows, null, null, library, 'all');

describe('EFFORT: sub-tasas', () => {
  test('vacío o el nombre de la plataforma = tasa estándar', () => {
    expect(evalRow(row({ platform: 'LATAM', version: 'LAT_ORI_HD 3' }))).toEqual({ minutes: 30, hours: 0.5 * 1.75 });
    expect(evalRow(row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', effort: 'LATAM' }))).toEqual({ minutes: 30, hours: 0.5 * 1.75 });
  });
  test('con código: misma plataforma y categoría, solo cambia la tasa', () => {
    expect(evalRow(row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', effort: 'CEN' }))).toEqual({ minutes: 30, hours: 0.5 * 2 });
    const rep = build([
      row({ platform: 'LATAM', version: 'LAT_ORI_HD 3' }),
      row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', effort: 'cen' }), // minúsculas: igual
    ]);
    expect(rep.platforms).toHaveLength(1);
    expect(rep.platforms[0].totalByCategory['10'].count).toBe(2);
    const eff = PlatformReportsEngine.buildEffortReport(rep, library);
    expect(eff.editors[0].byGroup.LATAM).toBeCloseTo(0.5 * 1.75 + 0.5 * 2);
  });
  test('casillas (SONY ONE MC) y tasa única (GSN VOD MC)', () => {
    expect(evalRow(row({ platform: 'SONY ONE', season: '2', effort: 'MC' }))).toEqual({ minutes: 45, hours: 0.75 * 0.16 });
    expect(evalRow(row({ platform: 'GSN VOD', duration: '30', effort: 'MC' })).hours).toBeCloseTo(0.5 * 0.12);
  });
  test('código no configurado en la plataforma: no cuenta, Auditoría con su fila', () => {
    const rep = build([row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', effort: 'XX', excelRow: 9 })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ values: ['XX'], rows: [9] });
    expect(rep.audit.discardedByReason[0].motivo).toMatch(/EFFORT no configurado/);
  });
  test('código sin tasa para esa duración ("—" en la tabla): no cuenta, Auditoría', () => {
    const rep = build([row({ platform: 'FAST GLOBAL', duration: '120', effort: '2P', excelRow: 5 })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0].motivo).toMatch(/EFFORT sin tasa/);
  });
  test('FAST GLOBAL: EFFORT REPROSS va a la columna "R" con la sub-tasa', () => {
    const rep = build([row({ platform: 'FAST GLOBAL', duration: '30', effort: 'REPROSS' })]);
    expect(rep.platforms[0].totalByCategory['R:30'].count).toBe(1);
    const eff = PlatformReportsEngine.buildEffortReport(rep, library);
    expect(eff.editors[0].byGroup['COMPLIANCE REPROSS']).toBeCloseTo(0.5 * 0.7);
  });
});

describe('EFFORT con el nombre de la plataforma delante (como viene en el input real)', () => {
  test('"FAST GLOBAL 2P" = código 2P de FAST GLOBAL', () => {
    expect(evalRow(row({ platform: 'FAST GLOBAL', duration: '30', effort: 'FAST GLOBAL 2P' })).hours).toBeCloseTo(0.5 * 0.6);
  });
  test('"FAST GLOBAL 2P REPROSS": reproceso (columna R) con la sub-tasa 2P REPROSS', () => {
    const rep = build([row({ platform: 'FAST GLOBAL', duration: '30', effort: 'FAST GLOBAL 2P REPROSS' })]);
    expect(rep.platforms[0].totalByCategory['R:30'].count).toBe(1);
    const eff = PlatformReportsEngine.buildEffortReport(rep, library);
    expect(eff.editors[0].byGroup['COMPLIANCE REPROSS']).toBeCloseTo(0.5 * 0.8);
  });
  test('el código también puede estar registrado con el prefijo en la librería', () => {
    const lib = { ...library, platforms: library.platforms.map((p) => (p.name === 'FAST GLOBAL'
      ? { ...p, effortRates: [{ code: 'FAST GLOBAL 1P', rates: { 30: 1.7 } }] } : p)) };
    expect(PlatformReportsEngine.evaluateRow(row({ platform: 'FAST GLOBAL', duration: '30', effort: '1P' }), lib).hours).toBeCloseTo(0.5 * 1.7);
    expect(PlatformReportsEngine.evaluateRow(row({ platform: 'FAST GLOBAL', duration: '30', effort: 'FAST GLOBAL 1P' }), lib).hours).toBeCloseTo(0.5 * 1.7);
  });
  test('también con el nombre para mostrar (LATAM & Brasil Networks CEN)', () => {
    const lib = { ...library, platforms: library.platforms.map((p) => (p.name === 'LATAM' ? { ...p, displayName: 'LATAM & Brasil Networks' } : p)) };
    const r = (effort) => PlatformReportsEngine.evaluateRow(row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', effort }), lib).hours;
    expect(r('LATAM & Brasil Networks CEN')).toBeCloseTo(0.5 * 2);
    expect(r('LATAM CEN')).toBeCloseTo(0.5 * 2);
    expect(r('LATAM & Brasil Networks')).toBeCloseTo(0.5 * 1.75); // nombre solo = estándar
  });
  test('prefijo de OTRA plataforma: no es un código de esta → Auditoría', () => {
    const rep = build([row({ platform: 'FAST GLOBAL', duration: '30', effort: 'LATAM CEN', excelRow: 4 })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ values: ['LATAM CEN'], rows: [4] });
  });
});

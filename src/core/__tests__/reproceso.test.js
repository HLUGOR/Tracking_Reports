/**
 * Lógica por duración con categorías + reproceso (FAST GLOBAL).
 * El reproceso lo marca la columna EFFORT (código con REPROSS), no VERSION.
 * Los números replican la tabla de ejemplo del usuario: Adair (307 series 30 + 15
 * películas = 11,010 min) y Cheo (182 + 29 R series 30, 8 + 34 R películas = 11,370 min).
 */
import PlatformReportsEngine from '../reportEngine/PlatformReportsEngine';
import { library, row } from '../__fixtures__/library';

const fg = (duration, editor, effort = '', version = '') => row({ platform: 'FAST GLOBAL', duration, editor, effort, version });
const times = (n, r) => Array.from({ length: n }, () => r);

const rows = [
  ...times(307, fg('30', 'Dominguez Adair')), ...times(15, fg('120', 'Dominguez Adair')),
  ...times(182, fg('30', 'Guerrero Jose')), ...times(29, fg('30', 'Guerrero Jose', 'REPROSS')),
  ...times(8, fg('120', 'Guerrero Jose')), ...times(34, fg('120', 'Guerrero Jose', 'REPROSS')),
];
const rep = PlatformReportsEngine.buildReport(rows, null, null, library, 'all');
const plt = rep.platforms[0];
const ed = (name) => plt.editors.find((e) => e.editor === name);

describe('FAST GLOBAL: categoría por DURATION y reproceso', () => {
  test('minutos y total por editor incluyen nuevo + reproceso (como la tabla del usuario)', () => {
    expect(ed('Dominguez Adair')).toMatchObject({ totalMinutes: 11010, totalCount: 322 });
    expect(ed('Guerrero Jose')).toMatchObject({ totalMinutes: 11370, totalCount: 253 });
  });
  test('el reproceso va en su propia columna "R" de la categoría', () => {
    expect(ed('Guerrero Jose').byCategory['30'].count).toBe(182);
    expect(ed('Guerrero Jose').byCategory['R:30'].count).toBe(29);
    expect(ed('Guerrero Jose').byCategory['R:32'].count).toBe(34);
    expect(plt.hasReprocess).toBe(true);
    const keys = plt.categories.map((c) => String(c.category_key));
    expect(keys).toEqual(['30', 'R:30', '31', '32', 'R:32']); // "R" solo donde hay reproceso
  });
  test('Reporte Editores: reproceso en columna aparte, con la sub-tasa REPROSS', () => {
    const eff = PlatformReportsEngine.buildEffortReport(rep, library);
    expect(eff.effortGroups).toEqual(expect.arrayContaining(['COMPLIANCE', 'COMPLIANCE REPROSS']));
    const cheo = eff.editors.find((e) => e.editor === 'Guerrero Jose');
    expect(cheo.byGroup.COMPLIANCE).toBeCloseTo(182 * 0.5 + 8 * 2);            // tasa 1
    expect(cheo.byGroup['COMPLIANCE REPROSS']).toBeCloseTo(29 * 0.5 * 0.7 + 34 * 2 * 0.5); // REPROSS: series 0.7, películas 0.5
  });
  test('duración sin categoría registrada: no cuenta y queda en la auditoría', () => {
    const r = PlatformReportsEngine.buildReport([fg('45', 'Dominguez Adair')], null, null, library, 'all');
    expect(r.platforms).toHaveLength(0);
    expect(r.audit.discardedByReason[0]).toMatchObject({ motivo: 'duración sin categoría registrada', values: ['45'] });
  });
  test('sin reproceso en el input no aparecen columnas "R"', () => {
    const r = PlatformReportsEngine.buildReport([fg('30', 'Dominguez Adair'), fg('60', 'Dominguez Adair')], null, null, library, 'all');
    expect(r.platforms[0].hasReprocess).toBe(false);
    expect(r.platforms[0].categories.some((c) => c.isReprocess)).toBe(false);
  });
  test('VERSION con otro texto: no cambia el conteo (manda EFFORT), con alerta', () => {
    const r = PlatformReportsEngine.buildReport([fg('30', 'Dominguez Adair', '', 'Viz Media')], null, null, library, 'all');
    expect(r.platforms[0].totalByCategory['30'].count).toBe(1);
    expect(r.audit.warnings[0]).toMatchObject({ motivo: 'VERSION no reconocida (dato basura; no cambia el conteo, manda EFFORT)' });
  });
  test('REPROSS en VERSION y en EFFORT (input de transición): reproceso, sin alerta', () => {
    const r = PlatformReportsEngine.buildReport([fg('30', 'Dominguez Adair', 'REPROSS', 'REPROSS')], null, null, library, 'all');
    expect(r.platforms[0].totalByCategory['R:30'].count).toBe(1);
    expect(r.audit.warnings).toHaveLength(0);
  });
  test('REPROSS solo en VERSION: ya no marca reproceso; cuenta como nuevo, con alerta y su fila', () => {
    const r = PlatformReportsEngine.buildReport([row({ platform: 'FAST GLOBAL', duration: '30', editor: 'Dominguez Adair', version: 'REPROSS', excelRow: 7 })], null, null, library, 'all');
    expect(r.platforms[0].totalByCategory['30'].count).toBe(1);
    expect(r.platforms[0].hasReprocess).toBe(false);
    expect(r.audit.warnings[0]).toMatchObject({ rows: [7] });
    expect(r.audit.warnings[0].motivo).toMatch(/REPROSS en VERSION pero no en EFFORT/);
  });
});

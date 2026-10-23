/**
 * Cálculo de minutos y horas por lógica, auditoría y filtro de fechas.
 * Cada resultado esperado se puede verificar a mano: minutos ÷ 60 × tasa.
 */
import PlatformReportsEngine from '../reportEngine/PlatformReportsEngine';
import SerieReportsEngine from '../reportEngine/SerieReportsEngine';
import { library, row } from '../__fixtures__/library';

const evalRow = (r, lib = library) => PlatformReportsEngine.evaluateRow(r, lib);
const build = (rows, lib = library, from = null, to = null, field = 'all') =>
  PlatformReportsEngine.buildReport(rows, from, to, lib, field);

describe('Con versión (LATAM / BRAZIL / IBERIA)', () => {
  test('versión registrada: minutos de su categoría × tasa de la categoría', () => {
    expect(evalRow(row({ platform: 'LATAM', version: 'LAT_ORI_HD 3' }))).toEqual({ minutes: 30, hours: 0.5 * 1.75 });
  });
  test('BRA_ va a BRAZIL y usa las categorías de LATAM', () => {
    const rep = build([row({ platform: 'LATAM', version: 'BRA_ORI_HD 5' })]);
    expect(rep.platforms[0].platform).toBe('BRAZIL');
    expect(evalRow(row({ platform: 'LATAM', version: 'BRA_ORI_HD 5' }))).toEqual({ minutes: 60, hours: 1.5 });
  });
  test('versión no registrada en LATAM: NO se cuenta ni se estima; queda en la auditoría', () => {
    const r = row({ platform: 'LATAM', version: 'LAT_NUEVA_HD 9' });
    expect(evalRow(r)).toEqual({ minutes: 0, hours: 0 });
    const rep = build([r]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.unregisteredVersionsDiscarded).toEqual(['LAT_NUEVA_HD 9']);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ platform: 'LATAM', motivo: 'versión no registrada — créala en Librerías → Versiones' });
  });
  test('IBERIA no registrada: no cuenta y queda en auditoría con su motivo', () => {
    const r = row({ platform: 'IBERIA', version: 'p- CODIGO NUEVO' });
    expect(evalRow(r)).toEqual({ minutes: 0, hours: 0 });
    const rep = build([r]);
    expect(rep.audit.unregisteredVersionsDiscarded).toEqual(['p- CODIGO NUEVO']);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ platform: 'IBERIA', motivo: 'versión no registrada — créala en Librerías → Versiones', count: 1 });
  });
});

describe('Lógica eliminada (SEASON)', () => {
  const legacy = { ...library, platforms: [...library.platforms, { id: 99, name: 'ANTIGUA', logica: 'logica_sin_version', effortGroup: 'X', categorias: [] }] };
  test('una plataforma con la lógica antigua no cuenta y la Auditoría dice por qué', () => {
    const rep = build([row({ platform: 'ANTIGUA', season: '2', duration: '60', excelRow: 3 })], legacy);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ platform: 'ANTIGUA', rows: [3] });
    expect(rep.audit.discardedByReason[0].motivo).toMatch(/ya no existe/);
  });
});

describe('AMAZON (DURATION exacta: 30, 60 o 120, solo tasa estándar)', () => {
  test('30 serie × 2.7, 60 serie × 2, 120 película × 1.6', () => {
    expect(evalRow(row({ platform: 'AMAZON', duration: '30' })).hours).toBeCloseTo(0.5 * 2.7);
    expect(evalRow(row({ platform: 'AMAZON', duration: '60' }))).toEqual({ minutes: 60, hours: 2 });
    expect(evalRow(row({ platform: 'AMAZON', duration: '120' })).hours).toBeCloseTo(2 * 1.6);
  });
  test('una duración que no es exacta (45) no cuenta: Auditoría', () => {
    const rep = build([row({ platform: 'AMAZON', duration: '45', excelRow: 5 })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ platform: 'AMAZON', motivo: 'duración sin categoría registrada', rows: [5] });
  });
  test('AMAZON no tiene MC ni PR: esa fila va a Auditoría', () => {
    const rep = build([row({ platform: 'AMAZON', duration: '60', effort: 'MC' })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ platform: 'AMAZON', values: ['MC'] });
  });
});

describe('SONY ONE (DURATION por rangos; EFFORT PR / MC o tasa estándar)', () => {
  test('10 a 30 → cuenta 30 min', () => {
    expect(evalRow(row({ platform: 'SONY ONE', duration: '10', effort: 'PR' }))).toEqual({ minutes: 30, hours: 0.5 * 0.1 });
    expect(evalRow(row({ platform: 'SONY ONE', duration: '30', effort: 'MC' }))).toEqual({ minutes: 30, hours: 0.5 * 0.2 });
  });
  test('40 a 60 → cuenta 60 min', () => {
    expect(evalRow(row({ platform: 'SONY ONE', duration: '40', effort: 'PR' })).minutes).toBe(60);
    expect(evalRow(row({ platform: 'SONY ONE', duration: '60', effort: 'PR' })).minutes).toBe(60);
  });
  test('100 a 240 → cuenta 120 min', () => {
    expect(evalRow(row({ platform: 'SONY ONE', duration: '100', effort: 'PR' })).minutes).toBe(120);
    expect(evalRow(row({ platform: 'SONY ONE', duration: '240', effort: 'PR' })).minutes).toBe(120);
  });
  test('sin EFFORT usa la tasa estándar de la casilla', () => {
    expect(evalRow(row({ platform: 'SONY ONE', duration: '20' }))).toEqual({ minutes: 30, hours: 0.5 * 1 });
    expect(evalRow(row({ platform: 'SONY ONE', duration: '45' }))).toEqual({ minutes: 60, hours: 1 * 1.5 });
    expect(evalRow(row({ platform: 'SONY ONE', duration: '120' }))).toEqual({ minutes: 120, hours: 2 * 3 });
  });
  test('PR: tasa por casilla (−90 / −84 / −83 %)', () => {
    expect(evalRow(row({ platform: 'SONY ONE', duration: '20', effort: 'PR' })).hours).toBeCloseTo(0.5 * 0.1);
    expect(evalRow(row({ platform: 'SONY ONE', duration: '45', effort: 'PR' })).hours).toBeCloseTo(1 * 0.16);
    expect(evalRow(row({ platform: 'SONY ONE', duration: '120', effort: 'PR' })).hours).toBeCloseTo(2 * 0.17);
  });
  test('MC: −80 % en las tres casillas', () => {
    [['20', 0.5], ['45', 1], ['120', 2]].forEach(([d, h]) => {
      expect(evalRow(row({ platform: 'SONY ONE', duration: d, effort: 'MC' })).hours).toBeCloseTo(h * 0.2);
    });
  });
  test('EFFORT que no es PR ni MC: no cuenta, Auditoría', () => {
    expect(evalRow(row({ platform: 'SONY ONE', duration: '45', effort: 'XX' }))).toEqual({ minutes: 0, hours: 0 });
  });
  test('entre rangos se redondea a la banda más cercana y queda como alerta', () => {
    expect(evalRow(row({ platform: 'SONY ONE', duration: '36', effort: 'PR' })).minutes).toBe(60);
    expect(evalRow(row({ platform: 'SONY ONE', duration: '34', effort: 'PR' })).minutes).toBe(30);
    expect(evalRow(row({ platform: 'SONY ONE', duration: '75', effort: 'PR' })).minutes).toBe(60);
    expect(evalRow(row({ platform: 'SONY ONE', duration: '90', effort: 'PR' })).minutes).toBe(120);
    expect(build([row({ platform: 'SONY ONE', duration: '75', effort: 'PR' })]).audit.warnings[0]).toMatchObject({ motivo: 'DURATION entre rangos — se contó en la banda más cercana' });
  });
  test('vacío, 5 o 300 no se adivinan: no cuentan', () => {
    ['', '5', '300'].forEach((d) => {
      expect(evalRow(row({ platform: 'SONY ONE', duration: d, effort: 'PR' }))).toEqual({ minutes: 0, hours: 0 });
    });
  });
});

describe('Por duración y por conteo', () => {
  test('por_duracion acepta "30" y "00:45:00"', () => {
    expect(evalRow(row({ platform: 'GSN VOD', duration: '30' }))).toEqual({ minutes: 30, hours: 0.5 * 1.5 });
    expect(evalRow(row({ platform: 'GSN VOD', duration: '00:45:00' }))).toEqual({ minutes: 45, hours: 0.75 * 1.5 });
  });
  test('por_duracion con texto en DURATION no cuenta y dice el valor', () => {
    const rep = build([row({ platform: 'GSN VOD', duration: 'REPROSS' })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ motivo: 'DURATION no es un número de minutos', values: ['REPROSS'] });
  });
  test('BP&I: minutos ÷ 60 × tasa', () => {
    expect(evalRow(row({ platform: 'BP&I', duration: '30' }))).toEqual({ minutes: 30, hours: 0.5 * 2 });
  });
  test('COMERCIALES: horas por pieza × tasa (pendiente reunión TQC)', () => {
    expect(evalRow(row({ platform: 'COMERCIALES', duration: '00:00:30:00' }))).toEqual({ minutes: 0.5, hours: 1.25 });
  });
  test('YOUTUBE: (clips + shorts) × tasa', () => {
    expect(evalRow(row({ platform: 'YOUTUBE', clip: '2', short: '1' }))).toEqual({ minutes: 0, hours: 3 * 0.5 });
  });
});

describe('Tasas', () => {
  test('acepta decimales como 0.30', () => {
    const lib = { ...library, categories: library.categories.map((c) => (c.id === 10 ? { ...c, effortRate: 0.3 } : c)) };
    expect(evalRow(row({ platform: 'LATAM', version: 'LAT_ORI_HD 3' }), lib).hours).toBeCloseTo(0.5 * 0.3);
  });
  test('dato viejo sin tasa: el cálculo usa el estándar 1', () => {
    const lib = { ...library, categories: library.categories.map((c) => (c.id === 10 ? { ...c, effortRate: null } : c)) };
    expect(evalRow(row({ platform: 'LATAM', version: 'LAT_ORI_HD 3' }), lib).hours).toBe(0.5);
  });
});

describe('Ninguna fila se pierde o queda en 0 sin aviso (R2-1)', () => {
  test('LATAM sin VERSION: no cuenta y sale en descartadas (no en "estimadas")', () => {
    const rep = build([row({ platform: 'LATAM', version: '' })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.unregisteredVersionsDiscarded).toEqual([]);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ platform: 'LATAM', motivo: 'sin VERSION' });
  });
  test('BP&I acepta tiempo "00:30:00"', () => {
    expect(evalRow(row({ platform: 'BP&I', duration: '00:30:00' }))).toEqual({ minutes: 30, hours: 0.5 * 2 });
  });
  test('BP&I con texto o vacía: no cuenta y sale en la auditoría', () => {
    const rep = build([row({ platform: 'BP&I', duration: 'REPROSS' }), row({ platform: 'BP&I', duration: '' })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason.map((d) => d.motivo).sort()).toEqual(['DURATION no es un número de minutos', 'sin DURATION']);
  });
  test('tiempo con minutos o segundos mayores a 59 (00:90:00): aviso con su motivo', () => {
    const rep = build([row({ platform: 'GSN VOD', duration: '00:90:00' })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ motivo: 'DURATION con tiempo inválido (minutos o segundos mayores a 59)', values: ['00:90:00'] });
    const com = build([row({ platform: 'COMERCIALES', duration: '00:00:90:00' })]);
    expect(com.audit.warnings[0]).toMatchObject({ motivo: 'DURATION con tiempo inválido (minutos o segundos mayores a 59)' });
  });
  test('COMERCIALES con DURATION fuera de formato: se cuenta por pieza, con alerta', () => {
    const rep = build([
      row({ platform: 'COMERCIALES', duration: '30' }),
      row({ platform: 'COMERCIALES', duration: '' }),
      row({ platform: 'COMERCIALES', duration: '00:00:90:00' }),
      row({ platform: 'COMERCIALES', duration: '00:00:30:00' }),
    ]);
    expect(rep.platforms[0].totalCount).toBe(4);
    expect(rep.audit.warnings.map((w) => w.count).reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('Reporte Editores: solo columnas de lo que trae el input', () => {
  test('grupos de plataformas que no vienen en el input no aparecen', () => {
    const rows = [row({ platform: 'LATAM', version: 'LAT_ORI_HD 3' }), row({ platform: 'GSN VOD', duration: '30' })];
    const eff = PlatformReportsEngine.buildEffortReport(build(rows), library);
    expect(eff.effortGroups).toEqual(['LATAM', 'COMPLIANCE']);
  });
  test('plataforma sin grupo: su columna OTROS se muestra (sus horas suman al total)', () => {
    const lib = { ...library, platforms: library.platforms.map((p) => (p.name === 'GSN VOD' ? { ...p, effortGroup: '' } : p)) };
    const eff = PlatformReportsEngine.buildEffortReport(build([row({ platform: 'GSN VOD', duration: '30' })], lib), lib);
    expect(eff.effortGroups).toEqual(['OTROS']);
    expect(eff.editors[0].byGroup.OTROS).toBeCloseTo(0.75);
  });
});

describe('Auditoría con número de fila del Excel', () => {
  test('editor no registrado (orden invertido): no cuenta y dice en qué filas está', () => {
    const rep = build([
      row({ platform: 'GSN VOD', duration: '30', editor: 'Jose Guerrero', excelRow: 12 }),
      row({ platform: 'GSN VOD', duration: '30', editor: 'Jose Guerrero', excelRow: 13 }),
      row({ platform: 'GSN VOD', duration: '30', editor: 'GUERRERO JOSE', excelRow: 14 }),
    ]);
    expect(rep.platforms[0].editors.map((e) => e.editor)).toEqual(['Guerrero Jose']);
    expect(rep.audit.discardedByReason[0]).toMatchObject({
      motivo: 'editor no registrado — corregir en el input (Apellido Nombre)', values: ['Jose Guerrero'], rows: [12, 13],
    });
  });
  test('sin EDITOR: no cuenta, con su fila', () => {
    const rep = build([row({ platform: 'GSN VOD', duration: '30', editor: '', excelRow: 7 })]);
    expect(rep.audit.discardedByReason[0]).toMatchObject({ motivo: 'sin EDITOR', rows: [7] });
  });
  test('fecha inválida y DURATION mala también dicen la fila', () => {
    const rep = build([
      row({ platform: 'GSN VOD', duration: 'NAN', excelRow: 20 }),
      row({ platform: 'GSN VOD', duration: '30', date: '25/06/2026', excelRow: 21 }),
    ]);
    expect(rep.audit.discardedByReason[0].rows).toEqual([20]);
    expect(rep.audit.invalidApprovedDates[0]).toMatchObject({ value: '25/06/2026', rows: [21] });
  });
  test('registros procesados = filas que sí se contaron dentro del período', () => {
    const rows = [
      row({ platform: 'GSN VOD', duration: '30', date: '06/01/2026' }),
      row({ platform: 'GSN VOD', duration: '30', date: '06/20/2026' }),
      row({ platform: 'GSN VOD', duration: 'NAN', date: '06/02/2026' }),
    ];
    const rep = build(rows, library, '2026-06-01', '2026-06-05', 'approved_date');
    expect(rep.rowsInRange).toBe(2);
    expect(rep.countedRows).toBe(1);
  });
});

describe('Plataforma no registrada', () => {
  test('no cuenta y aparece en auditoría', () => {
    const rep = build([row({ platform: 'NETFLIX', duration: '30' })]);
    expect(rep.platforms).toHaveLength(0);
    expect(rep.audit.unregisteredPlatforms).toEqual(['NETFLIX']);
  });
});

describe('Filtro de fechas', () => {
  const rows = [
    row({ platform: 'GSN VOD', duration: '30', date: '06/01/2026' }),
    row({ platform: 'GSN VOD', duration: '30', date: '06/15/2026' }),
    row({ platform: 'GSN VOD', duration: '30', date: '06/30/2026' }),
  ];
  const count = (rep) => rep.platforms.reduce((s, p) => s + p.totalCount, 0);
  test('junio completo trae las 3 filas; enero ninguna', () => {
    expect(count(build(rows, library, '2026-06-01', '2026-06-30', 'approved_date'))).toBe(3);
    expect(count(build(rows, library, '2026-01-01', '2026-01-31', 'approved_date'))).toBe(0);
  });
  test('el último día del rango se incluye completo', () => {
    expect(count(build(rows, library, '2026-06-15', '2026-06-15', 'approved_date'))).toBe(1);
  });
  test('filas sin fecha válida: se avisan; con "todos" cuentan, con rango no', () => {
    const bad = [...rows, row({ platform: 'GSN VOD', duration: '30', date: '' }), row({ platform: 'GSN VOD', duration: '30', date: '25/06/2026' })];
    const all = build(bad);
    expect(count(all)).toBe(5);
    expect(all.audit.invalidApprovedDates).toEqual(expect.arrayContaining([expect.objectContaining({ value: '', count: 1 }), expect.objectContaining({ value: '25/06/2026', count: 1 })]));
    expect(count(build(bad, library, '2026-06-01', '2026-06-30', 'approved_date'))).toBe(3);
  });
});

describe('Reporte Series = misma tasa que Editores', () => {
  test('las horas de una serie son la suma de las horas de sus filas en Editores', () => {
    const rows = [
      row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', serie: 'Serie A', hn: '1' }),
      row({ platform: 'AMAZON', duration: '60', serie: 'Serie A', hn: '2' }),
      row({ platform: 'GSN VOD', duration: '60', serie: 'Serie B', hn: '3' }),
    ];
    const series = SerieReportsEngine.buildReport(rows, null, null, 'all', library);
    const a = series.series.find((s) => s.serie === 'Serie A');
    expect(a.totalEffortHours).toBeCloseTo(0.5 * 1.75 + 1 * 2);
    expect(a.hnCount).toBe(2);
    const effort = PlatformReportsEngine.buildEffortReport(build(rows), library);
    const editorsTotal = effort.editors.reduce((s, e) => s + Object.values(e.byGroup).reduce((x, y) => x + y, 0), 0);
    expect(series.grandEffortHours).toBeCloseTo(editorsTotal);
  });
});

describe('Reporte Series: solo cuenta lo que cuentan los otros reportes', () => {
  test('una fila descartada (editor sin registrar) no suma ni como asset ni con su HN', () => {
    const rows = [
      row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', serie: 'Serie A', hn: '1' }),
      row({ platform: 'LATAM', version: 'LAT_ORI_HD 3', serie: 'Serie B', hn: '9', editor: 'Nadie Registrado' }),
    ];
    const series = SerieReportsEngine.buildReport(rows, null, null, 'all', library);
    expect(series.series.map((x) => x.serie)).toEqual(['Serie A']);
    expect(series.grandCount).toBe(1);
    expect(series.series[0].hns).toEqual(['1']);
    expect(PlatformReportsEngine.evaluateRowDetail(rows[1], library).counted).toBe(false);
  });
});

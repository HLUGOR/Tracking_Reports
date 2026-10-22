/**
 * Lectura del Excel de entrada (ExcelParser): número de fila y celdas "NAN".
 */
import * as XLSX from 'xlsx';
import ExcelParser from '../excel/ExcelParser';

const excelFile = (aoa) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], 'input.xlsx');
};

test('cada fila guarda su número de fila del Excel y "NAN" se lee como celda vacía', async () => {
  const file = excelFile([
    ['PLATFORM', 'EDITOR', 'DURATION'],
    ['GSN VOD', 'Guerrero Jose', '30'],
    ['GSN VOD', 'nan', 'NAN'],
  ]);
  const { rows } = await ExcelParser.parseFile(file);
  expect(rows).toEqual([
    { __row: 2, PLATFORM: 'GSN VOD', EDITOR: 'Guerrero Jose', DURATION: '30' },
    { __row: 3, PLATFORM: 'GSN VOD', EDITOR: '', DURATION: '' },
  ]);
});

test('encabezados sin distinguir mayúsculas: "Duration" / "effort" también se leen como DURATION / EFFORT', async () => {
  const file = excelFile([
    ['Platform', 'Editor', 'Duration', 'effort'],
    ['FAST GLOBAL', 'Guerrero Jose', '30', '2p repross'],
  ]);
  const { rows } = await ExcelParser.parseFile(file);
  expect(rows[0]).toMatchObject({ PLATFORM: 'FAST GLOBAL', EDITOR: 'Guerrero Jose', DURATION: '30', EFFORT: '2p repross' });
  expect(rows[0]).toMatchObject({ Platform: 'FAST GLOBAL', Duration: '30' }); // el nombre original se conserva
});

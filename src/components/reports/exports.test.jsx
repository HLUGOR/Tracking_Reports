/**
 * Excel descargados: Resumen de Plataformas (una columna por duración) y Horas de Esfuerzo
 * de Editores (promedio por editor y % como número).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import libraryStore from '../../store/libraryStore';
import excelStore from '../../store/excelStore';
import uiStore from '../../store/uiStore';
import PlatformReportsView from './PlatformReportsView';
import EditorReportsView from './EditorReportsView';
import { library, row } from '../../core/__fixtures__/library';

jest.mock('react-chartjs-2', () => {
  const React = require('react');
  return { Bar: React.forwardRef(() => null) };
});

let lastBlob = null;
beforeAll(() => {
  global.URL.createObjectURL = (b) => { lastBlob = b; return 'blob:x'; };
  global.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() {};
});
beforeEach(() => {
  lastBlob = null;
  uiStore.setState({ language: 'es' });
  libraryStore.getState().importLibraryData(JSON.parse(JSON.stringify(library)));
  excelStore.getState().setExcelRows([
    row({ platform: 'LATAM', version: 'LAT_ORI_HD 3' }),                  // serie (30 min) de LATAM
    row({ platform: 'AMAZON', duration: '30' }),                          // Series (30 min) de AMAZON
    row({ platform: 'AMAZON', duration: '60', editor: 'Guerrero Jose' }), // Series (60 min) de AMAZON
    row({ platform: 'IBERIA', version: 'p- F HD IBERIA', editor: 'Guerrero Jose' }), // serie (60 min) de IBERIA
  ]);
});

const sheetsOf = () => new Promise((resolve) => {
  const fr = new FileReader();
  fr.onload = () => {
    const wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
    const out = {};
    wb.SheetNames.forEach((n) => { out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }); });
    resolve(out);
  };
  fr.readAsArrayBuffer(lastBlob);
});

test('Resumen de Plataformas: las categorías de la misma duración suman en una sola columna', async () => {
  render(<PlatformReportsView />);
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'all' } });
  fireEvent.click(screen.getByText(/Generar Reporte/));
  await waitFor(() => screen.getByText(/Total registros procesados/));
  fireEvent.click(screen.getByText(/Descargar Excel/));
  await waitFor(() => expect(lastBlob).not.toBeNull());
  const resumen = (await sheetsOf()).Summary;
  const hdr = resumen[3];
  expect(hdr).toEqual(['Platform', '30 min', '60 min', 'Minutes', 'Total']); // sin "serie"/"Series"/"Cat" repetidas
  const latam = resumen.find((r) => r[0] === 'LATAM');
  const amazon = resumen.find((r) => r[0] === 'AMAZON');
  expect(latam.slice(1, 3)).toEqual([1, 0]);
  expect(amazon.slice(1, 3)).toEqual([1, 1]);
  expect(resumen.find((r) => r[0] === 'GRAND TOTAL').slice(1, 3)).toEqual([2, 2]); // 30 min: LATAM+AMAZON; 60 min: AMAZON+IBERIA
});

test('Editores: el Excel trae el promedio por editor y el % como número', async () => {
  render(<EditorReportsView />);
  fireEvent.click(screen.getByText(/Generar Reporte/));
  await waitFor(() => screen.getByText('Total Editores'));
  // pantalla: la fila de promedio muestra números, no solo la etiqueta
  const avgRow = screen.getByText('Promedio por editor').closest('tr');
  expect(avgRow.querySelectorAll('td').length).toBeGreaterThan(3);
  expect(avgRow.textContent).toMatch(/%/);
  fireEvent.click(screen.getByText(/Descargar Excel/));
  await waitFor(() => expect(lastBlob).not.toBeNull());
  const sheet = (await sheetsOf())['Effort Hours'];
  const hdr = sheet[3];
  const nGroups = hdr.length - 4;
  const editorRows = sheet.slice(4, sheet.length - 2);
  const avgExcel = sheet[sheet.length - 1];
  expect(avgExcel[0]).toBe('Average per editor');
  const occIdx = nGroups + 2;
  editorRows.forEach((r) => expect(typeof r[occIdx]).toBe('number')); // % Ocupación numérico
  const mean = editorRows.reduce((s, r) => s + r[occIdx], 0) / editorRows.length;
  expect(avgExcel[occIdx]).toBeCloseTo(mean, 1);
});

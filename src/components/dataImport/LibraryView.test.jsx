/**
 * Prueba de pantalla: Librerías → Plataformas (plataforma = nivel principal; sus
 * categorías y tasas se ven al desplegarla).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import LibraryView from './LibraryView';
import libraryStore from '../../store/libraryStore';
import { library } from '../../core/__fixtures__/library';

beforeEach(() => {
  libraryStore.getState().importLibraryData(JSON.parse(JSON.stringify({
    ...library,
    platforms: library.platforms.map((p) => (p.name === 'LATAM' ? { ...p, displayName: 'LATAM & Brasil Networks' } : p)),
  })));
});

test('sin pestaña Categorías; la lista de plataformas no amontona tasas', () => {
  render(<LibraryView />);
  expect(screen.queryByText(/📂 Categorías/)).not.toBeInTheDocument();
  const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
  expect(headers).toEqual(['', 'Plataforma', 'Lógica', 'Categorías', 'Configuración', 'Acciones']);
  const latam = screen.getByText('LATAM & Brasil Networks').closest('tr');
  expect(within(latam).getByText('en el input: LATAM')).toBeInTheDocument();
  expect(within(latam).getByText('3 categorías')).toBeInTheDocument();
  expect(screen.queryByText('CEN')).not.toBeInTheDocument(); // sub-tasas solo al desplegar
  expect(screen.queryByText('Tasa estándar')).not.toBeInTheDocument(); // cerrada
});

test('al desplegar una plataforma se ven sus categorías con tasa estándar y EFFORT', () => {
  render(<LibraryView />);
  fireEvent.click(screen.getByText('LATAM & Brasil Networks'));
  const sub = screen.getByText('Tasa estándar').closest('table');
  expect(within(sub).getAllByRole('columnheader').map((h) => h.textContent))
    .toEqual(['Categoría', 'Duración', 'Tasa estándar', 'Sub-tasas de esfuerzo (EFFORT)', 'Versiones', '', 'CEN']);
  const row30 = within(sub).getByText('30 min').closest('tr');
  expect(within(row30).getByText('1.75')).toBeInTheDocument();
  expect(within(row30).getByText('+75%')).toBeInTheDocument();
  expect(within(row30).getByText('2')).toBeInTheDocument();
  expect(within(row30).getByText('+100%')).toBeInTheDocument();
});

test('las categorías se crean desde su plataforma', () => {
  render(<LibraryView />);
  fireEvent.click(screen.getByText('LATAM & Brasil Networks'));
  fireEvent.click(screen.getByText('➕ Nueva categoría para LATAM & Brasil Networks'));
  expect(screen.getByText('Nueva categoría')).toBeInTheDocument();
});

test('editar plataforma: ayuda oculta tras la "i" y una tabla de tasas con EFFORT', () => {
  render(<LibraryView />);
  const latamRow = screen.getByText('LATAM & Brasil Networks').closest('tr');
  fireEvent.click(within(latamRow).getByTitle('Editar plataforma y sus tasas'));
  expect(screen.getByText(/Editar plataforma — LATAM & Brasil Networks/)).toBeInTheDocument();
  expect(screen.queryByText(/Es el texto de la columna PLATFORM/)).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByTitle('Ver información')[0]);
  expect(screen.getByText(/Es el texto de la columna PLATFORM/)).toBeInTheDocument();
  const table = screen.getByText('➕ Sub-tasa').closest('table');
  expect(within(table).getByDisplayValue('CEN')).toBeInTheDocument();
});

test('editar categoría muestra estándar + sub-tasas; lo guardado se ve igual en editar plataforma', () => {
  render(<LibraryView />);
  fireEvent.click(screen.getByText('LATAM & Brasil Networks'));
  const sub = screen.getByText('Tasa estándar').closest('table');
  const row30 = within(sub).getByText('30 min').closest('tr');
  fireEvent.click(within(row30).getByTitle('Editar categoría'));
  // Formulario de categoría: Estándar 1.75 y CEN 2
  const catTable = screen.getAllByText('Tasa estándar').map((h) => h.closest('table')).find((t) => within(t).queryByDisplayValue('1.75'));
  expect(within(catTable).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Tasa estándar', 'Sub-tasas de esfuerzo (EFFORT)', 'CEN']);
  const cenInput = within(catTable).getByDisplayValue('2');
  fireEvent.change(cenInput, { target: { value: '2.2' } });
  fireEvent.click(screen.getByText('Guardar'));
  // Guardado en la plataforma (misma fuente que Editar plataforma)
  const latam = libraryStore.getState().platforms.find((p) => p.name === 'LATAM');
  expect(latam.effortRates[0].rates['10']).toBe(2.2);
  const latamRow = screen.getByText('LATAM & Brasil Networks').closest('tr');
  fireEvent.click(within(latamRow).getByTitle('Editar plataforma y sus tasas'));
  const platTable = screen.getByText('➕ Sub-tasa').closest('table');
  expect(within(platTable).getByDisplayValue('2.2')).toBeInTheDocument();
});

test('segmentos: resumen en una línea; al editar, agrupados por duración', () => {
  libraryStore.getState().importLibraryData({ ...library, suffixRules: undefined });
  render(<LibraryView />);
  fireEvent.click(screen.getByText(/📦 Versiones/));
  expect(screen.getByText('1-4 → 30 min, 5-6 → 60 min, 9-10 → 120 min')).toBeInTheDocument();
  fireEvent.click(screen.getByText('✏️ Editar'));
  const row120 = screen.getByText('120 min').parentElement;
  fireEvent.change(within(row120).getByPlaceholderText('nº'), { target: { value: '11' } });
  fireEvent.click(within(row120).getByText('➕'));
  expect(libraryStore.getState().suffixRules.some((r) => r.number === 11 && r.duration === 120)).toBe(true);
  window.confirm = () => true;
  fireEvent.click(within(screen.getByText('120 min').parentElement).getByTitle('Quitar 11 segmentos'));
  expect(libraryStore.getState().suffixRules.some((r) => r.number === 11)).toBe(false);
});

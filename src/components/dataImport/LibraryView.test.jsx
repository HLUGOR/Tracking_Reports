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

test('editar plataforma existente: agregar una categoría nueva desde el editor', () => {
  render(<LibraryView />);
  const latamRow = screen.getByText('LATAM & Brasil Networks').closest('tr');
  fireEvent.click(within(latamRow).getByTitle('Editar plataforma y sus tasas'));
  const before = libraryStore.getState().categories.filter((c) => c.platformId === 1).length;
  fireEvent.change(screen.getByPlaceholderText('Nombre (ej. serie, pelicula)'), { target: { value: 'especial' } });
  fireEvent.change(screen.getByPlaceholderText('min'), { target: { value: '90' } });
  expect(screen.getByText('especial (90 min)')).toBeInTheDocument(); // vista previa del nombre
  fireEvent.click(screen.getByText('➕ Agregar'));
  const cats = libraryStore.getState().categories.filter((c) => c.platformId === 1);
  expect(cats).toHaveLength(before + 1);
  expect(cats.find((c) => c.name === 'especial (90 min)')).toMatchObject({ duration: 90, effortRate: 1 });
  // aparece como fila nueva en la tabla de tasas del editor
  const table = screen.getByText('➕ Sub-tasa').closest('table');
  expect(within(table).getByText('especial')).toBeInTheDocument();
});

describe('Versiones: una sola librería para todas las plataformas con versiones', () => {
  const openVersions = () => {
    render(<LibraryView />);
    fireEvent.click(screen.getByText(/Versiones \(/));
  };

  test('una lista única, sin pestañas ni columnas de plataforma o lógica', () => {
    openVersions();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText(/no necesitan versiones/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lógica')).not.toBeInTheDocument();
    expect(screen.queryByText('Plataforma')).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Nombre', 'Categoría', 'Duración', 'Acciones']);
  });

  test('Nueva Versión no pregunta la plataforma: nombre y categoría con botones', () => {
    openVersions();
    fireEvent.click(screen.getByText('➕ Nueva Versión'));
    expect(screen.getByText('Nueva versión')).toBeInTheDocument();
    expect(screen.queryByText('Selecciona una plataforma')).not.toBeInTheDocument();
    expect(screen.getByText('1. Nombre de la versión')).toBeInTheDocument();
    expect(screen.getByText(/2\. Categoría/)).toBeInTheDocument();
    expect(screen.getByText(/➕ Crear categoría/)).toBeInTheDocument();
  });

  test('al elegir categoría se guarda con la plataforma de esa categoría', () => {
    openVersions();
    const before = libraryStore.getState().versions.length;
    fireEvent.click(screen.getByText('➕ Nueva Versión'));
    fireEvent.change(screen.getByPlaceholderText('Ej: BRA_SAP_CC_SQZ_HD 5'), { target: { value: 'LAT_NUEVA_HD 3' } });
    const pill = screen.getAllByRole('button', { pressed: false }).find((b) => /30 min/.test(b.textContent) && /serie/i.test(b.textContent));
    fireEvent.click(pill);
    fireEvent.click(screen.getByText('Guardar'));
    const created = libraryStore.getState().versions.find((v) => v.name === 'LAT_NUEVA_HD 3');
    expect(libraryStore.getState().versions.length).toBe(before + 1);
    expect(created.platformId).toBeTruthy();
    expect(created.duration).toBe(30);
  });
});

test('versión con segmentos que no están en la tabla: se agregan desde el mismo aviso', () => {
  window.confirm = jest.fn(() => true);
  render(<LibraryView />);
  fireEvent.click(screen.getByText(/Versiones \(/));
  fireEvent.click(screen.getByText('➕ Nueva Versión'));
  fireEvent.change(screen.getByPlaceholderText('Ej: BRA_SAP_CC_SQZ_HD 5'), { target: { value: 'BRA_SUB_HD 12' } });
  expect(screen.getByText(/no está en la tabla/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('➕ 120 min'));
  expect(window.confirm).toHaveBeenCalled();
  expect(libraryStore.getState().suffixRules.some((r) => r.number === 12 && r.duration === 120)).toBe(true);
  expect(screen.queryByText(/no está en la tabla/)).not.toBeInTheDocument();
  expect(screen.getByText(/12 segmentos/)).toBeInTheDocument();
});

test('buscar plataforma filtra la lista por nombre o grupo, sin mayúsculas', () => {
  render(<LibraryView />);
  expect(screen.getByText('SONY ONE')).toBeInTheDocument();
  const box = screen.getByPlaceholderText(/Buscar plataforma/);
  fireEvent.change(box, { target: { value: 'sony' } });
  expect(screen.getByText('SONY ONE')).toBeInTheDocument();
  expect(screen.queryByText('LATAM & Brasil Networks')).not.toBeInTheDocument();
  fireEvent.change(box, { target: { value: 'zzz' } });
  expect(screen.getByText(/No se encontró ninguna plataforma/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('✕'));
  expect(screen.getByText('LATAM & Brasil Networks')).toBeInTheDocument();
});

test('editar plataforma: se cambia la lógica con tarjetas y se agregan categorías con su tasa y sub-tasas', () => {
  render(<LibraryView />);
  const row = screen.getByText('SONY ONE').closest('tr');
  fireEvent.click(within(row).getByTitle('Editar plataforma y sus tasas'));
  const modal = within(document.querySelector('.form-modal'));
  expect(modal.getByText('Rangos de duración (30 / 60 / 120)')).toBeInTheDocument(); // lógica actual, con su nombre
  expect(modal.getByText(/DURATION se agrupa/)).toBeInTheDocument(); // explicación visible
  expect(screen.queryByText('➕ Nueva categoría')).not.toBeInTheDocument(); // rangos: 3 casillas fijas
  fireEvent.click(screen.getByText('Cambiar lógica'));
  expect(modal.getByText('Por versión registrada (códigos IBERIA)')).toBeInTheDocument();
  expect(modal.queryByText('logica_sin_version')).not.toBeInTheDocument(); // SEASON ya no existe
  fireEvent.click(modal.getByText('Categorías por duración exacta'));
  expect(screen.getByText('➕ Nueva categoría')).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Nombre (ej. serie, pelicula)'), { target: { value: 'Series' } });
  fireEvent.change(screen.getByPlaceholderText('min'), { target: { value: '30' } });
  fireEvent.change(screen.getByPlaceholderText('Tasa'), { target: { value: '2.7' } });
  fireEvent.click(screen.getByText('➕ Agregar'));
  const plat = libraryStore.getState().platforms.find((p) => p.name === 'SONY ONE');
  const cat = libraryStore.getState().categories.find((c) => String(c.platformId) === String(plat.id));
  expect(cat).toMatchObject({ name: 'Series (30 min)', duration: 30, effortRate: 2.7 });
  expect(screen.getByDisplayValue('2.7')).toBeInTheDocument(); // aparece como fila de la tabla de tasas
});

test('plataforma con la lógica eliminada: se ve marcada y pide elegir otra', () => {
  libraryStore.getState().importLibraryData(JSON.parse(JSON.stringify({
    ...library,
    platforms: [...library.platforms, { id: 99, name: 'ANTIGUA', logica: 'logica_sin_version', effortGroup: 'X', categorias: [] }],
  })));
  render(<LibraryView />);
  const row = screen.getByText('ANTIGUA').closest('tr');
  expect(within(row).getByText(/logica_sin_version \(ya no existe\)/)).toBeInTheDocument();
  fireEvent.click(within(row).getByTitle('Editar plataforma y sus tasas'));
  expect(screen.getByText(/ya no existe\. Elige una nueva/)).toBeInTheDocument();
});

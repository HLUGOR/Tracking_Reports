/**
 * Librería guardada: números internos (ids) únicos y conversión de respaldos viejos.
 */
import libraryStore from '../../store/libraryStore';

describe('Números internos de las versiones', () => {
  test('crear muchas versiones de golpe no repite números', () => {
    for (let i = 0; i < 2000; i++) libraryStore.getState().addVersion({ name: `V ${i}` });
    const ids = libraryStore.getState().versions.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Number.isSafeInteger)).toBe(true);
  });

  test('restaurar un respaldo con números repetidos o demasiado grandes los repara', () => {
    libraryStore.getState().importLibraryData({
      platforms: [], categories: [],
      versions: [
        { id: 17755181722770000, name: 'LAT_ORI_HD 1 SONY' },
        { id: 17755181722770000, name: 'LAT_ORI_SQZ_HD 4' },
        { id: 5, name: 'A' },
        { id: 5, name: 'B' },
      ],
    });
    const vs = libraryStore.getState().versions;
    expect(new Set(vs.map((v) => v.id)).size).toBe(4);
    expect(vs.every((v) => Number.isSafeInteger(v.id))).toBe(true);
    expect(vs.map((v) => v.name)).toEqual(['LAT_ORI_HD 1 SONY', 'LAT_ORI_SQZ_HD 4', 'A', 'B']);
    expect(vs[2].id).toBe(5); // el primero de un número repetido válido lo conserva
  });

  test('editar una versión no toca a otras', () => {
    const [a] = libraryStore.getState().versions;
    libraryStore.getState().updateVersion(a.id, { name: 'EDITADA' });
    expect(libraryStore.getState().versions.filter((v) => v.name === 'EDITADA')).toHaveLength(1);
  });
});

describe('Respaldo con casillas en formato antiguo', () => {
  test('al restaurar conserva la duración de serie y película', () => {
    libraryStore.getState().importLibraryData({
      platforms: [{
        id: 3, name: 'SONY ONE', logica: 'logica_sin_version',
        categorias: ['serie_45min', 'pelicula_120min'], duracion_serie_minutos: 45, duracion_pelicula_minutos: 120,
      }],
      categories: [], versions: [],
    });
    const p = libraryStore.getState().platforms[0];
    expect(p.categorias.map((c) => c.duration)).toEqual([45, 120]);
  });
});

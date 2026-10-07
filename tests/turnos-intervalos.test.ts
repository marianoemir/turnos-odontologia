import { solapan, type Intervalo } from '../src/turnos/intervalos';

const iv = (inicio: string, fin: string): Intervalo => ({
  inicio: new Date(inicio),
  fin: new Date(fin),
});

describe('solapan [inicio,fin)', () => {
  it('detecta solape parcial', () => {
    expect(solapan(iv('2026-10-12T10:00:00-03:00', '2026-10-12T10:30:00-03:00'), iv('2026-10-12T10:15:00-03:00', '2026-10-12T10:45:00-03:00'))).toBe(true);
  });

  it('detecta contenido total', () => {
    expect(solapan(iv('2026-10-12T10:00:00-03:00', '2026-10-12T11:00:00-03:00'), iv('2026-10-12T10:15:00-03:00', '2026-10-12T10:45:00-03:00'))).toBe(true);
  });

  it('NO es solape si uno empieza cuando termina el otro (RN-AG-04)', () => {
    expect(solapan(iv('2026-10-12T10:00:00-03:00', '2026-10-12T10:30:00-03:00'), iv('2026-10-12T10:30:00-03:00', '2026-10-12T11:00:00-03:00'))).toBe(false);
  });

  it('NO es solape con intervalos disjuntos', () => {
    expect(solapan(iv('2026-10-12T10:00:00-03:00', '2026-10-12T10:30:00-03:00'), iv('2026-10-12T11:00:00-03:00', '2026-10-12T11:30:00-03:00'))).toBe(false);
  });
});

import { RepositorioMemoria } from '../src/turnos/repositorio-memoria';
import type { Turno } from '../src/turnos/tipos';

const turno = (id: string): Turno => ({
  id,
  pacienteId: 'pac-1',
  profesionalId: 'prof-1',
  sillonId: 'sil-1',
  prestacionId: 'prest-1',
  inicio: new Date('2026-10-12T10:00:00-03:00'),
  fin: new Date('2026-10-12T10:30:00-03:00'),
  estado: 'pendiente',
});

describe('RepositorioMemoria', () => {
  it('aísla instancias entre sí', () => {
    const a = new RepositorioMemoria();
    const b = new RepositorioMemoria();
    a.guardar(turno('t-1'));
    expect(a.todos()).toHaveLength(1);
    expect(b.todos()).toHaveLength(0);
  });

  it('filtra activos por profesional y por sillón', () => {
    const repo = new RepositorioMemoria();
    repo.guardar(turno('t-1'));
    repo.guardar({ ...turno('t-2'), estado: 'cancelado' });
    expect(repo.activosPorProfesional('prof-1')).toHaveLength(1);
    expect(repo.activosPorSillon('sil-1')).toHaveLength(1);
    expect(repo.activosPorProfesional('prof-otro')).toHaveLength(0);
  });
});

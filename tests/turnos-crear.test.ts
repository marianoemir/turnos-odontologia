import type { Bloqueo, HorarioAtencion, Prestacion, SillonBox } from '../src/agenda/modelos';
import { RepositorioMemoria } from '../src/turnos/repositorio-memoria';
import { ServicioTurnos, type AgendaRef, type CrearTurnoInput } from '../src/turnos/servicio-turnos';
import { ConflictoTurno, InputInvalido } from '../src/turnos/tipos';

const LUNES = '2026-10-12'; // lunes
const PREST_30: Prestacion = { id: 'prest-30', duracionMin: 30 };
const agendaBase = (): AgendaRef => ({
  horarios: [{ profesionalId: 'prof-1', diaSemana: 1, desdeMin: 9 * 60, hastaMin: 18 * 60 }] as HorarioAtencion[],
  bloqueos: [] as Bloqueo[],
  sillones: [{ id: 'sil-1', activo: true }] as SillonBox[],
});

const inputBase = (inicio: string, extra: Partial<CrearTurnoInput> = {}): CrearTurnoInput => ({
  pacienteId: 'pac-1',
  profesionalId: 'prof-1',
  sillonId: 'sil-1',
  prestacion: PREST_30,
  inicio: new Date(inicio),
  ...extra,
});

const crearOk = (svc: ServicioTurnos, inicio: string) =>
  svc.crear(inputBase(inicio), agendaBase());

describe('ServicioTurnos.crear', () => {
  it('crea en pendiente con fin calculado (RN-AG-01)', () => {
    const svc = new ServicioTurnos(new RepositorioMemoria());
    const t = crearOk(svc, `${LUNES}T10:00:00-03:00`);
    expect(t.estado).toBe('pendiente');
    expect(t.fin).toEqual(new Date(`${LUNES}T10:30:00-03:00`));
  });

  it('rechaza solape de profesional sin crear nada (RN-AG-02)', () => {
    const svc = new ServicioTurnos(new RepositorioMemoria());
    crearOk(svc, `${LUNES}T10:00:00-03:00`);
    expect(() => svc.crear(inputBase(`${LUNES}T10:15:00-03:00`), agendaBase())).toThrow(ConflictoTurno);
    try {
      svc.crear(inputBase(`${LUNES}T10:15:00-03:00`), agendaBase());
      fail('debió lanzar');
    } catch (e) {
      expect((e as ConflictoTurno).causa).toBe('profesional');
    }
  });

  it('rechaza sin sillón como inválido y solape de sillón con otro profesional (RN-AG-03)', () => {
    const svc = new ServicioTurnos(new RepositorioMemoria());
    crearOk(svc, `${LUNES}T10:00:00-03:00`);
    expect(() => svc.crear(inputBase(`${LUNES}T11:00:00-03:00`, { sillonId: undefined }), agendaBase())).toThrow(InputInvalido);
    try {
      svc.crear(inputBase(`${LUNES}T10:20:00-03:00`, { profesionalId: 'prof-2' }), {
        ...agendaBase(),
        horarios: [...agendaBase().horarios, { profesionalId: 'prof-2', diaSemana: 1, desdeMin: 9 * 60, hastaMin: 18 * 60 }],
      });
      fail('debió lanzar');
    } catch (e) {
      expect((e as ConflictoTurno).causa).toBe('sillon');
    }
  });

  it('acepta turno encadenado inicio==fin (RN-AG-04)', () => {
    const svc = new ServicioTurnos(new RepositorioMemoria());
    crearOk(svc, `${LUNES}T10:00:00-03:00`);
    const t = crearOk(svc, `${LUNES}T10:30:00-03:00`);
    expect(t.estado).toBe('pendiente');
  });

  it('rechaza fuera de horario y sobre bloqueo (RN-AG-05)', () => {
    const svc = new ServicioTurnos(new RepositorioMemoria());
    try {
      svc.crear(inputBase('2026-10-11T10:00:00-03:00'), agendaBase()); // domingo
      fail('debió lanzar');
    } catch (e) {
      expect((e as ConflictoTurno).causa).toBe('horario');
    }
    const conBloqueo = { ...agendaBase(), bloqueos: [{ profesionalId: 'prof-1', sillonId: null, desde: new Date(`${LUNES}T12:00:00-03:00`), hasta: new Date(`${LUNES}T13:00:00-03:00`) }] };
    try {
      svc.crear(inputBase(`${LUNES}T12:30:00-03:00`), conBloqueo);
      fail('debió lanzar');
    } catch (e) {
      expect((e as ConflictoTurno).causa).toBe('bloqueo');
    }
  });

  it('validar no persiste nada (reuso C-04)', () => {
    const repo = new RepositorioMemoria();
    const svc = new ServicioTurnos(repo);
    svc.validar(inputBase(`${LUNES}T10:00:00-03:00`), agendaBase());
    expect(repo.todos()).toHaveLength(0);
  });
});

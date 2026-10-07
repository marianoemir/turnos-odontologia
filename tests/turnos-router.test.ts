import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Server } from 'node:http';
import { RepositorioMemoria } from '../src/turnos/repositorio-memoria';
import { crearTurnosRouter } from '../src/turnos/router';
import { ServicioTurnos, type AgendaRef } from '../src/turnos/servicio-turnos';

const agenda: AgendaRef = {
  horarios: [{ profesionalId: 'prof-1', diaSemana: 1, desdeMin: 9 * 60, hastaMin: 18 * 60 }],
  bloqueos: [],
  sillones: [{ id: 'sil-1', activo: true }],
};

const valido = {
  pacienteId: 'pac-1',
  profesionalId: 'prof-1',
  sillonId: 'sil-1',
  prestacion: { id: 'prest-30', duracionMin: 30 },
  inicio: '2026-10-12T10:00:00-03:00',
};

describe('POST /turnos', () => {
  let server: Server;
  let base: string;

  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use(crearTurnosRouter(new ServicioTurnos(new RepositorioMemoria()), agenda));
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('201 ante creación válida', async () => {
    const r = await fetch(`${base}/turnos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valido) });
    expect(r.status).toBe(201);
    expect(((await r.json()) as Record<string, unknown>).estado).toBe('pendiente');
  });

  it('409 con causa ante solape', async () => {
    const r = await fetch(`${base}/turnos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...valido, inicio: '2026-10-12T10:15:00-03:00' }),
    });
    expect(r.status).toBe(409);
    expect(((await r.json()) as Record<string, unknown>).causa).toBe('profesional');
  });

  it('422 sin sillón', async () => {
    const { sillonId: _omit, ...sinSillon } = valido;
    const r = await fetch(`${base}/turnos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sinSillon) });
    expect(r.status).toBe(422);
  });
});

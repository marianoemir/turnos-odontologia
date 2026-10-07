import express from 'express';
import type { AgendaRef, CrearTurnoInput, ServicioTurnos } from './servicio-turnos';
import { ConflictoTurno, InputInvalido } from './tipos';

/** Router fino: delega al servicio y mapea errores a 409/422. */
export function crearTurnosRouter(servicio: ServicioTurnos, agenda: AgendaRef): express.Router {
  const router = express.Router();
  router.post('/turnos', (req, res) => {
    try {
      const body = req.body as {
        pacienteId: string;
        profesionalId: string;
        sillonId?: string;
        prestacion: { id: string; duracionMin: number };
        inicio: string;
      };
      const input: CrearTurnoInput = {
        pacienteId: body.pacienteId,
        profesionalId: body.profesionalId,
        sillonId: body.sillonId,
        prestacion: body.prestacion,
        inicio: new Date(body.inicio),
      };
      const turno = servicio.crear(input, agenda);
      res.status(201).json({ ...turno, inicio: turno.inicio.toISOString(), fin: turno.fin.toISOString() });
    } catch (e) {
      if (e instanceof ConflictoTurno) {
        res.status(409).json({ causa: e.causa });
      } else if (e instanceof InputInvalido) {
        res.status(422).json({ error: e.message });
      } else {
        throw e;
      }
    }
  });
  return router;
}

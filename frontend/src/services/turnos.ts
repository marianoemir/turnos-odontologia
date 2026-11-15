/**
 * Servicio de turnos (C-16, task 1.2): creación de turnos desde `/turnos/nuevo`.
 *
 * Contrato: `POST /turnos` (`TurnoCreate` en
 * backend/app/turnos/schemas.py:12-20). El body viaja sin `fin`: el servidor
 * lo calcula desde `prestacion.duracion_min` (RN-AG-01) e ignora cualquier
 * `fin` del cliente (`extra="ignore"`). La mutación exitosa invalida solo la
 * raíz `turnos` de `resourceKeys` (`useResourceMutation`), sin optimistic
 * update — espejo del molde de `catalogo.ts`.
 */
import type { Turno } from "../types/api";
import { apiRequest } from "./http";
import { useResourceMutation } from "./query";

/**
 * Alta de turno (`TurnoCreate`): los cuatro ids más el inicio con zona
 * horaria (ISO-8601, `AwareDatetime` en el backend); sin `fin`.
 */
export interface TurnoCreate {
  paciente_id: string;
  profesional_id: string;
  sillon_id: string;
  prestacion_id: string;
  inicio: string;
}

export function useCrearTurno() {
  return useResourceMutation("turnos", (alta: TurnoCreate) =>
    apiRequest<Turno>("/turnos", { method: "POST", body: alta }),
  );
}

import { useQuery } from "@tanstack/react-query";

import type { Prestacion } from "../types/api";
import type {
  ReservaCreatePublica,
  ReservaOutPublica,
  ResolucionTokenOut,
  SlotPublico,
} from "../types/api-reserva-publica";
import { apiRequest } from "./http";

/** QueryKey propia de prestaciones públicas, separada de catálogo interno. */
export const prestacionesPublicasQueryKey = ["reserva-publica", "prestaciones"] as const;

export function obtenerSlotsPublicos(
  profesionalId: string,
  params: { prestacion: string; fecha: string },
): Promise<SlotPublico[]> {
  const search = new URLSearchParams({
    prestacion: params.prestacion,
    fecha: params.fecha,
  });
  return apiRequest<SlotPublico[]>(
    `/reservar/${encodeURIComponent(profesionalId)}?${search.toString()}`,
    { publica: true },
  );
}

export function crearReservaPublica(
  body: ReservaCreatePublica,
): Promise<ReservaOutPublica> {
  return apiRequest<ReservaOutPublica>("/reservar", {
    method: "POST",
    body,
    publica: true,
  });
}

export function confirmarToken(token: string): Promise<ResolucionTokenOut> {
  return apiRequest<ResolucionTokenOut>(`/confirmar/${encodeURIComponent(token)}`, {
    method: "POST",
    publica: true,
  });
}

export function cancelarToken(token: string): Promise<ResolucionTokenOut> {
  return apiRequest<ResolucionTokenOut>(`/cancelar/${encodeURIComponent(token)}`, {
    method: "POST",
    publica: true,
  });
}

export function obtenerPrestacionesPublicas(): Promise<Prestacion[]> {
  return apiRequest<Prestacion[]>("/prestaciones", { publica: true });
}

export function usePrestacionesPublicas() {
  return useQuery({
    queryKey: prestacionesPublicasQueryKey,
    queryFn: ({ signal }) =>
      apiRequest<Prestacion[]>("/prestaciones", { publica: true, signal }),
    retry: false,
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "../types/errors";
import type {
  EntradaHCCreate,
  EntradaHCOut,
  HistoriaClinicaCreate,
  HistoriaClinicaOut,
  HistoriaClinicaUpdate,
  OdontogramaCreate,
  OdontogramaOut,
  PlanTratamientoOut,
} from "../types/api-hc";
import { apiRequest } from "./http";
import {
  hcEntradasQueryKey,
  hcOdontogramaQueryKey,
  hcPlanesQueryKey,
  hcPorPacienteQueryKey,
  resourceKeys,
} from "./query";

/** HC hooks: app QueryClient no define retry por defecto, fijamos retry:false (lecturas/mutaciones) para evitar reintentos. */
const HC_NO_RETRY = false;

export async function obtenerHistoriaPorPaciente(
  pacienteId: string,
): Promise<HistoriaClinicaOut> {
  return apiRequest<HistoriaClinicaOut>(
    `/pacientes/${encodeURIComponent(pacienteId)}/historia-clinica`,
  );
}

export async function crearHistoriaClinica(
  body: HistoriaClinicaCreate,
): Promise<HistoriaClinicaOut> {
  return apiRequest<HistoriaClinicaOut>("/historias-clinicas", {
    method: "POST",
    body,
  });
}

export async function actualizarHistoriaClinica(
  hcId: string,
  body: HistoriaClinicaUpdate,
): Promise<HistoriaClinicaOut> {
  return apiRequest<HistoriaClinicaOut>(
    `/historias-clinicas/${encodeURIComponent(hcId)}`,
    { method: "PATCH", body },
  );
}

export async function listarEntradasHc(
  hcId: string,
): Promise<EntradaHCOut[]> {
  return apiRequest<EntradaHCOut[]>(
    `/historias-clinicas/${encodeURIComponent(hcId)}/entradas`,
  );
}

export async function crearEntradaHc(
  hcId: string,
  body: EntradaHCCreate,
): Promise<EntradaHCOut> {
  return apiRequest<EntradaHCOut>(
    `/historias-clinicas/${encodeURIComponent(hcId)}/entradas`,
    { method: "POST", body },
  );
}

export async function listarOdontogramaPaciente(
  pacienteId: string,
): Promise<OdontogramaOut[]> {
  return apiRequest<OdontogramaOut[]>(
    `/pacientes/${encodeURIComponent(pacienteId)}/odontograma`,
  );
}

export async function crearOdontograma(
  pacienteId: string,
  body: OdontogramaCreate,
): Promise<OdontogramaOut> {
  return apiRequest<OdontogramaOut>(
    `/pacientes/${encodeURIComponent(pacienteId)}/odontograma`,
    { method: "POST", body },
  );
}

export async function listarPlanesPorPaciente(
  pacienteId: string,
): Promise<PlanTratamientoOut[]> {
  return apiRequest<PlanTratamientoOut[]>(
    `/pacientes/${encodeURIComponent(pacienteId)}/planes-tratamiento`,
  );
}

export function useHistoriaPorPaciente(pacienteId: string) {
  return useQuery({
    queryKey: hcPorPacienteQueryKey(pacienteId),
    queryFn: ({ signal }) =>
      apiRequest<HistoriaClinicaOut>(
        `/pacientes/${encodeURIComponent(pacienteId)}/historia-clinica`,
        { signal },
      ),
    retry: HC_NO_RETRY,
  });
}

export function useEntradasHc(hcId: string) {
  return useQuery({
    queryKey: hcEntradasQueryKey(hcId),
    queryFn: ({ signal }) =>
      apiRequest<EntradaHCOut[]>(
        `/historias-clinicas/${encodeURIComponent(hcId)}/entradas`,
        { signal },
      ),
    retry: HC_NO_RETRY,
  });
}

export function useOdontogramaPaciente(pacienteId: string) {
  return useQuery({
    queryKey: hcOdontogramaQueryKey(pacienteId),
    queryFn: ({ signal }) =>
      apiRequest<OdontogramaOut[]>(
        `/pacientes/${encodeURIComponent(pacienteId)}/odontograma`,
        { signal },
      ),
    retry: HC_NO_RETRY,
  });
}

export function usePlanesPorPaciente(pacienteId: string) {
  return useQuery({
    queryKey: hcPlanesQueryKey(pacienteId),
    queryFn: ({ signal }) =>
      apiRequest<PlanTratamientoOut[]>(
        `/pacientes/${encodeURIComponent(pacienteId)}/planes-tratamiento`,
        { signal },
      ),
    retry: HC_NO_RETRY,
  });
}

function invalidarHistoriasClinicas() {
  return { queryKey: resourceKeys.historiasClinicas.all };
}

export function useCrearHistoriaClinica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: HistoriaClinicaCreate) => crearHistoriaClinica(body),
    onSuccess: () =>
      queryClient.invalidateQueries(invalidarHistoriasClinicas()),
    retry: HC_NO_RETRY,
  });
}

export interface ActualizarHistoriaClinicaVars {
  hcId: string;
  body: HistoriaClinicaUpdate;
}

export function useActualizarHistoriaClinica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ hcId, body }: ActualizarHistoriaClinicaVars) =>
      actualizarHistoriaClinica(hcId, body),
    onSuccess: () =>
      queryClient.invalidateQueries(invalidarHistoriasClinicas()),
    retry: HC_NO_RETRY,
  });
}

export interface CrearEntradaHcVars {
  hcId: string;
  body: EntradaHCCreate;
}

export function useCrearEntradaHc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ hcId, body }: CrearEntradaHcVars) => crearEntradaHc(hcId, body),
    onSuccess: () =>
      queryClient.invalidateQueries(invalidarHistoriasClinicas()),
    retry: HC_NO_RETRY,
  });
}

export interface CrearOdontogramaVars {
  pacienteId: string;
  body: OdontogramaCreate;
}

export function useCrearOdontograma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pacienteId, body }: CrearOdontogramaVars) =>
      crearOdontograma(pacienteId, body),
    onSuccess: () =>
      queryClient.invalidateQueries(invalidarHistoriasClinicas()),
    retry: HC_NO_RETRY,
  });
}

export type Clasificacion404Hc =
  | "sin_historia"
  | "paciente_inexistente"
  | "recurso_inexistente";

export function clasificar404HistoriaClinica(error: ApiError): Clasificacion404Hc {
  if (error.status !== 404) {
    return "recurso_inexistente";
  }
  const detalle = error.detalle;
  if (typeof detalle !== "string" || detalle.length === 0) {
    return "recurso_inexistente";
  }
  if (detalle.includes("historia clinica no existe para paciente")) {
    return "sin_historia";
  }
  if (detalle.includes("paciente no existe")) {
    return "paciente_inexistente";
  }
  return "recurso_inexistente";
}

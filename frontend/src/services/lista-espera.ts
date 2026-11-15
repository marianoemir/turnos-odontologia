import type { Paciente, Prestacion, Profesional, Sillon } from "../types/api";
import type {
  ListaEsperaCreate,
  ListaEsperaOut,
  OfrecerHueco,
  OfrecerHuecoResponse,
  RespuestaPaciente,
} from "../types/api-lista-espera";
import { apiRequest } from "./http";

export interface PacientesEnvelope {
  items: Paciente[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListarPacientesCatalogoParams {
  q?: string;
  limit?: number;
  incluir_inactivos?: boolean;
  offset?: number;
}

export interface CatalogoIncluirInactivosParams {
  incluir_inactivos?: boolean;
}

function construirQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function crearEntradaListaEspera(
  body: ListaEsperaCreate,
): Promise<ListaEsperaOut> {
  return apiRequest<ListaEsperaOut>("/lista-espera", {
    method: "POST",
    body,
  });
}

export function listarEntradasListaEspera(
  profesional?: string,
): Promise<ListaEsperaOut[]> {
  const qs = profesional ? `?profesional=${encodeURIComponent(profesional)}` : "";
  return apiRequest<ListaEsperaOut[]>(`/lista-espera${qs}`);
}

export function ofrecerHuecoListaEspera(
  id: string,
  body: OfrecerHueco,
): Promise<OfrecerHuecoResponse> {
  return apiRequest<OfrecerHuecoResponse>(
    `/lista-espera/${encodeURIComponent(id)}/ofrecer`,
    { method: "POST", body },
  );
}

export function responderOfertaListaEspera(
  id: string,
  body: RespuestaPaciente,
): Promise<ListaEsperaOut> {
  return apiRequest<ListaEsperaOut>(
    `/lista-espera/${encodeURIComponent(id)}/responder`,
    { method: "POST", body },
  );
}

export function listarPacientesCatalogo(
  params: ListarPacientesCatalogoParams = {},
): Promise<PacientesEnvelope> {
  const qs = construirQuery({
    q: params.q,
    limit: params.limit,
    incluir_inactivos: params.incluir_inactivos,
    offset: params.offset,
  });
  return apiRequest<PacientesEnvelope>(`/pacientes${qs}`);
}

export function listarProfesionalesCatalogo(
  params: CatalogoIncluirInactivosParams = {},
): Promise<Profesional[]> {
  const qs = construirQuery({
    incluir_inactivos: params.incluir_inactivos,
  });
  return apiRequest<Profesional[]>(`/profesionales${qs}`);
}

export function listarPrestacionesCatalogo(
  params: CatalogoIncluirInactivosParams = {},
): Promise<Prestacion[]> {
  const qs = construirQuery({
    incluir_inactivos: params.incluir_inactivos,
  });
  return apiRequest<Prestacion[]>(`/prestaciones${qs}`);
}

export function listarSillonesCatalogo(
  params: CatalogoIncluirInactivosParams = {},
): Promise<Sillon[]> {
  const qs = construirQuery({
    incluir_inactivos: params.incluir_inactivos,
  });
  return apiRequest<Sillon[]>(`/sillones${qs}`);
}

/**
 * Servicios de catálogo (C-15, task 1.2): pacientes, profesionales, sillones,
 * prestaciones, horarios de atención y bloqueos.
 *
 * Contratos: `backend/app/agenda/router_catalogo.py` + `schemas.py` (tipos de
 * lectura en `../types/api`). Cada recurso usa su raíz de `resourceKeys`;
 * toda mutación exitosa invalida solo la raíz de su recurso
 * (`useResourceMutation`), sin optimistic update.
 *
 * Pacientes listan con envelope `{items, total, limit, offset}`; el resto con
 * lista plana. Los horarios se consultan en una sola query y se filtran por
 * profesional en cliente (design D2). Los bloqueos no tienen PATCH: son
 * temporales y se eliminan físicamente con `DELETE` (204).
 */
import { useQuery } from "@tanstack/react-query";

import type {
    Bloqueo,
    HorarioAtencion,
    Paciente,
    Prestacion,
    Profesional,
    Sillon,
} from "../types/api";
import { apiRequest } from "./http";
import { resourceKeys, useResourceMutation } from "./query";

/** Envelope de `GET /pacientes` (backend `PacientesEnvelopeOut`). */
export interface PacientesEnvelope {
    items: Paciente[];
    total: number;
    limit: number;
    offset: number;
}

/** Filtros de `GET /pacientes` (`?q=`, inactivos y paginación). */
export interface FiltroPacientes {
    q?: string;
    incluirInactivos?: boolean;
    limit?: number;
    offset?: number;
}

/** Alta de paciente (`PacienteCreate`: `ficticio` default true en backend). */
export interface PacienteCreate {
    nombre: string;
    dni: string;
    contacto?: string | null;
    ficticio?: boolean;
}

/** Edición parcial de paciente (`PacientePatch`, `extra=forbid`). */
export interface PacientePatch {
    nombre?: string;
    dni?: string;
    contacto?: string | null;
    activo?: boolean;
}

/** Alta de profesional (`ProfesionalCreate`). */
export interface ProfesionalCreate {
    nombre: string;
    matricula: string;
    sucursal_id?: string | null;
}

/** Edición parcial de profesional (`ProfesionalPatch`). */
export interface ProfesionalPatch {
    nombre?: string;
    matricula?: string;
    sucursal_id?: string | null;
    activo?: boolean;
}

/** Alta de sillón (`SillonCreate`). */
export interface SillonCreate {
    nombre: string;
    sucursal_id?: string | null;
}

/** Edición parcial de sillón (`SillonPatch`). */
export interface SillonPatch {
    nombre?: string;
    sucursal_id?: string | null;
    activo?: boolean;
}

/** Alta de prestación (`PrestacionCreate`, `duracion_min > 0`). */
export interface PrestacionCreate {
    nombre: string;
    duracion_min: number;
}

/** Edición parcial de prestación (`PrestacionPatch`). */
export interface PrestacionPatch {
    nombre?: string;
    duracion_min?: number;
    activo?: boolean;
}

/** Alta de horario (`HorarioCreate`, `desde < hasta`, día 0–6). */
export interface HorarioCreate {
    profesional_id: string;
    dia_semana: number;
    desde: string;
    hasta: string;
}

/**
 * Edición parcial de horario (`HorarioPatch`): no admite `profesional_id`
 * (`extra=forbid` en el backend).
 */
export interface HorarioPatch {
    dia_semana?: number;
    desde?: string;
    hasta?: string;
    activo?: boolean;
}

/** Alta de bloqueo (`BloqueoCreate`, datetimes con timezone). */
export interface BloqueoCreate {
    profesional_id?: string | null;
    sillon_id?: string | null;
    desde: string;
    hasta: string;
    motivo: string;
}

/** Cuerpo de edición de una entidad: el `id` va en la ruta, el parche en el cuerpo. */
export interface CambioDePaciente {
    id: string;
    parche: PacientePatch;
}

export interface CambioDeProfesional {
    id: string;
    parche: ProfesionalPatch;
}

export interface CambioDeSillon {
    id: string;
    parche: SillonPatch;
}

export interface CambioDePrestacion {
    id: string;
    parche: PrestacionPatch;
}

export interface CambioDeHorario {
    id: string;
    parche: HorarioPatch;
}

/** Límite por defecto de `GET /pacientes` (igual que el backend). */
const LIMITE_PACIENTES_POR_DEFECTO = 50;

/** Clave de pacientes: la variante de filtros cuelga de la raíz del recurso. */
export function clavePacientes(filtro: FiltroPacientes = {}) {
    return [
        ...resourceKeys.pacientes.all,
        {
            q: filtro.q ?? "",
            incluirInactivos: filtro.incluirInactivos ?? false,
            limit: filtro.limit ?? LIMITE_PACIENTES_POR_DEFECTO,
            offset: filtro.offset ?? 0,
        },
    ] as const;
}

function rutaPacientes(filtro: FiltroPacientes = {}): string {
    const parametros = new URLSearchParams();
    const q = filtro.q?.trim() ?? "";
    if (q.length > 0) {
        parametros.set("q", q);
    }
    parametros.set(
        "limit",
        String(filtro.limit ?? LIMITE_PACIENTES_POR_DEFECTO),
    );
    parametros.set("offset", String(filtro.offset ?? 0));
    if (filtro.incluirInactivos === true) {
        parametros.set("incluir_inactivos", "true");
    }
    return `/pacientes?${parametros.toString()}`;
}

/** Clave de lista plana con variante de inactivas bajo la misma raíz. */
function claveLista(raiz: readonly string[], incluirInactivos: boolean) {
    return [...raiz, { incluirInactivos }] as const;
}

function rutaConInactivas(base: string, incluirInactivos: boolean): string {
    return incluirInactivos ? `${base}?incluir_inactivos=true` : base;
}

// --- Pacientes (envelope) ---

export function usePacientes(filtro: FiltroPacientes = {}) {
    return useQuery({
        queryKey: clavePacientes(filtro),
        queryFn: ({ signal }) =>
            apiRequest<PacientesEnvelope>(rutaPacientes(filtro), { signal }),
    });
}

export function useCrearPaciente() {
    return useResourceMutation("pacientes", (alta: PacienteCreate) =>
        apiRequest<Paciente>("/pacientes", { method: "POST", body: alta }),
    );
}

export function useActualizarPaciente() {
    return useResourceMutation(
        "pacientes",
        ({ id, parche }: CambioDePaciente) =>
            apiRequest<Paciente>(`/pacientes/${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: parche,
            }),
    );
}

// --- Profesionales (lista plana) ---

export function useProfesionales(incluirInactivos = false) {
    return useQuery({
        queryKey: claveLista(resourceKeys.profesionales.all, incluirInactivos),
        queryFn: ({ signal }) =>
            apiRequest<Profesional[]>(
                rutaConInactivas("/profesionales", incluirInactivos),
                { signal },
            ),
    });
}

export function useCrearProfesional() {
    return useResourceMutation("profesionales", (alta: ProfesionalCreate) =>
        apiRequest<Profesional>("/profesionales", {
            method: "POST",
            body: alta,
        }),
    );
}

export function useActualizarProfesional() {
    return useResourceMutation(
        "profesionales",
        ({ id, parche }: CambioDeProfesional) =>
            apiRequest<Profesional>(
                `/profesionales/${encodeURIComponent(id)}`,
                { method: "PATCH", body: parche },
            ),
    );
}

// --- Sillones (lista plana) ---

export function useSillones(incluirInactivos = false) {
    return useQuery({
        queryKey: claveLista(resourceKeys.sillones.all, incluirInactivos),
        queryFn: ({ signal }) =>
            apiRequest<Sillon[]>(
                rutaConInactivas("/sillones", incluirInactivos),
                { signal },
            ),
    });
}

export function useCrearSillon() {
    return useResourceMutation("sillones", (alta: SillonCreate) =>
        apiRequest<Sillon>("/sillones", { method: "POST", body: alta }),
    );
}

export function useActualizarSillon() {
    return useResourceMutation(
        "sillones",
        ({ id, parche }: CambioDeSillon) =>
            apiRequest<Sillon>(`/sillones/${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: parche,
            }),
    );
}

// --- Prestaciones (lista plana) ---

export function usePrestaciones(incluirInactivos = false) {
    return useQuery({
        queryKey: claveLista(resourceKeys.prestaciones.all, incluirInactivos),
        queryFn: ({ signal }) =>
            apiRequest<Prestacion[]>(
                rutaConInactivas("/prestaciones", incluirInactivos),
                { signal },
            ),
    });
}

export function useCrearPrestacion() {
    return useResourceMutation("prestaciones", (alta: PrestacionCreate) =>
        apiRequest<Prestacion>("/prestaciones", {
            method: "POST",
            body: alta,
        }),
    );
}

export function useActualizarPrestacion() {
    return useResourceMutation(
        "prestaciones",
        ({ id, parche }: CambioDePrestacion) =>
            apiRequest<Prestacion>(
                `/prestaciones/${encodeURIComponent(id)}`,
                { method: "PATCH", body: parche },
            ),
    );
}

// --- Horarios (lista plana, una sola query con filtro en cliente) ---

export function useHorarios(incluirInactivos = false) {
    return useQuery({
        queryKey: claveLista(resourceKeys.horarios.all, incluirInactivos),
        queryFn: ({ signal }) =>
            apiRequest<HorarioAtencion[]>(
                rutaConInactivas("/horarios-atencion", incluirInactivos),
                { signal },
            ),
    });
}

export function useCrearHorario() {
    return useResourceMutation("horarios", (alta: HorarioCreate) =>
        apiRequest<HorarioAtencion>("/horarios-atencion", {
            method: "POST",
            body: alta,
        }),
    );
}

export function useActualizarHorario() {
    return useResourceMutation(
        "horarios",
        ({ id, parche }: CambioDeHorario) =>
            apiRequest<HorarioAtencion>(
                `/horarios-atencion/${encodeURIComponent(id)}`,
                { method: "PATCH", body: parche },
            ),
    );
}

// --- Bloqueos (lista plana, sin PATCH: DELETE físico con 204) ---

export function useBloqueos() {
    return useQuery({
        queryKey: resourceKeys.bloqueos.all,
        queryFn: ({ signal }) =>
            apiRequest<Bloqueo[]>("/bloqueos", { signal }),
    });
}

export function useCrearBloqueo() {
    return useResourceMutation("bloqueos", (alta: BloqueoCreate) =>
        apiRequest<Bloqueo>("/bloqueos", { method: "POST", body: alta }),
    );
}

export function useEliminarBloqueo() {
    return useResourceMutation("bloqueos", (id: string) =>
        apiRequest<void>(`/bloqueos/${encodeURIComponent(id)}`, {
            method: "DELETE",
        }),
    );
}

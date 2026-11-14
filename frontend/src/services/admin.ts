/**
 * Servicios de administración (C-22, task 2.2): roles, sucursales y
 * asignaciones usuario–sucursal.
 *
 * Contratos: `backend/app/rbac/schemas.py` (tipos en `../types/api-admin`).
 * Cada recurso usa su raíz de `resourceKeys`; toda mutación exitosa invalida
 * solo la raíz de su recurso (`useResourceMutation`).
 *
 * Los roles solo se listan y se edita su descripción: el alta de roles no es
 * parte de la UI de C-22, y `nombre`/`activo` de un rol canónico están
 * protegidos por el backend (409 `rol_canonico_protegido`).
 */
import { useQuery } from "@tanstack/react-query";

import type {
    Rol,
    RolPatch,
    Sucursal,
    SucursalCreate,
    SucursalPatch,
    UsuarioSucursal,
    UsuarioSucursalCreate,
    UsuarioSucursalPatch,
} from "../types/api-admin";
import { apiRequest } from "./http";
import { resourceKeys, useResourceMutation } from "./query";

/** Cuerpo de edición de una entidad: el `id` va en la ruta, el parche en el cuerpo. */
export interface CambioDeRol {
    id: string;
    descripcion: string;
}

export interface CambioDeSucursal {
    id: string;
    parche: SucursalPatch;
}

export interface CambioDeAsignacion {
    id: string;
    parche: UsuarioSucursalPatch;
}

/** La consulta con y sin inactivas cuelga de la misma raíz y no comparte caché. */
function claveSucursales(incluirInactivos: boolean) {
    return [...resourceKeys.sucursales.all, { incluirInactivos }] as const;
}

// --- Roles ---

export function useRoles() {
    return useQuery({
        queryKey: resourceKeys.roles.all,
        queryFn: ({ signal }) => apiRequest<Rol[]>("/roles", { signal }),
    });
}

/** Envía únicamente `descripcion`: el backend rechaza campos extra y nulos. */
export function useActualizarDescripcionRol() {
    return useResourceMutation("roles", ({ id, descripcion }: CambioDeRol) => {
        const parche: RolPatch = { descripcion };
        return apiRequest<Rol>(`/roles/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: parche,
        });
    });
}

// --- Sucursales ---

export function useSucursales(incluirInactivos = false) {
    const ruta = incluirInactivos
        ? "/sucursales?incluir_inactivos=true"
        : "/sucursales";

    return useQuery({
        queryKey: claveSucursales(incluirInactivos),
        queryFn: ({ signal }) => apiRequest<Sucursal[]>(ruta, { signal }),
    });
}

export function useCrearSucursal() {
    return useResourceMutation("sucursales", (alta: SucursalCreate) =>
        apiRequest<Sucursal>("/sucursales", { method: "POST", body: alta }),
    );
}

export function useActualizarSucursal() {
    return useResourceMutation("sucursales", ({ id, parche }: CambioDeSucursal) =>
        apiRequest<Sucursal>(`/sucursales/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: parche,
        }),
    );
}

// --- Asignaciones usuario–sucursal ---

export function useAsignaciones() {
    return useQuery({
        queryKey: resourceKeys.usuariosSucursal.all,
        queryFn: ({ signal }) =>
            apiRequest<UsuarioSucursal[]>("/usuarios-sucursal", { signal }),
    });
}

export function useCrearAsignacion() {
    return useResourceMutation("usuariosSucursal", (alta: UsuarioSucursalCreate) =>
        apiRequest<UsuarioSucursal>("/usuarios-sucursal", {
            method: "POST",
            body: alta,
        }),
    );
}

export function useActualizarAsignacion() {
    return useResourceMutation(
        "usuariosSucursal",
        ({ id, parche }: CambioDeAsignacion) =>
            apiRequest<UsuarioSucursal>(
                `/usuarios-sucursal/${encodeURIComponent(id)}`,
                { method: "PATCH", body: parche },
            ),
    );
}
/**
 * Contratos espejo de los schemas de administración (C-22, task 2.1).
 *
 * Fuente y ninguna otra: `backend/app/rbac/schemas.py` (`RolOut`, `RolCreate`,
 * `RolPatch`, `SucursalOut`, `SucursalCreate`, `SucursalPatch`,
 * `UsuarioSucursalOut`, `UsuarioSucursalCreate`, `UsuarioSucursalPatch`).
 *
 * Traducción wire → TypeScript, igual que en `api.ts`:
 * - `UUID`        -> `string`
 * - `datetime`    -> `string` ISO-8601
 * - `str | None`  -> `string | null`
 *
 * Los `*Patch` del backend usan `extra="forbid"` y rechazan `null`: por eso
 * sus campos son opcionales y sin `| null`. Para editar solo la descripción de
 * un rol hay que enviar únicamente `descripcion`.
 */

/** RolOut — `permisos` se deriva en el backend y es de solo lectura. */
export interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  permisos: string[];
}

/** RolCreate */
export interface RolCreate {
  nombre: string;
  descripcion?: string | null;
}

/** RolPatch — `nombre` y `activo` de un rol canónico dan 409 `rol_canonico_protegido`. */
export interface RolPatch {
  nombre?: string;
  descripcion?: string;
  activo?: boolean;
}

/** SucursalOut */
export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
}

/** SucursalCreate */
export interface SucursalCreate {
  nombre: string;
  direccion?: string | null;
}

/** SucursalPatch */
export interface SucursalPatch {
  nombre?: string;
  direccion?: string;
  activo?: boolean;
}

/** UsuarioSucursalOut — `creado_en` es un `datetime` ISO-8601. */
export interface UsuarioSucursal {
  id: string;
  usuario: string;
  rol_id: string;
  sucursal_id: string;
  activo: boolean;
  creado_en: string;
}

/** UsuarioSucursalCreate */
export interface UsuarioSucursalCreate {
  usuario: string;
  rol_id: string;
  sucursal_id: string;
}

/** UsuarioSucursalPatch */
export interface UsuarioSucursalPatch {
  rol_id?: string;
  sucursal_id?: string;
  activo?: boolean;
}
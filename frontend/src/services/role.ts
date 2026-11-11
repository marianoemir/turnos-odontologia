/**
 * Punto de enganche del rol activo (design D4).
 *
 * C-13 no implementa el selector: expone el contrato para que C-14 lo conecte
 * (y `localStorage` es de C-14) sin reescribir el cliente HTTP. El cliente lee
 * el rol **en cada request**, así que cambiar acá cambia todas las requests.
 *
 * Sin `localStorage` ni persistencia: estado de módulo, `recepcion` inicial.
 */

/**
 * Roles admitidos por el backend — `ROLES` en
 * backend/app/rbac/permissions.py:10. El backend compara exacto, así que esta
 * lista y su validación son la única fuente del cliente.
 */
export const ROLES = ["admin", "recepcion", "odontologo", "paciente"] as const;

/** Unión derivada de `ROLES`; no es `string`. */
export type Rol = (typeof ROLES)[number];

/**
 * Default cuando no hay selección: replica el comportamiento del backend
 * cuando falta `X-Actor-Rol` (backend/app/rbac/context.py:94-100), de modo que
 * la UI y la API coinciden incluso antes de que exista C-14.
 */
export const ROL_POR_DEFECTO: Rol = "recepcion";

let rolActivo: Rol = ROL_POR_DEFECTO;

function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

/** Rol que se enviará en `X-Actor-Rol` en la próxima request. */
export function getActiveRole(): Rol {
  return rolActivo;
}

/**
 * Cambia el rol activo si pertenece a `ROLES`; descarta lo que no (incluida
 * una variante con espacios o mayúsculas: el backend compara exacto y
 * respondería 422 `rol_desconocido`, backend/app/rbac/context.py:102-109).
 *
 * El parámetro es `string` a propósito: el valor puede venir de una entrada
 * externa (C-14) y la validación es de runtime, no del compilador.
 */
export function setActiveRole(rol: string): void {
  if (esRol(rol)) {
    rolActivo = rol;
  }
}

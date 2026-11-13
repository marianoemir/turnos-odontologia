/**
 * Punto de enganche de la sucursal activa (design D4, simétrica al rol).
 *
 * `null` inicial: sin la cabecera el backend no abre sesión ni consulta la base
 * (backend/app/rbac/context.py:38-40), y con un UUID inexistente responde 422
 * `sucursal_invalida` (context.py:85-92). Por eso el formato se valida acá: el
 * error se previene en el cliente en vez de provocarse.
 *
 * Sin `localStorage`: eso es de C-14/C-22. C-14/C-22 reemplazan este estado de
 * módulo por el selector sin tocar `http.ts`.
 */

/** UUID canónico 8-4-4-4-12, sin restricción de versión (el backend usa `uuid.UUID`). */
const PATRON_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let sucursalActiva: string | null = null;

/** Sucursal que se enviará en `X-Sucursal-Id`, o `null` para omitir la cabecera. */
export function getActiveSucursalId(): string | null {
  return sucursalActiva;
}

/**
 * Selecciona la sucursal activa. `null` siempre es válido (omite la cabecera);
 * un valor que no tenga formato UUID se descarta y conserva el anterior.
 */
export function setActiveSucursalId(id: string | null): void {
  if (id === null) {
    sucursalActiva = null;
    return;
  }
  if (PATRON_UUID.test(id)) {
    sucursalActiva = id;
  }
}

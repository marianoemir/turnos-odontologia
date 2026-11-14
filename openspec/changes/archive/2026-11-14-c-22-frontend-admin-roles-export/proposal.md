# Proposal

## Why

El backend ya expone la administración (C-11: roles, sucursales, asignaciones usuario–sucursal y exportación) y C-14 dejó listos los componentes, la sesión JWT y el cliente HTTP, pero no existe ninguna pantalla para usarlos: `/admin` es un placeholder. Además, el texto original de C-22 quedó desactualizado por C-24: la sucursal activa ya no se envía en `X-Sucursal-Id` (el backend lo ignora y el cliente lo elimina), sino que viene como claim `sucursal_id` del token, y el guard de navegación de C-14 sólo reconoce a `recepcion` y `odontologo`, por lo que hoy un `admin` no podría abrir ninguna pantalla de administración y un `recepcion` sí podría abrir `/admin`.

## What Changes

- Agregar las pantallas de administración bajo `/admin`: `/admin/roles`, `/admin/sucursales` y `/admin/datos`, con `/admin` como índice.
- `/admin/roles`: listado de roles y permisos en solo lectura; edición únicamente de `descripcion`; los roles canónicos protegidos muestran el 409 `rol_canonico_protegido`.
- `/admin/sucursales`: alta, edición y baja lógica de sucursales, y alta y edición de asignaciones usuario–sucursal (`usuario` como texto libre; no existe `GET /usuarios`).
- **Selector de sucursal activa de solo lectura**: reemplaza al selector con `X-Sucursal-Id` del texto original. Muestra la sucursal del token; cambiarla implica volver a iniciar sesión (el backend no ofrece un endpoint de cambio).
- `/admin/datos`: exportación en un clic de `GET /export` (JSON, 30 días por defecto y máximo) con el contrato de salida visible antes de descargar, e importación de planilla sólo documentada (existe el CLI `scripts/import_planilla`, no un endpoint).
- **BREAKING** para la navegación de C-14: `recepcion` deja de poder navegar `/admin` y sus subrutas; `admin` pasa a poder navegar `/admin`, sus subrutas y `/agenda`.
- Agregar al shell un grupo «Administración» visible sólo para `admin`, fuera del grupo «Operación» y sin alterar la navegación de los demás roles.
- El guard del cliente sólo mejora la navegación: la autorización real es del backend (403 con rol distinto de `admin`).

## Capabilities

### New Capabilities

- `frontend-admin`: pantallas de roles, sucursales, asignaciones, sucursal activa de solo lectura, exportación e importación documentada, y su acceso desde el shell.

### Modified Capabilities

- `frontend-sesion`: el requirement de navegación por rol incorpora a `admin` y retira `/admin` a `recepcion`.

## Impact

- Afecta `frontend/src/` (`auth/navigation.ts`, `app/router.tsx`, `app/shell.tsx`, páginas de administración, servicios, tipos y pruebas RTL). No agrega dependencias.
- Consume sin cambiar los contratos de backend de `rbac`, `multisucursal`, `exportacion-datos` y `auth-jwt`; no modifica APIs ni autorizaciones del servidor.
- Se espera no modificar `frontend-foundation`: `/admin` sigue resolviendo a una pantalla registrada y el escenario de los cuatro enlaces de «Operación» no cambia para los demás roles. Se confirma en la task 1.3.
- Consume la revisión 1 aprobada de `frontend/design-system/` en modo `system-only`; no requiere mockups por change.
- La exportación contiene datos de pacientes: sólo datos ficticios en pruebas, capturas y video; el archivo descargado no se conserva en memoria de la aplicación.
- Deuda documental fuera de este change (rama de documentación aparte): corregir con nota de rectificación el texto de C-22 en `CHANGES.md` (selector con `X-Sucursal-Id`) y actualizar `knowledge-base/03_actores_y_roles.md`, que no define el rol `admin`.

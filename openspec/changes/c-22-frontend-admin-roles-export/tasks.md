# Tasks

## 1. Guard por rol y rutas de administración

- [x] 1.1 Escribir primero las pruebas del guard y mostrarlas en rojo: `admin` navega `/agenda`, `/admin` y `/admin/roles` y no `/catalogo/pacientes`; `recepcion` navega lo interno salvo `/admin` y `/admin/roles`; `odontologo` sólo `/agenda`; una ruta como `/administracion` no hereda el permiso de `admin`; `/agenda` es navegable por todos los roles; `safeReturnTo` acepta `/admin/roles` sólo para `admin`. Verificar que fallan antes de implementar.
- [x] 1.2 Implementar `canNavigate` por rol en `frontend/src/auth/navigation.ts`, con coincidencia exacta de `/admin` o prefijo `/admin/`; `INTERNAL_PATHS` no cambia porque su entrada `"/"` ya acepta cualquier ruta que empiece con `/`. Verificar `npm run test:run` completo en verde (los 120 previos más los nuevos) y `npm run lint`, y validar el test con una mutación: quitar la exclusión de `recepcion` sobre `/admin`, confirmar que la prueba falla y revertir.
- [x] 1.3 Declarar `admin` con rutas hijas (índice, `roles`, `sucursales` y `datos`) con pantallas provisorias; verificar con RTL que `/admin` y cada subruta resuelven para `admin`, que `recepcion` es redirigido a `/agenda` con el aviso, que un anónimo va a `/login`, y que `router.test.tsx` de C-13 sigue en verde con un único ajuste: el caso `/admin` se prueba con una sesión `admin`. Si falla, registrar el delta sobre `frontend-foundation`.
- [x] 1.4 Agregar al shell el grupo «Administración» sólo para `admin`; verificar con RTL que `admin` ve el grupo con un enlace a `/admin`, que `recepcion` y `odontologo` no lo ven, y que `shell.test.tsx` existente pasa sin modificaciones. Las pruebas nuevas viven en `shell-admin.test.tsx`; `error-boundary.test.tsx` se ajusta para montar el shell bajo `SessionProvider` con una sesión `recepcion`, porque el shell ahora lee la sesión (sin cambiar sus aserciones).

## 2. Capa de datos de administración

- [x] 2.1 Leer `backend/app/rbac/schemas.py`, `frontend/src/services/query.ts` y `frontend/src/types/api.ts`; agregar los tipos espejo de roles con permisos, sucursales y asignaciones, sin `any`, en el archivo nuevo `frontend/src/types/api-admin.ts` (con su prueba `api-admin.test.ts`; `api.ts` de C-14 no se modifica); verificar `tsc -b` y que `api.test.ts` sigue en verde.
- [x] 2.2 Crear los servicios de roles, sucursales y asignaciones con claves de query por recurso e invalidación tras cada mutación; verificar con Vitest que una mutación invalida sólo su recurso y que el `PATCH` de un rol envía únicamente `descripcion`. Los servicios viven en `frontend/src/services/admin.ts` (prueba: `admin.test.tsx`); `query.ts` de C-14 suma sólo las claves `roles`, `sucursales` y `usuariosSucursal` a `resourceKeys`, sin tocar `query.test.tsx`.

## 3. Roles

- [x] 3.1 Construir `/admin/roles` con listado en solo lectura de nombre, descripción, estado y permisos, y los estados de carga, vacío y error de C-14; verificar con RTL el listado y la ausencia de controles de nombre y de desactivación. La pantalla usa `useRoles` y un estado de error propio con «Reintentar» (C-14 no tiene componente de error); `admin-routes.test.tsx` se ajusta para montar `QueryClientProvider` con `apiRequest` simulado.
- [x] 3.2 Agregar la edición de `descripcion` en un modal y el manejo del 409 `rol_canonico_protegido`; verificar con RTL el cuerpo enviado, el mensaje del 409 con la descripción anterior conservada y el 403 con sesión conservada. Comprobar con el backend local si `PATCH` acepta la descripción de un rol canónico y registrar el resultado. Resultado: el backend acepta el `PATCH` de `descripcion` en roles canónicos (`rbac/service.py`, `actualizar_rol`: solo un `nombre` distinto y `activo: false` dan 409), así que el 409 `rol_canonico_protegido` no puede darse desde esta UI y su manejo es defensivo; comprobado leyendo el código, la prueba contra backend local queda en la 6.2. El 403 al cargar lo cubre el aviso global de C-14 (`session-expiry.tsx`); el test de 403 de la pantalla cubre el `PATCH`. Decisiones: prop opcional `renderActions` en `DataTable` (cambio aditivo sobre C-14; prueba en `data-table-acciones.test.tsx`) y formulario del modal con `useState` en vez de react-hook-form con zod (un solo campo sin reglas de validación).

## 4. Sucursales, asignaciones y sucursal activa

- [x] 4.1 Construir `/admin/sucursales` con listado (inactivas incluidas), alta, edición y baja lógica con confirmación; verificar con RTL el alta, el 409 `duplicate_nombre_sucursal` en el campo `nombre` y que desactivar pide confirmación y no borra. Decisiones: formulario con react-hook-form y zod (`nombre` obligatorio, `direccion` opcional); el 409 `duplicate_nombre_sucursal` se asocia al campo `nombre` con `setError`, porque `applyApiFieldErrors` solo cubre el 422; el `PATCH` envía únicamente los campos que cambiaron y `""` para vaciar la dirección, porque el backend rechaza `null`; la baja lógica pide confirmación y no ofrece reactivar (la spec no lo pide). La pantalla se armó en secciones para sumar la 4.2 y la 4.3 sin reescribir esta.
- [x] 4.2 Agregar las asignaciones usuario–sucursal con `usuario` como texto libre, rol y sucursal elegidos de listas, alta y edición; verificar con RTL el alta, el 409 `duplicate_usuario_sucursal` en el campo `usuario` y el 404 informado sin reintento.
- [x] 4.3 Mostrar la sucursal activa de solo lectura en `/admin` y en `/admin/sucursales`, con «Sin sucursal asociada» cuando `sucursalId` es nulo y la acción «Cambiar de sucursal» que cierra la sesión y navega a `/login`; verificar con RTL los tres casos y que ninguna request lleva `X-Sucursal-Id`.

## 5. Exportación e importación

- [x] 5.1 Construir en `/admin/datos` la exportación: contrato de salida visible, campos `desde` y `hasta` opcionales validados (desde menor o igual a hasta, máximo 30 días inclusive), `GET /export` con `timeoutMs` de 60 s, descarga con el nombre `export-turnos-YYYYMMDD-HHMMSS.json` y revocación de la URL del `Blob`; verificar con RTL y `URL.createObjectURL` simulado la descarga por defecto, el bloqueo de un período inválido sin request, el 422 del servidor y que el contenido no queda en la caché de consultas.
- [ ] 5.2 Agregar la sección de importación documentada sin controles de subida; verificar antes con `Get-ChildItem` que existen `scripts/import_planilla` y `docs/migracion/README.md`, y probar con RTL que la sección nombra ambos y que no hay campo de carga de archivos.

## 6. Verificación integrada

- [ ] 6.1 Ejecutar y corregir `npm run lint`, `tsc -b`, `npm run build` y `npm run test:run`; verificar que no hay envío de `X-Sucursal-Id`, `X-Actor-Rol` ni `X-Actor-Usuario` y que las pantallas de administración no aparecen para `recepcion`.
- [ ] 6.2 Con backend local, `SECRET_KEY` ficticia de 32 o más caracteres y `DATABASE_URL` terminada en `turnos_test`, verificar antes qué rol tiene el usuario del seed de C-24 y, con un `admin` ficticio, recorrer roles, sucursales, asignaciones y descarga; comprobar que `recepcion` no entra a `/admin` y que una llamada directa a un endpoint administrativo responde 403, y resolver la pregunta abierta de si `admin` puede leer `/agenda`. Documentar el resultado sin registrar credenciales.

## Workflow follow-up

- No implementar un cambio de sucursal sin volver a iniciar sesión: requiere un change backend futuro.
- Corregir en una rama de documentación aparte el texto de C-22 en `CHANGES.md` (nota de rectificación) y `knowledge-base/03_actores_y_roles.md`.
- Aplicar el change sólo mediante una solicitud explícita de `/opsx-apply`.

# Design

## UI Mockups

- Design system revision: 1 (`frontend/design-system/README.md`)
- Decision: no (project policy)
- Approval: approved (2026-10-28, by user)

## Context

C-14 entregó componentes reutilizables (`Button`, `TextField`, `Select`, `Card`, `DataTable`, `Modal`, `Toast`, `EmptyState`, `Skeleton`), TanStack Query, react-hook-form con zod, mapeo de 422 a campos, y una sesión JWT en memoria con `rol`, `usuario` y `sucursalId`. El cliente `apiRequest` envía sólo `Authorization: Bearer`, descarta `X-Sucursal-Id` y devuelve el cuerpo ya parseado como JSON.

El backend de administración ya existe (C-11): `GET/POST /roles` y `PATCH /roles/{id}`, `GET/POST /sucursales` y `PATCH /sucursales/{id}`, `GET/POST /usuarios-sucursal` y `PATCH /usuarios-sucursal/{id}`, y `GET /export`, todos para el rol `admin` (`admin:gestionar` sólo lo tiene `admin` en `backend/app/rbac/permissions.py`). Desde C-24 la sucursal activa es el claim `sucursal_id` del token y el filtro de profesionales y sillones sale de ese claim.

El guard actual (`canNavigate` en `frontend/src/auth/navigation.ts`) devuelve `rol === "recepcion" || pathname === "/agenda"`. El shell actual (`frontend/src/app/shell.tsx`) sólo tiene la navegación lateral con cuatro enlaces y el contenido; no tiene topbar. `knowledge-base/03_actores_y_roles.md` no define el rol `admin`; para `admin` manda el backend.

## Goals / Non-Goals

**Goals:**

- Dar a `admin` las pantallas de roles, sucursales, asignaciones y exportación sobre los contratos de C-11 ya congelados.
- Corregir el guard para que `admin` navegue administración y `recepcion` no.
- Reflejar la sucursal activa del token sin simular un cambio que el backend no ofrece.

**Non-Goals:**

- No modificar el backend ni sus contratos, ni agregar un endpoint de cambio de sucursal.
- No crear una pantalla `/admin/usuarios` (no existe `GET /usuarios`) ni crear, renombrar o desactivar roles desde la UI.
- No construir una importación de planilla en la UI (no hay endpoint).
- No abrir a `admin` las pantallas operativas (turnos, catálogo, caja) ni rediseñar el sistema visual.

## Decisions

### D1. Guard por rol con coincidencia exacta de `/admin`

`canNavigate` pasa a decidir por rol: `admin` navega `/agenda`, `/admin` y todo lo que empiece con `/admin/`; `recepcion` navega toda ruta interna salvo esas de administración; `odontologo` y cualquier otro rol, sólo `/agenda`. La coincidencia es `pathname === "/admin"` o `pathname.startsWith("/admin/")`, nunca un prefijo de texto, para que una ruta como `/administracion` no herede el permiso. `INTERNAL_PATHS` no cambia: su entrada `"/"` ya hace que `isInternalPath` acepte cualquier ruta que empiece con `/`, y `safeReturnTo` decide sólo por `canNavigate`. Observación fuera de alcance y no verificada: esa misma entrada parece dejar pasar rutas públicas como retorno tras el login; se deja para el PO. `/agenda` queda abierta para todos los roles: es el destino de la redirección, y prohibirla produciría un bucle.

**Alternativa considerada:** abrir a `admin` todas las rutas internas. Se descarta porque la matriz canónica del backend no define sus permisos sobre turnos ni catálogo y la KB no lo respalda; ampliarlo es una decisión de alcance para el PO.

### D2. `/admin` con rutas hijas sin tocar `frontend-foundation`

La ruta `admin` pasa a tener hijas: índice (hub con la sucursal activa y accesos), `roles`, `sucursales` y `datos`. `/admin` sigue resolviendo a una pantalla registrada, de modo que el requirement «Rutas declaradas para todas las capabilities» no cambia. Si la task 1.3 demuestra lo contrario, se agrega un delta sobre `frontend-foundation`.

### D3. Acceso desde un grupo «Administración» del shell, sólo para `admin`

C-13 dejó abierto dónde enlazar `/admin` (opción c: topbar o área de rol). El shell no tiene topbar, así que el cambio mínimo es un segundo grupo rotulado «Administración», debajo de «Operación», en la misma navegación lateral, renderizado sólo si `session.rol === "admin"`. Los demás roles ven exactamente la navegación actual, por lo que el escenario de los cuatro enlaces y `shell.test.tsx` (que usa una sesión `recepcion`) no cambian. Es una desviación de la opción (c) por inexistencia de topbar; el PO puede pedir otra ubicación.

### D4. Sucursal activa de sólo lectura

Se muestra el nombre de la sucursal del token, resuelto contra `GET /sucursales` con inactivas incluidas, en el índice de `/admin` y en la cabecera de `/admin/sucursales`. Sin `sucursalId` se muestra «Sin sucursal asociada (sin filtro)». La acción «Cambiar de sucursal» cierra la sesión y navega a `/login`, donde C-14 ya pide `sucursal_id` cuando el usuario tiene varias. La UI nunca modifica `sucursalId` de la sesión ni envía `X-Sucursal-Id`.

**Alternativas consideradas:** reautenticar en un modal o crear un endpoint de cambio. Ambas agrandan el change y la segunda requiere backend.

### D5. Datos, claves de query y cuerpos de PATCH

Cada recurso (`roles`, `sucursales`, `usuarios-sucursal`) usa una clave de query propia e invalida sólo esa clave tras una mutación exitosa, siguiendo las convenciones de `frontend/src/services/query.ts`. Los tipos son espejo de los schemas del backend (`backend/app/rbac/schemas.py` y los de sucursales), sin `any`. Los PATCH envían sólo los campos modificados y nunca `null`: `RolPatch` tiene `extra="forbid"` y rechaza `null`, de modo que editar la descripción envía `{ "descripcion": "..." }` y nada más.

### D6. Formularios y errores de dominio

Los formularios usan react-hook-form con zod y el mapeo de 422 de C-14. El modal de edición de roles (task 3.2) usa estado simple con `useState`: es un solo campo sin reglas de validación y el backend acepta cualquier `descripcion`. Los 409 de dominio se muestran junto al campo que los causa: `duplicate_nombre_sucursal` en `nombre`, `duplicate_usuario_sucursal` en `usuario`, `rol_canonico_protegido` como mensaje de la pantalla de roles. Un 403 conserva la sesión y comunica permiso insuficiente (comportamiento de C-14); un 404 por rol o sucursal inexistente se informa sin reintento.

### D7. Exportación armada en el cliente

El token vive en memoria y viaja sólo por `Authorization`, por lo que no sirve un enlace directo, y `apiRequest` devuelve JSON parseado sin acceso a `Content-Disposition`. Se llama a `apiRequest` para `GET /export` (con `desde` y `hasta` sólo si se completaron), con `timeoutMs` de 60 s, y el cliente arma el `Blob` JSON y lo descarga con el nombre `export-turnos-YYYYMMDD-HHMMSS.json` (fecha y hora locales del momento de la descarga). No se modifica `http.ts`. El contrato de salida (formato, período, claves, exclusiones y tamaño esperado) se muestra antes de descargar. El payload no se guarda en la caché de consultas ni en el estado de la pantalla, y la URL del `Blob` se revoca tras la descarga.

**Alternativa considerada:** un helper nuevo en `http.ts` que devuelva `Blob` y nombre del servidor. Se descarta por ahora: toca código de C-14 y el beneficio es que el archivo sea byte a byte el del servidor. Consecuencia aceptada: el archivo descargado es el mismo contenido, reserializado por el navegador, no una copia exacta de los bytes. Si se exige el archivo exacto del servidor, es un cambio posterior.

### D8. Importación sólo documentada

La pantalla explica que la importación se hace por el CLI `scripts/import_planilla`, que no hay endpoint, y nombra la guía `docs/migracion/README.md` como texto. No se agrega un hipervínculo a la guía: el SPA no sirve archivos del repositorio y un enlace externo depende de la rama y del acceso al repositorio. No hay controles de subida.

### D9. Autorización real en el backend

El guard es sólo navegación. Ninguna pantalla asume permiso por haber renderizado; toda llamada puede devolver 403 y se trata con el manejo de C-14. Las pruebas del guard dicen explícitamente que no sustituyen al backend.

## Risks / Trade-offs

- **Bucle de redirección:** si algún cambio del guard prohíbe `/agenda`, la redirección de permiso insuficiente entra en bucle. Mitigación: prueba que `/agenda` es navegable por todos los roles.
- **Pruebas existentes:** el cambio de `canNavigate` puede romper `route-guard.test.tsx`, `router.test.tsx`, `shell.test.tsx` o `login.test.tsx` (usa `safeReturnTo`). Mitigación: suite completa tras cada grupo.
- **Aterrizaje de `admin`:** tras el login, la ruta por defecto es `/agenda`. No está verificado que el backend permita a `admin` leer la agenda; si responde 403, `admin` caería en un error al entrar.
- **Archivo exportado reserializado:** ver D7.
- **KB desactualizada:** `knowledge-base/03_actores_y_roles.md` no define `admin` y su línea 14 («Sin admin multi-consultorio por ahora») puede leerse como contradictoria con este change. Se resuelve con el PO, fuera de este change.
- **Datos personales en la exportación:** el archivo incluye datos de pacientes. Sólo datos ficticios en pruebas, capturas y video.

## Open Questions

- ¿Puede `admin` leer `/agenda` en el backend? Se verifica en la task 6.2; si no puede, se decide el aterrizaje de `admin` (por ejemplo `/admin`) con un delta sobre el escenario de retorno tras el login.
- Resuelta en la task 3.2: el backend acepta el `PATCH` de la `descripcion` de un rol canónico; solo un `nombre` distinto o `activo: false` dan 409 `rol_canonico_protegido` (`rbac/service.py`, `actualizar_rol`).
- ¿Existen `scripts/import_planilla` y `docs/migracion/README.md` en `main`? Se verifica en la task 5.2.
- ¿Qué rol tiene el usuario del seed de C-24 (`backend/app/seed/usuario.py`)? Se verifica antes de la prueba manual de la task 6.2.

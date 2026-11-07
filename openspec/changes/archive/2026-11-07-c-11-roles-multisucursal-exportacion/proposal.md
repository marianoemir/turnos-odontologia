# Proposal: C-11 Roles, Multi-sucursal y Exportación

## Why

Hoy la API no tiene ninguna noción de identidad ni de permisos: cualquier cliente puede abrir y cerrar la caja, registrar o anular cobros y emitir facturas (`knowledge-base/10_preguntas_abiertas.md`, `Q-C10-02`). C-10 dejó explícitamente esa deuda delegada a C-11. Además, el sistema no puede operar un consultorio con más de una sede ni entregar el paquete de datos que un cierre de producción exige (pacientes, historia clínica, agenda y caja en un solo archivo), y la carga inicial de datos solo es posible con el seed ficticio, no con una planilla de carga masiva (que en este TP se usa con datos ficticios).

C-11 cierra la fase backend del roadmap: agrega RBAC mínimo, multi-sucursal básico, exportación total en un clic e importación asistida desde planilla. Es el change de mayor superficie de C-10/C-09/C-12 y el contrato que consume C-22 (`frontend-admin-roles-export`).

## What Changes

- **RBAC mínimo (nuevo)**: modelos `Rol`, `Sucursal` y `UsuarioSucursal`; capa de permisos `backend/app/rbac/` con `PermissionContext`, `PERMISOS_POR_ROL` como fuente única de capabilities, `require_permission()` derivado de esa matriz, `require_admin()` y `require_role()` como envoltorio delgado, todos como dependencias FastAPI.
- **Identidad por header con default de compatibilidad**: el rol actuante viaja en `X-Actor-Rol` (`admin`, `recepcion`, `odontologo`, `paciente`). Si el header falta, el contexto asume `recepcion` (`origen="default_compatibilidad"`). Esto es un **supuesto de implementación, no una regla de negocio**: permite que los 435 tests existentes sigan pasando sin modificarse y no constituye autenticación.
- **Cobertura de roles en los 9 endpoints de caja**: `POST /caja/abrir`, `POST /caja/cerrar`, `GET /caja/{id}`, `GET /caja`, `POST /cobros`, `GET /cobros/{id}`, `POST /cobros/{id}/anular`, `POST /cobros/{id}/factura-arca` y `GET /liquidaciones-os` quedan protegidos. Rol válido sin permiso ⇒ **403** con `detail.causa = "permiso_denegado"`; nunca 401 (no hay login) ni 500.
- **Multi-sucursal básico**: alta y edición de `Sucursal`, asignación usuario↔sucursal (`UsuarioSucursal`) y `sucursal_id` aditivo en `profesionales` y `sillones` para filtrar los listados del catálogo. **No se toca el esquema de caja**: una caja por día sigue siendo global. Turnos, pacientes, HC y caja siguen siendo globales en este change.
- **`GET /export` (admin)**: descarga en un solo archivo JSON los cuatro dominios —pacientes, historia clínica, agenda y caja— con contrato de salida de 30 días documentado en `docs/export/README.md`.
- **Importación asistida**: script `scripts/import_planilla.py` (pacientes por `dni`, profesionales por `matrícula`), idempotente por clave natural, con reporte de creados/actualizados/rechazados y guía en español en `docs/migracion/README.md`. Es el **último grupo de tareas** y es separable del resto del change.
- **Migración `007_roles_sucursales`** aditiva sobre el head vigente `006_catalogo_activo`, con `downgrade` limpio y seed idempotente de los 4 roles canónicos.
- **Tests nuevos** para RBAC, aislamiento por sucursal, exportación de los 4 dominios e idempotencia de importación. La suite completa no puede bajar de **435 passed** contra PostgreSQL real `turnos_test` en el puerto 5433.

## Capabilities

### New Capabilities
- `rbac`: modelo de roles, contexto de permiso, resolución de identidad por header con default de compatibilidad, matriz única capability → roles (`PERMISOS_POR_ROL`), autorización `require_permission()`/`require_admin()` con `require_role()` como envoltorio delgado, semántica de 403 y administración de roles y asignaciones usuario-sucursal.
- `multisucursal`: entidad `Sucursal`, alcance de datos por sucursal y límites explícitos de aislamiento (qué queda global en este change).
- `exportacion-datos`: exportación total en un archivo, cuatro dominios en el mismo payload y contrato de salida a 30 días.
- `importacion-planilla`: importación asistida desde CSV, idempotencia por clave natural y reporte de errores parciales.

### Modified Capabilities
- `caja-pagos`: se agrega el requisito de autorización por rol de las 9 operaciones de caja (matriz endpoint × rol, 403 ante rol válido sin permiso) y la compatibilidad del rol por defecto cuando no hay identidad.
- `catalogo-recursos`: se agrega el filtro opcional `?sucursal_id=` en `GET /profesionales` y `GET /sillones`, y el campo `sucursal_id` en sus respuestas.

## Impact

- **Migración Alembic**: `007_roles_sucursales` sobre `006_catalogo_activo` (número referencial; si C-07 mergea antes, se rebasa y renumera).
- **Modelos**: `backend/app/rbac/models.py` (nuevo); `backend/app/agenda/models.py` (+`sucursal_id` nullable en `Profesional` y `SillonBox`).
- **Routers**: `backend/app/rbac/router.py` (roles, sucursales, usuarios-sucursal), `backend/app/export/router.py` y `backend/app/export/service.py`; se modifica `backend/app/caja/router.py` (dependencias de rol por endpoint) y `backend/app/agenda/router_catalogo.py` (filtro por sucursal); `backend/app/main.py` monta los routers nuevos.
- **Scripts y documentación**: `scripts/import_planilla.py`, `docs/migracion/README.md`, `docs/export/README.md`, enlace desde `README.md` raíz.
- **Tests**: `backend/tests/conftest.py` (`_CATALOGO_TABLES` suma `roles`, `sucursales`, `usuarios_sucursal`), más archivos nuevos de RBAC, sucursales, exportación e importación, y la matriz de roles sobre caja.
- **Sin cambios**: `docker-compose.yml`, `backend/Dockerfile` y `.github/workflows/tests.yml` **no se tocan** (C-11 corre en par con C-13; C-23 es dueño de la infraestructura). Tampoco se toca el esquema de `caja`, `cobro` ni `liquidacion_os`.

## Defaults aceptados sin respuesta de negocio

Los siguientes puntos quedaron abiertos en la KB y se cierran con un default conservador. **No bloquean el change** y quedan registrados textualmente:

1. **¿Login real o solo roles?** → *Roles solamente, sin login real.* La identidad es un mecanismo interno/test documentado (`X-Actor-Rol`); el login JWT real queda diferido y anotado como trabajo futuro. Estado: default aceptado sin respuesta de negocio al 06/11/2026.
2. **¿Multi-sucursal básico sin tocar el esquema de caja?** → *Sí. Sin migración sobre caja.* Una caja por día sigue siendo global (`Q-C10-01`, en `knowledge-base/10_preguntas_abiertas.md`; `Q-C10-05`, en `openspec/changes/archive/2026-11-05-c-10-caja-pagos-os-arca/design.md`). Estado: default aceptado sin respuesta de negocio al 06/11/2026.
3. **¿Importación desde planilla?** → *Último grupo de tareas, separable.* Estado: default aceptado sin respuesta de negocio al 06/11/2026.

## Out of Scope

- **Login real / JWT / sesiones**: no hay tabla de usuarios con credenciales, ni emisión/validación de tokens, ni `SECRET_KEY` en uso. `UsuarioSucursal` es una asignación usuario-rol-sucursal, no una cuenta autenticable.
- **Cambios en el esquema de caja**: no se agrega `sucursal_id` a `caja`, `cobro` ni `liquidacion_os`; no se cambia la unicidad global de `caja.fecha`.
- **Aislamiento por sucursal de turnos, pacientes, HC y caja**: quedan globales y se documenta el límite.
- **C-07 `recordatorios-confirmacion`** y cualquier funcionalidad asincrónica/Redis.
- **Frontend**: todo lo visual es de C-13 (foundation) y C-22 (admin/roles/export). C-11 solo entrega contratos HTTP y archivos descargables.
- **Permisos editables por capability persistidos en base**: la matriz vive en código y `GET /roles` la expone derivada; la edición de permisos no se persiste en C-11.
- **Datos reales de pacientes**: la importación, los seeds y los tests trabajan exclusivamente con datos ficticios; los pacientes importados conservan `ficticio = true`. Cargar datos reales requeriría una decisión separada y queda fuera del TP.
- **Infraestructura**: `docker-compose.yml`, `backend/Dockerfile` y `.github/workflows/tests.yml` no se modifican.

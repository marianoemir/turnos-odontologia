# Tasks: C-11 Roles, Multi-sucursal y Exportación

> TDD estricto: cada grupo escribe primero su test (RED por la razón correcta) y después implementa (GREEN). Verificación contra PostgreSQL real `turnos_test` en el puerto 5433. Solo `ruff check`, nunca `ruff format`.
>
> Plan: **49 tareas** en 12 grupos (2 + 5 + 4 + 3 + 3 + 3 + 3 + 10 + 4 + 4 + 2 + 6).

## 1. Preflight y baseline

- [x] 1.1 Verificar el head de Alembic y la baseline con el entorno exacto: `DATABASE_URL=postgresql+psycopg://odontologia:odontologia@localhost:5433/turnos_test` y `TZ=America/Argentina/Buenos_Aires`. Desde `backend/`: `..\.venv\Scripts\python.exe -m alembic heads` debe reportar `006_catalogo_activo (head)`; en el mismo directorio, `..\.venv\Scripts\python.exe -m pytest tests -q` debe dar **435 passed** (no `pytest backend/tests` con el `cd` puesto: duplica el prefijo y no encuentra el archivo). Registrar el número exacto como piso.

  Equivalencia verificada: la línea base de 435 passed se obtuvo desde la raíz del repo con el venv activado y `$env:PYTHONPATH = (Get-Location).Path`, corriendo `pytest backend/tests -p no:randomly -q`. Ese comando es el canónico para comparar contra el piso; si el comando de arriba (desde `backend/`) da un número distinto, usar el de la raíz y registrar la diferencia. En PowerShell la zona se fija con `$env:TZ = "America/Argentina/Buenos_Aires"`.
- [x] 1.2 Confirmar con `git status --short` que no hay cambios en `docker-compose.yml`, `backend/Dockerfile` ni `.github/workflows/tests.yml`, y dejar registrado que esos tres archivos son intocables durante todo el change. Dejar registrada también la regla de acceso a datos: **toda inspección de la base va por el MCP `postgres` (solo lectura); `psql` y `docker compose exec` están prohibidos** para consultar o modificar datos.

  Verificado el 06/11/2026: `git status --short` solo muestra `M CHANGES.md` y `?? openspec/changes/c-11-roles-multisucursal-exportacion/`. Los tres archivos de infraestructura quedan intocables y la regla de acceso a datos (MCP `postgres` solo lectura; `psql`/`docker compose exec` prohibidos) rige todo el change.

## 2. Migración 007, modelos y truncado de tests

- [x] 2.1 (TDD RED) Crear `backend/tests/test_migracion_roles.py` con **dos fixtures separadas**: (a) schema y constraints sobre `db_session` — `roles`, `sucursales` y `usuarios_sucursal` existen en `information_schema`; `profesionales.sucursal_id` y `sillones.sucursal_id` existen y son nullable; las FKs y la unique `(usuario, sucursal_id)` existen; (b) **seed sobre `_db_engine`** — una sesión propia (`Session(bind=_db_engine)`) abierta después de `alembic upgrade head` afirma los 4 roles canónicos (`admin`, `recepcion`, `odontologo`, `paciente`). El seed **no** se afirma en `db_session`: esa fixture trunca `roles` antes de cada test. Como ese TRUNCATE (con `roles` en `_CATALOGO_TABLES` desde 2.4) pudo haberse commiteado en tests anteriores, el test **no puede depender del orden de ejecución**: antes de afirmar, reaplica la migración sobre `_db_engine` (`alembic.command.downgrade` a la `down_revision` de la 007 y luego `alembic.command.upgrade` a la 007) para que el seed esté presente. Verificar primero en `conftest.py` si el TRUNCATE se commitea o corre dentro de la transacción de la fixture, y dejar registrado lo que se encontró. Verificar el rojo ejecutando solo ese archivo.
- [x] 2.2 Crear `backend/alembic/versions/007_roles_sucursales.py` sobre `006_catalogo_activo` con las tablas, índices, FKs, `sucursal_id` nullable en `profesionales`/`sillones` y el seed idempotente `ON CONFLICT (nombre) DO NOTHING` de `admin`, `recepcion`, `odontologo`, `paciente`; incluir `downgrade()` inverso completo. **No** se agregan columnas nuevas a `profesionales` (no hay `especialidad`): la 007 solo toca `sucursal_id`.
- [x] 2.3 Crear `backend/app/rbac/models.py` (`Rol`, `Sucursal`, `UsuarioSucursal`) y agregar `sucursal_id` nullable a `Profesional` y `SillonBox` en `backend/app/agenda/models.py`; verificar con `python -m alembic check` que modelo y esquema coinciden (o inspección por MCP `postgres` si `check` no aplica).
- [x] 2.4 Sumar `usuarios_sucursal, roles, sucursales` a `_CATALOGO_TABLES` en `backend/tests/conftest.py` y agregar el fixture `roles_canonicos` que inserta los 4 roles en la sesión de test (para los endpoints que necesitan filas de rol). Verificar en `conftest.py` que `sucursales` se trunca en el **mismo** statement que `profesionales` y `sillones` (que ahora la referencian por FK) o con `CASCADE`, para no violar la FK. Criterio de aceptación: `test_migracion_roles.py` queda **verde entero** — schema/columnas/FKs por `db_session` y seed por la sesión propia de `_db_engine` — y el truncado por test deja las tablas nuevas vacías sin romper la suite.
- [x] 2.5 Verificar la migración de ida y vuelta: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head`, y confirmar **por el MCP `postgres` (solo lectura, único canal permitido)** tablas, columnas, FKs e índices. Cerrar con `ruff check backend` limpio.

## 3. Núcleo RBAC: contexto y dependencias

- [x] 3.1 (TDD RED) Crear `backend/tests/test_rbac_contexto.py` con: header `admin` → contexto `admin/origen=header`; sin header → `recepcion/origen=default_compatibilidad`; header `superusuario` → 422 `rol_desconocido`; header `ADMIN` → 422 (comparación exacta y case-sensitive, sin recorte: ` admin` (espacio al borde) → 422); `X-Sucursal-Id` que no es UUID o UUID inexistente en `sucursales` → 422; `require_permission("caja:escribir")` con rol autorizado deja pasar; rol válido no autorizado → 403 `permiso_denegado`; la denegación no responde 401. Verificar el rojo.
- [x] 3.2 Crear `backend/app/rbac/permissions.py` (constantes `ROLES`, `PERMISOS_POR_ROL` y `roles_con_permiso(capability)` como derivación única) y `backend/app/rbac/context.py` (`PermissionContext` + `get_permission_context` con los headers `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id`, incluida la validación de sucursal). La matriz capability → roles es la **única fuente**: lo que expone `GET /roles` y lo que verifica cada endpoint salen de ahí.
- [x] 3.3 Crear `backend/app/rbac/dependencies.py` con `require_permission(capability)` como dependencia principal, `require_admin()` == `require_permission("admin:gestionar")` y `require_role(*roles)` como envoltorio delgado de la misma estructura; todas devuelven dependencias FastAPI y lanzan 403 uniforme **antes** del handler.
- [x] 3.4 (TDD RED→GREEN) Crear `backend/tests/test_rbac_permisos.py`: para cada uno de los 9 endpoints de caja, `roles_con_permiso(<capability>)` debe reproducir **exactamente** la columna "allow" de la matriz 9×4 de `design.md` D3, y `GET /roles` debe exponer esas capabilities sin wildcard. Correrlo en rojo contra una matriz incompleta y en verde después. Luego verificar por mutación que quitar el default de compatibilidad rompe el caso "sin header" y que devolver 401 en vez de 403 rompe el caso de denegación; restaurar y dejar `ruff check backend` limpio. (el caso GET /roles sin wildcard se completa en el grupo 4, tarea 4.1)

## 4. Endpoints de roles (admin)

- [x] 4.1 (TDD RED) Crear `backend/tests/test_roles_api.py` con: `GET /roles` como admin lista los 4 roles con `permisos` derivados; **sin header → `GET /roles` responde 403 y el contexto es `origen=default_compatibilidad`** (el default nunca alcanza la administración); `POST /roles` crea (201); nombre duplicado → 409 `duplicate_nombre_rol` en POST y PATCH; `PATCH /roles/{id}` con `{"activo": false}` da de baja lógica; id inexistente → 404; `recepcion`, `odontologo` y `paciente` → 403; body inválido → 422; `PATCH` con `nombre` distinto o `activo=false` sobre un rol canónico → 409 `rol_canonico_protegido` y `PATCH` solo de `descripcion` → 200; un rol no canónico creado por `POST /roles` aparece con `permisos = []` y usado como `X-Actor-Rol` da 422; `GET /roles` expone las capabilities sin wildcard (caso heredado de la tarea 3.4). Verificar el rojo.
- [x] 4.2 Implementar `backend/app/rbac/schemas.py`, `service.py` y `router.py` para `GET/POST /roles` y `PATCH /roles/{id}`, con unicidad, baja lógica y `permisos` derivados de `PERMISOS_POR_ROL`. Implementar la protección de los 4 roles canónicos (409 `rol_canonico_protegido` al cambiar `nombre` o dar de baja) y `permisos = []` para roles no canónicos.
- [x] 4.3 Montar `rbac_router` en `backend/app/main.py` y poner `test_roles_api.py` en verde; verificar que `GET /openapi.json` expone `/roles` y dejar `ruff check backend` limpio.

## 5. Endpoints de sucursales (admin)

- [x] 5.1 (TDD RED) Crear `backend/tests/test_sucursales_api.py` con: alta 201 y listado ordenado por `(nombre, id)`; nombre duplicado → 409 `duplicate_nombre_sucursal`; `PATCH {"activo": false}` la excluye del listado por defecto y la incluye con `?incluir_inactivos=true`; id inexistente → 404; body inválido → 422; los roles no admin → 403. Verificar el rojo.
- [x] 5.2 Implementar schemas y endpoints `GET/POST /sucursales` y `PATCH /sucursales/{id}` en `backend/app/rbac/` con el mismo patrón de servicio y errores de C-12.
- [x] 5.3 Poner `test_sucursales_api.py` en verde y verificar que la matriz de admin (admin allow; recepcion/odontologo/paciente 403) se cumple en los 3 endpoints; `ruff check backend` limpio.

## 6. Endpoints de asignación usuario-sucursal (admin)

- [x] 6.1 (TDD RED) Crear `backend/tests/test_usuarios_sucursal_api.py` con: alta 201 con rol y sucursal existentes; `(usuario, sucursal_id)` duplicado → 409 `duplicate_usuario_sucursal`; `rol_id` o `sucursal_id` inexistente → 404; `PATCH` de `activo` y de referencias; filtro `?sucursal_id=` y `?usuario=`; roles no admin → 403. Verificar el rojo.
- [x] 6.2 Implementar schemas y endpoints `GET/POST /usuarios-sucursal` y `PATCH /usuarios-sucursal/{id}` con validación de FKs y unicidad.
- [x] 6.3 Poner `test_usuarios_sucursal_api.py` en verde, verificar 403 para los 3 roles no admin y dejar `ruff check backend` limpio.

## 7. Sucursal en el catálogo y aislamiento

- [x] 7.1 (TDD RED) Crear `backend/tests/test_multisucursal_aislamiento.py` con: alta de profesional y sillón con `sucursal_id` (201 y respuesta con el campo); `PATCH` parcial conserva la sucursal; filtro por A no devuelve datos de B; filtro por sucursal inexistente → 404; sin filtro se conserva el contrato de C-12 (A, B y sin sucursal); el filtro respeta `incluir_inactivos`; `GET /caja` y `GET /agenda` no se particionan por sucursal (límite documentado). Verificar el rojo.
- [x] 7.2 Agregar `sucursal_id` a los schemas Create/Patch/Out de profesionales y sillones en `backend/app/agenda/schemas.py` y el parámetro `?sucursal_id=` con validación 404 en `backend/app/agenda/router_catalogo.py`.
- [x] 7.3 Poner `test_multisucursal_aislamiento.py` en verde y verificar por mutación que quitar el filtro mezcla A y B (rojo) y que restaurarlo aísla (verde); `ruff check backend` limpio.

## 8. RBAC en los 9 endpoints de caja

Cada subtarea agrega 4 casos (admin, recepcion, odontologo, paciente) a `backend/tests/test_caja_roles_api.py` y aplica la dependencia en `backend/app/caja/router.py`. Los casos "allow" usan fixtures válidos; los "deny" afirman 403 con `causa=permiso_denegado` y, en escrituras, ausencia de filas nuevas.

**Regla del grupo:** el 403 sale de `Depends(require_permission("<capability>"))` en la firma del handler, evaluado **antes** del cuerpo. Nunca se llama a `require_permission()`/`require_role()` dentro del handler: los 9 handlers están envueltos en `except Exception` y `_traducir_error` convertiría ese `HTTPException` en **500**.

- [x] 8.1 `POST /caja/abrir`: 4 casos (admin→201, recepcion→201, odontologo→403, paciente→403 sin caja creada) [RED] y `Depends(require_permission("caja:escribir"))` en la firma [GREEN].
- [x] 8.2 `POST /caja/cerrar`: 4 casos (admin→200, recepcion→200, odontologo→403, paciente→403 con caja aún abierta) [RED] y `Depends(require_permission("caja:escribir"))` [GREEN].
- [x] 8.3 `GET /caja/{id}`: 4 casos (admin→200, recepcion→200, odontologo→200, paciente→403) [RED] y `Depends(require_permission("caja:leer"))` [GREEN].
- [x] 8.4 `GET /caja`: 4 casos (admin→200, recepcion→200, odontologo→200, paciente→403) [RED] y `Depends(require_permission("caja:leer"))` [GREEN].
- [x] 8.5 `POST /cobros`: 4 casos (admin→201, recepcion→201, odontologo→403, paciente→403 sin cobro creado) [RED] y `Depends(require_permission("cobros:escribir"))` [GREEN].
- [x] 8.6 `GET /cobros/{id}`: 4 casos (admin→200, recepcion→200, odontologo→200, paciente→403) [RED] y `Depends(require_permission("cobros:leer"))` [GREEN].
- [x] 8.7 `POST /cobros/{id}/anular`: 4 casos (admin→200, recepcion→200, odontologo→403, paciente→403 con el cobro aún `registrado`) [RED] y `Depends(require_permission("cobros:escribir"))` [GREEN].
- [x] 8.8 `POST /cobros/{id}/factura-arca`: 4 casos (admin→201, recepcion→201, odontologo→403, paciente→403 sin factura ni CAE) [RED] y `Depends(require_permission("cobros:facturar"))` [GREEN].
- [x] 8.9 `GET /liquidaciones-os`: 4 casos (admin→200, recepcion→200, odontologo→200, paciente→403) [RED] y `Depends(require_permission("liquidaciones:leer"))` [GREEN].
- [x] 8.10 Verificar la matriz completa: 36/36 casos en verde, `detail.causa = "permiso_denegado"` exacto, ningún 401, ningún 500, y las 9 capability exigidas coinciden con la matriz 9×4 de `test_rbac_permisos.py`; mutación de control (quitar una dependencia) produce el fallo esperado al revertir; `ruff check backend` limpio.

## 9. Exportación total y su contrato

- [x] 9.1 (TDD RED) Crear `backend/tests/test_export_api.py` con: `GET /export` como admin devuelve 200, `Content-Disposition: attachment` y las cuatro rutas con contenido —`pacientes[]`, `historia_clinica.entradas[]`, `agenda.turnos[]`, `caja.cobros[]`— tras sembrar un registro de cada dominio; `contrato_version`, `zona` y `periodo` correctos con `get_ahora` sobrescrito; período por defecto de 30 días (06/11/2026 → desde 08/10/2026); período personalizado de 10 días; rango >30 días → 422; rango invertido → 422; `recepcion`, `odontologo` y `paciente` → 403; **sin header → `GET /export` 403 con origen `default_compatibilidad`**. Verificar el rojo.
- [x] 9.2 Implementar `backend/app/export/schemas.py` y `backend/app/export/service.py` con las consultas a los 4 dominios, el filtrado por período y la serialización JSON UTF-8 (`contrato_version="1.0"`, centavos enteros, fechas ISO-8601, reloj inyectable de `backend.app.caja.reloj`).
- [x] 9.3 Implementar `backend/app/export/router.py` con `require_admin()` (`== require_permission("admin:gestionar")`) como `Depends` en la firma, los parámetros `desde`/`hasta`, la validación 422 y el `Response` con `media_type="application/json"` y header de descarga; montar `export_router` en `backend/app/main.py` y poner el test en verde. Verificar por mutación: sacar `require_admin()` del handler debe romper los casos 403 (recepcion, odontologo, paciente y sin header); restaurar y dejar `ruff check backend` limpio.
- [x] 9.4 Escribir `docs/export/README.md` en español, enlazado desde `README.md`, con una sección por punto del contrato (checklist verificable con `grep` — un bullet por punto, sin "verificar manualmente"):
  - Formato: JSON UTF-8 sin BOM, `indent=2`, extensión `.json`, `Content-Disposition: attachment; filename="export-turnos-YYYYMMDD-HHMMSS.json"`.
  - Versión del contrato: `contrato_version = "1.0"`.
  - Período: `hasta` = día local actual, `desde` = `hasta − 29` (30 días inclusive), acotable con `?desde=`/`?hasta=`, máximo 30 días.
  - Claves del envelope: `pacientes`, `historia_clinica{historias,entradas,odontogramas,planes,items}`, `agenda{turnos,profesionales,sillones,prestaciones}`, `caja{cajas,cobros,liquidaciones_os}`.
  - Filtrado: `agenda.turnos` por `inicio`, `caja.cajas` por `fecha`, `cobros` y `liquidaciones_os` por `creado_en`; pacientes y HC completos.
  - Serialización: UUID y fechas ISO-8601 con offset; montos en centavos enteros.
  - Tamaño esperado: menor a 10 MB, sin comprimir.
  - Exclusiones: `SECRET_KEY`, `MP_ACCESS_TOKEN`, certificados ARCA y todo token/credencial o variable de entorno.
  - Autorización: solo `admin`; 422 para rango mayor a 30 días o invertido.
  - Aviso de seguridad (destacado en negrita): **el rol viaja en el header `X-Actor-Rol`, que cualquier cliente puede falsificar; hasta que exista login real, `GET /export` no es un control de seguridad y solo debe usarse con datos ficticios.**

## 10. Importación asistida: servicio, CLI y tests

- [x] 10.1 (TDD RED) Crear `backend/tests/test_import_planilla.py` con: CSV válido crea pacientes y profesionales; segunda corrida reporta `creados=0` y `actualizados=N` sin duplicar filas; cambio de `nombre` con el mismo `dni` actualiza; clave repetida dentro del archivo rechaza la segunda aparición; fila sin `dni` rechazada con línea y motivo sin revertir las válidas; `tipo` desconocido rechazado; cabecera inválida no escribe y devuelve código 2 (incluye el caso de una columna `especialidad`, que no existe en el modelo y no se admite, y el de una cabecera sin `matricula`); una cabecera sin la columna opcional `contacto` es válida y procesa las filas; `--dry-run` no escribe; **los pacientes importados quedan con `ficticio = True`**. Verificar el rojo.
- [x] 10.2 Implementar `backend/app/migracion/service.py` con `importar_planilla(session, ruta, dry_run=False)` que recibe la **sesión inyectada** y **no** commitea ni cierra (el `commit()` final es de quien invoca), `ReporteImportacion` y `Rechazo`, claves naturales `dni`/`matricula`, **savepoint por fila** (`session.begin_nested()`) y detección de duplicados intra-archivo. El CSV admite solo `tipo,nombre,dni,matricula,contacto`, con `contacto` opcional en la cabecera.
- [x] 10.3 Crear `scripts/__init__.py` y `scripts/import_planilla.py` (CLI con `--archivo`, `--dry-run`, `--reporte`, impresión del resumen en español y códigos de salida 0/1/2), invocable como `python -m scripts.import_planilla --archivo <ruta>` desde la raíz del repo (así `backend` es importable).
- [x] 10.4 Poner `test_import_planilla.py` en verde con **una corrida idempotente de dos pasadas dentro de la fixture** (`db_session` + savepoints: ambas comparten la transacción, así la segunda ve la primera sin commitear) más el caso `--dry-run`; verificar por mutación que quitar la búsqueda por clave natural (crear siempre) rompe la idempotencia de la segunda pasada, restaurar y dejar `ruff check backend scripts` limpio. **No** se ejecuta el CLI dos veces contra `turnos_test`: si se quiere una prueba real de doble corrida, va contra una base descartable, nunca contra la compartida.

## 11. Guía de migración desde planilla

- [x] 11.1 Escribir `docs/migracion/README.md` en español (formato CSV con las columnas `tipo,nombre,dni,matricula,contacto` —sin `especialidad`—, columnas obligatorias por tipo, `contacto` opcional en la cabecera, ejemplo de ejecución con `python -m scripts.import_planilla --archivo <ruta>`, `--dry-run`, códigos de salida, idempotencia, qué hacer ante rechazos y el aviso de que solo se cargan **datos ficticios o de prueba**, con `ficticio=true` en los pacientes) y `docs/migracion/ejemplo_planilla.csv` con datos ficticios válidos (`DNI-FICT-*`, `MP-FICT-*`).
- [x] 11.2 Verificar el comando documentado tal cual: `python -m scripts.import_planilla --archivo docs/migracion/ejemplo_planilla.csv --dry-run` sobre `turnos_test` no escribe y muestra el resumen esperado; enlazar la guía desde `README.md`.

## 12. Verificación integral

- [x] 12.1 Ejecutar la suite completa contra PostgreSQL real `turnos_test` (puerto 5433), desde `backend/`: `..\.venv\Scripts\python.exe -m pytest tests -q` con `DATABASE_URL=postgresql+psycopg://odontologia:odontologia@localhost:5433/turnos_test` y `TZ=America/Argentina/Buenos_Aires`; debe dar **≥ 435 passed, 0 failed** y registrar el total exacto (esperado ~540); confirmar que ningún test existente fue modificado (`git diff --stat backend/tests` solo muestra `conftest.py` y archivos nuevos).
- [x] 12.2 Ejecutar `ruff check backend scripts` (sin `ruff format`) y confirmar salida limpia.
- [x] 12.3 Verificar migraciones: `alembic heads` = `007_roles_sucursales`, `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head` sin errores, **Desviación (grupo 12): el MCP `postgres` no estaba disponible en el catálogo de herramientas del entorno; no se usó `psql`, `docker compose exec` ni ninguna otra vía de acceso a datos para inspeccionar el esquema/seed. Esquema y seed cerrados con evidencia de alembic (heads=007, upgrade/downgrade/upgrade exit 0) y test_migracion_roles.py (3 passed). La 2.5 queda SIN marcar por falta de evidencia del MCP.** y confirmar el esquema final y el seed de roles **por el MCP `postgres` (solo lectura)**; `psql` y `docker compose exec` están prohibidos para cualquier inspección de datos.
- [x] 12.4 Confirmar que los 9 endpoints de caja responden 403 para `paciente` y que los contratos de `/roles`, `/sucursales`, `/usuarios-sucursal`, `/export` y el filtro `?sucursal_id=` figuran en `/openapi.json`.
- [x] 12.5 Confirmar que `docker-compose.yml`, `backend/Dockerfile` y `.github/workflows/tests.yml` no tienen cambios (`git status --short`) y que no se agregaron dependencias a `backend/requirements.txt`. Dejar constancia de que la regla de acceso a la base (MCP `postgres` solo lectura; `psql`/`docker compose exec` prohibidos) se respetó en todo el change.
- [x] 12.6 Confirmar contra `design.md` D6b los cuatro contratos que consume C-22 y que ningún artefacto del change promete más: (a) `permisos` de `/roles` es solo lectura derivada, sin edición; (b) la importación es solo CLI, sin endpoint HTTP ni UI en C-11; (c) el alcance por sucursal es parcial y el selector de C-22 solo afecta listados del catálogo; (d) `/usuarios-sucursal` usa `usuario` texto libre, sin `GET /usuarios`.

## Workflow follow-up

- Ejecutar `/opsx:apply c-11-roles-multisucursal-exportacion` para implementar estas tareas.
- Verificar la suite completa en verde antes de `/opsx:archive c-11-roles-multisucursal-exportacion`.
- Marcar C-11 como archivado en `CHANGES.md` y actualizar el estado del roadmap según corresponda.
- No commitear ni pushear sin pedido explícito.

## Trazabilidad spec → tarea

| Spec / Requirement | Tareas |
|---|---|
| `rbac` — Resolución del contexto de permiso | 3.1–3.4 |
| `rbac` — Autorización con 403 uniforme | 3.1–3.4, 8.1–8.10 |
| `rbac` — Autorización exclusiva de administración | 4.3, 5.3, 6.3, 9.3 |
| `rbac` — Administración de roles | 4.1–4.3 |
| `rbac` — Roles canónicos protegidos y rol de asignación informativo | 4.1–4.3, 6.1–6.3 |
| `rbac` — Asignación usuario-sucursal con rol | 6.1–6.3 |
| `rbac` — Compatibilidad con clientes sin identidad | 3.1–3.4, 4.1, 8.10, 9.1, 12.1 |
| `multisucursal` — Sucursal administrable | 5.1–5.3 |
| `multisucursal` — Alcance de sucursal de profesionales y sillones | 7.1–7.3 |
| `multisucursal` — Aislamiento de lecturas por sucursal | 7.1–7.3 |
| `multisucursal` — Límites explícitos del aislamiento por sucursal | 7.1, 7.3, 12.4 |
| `caja-pagos` — Matriz de roles (9 escenarios) | 8.1–8.9 |
| `caja-pagos` — Denegación sin efectos laterales ni 401 | 8.1, 8.2, 8.5, 8.7, 8.8, 8.10 |
| `caja-pagos` — Compatibilidad del rol por defecto | 8.10, 12.1 |
| `catalogo-recursos` — Sucursal asignable | 7.1–7.3 |
| `catalogo-recursos` — Filtrado por sucursal | 7.1–7.3 |
| `exportacion-datos` — Exportación total en un archivo | 9.1–9.3, 12.4 |
| `exportacion-datos` — Contrato de salida de 30 días | 9.1–9.3 |
| `exportacion-datos` — Contrato documentado | 9.4 |
| `importacion-planilla` — Importación CSV | 10.1–10.4, 11.1–11.2 |
| `importacion-planilla` — Idempotencia por clave natural | 10.1–10.4 |
| `importacion-planilla` — Errores parciales y dry-run | 10.1–10.4, 11.1–11.2 |

Matriz capability → rol (única fuente, `design.md` D2–D3): se verifica en 3.4 y 8.10. Contratos de C-22 (`design.md` D6b): se verifican en 12.6.

# Design: C-11 Roles, Multi-sucursal y Exportación

## Context

Ver `proposal.md` — Why. El estado relevante del repo al planificar (06/11/2026):

- **No existe autenticación ni autorización**: no hay dependencia de identidad, ni header, ni tabla de usuarios. `backend/app/main.py` monta seis routers directamente (`turnos`, `agenda`, `catalogo`, `lista_espera`, `hc`, `caja`).
- Los 9 endpoints de caja de C-10 (`backend/app/caja/router.py`) no reciben identidad. `backend/tests/test_caja_api.py` los invoca con `TestClient` sin headers.
- **Baseline de tests: 435 passed** contra PostgreSQL real `turnos_test` en el puerto 5433 (`DATABASE_URL=postgresql+psycopg://odontologia:odontologia@localhost:5433/turnos_test`). Este número es piso, no techo.
- **Alembic head verificado: `006_catalogo_activo`** (`python -m alembic heads` desde `backend/`). La revisión nueva es `007_roles_sucursales`.
- Dependencias archivadas: C-09 `hc-odontograma`, C-10 `caja-pagos-os-arca`, C-12 `catalogo-recursos-api`.
- C-11 se ejecuta en par con C-13 (frontend foundation). C-23 es dueño de la infraestructura.

Restricciones de contrato (`AGENTS.md`): 409 para conflicto de negocio, 422 para input inválido, sin hard delete, sin datos reales, sin secretos en repo, sin `ruff format` (solo `ruff check`, que es lo que corre CI), sin commits.

## Goals / Non-Goals

**Goals:**
- Capa RBAC mínima, reutilizable y testeable, aplicada a los 9 endpoints de caja y a los endpoints administrativos nuevos.
- Mantener los 435 tests existentes pasando **sin modificarlos**, mediante un default de compatibilidad documentado.
- Multi-sucursal básico con aislamiento verificable en profesionales y sillones, sin tocar el esquema de caja.
- Exportación total en un archivo con contrato de 30 días documentado.
- Importación asistida idempotente y separable.

**Non-Goals (de diseño):**
- No se implementa login, JWT, hash de contraseñas, sesiones ni `SECRET_KEY`.
- No se agrega `sucursal_id` a `caja`, `cobro`, `liquidacion_os`, `turnos`, `pacientes`, `historia_clinica` ni sus derivadas.
- No se persisten permisos editables por capability: la matriz vive en código y se expone derivada.
- No se toca la infraestructura (`docker-compose.yml`, `backend/Dockerfile`, `.github/workflows/tests.yml`).
- No se modifica la semántica de negocio de caja de C-10 (arqueo, anulación, facturación, 409).

## Decisions

### D1 — Identidad por header con default de compatibilidad

**Decisión:** el rol actuante viaja en el header `X-Actor-Rol`, con valores admitidos `admin`, `recepcion`, `odontologo` y `paciente`. Un segundo header opcional `X-Actor-Usuario` identifica al actor para trazabilidad y `X-Sucursal-Id` (UUID) declara la sucursal activa. Una dependencia FastAPI `get_permission_context` resuelve:

```python
@dataclass(frozen=True)
class PermissionContext:
    rol: str
    usuario: str | None
    sucursal_id: uuid.UUID | None
    origen: Literal["header", "default_compatibilidad"]
```

- Header presente y válido → `origen="header"`.
- **Header ausente → `rol="recepcion"`, `origen="default_compatibilidad"`**.
- Header presente con valor desconocido → **422** (`causa="rol_desconocido"`), porque es input inválido y no una denegación de permiso. El valor se compara **exactamente** y es case-sensitive, así que `ADMIN` también es 422 (ver D9). Los espacios en los bordes del valor no se especifican ni se testean: el servidor HTTP los recorta antes de que lleguen a la aplicación.
- `X-Sucursal-Id`, si viene, se valida una sola vez en esta dependencia: UUID válido y existente en `sucursales`; si no, **422**. Los 9 endpoints de caja lo reciben y, si es válido, lo **ignoran** (la caja es global, D5).

**Por qué este default:** los 435 tests actuales llaman a los endpoints de caja sin identidad. `recepcion` es el rol que la KB define como operador de caja, así que el default reproduce exactamente el comportamiento previo (201/200/409/422) sin editar un solo test. Es un **supuesto de implementación**, no una regla de negocio: no autentica, no protege y desaparece cuando llegue el login real (trabajo futuro). Queda registrado en `proposal.md` §"Defaults aceptados sin respuesta de negocio" y en D14.

**Alternativas descartadas:**
- *JWT real*: fuera de alcance por default cerrado; exige tabla de credenciales, emisión, validación y `SECRET_KEY`, y rompería los 435 tests sin reescritura masiva.
- *Query param `?rol=`*: contamina URLs, se filtra en logs y complica los contratos que consumirá C-22.
- *Variable de entorno `DEFAULT_ROLE`*: fija el default global pero no permite probar roles distintos en el mismo proceso de test.
- *Sin default (todo 403 sin header)*: obligaría a modificar los 435 tests y a reescribir la suite de caja; viola el requisito de no degradar la baseline.

**Riesgo asumido:** el header es falsificable. Se documenta que **no es un control de seguridad**; la autorización real requiere login (futuro). Es el mismo supuesto que C-13/C-14 ya usan para el selector de rol en la UI.

### D2 — Capa de permisos y semántica de error

**Decisión:** `backend/app/rbac/permissions.py` define **una única fuente de verdad**: la matriz capability → roles. Todo lo demás se deriva de ella — lo que `GET /roles` expone a C-22 y lo que la API verifica en cada endpoint.

```python
ROLES = ("admin", "recepcion", "odontologo", "paciente")

PERMISOS_POR_ROL: dict[str, frozenset[str]] = {
    "admin": frozenset({
        "caja:leer", "caja:escribir", "cobros:leer", "cobros:escribir",
        "cobros:facturar", "liquidaciones:leer", "admin:gestionar",
    }),
    "recepcion": frozenset({
        "caja:leer", "caja:escribir", "cobros:leer", "cobros:escribir",
        "cobros:facturar", "liquidaciones:leer",
    }),
    "odontologo": frozenset({"caja:leer", "cobros:leer", "liquidaciones:leer"}),
    "paciente": frozenset(),
}
```

Derivación canónica — una sola función, usada por la verificación y por `GET /roles`:

```python
def roles_con_permiso(capability: str) -> frozenset[str]:
    return frozenset(r for r, caps in PERMISOS_POR_ROL.items() if capability in caps)
```

`backend/app/rbac/dependencies.py` expone:

```python
def require_permission(capability: str) -> Callable[..., PermissionContext]
def require_admin() -> Callable[..., PermissionContext]   # == require_permission("admin:gestionar")
def require_role(*roles: str) -> Callable[..., PermissionContext]  # envoltorio delgado
```

- `require_permission("caja:escribir")` resuelve `get_permission_context` y exige `contexto.rol in roles_con_permiso("caja:escribir")`. Es la forma normativa en caja y administración.
- `require_role(*roles)` es un envoltorio delgado sobre la misma estructura (compara el rol del contexto contra los roles recibidos). Queda para dependencias ad hoc; **no** se usa en los 9 endpoints de caja ni en las superficies administrativas, donde la capability es la fuente.
- `require_admin()` == `require_permission("admin:gestionar")`, usado por `/roles`, `/sucursales`, `/usuarios-sucursal` y `GET /export`.

**Regla de coherencia:** la matriz derivada (capability → roles) y la matriz documentada en D3 (endpoint × rol) son la misma tabla. Si divergen es un **defecto**, no una decisión: `backend/tests/test_rbac_permisos.py` afirma, para cada uno de los 9 endpoints, que `roles_con_permiso(<capability del endpoint>)` es exactamente la columna "allow" de D3, y que `GET /roles` expone la lista ordenada de capabilities del rol **sin wildcard** (`admin` recibe sus 7 capabilities explícitas; un `"*"` rompería la derivación y la comparación).

Todas las dependencias lanzan `HTTPException(403, detail={"causa": "permiso_denegado", "detalle": ...})` cuando el rol no está autorizado.

Reglas de código HTTP:
- **403** = identidad válida, permiso insuficiente. Cuerpo uniforme `{"causa": "permiso_denegado", "detalle": "<rol> no puede <accion>"}`.
- **401 nunca se emite**: no hay autenticación, por lo tanto no existe "no autenticado".
- **422** = header de rol desconocido, `X-Sucursal-Id` inválido o parámetros inválidos.
- **409/404** = se conservan intactos los mapeos de negocio de C-10 y C-12.
- La dependencia de autorización se evalúa **antes** del handler, así que una denegación no abre transacción de escritura ni crea filas.

**Regla dura de implementación (`backend/app/caja/router.py`):** el 403 SHALL salir de un `Depends(...)` evaluado antes del handler; **nunca** de una llamada a `require_permission()`/`require_role()` dentro del cuerpo del handler. Los 9 handlers de caja envuelven todo su cuerpo en `except Exception` y `_traducir_error` mapea lo no reconocido a **500**, así que un chequeo inline devolvería 500 en lugar de 403. La dependencia va en la firma (`contexto: Annotated[PermissionContext, Depends(require_permission(...))]`).

Las dependencias se aplican **por endpoint** (no a nivel de router global) para que la matriz sea legible en el código y auditable endpoint por endpoint. Los routers existentes que no están en el alcance de C-11 (`/turnos`, `/agenda`, `/lista-espera`, `/hc` y los del catálogo) **no** reciben RBAC en este change; solo caja y los endpoints administrativos nuevos.

### D3 — Matriz RBAC de los 9 endpoints de caja

| # | Endpoint | Capability exigida | admin | recepcion | odontologo | paciente |
|---|----------|--------------------|-------|-----------|------------|----------|
| 1 | `POST /caja/abrir` | `caja:escribir` | allow | allow | **403** | **403** |
| 2 | `POST /caja/cerrar` | `caja:escribir` | allow | allow | **403** | **403** |
| 3 | `GET /caja/{id}` | `caja:leer` | allow | allow | allow | **403** |
| 4 | `GET /caja` | `caja:leer` | allow | allow | allow | **403** |
| 5 | `POST /cobros` | `cobros:escribir` | allow | allow | **403** | **403** |
| 6 | `GET /cobros/{id}` | `cobros:leer` | allow | allow | allow | **403** |
| 7 | `POST /cobros/{id}/anular` | `cobros:escribir` | allow | allow | **403** | **403** |
| 8 | `POST /cobros/{id}/factura-arca` | `cobros:facturar` | allow | allow | **403** | **403** |
| 9 | `GET /liquidaciones-os` | `liquidaciones:leer` | allow | allow | allow | **403** |

Las cuatro columnas de rol son exactamente `roles_con_permiso(<capability>)` de D2: la tabla no se mantiene a mano en el código, se deriva.

Justificación: recepción opera la caja (KB: carga y gestión; C-10 le asignó la operación). Odontólogo obtiene lectura clínica/admin de solo lectura y no puede mover dinero ni facturar (mínimo privilegio). Paciente no accede a caja. La KB marca "HC/Caja/OS/ARCA" como "Posterior" para ambos roles internos, por lo que el reparto lectura/escritura es un default de implementación (D14), no una regla derivada.

**Endpoints administrativos nuevos:** `GET/POST /roles`, `PATCH /roles/{id}`, `GET/POST /sucursales`, `PATCH /sucursales/{id}`, `GET/POST /usuarios-sucursal`, `PATCH /usuarios-sucursal/{id}` y `GET /export` → `admin` allow; `recepcion`, `odontologo`, `paciente` → 403.

### D4 — Modelo de datos y migración 007

**Decisión:** `007_roles_sucursales` sobre `006_catalogo_activo`, aditiva y con downgrade:

| Tabla / cambio | Columnas | Constraints |
|---|---|---|
| `roles` (nueva) | `id uuid pk`, `nombre text not null`, `descripcion text null`, `activo bool not null default true`, `creado_en timestamptz not null default now()` | `uq_roles_nombre` |
| `sucursales` (nueva) | `id uuid pk`, `nombre text not null`, `direccion text null`, `activo bool not null default true`, `creado_en timestamptz not null default now()` | `uq_sucursales_nombre` |
| `usuarios_sucursal` (nueva) | `id uuid pk`, `usuario text not null`, `rol_id uuid not null`, `sucursal_id uuid not null`, `activo bool not null default true`, `creado_en timestamptz not null default now()` | FK `roles.id` y `sucursales.id` `ON DELETE RESTRICT`; `uq_usuarios_sucursal_usuario_sucursal (usuario, sucursal_id)`; índice `ix_usuarios_sucursal_usuario` |
| `profesionales` | `+ sucursal_id uuid null` | FK `sucursales.id` `ON DELETE RESTRICT`; índice `ix_profesionales_sucursal` |
| `sillones` | `+ sucursal_id uuid null` | FK `sucursales.id` `ON DELETE RESTRICT`; índice `ix_sillones_sucursal` |

- **Seed de roles canónicos** en el `upgrade()`: `INSERT ... ON CONFLICT (nombre) DO NOTHING` para `admin`, `recepcion`, `odontologo`, `paciente` con UUID fijos. El seed es idempotente y desaparece con el `drop table` del downgrade.
- **Numeración condicionada:** si C-07 (`recordatorio`) mergea primero, la revisión se rebasa sobre el nuevo head y se renumera (`008_...`). El `down_revision` debe apuntar siempre al head real, verificado con `alembic heads` antes de escribir la migración.
- **`backend/tests/conftest.py`**: `_CATALOGO_TABLES` suma `usuarios_sucursal, roles, sucursales`. Como el `TRUNCATE` por test también borra el seed de roles, los tests que ejercitan `/roles` o `/usuarios-sucursal` insertan los cuatro roles canónicos con un fixture de test (`roles_canonicos`). La autorización de caja **no** depende de filas en `roles`: es por nombre y matriz en código, así que los tests de caja no necesitan el fixture. Los tests que verifican el **seed de la migración** no pueden usar `db_session` (trunca `roles`): abren su propia sesión sobre `_db_engine` y, para no depender del orden de ejecución (el TRUNCATE de tests anteriores pudo haber vaciado `roles`), reaplican antes la migración (`downgrade` a su `down_revision` y `upgrade` a la 007).
- **Sin migración de caja:** no se altera `caja`, `cobro` ni `liquidacion_os`; `uq_caja_fecha` sigue global.

**Alternativas descartadas:**
- Tabla `usuarios` separada con credenciales: excede el default "roles sin login" y agrega superficie de seguridad no testeada.
- `sucursal_id` en `turnos`/`caja`: rompe el default "multi-sucursal básico sin tocar caja" y multiplica el alcance.
- Permisos en tabla `rol_permiso`: la matriz en código es más simple, testeable y suficiente para C-22 mientras no haya edición real.

### D5 — Límite de aislamiento multi-sucursal

**Scoped en C-11:**
- `GET /profesionales?sucursal_id=` y `GET /sillones?sucursal_id=`: devuelven solo recursos con ese `sucursal_id`.
- Altas/ediciones de profesionales y sillones aceptan y devuelven `sucursal_id`.
- `usuario_sucursal` asocia usuario, rol y sucursal.

**Dónde vive el contrato:** el contrato HTTP del filtro y del campo en alta/edición (parámetro, 404 ante sucursal inexistente, combinación con `?incluir_inactivos=`, ordenamiento) está especificado **una sola vez** en `specs/catalogo-recursos/spec.md`. `specs/multisucursal/spec.md` define la entidad, la frontera de aislamiento y los límites, y apunta allí; no repite escenarios del endpoint.

**Límite aceptado (escritura):** las escrituras del catálogo (`POST`/`PATCH` de profesionales y sillones) aceptan `sucursal_id` **sin RBAC**: C-11 cubre roles en los 9 endpoints de caja y en las superficies administrativas, y el catálogo conserva el contrato de C-12. Por eso el aislamiento es una frontera de lectura, no un control de escritura.

**NO scoped (global, documentado):**
- `turnos`, `agenda`, `pacientes`, `historia_clinica`, `odontograma`, `plan_tratamiento`.
- `caja`, `cobro`, `liquidacion_os`: una caja por día global; el header `X-Sucursal-Id` **no** particiona caja.
- Un recurso con `sucursal_id = NULL` es global y no aparece al filtrar por una sucursal.

**Semántica del filtro:** `?sucursal_id=<uuid inexistente>` → 404 (referencia inválida), no lista vacía. Esto evita confundir "sucursal inexistente" con "sucursal sin recursos" y es coherente con el manejo de FKs del catálogo (C-12).

**Alternativa descartada:** filtrar por sucursal en `GET /agenda` derivando la sucursal del profesional. Requiere join y cambia el contrato de C-05 sin necesidad; se deja como trabajo futuro.

### D6 — Contratos de administración (consumidos por C-22)

| Endpoint | Request | Response | Errores |
|---|---|---|---|
| `GET /roles` | `?incluir_inactivos=false` | `list[RolOut]` con `id`, `nombre`, `descripcion`, `activo`, `permisos` (derivado) | 403 |
| `POST /roles` | `{nombre, descripcion?}` | `201 RolOut` | 409 `duplicate_nombre_rol`, 422 |
| `PATCH /roles/{id}` | `{nombre?, descripcion?, activo?}` | `200 RolOut` | 404, 409 (`duplicate_nombre_rol` | `rol_canonico_protegido`), 422 |
| `GET /sucursales` | `?incluir_inactivos=false` | `list[SucursalOut]` orden `(nombre, id)` | 403 |
| `POST /sucursales` | `{nombre, direccion?}` | `201 SucursalOut` | 409 `duplicate_nombre_sucursal`, 422 |
| `PATCH /sucursales/{id}` | parcial | `200 SucursalOut` | 404, 409, 422 |
| `GET /usuarios-sucursal` | `?sucursal_id=&usuario=&incluir_inactivos=false` | `list[UsuarioSucursalOut]` | 403, 404 (sucursal filtro) |
| `POST /usuarios-sucursal` | `{usuario, rol_id, sucursal_id}` | `201` | 404 rol/sucursal, 409 `duplicate_usuario_sucursal` |
| `PATCH /usuarios-sucursal/{id}` | `{rol_id?, sucursal_id?, activo?}` | `200` | 404, 409 |

Convenciones: schemas Pydantic request/response separados de los modelos; `PATCH` parcial con `exclude_unset=True`; `extra="forbid"`; baja lógica por `activo`; nombres únicos con 409 estructurado; `GET /roles` calcula `permisos` como la lista ordenada de capabilities de `PERMISOS_POR_ROL` para ese rol y no los persiste (sin wildcard: `admin` recibe explícitamente sus 7 capabilities, para que lo expuesto y lo verificado coincidan). Listados simples (sin envelope) porque el volumen administrativo es bajo; el envelope queda para el catálogo.

**Roles administrables vs. autorización.** La tabla `roles` y `usuarios_sucursal` son administrativas e informativas: la autorización sale solo de `X-Actor-Rol` y `PERMISOS_POR_ROL`. Los cuatro roles canónicos (`admin`, `recepcion`, `odontologo`, `paciente`) están protegidos: `PATCH /roles/{id}` que cambie su `nombre` o los dé de baja (`activo=false`) responde **409** con `causa="rol_canonico_protegido"`; solo se puede editar su `descripcion`. Un rol no canónico creado por `POST /roles` expone `permisos: []`, no puede usarse como `X-Actor-Rol` (422 `rol_desconocido`) y no altera ninguna autorización. El `rol_id` de `/usuarios-sucursal` es informativo: no cambia los permisos de ningún request.

### D6b — Contratos que consume C-22

C-22 (`frontend-admin-roles-export`) consume estos cuatro contratos; quedan congelados acá y cualquier cambio posterior exige actualizar C-22.

1. **`/roles` es de solo lectura derivada.** `permisos` sale de `PERMISOS_POR_ROL` y no se persiste ni se edita en C-11: no existe `POST`/`PATCH` de permisos por capability. C-22 SHALL renderizar la lista como **solo lectura** (controles deshabilitados con una nota de que la matriz vive en código); la edición persistida de permisos es trabajo futuro.
2. **No hay endpoint HTTP de importación.** `import_planilla` es **solo CLI** (`python -m scripts.import_planilla`); C-11 no expone `POST /import` ni equivalente, así que la UI de importación queda **fuera de alcance de C-11** y C-22 no debe asumir backend para ella.
3. **El alcance por sucursal es parcial.** Solo `profesionales` y `sillones` tienen `sucursal_id`; turnos, pacientes, historia clínica y caja son globales. El selector "sucursal activa" de C-22 SHALL afectar **solo** los listados del catálogo; no filtra agenda, pacientes ni HC, y `X-Sucursal-Id` no particiona caja.
4. **`/usuarios-sucursal` usa `usuario` como texto libre.** No hay directorio de usuarios ni `GET /usuarios`: C-22 no debe asumir un selector ni un id de usuario; envía el identificador que el operador escriba (`usuario text`, único por sucursal).

### D7 — Exportación `GET /export`

**Formato:** un único archivo JSON, UTF-8 sin BOM, `indent=2`, extendido `.json`, `Content-Disposition: attachment; filename="export-turnos-YYYYMMDD-HHMMSS.json"`. UUID y fechas se serializan como strings ISO-8601 con offset; los montos permanecen en centavos enteros.

**Envelope:**
```json
{
  "contrato_version": "1.0",
  "generado_en": "2026-11-06T10:00:00-03:00",
  "zona": "America/Argentina/Buenos_Aires",
  "periodo": {"desde": "2026-10-08", "hasta": "2026-11-06", "dias": 30},
  "pacientes": [],
  "historia_clinica": {"historias": [], "entradas": [], "odontogramas": [], "planes": [], "items": []},
  "agenda": {"turnos": [], "profesionales": [], "sillones": [], "prestaciones": []},
  "caja": {"cajas": [], "cobros": [], "liquidaciones_os": []}
}
```

**Contrato de 30 días:**
- Por defecto `hasta = hoy_local(ahora)` y `desde = hasta - 29 días` (30 días inclusive), con el reloj inyectable de `backend.app.caja.reloj` (`ahora_local`/`hoy_local`) para que los tests no dependan del reloj real.
- `?desde=` y `?hasta=` (fechas locales) acotan el período; `desde > hasta` o `(hasta - desde).days + 1 > 30` → **422** (input inválido).
- **Filtrado:** `agenda.turnos` por `Turno.inicio` en `[desde 00:00, hasta+1 00:00)` de `ZONA`; `caja.cajas` por `Caja.fecha`; `caja.cobros` y `caja.liquidaciones_os` por `creado_en` en el mismo rango.
- **Sin filtro de fecha (datos maestros):** `pacientes` y `historia_clinica` completos; `agenda.profesionales`, `agenda.sillones` y `agenda.prestaciones` completos (incluye inactivos, porque el archivo es una foto de cierre).
- **Excluido explícitamente:** `SECRET_KEY`, `MP_ACCESS_TOKEN`, `ARCA_CERT`, cualquier token/credencial, y las variables de entorno. No se incluyen logs ni trazas.
- **Tamaño esperado:** JSON sin comprimir; ~1 KB por turno/cobro; con el volumen del TP se espera **< 10 MB**. Si creciera, la evolución es streaming o ZIP, fuera de alcance.
- **Documentación:** `docs/export/README.md` (español) con formato, período, campos por dominio, tamaño esperado, exclusiones y un aviso de seguridad destacado (el rol por header es falsificable); enlace desde el `README.md` raíz.

**Implementación:** `backend/app/export/service.py` consulta los modelos SQLAlchemy directamente (no hace HTTP interno ni reutiliza routers), construye el dict y `backend/app/export/router.py` devuelve `Response(media_type="application/json")` con el header de descarga. Autorización `require_admin()`.

### D8 — Importación asistida `import_planilla`

**Alcance de los datos:** este change carga **datos ficticios o de prueba**, nunca datos reales de pacientes (`AGENTS.md`). La planilla de ejemplo usa identificadores ficticios (`DNI-FICT-*`, `MP-FICT-*`) y los pacientes importados conservan `ficticio=true` (`Paciente.ficticio` es `nullable=False default true`); el script no lo desactiva ni lo sobrescribe. Cargar datos reales queda **explícitamente fuera de alcance** del TP y requeriría una decisión separada.

**Formato CSV:** UTF-8, primera fila cabecera, separador `,`, columnas `tipo,nombre,dni,matricula,contacto` — `tipo`, `nombre`, `dni` y `matricula` son obligatorias en la cabecera y `contacto` es opcional; solo campos que existen en el modelo. `Profesional` tiene únicamente `id, nombre, matricula, activo` (no hay `especialidad`), así que esa columna **no** forma parte del contrato y **no** se agrega a la migración 007 (que solo toca `sucursal_id`). Una cabecera con columnas desconocidas se rechaza como cabecera inválida (código de salida 2, no escribe nada).
- `tipo=paciente`: obligatorios `nombre`, `dni`; opcional `contacto`; `matricula` debe venir vacía.
- `tipo=profesional`: obligatorios `nombre`, `matricula`; `dni` y `contacto` vacíos.
- Caracteres especiales: se documenta que los campos con coma se entrecomillan según RFC 4180 y se leen con `csv.DictReader`.

**Claves naturales (idempotencia):** `paciente → dni`; `profesional → matricula`. Definición operativa: si la clave existe, se actualizan `nombre`, `contacto` (solo paciente) y `activo=true`; si no existe, se crea. Nunca se duplica. Una clave repetida **dentro del mismo archivo** rechaza la segunda aparición.

**Procesamiento:** la función de servicio recibe la **sesión inyectada** (`importar_planilla(session, ruta, dry_run=False)`) y **no** hace `commit()` ni cierra la sesión. Abre un **SAVEPOINT por fila** (`session.begin_nested()`): al confirmarse la fila se libera el savepoint, un rechazo revierte solo ese savepoint y no lo ya importado, y el **único `commit()` lo hace quien invoca** (el CLI, o la fixture `db_session` en tests). Esto es obligatorio: la fixture abre una transacción externa; un `session.commit()` dentro del servicio la confirmaría, filtraría filas al resto de la suite y pondría en riesgo la baseline de 435. `--dry-run` ejecuta parseo y búsqueda de claves sin escribir. Códigos de salida: `0` todo procesado, `1` al menos un rechazo, `2` cabecera/archivo inválido (no escribe nada).

**Reporte:** dataclass `ReporteImportacion` con `creados`, `actualizados`, `rechazados` por tipo y lista de `Rechazo(nro_linea, motivo)`; el CLI imprime el resumen en español y, si se pasa `--reporte <ruta.csv>`, lo escribe. Los tests importan la función de servicio y validan el objeto, no el texto de stdout. Los tests pasan `db_session`: como el servicio no commitea, el rollback del teardown borra todo lo importado.

**Layout:** lógica en `backend/app/migracion/service.py`; CLI delgado en `scripts/import_planilla.py` + `scripts/__init__.py`; guía `docs/migracion/README.md`; ejemplo `docs/migracion/ejemplo_planilla.csv`. Invocación canónica `python -m scripts.import_planilla --archivo <ruta>` (desde la raíz) para que `backend` sea importable.

**Por qué último grupo:** no comparte archivos con RBAC, sucursal ni export; puede entregarse y cerrarse por separado sin bloquear el resto del change.

### D9 — Mapeo de errores

| Situación | Código | Cuerpo |
|---|---|---|
| Rol válido sin permiso | **403** | `{"detail": {"causa": "permiso_denegado", "detalle": "..."}}` |
| Header de rol desconocido | **422** | `{"detail": {"causa": "rol_desconocido", ...}}` |
| `X-Actor-Rol` con otra capitalización | **422** | `ADMIN` es inválido: comparación exacta y case-sensitive → `causa="rol_desconocido"` (los espacios en los bordes los recorta el servidor HTTP y no se especifican) |
| `X-Sucursal-Id` que no es UUID | **422** | `causa="sucursal_invalida"`, validado una sola vez en `get_permission_context` |
| `X-Sucursal-Id` con UUID inexistente en `sucursales` | **422** | `causa="sucursal_invalida"` (referencia inválida de header; distinto del `?sucursal_id=` inexistente, que es 404) |
| `X-Sucursal-Id` en los 9 endpoints de caja | — | Se valida como en cualquier endpoint (inválido → 422); si es válido se **ignora**: no particiona caja, no filtra ni cambia la respuesta (la caja es global, D5) |
| Falta de identidad | **nunca 401** | Se resuelve como `recepcion` (D1) |
| Recurso inexistente (rol, sucursal, asignación) | **404** | `detail` string |
| Nombre único duplicado | **409** | `{"causa": "duplicate_nombre_rol" \| "duplicate_nombre_sucursal" \| "duplicate_usuario_sucursal"}` |
| Cambio de nombre o baja de un rol canónico | **409** | `{"causa": "rol_canonico_protegido"}` |
| Período de export inválido (>30 días, invertido) | **422** | `detail` string |
| Rechazo de importación | exit code 1 + reporte | No es HTTP |
| Conflicto de negocio de caja existente | **409** | Se conserva el mapeo de C-10 |
| Error inesperado | **500** | `detail="error interno"` (solo el existente de caja) |

### D10 — Archivos a crear / modificar

**Crear:**
- `backend/alembic/versions/007_roles_sucursales.py`
- `backend/app/rbac/__init__.py`, `models.py`, `permissions.py`, `context.py`, `dependencies.py`, `schemas.py`, `service.py`, `router.py`
- `backend/app/export/__init__.py`, `schemas.py`, `service.py`, `router.py`
- `backend/app/migracion/__init__.py`, `service.py`
- `scripts/__init__.py`, `scripts/import_planilla.py`
- `docs/export/README.md`, `docs/migracion/README.md`, `docs/migracion/ejemplo_planilla.csv`
- Tests: `backend/tests/test_rbac_contexto.py`, `test_rbac_permisos.py`, `test_roles_api.py`, `test_sucursales_api.py`, `test_usuarios_sucursal_api.py`, `test_multisucursal_aislamiento.py`, `test_caja_roles_api.py`, `test_export_api.py`, `test_import_planilla.py`, `test_migracion_roles.py`

**Modificar:**
- `backend/app/main.py` (montar `rbac_router` y `export_router`)
- `backend/app/caja/router.py` (dependencias de rol por endpoint; sin cambios de negocio)
- `backend/app/agenda/models.py` (`sucursal_id` nullable en `Profesional` y `SillonBox`)
- `backend/app/agenda/schemas.py` (`sucursal_id` en Create/Patch/Out de profesionales y sillones)
- `backend/app/agenda/router_catalogo.py` (filtro `sucursal_id` y validación 404)
- `backend/tests/conftest.py` (`_CATALOGO_TABLES`)
- `README.md` (enlace a `docs/export/README.md` y `docs/migracion/README.md`; actualizar el recuento de tests si corresponde)

**No tocar (restricción explícita):** `docker-compose.yml`, `backend/Dockerfile`, `.github/workflows/tests.yml`. Tampoco `caja/models.py`, `caja/schemas.py`, `caja/service.py` salvo que un test demuestre que hace falta (no está previsto).

### D11 — Estrategia de tests (TDD)

- **Rojo primero:** cada grupo escribe su archivo de test y lo ejecuta para verlo fallar por la razón correcta antes de implementar.
- **Matriz de caja:** 9 endpoints × 4 roles = **36 casos**, organizados en `backend/tests/test_caja_roles_api.py`. Cada celda permite `2xx` o `403` exacto; los casos "allow" usan fixtures válidos y los "deny" verifican además ausencia de efectos laterales en escrituras. La dependencia se declara en la firma (`Depends(require_permission(...))`): ningún handler chequea el rol dentro de su cuerpo (D2).
- **Coherencia de la matriz:** `test_rbac_permisos.py` deriva `roles_con_permiso()` para cada capability y afirma que coincide celda por celda con la matriz 9×4 de D3, además de que `GET /roles` expone esas capabilities sin wildcard.
- **Compatibilidad:** `test_rbac_contexto.py` cubre header válido, header ausente y header inválido (incluido `ADMIN`); el grupo final corre los 435 tests previos sin editar ninguno.
- **Aislamiento:** `test_multisucursal_aislamiento.py` crea sucursales A y B, un profesional y un sillón por sucursal, y verifica que el filtro por A no devuelve datos de B, que el filtro inexistente da 404 y que sin filtro se conserva el contrato de C-12.
- **Export:** `test_export_api.py` siembra un paciente, una HC, un turno y un cobro, y afirma que `pacientes[]`, `historia_clinica.entradas[]`, `agenda.turnos[]` y `caja.cobros[]` no están vacíos; usa `get_ahora` sobrescrito para el período por defecto y prueba 403, 422 y `Content-Disposition`. Incluye el caso sin header → 403 (`origen=default_compatibilidad`) sobre `/export` y `/roles`.
- **Import:** `test_import_planilla.py` usa archivos temporales (`tmp_path`) y `db_session`; **dos corridas dentro de la misma fixture** (comparten la transacción, así la segunda ve la primera sin commitear), archivo con errores parciales, dry-run, cabecera inválida (incluida una columna `especialidad`) y `Paciente.ficticio is True` en los importados. No se corre el CLI dos veces contra `turnos_test`: la aceptación es una única corrida en fixture más `--dry-run`; una doble corrida real solo contra una base descartable.
- **Determinismo:** ningún test usa `datetime.now()`/`date.today()`; el reloj entra por dependencia o por parámetro.
- **Volumen esperado:** ≥ 435 (piso) y ~540 tests al cerrar; el número exacto se registra en `tasks.md` al verificar.

### D12 — Deuda heredada de C-10: qué hace y qué no hace C-11

| Ítem heredado | Estado en C-11 |
|---|---|
| `Q-C10-02`: cualquiera puede operar caja | **Se corrige** para los 9 endpoints de caja con la matriz D3. |
| `Q-C10-01` (KB) / `Q-C10-05` (design archivado de C-10): una caja por día global, multi-sucursal diferido | **No se cambia**: no hay migración de caja y `caja.fecha` sigue único global. |
| `IntegrityError` en `registrar_cobro` siempre se mapea a 409 `caja_no_abierta` | **No se corrige** (fuera de alcance): se documenta como deuda conocida; C-11 no altera `caja/service.py`. |
| `facturar_arca` no valida caja cerrada; anular con caja cerrada → 409 (D23) | **Se preserva** sin cambios; los tests de roles no alteran esa semántica. |
| 8 supuestos de negocio aceptados por default en `knowledge-base/10_preguntas_abiertas.md` | **Se respetan**; C-11 no introduce reglas de caja nuevas. |
| Sin control de acceso en el resto de los routers | **Se mantiene** fuera de caja; documentado como límite. |

Trazabilidad de los `Q-C10-*`: solo `Q-C10-01`, `Q-C10-02` y `Q-C10-09` están en `knowledge-base/10_preguntas_abiertas.md`. `Q-C10-05` **no** vive en la KB: está en `openspec/changes/archive/2026-11-05-c-10-caja-pagos-os-arca/design.md` (tabla de preguntas `Q-C10-01`..`Q-C10-09`), y así se cita. Misma regla para cualquier otro `Q-C10-0x` que no figure en la KB.

### D13 — Restricción de par con C-13

C-11 entrega contratos backend; C-13 construye el shell del frontend en paralelo. Por eso:
- No se toca `docker-compose.yml`, `backend/Dockerfile` ni `.github/workflows/tests.yml` (los owns C-23, y C-13 corre su propio job de frontend).
- No se agrega ninguna dependencia a `backend/requirements.txt`.
- No se modifica `frontend/`.
- Los nombres de campos y códigos de error de D3/D6/D7 son el contrato que C-22 consumirá; D6b fija qué puede y qué no puede asumir C-22. Cualquier cambio posterior exige actualizar C-22.

### D14 — Defaults aceptados sin respuesta de negocio (verbatim)

Registrados como cerrados por default, **no como reglas de negocio**:

1. **¿Login real o solo roles?** → *Roles solamente, sin login real.* La identidad es un mecanismo interno/test documentado (`X-Actor-Rol`); el login JWT real queda diferido y anotado como trabajo futuro.
2. **¿Multi-sucursal básico sin tocar el esquema de caja?** → *Sí. Sin migración sobre caja.*
3. **¿Importación desde planilla?** → *Último grupo de tareas, separable.*

Estado: sin respuesta de negocio al 06/11/2026. Se conservan en `proposal.md` §"Defaults aceptados sin respuesta de negocio".

## Risks / Trade-offs

- **[El default `recepcion` es un bypass de autorización]** → Se documenta como supuesto de implementación, no como control de seguridad; el login real es el trabajo futuro que lo elimina. Mitigación adicional: el default nunca aplica a endpoints `admin`, así que la administración y la exportación ya quedan cerradas.
- **[El header `X-Actor-Rol` es falsificable por cualquier cliente]** → Aceptado explícitamente; sin login no hay garantía criptográfica. No se presenta como seguridad.
- **[Aislamiento parcial: caja, turnos, pacientes y HC siguen globales]** → Se declara el límite en D5, en la spec `multisucursal` y en el contrato de export; el filtro solo existe donde hay `sucursal_id` real.
- **[El `TRUNCATE` de tests borra el seed de roles]** → Fixture `roles_canonicos` en los tests administrativos; la autorización de caja no depende de la tabla. Los tests del seed de la migración leen con una sesión propia sobre `_db_engine`, nunca con `db_session`, y reaplican la migración antes de afirmar para no depender del orden.
- **[Conflicto de numeración de migración con C-07]** → Verificar `alembic heads` antes de escribir; rebasar y renumerar si C-07 mergea primero. `down_revision` siempre al head real.
- **[Export grande en memoria]** → Volumen del TP acotado (< 10 MB esperado); si crece, evolución a streaming/ZIP documentada como fuera de alcance.
- **[Importación parcial deja la base a medio importar]** → Es el comportamiento especificado: savepoint por fila, reporte de rechazos y exit code 1; re-ejecutar es seguro por idempotencia.
- **["Permisos expuestos" y "permisos aplicados" podrían divergir]** → Una única fuente (`PERMISOS_POR_ROL`) y derivación (`roles_con_permiso`) para ambos; `test_rbac_permisos.py` compara la derivación con la matriz 9×4. Una divergencia es un defecto, no una decisión.
- **[`PATCH /profesionales` y `PATCH /sillones` aceptan `sucursal_id` sin RBAC]** → **Límite aceptado**: C-11 cubre roles en los 9 endpoints de caja y en las superficies administrativas (`/roles`, `/sucursales`, `/usuarios-sucursal`, `/export`); el catálogo conserva el contrato de C-12. Consecuencia: el aislamiento por sucursal es una frontera de lectura, no un control de escritura. Se declara en `specs/multisucursal/spec.md` §"Límite aceptado".
- **[El 403 inline se convertiría en 500 en caja]** → El chequeo va en `Depends(...)` antes del handler; los `except Exception` de `caja/router.py` nunca ven un `HTTPException` de autorización (D2).
- **[C-22 depende de nombres exactos de campos y errores]** → Los contratos D6/D7 se congelan en este design; cambios posteriores requieren actualizar C-22.
- **[Performance del filtro por sucursal]** → Índices `ix_profesionales_sucursal` e `ix_sillones_sucursal` en la 007; volumen bajo.
- **[`ruff check` puede marcar imports no usados si se agregan dependencias y no se usan]** → Cada grupo cierra con `ruff check backend scripts` limpio; **no** se usa `ruff format`.

## Migration Plan

1. Verificar head: `cd backend && ..\.venv\Scripts\python.exe -m alembic heads` → debe ser `006_catalogo_activo`; si no, rebasar.
2. `alembic upgrade head` crea `roles`, `sucursales`, `usuarios_sucursal`, agrega `sucursal_id` nullable a `profesionales` y `sillones`, crea índices y siembra los 4 roles.
3. Verificar con el MCP `postgres` (solo lectura): tablas, columnas, FKs y el seed de roles.
4. `alembic downgrade -1` debe eliminar índices y columnas de `sucursal_id`, y luego las tres tablas, sin tocar datos de catálogo existentes. Volver a `upgrade head`.
5. **Rollback de aplicación:** la migración es aditiva y nullable; revertir el código sin bajar la migración es seguro. Si se baja la migración, el código de C-11 deja de funcionar (tablas ausentes), por lo que el orden de rollback es código → migración.
6. **Despliegue:** migrar antes de arrancar la API nueva. No hay backfill ni ventana de datos.
7. **Datos:** solo ficticios en seeds y tests; el seed de roles es idempotente.

**Regla dura de acceso a la base:** toda inspección del esquema o de los datos se hace **únicamente** por el MCP `postgres` (modo restringido, solo lectura). `psql` y `docker compose exec` están **prohibidos** para consultar o modificar datos durante todo el change. Si el MCP rechaza una operación, se informa tal cual y no se busca un atajo.

## Open Questions

Ninguna bloqueante. Quedan diferidas, sin cambiar specs ni tareas:
- Login real (JWT/sesiones/credenciales) y eliminación del default de compatibilidad.
- Caja y turnos particionados por sucursal.
- Edición persistida de permisos por capability (C-22 puede mostrarlos derivados).
- Exportación en streaming/ZIP para volúmenes mayores.

## UI Mockups

- Design system revision: 1 (frontend/design-system/README.md)
- Decision: no (project policy)
- Mockups: n/a
- Approval: n/a
- Preview: n/a
- Visual verify: n/a

No se crean mockups en este change: `visual_design.mode = "system-only"` y C-11 solo entrega contratos HTTP y archivos descargables.

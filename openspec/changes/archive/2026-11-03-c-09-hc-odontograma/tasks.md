# Tasks

> **Protocolo TDD estricto (obligatorio en todas las tareas de código).**
> Para cada tarea: (1) escribir el test que falla (**RED**), (2) escribir el
> mínimo código que lo hace pasar (**GREEN**), (3) triangular con un segundo caso
> que rompa una implementación demasiado específica, (4) refactorizar con los
> tests en verde. El proyecto exige red-green manual (sin framework de TDD
> automático). Ninguna tarea se considera terminada sin su `**Verificación:**`
> en verde y sin haber visto el test fallar antes.
>
> Los tests son de integración contra PostgreSQL real (`backend/tests/conftest.py`,
> `db_session` con rollback + `TRUNCATE`). Solo datos ficticios
> (`seed_catalogo`, `DNI-FICT-001`, `MAT-FICT-001`, `nombre="Consulta"`).
> No se commitea ni se pushea nada.

## 1. Modelos

- [x] 1.1 Crear `backend/app/hc/__init__.py` y `backend/app/hc/models.py` con
  las cinco entidades y las tuplas de estados a nivel de módulo
  (`ESTADOS_PLAN`, `ESTADOS_ITEM`), usando `Mapped`/`mapped_column`, PK
  `Uuid` con `default=uuid.uuid4` y `timestamptz` con
  `server_default=text("now()")` para `creado_en` (patrón `lista_espera`).
  Empezar por `test_hc_modelo.py::test_historia_clinica_paciente_unico` en RED.
  **Verificación:** `pytest backend/tests/test_hc_modelo.py -k paciente_unico`
  en verde (insertar dos HC con el mismo `paciente_id` debe fallar por UNIQUE).
- [x] 1.2 Modelar `historia_clinica` (una fila por paciente, `paciente_id`
  UNIQUE FK RESTRICT, cabecera nullable) y `entrada_hc` (FK a
  `historia_clinica` RESTRICT, `profesional_id` FK RESTRICT, `fecha`, `texto`).
  Triangular con un segundo caso: borrar una HC con entradas debe fallar por
  RESTRICT.
  **Verificación:** `pytest backend/tests/test_hc_modelo.py -k
  "paciente_unico or entrada_restrict"` en verde.
- [x] 1.3 Modelar `odontograma` append-only: `paciente_id` FK RESTRICT, `pieza`
  con `CheckConstraint("pieza ~ '^[1-4][1-8]$'", name="pieza_fdi_valida")`,
  `estado` Text **sin CHECK**, `profesional_id` FK RESTRICT, `fecha`, y el
  índice `(paciente_id, pieza, fecha)`. Triangular: dos filas idénticas de la
  misma pieza deben convivir (no hay UNIQUE).
  **Verificación:** `pytest backend/tests/test_hc_modelo.py -k
  "odontograma_append_only or pieza_check"` en verde; `pieza='19'` insertada por
  SQL directo falla por CHECK.
- [x] 1.4 Modelar `plan_tratamiento` (FKs RESTRICT, `estado` Text + CHECK
  `estado_plan_valido`, sin columna `presupuesto`) y `plan_item` (FK a
  `plan_tratamiento` **CASCADE**, `prestacion_id` FK RESTRICT, `pieza` CHECK FDI,
  `estado` + CHECK `estado_item_valido`, `monto_centavos` CHECK `>= 0`,
  `monto_cobertura_centavos` nullable con CHECK `>= 0`). Triangular: borrar un
  plan debe borrar sus items (CASCADE) y `monto_centavos = -1` debe fallar.
  **Verificación:** `pytest backend/tests/test_hc_modelo.py -k
  "plan_item_cascade or montos_check"` en verde.

## 2. Migración 004

- [x] 2.1 Crear `backend/alembic/versions/004_hc_odontograma.py` con
  `revision = "004_hc_odontograma"` y **`down_revision = "003_lista_espera"`**
  (head real verificado; `CHANGES.md` dice "003" y está desactualizado).
  `upgrade()` crea en orden `historia_clinica`, `entrada_hc`, `odontograma`,
  `plan_tratamiento`, `plan_item` con CHECKs, FKs e índices.
  **Los comandos de Alembic se corren desde `backend\` con `PYTHONPATH`
  apuntando a la raíz del repo**: `backend/alembic/env.py` importa
  `backend.app...` y `backend/alembic.ini` no define `prepend_sys_path`, así que
  sin `PYTHONPATH` falla con `ModuleNotFoundError: No module named 'backend'`.
  Se usa `-c alembic.ini` (no `-c backend/alembic.ini`) porque el cwd ya es
  `backend\`.
  **Verificación** (parado en `backend\`):
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path   # raíz del repo, estando en backend\
  # usar el $env:DATABASE_URL ya definido en la consola (puerto 5433)
  python -m alembic -c alembic.ini upgrade head
  python -m alembic -c alembic.ini check
  ```
  El `check` debe reportar "No new upgrade operations detected". `alembic heads`
  **no** verifica el cableado: no carga `env.py`. Solo `upgrade`, `downgrade` y
  `check` lo prueban.
- [x] 2.2 Implementar `downgrade()` en **orden inverso**
  (`plan_item` → `plan_tratamiento` → `odontograma` → `entrada_hc` →
  `historia_clinica`), dropeando índices antes que tablas.
  **Verificación** (parado en `backend\`, misma razón de `PYTHONPATH` que 2.1):
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path   # raíz del repo, estando en backend\
  # usar el $env:DATABASE_URL ya definido en la consola (puerto 5433)
  python -m alembic -c alembic.ini downgrade -1
  python -m alembic -c alembic.ini upgrade head
  ```
  Ambas idempotentes y sin error; repetir la secuencia una segunda vez.
- [x] 2.3 Agregar el import explícito `from backend.app.hc import models` con
  `# noqa: F401` en `backend/alembic/env.py`, junto a los imports de `agenda`,
  `lista_espera` y `turnos`. Sin este import `Base.metadata` no ve las tablas.
  **Verificación** (parado en `backend\`, misma razón de `PYTHONPATH` que 2.1):
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path   # raíz del repo, estando en backend\
  # usar el $env:DATABASE_URL ya definido en la consola (puerto 5433)
  python -m alembic -c alembic.ini check
  ```
  Debe reportar "No new upgrade operations detected"; si se comenta el import,
  `alembic check` debe acusar diferencias (comprobación de que el import es el
  que las registra).

## 3. Schemas

- [x] 3.1 Schemas de HC: `HistoriaClinicaCreate` (`paciente_id`, cabecera
  opcional), `HistoriaClinicaUpdate` (todos opcionales), `HistoriaClinicaOut`.
  Entrada: `EntradaHCCreate` (`profesional_id`, `AwareDatetime`, `texto`
  min_length 1) y `EntradaHCOut`. Todos con `ConfigDict(extra="ignore")` de
  entrada y `from_attributes=True` de salida. RED con
  `test_hc_api.py::test_patch_cuerpo_vacio`.
  **Verificación:** `pytest backend/tests/test_hc_api.py -k patch_cuerpo_vacio`
  en verde.
- [x] 3.2 Schemas de odontograma: `OdontogramaCreate` con validador de `pieza`
  (`^[1-4][1-8]$`), `estado` como `str` libre, `profesional_id`, `fecha`
  `AwareDatetime`; `OdontogramaOut`. Triangular: `pieza="19"` y `pieza="1"` →
  422; `pieza="18"` y `"48"` → válidos.
  **Verificación:** `pytest backend/tests/test_hc_api.py -k
  "pieza_fdi_invalida or pieza_fdi_limite"` en verde.
- [x] 3.3 Schemas de plan: `PlanTratamientoCreate`, `PlanTratamientoUpdate`
  (solo `estado`), `PlanItemCreate` (`pieza`, `prestacion_id`, `estado`
  opcional, `monto_centavos: int = Field(ge=0)`,
  `monto_cobertura_centavos: int | None = Field(default=None, ge=0)`),
  `PlanItemOut`, `PlanTratamientoOut` con `items`, `total_centavos` y
  `cobertura_centavos` calculados. Triangular: `1500.50` y ausencia de
  `monto_centavos` → 422; `0` → válido.
  **Verificación:** `pytest backend/tests/test_hc_api.py -k
  "monto_negativo or monto_decimal or monto_cero"` en verde.

## 4. Servicio

- [x] 4.1 `backend/app/hc/service.py` con `ServicioHC.crear_historia` y
  `obtener_historia` / `obtener_por_paciente`: validar que el paciente existe
  (404), detectar HC duplicada (409 con el id existente) **antes** del
  `session.add`, y traducir `IntegrityError` de `uq_historia_clinica_paciente_id`
  a la misma excepción de dominio para cubrir la carrera. `session.flush()`,
  nunca `commit()`. RED con `test_hc_servicio.py::test_hc_duplicada`.
  **Verificación:** `pytest backend/tests/test_hc_servicio.py -k hc_duplicada`
  en verde.
- [x] 4.2 `actualizar_historia` parcial: aplicar solo claves presentes
  (`model_dump(exclude_unset=True)`), ignorar `{}`, 404 si no existe.
  Triangular con el caso de cuerpo vacío que no debe tocar nada.
  **Verificación:** `pytest backend/tests/test_hc_servicio.py -k
  "patch_parcial or patch_vacio"` en verde.
- [x] 4.3 `agregar_entrada` y `listar_entradas` (orden `fecha` asc): validar HC y
  profesional existentes; 404 si la HC no existe; sin métodos de borrado o
  update de entradas.
  **Verificación:** `pytest backend/tests/test_hc_servicio.py -k
  "alta_entrada or entradas_ordenadas"` en verde.
- [x] 4.4 `registrar_odontograma` y `listar_odontograma` (filtro opcional por
  `pieza`, orden `fecha` asc, `[]` si no hay registros): guardar `estado`
  literal, sin normalizar ni validar catálogo.
  **Verificación:** `pytest backend/tests/test_hc_servicio.py -k
  "odontograma_historial or odontograma_vacio"` en verde.
- [x] 4.5 `crear_plan`, `actualizar_plan` (valida pertenencia al set provisorio),
  `agregar_item` y `obtener_plan`: 404 si plan/paciente/profesional/prestación
  no existen; 409 `plan_no_editable` si el plan no está en
  `borrador|propuesto`; calcular `total_centavos = sum(monto_centavos)` y
  `cobertura_centavos = sum(monto_cobertura_centavos or 0)` en la lectura, sin
  persistir totales.
  **Verificación:** `pytest backend/tests/test_hc_servicio.py -k
  "total_presupuesto or total_sin_items or cobertura_snapshot or
  plan_no_editable"` en verde.
- [x] 4.6 `listar_planes_por_paciente(paciente_id)`: `404` si el paciente no
  existe, `200` con `[]` si existe y no tiene planes (no `404`), orden
  `creado_en` **asc**, y **el mismo cálculo** que `obtener_plan` para `items`,
  `total_centavos` (suma de `monto_centavos`) y `cobertura_centavos` (suma de
  `monto_cobertura_centavos` ignorando nulos, `0` si todos son nulos) mediante un
  helper compartido, para que detalle y listado no deriven. RED con
  `test_hc_servicio.py::test_listado_planes_orden` (dos planes; el más viejo
  primero).
  **Verificación:** `pytest backend/tests/test_hc_servicio.py -k
  "listado_planes_orden or listado_planes_totales"` en verde.
- [x] 4.7 Validación explícita de FKs **antes** de `session.add` en
  `registrar_odontograma` (paciente y profesional), `agregar_entrada`
  (profesional) y `crear_plan` (paciente y profesional): un id bien formado
  (UUID válido) que no existe es excepción de dominio → **404**, nunca `500` por
  `IntegrityError` de la base. La consulta de existencia no reemplaza la FK: la
  hace legible (404 en vez de 500). RED con
  `test_hc_api.py::test_odontograma_paciente_inexistente_404` y
  `test_hc_api.py::test_odontograma_profesional_inexistente_404`.
  **Verificación:** `pytest backend/tests/test_hc_api.py -k "inexistente_404"`
  en verde, incluidos los cinco casos nuevos (odontograma ×2, entrada ×1, plan
  ×2).

## 5. Router

- [x] 5.1 `backend/app/hc/router.py` con los **13 endpoints** de `design.md`
  §API, `response_model` y `status_code` correctos, y el `get_db` con `commit()`
  del router (patrón `lista_espera`).
  **Verificación:** `pytest backend/tests/test_hc_api.py -k "creacion_valida"`
  en verde; `python -c "from backend.app.hc.router import router;
  print(len(router.routes))"` devuelve 13.
- [x] 5.2 Mapeo de excepciones de dominio a HTTP: `HistoriaNoEncontrada` /
  `PlanNoEncontrado` → 404; `HistoriaDuplicada` / `PlanNoEditable` → **409** con
  `detail={"causa": ..., "detalle": ...}`; input inválido → 422 por Pydantic.
  Nunca 200 ni 500 ante conflicto de negocio.
  **Verificación:** `pytest backend/tests/test_hc_api.py -k
  "hc_duplicada_devuelve_409 or plan_no_editable_409"` en verde.
- [x] 5.3 Verificar que no existe ningún endpoint `DELETE` en el router y que
  las rutas de borrado responden 405.
  **Verificación:** `pytest backend/tests/test_hc_api.py -k
  "delete_no_expuesto_405"` en verde.
- [x] 5.4 Exponer `GET /pacientes/{paciente_id}/planes-tratamiento` con
  `response_model` de lista de planes, delegando en
  `listar_planes_por_paciente` (mismo cuerpo que el detalle del plan). Sin
  `PATCH` ni `DELETE` de items: el `estado` del item solo se fija al crearlo
  (`Q-C09-07`).
  **Verificación:** `pytest backend/tests/test_hc_api.py -k "listado_planes"` en
  verde.

## 6. Registro e integración de tests

- [x] 6.1 Registrar el router en `backend/app/main.py`
  (`app.include_router(hc_router)`).
  **Verificación:** `pytest backend/tests/test_hc_api.py -k creacion_valida` en
  verde y `GET /health` sigue respondiendo 200.
- [x] 6.2 Extender `_CATALOGO_TABLES` en `backend/tests/conftest.py` con
  `historia_clinica, entrada_hc, odontograma, plan_tratamiento, plan_item` (en
  orden inverso de dependencias) para que el `TRUNCATE` no deje filas entre
  tests.
  **Verificación:** correr `pytest backend/tests/test_hc_servicio.py -p no:randomly`
  dos veces seguidas y obtener el mismo resultado; luego
  `pytest backend/tests -k "hc"` sin fallos por datos residuales (por ejemplo,
  un 409 inesperado en el primer test de cada archivo).
- [x] 6.3 Confirmar que `backend/app/hc/models.py` se importa desde `env.py`
  (tarea 2.3) y que la app arranca sin `DATABASE_URL` (contrato foundation:
  importar `main` no debe exigir base). Ojo con el cwd: el chequeo de import es
  **package-relative** y se corre desde la raíz del repo; el de Alembic desde
  `backend\` con `PYTHONPATH` a la raíz.
  **Verificación** (la comprobación de import necesita `DATABASE_URL` **ausente**:
  hacela en una consola nueva, sin exportar la variable, o quitándola
  temporalmente; el resto de las tareas la necesita definida, puerto 5433.
  Desde la raíz del repo):
  ```powershell
  python -c "import backend.app.main"
  ```
  y con el `$env:DATABASE_URL` ya definido en la consola, parado en `backend\`:
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path   # raíz del repo, estando en backend\
  # usar el $env:DATABASE_URL ya definido en la consola (puerto 5433)
  python -m alembic -c alembic.ini check
  ```

## 7. Tests de integración y mapeo de escenarios

- [x] 7.1 `backend/tests/test_hc_modelo.py` (`pytestmark = pytest.mark.integration`):
  invariantes de esquema (UNIQUE de HC, RESTRICT de entradas, CASCADE de items,
  CHECK de FDI y montos, append-only del odontograma).
  **Verificación:** `pytest backend/tests/test_hc_modelo.py -rs` en verde.
- [x] 7.2 `backend/tests/test_hc_servicio.py`: servicio con `db_session` y
  `seed_catalogo(db_session)`; cubre los escenarios de negocio del spec (ver
  tabla de mapeo).
  **Verificación:** `pytest backend/tests/test_hc_servicio.py -rs` en verde.
- [x] 7.3 `backend/tests/test_hc_api.py` con `TestClient`: cubre códigos de
  estado, cuerpos y `detail` de 409 (ver tabla de mapeo).
  **Verificación:** `pytest backend/tests/test_hc_api.py -rs` en verde.

### Mapeo escenario del spec → test

Una fila por escenario del spec: **40 escenarios → 40 filas (1:1)**.

| Requirement | Scenario | Test |
|---|---|---|
| Historia clínica única por paciente | Creación válida | `test_hc_api.py::test_creacion_valida` |
| Historia clínica única por paciente | Segunda HC del mismo paciente devuelve 409 | `test_hc_api.py::test_hc_duplicada_devuelve_409` |
| Historia clínica única por paciente | Paciente inexistente devuelve 404 | `test_hc_api.py::test_hc_paciente_inexistente_404` |
| Historia clínica única por paciente | Lectura por paciente sin HC devuelve 404 | `test_hc_api.py::test_hc_paciente_sin_hc_404` |
| Cabecera de HC editable | Actualización parcial preserva el resto | `test_hc_servicio.py::test_patch_parcial` |
| Cabecera de HC editable | PATCH con cuerpo vacío no modifica nada | `test_hc_api.py::test_patch_cuerpo_vacio` |
| Cabecera de HC editable | HC inexistente devuelve 404 | `test_hc_api.py::test_patch_hc_inexistente_404` |
| Entradas append-only | Alta de entrada | `test_hc_api.py::test_alta_entrada` |
| Entradas append-only | Consulta ordenada por fecha | `test_hc_servicio.py::test_entradas_ordenadas` |
| Entradas append-only | Entrada sobre HC inexistente devuelve 404 | `test_hc_api.py::test_entrada_hc_inexistente_404` |
| Entradas append-only | Profesional inexistente devuelve 404 | `test_hc_api.py::test_entrada_profesional_inexistente_404` |
| Entradas append-only | Sin eliminación de entradas | `test_hc_api.py::test_delete_entrada_405` |
| Registro de estado por pieza | Registro de estado válido | `test_hc_api.py::test_registrar_odontograma` |
| Registro de estado por pieza | Estado fuera de cualquier catálogo se guarda literal | `test_hc_api.py::test_estado_libre_se_guarda_literal` |
| Registro de estado por pieza | Paciente inexistente devuelve 404 | `test_hc_api.py::test_odontograma_paciente_inexistente_404` |
| Registro de estado por pieza | Profesional inexistente devuelve 404 | `test_hc_api.py::test_odontograma_profesional_inexistente_404` |
| Historial por pieza | Dos estados de la misma pieza coexisten | `test_hc_servicio.py::test_odontograma_historial` |
| Historial por pieza | Paciente sin registros devuelve lista vacía | `test_hc_api.py::test_odontograma_vacio` |
| Validación FDI | Piezas de borde aceptadas | `test_hc_api.py::test_pieza_fdi_limite` |
| Validación FDI | Pieza fuera de rango devuelve 422 | `test_hc_api.py::test_pieza_fdi_invalida` |
| Plan con items por pieza | Plan con items | `test_hc_api.py::test_plan_con_items` |
| Plan con items por pieza | Item sobre plan inexistente devuelve 404 | `test_hc_api.py::test_item_plan_inexistente_404` |
| Plan con items por pieza | Item con prestación inexistente devuelve 404 | `test_hc_api.py::test_item_prestacion_inexistente_404` |
| Plan con items por pieza | Paciente inexistente devuelve 404 | `test_hc_api.py::test_plan_paciente_inexistente_404` |
| Plan con items por pieza | Profesional inexistente devuelve 404 | `test_hc_api.py::test_plan_profesional_inexistente_404` |
| Listado de planes del paciente | Listado de los planes del paciente | `test_hc_servicio.py::test_listado_planes_orden` |
| Listado de planes del paciente | Paciente sin planes devuelve lista vacía | `test_hc_api.py::test_listado_planes_vacio` |
| Listado de planes del paciente | Paciente inexistente devuelve 404 | `test_hc_api.py::test_listado_planes_paciente_inexistente_404` |
| Presupuesto como suma | Total suma las piezas | `test_hc_servicio.py::test_total_presupuesto` |
| Presupuesto como suma | Plan sin items tiene total cero | `test_hc_servicio.py::test_total_sin_items` |
| Presupuesto como suma | Item agregado después actualiza el total | `test_hc_servicio.py::test_total_se_actualiza` |
| Cobertura de OS de solo lectura | Cobertura informada se devuelve literal | `test_hc_servicio.py::test_cobertura_snapshot` |
| Cobertura de OS de solo lectura | Cobertura ausente queda nula | `test_hc_api.py::test_cobertura_ausente_null` |
| Montos en centavos | Cero es un monto válido | `test_hc_api.py::test_monto_cero` |
| Montos en centavos | Monto negativo devuelve 422 | `test_hc_api.py::test_monto_negativo` |
| Montos en centavos | Monto decimal o ausente devuelve 422 | `test_hc_api.py::test_monto_decimal_o_ausente` |
| Estados provisorios | Estado del plan fuera del set devuelve 422 | `test_hc_api.py::test_estado_plan_invalido_422` |
| Estados provisorios | Item solo se agrega en plan editable | `test_hc_api.py::test_plan_no_editable_409` |
| Sin eliminación física | No existe endpoint de borrado de HC | `test_hc_api.py::test_delete_hc_405` |
| Sin eliminación física | Plan cerrado conserva sus items | `test_hc_api.py::test_plan_cerrado_conserva_items` |

## 8. Verificación final

- [x] 8.1 `ruff check backend/` sin hallazgos.
  **Verificación:** `ruff check backend/` sale con código 0.
- [x] 8.2 Suite completa sin regresiones (integración real incluida).
  **Verificación:** `pytest -rs backend/tests` en verde, sin `skipped` de
  integración (con `CI=true` la falta de Postgres debe fallar, no skipear).
- [x] 8.3 Revisión de las reglas duras: sin hard delete, sin datos reales, sin
  secretos, 409 para conflicto de negocio, 422 para input inválido.
  **Verificación:** revisión manual del diff + `grep` de `DELETE`/`drop`/
  `commit()` en `backend/app/hc/` sin resultados inesperados; confirmar que el
  servicio solo llama `flush()`.

## Workflow follow-up

- [x] Revisión humana de `design.md` + `specs/hc-odontograma/spec.md`
  (governance ALTO) antes de aplicar.
- [x] Archivar el change con `/opsx:archive` recién cuando 8.1 y 8.2 estén en
  verde y la revisión esté aprobada. No editar `CHANGES.md` desde este change.

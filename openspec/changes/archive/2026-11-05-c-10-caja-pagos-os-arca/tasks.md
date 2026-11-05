# Tasks

> **Protocolo TDD estricto (obligatorio en todas las tareas de código).**
> Para cada tarea: (1) escribir el test que falla (**RED**), (2) escribir el
> mínimo código que lo hace pasar (**GREEN**), (3) triangular con un segundo caso
> que rompa una implementación demasiado específica, (4) refactorizar con los
> tests en verde. El proyecto exige red-green manual (sin framework de TDD
> automático). Ninguna tarea se considera terminada sin su `**Verificación:**`
> en verde y sin haber visto el test fallar antes.
>
> **Evidencia obligatoria (protocolo TDD, punto 10 de la ronda 2):**
> (a) el agente pega la **salida REAL** del comando en **cada RED y en cada
> GREEN** (copiada del terminal, sin resumir, sin parafrasear y sin inventar);
> (b) **no se escribe código de producción en el mismo lote que su test**:
> primero el test en RED con su salida, después el código mínimo con su GREEN;
> (c) `backend/app/caja/__init__.py` lleva un **docstring de una línea**, igual
> que `backend/app/agenda/__init__.py`
> (`"""Agenda: horarios, bloqueos y recursos (scope C-02). Esqueleto."""`) y
> `backend/app/lista_espera/__init__.py` (`"""Modulo lista de espera (C-06)."""`);
> se verifica con `Get-ChildItem backend\app\caja\__init__.py` y leyendo el
> archivo.
>
> Los tests son de integración contra PostgreSQL real (`backend/tests/conftest.py`,
> `db_session` con rollback + `TRUNCATE`). Solo datos ficticios
> (`seed_catalogo`, `DNI-FICT-001`, `MAT-FICT-001`, `nombre="Consulta"`).
> No se commitea ni se pushea nada. En C-10 no se lee ninguna credencial ARCA/MP
> en código de producción (todo simulado, D8) y no se realizan llamadas de red:
> la fixture parchea `urllib.request.urlopen`, `httpx.HTTPTransport.handle_request`,
> `httpx.AsyncHTTPTransport.handle_async_request` y
> `requests.sessions.Session.send` (si `requests` está instalado) para que el
> test falle si se los llama (D31). Se parchea a nivel de transporte porque
> `TestClient` hereda de `httpx.Client`. El reloj se inyecta (D21/D29): la lógica de
> negocio no llama `datetime.now()`.

## 1. Base de tests y modelos

> **Nota de orden (migración 005).** `backend/tests/conftest.py` crea el esquema
> de test con `alembic upgrade head` cuando existe `backend/alembic.ini` (y ese
> es el caso del repo; si no existiera, usaría `Base.metadata.create_all`). Por
> eso el GREEN de 1.2–1.4 requiere la migración 005 aplicada. Sin las tablas
> `caja`/`cobro`/`liquidacion_os`, el `TRUNCATE` de 1.1 falla y los tests de
> modelo no corren. Se ejecuta 2.1 antes de verificar 1.2–1.4 (o en el mismo
> lote, 1.1 primero y 2.1 a continuación). Es la opción más simple: no se
> reordena la numeración de tareas y solo se documenta la dependencia real de
> verificación.

- [x] 1.1 Extender `_CATALOGO_TABLES` en `backend/tests/conftest.py` (tupla de
  alrededor de la línea 117) agregando `liquidacion_os`, `cobro`, `caja` en orden
  inverso de dependencias, para que el `TRUNCATE` no deje filas entre tests. Va
  primero porque todo lo demás depende de una pizarra limpia. Ojo: el
  `TRUNCATE` falla si las tablas no existen, así que 1.1 y 2.1 se ejecutan en el
  mismo lote (1.1 primero).
  **Verificación:** `Get-Content backend/tests/conftest.py` muestra las tres
  tablas nuevas; una vez aplicada 2.1, correr `pytest backend/tests -p
  no:randomly` dos veces seguidas da el mismo resultado y sin fallos por datos
  residuales.

- [x] 1.2 Crear `backend/app/caja/__init__.py` con **docstring de una línea**
  (patrón `agenda/` y `lista_espera/`), `backend/app/caja/reloj.py` con
  `ahora_local()` (`datetime.now(ZONA)`) y `hoy_local()`, **importando `ZONA` de
  `backend.app.turnos.service`** (definida en la línea 27; **no** redefinirla), y
  `backend/app/caja/models.py` con las tres entidades y las tuplas de estados a
  nivel de módulo (`ESTADOS_CAJA`, `MEDIOS_COBRO`, `CONCEPTOS_COBRO`,
  `ESTADOS_COBRO`, `ESTADOS_LIQUIDACION` con `anulada`) y la constante
  `MONTO_MAX_CENTAVOS = 1_000_000_000_000`, usando `Mapped`/`mapped_column`, PK
  `Uuid` con `default=uuid.uuid4` y `timestamptz` con
  `server_default=text("now()")` (patrón `lista_espera`). Dinero en `BigInteger`
  (D18) con CHECK de rango `BETWEEN piso AND MONTO_MAX_CENTAVOS` (D20). Empezar
  por `test_caja_modelo.py::test_caja_fecha_unica` en RED.
  **Verificación:** `Get-ChildItem backend\app\caja\__init__.py` existe y el
  archivo tiene una sola línea de docstring; `pytest
  backend/tests/test_caja_modelo.py -k caja_fecha_unica` en verde (insertar dos
  cajas con la misma `fecha` debe fallar por UNIQUE).

- [x] 1.3 Modelar `caja` (fecha UNIQUE **sin** índice extra: el UNIQUE ya crea
  el índice, `ix_caja_fecha` se elimina; monto de apertura CHECK `BETWEEN 0 AND
  MONTO_MAX_CENTAVOS`; estado abierta/cerrada; montos `BigInteger`) y `cobro`
  (FK a caja RESTRICT, `turno_id` FK **RESTRICT** (D16: no hay borrado silencioso
  del vínculo), medio/concepto/estado con CHECK, monto CHECK `BETWEEN 1 AND
  MONTO_MAX_CENTAVOS`, columnas ARCA `factura_tipo`, `factura_cae`, `factura_qr`,
  `facturado_en` nullable, y `simulado` con default `false`). Triangular: borrar
  una caja con cobros debe fallar por RESTRICT; `monto_centavos = 0` y
  `monto_centavos` por encima del tope deben fallar por CHECK.
  **Verificación:** `pytest backend/tests/test_caja_modelo.py -k
  "cobro_restrict_caja or monto_cobro_positivo or monto_cobro_tope"` en verde.

- [x] 1.4 Modelar `liquidacion_os` (FK a cobro RESTRICT + UNIQUE, nomenclador
  NOT NULL, montos `BigInteger` CHECK `BETWEEN 0 AND MONTO_MAX_CENTAVOS`,
  estado con CHECK que incluye `anulada`) **más los CHECK de coherencia**
  `cobertura_centavos <= monto_total_centavos` (`cobertura_no_excede_total`) y
  `copago_centavos = monto_total_centavos - cobertura_centavos`
  (`copago_consistente`). Triangular: dos liquidaciones para el mismo cobro deben
  fallar por UNIQUE; `cobertura_centavos` negativo, cobertura mayor al total y
  copago inconsistente deben fallar por CHECK.
  **Verificación:** `pytest backend/tests/test_caja_modelo.py -k
  "liquidacion_unica_por_cobro or montos_liquidacion_no_negativos or
  liquidacion_check_cobertura_copago"` en verde.

## 2. Migración 005

- [x] 2.1 Crear `backend/alembic/versions/005_caja_pagos.py` con
  `revision = "005_caja_pagos"` y **`down_revision = "004_hc_odontograma"`**
  (head real verificado; `CHANGES.md` mencionaba "004" y está desactualizado).
  **La migración no hace `GRANT` ni toca roles**: el rol `mcp_readonly` no está
  en el repo y un `GRANT` a un rol inexistente fallaría en una base sin él. La
  cobertura depende del default ACL existente; la tarea 8.4 la verifica.
  **Antes de crear el archivo**, correr `alembic heads` parado en `backend\`
  (con `PYTHONPATH` a la raíz) para encadenar sobre el head real vigente al
  implementar; el nombre `005_caja_pagos` es provisional. `upgrade()` crea en
  orden `caja`, `cobro`, `liquidacion_os` con CHECKs (incluidos
  `cobertura_no_excede_total` y `copago_consistente`), FKs e índices
  (`ix_cobro_caja`, `ix_cobro_turno`, `ix_liquidacion_os_creado`; **sin**
  `ix_caja_fecha`), montos `BigInteger`.
  **Verificación** (parado en `backend\`):
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path
  python -m alembic -c alembic.ini upgrade head
  ```
  La migración aplica sin error.

- [x] 2.2 Implementar `downgrade()` en **orden inverso**
  (`liquidacion_os` → `cobro` → `caja`), dropeando índices antes que tablas.
  **Verificación** (parado en `backend\`):
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path
  python -m alembic -c alembic.ini downgrade -1
  python -m alembic -c alembic.ini upgrade head
  ```
  Ambas idempotentes y sin error; repetir la secuencia una segunda vez.

- [x] 2.3 Agregar el import explícito `from backend.app.caja import models` con
  `# noqa: F401` en `backend/alembic/env.py`, junto a los imports de `agenda`,
  `hc`, `lista_espera` y `turnos`. Sin este import `Base.metadata` no ve las
  tablas.
  **Verificación** (parado en `backend\`):
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path
  python -m alembic -c alembic.ini check
  ```
  Debe reportar "No new upgrade operations detected"; si se comenta el import,
  `alembic check` debe acusar diferencias.

## 3. Schemas

> **Nota de orden (matriz 1:1).** Los schemas se verifican con **tests puros de
> Pydantic** en `backend/tests/test_caja_schemas.py` (sin HTTP, sin router): así
> 3.x queda en verde sin depender de 4.1/5.1. Los tests HTTP de los mismos
> escenarios viven en `test_caja_api.py` (§5 y §7.3) y son los que la matriz
> referencia.

- [x] 3.1 Schemas de caja: `CajaAbrir` (**sin** `fecha`, D30:
  `monto_apertura_centavos: int = Field(ge=0, le=MONTO_MAX_CENTAVOS)`),
  `CajaCerrar` (`fecha: date | None = None`,
  `monto_cierre_contado_centavos: int = Field(ge=0, le=MONTO_MAX_CENTAVOS)`),
  `CajaOut` con todos los campos de arqueo más `totales_por_medio_centavos`.
  Todos con `ConfigDict(extra="ignore")` de entrada y `from_attributes=True` de
  salida. RED con `test_caja_schemas.py::test_apertura_monto_negativo`.
  **Verificación:** `pytest backend/tests/test_caja_schemas.py -k
  "apertura or cierre"` en verde (casos negativos y sobre el tope → `422` de
  Pydantic, sin tocar la base).

- [x] 3.2 Schemas de cobro: `CobroCreate` (`caja_id` opcional, `turno_id`
  opcional, `medio`, `concepto` opcional con default `total`,
  `monto_centavos: int = Field(gt=0, le=MONTO_MAX_CENTAVOS)`, campos OS
  opcionales `nomenclador_codigo` y
  `cobertura_centavos: int | None = Field(default=None, ge=0, le=MONTO_MAX_CENTAVOS)`),
  `CobroOut` (expone `simulado: bool`, **no** `modo`) y
  `AnularCobro` (`motivo: str = Field(min_length=1)`). `CobroCreate` lleva un
  `model_validator(mode="after")` que: (a) exige `nomenclador_codigo` cuando
  `medio = "obra_social"`; (b) valida `0 <= cobertura_centavos <= monto_centavos`;
  (c) rechaza campos OS con cualquier otro medio con el mensaje
  `campos_os_no_aplicables`. Todo eso da `422` de Pydantic **antes de tocar la
  base**: el `detail` es una **lista de errores** de Pydantic, no un
  `{"causa": ...}` (D22). Triangular: `monto_centavos = 0`,
  `medio = "bitcoin"`, `monto_centavos` sobre el tope y `cobertura` mayor al
  total → `422`.
  **Verificación:** `pytest backend/tests/test_caja_schemas.py -k
  "monto_no_positivo or medio_invalido or monto_maximo or cobertura_mayor or
  campos_os"` en verde.

- [x] 3.3 Schemas de ARCA y liquidación: `FacturaArcaCreate`
  (`tipo: Literal["B","C"]`), `FacturaArcaOut` (`cae`, `qr`, `simulado`,
  `modo`), `LiquidacionOSOut` con `id`, `cobro_id`, `nomenclador_codigo`, montos,
  `estado` y `pdf_referencia`. Constantes `MODO_ARCA_SIMULADO = "simulado"` y
  `SIMULADO_ARCA = True` (D8/D25). Triangular: `tipo = "A"` → `422`.
  **Verificación:** `pytest backend/tests/test_caja_schemas.py -k
  "factura_tipo_invalido"` en verde.

## 4. Servicio

> **Nota de orden.** Las tareas 4.x se verifican con tests de **servicio**
> (`test_caja_servicio.py`, con `db_session`): no necesitan router y por eso van
> antes de §5. El router puede crear la `HTTPException` recién en 5.x.

- [x] 4.1 `backend/app/caja/service.py` con `ServicioCaja.abrir` y `cerrar`:
  abrir valida fecha única (409 `caja_ya_abierta`/`caja_ya_cerrada`), monto
  `0 <= x <= MONTO_MAX_CENTAVOS`, y usa `hoy_local(ahora)` (nunca una fecha del
  request, D30); cerrar identifica la caja por `fecha` (default `hoy_local()` del
  **reloj inyectable**, D21), valida caja abierta (409
  `caja_no_abierta`/`caja_ya_cerrada`), toma row lock sobre la caja
  (`with_for_update()`), calcula esperado = apertura + sum(cobros en efectivo
  registrados **no anulados**), diferencia = contado − esperado, setea
  `abierto_en` (en `abrir`) y `cerrado_en` (en `cerrar`) desde `ahora` y
  `totales_por_medio_centavos` (excluyendo anulados). `session.flush()`, nunca `commit()`. RED con
  `test_caja_servicio.py::test_abrir_valido`.
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -k
  "abrir or cerrar or cierre"` en verde.

- [x] 4.2 `obtener` y `obtener_por_fecha(session, fecha=None, *, ahora=None)`:
  404 si no existe; `fecha` default `hoy_local(ahora)` para que `GET /caja` sin
  `fecha` use el reloj inyectado (D29). Triangular con el caso de fecha sin caja
  y con el override de las 23:30.
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -k
  "obtener or por_fecha"` en verde.

- [x] 4.3 `registrar_cobro(session, datos, *, ahora=None)`: resuelve la caja con
  `caja_id` explícito (404 si no existe, 409 si cerrada) o, si falta, con
  `hoy_local(ahora)` (409 `caja_no_abierta` si no hay caja abierta hoy, D29);
  toma row lock sobre la caja (`with_for_update()`), valida turno existente (404
  `TurnoNoEncontrado`), valida medio/concepto/monto (incluido el tope
  `MONTO_MAX_CENTAVOS`); fija `simulado` según `MEDIOS_SIMULADOS` (D8: solo
  `mercado_pago`); si medio = `obra_social` crea `LiquidacionOS` con copago
  calculado y **revalida** la cobertura como defensa (`CoberturaInvalida` →
  422); setea `creado_en` del cobro y de la `liquidacion_os` desde `ahora`
  (D21); `session.flush()`. No valida campos OS (eso vive en el schema, D22).
  El test de turno inexistente se escribe en 4.7. RED con
  `test_caja_servicio.py::test_cobro_os_genera_liquidacion`.
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -k
  "registrar_cobro or cobro_os"` en verde.

- [x] 4.4 `obtener_cobro` y `anular_cobro`: 404 si no existe; rechazos en
  **orden de precedencia** `cobro_ya_anulado` → `caja_cerrada` → `cobro_facturado`
  (D26): 409 si ya anulado, 409 `caja_cerrada` si la caja del cobro está cerrada
  (D23), 409 `cobro_facturado` si el cobro ya tiene factura emitida (excepción
  `CobroFacturado`); 422 si falta motivo; setea estado/motivo/`anulado_en` desde
  `ahora`. Si el cobro es de obra social, bloquea **también** la liquidación y la
  pasa a `anulada` en la misma transacción (D27). Orden de locks
  `caja → cobro → liquidacion_os`: lee `caja_id`, bloquea caja con
  `with_for_update()`, bloquea el cobro con `with_for_update()` y **relee** su
  estado después del lock (D19). Triangular con doble anulación, anulación
  posterior al cierre, anulación de cobro facturado y anulación de cobro OS.
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -k
  "anular"` en verde.

- [x] 4.5 `facturar_arca`: toma row lock sobre el cobro
  (`with_for_update()`, D19); valida cobro existente (404) y no anulado (409);
  rechaza segunda emisión (409 `cobro_ya_facturado`); rechaza cobro OS (409
  `medio_no_facturable`, D24); valida tipo (422); opera siempre en modo
  simulado generando CAE+QR con prefijo `SIM-` y persiste en
  `factura_tipo`/`factura_cae`/`factura_qr`/`facturado_en` (no en
  `referencia_externa`) **sin tocar `cobro.simulado`** (D8). RED con
  `test_caja_servicio.py::test_factura_b_simulada`.
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -k
  "factura"` en verde.

- [x] 4.6 `listar_liquidaciones`: orden `creado_en` desc, `[]` si no hay,
  incluye `estado` (también `anulada`, D27). Triangular con listado vacío.
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -k
  "listado_liquidaciones"` en verde.

- [x] 4.7 Validación explícita de FKs **antes** de `session.add` en
  `registrar_cobro` (turno y caja) y traducción de `IntegrityError`
  (UNIQUE/CHECK) a la excepción de dominio correspondiente: un id bien formado
  (UUID válido) que no existe es excepción de dominio → **404**, nunca `500`; una
  carrera que llegue al `INSERT` se traduce a **409**. RED con
  `test_caja_servicio.py::test_cobro_turno_inexistente`.
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -k
  "turno_inexistente or integrity"` en verde.

## 5. Router

- [x] 5.1 `backend/app/caja/router.py` con los **9 endpoints** de `design.md`
  §API, `response_model` y `status_code` correctos, el `get_db` con `commit()`
  del router (patrón `lista_espera`) y la dependencia `get_ahora()` que inyecta
  el reloj (D21/D29) en **`POST /caja/abrir`, `POST /caja/cerrar`,
  `POST /cobros`, `GET /caja` y `POST /cobros/{id}/anular`/`factura-arca`**.
  **Verificación:** `pytest backend/tests/test_caja_api.py -k apertura_valida`
  en verde; `python -c "from backend.app.caja.router import router;
  print(len(router.routes))"` devuelve 9.

- [x] 5.2 Mapeo de excepciones de dominio a HTTP, explícito:
  `CajaNoEncontrada`/`CobroNoEncontrado`/`TurnoNoEncontrado` → **404**;
  `CajaYaAbierta`/`CajaNoAbierta`/`CajaYaCerrada`/`CajaCerrada`/
  `CobroYaAnulado`/**`CobroFacturado`**/`CobroAnulado`/`CobroYaFacturado`/
  `MedioNoFacturable` → **409** con `detail={"causa": ..., "detalle": ...}`;
  `MontoInvalido`/`MedioInvalido`/`TipoFacturaInvalido`/`CoberturaInvalida`/
  `MotivoRequerido` → **422**. `CamposOsNoAplicables` **no** existe en el
  servicio ni en el router: ese rechazo vive **solo** en el `model_validator`
  del schema (`422` de Pydantic con `detail` en lista, D22). El resto del input
  inválido lo cubre Pydantic (también 422). Nunca 200 ni 500 ante conflicto de
  negocio.
  **Verificación:** `pytest backend/tests/test_caja_api.py -k "_409 or _422"`
  en verde.

- [x] 5.3 Verificar que no existe ningún endpoint `DELETE` en el router y que las
  rutas de borrado responden 405.
  **Verificación:** `pytest backend/tests/test_caja_api.py -k delete_cobro_405`
  en verde.

## 6. Registro e integración de la app

- [x] 6.1 Registrar el router en `backend/app/main.py`
  (`app.include_router(caja_router)`).
  **Verificación:** `pytest backend/tests/test_caja_api.py -k apertura_valida`
  en verde y `GET /health` sigue respondiendo 200.

- [x] 6.2 Confirmar que `backend/app/caja/models.py` se importa desde `env.py`
  (tarea 2.3) y que la app arranca sin `DATABASE_URL` (contrato foundation:
  importar `main` no debe exigir base).
  **Verificación:**
  ```powershell
  python -c "import backend.app.main"
  ```
  desde la raíz del repo (sin `DATABASE_URL`), y con `$env:DATABASE_URL` definido,
  parado en `backend\`:
  ```powershell
  $env:PYTHONPATH = (Resolve-Path ..).Path
  python -m alembic -c alembic.ini check
  ```

## 7. Suite de tests y mapeo de escenarios

> Las tareas 3.x–5.x escriben los tests incrementales de cada comportamiento en
> RED; 7.x cierra cada archivo (cobertura completa, `-rs`, nombres definitivos de
> la matriz) y agrega los tests unitarios/invariantes que **no** son escenarios.

- [x] 7.1 `backend/tests/test_caja_modelo.py` (`pytestmark = pytest.mark.integration`):
  invariantes de esquema. Tests nombrados (los usan 1.2–1.4):
  `test_caja_fecha_unica`, `test_cobro_restrict_caja`,
  `test_monto_cobro_positivo`, `test_monto_cobro_tope`,
  `test_liquidacion_unica_por_cobro`, `test_montos_liquidacion_no_negativos`,
  `test_liquidacion_check_cobertura_copago`, `test_montos_bigint`.
  **Verificación:** `pytest backend/tests/test_caja_modelo.py -rs` en verde.

- [x] 7.2 `backend/tests/test_caja_servicio.py`: servicio con `db_session` y
  `seed_catalogo(db_session)`; tests de la capa de servicio, sin HTTP. Respaldan
  el TDD de cada tarea 4.x y son distintos de los de la matriz (que son de API).
  Por tarea:
  - **4.1 (abrir/cerrar):** `test_abrir_valido`, `test_abrir_duplicado`,
    `test_abrir_caja_cerrada`, `test_abrir_fecha_local_2330`,
    `test_abrir_monto_maximo`, `test_cerrar_valido`, `test_cierre_sin_caja`,
    `test_cierre_ya_cerrada`, `test_cierre_excluye_cobro_anulado`.
  - **4.2 (obtener/obtener_por_fecha):** `test_obtener_por_id`,
    `test_obtener_inexistente`, `test_obtener_por_fecha_con_caja`,
    `test_obtener_por_fecha_sin_caja`, `test_obtener_por_fecha_2330`.
  - **4.3 (registrar_cobro):** `test_registrar_cobro_con_turno`,
    `test_registrar_cobro_standalone`, `test_registrar_cobro_caja_cerrada`,
    `test_registrar_cobro_caja_id_inexistente`,
    `test_registrar_cobro_caja_id_cerrada`,
    `test_registrar_cobro_sin_caja_id_2330`,
    `test_cobro_os_genera_liquidacion`,
    `test_registrar_cobro_os_calcula_copago`,
    `test_registrar_cobro_os_cobertura_ausente`,
    `test_registrar_cobro_os_copago_no_genera_cobro`,
    `test_registrar_cobro_os_cobertura_invalida` (defensa `CoberturaInvalida`
    del servicio).
  - **4.4 (anular):** `test_anular_valido`, `test_anular_inexistente`,
    `test_anular_ya_anulado`, `test_anular_caja_cerrada`,
    `test_anular_cobro_facturado`,
    `test_anular_cobro_os_anula_liquidacion`, `test_anular_sin_motivo`.
  - **4.5 (facturar_arca):** `test_factura_b_simulada`,
    `test_factura_no_muta_simulado`, `test_factura_ya_emitida`,
    `test_factura_cobro_inexistente`, `test_factura_cobro_anulado`,
    `test_factura_cobro_os`, `test_factura_tipo_invalido`.
  - **4.6 (listar_liquidaciones):** `test_listado_liquidaciones_orden`,
    `test_listado_liquidaciones_vacio`,
    `test_listado_liquidaciones_pdf_referencia`,
    `test_listado_liquidaciones_incluye_anulada`.
  - **4.7 (FKs/IntegrityError):** `test_cobro_turno_inexistente`,
    `test_integrity_error_traduce_409`.
  Los filtros `-k` de 4.1–4.7 usan los nombres exactos de esta lista (o un
  subconjunto que matchee por subcadena).
  **Verificación:** `pytest backend/tests/test_caja_servicio.py -rs` en verde.

- [x] 7.3 `backend/tests/test_caja_api.py` con `TestClient`: cubre códigos de
  estado, cuerpos y `detail` de 409 (ver tabla de mapeo). Los escenarios de las
  23:30 se hacen deterministas con
  `app.dependency_overrides[get_ahora] = lambda: datetime(2026, 11, 3, 23, 30, tzinfo=ZONA)`
  (D21/D29), limpiando el override al final del test. Los escenarios que
  necesitan dos instantes distintos (p. ej. el orden del listado de
  liquidaciones) reasignan `app.dependency_overrides[get_ahora]` entre las dos
  creaciones.
  Nota: `test_credenciales_no_expuestas` (fila 57) es un test de **regresión**:
  el código de producción no lee el entorno (D9).
  **Verificación:** `pytest backend/tests/test_caja_api.py -rs` en verde.

- [x] 7.4 `backend/tests/test_caja_schemas.py`: tests puros de Pydantic (sin
  `TestClient`, sin base) de montos fuera de rango, medio/concepto/tipo
  inválidos, `campos_os_no_aplicables` (mensaje dentro del `detail` en lista),
  nomenclador ausente y cobertura mayor al total. No son escenarios de la matriz:
  son la verificación unitaria de §3.
  **Verificación:** `pytest backend/tests/test_caja_schemas.py -rs` en verde.

- [x] 7.5 `backend/tests/test_caja_concurrencia.py`: test de concurrencia con
  **dos sesiones reales** sobre `_db_engine` (no `db_session`, cuyos datos sin
  commit no son visibles desde otra conexión), con `commit()` y limpieza
  explícita al final: (a) doble anulación del mismo cobro y (b) cobro vs cierre
  de caja. Se valida el orden de locks `caja → cobro` (D19). Si el test resulta
  no determinista en Postgres, se elimina y el riesgo queda declarado como
  **no testeado** en `design.md` (D19 §Riesgos); no se deja un test flaky.
  **Verificación:** `pytest backend/tests/test_caja_concurrencia.py -rs` en
  verde (o el test eliminado y la nota de riesgo actualizada en `design.md`).

### Mapeo escenario del spec → tarea → test

Una fila por escenario del spec: **66 escenarios → 66 filas (1:1)**, con el
título copiado carácter por carácter. El archivo y el nombre de cada test de
esta tabla son la referencia única para los filtros `-k` de las tareas de las
§4–§5. Los tests de `test_caja_modelo.py` (7.1), `test_caja_servicio.py` (7.2),
`test_caja_schemas.py` (7.4) y `test_caja_concurrencia.py` (7.5) verifican
invariantes y decisiones de diseño, no escenarios de aceptación, así que **no**
son filas de esta matriz: la matriz es **1:1 con los escenarios de API** (66
filas, todas en `test_caja_api.py`).

| # | Requirement | Scenario | Tarea | Test |
|---|---|---|---|---|
| 1 | Apertura de caja diaria | Apertura válida crea caja abierta | 7.3 | `test_caja_api.py::test_apertura_valida` |
| 2 | Apertura de caja diaria | Segunda apertura el mismo día con caja abierta devuelve 409 | 7.3 | `test_caja_api.py::test_apertura_duplicada_409` |
| 3 | Apertura de caja diaria | Apertura con caja cerrada el mismo día devuelve 409 | 7.3 | `test_caja_api.py::test_apertura_caja_cerrada_409` |
| 4 | Apertura de caja diaria | Apertura a las 23:30 hora local registra la fecha local | 7.3 | `test_caja_api.py::test_apertura_fecha_local_2330` |
| 5 | Apertura de caja diaria | Monto de apertura negativo devuelve 422 | 7.3 | `test_caja_api.py::test_apertura_monto_negativo_422` |
| 6 | Apertura de caja diaria | Monto de apertura por encima del máximo devuelve 422 | 7.3 | `test_caja_api.py::test_apertura_monto_maximo_422` |
| 7 | Apertura de caja diaria | Apertura con caja abierta de un día anterior no bloquea el día de hoy | 7.3 | `test_caja_api.py::test_apertura_con_caja_ayer_abierta` |
| 8 | Cierre de caja con arqueo | Cierre válido calcula diferencia | 7.3 | `test_caja_api.py::test_cierre_valido` |
| 9 | Cierre de caja con arqueo | Cierre sin caja abierta para la fecha devuelve 409 | 7.3 | `test_caja_api.py::test_cierre_sin_caja_409` |
| 10 | Cierre de caja con arqueo | Cierre de caja ya cerrada devuelve 409 | 7.3 | `test_caja_api.py::test_cierre_ya_cerrada_409` |
| 11 | Cierre de caja con arqueo | Monto contado negativo devuelve 422 | 7.3 | `test_caja_api.py::test_cierre_monto_negativo_422` |
| 12 | Cierre de caja con arqueo | Monto contado por encima del máximo devuelve 422 | 7.3 | `test_caja_api.py::test_cierre_monto_maximo_422` |
| 13 | Cierre de caja con arqueo | Cobro anulado no entra en el arqueo | 7.3 | `test_caja_api.py::test_cierre_excluye_cobro_anulado` |
| 14 | Cobro registrado contra caja abierta | Cobro válido con turno existente | 7.3 | `test_caja_api.py::test_cobro_con_turno` |
| 15 | Cobro registrado contra caja abierta | Cobro válido sin turno (standalone) | 7.3 | `test_caja_api.py::test_cobro_standalone` |
| 16 | Cobro registrado contra caja abierta | Turno inexistente devuelve 404 | 7.3 | `test_caja_api.py::test_cobro_turno_inexistente_404` |
| 17 | Cobro registrado contra caja abierta | Monto no positivo devuelve 422 | 7.3 | `test_caja_api.py::test_cobro_monto_no_positivo_422` |
| 18 | Cobro registrado contra caja abierta | Monto por encima del máximo devuelve 422 | 7.3 | `test_caja_api.py::test_cobro_monto_maximo_422` |
| 19 | Cobro registrado contra caja abierta | Medio inválido devuelve 422 | 7.3 | `test_caja_api.py::test_cobro_medio_invalido_422` |
| 20 | Cobro registrado contra caja abierta | Cobro contra caja cerrada devuelve 409 | 7.3 | `test_caja_api.py::test_cobro_caja_cerrada_409` |
| 21 | Cobro registrado contra caja abierta | Cobro con caja_id explícito inexistente devuelve 404 | 7.3 | `test_caja_api.py::test_cobro_caja_id_inexistente_404` |
| 22 | Cobro registrado contra caja abierta | Cobro con caja_id explícito cerrada devuelve 409 | 7.3 | `test_caja_api.py::test_cobro_caja_id_cerrada_409` |
| 23 | Cobro registrado contra caja abierta | Cobro sin caja_id a las 23:30 usa la caja abierta del día local | 7.3 | `test_caja_api.py::test_cobro_sin_caja_id_2330` |
| 24 | Cobro con concepto | Concepto sena vinculado a turno | 7.3 | `test_caja_api.py::test_cobro_concepto_sena` |
| 25 | Cobro con concepto | Concepto inválido devuelve 422 | 7.3 | `test_caja_api.py::test_cobro_concepto_invalido_422` |
| 26 | Cobro con concepto | Concepto ausente toma el valor por defecto total | 7.3 | `test_caja_api.py::test_cobro_concepto_default_total` |
| 27 | Anulación trazable | Anulación válida marca anulado y conserva fila | 7.3 | `test_caja_api.py::test_anulacion_valida` |
| 28 | Anulación trazable | Anulación de cobro inexistente devuelve 404 | 7.3 | `test_caja_api.py::test_anulacion_inexistente_404` |
| 29 | Anulación trazable | Anulación de cobro ya anulado devuelve 409 | 7.3 | `test_caja_api.py::test_anulacion_ya_anulado_409` |
| 30 | Anulación trazable | Anulación de cobro con caja cerrada devuelve 409 | 7.3 | `test_caja_api.py::test_anulacion_caja_cerrada_409` |
| 31 | Anulación trazable | Anulación de cobro facturado devuelve 409 | 7.3 | `test_caja_api.py::test_anulacion_cobro_facturado_409` |
| 32 | Anulación trazable | Anulación de cobro de obra social anula la liquidación | 7.3 | `test_caja_api.py::test_anulacion_cobro_os_anula_liquidacion` |
| 33 | Anulación trazable | Anulación sin motivo devuelve 422 | 7.3 | `test_caja_api.py::test_anulacion_sin_motivo_422` |
| 34 | Medios de pago | Cobro en efectivo registra el medio | 7.3 | `test_caja_api.py::test_cobro_efectivo` |
| 35 | Medios de pago | Cobro con tarjeta no se marca simulado | 7.3 | `test_caja_api.py::test_cobro_tarjeta_no_simulado` |
| 36 | Medios de pago | Cobro con Mercado Pago se marca simulado | 7.3 | `test_caja_api.py::test_cobro_mp_simulado` |
| 37 | Medios de pago | Cobro con medio obra social genera liquidación | 7.3 | `test_caja_api.py::test_cobro_os_genera_liquidacion` |
| 38 | Medios de pago | Cobro obra social sin nomenclador devuelve 422 | 7.3 | `test_caja_api.py::test_cobro_os_sin_nomenclador_422` |
| 39 | Medios de pago | Campos OS con medio distinto de obra social devuelven 422 | 7.3 | `test_caja_api.py::test_cobro_campos_os_invalidos_422` |
| 40 | Factura ARCA | Factura tipo B simulada sin credenciales | 7.3 | `test_caja_api.py::test_factura_b_simulada` |
| 41 | Factura ARCA | Factura no muta el flag simulado del cobro | 7.3 | `test_caja_api.py::test_factura_no_muta_simulado` |
| 42 | Factura ARCA | Segunda emisión de factura devuelve 409 | 7.3 | `test_caja_api.py::test_factura_ya_emitida_409` |
| 43 | Factura ARCA | Factura sobre cobro inexistente devuelve 404 | 7.3 | `test_caja_api.py::test_factura_cobro_inexistente_404` |
| 44 | Factura ARCA | Factura sobre cobro anulado devuelve 409 | 7.3 | `test_caja_api.py::test_factura_cobro_anulado_409` |
| 45 | Factura ARCA | Factura sobre cobro de obra social devuelve 409 | 7.3 | `test_caja_api.py::test_factura_cobro_os_409` |
| 46 | Factura ARCA | Tipo de factura inválido devuelve 422 | 7.3 | `test_caja_api.py::test_factura_tipo_invalido_422` |
| 47 | Liquidación OS | Liquidación válida calcula copago | 7.3 | `test_caja_api.py::test_liquidacion_calcula_copago` |
| 48 | Liquidación OS | Cobertura mayor al total devuelve 422 | 7.3 | `test_caja_api.py::test_liquidacion_cobertura_mayor_422` |
| 49 | Liquidación OS | Nomenclador ausente devuelve 422 | 7.3 | `test_caja_api.py::test_cobro_os_sin_nomenclador_no_crea_liquidacion_422` |
| 50 | Liquidación OS | Cobertura ausente queda en cero | 7.3 | `test_caja_api.py::test_liquidacion_cobertura_ausente` |
| 51 | Liquidación OS | Copago informado no genera un cobro aparte | 7.3 | `test_caja_api.py::test_liquidacion_copago_no_genera_cobro` |
| 52 | Listado liquidaciones | Listado devuelve liquidaciones ordenadas | 7.3 | `test_caja_api.py::test_listado_liquidaciones_orden` |
| 53 | Listado liquidaciones | Listado vacío devuelve lista vacía | 7.3 | `test_caja_api.py::test_listado_liquidaciones_vacio` |
| 54 | Listado liquidaciones | Liquidación incluye referencia a PDF | 7.3 | `test_caja_api.py::test_liquidacion_pdf_referencia` |
| 55 | Listado liquidaciones | Listado incluye la liquidación anulada con su estado | 7.3 | `test_caja_api.py::test_listado_incluye_liquidacion_anulada` |
| 56 | Credenciales y modo simulado | Variables ausentes activan modo simulado | 7.3 | `test_caja_api.py::test_modo_simulado_sin_credenciales` |
| 57 | Credenciales y modo simulado | Variables presentes no exponen valores | 7.3 | `test_caja_api.py::test_credenciales_no_expuestas` |
| 58 | Credenciales y modo simulado | Tests no realizan llamadas de red | 7.3 | `test_caja_api.py::test_sin_llamadas_red` |
| 59 | Sin eliminación física | No existe endpoint de borrado de cobro | 7.3 | `test_caja_api.py::test_delete_cobro_405` |
| 60 | Sin eliminación física | Caja cerrada conserva su arqueo | 7.3 | `test_caja_api.py::test_caja_cerrada_conserva_arqueo` |
| 61 | Sin eliminación física | Anulación conserva la fila del cobro | 7.3 | `test_caja_api.py::test_anulacion_conserva_fila` |
| 62 | Consulta de caja y cobros | Caja por id inexistente devuelve 404 | 7.3 | `test_caja_api.py::test_caja_get_id_inexistente_404` |
| 63 | Consulta de caja y cobros | Cobro por id inexistente devuelve 404 | 7.3 | `test_caja_api.py::test_cobro_get_id_inexistente_404` |
| 64 | Consulta de caja y cobros | Consulta de caja por fecha con caja existente | 7.3 | `test_caja_api.py::test_caja_por_fecha_con_caja` |
| 65 | Consulta de caja y cobros | Consulta de caja por fecha sin caja devuelve 404 | 7.3 | `test_caja_api.py::test_caja_por_fecha_sin_caja_404` |
| 66 | Consulta de caja y cobros | Consulta de caja sin fecha a las 23:30 usa la fecha local | 7.3 | `test_caja_api.py::test_caja_sin_fecha_2330` |

## 8. Verificación final

- [x] 8.1 `ruff check backend/` sin hallazgos.
  **Verificación:** `ruff check backend/` sale con código 0.

- [x] 8.2 Suite completa sin regresiones (integración real incluida).
  **Verificación:** `pytest -rs backend/tests` en verde, sin `skipped` de
  integración (con `CI=true` la falta de Postgres debe fallar, no skipear).

- [x] 8.3 Revisión de las reglas duras: sin hard delete, sin datos reales, sin
  secretos, 409 para conflicto de negocio, 422 para input inválido (incluidos
  monto fuera de rango y campos OS inválidos), sin `datetime.now()` en la lógica
  de negocio (reloj inyectable), sin `commit()` en el servicio y **sin lecturas
  de credenciales en código de producción**.
  **Verificación:** revisión manual del diff + `grep` de `DELETE`/`drop`/
  `commit()`/`datetime.now(`/`os.environ`/`getenv` en `backend/app/caja/` sin
  resultados inesperados; confirmar que el servicio solo llama `flush()`, que
  todo monto usa el tope `MONTO_MAX_CENTAVOS`, que `reloj.py` importa `ZONA` de
  `backend.app.turnos.service` (no la redefine) y que `backend/app/caja` no
  importa `httpx`/`requests`/`urllib.request`.

- [x] 8.4 Evidencia de que `ALTER DEFAULT PRIVILEGES` de la migración 005 llega
  a `mcp_readonly`: después de `upgrade head`, consultar los grants reales de las
  tres tablas nuevas y los default ACL. Comando de referencia del revisor
  (evidencia primaria, **no** se ejecuta en esta etapa):
  ```powershell
  docker compose exec postgres psql -U odontologia -d turnos -c "SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'mcp_readonly' AND table_name IN ('caja','cobro','liquidacion_os') ORDER BY table_name, privilege_type;"
  docker compose exec postgres psql -U odontologia -d turnos -c "SELECT defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl FROM pg_default_acl;"
  ```
  Equivalente por la vía que manda `AGENTS.md` (lectura de base solo por el MCP
  `postgres` en modo readonly):
  `postgres_execute_sql` con
  `SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'mcp_readonly' AND table_name IN ('caja','cobro','liquidacion_os') ORDER BY 1,2;`
  y `SELECT * FROM pg_default_acl;`.
  **Verificación:** la salida muestra `SELECT` para `mcp_readonly` en `caja`,
  `cobro` y `liquidacion_os`, y una fila de `pg_default_acl` para el rol
  (`defaclobjtype = 'r'`) que prueba que `ALTER DEFAULT PRIVILEGES` funcionó con
  una migración real. Si alguna tabla nueva no aparece cubierta, se documenta el
  `GRANT` manual en el README fuera de la migración (la migración no hace
   `GRANT`, ver 2.1). No se tocan volúmenes de Docker ni el rol
   `mcp_readonly`.

## Conteo de tareas y tests

**Tareas:** **31** en total = **27 de implementación** (§1–§7: 4 + 3 + 3 + 7 +
3 + 2 + 5) + **4 de verificación** (§8). Coincide con `openspec list`
(31 tareas, 0 completadas al planificar).

**Tests:**

- Tests actuales en el repo: **215** (línea base al planificar).
- Tests nuevos de este change: **120** = **66** escenarios de aceptación (matriz
  1:1, todos en `test_caja_api.py`) + **8** invariantes de esquema en
  `test_caja_modelo.py` + **1** test de concurrencia con dos sesiones en
  `test_caja_concurrencia.py` + **45** tests de servicio de 7.2 (4.1: 9, 4.2: 5,
  4.3: 11, 4.4: 7, 4.5: 7, 4.6: 4, 4.7: 2). **No incluye** los tests puros de
  `test_caja_schemas.py` (7.4), que verifican el mismo contrato de validación
  que los escenarios `422`; su cantidad se confirma al implementar.
- Suite esperada tras implementar: **215 + 120 = 335 como MÍNIMO** (más los de
  `test_caja_schemas.py`), no un conteo exacto: el número real se confirma con
  `pytest --collect-only -q` al cerrar el change.

## Workflow follow-up

- Revisión humana de `design.md` + `specs/caja-pagos/spec.md` (governance
  CRITICO) antes de aplicar.
- Archivar el change con `/opsx:archive` recién cuando 8.1–8.4 estén en verde y
  la revisión esté aprobada. Al archivar solo se marca `[x]` en la línea
  Estado de C-10 en `CHANGES.md`.

> **Revisión humana de design.md/spec: CERRADA (05/11/2026).** Defaults del diseño aceptados sin respuesta de negocio: arqueo solo efectivo (D2), copago OS fuera del cobro (D28), una caja por día (D1), precios fijados por recepción, factura B o C a elección, sin control de acceso hasta C-11, facturar con caja cerrada permitido y anular con caja cerrada bloqueado (D23). Quedan registrados como preguntas abiertas en `knowledge-base/10_preguntas_abiertas.md`. Criterio del profesor: completar los changes, que funcione y respetar SDD y el flujo de Active Stack.

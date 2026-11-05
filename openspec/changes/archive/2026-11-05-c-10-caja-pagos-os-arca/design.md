# Design

## Context

Ver `proposal.md` §Why para la motivación. Estado actual del repo que condiciona
el diseño:

- **Migraciones**: `backend/alembic/versions/` tiene `001_catalogo`, `002_turno`,
  `003_lista_espera` y `004_hc_odontograma`. **Head actual: `004_hc_odontograma`.**
- **Patrones del repo**: módulo por capability en `backend/app/<capability>/` con
  `models.py`, `schemas.py`, `service.py`, `router.py`; `Base` declarativa en
  `backend/app/db.py`; servicio sin estado con `@staticmethod` que recibe
  `session` primero, valida antes de `session.add` y hace `session.flush()`
  (nunca `commit()`, que es responsabilidad del router); `session.query(...)`.
- **Estados**: columna `Text` + `CheckConstraint` nombrado y tupla de estados a
  nivel de módulo (`lista_espera/models.py: ESTADOS_LISTA`). No se usa
  `sa.Enum`.
- **Dinero**: centavos enteros (`BigInteger`), convención de C-10 y de C-09
  (`monto_centavos`), pero C-10 usa `BigInteger` por el riesgo de overflow
  (ver D18). Todo monto **declarado** (modelo, schema, migración) lleva tope
  superior `MONTO_MAX_CENTAVOS = 1_000_000_000_000` además del piso; sin el tope
  un valor absurdo puede desbordar `BigInteger` y devolver 500 en vez de 422
  (ver D20).
- **Tests**: pytest de integración contra PostgreSQL real, `db_session` con
  rollback transaccional y `TRUNCATE` de una lista fija de tablas en
  `backend/tests/conftest.py`; seed idempotente `seed_catalogo(db_session)`.
- **Sin auth**: el repo no exige token en ningún endpoint (C-11 implementa
  roles). C-10 sigue ese patrón; los campos de auditoría de usuario quedan
  nullable/omitidos y el riesgo residual se registra.

**La KB no aporta reglas de caja/cobros/OS/ARCA.** Esto es explícito y condiciona
todo el documento:

- `knowledge-base/01_vision_y_objetivos.md` §Alcance v1 lista "Caja diaria +
  Mercado Pago (QR/link) + deudores + reportes básicos", "OS argentinas:
  nomenclador, cobertura/copago, liquidación con PDF" y "Factura ARCA B/C con
  CAE+QR desde el cobro" como parte del MVP, pero sin criterios de aceptación.
- `knowledge-base/02_descripcion_general.md` §Integraciones externas marca
  Mercado Pago, ARCA y Obras sociales como "Change posterior".
- `knowledge-base/05_reglas_de_negocio.md` §Dominio: Excepciones globales contiene
  **solo** reglas de anticipación mínima, sobreturnos y datos ficticios. **No
  existe ninguna regla `RN-CA-*`, `RN-CO-*`, `RN-OS-*` ni `RN-AR-*`.**
- `knowledge-base/06_funcionalidades.md` menciona caja una sola vez, dentro del
  alcance de **US-007**: "HC mínima + odontograma, caja + MP, OS + ARCA, roles +
  multi-sucursal básico, exportación 1 clic (D3)" (línea 68). Es una mención de
  alcance, **sin criterios de aceptación ni escenarios**; el detalle de C-10 vive
  solo en `CHANGES.md` como bullet de scope.

**Verificación de citas a la KB (2026-11-03):** se contrastaron contra los
archivos reales `knowledge-base/01_vision_y_objetivos.md`,
`02_descripcion_general.md`, `03_actores_y_roles.md`,
`05_reglas_de_negocio.md`, `06_funcionalidades.md` y
`10_preguntas_abiertas.md`. Todas las citas resultaron verificables; no se
marcaron citas no verificables.

Nota sobre `CHANGES.md`: el bullet de C-10 dice "Migración: tablas caja/cobros/
liquidaciones, como siguiente revisión sobre el head vigente al implementar".
La rev. 4 del roadmap ya aclaró que el número final depende del orden de merge;
C-09 ocupó la `004`, así que C-10 usa **`005`**. Ver §Migración 005.

## Goals / Non-Goals

**Goals:**
- Un modelo mínimo y auditable de caja diaria, cobros y liquidación de OS.
- Contratos HTTP estables que C-20 (frontend) pueda consumir sin cambios.
- Integración con ARCA y Mercado Pago **siempre simulada** en C-10, marcada
  explícitamente en la respuesta (el cobro por medio y la factura por emisión,
  D8), sin llamadas de red en tests.
- Una migración encadenada correctamente sobre el head real
  (`004_hc_odontograma`).
- Tests de integración que cubran camino esperado, conflicto de negocio (409) y
  bordes.

**Non-Goals (del diseño, además del alcance del proposal):**
- Nada de roles, permisos ni auth: C-11.
- Nada de frontend: C-20.
- Nada de nomenclador canónico de OS ni validación contra una tabla externa de
  obras sociales: se guarda el código informado (`Q-C10-03`).
- Nada de generación real de PDF: se registra una referencia simulada
  (`Q-C10-06`).
- Nada de integración real con ARCA/MP: en C-10 siempre se simula, con o sin
  credenciales (D8); el camino real queda fuera del alcance y de los tests.
- Nada de multi-sucursal ni reportes avanzados: C-11.

## Modelo de datos

Tres tablas nuevas, todas con PK `Uuid` y `default=uuid.uuid4`, FKs
`<entidad>_id`, y timestamps `timestamptz`. Dinero en centavos enteros, con piso
y tope `MONTO_MAX_CENTAVOS` en toda columna declarada (D20).

### `caja`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK, `default=uuid.uuid4` |
| `fecha` | date | NOT NULL, UNIQUE (una caja por día) |
| `monto_apertura_centavos` | BigInteger | NOT NULL, `CheckConstraint("monto_apertura_centavos BETWEEN 0 AND 1000000000000", name="monto_apertura_rango")` |
| `abierto_en` | timestamptz | NOT NULL, seteado desde `ahora` en el servicio (D21); `server_default=text("now()")` solo respaldo |
| `cerrado_en` | timestamptz | NULL (se setea desde el reloj inyectable, D21) |
| `monto_cierre_contado_centavos` | BigInteger | NULL, CHECK `monto_cierre_contado_centavos BETWEEN 0 AND 1000000000000` cuando no nulo (`monto_contado_rango`) |
| `monto_esperado_centavos` | BigInteger | NULL (calculado al cerrar; CHECK `>= 0`, sin tope superior porque es una suma derivada, ver D20) |
| `diferencia_centavos` | BigInteger | NULL (contado − esperado; puede ser negativa, sin CHECK de rango) |
| `estado` | text | NOT NULL, default `abierta`, CHECK `estado IN ('abierta','cerrada')` (`estado_caja_valido`) |

Índice: **ninguno propio sobre `fecha`**. El `UNIQUE(fecha)` ya crea el índice
que sirve para la consulta por fecha, y el `ix_caja_fecha` que figuraba en la
ronda anterior era redundante: se elimina del modelo y de la migración.
Sin FK a usuario (C-11 pendiente).

### `cobro`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `caja_id` | uuid | NOT NULL, FK → `caja.id` `ondelete=RESTRICT` |
| `turno_id` | uuid | NULL, FK → `turnos.id` `ondelete=RESTRICT` (seña/saldo opcional; ver D16) |
| `medio` | text | NOT NULL, CHECK `medio IN ('efectivo','tarjeta','transferencia','mercado_pago','obra_social')` (`medio_cobro_valido`) |
| `concepto` | text | NOT NULL, default `total`, CHECK `concepto IN ('sena','saldo','total')` (`concepto_cobro_valido`) |
| `monto_centavos` | BigInteger | NOT NULL, `CheckConstraint("monto_centavos BETWEEN 1 AND 1000000000000", name="monto_cobro_rango")` |
| `estado` | text | NOT NULL, default `registrado`, CHECK `estado IN ('registrado','anulado')` (`estado_cobro_valido`) |
| `motivo_anulacion` | text | NULL |
| `anulado_en` | timestamptz | NULL (desde el reloj inyectable, D21) |
| `referencia_externa` | text | NULL (id de pago MP / referencia; NO se reutiliza para ARCA) |
| `factura_tipo` | text | NULL (B/C emitida) |
| `factura_cae` | text | NULL (prefijo `SIM-` en C-10) |
| `factura_qr` | text | NULL |
| `facturado_en` | timestamptz | NULL (desde el reloj inyectable, D21) |
| `simulado` | boolean | NOT NULL, default `false`. Flag **por medio**, fijado al crear el cobro e inmutable (D8): `true` solo para `mercado_pago`; `false` para efectivo/tarjeta/transferencia/obra_social. `facturar_arca` **no** lo modifica. |
| `creado_en` | timestamptz | NOT NULL, seteado desde `ahora` en el servicio (D21); `server_default=text("now()")` solo respaldo |

Índices `ix_cobro_caja` sobre `(caja_id)` y `ix_cobro_turno` sobre `(turno_id)`.

### `liquidacion_os`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `cobro_id` | uuid | NOT NULL, FK → `cobro.id` `ondelete=RESTRICT`, UNIQUE (una liquidación por cobro OS) |
| `nomenclador_codigo` | text | NOT NULL |
| `descripcion` | text | NULL |
| `monto_total_centavos` | BigInteger | NOT NULL, CHECK `monto_total_centavos BETWEEN 0 AND 1000000000000` (`monto_total_liquidacion_rango`) |
| `cobertura_centavos` | BigInteger | NOT NULL, default 0, CHECK `cobertura_centavos BETWEEN 0 AND 1000000000000` (`cobertura_liquidacion_rango`) **y** CHECK `cobertura_centavos <= monto_total_centavos` (`cobertura_no_excede_total`) |
| `copago_centavos` | BigInteger | NOT NULL, default 0, CHECK `copago_centavos BETWEEN 0 AND 1000000000000` (`copago_liquidacion_rango`) **y** CHECK `copago_centavos = monto_total_centavos - cobertura_centavos` (`copago_consistente`) |
| `estado` | text | NOT NULL, default `pendiente`, CHECK `estado IN ('pendiente','liquidada','pagada','anulada')` (`estado_liquidacion_valido`) |
| `pdf_referencia` | text | NULL (ruta/URL simulada o real) |
| `creado_en` | timestamptz | NOT NULL, seteado desde `ahora` en el servicio (D21); `server_default=text("now()")` solo respaldo |

Índice `ix_liquidacion_os_creado` sobre `(creado_en)`.

## Decisiones de diseño (no son reglas de la KB)

Ninguna de estas decisiones se apoya en una regla de negocio existente; se toman
para que el change sea implementable y coherente con el repo. Cambiarlas implica
revisar este documento y, en los casos marcados, una migración.

| # | Decisión | Alternativa rechazada | Justificación |
|---|---|---|---|
| **D1** | `Caja` es **una por día** (`fecha` UNIQUE), con apertura y cierre explícitos. | Caja por turno o por profesional/sucursal. | `CHANGES.md` dice "apertura/cierre diario, arqueo". Una por día simplifica el arqueo y matchea el flujo de recepción. El alcance multi-sucursal se decide en `Q-C10-05`. |
| **D2** | El arqueo calcula `monto_esperado_centavos = apertura + sum(cobros en efectivo registrados y no anulados de esa caja)`; `diferencia = contado − esperado`. Los cobros con otros medios (tarjeta, transferencia, MP, OS) no ingresan al cajón y se devuelven como `totales_por_medio_centavos` (informativo). Los cobros anulados no suman en **ninguno** de los dos (`monto_esperado` ni `totales_por_medio_centavos`). En un cobro `obra_social`, `monto_centavos` es el **total de la prestación**: `totales_por_medio_centavos["obra_social"]` suma ese total, **no** la cobertura; el copago del paciente no se modela como cobro en C-10 (`Q-C10-14`). | Esperado informado por el usuario o suma de todos los medios; sumar solo la cobertura en el total de OS. | El esperado derivado de los cobros en efectivo es la única fuente de verdad del arqueo; informarlo a mano o mezclar medios invita a error. El total de la prestación es el importe realmente facturado, así que es el número que debe ver el arqueo; descomponerlo en cobertura/copago generaría un cobro que nadie pagó en el mostrador. Ver `Q-C10-10` y `Q-C10-14`. |
| **D3** | `Cobro.caja_id` es **obligatorio**: todo cobro se registra contra una caja abierta. | Cobro sin caja (caja opcional). | La caja diaria es el contenedor natural del flujo; un cobro fuera de caja rompe el arqueo. Si no hay caja abierta → 409 `caja_no_abierta`. |
| **D4** | `Cobro.turno_id` es **opcional** (`RESTRICT`, ver D16): la seña se vincula a un turno cuando existe, o se registra como cobro independiente. | FK obligatoria a `turnos`. | C-10 depende solo de C-03 y no de C-08 (reserva online). Obligar la FK bloquearía cobros sin turno (venta de productos, pagos a cuenta). Ver `Q-C10-04`. |
| **D5** | `concepto` es un texto acotado (`sena`/`saldo`/`total`) con CHECK. | Sin concepto (todo es "pago"). | El frontend (C-20) y la trazabilidad de señas necesitan distinguir la intención del cobro. Default `total` para no obligar el campo. |
| **D6** | Anulación es **cambio de estado** (`registrado → anulado`) con `motivo_anulacion` obligatorio y `anulado_en`; la fila se conserva. | Hard delete del cobro. | Regla dura del proyecto: nunca hard delete de turnos; se extiende por coherencia a cobros. El arqueo excluye anulados. |
| **D7** | Medios de pago como **texto + CHECK** (`medio_cobro_valido`), no enum. | `sa.Enum`. | Patrón del repo (C-06, C-09): estados como Text + CheckConstraint nombrado. |
| **D8** | **`simulado` es un flag por medio, no un modo global.** Se fija al crear el cobro según `MEDIOS_SIMULADOS = frozenset({"mercado_pago"})` y es **inmutable**: `mercado_pago` → `simulado=true` con `referencia_externa = "SIM-MP-<uuid>"`; `efectivo`, `tarjeta`, `transferencia` y `obra_social` → `simulado=false` (no hay gateway externo en juego). `CobroOut` expone solo `simulado: bool`, **no** expone `modo`. La emisión ARCA tiene su propio marcado, fuera del cobro: `FacturaArcaOut.simulado=true` y `FacturaArcaOut.modo="simulado"`, ambas constantes en C-10 (`MODO_ARCA_SIMULADO`). `facturar_arca` **no muta** `cobro.simulado`; la marca durable de la simulación de la factura es el prefijo `SIM-` del CAE (no se agrega columna nueva). | `simulado=true` en toda respuesta (incluido efectivo), o `modo` por cobro, o `facturar_arca` seteando `cobro.simulado=true`. | Un flag global `true` contradice el caso real: un cobro en efectivo no tiene nada simulado. Separar el flag del cobro (medio) del de la factura (emisión) elimina la ambigüedad, evita escribir `simulado` dos veces con significados distintos y deja el contrato estable para C-20. Ver `Q-C10-11`. |
| **D9** | ARCA: en C-10 la emisión es siempre simulada con prefijo `SIM-` para CAE y QR. **No se lee ninguna credencial** (`ARCA_CERT`, `ARCA_KEY`, `ARCA_CUIT`, `ARCA_PTO_VTA`) desde código de producción: el comportamiento es idéntico con o sin ellas. Si en el futuro hiciera falta conocer su presencia, se haría con una función que devuelve **solo un booleano** (`credenciales_presentes() -> bool`), nunca los valores. El contrato (CAE + QR) queda estable para C-20. | Implementar el webservice real; o leer las variables de entorno y ramificar según su presencia. | El webservice ARCA real requiere certificado y entorno de homologación; fuera del alcance y de los tests. Leer variables que no se usan agrega superficie de fuga de secretos (logs, trazas, `repr` de config) sin beneficio: si el resultado no cambia, no hay motivo para leerlas. Ver `Q-C10-11`. |
| **D10** | MP: en C-10 el cobro con medio `mercado_pago` registra una referencia simulada con prefijo `SIM-MP-`; **`MP_ACCESS_TOKEN` no se lee** desde código de producción. | SDK de MP real en tests; leer el token para "verificar configuración". | Tests sin red y sin dependencia de credenciales; el contrato queda estable. Ver `Q-C10-11` y D9. |
| **D11** | `LiquidacionOS` se crea **automáticamente** al registrar un cobro con medio `obra_social`, usando los datos OS del request (`nomenclador_codigo`, `cobertura_centavos`) y `monto_centavos` como total de la prestación. | Endpoint `POST /liquidaciones-os` separado. | `CHANGES.md` solo lista `GET /liquidaciones-os`; un endpoint de alta separado duplicaría la creación. El cobro OS es el disparador natural. |
| **D12** | Cobertura/copago: `copago_centavos = monto_total − cobertura_centavos`; se valida `0 <= cobertura <= total`. **La validación primaria vive en el schema** (`CobroCreate.model_validator(mode="after")` → `422` de Pydantic antes de tocar la base); el servicio repite la comprobación como defensa y lanza `CoberturaInvalida`, que el router mapea a **422** (nunca 500). Además, la base **garantiza** la coherencia con dos CHECK: `cobertura_centavos <= monto_total_centavos` (`cobertura_no_excede_total`) y `copago_centavos = monto_total_centavos - cobertura_centavos` (`copago_consistente`), cubiertos por un test de modelo. El nomenclador es un **código informado** (`nomenclador_codigo` NOT NULL), no se valida contra tabla. | Validar solo en el servicio y dejar que `IntegrityError`/CHECK produzca 500; tabla `nomenclador_os` con códigos canónicos; porcentaje de cobertura calculado. | No hay nomenclador en la KB ni en el repo; C-10 lo define como código informado (`Q-C10-03`). Validar el rango en el borde de la API da 422 determinista y el chequeo del servicio cubre los usos directos del servicio en tests. Los CHECK son la última barrera: un `UPDATE` futuro que rompa la relación entre los tres montos no puede persistirse. |
| **D13** | PDF: se registra `pdf_referencia` con la ruta simulada `SIM-liquidacion-{id}.pdf` y se marca como generado; la generación real queda fuera (`Q-C10-06`). | Generar PDF con librería. | No hay librería de PDF en las dependencias; agregarla es una decisión de infraestructura. El contrato (referencia descargable) queda estable. |
| **D14** | `LiquidacionOS.cobro_id` es UNIQUE: una liquidación por cobro OS. | Varias liquidaciones por cobro. | Un cobro OS representa un acto de liquidación; duplicarlo sería doble contabilización. |
| **D15** | Sin matriz de transiciones de estado de liquidación: C-10 crea liquidaciones en estado `pendiente`; la **única** transición implementada es `pendiente → anulada` cuando se anula el cobro OS (D27). Los valores `liquidada`/`pagada` permanecen en el CHECK, pero su transición no se implementa en este change. | Máquina de estados. | La KB no define el ciclo; inventarlo excede el scope. Se valida pertenencia al set. Anotado en `Q-C10-07`. |
| **D16** | FKs a `pacientes`/`profesionales` no aplican (no se referencian); FK a `turnos` con **`RESTRICT`** y a `caja`/`cobro` con **`RESTRICT`**. | `SET NULL` en `cobro.turno_id`; `CASCADE` en cobro→caja. | `SET NULL` borraría en silencio el vínculo turno↔cobro (el cobro quedaría huérfano de contexto sin dejar rastro), que contradice el principio de no borrado silencioso del proyecto. `RESTRICT` obliga a decidir explícitamente antes de borrar; cancelar es la transición a cancelado (RN-ES-01), así que la restricción no bloquea ningún flujo real. `CASCADE` en cobro→caja borraría cobros con su caja. |
| **D17** | Módulo único `backend/app/caja/` (no se separa `pagos/`, `os/`, `arca/`). | Un módulo por subdominio. | Las tablas se referencian entre sí (liquidación depende de cobro, cobro de caja); un módulo por capability (patrón del repo) evita fragmentación. |
| **D18** | Dinero en **`BigInteger`** en todas las columnas de monto (`*_centavos`), en modelo y migración. | `Integer` (convención de C-09). | `Integer` de 32 bits desborda cerca de 21 millones de pesos y devuelve 500; los montos acumulados de caja (apertura + cobros) pueden superar ese umbral. Se justifica distinto de C-09, cuyos montos son por turno y no acumulan. |
| **D19** | Concurrencia: **orden global de locks `caja → cobro → liquidacion_os`**, siempre con `with_for_update()` (bloqueo de fila, no de tabla). `cerrar` y `registrar_cobro` bloquean la **caja** antes de validar estado/insertar. `anular_cobro` lee `cobro.caja_id` sin lock para conocer el orden, bloquea la **caja**, luego bloquea el **cobro** y **relee** su estado después del lock; si el cobro es OS, bloquea **también** la `liquidacion_os` para pasarla a `anulada` (D27). `facturar_arca` bloquea solo el **cobro** (la factura no toca montos ni estado del cobro, así que no necesita la caja). **Verificación de concurrencia:** tarea 7.5, con **dos sesiones reales** commiteadas (`test_caja_concurrencia.py`) para doble anulación y cobro-vs-cierre. Un test con dos sesiones **no** es viable sobre `db_session`: esa fixture usa una única conexión con rollback y sus datos sin commit no son visibles desde otra conexión (y el lock de fila quedaría esperando el commit del propio test). Por eso 7.5 usa `_db_engine` con `commit()` y limpieza explícita; si en la práctica resulta no determinista, se elimina el test y el riesgo queda **declarado como no testeado** en §Riesgos (nunca se deja un test flaky). | Mitigación solo con FK RESTRICT; bloquear solo el cobro en `anular_cobro`; bloquear caja y cobro en `facturar_arca`. | La FK RESTRICT no evita cobros sobre una caja que se cierra concurrentemente ni dos facturas/anulaciones simultáneas sobre el mismo cobro. Un orden fijo de adquisición evita deadlocks entre `cerrar` (caja) y `anular_cobro` (caja+cobro). `facturar_arca` no toca montos ni estado: el lock del cobro solo serializa la doble emisión. |
| **D20** | **Tope de montos**: constante `MONTO_MAX_CENTAVOS = 1_000_000_000_000` (10^12 centavos ≈ 10.000 millones de pesos), aplicada como `le=` en todo schema de entrada y como CHECK `BETWEEN piso AND 1000000000000` en toda columna de monto declarada (apertura, contado, `monto_centavos`, `monto_total`, `cobertura`, `copago`). Los derivados (`monto_esperado_centavos`, `diferencia_centavos`) no llevan tope: `esperado = apertura + suma de cobros en efectivo` queda acotado a `10^12 × (1 + n)` que, para el volumen diario de una caja, está órdenes de magnitud por debajo del máximo de `BigInteger` (9.223.372.036.854.775.807). | Dejar solo `ge`/`>= 0` y confiar en `BigInteger`. | Sin tope, un monto absurdo desborda `BigInteger` en el `INSERT`/`UPDATE` y el cliente recibe 500 en vez de 422, violando la regla dura "nunca 500 ante input inválido". El tope hace el fallo determinista y documentado. |
| **D21** | **Reloj inyectable**: `backend/app/caja/reloj.py` expone `ahora_local() -> datetime` (`datetime.now(ZONA)`) y `hoy_local(ahora: datetime \| None = None) -> date`, **importando `ZONA` de `backend.app.turnos.service`** (definida ahí, línea 27: `ZONA = ZoneInfo("America/Argentina/Buenos_Aires")`); **no** se redefine en el módulo nuevo. El servicio recibe `ahora: datetime \| None = None` (keyword-only) en `abrir`, `cerrar`, `registrar_cobro`, `obtener_por_fecha`, `anular_cobro` y `facturar_arca`; si es `None` usa `ahora_local()`. El router expone `get_ahora()` como dependencia FastAPI, inyectada en **`POST /caja/abrir`, `POST /caja/cerrar`, `POST /cobros`, `GET /caja`, `POST /cobros/{id}/anular` y `POST /cobros/{id}/factura-arca`**, y los tests la reemplazan con `app.dependency_overrides[get_ahora] = lambda: datetime(2026, 11, 3, 23, 30, tzinfo=ZONA)`. La lógica de negocio **no llama** `datetime.now()` directamente; `fecha` de la caja, `abierto_en`, `cerrado_en`, `creado_en` (caja, cobro, liquidacion_os), `anulado_en` y `facturado_en` salen de `ahora`. `server_default=text("now()")` queda solo como respaldo para inserciones directas a la base. | Leer `datetime.now()` dentro del servicio y mockear `datetime` con `monkeypatch`; redefinir `ZONA` en `caja/reloj.py`. | Sin inyección, el escenario de las 23:30 hora local solo es testeable esperando la hora real o parcheando globalmente el módulo `datetime`, que es frágil. La dependencia deja el escenario determinista y no ensucia el resto de la API. Reutilizar `ZONA` de `turnos.service` evita dos definiciones que puedan divergir (ver D29 para el alcance completo). Setear `abierto_en` y `creado_en` desde `ahora` (y no desde `server_default now()`, que devuelve el inicio de la transacción) hace determinista el orden descendente del listado cuando dos liquidaciones se crean en el mismo test: se pasan dos instantes distintos. |
| **D22** | **Campos OS**: `nomenclador_codigo` y `cobertura_centavos` solo son válidos con `medio="obra_social"`. `CobroCreate.model_validator(mode="after")`: con `medio="obra_social"`, `nomenclador_codigo` es obligatorio (422 si falta) y `cobertura_centavos` (default 0) debe cumplir `0 <= cobertura <= monto_centavos` (422 si no); con cualquier otro medio, enviar cualquiera de los dos campos → **422** cuyo `detail` es una **lista de errores de validación de Pydantic** (no `{"causa": ...}`), con el mensaje `campos_os_no_aplicables`. El rechazo vive **solo** en el schema: no hay excepción `CamposOsNoAplicables` en el servicio ni en el router. Los datos OS **no** se persisten en `cobro`: viven en `liquidacion_os`. | Ignorar silenciosamente los campos OS cuando el medio no es `obra_social` (patrón `extra="ignore"`). | Ignorar datos que el cliente creyó relevantes esconde errores de integración y deja una liquidación que nunca se creó. Rechazar con 422 es explícito y coherente con "422 = input inválido". Al vivir en el schema, la respuesta es la de Pydantic (lista de errores) y no se duplica la regla en el servicio. |
| **D23** | **Cobro con caja cerrada no se anula**: `anular_cobro` devuelve **409** `{"causa": "caja_cerrada"}` si la caja del cobro está `cerrada`. | Permitir la anulación y recalcular el arqueo del cierre. | El arqueo de `caja` es un **snapshot inmutable** del cierre (`monto_esperado_centavos`, `diferencia_centavos`); anular después lo dejaría desincronizado sin rastro de la corrección. La corrección legítima (reapertura o cobro de ajuste) queda fuera de C-10: `Q-C10-12`. |
| **D24** | **Cobro de obra social no se factura en C-10**: `facturar_arca` sobre un cobro con `medio="obra_social"` devuelve **409** `{"causa": "medio_no_facturable"}`. | Permitir factura B/C de un cobro OS. | El pagador es la OS, no el paciente: la factura al paciente no corresponde y la factura a la OS depende del nomenclador y del circuito de liquidación (`Q-C10-03`), que C-10 no modela. Se registra como `Q-C10-13`. |
| **D25** | **`modo` solo existe en la respuesta de factura**: `CobroOut` expone `simulado: bool` y **no** expone `modo`; `FacturaArcaOut` expone `simulado: bool` (siempre `true` en C-10) y `modo: str` (siempre `"simulado"` en C-10). | `modo` en ambos contratos o en ninguno. | Evita dos fuentes de verdad para el mismo concepto: el cobro dice si su medio fue simulado; la factura dice en qué modo se emitió. Ver D8. |
| **D26** | **Cobro facturado no se anula**: `anular_cobro` devuelve **409** `{"causa": "cobro_facturado"}` (excepción de dominio `CobroFacturado`) si el cobro ya tiene `factura_cae`. Orden de precedencia de los rechazos de anulación: **`cobro_ya_anulado` → `caja_cerrada` → `cobro_facturado`**. | Permitir la anulación y "anular" también la factura; o devolver 409 `cobro_ya_facturado` reutilizando la excepción de la segunda emisión. | La factura ya existe como comprobante emitido: anular el cobro dejaría un CAE huérfano apuntando a un pago anulado. Bloquearlo debe ser explícito y con una causa propia, distinguible de "segunda emisión" (`cobro_ya_facturado`), porque la acción y la corrección son distintas (nota de crédito, fuera de C-10). La precedencia respeta el orden en que el operador necesita entender el estado: primero "ya está anulado", después "la caja está cerrada", después "tiene factura". |
| **D27** | **Anulación de cobro de obra social anula la liquidación**: en la misma transacción, `LiquidacionOS.estado` pasa a `"anulada"` cuando se anula su cobro; `"anulada"` se agrega a `ESTADOS_LIQUIDACION` y al CHECK `estado_liquidacion_valido`. `GET /liquidaciones-os` sigue listándola, con su estado. La liquidación se bloquea después del cobro (orden `caja → cobro → liquidacion_os`, D19). | Borrar la liquidación; dejarla en `pendiente`; anularla en una transacción aparte. | Si el cobro que la originó está anulado, una liquidación `pendiente` seguiría reclamándose a la OS por un acto que ya no existe: es un error contable. Borrarla contradice el no-borrado silencioso y perdería la traza. Hacerlo en otra transacción permitiría un cobro anulado con liquidación viva si la segunda falla. Se lista igual para que la OS y el arqueo vean el ciclo completo. |
| **D28** | **El copago del paciente no se modela en C-10**: en un cobro `obra_social`, `monto_centavos` es el **total de la prestación** y `totales_por_medio_centavos["obra_social"]` suma ese total. El copago (`monto_total − cobertura`) solo aparece como campo derivado de `liquidacion_os`; **no** genera un cobro ni entra en el arqueo. | Crear automáticamente un segundo cobro (medio efectivo) por el copago; o guardar el copago como cobro parcial del mismo turno. | No hay regla en la KB sobre cómo cobra el copago la recepción (¿efectivo en el mostrador? ¿se factura al paciente? ¿lo paga después?), ni cómo entra al arqueo. Inventarlo generaría un cobro que puede no haberse cobrado nunca. Se registra como `Q-C10-14` y se deja el número visible en la liquidación, que es el dato verificable. |
| **D29** | **Alcance del reloj inyectable**: además de D21, `registrar_cobro` y `obtener_por_fecha` reciben `ahora` (keyword-only, default `None`) y el router inyecta `get_ahora()` también en **`POST /cobros`** y **`GET /caja`**. Un cobro **sin `caja_id`** busca la caja abierta de **hoy** con `hoy_local(ahora)`, no con la fecha UTC del servidor. `reloj.py` importa `ZONA` de `backend.app.turnos.service` (línea 27) y no la redefine. | Dejar `POST /cobros` y `GET /caja` con la fecha del servidor y solo inyectar el reloj en apertura/cierre. | El servidor corre en UTC: a las 23:30 de Buenos Aires ya es el día siguiente en UTC, y un cobro sin `caja_id` buscaría la caja de un día que todavía no abrió (o la de mañana), devolviendo 409 `caja_no_abierta` con la caja abierta a la vista. La fecha local es la única correcta para un negocio que cierra a las 23:30. |
| **D30** | **`POST /caja/abrir` no acepta `fecha`**: la fecha sale siempre de `hoy_local(ahora)`. | Aceptar `fecha` y validar que sea igual a `hoy_local` (422 si no). | Es la opción **más simple**: sin parámetro no hay rama de validación, no hay mensaje de error nuevo y no existe el caso "abrir la caja de ayer/mañana", que nadie pidió y que además rompería el arqueo (cobros de hoy contra una caja de ayer). La fecha sigue siendo determinista y testeable por el reloj inyectable (D21). `POST /caja/cerrar` conserva `fecha` opcional porque ahí sí sirve para operar sobre una caja que quedó abierta (`Q-C10-15`). |
| **D31** | **Los tests no hacen llamadas de red, con mecanismo concreto**: una fixture de los tests de caja reemplaza `urllib.request.urlopen`, `httpx.HTTPTransport.handle_request`, `httpx.AsyncHTTPTransport.handle_async_request` y, si el paquete `requests` está instalado, `requests.sessions.Session.send`, por funciones que **fallan el test** si se las llama. Se parchea a nivel de **transporte** (no `httpx.Client.send`), porque `TestClient` hereda de `httpx.Client` y parchear `Client.send` rompería el cliente de tests; `TestClient` usa su propio transporte. No se parchea `socket` porque Postgres lo usa. Además, se verifica que `backend/app/caja` no importe `httpx`, `requests` ni `urllib.request`. Cualquier test de API que pase bajo la fixture prueba que `TestClient` sigue funcionando. | Parchear `socket`; confiar solo en un `monkeypatch` de las credenciales; no verificar nada y documentarlo. | Parchear `socket` rompe todas las conexiones, incluida la de Postgres, así que el test no podría ni empezar. Un mecanismo que solo "no configura credenciales" no prueba ausencia de red: el código podría igual intentar una llamada. Fallar en la llamada convierte una fuga de red en un test rojo determinista. Parchear a nivel de transporte evita romper `TestClient`, que hereda de `httpx.Client`. |

## API

| Método | Ruta | Éxito | Notas |
|---|---|---|---|
| POST | `/caja/abrir` | 201 | **sin** `fecha` (siempre `hoy_local`, D30), `monto_apertura_centavos`, `get_ahora()` |
| POST | `/caja/cerrar` | 200 | `fecha` opcional (default hoy en `ZONA`) + `monto_cierre_contado_centavos`; devuelve arqueo |
| GET | `/caja/{id}` | 200 | 404 si no existe |
| GET | `/caja?fecha=` | 200 | caja del día (`fecha` default `hoy_local(get_ahora())`, D29); `404` si no existe caja para esa fecha (recurso único por fecha) |
| POST | `/cobros` | 201 | `caja_id` implícito (caja abierta de `hoy_local(get_ahora())`) o explícito; ver `Q-C10-08` |
| GET | `/cobros/{id}` | 200 | 404 si no existe |
| POST | `/cobros/{id}/anular` | 200 | `motivo` obligatorio |
| POST | `/cobros/{id}/factura-arca` | 201 | `tipo` (B/C); devuelve CAE + QR |
| GET | `/liquidaciones-os` | 200 | listado ordenado por `creado_en` desc |

**9 endpoints** (incluyendo las tres de consulta: caja por id, caja por fecha y cobro por id). El número exacto de rutas registradas se verifica en la tarea de router (`len(router.routes)`).

Semántica de consulta de caja del día: si no se envía `fecha`, se usa la fecha
local del día en `ZONA` (el servidor corre en UTC), obtenida del **reloj
inyectable** (`hoy_local(get_ahora())`, D21/D29). Si no hay caja para esa fecha
→ `404`, porque la caja es un recurso único por fecha (no una lista). La
convención difiere de C-09 (donde un listado vacío es `200` y un recurso
inexistente es `404`): aquí es un único recurso por fecha.

Contratos de salida relevantes para C-20:

- `CobroOut`: `id`, `caja_id`, `turno_id`, `medio`, `concepto`,
  `monto_centavos`, `estado`, `motivo_anulacion`, `anulado_en`,
  `referencia_externa`, `factura_tipo`, `factura_cae`, `factura_qr`,
  `facturado_en`, `simulado` (por medio, D8) y `creado_en`. **Sin** `modo`.
- `FacturaArcaOut`: `cobro_id`, `tipo`, `cae`, `qr`, `simulado` (siempre `true`
  en C-10) y `modo` (siempre `"simulado"` en C-10). Ver D25.
- `CajaOut`: campos de la tabla + `totales_por_medio_centavos` (informativo;
  excluye anulados y suma el total del cobro OS, no la cobertura, D2/D28).

### Mapeo de errores

| Situación | Código | `detail` |
|---|---|---|
| Caja inexistente | 404 | `caja no existe: <id>` |
| Cobro inexistente | 404 | `cobro no existe: <id>` |
| Turno referenciado inexistente | 404 | `turno no existe: <id>` |
| Apertura duplicada el mismo día | 409 | `{"causa": "caja_ya_abierta", "detalle": ...}` |
| Cierre sin caja abierta | 409 | `{"causa": "caja_no_abierta", "detalle": ...}` |
| Cierre de caja ya cerrada | 409 | `{"causa": "caja_ya_cerrada", "detalle": ...}` |
| Cobro sin `caja_id` y sin caja abierta hoy | 409 | `{"causa": "caja_no_abierta", "detalle": ...}` |
| Cobro con `caja_id` explícito **cerrada** | 409 | `{"causa": "caja_no_abierta", "detalle": ...}` |
| Anulación de cobro ya anulado | 409 | `{"causa": "cobro_ya_anulado", "detalle": ...}` |
| Anulación de cobro cuya caja está cerrada | 409 | `{"causa": "caja_cerrada", "detalle": ...}` (D23) |
| Anulación de cobro ya facturado | 409 | `{"causa": "cobro_facturado", "detalle": ...}` (D26) |
| Factura sobre cobro anulado | 409 | `{"causa": "cobro_anulado", "detalle": ...}` |
| Factura sobre cobro con medio `obra_social` | 409 | `{"causa": "medio_no_facturable", "detalle": ...}` (D24) |
| Segunda emisión de factura | 409 | `{"causa": "cobro_ya_facturado", "detalle": ...}` |
| `monto_*` negativo o cero donde se exige positivo | 422 | validación Pydantic (`ge`/`gt`) / CHECK |
| `monto_*` por encima de `MONTO_MAX_CENTAVOS` | 422 | validación Pydantic (`le`) / CHECK (D20) |
| `medio` fuera del set | 422 | validación Pydantic / CHECK |
| `concepto` fuera del set | 422 | validación Pydantic / CHECK |
| `tipo` de factura fuera de {B,C} | 422 | validación Pydantic |
| `cobertura_centavos` fuera de `[0,total]` | 422 | `model_validator` de `CobroCreate`; como defensa `CoberturaInvalida` en el servicio; CHECK `cobertura_no_excede_total` (D12) |
| Campos OS con `medio != "obra_social"` | 422 | **lista de errores de Pydantic** (`detail` en lista, no `{"causa": ...}`) cuyo mensaje menciona `campos_os_no_aplicables`; solo en `model_validator` (D22) |
| `nomenclador_codigo` ausente con `medio = "obra_social"` | 422 | validación Pydantic (lista de errores) |
| `motivo` de anulación ausente/vacío | 422 | validación Pydantic |

Criterio: **el conflicto de negocio nunca devuelve 200 ni 500**. El 409 se
detecta antes del `INSERT` (consulta de existencia/estado) y, además, la base lo
garantiza con UNIQUE/CHECK; si la carrera igual llega al `INSERT`, el servicio
traduce `IntegrityError` a la excepción de dominio correspondiente → 409.

Aclaración sobre los `caja_id`: un **`caja_id` explícito inexistente** es un
recurso que no existe → **404**; "no hay caja abierta hoy" y "la caja explícita
está cerrada" son conflictos de negocio → **409** `caja_no_abierta`.

### Servicio

`ServicioCaja` con `@staticmethod` y `session` primero: `abrir`, `cerrar`,
`obtener`, `obtener_por_fecha`, `registrar_cobro`, `obtener_cobro`, `anular_cobro`,
`facturar_arca`, `listar_liquidaciones`. `abrir`, `cerrar`, `registrar_cobro`,
`obtener_por_fecha`, `anular_cobro` y `facturar_arca` aceptan `ahora` como
keyword-only (default `None`, D21/D29). Validaciones antes de `session.add`;
`session.flush()`, nunca `commit()`.

Concurrencia (D19): orden global de locks **`caja → cobro → liquidacion_os`**,
siempre con `with_for_update()`:

- `cerrar` y `registrar_cobro`: bloquean la **caja** antes de validar
  estado/insertar. Protege "cobro que entra mientras la caja se cierra" y
  "doble cierre/apertura".
- `anular_cobro`: lee `cobro.caja_id` sin lock para conocer el orden, bloquea la
  **caja**, bloquea el **cobro** y **relee** su estado después del lock; si el
  cobro es de obra social, bloquea también la **liquidación** y la pasa a
  `anulada` (D27). Protege doble anulación, anulación concurrente con facturación
  y anulación contra una caja que se está cerrando (→ 409 `caja_cerrada`, D23).
- `facturar_arca`: bloquea **solo el cobro**. Protege la doble emisión (sin
  constraint UNIQUE sobre `factura_cae`, el lock es la única serialización).
  No bloquea la caja porque la factura no altera montos ni estado del cobro.

Precedencia de rechazos en `anular_cobro` (D26): `cobro_ya_anulado` →
`caja_cerrada` → `cobro_facturado`.

Excepciones de dominio en el módulo (`CajaNoEncontrada`, `CajaYaAbierta`,
`CajaNoAbierta`, `CajaYaCerrada`, `CajaCerrada`, `CobroNoEncontrado`,
`CobroYaAnulado`, `CobroAnulado`, `CobroYaFacturado`, **`CobroFacturado`**,
`MedioNoFacturable`, `TurnoNoEncontrado`, `MontoInvalido`, `MedioInvalido`,
`TipoFacturaInvalido`, `CoberturaInvalida`, `MotivoRequerido`) y traducción a
`HTTPException` en el router. Mapeo explícito: `TurnoNoEncontrado` → **404**,
`CoberturaInvalida` → **422**, `MedioNoFacturable`/`CajaCerrada`/
`CobroFacturado` → **409**. `CamposOsNoAplicables` **no** existe como excepción:
ese rechazo vive solo en el `model_validator` del schema (D22).

El arqueo y los totales se calculan en la lectura/cierre; no se persisten
columnas derivadas salvo `monto_esperado_centavos` y `diferencia_centavos` en
`caja` al cerrar (snapshot del cierre). `CajaOut` incluye
`totales_por_medio_centavos` (mapeo medio → centavos) calculado a partir de los
cobros registrados y no anulados, con fines informativos; el cobro `obra_social`
aporta su `monto_centavos` completo (total de la prestación, no la cobertura,
D2/D28) y el copago no aparece como medio.

## Credenciales y modo simulado

- **No se lee ninguna credencial en C-10.** `MP_ACCESS_TOKEN` y las variables
  ARCA (`ARCA_CERT`, `ARCA_KEY` o certificado combinado, `ARCA_CUIT`,
  `ARCA_PTO_VTA`) **no** se consultan desde código de producción: no hay
  `os.environ.get(...)` ni `os.getenv(...)` en `backend/app/caja/`. Leer una
  variable que no se usa agrega superficie de fuga (logs, trazas, `repr`) sin
  cambiar el resultado.
- Si en el futuro hace falta saber si están presentes, se hará con una función
  que devuelve **solo un booleano** (`credenciales_presentes() -> bool`), nunca
  los valores. En C-10 no existe.
- Los tests que necesitan "variables presentes" las setean ellos mismos
  (`monkeypatch.setenv`) para probar que no se filtran; el código de producción
  no participa.
- **Qué se marca como simulado (D8, regla única):**
  - `Cobro.simulado` → `true` **solo** con `medio="mercado_pago"`
    (`referencia_externa` con prefijo `SIM-MP-`). `efectivo`, `tarjeta`,
    `transferencia` y `obra_social` → `simulado=false`.
  - `FacturaArcaOut` → `simulado=true` y `modo="simulado"`, **siempre** en C-10,
    sin importar si las credenciales están presentes. Marca durable: prefijo
    `SIM-` en `cae`.
  - `facturar_arca` **no** modifica `cobro.simulado`.
  - La liquidación OS no usa `simulado`: su simulación es `pdf_referencia` con
    prefijo `SIM-`.
- La presencia de credenciales no cambia el comportamiento: con o sin
  credenciales, MP sigue simulado y ARCA sigue simulada. Ver `Q-C10-11`.

## Tests sin llamadas de red (mecanismo)

No alcanza con "no configurar credenciales": el código podría igual intentar una
llamada. El mecanismo es una fixture de los tests de caja que **falla el test si
se intenta salir a la red**:

- Reemplaza `urllib.request.urlopen`, `httpx.HTTPTransport.handle_request`,
  `httpx.AsyncHTTPTransport.handle_async_request` y, si el paquete `requests`
  está instalado, `requests.sessions.Session.send`, por funciones que hacen
  `pytest.fail("llamada de red en tests de caja")`. Se parchea a nivel de
  transporte porque `TestClient` hereda de `httpx.Client`; parchear
  `httpx.Client.send` rompería el cliente de tests. Cualquier test de API que
  pase bajo la fixture prueba que `TestClient` sigue funcionando.
- **No** parchea `socket`: Postgres lo usa para conectar y el test no podría ni
  arrancar.
- Verifica además que `backend/app/caja` no importe `httpx`, `requests` ni
  `urllib.request` (en C-10 no hay cliente HTTP).
- El reloj se inyecta (D21/D29), así que tampoco hay dependencia de hora real.

## Migración 005 (no 004)

**El "Migración 004" de `CHANGES.md` está desactualizado para C-10.** C-09
ocupó la `004_hc_odontograma`. Verificado en el repo:
`backend/alembic/versions/004_hc_odontograma.py` (revision `"004_hc_odontograma"`,
`down_revision = "003_lista_espera"`). El head actual es **`004_hc_odontograma`**.

Por lo tanto:
- Archivo: `backend/alembic/versions/005_caja_pagos.py`
- `revision = "005_caja_pagos"`
- `down_revision = "004_hc_odontograma"`
- `upgrade()`: crear en orden `caja` → `cobro` → `liquidacion_os`, con sus
  CHECKs (estados, rangos de monto con el tope `MONTO_MAX_CENTAVOS`,
  `cobertura_no_excede_total`, `copago_consistente`), FKs e índices
  (`ix_cobro_caja`, `ix_cobro_turno`, `ix_liquidacion_os_creado`; **sin**
  `ix_caja_fecha`, D16/§Modelo).
- `downgrade()`: dropear en orden inverso
  (`liquidacion_os` → `cobro` → `caja`), índices antes que tablas.
- `backend/alembic/env.py` debe **importar explícitamente**
  `backend.app.caja.models` (el repo importa los modelos por capability con
  `# noqa: F401`). Si falta el import, `Base.metadata` no ve las tablas y
  `alembic check` reporta diferencias.
- **Privilegios del rol de lectura**: la migración **no hace `GRANT` ni toca
  roles**. El rol `mcp_readonly` no está definido en el repo y un `GRANT` a un
  rol inexistente fallaría en una base que no lo tenga. La cobertura de las
  tablas nuevas depende del **default ACL** existente (`ALTER DEFAULT
  PRIVILEGES` aplicado al crear el contenedor). La tarea 8.4 verifica, después
  de un `upgrade head` real, que ese default ACL cubra `caja`, `cobro` y
  `liquidacion_os` (consulta de `information_schema.role_table_grants` y
  `pg_default_acl`). Si no las cubre, el GRANT manual se documenta en el README
  fuera de la migración; no se agrega a la migración. No se tocan volúmenes ni
  el rol.

### Invocación verificada de Alembic

`backend/alembic.ini` solo contiene `script_location = %(here)s/alembic`: **no
hay `prepend_sys_path`**. Y `backend/alembic/env.py` importa `from backend.app...`,
así que la raíz del repo tiene que estar en el `PYTHONPATH`. Forma canónica
(desde `backend\`):

```powershell
$env:PYTHONPATH = (Resolve-Path ..).Path
python -m alembic -c alembic.ini upgrade head
python -m alembic -c alembic.ini check
```

`alembic heads` y `alembic history` **no cargan `env.py`**: son falso positivo
para verificar el cableado. Solo `upgrade`, `downgrade` y `check` lo prueban.

## RBAC y autenticación

`knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos marca la
columna "HC/Caja/OS/ARCA" como **"Posterior"** para Recepción y Odontólogo, y
"—" (sin acceso) para Paciente: la KB no define hoy quién puede leer o escribir
caja. C-11 implementa roles.

Por eso C-10 sigue el patrón actual del repo (**sin auth**): los endpoints no
exigen token. Se registra la pregunta `Q-C10-02` y el riesgo residual
correspondiente, no se inventa una matriz.

## Gobernanza CRITICO

C-10 está marcado **Governance: CRITICO** en `CHANGES.md`. Requiere revisión
humana explícita antes de implementar:

1. **El modelo de pagos**: tablas, columnas, FKs opcionales y los invariantes de
   anulación trazable.
2. **La migración 005**: numeración, encadenado sobre `004_hc_odontograma`,
   CHECKs y orden de `downgrade()`.
3. **El modo simulado**: qué se marca como simulado (D8: el cobro por medio;
   la factura por emisión) y qué campos se exponen (`simulado` en `CobroOut`;
   `simulado` + `modo` en `FacturaArcaOut`).
4. **Los invariantes**: una caja por día, cobro contra caja abierta, una
   liquidación por cobro OS, cobertura dentro de `[0,total]`, cobro facturado no
   anulable (D26) y anulación de cobro OS que anula su liquidación (D27).

Bajo el modelo de gobernanza del proyecto, CRITICO = proponer y esperar
revisión antes de escribir código. **Este proposal + diseño + spec son el
artefacto de revisión.** No se implementa nada hasta aprobación explícita.

## Riesgos / Trade-offs

- [Simulado mal interpretado por el cliente] → un cobro en efectivo marcado
  `simulado=false` y una factura `simulado=true` conviven en el mismo flujo.
  Mitigación: la regla es única y explícita (D8/D25), el campo se documenta por
  contrato y C-20 muestra el marcado de la **factura**, no el del cobro.
- [Anulación después del cierre] → anular un cobro ya arqueado descuadraría el
  snapshot. Mitigación: 409 `caja_cerrada` (D23) y `Q-C10-12` para el circuito
  de corrección posterior.
- [Cobro OS facturado por error] → la factura al paciente no corresponde.
  Mitigación: 409 `medio_no_facturable` (D24) y `Q-C10-13`.
- [Anulación de un cobro facturado] → quedaría un CAE emitido apuntando a un pago
  anulado. Mitigación: 409 `cobro_facturado` (D26); la corrección real (nota de
  crédito) queda fuera de C-10.
- [Cobro OS anulado con liquidación viva] → la OS reclamaría un acto que ya no
  existe. Mitigación: la liquidación pasa a `anulada` en la misma transacción
  (D27) y el listado la sigue mostrando.
- [Copago del paciente sin modelar] → no hay dónde registrar cómo lo pagó ni
  cómo entra al arqueo. Mitigación: se documenta el total de la prestación y el
  copago derivado en la liquidación (D2/D28) y queda como `Q-C10-14`.
- [Caja de un día anterior abierta] → queda abierta para siempre porque nadie la
  cierra. Mitigación: no bloquea la apertura de hoy (UNIQUE por `fecha`) y se
  documenta como `Q-C10-15`; el cierre manual con `fecha` explícita sigue
  disponible.
- [Concurrencia no testeada] → el test de dos sesiones (7.5) puede resultar no
  determinista en Postgres. Mitigación: si eso pasa, el test se elimina y este
  riesgo queda declarado como **no testeado**; el orden de locks de D19 y los
  UNIQUE/CHECK siguen siendo la protección, pero sin test automático que lo
  demuestre. No se deja un test flaky para "cubrirlo".
- [Sin auth] → cualquier cliente puede abrir/cerrar caja y registrar cobros.
  Riesgo residual aceptado hasta C-11. Mitigación parcial: datos ficticios en el
  TP y API no expuesta públicamente.
- [Nomenclador informado] → códigos inconsistentes. Mitigación: NOT NULL +
  validación de formato mínima; el catálogo canónico queda como `Q-C10-03`.
- [PDF simulado] → C-20 debe marcar "PDF simulado". Mitigación: `pdf_referencia`
  con prefijo `SIM-` y `Q-C10-06`.
- [Carrera en apertura de caja] → dos requests simultáneos podrían pasar la
  verificación previa. Mitigación: UNIQUE(fecha) en base + traducción de
  `IntegrityError` a 409.
- [Cobro contra caja cerrada] → si la caja se cierra entre la verificación y el
  INSERT, el cobro queda huérfano. Mitigación: orden de locks
  `caja → cobro` con `with_for_update()` en `registrar_cobro`, `cerrar` y
  `anular_cobro` (D19), verificación de estado dentro de la transacción y FK
  RESTRICT.
- [Total calculado de arqueo] → costo de agregación sobre cobros. Aceptable para
  el volumen de una caja diaria.
- [Cobertura informada por el cliente] → puede no coincidir con lo que la OS
  reconozca. Es un snapshot; la conciliación es posterior (`Q-C10-03`).

## Preguntas abiertas

| ID | Pregunta | ¿Bloquea? | Decisor | Mientras tanto (implementado) |
|---|---|---|---|---|
| `Q-C10-01` | ¿La caja es por día global, por profesional o por sucursal? | No bloquea el modelo, sí el alcance multi-sucursal. | Producto / administración. | Una caja por día global (`fecha` UNIQUE); el alcance multi-sucursal se decide en `Q-C10-05`. |
| `Q-C10-02` | ¿Quién puede abrir/cerrar caja y registrar cobros? La matriz RBAC marca "Caja/OS/ARCA" como "Posterior" para Recepción y Odontólogo. | No bloquea el contrato HTTP. | C-11 (roles) / producto. | Sin auth, patrón actual del repo. Riesgo residual aceptado hasta C-11. |
| `Q-C10-03` | ¿Cuál es la fuente del nomenclador de obras sociales y los porcentajes de cobertura? No hay nomenclador en la KB ni en el repo. | No bloquea C-10. | Producto / administración / OS. | `nomenclador_codigo` es texto informado (NOT NULL), cobertura/copago validados por rango; sin tabla de nomenclador. |
| `Q-C10-04` | ¿Cómo se modela la seña vinculada a reserva sin C-08 (reserva online, pendiente, otro responsable)? C-10 depende solo de C-03. | No bloquea C-10. | C-08 / producto. | `Cobro.turno_id` FK opcional + `concepto` (`sena`/`saldo`/`total`); la seña se registra contra un turno cuando existe, o como cobro independiente. |
| `Q-C10-05` | ¿Se implementa multi-caja por sucursal en C-10 o se difiere a C-11? (depende de `Q-C10-01`, que define el alcance global/profesional/sucursal) | No bloquea; afecta índices. | C-11 / producto. | Una caja por día global; agregar `sucursal_id` es una migración aditiva. |
| `Q-C10-06` | ¿Se genera PDF real de liquidación o alcanza con una referencia simulada? | No bloquea el contrato. | Producto / infraestructura. | `pdf_referencia` simulada con prefijo `SIM-` (`SIM-liquidacion-{id}.pdf`); la generación real es posterior. |
| `Q-C10-07` | ¿Cuáles son los estados canónicos de liquidación y sus transiciones? | No bloquea, pero el set es provisorio. | Producto / administración. | Set provisorio `pendiente`/`liquidada`/`pagada`/`anulada` con CHECK; `anulada` la setea la anulación del cobro (D27). Sin matriz de transiciones para el resto. |
| `Q-C10-08` | ¿El cobro se registra contra la caja abierta del día implícitamente o se envía `caja_id` explícito? | Afecta el contrato HTTP. | Producto / recepción. | `caja_id` opcional en el body: si se omite, se usa la caja abierta de `hoy_local()` (409 si no hay; D29). Si se envía, debe existir (404) y estar abierta (409). |
| `Q-C10-09` | ¿Factura ARCA B o C según condición fiscal del paciente (responsable inscripto vs consumidor final)? ¿Quién informa la condición? | No bloquea el contrato (el cliente envía `tipo`). | Producto / contador. | El cliente envía `tipo` (B/C); el sistema no valida la condición fiscal del paciente (no hay datos fiscales en la KB). |
| `Q-C10-10` | ¿El arqueo de caja es solo efectivo o incluye todos los medios de pago? | No bloquea el contrato. | Producto / recepción. | En C-10 se asume arqueo solo efectivo (el cajón); tarjeta/transferencia/MP/OS se informan como `totales_por_medio_centavos` (informativo). Ver D2. |
| `Q-C10-11` | ¿Se implementa la integración real con Mercado Pago y ARCA? | No bloquea C-10. | Producto / infraestructura. | En C-10 MP y ARCA operan simulados (D8): `mercado_pago` → `simulado=true`; `FacturaArcaOut.simulado=true` y `modo="simulado"`; el resto de los medios → `simulado=false`. La integración real queda para un change posterior. |
| `Q-C10-12` | ¿Cómo se corrige un cobro cuando su caja ya está cerrada (reapertura, cobro de ajuste, nota de crédito)? | No bloquea C-10. | Producto / administración. | En C-10 la anulación devuelve **409** `caja_cerrada` (D23); no se reabre la caja ni se recalcula el arqueo. |
| `Q-C10-13` | ¿Un cobro de obra social se factura a la OS y con qué comprobante? | No bloquea C-10. | Producto / contador / OS. | En C-10 la factura ARCA sobre un cobro `obra_social` devuelve **409** `medio_no_facturable` (D24); la liquidación (`GET /liquidaciones-os`) sigue disponible. |
| `Q-C10-14` | **[nueva]** En un cobro `obra_social`, `monto_centavos` es el total de la prestación: ¿cómo se registra el copago que paga el paciente y cómo entra en el arqueo? | No bloquea C-10. | Producto / recepción / administración. | El copago no se modela: `copago_centavos` solo aparece en la liquidación como `monto_total − cobertura`, **no** genera un cobro aparte y **no** suma al arqueo. `totales_por_medio_centavos["obra_social"]` refleja el total de la prestación. Ver D2/D28. |
| `Q-C10-15` | **[nueva]** Una caja de un día anterior que quedó abierta: ¿se cierra sola, se bloquea, se cierra a mano? | No bloquea C-10. | Producto / administración. | No se cierra automáticamente y no bloquea la apertura de hoy (`fecha` es UNIQUE por día, así que son filas distintas). Queda abierta hasta que alguien la cierre con `POST /caja/cerrar` y `fecha` explícita. Ver D30. |

## Fuera del recorte del TP

C-10 está **fuera del recorte evaluable** del TP. El recorte es
`C-01 → C-02 → C-03 → C-12 → C-13 → C-14 → C-15 → C-16` (`CHANGES.md`
§Camino crítico y `knowledge-base/01_vision_y_objetivos.md` §Fuera de alcance,
que excluye explícitamente "caja/MP/ARCA/OS" del primer change). C-10 es
**FASE 3 "Clínico, cobros y cierre (posterior al TP)"**. Esto afecta
**prioridad, no corrección**: el change se especifica completo para no bloquear
a C-11 y C-20.
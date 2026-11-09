# Design — recordatorios-confirmacion (C-07)

## Context

Ver `proposal.md` (§Why / §What Changes) y los deltas `specs/recordatorios/spec.md`
y `specs/turnos/spec.md` (contrato). Estado heredado relevante, verificado leyendo
el código:

- `backend/app/turnos/service.py` — `ServicioTurnos.crear` = `validar` + `insert`;
  `cancelar` acepta `pendiente`/`confirmado` → `cancelado` y responde 409
  `transicion` en estados finales; `reprogramar` valida igual que crear y permite
  mover `inicio`. **No existe `confirmar`.**
- `backend/app/turnos/models.py` — `ESTADOS = (pendiente, confirmado, atendido,
  ausente, cancelado)`; `ESTADOS_ACTIVOS = (pendiente, confirmado)`; dos `EXCLUDE`
  parciales sobre `ESTADOS_ACTIVOS` (red anti-solape) e índices que empiezan por
  `profesional_id`, `sillon_id` o `paciente_id`. C-07 agrega
  `ix_turnos_inicio_activo`, declarado también en el modelo (D17).
- `backend/app/caja/reloj.py` — precedente del reloj inyectable: `ahora_local()`
  y `hoy_local(ahora)`, importando `ZONA` de `backend.app.turnos.service`; el
  servicio recibe `ahora` keyword-only y el router expone `get_ahora()`.
- `backend/app/caja/service.py` — precedente de integraciones externas
  **siempre simuladas** (MP/ARCA), sin red y sin leer credenciales desde código
  de producción (D8/D9/D10 de C-10).
- `backend/app/agenda/models.py` — `Paciente.contacto` es un único `Text`
  libre (`"tel 11-0000-0001"` en el seed). **No hay email.**
- `backend/app/turnos/router.py` — cada router define su propio `get_db`
  (commit al salir, rollback ante excepción); las excepciones de dominio se
  traducen a `HTTPException` en el router.
- `backend/tests/conftest.py` — `db_session` con rollback transaccional y
  `TRUNCATE` de una lista fija `_CATALOGO_TABLES` por test.
- `backend/alembic/versions/` — cadena lineal `001 → 002 → 003 → 004 → 005`;
  head `005_caja_pagos`.

**Verificación del esquema:** en esta sesión el MCP `postgres` no está expuesto,
así que no se consultó la base. Las definiciones de `EXCLUDE`/`CHECK`/índices de
`turnos` se toman del design archivado de C-04, que las transcribió verbatim
desde el MCP el 2026-10-30; la migración 005 no altera `turnos`. El implementador
debe reconfirmar con el MCP y con `alembic heads` (ver §Migration Plan).

## Goals / Non-Goals

**Goals (diseño):** procesar recordatorios 48h/24h de forma determinista y
repetible sin infraestructura nueva; emitir y validar un token de un toque con
semántica de un solo uso explícita; agregar `pendiente → confirmado` al servicio
de turnos sin abrir transiciones nuevas; mantener todo el camino de envío sin red
y sin credenciales en tests.

**Non-Goals (diseño):** no se introduce Redis, worker ni scheduler embebido; no
se implementa proveedor real de WhatsApp ni SMTP; no se agrega endpoint de
operador para confirmar; no se toca `docker-compose.yml`; no se invalida ningún
token al reprogramar; no se reintentan envíos fallidos; no se ofrece
automáticamente el hueco a la lista de espera.

## Modelo `recordatorio`

Tabla nueva, FKs `RESTRICT` (consistente con `turnos` y `caja`).

| Columna | Tipo | Null | Default | Uso |
|---|---|---|---|---|
| `id` | uuid | no | `uuid4` | PK |
| `turno_id` | uuid | no | — | FK `turnos.id` `ON DELETE RESTRICT` |
| `canal` | text | no | — | CHECK `IN ('whatsapp','email','log')` |
| `etapa` | text | no | — | CHECK `IN ('48h','24h')` |
| `estado` | text | no | `'pendiente'` | CHECK `IN ('pendiente','enviado','confirmado','cancelado','fallido')` |
| `token_hash` | text | no | — | UNIQUE; sha256 hex del token crudo |
| `expira_en` | timestamptz | no | — | `= inicio_turno` (D6) |
| `inicio_turno` | timestamptz | no | — | snapshot del `turno.inicio` al enviar (D3/D13) |
| `proveedor_ref` | text | sí | — | `SIM-WA-…` / `SIM-LOG-…` |
| `simulado` | boolean | no | `false` | `true` cuando hubo envío simulado; `false` si no hubo envío (D10/D16) |
| `mensaje` | text | sí | — | copia **redactada** del texto entregado; el token se guarda como `<token>` (D12) |
| `error` | text | sí | — | motivo del `fallido` |
| `creado_en` | timestamptz | no | `now()` | seteado desde `ahora` (D5) |
| `enviado_en` | timestamptz | sí | — | desde `ahora` |
| `respondido_en` | timestamptz | sí | — | desde `ahora`, al usar el token |

Restricciones e índices:

```
UNIQUE (token_hash)                          -- uq_recordatorio_token_hash
UNIQUE (turno_id, etapa, inicio_turno)       -- uq_recordatorio_dedupe
INDEX  (turno_id)                            -- ix_recordatorio_turno_id
```

`etapa` e `inicio_turno` **no están** en la lista mínima de `CHANGES.md`; son
necesarios para que el job sea idempotente y para re-notificar tras una
reprogramación (D3/D13). `token_hash` reemplaza al `token_1toque` en claro (D6).

`fallido` y `log` se agregan a los enums de `CHANGES.md` (`estado` y `canal`
respectivamente); `email` queda reservado sin uso en este change (S3).

## Decisions

- **D1 — Scheduler: función de dominio + CLI, sin Redis.** El procesamiento es un
  `SELECT` acotado por rango más N envíos secuenciales; no hay trabajo asincrónico
  real. Redis no agenda nada por sí solo (haría falta además cron/beat), agrega
  dos contenedores, una dependencia y healthchecks, y colisiona con C-23, que
  también toca `docker-compose.yml`. La idempotencia vive en la base en cualquier
  caso. **Contrato:** `ServicioRecordatorios.procesar(session, *, ahora=None,
  notificador=None, limite=200)` hace `flush` y **nunca** `commit` (precedente
  `seed_catalogo`); el adaptador CLI `python -m backend.app.recordatorios.job`
  abre sesión, procesa, commitea, imprime el resumen y devuelve código 0 (1 solo
  ante error de infraestructura). Un `fallido` no es error de proceso.
  **Resumen:** `ResumenProcesamiento` (dataclass frozen) lleva `candidatos`,
  `enviados`, `omitidos` y `fallidos`; `omitidos` cuenta **solo** los choques de
  `uq_recordatorio_dedupe` (un candidato que otro proceso ya tomó), no los turnos
  fuera de ventana ni los pacientes sin contacto. El job imprime una línea con los
  cuatro campos: `recordatorios: candidatos=N enviados=N omitidos=N fallidos=N`.
  **`--ahora`:** acepta ISO-8601; sin zona horaria se interpreta en
  `America/Argentina/Buenos_Aires` (`ZONA`) y un offset explícito se respeta tal
  cual.
  **Descartado:** Celery/RQ/arq + Redis; scheduler embebido con `sleep` en el
  proceso de la API.
  **Discrepancia con `CHANGES.md` rev. 3/4:** la nota de higiene y la asignación
  asumen que "Redis entra con C-07", y `README.md` lo repite. El scope de C-07
  no pide Redis y el procesamiento no es asincrónico; la regla del stack lo
  reserva para async real. Este change no toca `docker-compose.yml`, así que C-23
  queda desacoplado. Las notas de rectificación de `CHANGES.md` son registro
  histórico y no se reescriben; sí se corrige la línea operativa del `README.md`
  (tarea 6.3).

- **D2 — Modelo de ventana vencida, no instante exacto.** Para el instante `A`:
  etapa `24h` si `A < inicio <= A+24h`; etapa `48h` si `A+24h < inicio <= A+48h`.
  Un turno que entra directo a la ventana de 24h (job caído, turno creado a
  última hora) recibe **solo** 24h, nunca un "recordatorio de 48h" tardío.
  **Por qué:** con un tick de 5–15 min, la corrección no depende de la frecuencia
  ni de que el proceso esté vivo justo en T-48h. **Descartado:** comparar contra
  `inicio - 48h` con igualdad exacta; guardar "enviado" sin ventana.

- **D3 — Persistir antes de enviar; dedupe `(turno_id, etapa, inicio_turno)`.**
  El orden por candidato es: `INSERT` + `flush` dentro de un `SAVEPOINT`
  (`begin_nested`); si el `UNIQUE` de dedupe revienta, otro proceso ya lo tomó y
  se omite; recién entonces se envía y se actualiza a `enviado`/`fallido`. El
  `inicio_turno` en la clave hace que una reprogramación posterior genere un
  recordatorio nuevo para el horario nuevo. **Por qué:** dos crons solapados no
  duplican mensajes sin locks ni `SKIP LOCKED`. **Trade-off:** la segunda
  transacción espera el commit de la primera (índice único); aceptable con un
  único cron y lotes chicos. **Descartado:** `SELECT … FOR UPDATE SKIP LOCKED`
  (más complejidad para el mismo resultado); dedupe solo por `(turno_id, etapa)`
  (rompe la re-notificación tras reprogramar).

- **D4 — Política de etapas.** La etapa 48h se envía a todo turno activo; la
  etapa 24h solo si el turno sigue `pendiente` al procesar. Si el paciente ya
  confirmó, no se lo vuelve a molestar; si sigue pendiente, el segundo mensaje es
  el empujón. Ver **S1** (supuesto pendiente de confirmación del PO).

- **D5 — Reloj inyectable.** Nuevo `backend/app/recordatorios/reloj.py` con
  `ahora_local() -> datetime` (`datetime.now(ZONA)`), importando `ZONA` de
  `backend.app.turnos.service` y sin redefinirla. Todo servicio recibe
  `ahora: datetime | None = None` keyword-only; si es `None` usa `ahora_local()`.
  Un `ahora` naive se rechaza (mismo criterio que `ServicioTurnos.validar`). Los
  routers exponen `get_ahora()` como dependencia FastAPI y los tests la
  reemplazan con `app.dependency_overrides[get_ahora] = lambda: datetime(…,
  tzinfo=ZONA)`. `creado_en`, `enviado_en`, `respondido_en` y `expira_en` salen de
  `ahora`; `server_default=now()` queda solo de respaldo. **Por qué no importar de
  `caja.reloj`:** acoplaría recordatorios a un dominio ajeno; duplicar 4 líneas es
  deliberado y `ZONA` ya es el único punto compartido. **Descartado:** mockear
  `datetime` globalmente (frágil).

- **D6 — Token: `token_urlsafe(32)`, solo hash, expiración al inicio.** Se genera
  un token de 256 bits URL-safe (43 caracteres `[A-Za-z0-9_-]`); se persiste
  `token_hash = sha256(token).hexdigest()`; el crudo solo se pasa al notificador
  en memoria y nunca se persiste ni se loguea (D12).
  `expira_en = inicio_turno` (snapshot), porque confirmar o cancelar un turno ya
  comenzado no tiene efecto útil. `UNIQUE(token_hash)` **no maneja** una
  colisión: con `token_urlsafe(32)` (256 bits) la probabilidad es despreciable y,
  si ocurriera, el `UNIQUE` hace fallar el lote de forma visible —`IntegrityError`
  re-lanzado, porque el servicio solo omite `uq_recordatorio_dedupe`—. No se
  regenera el token ni hay reintento. **Por qué hash y no claro:** Gobernanza
  ALTO; un dump de la base con tokens en claro permite cancelar turnos ajenos.
  Sha256 determinístico alcanza por la entropía del token (no hace falta bcrypt).
  **Descartado:** TTL fijo desde el envío (un recordatorio a T-48h expiraría
  después del turno); token en claro en la tabla.

- **D7 — Precedencia del token y semántica de un solo uso.** `resolver_token`
  aplica este orden exacto; cualquier otra combinación está cubierta por él:

  | # | Condición | Respuesta |
  |---|---|---|
  | 1 | token no matchea `^[A-Za-z0-9_-]{43}$` | 422 (FastAPI `Path(pattern=…)`) |
  | 2 | `token_hash` no existe | 404 |
  | 3 | `estado` ∈ (`confirmado`,`cancelado`) y acción == la registrada | 200 con ese `resultado` (idempotente) |
  | 4 | `estado` ∈ (`confirmado`,`cancelado`) y acción != la registrada | **409** `{"causa": "ya_usado", "accion_previa": …}` |
  | 5 | `estado` != `enviado` (`pendiente`/`fallido`) | 200 `expirado` |
  | 6 | `ahora > expira_en` | 200 `expirado` |
  | 7 | confirmar y turno `pendiente` | `ServicioTurnos.confirmar` → 200 `confirmado` |
  | 8 | confirmar y turno `confirmado` | 200 `confirmado` (consume el token) |
  | 9 | cancelar y turno `pendiente`/`confirmado` | `ServicioTurnos.cancelar` → 200 `cancelado` |
  | 10 | cualquier otra acción/estado | 200 `expirado` |

  El paso 3 va antes que 6: una acción ya aplicada se reporta como tal aunque
  haya pasado el inicio. El 409 por acción opuesta es la única excepción a la
  idempotencia y respeta la regla dura (conflicto de negocio → 409). El
  `recordatorio` se resuelve con `with_for_update()` para que dos requests del
  mismo token no se intercalen. **Contrato para C-21:** los estados de pantalla
  son `confirmado`, `cancelado`, `expirado` y `ya usado`; el último se deriva del
  409. **Descartado:** devolver 409 también para la misma acción (mala UX en un
  doble tap); permitir que la acción opuesta mute el turno.

- **D8 — `no_aplica` se mapea a `expirado`.** Un token válido y no usado sobre un
  turno que recepción canceló (o que está `atendido`/`ausente`) responde 200
  `expirado`. **Por qué:** C-21 fija cuatro estados y no se amplía el contrato
  del frontend. El turno no se modifica.

- **D9 — `ServicioTurnos.confirmar` estricto; idempotencia en la capa del link.**
  `confirmar(session, turno_id)`: (1) inexistente → `TurnoNoEncontrado` (404);
  (2) `estado != "pendiente"` → `ConflictoTurno("transicion", …)` (409);
  (3) `estado = "confirmado"`, `flush`, return. No revalida horario, bloqueo ni
  solape (no cambia el intervalo), y no valida que el turno sea futuro (no hay
  regla en la KB; C-04 PA-4 sigue abierto). La idempotencia de la misma acción
  vive en el paso 3/8 de D7, no en el servicio, para que el servicio siga siendo
  simétrico con `cancelar` (que no es idempotente). **Descartado:** `confirmar`
  idempotente en el dominio (inventa una transición `confirmado → confirmado` que
  RN-ES-01 no lista); endpoint de operador `POST /turnos/{id}/confirmar` (no lo
  pide el scope y agrega superficie sin auth hasta C-11).

- **D10 — Notificador inyectable; WhatsApp y log siempre simulados; cero red.**
  Interfaz `Notificador` con `enviar(*, destinatario, mensaje, token) -> str`
  (devuelve `proveedor_ref`) y `NotificacionFallida` como error. La fábrica
  `construir_notificador()` lee **solo la verdad de presencia** de
  `WHATSAPP_TOKEN` (`bool(os.environ.get("WHATSAPP_TOKEN"))`), nunca su valor:
  presente → `canal="whatsapp"`, `WhatsAppSimulado` (`SIM-WA-…`); ausente →
  `canal="log"`, `LogSimulado` (`SIM-LOG-…`, escribe en el logger). Ambos marcan
  `simulado=true` y no hacen I/O de red; `LogSimulado` loguea la copia redactada
  del mensaje, sin el token crudo (D12). **Por qué:** precedente D8/D9/D10 de
  C-10; los tests pasan un `FakeNotificador` que captura
  `(canal, destinatario, token, mensaje)`, y el único test que toca la fábrica lo
  hace con `monkeypatch.setenv/delenv`. **Descartado:** llamar a la API real aún
  con token (tests frágiles, red, secretos); email real (no hay dirección ni
  SMTP).

- **D11 — Router: dos rutas públicas, token validado por schema.** En
  `backend/app/recordatorios/router.py`, registrado en `main.py`:
  `POST /confirmar/{token}` y `POST /cancelar/{token}`, sin autenticación (el
  token es la capacidad). El `token` se declara con
  `Path(..., pattern=r"^[A-Za-z0-9_-]{43}$")` → formato inválido = 422 antes de
  tocar la base. Respuesta 200: `{"resultado": …, "turno_id": …, "inicio": …}` sin
  datos personales. Mapa de excepciones: `TokenNoEncontrado` → 404 con
  `{"detail": "<texto>"}`; `AccionYaUsada` → 409 con
  `{"detail": {"causa": "ya_usado", "detalle": "<texto>", "accion_previa":
  "<confirmado|cancelado>"}}`. **Descartado:** `GET` que muta (prefetchers y
  escáneres de links); exponer paciente/DNI/contacto en la respuesta.

- **D12 — Mensaje real en memoria; copia persistida redactada.** El servicio arma
  el texto real con los links `/confirmar/<token>` y `/cancelar/<token>` **solo en
  memoria** y lo pasa al notificador junto con el token. Lo que persiste en
  `recordatorio.mensaje` es una copia **redactada**, con el token reemplazado por
  el literal `<token>`, de modo que `token_hash` no quede anulado por un dump de la
  base ni por un log. `LogSimulado` usa esa misma copia redactada. Los tests
  verifican el token real capturado por `FakeNotificador`, nunca la columna
  `mensaje`. La base absoluta (`PUBLIC_BASE_URL`) es una preocupación de despliegue
  y queda para cuando exista el proveedor real (Q1). **Por qué:** guardar el token
  en claro anula el propósito de D6 (un dump permitiría cancelar turnos ajenos).
  **Descartado:** persistir el texto real (fuga por dump/log); dejar `mensaje` en
  `NULL` (se pierde la trazabilidad de qué se envió).

- **D13 — Reprogramar re-notifica por snapshot, sin hooks en C-04.** Como
  `inicio_turno` integra la clave de dedupe, mover el turno hace que el horario
  nuevo caiga en una ventana distinta y genere un recordatorio nuevo. **No** se
  invalidan tokens viejos ni se toca `ServicioTurnos.reprogramar`: un token viejo
  actúa sobre el estado actual del turno y expira en el `inicio_turno` que tenía
  al enviarse. **Descartado:** marcar recordatorios como cancelados desde
  `reprogramar` (acopla C-04 a C-07).

- **D14 — Sin reintentos automáticos.** Un fallo de envío deja `fallido` con
  `error` y no se vuelve a intentar; el job no reenvía `fallido` ni `pendiente`
  de ejecuciones anteriores (estos últimos no persisten porque el commit es al
  final del lote). Se verá en la DB y un operador podrá reprocesar manualmente en
  un change posterior. **Descartado:** contador de intentos y backoff (no hay
  proveedor real).

- **D15 — Sin oferta automática a lista de espera.** El token de cancelación llama
  a `ServicioTurnos.cancelar`, que libera el rango por las `EXCLUDE` parciales.
  Ofrecer el hueco a C-06 es una acción explícita que requiere elegir
  inicio/profesional/sillón; no se dispara sola.

- **D16 — Paciente sin contacto: `fallido` con `error='sin_contacto'`, sin envío.**
  Antes de enviar, el servicio lee `paciente.contacto` a través de la relación del
  turno; si es `NULL`, cadena vacía o solo whitespace, **no invoca al
  notificador** y deja el recordatorio en `estado='fallido'`,
  `error='sin_contacto'`, `proveedor_ref=NULL`, `enviado_en=NULL`, `mensaje=NULL`
  y `simulado=false` (no hubo entrega ni texto entregado que persistir; D12 solo
  aplica cuando hay mensaje). `canal` conserva el canal que se habría usado,
  porque la fábrica se evalúa igual y el CHECK es `NOT NULL`. Aplica D14:
  no se reintenta. **Por qué:** `Paciente.contacto` es un `Text` libre nullable y
  el seed usa `"tel 11-0000-0001"`; el job no puede inventar un destinatario ni
  enviar a `None`. **Descartado:** generar un contacto ficticio (enviaría a
  nadie); tratar la ausencia como error de infraestructura (el proceso debe salir
  0).

- **D17 — `ix_turnos_inicio_activo` queda en alcance y se declara en el modelo.**
  Se crea en la migración `006_recordatorio` y se declara en
  `Turno.__table_args__` como
  `Index("ix_turnos_inicio_activo", "inicio", postgresql_where=text("estado IN ('pendiente','confirmado')"))`.
  **Por qué:** `backend/alembic/env.py` usa `Base.metadata` como target con
  `compare_type`; un índice que exista solo en la DB aparece como diferencia en
  `autogenerate` (propuesta de drop) y el modelo deja de ser la fuente de verdad.
  Los dos índices parciales de la migración 002 ya se declaran así
  (`ix_turnos_profesional_activo`, `ix_turnos_sillon_activo`). Además, ningún
  índice existente empieza por `inicio`, así que el índice cubre la consulta de
  ventana del job. **Descartado:** quitarlo del alcance (la consulta del job
  quedaría sin índice útil y crece con el histórico de turnos).

## Supuestos numerados (lo no dicho en la KB — sin inventar reglas)

- **S1 — Política 48h/24h.** 48h se envía siempre; 24h solo si el turno sigue
  `pendiente`. No está en la KB; queda **pendiente de confirmación del PO**. Si
  el PO pide 24h también para `confirmado`, cambia una condición de D4 y un
  escenario del delta.
- **S2 — Sin recordatorio para turnos ya iniciados.** No hay regla explícita; se
  deriva de que un recordatorio de un turno pasado no tiene efecto. Si el PO
  quisiera un aviso posterior, sería otra regla.
- **S3 — `canal='log'` se agrega al enum.** `CHANGES.md` fija
  `whatsapp|email`; `email` se conserva reservado y `log` es el fallback real,
  porque no existe dirección ni transporte de email.
- **S4 — `expira_en = inicio_turno`.** La KB no define TTL del token; se elige el
  inicio del turno programado al enviar.
- **S5 — Un solo uso con idempotencia de la misma acción.** Decisión del PO
  registrada en D7; no está en la KB.
- **S6 — Sin horario silencioso.** No se restringe la hora local de envío: el
  mensaje sale cuando el turno entra en la ventana. Si el PO pide una franja
  (p. ej. 9–20h), es una regla nueva y un escenario extra.

## Contrato HTTP para C-21

| Caso | HTTP | Cuerpo |
|---|---|---|
| Confirmación aplicada o repetida | 200 | `{"resultado":"confirmado","turno_id":"…","inicio":"…"}` |
| Cancelación aplicada o repetida | 200 | `{"resultado":"cancelado","turno_id":"…","inicio":"…"}` |
| Token vencido / turno no aplicable | 200 | `{"resultado":"expirado","turno_id":"…","inicio":"…"}` |
| Acción opuesta sobre token usado | 409 | `{"detail":{"causa":"ya_usado","detalle":"…","accion_previa":"confirmado\|cancelado"}}` |
| Token inexistente | 404 | `{"detail":"…"}` |
| Token con formato inválido | 422 | error de validación de FastAPI |

C-21 mapea `expirado` y el 409 `ya_usado` a sus pantallas; no necesita ningún
campo adicional del turno para el estado de resultado.

## Estrategia de tests

- **`backend/tests/test_recordatorio_modelo.py`** — CHECK de `canal`, `etapa` y
  `estado`; `UNIQUE(token_hash)` y `UNIQUE(turno_id, etapa, inicio_turno)`;
  `simulado` default `false`; FK `RESTRICT`.
- **`backend/tests/test_turno_modelo.py`** — `Turno.__table__.indexes` contiene
  `ix_turnos_inicio_activo` con el `postgresql_where` que filtra los estados
  activos (D17), para que el modelo y la migración no diverjan.
- **`backend/tests/test_recordatorio_servicio.py`** — ventanas (47h, 23h, borde
  24h/48h), política 24h (S1), dedupe por reproceso, exclusión de
  cancelados/iniciados, fallback sin `WHATSAPP_TOKEN` con `monkeypatch.delenv` y
  `FakeNotificador`, `fallido` sin reintento, paciente sin contacto
  (`sin_contacto`, D16) y `mensaje` persistido redactado mientras el
  `FakeNotificador` recibe el token real (D12). Todo con `ahora` inyectado.
- **`backend/tests/test_recordatorio_concurrencia.py`** — dos sesiones reales con
  hilos y `pytest.mark.integration`, siguiendo el patrón de
  `test_caja_concurrencia.py`: A registra el recordatorio con `flush` sin commit,
  B procesa el mismo instante y queda bloqueado en el `UNIQUE` de dedupe; al
  commitear A, B omite el envío. Limpieza explícita de tablas antes y después.
- **`backend/tests/test_recordatorios_api.py`** — confirmar/cancelar felices,
  idempotencia de la misma acción, 409 `ya_usado`, 404, 422 de formato,
  `expirado` por reloj (`dependency_overrides[get_ahora]`) y por turno cancelado
  por recepción, y hueco liberado (alta 201 en el mismo intervalo tras cancelar
  por link).
- **`backend/tests/test_turno_servicio.py`** — se agregan `confirmar`:
  `pendiente → confirmado`, 409 `transicion` desde `confirmado`/`cancelado`/
  `atendido`/`ausente`, 404 inexistente y confirmación sin revalidar agenda.
- **Sin red:** la fábrica real solo se prueba en un test unitario de selección de
  canal con `monkeypatch`; nunca se llama a un proveedor.
- **Fixtures:** se reutilizan `db_session` y los helpers de `_ids()`/`LUNES_10`
  de turnos. El test de concurrencia usa `_db_engine` (fixture de sesión) y una
  limpieza explícita `TRUNCATE` como `test_caja_concurrencia.py`; no se agrega
  infraestructura de test nueva.

## Risks / Trade-offs

- [At-least-once: crash entre el envío y el commit del lote] → con el notificador
  simulado es inocuo; con proveedor real, un outbox/cola es el change futuro
  (Q2). Mitigación: lotes chicos y `limite`.
- [El `UNIQUE` de dedupe hace esperar a la segunda transacción hasta el commit de
  la primera] → con un único commit por lote, una ejecución concurrente queda
  **bloqueada en el `UNIQUE`** hasta que la primera commitee y recién entonces
  omite el envío; el bloqueo es el mecanismo de dedupe, no un fallo. Lo documenta
  `backend/tests/test_recordatorio_concurrencia.py` (D3). Aceptable con un cron y
  lotes de decenas; documentar el tick.
- [El token crudo viaja al notificador y podría filtrarse en logs] → el `mensaje`
  persistido y `LogSimulado` usan la copia redactada (D12); el crudo solo vive en
  memoria durante el envío. Los tests lo verifican vía `FakeNotificador`. Con
  proveedor real, revisar el logging del proveedor (Q2).
- [Pacientes sin contacto no reciben recordatorio] → decisión explícita (D16):
  queda `fallido` con `error='sin_contacto'`, visible en la DB, y no se reintenta;
  corregir el contacto requiere un change posterior.
- [Tokens viejos siguen vivos tras reprogramar] → decisión explícita (D13): no se
  invalidan; expiran con el `inicio_turno` original y actúan sobre el estado
  actual. Si molesta, un hook en `reprogramar` es otro change.
- [Dos tokens vivos del mismo turno (48h y 24h) con acciones opuestas
  concurrentes] → el `with_for_update` serializa por recordatorio, no entre
  recordatorios; el estado del turno decide y gana la última escritura. Con
  `expirado` para estados no aplicables, el caso queda acotado.
- [Segundo click en confirmar sobre un turno que recepción canceló después] →
  consecuencia de la fila 3 de D7: la acción registrada se reporta como ya
  aplicada aunque el turno haya cambiado de estado después. Un segundo
  `POST /confirmar/{token}` sobre un token ya usado para confirmar responde 200
  `confirmado` con el turno en `cancelado` y no lo modifica. El cuerpo de la
  ruta no expone el estado del turno, así que C-21 debe releerlo antes de
  asumir que sigue confirmado.
- [Sin reintentos] → un `fallido` se pierde; queda visible en la DB. Aceptado por
  decisión del PO.
- [Rutas públicas sin auth] → el token es la capacidad (256 bits, formato
  validado, sin PII en la respuesta). El rate limiting llega con C-08/C-11 si
  hace falta.
- [Zona horaria] → mitigado con reloj inyectable y `ZONA` única.

## Migration Plan

1. **Verificar head:** desde `backend/`, con el entorno donde están instaladas las
   dependencias, correr `alembic heads`. La lectura de los archivos da cadena
   lineal `001 → 002 → 003 → 004 → 005`; head esperado `005_caja_pagos`. (En esta
   sesión no se pudo ejecutar: `alembic` no está en el Python global y no hay
   venv en el repo.)
2. Crear `006_recordatorio` con `down_revision = "005_caja_pagos"`:
   tabla `recordatorio` (columnas, CHECKs, FKs `RESTRICT`, dos `UNIQUE`, índice
   por `turno_id`) + `ix_turnos_inicio_activo`:
   `CREATE INDEX … ON turnos (inicio) WHERE estado IN ('pendiente','confirmado')`.
   Declarar el mismo índice en `Turno.__table_args__` (D17) para que
   `Base.metadata` y la DB coincidan. El índice cubre la consulta de ventana del
   job, que hoy no tiene índice útil (los existentes empiezan por
   `profesional_id`, `sillon_id` o `paciente_id`).
3. `alembic upgrade head` y `alembic downgrade -1` deben funcionar (el downgrade
   elimina el índice y la tabla).
4. **`backend/tests/conftest.py`**: agregar `recordatorio` a
   `_CATALOGO_TABLES`. Sin eso, el `TRUNCATE` no limpia la tabla y los tests se
   contaminan entre sí.
5. **`backend/app/main.py`**: incluir el router de recordatorios.
6. **`.env.example`**: agregar `WHATSAPP_TOKEN=` **sin valor** (la variable es
   opcional; su ausencia activa el fallback `log`).
7. Sin cambios en `docker-compose.yml`. Despliegue = código + migración.
   Rollback = `alembic downgrade -1` y revertir los archivos nuevos.

## Fuera de alcance

- Redis, colas, workers y scheduler embebido (D1).
- Proveedor real de WhatsApp y reintentos/backoff (Q2).
- Transporte de email real (S3).
- Invalidación de tokens al reprogramar (D13).
- Reintento de `fallido` (D14).
- Oferta automática a lista de espera (D15).
- Endpoint de operador para confirmar (D9).
- Horario silencioso (S6).
- Auth/RBAC en las rutas públicas (llega con C-11).

## Open Questions

Ninguna cambia el contrato, el enfoque ni el desglose de tareas.

- **Q1 — Base URL absoluta de los links.** Diferida al despliegue/proveedor real;
  hoy los links son relativos (D12).
- **Q2 — Proveedor real de WhatsApp y política de reintentos.** Change posterior;
  el contrato del token y del `recordatorio` queda estable.
- **Q3 — Transporte de email.** El enum lo reserva; no se implementa.
- **Q4 — Horario silencioso.** Si el PO lo pide, es una regla nueva (S6).
- **Q5 — ¿La cancelación por link debería disparar una oferta a la lista de
  espera?** Hoy no (D15); C-06 expone la oferta manual.
- **Q6 — Reproceso manual de `fallido`.** ¿Comando de operador? Change posterior.

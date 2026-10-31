# Design — cancelar-reprogramar (C-04)

## Context

Ver `proposal.md` (§Why / §What Changes) y `specs/turnos/spec.md` (contrato). Estado heredado relevante, verificado leyendo el código de C-03:

- `backend/app/turnos/service.py` — `ServicioTurnos.crear` = `validar` + `insert`; `validar(session, *, paciente_id, profesional_id, sillon_id, prestacion_id, inicio)` devuelve `fin` y lanza `TurnoInvalido` (422), `TurnoNoEncontrado` (404) o `ConflictoTurno(causa, detalle)` (409). **`validar` no excluye ningún turno de sus consultas de solape.**
- `backend/app/turnos/router.py` — un solo `POST /turnos`; el router traduce las tres excepciones de dominio a `HTTPException` 409/404/422. El `get_db` local hace `commit` al salir del generador y `rollback` ante cualquier excepción.
- `backend/app/turnos/schemas.py` — `TurnoCreate` sin `fin`; `TurnoOut` con `from_attributes=True`.
- `backend/app/turnos/models.py` — `ESTADOS_ACTIVOS = ("pendiente","confirmado")`; `Turno` con `CheckConstraint("fin > inicio")` e índices parciales.
- **No existe** manejo de `IntegrityError` ni de SQLSTATE en código de aplicación (solo en tests que verifican el rechazo de la DB).
- **No existe** endpoint ni servicio de confirmación: no hay forma de llevar un turno a `confirmado` por API.
- `backend/tests/conftest.py` — `db_session` con rollback transaccional + `TRUNCATE` del catálogo (incluye `turnos`) por test; `_CATALOGO_TABLES` ya está completo.
- `backend/tests/test_turno_servicio.py` y `backend/tests/test_turnos_api.py` — convención de fixtures `_ids()`/`ids`, `LUNES_10 = 2026-10-12T10:00-03:00`, inserción directa por SQL para estados no alcanzables por API (ya usado para `cancelado` y `ausente` en C-03).

## Goals / Non-Goals

**Goals (diseño):** agregar cancelar/reprogramar como cambio de estado sobre el modelo existente, reutilizando `ServicioTurnos.validar` con una exclusión explícita del propio turno; mantener el contrato 409/404/422 de C-03; cerrar el agujero "conflicto de negocio → 500" con un mapeo defensivo de `23P01`; cero migraciones Alembic.

**Non-Goals (diseño):** no se toca el modelo, la revisión 002 ni el seed; no se agrega tabla de historial/auditoría de cancelaciones; no se implementa la transición `pendiente → confirmado`; no se introduce un helper compartido de mapeo de errores (se evalúa en C-05+); no se agregan endpoints de lectura.

## Restricciones reales de la base

Consultadas en vivo con el MCP `postgres` (solo lectura) el 2026-10-30 sobre la base local. Definiciones **verbatim** de `pg_get_constraintdef` / `pg_get_indexdef`.

### `ex_turnos_profesional_sin_solape` (EXCLUDE, contype `x`)

```
EXCLUDE USING gist (profesional_id WITH =, tstzrange(inicio, fin, '[)'::text) WITH &&) WHERE ((estado = ANY (ARRAY['pendiente'::text, 'confirmado'::text])))
```

**Cómo la usa el diseño:** es la red que impide dos turnos activos solapados del mismo profesional. Al **cancelar**, el `UPDATE turnos SET estado='cancelado'` saca la fila del predicado parcial, con lo cual deja de participar de la restricción y el intervalo queda libre sin borrar nada (RN-TU-01). Al **reprogramar**, el `UPDATE` de `inicio`/`fin` vuelve a evaluar la restricción contra el nuevo rango: no es una red exclusiva del `INSERT`. Su violación llega como SQLSTATE `23P01` y se mapea a 409 (ver D4). El rango `'[)'` implementa RN-AG-04 por construcción: dos turnos adyacentes (uno termina donde empieza el otro) no se solapan.

### `ex_turnos_sillon_sin_solape` (EXCLUDE, contype `x`)

```
EXCLUDE USING gist (sillon_id WITH =, tstzrange(inicio, fin, '[)'::text) WITH &&) WHERE ((estado = ANY (ARRAY['pendiente'::text, 'confirmado'::text])))
```

**Cómo la usa el diseño:** idéntica a la anterior pero por sillón, y con la misma consecuencia: cancelar libera el sillón, reprogramar re-evalúa el nuevo rango. Es la que cubre RN-AG-03 cuando el turno en conflicto es de **otro** profesional (el caso que el profesional no detecta).

### `ck_turnos_estado_valido` (CHECK, contype `c`)

```
CHECK ((estado = ANY (ARRAY['pendiente'::text, 'confirmado'::text, 'atendido'::text, 'ausente'::text, 'cancelado'::text])))
```

**Cómo la usa el diseño:** fija el vocabulario cerrado de estados. C-04 solo escribe dos valores: `'cancelado'` (cancelar) y el estado que el turno ya tenía (reprogramar no lo toca). La validación de RN-ES-01 vive en el servicio (409); este CHECK es el que garantiza que un estado inventado no pueda persistirse ni por SQL directo.

### `ck_turnos_fin_posterior_a_inicio` (CHECK, contype `c`)

```
CHECK ((fin > inicio))
```

**Cómo la usa el diseño:** garantiza el borde "`fin > inicio` debe valer después del recálculo". Como `fin = nuevo_inicio + prestacion.duracion_min` y `prestaciones` tiene su propio `CHECK (duracion_min > 0)`, la desigualdad se cumple estructuralmente: el cliente **no puede** pedir un turno de duración cero porque el body de reprogramación solo acepta `inicio` (no `fin`, no duración). El CHECK es la última red ante un `UPDATE` manual inconsistente. Una violación suya es SQLSTATE `23514` y **no** se mapea a 409: es un bug, no un conflicto de agenda.

### `ix_turnos_profesional_activo` (índice btree parcial)

```
CREATE INDEX ix_turnos_profesional_activo ON public.turnos USING btree (profesional_id, inicio, fin) WHERE (estado = ANY (ARRAY['pendiente'::text, 'confirmado'::text]))
```

**Cómo la usa el diseño:** soporta la consulta de solape por profesional de `validar` (que filtra `estado IN ESTADOS_ACTIVOS` y compara `inicio`/`fin`). Al cancelar, la fila sale del índice; al reprogramar, el índice se actualiza con el nuevo rango. No requiere mantenimiento manual ni rebuild: es un índice normal, el `UPDATE` lo mantiene.

### `ix_turnos_sillon_activo` (índice btree parcial)

```
CREATE INDEX ix_turnos_sillon_activo ON public.turnos USING btree (sillon_id, inicio, fin) WHERE (estado = ANY (ARRAY['pendiente'::text, 'confirmado'::text]))
```

**Cómo la usa el diseño:** ídem para la consulta de solape por sillón. El diseño **no agrega índices** para C-04: cancelar y reprogramar son `UPDATE` por PK y las dos búsquedas de `validar` ya están cubiertas por estos dos índices parciales.

### `ix_turnos_paciente_inicio` (índice btree, **no** parcial)

```
CREATE INDEX ix_turnos_paciente_inicio ON public.turnos USING btree (paciente_id, inicio)
```

**Cómo la usa el diseño:** como **no** tiene `WHERE`, el turno cancelado sigue apareciendo en las búsquedas por paciente. Es la garantía de que cancelar no pierde historia: el turno sigue siendo consultable por `(paciente_id, inicio)` aunque ya no cuente para solapes. C-04 no lo toca; C-05 (agenda del día) y la futura vista de historial del paciente se apoyan en él.

### `pk_turnos` y FKs

```
PRIMARY KEY (id)
fk_turnos_paciente_id_pacientes      ... ON DELETE RESTRICT
fk_turnos_profesional_id_profesionales ... ON DELETE RESTRICT
fk_turnos_sillon_id_sillones         ... ON DELETE RESTRICT
fk_turnos_prestacion_id_prestaciones ... ON DELETE RESTRICT
```

**Cómo las usa el diseño:** `pk_turnos` es la vía de acceso de cancelar/reprogramar (`session.get(Turno, turno_id)`) y el 404 sale de ahí. Las FKs `RESTRICT` confirman que no hay borrado en cascada posible: el turno cancelado sigue siendo la única evidencia de que existió. Una violación de FK es SQLSTATE `23503` y no se mapea a 409.

### Columna `estado` (default y NOT NULL)

`estado text NOT NULL DEFAULT 'pendiente'`. El diseño **no** cambia el default ni el tipo: cancelar es un `UPDATE` explícito y reprogramar no escribe `estado`.

## Decisions

- **D1 — `validar` gana `excluir_turno_id: UUID | None = None` (keyword-only).** Contrato: cuando no es `None`, las dos consultas de solape agregan `Turno.id != excluir_turno_id`; el resto del comportamiento (orden de validación, cálculo de `fin`, excepciones) queda idéntico. `crear` lo omite (default `None`) y su comportamiento no cambia. **Por qué es necesario:** hoy `validar` compara el nuevo intervalo contra *todas* las filas activas, incluida la del turno que se está editando. Una reprogramación que reutilice `validar` sin exclusión se auto-colisiona siempre que el nuevo intervalo intersecte el actual — por ejemplo mover un turno de 10:00–10:30 a 10:15–10:45 daría 409 `profesional` contra sí mismo. Descartado: excluir por `inicio`/`fin` originales (frágil ante futuras ediciones) y duplicar la lógica de solape en `reprogramar` (rompe la regla "un único punto de validación" y el RN-TU-02 "valida igual que crear").

- **D2 — `reprogramar` cambia **solo** `inicio` y recalcula `fin = inicio + prestacion.duracion_min`.** Paciente, profesional, sillón, prestación, estado y `creado_por` quedan como estaban. **Por qué:** es literal a `CHANGES.md:252` ("valida nuevo inicio igual que crear") y a `knowledge-base/07_flujos_principales.md` §Flujo 2 ("reprogramar (nuevo inicio)"). Descartado: aceptar `fin` del cliente (contradice RN-AG-01, donde el servidor lo calcula) y aceptar cambios de recursos (no hay regla en el KB; ver Preguntas abiertas PA-1).

- **D3 — Orden de validación de `reprogramar`: (1) turno existe → 404; (2) transición válida según RN-ES-01 → 409; (3) `validar(..., excluir_turno_id=turno.id)` con el orden congelado de C-03 (FKs/sillón activo → 422/404, horario → 409 `horario`, bloqueo → 409 `bloqueo`, solape profesional → 409 `profesional`, solape sillón → 409 `sillon`); (4) recién entonces se escriben `inicio`/`fin` y se hace `flush`.** **Por qué:** el paso (2) va antes que (3) para que un turno `cancelado` devuelva 409 de transición y no un 409 de solape, que confundiría la causa; y el paso (4) va al final para que todo rechazo sea atómico y el turno original quede intacto (RN-TU-02). Descartado: validar primero el horario y después el estado (reportaría la causa equivocada).

- **D4 — `23P01` sobre las dos `EXCLUDE` → 409 (red defensiva).** Hoy no hay manejo de `IntegrityError`: una violación que escape a la pre-validación produce 500, lo que viola la regla dura "NUNCA 200/500 ante conflicto de negocio → 409 conflicto". **Mapeo exacto:** en el servicio, la escritura de `reprogramar` se ejecuta dentro de un `SAVEPOINT` (`session.begin_nested()`); si el `flush` levanta `IntegrityError`:
  1. se lee `exc.orig.sqlstate`; si **no** es `"23P01"` se re-lanza tal cual (un `23514` de `ck_turnos_fin_posterior_a_inicio` o un `23503` de FK es un bug, no un conflicto de agenda: 500 es la respuesta correcta);
  2. si es `23P01`, se lee `exc.orig.diag.constraint_name`: `ex_turnos_profesional_sin_solape` → `ConflictoTurno("profesional", ...)`; `ex_turnos_sillon_sin_solape` → `ConflictoTurno("sillon", ...)`; cualquier otro nombre se re-lanza.
  3. el `SAVEPOINT` se revierte, la transacción externa sigue viva y la fila conserva su `inicio`/`fin` originales.
  El router **no cambia**: sigue traduciendo `ConflictoTurno` a `HTTPException(409)` como en C-03.
  **Dónde vive:** en el servicio, junto a la escritura, **no** en un exception handler global. Razones: (a) el handler global no puede revertir el estado de la sesión sin un rollback que arrastre la transacción del test; (b) el `SAVEPOINT` deja el `Session` usable, cosa que un handler a nivel app no garantiza; (c) mantiene al router tan delgado como en C-03. **Nota:** esta lectura del nombre del constraint es una excepción acotada al camino residual — C-03 (D4) la había descartado para la causa del 409 *normal* porque ahí manda el orden de validación del servicio; acá el pre-chequeo ya pasó y solo quedan dos constraints posibles, así que el nombre es inequívoco. Si C-05+ necesita lo mismo, extraer un helper compartido (`mapear_integrity_error`) es el refactor natural, pero **no** se hace en C-04.

- **D5 — Máquina de estados: solo se agregan las aristas de RN-ES-01 que C-04 posee.**

  | Estado actual | Cancelar | Reprogramar |
  |---|---|---|
  | `pendiente` | OK → `cancelado` (200) | OK, estado se conserva (200) |
  | `confirmado` | OK → `cancelado` (200) | OK, estado se conserva (200) |
  | `atendido` | 409 transición inválida | 409 transición inválida |
  | `ausente` | 409 transición inválida | 409 transición inválida |
  | `cancelado` | 409 transición inválida | 409 transición inválida |

  `pendiente → confirmado`, `confirmado → atendido` y `confirmado → ausente` existen en RN-ES-01 pero **no se implementan acá** (no hay endpoint ni US que las pida). **Por qué:** RN-ES-01 lista las transiciones permitidas y `knowledge-base/07_flujos_principales.md` §Flujo 2 fija el 409 para estados finales; no se inventa ninguna arista nueva. Descartado: aceptar `cancelado → cancelado` como idempotente (el KB no lo autoriza y el Flujo 2 pide 409).

  **Contrato de excepción — `ConflictoTurno` gana la causa `"transicion"`.** Junto a las causas de C-03 (`"horario"`, `"bloqueo"`, `"profesional"`, `"sillon"`) el servicio agrega `"transicion"`, que se lanza desde `cancelar` y `reprogramar` cuando el `estado` actual no admite la operación según **RN-ES-01** y `07_flujos_principales.md` §Flujo 2 (`atendido`, `ausente`, `cancelado`). **Qué lleva el `detalle`:** el mismo patrón que C-03 —texto humano en ASCII sin acentos, que nombra el estado actual y la regla—, por ejemplo `"transicion invalida desde 'atendido': solo un turno pendiente o confirmado puede cancelarse o reprogramarse (RN-ES-01)"`. **Qué NO lleva:** ids de turnos, SQLSTATE ni el nombre de un constraint (no es un error de base, es una regla de negocio). El router **no cambia**: `detail.causa == "transicion"` y `detail.detalle` con ese texto, igual que las otras cuatro causas. No se reutiliza una causa existente: un solape nunca se reporta como transición ni viceversa, y por eso D3 evalúa la transición **antes** que la agenda.

- **D6 — La liberación del slot no requiere código.** Cancelar es un `UPDATE` de `estado`; las dos `EXCLUDE` y los dos índices `*_activo` son parciales sobre `('pendiente','confirmado')`, así que la fila sale del predicado automáticamente. **Por qué se verifica con un test y no con lógica:** el riesgo real es que alguien "arregle" el solape con un borrado o tocando los índices; el test de "cancelar y volver a crear el mismo intervalo" fija el comportamiento como contrato (escenario "Slot liberado y reutilizable" del delta).

- **D7 — Sin migración Alembic.** El esquema de la revisión 002 ya soporta todo: `ck_turnos_estado_valido` incluye `'cancelado'`, las `EXCLUDE` son parciales, `fin` es una columna normal actualizable. **Por qué:** agregar una migración sin cambios de esquema solo agrega superficie de rollback. Descartado: agregar columnas `cancelado_en`/`cancelado_por` (no las pide el KB; ver PA-3).

- **D8 — Schemas: `TurnoReprogramar` con un único campo `inicio: AwareDatetime` y `extra="ignore"`; la respuesta reutiliza `TurnoOut`.** **Por qué:** `extra="ignore"` replica la decisión de C-03 (`TurnoCreate`), de modo que un cliente que mande `fin` o `profesional_id` no rompe: se ignora, coherente con "el servidor calcula `fin`" y con que C-04 no reasigna recursos. Descartado: `extra="forbid"` (convertiría un campo ignorado en 422 y rompería la simetría con C-03).

- **D9 — Rutas: `POST /turnos/{turno_id}/cancelar` y `POST /turnos/{turno_id}/reprogramar`, sin body en cancelar.** **Por qué:** son las rutas que fija `CHANGES.md:251-252`; `POST` (no `PATCH`) porque son comandos de dominio, no ediciones parciales de recurso, y así se mantiene el estilo de C-03. `turno_id` inválido (no UUID) lo resuelve FastAPI con 422 antes de entrar al servicio. Descartado: `PATCH /turnos/{id}` con `estado`/`inicio` en el body (obligaría a validar combinaciones y abriría la puerta a transiciones arbitrarias).

## Supuestos numerados (lo NO dicho en KB 05 — sin inventar reglas)

- **S1 — Reprogramar conserva el `estado` del turno** (un `confirmado` sigue `confirmado`). El KB no lo dice; se deriva de que RN-ES-01 no lista una transición `confirmado → pendiente`, y D5 prohíbe aristas no listadas. Si el negocio quisiera "volver a pendiente al reprogramar", sería una regla nueva.
- **S2 — Turno inexistente → 404** (UUID bien formado, sin fila). Consistente con S3 de C-03 (FK bien formada pero inexistente → 404); el KB no lo fija.
- **S3 — No se valida que el nuevo `inicio` sea futuro.** `knowledge-base/05_reglas_de_negocio.md` no tiene ninguna regla de "no reprogramar al pasado" (solo RN-AG-05 horario/bloqueo), así que agregarla sería inventar una regla. Queda como PA-4.
- **S4 — Reprogramar re-valida el sillón activo** (`activo=false` → 422) como efecto de reutilizar `validar` ("valida igual que crear", RN-TU-02). No es una regla nueva de C-04: hereda la decisión S2 de C-03.
- **S5 — El `detalle` del 409 residual (`23P01`) es texto humano genérico**, sin prometer qué turno causó el conflicto (la fila ganadora no se consulta en el camino de error).

## Estrategia de tests (nota obligatoria)

- **No hay endpoint de confirmación en C-04.** Todo escenario que necesite un turno `confirmado` (o `atendido`/`ausente`) lo **inserta directo en la DB** dentro del test — por SQL (`INSERT INTO turnos (...)`) o por el modelo — igual que ya hace C-03 para `cancelado`/`ausente` en `test_turno_servicio.py`. No se agrega seed ni endpoint para esto.
- **Capas:** `backend/tests/test_turno_servicio.py` cubre `ServicioTurnos.cancelar`/`reprogramar`/`validar(excluir_turno_id=...)` y las excepciones de dominio; `backend/tests/test_turnos_api.py` cubre los dos endpoints, los códigos HTTP y el body del 409.
- **`23P01` con Postgres real:** se cubre en dos niveles. **(a) Servicio:** el test provoca la violación con un `UPDATE` directo de `inicio` dentro de un `session.begin_nested()` (savepoint), de modo que la excepción es un `ExclusionViolation` auténtico de psycopg (`sqlstate='23P01'`, `diag.constraint_name` real) y la transacción del test sobrevive al rollback del savepoint. **(b) API:** con el turno conflictivo **ya insertado**, se monkeypatchea **`ServicioTurnos.validar`** por un stub que omite solo el chequeo de solape y devuelve el `fin` recalculado, de modo que `reprogramar` llega al `UPDATE` real y es la `EXCLUDE` de Postgres la que dispara el `23P01`; se verifica `409`, `detail.causa == "profesional"` y el turno intacto. **No** se monkeypatchea `reprogramar`: eso probaría solo la traducción, no el camino de escritura que realmente puede fallar.
- **Fixtures:** se reutilizan `db_session`, `_ids()`/`ids` y `LUNES_10` de C-03; no se modifica `conftest.py`.

## Risks / Trade-offs

- [La reprogramación re-valida horario y bloqueo, no solo solape] → Es lo que pide RN-TU-02 ("valida el nuevo horario con las mismas reglas que crear"). Trade-off aceptado: mover un turno a un hueco libre fuera del horario del profesional da 409 `horario`, no un turno inválido.
- [El mapeo `23P01` depende de `diag.constraint_name`] → Mitigación: solo se consulta en el camino residual, con dos nombres conocidos y estables (revisión 002); cualquier otro nombre se re-lanza para no ocultar bugs.
- [El `SAVEPOINT` agrega un round-trip por reprogramación] → Costo despreciable en un TP; el beneficio es que un conflicto concurrente no deja la sesión abortada.
- [`extra="ignore"` permite que un cliente crea que cambió el profesional] → Mitigación: PA-1 lo declara explícitamente fuera de alcance y el delta spec fija "solo `inicio`"; si el PO habilita la reasignación, será otro change con su propio contrato.
- [Un `cancelado` que se reprograma devuelve 409 sin distinguir de un solape] → Mitigación: D3 ordena la transición antes de la validación de agenda, así que la causa reportada es siempre la correcta.

## Migration Plan

1. **Sin migración de esquema.** `alembic upgrade head` sigue en `002_turno`; no hay revisión nueva.
2. Despliegue: solo código de aplicación (servicio + schemas + router). Ningún cliente de C-03 se rompe (`validar` gana un keyword-only con default y las rutas existentes no cambian).
3. Rollback: revertir los archivos de `backend/app/turnos/`. No hay datos que deshacer (los turnos cancelados siguen siendo filas válidas y las reprogramaciones son `UPDATE` de `inicio`/`fin`).

## Fuera de alcance

- **Anticipación mínima para cancelar/reprogramar (Q2).** Sigue abierta en `knowledge-base/10_preguntas_abiertas.md` (prioridad Media, bloquea US-002) y `knowledge-base/05_reglas_de_negocio.md` §Excepciones globales lo dice explícito: "Anticipación mínima para cancelar/reprogramar: NO es regla todavía — va a preguntas abiertas". C-04 **no** valida ninguna ventana mínima.
- **Cambiar `profesional_id`, `sillon_id` o `prestacion_id` al reprogramar.** C-04 reprograma solo `inicio`; la reasignación de recursos queda como PA-1.
- Confirmación (`pendiente → confirmado`), `atendido`/`ausente`, notificaciones (C-07), lista de espera (C-06), `GET /agenda` (C-05), RBAC/JWT (C-11), auditoría de cancelaciones (PA-3).

## Preguntas abiertas

Ninguna se implementa en C-04; todas quedan para el PO/cátedra. **Si el PO las resuelve, PA-1 y PA-2 sí cambian el delta spec:** PA-1 porque el contrato de `reprogramar` pasaría a aceptar `profesional_id`/`sillon_id`/`prestacion_id`, y PA-2 porque agrega un 409 nuevo por anticipación mínima. **PA-4 y PA-5 también lo cambiarían** si se aceptan (nuevo rechazo por `inicio` en el pasado / nueva transición `cancelado → pendiente`). **PA-3** requeriría columnas nuevas y migración, así que sería un change aparte; **PA-6** es transversal y llega con C-11 sin tocar el contrato de C-04.

- **PA-1 — ¿Reprogramar puede reasignar profesional, sillón o prestación?** El KB (`07_flujos_principales.md` §Flujo 2) y `CHANGES.md:252` hablan solo de "nuevo inicio". C-04 asume que **no**. Si el PO habilita la reasignación, hay que decidir si es el mismo endpoint con body extendido o un "reasignar" aparte, y si cuenta como reprogramación para RN-TU-02.
- **PA-2 — Q2: ¿anticipación mínima para cancelar/reprogramar?** Sin dato en el informe; fuera de alcance (ver §Fuera de alcance). Si se define, agrega un 409 nuevo y cambia el delta spec.
- **PA-3 — ¿La cancelación debe registrar motivo, quién la hizo y cuándo?** `turnos` solo tiene `creado_por` (texto libre, decisión D6 de C-03) y el KB no pide auditoría de cancelación. C-04 no la implementa; requeriría columnas nuevas (`cancelado_en`, `cancelado_por`, `motivo`) y una migración.
- **PA-4 — ¿Debe rechazarse reprogramar a un `inicio` en el pasado?** No hay regla en `knowledge-base/05_reglas_de_negocio.md`; agregarla sería inventar negocio (ver S3). Hoy se acepta si pasa horario/bloqueo/solape.
- **PA-5 — ¿Un turno `cancelado` puede reactivarse?** RN-ES-01 no lista esa arista y D5 no la implementa. Si el negocio la necesita (p. ej. el paciente se arrepiente), es un change nuevo.
- **PA-6 — Q1: ¿quién puede cancelar/reprogramar?** La matriz de `03_actores_y_roles.md` dice recepción; sin auth en C-04, la restricción por rol llega con C-11.

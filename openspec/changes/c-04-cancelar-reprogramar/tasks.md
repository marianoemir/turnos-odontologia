# Tasks — cancelar-reprogramar (C-04)

> TDD estricto (red-green): por cada comportamiento, RED (test fallando contra código inexistente) → GREEN mínimo → TRIANGULATE (esperado + error de negocio + borde) → REFACTOR con suite verde. Solo datos ficticios (`DNI-FICT-*`, `MAT-FICT-*`). Sin commits/push sin pedido. Governance MEDIO.
>
> **Sin migración Alembic:** C-04 no toca el modelo ni la revisión `002_turno` (design.md D7). Si una tarea parece necesitar una migración, es señal de que se salió del alcance.
>
> **Estrategia de fixtures para estados no alcanzables por API:** no existe endpoint de confirmación, así que todo turno en `confirmado`, `atendido` o `ausente` se **inserta directo en la DB dentro del test** (por SQL `INSERT INTO turnos (...)` o por el modelo), igual que C-03 hace con `cancelado`/`ausente`. No se modifica el seed ni `conftest.py`.
>
> **Recuento (verificado 2026-10-31):** 18 escenarios en `specs/turnos/spec.md` (17 ADDED + 1 MODIFIED, sobre 10 requirements ADDED + 1 MODIFIED) · **33 tasks** · matriz de trazabilidad con las 18 filas · baseline de C-03 **80 passed** (`test_turno_servicio.py` = 18, `test_turnos_api.py` = 12, de los cuales 11 son `test_post_*`).

## 1. Base: baseline y fixtures de estados

- [ ] 1.1 Correr la suite actual y registrar el baseline antes de tocar código — **Verificación:** `CI=true pytest backend/tests -q` verde con **80 passed, 0 skipped** (medido el 2026-10-31); el número se anota en el resumen del apply y no debe bajar
- [ ] 1.2 RED→GREEN: helper de test `_insertar_turno(db_session, ids, *, estado, inicio, fin, profesional_id=None, sillon_id=None)` en `backend/tests/test_turno_servicio.py` que inserta un turno en un estado arbitrario sin pasar por el servicio — **Verificación:** test `test_helper_inserta_estado_confirmado` en `backend/tests/test_turno_servicio.py` (capa DB/fixture) con `assert turno.estado == "confirmado"`; sirve a los escenarios de `confirmado`/`atendido`/`ausente`
- [ ] 1.3 Verificar que `conftest.py` no necesita cambios (`_CATALOGO_TABLES` ya incluye `turnos`) — **Verificación:** `git diff --stat backend/tests/conftest.py` vacío y suite de 1.1 sigue verde

## 2. `ServicioTurnos.validar(..., excluir_turno_id=...)` (design.md D1)

- [ ] 2.1 RED: test `test_validar_sin_excluir_se_auto_colisiona` en `backend/tests/test_turno_servicio.py` que crea un turno 10:00–10:30 y llama a `ServicioTurnos.validar(...)` con el **mismo** `profesional_id`/`sillon_id` e `inicio` 10:15, esperando `ConflictoTurno` con `causa == "profesional"` (demuestra el bug que motiva el parámetro) — **Verificación:** capa servicio, `pytest.raises(ConflictoTurno)` + `assert exc.value.causa == "profesional"`
- [ ] 2.2 RED→GREEN: test `test_validar_excluye_el_turno_editado` que repite la llamada de 2.1 pasando `excluir_turno_id=turno.id` y espera que **no** levante excepción, devolviendo `fin == 10:45` — **Verificación:** capa servicio, `assert fin == datetime(2026,10,12,10,45,tzinfo=TZ)` y `assert "excluir_turno_id" in inspect.signature(ServicioTurnos.validar).parameters`; GREEN: agregar el keyword-only y `Turno.id != excluir_turno_id` en las dos consultas de solape
- [ ] 2.3 Regresión: `crear` no pasa `excluir_turno_id` y los **18** tests existentes de C-03 en `test_turno_servicio.py` siguen verdes — **Verificación:** `pytest backend/tests/test_turno_servicio.py -q` sin fallos nuevos (18 + los nuevos); `assert exc.value.causa == "profesional"` del test `test_solape_profesional_parcial_da_409` intacto

## 3. `ServicioTurnos.cancelar` (design.md D3/D5/D6)

- [ ] 3.1 RED→GREEN: `test_cancelar_pendiente_da_cancelado_y_conserva_intervalo` — crea un turno 10:00–10:30, cancela, espera `estado == "cancelado"`, `inicio`/`fin` sin cambios y la fila sigue existiendo — **Verificación:** capa servicio; `assert turno.estado == "cancelado"`, `assert turno.inicio == LUNES_10`, `assert db_session.query(Turno).count() == 1`
- [ ] 3.2 RED→GREEN: `test_cancelar_confirmado_ok` — turno insertado en `confirmado` por el helper de 1.2, cancelado → `cancelado` — **Verificación:** capa servicio; `assert turno.estado == "cancelado"` (turno `confirmado` creado por inserción directa, no por API)
- [ ] 3.3 RED→GREEN: `test_cancelar_atendido_da_409` y `test_cancelar_cancelado_da_409` — `pytest.raises(ConflictoTurno)` y el estado en DB no cambia — **Verificación:** capa servicio; `assert exc.value.causa == "transicion"` + `assert db_session.get(Turno, id).estado == "atendido"` / `== "cancelado"`
- [ ] 3.4 RED→GREEN: `test_cancelar_turno_inexistente_da_404` — `pytest.raises(TurnoNoEncontrado)` con `recurso == "turno"` y `ref_id == uuid4()` — **Verificación:** capa servicio; `assert db_session.query(Turno).count() == 0`
- [ ] 3.5 RED→GREEN: `test_cancelar_libera_el_slot_da_201` (RN-TU-01, prueba de que las `EXCLUDE` parciales excluyen `cancelado`) — crea 10:00–10:30, cancela, vuelve a crear el **mismo** intervalo con `ServicioTurnos.crear` — **Verificación:** capa servicio; `assert nuevo.estado == "pendiente"` y `assert db_session.query(Turno).count() == 2` (una `cancelado` + una `pendiente`), sin `IntegrityError`

## 4. `ServicioTurnos.reprogramar` (design.md D2/D3)

- [ ] 4.1 RED→GREEN: `test_reprogramar_recalcula_fin_y_conserva_el_resto` — turno 10:00–10:30 con prestación 30 min; reprogramar a 11:00 → `inicio == 11:00`, `fin == 11:30`, mismo `id`/`paciente_id`/`profesional_id`/`sillon_id`/`prestacion_id` y `estado == "pendiente"` — **Verificación:** capa servicio; `assert turno.fin == datetime(2026,10,12,11,30,tzinfo=TZ)` y `assert turno.estado == "pendiente"`
- [ ] 4.2 RED→GREEN: `test_reprogramar_libera_el_inicio_original` — tras 4.1, `crear` en 10:00–10:30 para el mismo profesional y sillón → creado — **Verificación:** capa servicio; `assert db_session.query(Turno).count() == 2`, ninguno solapado
- [ ] 4.3 RED→GREEN: `test_reprogramar_solape_profesional_da_409_original_intacto` — turno A 10:00–10:30 (P1/S1) y turno B 11:00–11:30 (P1/S2); reprogramar A a 11:15 → `ConflictoTurno` causa `profesional` y A sigue en 10:00–10:30 — **Verificación:** capa servicio; `assert exc.value.causa == "profesional"` + `assert (turno.inicio, turno.fin) == (10:00, 10:30)` por DB directa (RN-TU-02)
- [ ] 4.4 RED→GREEN: `test_reprogramar_solape_sillon_da_409_original_intacto` — turno A 10:00–10:30 (P1/S1) y turno B 11:00–11:30 (P2/S1); reprogramar A a 11:15 → causa `sillon` y A intacto — **Verificación:** capa servicio; `assert exc.value.causa == "sillon"` + `assert turno.inicio == LUNES_10`
- [ ] 4.5 RED→GREEN (borde): `test_reprogramar_adyacencia_inicio_igual_fin_da_200` — turno B 11:00–11:30 (P1/S1), turno A 10:00–10:30 reprogramado a 11:30 → `inicio == 11:30`, `fin == 12:00`, sin excepción (RN-AG-04, rango `[inicio,fin)`) — **Verificación:** capa servicio; `assert turno.fin == datetime(2026,10,12,12,0,tzinfo=TZ)`
- [ ] 4.6 RED→GREEN (borde): `test_reprogramar_intervalo_identico_da_409` — mismo escenario que 4.5 pero reprogramando A a 11:00 → causa `profesional` y A sigue en 10:00–10:30 — **Verificación:** capa servicio; `assert exc.value.causa == "profesional"` + `assert turno.inicio == LUNES_10`
- [ ] 4.7 RED→GREEN: `test_reprogramar_cancelado_da_409` — turno insertado en `cancelado` (helper 1.2); reprogramar a 11:00 (slot libre, dentro de horario) → `ConflictoTurno` causa `transicion` y el turno sigue `cancelado` con `inicio` 10:00 — **Verificación:** capa servicio; `assert exc.value.causa == "transicion"` + `assert turno.inicio == LUNES_10`; confirma que la transición se evalúa **antes** que la validación de agenda (design.md D3)
- [ ] 4.8 RED→GREEN: `test_reprogramar_turno_inexistente_da_404` — `pytest.raises(TurnoNoEncontrado)` con `recurso == "turno"` — **Verificación:** capa servicio; `assert db_session.query(Turno).count() == 0`
- [ ] 4.9 Regresión RN-TU-02 con reglas de crear: `test_reprogramar_fuera_de_horario_da_409_original_intacto` y `test_reprogramar_sobre_bloqueo_da_409_original_intacto` — reprogramar a un sábado 10:00 y al 25-dic 10:00 (bloqueo del seed) → causa `horario` / `bloqueo`, original intacto — **Verificación:** capa servicio; `assert exc.value.causa == "horario"` / `== "bloqueo"` + `assert turno.inicio == LUNES_10`

## 5. Red defensiva `23P01` → 409 (design.md D4)

- [ ] 5.1 RED→GREEN: `test_traducir_23p01_profesional_a_conflicto` — dentro de `with session.begin_nested():` ejecutar un `UPDATE turnos SET inicio=..., fin=...` directo que solape otro turno activo del mismo profesional; capturar el `IntegrityError` real de Postgres (`sqlstate == "23P01"`, `diag.constraint_name == "ex_turnos_profesional_sin_solape"`), pasarlo por la función de traducción del servicio y esperar `ConflictoTurno(causa="profesional")` — **Verificación:** capa servicio + DB real; `assert exc.orig.sqlstate == "23P01"`, `assert traducida.causa == "profesional"`; el savepoint permite seguir usando `db_session` tras el error
- [ ] 5.2 RED→GREEN: `test_traducir_23p01_sillon_a_conflicto` — ídem con `ex_turnos_sillon_sin_solape` (otro profesional, mismo sillón) → `causa == "sillon"` — **Verificación:** capa servicio + DB real; `assert traducida.causa == "sillon"`
- [ ] 5.3 RED→GREEN: `test_traducir_23514_no_se_convierte_en_409` — provocar un `CHECK` (`fin <= inicio`) por `UPDATE` directo en savepoint y verificar que la traducción **re-lanza** el `IntegrityError` en vez de devolver un `ConflictoTurno` — **Verificación:** capa servicio + DB real; `assert exc.orig.sqlstate == "23514"` y `pytest.raises(IntegrityError)` alrededor de la traducción (un bug no debe volverse 409)

## 6. Endpoints `POST /turnos/{id}/cancelar` y `/reprogramar` (design.md D8/D9)

- [ ] 6.1 RED→GREEN: `TurnoReprogramar` en `backend/app/turnos/schemas.py` (`inicio: AwareDatetime`, `extra="ignore"`) y rutas en `router.py`; test `test_cancelar_da_200_y_libera_slot` en `backend/tests/test_turnos_api.py` — POST 201 para crear, POST `/turnos/{id}/cancelar` → 200 con `estado == "cancelado"`, luego POST `/turnos` en el mismo intervalo → 201 — **Verificación:** capa API (`TestClient`); `assert r.status_code == 200`, `assert r.json()["estado"] == "cancelado"`, `assert segundo.status_code == 201`
- [ ] 6.2 RED→GREEN: `test_cancelar_confirmado_da_200` (turno `confirmado` insertado directo) y `test_cancelar_atendido_da_409` / `test_cancelar_inexistente_da_404` en `backend/tests/test_turnos_api.py` — **Verificación:** capa API; `assert r.status_code == 200` / `== 409` / `== 404` y por DB directa `assert turno.estado == "atendido"`
- [ ] 6.3 RED→GREEN: `test_reprogramar_da_200_fin_recalculado` — `POST /turnos/{id}/reprogramar` con `{"inicio": "2026-10-12T11:00:00-03:00"}` → 200 con `fin == "2026-10-12T11:30:00-03:00"` y `estado == "pendiente"` — **Verificación:** capa API; `assert r.json()["fin"] == "2026-10-12T11:30:00-03:00"`
- [ ] 6.4 RED→GREEN: `test_reprogramar_solape_da_409_original_intacto` — solape de profesional → 409 con `detail.causa == "profesional"` y `detalle` no vacío; por DB directa el turno sigue en 10:00–10:30 — **Verificación:** capa API; `assert r.json()["detail"]["causa"] == "profesional"` + `assert turno.inicio == LUNES_10`
- [ ] 6.5 RED→GREEN (borde de input): `test_reprogramar_sin_inicio_da_422` (body `{}`) y `test_reprogramar_inicio_naive_da_422` (`"2026-10-12T11:00:00"`) → 422 y turno intacto — **Verificación:** capa API; `assert r.status_code == 422` + `assert turno.inicio == LUNES_10` por DB directa
- [ ] 6.6 RED→GREEN: `test_reprogramar_23p01_da_409_no_500` — con el turno conflictivo **ya insertado** en la DB (otro turno activo del mismo profesional que solapa el nuevo `inicio`), monkeypatch de **`ServicioTurnos.validar`** por un stub que omite **solo** el chequeo de solape y devuelve el `fin` recalculado (`nuevo_inicio + prestacion.duracion_min`); así `reprogramar` llega al `UPDATE` real y es la `EXCLUDE` de Postgres la que dispara un `IntegrityError` auténtico (`sqlstate="23P01"`, `diag.constraint_name="ex_turnos_profesional_sin_solape"`), que el servicio traduce a `ConflictoTurno("profesional", ...)` → la API responde 409 y **nunca** 500 — **Verificación:** capa API; `assert r.status_code == 409`, `assert r.json()["detail"]["causa"] == "profesional"` y por DB directa `assert (turno.inicio, turno.fin) == (LUNES_10, LUNES_10 + timedelta(minutes=30))` (el `SAVEPOINT` revirtió el `UPDATE`). El monkeypatch **no** reemplaza `reprogramar`: reemplazarlo probaría la traducción pero no el camino de escritura
- [ ] 6.7 Regresión: `test_post_*` de C-03 (11 tests) siguen verdes y `GET /health` sigue respondiendo 200 sin `DATABASE_URL` — **Verificación:** `pytest backend/tests/test_turnos_api.py -q` verde; `assert client.get("/health").json() == {"status": "ok"}`

## 7. Integración

- [ ] 7.1 Suite completa con PG real y 0 skips — **Verificación:** `CI=true pytest backend/tests -q` verde; el total debe ser **80 + los tests nuevos de C-04** (baseline medido: 80 passed), 0 skipped (fail-fast sin Postgres activo)
- [ ] 7.2 Lint y contrato OpenSpec — **Verificación:** `ruff check backend/` verde y `openspec validate c-04-cancelar-reprogramar --strict` verde
- [ ] 7.3 Sin migración ni cambios de esquema — **Verificación:** `git status backend/alembic/ backend/app/turnos/models.py backend/app/agenda/ backend/app/seed/` vacío

## Matriz de trazabilidad escenario → verificación

| Escenario del delta spec | Tipo | Tarea | Test | Capa | Assertion clave |
|---|---|---|---|---|---|
| Cancelar turno pendiente | esperado | 3.1, 6.1 | `test_cancelar_pendiente_da_cancelado_y_conserva_intervalo` / `test_cancelar_da_200_y_libera_slot` | servicio / API | `estado == "cancelado"`, `inicio` y `fin` sin cambios, fila sigue existiendo |
| Cancelar turno confirmado | esperado | 3.2, 6.2 | `test_cancelar_confirmado_ok` / `test_cancelar_confirmado_da_200` | servicio / API | `estado == "cancelado"` (turno `confirmado` por inserción directa) |
| Cancelar turno atendido | error de negocio | 3.3, 6.2 | `test_cancelar_atendido_da_409` | servicio / API | `causa == "transicion"` / HTTP 409 y `estado == "atendido"` |
| Cancelar turno ya cancelado | error de negocio | 3.3 | `test_cancelar_cancelado_da_409` | servicio | `causa == "transicion"`, `estado == "cancelado"` |
| Cancelar turno inexistente | error | 3.4, 6.2 | `test_cancelar_turno_inexistente_da_404` / `test_cancelar_inexistente_da_404` | servicio / API | `TurnoNoEncontrado(recurso="turno")` / HTTP 404, conteo de `turnos` igual |
| Reprogramar turno inexistente | error | 4.8 | `test_reprogramar_turno_inexistente_da_404` | servicio | `TurnoNoEncontrado(recurso="turno")`, conteo igual |
| Slot liberado y reutilizable | esperado (RN-TU-01) | 3.5, 6.1 | `test_cancelar_libera_el_slot_da_201` / `test_cancelar_da_200_y_libera_slot` | servicio / API | segundo `crear`/`POST` da 201, `count == 2` (uno `cancelado`, uno `pendiente`) |
| Reprogramar sin conflicto | esperado | 4.1, 6.3 | `test_reprogramar_recalcula_fin_y_conserva_el_resto` / `test_reprogramar_da_200_fin_recalculado` | servicio / API | `inicio == 11:00`, `fin == 11:30`, ids y `estado` conservados |
| Reprogramar libera el horario original | esperado | 4.2 | `test_reprogramar_libera_el_inicio_original` | servicio | `crear` en 10:00–10:30 → 201, `count == 2` |
| Solape de profesional al reprogramar | error de negocio (RN-TU-02) | 4.3, 6.4 | `test_reprogramar_solape_profesional_da_409_original_intacto` / `test_reprogramar_solape_da_409_original_intacto` | servicio / API | `causa == "profesional"` y `(inicio, fin) == (10:00, 10:30)` |
| Solape de sillón al reprogramar | error de negocio (RN-TU-02) | 4.4 | `test_reprogramar_solape_sillon_da_409_original_intacto` | servicio | `causa == "sillon"` y `inicio == 10:00` |
| Nuevo inicio igual al fin de otro turno | borde aceptado (RN-AG-04) | 4.5 | `test_reprogramar_adyacencia_inicio_igual_fin_da_200` | servicio | sin excepción, `fin == 12:00` |
| Nuevo intervalo idéntico a otro activo | borde rechazado | 4.6 | `test_reprogramar_intervalo_identico_da_409` | servicio | `causa == "profesional"`, original en 10:00 |
| Reprogramar turno cancelado | error de negocio (RN-ES-01) | 4.7 | `test_reprogramar_cancelado_da_409` | servicio | `causa == "transicion"`, `estado == "cancelado"`, `inicio == 10:00` |
| Reprogramar sin `inicio` | borde de input | 6.5 | `test_reprogramar_sin_inicio_da_422` | API | HTTP 422, turno intacto |
| Reprogramar con `inicio` sin zona | borde de input | 6.5 | `test_reprogramar_inicio_naive_da_422` | API | HTTP 422, turno intacto |
| Violación de exclusion constraint → 409 | borde de concurrencia | 5.1, 5.2, 5.3, 6.6 | `test_traducir_23p01_*` / `test_reprogramar_23p01_da_409_no_500` (stub de `validar` sin solape + `UPDATE` real) | servicio+DB real / API | `sqlstate == "23P01"` → `ConflictoTurno`; HTTP 409, nunca 500, turno intacto |
| Estado inicial siempre pendiente (MODIFIED) | regresión C-03 | 2.3, 6.7 | `test_post_valido_da_201_pendiente` (existente) | API | `estado == "pendiente"` |

## Workflow follow-up

- Esperar revisión del usuario de proposal/specs/design/tasks; NO pasar a Apply sin pedido explícito.
- Al aplicar: no tocar `backend/alembic/`, `backend/app/turnos/models.py`, `backend/app/seed/` ni `backend/tests/conftest.py` (design.md D7 y tarea 7.3).
- Tras implementar y con la suite verde: archivar con `/opsx:archive c-04-cancelar-reprogramar` y recién entonces marcar `[ ]`→`[x]` el bloque C-04 de `CHANGES.md`.

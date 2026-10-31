# Proposal — cancelar-reprogramar (C-04)

## Why

C-03 dejó la agenda capaz de **crear** turnos sin solapamiento, pero un turno creado no puede salir del estado `pendiente`: si el paciente avisa que no viene, el horario queda tomado para siempre y el hueco es irrecuperable. Sin US-002 el núcleo "agenda sin solapamientos" no cierra su ciclo de vida y el TP no demuestra el recorte C-01 → C-02 → C-03 → C-04.

C-04 habilita cancelar (pendiente/confirmado → cancelado) y reprogramar (mismo turno, nuevo `inicio`), aplicando RN-TU-01 (cancelado/ausente libera profesional y sillón), RN-TU-02 (reprogramar valida igual que crear y si falla conserva el original) y RN-ES-01 (máquina de estados). El núcleo ya está: las dos `EXCLUDE` parciales de la revisión 002 hacen que poner `estado = 'cancelado'` saque la fila del predicado y libere el slot **sin borrar nada ni tocar índices**.

## What Changes

- **`ServicioTurnos.validar` gana `excluir_turno_id: UUID | None = None`.** Hoy `validar` no excluye al turno que se edita, así que una reprogramación que reutilice `validar` colisionaría siempre consigo misma. El parámetro excluye ese `id` de las dos consultas de solape; `crear` lo deja en `None` y el comportamiento de C-03 queda idéntico.
- **`ServicioTurnos.cancelar(session, turno_id)`**: carga el turno (404 si no existe), valida RN-ES-01 (solo `pendiente`/`confirmado`; `atendido`/`ausente`/`cancelado` → 409), cambia `estado` a `cancelado` y devuelve el turno. No borra, no toca `inicio`/`fin`.
- **`ServicioTurnos.reprogramar(session, turno_id, nuevo_inicio)`**: carga el turno (404), valida la transición (solo `pendiente`/`confirmado` → 409 en el resto), recalcula `fin = nuevo_inicio + prestacion.duracion_min` reutilizando `validar(..., excluir_turno_id=turno_id)` (RN-TU-02, mismas reglas que crear) y solo si todo pasa escribe `inicio`/`fin`. Un 409 deja el turno original intacto.
- **`POST /turnos/{turno_id}/cancelar`** → 200 con el turno en `cancelado` | 404 turno inexistente | 409 transición inválida.
- **`POST /turnos/{turno_id}/reprogramar`** (body `{"inicio": <aware datetime>}`) → 200 con `inicio`/`fin` nuevos | 404 | 409 conflicto (`profesional`/`sillon`/`horario`/`bloqueo`) o transición inválida | 422 input inválido.
- **`ConflictoTurno` gana la causa `"transicion"`** (junto a `horario`/`bloqueo`/`profesional`/`sillon` de C-03). Se lanza desde `cancelar` y `reprogramar` cuando el estado actual no admite la operación según RN-ES-01 y `07_flujos_principales.md` §Flujo 2 (`atendido`/`ausente`/`cancelado` → 409). Su `detalle` es texto humano con el estado actual y la regla, que el router expone sin cambios en `detail.detalle` del 409.
- **Mapeo defensivo `IntegrityError` SQLSTATE `23P01` → 409.** Hoy no existe manejo de `IntegrityError` en el código de aplicación: una violación de `ex_turnos_profesional_sin_solape` / `ex_turnos_sillon_sin_solape` que escape a la pre-validación (carrera TOCTOU entre el `SELECT` de solape y el `UPDATE`) produciría un 500, violando la regla dura "NUNCA 200/500 ante conflicto de negocio → 409".
- **Schemas nuevos** `TurnoCancelarOut` (reusa `TurnoOut`) y `TurnoReprogramar` (solo `inicio`, `extra="ignore"`, `AwareDatetime`).
- **Tests pytest TDD (red-green)** en `backend/tests/test_turno_servicio.py` (unidad de servicio) y `backend/tests/test_turnos_api.py` (API), más el caso `23P01`.

## Capabilities

### New Capabilities

- (ninguna — C-04 extiende la capability existente `turnos`, tal como anticipó C-03 en su proposal.)

### Modified Capabilities

- `turnos`: se **agregan** requirements de cancelación (pendiente/confirmado → cancelado, 409 en estados finales, 404 turno inexistente), de liberación verificable del horario tras cancelar, de reprogramación (fin recalculado, borde de adyacencia `[inicio,fin)`, 409 con original intacto, 409 por transición inválida) y de la red `23P01` → 409. Se **modifica** el requirement "Estados solo con enum y default pendiente", que hoy declara que `POST /turnos` "no implementa transiciones (son de C-04)": a partir de C-04 las transiciones de cancelación/reprogramación sí existen y quedan acotadas a RN-ES-01.

## Non-goals (explícito — fuera de C-04)

- **Cambiar `profesional_id`, `sillon_id` o `prestacion_id` al reprogramar.** C-04 reprograma **solo `inicio`** (y recalcula `fin` desde la prestación del turno, ver `CHANGES.md:252` "valida nuevo inicio igual que crear"). Reasignar recursos queda como pregunta abierta en `design.md`.
- **Anticipación mínima para cancelar/reprogramar (Q2).** Sigue abierta en `knowledge-base/10_preguntas_abiertas.md`; el KB 05 lo dice explícito: "Anticipación mínima para cancelar/reprogramar: NO es regla todavía".
- **Endpoint de confirmación (`pendiente → confirmado`).** No está en `CHANGES.md` §C-04 ni en US-002; los tests de C-04 que necesitan un turno `confirmado` lo insertan directo en la DB (ver `tasks.md`).
- **Hard delete de turnos.** Cancelar es cambio de estado (RN-ES-01, regla dura del proyecto).
- **Notificaciones / WhatsApp / aviso al paciente.** C-07.
- **Lista de espera y ofrecimiento del hueco liberado (US-004).** C-06; depende de C-04 pero no entra acá.
- **`GET /agenda` y lectura de turnos.** C-05. Los tests verifican por DB directa y por el body de respuesta del propio `POST`.
- **JWT / RBAC por rol (C-11).** C-04 queda sin auth, igual que C-03; la matriz de `03_actores_y_roles.md` (recepción cancela/reprograma) se aplica recién en C-11.
- **Redis / async / frontend.** Posteriores.

## Impact

- **Código nuevo/modificado:** `backend/app/turnos/service.py` (parámetro `excluir_turno_id`, `cancelar`, `reprogramar`), `backend/app/turnos/schemas.py` (`TurnoReprogramar`), `backend/app/turnos/router.py` (2 endpoints + mapeo `23P01` → 409), `backend/app/main.py` (solo si el mapeo se implementa como exception handler global).
- **Sin migración Alembic:** C-04 no agrega columnas, constraints ni índices. El modelo `turnos` de la revisión 002 ya soporta todo (`ck_turnos_estado_valido` incluye `cancelado`, las `EXCLUDE` son parciales sobre `pendiente`/`confirmado`).
- **Sin cambios en** `backend/app/agenda/models.py`, `backend/app/seed/catalogo.py`, `backend/app/turnos/models.py`, `docker-compose.yml`, `.github/workflows/tests.yml`, `backend/tests/conftest.py`.
- **Tests:** `backend/tests/test_turno_servicio.py` y `backend/tests/test_turnos_api.py` (se agregan casos, no se reescriben los de C-03).
- **Breaking:** ninguno. `validar` gana un keyword-only con default, así que los llamados de C-03 no cambian.

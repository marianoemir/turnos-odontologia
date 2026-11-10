# Tasks — reserva-online (C-08)

## 1. Verificación previa y esquema

- [x] 1.1 Verificar el head de Alembic ubicando `backend/alembic.ini` (no asumir `backend/`) y, desde ese directorio, ejecutar `alembic heads`, `alembic current` y `alembic upgrade head` hasta `008_recordatorio`, y, vía MCP `postgres`, confirmar `turnos` (`EXCLUDE` parciales sobre `pendiente`/`confirmado`) y `pacientes.dni UNIQUE`. La base local está en `005_caja_pagos`; antes de testear debe llevarse a `008_recordatorio`. Verificación: salidas de `alembic heads`/`alembic current`/`alembic upgrade head` y descripciones de `postgres_get_object_details` coinciden con los modelos y `alembic_version = 008_recordatorio`. Si el head difiere, frenar y corregir el plan.

## 2. Servicio de slots

- [x] 2.1 Escribir `backend/tests/test_reserva_servicio.py` (RED) para `ServicioReservaOnline.slots`: día libre devuelve lista ordenada dentro del horario; turno activo excluye sus solapados; bloqueo aplicable excluye; sábado sin horario devuelve `[]`; cancelado/ausente no excluyen (RN-TU-01); sin `nombre/dni/contacto` de terceros. Verificación: los tests fallan por módulo ausente y cubren los escenarios "Slots libres de un día laboral", "Slot ocupado no se ofrece", "Bloqueo excluye slots" y "Día sin horario devuelve vacío" de `specs/reserva-online/spec.md`.
- [x] 2.2 Implementar `backend/app/reserva_online/__init__.py`, `service.py` (enumeración D2 + filtro solo vía `ServicioTurnos.validar`: cada candidato se evalúa con cada sillón activo vía `ServicioTurnos.validar` sin usar `_cubierto_por_horario`/`_bloqueo_aplicable` directamente) y `schemas.py` (respuesta de slots como lista de objetos `{inicio, fin}` ordenada ascendente). Verificación: los tests de 2.1 quedan en verde y `ServicioTurnos.validar` no se modifica.

## 3. Alta pública

- [x] 3.1 Escribir en `backend/tests/test_reserva_servicio.py` los tests RED del alta: 201 `pendiente` con `fin = inicio + duracion` (RN-AG-01) y respuesta 201 con solo `{turno_id, profesional_id, prestacion_id, inicio, fin, estado}`; solape profesional → 409 `profesional`; todos los sillones activos ocupados → 409 `sillon`; fuera de horario → 409 `horario`; borde `inicio==fin` → 201 (RN-AG-04); `inicio` naive → 422; dni nuevo crea paciente; dni existente (aun con nombre distinto) reutiliza el paciente ignorando el nombre enviado sin 422 y con respuesta idéntica en ambos casos; conteo por DB directa que el dni existente no crea otro paciente. Verificación: los tests fallan por método ausente y cubren "Reserva válida crea pendiente", "Solape profesional por alta pública", "Todos los sillones ocupados responden 409 sillon", "Fuera de horario por alta pública", "Inicio igual al fin de otro turno", "Inicio sin zona horaria" y "DNI existente reutiliza paciente sin crear otro".
- [x] 3.2 Implementar `ServicioReservaOnline.crear_reserva` delegando en `ServicioTurnos.crear` (alta de/reúso de paciente por `dni` según D4 y asignación determinista de sillón según D5). Verificación: los tests de 3.1 quedan en verde; ningún turno se crea en error (conteo por DB directa no cambia) y `backend/app/turnos/service.py` no se toca.

## 4. API pública, rate limit y RBAC

- [x] 4.1 Escribir `backend/tests/test_reserva_api.py` (RED) que cubra: `GET /reservar/{profesional}?prestacion=&fecha=` 200 sin `X-Actor-Rol` con lista de objetos `{inicio, fin}` ordenada ascendente; `POST /reservar` 201 sin header `X-Actor-Rol` con solo `{turno_id, profesional_id, prestacion_id, inicio, fin, estado}` (sin `sillon_id`, `paciente_id` ni datos del paciente); profesional inexistente 404; prestación inexistente 404; `fecha` inválida en GET → 422; body incompleto en POST → 422; 429 `rate_limit` al superar el umbral; usos de C-07 sobre un turno creado por reserva (confirmar/cancelar por token existente sin cambios); hueco liberado tras cancelar vuelve a listarse como slot. Verificación: los tests fallan por router ausente y cubren "Reserva sin header de rol", "Consulta sin header de rol", "Profesional inexistente", "Prestación inexistente", "Fecha inválida en GET", "Body incompleto en POST" y "Umbral superado bloquea el alta".
- [x] 4.2 Implementar `backend/app/reserva_online/router.py` con `GET /reservar/{profesional}` y `POST /reservar`, `get_db` local (D3: sin dependencia RBAC), rate limiter por IP en memoria con umbral/ventana por env (D6) y mapeo 409/422/404/429; registrar el router en `backend/app/main.py` y agregar defaults ficticios de `RESERVA_RATE_LIMIT_N`/`VENTANA_SEG` a `.env.example` sin valores reales. Verificación: los tests de 4.1 quedan en verde y `GET /health` sigue 200.
- [ ] 4.3 Documentar la reserva pública en `README.md` (rutas, `inicio` aware, 409 causas, 429) y dejar registradas las preguntas abiertas Q-C08-01…11 de `design.md` como pendientes de OK antes de apply. Verificación: revisión manual del diff del `README.md`.

## 5. Verificación final

- [ ] 5.1 Correr la suite completa desde la RAÍZ con `pytest backend/tests -p no:randomly -q --tb=short` y `openspec validate c-08-reserva-online --strict`. Aclarar que sin `DATABASE_URL` los tests de DB se saltean y reportar los conteos `passed`/`skipped`. Verificación: `passed`/`skipped` reportados y la validación sin issues.
- [ ] 5.2 Correr `ruff check backend/` y verificar que `POST /turnos`, `GET /agenda` y `POST /confirmar|/cancelar/{token}` siguen en verde (sin regresión en C-03/C-05/C-07). Verificación: salida de ruff limpia y conteo de tests sin fallos.

## Workflow follow-up

- Marcar `[x]` C-08 en `CHANGES.md` tras archivar (sección `[C-08]` y resumen de estado).
- Sincronizar `AGENTS.md` y `CLAUDE.md` (idénticos) y `knowledge-base/03_actores_y_roles.md` §Rutas públicas (crear `GET/POST /reservar` públicas) y `knowledge-base/06_funcionalidades.md` Épica 5 (US-006 implementada).
- Archivar el change cuando la revisión del proyecto esté satisfecha y los tests en verde; verificar el resultado archivado (`reserva-online` en `openspec/specs/`).

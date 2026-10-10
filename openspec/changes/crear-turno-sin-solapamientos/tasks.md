# Tasks — crear-turno-sin-solapamientos (C-03)

> TDD estricto (skill `tdd`): por cada comportamiento, RED (test fallando contra código inexistente) → GREEN mínimo → TRIANGULATE (happy + borde/error) → REFACTOR con suite verde. Solo datos ficticios (`DNI-FICT-*`, `MAT-FICT-*`). Sin commits/push sin pedido. Governance CRITICO: checkpoints, sin atajos.

## 1. Base: fixture + safety net

- [ ] 1.1 Extender `TRUNCATE` de `backend/tests/conftest.py` con `turnos` y verificar que la suite actual sigue en verde (`pytest backend/tests` con PG real; sin PG: skips motivados, y con `CI=true` falla fail-fast sin skips)
- [ ] 1.2 Safety net: correr la suite completa y registrar el baseline ("N tests passing") antes de tocar código nuevo, y verificar `GET /health` responde 200 sin `DATABASE_URL`
- [ ] 1.3 RED→GREEN: test que verifica `ZoneInfo("America/Argentina/Buenos_Aires")` resuelve sin base tz del sistema (red-green verificable: falla sin `tzdata` en Windows, pasa con `tzdata` en `backend/requirements.txt` instalado); GREEN: `tzdata` en requirements + verificar el test pasa en Windows y Linux

## 2. Modelo Turno + revisión 002 (red-green por constraint)

- [ ] 2.1 RED: test de modelo que persiste un `Turno` válido (verificar `fin`, default `pendiente`, FKs) y falla por módulo inexistente; GREEN: `backend/app/turnos/models.py` con `Turno` (`inicio/fin timestamptz NOT NULL`, `CHECK fin>inicio`, enum+default `pendiente`, `creado_por TEXT NULL`, 4 FKs `RESTRICT`) y verificar el test pasa
- [ ] 2.2 RED: tests de `CHECK fin>inicio` y `CHECK estado IN (...)` (inserción directa inválida rechazada) que fallan sin tabla; GREEN: revisión Alembic `002_turno` (`CREATE EXTENSION IF NOT EXISTS btree_gist` + tabla + 2 `EXCLUDE USING gist` con `tstzrange(inicio,fin,'[)')` + `WHERE estado IN ('pendiente','confirmado')` + índices parciales + `(paciente_id,inicio)`) y verificar `alembic upgrade head / downgrade -1 / upgrade head` limpio + tests en verde
- [ ] 2.3 RED→GREEN: test que inserta por SQL directo (bypass del servicio) dos turnos activos solapados del mismo profesional y otro par del mismo sillón con distinto profesional, y verifica que PostgreSQL rechaza ambas inserciones por violación de exclusion constraint (red de seguridad D2/D4)

## 3. ServicioTurnos.crear + validar (red-green por regla, orden congelado §design)

- [ ] 3.1 RED: test `fin = inicio + duracion_min` calculada en servidor (cliente envía `fin` distinto → se ignora) que falla sin servicio; GREEN: `ServicioTurnos.crear/validar` con cálculo de `fin` y verificar el test pasa
- [ ] 3.2 RED→GREEN: tests de solape profesional → 409 causa `profesional` (happy: solape parcial; triangulate: contenido total + adyacencia exacta `inicio==fin` → 201 por RN-AG-04)
- [ ] 3.3 RED→GREEN: tests de solape sillón con otro profesional → 409 causa `sillon` (triangulate: mismo profesional mismo sillón contenido total)
- [ ] 3.4 RED→GREEN: tests fuera de horario → 409 `horario` (sábado; lunes 18:30; triangulate: precedencia `horario` sobre `sillon` cuando fallan ambas) y sobre bloqueo aplicable → 409 `bloqueo` (global del seed 24–26 dic 2026; triangulate: bloqueo solo-sillón no aplicable al otro sillón)
- [ ] 3.5 RED→GREEN: tests sin `sillon_id` → 422, sillón inactivo → 422, FK bien formada inexistente → 404, body inválido (tipos/datetime naive) → 422; verificar formato exacto `{"detail": {"causa": ..., "detalle": ...}}`
- [ ] 3.6 RED→GREEN: test RN-06 — turno cancelado creado DENTRO del test (vía inserción directa, seed intacto) libera el slot → crear mismo profesional+sillón+intervalo responde creado; verificar el seed `catalogo.py` no se modifica (`git status` limpio en ese archivo)
- [ ] 3.7 RED→GREEN: test de atomicidad — ante cada 409 el conteo de `turnos` por DB directa no cambia (rollback, nada creado)

## 4. POST /turnos + integración API

- [ ] 4.1 RED: tests API (`TestClient`/`httpx`) — body válido → 201 `pendiente`; solape profesional → 409 `profesional`; solape sillón → 409 `sillon`; sin sillón → 422; fuera de horario → 409 `horario`; sobre bloqueo → 409 `bloqueo`; que fallan sin router; GREEN: schemas Pydantic (sin `fin` en entrada) + router montado en `main.py` + mapeo de errores, y verificar tests API en verde
- [ ] 4.2 Integración: verificar suite completa en verde con PG real (`CI=true pytest backend/tests`, 0 skips), `ruff check backend/` verde, `GET /health` sin DB intacto, y `openspec validate` del change en verde

## Workflow follow-up

- Esperar revisión del usuario de proposal/design/specs/tasks; NO pasar a Apply sin pedido explícito.
- Tras implementar: archivar con `/opsx:archive crear-turno-sin-solapamientos` y marcar `[ ]`→`[x]` de C-03 en `CHANGES.md`.

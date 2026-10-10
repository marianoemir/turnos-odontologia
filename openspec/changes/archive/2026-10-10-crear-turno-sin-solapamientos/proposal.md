# Proposal — crear-turno-sin-solapamientos (C-03)

## Why

Este es el change evaluado del TP: el núcleo "agenda sin solapamientos" (US-001) sobre el recorte C-01 → C-02 → C-03. C-01 dejó la base testeable y C-02 el catálogo con seed ficticio; sin C-03 no hay creación de turnos y el TP no demuestra nada. Cierra el recorte mínimo con `POST /turnos` validado (RN-AG-01..05, RN-ES-02) en backend FastAPI + pytest.

## What Changes

- Modelo SQLAlchemy `Turno` en `backend/app/turnos/models.py`: 4 FKs (`paciente_id`, `profesional_id`, `sillon_id NOT NULL`, `prestacion_id`), `inicio`/`fin` `timestamptz NOT NULL` con `CHECK (fin > inicio)`, `estado` con `CHECK IN ('pendiente','confirmado','atendido','ausente','cancelado')` + default `pendiente`, `creado_por` texto libre nullable.
- `ServicioTurnos.crear(...)` como único punto de validación con método interno `validar(...)` reutilizable por C-04: calcula `fin = inicio + prestacion.duracion_min` en servidor, aplica el orden de validación congelado (ver design.md) y devuelve 201 en `pendiente` o 409 con causa / 404 / 422 según el caso.
- `POST /turnos` (FastAPI): 201 turno en `pendiente` | 409 `{"detail": {"causa": "profesional|sillon|horario|bloqueo", ...}}` atómico (nada creado) | 422 input inválido / sillón ausente o inactivo | 404 FK bien formada pero inexistente. Sin endpoints de lectura (ver Non-goals).
- Alembic revisión `002_turno`: `CREATE EXTENSION IF NOT EXISTS btree_gist` + tabla `turnos` + 2 restricciones `EXCLUDE USING gist` (profesional y sillón, solo estados activos, intervalo `[inicio,fin)`) como red de seguridad + índices de apoyo; upgrade/downgrade limpios.
- Tests pytest TDD (red-green por comportamiento): los 8 de CHANGES §C-03 + reutilización tras cancelado (RN-06) + `fin` calculada en servidor + rechazo a nivel DB por inserción directa solapada (exclusion constraint) + `GET /health` sin DB intacto. Fixture `TRUNCATE` extendida con `turnos`. Seed `catalogo.py` SIN cambios (el turno cancelado de RN-06 se crea dentro del test).

## Capabilities

### New Capabilities

- `turnos`: creación de turnos sin solapamiento por profesional ni por sillón en `[inicio,fin)` con horario/bloqueo/estados (US-001, RN-AG-01..05, RN-ES-02, RN-TU-01 solo-lectura del filtro). Cubre `POST /turnos`, `ServicioTurnos.crear/validar`, tabla `turnos` y sus garantías. C-04 extenderá esta misma capability (cancelar/reprogramar).

### Modified Capabilities

- (ninguna — `foundation` y `catalogo-recursos` no cambian sus REQUIREMENTS: health sin DB sigue intacto y el seed sigue sin turnos por spec C-02).

## Non-goals (explícito — fuera de C-03)

- Sobreturnos, lista de espera (C-06), reserva online del paciente (Q1: solo recepción escribe; C-08).
- `GET /agenda?profesional=&fecha=` — es C-05. Los tests de C-03 verifican por DB directa, no por endpoints de lectura.
- Cancelar / reprogramar y máquina de transiciones de estados — es C-04. C-03 solo crea en `pendiente` y filtra activos (`pendiente`,`confirmado`) sin contradecir RN-ES-01.
- JWT / login / RBAC con roles (C-11), Redis / async, frontend React+Vite, recordatorios/WhatsApp (C-07), HC/odontograma (C-09), caja/pagos/OS/ARCA (C-10).

## Impact

- Nuevo código: `backend/app/turnos/{models,schemas,service,router}.py`, revisión Alembic `002_turno`, tests `backend/tests/test_turnos_*.py`, fixture `conftest.py` (solo agrega `turnos` al TRUNCATE).
- Modifica `backend/app/main.py` (monta router `/turnos` + mapeo de errores; `GET /health` sin DB intacto).
- Sin cambios en `backend/app/agenda/models.py`, `backend/app/seed/catalogo.py`, `docker-compose.yml` (postgres:16 ya trae `btree_gist` como módulo contribuido; no se agregan servicios), ni workflows.
- Breaking: ninguno (endpoint nuevo; tabla nueva).

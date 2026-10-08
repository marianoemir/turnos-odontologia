# Design — C-01 foundation-setup

## Context

Ver `proposal.md` (Why) y `docs/explore/c01-foundation-setup.md` (estado verificado). Punto de partida: repo solo-docs con CI roja por diseño (instala `backend/requirements.txt` inexistente, corre `pytest backend/tests` inexistente). Restricciones: stack impuesto por cátedra (Python 3.12+, FastAPI 0.115+, SQLAlchemy 2.0+, Postgres 16+, pytest 8+; Python local 3.13.7 verificado); solo backend; sin auth/login; sin UI; solo datos ficticios; sin secretos commiteados. Nota Windows: el shim `openspec.ps1` está bloqueado por ExecutionPolicy — el apply usará `cmd /c "openspec ..."` y `cmd /c "docker compose ..."` si aplica.

## Goals / Non-Goals

**Goals:**

- Estructura `backend/` importable (`backend/app/{turnos,agenda,seed}/` con `__init__.py`, `main.py` con `GET /health`) que cumpla los 2 requirements del delta `foundation`.
- `pytest backend/tests` verde local y en CI; `docker compose config` válido; `README.md` reproducible de verdad.
- Decisiones del explore (§3, 7 puntos) cerradas y registradas acá.

**Non-Goals:**

- Ningún dominio (modelos, ServicioTurnos, endpoints `/turnos`, Alembic, seed con datos) — eso es C-02/C-03. Los paquetes `turnos/`, `agenda/`, `seed/` se crean como esqueleto documentado (docstring "scope C-02/C-03"), no como código funcional.
- Frontend, Redis, JWT/auth, integraciones externas, migraciones.

## Decisions

1. **Prevalece `backend/...` sobre `src/...`.** Por qué: KB-08 §Estructura + CHANGES + README + CI ya esperan `backend/app/...` y `backend/tests/`; solo la línea de scope de AGENTS.md dice `src/`. Alternativa (`src/`): rompería CI y README existentes. Acción derivada: corregir esa línea de AGENTS.md en el apply (edición docs, sin cambio de reglas).
2. **Versiones pineadas con piso mínimo:** `fastapi>=0.115`, `sqlalchemy>=2.0`, `alembic`, `uvicorn`, `httpx` (TestClient), `pytest>=8`, `ruff`; CI y Compose fijan `python 3.12` y `postgres:16`. Por qué: pisos del stack impuesto + reproducibilidad; `httpx` requerido por `fastapi.testclient` moderno. Alternativa (pines exactos `==`): se descarta — fricción en resolución sin beneficio en C-01.
3. **`REDIS_URL` fuera de `.env.example` en C-01.** Por qué: KB-02/08 y CHANGES C-01 lo excluyen (Redis solo con async, change posterior); el `.env.example` actual lo trae de más. Quedan `TZ`, `DATABASE_URL`, `SECRET_KEY` (ficticia), `SEED_FICTICIO`.
4. **`seed/` esqueleto sin datos.** Por qué: el seed KB-04 §Seed (2+2+3+horarios+bloqueo+3 pacientes) es scope C-02; C-01 solo deja el paquete + lectura documentada del flag `SEED_FICTICIO`. Alternativa (seed vacío con loader): sobreingeniería sin modelos.
5. **Linter `ruff`, job separado `lint` en el mismo workflow.** Por qué: el scope C-01 pide "test runner + linter"; ruff es estándar sin config (defaults) y job separado no enmascara tests. El job `tests` existente se conserva tal cual (ya fija Python 3.12 + `pip install -r backend/requirements.txt` + `pytest backend/tests`).
6. **`docker-compose.yml` con `api + postgres:16`, sin Redis.** `postgres:16` con `healthcheck: pg_isready` + `depends_on: condition: service_healthy`; credenciales `odontologia/odontologia/turnos` alineadas al `DATABASE_URL` por defecto; servicio `api` con `build: backend` (+ `backend/Dockerfile` `python:3.12-slim` + uvicorn) para que `up --build` funcione, no solo `config`. Sintaxis moderna `docker compose`. Alternativa (compose solo-postgres): se descarta — CHANGES dice `api + postgres` y README promete levantar la api.
7. **Q1 (reserva solo-recepción) asumida confirmada para C-01..C-03.** Por qué: no afecta al scaffolding; queda registrada como supuesto en proposal y como nota en `design`/tasks para revalidar antes de C-03. No bloquea.
8. **Tests: `test_dummy.py` (prueba de cableado) + `test_health.py` (cubre el delta `foundation` vía `httpx/TestClient`, sin red ni DB).** Por qué: el scope exige "1 test dummy en verde" y cada requirement del spec merece su escenario verificable; TestClient no levanta servidor real. Red-green: skill `tdd` ausente (`dropped_stale`) → red-green manual documentado en el resumen del apply.

## Risks / Trade-offs

- [Risk] Skills de testing (`tdd`, `python-testing-patterns`, `pytest-coverage`, `fastapi-patterns`) no instaladas → red-green menos guiado en C-01..C-03. → Mitigación: red-green manual explícito en tasks; flag para instalarlas antes de C-03 (governance CRÍTICO).
- [Risk] `backend/Dockerfile` suma superficie (build de imagen en CI no verificado). → Mitigación: CI solo valida `docker compose config` (no build); el build se verifica manual una vez en el apply.
- [Risk] Python local 3.13.7 vs CI 3.12 — divergencia de versión. → Mitigación: CI manda (3.12); `Dockerfile` y workflow pinean 3.12; discrepancias se reportan como issue.
- [Trade-off] Pines `>=` en vez de `==`: reproducibilidad suficiente para C-01 a cambio de cero fricción de resolución.

## Migration Plan

No aplica (change fundacional sobre repo sin código: todo es creación, salvo 3 ediciones acotadas: `.env.example`, `tests.yml`, `README.md`). Rollback = revert del commit. Sin datos ni despliegues que migrar.

## Open Questions

- Ninguna que bloquee el apply. Flags que el apply deberá resolver/reportar como issue: (a) instalar o no las 4 skills de testing antes de C-03; (b) corrección de la línea `src/...` en AGENTS.md; (c) `docker compose config` requiere Docker local — si no hay Docker en la máquina del apply, validar ese paso en CI y reportarlo.

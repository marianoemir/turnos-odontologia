# Proposal — C-01 foundation-setup

## Why

Sin C-01 no hay base donde implementar el núcleo del TP (C-02 → C-03: crear turno sin solapamientos). Hoy el repo es solo documentación + contratos: KB, roadmap, spec `turnos` (7 requirements), README y CI que referencian código inexistente (`backend/requirements.txt` y `backend/tests` no existen → CI roja por diseño). C-01 crea el scaffolding mínimo + base testeable con datos ficticios para que C-02/C-03 tengan dónde vivir.

## What Changes

- Estructura `backend/app/{turnos,agenda,seed}/` + `backend/app/main.py` (app FastAPI mínima con `GET /health`) + `backend/tests/` + `backend/requirements.txt` pineado, según KB-08 §Estructura de directorios. **Prevalece `backend/...` sobre `src/...`** (KB-08 + CHANGES + README + CI ya esperan `backend/...`; la mención a `src/` en el scope de AGENTS.md queda obsoleta).
- `backend/tests/test_dummy.py`: 1 test en verde (red-green con `tdd`; si la skill sigue ausente, red-green manual documentado).
- `docker-compose.yml` en raíz: servicios mínimos `api + postgres:16` con `healthcheck` + `depends_on: service_healthy`, sin Redis (Redis es change posterior con async).
- `.env.example`: variables `TZ`, `DATABASE_URL`, `SECRET_KEY` (ficticia), `SEED_FICTICIO`; **se quita `REDIS_URL`** (KB-02/08: Redis solo con funcionalidad asincrónica).
- `backend/app/seed/`: solo esqueleto + flag `SEED_FICTICIO` (sin datos todavía; el seed con 2+2+3+horarios+bloqueo+pacientes es scope C-02 según KB-04 §Seed).
- CI verde: job `tests` existente (Python 3.12 + `pytest backend/tests`) + linter `ruff` (mismo job o job separado; decide el diseño).
- `README.md`: ajustar lo que hoy promete código inexistente para que quede reproducible (levantar con Compose, correr tests, datos ficticios).

No se implementa dominio (US-001..US-003 son norte, no scope), no hay auth/login, no hay UI, no hay migraciones Alembic (llegan en C-02), no hay integración externa.

## Capabilities

### New Capabilities

- `foundation`: base testeable del backend — app FastAPI importable/levantable sin servicios externos, endpoint `GET /health`, suite pytest en verde, entorno reproducible vía Compose.

### Modified Capabilities

(none — el spec existente `turnos` (7 requirements, scope C-03) no se toca; el test dummy no lo cubre ni lo contradice: códigos 409/422 y sillón obligatorio siguen intactos para C-03.)

## Impact

- Archivos nuevos: `backend/**`, `docker-compose.yml`. Editados: `.env.example` (quita `REDIS_URL`), `.github/workflows/tests.yml` (agrega linter), `README.md` (reproducibilidad real).
- Desbloquea C-02 (`catalogo-recursos`, GATE 1). Sin dependencias (GATE 0). Governance: BAJO.
- Supuestos registrados (de `docs/explore/c01-foundation-setup.md`, no bloquean): Q1 — "solo recepción escribe, sin reserva online en C-01..C-03" se asume confirmada para el diseño; 4 skills de testing figuran `dropped_stale` — el apply usará red-green manual si `tdd` sigue ausente.

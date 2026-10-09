# Proposal — catalogo-recursos (C-02)

## Why

C-03 (crear turno sin solapamientos, núcleo del TP) no puede validarse sin las entidades que referencia: profesional, sillón, prestación, horario y bloqueo, más pacientes. Hoy `backend/` solo tiene el scaffolding de C-01 (health + Compose) y ningún modelo, driver Postgres ni migración — sin este catálogo, el ServicioTurnos no tendría sobre qué aplicar RN-AG-01..05.

Este change es el prerrequisito directo del camino crítico C-01 → C-02 → C-03: fija tipos, constraints y seed ficticio una sola vez, para que C-03 solo agregue `Turno` y su validación sin redefinir el dominio.

## What Changes

- Modelos SQLAlchemy (sin `Turno`): `Paciente` (dni único), `Profesional` (matrícula única ficticia), `SillonBox` (activo, default true), `Prestacion` (duracion_min > 0), `HorarioAtencion` (desde < hasta, sin solape mismo profesional/día), `Bloqueo` (profesional/sillón nullable, desde < hasta).
- Alembic revisión 001: tablas del catálogo + índices (`dni`, `activo`, matrícula). NO incluye índices parciales de solape de Turno (son revisión 002 / C-03).
- Seed ficticio tras flag `SEED_FICTICIO=true`: 2 profesionales, 2 sillones, 3 prestaciones (20/30/60 min), horarios Lun–Vie 9–18 por profesional, 1 bloqueo de prueba, 3 pacientes con DNI ficticios. Sin turnos ejemplo (requieren `Turno`, pertenecen a C-03).
- Infra mínima de persistencia: engine/Session + `Base` declarativa con importación perezosa (sin romper foundation: la app sigue importando sin Postgres), `alembic/` con `env.py` que lee `DATABASE_URL`, driver `psycopg` en `requirements.txt`.
- Estrategia de tests con PostgreSQL real + coexistencia con el scenario foundation "suite sin servicios" (detalle en design.md §Test strategy); servicio Postgres en CI (`tests.yml`).
- Tests pytest red-green: constraints (dni único, duración > 0, sillón activo default, horario desde < hasta + anti-solape config, bloqueo desde < hasta), seed carga 2+2+3.

## Capabilities

### New Capabilities

- `catalogo-recursos`: catálogo de recursos referenciados por Turno — modelos, constraints de integridad, seed ficticio y consultas de aplicabilidad (horario/bloqueo) que C-03 consumirá. Cada requirement es verificable con un test.

### Modified Capabilities

- Ninguna. `foundation` no cambia: health, arranque sin DB y suite base siguen vigentes (los tests de catálogo corren con marcador separado, ver design.md).

## Impact

- Afecta: `backend/app/agenda/`, `backend/app/seed/`, `backend/app/db.py` (nuevo), `backend/alembic/` (nuevo), `backend/requirements.txt` (agrega `psycopg[binary]`), `.github/workflows/tests.yml` (servicio Postgres), `README.md` (documentar migración + seed).
- No afecta: `backend/app/turnos/` (scope C-03, no tocar), endpoints HTTP (sin routers en C-02), `GET /health`, frontend, Redis, JWT/auth, integraciones.
- Breaking: ninguno (aditivo sobre C-01).

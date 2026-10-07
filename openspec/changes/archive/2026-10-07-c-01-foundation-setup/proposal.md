# Proposal

## Why

El repositorio no tiene código ni tests (solo docs, KB y roadmap). Sin una base reproducible (estructura, dependencias, test runner en verde), C-02/C-03 no pueden implementar el núcleo de turnos con TDD. Este change crea esa base mínima con el stack ya decidido en Q6 (Node.js + TypeScript + Express + Jest).

## What Changes

- Estructura `src/turnos/`, `src/agenda/`, `src/seed/`, `tests/` según `knowledge-base/08_arquitectura_propuesta.md`.
- Proyecto Node.js + TypeScript con Express instalado (sin endpoints de dominio todavía) y Jest configurado con 1 test dummy en verde.
- `.env.example` con `TZ`, `DATABASE_URL`, `SEED_FICTICIO` (sin secretos, valores ficticios).
- `README.md` reproducible (instalar, correr tests, datos ficticios).
- CI mínima (1 job: tests) si el repo usa GitHub Actions.
- **BREAKING**: ninguno (repo sin código previo).

## Capabilities

Ninguna. Este change es scaffolding/tooling puro: no introduce ni modifica comportamiento observable del sistema (no hay endpoints de dominio, ni reglas RN, ni specs de capacidad). Por eso declara `skip_specs: true` en `.openspec.yaml`. Las capacidades durables (`turnos`, `agenda`) llegan en C-02/C-03.

### New Capabilities

—

### Modified Capabilities

—

## Impact

- Archivos nuevos: `package.json`, `tsconfig.json`, config Jest, `src/`, `tests/`, `.env.example`, `README.md`, workflow CI.
- Sin impacto en `docs/`, `knowledge-base/`, `openspec/specs/` ni en otros changes.
- Desbloquea C-02 (`catalogo-recursos`) y C-03 (`crear-turno-sin-solapamientos`).

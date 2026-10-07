# Design

## Context

Repo greenfield: sin `package.json`, `src/` ni `tests/`. Restricciones: stack Q6 fijado (Node.js + TypeScript + Express + Jest), sin secretos en repo, README reproducible, un solo job CI. Ver `proposal.md` (Why) para la motivación.

## Goals / Non-Goals

**Goals:**
- Base compilable y testeable en una sesión (~4-6h), lista para que C-02 agregue modelos y C-03 lógica con TDD.
- Decisiones de tooling registradas para no re-decidirlas en cada change.

**Non-Goals:**
- Endpoints de dominio, reglas RN, persistencia real (C-02/C-03).
- Frontend, integraciones externas, autenticación.

## Decisions

- **Node.js LTS + TypeScript estricto (`strict: true`)** sobre JS plano. Alternativa: JS sin tipos — descartada porque los intervalos `[inicio,fin)` y estados RN-ES-01 se benefician del chequeo estático y el TP evalúa calidad.
- **Express 4** (estable, documentación abundante) sobre Express 5 / Fastify / Nest. Alternativa Nest: exceso de andamiaje para un dominio con un solo ServicioTurnos.
- **Jest + ts-jest, módulos CommonJS** sobre Vitest/tsx/ESM. Alternativa Vitest: más rápido, pero Jest tiene ecosistema de matching + docs que la skill `tdd` asume; CJS evita fricción ESM+Jest en Windows.
- **Estructura `src/turnos/`, `src/agenda/`, `src/seed/`, `tests/`** según KB 08. Alternativa `backend/app/...`: sobredimensionada hasta que el MVP posterior la exija.
- **Sin DB real**: tests en memoria; `DATABASE_URL` en `.env.example` apunta a SQLite local solo como placeholder documentado. La persistencia real se decide en C-02 si hace falta.
- **CI: un job `tests`** (checkout → setup-node con caché → install → test). Sin lint obligatorio en CI (se documenta script, no se bloquea por él).

## Risks / Trade-offs

- [Fijar Express 4 hoy retrasa Express 5] → Mitigación: sin código de dominio aún, migrar es trivial; re-evaluar en change posterior si hace falta.
- [ts-jest más lento que alternativas] → Mitigación: suite diminuta en C-01/C-02; re-evaluar si supera ~60s.
- [CJS limita top-level await / ESM puro] → Mitigación: el dominio no lo necesita; decisión reversible con cambio de config.

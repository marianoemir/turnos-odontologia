# Tasks

## 1. Proyecto Node.js + TypeScript

- [x] 1.1 Inicializar `package.json` (Node LTS) con script `test` y dependencias `express`, `typescript`, `jest`, `ts-jest`, `@types/...`; verificar con `npm install` exitoso y `npx tsc --version` responde.
- [x] 1.2 Crear `tsconfig.json` con `strict: true` y módulos CommonJS; verificar con `npx tsc --noEmit` en verde sobre un `src/index.ts` mínimo.
- [x] 1.3 Crear estructura `src/turnos/`, `src/agenda/`, `src/seed/`, `tests/` según design; verificar que los 4 directorios existen y `src/index.ts` exporta un placeholder documentado como tal.

## 2. Jest en verde

- [x] 2.1 Configurar Jest con ts-jest (`jest.config.js` o sección en `package.json`); verificar con `npx jest --listTests` que detecta `tests/`.
- [x] 2.2 Agregar 1 test dummy (`tests/smoke.test.ts`) que afirma la base carga; verificar con `npm test` en verde.

## 3. Entorno y documentación

- [x] 3.1 Crear `.env.example` con `TZ`, `DATABASE_URL`, `SEED_FICTICIO` (valores ficticios, sin secretos); verificar que no contiene tokens/keys reales por inspección.
- [x] 3.2 Crear `.gitignore` de raíz con `node_modules/`, `dist/`, `.env` (y `.atl/` como local no versionado); verificar con `git status --short` que no lista esos paths tras `npm install`.
- [x] 3.3 Escribir `README.md` reproducible (requisitos, instalar, `npm test`, datos ficticios); verificar siguiendo sus pasos en una terminal limpia hasta test verde.

## 4. CI mínima y cierre

- [x] 4.1 Agregar workflow CI con 1 job `tests` (checkout → setup-node con caché → install → test); verificar el YAML con inspección (ejecución real en el push que el usuario autorice).
- [x] 4.2 Verificación integral: `npm install` + `npx tsc --noEmit` + `npm test` todo en verde en una pasada; documentar versiones (Node, npm) usadas.

## Workflow follow-up

- Marcar `[x]` en `CHANGES.md` para `C-01` cuando el change se archive.
- Archivar con `/opsx-archive` (o `openspec archive`) tras revisión.
- Registrar el stack decidido (Node.js + TypeScript + Express + Jest) en `knowledge-base/02_descripcion_general.md`, `AGENTS.md`/`CLAUDE.md` (reemplazar TBD/Q6) en el change que corresponda o como ajuste de este cierre.

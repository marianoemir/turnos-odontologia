# Proposal — C-13 `frontend-foundation`

## Why

El backend está completo para el recorte (C-01..C-12 archivados) y el design system está aprobado
(`frontend/design-system/`, `Revision: 1`, `Mode: system-only`), pero `frontend/` sigue siendo el
scaffold vacío de Vite: `App.tsx` muestra un placeholder, no hay ruteo, no hay cliente HTTP, no hay
tipos que reflejen los contratos reales del backend y no hay ninguna verificación automática
(`package.json` no tiene script `test` ni `engines`; `tests.yml` tiene dos jobs, ambos de backend).

Sin esta base, ningún change de pantalla (C-14..C-22) puede empezar: cada uno necesita rutas
declaradas, un cliente HTTP que traduzca los errores del backend y tipos que no inventen campos.

## What Changes

- **Shell y ruteo**: `react-router-dom` con las rutas `/`, `/turnos/nuevo`, `/agenda`, `/catalogo/*`,
  `/lista-espera`, `/hc/:pacienteId`, `/caja`, `/admin`, `/reservar/:profesional`,
  `/confirmar/:token`, `/cancelar/:token`, más `NotFound` y `ErrorBoundary`. Shell interno (nav lateral
  + topbar) traducido de `components.html`; layout público sin navegación interna para las tres rutas
  de paciente.
- **Cableado del design system**: `frontend/src/main.tsx` importa `../design-system/tokens.css`;
  el fondo y la tipografía dejan de ser los del scaffold de Vite.
- **Contratos TypeScript**: tipos espejo de los schemas Pydantic reales de C-12 y C-03
  (`Paciente`, `Profesional`, `SillonBox`, `Prestacion`, `HorarioAtencion`, `Bloqueo`, `Turno`) y
  `EstadoTurno` derivado de `ESTADOS`.
- **Cliente HTTP tipado**: wrapper de `fetch` sobre `VITE_API_BASE_URL`, con timeout/abort y
  normalización de las cuatro formas de error del backend a un error de dominio, sin `any`.
- **Identidad por cabeceras**: el cliente envía `X-Actor-Rol` (default `recepcion`, valor provisto por
  el selector de C-14) y, solo si existe, `X-Sucursal-Id`.
- **Empaquetado**: `frontend/Dockerfile` multi-stage (node build → nginx) con fallback de SPA y proxy
  `/api` → `api:8000`; servicio `web` en `docker-compose.yml`; `.env.example` del frontend.
- **Limpieza del scaffold**: `<title>` de `index.html` con el nombre de marca, `README.md` reescrito,
  borrado de `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg` y
  `public/icons.svg` (se conserva `public/favicon.svg`).
- **Verificación**: Vitest + Testing Library (jsdom), `"strict": true` explícito y la regla
  `typescript/no-explicit-any` en `error`; job `frontend` en `.github/workflows/tests.yml`.

## Capabilities

### New Capabilities

- `frontend-foundation`: base ejecutable y verificable del frontend — shell y ruteo de la SPA,
  contratos TypeScript espejo del backend, cliente HTTP tipado con normalización de errores,
  identidad por cabeceras, distribución estática en contenedor y gates de calidad (lint, tipos, build,
  tests, CI).

### Modified Capabilities

Ninguna. El backend no cambia: C-13 no modifica CORS ni ningún endpoint. `foundation` es la base del
backend (C-01) y no se toca.

## Impact

- **Código nuevo**: `frontend/src/{app,types,services,pages}/`, `frontend/Dockerfile`,
  `frontend/nginx.conf`, configuración de Vitest.
- **Código modificado**: `frontend/src/main.tsx`, `frontend/index.html`, `frontend/README.md`,
  `frontend/package.json`, `frontend/tsconfig.app.json`, `frontend/.oxlintrc.json`,
  `frontend/.env.example`, `frontend/vite.config.ts`, `.github/workflows/tests.yml`,
  `docker-compose.yml`.
- **Código eliminado**: `frontend/src/App.css`, `frontend/src/assets/{hero.png,react.svg,vite.svg}`,
  `frontend/public/icons.svg`.
- **Dependencias nuevas**: `react-router-dom`, `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- **Sin impacto en backend**: no se agrega CORS ni middleware. El acoplamiento dev/producción se
  resuelve con proxy (`/api`), decisión justificada en `design.md`.
- **Fuera de alcance**: componentes de UI y capa de datos (C-14), pantallas de negocio (C-15..C-22) y
  C-23 (`fix-api-contenedor`), que no se toca.

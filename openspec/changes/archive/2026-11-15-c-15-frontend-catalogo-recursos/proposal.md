# Proposal: c-15-frontend-catalogo-recursos

## Why

Recepción todavía no puede administrar el catálogo (pacientes, profesionales, sillones, prestaciones, horarios, bloqueos) desde la UI: los endpoints de C-12 existen pero solo hay un placeholder en `/catalogo/*`. Sin estas pantallas no hay altas ni correcciones de datos maestros, y C-16 (crear turno en UI, recorte TP) no tiene de dónde elegir ni validar.

## What Changes

- Seis secciones bajo `/catalogo` consumiendo los endpoints de C-12 con el cliente HTTP y la sesión JWT de C-13/C-14:
  - `/catalogo/pacientes`: tabla con búsqueda `?q=` (nombre/dni), alta y edición (modal con `Modal` + `TextField` base), `409 duplicate_dni` mapeado al campo `dni`, `422` a campos vía `applyApiFieldErrors`.
  - `/catalogo/profesionales`: tabla + alta/edición + toggle `activo` con confirmación (`Modal`).
  - `/catalogo/sillones`: tabla + alta + toggle `activo` con confirmación; aviso explícito de que desactivar no borra turnos (conserva traza).
  - `/catalogo/prestaciones`: alta/edición con `duracion_min` validado en cliente (zod, entero > 0, bloquea submit) y servidor (422 → campo).
  - `/catalogo/horarios`: editor por profesional y día (Lun–Vie según seed), validación cliente `desde < hasta`, `409 solape_horario` mostrado como error del formulario.
  - `/catalogo/bloqueos`: alta con profesional y/o sillón (incluye combinaciones global / solo-profesional / solo-sillón / pareja), rango `desde`/`hasta` con timezone, listado ordenado por `(desde, id)` y eliminación física (`DELETE` → 204) con confirmación.
- Reemplazo del placeholder `catalogo.tsx` por subrutas reales anidadas bajo `catalogo/*` en el router, manteniendo la tabla de rutas declarada de C-13.
- Estado de servidor con TanStack Query: claves por recurso bajo `resourceKeys` existentes (`pacientes`, `profesionales`, `prestaciones`, `sillones` + nuevas `horarios`, `bloqueos`); invalidación tras cada mutación exitosa vía `useResourceMutation`. Sin optimistic update (el backend es quien valida unicidad, solapes y rangos).
- Tests RTL: alta de paciente, dni duplicado muestra error en campo, duración inválida bloquea submit, desactivar sillón pide confirmación.
- Solo datos ficticios en seeds/tests. Sin cambios de backend, sin cambios de contratos, sin secretos.

## Capabilities

### New Capabilities

- `frontend-catalogo`: pantallas de administración del catálogo que consumen los endpoints de C-12 con los componentes base de C-14, el cliente HTTP/sesión de C-13/C-14 y el sistema visual aprobado (modo `system-only`).

### Modified Capabilities

- Ninguna. Los contratos de `catalogo-recursos` (C-12), `frontend-foundation`, `frontend-componentes`, `frontend-sesion` y `auth-jwt` se consumen sin cambiar sus requisitos.

## Impact

- Código: `frontend/src/` (nuevas pantallas bajo `pages/catalogo/`, servicios `services/catalogo.ts`, esquemas en `forms/schemas.ts`, claves en `services/query.ts`, router `app/router.tsx`, reemplazo de `pages/catalogo.tsx` placeholder). Sin toques a `backend/`, `docker-compose.yml` ni CI.
- Dependencias: requiere C-12, C-13 y C-14 archivados (ya lo están). Bloquea a C-16.
- Sistemas: ninguno (sin migraciones, sin nuevos env vars, sin cambios visuales al design system Rev. 1).

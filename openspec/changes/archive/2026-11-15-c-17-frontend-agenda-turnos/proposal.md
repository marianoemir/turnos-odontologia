# Proposal

## Why

La agenda del día existe como API (C-05) y las transiciones de turno también (C-04), pero recepción y odontología no tienen pantalla para operarlas: `/agenda` es un placeholder de C-13. Sin esta UI, ver el día, cancelar y reprogramar solo es posible por API directa.

## What Changes

- Reemplaza el placeholder de `/agenda` (ruta ya declarada en `app/router.tsx`) por la pantalla real de agenda del día dentro del shell.
- Filtros profesional + fecha (default hoy); tabla de turnos ordenados por inicio con paciente, prestación, sillón y estado (`EstadoBadge`).
- Acción cancelar con modal de confirmación (`POST /turnos/{id}/cancelar`) y refresco de la agenda.
- Acción reprogramar con selección de nuevo inicio (`POST /turnos/{id}/reprogramar`); ante 409 muestra la causa y el turno original sigue visible e intacto.
- Acciones deshabilitadas con motivo en estados finales (`atendido`/`ausente`/`cancelado`); empty state para día sin turnos.
- Sin cambios de backend: reutiliza `GET /agenda`, `POST /turnos/{id}/cancelar` y `POST /turnos/{id}/reprogramar` tal como están (C-04/C-05 archivados).

## Capabilities

### New Capabilities

- `frontend-agenda`: pantalla `/agenda` — lectura ordenada del día con filtros, cancelación y reprogramación desde la UI con las reglas de C-04/C-05 visibles al usuario.

### Modified Capabilities

Ninguna. Los contratos de backend (`agenda`, `turnos`) no cambian; las capabilities `frontend-foundation`, `frontend-componentes` y `frontend-sesion` se consumen sin modificar sus requirements.

## Impact

- `frontend/src/pages/agenda.tsx` (placeholder → pantalla real), nuevo `frontend/src/services/agenda.ts` (queries/mutaciones sobre la raíz `turnos` de `resourceKeys`), nuevo tipo espejo `AgendaItem` en `frontend/src/types/api.ts`.
- Vecinos actualizados: `components/data-table.tsx` (render opcional de acciones), harnesses `app/shell`, `app/not-found`, `app/catalogo-matriz`, `pages/turno-nuevo`, `auth/*` (session-expiry, route-guard, auth-response) y `types/api.test.ts`.
- Sin migración, sin endpoints nuevos, sin cambios de tokens ni de ruteo (la ruta `/agenda` ya existe y resuelve al placeholder).
- Design system `Revision: 1`, `Mode: system-only`: sin mockup (política vigente).

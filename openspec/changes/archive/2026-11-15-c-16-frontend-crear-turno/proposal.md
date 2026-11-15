# Proposal

## Why

US-001 (crear turno sin solape) existe solo como API (C-03) y como catálogo administrable (C-12/C-15): recepción todavía no puede crear un turno desde la UI. Este change cierra el recorte TP llevando US-001 a `/turnos/nuevo` con las reglas de solape visibles al usuario (mensajes 409 por causa), sin reimplementar nada del backend.

## What Changes

- `frontend/src/pages/turno-nuevo.tsx` deja de ser el placeholder de C-13 y pasa a ser el wizard de una pantalla: paciente (buscador), profesional, prestación, sillón y fecha/hora.
- Nuevo servicio `frontend/src/services/turnos.ts` con `useCrearTurno` (POST `/turnos`, invalida la raíz `turnos`, sin optimistic update) y esquema `turnoFormSchema` (RHF + zod).
- Cálculo de `fin = inicio + duracion_min` en vivo desde la prestación elegida, mostrado antes de confirmar (RN-AG-01; el servidor sigue siendo la autoridad que calcula e ignora `fin` del cliente).
- Selector de horario acotado al `HorarioAtencion` del profesional y a los `Bloqueos` aplicables, leídos con los hooks de C-15 (`useHorarios`, `useBloqueos`); orientación en cliente, validación real en backend.
- Manejo explícito de errores: 409 con mensaje distinto por `causa` (`profesional` | `sillon` | `horario` | `bloqueo`), 422 proyectado a campos vía `applyApiFieldErrors`; **nunca reintentar automáticamente un 409**.
- Éxito (201): card de turno en `pendiente` con resumen + acción "crear otro" (resetea el formulario, conserva catálogo en caché).
- Tests RTL: happy path → `pendiente`; 409 profesional vs 409 sillón con causas distintas; borde `inicio == fin` aceptado; 422 sin sillón marca el campo.
- Sin cambios de backend, contratos, rutas ni design system. Los listados del wizard muestran solo recursos activos (decisión D5, no fix de C-15).

## Capabilities

### New Capabilities

- `frontend-turnos`: creación de turnos en UI (wizard `/turnos/nuevo`, cálculo de `fin` en vivo, guía de horario por horario/bloqueos, mapeo 409 por causa y 422 a campos, confirmación en `pendiente`). Límite durable que C-17 (agenda/cancelar/reprogramar) puede extender.

### Modified Capabilities

Ninguna. El contrato `POST /turnos` (`turnos`), las rutas (`frontend-foundation` ya declara `/turnos/nuevo`), el catálogo de lectura (`frontend-catalogo`, `catalogo-recursos`), los componentes (`frontend-componentes`) y la sesión (`frontend-sesion`, `auth-jwt`) se consumen sin cambiar sus requisitos.

## Impact

- Solo código frontend nuevo: `pages/turno-nuevo.tsx` (reemplazo de placeholder), `services/turnos.ts`, extensión de `forms/schemas.ts`, tests RTL colocados.
- Reutiliza `apiRequest`/`ApiError` (`causa`, `campos`), `resourceKeys` + `useResourceMutation`, `Card` + `EstadoBadge`, `Modal`/`TextField`/`Select`/`Toast`, y la matriz de navegación vigente (`recepcion` opera; `odontologo`/`admin` redirigen a `/agenda` sin requests).
- Design system Rev. 1, modo `system-only`: se consume (`Card` de turno, formularios), sin mockup por change.

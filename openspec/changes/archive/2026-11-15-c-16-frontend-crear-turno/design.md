# Design: c-16-frontend-crear-turno

## Context

Ver `proposal.md` (Why) y `specs/frontend-turnos/spec.md` (requisitos). Estado actual verificado en el repo:

- Backend `POST /turnos` (`backend/app/turnos/schemas.py:12-20`): body `TurnoCreate` = `{paciente_id, profesional_id, sillon_id, prestacion_id, inicio: AwareDatetime, creado_por?}` — sin `fin` (`extra="ignore"`); el servidor calcula `fin` y responde 201 en `pendiente`, 409 `{"detail": {"causa", "detalle"}}` con causa ordenada (horario → bloqueo → profesional → sillón), 422/404 según validación y existencia.
- Frontend: `types/api.ts` ya espeja `TurnoOut` + `EstadoTurno`; `services/http.ts` (`apiRequest`) + `normalizeApiError` convergen a `ApiError{kind, status, causa, detalle, campos}`; `services/catalogo.ts` expone `usePacientes({q})`, `useProfesionales()`, `useSillones()`, `usePrestaciones()`, `useHorarios()` (una query, filtro en cliente) y `useBloqueos()`, todos con `useResourceMutation` por raíz; `forms/schemas.ts` + `applyApiFieldErrors` cubren RHF/zod y 422 a campos; componentes `Card`, `EstadoBadge`, `TextField`, `Select`, `Modal`, `Toast`, `EmptyState`, `Skeleton`.
- Ruteo: `app/router.tsx:57` ya declara `turnos/nuevo` → `pages/turno-nuevo.tsx` (placeholder de C-13 a reemplazar, sin tocar la tabla de rutas). Design system Rev. 1, modo `system-only`: se consume, sin mockups.

## Goals / Non-Goals

**Goals:**

- Wizard de una pantalla con el patrón probado de C-15/C-22 (RHF + zod, `useResourceMutation`, `mensajeDeError` por causa), cálculo de `fin` en vivo y guía de horario por horario/bloqueos.
- Cada causa 409 con mensaje propio y 422 a campos, sin reintento automático; éxito con card `pendiente` + "crear otro".

**Non-Goals:**

- Cambios de backend, contratos, rutas, sesión/navegación o design system. Sin optimistic update. Sin alta de pacientes/profesionales/sillones/prestaciones dentro del wizard (eso vive en `/catalogo/*`). Sin agenda del día (C-17) ni reprogramación.

## Decisions

1. **Nuevo servicio `services/turnos.ts` espejo de `services/catalogo.ts`, raíz `turnos` en `resourceKeys`.**
   Rationale: mismo patrón probado (query por recurso + mutación que invalida su raíz). `TurnoCreate` espeja el schema backend sin `fin`; `useCrearTurno` = `useResourceMutation("turnos", alta => apiRequest<Turno>("/turnos", {method: "POST", body}))`. Alternativa descartada: colgar la mutación de una raíz de catálogo — fragmenta la invalidación que C-17 va a necesitar.

2. **Formulario con `turnoFormSchema` (zod + RHF): ids requeridos + `inicio` `datetime-local` requerido; `fin` derivado, no campo.**
   Rationale: `fin` es derivado de `duracion_min` (RN-AG-01) y el servidor lo ignora; modelarlo como campo invitaría a enviarlo. La validación cliente solo bloquea lo seguro (requeridos, `desde < hasta` no aplica acá); todo lo demás lo decide el 422 vía `applyApiFieldErrors`. `sillon_id` requerido en cliente (RN-AG-03) además del 422 servidor.

3. **Timezone como en bloqueos (C-15, `catalogo-bloqueos.tsx:42-44`): `datetime-local` → `new Date(valor).toISOString()` (UTC, sufijo `Z`).**
   Rationale: el backend exige `AwareDatetime` (naive → 422) y el precedente de C-15 (`aEnvioFecha`) ya resolvió la conversión (UTC con `Z`, instante preservado, aceptado por `AwareDatetime`); reutilizar/extraer esa misma conversión evita una segunda convención. El scope exige `America/Argentina/Buenos_Aires` en servidor; el wizard envía el instante en UTC y el backend lo interpreta. Tests RTL fijan TZ para estabilidad.

4. **Guía de horario en cliente: franjas del profesional + intersección con bloqueos aplicables, solo advertencia.**
   Rationale: `useHorarios` (filtro por `profesional_id` en cliente, día `weekday()` 0=lunes) + `useBloqueos` con la matriz de aplicabilidad de `catalogo-recursos` (solo-profesional, solo-sillón, global, pareja). La guía marca "fuera de horario" / "sobre bloqueo" pero nunca bloquea el envío: el borde `inicio == fin` (RN-AG-04) debe pasar, y solo el servidor valida. Alternativa descartada: deshabilitar slots en un picker — requiere un calendario que no existe en el design system y arriesga falsos negativos contra la validación real.

5. **Buscador de paciente sobre `usePacientes({q})` con término controlado.**
   Rationale: reutiliza el endpoint `?q=` y el envelope ya probados en C-15; el wizard muestra nombre + dni y guarda el `id`. Sin alta inline (non-goal).

6. **Mapeo 409 por causa con mensajes fijos en español es-AR, presentados junto al formulario.**
   `profesional` → "Ese profesional ya tiene un turno en ese horario."; `sillon` → "Ese sillón ya está ocupado en ese horario."; `horario` → "Está fuera del horario de atención del profesional."; `bloqueo` → "Hay un bloqueo en ese horario." (más `detalle` del backend como texto secundario). Rationale: la distinción profesional/sillón es requisito explícito del scope y `ApiError.causa` ya la trae. 404 (FK inexistente, casi imposible desde selects) y 403 → mensaje genérico de la familia, sin lógica nueva.

7. **Éxito: `Card` + `EstadoBadge pendiente` con resumen y "crear otro" que resetea el form (conserva caché).**
   Rationale: componentes ya cubiertos por `frontend-componentes`; el reset usa `reset()` de RHF sin invalidar catálogo (solo se invalidó `turnos`). Sin navegación automática a `/agenda` (eso lo decide C-17; acá el requisito es la card + crear otro).

8. **Solo activos en los selects (decisión registrada, no fix de C-15).**
   Rationale: el backend rechaza sillón inactivo con 422 y un turno con profesional/prestación inactivos no tiene sentido operativo; los hooks ya excluyen inactivos por defecto (`incluirInactivos=false`). La deuda del review C-15 (minor 3: catálogo muestra inactivos sin toggle para reactivar) sigue abierta y no se toca en este change.

## Risks / Trade-offs

- [Risk] Guía de horario cliente vs validación servidor divergen (p. ej. `weekday()`/TZ en el borde del día) → Mitigación: la guía solo advierte, nunca bloquea; el 409 manda y el mensaje por causa lo explica.
- [Risk] `datetime-local` sin segundos vs `AwareDatetime` del backend → Mitigación: reutilizar/extraer la conversión `new Date(valor).toISOString()` de C-15 (UTC, `Z`); validación cliente mínima, 422 a campos como red.
- [Risk] Buscador de paciente con muchas requests al tipear → Mitigación: término controlado con espera breve (debounce) antes de fijar `q`; la query se cancela por `signal` como el resto.
- [Trade-off] Sin picker visual de slots la guía es textual → se acepta: el scope pide selector acotado, no calendario, y evita inventar un componente fuera del design system.

## Migration Plan

Sin migración: solo código frontend nuevo + reemplazo del placeholder `turno-nuevo.tsx`. Rollback: revertir el branch. Gates de C-13 (lint, `tsc -b`, build, tests, sin `any`) en CI.

## Open Questions

Ninguna que cambie specs, enfoque o tasks. Seguimiento (no bloquea): Q1 de `10_preguntas_abiertas.md` (reserva online) sigue abierta con C-08 implementado — fuera de alcance.

# Design

## Context

Ver `proposal.md` (Why). Estado actual: `GET /agenda?profesional=&fecha=` devuelve `AgendaItemOut[]` ordenado por inicio (C-05, excluye `cancelado`); `POST /turnos/{id}/cancelar` y `POST /turnos/{id}/reprogramar` con 409 por causa y original intacto (C-04). En el frontend, `/agenda` está declarada en `app/router.tsx:58` y resuelve a un placeholder (`pages/agenda.tsx`); existen los moldes `pages/catalogo-*.tsx` (DataTable + Modal + Toast), `services/turnos.ts` (`useCrearTurno` vía `useResourceMutation`), `useProfesionales` en `services/catalogo.ts`, y `EstadoBadge`/`DataTable`/`Modal`/`EmptyState`/`Skeleton` de C-14. Design system `Revision: 1`, `Mode: system-only`: sin mockup.

## Goals / Non-Goals

**Goals:** pantalla `/agenda` operativa para US-002 + US-003 con los patrones ya aprobados (sin inventar componentes ni tokens).

**Non-Goals:** ningún cambio de backend (contratos C-04/C-05 congelados); sin filtros más allá de profesional + fecha; sin acciones de confirmar/atender (fuera del scope de C-17 aunque el backend las tenga); sin optimistic update; sin mockup (política `system-only`).

## Decisions

- **D1 — Nueva capability `frontend-agenda` en vez de extender `frontend-turnos`:** sigue el patrón del proyecto (una capability por pantalla: `frontend-lista-espera`, `frontend-caja`, `frontend-admin`). `frontend-turnos` cubre `/turnos/nuevo`; la agenda es otra pantalla con otro ciclo de vida. Alternativa descartada: meter todo en `frontend-turnos` — mezclaría dos pantallas y rompería la convención de los changes hermanos.
- **D2 — `services/agenda.ts` con query anidada bajo la raíz `turnos`:** `useAgenda(profesionalId, fecha)` con clave `[...resourceKeys.turnos.all, "agenda", profesionalId, fecha]` (la forma que `services/query.ts` ya anticipa) y `enabled` solo cuando hay profesional y fecha válida; `useCancelarTurno` / `useReprogramarTurno` vía `useResourceMutation("turnos")` para que cancelar/reprogramar/crear invaliden las mismas vistas. Sin optimistic update (RN implícita de C-16/C-15).
- **D3 — Tipo `AgendaItem` espejo de `AgendaItemOut`:** `id, inicio, fin, paciente_nombre, prestacion_nombre, sillon_nombre` más `estado: EstadoTurno` en `types/api.ts` (el backend tipa `estado: str`; el frontend lo acota a la unión, como ya hace `Turno.estado`). Sin campos inventados.
- **D4 — Defaults y gating de la query:** fecha default = hoy local (`yyyy-mm-dd` del navegador; viaja como string, sin problema de zona porque el backend la interpreta en `America/Argentina/Buenos_Aires`); profesional default = primer activo una vez cargado `useProfesionales()` (vale para todos los roles; ver supuesto S1). La tabla respeta el orden de llegada del backend y `DataTable` se usa sin columnas ordenables, para no reordenar en cliente.
- **D5 — Diálogos sobre `Modal` + `datetime-local`:** cancelar = `Modal` de confirmación (patrón `ConfirmarToggle` de `catalogo-profesionales.tsx`); reprogramar = `Modal` con campo `datetime-local` convertido a ISO con zona igual que `/turnos/nuevo` (`new Date(...).toISOString()`), body `{inicio}` sin `fin`. Validación cliente mínima (requerido, con zona) + `applyApiFieldErrors` para el 422.
- **D6 — Mensajes de 409 idénticos a C-16 más rama `transicion`:** `profesional` → "Ese profesional ya tiene un turno en ese horario.", `sillon` → "Ese sillón ya está ocupado en ese horario.", `horario` → fuera de horario, `bloqueo` → bloqueo (mismo texto que `turno-nuevo.tsx:89-102`). `transicion` (carrera al cancelar: otro operador cambió el estado, `backend/app/turnos/service.py:111-123` responde 409 con `{"causa": "transicion", ...}` que hoy cae en el mensaje crudo del backend porque `services/api-error.ts:15-21` solo lista las 4 causas de solape) → mensaje fijo "Ese turno ya no se puede cancelar en su estado actual." Causa realmente desconocida → mensaje genérico + detalle. Nunca reintento automático de 409.
- **D7 — Acciones solo para `recepcion` (lectura de sesión, sin guard propio nuevo):** la matriz de `frontend-sesion` ya deja a `odontologo` y `admin` navegar `/agenda`; la pantalla muestra acciones solo si el rol de la sesión es `recepcion`. El respaldo es el 403 del backend (permiso insuficiente, conserva sesión). Alternativa descartada: botones visibles-deshabilitados por rol — duplica el motivo de deshabilitado por estado y confunde.
- **D8 — Supuesto S1 (menor, registrado):** todos los roles eligen profesional en el selector; no se auto-selecciona el profesional del odontólogo porque el token no mapea a `profesional_id`. Revisable con el PO sin cambiar contratos.

## Risks / Trade-offs

- [Riesgo] Cancelar hace desaparecer la fila (el backend excluye `cancelado`) → puede leerse como "se borró". Mitigación: `Toast` de confirmación ("Turno cancelado.") + refresco; nunca hard delete, la fila sigue en DB.
- [Riesgo] Carrera: otro operador cambia el turno entre la lectura y la mutación → 409 al cancelar/reprogramar. Mitigación: el 409 muestra su causa y se re-pide la agenda (la fila refleja el estado real).
- [Riesgo] `DataTable` ordenable por defecto inicial sin orden — se usa sin `sortable` para no sugerir un reordenamiento que contradiga el orden por inicio del servidor.
- [Trade-off] Profesional default = primer activo: carga inicial con una request extra de catálogo ya cacheada por C-15/C-16; evita pantalla vacía que obligue a elegir antes de ver nada.

## Migration Plan

Sin migración ni despliegue especial: cambio solo frontend, ruta ya declarada. Rollback = revertir la rama. Verificación por gates existentes (`npm run lint`, `tsc -b`, `npm run build`, `npm run test:run` del job `frontend`).

## Open Questions

Ninguna que bloquee: S1 queda como supuesto registrado. Si el PO pide auto-selección del profesional para odontólogo, hace falta mapear sesión → profesional (change backend posible) y se trataría como follow-up, no como parte de este change.

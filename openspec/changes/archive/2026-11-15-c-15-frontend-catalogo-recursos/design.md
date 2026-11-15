# Design: c-15-frontend-catalogo-recursos

## Context

Ver `proposal.md` (Why) y `specs/frontend-catalogo/spec.md` (requisitos). Estado actual verificado en el repo:

- Backend C-12 expone `GET`/`POST`/`PATCH` para pacientes, profesionales, sillones, prestaciones y horarios, más `GET`/`POST`/`DELETE` para bloqueos (sin `PATCH`; el bloqueo es temporal y se elimina físicamente con `204`). Pacientes listan con envelope `{items, total, limit, offset}`; el resto con lista plana.
- Frontend: contratos espejo en `types/api.ts` (D6), cliente `apiRequest` con `Bearer` + `normalizeApiError` (`ApiError` con `causa`, `status`, `campos`), `resourceKeys` con raíces `pacientes`/`profesionales`/`prestaciones`/`sillones` (faltan `horarios` y `bloqueos`), `useResourceMutation` que invalida la raíz del recurso, componentes base (`DataTable`, `Modal`, `TextField`, `Select`, `Toast`, `EmptyState`, `Skeleton`), `applyApiFieldErrors` para 422, zod + RHF con `pacienteFormSchema`/`prestacionFormSchema`/`horarioFormSchema` ya existentes, y patrón de pantalla admin probado en `pages/admin-roles.tsx` (tabla + modal + `mensajeDeError` por causa).
- Ruteo: `catalogo/*` es una sola entrada comodín al placeholder `catalogo.tsx`; el shell ya enlaza a `/catalogo/pacientes` y `/catalogo/sillones`. Design system Rev. 1, modo `system-only`: se consume, no se rediseña, sin mockups.

## Goals / Non-Goals

**Goals:**

- Seis secciones funcionales de catálogo con el mismo patrón de pantalla (tabla + modal + confirmaciones), reutilizando componentes, hooks y esquemas existentes.
- Mapeo de errores del backend a la UI sin inventar contratos: 409 por `causa` → campo o mensaje, 422 → campos vía `applyApiFieldErrors`.
- Navegación, sesión y rol sin lógica nueva: se heredan de `frontend-sesion`/`ProtectedRoute`.

**Non-Goals:**

- Cambios de backend, contratos o design system. Sin optimistic update (el backend valida unicidad/solapes). Sin gestión de sucursales (queda en `/admin`). Sin `PATCH` de bloqueos (no existe en la API).

## Decisions

1. **Un servicio `services/catalogo.ts` con hooks por recurso, espejo de `services/admin.ts`.**
   Rationale: es el patrón ya probado en C-22 (query por recurso + mutación que invalida su raíz). Alternativa descartada: un hook genérico CRUD — oscurece las diferencias reales (envelope de pacientes, `DELETE` 204 de bloqueos, causas 409 distintas por recurso).

2. **Nuevas raíces `horarios` y `bloqueos` en `resourceKeys`, claves parametrizadas anidadas.**
   Rationale: `query.ts` ya prevé claves específicas bajo cada raíz (`["turnos", "agenda", fecha]`). Pacientes con `{q, incluirInactivos, limit, offset}`, horarios filtrados por profesional en cliente sobre una sola query (el endpoint no filtra por profesional; el orden backend ya es `(profesional_id, dia, desde, id)`). Alternativa descartada: una query por profesional — N requests y caché fragmentada sin beneficio.

3. **Subrutas anidadas `catalogo/*` con layout de sección (tabs) en vez de seis rutas top-level.**
   Rationale: el router declara `catalogo/*` como una sola entrada; anidar `pacientes`, `profesionales`, `sillones`, `prestaciones`, `horarios`, `bloqueos` como hijas con un layout de tabs respeta D10/D11 sin tocar la tabla de rutas y da navegación entre secciones. `catalogo.tsx` pasa de placeholder a layout + `<Outlet/>`.

4. **Modales con `Modal` + formularios RHF/zod para altas/ediciones; `DataTable` + `EmptyState` + `Skeleton` para listados.**
   Rationale: componentes ya cubiertos por specs de C-14 (foco, Escape, `aria-invalid`, `aria-sort`, `role="status"`). El formulario de horarios reutiliza `horarioFormSchema`; pacientes y prestaciones reutilizan los suyos extendidos con `nombre`/`contacto`/`matricula`/`motivo` según recurso. Alternativa descartada: páginas separadas de alta/edición — el modal es el patrón de `admin-roles.tsx` y evita seis rutas extra.

5. **Mapeo 409 por causa con `mensajeDeError` por recurso, como `admin-roles.tsx`.**
   `duplicate_dni` → campo `dni`, `duplicate_matricula` → `matricula`, `duplicate_nombre_sillon`/`duplicate_nombre_prestacion` → `nombre`, `solape_horario` → error junto al rango conservando valores; 404 en alta con referencia (profesional/sillón) → mensaje de recurso inexistente; 403 → "Permiso insuficiente." Rationale: `normalizeApiError` ya conserva `causa`/`status`; el mapeo es presentación, no contrato nuevo.

6. **Toggles `activo` siempre con `Modal` de confirmación; aviso de conservación de turnos en sillones (y profesionales).**
   Rationale: exigido por la spec; la desactivación es baja lógica (RN-AG-03 soft) y el usuario debe saber que la historia se conserva. Misma confirmación para `DELETE` de bloqueos.

7. **Bloqueos: `datetime-local` → ISO con timezone explícita (offset local del navegador; no hay convención previa en el frontend — `turno-nuevo.tsx` sigue placeholder de C-13).**
   Rationale: el backend rechaza datetimes naive con 422; la validación cliente `desde < hasta` bloquea el submit antes de la request. El formulario ofrece los cuatro alcances (global, profesional, sillón, pareja) con dos `Select` opcionales.

## Risks / Trade-offs

- [Risk] `GET /horarios-atencion` sin filtro por profesional trae todo el catálogo → Mitigación: una sola query + filtro en cliente por `profesional_id`; si el catálogo crece, C-16/C-17 ya paginan lo que les toca y un filtro backend queda como mejora sin cambiar specs.
- [Risk] Divergencia entre zod cliente y validación servidor (p. ej. formatos `time`/`datetime`) → Mitigación: la validación cliente solo bloquea lo seguro (`> 0`, `desde < hasta`, requeridos); todo lo demás se delega al 422 del servidor vía `applyApiFieldErrors`.
- [Risk] Seis secciones en un change MEDIO → Mitigación: tasks por recurso en grupos secuenciales pero cada grupo es una pantalla vertical completa (servicio + pantalla + tests), revisable por separado en el mismo PR/branch.
- [Trade-off] Sin optimistic update las tablas parpadean tras cada mutación → se acepta: la fuente de verdad valida unicidad y solapes, y la invalidación es el comportamiento especificado en `frontend-componentes`.

## Migration Plan

Sin migración: solo código frontend nuevo + reemplazo del placeholder. Rollback: revertir el branch. Los gates de C-13 (lint, `tsc -b`, build, tests, sin `any`) siguen corriendo en CI.

## Open Questions

Ninguna que cambie specs, enfoque o tasks. Nota de seguimiento (no bloquea): Q1 de `10_preguntas_abiertas.md` (reserva online del paciente) sigue abierta y C-08 ya está implementado — fuera del alcance de este change.

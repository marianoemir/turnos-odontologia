# Tasks: c-16-frontend-crear-turno

## 1. Servicio de turnos y esquema del formulario

- [x] 1.1 Verificar que la raíz `turnos` existe en `resourceKeys` (`frontend/src/services/query.ts:18`, agregada por otro change) y que `frontend/src/services/query.test.tsx` la cubre (invalidación de turnos); extender solo si falta cobertura; verificar en verde con `npm run test -- src/services/query.test.tsx`.
- [x] 1.2 Crear `frontend/src/services/turnos.ts` con `TurnoCreate` (sin `fin`, espejo de `backend/app/turnos/schemas.py:12-20`), `useCrearTurno` vía `useResourceMutation("turnos", ...)` sin optimistic update, y verificar con un test de contrato que la mutación exitosa invalida solo la raíz `turnos` y envía el body sin `fin`.
- [x] 1.3 Agregar `turnoFormSchema` (+ resolver y tipo) en `frontend/src/forms/schemas.ts`: `paciente_id`, `profesional_id`, `prestacion_id`, `sillon_id` e `inicio` (`datetime-local`) requeridos, y verificar con RTL que el submit incompleto no dispara request y cada campo faltante muestra error accesible.

## 2. Wizard `/turnos/nuevo` con fin en vivo

- [x] 2.1 Reemplazar el placeholder `pages/turno-nuevo.tsx` por el wizard de una pantalla (buscador de paciente sobre `usePacientes({q})` con nombre + dni, `Select` de profesional/prestación/sillón solo con activos, campo `datetime-local`, sin tocar `app/router.tsx`) y verificar con RTL que sesión `recepcion` ve el formulario dentro del shell y que `odontologo`/`admin` redirigen a `/agenda` con aviso sin requests.
- [x] 2.2 Implementar el cálculo de `fin = inicio + prestacion.duracion_min` en vivo y mostrarlo antes de confirmar, y verificar con RTL que elegir prestación de 30 min muestra inicio + 30 min y que cambiar de prestación recalcula sin recargar.

## 3. Guía de horario por horario de atención y bloqueos

- [x] 3.1 Implementar la guía en cliente con `useHorarios` (filtro por `profesional_id` + día `weekday()`) y `useBloqueos` (matriz solo-profesional / solo-sillón / global / pareja), que advierte "fuera de horario" o "bloqueo" sin bloquear el envío, y verificar con RTL que el aviso aparece y que igual se puede confirmar (el resultado lo da el backend).
- [x] 3.2 Verificar con RTL que un inicio exactamente igual al fin de otro turno (borde RN-AG-04) no muestra advertencia de solape y que el 201 del backend presenta la card en `pendiente`.

## 4. Errores 409 por causa y 422 a campos

- [x] 4.1 Mapear cada `causa` del 409 a su mensaje (`profesional` / `sillon` / `horario` / `bloqueo`) junto al formulario conservando los datos, sin reintento automático, y verificar con RTL que 409 `profesional` y 409 `sillon` muestran mensajes visiblemente distintos, conservan el formulario y no emiten request adicional.
- [x] 4.2 Proyectar el 422 del servidor a sus campos vía `applyApiFieldErrors` (incluido `sillon_id` ausente → campo sillón con `aria-invalid`), y verificar con RTL que el envío sin sillón marca el campo y no crea nada.

## 5. Éxito: card en pendiente y crear otro

- [x] 5.1 Mostrar ante 201 la `Card` del turno con `EstadoBadge` en `pendiente` y resumen (paciente, profesional, prestación, sillón, inicio, fin) + acción "crear otro", y verificar con RTL el happy path completo: confirmar válido → card en `pendiente` con resumen.
- [x] 5.2 Implementar "crear otro" como `reset()` del formulario conservando la caché del catálogo, y verificar con RTL que tras accionarlo el formulario vuelve a vacío sin requests nuevas de catálogo.

## 6. Integración y gates

- [x] 6.1 Correr los cuatro gates del frontend en verde (`npm run lint`, `npx tsc -b`, `npm run build`, suite completa de tests) y verificar que ningún archivo nuevo usa `any` ni redefine tokens del design system.

## Workflow follow-up

- Revisar los artefactos y pedir aprobación antes de aplicar (gobernanza ALTO).
- Aplicar por grupos con TDD (RED a la vista → GREEN mínimo → suite completa), sin commitear/pushear sin pedido explícito y con rutas explícitas (nunca `git add .`).
- Archivar el change y marcar `[x]` en `CHANGES.md` (solo la línea `**Estado**`, sin reescribir el scope).

# Tasks

## 1. Capa de datos de agenda

- [x] 1.1 Agregar tipo `AgendaItem` espejo de `AgendaItemOut` en `frontend/src/types/api.ts` y verificar que `tsc -b` pasa sin `any`
- [x] 1.2 Crear `frontend/src/services/agenda.ts` con `useAgenda(profesionalId, fecha)` (clave bajo la raíz `turnos`, `enabled` solo con ambos valores), `useCancelarTurno` y `useReprogramarTurno` (vía `useResourceMutation("turnos")`, sin optimistic update), y verificar con tests de query/mutación que la clave anida bajo `turnos` y que el éxito invalida la raíz
- [x] 1.3 Verificar que `useAgenda` no emite request sin profesional o sin fecha válida (test de `enabled`)

## 2. Pantalla `/agenda`: filtros y tabla

- [x] 2.1 Reemplazar el placeholder de `pages/agenda.tsx` por la pantalla real en el shell: filtros profesional (activos de `useProfesionales`) + fecha (default hoy local), `DataTable` sin columnas ordenables que respeta el orden del backend con inicio, fin, paciente, prestación, sillón y `EstadoBadge`, y verificar con test RTL que dos turnos creados en orden inverso se muestran por inicio ascendente
- [x] 2.2 Agregar `EmptyState` para día sin turnos y `Skeleton` durante la carga, y verificar con tests RTL ambos estados
- [x] 2.3 Verificar el patrón responsive ≤46rem (fila en grilla con línea de detalle, clases de `ui.css` de `DataTable`) con test de viewport 390×844 sin scroll horizontal
- [x] 2.4 Verificar que el 404/422 de `GET /agenda` muestra el error normalizado sin romper el shell y conserva los filtros (test RTL)

## 3. Cancelación

- [x] 3.1 Agregar acción cancelar (solo `pendiente`/`confirmado`, solo rol `recepcion`) con `Modal` de confirmación que envía un único `POST /turnos/{id}/cancelar`, cierra con `Toast` y refresca la agenda, y verificar con test RTL que cancelar libera la fila
- [x] 3.2 Verificar con test RTL que un 409 con causa `transicion` al cancelar muestra el mensaje fijo "Ese turno ya no se puede cancelar en su estado actual.", no emite más requests y la fila sigue visible e intacta; y que un 404 al cancelar muestra el error normalizado `no_encontrado` sin romper la pantalla (filtros y tabla intactos)

## 4. Reprogramación

- [x] 4.1 Agregar acción reprogramar (solo `pendiente`/`confirmado`, solo rol `recepcion`) con `Modal` de nuevo inicio (`datetime-local` → ISO con zona, sin `fin` en el body), validación cliente que bloquea el envío sin inicio, y verificar con test RTL el happy path (200 actualiza inicio/fin tras refetch)
- [x] 4.2 Verificar con test RTL que un 409 al reprogramar muestra el mensaje de su causa (`profesional`/`sillon`/`horario`/`bloqueo`, mismo texto que `/turnos/nuevo`), no reintenta y el turno original sigue visible con su inicio y fin anteriores
- [x] 4.3 Verificar con test RTL que el 422 del servidor se proyecta al campo de inicio sin cerrar el diálogo

## 5. Estados finales y roles

- [x] 5.1 Deshabilitar cancelar y reprogramar con motivo visible en turnos `atendido`/`ausente`/`cancelado` y verificar con test RTL que no emiten requests
- [x] 5.2 Ocultar las acciones para roles distintos de `recepcion` (tabla en solo lectura) y verificar con tests RTL: odontólogo lee sin operar; un 403 conserva la sesión y muestra permiso insuficiente

## 6. Integración y gates

- [x] 6.1 Verificar la tabla de 11 rutas intacta (`/agenda` sigue resolviendo a la pantalla dentro del shell) y correr los gates del frontend en verde: `npm run lint`, `tsc -b`, `npm run build`, `npm run test:run`

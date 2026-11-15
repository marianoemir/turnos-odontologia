# Tasks: c-15-frontend-catalogo-recursos

## 1. Base de catálogo (claves, servicio, layout y rutas)

- [x] 1.1 Agregar raíces `horarios` y `bloqueos` a `resourceKeys` en `frontend/src/services/query.ts` y verificar con `npm run test -- src/services/query.test.tsx` en verde (extender el test con las nuevas raíces).
- [x] 1.2 Crear `frontend/src/services/catalogo.ts` con tipos create/patch por recurso y hooks de query/mutación (`useResourceMutation` por raíz: pacientes con envelope y clave `{q, incluirInactivos, limit, offset}`, resto lista plana, bloqueos con `DELETE` 204) y verificar con un test de contrato que cada mutación exitosa invalida solo su raíz.
- [x] 1.3 Reemplazar el placeholder `pages/catalogo.tsx` por layout de sección con tabs y `<Outlet/>`, anidar las seis subrutas bajo `catalogo/*` en `app/router.tsx` (tabla de rutas intacta) y verificar que `/catalogo/pacientes` renderiza el layout y una ruta inexistente muestra `NotFound` dentro del shell (RTL).

## 2. Pacientes (`/catalogo/pacientes`)

- [x] 2.1 Implementar tabla de pacientes con buscador `?q=`, paginación del envelope, `DataTable` + `EmptyState` + `Skeleton`, y verificar con RTL que la búsqueda pide `GET /pacientes` con el `q` escrito y que el estado vacío y la carga se presentan.
- [x] 2.2 Implementar alta y edición en `Modal` con RHF + zod (`nombre`, `dni`, `contacto`), `409 duplicate_dni` mapeado al campo `dni` y 422 vía `applyApiFieldErrors`, y verificar con RTL: alta exitosa actualiza la tabla con confirmación, y dni duplicado conserva datos y muestra el error en el campo `dni` con `aria-invalid`.

## 3. Profesionales (`/catalogo/profesionales`)

- [x] 3.1 Implementar tabla + alta/edición de profesionales (`nombre`, `matricula`) con `409 duplicate_matricula` en campo, y verificar con RTL el alta exitosa y el error de matrícula duplicada en su campo.
- [x] 3.2 Implementar toggle `activo` con `Modal` de confirmación (sin request al cancelar) e invalidación tras el `PATCH`, y verificar con RTL que el toggle abre la confirmación, confirma persiste y cancela no llama a la API.

## 4. Sillones (`/catalogo/sillones`)

- [x] 4.1 Implementar tabla + alta de sillones con `409 duplicate_nombre_sillon` en campo, y verificar con RTL el alta exitosa y el error de nombre duplicado.
- [x] 4.2 Implementar toggle `activo` con `Modal` que advierte que desactivar no borra turnos (conserva traza), y verificar con RTL que la confirmación muestra el aviso, confirma persiste y cancela no llama a la API.

## 5. Prestaciones (`/catalogo/prestaciones`)

- [x] 5.1 Implementar alta/edición de prestaciones con `duracion_min` validado en cliente (entero > 0 bloquea submit sin request) y 422 del servidor al campo, y verificar con RTL que duración cero/negativa/no numérica bloquea el submit con error accesible y que el alta válida confirma y actualiza.
- [x] 5.2 Mapear `409 duplicate_nombre_prestacion` al campo `nombre` con `aria-invalid`, y verificar con RTL que el error se muestra en el campo sin cerrar el formulario.

## 6. Horarios (`/catalogo/horarios`)

- [x] 6.1 Implementar editor por profesional y día (selector de profesional + `dia_semana` Lun–Vie + `desde`/`hasta`, reutilizando `horarioFormSchema`: `desde < hasta` bloquea submit) sobre una sola query con filtro en cliente, y verificar con RTL que el rango invertido no dispara request y marca `hasta`.
- [x] 6.2 Mapear `409 solape_horario` como error del formulario conservando valores (alta y `PATCH`), 404 de profesional inexistente y 422 de profesional inactivo, y verificar con RTL que el solape muestra el detalle sin cerrar el editor ni perder datos.

## 7. Bloqueos (`/catalogo/bloqueos`)

- [x] 7.1 Implementar alta de bloqueos con `Select` opcionales de profesional/sillón (cuatro alcances: global, profesional, sillón, pareja), `desde`/`hasta` con timezone y `motivo`, validación cliente `desde < hasta`, y verificar con RTL el alta global exitosa y el bloqueo de submit con rango invertido.
- [x] 7.2 Implementar listado ordenado por `(desde, id)` y eliminación con `Modal` de confirmación (`DELETE` → 204), mapeando 404/422 de recursos a mensaje, y verificar con RTL que eliminar pide confirmación, confirma quita la fila y cancela no llama a la API.

## 8. Integración y gates

- [x] 8.1 Verificar matriz de navegación: sesión `recepcion` accede a las seis secciones dentro del shell; `odontologo`/`admin` redirigen a `/agenda` con aviso sin requests de catálogo (RTL con `canNavigate`/`ProtectedRoute`).
- [x] 8.2 Correr los cuatro gates del frontend en verde (`npm run lint`, `npx tsc -b`, `npm run build`, suite completa de tests) y verificar que ningún archivo nuevo usa `any` ni redefine tokens del design system.

## Workflow follow-up

- Revisar los artefactos y pedir aprobación antes de aplicar (gobernanza MEDIO).
- Aplicar por grupos con TDD (RED a la vista → GREEN mínimo → suite completa), sin commitear/pushear sin pedido explícito y con rutas explícitas (nunca `git add .`).
- Archivar el change y marcar `[x]` en `CHANGES.md` (solo la línea `**Estado**`, sin reescribir el scope).

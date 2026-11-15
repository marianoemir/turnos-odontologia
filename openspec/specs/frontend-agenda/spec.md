# frontend-agenda Specification

## Purpose

Permite a recepción operar el día (ver, cancelar y reprogramar turnos) y a odontología leer su agenda desde `/agenda`, con los conflictos del backend traducidos a mensajes por causa.

## Requirements

### Requirement: Pantalla de agenda con filtros profesional y fecha

El frontend SHALL reemplazar el placeholder de `/agenda` por la pantalla real dentro del shell, con filtros de profesional (selector de activos del catálogo) y fecha (default hoy local `yyyy-mm-dd`), y SHALL pedir `GET /agenda?profesional={id}&fecha={fecha}` solo cuando ambos filtros tengan valor válido.

#### Scenario: Apertura con defaults

- **WHEN** una sesión con acceso navega a `/agenda`
- **THEN** la pantalla muestra el shell con título, el filtro de fecha en hoy y el selector de profesional con los activos, y pide la agenda del primer profesional activo para hoy

#### Scenario: Cambio de filtros recarga el día

- **WHEN** se cambia el profesional o la fecha a valores válidos
- **THEN** la pantalla pide `GET /agenda` con los nuevos parámetros y muestra el resultado

#### Scenario: Profesional inexistente o fecha inválida del servidor

- **WHEN** el backend responde 404 (profesional inexistente) o 422 (fecha inválida)
- **THEN** la pantalla muestra el error normalizado sin romper el shell y conserva los filtros elegidos

### Requirement: Tabla ordenada por inicio con datos completos y responsive

El frontend SHALL mostrar los turnos en el orden de llegada del backend (ordenados por `inicio` ascendente en C-05) sin reordenarlos en cliente, cada fila con inicio, fin, paciente, prestación, sillón y `EstadoBadge`, y SHALL aplicar el patrón responsive de `components.html` (≤46rem cada fila pasa a grilla con la línea de detalle).

#### Scenario: Orden por inicio preservado

- **WHEN** la agenda trae dos turnos del mismo día creados en orden inverso
- **THEN** la tabla los muestra ordenados por inicio ascendente, igual que la respuesta

#### Scenario: Fila completa en escritorio y móvil

- **WHEN** se muestra un turno en 1440×900 y en 390×844
- **THEN** en escritorio se ven sus columnas y en móvil la fila se presenta en grilla sin scroll horizontal, con prestación y sillón en la línea de detalle (sin columna de profesional: ya es el filtro y el backend solo devuelve su día)

### Requirement: Día vacío con estado explícito

El frontend SHALL mostrar `EmptyState` cuando `GET /agenda` responda lista vacía, con mensaje comprensible y sin tabla ambigua.

#### Scenario: Día sin turnos

- **WHEN** la agenda del profesional y fecha elegidos viene vacía
- **THEN** la pantalla muestra el estado vacío en lugar de una tabla sin filas

### Requirement: Cancelación con confirmación y refresco

El frontend SHALL ofrecer cancelar solo en turnos `pendiente`/`confirmado` vía `Modal` de confirmación que envía un único `POST /turnos/{id}/cancelar`, y SHALL refrescar la agenda tras el éxito (invalidación de la raíz `turnos`); ante 409 con causa `transicion` SHALL mostrar el mensaje fijo "Ese turno ya no se puede cancelar en su estado actual." y conservar la fila visible.

#### Scenario: Cancelar libera la fila

- **WHEN** se confirma la cancelación de un turno `pendiente` y el backend responde 200
- **THEN** el modal se cierra, la agenda se vuelve a pedir y la fila ya no aparece (el backend excluye cancelados)

#### Scenario: Cancelación rechazada por transición muestra mensaje fijo

- **WHEN** el backend responde 409 con causa `transicion` al cancelar (p. ej. turno ya atendido por otro operador)
- **THEN** la pantalla muestra "Ese turno ya no se puede cancelar en su estado actual.", no emite más requests y la fila sigue visible e intacta

### Requirement: Reprogramación con nuevo inicio y original intacto ante 409

El frontend SHALL ofrecer reprogramar solo en turnos `pendiente`/`confirmado` vía diálogo con campo de nuevo inicio (con zona horaria, como en `/turnos/nuevo`), enviar un único `POST /turnos/{id}/reprogramar` con `{inicio}`, y SHALL NOT reintentar automáticamente ante 409; ante 409 SHALL mostrar la causa (`profesional`, `sillon`, `horario`, `bloqueo`) y el turno original sigue visible e intacto.

#### Scenario: Reprogramar sin conflicto actualiza la agenda

- **WHEN** se confirma un nuevo inicio libre y el backend responde 200
- **THEN** el diálogo se cierra, la agenda se vuelve a pedir y el turno aparece con su nuevo inicio y fin recalculado

#### Scenario: Reprogramar con conflicto conserva el original

- **WHEN** el backend responde 409 con causa al reprogramar
- **THEN** la pantalla muestra el mensaje de esa causa, no emite más requests y el turno original sigue visible con su inicio y fin anteriores

#### Scenario: Inicio inválido bloquea el envío

- **WHEN** se intenta confirmar sin nuevo inicio o con texto sin zona horaria
- **THEN** no se realiza ninguna request y el campo muestra su error accesible

### Requirement: Acciones deshabilitadas con motivo en estados finales

El frontend SHALL deshabilitar cancelar y reprogramar en turnos `atendido`, `ausente` o `cancelado`, con motivo visible (texto o `title`/`aria-label`) y sin emitir requests; solo `pendiente` y `confirmado` ofrecen acciones.

#### Scenario: Estado final sin acciones operables

- **WHEN** se muestra un turno `atendido`, `ausente` o `cancelado` (estos dos últimos solo si el backend los incluyera en el futuro)
- **THEN** sus acciones aparecen deshabilitadas con el motivo y activarlas no emite ninguna request

### Requirement: Visibilidad de acciones según rol sin sustituir al backend

El frontend SHALL mostrar las acciones de cancelar y reprogramar solo a `recepcion`; `odontologo` y `admin` ven la tabla en solo lectura. El guard del cliente no es seguridad: el respaldo es el 403 del backend, que SHALL mostrarse como permiso insuficiente.

#### Scenario: Odontólogo lee sin operar

- **WHEN** una sesión `odontologo` abre `/agenda`
- **THEN** la pantalla muestra filtros y tabla pero no ofrece acciones de cancelar ni reprogramar

#### Scenario: 403 del backend conserva la sesión

- **WHEN** una mutación de agenda responde 403
- **THEN** la pantalla conserva la sesión y muestra permiso insuficiente en lugar de tratarlo como expiración

### Requirement: Sin optimistic update en datos de agenda

El frontend SHALL NOT aplicar optimistic update sobre la agenda: ninguna fila cambia ni desaparece antes de la respuesta del servidor; cada mutación exitosa SHALL invalidar la raíz `turnos` para volver a pedir datos actuales.

#### Scenario: Sin valores no confirmados ante rechazo

- **WHEN** una cancelación o reprogramación todavía no respondió o fue rechazada con 409 o 422
- **THEN** la tabla sigue mostrando los valores previos sin cambios anticipados

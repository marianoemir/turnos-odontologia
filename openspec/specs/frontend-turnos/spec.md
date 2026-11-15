# frontend-turnos Specification

## Purpose

Permite a recepción crear turnos sin solape desde la UI (`/turnos/nuevo`), con cálculo de fin en vivo y conflictos del backend traducidos a mensajes por causa, como cierre del recorte TP para US-001.

## Requirements

### Requirement: Wizard de creación en `/turnos/nuevo` dentro del shell

El frontend SHALL reemplazar el placeholder de C-13 por un wizard de una pantalla con paciente (buscador), profesional, prestación, sillón y fecha/hora, dentro del shell y bajo la matriz de navegación vigente (solo `recepcion` opera; sin guard propio nuevo).

#### Scenario: Recepción abre el wizard

- **WHEN** una sesión `recepcion` navega a `/turnos/nuevo`
- **THEN** la pantalla muestra el formulario completo dentro del shell con su título y contenido

#### Scenario: Rol sin acceso es redirigido sin requests

- **WHEN** una sesión `odontologo` o `admin` abre `/turnos/nuevo`
- **THEN** el frontend redirige a `/agenda` con el aviso de permiso insuficiente y no realiza requests de creación ni de catálogo asociadas

### Requirement: Selectores alimentados por el catálogo con solo activos

El frontend SHALL poblar paciente (búsqueda `?q=` del backend), profesional, prestación y sillón desde los hooks de `frontend-catalogo`, mostrando solo recursos activos por defecto; la lista de activos SHALL reflejar el estado del backend vía las queries existentes.

#### Scenario: Wizard ofrece solo recursos activos

- **WHEN** el catálogo contiene profesionales, sillones y prestaciones activos e inactivos
- **THEN** cada selector lista únicamente los activos, y un recurso desactivado en el catálogo deja de ofrecerse tras la invalidación

#### Scenario: Buscador de paciente filtra por nombre o dni

- **WHEN** se escribe un término en el buscador de paciente
- **THEN** la pantalla pide `GET /pacientes` con ese `q` y muestra los resultados con nombre y dni para elegir

### Requirement: Cálculo de fin en vivo antes de confirmar

El frontend SHALL calcular `fin = inicio + prestacion.duracion_min` (RN-AG-01) en cuanto haya prestación e inicio válidos, y SHALL mostrarlo antes de confirmar; el `POST /turnos` SHALL enviar solo `{paciente_id, profesional_id, sillon_id, prestacion_id, inicio}` sin `fin`.

#### Scenario: Fin visible antes de confirmar

- **WHEN** se elige una prestación de 30 min y un inicio válido
- **THEN** la pantalla muestra el fin calculado (inicio + 30 min) antes de que se confirme la creación

#### Scenario: Cambiar la prestación recalcula el fin

- **WHEN** se cambia la prestación elegida a otra de distinta duración con el mismo inicio
- **THEN** el fin mostrado se actualiza al nuevo `inicio + duracion_min` sin necesidad de recargar

### Requirement: Guía de horario acotada a horario y bloqueos sin sustituir al backend

El frontend SHALL acotar la elección de fecha/hora al `HorarioAtencion` del profesional elegido y a los `Bloqueos` aplicables leídos con los hooks de C-15, como orientación en cliente; el backend SHALL seguir siendo la única validación (el wizard SHALL enviar igual un inicio que la guía marque dudoso si la persona lo confirma, y el 409 del servidor decide).

#### Scenario: Fuera de horario se advierte pero el servidor decide

- **WHEN** se elige un inicio fuera del horario del profesional
- **THEN** la pantalla advierte que está fuera de horario antes de enviar, y si igual se confirma, el resultado lo determina la respuesta del backend

#### Scenario: Slot sobre bloqueo se advierte antes de enviar

- **WHEN** el intervalo `[inicio, fin)` calculado intersecta un bloqueo aplicable al profesional o sillón elegidos
- **THEN** la pantalla advierte del bloqueo antes de enviar sin bloquear el envío

### Requirement: Creación exitosa muestra el turno en pendiente con acción de crear otro

El frontend SHALL enviar el `POST /turnos` una sola vez por confirmación y, ante 201, SHALL mostrar la card del turno creado en estado `pendiente` con su resumen (paciente, profesional, prestación, sillón, inicio, fin) y una acción "crear otro" que resetea el formulario sin refetch del catálogo.

#### Scenario: Happy path crea y muestra pendiente

- **WHEN** se confirma un formulario válido y el backend responde 201 con el turno en `pendiente`
- **THEN** la pantalla muestra la card del turno con `EstadoBadge` en `pendiente`, su resumen completo y la acción "crear otro"

#### Scenario: Crear otro resetea sin recargar el catálogo

- **WHEN** se acciona "crear otro" tras un éxito
- **THEN** el formulario vuelve a vacío con los selects repoblados desde la caché y sin requests nuevas de catálogo

### Requirement: Conflicto 409 con mensaje distinto por causa y sin reintento automático

El frontend SHALL traducir cada `causa` del 409 (`profesional`, `sillon`, `horario`, `bloqueo`) a un mensaje distinto y específico junto al formulario, conservando los datos ingresados, y SHALL NOT reintentar el `POST /turnos` automáticamente ante ningún 409.

#### Scenario: Solape de profesional muestra su causa

- **WHEN** el backend responde 409 con `causa == "profesional"`
- **THEN** la pantalla muestra el mensaje de solape del profesional, conserva el formulario y no emite ninguna request adicional

#### Scenario: Solape de sillón muestra una causa distinta

- **WHEN** el backend responde 409 con `causa == "sillon"`
- **THEN** la pantalla muestra el mensaje de solape del sillón, visiblemente distinto del de profesional, conserva el formulario y no emite ninguna request adicional

#### Scenario: Horario y bloqueo tienen mensajes propios

- **WHEN** el backend responde 409 con `causa == "horario"` o `causa == "bloqueo"`
- **THEN** la pantalla muestra el mensaje correspondiente a esa causa (fuera de horario vs sobre bloqueo) sin perder los datos

### Requirement: Entrada inválida 422 proyectada a sus campos

El frontend SHALL impedir el envío con campos requeridos vacíos o inicio sin zona horaria antes de la request, y SHALL proyectar el 422 del servidor a sus campos vía `applyApiFieldErrors`, incluida la ausencia de `sillon_id` (RN-AG-03: sillón obligatorio).

#### Scenario: Envío sin sillón marca el campo

- **WHEN** se intenta confirmar sin elegir sillón, o el backend responde 422 sobre `sillon_id`
- **THEN** el campo sillón muestra el error accesible con `aria-invalid` y no se crea ningún turno

#### Scenario: Validación cliente bloquea el submit incompleto

- **WHEN** se intenta confirmar con paciente, profesional, prestación o inicio vacíos
- **THEN** no se realiza ninguna request y cada campo faltante muestra su error accesible

### Requirement: Borde adyacente inicio igual a fin aceptado en cliente

El frontend SHALL permitir un inicio exactamente igual al fin de otro turno (intervalos `[inicio, fin)`, RN-AG-04): la guía de horario y la validación cliente SHALL NOT marcarlo como conflicto; el 201 del backend lo confirma.

#### Scenario: Inicio igual al fin de otro turno se acepta

- **WHEN** se elige un inicio coincidente con el fin de otro turno del mismo profesional y sillón
- **THEN** la pantalla no muestra advertencia de solape y, si el backend responde 201, muestra la card en `pendiente`

### Requirement: Invalidación tras crear sin optimistic update

El frontend SHALL invalidar la raíz `turnos` de `resourceKeys` después de cada creación exitosa y SHALL NOT aplicar optimistic update sobre datos de turnos.

#### Scenario: Creación refresca vistas dependientes

- **WHEN** el `POST /turnos` responde 201
- **THEN** la consulta de turnos afectada se invalida y las vistas dependientes vuelven a pedir datos actuales

#### Scenario: Sin valores no confirmados ante rechazo

- **WHEN** la creación todavía no respondió o fue rechazada con 409 o 422
- **THEN** ninguna vista muestra el turno no confirmado

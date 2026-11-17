## ADDED Requirements

### Requirement: Rutas públicas accesibles sin sesión y sin shell interno
El frontend SHALL exponer `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` como rutas públicas fuera de `ProtectedRoute` y fuera del shell interno, sin exigir login, sin aplicar `canNavigate` de rutas internas y sin redirigir a `/login` por ausencia de sesión. Una sesión interna activa SHALL poder coexistir sin alterar el acceso ni el resultado de estas rutas públicas.

#### Scenario: Visitante anónimo accede a la reserva pública
- **GIVEN** una persona sin sesión interna
- **WHEN** abre `/reservar/:profesional`
- **THEN** la pantalla se muestra sin navegación interna ni redirección a `/login`

#### Scenario: Visitante anónimo accede a rutas con token
- **GIVEN** una persona sin sesión interna
- **WHEN** abre `/confirmar/:token` o `/cancelar/:token`
- **THEN** la pantalla se muestra sin navegación interna ni redirección a `/login`

#### Scenario: Sesión interna activa no interfiere con rutas públicas
- **GIVEN** una sesión interna válida está activa
- **WHEN** la persona abre `/reservar/:profesional`, `/confirmar/:token` o `/cancelar/:token`
- **THEN** la ruta pública permanece accesible, no redirige a `/agenda` ni a `/login` y no muestra la navegación del shell interno

### Requirement: Requests públicas omiten credenciales y no disparan efectos globales de sesión
El frontend SHALL ejecutar las requests de reserva y de resolución de token con la opción pública del cliente HTTP, sin cabecera `Authorization`, y SHALL tratar sus respuestas 401, 403 y 429 como resultados locales de la pantalla. Esas respuestas SHALL NOT invocar los manejadores globales de sesión no autorizada o permiso insuficiente ni provocar reintentos automáticos o redirecciones globales.

#### Scenario: Reserva sin token de sesión
- **GIVEN** una persona en la pantalla pública de reserva
- **WHEN** consulta slots o envía el alta de reserva
- **THEN** la request se envía sin `Authorization` y la respuesta exitosa se presenta en la propia pantalla sin iniciar sesión interna

#### Scenario: Error 401 o 403 en request pública no altera la sesión
- **GIVEN** una request pública de reserva o de token
- **WHEN** recibe 401 o 403
- **THEN** la pantalla muestra un error local comprensible, no navega a `/login`, no finaliza una sesión interna activa y no muestra el aviso global de permiso insuficiente

#### Scenario: Error 429 en request pública se maneja localmente
- **GIVEN** una request pública de reserva o de token
- **WHEN** recibe 429
- **THEN** la pantalla informa el límite alcanzado sin reintento automático, sin redirección y sin efectos globales de sesión

### Requirement: Consulta de disponibilidad pública con estados y cancelación de solicitudes obsoletas
La pantalla `/reservar/:profesional` SHALL permitir elegir prestación y fecha, consultar `GET /reservar/{profesional}?prestacion=&fecha=` y mostrar slots ordenados o un estado vacío cuando la respuesta sea una lista vacía. Ante un cambio de prestación o fecha, o ante nuevas consultas, el frontend SHALL evitar que una respuesta anterior sobrescriba el estado visible más reciente.

#### Scenario: Las prestaciones se listan sin sesión
- **GIVEN** una persona sin sesión en `/reservar/:profesional`
- **WHEN** la pantalla carga el listado de prestaciones
- **THEN** solicita `GET /prestaciones` como request pública sin `Authorization` y sin `incluir_inactivos`, usando una clave de consulta propia, muestra las prestaciones activas disponibles para seleccionar y no dispara manejadores globales de sesión o permiso ante 401 o 403

#### Scenario: Slots disponibles se muestran tras elegir prestación y fecha
- **GIVEN** una persona ha seleccionado una prestación y una fecha válidas
- **WHEN** la API de slots responde 200 con intervalos disponibles
- **THEN** la pantalla muestra los intervalos disponibles y permite continuar con el alta sobre un slot elegido

#### Scenario: Respuesta vacía se comunica como ausencia de disponibilidad
- **GIVEN** una persona ha seleccionado una prestación y una fecha
- **WHEN** la API de slots responde 200 con una lista vacía
- **THEN** la pantalla muestra un mensaje de que no hay turnos disponibles para esa selección sin presentar datos de otros pacientes ni un error genérico

#### Scenario: Respuesta tardía no reemplaza la selección vigente
- **GIVEN** hay una consulta de slots en curso para una selección anterior
- **WHEN** la persona cambia prestación o fecha y las respuestas llegan en distinto orden
- **THEN** solo el resultado correspondiente a la selección vigente queda visible y las respuestas obsoletas se descartan o cancelan

### Requirement: Alta pública con prevención de doble envío y feedback por resultado
La pantalla `/reservar/:profesional` SHALL enviar `POST /reservar` según el contrato backend, impedir envíos duplicados mientras la solicitud esté en curso y presentar para cada resultado (201, 409, 422, 429, red/timeout) un feedback local acorde sin exponer datos de terceros.

#### Scenario: Alta exitosa muestra confirmación pendiente
- **GIVEN** la persona completó los datos requeridos y seleccionó un slot disponible
- **WHEN** `POST /reservar` responde 201
- **THEN** la pantalla confirma que el turno quedó pendiente con la información devuelta por la API y no muestra datos de otros pacientes ni un enlace de confirmación/cancelación inventado

#### Scenario: Conflicto de agenda ofrece alternativa
- **GIVEN** la persona intenta reservar un horario seleccionado
- **WHEN** `POST /reservar` responde 409 con causa de conflicto
- **THEN** la pantalla informa que el horario ya no está disponible y permite volver a la selección o recargar disponibilidad para elegir otro horario sin reintento automático

#### Scenario: Datos inválidos, DNI inactivo o límite se informan sin reintento automático
- **GIVEN** la persona intenta enviar el alta de reserva
- **WHEN** `POST /reservar` responde 422 (incluido el rechazo por paciente inactivo con el detalle provisto por el backend) o 429
- **THEN** la pantalla muestra un mensaje local acorde al rechazo, basado en el detalle disponible de la respuesta, sin reenviar automáticamente y mantiene disponibles los controles para corregir o intentar más tarde según corresponda sin exponer datos de terceros

#### Scenario: Doble envío bloqueado y fallo de transporte recuperable
- **GIVEN** la persona activa el envío del formulario de reserva
- **WHEN** activa el envío más de una vez o la request falla por red o timeout
- **THEN** solo se mantiene una solicitud activa a la vez y, ante red o timeout, la pantalla informa el fallo sin crear un estado exitoso falso y permite reintentar manualmente

### Requirement: Resolución de enlaces públicos con estados explícitos y sin efectos secundarios en apertura
Las pantallas `/confirmar/:token` y `/cancelar/:token` SHALL mostrar un estado terminal explícito según la respuesta del contrato, sin efectos de sesión y sin ejecutar la mutación hasta que la persona la confirme explícitamente, limitando el contenido a lo necesario para comunicar el resultado.

#### Scenario: abrir el enlace no ejecuta la acción hasta que la persona la confirma
- **GIVEN** una persona abre `/confirmar/:token` o `/cancelar/:token`
- **WHEN** la pantalla se renderiza sin una acción explícita de confirmación o cancelación
- **THEN** no se envía el `POST` de confirmación/cancelación automáticamente, no se producen efectos de sesión y la interfaz presenta un estado informativo con un control explícito para ejecutar la acción

#### Scenario: Confirmación o cancelación exitosa
- **GIVEN** la persona ejecuta explícitamente la acción desde la pantalla del token
- **WHEN** la ruta pública de token recibe una respuesta 200 con resultado `confirmado` o `cancelado`
- **THEN** la pantalla muestra el estado correspondiente de forma clara sin exponer datos personales de terceros

#### Scenario: Token expirado o ya usado
- **GIVEN** la persona ejecuta explícitamente la acción desde la pantalla del token
- **WHEN** la API responde 200 con resultado `expirado` o 409 con causa `ya_usado` para la acción solicitada
- **THEN** la pantalla distingue explícitamente ese estado de un éxito y de un token inexistente, mostrando `accion_previa` si está disponible en el caso `ya_usado`

#### Scenario: Token inexistente o inválido y errores de transporte
- **GIVEN** la persona ejecuta explícitamente la acción desde la pantalla del token
- **WHEN** la API responde 404 o 422 por token, o la request falla por red o timeout
- **THEN** la pantalla muestra un estado de error o no encontrado comprensible, sin redirigir a login y sin modificar una sesión interna activa

### Requirement: Privacidad, noindex y accesibilidad móvil en pantallas públicas
Las pantallas públicas SHALL ser utilizables en móvil sin depender de hover, con objetivos táctiles de al menos 44 por 44 píxeles CSS para controles interactivos y mensajes de estado perceptibles. Las rutas `/confirmar/:token` y `/cancelar/:token` SHALL declarar `noindex` de forma verificable en la SPA y SHALL evitar exponer datos de otras personas.

#### Scenario: Controles táctiles y estados perceptibles
- **GIVEN** una persona utiliza la reserva o las pantallas de token en un viewport móvil
- **WHEN** interactúa con los controles y recibe estados o errores
- **THEN** los controles interactivos tienen un área táctil mínima de 44 por 44 píxeles CSS, los estados y errores son legibles y no se requiere hover para completar la tarea

#### Scenario: Rutas con token declaran noindex
- **GIVEN** una persona navega a una ruta con token
- **WHEN** se renderiza `/confirmar/:token` o `/cancelar/:token`
- **THEN** el documento expone una directiva `noindex` verificable durante la ejecución de la SPA

#### Scenario: Contenido público no revela terceros
- **GIVEN** la pantalla muestra slots, confirmación de alta o resultado de token
- **WHEN** la persona visualiza el contenido
- **THEN** la interfaz no incluye datos personales de otros pacientes ni información no provista por los contratos públicos correspondientes
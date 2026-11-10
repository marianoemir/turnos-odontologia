# reserva-online Specification

## Purpose
Permite reservar un turno 24/7 sin login consultando slots reales y creando un turno en pendiente con la misma validación de C-03, confirmable o cancelable por los enlaces de C-07.

## Requirements

### Requirement: Consulta de slots reales por profesional, prestación y fecha

El sistema SHALL responder `GET /reservar/{profesional}?prestacion=&fecha=` con la lista ordenada ascendente de objetos `{inicio, fin}` disponibles del día, sin exponer datos de otros pacientes.

#### Scenario: Slots libres de un día laboral

- **GIVEN** un profesional con horario Lun a Vie 9 a 18, una prestación de 30 min, sin bloqueos y sin turnos activos ese día
- **WHEN** se pide `GET /reservar/{profesional}?prestacion={id}&fecha=2026-11-10`
- **THEN** responde 200 con una lista ordenada ascendente de objetos `{inicio, fin}` dentro del horario

#### Scenario: Slot ocupado no se ofrece

- **GIVEN** un turno activo del profesional de 10:00 a 10:30 ese día
- **WHEN** se pide la consulta de slots de ese día
- **THEN** la lista no contiene ningún objeto `{inicio, fin}` con inicio 10:00 ni con intervalo solapado 10:00 a 10:30

#### Scenario: Bloqueo excluye slots

- **GIVEN** un bloqueo aplicable al profesional que cubre 14:00 a 15:00 ese día
- **WHEN** se pide la consulta de slots de ese día
- **THEN** la lista no contiene ningún objeto `{inicio, fin}` con intervalo que intersecte el bloqueo

#### Scenario: Día sin horario devuelve vacío

- **GIVEN** un profesional sin horario de atención un sábado
- **WHEN** se pide la consulta para el sábado
- **THEN** responde 200 con una lista vacía y sin error

### Requirement: Alta pública en pendiente con validación de C-03

El sistema SHALL crear el turno en `pendiente` cuando `POST /reservar` recibe datos válidos, calculando `fin = inicio + duracion` (RN-AG-01) y aplicando las reglas RN-AG-02, RN-AG-03, RN-AG-05 y RN-ES-02. La respuesta 201 contiene exclusivamente `{turno_id, profesional_id, prestacion_id, inicio, fin, estado}` (sin `sillon_id`, sin `paciente_id`, sin `nombre`/`dni`/`contacto` ni `creado_por`).

#### Scenario: Reserva válida crea pendiente

- **GIVEN** un slot libre de 10:00 con prestación de 30 min y paciente por dni nuevo
- **WHEN** se envía `POST /reservar` con profesional, prestación e inicio 10:00
- **THEN** responde 201 con el turno en `pendiente` y `fin` 10:30

#### Scenario: Sin datos personales de terceros

- **GIVEN** un turno creado por alta pública
- **WHEN** se consulta el cuerpo de respuesta de `POST /reservar` o de `GET /reservar`
- **THEN** el cuerpo de `POST /reservar` contiene exactamente las claves `{turno_id, profesional_id, prestacion_id, inicio, fin, estado}` (sin `sillon_id`, sin `paciente_id`, sin `nombre`, `dni`, `contacto` ni `creado_por`) y cada elemento de `GET /reservar` contiene exactamente `{inicio, fin}`

#### Scenario: DNI existente reutiliza paciente sin crear otro

- **GIVEN** un paciente existente con un `dni` y un turno creado con otro `nombre` para ese mismo `dni` (o sin turno previo, con conteo de pacientes por DB directa)
- **WHEN** se envía `POST /reservar` válido con el mismo `dni` y un `nombre` distinto
- **THEN** responde 201 con la misma forma que el alta de `dni` nuevo (sin 422 que revele existencia), reutiliza el paciente existente y el conteo por DB directa no crea otro paciente

### Requirement: Conflictos de agenda responden 409 sin crear nada

El sistema SHALL responder 409 con `detail.causa` igual a `profesional`, `sillon`, `horario` o `bloqueo` cuando el intervalo pedido no pase la validación de C-03, sin crear el turno.

#### Scenario: Solape profesional por alta pública

- **GIVEN** un turno activo de 10:00 a 10:30 del profesional en otro sillón
- **WHEN** se envía `POST /reservar` para 10:15 del mismo profesional
- **THEN** responde 409 con causa `profesional` y no persiste ningún turno nuevo

#### Scenario: Fuera de horario por alta pública

- **GIVEN** un profesional con horario Lun a Vie 9 a 18
- **WHEN** se envía `POST /reservar` un sábado 10:00
- **THEN** responde 409 con causa `horario` y no persiste ningún turno nuevo

#### Scenario: Todos los sillones ocupados responden 409 sillon

- **GIVEN** un profesional con horario que cubre el intervalo pedido y todos los sillones activos ocupados por turnos activos solapados en ese intervalo
- **WHEN** se envía `POST /reservar` válido en ese intervalo para ese profesional y prestación
- **THEN** responde 409 con causa `sillon` y no persiste ningún turno nuevo

### Requirement: Borde adyacente inicio igual a fin aceptado

El sistema SHALL aceptar un alta pública cuyo inicio coincide exactamente con el `fin` de un turno activo del mismo profesional y sillón (RN-AG-04).

#### Scenario: Inicio igual al fin de otro turno

- **GIVEN** un turno activo de 10:00 a 10:30 del profesional en el sillón del slot
- **WHEN** se envía `POST /reservar` con inicio 10:30
- **THEN** responde 201 con el turno en `pendiente` de 10:30 a 11:00

### Requirement: Entradas inválidas responden 422 y referencias inexistentes 404

El sistema SHALL responder 422 ante body incompleto, fecha inválida o inicio sin zona horaria, y 404 cuando el profesional o la prestación bien formados no existan.

#### Scenario: Inicio sin zona horaria

- **GIVEN** un body de `POST /reservar` con inicio `2026-11-10T10:00:00` sin zona
- **WHEN** se envía la petición
- **THEN** responde 422 y no persiste ningún turno

#### Scenario: Profesional inexistente

- **GIVEN** un UUID válido que no corresponde a ningún profesional
- **WHEN** se pide `GET /reservar/{uuid}?prestacion={id}&fecha=2026-11-10`
- **THEN** responde 404 y no expone slots

#### Scenario: Prestación inexistente

- **GIVEN** un UUID válido que no corresponde a ninguna prestación
- **WHEN** se envía `POST /reservar` con ese `prestacion_id` bien formado (o se pide el GET con ese `prestacion`)
- **THEN** responde 404 y no persiste ningún turno

#### Scenario: Fecha inválida en GET

- **GIVEN** una petición `GET /reservar/{profesional}` con `prestacion` válido y `fecha=no-fecha`
- **WHEN** se envía la petición
- **THEN** responde 422 y no expone slots

#### Scenario: Body incompleto en POST

- **GIVEN** un body de `POST /reservar` sin un campo obligatorio (por ejemplo sin `inicio` o sin `profesional_id`)
- **WHEN** se envía la petición
- **THEN** responde 422 y no persiste ningún turno

### Requirement: Rate limit por IP en alta pública

El sistema SHALL responder 429 cuando la misma IP supere el umbral configurable de altas públicas en la ventana configurada, sin crear ningún turno.

#### Scenario: Umbral superado bloquea el alta

- **GIVEN** una IP que ya alcanzó el umbral configurado de `POST /reservar`
- **WHEN** esa IP envía otro `POST /reservar` válido
- **THEN** responde 429 y no persiste ningún turno

### Requirement: Rutas públicas sin login ni rol

El sistema SHALL atender `GET /reservar/{profesional}` y `POST /reservar` sin exigir `X-Actor-Rol`, sin responder 403 por ausencia del header.

#### Scenario: Reserva sin header de rol

- **GIVEN** una petición sin header `X-Actor-Rol` y con slot libre
- **WHEN** se envía `POST /reservar` válido
- **THEN** responde 201 y nunca 403 por ausencia del header

#### Scenario: Consulta sin header de rol

- **GIVEN** una petición sin header `X-Actor-Rol`
- **WHEN** se pide `GET /reservar/{profesional}?prestacion={id}&fecha=2026-11-10`
- **THEN** responde 200 con slots y nunca 403 por ausencia del header

# Spec Delta — crear-turno-sin-solapamientos

## Purpose

Permite a recepción crear turnos que nunca se solapen por profesional ni por sillón en `[inicio,fin)`, dentro del horario y sin bloqueos, como núcleo evaluable del TP (US-001).

## ADDED Requirements

### Requirement: Creación válida de turno en pendiente

El sistema SHALL crear el turno en estado `pendiente` y responder 201 cuando paciente, profesional, sillón, prestación e inicio sean válidos, con cobertura total de horario y sin bloqueo ni solape activo.

#### Scenario: Turno válido (201)

- **Dado** un catálogo sembrado (profesional con horario Lun–Vie 9–18, sillón activo, prestación 30 min, paciente) y ningún turno en el slot
- **Cuando** se pide `POST /turnos` con esos ids y un inicio lunes 10:00 `America/Argentina/Buenos_Aires`
- **Entonces** responde 201 con el turno en `pendiente` y el turno queda persistido (verificable por DB directa)

### Requirement: Fin calculado en servidor desde la prestación

El sistema SHALL calcular `fin = inicio + prestacion.duracion_min` en el servidor (RN-AG-01) e ignorar cualquier `fin` enviado por el cliente; el body de entrada no incluye `fin`.

#### Scenario: Fin igual a inicio más duración

- **Dado** una prestación de 30 min y un inicio válido lunes 10:00
- **Cuando** se crea el turno vía `POST /turnos`
- **Entonces** el turno persistido tiene `fin` igual a inicio + 30 min aunque el cliente haya enviado otro `fin` o ninguno

### Requirement: Rechazo por solape del mismo profesional

El sistema SHALL responder 409 con causa `profesional` cuando el intervalo `[inicio,fin)` intersecte otro turno activo (`pendiente`/`confirmado`) del mismo profesional (RN-AG-02), sin crear nada.

#### Scenario: Solape profesional (409)

- **Dado** un turno activo del profesional P en sillón A de 10:00 a 10:30
- **Cuando** se pide `POST /turnos` para P en sillón B de 10:15 a 10:45
- **Entonces** responde 409 con `detail.causa == "profesional"` y no persiste ningún turno nuevo

### Requirement: Rechazo por solape del mismo sillón con otro profesional

El sistema SHALL responder 409 con causa `sillon` cuando el intervalo intersecte otro turno activo del mismo sillón aunque sea de otro profesional (RN-AG-03), sin crear nada.

#### Scenario: Solape sillón con otro profesional (409)

- **Dado** un turno activo del profesional P1 en sillón A de 10:00 a 10:30
- **Cuando** se pide `POST /turnos` para el profesional P2 en sillón A de 10:15 a 10:45
- **Entonces** responde 409 con `detail.causa == "sillon"` y no persiste ningún turno nuevo

### Requirement: Borde adyacente inicio igual a fin aceptado

El sistema SHALL aceptar el turno cuando su inicio coincida exactamente con el fin de otro turno activo del mismo profesional y sillón (intervalos `[inicio,fin)`, RN-AG-04).

#### Scenario: Borde inicio==fin de otro (201)

- **Dado** un turno activo de 10:00 a 10:30
- **Cuando** se pide `POST /turnos` para el mismo profesional y sillón con inicio 10:30
- **Entonces** responde 201 con el turno en `pendiente`

### Requirement: Sillón obligatorio y activo

El sistema SHALL responder 422 cuando `sillon_id` falte en el body (sillón obligatorio en todo turno, RN-AG-03) o cuando el sillón esté inactivo (`activo=false`, supuesto S2 de design.md — NO RN-AG-03: RN-AG-03 cubre sillón obligatorio + no-solape por sillón, no el manejo de sillón inactivo).

#### Scenario: Sin sillón (422)

- **Dado** un body `POST /turnos` válido salvo sin `sillon_id`
- **Cuando** se envía la petición
- **Entonces** responde 422 y no persiste ningún turno

#### Scenario: Sillón inactivo (422)

- **Dado** un sillón existente con `activo=false`
- **Cuando** se pide `POST /turnos` con ese sillón y el resto válido
- **Entonces** responde 422 y no persiste ningún turno
- Derivado del supuesto S2 (design.md), no de KB 05 (RN-AG-03 no cubre sillón inactivo).

### Requirement: Rechazo fuera de horario del profesional

El sistema SHALL responder 409 con causa `horario` cuando el intervalo no esté totalmente cubierto por el `HorarioAtencion` del profesional en `TZ=America/Argentina/Buenos_Aires` (RN-AG-05), sin crear nada.

#### Scenario: Fuera de horario (409)

- **Dado** un profesional con horario Lun–Vie 9–18
- **Cuando** se pide `POST /turnos` un sábado 10:00 o un lunes 18:30 con el resto válido
- **Entonces** responde 409 con `detail.causa == "horario"` y no persiste ningún turno

### Requirement: Rechazo sobre bloqueo aplicable

El sistema SHALL responder 409 con causa `bloqueo` cuando el intervalo intersecte en `[inicio,fin)` un bloqueo aplicable según la matriz (solo-profesional, solo-sillón, global, pareja concreta) (RN-AG-05), sin crear nada.

#### Scenario: Sobre bloqueo (409)

- **Dado** un bloqueo global del 24 al 26 dic 2026 (seed) y un body válido el 25 dic 10:00
- **Cuando** se pide `POST /turnos`
- **Entonces** responde 409 con `detail.causa == "bloqueo"` y no persiste ningún turno

### Requirement: Atomicidad del rechazo 409

El sistema SHALL garantizar que todo rechazo 409 no crea nada: la petición es atómica (rollback, sin commit parcial).

#### Scenario: 409 no crea nada (atómico)

- **Dado** cualquier body que dispare 409 (solape, horario o bloqueo)
- **Cuando** se cuenta la tabla `turnos` por DB directa antes y después del `POST /turnos`
- **Entonces** el conteo no cambia

### Requirement: Turno cancelado o ausente libera recursos

El sistema SHALL excluir los turnos con estado `cancelado` o `ausente` de las búsquedas de solape, de modo que su slot queda reutilizable (RN-TU-01 / RN-06).

#### Scenario: Cancelado libera y permite crear (201)

- **Dado** un turno cancelado del profesional P en sillón A de 10:00 a 10:30 (creado dentro del test, no en seed)
- **Cuando** se pide `POST /turnos` para P en sillón A de 10:00 a 10:30 con el resto válido
- **Entonces** responde 201 con el turno en `pendiente`

### Requirement: Referencias inexistentes y formato de errores

El sistema SHALL responder 404 cuando una FK (`paciente_id`, `profesional_id`, `sillon_id`, `prestacion_id`) esté bien formada (UUID válido) pero no exista, y 422 cuando el body tenga tipos inválidos, `sillon_id` ausente o datetimes sin zona; el body 409 SHALL tener forma exacta `{"detail": {"causa": "<profesional|sillon|horario|bloqueo>", "detalle": "<texto>"}}`.

#### Scenario: FK bien formada pero inexistente (404)

- **Dado** un UUID válido que no corresponde a ningún profesional
- **Cuando** se pide `POST /turnos` con ese `profesional_id` y el resto válido
- **Entonces** responde 404 y no persiste ningún turno
- Derivado del supuesto S3 (design.md), no de KB 05.

#### Scenario: Body con causa exacta en 409

- **Dado** un solape de profesional
- **Cuando** se pide `POST /turnos`
- **Entonces** el cuerpo es `{"detail": {"causa": "profesional", "detalle": "<texto no vacío>"}}`

### Requirement: Red de seguridad a nivel base de datos

La base de datos SHALL rechazar con violación de restricción de exclusión toda inserción directa (bypass del servicio) de dos turnos activos solapados del mismo profesional o del mismo sillón, incluso bajo escrituras concurrentes.

#### Scenario: Inserción directa solapada rechazada por la base

- **Dado** un turno activo persistido de 10:00 a 10:30
- **Cuando** se inserta por SQL directo (sin pasar por el servicio) otro turno activo solapado del mismo profesional o sillón
- **Entonces** PostgreSQL rechaza la inserción por violación de la exclusion constraint

### Requirement: Orden de validación y precedencia de causa

El sistema SHALL aplicar las validaciones en este orden fijo, que determina la causa reportada cuando falla más de una condición: 1) schema Pydantic → 422; 2) FKs existen → 404/422; 3) sillón activo → 422; 4) horario → 409 `horario`; 5) bloqueo → 409 `bloqueo`; 6) solape profesional → 409 `profesional`; 7) solape sillón → 409 `sillon`; 8) si pasa todo → 201 en `pendiente`.

#### Scenario: Precedencia horario antes que solape

- **Dado** un slot fuera de horario que además solaparía un turno existente
- **Cuando** se pide `POST /turnos`
- **Entonces** responde 409 con `detail.causa == "horario"`

### Requirement: Estados solo con enum y default pendiente

El sistema SHALL restringir `estado` a (`pendiente`,`confirmado`,`atendido`,`ausente`,`cancelado`) con default `pendiente` a nivel DB; `POST /turnos` crea siempre en `pendiente` y no implementa transiciones (son de C-04, sin contradecir RN-ES-01).

#### Scenario: Estado inicial siempre pendiente

- **Dado** cualquier body válido de `POST /turnos` (sin campo estado, o con estado si el schema lo acepta)
- **Cuando** se crea el turno
- **Entonces** el turno persistido tiene `estado == "pendiente"`

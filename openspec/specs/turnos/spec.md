# turnos

## Purpose

Permite a recepción crear turnos que nunca se solapen por profesional ni por sillón en `[inicio,fin)`, dentro del horario y sin bloqueos, como núcleo evaluable del TP (US-001).

## Requirements

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

El sistema SHALL restringir `estado` a (`pendiente`,`confirmado`,`atendido`,`ausente`,`cancelado`) con default `pendiente` a nivel DB; `POST /turnos` crea siempre en `pendiente`. Las transiciones implementadas son las de RN-ES-01: `pendiente` → `confirmado` (C-07), `pendiente`/`confirmado` → `cancelado` (C-04) y reprogramación de `pendiente`/`confirmado` sin cambio de estado (C-04).

#### Scenario: Estado inicial siempre pendiente

- **WHEN** se crea un turno con cualquier body válido de `POST /turnos` (sin campo estado, o con estado si el schema lo acepta)
- **THEN** el turno persistido tiene `estado == "pendiente"`

#### Scenario: Confirmación como transición disponible

- **WHEN** se confirma por el enlace de un toque de C-07 un turno persistido en `pendiente`
- **THEN** el turno queda en `confirmado` y las transiciones de RN-ES-01 no listadas (`confirmado` → `pendiente`, `atendido`/`ausente` → otro estado) siguen rechazándose

### Requirement: Cancelación de turno activo

El sistema SHALL cambiar `estado` a `cancelado` y responder 200 cuando se cancele un turno en `pendiente` o `confirmado` (RN-ES-01), sin borrar la fila ni modificar `inicio`/`fin`.

#### Scenario: Cancelar turno pendiente (esperado)

- **Dado** un turno persistido en `pendiente` de 10:00 a 10:30 del profesional P en el sillón A
- **Cuando** se pide `POST /turnos/{id}/cancelar`
- **Entonces** responde 200 con el turno en `cancelado`, `inicio` y `fin` sin cambios, y la fila sigue existiendo (verificable por DB directa: el conteo de `turnos` no baja)

#### Scenario: Cancelar turno confirmado (esperado)

- **Dado** un turno persistido en `confirmado` de 10:00 a 10:30 (insertado directo en la DB por el fixture: C-04 no expone endpoint de confirmación)
- **Cuando** se pide `POST /turnos/{id}/cancelar`
- **Entonces** responde 200 con el turno en `cancelado` y la fila conserva su `inicio` y `fin`

### Requirement: Rechazo de cancelación en estado final

El sistema SHALL responder 409 y dejar el turno sin cambios cuando se intente cancelar un turno en `atendido`, `ausente` o `cancelado`, porque RN-ES-01 no admite otras transiciones.

#### Scenario: Cancelar turno atendido (error de negocio)

- **Dado** un turno persistido en `atendido`
- **Cuando** se pide `POST /turnos/{id}/cancelar`
- **Entonces** responde 409 y el turno sigue en `atendido` (verificable por DB directa)

#### Scenario: Cancelar turno ya cancelado (error de negocio)

- **Dado** un turno persistido en `cancelado`
- **Cuando** se pide `POST /turnos/{id}/cancelar`
- **Entonces** responde 409 y el turno sigue en `cancelado` (no es idempotente: repetir la cancelación es una transición inválida)

### Requirement: Turno inexistente en cancelar o reprogramar

El sistema SHALL responder 404 cuando el `turno_id` de la ruta esté bien formado (UUID válido) pero no corresponda a ningún turno, tanto al cancelar como al reprogramar.

#### Scenario: Cancelar turno inexistente (error)

- **Dado** un UUID válido que no corresponde a ningún turno
- **Cuando** se pide `POST /turnos/{id}/cancelar`
- **Entonces** responde 404 y no se modifica ninguna fila de `turnos`

#### Scenario: Reprogramar turno inexistente (error)

- **Dado** un UUID válido que no corresponde a ningún turno
- **Cuando** se pide `POST /turnos/{id}/reprogramar` con un `inicio` válido
- **Entonces** responde 404 y no se modifica ninguna fila de `turnos`

### Requirement: Liberación del horario al cancelar

El sistema SHALL dejar el intervalo `[inicio,fin)` de un turno cancelado reutilizable, de modo que un turno nuevo para el mismo profesional y el mismo sillón en ese intervalo exacto se cree sin conflicto (RN-TU-01 / RN-ES-02).

#### Scenario: Slot liberado y reutilizable (esperado)

- **Dado** un turno en `pendiente` del profesional P en el sillón A de 10:00 a 10:30, cancelado con éxito
- **Cuando** se pide `POST /turnos` para P en el sillón A de 10:00 a 10:30 con el resto válido
- **Entonces** responde 201 con el turno nuevo en `pendiente`, y por DB directa existen dos filas en ese intervalo: una `cancelado` (el original) y una `pendiente` (el nuevo)

### Requirement: Reprogramación con fin recalculado

El sistema SHALL aceptar un nuevo `inicio` para un turno en `pendiente` o `confirmado`, recalcular `fin = nuevo_inicio + prestacion.duracion_min` (RN-AG-01) y responder 200 conservando paciente, profesional, sillón, prestación y estado del turno.

#### Scenario: Reprogramar sin conflicto (esperado)

- **Dado** un turno en `pendiente` de 10:00 a 10:30 con prestación de 30 min, y el slot 11:00–11:30 libre
- **Cuando** se pide `POST /turnos/{id}/reprogramar` con `inicio` 11:00
- **Entonces** responde 200 con `inicio` 11:00 y `fin` 11:30, y el turno sigue en `pendiente` con el mismo `id`, `paciente_id`, `profesional_id`, `sillon_id` y `prestacion_id`

#### Scenario: Reprogramar libera el horario original (esperado)

- **Dado** el mismo turno reprogramado de 10:00–10:30 a 11:00–11:30
- **Cuando** se pide `POST /turnos` para el mismo profesional y sillón con `inicio` 10:00
- **Entonces** responde 201: el intervalo original quedó libre porque `ix_turnos_*_activo` y las `EXCLUDE` solo miran las filas `pendiente`/`confirmado` en su rango actual

### Requirement: Rechazo de reprogramación por solape

El sistema SHALL responder 409 con la causa del conflicto (`profesional`, `sillon`, `horario` o `bloqueo`) y conservar el turno original intacto —mismo `inicio` y `fin`— cuando el nuevo intervalo no pase las mismas validaciones que crear (RN-TU-02).

#### Scenario: Solape de profesional al reprogramar (error de negocio)

- **Dado** un turno del profesional P en el sillón A de 10:00 a 10:30 y otro turno activo del profesional P en el sillón B de 11:00 a 11:30
- **Cuando** se pide reprogramar el primero con `inicio` 11:15
- **Entonces** responde 409 con `detail.causa == "profesional"` y el turno original sigue en 10:00–10:30 por DB directa

#### Scenario: Solape de sillón al reprogramar (error de negocio)

- **Dado** un turno del profesional P1 en el sillón A de 10:00 a 10:30 y otro turno activo del profesional P2 en el sillón A de 11:00 a 11:30
- **Cuando** se pide reprogramar el primero con `inicio` 11:15
- **Entonces** responde 409 con `detail.causa == "sillon"` y el turno original sigue en 10:00–10:30 por DB directa

### Requirement: Borde de adyacencia en reprogramación

El sistema SHALL tratar los intervalos como semiabiertos `[inicio,fin)`: aceptar un nuevo `inicio` igual al `fin` de otro turno activo del mismo profesional y sillón, y rechazar con 409 un nuevo intervalo idéntico al de otro turno activo (RN-AG-04).

#### Scenario: Nuevo inicio igual al fin de otro turno (borde, aceptado)

- **Dado** un turno del profesional P en el sillón A de 11:00 a 11:30 y un turno a reprogramar del mismo P y sillón en 10:00–10:30
- **Cuando** se pide reprogramar el segundo con `inicio` 11:30
- **Entonces** responde 200 con `inicio` 11:30 y `fin` 12:00, sin conflicto

#### Scenario: Nuevo intervalo idéntico a otro turno activo (borde, rechazado)

- **Dado** un turno activo del profesional P en el sillón A de 11:00 a 11:30 y un turno a reprogramar del mismo P y sillón en 10:00–10:30
- **Cuando** se pide reprogramar el segundo con `inicio` 11:00
- **Entonces** responde 409 con `detail.causa == "profesional"` y el turno original sigue en 10:00–10:30

### Requirement: Rechazo de reprogramación en estado final

El sistema SHALL responder 409 y conservar el turno sin cambios cuando se intente reprogramar un turno en `atendido`, `ausente` o `cancelado` (RN-ES-01).

#### Scenario: Reprogramar turno cancelado (error de negocio)

- **Dado** un turno persistido en `cancelado` de 10:00 a 10:30
- **Cuando** se pide `POST /turnos/{id}/reprogramar` con `inicio` 11:00 (slot libre, dentro de horario)
- **Entonces** responde 409 y el turno sigue en `cancelado` con `inicio` 10:00 y `fin` 10:30 por DB directa

### Requirement: Rechazo de reprogramación con inicio inválido

El sistema SHALL responder 422 sin modificar el turno cuando el body de reprogramación no incluya `inicio` o lo envíe sin zona horaria; el body solo admite `inicio` (no `fin`, no reasignación de recursos).

#### Scenario: Reprogramar sin inicio (borde de input, 422)

- **Dado** un turno activo de 10:00 a 10:30
- **Cuando** se pide `POST /turnos/{id}/reprogramar` con un body `{}`
- **Entonces** responde 422 y el turno sigue en 10:00–10:30 por DB directa

#### Scenario: Reprogramar con inicio sin zona horaria (borde de input, 422)

- **Dado** un turno activo de 10:00 a 10:30
- **Cuando** se pide `POST /turnos/{id}/reprogramar` con `inicio` `"2026-10-12T11:00:00"` (naive)
- **Entonces** responde 422 y el turno sigue en 10:00–10:30 por DB directa

### Requirement: Red de seguridad de la base mapeada a 409

El sistema SHALL responder 409 —nunca 500— cuando la escritura de la reprogramación viole `ex_turnos_profesional_sin_solape` o `ex_turnos_sillon_sin_solape` (SQLSTATE `23P01`) por una carrera entre la validación previa y el `UPDATE`, dejando el turno sin modificar.

#### Scenario: Violación de exclusion constraint mapeada a 409 (borde de concurrencia)

- **Dado** un turno activo que pasa la validación previa del servicio y, entre esa validación y el `UPDATE`, otro turno activo solapado queda persistido (carrera simulada en el test)
- **Cuando** el `UPDATE` de la reprogramación dispara una violación de `ex_turnos_profesional_sin_solape` o `ex_turnos_sillon_sin_solape`
- **Entonces** la API responde 409 (nunca 500) y el turno conserva su `inicio` y `fin` originales por DB directa

### Requirement: Confirmación de turno pendiente

El sistema SHALL cambiar `estado` a `confirmado` y responder 200 cuando se
confirme un turno en `pendiente` (RN-ES-01), sin modificar `inicio`, `fin`,
paciente, profesional, sillón ni prestación.

#### Scenario: Confirmar turno pendiente

- **WHEN** se confirma un turno persistido en `pendiente`
- **THEN** responde 200 con el turno en `confirmado` y conserva inicio, fin, paciente, profesional, sillón y prestación

### Requirement: Rechazo de confirmación fuera de pendiente

El sistema SHALL responder 409 con causa `transicion` y dejar el turno sin cambios
cuando se intente confirmar un turno que no esté en `pendiente`, porque RN-ES-01
no admite esas transiciones.

#### Scenario: Confirmar turno ya confirmado

- **WHEN** se confirma un turno persistido en `confirmado`
- **THEN** responde 409 con causa `transicion` y el turno sigue en `confirmado`

#### Scenario: Confirmar turno cancelado

- **WHEN** se confirma un turno persistido en `cancelado`
- **THEN** responde 409 con causa `transicion` y el turno sigue en `cancelado`

#### Scenario: Confirmar turno atendido

- **WHEN** se confirma un turno persistido en `atendido`
- **THEN** responde 409 con causa `transicion` y el turno sigue en `atendido`

#### Scenario: Confirmar turno ausente

- **WHEN** se confirma un turno persistido en `ausente`
- **THEN** responde 409 con causa `transicion` y el turno sigue en `ausente`

### Requirement: Confirmación sin validación de agenda

El sistema SHALL confirmar el turno sin revalidar horario, bloqueo ni solape,
porque la transición no modifica el intervalo ni los recursos del turno.

#### Scenario: Confirmar un turno cuyo horario ya no está configurado

- **WHEN** se confirma un turno `pendiente` cuyo horario dejó de estar cubierto por la configuración actual del profesional
- **THEN** responde 200 y el turno queda `confirmado`

### Requirement: Turno inexistente al confirmar

El sistema SHALL responder 404 cuando el turno a confirmar esté bien formado
(UUID válido) pero no corresponda a ningún turno.

#### Scenario: Confirmar turno inexistente

- **WHEN** se intenta confirmar un UUID válido que no corresponde a ningún turno
- **THEN** responde 404 y no se modifica ninguna fila de `turnos`

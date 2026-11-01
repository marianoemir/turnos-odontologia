# Spec Delta — cancelar-reprogramar

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Estados solo con enum y default pendiente

El sistema SHALL restringir `estado` a (`pendiente`,`confirmado`,`atendido`,`ausente`,`cancelado`) con default `pendiente` a nivel DB; `POST /turnos` crea siempre en `pendiente`, y C-04 implementa solo las transiciones de RN-ES-01: `pendiente`/`confirmado` → `cancelado` y reprogramación de `pendiente`/`confirmado` sin cambio de estado.

#### Scenario: Estado inicial siempre pendiente

- **Dado** cualquier body válido de `POST /turnos` (sin campo estado, o con estado si el schema lo acepta)
- **Cuando** se crea el turno
- **Entonces** el turno persistido tiene `estado == "pendiente"`

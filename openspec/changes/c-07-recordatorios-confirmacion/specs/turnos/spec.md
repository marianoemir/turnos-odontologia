# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Estados solo con enum y default pendiente

El sistema SHALL restringir `estado` a (`pendiente`,`confirmado`,`atendido`,`ausente`,`cancelado`) con default `pendiente` a nivel DB; `POST /turnos` crea siempre en `pendiente`. Las transiciones implementadas son las de RN-ES-01: `pendiente` → `confirmado` (C-07), `pendiente`/`confirmado` → `cancelado` (C-04) y reprogramación de `pendiente`/`confirmado` sin cambio de estado (C-04).

#### Scenario: Estado inicial siempre pendiente

- **WHEN** se crea un turno con cualquier body válido de `POST /turnos` (sin campo estado, o con estado si el schema lo acepta)
- **THEN** el turno persistido tiene `estado == "pendiente"`

#### Scenario: Confirmación como transición disponible

- **WHEN** se confirma por el enlace de un toque de C-07 un turno persistido en `pendiente`
- **THEN** el turno queda en `confirmado` y las transiciones de RN-ES-01 no listadas (`confirmado` → `pendiente`, `atendido`/`ausente` → otro estado) siguen rechazándose

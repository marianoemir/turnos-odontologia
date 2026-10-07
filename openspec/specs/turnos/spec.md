# turnos

## Purpose

Permite a recepción crear turnos que nunca se solapan por profesional ni por sillón/box, eliminando las dobles reservas del consultorio.

## Requirements

### Requirement: Duración fija por prestación
Todo turno SHALL ocupar el intervalo [inicio, inicio + duración de su prestación).

#### Scenario: Fin calculado desde la prestación
- **WHEN** recepción crea un turno con inicio T para una prestación de N minutos
- **THEN** el turno ocupa [T, T+N) y su fin es visible en la agenda

### Requirement: Sin solape por profesional
El sistema SHALL rechazar todo turno cuyo intervalo intersecte el de otro turno activo del mismo profesional.

#### Scenario: Solape de profesional rechazado
- **WHEN** existe un turno activo del profesional P en [10:00,10:30) y se pide otro en [10:15,10:45)
- **THEN** la creación se rechaza con conflicto de profesional y no se crea nada

### Requirement: Sillón obligatorio sin solape
Todo turno SHALL indicar un sillón/box, y el sistema SHALL rechazar el turno si su intervalo intersecta el de otro turno activo del mismo sillón/box.

#### Scenario: Falta de sillón rechazada
- **WHEN** se pide un turno sin sillón/box
- **THEN** la creación se rechaza como input inválido

#### Scenario: Solape de sillón rechazado
- **WHEN** existe un turno activo en el sillón S en [10:00,10:30) y se pide otro en S en [10:20,10:50) con distinto profesional
- **THEN** la creación se rechaza con conflicto de sillón y no se crea nada

### Requirement: Borde inicio igual a fin
Un turno que empieza exactamente cuando termina otro NO SHALL considerarse solapamiento.

#### Scenario: Turnos encadenados aceptados
- **WHEN** existe un turno activo en [10:00,10:30) y se pide otro en [10:30,11:00) con igual profesional y sillón
- **THEN** la creación se acepta

### Requirement: Dentro de horario y sin bloqueos
El sistema SHALL rechazar todo turno fuera del horario de atención de su profesional o superpuesto con un bloqueo aplicable.

#### Scenario: Fuera de horario rechazado
- **WHEN** se pide un turno fuera del horario del profesional
- **THEN** la creación se rechaza con conflicto de horario

#### Scenario: Sobre bloqueo rechazado
- **WHEN** se pide un turno que intersecta un bloqueo aplicable
- **THEN** la creación se rechaza con conflicto de bloqueo

### Requirement: Estado inicial pendiente
Todo turno creado SHALL nacer en estado pendiente.

#### Scenario: Alta en pendiente
- **WHEN** la creación es válida
- **THEN** el turno existe en estado pendiente y figura en la agenda

### Requirement: Códigos ante conflicto e input inválido
Los rechazos por solape, horario o bloqueo SHALL responder 409 con la causa; los rechazos por input inválido (sin sillón, prestación inexistente) SHALL responder 422.

#### Scenario: Causa visible en el rechazo
- **WHEN** una creación es rechazada
- **THEN** la respuesta indica si fue conflicto (profesional|sillon|horario|bloqueo) o input inválido

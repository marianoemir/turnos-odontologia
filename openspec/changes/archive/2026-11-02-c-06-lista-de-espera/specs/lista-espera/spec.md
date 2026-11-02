# Spec Delta

## Purpose

Gestiona la lista de espera de pacientes para rellenar huecos liberados por
cancelaciones, ofreciendo turnos validados por el servicio de turnos y avanzando
en orden FIFO cuando un paciente rechaza.

## ADDED Requirements

### Requirement: Alta en lista de espera

El sistema SHALL permitir dar de alta un paciente en la lista de espera con
profesional opcional y prestacion obligatoria, registrando estado pendiente y
fecha de creacion.

#### Scenario: Alta valida

- **WHEN** se envia POST /lista-espera con paciente, prestacion y profesional
  opcional
- **THEN** se crea una entrada con estado pendiente y creado_en seteado

#### Scenario: Alta sin profesional

- **WHEN** se envia POST /lista-espera sin profesional_id
- **THEN** se crea una entrada general asociada solo a la prestacion

#### Scenario: Paciente inexistente

- **WHEN** se envia POST /lista-espera con paciente_id inexistente
- **THEN** responde 404

### Requirement: Consulta FIFO

El sistema SHALL exponer GET /lista-espera que devuelva las entradas pendientes
ordenadas por creado_en ascendente, filtrable por profesional.

#### Scenario: Orden FIFO

- **WHEN** existen varias entradas pendientes
- **THEN** GET devuelve ordenadas por creado_en ascendente

#### Scenario: Filtro por profesional

- **WHEN** se consulta con ?profesional=
- **THEN** devuelve solo las entradas de ese profesional (y las generales si
  aplica)

### Requirement: Ofrecer hueco crea turno valido

El sistema SHALL, al ofrecer un hueco a una entrada pendiente, crear un turno
mediante ServicioTurnos.crear() y marcar la entrada como ofrecida con turno_id.

#### Scenario: Hueco libre

- **WHEN** se envia POST /lista-espera/{id}/ofrecer con un slot libre
- **THEN** se crea un turno valido (estado pendiente) y la entrada queda
  ofrecida con turno_id

#### Scenario: Hueco ocupado

- **WHEN** el slot solicitado solapa con un turno activo
- **THEN** responde 409 y la entrada vuelve a pendiente sin turno creado

### Requirement: Respuesta del paciente

El sistema SHALL permitir aceptar o rechazar la oferta: al aceptar marca la
entrada asignada; al rechazar cancela el turno ofrecido, marca la entrada baja
y avanza al siguiente en FIFO.

#### Scenario: Acepta

- **WHEN** el paciente acepta la oferta
- **THEN** la entrada queda en estado asignado

#### Scenario: Rechaza y avanza

- **WHEN** el paciente rechaza la oferta
- **THEN** la entrada queda en baja, el turno ofrecido se cancela y el
  siguiente pendiente en FIFO queda disponible

### Requirement: Sin hard delete

El sistema SHALL no eliminar entradas de lista ni turnos; las bajas son cambios
de estado.

#### Scenario: Baja preserva registro

- **WHEN** una entrada se marca baja
- **THEN** el registro permanece en la base con estado baja

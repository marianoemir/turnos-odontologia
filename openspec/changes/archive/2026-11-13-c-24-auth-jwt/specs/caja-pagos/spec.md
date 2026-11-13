## MODIFIED Requirements

### Requirement: Denegación de caja sin efectos laterales ni 401

Una denegación por rol SHALL responder HTTP 403 con `detail = {"causa": "permiso_denegado", "detalle": "..."}`, SHALL ocurrir antes de cualquier escritura y no SHALL responder HTTP 500. La falta de token válido responde HTTP 401.

#### Scenario: Escritura denegada no crea filas

- **GIVEN** un token válido con rol `paciente` y una base sin caja del día
- **WHEN** se envía `POST /caja/abrir` y luego `POST /cobros` con payloads válidos
- **THEN** ambas respuestas son HTTP 403 y no se crea ninguna caja ni ningún cobro

#### Scenario: La denegación no se confunde con falta de autenticación

- **GIVEN** un token válido con rol `odontologo` sobre `POST /cobros`
- **WHEN** se envía un payload válido
- **THEN** la respuesta es HTTP 403 con `detail.causa = "permiso_denegado"` y no HTTP 401

### Requirement: Compatibilidad del rol por defecto en caja

Se elimina la asunción del rol `recepcion` por defecto en peticiones sin header de identidad. Peticiones sin token válido SHALL responder HTTP 401 con `detail.causa = "token_ausente"`.

#### Scenario: Los clientes existentes de caja siguen funcionando sin identidad

- **GIVEN** un request sin header de identidad a `POST /caja/abrir`
- **WHEN** se envía el request
- **THEN** la respuesta es HTTP 401 con `detail.causa = "token_ausente"`

#### Scenario: El default conserva los errores de negocio

- **GIVEN** un request sin header de identidad
- **WHEN** se envía `POST /caja/abrir`
- **THEN** la respuesta es HTTP 401 antes de evaluar la lógica de negocio

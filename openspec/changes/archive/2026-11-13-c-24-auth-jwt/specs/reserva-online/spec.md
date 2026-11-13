## MODIFIED Requirements

### Requirement: Rutas públicas sin login ni rol

El sistema SHALL atender `GET /reservar/{profesional}` y `POST /reservar` como rutas públicas sin requerir autenticación JWT ni cabeceras de rol, permitiendo el acceso sin token ni responder 401/403.

#### Scenario: Reserva sin header de rol

- **GIVEN** una petición sin header `Authorization` y con slot libre
- **WHEN** se envía `POST /reservar` válido
- **THEN** responde 201 y nunca 401 ni 403 por ausencia de credenciales

#### Scenario: Consulta sin header de rol

- **GIVEN** una petición sin header `Authorization` para consultar slots
- **WHEN** se consulta `GET /reservar/{profesional}` con fecha y prestación válidas
- **THEN** responde 200 con los slots y nunca 401 ni 403

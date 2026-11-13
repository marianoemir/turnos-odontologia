## MODIFIED Requirements

### Requirement: Resolución del contexto de permiso desde el rol actuante

El sistema SHALL resolver un `PermissionContext` por request a partir del header `Authorization: Bearer <token>`, verificando la validez del JWT, su firma con HS256 y la existencia y vigencia del usuario en la base de datos. Sin token válido, el sistema SHALL responder HTTP 401 con `detail.causa` y `detail.detalle` y header `WWW-Authenticate: Bearer`. Los headers `X-Actor-Rol`, `X-Actor-Usuario` y `X-Sucursal-Id` dejan de otorgar identidad y dejan de ser leídos. El contexto SHALL exponer `origen = "jwt"` y sucursal resuelta del token o None si no aplica.

#### Scenario: Header válido produce el contexto del rol indicado

- **GIVEN** un request con token válido con rol odontólogo
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el contexto expone `rol = "odontologo"` y `origen = "jwt"`

#### Scenario: Ausencia de header asume recepción por compatibilidad

- **GIVEN** un request sin token en una ruta protegida
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el sistema responde HTTP 401 con `detail.causa = "token_ausente"` y no asume recepción

#### Scenario: Rol desconocido responde 422

- **GIVEN** un token con un rol que no existe en el sistema
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el sistema responde HTTP 401 con `detail.causa = "sesion_invalida"`

#### Scenario: Capitalización distinta en el rol responde 422

- **GIVEN** un token con rol en mayúsculas no canónico
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el sistema responde HTTP 401 con `detail.causa = "sesion_invalida"`

#### Scenario: Sucursal de header inválida responde 422

- **GIVEN** un request a una ruta protegida
- **WHEN** se envía `X-Sucursal-Id` en los headers
- **THEN** el header se ignora y la identidad se resuelve exclusivamente desde el token

### Requirement: Compatibilidad con clientes sin identidad

Se elimina el default `recepcion`. El sistema SHALL requerir autenticación JWT en todas las rutas protegidas. Sin token válido, el sistema SHALL responder HTTP 401.

#### Scenario: Cliente existente sin header conserva el comportamiento

- **GIVEN** un request a `POST /caja/abrir` sin header de autenticación
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** la respuesta es HTTP 401 con `detail.causa = "token_ausente"`

#### Scenario: El default no otorga permisos de administración

- **GIVEN** un request sin header de identidad a `GET /roles` y a `GET /export`
- **WHEN** el endpoint resuelve el contexto
- **THEN** ambas respuestas son HTTP 401 con `detail.causa = "token_ausente"`

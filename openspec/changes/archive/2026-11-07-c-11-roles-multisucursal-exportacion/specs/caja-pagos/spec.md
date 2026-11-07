# Spec Delta: caja-pagos

## ADDED Requirements

### Requirement: Autorización por rol de las operaciones de caja

Las 9 operaciones de caja SHALL exigir un rol válido antes de ejecutar su lógica de negocio, mediante una capability de `PERMISOS_POR_ROL` evaluada como `Depends(...)`. `admin` SHALL poder ejecutar todas. `recepcion` SHALL poder ejecutar todas. `odontologo` SHALL poder ejecutar solo las consultas de lectura. `paciente` SHALL ser rechazado en todas. Un rol válido sin permiso SHALL recibir HTTP 403 con `detail.causa = "permiso_denegado"`.

#### Scenario: Apertura de caja respeta la matriz de roles

- **GIVEN** contextos de rol `admin`, `recepcion`, `odontologo` y `paciente`
- **WHEN** cada uno envía `POST /caja/abrir` con un payload válido sobre una base sin caja del día
- **THEN** `admin` y `recepcion` obtienen HTTP 201, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Cierre de caja respeta la matriz de roles

- **GIVEN** una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /caja/cerrar` con un payload válido
- **THEN** `admin` y `recepcion` obtienen HTTP 200, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Consulta de caja por identificador respeta la matriz de roles

- **GIVEN** una caja existente y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /caja/{id}`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

#### Scenario: Consulta de caja por fecha respeta la matriz de roles

- **GIVEN** una caja existente para la fecha local y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /caja`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

#### Scenario: Registro de cobro respeta la matriz de roles

- **GIVEN** una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /cobros` con un payload válido
- **THEN** `admin` y `recepcion` obtienen HTTP 201, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Consulta de cobro respeta la matriz de roles

- **GIVEN** un cobro existente y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /cobros/{id}`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

#### Scenario: Anulación de cobro respeta la matriz de roles

- **GIVEN** un cobro registrado en una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /cobros/{id}/anular` con un motivo válido
- **THEN** `admin` y `recepcion` obtienen HTTP 200, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Facturación ARCA respeta la matriz de roles

- **GIVEN** un cobro facturable en una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /cobros/{id}/factura-arca` con un tipo válido
- **THEN** `admin` y `recepcion` obtienen HTTP 201, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Listado de liquidaciones OS respeta la matriz de roles

- **GIVEN** al menos una liquidación de obra social y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /liquidaciones-os`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

### Requirement: Denegación de caja sin efectos laterales ni 401

Una denegación por rol SHALL responder HTTP 403 con `detail = {"causa": "permiso_denegado", "detalle": "..."}`, SHALL ocurrir antes de cualquier escritura y no SHALL responder HTTP 401 ni HTTP 500. El sistema no SHALL emitir el código 401 mientras no exista autenticación real.

#### Scenario: Escritura denegada no crea filas

- **GIVEN** un contexto `paciente` y una base sin caja del día
- **WHEN** se envía `POST /caja/abrir` y luego `POST /cobros` con payloads válidos
- **THEN** ambas respuestas son HTTP 403 y no se crea ninguna caja ni ningún cobro

#### Scenario: La denegación no se confunde con falta de autenticación

- **GIVEN** un contexto `odontologo` sobre `POST /cobros`
- **WHEN** se envía un payload válido
- **THEN** la respuesta es HTTP 403 con `detail.causa = "permiso_denegado"` y no HTTP 401

### Requirement: Compatibilidad del rol por defecto en caja

Mientras no exista login real, un request de caja sin header `X-Actor-Rol` SHALL resolverse como `recepcion` y SHALL conservar exactamente el comportamiento previo de los 9 endpoints, incluidos sus códigos de negocio 200, 201, 404, 409 y 422.

#### Scenario: Los clientes existentes de caja siguen funcionando sin identidad

- **GIVEN** un request sin header de identidad
- **WHEN** se envía `POST /caja/abrir` con un payload válido
- **THEN** la respuesta es HTTP 201, idéntica a la de C-10

#### Scenario: El default conserva los errores de negocio

- **GIVEN** un request sin header de identidad y una caja ya abierta
- **WHEN** se envía `POST /caja/abrir` nuevamente
- **THEN** la respuesta es HTTP 409 con `detail.causa = "caja_ya_abierta"` y no HTTP 403

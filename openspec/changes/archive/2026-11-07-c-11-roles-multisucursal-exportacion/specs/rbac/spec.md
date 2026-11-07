# Spec Delta: rbac

## Purpose

Define el modelo de roles internos, el contexto de permiso que resuelve el rol actuante de cada request y la autorización por rol de los endpoints administrativos y de caja, sin autenticación real.

## ADDED Requirements

### Requirement: Resolución del contexto de permiso desde el rol actuante

El sistema SHALL resolver un `PermissionContext` por request a partir del header `X-Actor-Rol` (`admin`, `recepcion`, `odontologo`, `paciente`). Si el header falta, SHALL asumir `recepcion` con `origen = "default_compatibilidad"`. Un rol no reconocido SHALL responder HTTP 422, y un `X-Sucursal-Id` que no sea un UUID válido existente en `sucursales` SHALL responder HTTP 422.

#### Scenario: Header válido produce el contexto del rol indicado

- **GIVEN** un request con header `X-Actor-Rol: odontologo`
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el contexto expone `rol = "odontologo"` y `origen = "header"`

#### Scenario: Ausencia de header asume recepción por compatibilidad

- **GIVEN** un request sin header `X-Actor-Rol`
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el contexto expone `rol = "recepcion"` y `origen = "default_compatibilidad"`

#### Scenario: Rol desconocido responde 422

- **GIVEN** un request con header `X-Actor-Rol: superusuario`
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el sistema responde HTTP 422 con una causa de rol desconocido y no ejecuta la operación

#### Scenario: Capitalización distinta en el rol responde 422

- **GIVEN** un request con header `X-Actor-Rol: ADMIN`
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el sistema responde HTTP 422 con causa de rol desconocido, porque la comparación es exacta y case-sensitive

#### Scenario: Sucursal de header inválida responde 422

- **GIVEN** un request con `X-Sucursal-Id` que no es un UUID o que no existe en `sucursales`
- **WHEN** el endpoint resuelve el contexto de permiso
- **THEN** el sistema responde HTTP 422 con causa de sucursal inválida y no ejecuta la operación

### Requirement: Autorización por rol con respuesta 403 uniforme

Las dependencias de autorización SHALL permitir la ejecución solo si el rol del contexto está autorizado por la matriz canónica `PERMISOS_POR_ROL`, la misma que expone `GET /roles`. La verificación SHALL ejecutarse como `Depends(...)` antes del handler. Un rol válido sin permiso SHALL responder HTTP 403 con `detail.causa = "permiso_denegado"`, sin ejecutar la operación ni devolver 401 o 500.

#### Scenario: Rol autorizado continúa la operación

- **GIVEN** un contexto con rol `recepcion` sobre un endpoint que admite `recepcion`
- **WHEN** se invoca el endpoint con un payload válido
- **THEN** la operación se ejecuta y responde con su código de negocio habitual

#### Scenario: Rol válido sin permiso responde 403

- **GIVEN** un contexto con rol `odontologo` sobre un endpoint que solo admite `admin` y `recepcion`
- **WHEN** se invoca el endpoint con un payload válido
- **THEN** el sistema responde HTTP 403 con `detail.causa = "permiso_denegado"`

#### Scenario: La matriz derivada coincide con la matriz documentada

- **GIVEN** la matriz canónica capability → roles de `backend/app/rbac/permissions.py`
- **WHEN** se deriva la lista de roles de la capability de cada uno de los 9 endpoints de caja
- **THEN** cada lista coincide exactamente con la columna correspondiente de la matriz endpoint × rol documentada, y una divergencia se considera defecto

#### Scenario: Denegación no produce efectos laterales

- **GIVEN** un contexto con rol `paciente` sobre un endpoint de escritura de caja
- **WHEN** se invoca el endpoint con un payload válido
- **THEN** el sistema responde HTTP 403 y no crea ni modifica ninguna fila

### Requirement: Autorización exclusiva de administración

Los endpoints de administración de roles, sucursales y asignaciones usuario-sucursal, y la exportación total, SHALL exigir el rol `admin` mediante `require_admin()`. Cualquier otro rol válido SHALL recibir HTTP 403.

#### Scenario: Admin accede a la administración

- **GIVEN** un contexto con rol `admin`
- **WHEN** se invoca un endpoint administrativo o `GET /export`
- **THEN** la operación se ejecuta y responde con éxito

#### Scenario: Recepción, odontólogo y paciente son rechazados en administración

- **GIVEN** un contexto con rol `recepcion`, `odontologo` o `paciente`
- **WHEN** se invoca un endpoint administrativo o `GET /export`
- **THEN** el sistema responde HTTP 403 con `detail.causa = "permiso_denegado"`

### Requirement: Administración de roles

El sistema SHALL exponer `GET /roles`, `POST /roles` y `PATCH /roles/{id}` para el rol `admin`. El nombre de rol SHALL ser único (HTTP 409 con causa `duplicate_nombre_rol` en alta y edición) y cada rol SHALL exponer la lista de permisos derivada de la matriz canónica del sistema.

#### Scenario: Alta y listado de un rol

- **GIVEN** un contexto `admin` y la matriz canónica cargada
- **WHEN** se envía `POST /roles` con un nombre nuevo y luego `GET /roles`
- **THEN** el rol creado aparece en el listado con su lista de permisos derivada

#### Scenario: Nombre de rol duplicado responde 409

- **GIVEN** un rol existente con nombre `recepcion`
- **WHEN** se envía `POST /roles` o `PATCH /roles/{id}` con el nombre `recepcion`
- **THEN** el sistema responde HTTP 409 con `detail.causa = "duplicate_nombre_rol"`

#### Scenario: Baja lógica de un rol

- **GIVEN** un rol activo sin asignaciones
- **WHEN** se envía `PATCH /roles/{id}` con `{"activo": false}`
- **THEN** el rol queda inactivo y no se elimina físicamente

#### Scenario: Los roles canónicos están protegidos

- **GIVEN** un rol canónico (`admin`, `recepcion`, `odontologo` o `paciente`)
- **WHEN** se envía `PATCH /roles/{id}` con un `nombre` distinto o con `{"activo": false}`
- **THEN** el sistema responde HTTP 409 con `detail.causa = "rol_canonico_protegido"` y el rol no cambia
- **AND** editar solo `descripcion` responde HTTP 200

#### Scenario: Un rol no canónico no tiene permisos ni altera la autorización

- **GIVEN** un rol creado por `POST /roles` cuyo nombre no es canónico
- **WHEN** se consulta `GET /roles` y se envía un request con `X-Actor-Rol` igual a ese nombre
- **THEN** el rol aparece con `permisos = []` y el request responde HTTP 422 con causa de rol desconocido

### Requirement: Asignación usuario-sucursal con rol

El sistema SHALL exponer `GET /usuarios-sucursal`, `POST /usuarios-sucursal` y `PATCH /usuarios-sucursal/{id}` para el rol `admin`. Cada asignación SHALL referenciar un rol y una sucursal existentes (HTTP 404 si no existen), y la combinación `(usuario, sucursal_id)` SHALL ser única (HTTP 409 con causa `duplicate_usuario_sucursal`).

#### Scenario: Alta de asignación válida

- **GIVEN** un rol y una sucursal existentes
- **WHEN** se envía `POST /usuarios-sucursal` con `usuario`, `rol_id` y `sucursal_id`
- **THEN** el sistema responde HTTP 201 con la asignación creada y `activo = true`

#### Scenario: Asignación duplicada responde 409

- **GIVEN** una asignación existente para el mismo `usuario` y `sucursal_id`
- **WHEN** se envía `POST /usuarios-sucursal` repitiendo la combinación
- **THEN** el sistema responde HTTP 409 con `detail.causa = "duplicate_usuario_sucursal"`

#### Scenario: Rol o sucursal inexistente responde 404

- **GIVEN** un `rol_id` o `sucursal_id` que no existe
- **WHEN** se envía `POST /usuarios-sucursal` o `PATCH /usuarios-sucursal/{id}` con esa referencia
- **THEN** el sistema responde HTTP 404 sin crear ni modificar la asignación

#### Scenario: El rol de la asignación no cambia la autorización

- **GIVEN** una asignación `usuario-sucursal` con `rol_id` de `admin`
- **WHEN** un request llega sin header `X-Actor-Rol` o con otro rol
- **THEN** la autorización se resuelve solo por el header y la matriz, sin consultar la asignación

### Requirement: Compatibilidad con clientes sin identidad

Mientras no exista login real, la ausencia de header `X-Actor-Rol` SHALL resolverse como rol `recepcion`, de modo que los clientes y tests existentes conserven exactamente su comportamiento previo en los endpoints que recepción tiene permitidos. Este default SHALL tratarse como supuesto de implementación y no como regla de negocio ni como control de seguridad.

#### Scenario: Cliente existente sin header conserva el comportamiento

- **GIVEN** un request a `POST /caja/abrir` sin header de identidad, con un payload válido
- **WHEN** el endpoint resuelve el contexto por defecto `recepcion`
- **THEN** la respuesta es la misma que antes de C-11 (HTTP 201 con la caja abierta)

#### Scenario: El default no otorga permisos de administración

- **GIVEN** un request sin header de identidad a `GET /roles` y a `GET /export`
- **WHEN** el contexto se resuelve por defecto como `recepcion` con `origen = "default_compatibilidad"`
- **THEN** ambas respuestas son HTTP 403 con `detail.causa = "permiso_denegado"` y no se ejecuta la operación

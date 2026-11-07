# multisucursal Specification

## Purpose

Permite administrar sucursales y asignar profesionales y sillones a una sede, con filtrado y aislamiento de lecturas por sucursal, dejando explícito qué dominios siguen siendo globales en este change.

## Requirements

### Requirement: Sucursal como entidad administrable

El sistema SHALL exponer `GET /sucursales`, `POST /sucursales` y `PATCH /sucursales/{id}` para el rol `admin`. El nombre de sucursal SHALL ser único (HTTP 409 con causa `duplicate_nombre_sucursal`) y la baja SHALL ser lógica mediante `activo = false`, sin borrado físico.

#### Scenario: Alta y listado de sucursales activas

- **GIVEN** un contexto `admin`
- **WHEN** se envía `POST /sucursales` con un nombre nuevo y luego `GET /sucursales`
- **THEN** la sucursal creada aparece con `activo = true` en un listado ordenado determinísticamente por `(nombre, id)`

#### Scenario: Nombre de sucursal duplicado responde 409

- **GIVEN** una sucursal existente con nombre `Centro`
- **WHEN** se envía `POST /sucursales` o `PATCH /sucursales/{id}` con el nombre `Centro`
- **THEN** el sistema responde HTTP 409 con `detail.causa = "duplicate_nombre_sucursal"`

#### Scenario: Baja lógica de sucursal

- **GIVEN** una sucursal activa
- **WHEN** se envía `PATCH /sucursales/{id}` con `{"activo": false}`
- **THEN** la sucursal queda inactiva, `GET /sucursales` la excluye por defecto y `?incluir_inactivos=true` la incluye

### Requirement: Alcance de sucursal de profesionales y sillones

`profesionales` y `sillones` SHALL tener una columna `sucursal_id` uuid nullable con FK a `sucursales.id`. Un recurso con `sucursal_id = NULL` SHALL considerarse global: no pertenece a ninguna sucursal y no aparece en una consulta filtrada por una. El contrato HTTP del campo en alta, edición y respuesta, y del filtro `?sucursal_id=`, está especificado en el delta de `catalogo-recursos` y no se repite aquí.

#### Scenario: Recurso sin sucursal es global

- **GIVEN** un sillón persistido con `sucursal_id = NULL`
- **WHEN** se inspecciona el recurso
- **THEN** su `sucursal_id` es nulo y se considera global, fuera de toda sucursal

### Requirement: Aislamiento de lecturas por sucursal

La frontera de aislamiento SHALL ser: ningún recurso asignado a una sucursal A SHALL aparecer en una consulta de lectura acotada a una sucursal B. El mecanismo es el filtro `?sucursal_id=` de los listados de profesionales y sillones, cuyo contrato (parámetro, 404 ante sucursal inexistente, combinación con `?incluir_inactivos=` y ordenamiento determinístico) está especificado en el delta de `catalogo-recursos`.

#### Scenario: Ninguna fila de otra sucursal cruza el filtro

- **GIVEN** un profesional asignado a la sucursal A y otro asignado a la sucursal B
- **WHEN** se aplica el filtro por A según el contrato de `catalogo-recursos`
- **THEN** ningún recurso de B aparece en la respuesta

### Requirement: Límites explícitos del aislamiento por sucursal

En este change el aislamiento SHALL aplicarse únicamente a los listados de profesionales y sillones; turnos, pacientes, historia clínica, caja, cobros y liquidaciones SHALL seguir siendo globales, y la caja SHALL mantener una única fila por fecha global. **Límite aceptado:** el catálogo acepta `sucursal_id` sin RBAC (contrato de C-12), así que el aislamiento es una frontera de lectura, no de escritura.

#### Scenario: La caja sigue siendo global

- **GIVEN** una caja abierta desde un contexto con `X-Sucursal-Id` de la sucursal A
- **WHEN** se consulta `GET /caja` desde un contexto con `X-Sucursal-Id` de la sucursal B
- **THEN** la misma caja se devuelve, porque la caja no está particionada por sucursal en C-11

#### Scenario: Los turnos no se filtran por sucursal

- **GIVEN** turnos creados para profesionales de las sucursales A y B
- **WHEN** se consulta `GET /agenda` con el parámetro `sucursal_id`
- **THEN** el parámetro se ignora y la agenda devuelve los turnos de ambas sucursales según su contrato vigente

#### Scenario: La escritura del catálogo conserva el contrato de C-12

- **GIVEN** un contexto con rol `recepcion` (sin rol `admin`)
- **WHEN** se envía `PATCH /profesionales/{id}` con el `sucursal_id` de otra sucursal existente
- **THEN** la operación se resuelve según el contrato de C-12, sin chequeo de rol, porque el catálogo no recibe RBAC en C-11 (límite aceptado)

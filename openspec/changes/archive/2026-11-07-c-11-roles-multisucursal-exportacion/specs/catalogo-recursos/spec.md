# Spec Delta: catalogo-recursos

## Purpose

Fuente única del contrato HTTP de `sucursal_id` en el catálogo (alta, edición, respuesta y filtro `?sucursal_id=`). El delta de `multisucursal` define la entidad y la frontera de aislamiento, y apunta aquí.

## ADDED Requirements

### Requirement: Sucursal asignable a profesionales y sillones

El alta y la edición de profesionales y sillones SHALL aceptar `sucursal_id` opcional y sus respuestas SHALL incluirlo. Un `sucursal_id` inexistente SHALL responder HTTP 404. Un `PATCH` que no envía `sucursal_id` SHALL conservar el valor existente, y un recurso sin sucursal SHALL considerarse global. Estos endpoints conservan el contrato de C-12 y no reciben RBAC en C-11.

#### Scenario: Alta con sucursal devuelve el campo

- **GIVEN** una sucursal existente
- **WHEN** se envía `POST /profesionales` o `POST /sillones` con `sucursal_id` de esa sucursal
- **THEN** la respuesta HTTP 201 incluye el `sucursal_id` indicado

#### Scenario: Sucursal inexistente responde 404

- **GIVEN** un `sucursal_id` que no existe
- **WHEN** se envía `POST /profesionales`, `PATCH /profesionales/{id}`, `POST /sillones` o `PATCH /sillones/{id}` con esa referencia
- **THEN** el sistema responde HTTP 404 y no persiste el cambio

#### Scenario: PATCH parcial conserva la sucursal

- **GIVEN** un profesional asignado a la sucursal A
- **WHEN** se envía `PATCH /profesionales/{id}` modificando solo `nombre`
- **THEN** el profesional conserva su `sucursal_id` original

### Requirement: Filtrado de profesionales y sillones por sucursal

`GET /profesionales` y `GET /sillones` SHALL aceptar el parámetro opcional `?sucursal_id=` y, cuando se envía, SHALL devolver solo los recursos asignados a esa sucursal, combinándose con `?incluir_inactivos=` y con el ordenamiento determinístico vigente. Un `sucursal_id` inexistente SHALL responder HTTP 404. Sin el parámetro, el listado SHALL conservar el comportamiento previo sin restricción por sucursal.

#### Scenario: Filtro por sucursal aísla los resultados

- **GIVEN** profesionales asignados a las sucursales A y B
- **WHEN** se consulta `GET /profesionales?sucursal_id=<A>`
- **THEN** la respuesta contiene solo los profesionales de A y ningún registro de B

#### Scenario: Sucursal inexistente en el filtro responde 404

- **GIVEN** un `sucursal_id` inexistente
- **WHEN** se consulta `GET /sillones?sucursal_id=<inexistente>`
- **THEN** el sistema responde HTTP 404

#### Scenario: Sin filtro el listado conserva el contrato previo

- **GIVEN** profesionales asignados a A, a B y sin sucursal
- **WHEN** se consulta `GET /profesionales` sin `sucursal_id`
- **THEN** la respuesta incluye los tres profesionales según el contrato de C-12, sin cambios de comportamiento

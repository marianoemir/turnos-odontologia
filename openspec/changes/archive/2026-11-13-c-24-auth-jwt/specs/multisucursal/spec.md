## MODIFIED Requirements

### Requirement: Límites explícitos del aislamiento por sucursal

En este change el aislamiento SHALL aplicarse únicamente a los listados de profesionales y sillones; turnos, pacientes, historia clínica, caja, cobros y liquidaciones SHALL seguir siendo globales, y la caja SHALL mantener una única fila por fecha global. La sucursal del contexto proviene del claim `sucursal_id` del token JWT (con `origen = "jwt"`).

#### Scenario: La caja sigue siendo global

- **GIVEN** una caja abierta desde un contexto con token cuya sucursal es A
- **WHEN** se consulta `GET /caja` desde un contexto con token cuya sucursal es B
- **THEN** la misma caja se devuelve, porque la caja no está particionada por sucursal en C-11

#### Scenario: Los turnos no se filtran por sucursal

- **GIVEN** turnos creados para profesionales de las sucursales A y B
- **WHEN** se consulta `GET /agenda` con el parámetro `sucursal_id`
- **THEN** el parámetro se ignora y la agenda devuelve los turnos de ambas sucursales según su contrato vigente

#### Scenario: La escritura del catálogo conserva el contrato de C-12

- **GIVEN** un contexto con rol `recepcion` (sin rol `admin`)
- **WHEN** se envía `PATCH /profesionales/{id}` con el `sucursal_id` de otra sucursal existente
- **THEN** la operación se resuelve según el contrato de C-12, sin chequeo de rol, porque el catálogo no recibe RBAC en C-11 (límite aceptado)

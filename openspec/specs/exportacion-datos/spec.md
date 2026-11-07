# exportacion-datos Specification

## Purpose

Entrega en un único archivo descargable el paquete completo de datos del consultorio (pacientes, historia clínica, agenda y caja) bajo un contrato de salida de 30 días, verificable y documentado.

## Requirements

### Requirement: Exportación total en un único archivo

El sistema SHALL exponer `GET /export` para el rol `admin` y responder un archivo JSON UTF-8 descargable con `Content-Disposition: attachment` y nombre con fecha y hora. El payload SHALL incluir `pacientes[]`, `historia_clinica{historias,entradas,odontogramas,planes,items}`, `agenda{turnos,profesionales,sillones,prestaciones}`, `caja{cajas,cobros,liquidaciones_os}`, `contrato_version`, `generado_en`, `zona` y `periodo`; estas claves son idénticas en spec, design y tareas.

#### Scenario: Exportación con los cuatro dominios presentes

- **GIVEN** al menos un paciente, una entrada de historia clínica, un turno y un cobro registrados en el período
- **WHEN** se envía `GET /export` con rol `admin`
- **THEN** el sistema responde HTTP 200 con `Content-Disposition: attachment` y el JSON contiene `pacientes[]` no vacío, `historia_clinica.entradas[]` no vacío, `agenda.turnos[]` no vacío y `caja.cobros[]` no vacío

#### Scenario: Identificación del contrato en el archivo

- **GIVEN** una exportación exitosa
- **WHEN** se inspecciona el JSON descargado
- **THEN** incluye `contrato_version = "1.0"`, `generado_en` con zona horaria, `zona = "America/Argentina/Buenos_Aires"` y un objeto `periodo` con `desde`, `hasta` y `dias`

#### Scenario: Autorización de la exportación

- **GIVEN** un contexto con rol `recepcion`, `odontologo` o `paciente`
- **WHEN** se envía `GET /export`
- **THEN** el sistema responde HTTP 403 con `detail.causa = "permiso_denegado"` y no genera el archivo

### Requirement: Contrato de salida de 30 días

La exportación SHALL cubrir por defecto los últimos 30 días locales, con `hasta` igual al día local actual y `desde` igual a 29 días antes. El período SHALL poder acotarse con `?desde=` y `?hasta=` (fechas locales), sin superar los 30 días inclusive; un rango mayor o invertido SHALL responder HTTP 422. Los pacientes y la historia clínica SHALL exportarse completos (datos maestros, sin filtro de fecha); la agenda y la caja SHALL filtrarse por el período.

#### Scenario: Período por defecto de 30 días

- **GIVEN** una exportación sin parámetros de fecha el 06/11/2026
- **WHEN** se envía `GET /export`
- **THEN** `periodo.hasta` es `2026-11-06`, `periodo.desde` es `2026-10-08` y `periodo.dias` es 30

#### Scenario: Período personalizado dentro del límite

- **GIVEN** un rango de 10 días
- **WHEN** se envía `GET /export?desde=2026-10-01&hasta=2026-10-10`
- **THEN** la agenda y la caja incluyen solo registros del rango y los pacientes y la historia clínica se exportan completos

#### Scenario: Rango mayor a 30 días responde 422

- **GIVEN** `desde = 2026-09-01` y `hasta = 2026-11-06`
- **WHEN** se envía `GET /export?desde=2026-09-01&hasta=2026-11-06`
- **THEN** el sistema responde HTTP 422 por período inválido y no genera el archivo

#### Scenario: Rango invertido responde 422

- **GIVEN** `desde` posterior a `hasta`
- **WHEN** se envía `GET /export?desde=2026-11-06&hasta=2026-11-01`
- **THEN** el sistema responde HTTP 422

### Requirement: Contrato de salida documentado

El proyecto SHALL documentar el contrato de salida de la exportación en `docs/export/README.md`, en español, indicando formato, período cubierto, campos incluidos por dominio, tamaño esperado y datos excluidos, y el `README.md` raíz SHALL enlazarlo.

#### Scenario: El contrato documentado cubre las exclusiones

- **GIVEN** el archivo `docs/export/README.md`
- **WHEN** se revisa su contenido
- **THEN** declara el formato JSON UTF-8, el período de 30 días, los campos de los cuatro dominios, el tamaño esperado y que quedan excluidos secretos, credenciales y tokens (`SECRET_KEY`, `MP_ACCESS_TOKEN`, certificados ARCA)

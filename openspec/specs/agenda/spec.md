# agenda Specification

## Purpose
TBD - created by archiving change c-05-agenda-del-dia. Update Purpose after archive.

## Requirements

### Requirement: Lectura ordenada por inicio con datos completos

El sistema SHALL devolver, en `GET /agenda?profesional={id}&fecha={yyyy-mm-dd}`, los turnos del profesional para esa fecha ordenados por `inicio` ascendente, cada uno con `id`, `inicio`, `fin`, `estado`, `paciente_nombre`, `prestacion_nombre` y `sillon_nombre`. La operación es de solo lectura. Fuente: `CHANGES.md` (C-05); `knowledge-base/06_funcionalidades.md` US-003 CA-1.

#### Scenario: Orden por inicio (esperado)

- **Dado** dos turnos del mismo profesional el mismo día, creados en orden inverso (el de la tarde primero, el de la mañana después)
- **Cuando** se pide `GET /agenda?profesional={id}&fecha=2026-01-12`
- **Entonces** la respuesta es `200` y los turnos vienen ordenados por `inicio` ascendente, sin importar el orden de creación

#### Scenario: Campos completos (esperado)

- **Dado** un turno existente del profesional en la fecha consultada
- **Cuando** se consulta la agenda de ese profesional para esa fecha
- **Entonces** el elemento trae `id`, `inicio`, `fin`, `estado`, `paciente_nombre`, `prestacion_nombre` y `sillon_nombre` con los valores del turno y de su paciente, prestación y sillón

#### Scenario: Día vacío (esperado)

- **Dado** un profesional existente sin turnos en la fecha consultada
- **Cuando** se pide `GET /agenda?profesional={id}&fecha=2026-01-13`
- **Entonces** la respuesta es `200` con lista vacía

### Requirement: Fecha interpretada como día local de Buenos Aires

El sistema SHALL interpretar `fecha` como el intervalo local `[00:00, 24:00)` de `America/Argentina/Buenos_Aires` (reutilizando `ZONA` de `backend/app/turnos/service.py`), incluyendo el límite inferior y excluyendo el superior. La comparación no se hace en UTC.

#### Scenario: Borde 00:00 del día incluido (borde)

- **Dado** un turno con `inicio = 2026-01-12 00:00:00-03:00`
- **Cuando** se consulta `fecha=2026-01-12`
- **Entonces** el turno aparece en la respuesta

#### Scenario: 00:00 del día siguiente excluido (borde)

- **Dado** un turno con `inicio = 2026-01-13 00:00:00-03:00`
- **Cuando** se consulta `fecha=2026-01-12`
- **Entonces** el turno no aparece en la respuesta

#### Scenario: Turno a las 23:30 de Buenos Aires (borde, zona horaria)

- **Dado** un turno con `inicio = 2026-01-12 23:30:00-03:00` (equivale a `2026-01-13 02:30 UTC`)
- **Cuando** se consulta `fecha=2026-01-12`
- **Entonces** el turno aparece en la respuesta, y no aparece al consultar `fecha=2026-01-13`

### Requirement: La agenda excluye cancelados y turnos de otros profesionales

El sistema SHALL excluir de la respuesta los turnos con `estado = 'cancelado'` y SHALL incluir los de estado `pendiente`, `confirmado`, `atendido` y `ausente`. El sistema SHALL devolver solo turnos del profesional consultado. La exclusión de cancelados es una decisión del change para `CA-2` (`06_funcionalidades.md`: "a definir en change"), pendiente de confirmación con el PO.

#### Scenario: Cancelado no aparece (esperado)

- **Dado** un turno `cancelado` y un turno `pendiente` del mismo profesional en la fecha consultada
- **Cuando** se consulta la agenda
- **Entonces** la respuesta contiene el turno `pendiente` y no contiene el `cancelado`

#### Scenario: Atendido y ausente aparecen (esperado)

- **Dado** un turno `atendido` y un turno `ausente` del profesional en la fecha consultada
- **Cuando** se consulta la agenda
- **Entonces** ambos aparecen en la respuesta con su `estado`

#### Scenario: Turno de otro profesional no aparece (esperado)

- **Dado** un turno del profesional P1 y un turno del profesional P2 en la misma fecha
- **Cuando** se consulta `GET /agenda?profesional=P1&fecha=...`
- **Entonces** la respuesta contiene solo el turno de P1

### Requirement: Validación de parámetros y profesional inexistente

El sistema SHALL responder `404` si el profesional no existe, y `422` si `fecha` no tiene formato `yyyy-mm-dd` o si falta `profesional` o `fecha`. Un profesional existente sin turnos responde `200` con lista vacía. Fuente: `CHANGES.md` (C-05); `knowledge-base/07_flujos_principales.md` Flujo 3.

#### Scenario: Profesional inexistente (error de negocio, 404)

- **Dado** un `profesional` con un UUID que no existe en la base
- **Cuando** se consulta `GET /agenda?profesional={inexistente}&fecha=2026-01-12`
- **Entonces** la respuesta es `404`

#### Scenario: Fecha malformada (error de negocio, 422)

- **Dado** un profesional existente
- **Cuando** se consulta `GET /agenda?profesional={id}&fecha=no-es-fecha`
- **Entonces** la respuesta es `422`

#### Scenario: Parámetros ausentes (error de negocio, 422)

- **Dado** un profesional existente
- **Cuando** se consulta sin `fecha`, o sin `profesional`
- **Entonces** ambas respuestas son `422`

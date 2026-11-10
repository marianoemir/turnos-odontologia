# Proposal — reserva-online (C-08)

## Why

Las rutas públicas de un solo toque de C-07 (`POST /confirmar/{token}`, `POST /cancelar/{token}`) ya permiten confirmar o cancelar un turno existente sin login, pero un paciente nuevo no tiene forma de crear su turno sin pasar por recepción. US-006 (Épica 5) pide cerrar ese hueco: reserva 24/7 por link con la misma validación de C-03 y los mismos links de C-07, sin crear un segundo mecanismo de agenda ni de tokens.

## What Changes

- **Nueva ruta pública `GET /reservar/{profesional}?prestacion=&fecha=`**: devuelve la lista de slots disponibles del día para ese profesional y prestación como objetos `{inicio, fin}` ordenados ascendente. Un slot es un objeto `{inicio, fin}` con `fin = inicio + duracion` tal que `[inicio, inicio+duracion)` está cubierto por el horario del profesional, no intersecta un bloqueo aplicable y no intersecta un turno activo (`pendiente`/`confirmado`), según RN-AG-01, RN-AG-02, RN-AG-03, RN-AG-04, RN-AG-05 y RN-ES-02. Cancelado/ausente no bloquea el slot (RN-TU-01). Sin login: sin dependencia de RBAC (ver Open Questions).
- **Nueva ruta pública `POST /reservar`**: crea un turno en `pendiente` delegando en `ServicioTurnos.crear` (C-03) sin duplicar validación — mismo orden de causas (`horario`, `bloqueo`, `profesional`, `sillon`), mismo 409 atómico, mismo 422/404. Incluye rate limit por IP (ver Design). El turno creado queda sujeto al ciclo de vida existente (RN-ES-01) y a los links de C-07 sin cambios.
- **Reutilización de C-07 sin cambios**: la confirmación y cancelación de una reserva online usan `POST /confirmar/{token}` y `POST /cancelar/{token}` ya implementados; este change no crea otro token ni otro formato.
- **Sin migración nueva en este proposal**: el diseño decide si hace falta alguna columna/índice; la hipótesis inicial es que no (la tabla `turnos` y sus `EXCLUDE` parciales ya cubren el caso).

## Capabilities

### New Capabilities

- `reserva-online`: reserva pública 24/7 sin login — consulta de slots por profesional/prestación/fecha y alta de turno `pendiente` con la validación de C-03 y rate limit por IP. Cubre `GET /reservar/{profesional}` y `POST /reservar`.

### Modified Capabilities

- (ninguna — `turnos` (C-03/C-04), `recordatorios` (C-07) y `rbac` (C-11) no cambian sus REQUIREMENTS: C-08 consume `ServicioTurnos.crear` y los tokens ya existentes sin alterar sus contratos).

## Impact

- **Código nuevo**: `backend/app/reserva_online/` (o `backend/app/reserva/` — a fijar en design) con `models` (si hiciera falta), `schemas`, `service` (slots), `router` (`/reservar*`) y rate limiter; registro del router en `backend/app/main.py`.
- **Sin cambios** en `backend/app/turnos/service.py`, `backend/app/recordatorios/`, `backend/app/rbac/` ni `backend/app/agenda/` salvo lo que el design justifique.
- **Tests pytest** con solo datos ficticios (slots excluyen ocupados/bloqueos, alta 201, solape 409, borde `inicio==fin`, rate limit, rutas sin login).
- **Dependencias**: C-04 (cancelar libera el slot que `GET /reservar` vuelve a ofrecer) y C-07 (links). Frontend público queda para C-21.
- **Riesgo principal**: exponer escritura sin login amplía la superficie de abuso; el rate limit por IP es la mitigación propuesta (alcance a confirmar).

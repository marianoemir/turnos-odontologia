# Spec Delta — foundation

## Purpose

Provee la base testeable del backend sobre la que vivirán el catálogo (C-02) y los turnos (C-03): una app FastAPI importable y levantable sin servicios externos, con un endpoint de salud observable y una suite pytest en verde reproducible vía Compose.

## ADDED Requirements

### Requirement: Endpoint de salud observable

La app SHALL exponer `GET /health` que responde `200` con cuerpo `{"status":"ok"}`.

#### Scenario: Health check en verde

- **WHEN** un cliente pide `GET /health` con la app levantada
- **THEN** la respuesta es `200` con cuerpo `{"status":"ok"}`

### Requirement: Arranque sin dependencias externas

La app SHALL importarse y servir `GET /health` sin requerir PostgreSQL ni ninguna otra dependencia externa en ejecución; importar el módulo de la app SHALL NOT exigir `DATABASE_URL` ni abrir conexiones.

#### Scenario: Health sin base de datos

- **WHEN** PostgreSQL no está en ejecución y la app arranca
- **THEN** el import del módulo funciona y `GET /health` responde `200`

#### Scenario: Suite base reproducible

- **WHEN** se ejecuta `pytest backend/tests` en un entorno con dependencias instaladas
- **THEN** la suite completa pasa sin servicios externos en ejecución

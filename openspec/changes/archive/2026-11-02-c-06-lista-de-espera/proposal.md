# Proposal

## Why

C-06 implementa US-004: cuando un turno se cancela, el hueco liberado se ofrece
a un paciente de la lista de espera en lugar de perderse. Hoy no existe ninguna
estructura para gestionar esa lista ni endpoints para darla de alta, consultarla
u ofrecer un hueco, por lo que las cancelaciones no se rellenan (RN-TU-01).

## What Changes

- Nuevo modelo SQLAlchemy `ListaEspera` (paciente_id, profesional_id nullable,
  prestacion_id, creado_en, estado, turno_id).
- Nuevos endpoints: `POST /lista-espera`, `GET /lista-espera?profesional=`,
  `POST /lista-espera/{id}/ofrecer`, `POST /lista-espera/{id}/responder`.
- Lógica FIFO por `creado_en` para ofrecer huecos tras cancelaciones.
- `ofrecer` crea el turno exclusivamente vía `ServicioTurnos.crear()` (C-03),
  reutilizando toda la validación de solape/horario/bloqueo.
- Migración Alembic `003_lista_espera`.
- Tests pytest de alta, FIFO, ofrecer (turno válido), rechazo → siguiente.

## Capabilities

### New Capabilities

- `lista-espera`: alta de pacientes en lista, consulta FIFO filtrable por
  profesional, ofrecimiento de huecos creando turnos validados, y respuesta
  aceptar/rechazar con avance al siguiente en FIFO.

### Modified Capabilities

- (ninguna a nivel de requisitos; se consume `turnos` existente sin cambiarlo)

## Impact

- Código: nuevo módulo `backend/app/lista_espera/`, registro en `main.py`,
  migración `003_lista_espera`, actualización de `conftest._CATALOGO_TABLES`.
- API: 4 endpoints nuevos bajo `/lista-espera`.
- Dependencias: C-04 (cancelar) y C-03 (`ServicioTurnos.crear()`). Postgres
  real para tests de integración.
- Tests: nuevos `test_lista_espera_*.py`.

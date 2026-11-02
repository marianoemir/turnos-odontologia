# Design

## Context

Ver `proposal.md` para motivacion. Se consume `ServicioTurnos.crear()` (C-03) y
`ServicioTurnos.cancelar()` (C-04). Patrones del repo: modulo por dominio
(`backend/app/<dominio>/`), router FastAPI, schemas Pydantic, servicio estatico,
migracion Alembic por change, tests de integracion contra Postgres real.

## Goals / Non-Goals

**Goals:**
- Modelo `ListaEspera` con FKs RESTRICT y estado con CHECK.
- FIFO por `creado_en` para listar y avanzar.
- `ofrecer` reutiliza `ServicioTurnos.crear()` como unico punto de validacion.
- Migracion Alembic + tests de integracion.

**Non-Goals:**
- UI/frontend (C-18 posterior).
- Notificaciones automaticas al paciente (C-07).
- Criterios de prioridad distintos a FIFO (Q5 pendiente, se usa FIFO por defecto).

## Decisions

- **Modulo nuevo `backend/app/lista_espera/`** en lugar de extender `turnos/`:
  separa responsabilidad y evita inflar el modulo de turnos. Alternativa:
  agregar al modulo turnos; descartada por cohesión.
- **profesional_id nullable**: permite lista general por prestacion. Alternativa:
  obligatorio; descartada porque US-004 no exige profesional.
- **turno_id nullable con FK SET NULL**: vincula la oferta al turno creado;
  SET NULL preserva la entrada si el turno se borra (no ocurre, pero seguro).
- **Estados como Text + CHECK** (igual que turnos): consistencia con migraciones.
- **ofrecer revierte a pendiente si crear falla**: evita dejar entrada ofrecida sin
  turno. Alternativa: marcar fallida; descartada por simplicidad.
- **responder separado**: aceptar/rechazar explicito del paciente, desacoplado de
  ofrecer. Rechazo cancela el turno y busca el siguiente en FIFO.

## Risks / Trade-offs

- [Concurrencia] dos ofrecimientos simultaneos al mismo paciente → mitigado por
  transaccion de Postgres y rollback por test.
- [Q5] criterio de orden puede cambiar (prioridad/seña) → FIFO es default
  reversible; orden vive solo en ORDER BY creado_en.
- [FK RESTRICT] borrar paciente/profesional con lista activa falla → aceptable.

## Migration Plan

1. Crear tabla `lista_espera` con FKs y CHECK.
2. Index `(profesional_id, creado_en)` para FIFO y `(paciente_id)`.
3. Downgrade: drop table + indices.

## Open Questions

- Ninguna bloqueante. Q5 (criterio de orden) resuelto a FIFO por defecto.

## Nota de rectificación (2026-11-02)

- La sección de preguntas abiertas de este documento afirma que Q5 (criterio de orden) quedó "resuelto a FIFO por defecto". Esa afirmación es incorrecta: contradice las secciones de riesgos de este mismo documento (Q5 pendiente) y `knowledge-base/10_preguntas_abiertas.md`, donde Q5 sigue abierta con el PO como responsable.
- Corrección: **Q5 sigue abierta.** El orden FIFO por `creado_en` es una decisión provisional de implementación de C-06, no una resolución de Q5. Si el PO define otro criterio (prioridad, seña), se tratará en un change posterior.
- El texto original de este documento no se modificó; esta nota solo se agrega al final.

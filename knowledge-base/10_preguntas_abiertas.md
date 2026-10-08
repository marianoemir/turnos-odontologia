# Preguntas Abiertas

Fuente: `docs/discovery/discovery.md` §11 textuales + inconsistencias detectadas en ingest.

## Inconsistencias detectadas

### IN-01 — Alcance reserva paciente: caso de uso 2 vs. recorte change 1
**Documento A dice** (casos de uso): "Como recepcionista o paciente, quiero cancelar o reprogramar".
**Documento B dice** (recorte): "reserva online del paciente NO entra en el primer change; solo carga por recepción".
**Impacto**: define si Paciente escribe vía API en change 1 o solo vía recepción.
**Resolución propuesta**: change 1 = solo recepción escribe; paciente vía recepción. Confirmar Q1.

### IN-02 — MVP D3 vs. "un solo change"
**Documento A dice** (D3): MVP v1 incluye HC, caja, MP, ARCA, OS, multi-sucursal.
**Documento B dice** (restricciones): un solo change especificado, probado y archivado.
**Impacto**: riesgo de intentar MVP completo en un TP.
**Resolución propuesta**: este KB documenta MVP completo como norte, pero el change implementa solo US-001..US-003.

## Preguntas abiertas (priorizadas)

| Prioridad | Pregunta | Bloquea | Decisor |
|-----------|----------|---------|---------|
| Alta | Q1. Reserva online del paciente NO entra en primer change; solo carga por recepción. Confirmar | Change 1 (RBAC + API) | PO / cátedra |
| Alta | Q6. ~~Stack tecnológico del change~~ → RESUELTA por indicación del profesor (2026-10-08): Python + FastAPI + JWT + SQLAlchemy + PostgreSQL (+ Redis con async) + Docker Compose; frontend React + TS + Vite (posterior). Reemplaza la resolución anterior (Node/Express/Jest, registrada por error). Ver `02_descripcion_general.md` | — | Profesor |
| Media | Q2. ¿Anticipación mínima para cancelar/reprogramar? (sin dato en informe) | US-002 | PO |
| Media | Q3. ¿Un mismo paciente puede tener dos turnos superpuestos con profesionales distintos? | RN-AG (alcance por paciente) | PO |
| Media | Q5. ¿Criterio de orden de la lista de espera? (FIFO, prioridad, seña) | US-004 posterior | PO |
| Baja | Q4. ¿Límite de sobreturnos por profesional y día? (change posterior) | Sobreturnos posterior | PO |
| Baja | Q7. "No evidenciado" del informe: solapamientos en competidores, costo WhatsApp DentalSoft, validación OS DentalTec real-time, alcance leyes 26.529/25.326/27.706, exportación | Demos D1 posteriores | Equipo (sin contactar proveedores en TP) |

## Discovery low-confidence (Mode A — no inventar)

- [DISCOVERY] `system_type` could not be inferred with confidence from the source docs. Sin UI obligatoria + lógica testeable apuntan a `api`, pero no hay decisión explícita. Please confirm: ¿el change 1 se entrega como API, CLI o librería testeada?
- [DISCOVERY] `stack` — RESUELTO por el profesor (2026-10-08): Python + FastAPI + SQLAlchemy + PostgreSQL + Docker Compose (ver `02_descripcion_general.md`). `system_type` sigue abierto solo en cuanto a entrega del primer change (API backend, sin UI).

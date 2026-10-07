# Proposal

## Why

Las dobles reservas (mismo profesional o mismo sillón/box con intervalos superpuestos) son el dolor central del consultorio junto a los huecos vacíos. Este change implementa US-001 —el núcleo del TP— para que ningún turno se cree en conflicto.

## What Changes

- Nueva capacidad `turnos`: crear un turno validando duración fija por prestación (RN-AG-01), solape por profesional (RN-AG-02) y por sillón/box obligatorio (RN-AG-03), borde `[inicio,fin)` (RN-AG-04), horario del profesional y bloqueos (RN-AG-05).
- `ServicioTurnos.crear(...)` como único punto de validación; conflicto de negocio → 409 con causa (`profesional|sillon|horario|bloqueo`), input inválido → 422.
- Turno creado nace en `pendiente`; estados y ciclo de vida completo llegan en C-04.
- **Dependencia**: requiere C-02 (`catalogo-recursos`) archivado antes de implementar —Paciente, Profesional, SillonBox, Prestacion, HorarioAtencion y Bloqueo son inputs de esta validación y hoy no existen (ver `src/` vacío). La planificación se hace contra `knowledge-base/04_modelo_de_datos.md`.
- **BREAKING**: ninguno (sin consumidores previos).

## Capabilities

### New Capabilities

- `turnos`: creación de turnos con prevención de solapamientos por profesional y sillón/box. Frontera durable que C-04 (cancelar/reprogramar) y C-05 (agenda del día) extenderán con delta specs.

### Modified Capabilities

— (no hay specs existentes; `openspec list --specs` vacío).

## Impact

- Código nuevo: `src/turnos/` (servicio, intervalos, tipos), tests en `tests/turnos.*`.
- Sin cambios en `src/agenda/` (lo puebla C-02) ni en specs principales (se crean al archivar vía sync).
- Desbloquea C-04 y C-05; C-10 depende de turnos existentes para cobros.

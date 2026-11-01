# Proposal — agenda-del-dia (C-05)

## Why

C-03 deja la agenda capaz de **crear** turnos sin solapamiento, pero no expone ninguna lectura: un odontólogo no puede ver qué pacientes tiene hoy, ni en qué orden. Sin US-003 (C-05) el recorte del TP (C-01 → C-02 → C-03) queda incompleto como "agenda operativa" y el cambio de lectura no se cierra. C-05 es lectura pura: no modifica datos, no requiere migración, no toca los índices parciales de solapamiento de la revisión 002 (`ix_turnos_profesional_activo`, `ix_turnos_sillon_activo`).

Reglas de dominio que aplica: `RN-ES-01` (transiciones de estado) y `RN-ES-02` (solo pendiente/confirmado son "activos" para solapamiento; no define la lectura, que se decide en `CA-2`). Fuente: `knowledge-base/05_reglas_de_negocio.md` §Dominio: Estados (`RN-ES-01`, `RN-ES-02`); `06_funcionalidades.md` §US-003 (CA-1, CA-2); `07_flujos_principales.md` §Flujo 3; `CHANGES.md` líneas 265-278.

## What Changes

- **Nuevo endpoint `GET /agenda?profesional={id}&fecha={yyyy-mm-dd}`** en un nuevo `router.py` (`backend/app/agenda/router.py` — no se modifica el existente). Devuelve `AgendaItemOut[]` ordenado por `inicio` ascendente.
- **Nuevo schema `AgendaItemOut`** en `backend/app/agenda/schemas.py` (o reutilizado si existe): `id`, `inicio`, `fin`, `estado`, `paciente_nombre`, `prestacion_nombre`, `sillon_nombre`. No se reutiliza `TurnoOut` directamente porque `TurnoOut` no tiene los nombres de relaciones y porque `AgendaItemOut` es un contrato de lectura específico.
- **Nuevo servicio `ServicioAgenda`** (o método en el servicio existente) que ejecuta la consulta SQL con filtro por `profesional_id` y rango `[fecha_00:00_BA, fecha_24:00_BA)` (reutiliza `ZONA` de `service.py` línea 27). Sin cambios en `ServicioTurnos`.
- **Sin cambios en modelos** (`turnos`, `pacientes`, etc.): no se agrega columna, no se toca la migración 002, no se crea nuevo índice.
- **Sin cambios en `main.py`** más allá de montar el nuevo router (`include_router` del nuevo archivo).

## Capabilities

### New Capabilities

- `agenda`: lectura de la agenda diaria por profesional (`GET /agenda`).

### Modified Capabilities

- `turnos`: ninguna modificación; solo lectura.

## Non-goals (explícito — fuera de C-05)

- **Autenticación / RBAC por rol (C-11):** el endpoint recibe `profesional_id` por query sin validar que el usuario sea ese profesional. Se registra como pregunta abierta pendiente (`knowledge-base/10_preguntas_abiertas.md` Q1 resuelve solo recepción; la autenticación llega con C-11). Fuente: `CHANGES.md` línea 272 (`Governance: BAJO`); `AGENTS.md` reglas duras.
- **Confirmación de CA-2 con el PO:** el scope indica que `CA-2` (cancelados visibles como liberados o filtrados) se define en el change. La KB dice explícitamente "a definir en change" (`06_funcionalidades.md`, línea 45). Se toma la decisión de **filtrar cancelados**, pero se registra como pendiente de confirmación con el PO (ver `design.md`).
- **Migración Alembic / índice nuevo:** no se agrega ninguna. Justificación: volumen de datos del TP (seed ficticio, pocos turnos) no requiere optimización de índices; un índice nuevo exigiría una revisión 003 que no está en el alcance (el scope de C-05 en `CHANGES.md` es solo lectura y no menciona cambios de esquema).
- **Frontend / React:** C-05 es backend solo; el frontend (`C-17`) llega después (`CHANGES.md` árbol de dependencias: C-17 depende de C-04 + C-05 + C-13 + C-14).
- **Cambio de `profesional_id` o reasignación de turno:** fuera del scope de lectura.
- **Confirmación de turno (`pendiente → confirmado`):** no está en US-003 ni en `CHANGES.md` C-05.

## Impact

- **Archivos nuevos (solo en `openspec/changes/c-05-agenda-del-dia/` y `backend/app/agenda/`):** `proposal.md`, `design.md`, `tasks.md`, `specs/agenda/spec.md`, `.openspec.yaml`, `backend/app/agenda/router.py`, `backend/app/agenda/schemas.py`, `backend/app/agenda/service.py` (o reutilización del existente si aplica), actualización mínima de `backend/app/main.py` para incluir el router.
- **Sin cambios en:** `CHANGES.md`, `AGENTS.md`, `CLAUDE.md`, modelos SQLAlchemy existentes (`backend/app/turnos/models.py` no se toca), migraciones (`alembic/versions/002_turno.py` no se modifica), `docker-compose.yml`, `.github/workflows/`, `knowledge-base/`.
- **Tests:** `backend/tests/test_agenda_api.py` (o similar) con los 12 casos listados en `tasks.md`: orden por inicio, campos completos, día vacío, turno de otro profesional no aparece, borde 00:00 incluido / 00:00 siguiente excluido, turno a las 23:30 BA (cae en UTC del día siguiente), cancelado no aparece, atendido y ausente aparecen, 404 profesional inexistente, 422 fecha malformada, 422 parámetros ausentes.
- **TDD:** cada task en `tasks.md` sigue el ciclo RED → GREEN → TRIANGULATE → REFACTOR, con evidencia en la columna `Verificación`. No se ejecuta `/opsx:apply` en esta fase.

## References

- `CHANGES.md` líneas 265-278 (C-05 scope, dependencias, gobernanza).
- `knowledge-base/06_funcionalidades.md` §US-003, CA-1, CA-2 (`cancelados visibles como liberados o filtrados, a definir en change`).
- `knowledge-base/07_flujos_principales.md` §Flujo 3 (pasos 1-2, errores 404/422).
- `knowledge-base/05_reglas_de_negocio.md` §Dominio: Estados (`RN-ES-01`, `RN-ES-02`).
- `knowledge-base/03_actores_y_roles.md` §RBAC (`Odontólogo` = R propia agenda; `Recepción` = R todas).
- `knowledge-base/04_modelo_de_datos.md` §Turno (atributos, índices parciales, `estado` enum).
- `knowledge-base/10_preguntas_abiertas.md` (Q1 resuelta por el profesor; CA-2 pendiente).
- `backend/app/turnos/service.py` línea 27 (`ZONA = ZoneInfo("America/Argentina/Buenos_Aires")`, reutilizada para interpretar `fecha`).
- `backend/app/turnos/models.py` (índices `ix_turnos_profesional_activo`, `ix_turnos_sillon_activo` con filtro parcial `estado IN ('pendiente','confirmado')`).

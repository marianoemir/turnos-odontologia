# Design — agenda-del-dia (C-05)

## Scope del cambio

`US-003` (`knowledge-base/06_funcionalidades.md` §US-003) — lectura de agenda del odontólogo, solo lectura. `GET /agenda?profesional={id}&fecha={yyyy-mm-dd}` (`CHANGES.md` líneas 265-278). Dependencia: C-03 archivado.

## Decisiones de diseño (con justificación)

### D1 — `fecha` es fecha pura `yyyy-mm-dd`, interpretada en `America/Argentina/Buenos_Aires`

- **Justificación:** la constante `ZONA` (`ZoneInfo("America/Argentina/Buenos_Aires")`) ya existe en `backend/app/turnos/service.py` (línea 27) y se usa para validar horarios (`_cubierto_por_horario`). Reutilizarla evita duplicar la zona horaria y mantiene coherencia con la validación de solapamiento de C-03.
- **Interpretación:** `fecha` define el intervalo local `[00:00:00, 24:00:00)` en `ZONA`. Un turno con `inicio` que cae en ese rango local se incluye; `inicio` en `2026-01-01 23:30` BA (`UTC-3` = `2026-01-02 02:30 UTC`) debe aparecer en el día `2026-01-01`; un turno con `inicio` en `2026-01-02 00:00` BA (`UTC-3` = `2026-01-02 03:00 UTC`) debe aparecer en `2026-01-02`, no en `2026-01-01`.
- **Contratos:** `422` si `fecha` no es `yyyy-mm-dd` o falta; `404` solo si `profesional_id` no existe; si existe sin turnos → `200 []`.

### D2 — `CA-2`: los cancelados se FILTRAN. Se registra pendiente de confirmación con PO.

- **Justificación:** `CHANGES.md` línea 268 dice "turnos ordenados por inicio con paciente, prestación, sillón, estado" pero no especifica si `cancelado` aparece. `knowledge-base/06_funcionalidades.md` línea 45 dice explícitamente: `cancelados visibles como liberados o filtrados, a definir en change`. Se toma la decisión de **filtrar** (`estado NOT IN ('cancelado')`) porque la lectura de agenda del odontólogo busca "quién viene hoy", no "qué huecos quedaron libres". La liberación de huecos es el dominio de `C-06` (`lista-de-espera`) que depende de `C-04`.
- **Registro:** esta decisión queda registrada aquí como pendiente de confirmación con el PO (no se edita la KB en este change); si el PO confirma lo contrario, el filtro se revierte sin afectar la estructura de la consulta ni los índices.
- **Consecuencia en tests:** el caso `cancelado no aparece` (`test_cancelado_no_aparece`) cubre esta decisión; si el PO revierte, solo cambia el filtro del `WHERE`.

### D3 — Schema propio `AgendaItemOut` (no reutiliza `TurnoOut`)

- **Campos:** `id: UUID`, `inicio: datetime` (aware, con zona), `fin: datetime`, `estado: str` (`pendiente`/`confirmado`/`atendido`/`ausente`), `paciente_nombre: str`, `prestacion_nombre: str`, `sillon_nombre: str`.
- **Justificación:** `TurnoOut` (`backend/app/turnos/schemas.py`) no tiene los nombres de relaciones (`paciente`, `prestacion`, `sillon`) y no está diseñado para lectura enriquecida. Un schema propio separa el contrato de lectura (`C-05`) del contrato de creación (`C-03`) y evita acoplar `TurnoOut` a relaciones que `C-05` no modifica.
- **No se agrega `creado_por`:** fuera del scope de `US-003`.

### D4 — Sin nuevo índice; sin migración Alembic

- **Justificación:** los índices parciales existentes (`ix_turnos_profesional_activo`: `profesional_id, inicio, fin` con filtro `estado IN ('pendiente','confirmado')`) cubren la consulta si el filtro de estados se limita a `pendiente`/`confirmado`. Como `C-05` filtra `cancelado` e incluye `atendido`/`ausente`, el índice parcial no cubre completamente, pero el volumen del proyecto (seed ficticio, sin datos reales de producción) no justifica una revisión 003. el scope de C-05 en `CHANGES.md` no menciona índice nuevo ni migración, y `08_arquitectura_propuesta.md` no exige índice por cada lectura.
- **Consecuencia:** si en producción se requiere rendimiento con miles de turnos, se propone un índice `btree (profesional_id, inicio)` sin filtro parcial; por ahora no se crea.

### D5 — `RBAC`: el endpoint recibe `profesional_id` sin autenticación; pendiente con C-11

- **Justificación:** `CHANGES.md` línea 272 (`Governance: BAJO`) y `03_actores_y_roles.md` (matriz RBAC) definen que `Odontólogo` lee su agenda (`R (propia)`) y `Recepción` lee todas (`R (todas)`). Sin embargo, no hay login (`C-11` es el primer change con roles reales). El endpoint expone `profesional_id` como parámetro de query sin validar la identidad del usuario; esto se documenta como pregunta abierta pendiente (`knowledge-base/10_preguntas_abiertas.md`) y se cierra con `C-11` (`roles-multisucursal-exportacion`).
- **No se inventa un control de seguridad:** es un cambio de gobernanza BAJA (`CHANGES.md`) y el contrato de la API no incluye `Authorization` ni `JWT`.

## Estructura de archivos

```
openspec/changes/c-05-agenda-del-dia/
  .openspec.yaml
  proposal.md
  design.md
  tasks.md
  specs/
    agenda/
      spec.md

backend/app/agenda/
  __init__.py (existente, de C-02)
  router.py (GET /agenda)
  schemas.py (AgendaItemOut)
  service.py (ServicioAgenda, consulta SQL con filtro y orden)

backend/app/main.py (modificación mínima: include_router del nuevo archivo)
backend/tests/test_agenda_api.py (12 casos, ver tasks.md)
```

No se toca `knowledge-base/`, `CHANGES.md`, `AGENTS.md`, `CLAUDE.md`, ni `backend/app/turnos/` (solo lectura de modelos existentes).

## Referencias leídas (solo las que existen)

- `CHANGES.md` líneas 265-278 (`C-05` scope, gobernanza BAJO, dependencias C-03).
- `knowledge-base/06_funcionalidades.md` §US-003 (`CA-1`: orden por inicio con paciente/prestación/sillón/estado; `CA-2`: cancelados visibles como liberados o filtrados, **a definir en change**).
- `knowledge-base/07_flujos_principales.md` §Flujo 3 (actor Odontólogo, pasos 1-2, errores `404` profesional inexistente / `422` fecha inválida).
- `knowledge-base/05_reglas_de_negocio.md` §Dominio: Estados (`RN-ES-01`: transiciones permitidas; `RN-ES-02`: solo pendiente y confirmado cuentan como "activos" para solapamiento — usado para justificar el filtro en la consulta).
- `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos (Odontólogo `R (propia)`; Recepción `R (todas)` — usado para justificar que `profesional_id` es el filtro de lectura y que la autorización llega con C-11).
- `knowledge-base/04_modelo_de_datos.md` §Turno (atributos: `id`, `paciente_id`, `profesional_id`, `sillon_id`, `prestacion_id`, `inicio`, `fin`, `estado`; índices parciales `ix_turnos_profesional_activo`, `ix_turnos_sillon_activo` con filtro de estado).
- `knowledge-base/10_preguntas_abiertas.md` (Q1 resuelta por el profesor; CA-2 no figura ahí, queda abierta en D2 y en "Preguntas abiertas registradas"; no hay definición de zona horaria en la KB, solo en `service.py`).
- `backend/app/turnos/service.py` línea 27 (`ZONA = ZoneInfo("America/Argentina/Buenos_Aires")` — reutilizado para interpretar `fecha`).
- `backend/app/turnos/models.py` (índices `ix_turnos_profesional_activo`, `ix_turnos_sillon_activo` con filtro `WHERE estado IN ('pendiente','confirmado')`).
- `backend/app/turnos/schemas.py` (`TurnoOut` — no reutilizado porque no tiene nombres de relaciones y está acoplado a creación).

## Preguntas abiertas registradas (NO decididas por mí)

1. **Confirmación de CA-2 con el PO:** `06_funcionalidades.md` línea 45 dice explícitamente que es "a definir en change". La decisión tomada en este change (`filtrar cancelados`) debe confirmarse con el PO; si cambia, solo se modifica el filtro del `WHERE` en la consulta.
2. **RBAC / autenticación del `profesional_id`:** el endpoint recibe `profesional_id` sin validar que el usuario sea ese profesional. `CHANGES.md` línea 272 (`Governance: BAJO`) y `03_actores_y_roles.md` (matriz RBAC) indican que llega con `C-11` (`roles-multisucursal-exportacion`). No se implementa control de acceso en `C-05`.
3. **Definición exacta del rango de fecha con zona horaria:** aunque `service.py` define `ZONA`, la KB (`04_modelo_de_datos.md`, `08_arquitectura_propuesta.md`) no especifica si `fecha` debe ser `date` o `timestamptz`. La interpretación (`yyyy-mm-dd` en BA) es una decisión del change que debe ser confirmada con el usuario.

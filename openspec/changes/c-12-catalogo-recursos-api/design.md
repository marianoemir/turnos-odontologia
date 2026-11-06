# Design: C-12 Catalogo Recursos API

## Context

El catálogo de datos se modeló en C-02 (`backend/app/agenda/models.py`) y cuenta con las tablas `pacientes`, `profesionales`, `sillones`, `prestaciones`, `horarios` y `bloqueos`. Actualmente, la aplicación carece de endpoints para administrar estas entidades; solo `Turnos` (C-03), `Agenda` lectura (C-05), `Lista de espera` (C-06), `Historia Clínica` (C-09) y `Caja` (C-10) exponen routers HTTP.

Al auditar los modelos reales de `backend/app/agenda/models.py`, se constató que únicamente `SillonBox` posee la columna `activo`. Las entidades `Paciente`, `Profesional`, `Prestacion` y `HorarioAtencion` carecen de ella. Para cumplir con el requerimiento del dominio de baja lógica y consulta mediante `?incluir_inactivos=true`, C-12 incorpora una nueva migración aditiva de base de datos y la correspondiente sincronización en los modelos SQLAlchemy.

Asimismo, al revisar `ServicioTurnos._cubierto_por_horario` (`backend/app/turnos/service.py`), se descubrió que consulta `HorarioAtencion` filtrando únicamente por `profesional_id` sin discriminar si el horario está activo. Sin un cambio en esa consulta, la baja lógica de un horario sería un no-op operativo, permitiendo que franjas desactivadas sigan habilitando turnos.

## Goals / Non-Goals

**Goals:**
- Exponer operaciones CRUD para `pacientes`, `profesionales`, `sillones`, `prestaciones`, `horarios-atencion` y `bloqueos`.
- Agregar una migración Alembic aditiva (`006_catalogo_activo` — número referencial sobre el head vigente `005_caja_pagos`) agregando `activo BOOLEAN NOT NULL DEFAULT true` con índice en `pacientes`, `profesionales`, `prestaciones` y `horarios`.
- Actualizar `backend/app/agenda/models.py` agregando la columna `activo` en las cuatro entidades mencionadas, asegurando consistencia absoluta entre código y base de datos (verificado con `alembic check` o inspección contra Postgres).
- Realizar una modificación mínima quirúrgica en `ServicioTurnos._cubierto_por_horario` (`backend/app/turnos/service.py`) agregando el filtro `HorarioAtencion.activo.is_(True)` con su respectivo test en `backend/tests/test_turnos_servicio.py`.
- Modificar `validar_horario_sin_solape` agregando el parámetro opcional `excluir_id: uuid.UUID | None = None` y asegurando que ignore horarios con `activo=false`.
- Aplicar un criterio uniforme de actualización `PATCH` parcial: procesar únicamente las claves enviadas en el body JSON; omitir campos no provistos; responder sin cambios ante `{}`; y responder con `HTTP 422` ante intentos de enviar `null` explícito en columnas `NOT NULL`.
- Manejo estricto de códigos HTTP de error:
  - Error 409 para conflictos de negocio con formato unificado `detail={"causa": "<codigo_causa>", "detalle": "<mensaje legible>"}` detectando selectivamente el nombre del constraint en `exc.orig.diag.constraint_name` (`duplicate_dni`, `duplicate_matricula`, `duplicate_nombre_sillon`, `duplicate_nombre_prestacion`, `solape_horario`).
  - Error 404 para identificadores inexistentes con formato string simple `detail="<mensaje>"` (idéntico a `turnos/router.py`).
  - Error 422 manejado mediante validadores de Pydantic para restricciones de campo (`duracion_min > 0`, `dia_semana` en `0..6`, `desde < hasta`, datetimes con timezone no naive, rechazo de nulos, `limit` entre 1 y 200, `offset >= 0`).
  - Error 422 manejado mediante validación de servicio con consulta a base de datos y mapeado a `HTTPException(status_code=422, detail="...")` para reglas de estado de negocio (profesional o sillón inactivo al crear bloqueos u horarios).
- Asegurar política de baja lógica (`activo=false`) en todas las entidades persistentes, permitiendo `DELETE` exclusivamente en `/bloqueos`.
- Implementar paginación con envelope estructurado `{items, total, limit, offset}` y filtro de búsqueda `?q=` (con escape de `%` y `_` en el ilike) en `GET /pacientes`. Retornar lista simple en los demás listados.
- Garantizar ordenamiento determinístico en todos los listados: por `(nombre, id)` en pacientes, profesionales, sillones y prestaciones; por `(profesional_id, dia_semana, desde, id)` en horarios; y por `(desde, id)` en bloqueos.
- Garantizar que ningún test dependa de la fecha u hora real del sistema.

**Non-Goals:**
- C-12 deja de ser "sin migración" debido a que C-02 no proveyó `activo` en las tablas restantes; sin embargo, no se modifican tablas ajenas ni se tocan las revisiones 001 a 005.
- Autenticación o roles JWT (planificado para C-11; se asume contexto interno/recepción según RBAC mínimo).
- Modificar la validación de profesional o prestación inactiva en `ServicioTurnos` de C-03 (permanece fuera de alcance según Open Question 1; solo se corrige el filtro de horario activo).
- Gestión o reserva de turnos (pertenece a C-03 / C-04).

## Decisions

### D1: Migración aditiva 006 y sincronización en models.py
- **Decisión**: Crear la migración `006_catalogo_activo` sobre el head `005_caja_pagos` (el número 006 es referencial según CHANGES.md rev. 4; si otro change mergea antes, se renumera sobre el head vigente). Esta migración añade la columna `activo BOOLEAN NOT NULL DEFAULT true` con índice B-tree en `pacientes`, `profesionales`, `prestaciones` y `horarios`. Se asegura un `downgrade()` limpio. Simultáneamente, se actualiza `backend/app/agenda/models.py` incorporando el atributo `activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"), index=True)` en las clases `Paciente`, `Profesional`, `Prestacion` y `HorarioAtencion`, idéntico a `SillonBox`.
- **Alternativas consideradas**:
  - No actualizar models.py y manejar `activo` vía queries crudas: Inconsistente y propenso a errores en el ORM.

### D2: Modificación mínima en C-03 para efectividad de la baja de horarios
- **Decisión**: La baja lógica de una franja horaria (`HorarioAtencion.activo = False`) carecería de efecto si `ServicioTurnos._cubierto_por_horario` la sigue considerando para validar la cobertura de turnos (RN-AG-05). Se autoriza como única modificación fuera de `agenda/` el agregado de `.filter(HorarioAtencion.activo.is_(True))` en `backend/app/turnos/service.py`, acompañado de un test unitario en `backend/tests/test_turnos_servicio.py` que compruebe el rechazo de un turno cuando el único horario que lo cubría fue dado de baja.
- **Alternativas consideradas**:
  - Eliminar físicamente los horarios en vez de dar baja lógica: Viola la directriz de no hard-delete y rompería auditorías históricas de disponibilidad.

### D3: Mapeo selectivo de IntegrityError vía constraint_name (409)
- **Decisión**: Para las restricciones únicas reales definidas en la migración 001 (`uq_pacientes_dni`, `uq_profesionales_matricula`, `uq_sillones_nombre`, `uq_prestaciones_nombre`), el servicio capturará `IntegrityError` y evaluará específicamente `exc.orig.diag.constraint_name` (provisto por psycopg / PostgreSQL):
  - `uq_pacientes_dni` → 409 con `causa="duplicate_dni"`
  - `uq_profesionales_matricula` → 409 con `causa="duplicate_matricula"`
  - `uq_sillones_nombre` → 409 con `causa="duplicate_nombre_sillon"`
  - `uq_prestaciones_nombre` → 409 con `causa="duplicate_nombre_prestacion"`
  Cualquier otro `IntegrityError` no previsto (ej. violaciones de foreign key no atrapadas previamente) se propagará sin enmascarar. El formato de respuesta es uniforme: `detail={"causa": "...", "detalle": "..."}`.
- **Alternativas consideradas**:
  - Parseo de texto de la excepción con regex: Frágil ante cambios de idioma o versiones del motor de base de datos.

### D4: Detección de solapes de horarios en Python con `excluir_id`, horarios activos y `profesional_id` inmutable en PATCH
- **Decisión**:
  - La tabla `horarios` no posee un exclusion constraint en base de datos. Se extiende la firma de `validar_horario_sin_solape` en `backend/app/agenda/models.py`:
    ```python
    def validar_horario_sin_solape(
        session, profesional_id, dia_semana, desde, hasta, excluir_id=None
    ) -> None:
    ```
    La función consulta `HorarioAtencion` filtrando por `profesional_id`, `dia_semana`, y únicamente registros donde `activo.is_(True)`. Si `excluir_id` está presente, excluye dicha fila (`HorarioAtencion.id != excluir_id`). El comportamiento por defecto (`excluir_id=None`) mantiene compatibilidad total con llamadores existentes y seeds.
  - En `PATCH /horarios-atencion/{id}`:
    1. El campo `profesional_id` **NO es modificable** y no forma parte del schema `HorarioPatch`. Razón: transferir una franja horaria existente entre profesionales distintos desvirtúa la identidad del recurso, obliga a revalidar la existencia y estado activo del nuevo profesional, y aumentaría la complejidad de solapes; si un cliente envía `profesional_id` en el body de PATCH, Pydantic (con `extra="forbid"`) lo rechaza con `HTTP 422`.
    2. Se calculan los valores resultantes mezclando el body con los datos actuales del horario y el servicio valida que `desde < hasta` sobre los valores resultantes ANTES del flush; de no hacerlo, la base de datos lanzaría un `IntegrityError` por el CheckConstraint `rango_valido` que terminaría en un 500 no mapeado. Si se envía, por ejemplo, únicamente `hasta` con un valor menor o igual al `desde` guardado, el servicio responde `HTTP 422`.
    3. Si el patch resulta en `activo=True` (o ya estaba activo y se modifican horas/día), se invoca `validar_horario_sin_solape(..., excluir_id=id)`.
    4. Si hay conflicto, el `ValueError` se traduce a 409 con `causa="solape_horario"`.
    5. La adyacencia exacta (`hasta == desde`) está permitida (RN-AG-04). Un horario con `activo=false` no genera conflicto ni cuenta para solapes.
- **Riesgo y alternativas**:
  - *Riesgo*: Concurrencia simultánea entre dos recepcionistas configurando el mismo profesional y día.
  - *Mitigación*: Volumen de escritura administrativo extremadamente bajo; riesgo aceptado. Si creciera la concurrencia, se implementará `SELECT FOR UPDATE` sobre la fila del profesional.

### D5: Paginación determinística, límites, búsqueda y listados
- **Decisión**:
  - `GET /pacientes`:
    - Envelope estructurado `{items, total, limit, offset}`.
    - Parámetros de query validados por Pydantic/FastAPI: `limit: int = Query(50, ge=1, le=200)` y `offset: int = Query(0, ge=0)`. Valores fuera de este rango responden `HTTP 422`.
    - `?q=`: Se escapan caracteres comodín (`%` y `_`) antes de armar el patrón ILIKE (`ilike(f"%{q_escapado}%")`) en `nombre` y `dni`.
    - `?incluir_inactivos=true`: Por defecto `activo=true`. El conteo `total` se calcula aplicando exactamente los mismos filtros de `q` y `activo`.
    - Ordenamiento determinístico: `ORDER BY pacientes.nombre ASC, pacientes.id ASC`.
  - `GET /profesionales`, `GET /sillones`, `GET /prestaciones`: Devuelven lista simple `[...]`, filtrando `activo=true` salvo `?incluir_inactivos=true`, ordenados determinísticamente por `(nombre, id)`.
  - `GET /horarios-atencion`: Devuelve lista simple, filtrando `activo=true` salvo `?incluir_inactivos=true`, ordenada por `(profesional_id, dia_semana, desde, id)`.
  - `GET /bloqueos`: Devuelve lista simple con **todos** los bloqueos existentes ordenados por `(desde, id)`. No posee filtro `activo` ni `incluir_inactivos` porque los bloqueos no poseen columna `activo` (se eliminan mediante DELETE físico).

### D6: Validaciones de Bloqueos y Horarios contra recursos inactivos
- **Decisión**:
  - `POST /bloqueos`: `profesional_id` y `sillon_id` opcionales (ambos null = bloqueo global). Si se envía un ID inexistente → 404 string. Si el recurso existe pero tiene `activo=false` → validación en la capa de servicio mediante consulta a la base de datos que lanza excepción de dominio mapeada a `HTTPException(status_code=422, detail="Profesional o sillón inactivo")` (coherente con RN-AG-03 y RN-AG-05). `desde` y `hasta` deben incluir timezone (422 si son naive vía validador Pydantic) y cumplir `desde < hasta` (422 vía Pydantic). `DELETE /bloqueos/{id}` realiza borrado físico (204 No Content).
  - `POST /horarios-atencion`: Valida en Pydantic `dia_semana` en `0..6` (422) y `desde < hasta` (422). Valida en servicio con consulta a base `profesional_id` existente (404 si no existe) y activo (mapeado a 422 si `activo=false`).

### D7: Arquitectura modular y determinismo temporal
- **Decisión**:
  - El router de catálogo se ubica en `backend/app/agenda/router_catalogo.py` y se monta en `backend/app/main.py`.
  - El catálogo no tiene reglas de corte horario o dependencias temporales del reloj del sistema; ningún test dependerá de la hora real.

## Risks / Trade-offs

- **[Riesgo] Ausencia de EXCLUDE constraint en horarios** → Mitigación: Detección exhaustiva en Python mediante `validar_horario_sin_solape(..., excluir_id=id)` ignorando inactivos. Riesgo de carrera concurrente documentado y aceptado.
- **[Riesgo] Modificación en turnos/service.py (C-03)** → Mitigación: Modificación confinada estrictamente a una línea (`HorarioAtencion.activo.is_(True)` en `_cubierto_por_horario`) con test específico de regresión, impidiendo que horarios inactivos cubran turnos.

## Open Questions

> Todas las preguntas abiertas fueron cerradas como **defaults aceptados sin respuesta de negocio**.

1. **¿El servicio de turnos (`backend/app/turnos/service.py`) debe rechazar profesionales o prestaciones inactivas?**
   - *Default aceptado sin respuesta de negocio*: Fuera del alcance de C-12. No se modifica la validación de profesional/prestación en C-03 para preservar estabilidad; hoy solo valida `sillon.activo` (RN-AG-03) y ahora `HorarioAtencion.activo` (D2). Se mantiene anotado como seguimiento para futuras iteraciones de agenda.
2. **¿`POST /pacientes` permite especificar el campo `ficticio`?**
   - *Default aceptado sin respuesta de negocio*: Sí, se acepta en el schema como opcional con valor por defecto `true`, coincidiendo con el valor por defecto a nivel de base de datos exigido para el entorno de TP.
3. **¿Cómo se da de baja una franja horaria que ya no rige?**
   - *Default aceptado sin respuesta de negocio*: Con la incorporación de la columna `activo` en la migración 006, la baja de un horario se realiza limpiamente mediante `PATCH /horarios-atencion/{id}` enviando `{"activo": false}`.
4. **¿Qué ocurre si al crear un bloqueo (`POST /bloqueos`) se envían `profesional_id` y `sillon_id` juntos?**
   - *Default aceptado sin respuesta de negocio*: Se acepta y aplica solo a turnos con ese profesional Y ese sillón simultáneamente (según la función `bloqueo_aplica` de C-02, matriz D1), validando que ambos recursos existan y estén activos.
5. **Riesgo de carrera concurrente en solape de horarios (sin exclusion constraint en BD):**
   - *Default aceptado sin respuesta de negocio*: Volumen bajo de operaciones administrativas concurrentes; mitigación en Python con `validar_horario_sin_solape(..., excluir_id=id)` aceptada.

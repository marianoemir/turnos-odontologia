# Tasks: C-12 Catalogo Recursos API

## 1. Migración de Base de Datos y Modelos

- [x] 1.1 Crear la migración Alembic aditiva `006_catalogo_activo` sobre el head `005_caja_pagos` agregando la columna `activo BOOLEAN NOT NULL DEFAULT true` con índices nombrados explícitamente `ix_pacientes_activo`, `ix_profesionales_activo`, `ix_prestaciones_activo` e `ix_horarios_activo` para coincidir con el `index=True` de los modelos, actualizar las clases correspondientes en `backend/app/agenda/models.py` asegurando consistencia con `SillonBox` y verificar ejecutando `alembic upgrade head` y `alembic downgrade -1` contra PostgreSQL real.
- [x] 1.2 Confirmar si `alembic check` funciona con el env.py del proyecto (correr desde backend/). Si no funciona, verificar la migración 006_catalogo_activo inspeccionando las columnas e índices contra PostgreSQL (information_schema / pg_indexes) y dejar la salida como nota.
  - Nota: `alembic check` funcionó perfectamente reportando "No new upgrade operations detected.", confirmando que los modelos SQLAlchemy en models.py coinciden exactamente con el esquema de la base. Adicionalmente se verificaron las columnas e índices en Postgres:
    Columnas: ('horarios', 'activo', 'boolean', 'NO', 'true'), ('pacientes', 'activo', 'boolean', 'NO', 'true'), ('prestaciones', 'activo', 'boolean', 'NO', 'true'), ('profesionales', 'activo', 'boolean', 'NO', 'true').
    Índices: ('horarios', 'ix_horarios_activo'), ('pacientes', 'ix_pacientes_activo'), ('prestaciones', 'ix_prestaciones_activo'), ('profesionales', 'ix_profesionales_activo').

## 2. Ajuste Mínimo en C-03 (Servicio de Turnos)

- [x] 2.1 Agregar el filtro `HorarioAtencion.activo.is_(True)` en `ServicioTurnos._cubierto_por_horario` (`backend/app/turnos/service.py`) y crear un test en `backend/tests/test_turnos_servicio.py` que verifique que un turno es rechazado por conflicto de horario cuando la única franja que lo cubría tiene `activo=false`.
  - Nota: Verificado mediante prueba de mutación. Al remover `.filter(HorarioAtencion.activo.is_(True))`, el nuevo test `test_turno_rechazado_si_horario_inactivo` en `backend/tests/test_turno_servicio.py` FALLA (`Failed: DID NOT RAISE ConflictoTurno`), demostrando que un horario inactivo cubría indebidamente el turno. Al restaurar el filtro, el test pasa exitosamente junto con el caso de control.

## 3. Schemas Pydantic y Validaciones de Entrada

- [x] 3.1 Definir schemas Pydantic de Request/Response en `backend/app/agenda/schemas.py`: `PacienteCreate`, `PacientePatch`, `PacienteOut`, `PacientesEnvelopeOut`, `ProfesionalCreate`, `ProfesionalPatch`, `ProfesionalOut`, `SillonCreate`, `SillonPatch`, `SillonOut`, `PrestacionCreate`, `PrestacionPatch`, `PrestacionOut`, `HorarioCreate`, `HorarioPatch` (sin campo `profesional_id`), `HorarioOut`, `BloqueoCreate`, `BloqueoOut`, exigiendo `min_length=1` y `max_length` igual al de las columnas de base de datos (`Paciente.nombre` 200, `dni` 32; `Profesional.nombre` 200, `matricula` 32; `Sillon.nombre` 100; `Prestacion.nombre` 100), `model_config = ConfigDict(extra="forbid")` en TODOS los schemas *Patch (`PacientePatch`, `ProfesionalPatch`, `SillonPatch`, `PrestacionPatch`, `HorarioPatch`), configurando exclusión de campos omitidos en PATCH, validaciones 422 (`duracion_min > 0`, `dia_semana` 0..6, `desde < hasta`, datetimes con timezone no naive, rechazo de `profesional_id` en PATCH de horarios) y rechazo de `null` en campos NOT NULL; verificar con tests en `backend/tests/test_catalogo_schemas.py`.
  - Nota: Verificado mediante pruebas de mutación en dos aspectos clave: (a) Al remover `extra="forbid"` de `PacientePatch`, el test `test_paciente_patch_forbid_extra` FALLA (`Failed: DID NOT RAISE ValidationError`), confirmando que claves no reconocidas no son admitidas; al restaurarlo, pasa. (b) Al reducir `max_length` de `SillonCreate` de 100 a 50, el test `test_sillon_create_longitudes_limite` FALLA con `String should have at most 50 characters`; al restaurarlo a 100, pasa. La suite completa de 50 tests en `test_catalogo_schemas.py` pasa en verde.
    - Arreglo: horas con zona horaria rechazadas (422). Supuesto agregado por revisión (no estaba en design.md): las columnas de horarios son `TIME` sin zona y admitir horas aware provocaría `TypeError` en `validar_rango` o pérdida de offset al guardar. Se agregó `rechazar_tzinfo` en `HorarioCreate` y `HorarioPatch`. Verificado por mutación: al omitir el validador, los casos de prueba con `tzinfo` fallan (el caso mixto falla con `TypeError: can't compare offset-naive and offset-aware times`), y con el validador restaurado pasan los 52 tests con `ValidationError` (422).

## 4. Servicio de Catálogo y Manejo de Errores

- [x] 4.1 Actualizar `validar_horario_sin_solape` en `backend/app/agenda/models.py` agregando el parámetro opcional `excluir_id=None` y filtrando únicamente horarios con `activo=true`; implementar `backend/app/agenda/service_catalogo.py` con mapeo de `IntegrityError` selectivo por `exc.orig.diag.constraint_name` (`uq_pacientes_dni`, `uq_profesionales_matricula`, `uq_sillones_nombre`, `uq_prestaciones_nombre`) traduciendo a 409 con causas específicas y propagando cualquier otro error (nota: los nombres de las 4 constraints únicas fueron verificados contra PostgreSQL real el 05/11/2026 y coinciden con design.md D3; no hace falta volver a consultarlos); verificar con tests unitarios en `backend/tests/test_catalogo_service.py`.
  - Nota: Verificado mediante 4 pruebas de mutación: (a) Al remover el filtro `activo.is_(True)` en `validar_horario_sin_solape`, el test `test_validar_horario_ignora_inactivos` FALLA con `ValueError`, comprobando que un horario inactivo bloqueaba erróneamente nuevas altas. (b) Al ignorar `excluir_id`, el test `test_validar_horario_patch_idempotente_con_excluir_id` FALLA con `ValueError`, confirmando falso positivo en PATCH sobre la fila propia. (c) Al forzar el mapeo de todo `IntegrityError` a `duplicate_dni`, el test `test_duplicado_matricula_mapea_a_duplicate_matricula` FALLA con `AssertionError: assert 'duplicate_dni' == 'duplicate_matricula'`. (d) Al tratar la adyacencia exacta como solape (`<=` en vez de `<`), el test `test_validar_horario_adyacencia_exacta_permitida` FALLA con `ValueError`. Al restaurar el código, la suite de 9 tests pasa en verde contra PostgreSQL real.

## 5. Endpoints de Pacientes y Montaje de Router

- [ ] 5.1 Crear `backend/app/agenda/router_catalogo.py` e incluir router_catalogo en backend/app/main.py (include_router) antes de implementar y probar los endpoints, verificando con un smoke test que `GET /pacientes` responde 200.
- [ ] 5.2 Implementar endpoints `GET /pacientes` (envelope `{items, total, limit, offset}`, validación de `limit` entre 1 y 200 y `offset >= 0` con 422 ante valores fuera de rango, escape de `%` y `_` en `?q=`, ordenamiento determinístico por `nombre, id` y filtro de inactivos), `POST /pacientes` y `PATCH /pacientes/{id}` en `backend/app/agenda/router_catalogo.py`; verificar con tests en `backend/tests/test_catalogo_api.py` cubriendo creación, paginación estable sin saltos ni duplicados, 409 `duplicate_dni` (POST/PATCH), 422 ante exceso de largo en campos de texto (ej. `nombre > 200` o `dni > 32`), PATCH `{}` sin cambios, PATCH con null explícito retornando 422, PATCH con campo desconocido retornando 422 y PATCH con id inexistente retornando 404 (detail string).

## 6. Endpoints de Profesionales

- [ ] 6.1 Implementar endpoints `GET /profesionales` (ordenados por `nombre, id`, filtrando inactivos por defecto salvo `?incluir_inactivos=true`), `POST /profesionales` y `PATCH /profesionales/{id}` con toggle de `activo`, control de matrícula única (409 `duplicate_matricula`), 422 ante exceso de largo (`nombre > 200`, `matricula > 32`), verificación de que el listado excluye inactivos por defecto, PATCH con id inexistente retornando 404 y validación de que un campo desconocido en PATCH responde 422; verificar con tests en `backend/tests/test_catalogo_api.py`.

## 7. Endpoints de Sillones

- [ ] 7.1 Implementar endpoints `GET /sillones` (ordenados por `nombre, id`, filtrando inactivos por defecto), `POST /sillones` y `PATCH /sillones/{id}` con nombre único (409 `duplicate_nombre_sillon`), 422 ante exceso de largo (`nombre > 100`), baja lógica vía `activo=false`, prohibición de hard delete, PATCH con id inexistente retornando 404 y validación de que un campo desconocido en PATCH responde 422; verificar con tests en `backend/tests/test_catalogo_api.py`.

## 8. Endpoints de Prestaciones

- [ ] 8.1 Implementar endpoints `GET /prestaciones` (ordenadas por `nombre, id`, filtrando inactivos por defecto), `POST /prestaciones` y `PATCH /prestaciones/{id}` validando `duracion_min > 0` (422), 422 ante exceso de largo (`nombre > 100`), nombre único (409 `duplicate_nombre_prestacion`), baja lógica vía `activo=false`, PATCH con id inexistente retornando 404 y validación de que un campo desconocido en PATCH responde 422; verificar con tests en `backend/tests/test_catalogo_api.py`.

## 9. Endpoints de Horarios de Atención

- [ ] 9.1 Implementar endpoints `GET /horarios-atencion` (ordenados por `profesional_id, dia_semana, desde, id`, filtrando inactivos por defecto salvo `?incluir_inactivos=true`), `POST /horarios-atencion` y `PATCH /horarios-atencion/{id}` validando `dia_semana` 0..6 (422), `desde < hasta` (422), profesional existente (404) y activo (422), solape temporal con 409 `solape_horario` (permitiendo adyacencia exacta RN-AG-04, excluyendo la fila propia en PATCH para evitar falsos positivos y re-validando solapes si se envía `activo=true`), validación en servicio de `desde < hasta` resultante en PATCH antes del flush afirmando 422 (ej. enviar solo `hasta` menor que el `desde` guardado responde 422 y no 500), PATCH con id inexistente retornando 404, verificación de que el listado excluye inactivos por defecto y validación de que un campo desconocido en PATCH (incluido `profesional_id`) responde 422; verificar con tests en `backend/tests/test_catalogo_api.py`.

## 10. Endpoints de Bloqueos

- [ ] 10.1 Implementar endpoints `GET /bloqueos` (listando todos los bloqueos ordenados por `desde, id` sin filtro de activo), `POST /bloqueos` (permitiendo bloqueo global con profesional y sillón nulos, y bloqueo conjunto con profesional_id y sillon_id que aplica únicamente cuando coinciden ambos según bloqueo_aplica de C-02) y `DELETE /bloqueos/{id}` (único DELETE permitido) validando `desde < hasta` (422), datetimes con timezone no naive (422), profesional o sillón inexistente (404 string), profesional o sillón inactivo (422) y DELETE con id inexistente retornando 404 (detail string); verificar con tests en `backend/tests/test_catalogo_api.py`.

## 11. Verificación Integral

- [ ] 11.1 Ejecutar y verificar la suite completa de tests de la aplicación (`pytest backend/tests`), comprobando que no existen regresiones sobre turnos, agenda, caja y lista de espera y que ningún test depende del reloj real.

## Workflow follow-up

- Ejecutar `/opsx:apply c-12-catalogo-recursos-api` para implementar las tareas planificadas.
- Verificar tests en verde antes de `/opsx:archive c-12-catalogo-recursos-api`.

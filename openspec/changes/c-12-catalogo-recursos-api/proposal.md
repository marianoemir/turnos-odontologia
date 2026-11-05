# Proposal: C-12 Catalogo Recursos API

## Why

El change C-02 modeló y sembró el catálogo de recursos odontológicos (pacientes, profesionales, sillones, prestaciones, horarios y bloqueos), pero no expuso endpoints HTTP para gestionarlos. Sin una API CRUD para estos recursos, el sistema depende exclusivamente del seed inicial: no es posible dar de alta ni modificar pacientes, profesionales, equipamiento ni disponibilidades desde la UI o integraciones externas, bloqueando el avance de los cambios de frontend del recorte TP (C-13 a C-16).

## What Changes

Exponer una API RESTful limpia y consistente para el catálogo de recursos con:
- **Nueva migración aditiva (`006_catalogo_activo`)**: C-12 deja de ser "sin migración" porque el modelo original de C-02 solo proveyó la columna `activo` en `SillonBox`. Para implementar la regla de negocio de baja lógica transversal y filtrado por `?incluir_inactivos`, se agrega una migración aditiva sobre el head vigente (`005_caja_pagos` — número referencial sujeto al orden de merge según CHANGES.md rev. 4) que incorpora `activo BOOLEAN NOT NULL DEFAULT true` con índice B-tree en `pacientes`, `profesionales`, `prestaciones` y `horarios` (sin alterar datos preexistentes y con downgrade limpio). Actualización sincronizada de `backend/app/agenda/models.py`.
- **Ajuste mínimo en `ServicioTurnos` (C-03)**: Se incorpora el filtro `HorarioAtencion.activo.is_(True)` en `ServicioTurnos._cubierto_por_horario` (`backend/app/turnos/service.py`) para que las franjas horarias dadas de baja lógica no sigan habilitando turnos erróneamente (evitando que la baja sea un no-op en agenda).
- **Criterio único de actualización con `PATCH`** para todos los recursos (pacientes, profesionales, sillones, prestaciones, horarios): actualización parcial que solo modifica las claves provistas en el cuerpo; un cuerpo vacío `{}` no modifica nada y preserva los campos omitidos; el envío de `null` explícito en campos obligatorios NOT NULL es rechazado con HTTP 422.
- **`GET /pacientes`**: listado paginado con envelope estructurado `{items, total, limit, offset}`, soporte de búsqueda `?q=` con escape de caracteres especiales (`%`, `_`) para coincidencia por subcadena insensible a mayúsculas/minúsculas en nombre o dni, ordenamiento determinístico por `(nombre, id)` y filtro `?incluir_inactivos=true` (por defecto retorna únicamente pacientes activos; `total` se calcula respetando los mismos filtros).
- **`POST /pacientes`** y **`PATCH /pacientes/{id}`**: alta y edición de pacientes; validación de unicidad de DNI retornando HTTP 409 con causa `duplicate_dni` ante colisiones tanto en POST como en PATCH.
- **`GET/POST /profesionales`** y **`PATCH /profesionales/{id}`**: gestión de profesionales con control de matrícula única (409 causa `duplicate_matricula`), ordenamiento determinístico por `(nombre, id)` y toggle de estado `activo`.
- **`GET/POST /sillones`** y **`PATCH /sillones/{id}`**: gestión de sillones/boxes; unicidad de nombre (409 causa `duplicate_nombre_sillon`), ordenamiento por `(nombre, id)` y baja lógica vía `activo=false`, prohibiendo hard delete.
- **`GET/POST /prestaciones`** y **`PATCH /prestaciones/{id}`**: gestión de prestaciones garantizando `duracion_min > 0` (422), unicidad de nombre (409 causa `duplicate_nombre_prestacion`), ordenamiento por `(nombre, id)` y baja lógica vía `activo=false`.
- **`GET/POST /horarios-atencion`** y **`PATCH /horarios-atencion/{id}`**: gestión de franjas horarias semanales de profesionales; validación `dia_semana` en `0..6` (422), `desde < hasta` (422), verificación de `profesional_id` existente (404 si no existe) y activo (422 si está inactivo), baja lógica vía `activo=false`, y detección de solape temporal con franjas existentes del mismo profesional/día (409 causa `solape_horario`). En `PATCH`, el solape se evalúa con los valores resultantes excluyendo la fila propia (`excluir_id`) y omitiendo horarios inactivos para evitar falsos positivos por idempotencia. Reactivar un horario con `{"activo": true}` re-valida solapes contra horarios activos. La adyacencia exacta está permitida (RN-AG-04).
- **`GET/POST /bloqueos`** y **`DELETE /bloqueos/{id}`**: gestión y cancelación física de bloqueos puntuales de profesional, sillón o globales; validación de `desde < hasta` (422) y datetimes con zona horaria (422 si son naive); referencias a profesionales o sillones inexistentes retornan 404; intentos de bloqueo sobre profesionales o sillones inactivos retornan 422; `GET /bloqueos` lista todos los bloqueos ordenados por `(desde, id)` sin filtro de activo (los bloqueos no tienen columna `activo`); el borrado de bloqueos es la única operación DELETE permitida del catálogo.
- **Formato estándar de respuestas y errores**: 409 con cuerpo estructurado `detail={"causa": "...", "detalle": "..."}` detectado selectivamente por `exc.orig.diag.constraint_name` (`uq_pacientes_dni`, `uq_profesionales_matricula`, `uq_sillones_nombre`, `uq_prestaciones_nombre`), 404 con string simple `detail="..."` consistente con `turnos/router.py`, y 422 manejado mediante validadores de Pydantic.
- **Determinismo temporal**: ningún test dependerá de la fecha u hora real del sistema.

## Capabilities

### New Capabilities
<!-- Ninguna nueva capability base: se extiende la capability existente catalogo-recursos -->

### Modified Capabilities
- `catalogo-recursos`: Se incorporan requisitos y escenarios HTTP para la gestión vía API REST (GET, POST, PATCH, DELETE en bloqueos), validaciones de negocio y códigos de estado (409 por unicidad y solapes, 422 por rangos, duraciones, profesionales inactivos y nulos inválidos, 404 por recurso inexistente), ordenamiento determinístico, contratos de búsqueda, paginación con envelope y política de baja lógica con flag `activo`.

## Impact

- **Migraciones**: Nueva migración Alembic aditiva `006_catalogo_activo` sobre `005_caja_pagos` agregando columnas e índices de `activo` en 4 tablas.
- **Modelos SQLAlchemy**: Actualización de clases `Paciente`, `Profesional`, `Prestacion`, `HorarioAtencion` en `backend/app/agenda/models.py` para mapear el atributo `activo` y actualización de `validar_horario_sin_solape` con `excluir_id`.
- **Servicio Turnos (C-03)**: Modificación mínima en `backend/app/turnos/service.py` (`_cubierto_por_horario`) para filtrar únicamente `HorarioAtencion.activo.is_(True)`.
- **Backend / Router**: Creación de `backend/app/agenda/router_catalogo.py` montado en `backend/app/main.py`.
- **Schemas Pydantic**: Definición estricta de esquemas Request (Create, Patch) y Response (Out, Envelope paginado) en `backend/app/agenda/schemas.py`.
- **Servicios de Dominio**: Lógica de validación previa, mapeo de `IntegrityError` diferenciando constraint exacto y cálculo de solapes de horarios en `backend/app/agenda/service_catalogo.py`.
- **Tests**: Suite completa con pytest cubriendo CRUD, semántica PATCH, adyacencias, falsos positivos de solape, filtros de inactivos y test de regresión en turnos para horario inactivo.

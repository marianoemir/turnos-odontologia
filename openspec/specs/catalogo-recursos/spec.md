# catalogo-recursos

## Purpose

Provee el catálogo de recursos que los turnos referencian (pacientes, profesionales, sillones, prestaciones, horarios y bloqueos) con integridad a nivel de base de datos y un seed ficticio reproducible, para que la creación de turnos valide solapes, horarios y bloqueos sin redefinir el dominio.

## Requirements

### Requirement: Paciente con DNI único y datos ficticios

El sistema SHALL persistir pacientes con nombre, dni único, contacto en texto libre y marca de dato ficticio; un dni duplicado SHALL ser rechazado por la base de datos.

#### Scenario: Alta de paciente válida (happy-path)

- **Dado** un catálogo vacío con la revisión 001 aplicada
- **Cuando** se persiste un paciente con dni ficticio no existente
- **Entonces** el paciente queda guardado y es recuperable por su dni

#### Scenario: DNI duplicado rechazado (business-error)

- **Dado** un paciente existente con dni `DNI-FICT-001`
- **Cuando** se intenta persistir otro paciente con el mismo dni
- **Entonces** la base de datos rechaza la inserción por violación de unicidad

### Requirement: Profesional con matrícula única

El sistema SHALL persistir profesionales con nombre y matrícula única ficticia; una matrícula duplicada SHALL ser rechazada por la base de datos.

#### Scenario: Alta de profesional válida (happy-path)

- **Dado** un catálogo vacío con la revisión 001 aplicada
- **Cuando** se persiste un profesional con matrícula ficticia no existente
- **Entonces** el profesional queda guardado y es recuperable por su matrícula

#### Scenario: Matrícula duplicada rechazada (business-error)

- **Dado** un profesional existente con matrícula `MAT-FICT-001`
- **Cuando** se intenta persistir otro profesional con la misma matrícula
- **Entonces** la base de datos rechaza la inserción por violación de unicidad

### Requirement: Prestación con duración fija mayor a cero

El sistema SHALL exigir `duracion_min` entero mayor a cero a nivel de base de datos (RN-AG-01); valores cero o negativos SHALL ser rechazados.

#### Scenario: Prestación válida (happy-path)

- **Dado** la revisión 001 aplicada
- **Cuando** se persiste una prestación con `duracion_min` 30
- **Entonces** la prestación queda guardada con su duración

#### Scenario: Duración no positiva rechazada (business-error)

- **Dado** la revisión 001 aplicada
- **Cuando** se intenta persistir una prestación con `duracion_min` 0 o negativo
- **Entonces** la base de datos rechaza la inserción por CHECK

### Requirement: Sillón con estado activo consultable

El sistema SHALL persistir sillones con nombre y flag `activo` (default true) e índice sobre `activo`; la desactivación SHALL ser un cambio de estado, nunca un borrado físico cuando el recurso tiene historia (RN-AG-03, soft).

#### Scenario: Sillón activo por defecto (happy-path)

- **Dado** la revisión 001 aplicada
- **Cuando** se persiste un sillón sin indicar `activo`
- **Entonces** queda guardado con `activo` en true

#### Scenario: Listado de sillones activos (happy-path)

- **Dado** sillones activos e inactivos persistidos
- **Cuando** se consultan los sillones activos
- **Entonces** solo se devuelven los que tienen `activo` en true

### Requirement: Horario de atención válido y sin solape de configuración

El sistema SHALL exigir `desde < hasta`, `dia_semana` en 0–6 (convención Python `weekday()`: 0=lunes) y rechazar filas solapadas del mismo profesional y día; la adyacencia exacta (`hasta == desde` de otra fila) SHALL ser permitida como borde no-solapado.

#### Scenario: Horario válido (happy-path)

- **Dado** un profesional existente sin horarios
- **Cuando** se persiste un horario Lun–Vie 9–18 válido
- **Entonces** el horario queda guardado

#### Scenario: Horario con desde >= hasta rechazado (business-error)

- **Dado** un profesional existente
- **Cuando** se intenta persistir un horario con `desde` igual o posterior a `hasta`
- **Entonces** la base de datos rechaza la inserción por CHECK

#### Scenario: Adyacencia permitida, solape rechazado (edge-case)

- **Dado** un horario existente de 9:00 a 13:00 para un profesional un lunes
- **Cuando** se persiste una fila adyacente de 13:00 a 18:00 del mismo profesional y día
- **Entonces** es aceptada; y cuando se intenta una fila solapada de 12:00 a 14:00 entonces es rechazada

### Requirement: Bloqueo con rango válido y aplicabilidad definida

El sistema SHALL exigir `desde < hasta` con zona horaria y aplicar la matriz: solo-profesional, solo-sillón, global (ambos null) y pareja concreta (ambos no-null); `motivo` es obligatorio. Un intervalo de turno SHALL considerarse bloqueado cuando intersecta en `[inicio,fin)` un bloqueo aplicable (RN-AG-05).

#### Scenario: Bloqueo global válido (happy-path)

- **Dado** la revisión 001 aplicada
- **Cuando** se persiste un bloqueo con ambos ids en null, rango válido y motivo
- **Entonces** el bloqueo queda guardado como aplicable a todo turno intersectado

#### Scenario: Bloqueo con rango invertido rechazado (business-error)

- **Dado** la revisión 001 aplicada
- **Cuando** se intenta persistir un bloqueo con `desde` posterior a `hasta`
- **Entonces** la base de datos rechaza la inserción por CHECK

#### Scenario: Aplicabilidad por matriz (edge-case)

- **Dado** un bloqueo solo-sillón sobre el sillón A y un turno candidato en el sillón B dentro del mismo rango
- **Cuando** se evalúa si el bloqueo aplica al turno
- **Entonces** no aplica; y cuando el turno candidato usa el sillón A en rango intersectado entonces sí aplica

### Requirement: Seed ficticio reproducible del catálogo

Con `SEED_FICTICIO=true` el sistema SHALL sembrar exactamente 2 profesionales, 2 sillones, 3 prestaciones (20/30/60 min), horarios Lun–Vie 9–18 por profesional, 1 bloqueo de prueba y 3 pacientes con DNI ficticios; el seed SHALL ser idempotente y SHALL NOT incluir turnos (pertenecen a C-03).

#### Scenario: Seed carga el catálogo (happy-path)

- **Dado** una base vacía con la revisión 001 aplicada
- **Cuando** se ejecuta el seed con `SEED_FICTICIO=true`
- **Entonces** existen 2 profesionales, 2 sillones, 3 prestaciones, horarios Lun–Vie por profesional, 1 bloqueo y 3 pacientes

#### Scenario: Seed idempotente (edge-case)

- **Dado** una base ya sembrada por el seed
- **Cuando** se ejecuta el seed por segunda vez
- **Entonces** los conteos no cambian y no hay duplicados por dni, matrícula o nombre de recurso

### Requirement: Gestión de pacientes vía API REST con búsqueda y paginación
El sistema SHALL exponer endpoints HTTP para listar (`GET /pacientes`), dar de alta (`POST /pacientes`) y modificar parcialmente (`PATCH /pacientes/{id}`) pacientes; la búsqueda SHALL soportar `?q=` (escapando comodines `%` y `_` para coincidencia insensible a mayúsculas/minúsculas en nombre o dni), ordenamiento determinístico por `(nombre, id)`, filtrado de registros inactivos y paginación con envelope estructurado `{items, total, limit, offset}` calculando `total` con los mismos filtros.

#### Scenario: Alta exitosa de paciente (happy-path)
- **WHEN** se envía una solicitud `POST /pacientes` con `nombre`, `dni` y `contacto` válidos
- **THEN** el sistema responde HTTP 201 con el identificador asignado y los datos del paciente persistido con `activo=true`

#### Scenario: Búsqueda con caracteres especiales y paginación estable (happy-path)
- **WHEN** existiendo pacientes "Juan_Perez" y "Juan Perez", se envía `GET /pacientes?q=Juan_Perez&limit=1&offset=0`
- **THEN** el sistema responde HTTP 200 con un envelope donde `items` contiene únicamente el paciente con guión bajo literal, y al consultar la página siguiente con `offset=1` los resultados no presentan duplicados ni saltos respecto al ordenamiento `(nombre, id)`

#### Scenario: Rechazo de DNI duplicado con código 409 (business-error)
- **WHEN** se envía `POST /pacientes` con un `dni` que ya pertenece a un paciente registrado
- **THEN** el sistema responde HTTP 409 con cuerpo estructurado `detail={"causa": "duplicate_dni", "detalle": "..."}`

#### Scenario: Validación de parámetros de paginación fuera de rango responde 422 (business-error)
- **WHEN** se envía `GET /pacientes?limit=0` o `GET /pacientes?limit=201` o `GET /pacientes?offset=-1`
- **THEN** el sistema responde HTTP 422 indicando que el límite debe estar entre 1 y 200 y el desplazamiento no puede ser negativo

#### Scenario: Exclusión de pacientes inactivos y consistencia de total (edge-case)
- **WHEN** se consulta `GET /pacientes` existiendo pacientes con `activo=false` sin enviar `incluir_inactivos=true`
- **THEN** el sistema responde HTTP 200 excluyendo a los pacientes inactivos de la lista `items` y reflejando en `total` únicamente la cuenta de pacientes activos

### Requirement: Criterio uniforme de actualización parcial PATCH
El sistema SHALL aplicar actualización parcial en todos los recursos del catálogo (`/pacientes/{id}`, `/profesionales/{id}`, `/sillones/{id}`, `/prestaciones/{id}`, `/horarios-atencion/{id}`); solo se actualizarán los campos presentes en el cuerpo del request, un cuerpo vacío SHALL conservar el recurso sin cambios, y el envío explícito de `null` en campos NOT NULL SHALL responder HTTP 422.

#### Scenario: Actualización de un único campo conservando el resto (happy-path)
- **WHEN** se envía una solicitud `PATCH /pacientes/{id}` modificando únicamente el campo `contacto`
- **THEN** el sistema responde HTTP 200 con el `contacto` modificado y conserva intactos el `nombre` y `dni` originales

#### Scenario: PATCH con body vacío no modifica el recurso (edge-case)
- **WHEN** se envía una solicitud `PATCH /profesionales/{id}` con un cuerpo JSON vacío `{}`
- **THEN** el sistema responde HTTP 200 retornando el recurso con sus mismos valores sin alteración alguna

#### Scenario: PATCH con null explícito en campo NOT NULL responde 422 (business-error)
- **WHEN** se envía una solicitud `PATCH /pacientes/{id}` con cuerpo `{"nombre": null}`
- **THEN** el sistema responde HTTP 422 indicando que el campo no permite valores nulos

#### Scenario: PATCH con campo desconocido responde 422 (business-error)
- **WHEN** se envía una solicitud `PATCH /pacientes/{id}` incluyendo una clave no reconocida como `{"campo_inexistente": "valor"}`
- **THEN** el sistema responde HTTP 422 por campo no permitido (extra=forbid)

#### Scenario: PATCH con recurso inexistente responde 404 (business-error)
- **WHEN** se envía una solicitud `PATCH /pacientes/{id}` con un identificador UUID inexistente
- **THEN** el sistema responde HTTP 404 con string `detail="..."`

#### Scenario: Conflicto 409 por DNI duplicado durante PATCH (business-error)
- **WHEN** se envía `PATCH /pacientes/{id}` intentando asignar un `dni` existente en otro paciente
- **THEN** el sistema responde HTTP 409 con cuerpo `detail={"causa": "duplicate_dni", "detalle": "..."}`

### Requirement: Gestión de profesionales con matrícula única y toggle de activo
El sistema SHALL permitir la creación (`POST /profesionales`), listado (`GET /profesionales`) y edición (`PATCH /profesionales/{id}`) de profesionales ordenados determinísticamente por `(nombre, id)`; la matrícula duplicada SHALL retornar HTTP 409 con causa `duplicate_matricula` y se SHALL admitir la baja lógica mediante `activo=false`.

#### Scenario: Alta exitosa de profesional (happy-path)
- **WHEN** se envía `POST /profesionales` con `nombre` y `matricula` válidos
- **THEN** el sistema responde HTTP 201 retornando el profesional creado con estado `activo=true`

#### Scenario: Desactivación lógica de profesional vía PATCH (happy-path)
- **WHEN** se envía `PATCH /profesionales/{id}` con `{"activo": false}`
- **THEN** el sistema responde HTTP 200 confirmando el nuevo estado inactivo del profesional

#### Scenario: Matrícula duplicada rechazada con 409 (business-error)
- **WHEN** se envía `POST /profesionales` o `PATCH /profesionales/{id}` con una matrícula ya asignada a otro profesional
- **THEN** el sistema responde HTTP 409 con cuerpo estructurado `detail={"causa": "duplicate_matricula", "detalle": "..."}`

#### Scenario: Listado filtra profesionales inactivos salvo flag explícito (edge-case)
- **WHEN** se consulta `GET /profesionales?incluir_inactivos=true`
- **THEN** el sistema responde HTTP 200 incluyendo tanto profesionales activos como inactivos en orden determinístico `(nombre, id)`

### Requirement: Gestión de sillones con nombre único y baja lógica
El sistema SHALL permitir listar (`GET /sillones`), crear (`POST /sillones`) y modificar (`PATCH /sillones/{id}`) sillones ordenados por `(nombre, id)`; SHALL rechazar nombres duplicados con HTTP 409 (`duplicate_nombre_sillon`); y SHALL prohibir el borrado físico (`DELETE`), requiriendo que la baja se realice mediante `activo=false` en PATCH.

#### Scenario: Alta y consulta de sillones activos por defecto (happy-path)
- **WHEN** se crea un sillón con `POST /sillones` y luego se consulta `GET /sillones`
- **THEN** el sillón recién creado figura en la lista de recursos activos ordenados determinísticamente

#### Scenario: Rechazo con 409 por nombre de sillón duplicado (business-error)
- **WHEN** se envía `POST /sillones` o `PATCH /sillones/{id}` con un `nombre` de sillón existente
- **THEN** el sistema responde HTTP 409 con cuerpo estructurado `detail={"causa": "duplicate_nombre_sillon", "detalle": "..."}`

#### Scenario: Baja lógica de sillón mediante actualización de estado (happy-path)
- **WHEN** se envía `PATCH /sillones/{id}` con `{"activo": false}`
- **THEN** el sistema responde HTTP 200 y el sillón queda marcado como inactivo sin eliminarse de la base

#### Scenario: Exclusión de sillón inactivo en listado general por defecto (edge-case)
- **WHEN** se consulta `GET /sillones` existiendo un sillón con `activo=false` y sin especificar `incluir_inactivos=true`
- **THEN** el sillón inactivo no aparece en el listado resultante

### Requirement: Validación de duración positiva y nombre único en prestaciones
El sistema SHALL gestionar prestaciones (`GET /prestaciones`, `POST /prestaciones`, `PATCH /prestaciones/{id}`) ordenadas por `(nombre, id)`; SHALL rechazar con HTTP 422 cualquier solicitud donde `duracion_min` sea menor o igual a cero; y SHALL rechazar nombres duplicados con HTTP 409 (`duplicate_nombre_prestacion`).

#### Scenario: Creación exitosa de prestación (happy-path)
- **WHEN** se envía `POST /prestaciones` con nombre y `duracion_min=45`
- **THEN** el sistema responde HTTP 201 persistiendo la prestación con `activo=true`

#### Scenario: Rechazo con 422 por duración menor o igual a cero en POST (business-error)
- **WHEN** se envía `POST /prestaciones` con `duracion_min=0` o negativo
- **THEN** el sistema responde HTTP 422 con detalle de validación sobre la duración

#### Scenario: Rechazo con 409 por nombre de prestación duplicado (business-error)
- **WHEN** se intenta crear o editar una prestación con un `nombre` ya existente
- **THEN** el sistema responde HTTP 409 con cuerpo estructurado `detail={"causa": "duplicate_nombre_prestacion", "detalle": "..."}`

#### Scenario: Desactivación lógica de prestación vía PATCH (happy-path)
- **WHEN** se envía `PATCH /prestaciones/{id}` con `{"activo": false}`
- **THEN** el sistema responde HTTP 200 confirmando que la prestación pasa a estar inactiva

### Requirement: Gestión y validación de horarios de atención sin falsos positivos en PATCH
El sistema SHALL permitir registrar (`POST /horarios-atencion`), consultar (`GET /horarios-atencion`) y editar (`PATCH /horarios-atencion/{id}`) franjas horarias de profesionales; SHALL validar `dia_semana`, rangos temporales e integridad de profesional; y SHALL rechazar con 409 (`solape_horario`) solapes con franjas activas, calculando en PATCH sobre la fila propia excluida y permitiendo adyacencia (RN-AG-04).

#### Scenario: Registro válido de horario de atención y adyacencia permitida (happy-path)
- **WHEN** existiendo un horario de 09:00 a 13:00, se envía `POST /horarios-atencion` con rango de 13:00 a 18:00 para el mismo profesional y día
- **THEN** el sistema responde HTTP 201 persistiendo el horario adyacente sin conflicto

#### Scenario: Rechazo con 422 ante día inválido, rango invertido o profesional inactivo (business-error)
- **WHEN** se envía `POST /horarios-atencion` con `dia_semana=7`, con `desde >= hasta`, o referenciando un profesional con `activo=false`
- **THEN** el sistema responde HTTP 422 con detalle de validación

#### Scenario: Rechazo con 404 ante profesional inexistente en horario (business-error)
- **WHEN** se envía `POST /horarios-atencion` con un `profesional_id` inexistente
- **THEN** el sistema responde HTTP 404 con string `detail="..."`

#### Scenario: Conflicto 409 ante solape de horarios del mismo profesional y día (business-error)
- **WHEN** existiendo un horario activo de 09:00 a 13:00, se intenta registrar o actualizar otro horario solapando de 12:00 a 15:00 para el mismo profesional y día
- **THEN** el sistema responde HTTP 409 con cuerpo `detail={"causa": "solape_horario", "detalle": "..."}`

#### Scenario: PATCH idempotente en horario no genera conflicto consigo mismo (edge-case)
- **WHEN** se envía `PATCH /horarios-atencion/{id}` conservando su propio horario o ajustando únicamente `hasta` sin colisionar con terceros
- **THEN** el sistema responde HTTP 200 actualizando el horario sin disparar falso positivo de solape

#### Scenario: PATCH rechaza intento de modificar profesional_id con 422 (business-error)
- **WHEN** se envía `PATCH /horarios-atencion/{id}` incluyendo la clave `"profesional_id"` en el cuerpo
- **THEN** el sistema responde HTTP 422 rechazado por campo no permitido (extra=forbid)

#### Scenario: PATCH con rango resultante desde >= hasta responde 422 (business-error)
- **WHEN** existiendo un horario guardado con `desde=09:00` y `hasta=13:00`, se envía `PATCH /horarios-atencion/{id}` únicamente con `{"hasta": "08:30"}`
- **THEN** el sistema responde HTTP 422 indicando que el rango horario resultante no cumple `desde < hasta`

#### Scenario: Horario inactivo no genera solape y reactivación re-valida (edge-case)
- **WHEN** existe un horario inactivo de 09:00 a 13:00 y se registra otro activo en la misma franja
- **THEN** la creación es aceptada; y cuando posteriormente se intenta enviar `PATCH` con `{"activo": true}` sobre el horario inactivo, el sistema responde HTTP 409 por solape

### Requirement: Gestión y cancelación física de bloqueos con validación de recursos activos
El sistema SHALL permitir registrar (`POST /bloqueos`), listar todos los bloqueos (`GET /bloqueos` ordenados por `(desde, id)` sin filtro de activo) y eliminar físicamente (`DELETE /bloqueos/{id}`) bloqueos temporales; SHALL exigir `desde < hasta` (422) y datetimes con zona horaria no naive (422); SHALL responder HTTP 404 ante profesionales o sillones inexistentes; y SHALL rechazar con HTTP 422 cualquier intento de bloqueo contra profesionales o sillones inactivos.

#### Scenario: Creación exitosa de bloqueo con alcance definido (happy-path)
- **WHEN** se envía `POST /bloqueos` con `desde < hasta`, datetimes con timezone, `motivo` y `profesional_id` válido y activo
- **THEN** el sistema responde HTTP 201 con el bloqueo registrado

#### Scenario: Creación exitosa de bloqueo conjunto de profesional y sillón (happy-path)
- **WHEN** se envía `POST /bloqueos` especificando `profesional_id` y `sillon_id` válidos y activos a la vez
- **THEN** el sistema responde HTTP 201 registrando un bloqueo que aplica únicamente a turnos donde coincidan ambos recursos simultáneamente (matriz D1 de C-02)

#### Scenario: Creación exitosa de bloqueo global con profesional_id y sillon_id nulos (happy-path)
- **WHEN** se envía `POST /bloqueos` con `profesional_id=null`, `sillon_id=null`, `desde < hasta`, timezone y `motivo`
- **THEN** el sistema responde HTTP 201 registrando un bloqueo global de la clínica

#### Scenario: Rechazo con 422 ante datetimes sin zona horaria o rango invertido (business-error)
- **WHEN** se envía `POST /bloqueos` con datetimes naive o con `desde` posterior o igual a `hasta`
- **THEN** el sistema responde HTTP 422 con detalle de validación

#### Scenario: Rechazo con 404 ante profesional o sillón inexistente (business-error)
- **WHEN** se envía `POST /bloqueos` con un `profesional_id` o `sillon_id` inexistente en el catálogo
- **THEN** el sistema responde HTTP 404 con string `detail="..."`

#### Scenario: Rechazo con 422 al intentar bloquear recurso inactivo (business-error)
- **WHEN** se envía `POST /bloqueos` referenciando un profesional o sillón con `activo=false`
- **THEN** el sistema responde HTTP 422 indicando que no se puede bloquear un recurso inactivo

#### Scenario: Eliminación física de bloqueo existente mediante DELETE (happy-path)
- **WHEN** se envía una solicitud `DELETE /bloqueos/{id}` para un bloqueo existente
- **THEN** el sistema responde HTTP 204 y el registro queda eliminado físicamente de la base

#### Scenario: DELETE con bloqueo inexistente responde 404 (business-error)
- **WHEN** se envía una solicitud `DELETE /bloqueos/{id}` con un identificador UUID inexistente
- **THEN** el sistema responde HTTP 404 con string `detail="..."`

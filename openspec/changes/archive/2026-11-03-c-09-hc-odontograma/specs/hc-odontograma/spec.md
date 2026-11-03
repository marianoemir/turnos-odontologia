# Spec Delta

## Purpose

Registra la información clínica del paciente: una historia clínica única por
paciente con entradas trazables, el odontograma como historial de estados por
pieza FDI y los planes de tratamiento con presupuesto calculado y cobertura
informada de solo lectura.

## ADDED Requirements

### Requirement: Historia clínica única por paciente

El sistema SHALL permitir crear una historia clínica por paciente. Un paciente
solo puede tener una HC; un segundo intento es un conflicto de negocio, nunca
una sobrescritura silenciosa.

#### Scenario: Creación válida

- **GIVEN** un paciente existente sin historia clínica
- **WHEN** se envía `POST /historias-clinicas` con `paciente_id` y cabecera
  opcional (`antecedentes`, `alergias`, `observaciones`)
- **THEN** responde `201` con `id`, `paciente_id` y los campos de cabecera;
  los enviados en `null` o ausentes vuelven como `null`

#### Scenario: Segunda HC del mismo paciente devuelve 409

- **GIVEN** un paciente que ya tiene una historia clínica
- **WHEN** se envía `POST /historias-clinicas` con el mismo `paciente_id`
- **THEN** responde `409` con `detail.causa` que identifica la HC existente, la
  HC original queda intacta y no se crea una segunda fila

#### Scenario: Paciente inexistente devuelve 404

- **WHEN** se envía `POST /historias-clinicas` con un `paciente_id` que no
  existe
- **THEN** responde `404` y no se crea ninguna historia clínica

#### Scenario: Lectura por paciente sin HC devuelve 404

- **GIVEN** un paciente existente sin historia clínica
- **WHEN** se consulta `GET /pacientes/{paciente_id}/historia-clinica`
- **THEN** responde `404` (no `200` con cuerpo vacío)

### Requirement: Cabecera de HC editable sin perder entradas

El sistema SHALL permitir actualizar la cabecera de una HC de forma parcial:
solo se modifican los campos presentes en el cuerpo del pedido.

#### Scenario: Actualización parcial preserva el resto

- **GIVEN** una HC con `antecedentes` y `alergias` cargados y al menos una
  entrada clínica
- **WHEN** se envía `PATCH /historias-clinicas/{id}` con solo `alergias`
- **THEN** responde `200`, `alergias` cambia, `antecedentes` y `observaciones`
  conservan su valor previo y las entradas siguen existiendo

#### Scenario: PATCH con cuerpo vacío no modifica nada

- **GIVEN** una HC con cabecera cargada
- **WHEN** se envía `PATCH /historias-clinicas/{id}` con `{}`
- **THEN** responde `200` y todos los campos conservan su valor previo

#### Scenario: HC inexistente devuelve 404

- **WHEN** se envía `PATCH /historias-clinicas/{id}` con un `id` inexistente
- **THEN** responde `404`

### Requirement: Entradas clínicas append-only con trazabilidad

El sistema SHALL registrar entradas clínicas que solo se agregan, con
`profesional_id` y `fecha` obligatorios. No se exponen operaciones de borrado ni
de modificación de entradas.

#### Scenario: Alta de entrada

- **GIVEN** una HC existente y un profesional existente
- **WHEN** se envía `POST /historias-clinicas/{id}/entradas` con `profesional_id`,
  `fecha` y `texto`
- **THEN** responde `201` con `id`, `profesional_id`, `fecha` y `texto`; la HC
  sigue existiendo sin cambios en su cabecera

#### Scenario: Consulta ordenada por fecha

- **GIVEN** una HC con tres entradas de fechas distintas cargadas fuera de orden
- **WHEN** se consulta `GET /historias-clinicas/{id}/entradas`
- **THEN** responde `200` con las tres entradas ordenadas por `fecha` ascendente
  y cada una conserva su `profesional_id`

#### Scenario: Entrada sobre HC inexistente devuelve 404

- **WHEN** se envía `POST /historias-clinicas/{id}/entradas` con un `id` de HC
  inexistente
- **THEN** responde `404` y no se crea la entrada

#### Scenario: Profesional inexistente devuelve 404

- **GIVEN** una HC existente
- **WHEN** se envía `POST /historias-clinicas/{id}/entradas` con un
  `profesional_id` que no existe
- **THEN** responde `404` y no se crea la entrada

#### Scenario: Sin eliminación de entradas

- **GIVEN** una HC con al menos una entrada
- **WHEN** se solicita `DELETE /historias-clinicas/{id}/entradas` (la colección
  existe para `POST` y `GET`, pero no para `DELETE`)
- **THEN** la API no expone esa operación (`405`) y la entrada sigue existiendo
  en consultas posteriores

### Requirement: Registro de estado por pieza en odontograma

El sistema SHALL registrar observaciones de estado por pieza, guardando el
`estado` recibido tal cual, con `profesional_id` y `fecha`. El estado no se
valida contra un catálogo clínico (`Q-C09-01`).

#### Scenario: Registro de estado válido

- **GIVEN** un paciente y un profesional existentes
- **WHEN** se envía `POST /pacientes/{paciente_id}/odontograma` con
  `pieza="16"`, `estado="cariado"`, `profesional_id` y `fecha`
- **THEN** responde `201` con `pieza`, `estado`, `profesional_id` y `fecha`

#### Scenario: Estado fuera de cualquier catálogo se guarda literal

- **GIVEN** un paciente existente
- **WHEN** se registra `estado="observacion-libre-no-catalogada"`
- **THEN** responde `201` y `GET /pacientes/{paciente_id}/odontograma` devuelve
  el mismo texto exacto, sin normalizar ni rechazar

#### Scenario: Paciente inexistente devuelve 404

- **WHEN** se envía `POST /pacientes/{paciente_id}/odontograma` con un
  `paciente_id` que no existe
- **THEN** responde `404` y no se crea ninguna observación

#### Scenario: Profesional inexistente devuelve 404

- **GIVEN** un paciente existente
- **WHEN** se envía `POST /pacientes/{paciente_id}/odontograma` con un
  `profesional_id` que no existe
- **THEN** responde `404` y no se crea ninguna observación

### Requirement: Historial por pieza con profesional y fecha

El sistema SHALL conservar todas las observaciones de una pieza y exponerlas
como historial, sin reemplazar la anterior.

#### Scenario: Dos estados de la misma pieza coexisten

- **GIVEN** una pieza con un estado registrado el 2026-01-10 y otro el
  2026-02-15 por profesionales distintos
- **WHEN** se consulta `GET /pacientes/{paciente_id}/odontograma?pieza=16`
- **THEN** responde `200` con dos registros ordenados por `fecha` ascendente,
  cada uno con su `profesional_id` y `fecha`

#### Scenario: Paciente sin registros devuelve lista vacía

- **GIVEN** un paciente existente sin observaciones de odontograma
- **WHEN** se consulta `GET /pacientes/{paciente_id}/odontograma`
- **THEN** responde `200` con `[]` (no `404`)

### Requirement: Validación estructural de pieza FDI

El sistema SHALL aceptar únicamente piezas con formato FDI de dos dígitos:
cuadrante `1`-`4` seguido de pieza `1`-`8`. El rango es estructural y no
implica nomenclatura clínica (`Q-C09-02`).

#### Scenario: Piezas de borde aceptadas

- **WHEN** se registra una observación para `pieza="18"` o `pieza="48"`
- **THEN** responde `201`

#### Scenario: Pieza fuera de rango devuelve 422

- **WHEN** se registra una observación con `pieza="19"`, `pieza="55"` o
  `pieza="1"`
- **THEN** responde `422` y no se crea la observación

### Requirement: Plan de tratamiento con items por pieza

El sistema SHALL permitir crear un plan para un paciente y profesional, y
agregar items que vinculan una pieza FDI con una prestación del catálogo.

#### Scenario: Plan con items

- **GIVEN** un paciente, un profesional y dos prestaciones del catálogo
- **WHEN** se crea `POST /planes-tratamiento` y se agregan dos items con
  `pieza`, `prestacion_id` y `monto_centavos`
- **THEN** responde `201` en cada alta y `GET /planes-tratamiento/{id}` devuelve
  los dos items con su pieza y prestación

#### Scenario: Item sobre plan inexistente devuelve 404

- **WHEN** se envía `POST /planes-tratamiento/{id}/items` con un `id`
  inexistente
- **THEN** responde `404` y no se crea el item

#### Scenario: Item con prestación inexistente devuelve 404

- **GIVEN** un plan existente
- **WHEN** se agrega un item con un `prestacion_id` que no existe
- **THEN** responde `404` y el plan queda sin ese item

#### Scenario: Paciente inexistente devuelve 404

- **WHEN** se envía `POST /planes-tratamiento` con un `paciente_id` que no existe
- **THEN** responde `404` y no se crea el plan

#### Scenario: Profesional inexistente devuelve 404

- **GIVEN** un paciente existente
- **WHEN** se envía `POST /planes-tratamiento` con un `profesional_id` que no
  existe
- **THEN** responde `404` y no se crea el plan

### Requirement: Listado de planes del paciente

El sistema SHALL exponer todos los planes de tratamiento de un paciente, cada uno
con sus `items`, `total_centavos` y `cobertura_centavos` calculados **igual que en
el detalle del plan** (`GET /planes-tratamiento/{id}`). Un paciente sin planes es
una lista vacía, no un error.

#### Scenario: Listado de los planes del paciente

- **GIVEN** un paciente con dos planes de tratamiento creados en ese orden, con
  items de `1500000` y `2500000` centavos
- **WHEN** se consulta `GET /pacientes/{paciente_id}/planes-tratamiento`
- **THEN** responde `200` con los dos planes ordenados por `creado_en`
  **ascendente** y cada uno con `items`, `total_centavos` (suma de
  `monto_centavos`) y `cobertura_centavos` (suma de `monto_cobertura_centavos`)

#### Scenario: Paciente sin planes devuelve lista vacía

- **GIVEN** un paciente existente sin planes de tratamiento
- **WHEN** se consulta `GET /pacientes/{paciente_id}/planes-tratamiento`
- **THEN** responde `200` con `[]` (no `404`)

#### Scenario: Paciente inexistente devuelve 404

- **WHEN** se consulta `GET /pacientes/{paciente_id}/planes-tratamiento` con un
  `paciente_id` que no existe
- **THEN** responde `404` (distingue "el paciente no existe" de "el paciente no
  tiene planes")

### Requirement: Presupuesto calculado como suma de items

El sistema SHALL devolver el presupuesto del plan como la suma de
`monto_centavos` de sus items, sin almacenar un total propio.

#### Scenario: Total suma las piezas

- **GIVEN** un plan con items de `1500000` y `2500000` centavos
- **WHEN** se consulta `GET /planes-tratamiento/{id}`
- **THEN** responde `200` con `total_centavos = 4000000`

#### Scenario: Plan sin items tiene total cero

- **GIVEN** un plan recién creado sin items
- **WHEN** se consulta `GET /planes-tratamiento/{id}`
- **THEN** responde `200` con `total_centavos = 0` e `items = []` (no es error)

#### Scenario: Item agregado después actualiza el total

- **GIVEN** un plan con un item de `1000000` centavos
- **WHEN** se agrega otro item de `500000` y se vuelve a consultar el plan
- **THEN** `total_centavos` pasa a `1500000`

### Requirement: Cobertura de OS informada de solo lectura

El sistema SHALL almacenar y devolver `monto_cobertura_centavos` tal como lo
informa el cliente, sin calcularlo ni validarlo contra nomenclador alguno
(`Q-C09-03`).

#### Scenario: Cobertura informada se devuelve literal

- **GIVEN** un item creado con `monto_cobertura_centavos = 750000`
- **WHEN** se consulta `GET /planes-tratamiento/{id}`
- **THEN** responde `200` con `monto_cobertura_centavos = 750000` en ese item y
  `cobertura_centavos = 750000` en el plan

#### Scenario: Cobertura ausente queda nula

- **GIVEN** un item creado sin `monto_cobertura_centavos`
- **WHEN** se consulta `GET /planes-tratamiento/{id}`
- **THEN** responde `200` con `monto_cobertura_centavos = null` y
  `cobertura_centavos = 0` en el plan (la suma ignora los nulos)

### Requirement: Montos en centavos no negativos

El sistema SHALL expresar todos los montos como enteros de centavos y rechazar
valores negativos.

#### Scenario: Cero es un monto válido

- **WHEN** se agrega un item con `monto_centavos = 0`
- **THEN** responde `201` y el total del plan lo incluye como cero

#### Scenario: Monto negativo devuelve 422

- **WHEN** se agrega un item con `monto_centavos = -1`
- **THEN** responde `422` y no se crea el item

#### Scenario: Monto decimal o ausente devuelve 422

- **WHEN** se agrega un item con `monto_centavos = 1500.50` o sin
  `monto_centavos`
- **THEN** responde `422`

### Requirement: Estados de plan e item con set provisorio

El sistema SHALL restringir `estado` del plan y del item a un conjunto
provisorio, informado como decisión de diseño y no como regla de la KB
(`Q-C09-04`).

#### Scenario: Estado del plan fuera del set devuelve 422

- **WHEN** se intenta `PATCH /planes-tratamiento/{id}` con
  `estado="estado-inventado"`
- **THEN** responde `422` y el estado previo se conserva

#### Scenario: Item solo se agrega en plan editable

- **GIVEN** un plan cuyo estado ya no admite edición (p. ej. `cerrado`)
- **WHEN** se envía `POST /planes-tratamiento/{id}/items`
- **THEN** responde `409` con `detail.causa` y no se crea el item

### Requirement: Sin eliminación física de registros clínicos

El sistema SHALL no exponer borrado de HC, entradas, observaciones de
odontograma, planes ni items; los cierres son cambios de estado.

#### Scenario: No existe endpoint de borrado de HC

- **GIVEN** una HC existente
- **WHEN** se solicita `DELETE /historias-clinicas/{id}`
- **THEN** la API no expone esa operación (`405`) y la HC sigue consultable

#### Scenario: Plan cerrado conserva sus items

- **GIVEN** un plan con dos items
- **WHEN** el plan se pasa a estado `cerrado` y luego se consulta
  `GET /planes-tratamiento/{id}`
- **THEN** responde `200` con estado `cerrado`, los dos items originales y el
  `total_centavos` calculado sobre ellos

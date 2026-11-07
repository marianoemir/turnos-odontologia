# caja-pagos Specification

## Purpose
TBD - created by archiving change c-10-caja-pagos-os-arca. Update Purpose after archive.

## Requirements

### Requirement: Apertura de caja diaria

El sistema SHALL permitir abrir una caja por día con monto inicial en centavos,
entre `0` y `MONTO_MAX_CENTAVOS`. Un día admite una sola caja; una segunda
apertura es conflicto de negocio. La fecha es siempre la fecha local de `ZONA`
según el reloj inyectable (`ahora_local()`): el request **no** lleva `fecha`, así
que no se puede abrir una caja para otro día y una apertura a las 23:30 hora
local pertenece a ese día local.

#### Scenario: Apertura válida crea caja abierta

- **GIVEN** que no existe caja para la fecha local del día
- **WHEN** se envía `POST /caja/abrir` con `monto_apertura_centavos` no negativo
- **THEN** responde `201` con `id`, `fecha`, `estado = "abierta"` y el monto de
  apertura; `cerrado_en` es nulo

#### Scenario: Segunda apertura el mismo día con caja abierta devuelve 409

- **GIVEN** una caja ya abierta para la fecha local del día
- **WHEN** se envía `POST /caja/abrir` nuevamente
- **THEN** responde `409` con `detail.causa = "caja_ya_abierta"`, la caja
  original queda intacta y no se crea una segunda fila

#### Scenario: Apertura con caja cerrada el mismo día devuelve 409

- **GIVEN** una caja ya cerrada para la fecha local del día
- **WHEN** se envía `POST /caja/abrir`
- **THEN** responde `409` con `detail.causa = "caja_ya_cerrada"` y no se crea
  una segunda caja

#### Scenario: Apertura a las 23:30 hora local registra la fecha local

- **GIVEN** que el reloj inyectado indica las 23:30 en
  `America/Argentina/Buenos_Aires` y no existe caja para esa fecha local
- **WHEN** se envía `POST /caja/abrir`
- **THEN** responde `201` con `fecha` igual a la fecha local de ese instante,
  aunque en UTC ya sea el día siguiente

#### Scenario: Monto de apertura negativo devuelve 422

- **WHEN** se envía `POST /caja/abrir` con `monto_apertura_centavos = -1`
- **THEN** responde `422` y no se crea ninguna caja

#### Scenario: Monto de apertura por encima del máximo devuelve 422

- **WHEN** se envía `POST /caja/abrir` con
  `monto_apertura_centavos = 1_000_000_000_001` (por encima de
  `MONTO_MAX_CENTAVOS`)
- **THEN** responde `422` y no se crea ninguna caja (nunca `500` por overflow)

#### Scenario: Apertura con caja abierta de un día anterior no bloquea el día de hoy

- **GIVEN** una caja `abierta` con la fecha local de ayer
- **WHEN** se envía `POST /caja/abrir` con `monto_apertura_centavos` no negativo
- **THEN** responde `201` con `fecha` igual a la fecha local de hoy y
  `estado = "abierta"`, y la caja de ayer sigue `abierta` (no se cierra sola;
  `Q-C10-15`)

### Requirement: Cierre de caja con arqueo

El sistema SHALL cerrar una caja abierta registrando el monto contado (entre
`0` y `MONTO_MAX_CENTAVOS`) y calculando el esperado como apertura + cobros en
efectivo registrados y no anulados; diferencia = contado − esperado. Los demás
medios se informan en `totales_por_medio_centavos`. Los cobros anulados no
suman en ninguno de los dos. Identifica la caja por `fecha` (default: fecha
local del reloj inyectable).

#### Scenario: Cierre válido calcula diferencia

- **GIVEN** una caja abierta con un cobro en efectivo registrado y no anulado por
  un monto conocido y un cobro con tarjeta registrado y no anulado por otro
  monto conocido
- **WHEN** se envía `POST /caja/cerrar` con `monto_cierre_contado_centavos`
- **THEN** responde `200` con `estado = "cerrada"`,
  `monto_esperado_centavos = apertura + suma de cobros en efectivo registrados y
  no anulados`, `monto_cierre_contado_centavos` y
  `diferencia_centavos = contado − esperado`, además de
  `totales_por_medio_centavos` con los totales por medio de pago (informativo)

#### Scenario: Cierre sin caja abierta para la fecha devuelve 409

- **GIVEN** que no existe caja para la fecha solicitada (o ninguna abierta)
- **WHEN** se envía `POST /caja/cerrar` con esa `fecha` (o sin `fecha`, usando
  la fecha local del día)
- **THEN** responde `409` con `detail.causa = "caja_no_abierta"` y no se
  modifica ninguna caja

#### Scenario: Cierre de caja ya cerrada devuelve 409

- **GIVEN** una caja ya cerrada para la fecha solicitada
- **WHEN** se envía `POST /caja/cerrar` sobre esa caja
- **THEN** responde `409` con `detail.causa = "caja_ya_cerrada"` y el arqueo
  previo se conserva

#### Scenario: Monto contado negativo devuelve 422

- **WHEN** se envía `POST /caja/cerrar` con
  `monto_cierre_contado_centavos = -1`
- **THEN** responde `422` y la caja permanece abierta

#### Scenario: Monto contado por encima del máximo devuelve 422

- **WHEN** se envía `POST /caja/cerrar` con
  `monto_cierre_contado_centavos = 1_000_000_000_001`
- **THEN** responde `422` y la caja permanece abierta (nunca `500` por overflow)

#### Scenario: Cobro anulado no entra en el arqueo

- **GIVEN** una caja abierta con un cobro en **efectivo** registrado que luego se
  anula, y un cobro en efectivo registrado y no anulado por un monto conocido
- **WHEN** se envía `POST /caja/cerrar` con `monto_cierre_contado_centavos`
- **THEN** responde `200` con `monto_esperado_centavos = apertura + suma de los
  cobros en efectivo registrados y no anulados`, el cobro anulado **no** aparece
  en `totales_por_medio_centavos` y
  `diferencia_centavos = contado − esperado`

### Requirement: Cobro registrado contra caja abierta

El sistema SHALL registrar un cobro únicamente contra una caja abierta, con
monto positivo en centavos (entre `1` y `MONTO_MAX_CENTAVOS`) y un medio válido.
El cobro queda en estado `registrado`. Sin `caja_id` se usa la caja abierta de
`hoy_local()` (409 `caja_no_abierta` si no hay). Un `caja_id` explícito
inexistente es `404`; uno cerrado es `409` `caja_no_abierta`.

#### Scenario: Cobro válido con turno existente

- **GIVEN** una caja abierta y un turno existente
- **WHEN** se envía `POST /cobros` con `turno_id`, `medio = "efectivo"` y
  `monto_centavos` positivo
- **THEN** responde `201` con `id`, `caja_id`, `turno_id`, `medio`,
  `monto_centavos`, `estado = "registrado"` y `creado_en`

#### Scenario: Cobro válido sin turno (standalone)

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` sin `turno_id`, con medio válido y monto
  positivo
- **THEN** responde `201` con `turno_id = null` y el cobro queda registrado

#### Scenario: Turno inexistente devuelve 404

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con un `turno_id` que no existe
- **THEN** responde `404` con `detail = "turno no existe: <id>"` y no se crea
  el cobro

#### Scenario: Monto no positivo devuelve 422

- **WHEN** se envía `POST /cobros` con `monto_centavos = 0` o negativo
- **THEN** responde `422` y no se crea el cobro

#### Scenario: Monto por encima del máximo devuelve 422

- **WHEN** se envía `POST /cobros` con `monto_centavos = 1_000_000_000_001` (por
  encima de `MONTO_MAX_CENTAVOS`)
- **THEN** responde `422` y no se crea el cobro (nunca `500` por overflow)

#### Scenario: Medio inválido devuelve 422

- **WHEN** se envía `POST /cobros` con `medio = "bitcoin"`
- **THEN** responde `422` y no se crea el cobro

#### Scenario: Cobro contra caja cerrada devuelve 409

- **GIVEN** que no hay caja abierta para la fecha local del día
- **WHEN** se envía `POST /cobros` sin `caja_id`
- **THEN** responde `409` con `detail.causa = "caja_no_abierta"` y no se crea
  el cobro

#### Scenario: Cobro con caja_id explícito inexistente devuelve 404

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con un `caja_id` que no existe
- **THEN** responde `404` con `detail = "caja no existe: <id>"` y no se crea
  el cobro

#### Scenario: Cobro con caja_id explícito cerrada devuelve 409

- **GIVEN** una caja cerrada existente
- **WHEN** se envía `POST /cobros` con ese `caja_id`
- **THEN** responde `409` con `detail.causa = "caja_no_abierta"` y no se crea
  el cobro

#### Scenario: Cobro sin caja_id a las 23:30 usa la caja abierta del día local

- **GIVEN** que el reloj inyectado indica las 23:30 en
  `America/Argentina/Buenos_Aires` (en UTC ya es el día siguiente) y existe una
  caja abierta con la fecha local de ese instante
- **WHEN** se envía `POST /cobros` sin `caja_id`
- **THEN** responde `201` con `caja_id` igual al `id` de la caja de la fecha
  local, no al de una caja de la fecha UTC

### Requirement: Cobro con concepto de seña, saldo o total

El sistema SHALL registrar la intención del cobro mediante `concepto`
(`sena`/`saldo`/`total`), con default `total`. El concepto se guarda y se
devuelve tal cual.

#### Scenario: Concepto sena vinculado a turno

- **GIVEN** una caja abierta y un turno existente
- **WHEN** se envía `POST /cobros` con `concepto = "sena"` y `turno_id` del
  turno
- **THEN** responde `201` con `concepto = "sena"` y el `turno_id` informado

#### Scenario: Concepto inválido devuelve 422

- **WHEN** se envía `POST /cobros` con `concepto = "anticipo"`
- **THEN** responde `422` y no se crea el cobro

#### Scenario: Concepto ausente toma el valor por defecto total

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` sin `concepto`
- **THEN** responde `201` con `concepto = "total"`

### Requirement: Anulación trazable de cobro

El sistema SHALL anular un cobro cambiando su estado a `anulado`, registrando
motivo y fecha (del reloj inyectable), sin borrar la fila. Orden de precedencia
de los rechazos: `cobro_ya_anulado` → `caja_cerrada` → `cobro_facturado`. Una
caja cerrada no permite anular (el arqueo es un snapshot inmutable) y un cobro
con factura ARCA emitida tampoco. Si el cobro es de obra social, su liquidación
pasa a `anulada` en la misma transacción.

#### Scenario: Anulación válida marca anulado y conserva fila

- **GIVEN** un cobro en estado `registrado` y su caja `abierta`
- **WHEN** se envía `POST /cobros/{id}/anular` con `motivo` no vacío
- **THEN** responde `200` con `estado = "anulado"`, `motivo_anulacion` y
  `anulado_en`; la fila sigue consultable por `GET /cobros/{id}`

#### Scenario: Anulación de cobro inexistente devuelve 404

- **WHEN** se envía `POST /cobros/{id}/anular` con un `id` inexistente
- **THEN** responde `404` y no se modifica ningún cobro

#### Scenario: Anulación de cobro ya anulado devuelve 409

- **GIVEN** un cobro en estado `anulado`
- **WHEN** se envía `POST /cobros/{id}/anular`
- **THEN** responde `409` con `detail.causa = "cobro_ya_anulado"` y el motivo
  original se conserva

#### Scenario: Anulación de cobro con caja cerrada devuelve 409

- **GIVEN** un cobro registrado en una caja que ya fue cerrada (arqueo
  registrado)
- **WHEN** se envía `POST /cobros/{id}/anular` con `motivo` no vacío
- **THEN** responde `409` con `detail.causa = "caja_cerrada"`, el cobro sigue en
  estado `registrado` y el arqueo de la caja queda intacto

#### Scenario: Anulación de cobro facturado devuelve 409

- **GIVEN** un cobro `registrado` en una caja `abierta` que ya tiene factura
  ARCA emitida
- **WHEN** se envía `POST /cobros/{id}/anular` con `motivo` no vacío
- **THEN** responde `409` con `detail.causa = "cobro_facturado"`, el cobro sigue
  `registrado` y la factura emitida se conserva

#### Scenario: Anulación de cobro de obra social anula la liquidación

- **GIVEN** un cobro `registrado` con `medio = "obra_social"` en una caja
  `abierta`, con su liquidación en estado `pendiente`
- **WHEN** se envía `POST /cobros/{id}/anular` con `motivo` no vacío
- **THEN** responde `200` con `estado = "anulado"` y la liquidación queda en
  estado `anulada`; `GET /liquidaciones-os` sigue listándola con ese estado

#### Scenario: Anulación sin motivo devuelve 422

- **WHEN** se envía `POST /cobros/{id}/anular` con `motivo` vacío o ausente
- **THEN** responde `422` y el cobro permanece `registrado`

### Requirement: Medios de pago y modo simulado

El sistema SHALL aceptar los medios `efectivo`, `tarjeta`, `transferencia`,
`mercado_pago` y `obra_social`, y marcar `simulado` por medio, al crear el cobro
y de forma inmutable: `true` solo con `mercado_pago`; el resto `false`.
`CobroOut` no expone `modo`. Con `obra_social`, `nomenclador_codigo` es
obligatorio y `0 <= cobertura <= monto`; los campos OS con otro medio son 422 de
Pydantic (no `{"causa": ...}`).

#### Scenario: Cobro en efectivo registra el medio

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con `medio = "efectivo"`
- **THEN** responde `201` con `medio = "efectivo"` y `simulado = false`

#### Scenario: Cobro con tarjeta no se marca simulado

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con `medio = "tarjeta"`
- **THEN** responde `201` con `simulado = false` y `referencia_externa = null`

#### Scenario: Cobro con Mercado Pago se marca simulado

- **GIVEN** una caja abierta y `MP_ACCESS_TOKEN` ausente o presente en el
  entorno (el comportamiento es el mismo)
- **WHEN** se envía `POST /cobros` con `medio = "mercado_pago"`
- **THEN** responde `201` con `simulado = true` y `referencia_externa` con
  prefijo `SIM-MP-`

#### Scenario: Cobro con medio obra social genera liquidación

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con `medio = "obra_social"` y los datos OS
- **THEN** responde `201` con `simulado = false` y se crea una `LiquidacionOS`
  asociada al cobro

#### Scenario: Cobro obra social sin nomenclador devuelve 422

- **WHEN** se envía `POST /cobros` con `medio = "obra_social"` sin
  `nomenclador_codigo`
- **THEN** responde `422` y no se crea el cobro ni la liquidación

#### Scenario: Campos OS con medio distinto de obra social devuelven 422

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con `medio = "efectivo"` y
  `cobertura_centavos` informado
- **THEN** responde `422` con un `detail` de errores de validación de Pydantic
  cuyo mensaje menciona `campos_os_no_aplicables`, y no se crea ni el cobro ni
  la liquidación

### Requirement: Factura ARCA desde un cobro

El sistema SHALL emitir una factura ARCA (tipo B o C) de un cobro registrado,
devolviendo CAE y QR. En C-10 la emisión es siempre simulada y se marca en la
respuesta de la factura: `simulado = true` y `modo = "simulado"`, CAE con prefijo
`SIM-`; no modifica el `simulado` del cobro. No se factura un cobro anulado, ni
uno de obra social, ni dos veces el mismo cobro (409 en los tres casos).

#### Scenario: Factura tipo B simulada sin credenciales

- **GIVEN** un cobro registrado y credenciales ARCA ausentes
- **WHEN** se envía `POST /cobros/{id}/factura-arca` con `tipo = "B"`
- **THEN** responde `201` con `cae` con prefijo `SIM-`, `qr` no vacío,
  `simulado = true` y `modo = "simulado"`

#### Scenario: Factura no muta el flag simulado del cobro

- **GIVEN** un cobro en efectivo con `simulado = false`
- **WHEN** se emite la factura ARCA de ese cobro
- **THEN** la respuesta de la factura trae `simulado = true` y
  `modo = "simulado"`, y al consultar `GET /cobros/{id}` el cobro sigue con
  `simulado = false`

#### Scenario: Segunda emisión de factura devuelve 409

- **GIVEN** un cobro que ya tiene factura emitida
- **WHEN** se envía `POST /cobros/{id}/factura-arca` nuevamente
- **THEN** responde `409` con `detail.causa = "cobro_ya_facturado"` y la
  factura original se conserva

#### Scenario: Factura sobre cobro inexistente devuelve 404

- **WHEN** se envía `POST /cobros/{id}/factura-arca` con un `id` inexistente
- **THEN** responde `404` y no se crea ninguna factura

#### Scenario: Factura sobre cobro anulado devuelve 409

- **GIVEN** un cobro en estado `anulado`
- **WHEN** se envía `POST /cobros/{id}/factura-arca`
- **THEN** responde `409` con `detail.causa = "cobro_anulado"` y no se emite
  factura

#### Scenario: Factura sobre cobro de obra social devuelve 409

- **GIVEN** un cobro registrado con `medio = "obra_social"`
- **WHEN** se envía `POST /cobros/{id}/factura-arca` con `tipo = "B"`
- **THEN** responde `409` con `detail.causa = "medio_no_facturable"` y no se
  emite factura

#### Scenario: Tipo de factura inválido devuelve 422

- **WHEN** se envía `POST /cobros/{id}/factura-arca` con `tipo = "A"`
- **THEN** responde `422` y no se emite factura

### Requirement: Liquidación de obra social con nomenclador y cobertura

El sistema SHALL crear una liquidación de obra social al registrar un cobro
`obra_social`, con `monto_total_centavos = monto_centavos`, `cobertura_centavos`
opcional (default `0`), `copago_centavos = total − cobertura` y
`estado = "pendiente"`, con `0 <= cobertura <= total` y montos acotados a
`MONTO_MAX_CENTAVOS`. La base garantiza la coherencia de los tres montos por
CHECK. No existe endpoint de alta: los datos OS llegan en `POST /cobros`.

#### Scenario: Liquidación válida calcula copago

- **GIVEN** un cobro de obra social con `monto_centavos` (total de la
  prestación), `cobertura_centavos` y `nomenclador_codigo`
- **WHEN** se envía `POST /cobros` con ese medio y esos datos
- **THEN** responde `201`, y la liquidación asociada (consultable por
  `GET /liquidaciones-os`) tiene `copago_centavos = monto_total_centavos −
  cobertura_centavos` y `estado = "pendiente"`

#### Scenario: Cobertura mayor al total devuelve 422

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con `medio = "obra_social"` y
  `cobertura_centavos > monto_centavos`
- **THEN** responde `422` y no se crea ni el cobro ni la liquidación

#### Scenario: Nomenclador ausente devuelve 422

- **GIVEN** una caja abierta
- **WHEN** se envía `POST /cobros` con `medio = "obra_social"` sin
  `nomenclador_codigo`
- **THEN** responde `422` y no se crea ni el cobro ni la liquidación:
  `GET /liquidaciones-os` sigue devolviendo `[]`

#### Scenario: Cobertura ausente queda en cero

- **GIVEN** un cobro de obra social sin cobertura informada
- **WHEN** se consulta la liquidación creada por ese cobro
- **THEN** responde con `cobertura_centavos = 0` y
  `copago_centavos = monto_total_centavos`

#### Scenario: Copago informado no genera un cobro aparte

- **GIVEN** un cobro de obra social con `monto_centavos = 10000` y
  `cobertura_centavos = 7000`
- **WHEN** se consulta la caja del día y `GET /liquidaciones-os`
- **THEN** la liquidación tiene `copago_centavos = 3000` y
  `totales_por_medio_centavos` refleja solo el cobro de `obra_social` por
  `10000`: el copago no crea un cobro ni suma al arqueo (`Q-C10-14`)

### Requirement: Listado de liquidaciones de obra social

El sistema SHALL exponer el listado de liquidaciones ordenado por fecha de
creación descendente, incluyendo la referencia al PDF y el estado de cada
liquidación (incluidas las `anulada`). Un listado sin liquidaciones es una lista
vacía.

#### Scenario: Listado devuelve liquidaciones ordenadas

- **GIVEN** dos liquidaciones creadas en instantes distintos (en ese orden)
- **WHEN** se consulta `GET /liquidaciones-os`
- **THEN** responde `200` con las dos liquidaciones ordenadas por `creado_en`
  descendente, cada una con `id`, `nomenclador_codigo`, montos,
  `estado` y `pdf_referencia`

#### Scenario: Listado vacío devuelve lista vacía

- **GIVEN** que no existen liquidaciones
- **WHEN** se consulta `GET /liquidaciones-os`
- **THEN** responde `200` con `[]`

#### Scenario: Liquidación incluye referencia a PDF

- **GIVEN** una liquidación creada
- **WHEN** se consulta `GET /liquidaciones-os`
- **THEN** cada item incluye `pdf_referencia` no nulo con prefijo `SIM-` en
  modo simulado

#### Scenario: Listado incluye la liquidación anulada con su estado

- **GIVEN** un cobro de obra social anulado
- **WHEN** se consulta `GET /liquidaciones-os`
- **THEN** responde `200` e incluye la liquidación de ese cobro con
  `estado = "anulada"`

### Requirement: Credenciales no requeridas, no leídas y no expuestas

El sistema SHALL funcionar igual con o sin credenciales de Mercado Pago y ARCA
en el entorno, y NUNCA SHALL exponerlas en respuestas ni en logs. En C-10 ningún
módulo de producción lee esas variables; si en el futuro hiciera falta conocer su
presencia, se hará con una función que devuelve solo un booleano. `mercado_pago`
devuelve `simulado = true` y la factura `simulado = true` y `modo = "simulado"`.
Los tests no realizan llamadas de red.

#### Scenario: Variables ausentes activan modo simulado

- **GIVEN** el entorno sin `MP_ACCESS_TOKEN` ni credenciales ARCA
- **WHEN** se registra un cobro de MP y se emite una factura ARCA
- **THEN** el cobro devuelve `simulado = true` y la factura devuelve
  `simulado = true` y `modo = "simulado"`

#### Scenario: Variables presentes no exponen valores

- **GIVEN** credenciales configuradas en el entorno del test
- **WHEN** se consulta cualquier respuesta de cobro o factura
- **THEN** la respuesta no contiene los valores de las credenciales ni
  substrings de ellas, y la factura sigue devolviendo `modo = "simulado"`

  (Nota: test de **regresión**; el código de producción no lee el entorno, D9.)

#### Scenario: Tests no realizan llamadas de red

- **GIVEN** la fixture de los tests de caja, que reemplaza
  `urllib.request.urlopen`, `httpx.HTTPTransport.handle_request`,
  `httpx.AsyncHTTPTransport.handle_async_request` y, si el paquete `requests`
  está instalado, `requests.sessions.Session.send`, por funciones que fallan el
  test si se las llama (se parchea a nivel de transporte porque `TestClient`
  hereda de `httpx.Client`; no se parchea `socket`: Postgres lo usa)
- **WHEN** se corre la suite de caja/pagos
- **THEN** ningún test realiza una llamada saliente y `backend/app/caja` no
  importa `httpx`, `requests` ni `urllib.request`

### Requirement: Sin eliminación física de caja, cobros ni liquidaciones

El sistema SHALL no exponer operaciones de borrado de caja, cobros ni
liquidaciones. Los cierres y las anulaciones son cambios de estado.

#### Scenario: No existe endpoint de borrado de cobro

- **GIVEN** un cobro existente
- **WHEN** se solicita `DELETE /cobros/{id}`
- **THEN** la API no expone esa operación (`405`) y el cobro sigue consultable

#### Scenario: Caja cerrada conserva su arqueo

- **GIVEN** una caja cerrada con arqueo registrado
- **WHEN** se consulta `GET /caja/{id}`
- **THEN** responde `200` con `estado = "cerrada"` y los montos de arqueo
  originales intactos

#### Scenario: Anulación conserva la fila del cobro

- **GIVEN** un cobro anulado
- **WHEN** se consulta `GET /cobros/{id}`
- **THEN** responde `200` con `estado = "anulado"` y todos los campos
  originales (incluido `monto_centavos`) intactos

### Requirement: Consulta de caja y cobros

El sistema SHALL exponer la consulta de una caja por id, de un cobro por id y
de la caja de un día por fecha (default: fecha local del reloj inyectable). Una
caja es un recurso único por fecha; si no existe caja para esa fecha se devuelve
`404` (no lista vacía).

#### Scenario: Caja por id inexistente devuelve 404

- **WHEN** se consulta `GET /caja/{id}` con un `id` inexistente
- **THEN** responde `404` con `detail = "caja no existe: <id>"`

#### Scenario: Cobro por id inexistente devuelve 404

- **WHEN** se consulta `GET /cobros/{id}` con un `id` inexistente
- **THEN** responde `404` con `detail = "cobro no existe: <id>"`

#### Scenario: Consulta de caja por fecha con caja existente

- **GIVEN** una caja para la fecha consultada
- **WHEN** se consulta `GET /caja?fecha=YYYY-MM-DD`
- **THEN** responde `200` con la caja de ese día

#### Scenario: Consulta de caja por fecha sin caja devuelve 404

- **GIVEN** que no existe caja para la fecha consultada
- **WHEN** se consulta `GET /caja?fecha=YYYY-MM-DD`
- **THEN** responde `404` con `detail = "caja no existe para la fecha"`

#### Scenario: Consulta de caja sin fecha a las 23:30 usa la fecha local

- **GIVEN** que el reloj inyectado indica las 23:30 en
  `America/Argentina/Buenos_Aires` y existe una caja con la fecha local de ese
  instante
- **WHEN** se consulta `GET /caja` sin `fecha`
- **THEN** responde `200` con la caja de la fecha local, no con la de la fecha
  UTC

### Requirement: Autorización por rol de las operaciones de caja

Las 9 operaciones de caja SHALL exigir un rol válido antes de ejecutar su lógica de negocio, mediante una capability de `PERMISOS_POR_ROL` evaluada como `Depends(...)`. `admin` SHALL poder ejecutar todas. `recepcion` SHALL poder ejecutar todas. `odontologo` SHALL poder ejecutar solo las consultas de lectura. `paciente` SHALL ser rechazado en todas. Un rol válido sin permiso SHALL recibir HTTP 403 con `detail.causa = "permiso_denegado"`.

#### Scenario: Apertura de caja respeta la matriz de roles

- **GIVEN** contextos de rol `admin`, `recepcion`, `odontologo` y `paciente`
- **WHEN** cada uno envía `POST /caja/abrir` con un payload válido sobre una base sin caja del día
- **THEN** `admin` y `recepcion` obtienen HTTP 201, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Cierre de caja respeta la matriz de roles

- **GIVEN** una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /caja/cerrar` con un payload válido
- **THEN** `admin` y `recepcion` obtienen HTTP 200, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Consulta de caja por identificador respeta la matriz de roles

- **GIVEN** una caja existente y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /caja/{id}`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

#### Scenario: Consulta de caja por fecha respeta la matriz de roles

- **GIVEN** una caja existente para la fecha local y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /caja`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

#### Scenario: Registro de cobro respeta la matriz de roles

- **GIVEN** una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /cobros` con un payload válido
- **THEN** `admin` y `recepcion` obtienen HTTP 201, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Consulta de cobro respeta la matriz de roles

- **GIVEN** un cobro existente y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /cobros/{id}`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

#### Scenario: Anulación de cobro respeta la matriz de roles

- **GIVEN** un cobro registrado en una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /cobros/{id}/anular` con un motivo válido
- **THEN** `admin` y `recepcion` obtienen HTTP 200, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Facturación ARCA respeta la matriz de roles

- **GIVEN** un cobro facturable en una caja abierta y contextos de los cuatro roles
- **WHEN** cada uno envía `POST /cobros/{id}/factura-arca` con un tipo válido
- **THEN** `admin` y `recepcion` obtienen HTTP 201, y `odontologo` y `paciente` obtienen HTTP 403

#### Scenario: Listado de liquidaciones OS respeta la matriz de roles

- **GIVEN** al menos una liquidación de obra social y contextos de los cuatro roles
- **WHEN** cada uno envía `GET /liquidaciones-os`
- **THEN** `admin`, `recepcion` y `odontologo` obtienen HTTP 200, y `paciente` obtiene HTTP 403

### Requirement: Denegación de caja sin efectos laterales ni 401

Una denegación por rol SHALL responder HTTP 403 con `detail = {"causa": "permiso_denegado", "detalle": "..."}`, SHALL ocurrir antes de cualquier escritura y no SHALL responder HTTP 401 ni HTTP 500. El sistema no SHALL emitir el código 401 mientras no exista autenticación real.

#### Scenario: Escritura denegada no crea filas

- **GIVEN** un contexto `paciente` y una base sin caja del día
- **WHEN** se envía `POST /caja/abrir` y luego `POST /cobros` con payloads válidos
- **THEN** ambas respuestas son HTTP 403 y no se crea ninguna caja ni ningún cobro

#### Scenario: La denegación no se confunde con falta de autenticación

- **GIVEN** un contexto `odontologo` sobre `POST /cobros`
- **WHEN** se envía un payload válido
- **THEN** la respuesta es HTTP 403 con `detail.causa = "permiso_denegado"` y no HTTP 401

### Requirement: Compatibilidad del rol por defecto en caja

Mientras no exista login real, un request de caja sin header `X-Actor-Rol` SHALL resolverse como `recepcion` y SHALL conservar exactamente el comportamiento previo de los 9 endpoints, incluidos sus códigos de negocio 200, 201, 404, 409 y 422.

#### Scenario: Los clientes existentes de caja siguen funcionando sin identidad

- **GIVEN** un request sin header de identidad
- **WHEN** se envía `POST /caja/abrir` con un payload válido
- **THEN** la respuesta es HTTP 201, idéntica a la de C-10

#### Scenario: El default conserva los errores de negocio

- **GIVEN** un request sin header de identidad y una caja ya abierta
- **WHEN** se envía `POST /caja/abrir` nuevamente
- **THEN** la respuesta es HTTP 409 con `detail.causa = "caja_ya_abierta"` y no HTTP 403

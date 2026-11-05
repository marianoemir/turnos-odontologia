# Proposal

## Why

El repo cubre agenda (`turnos`, `agenda`), catálogo (`catalogo-recursos`), lista de
espera (`lista-espera`) e historia clínica (`hc-odontograma`), pero **no existe
ningún lugar para registrar cobros, caja diaria, liquidaciones de obras sociales ni
facturación ARCA**. Eso bloquea dos cosas concretas: C-20 (`frontend-caja-pagos`,
que necesita contratos reales que tipar) y C-11 (`roles-multisucursal-exportacion`,
cuyo `GET /export` debe incluir caja).

La KB no aporta reglas de caja/cobros/OS/ARCA: `knowledge-base/01_vision_y_objetivos.md`
§Alcance v1 los lista como parte del MVP ("Caja diaria + Mercado Pago (QR/link) +
deudores + reportes básicos", "OS argentinas: nomenclador, cobertura/copago,
liquidación con PDF", "Factura ARCA B/C con CAE+QR desde el cobro"), y
`knowledge-base/02_descripcion_general.md` §Integraciones externas los marca como
"Change posterior". `knowledge-base/05_reglas_de_negocio.md` §Dominio:
Excepciones globales no contiene ninguna regla `RN-CA-*`, `RN-CO-*`, `RN-OS-*` ni
`RN-AR-*`. Por eso este change **autora escenarios de aceptación propios** a
partir del bullet de C-10 en `CHANGES.md`, y trata todo invariante de caja/pagos
como **decisión de diseño explícita**, no como regla derivada de la KB; lo
indeciso queda como pregunta abierta con ID `Q-C10-NN`.

**Posición en el roadmap** (`CHANGES.md` §Árbol de dependencias y §Paralelismo):
C-10 vive en **FASE 3 "Clínico, cobros y cierre (posterior al TP)"**, depende
solo de **C-03** y corre en paralelo a C-04/C-05 (GATE 4). **Está fuera del
recorte del TP** (`C-01 → C-02 → C-03 → C-12 → C-13 → C-14 → C-15 → C-16`),
lo que afecta prioridad, no corrección. Governance **CRITICO**.

## What Changes

- Nuevo módulo de backend `backend/app/caja/` con modelos `Caja`, `Cobro` y
  `LiquidacionOS`.
- **Caja diaria**: `POST /caja/abrir` (apertura con monto inicial; **no** acepta
  `fecha`, siempre es la fecha local del reloj) y `POST /caja/cerrar` (cierre con
  arqueo: esperado vs contado y diferencia). Una caja abierta por día; doble
  apertura o cierre sin apertura son conflicto de negocio (409). La fecha local
  sale de un **reloj inyectable** (`ahora_local()`), para que el borde de las
  23:30 sea determinista y testeable, también al registrar un cobro sin
  `caja_id` y al consultar la caja del día.
- **Cobros**: `POST /cobros` con `turno_id` opcional, `medio`
  (efectivo/tarjeta/transferencia/mercado_pago/obra_social), `monto_centavos`
  (acotado a `MONTO_MAX_CENTAVOS` para que un monto absurdo sea 422, no 500),
  `concepto` (sena/saldo/total, default `total`) y datos específicos del medio.
  `POST /cobros/{id}/anular` con motivo obligatorio: anulación trazable, sin
  hard delete. No se anula un cobro cuya caja ya se cerró (409 `caja_cerrada`,
  porque el arqueo del cierre es un snapshot inmutable) ni un cobro que ya tiene
  factura ARCA emitida (409 `cobro_facturado`).
- **Seña vinculada a reserva**: `Cobro` tiene `turno_id` FK opcional y un campo
  `concepto`; la seña se registra contra un turno cuando existe, o como cobro
  independiente cuando no (C-08 reserva online es posterior y C-10 no depende de
  él; ver `Q-C10-04`).
- **Factura ARCA**: `POST /cobros/{id}/factura-arca` con tipo (B/C), devuelve CAE
  y QR. En C-10 la emisión es **siempre simulada** y se marca **en la respuesta
  de la factura** (`simulado=true`, `modo="simulado"`, CAE con prefijo `SIM-`);
  la emisión no cambia el flag `simulado` del cobro (integración real queda para
  un change posterior; ver `Q-C10-11`). Un cobro de obra social no se factura
  (409 `medio_no_facturable`; ver `Q-C10-13`).
- **Mercado Pago**: el cobro con medio `mercado_pago` registra la referencia de
  pago y es el **único** medio que marca `simulado=true` (con prefijo
  `SIM-MP-`); efectivo, tarjeta, transferencia y obra social quedan con
  `simulado=false`.
- **Obras sociales**: el cobro con medio `obra_social` exige
  `nomenclador_codigo`, acepta `cobertura_centavos` opcional (validada en el
  schema: `0 <= cobertura <= monto`) y genera una `LiquidacionOS` con monto
  total, cobertura y copago calculado. Enviar campos OS con otro medio es 422
  (lista de errores de Pydantic que menciona `campos_os_no_aplicables`). Anular
  el cobro OS anula su liquidación en la misma transacción (`estado =
  "anulada"`). El **copago** del paciente no se modela: no genera un cobro ni
  suma al arqueo (`Q-C10-14`).
- **Liquidaciones OS**: `GET /liquidaciones-os` (listado por fecha, con estado,
  incluidas las anuladas).
- **Migración Alembic `005_caja_pagos`**, encadenada sobre `004_hc_odontograma`.
- Tests pytest de integración (Postgres real): apertura/cierre/arqueo (incluido
  que un cobro anulado no suma), cobro por medio, seña, factura simulada,
  liquidación, anulación trazable (incluidas las rechazadas sobre caja cerrada y
  sobre cobro facturado, y la que anula la liquidación OS), guardas de
  validación por schema y un test de concurrencia con dos sesiones. Ningún test
  hace llamadas de red (fixture que falla si se llama a `urllib`, `httpx` a nivel
  de transporte o `requests`).

**No incluye** (ver `design.md` §Non-Goals): roles/auth y exportación (C-11);
frontend (C-20); nomenclador canónico de OS (fuente externa, `Q-C10-03`);
generación real de PDF (se registra referencia, `Q-C10-06`); integración real con
ARCA/MP (sin credenciales en repo, siempre simulado, `Q-C10-11`); circuito de
corrección de cobros con caja ya cerrada (`Q-C10-12`); facturación de cobros de
obra social (`Q-C10-13`); cobro o arqueo del copago del paciente (`Q-C10-14`);
cierre automático de cajas de días anteriores (`Q-C10-15`).

## Capabilities

### New Capabilities

- `caja-pagos`: caja diaria (apertura/cierre con arqueo), cobros por medio con
  anulación trazable, seña vinculada a turno de forma opcional, factura ARCA B/C
  con CAE+QR en modo simulado, y liquidación de obras sociales con
  nomenclador, cobertura/copago y referencia a PDF.

### Modified Capabilities

- (ninguna) No se modifican requisitos de `agenda`, `catalogo-recursos`,
  `foundation`, `hc-odontograma`, `lista-espera` ni `turnos`; C-10 solo consume
  sus tablas (en particular `turnos.id` como FK opcional de `Cobro`).

## Impact

- **Código**: nuevo `backend/app/caja/{reloj,models,schemas,service,router}.py`,
  router registrado en `backend/app/main.py`, import de modelos en
  `backend/alembic/env.py`, nueva migración `005_caja_pagos.py`.
- **Base de datos**: 3 tablas nuevas (`caja`, `cobro`, `liquidacion_os`). Sin
  cambios en tablas existentes.
- **API**: **endpoints nuevos** bajo `/caja`, `/cobros`, `/liquidaciones-os`
  (ver `design.md` §API). Errores 404/409/422 según el mapeo del resto de la
  API.
- **Tests**: nuevos `test_caja_modelo.py`, `test_caja_schemas.py`,
  `test_caja_servicio.py`, `test_caja_api.py` y `test_caja_concurrencia.py`;
  `backend/tests/conftest.py` debe truncar las tablas nuevas.
- **Dependencias**: C-03 archivado (`turnos` para la FK opcional). Postgres real
  para los tests de integración. Sin dependencia de C-04/C-05/C-09.
- **Entorno**: no se lee ninguna credencial en C-10 (`MP_ACCESS_TOKEN`, `ARCA_*`
  no se consultan desde código de producción: la operación es siempre simulada y
  el comportamiento no depende de que estén o falten). Nunca credenciales en
  repo ni en artefactos. Si en el futuro hiciera falta saber si están presentes,
  se hará con una función que devuelve solo un booleano, nunca los valores.
- **Gobernanza CRITICO**: el modelo de pagos, la migración 005 y los invariantes
  de anulación trazable y de marcado de simulación (cobro por medio, factura por
  emisión) requieren revisión humana antes de implementar.
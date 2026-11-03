# Design

## Context

Ver `proposal.md` §Why para la motivación. Estado actual del repo que condiciona
el diseño:

- **Migraciones**: `backend/alembic/versions/` tiene `001_catalogo`
  (`down_revision = None`), `002_turno` (`001_catalogo`) y `003_lista_espera`
  (`002_turno`). **Head actual: `003_lista_espera`.**
- **Patrones del repo**: módulo por capability en `backend/app/<capability>/`
  con `models.py`, `schemas.py`, `service.py`, `router.py`; `Base` declarativa en
  `backend/app/db.py`; servicio sin estado con `@staticmethod` que recibe
  `session` primero, valida antes de `session.add` y hace `session.flush()`
  (nunca `commit()`, que es responsabilidad del router); `session.query(...)`.
- **Estados**: columna `Text` + `CheckConstraint` nombrado y tupla de estados a
  nivel de módulo (`lista_espera/models.py: ESTADOS_LISTA`). No se usa
  `sa.Enum`.
- **Tests**: pytest de integración contra PostgreSQL real, `db_session` con
  rollback transaccional y `TRUNCATE` de una lista fija de tablas en
  `backend/tests/conftest.py` (`_CATALOGO_TABLES`); seed idempotente
  `seed_catalogo(db_session)`.

**La KB no aporta comportamiento clínico.** Esto es explícito y condiciona todo
el documento:

- `knowledge-base/04_modelo_de_datos.md` §Dominios clasifica **"HC/odontograma"**
  como **"Posterior (solo referencia)"** (junto con lista de espera,
  recordatorios, caja/pagos/OS/ARCA y multi-sucursal). La KB no describe
  entidades, atributos ni constraints clínicos.
- `knowledge-base/06_funcionalidades.md` menciona **US-007** en **una sola
  línea, sin criterios de aceptación**: "HC mínima + odontograma, caja + MP, OS +
  ARCA, roles + multi-sucursal básico, exportación 1 clic (D3)".
- `knowledge-base/05_reglas_de_negocio.md` contiene **solo** RN-AG-01..05,
  RN-TU-01/02 y RN-ES-01/02. **No existe ninguna regla `RN-HC-*`, `RN-OD-*`,
  `RN-PL-*` ni `RN-OS-*`.**

En consecuencia: **los escenarios de aceptación de este change los autor C-09**,
a partir del bullet de C-09 en `CHANGES.md`, y **no se derivan de una user story
con criterios**. Todo invariante clínico se registra abajo como decisión de
diseño explícita con su justificación, nunca como regla de la KB. Los escenarios
de `specs/hc-odontograma/spec.md` son por eso un contrato nuevo, no una
transcripción.

Nota sobre `CHANGES.md`: el bullet de C-09 dice "Migración 003" y "18 estados
DentalSoft". Ambos datos están **desactualizados o no enumerados**; ver
§Migración 004 y `Q-C09-01`. El "Leer antes" de C-09 apunta a
`knowledge-base/10_preguntas_abiertas.md` §Q7, que **no trata sobre HC**: Q7
lista afirmaciones del informe marcadas "No evidenciado" (solapamientos en
competidores, costo WhatsApp, validación OS real-time, alcance de las leyes
26.529/25.326/27.706, exportación). Es una **referencia desalineada del
roadmap**; no se deriva de ella ninguna obligación clínica ni legal.

## Goals / Non-Goals

**Goals:**

- Un modelo clínico mínimo y auditable: HC única por paciente, entradas
  append-only con profesional+fecha, odontograma como historial por pieza,
  planes con items y total calculado.
- Contratos HTTP estables que C-19 (frontend) y C-11 (exportación) puedan
  consumir sin cambios.
- Una migración encadenada correctamente sobre el head real (`003_lista_espera`).
- Tests de integración que cubran camino esperado, conflicto de negocio (409) y
  bordes.

**Non-Goals (del diseño, además del alcance del proposal):**

- Nada de liquidación de OS, nomenclador, porcentajes ni copagos: es C-10.
  C-09 **no** modela `obra_social`, `nomenclador` ni `LiquidacionOS`.
- Nada de roles, permisos ni auth: C-11. C-09 sigue el patrón actual sin auth.
- Nada de PDF, ARCA/CAE, Mercado Pago ni firma digital.
- Nada de adjuntos/archivos, imágenes, PACS ni CDSS.
- Ninguna validación de semántica clínica (qué estados existen, qué transiciones
  son válidas, qué tratamiento corresponde a qué pieza).

## Modelo de datos

Cinco tablas nuevas, todas con PK `Uuid` y `default=uuid.uuid4` (sin server
default), FKs `<entidad>_id`, y timestamps `timestamptz`.

### `historia_clinica`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK, `default=uuid.uuid4` |
| `paciente_id` | uuid | NOT NULL, FK → `pacientes.id` `ondelete=RESTRICT`, **UNIQUE** |
| `antecedentes` | text | NULL |
| `alergias` | text | NULL |
| `observaciones` | text | NULL |
| `creado_en` | timestamptz | NOT NULL, `server_default=text("now()")` |

La unicidad de `paciente_id` produce `uq_historia_clinica_paciente_id` por la
convención de nombres de `db.py`; es el invariante "una HC por paciente" que
`CHANGES.md` pide y el que sostiene el 409 del spec.

### `entrada_hc`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `historia_clinica_id` | uuid | NOT NULL, FK → `historia_clinica.id` `ondelete=RESTRICT` |
| `profesional_id` | uuid | NOT NULL, FK → `profesionales.id` `ondelete=RESTRICT` |
| `fecha` | timestamptz | NOT NULL (dato clínico, informado por el cliente) |
| `texto` | text | NOT NULL |
| `creado_en` | timestamptz | NOT NULL, `server_default=text("now()")` (auditoría de inserción) |

Índice `ix_entrada_hc_historia_fecha` sobre `(historia_clinica_id, fecha)` para
el listado ordenado.

### `odontograma`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `paciente_id` | uuid | NOT NULL, FK → `pacientes.id` `ondelete=RESTRICT` |
| `pieza` | text | NOT NULL, `CheckConstraint("pieza ~ '^[1-4][1-8]$'", name="pieza_fdi_valida")` |
| `estado` | text | NOT NULL, **sin CHECK ni catálogo** (`Q-C09-01`) |
| `profesional_id` | uuid | NOT NULL, FK → `profesionales.id` `ondelete=RESTRICT` |
| `fecha` | timestamptz | NOT NULL |
| `creado_en` | timestamptz | NOT NULL, `server_default=text("now()")` |

Índice `ix_odontograma_paciente_pieza_fecha` sobre `(paciente_id, pieza, fecha)`.
Sin `UNIQUE (paciente_id, pieza)`: cada observación es una fila más.

### `plan_tratamiento`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `paciente_id` | uuid | NOT NULL, FK → `pacientes.id` `ondelete=RESTRICT` |
| `profesional_id` | uuid | NOT NULL, FK → `profesionales.id` `ondelete=RESTRICT` |
| `estado` | text | NOT NULL, `default="borrador"`, `server_default='borrador'`, CHECK `estado IN ('borrador','propuesto','aceptado','rechazado','cerrado')` (`estado_plan_valido`) |
| `creado_en` | timestamptz | NOT NULL, `server_default=text("now()")` |

Índice `ix_plan_tratamiento_paciente` sobre `(paciente_id)`.
**No hay columna `presupuesto`**: el total se calcula.

### `plan_item`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `plan_id` | uuid | NOT NULL, FK → `plan_tratamiento.id` `ondelete=CASCADE` |
| `pieza` | text | NOT NULL, CHECK FDI `pieza_fdi_valida` |
| `prestacion_id` | uuid | NOT NULL, FK → `prestaciones.id` `ondelete=RESTRICT` |
| `estado` | text | NOT NULL, `default="pendiente"`, CHECK `estado IN ('pendiente','realizado','cancelado')` (`estado_item_valido`) |
| `monto_centavos` | integer | NOT NULL, `CheckConstraint("monto_centavos >= 0", name="monto_no_negativo")` |
| `monto_cobertura_centavos` | integer | NULL, CHECK `monto_cobertura_centavos IS NULL OR monto_cobertura_centavos >= 0` (`cobertura_no_negativa`) |

Índice `ix_plan_item_plan` sobre `(plan_id)`.

## Decisiones de diseño (no son reglas de la KB)

Ninguna de estas decisiones se apoya en una regla de negocio existente; se
toman para que el change sea implementable y coherente con el repo. Cambiarlas
implica revisar este documento y, en los casos marcados, una migración.

| # | Decisión | Alternativa rechazada | Justificación |
|---|---|---|---|
| **D3** | `historia_clinica` con **una fila por paciente** (`paciente_id` UNIQUE) + `entrada_hc` con N filas append-only (`profesional_id`, `fecha`, `texto`) | Una sola tabla con todo el texto clínico en un campo; o una fila por consulta sin cabecera | "paciente_id único" está textual en `CHANGES.md`. La cabecera separada evita repetir antecedentes/alergias en cada entrada. Las entradas append-only dan la trazabilidad profesional+fecha que exige la línea de tests de C-09 y reflejan el principio del proyecto de no borrar (`08_arquitectura_propuesta.md` §Patrones aplicados "Soft-cancel (sin hard delete)"). |
| **D3b** | Sin adjuntos ni archivos en la HC | Tabla `adjunto_hc` con blob/ruta | Sin respaldo en la KB, superficie de seguridad extra (malware, PII en binarios), fuera del bullet de C-09. Si se necesita, es un change propio. |
| **D1** | `odontograma` **append-only por observación**: cada estado es una fila con `pieza`, `estado`, `profesional_id`, `fecha` | Estado "actual" por pieza con `UPDATE` (una fila por pieza) | C-09 pide "historial por pieza con profesional+fecha". Con `UPDATE` se pierde el historial. Append-only además elimina la pregunta de concurrencia sobre qué estado "gana". |
| **D1b** | `estado` es **texto libre sin CHECK ni enum** | CHECK con los "18 estados DentalSoft", o enum | `CHANGES.md` los menciona "como referencia" pero **no los enumera** en el repo ni en la KB. Inventarlos sería fabricar nomenclatura clínica. Ver `Q-C09-01`: agregar el catálogo después requiere migración con CHECK. |
| **D1c** | Validar **solo el formato FDI** `[1-4][1-8]` con CHECK en base y en Pydantic | Sin validación de `pieza`; o validar contra un catálogo de piezas | `CHANGES.md` dice explícitamente "pieza FDI". El rango es estructural (cuadrante + posición), no semántica clínica: no afirma qué pieza existe en un paciente. Se valida en ambos lados para que un dato inválido no entre ni por la API ni por SQL directo. Ver `Q-C09-02`. |
| **D1d** | Sin `cara` ni `observacion` en `odontograma` | Agregar cara (mesial/oclusal/...) y nota libre | `CHANGES.md` lista solo pieza, estado, profesional y fecha. Sin requisito explícito, agregar caras obliga a inventar una nomenclatura anatómica. Ver `Q-C09-06`. |
| **D2** | `plan_tratamiento` + `plan_item` separados | Un plan con un JSON/array de items | Items en tabla propia: FK a `prestaciones`, CHECKs de monto, índices y consultas por pieza/prestación. Un JSON impediría la FK y la integridad referencial. |
| **D2b** | Total de presupuesto **calculado** (suma de `monto_centavos`), sin columna | Columna `presupuesto_centavos` en el plan, actualizada al agregar items | Línea de tests de C-09: "presupuesto suma piezas". Calculado = una sola fuente de verdad, imposible que el total derive de los items. Costo: una consulta de agregación por lectura. |
| **D2c** | `monto_cobertura_centavos` **nullable, informado por el cliente**, guardado y devuelto literal | Calcular la cobertura por porcentaje de OS; validar contra nomenclador; exigir el campo | No hay nomenclador ni tabla de obras sociales en la KB y C-10 es quien define `LiquidacionOS` (§Cobertura OS). El sistema **no** valida que la cobertura sea ≤ al monto: no hay regla que lo sostenga. |
| **D2d** | Dinero en **centavos enteros** (`Integer`), con CHECK `>= 0` | `Numeric(12,2)`; `Float` | Coherente con la convención de C-10 (`CHANGES.md` línea 358: "monto centavos"). `Float` introduce error de redondeo; `Numeric` obliga a conversión en cada capa para un dominio que es entero por definición. |
| **D2e** | `estado` de plan e item con CHECK sobre un **set provisorio**, declarado como tal | Sin CHECK (texto libre como `odontograma`); o set "definitivo" | A diferencia de `estado` de pieza, el ciclo de vida de un plan sí es comportamiento del sistema (define cuándo se puede editar). Un set acotado detecta errores temprano. Se documenta como provisorio (`Q-C09-04`) porque la KB no lo define; cambiarlo requiere migración. |
| **D2f** | Solo `borrador` y `propuesto` admiten agregar items; el resto responde 409 | Permitir items en cualquier estado | Un plan aceptado o cerrado con items mutables hace que el presupuesto aceptado cambie después de aceptarlo. La regla es de diseño, no de la KB; queda registrada en `Q-C09-04`. C-09 **no** expone endpoint de actualización ni de borrado de items: el `estado` del item se fija en el `POST` y no se puede cambiar después (ver `Q-C09-07`). |
| **D2g** | Sin matriz de transiciones de estado: `PATCH` acepta cualquier valor del set | Validar transiciones (p. ej. `aceptado` no vuelve a `borrador`) | Inventar una máquina de estados clínica excede el scope y la KB. Se valida pertenencia al set, no el camino. Anotado en `Q-C09-04`. |
| **FK-a** | `entrada_hc.historia_clinica_id` con `ondelete=RESTRICT` | `CASCADE` | Las entradas son registro clínico: el borrado en cascada las haría desaparecer en silencio si alguien elimina una HC por SQL. `RESTRICT` obliga a una decisión explícita. |
| **FK-b** | `plan_item.plan_id` con `ondelete=CASCADE` | `RESTRICT` | Los items están **poseídos** por el plan (no existen sin él). Es el único punto del modelo donde `CASCADE` es seguro y coherente; la API nunca borra planes, así que la cascada solo actúa ante borrado manual en base. |
| **FK-c** | Todas las FKs a `pacientes`, `profesionales`, `prestaciones` con `RESTRICT` | `SET NULL` | `SET NULL` dejaría registros clínicos sin paciente o sin prestación, lo que rompe la trazabilidad. Es el mismo criterio ya usado en `lista_espera`. |
| **AUDIT** | Solo `creado_en` con `server_default=text("now()")`; sin `actualizado_en` | Agregar `actualizado_en` a HC y plan | `lista_espera` es el único precedente del repo y solo tiene `creado_en`. No hay requisito de auditoría de ediciones; el `creado_en` cubre el "cuándo se registró". Si C-11 pide auditoría de cambios, se agrega entonces. |
| **MOD** | Módulo nuevo `backend/app/hc/` | Extender `agenda/` o crear tres módulos (`hc/`, `odontograma/`, `planes/`) | Las cinco tablas son un mismo dominio clínico con servicios que se referencian; un módulo por capability (patrón del repo) evita fragmentación. El router se registra en `main.py`. |
| **ERR** | 409 para conflicto de negocio, 422 para input inválido, 404 para recurso inexistente | 400 genérico, o 200 con `{"ok": false}` | Regla dura del proyecto (`AGENTS.md`): nunca 200/500 ante conflicto de negocio. 409 = el pedido es válido pero choca con el estado actual (HC duplicada, plan no editable). 422 = el pedido está mal formado (FDI, monto, estado). |

## API

| Método | Ruta | Éxito | Notas |
|---|---|---|---|
| POST | `/historias-clinicas` | 201 | `paciente_id` + cabecera opcional |
| GET | `/historias-clinicas/{id}` | 200 | 404 si no existe |
| GET | `/pacientes/{paciente_id}/historia-clinica` | 200 | 404 si el paciente no tiene HC |
| PATCH | `/historias-clinicas/{id}` | 200 | Parcial: solo campos presentes |
| POST | `/historias-clinicas/{id}/entradas` | 201 | `profesional_id`, `fecha`, `texto` |
| GET | `/historias-clinicas/{id}/entradas` | 200 | Orden `fecha` asc |
| POST | `/pacientes/{paciente_id}/odontograma` | 201 | `pieza`, `estado`, `profesional_id`, `fecha` |
| GET | `/pacientes/{paciente_id}/odontograma?pieza=` | 200 | Historial orden `fecha` asc; `[]` si no hay |
| POST | `/planes-tratamiento` | 201 | `paciente_id`, `profesional_id`, `estado` opcional |
| GET | `/planes-tratamiento/{id}` | 200 | Incluye `items`, `total_centavos`, `cobertura_centavos` |
| PATCH | `/planes-tratamiento/{id}` | 200 | Solo `estado` |
| POST | `/planes-tratamiento/{id}/items` | 201 | Item con montos |
| GET | `/pacientes/{paciente_id}/planes-tratamiento` | 200 | Planes del paciente con `items`, `total_centavos` y `cobertura_centavos`; orden `creado_en` **asc**; `[]` si no tiene planes |

**13 endpoints.** El listado por paciente reutiliza **el mismo cálculo** que
`GET /planes-tratamiento/{id}` (mismos campos `items`, `total_centavos` y
`cobertura_centavos`, misma suma de `monto_centavos` y de
`monto_cobertura_centavos` ignorando nulos): es un único helper en
`ServicioHC` para que el detalle y el listado no deriven con el tiempo.

Semántica del listado (decisión de diseño menor, no regla de la KB):
paciente sin planes → `200` con `[]`; `paciente_id` inexistente → `404`. La
distinción es deliberada: `[]` describe "el paciente existe y no tiene planes",
el `404` describe "ese paciente no existe".

### Mapeo de errores

| Situación | Código | `detail` |
|---|---|---|
| `paciente_id` inexistente en HC, odontograma, plan o listado de planes del paciente | 404 | `paciente no existe: <id>` |
| `profesional_id` inexistente en entrada, odontograma o plan | 404 | `profesional no existe: <id>` |
| `prestacion_id` inexistente en item | 404 | `prestacion no existe: <id>` |
| HC inexistente (por id o por paciente) | 404 | `historia clinica no existe: <id>` |
| Plan inexistente | 404 | `plan de tratamiento no existe: <id>` |
| HC duplicada para el mismo paciente | **409** | `{"causa": "historia_clinica_duplicada", "detalle": ...}` con el id existente |
| Item agregado a plan en estado no editable | **409** | `{"causa": "plan_no_editable", "detalle": ...}` |
| `pieza` fuera de `[1-4][1-8]` | 422 | validación Pydantic / CHECK |
| `monto_centavos` negativo, decimal o ausente | 422 | validación Pydantic |
| `estado` fuera del set provisorio | 422 | validación Pydantic / CHECK |
| `fecha` sin zona horaria | 422 | `AwareDatetime` |

Criterio: **el conflicto de negocio nunca devuelve 200 ni 500**. El 409 se
detecta antes del `INSERT` (consulta de existencia) y, además, la base lo
garantiza con `UNIQUE`; si la carrera igual llega al `INSERT`, el servicio
traduce `IntegrityError` a `HistoriaDuplicada` → 409.

**404 vs 422 para FKs.** Un `paciente_id`, `profesional_id` o `prestacion_id`
bien formado (UUID válido) que **no existe** es `404`, no `422`: el pedido está
bien construido, el recurso referenciado no está. Es el mismo criterio que ya
usa `ServicioTurnos` para sus FKs, y `422` queda reservado para input mal formado
(FDI, monto, estado, `fecha` sin zona horaria). La validación es una consulta de
existencia **antes** de `session.add`: una FK inexistente nunca llega al `INSERT`
y por lo tanto nunca se convierte en `500` por `IntegrityError`.

### Servicio

`ServicioHC` con `@staticmethod` y `session` primero:
`crear_historia`, `obtener_historia`, `obtener_por_paciente`,
`actualizar_historia`, `agregar_entrada`, `listar_entradas`,
`registrar_odontograma`, `listar_odontograma`, `crear_plan`, `actualizar_plan`,
`agregar_item`, `obtener_plan`, `listar_planes_por_paciente`. Validaciones antes
de `session.add` para que el alta sea atómica; `session.flush()` y nunca
`commit()`.

Excepciones de dominio en el módulo de servicio (`HistoriaNoEncontrada`,
`HistoriaDuplicada`, `PlanNoEncontrado`, `PlanNoEditable`, `PiezaInvalida`,
`RegistroClinicoInvalido`) y traducción a `HTTPException` en el router.

El total y la cobertura se calculan en la lectura del plan
(`sum(item.monto_centavos)` y `sum(item.monto_cobertura_centavos or 0)`) y se
exponen en el schema de salida; no se persisten. `obtener_plan` y
`listar_planes_por_paciente` comparten ese cálculo, de modo que el detalle y el
listado no pueden divergir.

## Cobertura OS: solo lectura, sin nomenclador

C-09 **no modela obras sociales ni cobertura**. `monto_cobertura_centavos` es un
**dato informado por el cliente** que el sistema guarda y devuelve tal cual:

- No se calcula como porcentaje de nada (no hay porcentajes en la KB ni en el
  repo).
- No se valida contra ningún nomenclador (no existe nomenclador en la KB ni en
  el repo).
- No se valida contra `monto_centavos`: la cobertura puede ser mayor, menor o
  igual; el sistema no opina porque no hay regla que lo sostenga.
- Si el cliente no lo envía, queda `NULL`; la suma del plan lo trata como 0.

`CHANGES.md` reserva el nomenclador, la cobertura/copago y el PDF a **C-10**
(`LiquidacionOS`). Cuando C-10 defina el nomenclador, este campo podrá pasar a
derivarse de él; hoy es un snapshot (ver `Q-C09-03`).

## Migración 004 (no 003)

**El "Migración 003" de `CHANGES.md` está desactualizado y es incorrecto.**
Verificado en el repo: `backend/alembic/versions/003_lista_espera.py` ya existe
(revision `"003_lista_espera"`, `down_revision = "002_turno"`), creada por C-06.
El head actual es **`003_lista_espera`**.

Por lo tanto:

- Archivo: `backend/alembic/versions/004_hc_odontograma.py`
- `revision = "004_hc_odontograma"`
- `down_revision = "003_lista_espera"`
- `upgrade()`: crear en orden `historia_clinica` → `entrada_hc` →
  `odontograma` → `plan_tratamiento` → `plan_item`, con sus CHECKs, FKs e
  índices.
- `downgrade()`: dropear índices y tablas en **orden inverso**
  (`plan_item` → `plan_tratamiento` → `odontograma` → `entrada_hc` →
  `historia_clinica`). El orden importa: `entrada_hc` referencia
  `historia_clinica`, y `plan_item` referencia `plan_tratamiento`.
- `backend/alembic/env.py` debe **importar explícitamente**
  `backend.app.hc.models` (el repo importa los modelos por capability con
  `# noqa: F401`). Si falta el import, `Base.metadata` no ve las tablas y
  `alembic check` reporta que sobran o faltan tablas.

### Invocación verificada de Alembic

`backend/alembic.ini` solo contiene `script_location = %(here)s/alembic`: **no
hay `prepend_sys_path`**. Y `backend/alembic/env.py` importa
`from backend.app.agenda import models`, `from backend.app.db import Base`, etc.,
así que la raíz del repo (el paquete `backend`) tiene que estar en el
`PYTHONPATH`. Por eso la forma canónica que usan las tareas corre **desde
`backend\`** fijando `PYTHONPATH` a la raíz del repo:

```powershell
$env:PYTHONPATH = (Resolve-Path ..).Path   # raíz del repo, estando en backend\
# usar el $env:DATABASE_URL ya definido en la consola (puerto 5433)
python -m alembic -c alembic.ini upgrade head
```

Verificado en el repo: desde `backend\` **sin** `PYTHONPATH`, cualquier comando
que cargue `env.py` falla con
`ModuleNotFoundError: No module named 'backend'`. Desde la raíz del repo,
`python -m alembic -c backend/alembic.ini <cmd>` también funciona (es la forma
que documenta `README.md`); **ambas formas son válidas** y las tareas usan la de
`backend\` + `PYTHONPATH` para que el cwd coincida con el `alembic.ini`.

`alembic heads` y `alembic history` **no cargan `env.py`**: pasan incluso desde
`backend\` sin `PYTHONPATH`, así que son un **falso positivo** para verificar el
cableado. Solo `upgrade`, `downgrade` y `check` lo prueban.

**Renumeración registrada como nota (no se edita `CHANGES.md` en este change,
que es de planificación):** con 004 ocupada por C-09, C-10 pasaría de "004" a
**005** y C-11 de "005" a **006**. Ese ajuste del roadmap queda anotado aquí
para quien actualice `CHANGES.md`; no cambia el contenido de ninguno de esos
changes.

## RBAC y autenticación

`knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos marca la
columna **"HC/Caja/OS/ARCA"** como **"Posterior"** para Recepción y Odontólogo, y
**"—" (sin acceso)** para Paciente: la KB no define hoy quién puede leer o
escribir HC. C-11 (`roles-multisucursal-exportacion`) es el change que implementa
roles.

Por eso C-09 sigue el patrón actual del repo (**sin auth**): los endpoints no
exigen token. Se registra la pregunta `Q-C09-05` y el riesgo residual
correspondiente, no se inventa una matriz.

## Gobernanza ALTO

C-09 está marcado **Governance: ALTO** en `CHANGES.md`. Requiere revisión
humana explícita antes de implementar:

1. **El modelo clínico**: tablas, columnas y las decisiones D1/D2/D3 (qué es un
   historial, qué se guarda de una cobertura, qué estados existen).
2. **La migración 004**: numeración, encadenado sobre `003_lista_espera`,
   CHECKs y orden de `downgrade()`.
3. **Los invariantes**: unicidad de HC por paciente y append-only de entradas y
   odontograma.

Bajo el modelo de gobernanza del proyecto, ALTO = proponer y esperar revisión
antes de escribir código. **Este proposal + diseño + spec son el artefacto de
revisión.** No se implementa nada hasta aprobación explícita.

## Riesgos / Trade-offs

- [`estado` de pieza como texto libre] → datos sucios e inconsistentes
  ("cariado", "Cariado", "caries"). Mitigación: no se normaliza en C-09 (haría
  falta el catálogo); el riesgo se acepta hasta cerrar `Q-C09-01`. La validación
  de formato FDI sí evita basura en `pieza`.
- [CHECK provisorio en estados de plan/item] → si `Q-C09-04` cambia el set hace
  falta una migración que dropee y recree el CHECK. Mitigación: los nombres de
  constraint están fijados (`estado_plan_valido`, `estado_item_valido`) y el set
  vive en tuplas de módulo, así que el cambio es acotado y localizado.
- [Sin auth] → cualquier cliente puede leer y escribir HC de cualquier paciente;
  con governance ALTO esto es un riesgo **residual aceptado hasta C-11**.
  Mitigación parcial: la API no se expone públicamente en este change y los
  datos son ficticios en el TP.
- [Total calculado en cada lectura] → costo de agregación. Aceptable: los planes
  tienen decenas de items, no miles. Alternativa (total materializado) trae
  drift; se descarta conscientemente.
- [Cobertura informada por el cliente] → el dato puede ser inconsistente con lo
  que la OS reconozca. No es un defecto de C-09: es un snapshot; la
  conciliación es C-10.
- [Carrera en el alta de HC] → dos requests simultáneos para el mismo paciente
  podrían pasar la verificación previa. Mitigación: `UNIQUE(paciente_id)` en
  base + traducción de `IntegrityError` a 409.
- [Historial de odontograma sin límite] → la tabla crece con cada observación.
  Aceptable para el volumen de una clínica; hay índice por
  `(paciente_id, pieza, fecha)` para que la lectura histórica no degrade.

## Preguntas abiertas

| ID | Pregunta | ¿Bloquea? | Decisor | Mientras tanto (implementado) |
|---|---|---|---|---|
| `Q-C09-01` | ¿Cuál es el catálogo canónico de estados de pieza? Los "18 estados DentalSoft" de `CHANGES.md` **no están enumerados** en el repo ni en la KB. | No bloquea el modelo, sí la validación de dominio. | Producto / cátedra (dueño del alcance DentalSoft). | `estado` es `text` sin CHECK: se guarda lo que envía el cliente. Incorporar el catálogo después requiere migración con CHECK. |
| `Q-C09-02` | ¿La validación FDI `[1-4][1-8]` alcanza? ¿Hacen falta dentición temporaria (5-8) o supernumerarios? | No bloquea: es ampliable sin cambiar el modelo. | Odontólogo / producto. | CHECK `pieza ~ '^[1-4][1-8]$'` + validación Pydantic. Ampliar el rango es una migración de una línea. |
| `Q-C09-03` | ¿De dónde sale la cobertura de OS? No hay nomenclador ni tabla de obras sociales en la KB; C-10 define `LiquidacionOS`. | No bloquea C-09. | C-10 / producto. | `monto_cobertura_centavos` es un snapshot informado por el cliente, guardado y devuelto literal; `NULL` permitido. |
| `Q-C09-04` | ¿Cuáles son los estados canónicos de plan e item y sus transiciones? No hay regla en la KB. | No bloquea, pero el set es provisorio. | Producto / administración. | Set provisorio con CHECK: plan `borrador\|propuesto\|aceptado\|rechazado\|cerrado`; item `pendiente\|realizado\|cancelado`. Sin matriz de transiciones. Editable solo en `borrador\|propuesto`. Cambiarlo requiere migración. |
| `Q-C09-05` | ¿Quién puede escribir HC: recepción, odontólogo, ambos? La matriz RBAC de la KB marca HC como "Posterior" para Recepción y Odontólogo, y "—" (sin acceso) para Paciente. | No bloquea el contrato HTTP. | C-11 (roles) / producto. | Sin auth, patrón actual del repo. Riesgo residual aceptado hasta C-11. |
| `Q-C09-06` | ¿Hace falta registrar la cara del diente (mesial/oclusal/vestibular...) y una observación libre por pieza? | No bloquea; hoy no hay requisito. | Odontólogo / producto. | Se omiten `cara` y `observacion`: `CHANGES.md` solo lista pieza, estado, profesional y fecha. Agregarlas es una migración aditiva. |
| `Q-C09-07` | ¿Hace falta poder cambiar el `estado` de un item de plan (p. ej. `pendiente`→`realizado`)? Hoy solo se fija al crearlo: **no existe `PATCH /planes-tratamiento/{id}/items/{item_id}`**. | No bloquea: el alcance actual no lo pide. | Producto / odontólogo. | El `estado` se informa en el `POST` del item y no se puede modificar. Agregar el `PATCH` es un **endpoint nuevo, no una migración** (el `CHECK` ya admite los tres estados del set provisorio). |

## Fuera del recorte del TP

C-09 está **fuera del recorte evaluable** del TP. El recorte es
`C-01 → C-02 → C-03 → C-12 → C-13 → C-14 → C-15 → C-16` (`CHANGES.md`
§Camino crítico y `knowledge-base/01_vision_y_objetivos.md` §Fuera de alcance,
que excluye explícitamente "HC/odontograma" del primer change). C-09 es **FASE 3
"Clínico, cobros y cierre (posterior al TP)"**. Esto afecta **prioridad, no
corrección**: el change se especifica completo para no bloquear a C-11 y C-19.

# Explore — C-03 crear-turno-sin-solapamientos (PRE-propose)

Fecha: 2026-10-09. Modo explore: solo lectura + esta nota autorizada. Sin proposal/design/specs/tasks (eso es del `/opsx:propose`). Sin código de producción. Sin `openspec new` (verificado: `openspec list --json` → 0 changes activos; C-01 archivado en `openspec/changes/archive/2026-10-08-c-01-foundation-setup/` y C-02 en `openspec/changes/archive/2026-10-09-catalogo-recursos/`).

Skill invocada: `openspec-explore` (thinking partner). Nota: el entorno de este agente no expone Skill-tool ni Engram-tool, así que la skill se ejecuta en modo manual equivalente: lectura completa de KB/CHANGES/código + esta nota. Sin desvíos de scope. El guardado en Engram (`topic_key: opsx/c03-crear-turno/explore`) queda pendiente para un entorno con la tool disponible.

Fuentes leídas: `AGENTS.md`, `CHANGES.md` §C-03 (+ dependencias C-02 ✓, árbol, camino crítico, recorte TP), `knowledge-base/04_modelo_de_datos.md` §Turno/§Seed, `05_reglas_de_negocio.md` (completo — única fuente de reglas), `06_funcionalidades.md` §US-001, `07_flujos_principales.md` §Flujo 1, `08_arquitectura_propuesta.md` (completo), `03_actores_y_roles.md`, `10_preguntas_abiertas.md`, `docs/discovery/discovery.md` §7 + §11, `docs/verify/c02-catalogo-recursos-verify.md`, `docs/explore/c02-catalogo-recursos.md`, `openspec/specs/catalogo-recursos/spec.md`, `openspec/specs/foundation/spec.md`, `backend/app/agenda/models.py`, `backend/app/db.py`, `backend/app/main.py`, `backend/app/turnos/__init__.py`, `backend/app/seed/catalogo.py`, `backend/tests/conftest.py`, `backend/tests/test_agenda_rules.py`, `backend/alembic/versions/001_catalogo.py`, `backend/requirements.txt`.

**Governance CHANGES §C-03: CRITICO.** Implicancia: el propose/apply futuro va con checkpoints y sin atajos (datos de pacientes + núcleo del TP evaluable). Este explore es análisis solamente de todos modos.

---

## 1. Qué hay que construir (scope C-03 + demands RN-01..RN-08)

### 1.1 Scope canónico (CHANGES.md §C-03, `[ ]` pendiente, dependencia C-02 ✓ archivada)

US-001 completa — núcleo del TP (RN-AG-01..05, RN-ES-02), backend FastAPI + pytest:

| Pieza | Contenido (CHANGES + KB 04/07) |
|-------|-------------------------------|
| Modelo `Turno` | `paciente_id`, `profesional_id`, `sillon_id NOT NULL`, `prestacion_id`, `inicio`, `fin = inicio + duracion`, `estado`, `creado_por` |
| `ServicioTurnos.crear(...)` | Único punto de validación: calcula fin, exige sillón, verifica horario + bloqueo, busca solapes `[inicio,fin)` en turnos activos mismo profesional y mismo sillón |
| `POST /turnos` | 201 pendiente \| 409 `HTTPException` con causa (`profesional\|sillon\|horario\|bloqueo`) \| 422 Pydantic/sin sillón |
| Alembic revisión 002 | Tabla turno + índices parciales (`profesional_id,inicio,fin` y `sillon_id,inicio,fin` donde estado en pendiente/confirmado; `paciente_id,inicio`) |
| Tests pytest (red-green, skill `tdd`) | crear ok, solape profesional 409, solape sillón 409, borde inicio==fin acepta (RN-AG-04), sin sillón 422, fuera de horario 409, sobre bloqueo 409, nada creado en 409 |

### 1.2 Demands RN-01..RN-08 una por una (Discovery §7 verbatim + mapeo KB 05)

- **RN-01 / RN-AG-01** (duración fija): "cada prestación tiene duración fija en minutos (v1); el turno ocupa desde su inicio hasta inicio + duración". C-03 **calcula `fin = inicio + prestacion.duracion_min` en el servidor** — el cliente NO envía `fin` (o si lo envía, se ignora/rechaza; el propose lo fija). `duracion_min > 0` ya garantizado por CHECK de C-02. `fin` se persiste (KB 04 lo lista como atributo calculado) para que los índices y las queries de solape no recomputen el join en cada lectura.
- **RN-02 / RN-AG-02** (solape profesional): "un profesional no puede tener dos turnos activos con intervalos superpuestos". Query en `ServicioTurnos.crear`: existe turno activo (`estado IN ('pendiente','confirmado')`) mismo `profesional_id` con `inicio < nuevo.fin AND fin > nuevo.inicio` → 409 causa `profesional`.
- **RN-03 / RN-AG-03** (solape sillón + sillón obligatorio): "un sillón/box no puede tener dos turnos activos con intervalos superpuestos. El sillón es obligatorio en todo turno". Doble demanda: (a) misma query de solape por `sillon_id` → 409 causa `sillon`; (b) `sillon_id NOT NULL` a nivel DB **y** schema Pydantic que lo exige → sin sillón = 422 (no 409). Además el sillón debe estar `activo=true` — decidir en propose si sillón inactivo es 409 o 422 (recomendación a evaluar: 422, es input contra un recurso desactivado; ver §3.5).
- **RN-04 borde / RN-AG-04**: "un turno que empieza justo cuando termina otro NO es solapamiento (intervalos `[inicio, fin)`)". La condición `inicio < otro.fin AND fin > otro.inicio` lo implementa sin casos especiales. Test obligatorio: `inicio == fin` de otro turno → 201. El helper `hay_solape_config` de C-02 ya codifica exactamente esta semántica para `time`; C-03 la reutiliza en espíritu para `timestamptz` (o la generaliza — ver §2).
- **RN-05 / RN-AG-05** (horario + bloqueo): "un turno solo se crea dentro del horario de atención del profesional y no sobre un bloqueo". Dos sub-chequeos: (a) **horario**: convertir `inicio/fin` a `(dia_semana, hora)` bajo `TZ=America/Argentina/Buenos_Aires` y exigir cobertura total del intervalo por las filas de `HorarioAtencion` del profesional (convención día 0-6 = Python `weekday()`, heredada de C-02/seed `range(5)`); fuera de horario → 409 causa `horario`. (b) **bloqueo**: existe `Bloqueo` aplicable (matriz `bloqueo_aplica` de C-02: solo-profesional, solo-sillón, global, pareja concreta) con intersección `[inicio,fin)` → 409 causa `bloqueo`. Orden de chequeo sugerido (a evaluar en propose): sillón presente → FKs existen → horario → bloqueo → solapes; el orden determina qué causa se reporta primero cuando hay varias.
- **RN-06 / RN-TU-01** (cancelado/ausente libera): "un turno cancelado o ausente no cuenta para solapamientos y libera profesional y sillón/box". Las queries de solape filtran `estado IN ('pendiente','confirmado')` — coherente con los índices parciales de la revisión 002. Test: crear sobre un slot cuyo turno previo está cancelado → 201. (El endpoint de cancelar es C-04; C-03 solo necesita que el filtro exista y que el seed/tests puedan sembrar un cancelado para probar RN-06, como anticipa KB 04 §Seed: "2 turnos pendientes no solapados + 1 cancelado".)
- **RN-07 / RN-TU-02** (reprogramar conserva original): "reprogramar valida el nuevo horario con las mismas reglas; si falla, se conserva el turno original". **Es C-04, NO C-03.** C-03 solo debe dejar el diseño abierto: la validación vive en `ServicioTurnos` de forma reutilizable (p.ej. método interno `validar(...)` separado de `crear(...)`) para que C-04 la invoque sin duplicar lógica.
- **RN-08 / RN-ES-01 + RN-ES-02** (estados; solo pendiente/confirmado activos): "estados: pendiente → confirmado → atendido/ausente; pendiente o confirmado → cancelado" y "solo pendiente y confirmado cuentan como activos para solapamiento". C-03: enum de estado con esos 5 valores, `default pendiente`, `CHECK` a nivel DB; `POST /turnos` crea siempre en `pendiente` (no hay transición en este change — confirmar/atender es posterior). La máquina de transiciones completa se enforcea en C-04; C-03 no debe contradecirla.

### 1.3 Orden de validación y semántica 409/422 (regla dura)

KB 07 Flujo 1 + CHANGES fijan el contrato; el propose debe congelar el orden (determina la causa reportada ante fallos múltiples):

1. Schema Pydantic (tipos, `sillon_id` presente, datetimes con zona) → **422**.
2. FKs existen (paciente/profesional/sillón/prestación) → **404 o 422** (decidir en propose; recomendación a evaluar: 422 si el ID es inválido como input, 404 si bien formado pero inexistente — necesita decisión explícita porque CHANGES no lo dice).
3. Sillón activo → 422 o 409 (ver §1.2/RN-03).
4. Dentro de horario → **409** causa `horario`.
5. No sobre bloqueo aplicable → **409** causa `bloqueo`.
6. Sin solape profesional → **409** causa `profesional`.
7. Sin solape sillón → **409** causa `sillon`.
8. Si pasa todo → **201** con el turno en `pendiente`.

"409 con causa" hoy significa `HTTPException(409, detail={"causa": ...})` o similar — el formato exacto del body lo fija el propose. "Nada creado en 409": el POST es atómico (rollback/no-commit ante cualquier fallo).

---

## 2. Qué ya existe del catálogo y qué falta (reuse/gap archivo por archivo)

Todo C-02 es reutilizable, nada que tirar. Verificado contra `docs/verify/c02-catalogo-recursos-verify.md` (40/40 verde con PG real) y lectura directa:

| Archivo | Contenido real | Reutilización en C-03 / Gap |
|---------|---------------|-----------------------------|
| `backend/app/agenda/models.py` (167 líneas) | `Paciente` (dni único), `Profesional` (matrícula única), `SillonBox` (activo default true + índice), `Prestacion` (`duracion_min CHECK >0`), `HorarioAtencion` (`dia CHECK 0-6`, `desde<hasta`), `Bloqueo` (doble nullable + `desde<hasta` + motivo NOT NULL) + helpers `hay_solape_config`, `validar_horario_sin_solape`, `bloqueo_aplica` | **Reutilización total**: FKs, tipos (`Uuid` uniforme, `timestamptz` en Bloqueo como precedente para Turno), matriz de bloqueos y semántica semiabierta ya testeadas. Gap: falta `Turno` (+ enum estado + CHECKs). `hay_solape_config` opera sobre `time`; C-03 necesita el equivalente sobre `timestamptz` — el propose decide si generalizar el helper (es agnóstico a tipos en realidad: solo usa `<`) o escribir query SQL directa |
| `backend/app/db.py` (53 líneas) | `Base` + naming conventions, engine/sesión perezosos (foundation intacto: import sin `DATABASE_URL`) | Reutilizar sin cambios. Gap: ninguno (quizá helper de sesión por request para el router, a decidir en propose) |
| `backend/app/main.py` (11 líneas) | Solo `GET /health` | Base a extender: montar router `/turnos` sin romper spec `foundation` (health sin DB sigue verde). Gap: router + manejadores de error 409/422 |
| `backend/app/turnos/__init__.py` (1 línea) | Esqueleto "ServicioTurnos, endpoints /turnos (scope C-03)" | **Hogar natural de C-03**: `ServicioTurnos` + schemas + router. Gap: todo el contenido (modelos, servicio, schemas Pydantic, router) |
| `backend/app/seed/catalogo.py` | 2 profesionales, 2 sillones, 3 prestaciones (20/30/60), horarios Lun–Vie 9–18 (`range(5)`, `weekday()` 0=lunes), 1 bloqueo global 24–26 dic 2026, 3 pacientes `DNI-FICT-*`; idempotente; **sin turnos** | Reutilizar como fixture de tests C-03 (los tests de crear necesitan catálogo sembrado). Gap: KB 04 §Seed prevé además "2 turnos pendientes no solapados + 1 cancelado (RN-06)" — eso se siembra en C-03 (vía `ServicioTurnos` o seed extendido; el propose decide) |
| `backend/tests/conftest.py` | `db_session` con rollback + TRUNCATE, guard de DB (`turnos`/`*_test`), fail-fast con `CI=true`, `TZ` fija | Reutilizar. **Gap conocido**: `_CATALOGO_TABLES` no incluye `turnos` — la revisión 002 + fixture deben truncarla también (detalle a no olvidar en propose) |
| `backend/tests/test_agenda_rules.py` | 9 tests unitarios puros (solape, matriz bloqueos, borde) siempre verdes | Patrón a imitar para tests puros de C-03 (si se extrae lógica pura de validación). Gap: tests de Turno (integración + API) |
| `backend/alembic/versions/001_catalogo.py` | 6 tablas + constraints + índices (`dni`, `activo`); docstring declara explícito: "Sin Turno ni sus indices parciales (002 / C-03)" | Base de la cadena. Gap: **revisión 002** — tabla `turnos` (UUID PK; 4 FKs con `ondelete` a decidir; `inicio/fin timestamptz NOT NULL`; `estado` + CHECK; `creado_por`; `CHECK fin > inicio`) + 3 índices (2 parciales donde estado activo + `paciente_id,inicio`) |
| `backend/requirements.txt` | fastapi, sqlalchemy, alembic, `psycopg[binary]`, uvicorn, httpx, pytest, ruff | Suficiente para C-03 (httpx/`TestClient` para tests API). Sin JWT/Redis — correcto, son posteriores |
| `backend/app/agenda/__init__.py` | Esqueleto C-02 | Decidir en propose dónde vive `Turno`: `turnos/` (coherente con "ServicioTurnos" y KB 08) vs `agenda/models.py`. Recomendación a evaluar: `Turno` en `backend/app/turnos/models.py` junto al servicio |

### Delta 002 vs 001 (lo que C-02 dejó listo)

- **FKs listas**: `pacientes.id`, `profesionales.id`, `sillones.id`, `prestaciones.id` — todas UUID, todas con unique/naming compatible.
- **Decisión `timestamptz` tomada**: `Bloqueo.desde/hasta` son `DateTime(timezone=True)` — `Turno.inicio/fin` siguen el mismo tipo (KB 04 lo exige). Sin discusión pendiente.
- **CHECKs como precedente**: `duracion_positiva`, `dia_valido`, `rango_valido` — la 002 añade `fin > inicio` y `estado IN (...)` con el mismo estilo + naming conventions de `db.py`.
- **Seed sin turnos por diseño**: el spec C-02 lo prohíbe explícitamente ("SHALL NOT incluir turnos") — no es un faltante, es el delta exacto de C-03.

---

## 3. Dudas o riesgos (para cerrar en propose, no acá)

### 3.1 Concurrencia: garantizar ausencia de solape bajo creates concurrentes (decisión estrella del propose)

El chequeo "buscar solape y luego insertar" tiene **race condition** clásica (TOCTOU): dos requests concurrentes pueden verse mutuamente libres e insertar solape. Opciones sobre la mesa, con tradeoffs — **el propose decide; acá solo se exponen**:

| Opción | Cómo | Pros | Contras |
|--------|------|------|---------|
| **A. Validación solo en servicio** (SELECT + INSERT en una transacción) | `ServicioTurnos.crear` como hoy se dibuja en KB 07 | Simple, sin extensiones; suficiente para el TP secuencial y sus tests | NO cierra el race bajo concurrencia real; dos `POST` simultáneos pueden solaparse |
| **B. `EXCLUDE` con `tstzrange` + `btree_gist`** | Constraint `EXCLUDE USING gist (profesional_id WITH =, tstzrange(inicio,fin) WITH &&) WHERE (estado IN ('pendiente','confirmado'))` (y análogo por sillón) | Garantía a nivel DB incluso con concurrencia; el borde `[)` lo da el rango por construcción; error de exclusión → mapear a 409 | Requiere extensión `btree_gist` (superuser/`CREATE EXTENSION`, fricción en CI/Compose); `tstzrange` sobre columnas separadas exige columna generada o expresión; dos constraints (profesional + sillón); el mapeo del error a causa (`profesional` vs `sillon`) requiere parsear el constraint violado |
| **C. Lock pesimista por recurso** (`SELECT ... FOR UPDATE` sobre fila de profesional/sillón, o advisory lock por par `(profesional, sillón)`) | Serializa los creates que comparten recurso | Sin extensiones; cierra el race para el caso real (mismo profesional/sillón) | Serializa (throughput, pero irrelevante en TP); advisory locks son sutiles de testear; no protege contra escrituras fuera del servicio |
| **D. Aislamiento `SERIALIZABLE`** | Transacción serializable + reintento ante `SerializationFailure` | Sin DDL extra | Reintentos obligatorios, errores espurios bajo carga, difícil de testear determinísticamente; overkill para el TP |
| **E. Índice único "poor man's"** | No existe para rangos solapados — se lista solo para descartarla | — | Un btree no expresa solape de intervalos; no sirve |

**Recomendación registrada como tal (el propose la confirma o revierte)**: **A como comportamiento implementado y testeado** (cierra el TP: tests secuenciales red-green) **+ B evaluada explícitamente en el propose** (al menos documentar por qué sí/no para el TP; si se adopta, el test de concurrencia debe provocar el race de forma determinista, p.ej. barrera entre threads). C es el plan B si se exige robustez sin extensiones. En cualquier caso: la validación de servicio (A) existe siempre — es la que produce los 409 con causa específica; el constraint/lock es red de seguridad, no sustituto de los mensajes.

### 3.2 Scope fence (lo que C-03 explícitamente NO incluye)

NO sobreturnos (Q4, posterior). NO lista de espera (C-06, criterio Q5 posterior). NO reserva online del paciente / carga solo-recepción se mantiene como supuesto Q1 (ver §3.3). NO JWT/login (C-11). NO Redis. NO frontend. NO recordatorios/WhatsApp (C-07). NO HC/caja/OS/ARCA (C-09/C-10). **NO `GET /agenda`** — verificar contra CHANGES: C-03 trae solo `POST /turnos`; el GET de agenda por profesional+fecha es **C-05** (`GET /agenda?...`, governance BAJO). Menciones a `GET /agenda` en explores previos se refieren al flujo completo, no al scope C-03. Endpoints C-03: solo `POST /turnos` (+ `GET /health` heredado que debe seguir verde sin DB).

### 3.3 Preguntas abiertas en scope C-03 (Discovery §11 / KB 10)

- **Q1 (Alta, previa al próximo change según AGENTS.md): solo-recepción escribe.** Sigue sin confirmación PO/cátedra. No bloquea el modelado (el endpoint es el mismo), pero el propose debe registrarla como supuesto explícito ("sin auth en C-03, uso interno/test; `creado_por` como texto libre hasta C-11") porque condiciona si `creado_por` es FK o texto y el RBAC futuro.
- **Q3 (Media, SÍ toca C-03): ¿un mismo paciente puede tener dos turnos superpuestos con profesionales distintos?** RN-02/03 solo vedan solape por profesional y por sillón — un paciente con dos turnos simultáneos en sillones distintos con profesionales distintos **pasa** las reglas actuales. El índice `(paciente_id,inicio)` de CHANGES sugiere observabilidad, no prohibición. El propose debe fijar: ¿se valida solape por paciente (409 causa `paciente`, más allá de CHANGES) o se permite (default fiel a RN)? Recomendación a evaluar: permitir en C-03 (fiel a RN-02/03 literales), registrar como supuesto + pregunta PO.
- **Q2 (Media): anticipación mínima para cancelar/reprogramar** — es C-04 (RN-TU), no C-03. Solo registrar que C-03 no la implementa.
- **Q5/Q4 (Media/Baja): orden de lista de espera / límite sobreturnos** — posteriores (C-06/sobreturnos). Fuera de C-03 por fence.
- **Q7 (Baja): "No evidenciado"** — sin impacto en C-03.

### 3.4 Riesgos técnicos para el propose

1. **TZ y conversión fecha→(día,hora)**: `HorarioAtencion` usa `time` naive + `dia_semana` 0-6 (`weekday()`, 0=lunes — fijado por seed `range(5)` + Lun–Vie); `Turno.inicio/fin` son `timestamptz`. C-03 debe convertir con `TZ=America/Argentina/Buenos_Aires` de forma determinista (incl. turnos que cruzan medianoche o límites DST — caso borde a testear o a excluir por supuesto explícito).
2. **`fin` persistido vs generado**: KB 04 dice "fin (calculado = inicio + duracion_min)". Opciones: columna física (simple, indexable, coherente con índices CHANGES) vs `GENERATED ALWAYS AS` (imposible: requiere join a prestaciones). **Columna física calculada en servicio** — el CHECK `fin > inicio` la protege de escrituras manuales.
3. **`creado_por`**: KB 04 lo lista; sin tabla Usuario en C-02/C-03 (C-11). Propose decide: texto libre nullable vs NOT NULL. Recomendación a evaluar: nullable/texto libre hasta C-11.
4. **Fixture TRUNCATE**: `conftest.py` debe añadir `turnos` a `_CATALOGO_TABLES` (o tabla separada) — detalle fácil de olvidar que contamina tests.
5. **409/422 en capas**: los CHECKs DB levantan `IntegrityError`, no 422. El servicio debe validar ANTES de insertar (FKs, sillón activo, rangos) para devolver 422/409 controlados; el `IntegrityError` residual es 500 solo como última red (o mapearlo si el propose lo exige).
6. **Sin `GET` de verificación**: con solo `POST /turnos`, los tests verifican por DB directa (fixture `db_session`) + respuesta 201. El propose debe decirlo para no exigir endpoints de lectura que son C-05.
7. **PG16 vs PG17 local**: ver verify C-02 §4 — los tipos de la 002 (`Uuid`, `timestamptz`, CHECKs, índices parciales) son estándar y viejos; si se evalúa `EXCLUDE`/`btree_gist`, verificar disponibilidad en `postgres:16` del Compose/CI.

---

## Bloqueadores para el propose

Ninguno duro. Dependencias C-01 ✓ y C-02 ✓ archivadas, `openspec list` vacío (C-03 aún no creado vía CLI — lo crea el propose), estructura `backend/app/turnos/` reservada y vacía, stack impuesto claro, KB completa, US-001 con 6 CA testeables, verify C-02 en verde (40/40). Blandos: Q1 sin confirmar (registrar como supuesto), decisión de concurrencia A-vs-B-vs-C abierta (§3.1), Q3 solape-por-paciente por fijar (§3.3), detalles `creado_por`/404-vs-422/sillón-inactivo por cerrar.

## Recomendado para el propose de C-03 (no implementar acá)

Modelo `Turno` en `backend/app/turnos/` + `ServicioTurnos.crear` único punto de validación + `POST /turnos` (201/409-con-causa/422), Alembic 002 con 3 índices, seed/ejemplos "2 pendientes + 1 cancelado" (KB 04 §Seed), tests red-green (los 7 de CHANGES + reutilización tras cancelado RN-06 + borde `inicio==fin`), decisiones numeradas sobre §3.1–§3.4, supuesto Q1 explícito. Criterio de cierre: `pytest backend/tests` verde (con PG real y skips motivados sin PG) + `GET /health` sin DB intacto + revisión 002 aplica/retrocede limpio + `openspec validate` verde.

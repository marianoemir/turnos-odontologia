# Explore — C-02 catalogo-recursos (PRE-propose)

Fecha: 2026-10-08. Modo explore: solo lectura + esta nota autorizada. Sin proposal/design/specs/tasks (eso es del `/opsx:propose`). Sin código de producción. Sin `openspec new` (verificado: `openspec list --json` → 0 changes activos; C-01 archivado en `openspec/changes/archive/2026-10-08-c-01-foundation-setup/`).

Skill invocada: `openspec-explore` (thinking partner). Nota: el entorno de este agente no expone Skill-tool ni Engram-tool, así que la skill se ejecuta en modo manual equivalente: lectura completa de KB/CHANGES/código + esta nota. Sin desvíos de scope.

Fuentes leídas: `AGENTS.md`, `CHANGES.md` §C-02 (+ dependencias, árbol, camino crítico), `knowledge-base/04_modelo_de_datos.md` (completo), `05_reglas_de_negocio.md`, `08_arquitectura_propuesta.md`, `02_descripcion_general.md`, `03_actores_y_roles.md`, `06_funcionalidades.md`, `07_flujos_principales.md`, `01_vision_y_objetivos.md`, `09_decisiones_y_supuestos.md`, `10_preguntas_abiertas.md`, `docs/discovery/discovery.md` §7 + §11, `docs/explore/c01-foundation-setup.md`, `openspec/specs/foundation/spec.md`, todo `backend/` archivo por archivo, `docker-compose.yml`, `.env.example`.

---

## 1. Qué hay que construir (scope de C-02 + cómo RN-01..RN-08 lo condicionan)

### 1.1 Scope canónico (CHANGES.md §C-02, pendiente `[ ]`, dependencia C-01 ✓ archivada)

Seis modelos SQLAlchemy, sin `Turno` todavía:

| Modelo | Campos (CHANGES + KB 04) | Constraints |
|--------|--------------------------|-------------|
| `Paciente` | id (uuid), nombre, dni único, contacto (tel/email), ficticio bool | dni único; solo datos ficticios (regla dura) |
| `Profesional` | id, nombre, matrícula ficticia, especialidad | matrícula única ficticia (KB 04; CHANGES no la nombra pero la exige la KB) |
| `SillonBox` | id, nombre ("Sillón 1 / Box 2"), activo bool | activo=true para asignar (RN-AG-03); índice `activo` |
| `Prestacion` | id, nombre, duracion_min int | duracion_min > 0 fija en v1 (RN-AG-01 / RN-01) |
| `HorarioAtencion` | profesional_id, dia_semana 0-6, desde time, hasta time | desde < hasta; sin solape entre filas mismo profesional/día (validación de config) |
| `Bloqueo` | profesional_id nullable, sillon_id nullable, desde timestamptz, hasta timestamptz, motivo | desde < hasta; aplicable a turno por rango (RN-AG-05 / RN-05) |

Más, según CHANGES §C-02:

- **Alembic revisión 001**: tablas del catálogo + índices (`dni`, `activo`). Los índices parciales de solape (`profesional_id,inicio,fin` / `sillon_id,inicio,fin` donde estado activo; `paciente_id,inicio`) son de C-03/revisión 002 — NO van en C-02.
- **Seed ficticio**: 2 profesionales, 2 sillones, 3 prestaciones (20/30/60 min: consulta 20, limpieza 30, conducto 60), horarios Lun–Vie 9–18 por profesional, 1 bloqueo de prueba, 3 pacientes con DNI ficticios. Activado por `SEED_FICTICIO=true`. Sin turnos ejemplo (los "2 pendientes + 1 cancelado" de KB 04 §Seed pertenecen a C-03, cuando exista `Turno`).
- **Tests pytest**: constraints (dni único, duración > 0, sillón activo, horario desde < hasta), seed carga 2+2+3. Regla dura: cerrar con tests en verde (red-green, skill `tdd`).
- **Governance CHANGES: CRITICO** (no MEDIUM — ver §3.9).

### 1.2 Cómo RN-01..RN-08 (Discovery §7) condicionan C-02 sin implementar Turno

C-02 no crea turnos, pero cada decisión de tipos/constraints es un pre-requisito de C-03. Mapeo:

- **RN-01 / RN-AG-01** (duración fija): `Prestacion.duracion_min INT CHECK (>0)` + cálculo futuro `fin = inicio + duración`. C-02 debe fijar unidad (minutos enteros) y prohibir 0/negativo a nivel DB, no solo Pydantic.
- **RN-02+RN-04 / RN-AG-02+04** (solape profesional, borde `[inicio,fin)`): C-02 aporta la FK `profesional_id` y el tipo temporal. Decisión a cerrar en propose: `inicio/fin` futuros como `timestamptz` (KB 04 lo exige) y estrategia de comparación semiabierta (`inicio < otro.fin AND fin > otro.inicio`).
- **RN-03 / RN-AG-03** (solape sillón, sillón obligatorio): C-02 aporta `SillonBox` + flag `activo` + índice. El `NOT NULL` vive en C-03, pero C-02 ya debe definir default de `activo` (=true) y semántica de desactivar (soft, nunca hard delete de recurso con historia).
- **RN-05 / RN-AG-05** (horario + bloqueo): es el corazón de diseño de C-02. `HorarioAtencion` (time sin zona + día 0-6) y `Bloqueo` (rango timestamptz nullable/nullable) deben ser consultables por C-03 como "¿este [inicio,fin) está dentro de horario y fuera de todo bloqueo aplicable?". Ver ambigüedades §3.2–3.4.
- **RN-06+RN-08 / RN-TU-01+RN-ES-01/02** (cancelado/ausente libera; estados; solo pendiente/confirmado activos): no hay tabla Turno en C-02, pero el propose debe no contradecir el enum futuro (`pendiente, confirmado, cancelado, atendido, ausente`) ni la regla "sin hard delete".
- **Reglas duras transversales**: 409 vs 422 es C-03, pero C-02 ya fija qué es "input inválido" (CHECKs → 422 futuro) vs "conflicto" (solape/horario/bloqueo → 409 futuro). `docs/discovery` + KB 07 Flujo 1 son la aceptación que C-02 prepara.

### 1.3 Lo que C-02 explícitamente NO incluye

`Turno`, `ServicioTurnos`, endpoints (`POST /turnos`, `GET /agenda`), 409/422 HTTP, estados, lista de espera/recordatorios/HC/caja/OS/ARCA/roles (C-03..C-11), frontend, Redis, JWT/login (C-11), integraciones. Reserva online NO entra (Q1).

---

## 2. Qué existe hoy en backend/ (inventario archivo por archivo, verificado)

C-01 está archivado y el scaffolding existe y coincide con KB 08 §Estructura. Todo reutilizable, nada que tirar:

| Archivo | Contenido real | Reutilización en C-02 |
|---------|---------------|----------------------|
| `backend/app/main.py` (11 líneas) | App FastAPI mínima, solo `GET /health` → `{"status":"ok"}`, sin DB/SQLAlchemy | Base a extender: montar futuros routers sin romper spec `foundation` (health sin DB debe seguir verde) |
| `backend/app/agenda/__init__.py` (1 línea) | Esqueleto con docstring "horarios, bloqueos y recursos (scope C-02)" | Hogar natural de los 5 modelos de catálogo (menos Paciente, ver duda §3.5) |
| `backend/app/turnos/__init__.py` (1 línea) | Esqueleto "ServicioTurnos, endpoints /turnos (scope C-03)" | NO tocar en C-02 (evita adelantar Turno) |
| `backend/app/seed/__init__.py` (1 línea) | Esqueleto "datos ficticios, flag SEED_FICTICIO" | Hogar del seed C-02 |
| `backend/app/__init__.py`, `backend/__init__.py`, `backend/tests/__init__.py` | Vacíos | OK |
| `backend/tests/test_health.py` (24 líneas) | 2 tests: health 200 + health sin `DATABASE_URL` | Mantener en verde; patrón `TestClient` a imitar |
| `backend/tests/test_dummy.py` (8 líneas) | Import package | Mantener o absorber en suite C-02 |
| `backend/requirements.txt` | `fastapi>=0.115, sqlalchemy>=2.0, alembic, uvicorn, httpx, pytest>=8, ruff` | **Falta driver Postgres** (`psycopg[binary]` o `psycopg2-binary`) — sin él SQLAlchemy no conecta. Evaluar agregar `pydantic-settings`/`email-validator` solo si el propose los justifica; no agregar Redis/JWT |
| `backend/Dockerfile` | `python:3.12-slim`, instala requirements, `uvicorn app.main:app` | Reutilizable; verificar `COPY` incluya `alembic/` cuando exista |
| `docker-compose.yml` (raíz) | `postgres:16` con healthcheck + `api` con `DATABASE_URL` al servicio | Base del entorno C-02; falta validar `docker compose config` con la futura URL de Alembic |
| `.env.example` | `TZ, DATABASE_URL, REDIS_URL, SECRET_KEY, SEED_FICTICIO` ficticios | **Discrepancia heredada de C-01** (explore C-01 §3.3): `REDIS_URL` es posterior según KB 02/08 y CHANGES C-01 no lo lista. C-02 no necesita Redis; el propose decide si lo quita |
| `openspec/specs/foundation/spec.md` | 3 scenarios (health, arranque sin DB, suite verde sin servicios) | Contrato a no romper: la app debe seguir importando sin Postgres |
| `openspec/changes/archive/2026-10-08-c-01-foundation-setup/` | proposal/design/tasks/specs de C-01 | Precedente de convenciones a seguir |

**Capacidades que C-02 debe crear desde cero** (no existen): engine/Session (`DATABASE_URL` hoy solo la usa Compose, ningún código la lee), `Base` declarativa, modelos, `alembic/` (sin `alembic.ini`, sin `env.py`, sin revisiones), schemas Pydantic, seed ejecutable, tests de constraints/seed. Estructura `backend/app/{turnos,agenda,seed}/` + `backend/tests/` ya es la que CI/README esperan — no hay conflicto `src/` vs `backend/` (resuelto a favor de `backend/`).

---

## 3. Dudas o riesgos (para cerrar en propose, no acá)

### 3.1 Q1 (Alta, previa al próximo change según AGENTS.md): solo-recepción escribe
IN-01/Q1 sigue sin confirmación PO/cátedra ("solo carga por recepción, sin reserva online en C-01..C-03"). No bloquea el modelado del catálogo, pero el propose debe registrarla como supuesto explícito porque condiciona RBAC futuro y si `Paciente` necesita o no credenciales. Recomendación: supuesto "sin auth en C-02, uso interno/test; `creado_por` futuro como texto libre hasta C-11".

### 3.2 Semántica de `Bloqueo` con doble nullable
KB 04: "profesional_id (nullable: si null = sillón o global), sillon_id (nullable)". Tres lecturas posibles: (a) solo-profesional, (b) solo-sillón, (c) global (ambos null). ¿Es (c) válida? ¿Y ambos no-null (pareja concreta)? El propose debe fijar la matriz aplicable/no-aplicable que C-03 consultará, más `CHECK (desde < hasta)` y si `motivo` es obligatorio.

### 3.3 Anti-solape de `HorarioAtencion` mismo profesional/día
CHANGES exige "sin solape entre filas del mismo profesional/día (validación de config)". ¿Dónde se enforcea? Opciones: (a) solo Python/servicio, (b) exclusion constraint Postgres con rangos (`btree_gist`), (c) ambas. (b) es robusta pero añade extensión; (a) es simple pero con race. El propose debe elegir y testear el caso borde (adyacencia `hasta == desde` permitida, coherente con RN-AG-04).

### 3.4 Tiempo: `dia_semana` 0-6, `time` sin zona vs `timestamptz`
Sin convención escrita (¿0=lunes o domingo? Python `weekday()` vs Postgres `EXTRACT(dow)` difieren). `HorarioAtencion` usa `time` naive mientras `Bloqueo`/futuro Turno usan `timestamptz` bajo `TZ=America/Argentina/Buenos_Aires`. El propose debe fijar: convención de día, resolución de múltiples filas por día (¿partido mañana/tarde permitido? el seed sugiere 1 fila Lun–Vie 9–18 pero el modelo permite N), y cómo C-03 convertirá fecha→(día,hora) para validar RN-AG-05.

### 3.5 Dudas de modelo (menores, pero cerrar antes de la 001)
- **PKs**: KB 04 dice `id (uuid)` solo para Paciente; resto genérico. ¿UUID en las 6 tablas o serial? Recomendación a evaluar: UUID uniforme (coherente con `Turno.id` futuro y exportación C-11).
- **`Recepcionista/Usuario`**: KB 04 lo modela (`rol` enum, `creado_por`), CHANGES C-02 no lo incluye. ¿`creado_por` queda fuera hasta C-11? No crear tabla usuario en C-02.
- **`Paciente.ficticio`**: "siempre true en TP" — ¿`DEFAULT true` + CHECK, o solo convención de seed? Sin CHECK, un insert manual viola la regla dura silenciosamente.
- **`Paciente.contacto`**: texto libre (tel/email mezclados). ¿Validar formato o mantener libre en C-02?
- **`SillonBox.activo`**: default true; desactivar = soft (nunca delete con historia). ¿Endpoint de ABM en C-02 o solo modelo+seed? CHANGES no pide endpoints — propose debe decirlo (recomendación: modelo + seed + tests, sin routers; los routers llegan con C-03/C-05).
- **`Prestacion`**: CHANGES dice "duracion_min > 0 fija"; KB 04 agrega "fija en v1". Alcance v1 (KB 01) menciona "duraciones variables" como norte — contradicción aparente: C-02 fija, variable es posterior. Registrarlo.
- **`Profesional.matricula` única**: incluir aunque CHANGES no la nombre (la exige KB 04).
- **DNI/matriculas del seed**: definir valores ficticios concretos no colisionables (p.ej. `DNI-FICT-001`), nunca reales.

### 3.6 Riesgos técnicos
- **Sin driver Postgres** en requirements (ver §2): el primer `create_engine(DATABASE_URL)` falla sin `psycopg`. Detectado a tiempo, fix trivial en propose.
- **Tests contra Postgres real vs sqlite**: KB 08 exige "Postgres real con rollback transaccional". La CI actual corre sin servicios; con modelos reales, o se añade servicio postgres a la CI o los tests de constraints no corren. El propose debe definir estrategia (servicio CI + `DATABASE_URL` de test, o testcontainers) sin romper el scenario foundation "suite verde sin servicios" — probablemente separando tests unitarios (sin DB) de integración (con DB marcada).
- **`TZ` y timestamptz en tests**: fijar `TZ` en CI/seed para resultados deterministas.
- **Alembic desde cero**: crear `env.py` que lea `DATABASE_URL`,Offline/online, naming conventions; revisión 001 solo catálogo (los índices parciales de Turno son 002/C-03).
- **Cobertura de borde**: la regla dura exige tests de borde `inicio==fin`; en C-02 el análogo es adyacencia de horarios y `desde==hasta` rechazado. No confundir capas.

### 3.7 Alcance del seed vs KB 04
KB 04 §Seed lista además "2 turnos pendientes no solapados + 1 cancelado (RN-06)". Eso requiere `Turno` (C-03). C-02 siembra **solo catálogo + pacientes**. El propose debe decirlo para evitar que se exija en la review de C-02.

### 3.8 Trazabilidad propose
"Leer antes" de C-02 cita KB 04 §Paciente/§Prestacion/§Seed + KB 09 §DD-05. DD-05 está **reemplazada por DD-06** (stack impuesto 2026-10-07) — leerla solo como historia. El propose debe citar DD-06, no DD-05, y apoyarse además en KB 05 (RN-AG) y KB 08 (patrones/estructura), aunque CHANGES no los liste.

### 3.9 Discrepancia de governance
CHANGES §C-02 dice **CRITICO**; el task de este explore decía "MEDIUM". Prevalece CHANGES (CRITICO: datos de pacientes + base de solapes futuros). Implicancia: el propose/apply futuro va con checkpoints y sin atajos, aunque este explore no implemente nada.

---

## Bloqueadores para el propose

Ninguno duro. Dependencia C-01 archivada ✓, root openspec ok, estructura `backend/` existe, stack impuesto claro, KB completa. Blandos: Q1 sin confirmar (registrar como supuesto), estrategia de tests con DB por definir, driver `psycopg` faltante (fix en propose).

## Recomendado para el propose de C-02 (no implementar acá)

Modelos en `backend/app/agenda/` (+ `Paciente` donde el propose decida) con CHECKs a nivel DB, Alembic 001 + índices `dni`/`activo`, seed ficticio 2+2+3+Lun–Vie+1 bloqueo+3 pacientes tras `SEED_FICTICIO`, tests red-green (constraints + seed), `psycopg` en requirements, estrategia CI con Postgres, cierre de §3.2–3.5 como decisiones numeradas. Criterio de cierre: `pytest backend/tests` verde + revisión 001 aplica/retrocede limpio + seed idempotente documentado.

# Design — catalogo-recursos (C-02)

## Context

Ver proposal.md (Why/What). Estado actual (verificado en explore `docs/explore/c02-catalogo-recursos.md` §2): scaffolding C-01 archivado — `backend/app/main.py` solo `GET /health` sin DB, esqueletos `agenda/`/`turnos/`/`seed/`, `docker-compose.yml` con `postgres:16` + api, sin `alembic/`, sin engine/Session/Base, sin driver Postgres en `requirements.txt`. Contrato a no romper: `openspec/specs/foundation/spec.md` (import sin DB, suite verde sin servicios). Reglas de negocio: solo `knowledge-base/05_reglas_de_negocio.md` (RN-AG/RN-TU/RN-ES); no se inventa ninguna. Governance del change: CRÍTICO (CHANGES.md prevalece).

## Goals / Non-Goals

**Goals:**

- Seis tablas de catálogo con CHECKs a nivel DB + revisión Alembic 001 reversible.
- Consultas de aplicabilidad (horario/bloqueo) listas para que C-03 las consuma sin redefinir tipos.
- Seed ficticio idempotente + suite pytest en verde con Postgres real.
- Cerrar ambigüedades del explore §3.2–§3.5 como decisiones numeradas (abajo).

**Non-Goals:**

- `Turno`, `ServicioTurnos`, endpoints/routers, 409/422 HTTP, estados, JWT/login, Redis, frontend, integraciones, lista de espera/recordatorios/HC/caja (C-03..C-11). Sin routers en C-02: modelo + seed + tests.
- `.env.example` + `docker-compose.yml`: el esquema de `DATABASE_URL` se alinea a `postgresql+psycopg://` según D11 (ver tasks T1.4); la discrepancia heredada `REDIS_URL` queda documentada como sin uso (quitarla sería un edit no aprobado).

## Decisions

### Supuesto registrado — Q1 (pregunta Alta previa al próximo change)

- **S1**: C-02 se diseña **sin autenticación, uso interno/test**; no se crea tabla de usuarios; el futuro `creado_por` queda como texto libre hasta C-11. (Q1 sigue sin confirmación PO/cátedra; no bloquea el modelado.)

### D1 — Matriz de aplicabilidad de `Bloqueo` (cierra §3.2)

- **Decisión**: las cuatro combinaciones son válidas: solo-profesional (`profesional_id` set, `sillon_id` null), solo-sillón, global (ambos null) y pareja concreta (ambos set); un bloqueo aplica a un turno candidato ssi coinciden los ids no-null y los rangos intersectan en `[inicio,fin)`; `motivo` obligatorio; `CHECK (desde < hasta)`.
- **Justificación en una línea**: cubre los tres casos de KB 04 más la pareja concreta sin ramas especiales, y C-03 la consume con un único predicado.
- **Alternativa descartada**: prohibir global o pareja concreta — recortaría casos reales (feriado total, sillón reservado a un profesional) sin simplificar nada.

### D2 — Anti-solape de `HorarioAtencion` en capa Python/servicio + test de borde (cierra §3.3)

- **Decisión**: enforcement en Python (función pura `hay_solape_config(a_desde,a_hasta,b_desde,b_hasta)` + validación en seed/servicio de catálogo) con test de adyacencia `hasta == desde` permitida; NO exclusion constraint con `btree_gist` en la 001.
- **Justificación en una línea**: evita añadir una extensión Postgres por una validación de configuración de baja contención, coherente con el borde semiabierto RN-AG-04.
- **Alternativa descartada**: exclusion constraint — más robusta ante races pero añade extensión y complejidad de migración por un riesgo inexistente en carga de config.

### D3 — Convención temporal (cierra §3.4)

- **Decisión**: `dia_semana` 0–6 con convención Python `weekday()` (0=lunes); `HorarioAtencion.desde/hasta` tipo `TIME` naive interpretado en `TZ=America/Argentina/Buenos_Aires`; `Bloqueo.desde/hasta` y futuro `Turno.inicio/fin` tipo `TIMESTAMPTZ`; múltiples filas por día permitidas (mañana/tarde partida); C-03 convertirá fecha→(día,hora) pasando el `timestamptz` a la zona `TZ` antes de comparar.
- **Justificación en una línea**: elimina la ambigüedad lunes/domingo fijando una sola convención ya disponible en Python y mantiene la comparación determinista bajo una única zona.
- **Alternativa descartada**: convención Postgres `EXTRACT(dow)` (0=domingo) — choca con el código Python que escribirá las validaciones.

### D4 — PKs UUID uniformes en las 6 tablas (cierra §3.5-PKs)

- **Decisión**: `id` UUID (`uuid4`, `CHAR(36)`/native UUID) en las seis tablas, coherente con `Paciente.id` y el futuro `Turno.id`.
- **Justificación en una línea**: uniformidad para exportación C-11 y referencias estables entre sucursales sin colisiones de secuencias.
- **Alternativa descartada**: serial por tabla — simple pero complica fusión/exportación posterior.

### D5 — Sin tabla de usuarios en C-02 (cierra §3.5-Recepcionista)

- **Decisión**: no se crea `Recepcionista/Usuario`; auditoría `creado_por` llega con C-03 como texto libre y el modelo real con C-11.
- **Justificación en una línea**: CHANGES C-02 no lo incluye y crearlo ahora adelantaría auth fuera de scope (ver S1).

### D6 — `Paciente.ficticio` como default + convención, sin CHECK (cierra §3.5-ficticio)

- **Decisión**: columna `ficticio BOOL NOT NULL DEFAULT true`, sin CHECK; seed y tests solo usan datos ficticios; la regla dura "solo ficticios" se enforcea por convención de seed/tests, no por constraint.
- **Justificación en una línea**: un CHECK `= true` impediría a futuro persistir datos reales en producción sin migración, y la regla dura ya la cubren seed/tests.
- **Alternativa descartada**: `CHECK (ficticio)` — bloquearía producción futura por un invariante que es solo del TP.

### D7 — `Paciente.contacto` texto libre sin validación de formato (cierra §3.5-contacto)

- **Decisión**: `contacto TEXT` libre (tel/email mezclados), sin validador en C-02.
- **Justificación en una línea**: KB 04 lo define como texto y no hay regla de negocio sobre su formato, así que validarlo inventaría una regla.
- **Alternativa descartada**: `email-validator`/regex — dependencia y comportamiento no pedidos por ninguna RN.

### D8 — Sin endpoints en C-02, solo modelo + seed + tests (cierra §3.5-SillonBox/activos)

- **Decisión**: `SillonBox.activo` default true, desactivar es update (soft, nunca delete con historia); ningún router FastAPI en C-02; los routers llegan con C-03/C-05.
- **Justificación en una línea**: CHANGES C-02 no pide endpoints y añadirlos adelantaría superficie HTTP sin contrato.
- **Alternativa descartada**: CRUD de catálogo — útil pero fuera de scope y sin spec que lo exija.

### D9 — `Prestacion.duracion_min` fija en v1, variable es posterior (cierra §3.5-Prestacion)

- **Decisión**: `CHECK (duracion_min > 0)`, unidad minutos enteros, fija en v1 (RN-AG-01); duraciones variables quedan para change posterior según KB 01 alcance v1.
- **Justificación en una línea**: fija lo que RN-AG-01 exige hoy sin cerrar la puerta a la evolución documentada en KB 01.
- **Alternativa descartada**: duraciones por profesional o rango — no existe RN que las pida.

### D10 — `Profesional.matricula` única incluida + DNIs seed no colisionables (cierra §3.5-matricula/seed)

- **Decisión**: `matricula TEXT UNIQUE` (ficticia) aunque CHANGES no la nombre — la exige KB 04; seed con valores sintéticos `DNI-FICT-00x` / `MAT-FICT-00x`, nunca reales.
- **Justificación en una línea**: la KB manda sobre el resumen de CHANGES en campos, y los valores sintéticos hacen imposible confundirlos con datos reales.
- **Alternativa descartada**: omitir matrícula — violaría KB 04 para ahorrar una columna.

### D11 — Driver `psycopg[binary]` (cierra §3.6-driver)

- **Decisión**: agregar `psycopg[binary]>=3.1` a `backend/requirements.txt`; `DATABASE_URL` con esquema `postgresql+psycopg://` en todos los archivos que lo declaran (`.env.example`, `docker-compose.yml`, CI) — ver tasks T1.4 para la alineación pendiente.
- **Justificación en una línea**: sin driver, `create_engine(DATABASE_URL)` falla y nada de C-02 puede conectar.
- **Alternativa descartada**: `psycopg2-binary` — funciona pero es la generación anterior; `psycopg3` es el driver mantenido.

### D12 — Ubicación de modelos: catálogo en `agenda/`, `Paciente` en `agenda/` también (cierra §3.5-ubicación)

- **Decisión**: los seis modelos viven en `backend/app/agenda/models.py` (Paciente incluido); `turnos/` no se toca en C-02.
- **Justificación en una línea**: evita crear un paquete `pacientes/` por una sola entidad y deja `turnos/` limpio para C-03.
- **Alternativa descartada**: `Paciente` en paquete propio — estructura prematura sin comportamiento propio.

### D13 — Alembic desde cero con `env.py` perezoso (cierra §3.6-alembic)

- **Decisión**: crear `backend/alembic/` (`env.py` lee `DATABASE_URL` solo en tiempo de migración, importa `Base.metadata`; naming conventions SQLAlchemy); revisión 001 solo catálogo + índices `dni`/`activo`/matrícula; índices parciales de Turno quedan para 002/C-03.
- **Justificación en una línea**: migración reversible mínima que no contamina C-02 con índices de una tabla que no existe.
- **Alternativa descartada**: `create_all` sin Alembic — perdería el historial de migraciones que C-03 necesita extender.

## Test Strategy (PostgreSQL + coexistencia con foundation)

- **Motor**: Postgres real (imagen `postgres:16`, la de Compose) con rollback transaccional por test (KB 08: "Postgres real con rollback transaccional"); nada de sqlite — los CHECKs parciales/UUID deben probarse contra el motor real.
- **Coexistencia con foundation** (`Suite base reproducible: suite verde sin servicios`): los tests de catálogo llevan marcador `integration` y fixture `db_session` que hace `pytest.skip` en colección/ejecución si Postgres no es alcanzable (sin `DATABASE_URL` o conexión rechazada); los tests foundation/health siguen corriendo sin servicios. `pytest backend/tests` en una máquina sin Postgres → verde con skips; en CI con servicio Postgres → todo ejecutado. Excepción fail-fast: con `CI=true` (fijada automáticamente por GitHub Actions) un Postgres inalcanzable SHALL hacer fallar la suite, nunca skipear — un skip silencioso en CI ocultaría que los tests de integración no corrieron.
- **Determinismo**: `TZ=America/Argentina/Buenos_Aires` fijado en CI y en fixture de tiempos; seed con valores fijos (`DNI-FICT-00x`).
- **CI** (edit aprobado): job `tests` gana `services.postgres:16` + `DATABASE_URL` apuntando al servicio + `TZ`; job `lint` sin cambios. Detalle del diff en tasks.md T8.
- **Capas**: unitarias puras (solape config, matriz de aplicabilidad — sin DB) + integración (constraints vía `IntegrityError`, seed conteos + idempotencia). Red-green con skill `tdd` en apply.

## Risks / Trade-offs

- [Risk] Tests de integración skipeados en local sin Postgres ocultan roturas → Mitigación: CI con servicio Postgres los ejecuta siempre; README indica `docker compose up -d postgres` para correr todo en local.
- [Risk] Validación de anti-solape solo en Python con race en escrituras concurrentes de config → Mitigación: carga de horarios es operativa y manual; si aparece contención, change posterior añade exclusion constraint sin cambiar specs.
- [Risk] `TIME` naive + `TIMESTAMPTZ` exige conversión disciplinada en C-03 → Mitigación: D3 fija la conversión (a zona `TZ` antes de comparar) y tests con `TZ` fija.
- [Risk] UUID como PK añade verbosidad vs serial → Mitigación: se asume por exportación C-11 (D4); sin impacto en queries del TP.

## Migration Plan

- Aplicar: `alembic upgrade head` (001 crea 6 tablas + índices); rollback: `alembic downgrade -1` (drop en orden inverso). Seed solo si `SEED_FICTICIO=true`, idempotente por upsert sobre claves únicas.
- Rollback strategy: revisión 001 reversible y aditiva — no toca nada de C-01.

## Open Questions

- Ninguna que cambie specs, enfoque o tasks. Q1 queda como supuesto S1 hasta confirmación PO/cátedra.

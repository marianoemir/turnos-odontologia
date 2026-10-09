# Tasks — catalogo-recursos (C-02)

TDD (skill `tdd`): cada task de comportamiento sigue red → green → triangulate; verificar con el comando o test indicado en la propia task. Solo datos ficticios (`DNI-FICT-00x`, `MAT-FICT-00x`). No tocar `backend/app/turnos/`, no crear routers/endpoints, no JWT/Redis/frontend.

## 1. Base de persistencia y driver

- [ ] 1.1 Agregar `psycopg[binary]>=3.1` a `backend/requirements.txt` y verificar `pip install -r backend/requirements.txt` exitoso (diseño D11).
- [ ] 1.2 Crear `backend/app/db.py` con `Base` declarativa + `get_engine()`/`get_session()` de importación perezosa (sin `DATABASE_URL` en import) y verificar `python -c "import backend.app.db"` sin env y `GET /health` 200 sin Postgres (contrato foundation intacto).
- [ ] 1.3 Agregar `backend/tests/conftest.py` con fixture `db_session` (rollback transaccional contra Postgres real, `pytest.skip` si no alcanzable — salvo con `CI=true`, donde la ausencia de Postgres SHALL fallar en lugar de skipear) + marcador `integration`, y verificar `pytest backend/tests` en verde sin Postgres (integration skipeados, foundation en verde) y `CI=true pytest backend/tests` en rojo sin Postgres (fail-fast, sin skips) — diseño Test Strategy.
- [ ] 1.4 Alinear el esquema de `DATABASE_URL` a `postgresql+psycopg://` en `.env.example` y `docker-compose.yml` (diseño D11; hoy usan `postgresql://`, que resuelve a `psycopg2` ausente y falla) y verificar que ambos archivos declaran el esquema `postgresql+psycopg://`.

## 2. Modelos del catálogo

- [ ] 2.1 Implementar `Paciente` (uuid, nombre, dni único, contacto libre, ficticio default true) + test que persiste uno válido y test que rechaza dni duplicado con `IntegrityError` (spec: Paciente).
- [ ] 2.2 Implementar `Profesional` (matrícula única ficticia) y `SillonBox` (activo default true + índice) + tests de alta válida y rechazo de matrícula duplicada con `IntegrityError` (spec: Profesional con matrícula única, scenarios alta-válida/matrícula-duplicada), default activo y listado de activos (spec: Sillón; diseño D8/D10/D12).
- [ ] 2.3 Implementar `Prestacion` con `CHECK (duracion_min > 0)` + tests de alta válida y rechazo de 0/negativo (spec: Prestación; RN-AG-01).
- [ ] 2.4 Implementar `HorarioAtencion` (`dia_semana` 0–6 convención `weekday()`, `TIME` naive, `CHECK desde < hasta`) + función pura `hay_solape_config` con validación en capa Python + tests de horario válido, rechazo `desde >= hasta` y borde adyacencia-permitida/solape-rechazado (spec: Horario; diseño D2/D3).
- [ ] 2.5 Implementar `Bloqueo` (`timestamptz`, `CHECK desde < hasta`, motivo obligatorio, matriz de aplicabilidad D1) + función pura `bloqueo_aplica(bloqueo, profesional_id, sillon_id, inicio, fin)` + tests de las 4 combinaciones y del borde `[inicio,fin)` (spec: Bloqueo; RN-AG-05).

## 3. Migración Alembic 001

- [ ] 3.1 Crear `backend/alembic/` con `env.py` (lee `DATABASE_URL` solo en migración, usa `Base.metadata`, naming conventions) y verificar `alembic history` lista la base (diseño D13).
- [ ] 3.2 Escribir revisión 001 (6 tablas + índices `dni`/`activo`/matrícula, sin índices parciales de Turno) y verificar `alembic upgrade head` y `alembic downgrade -1` limpios contra Postgres real.

## 4. Seed ficticio

- [ ] 4.1 Implementar seed tras `SEED_FICTICIO=true` (2 profesionales, 2 sillones, 3 prestaciones 20/30/60, horarios Lun–Vie 9–18 por profesional, 1 bloqueo, 3 pacientes; idempotente por upsert; sin turnos) y verificar conteos 2+2+3 tras una ejecución (spec: Seed).
- [ ] 4.2 Verificar idempotencia: ejecutar el seed dos veces y comprobar conteos sin cambios ni duplicados (spec: Seed idempotente).

## 5. Verificación integrada

- [ ] 5.1 Correr suite completa contra Postgres real (`docker compose up -d postgres` + `pytest backend/tests`) y verificar todo en verde sin skips + `GET /health` 200 con Postgres levantado y apagado.
- [ ] 5.2 Documentar en `README.md` cómo migrar (`alembic upgrade head`), cómo sembrar (`SEED_FICTICIO=true`) y cómo correr tests con/sin Postgres, y verificar cada comando documentado corriéndolo tal cual está escrito.

## 6. CI con PostgreSQL

- [ ] 6.1 Agregar servicio `postgres:16` + `DATABASE_URL` + `TZ=America/Argentina/Buenos_Aires` al job `tests` de `.github/workflows/tests.yml` (job `lint` sin cambios) y verificar el YAML con `python -c "import yaml; yaml.safe_load(open('.github/workflows/tests.yml'))"` o `gh workflow view` si está disponible.

## Workflow follow-up

- Revisar el change con checkpoints de governance CRÍTICO (datos de pacientes + base de solapes futuros) antes de aplicar.
- Ejecutar `/opsx:apply catalogo-recursos` en una nueva petición (este change es propose-only).
- Archivar con `/opsx:archive catalogo-recursos` y marcar C-02 `[x]` en CHANGES.md.

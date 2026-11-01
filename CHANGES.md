# CHANGES — Secuencia de Implementación

> Índice canónico de todos los changes del proyecto **turnos-odontologia**.
> Cada change es atómico: un agente puede implementarlo en una sesión (~4-6 horas).
> **Leer este archivo antes de ejecutar cualquier `/opsx:propose`.**

> Nota TP *(original, superada por la rectificación del 2026-10-28)*: el recorte evaluable es C-01 → C-02 → C-03 (foundation + recursos + crear turno sin solapamientos, probado con datos ficticios, sin UI obligatoria, sin integraciones). El resto es el norte MVP (D3) en changes posteriores. Sin auth con login en ningún change: uso interno/test con RBAC mínimo; login real llegaría con C-11.

> **Nota de rectificación (2026-10-28, rev. 2)** — el roadmap cubría solo backend y dejaba el frontend sin planificar. Se agregan **11 changes nuevos** (C-12 a C-22) sin tocar C-01..C-11 ni sus estados:
> - **C-12 `catalogo-recursos-api`**: C-02 modeló y sembró el catálogo pero **no expone endpoints**. Sin alta de pacientes/profesionales/sillones/prestaciones/horarios/bloqueos la UI no tiene con qué trabajar. Va antes de cualquier frontend de catálogo.
> - **FASE F (C-13..C-22)**: frontend React + TypeScript. C-13 `frontend-foundation` (shell, ruteo, contratos) y C-14 `frontend-componentes-base` (componentes, data layer, rol) son la base; C-15..C-22 son un change por capability backend. El design system aprobado vive en `frontend/design-system/` (modo `system-only`: sin mockups por change).
> - **Recorte TP actualizado**: `C-01 → C-02 → C-03 → C-12 → C-13 → C-14 → C-15 → C-16`. Pendientes del recorte: C-12, C-13, C-14, C-15, C-16.
> - **Regla de dependencia frontend**: ningún change de frontend se adelanta al endpoint que consume (regla 5 del generador de roadmap), y todo change de pantalla depende de C-13 y C-14.

> **Nota de rectificación (2026-10-28, rev. 3)** — correcciones de higiene e infraestructura, sin tocar C-01..C-11 ni sus estados:
> - **C-23 `fix-api-contenedor`** (FASE 0b, governance BAJO, depende de C-03): la imagen de la API no arranca (`Dockerfile` copia solo `app/` y ejecuta `uvicorn app.main:app`, pero el código importa `backend.app...`), `alembic` no está en la imagen, las dependencias no tienen pin y el compose hardcodea credenciales. No cambia dominio. Se puede ejecutar en paralelo con FASE 1 y conviene cerrarlo antes de C-13.
> - **C-13 ampliado** (sin renumerar): se le agregan la limpieza del scaffold de Vite (`index.html`, `README.md`, assets del template) y un job `frontend` de CI (`npm ci`, `npm run lint`, `tsc -b`, `npm run build`).
> - **Higiene del repo**: un solo badge de video en el README, `VITE_API_BASE_URL` unificado en `frontend/.env.example`, nota de que Redis entra con C-07, y `.gitattributes` con `eol=lf` para `*.sh` y `Dockerfile`.

---

## Cómo usar este documento

1. Identificar el change a implementar (verificar que sus dependencias están en `openspec/changes/archive/`).
2. Leer los docs de la knowledge-base indicados en "Leer antes".
3. Ejecutar `/opsx:propose <nombre-del-change>`.
4. Al terminar el change, archivarlo con `/opsx:archive <nombre-del-change>`.
5. Marcar el checkbox `[x]` en este archivo.

---

## Árbol de dependencias

```
C-01 foundation-setup
  └── C-02 catalogo-recursos
        ├── C-03 crear-turno-sin-solapamientos
        │     ├── C-04 cancelar-reprogramar
        │     │     ├── C-06 lista-de-espera
        │     │     ├── C-07 recordatorios-confirmacion
        │     │     └── C-08 reserva-online
        │     │
        │     ├── C-05 agenda-del-dia
        │     │
        │     ├── C-23 fix-api-contenedor (infraestructura, FASE 0b)
        │     │
        │     └── C-10 caja-pagos-os-arca
        │           └── C-11 roles-multisucursal-exportacion ──┐
        │                                                      │
        └── C-09 hc-odontograma ──────────────────────────────┘
```

### Árbol del frontend (agregado 2026-10-28)

> C-13 es la raíz del frontend y depende de C-03 (necesita contratos reales para tipar).
> C-14 (componentes base + data layer) depende solo de C-13.
> Cada change de pantalla cuelga del endpoint que consume, de C-13 y de C-14.

```
C-13 frontend-foundation            (depende de C-03)
  └── C-14 frontend-componentes-base     (C-13)
        ├── C-15 frontend-catalogo-recursos    (C-12 + C-13 + C-14)
        │     └── C-16 frontend-crear-turno    (C-13 + C-14 + C-15)
        ├── C-17 frontend-agenda-turnos        (C-04 + C-05 + C-13 + C-14)
        ├── C-18 frontend-lista-de-espera      (C-06 + C-13 + C-14)
        ├── C-19 frontend-hc-odontograma       (C-09 + C-13 + C-14)
        ├── C-20 frontend-caja-pagos           (C-10 + C-13 + C-14)
        ├── C-21 frontend-reserva-publica      (C-07 + C-08 + C-13 + C-14)
        └── C-22 frontend-admin-roles-export   (C-11 + C-13 + C-14)
```

### Paralelismo por fase

> Cada "gate" es un punto de sincronización. Los changes dentro de un grupo pueden ejecutarse en paralelo.

```
GATE 0: ninguna
  → C-01 foundation-setup (solo)

GATE 1: C-01 ✓
  → C-02 catalogo-recursos (solo)

GATE 2: C-02 ✓                        ← PRIMER FORK (3 paralelos)
  → C-03 crear-turno-sin-solapamientos [Agente A]
  → C-09 hc-odontograma                [Agente B]
  → C-12 catalogo-recursos-api         [Agente C — CRUD mecánico]

GATE 3: C-03 ✓ + C-12 ✓               ← FORK (4 paralelos)
  → C-04 cancelar-reprogramar          [Agente A]
  → C-05 agenda-del-dia                [Agente B]
  → C-13 frontend-foundation           [Agente C]
  → C-23 fix-api-contenedor            [Agente A2/B2 — infra, cierra el contenedor antes de C-13]

GATE 4: C-04 ✓ + C-05 ✓ + C-13 ✓      ← FORK (3 paralelos)
  → C-10 caja-pagos-os-arca            [Agente A]
  → C-06 lista-de-espera               [Agente B]
  → C-14 frontend-componentes-base     [Agente C]

GATE 5: C-14 ✓                        ← FORK
  → C-11 roles-multisucursal-exportacion [Agente A — C-09 y C-10 ✓]
  → C-07 recordatorios-confirmacion    [Agente B]
  → C-15 frontend-catalogo-recursos    [Agente C — si C-12 ✓]

GATE 6: C-15 ✓ + C-07 ✓
  → C-08 reserva-online                [Agente B]
  → C-16 frontend-crear-turno          [Agente C — cierra el recorte TP]
  → C-18 frontend-lista-de-espera      [Agente C2 — si C-06 ✓]

GATE 7: C-08 ✓ + C-16 ✓
  → C-17 frontend-agenda-turnos        [Agente C]
  → C-19 frontend-hc-odontograma       [Agente C2 — si C-09 ✓]
  → C-21 frontend-reserva-publica      [Agente C2 — si C-07 ✓]

GATE 8: C-11 ✓
  → C-20 frontend-caja-pagos           [Agente C — si C-10 ✓]
  → C-22 frontend-admin-roles-export   [Agente C2]
```

> `Agente C2` es un segundo agente frontend. Con solo 3 agentes, C-18..C-22 se serializan detrás de C-17.
> `Agente A2/B2` son agentes de refuerzo opcionales: `C-23` (infraestructura) puede tomarlo cualquiera que
> quede libre después de C-03, porque no comparte archivos con `C-04`/`C-05`/`C-13` (solo `Dockerfile`,
> `docker-compose.yml`, `requirements*.txt`, `.github/workflows/tests.yml` y el docstring de `main.py`).

### Camino crítico

**Backend (sin UI) — 5 changes:** `C-01 → C-02 → C-03 → C-10 → C-11`

**End-to-end con frontend (agenda operativa) — 8 changes:** `C-01 → C-02 → C-03 → C-13 → C-14 → C-15 → C-16 → C-17`

Recorte TP (con UI, actualizado 2026-10-28): `C-01 → C-02 → C-03 → C-12 → C-13 → C-14 → C-15 → C-16`.
Ya archivados: C-01, C-02, C-03. Pendientes del recorte: **C-12, C-13, C-14, C-15, C-16**.

`C-23 fix-api-contenedor` (infraestructura) **no está en el camino crítico**: depende de C-03 y no bloquea a ningún otro change, pero conviene ejecutarlo antes de C-13 para que la imagen y las migraciones estén verificadas cuando el frontend empiece a consumir la API.

### Plan óptimo con 3 agentes

```
Paso │ Agente A (Backend Core)     │ Agente B (Backend Aux/Integr.) │ Agente C (Frontend)
─────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
  1  │ C-01 foundation-setup      │ —                              │ —
  2  │ C-02 catalogo-recursos     │ —                              │ —
  3  │ C-03 crear-turno           │ C-09 hc-odontograma            │ C-12 catalogo-recursos-api
  4  │ C-04 cancelar-reprogramar  │ C-05 agenda-del-dia            │ C-13 frontend-foundation
 4b  │ C-23 fix-api-contenedor    │ — (infra, no bloquea)          │ —
  5  │ C-10 caja-pagos-os-arca    │ C-06 lista-de-espera           │ C-14 frontend-componentes-base
  6  │ C-11 roles-exportacion     │ C-07 recordatorios             │ C-15 frontend-catalogo
  7  │ —                          │ C-08 reserva-online            │ C-16 frontend-crear-turno
  8  │ —                          │ —                              │ C-17 frontend-agenda-turnos
  9  │ —                          │ —                              │ C-18 frontend-lista-de-espera
 10  │ —                          │ —                              │ C-19 frontend-hc-odontograma
 11  │ —                          │ —                              │ C-20 frontend-caja-pagos
 12  │ —                          │ —                              │ C-21 frontend-reserva-publica
 13  │ —                          │ —                              │ C-22 frontend-admin-roles-export
```

---

## FASE 0 — Cimientos

### [C-01] `foundation-setup`
- **Estado**: `[x]` archivado (2026-10-08)
- **Scope**: Scaffolding backend Python + base testeable con datos ficticios (US-001..US-003 como norte, no implementadas acá)
  - Estructura `backend/app/turnos/`, `backend/app/agenda/`, `backend/app/seed/`, `backend/tests/` + `docker-compose.yml` (api + postgres) según `08_arquitectura_propuesta.md` §Estructura
  - Python 3.12 + FastAPI + pytest configurados, 1 test dummy en verde (`pytest`)
  - `backend/requirements.txt` (fastapi, uvicorn, sqlalchemy, alembic, pytest, httpx)
  - `.env.example` con `TZ`, `DATABASE_URL` (postgres), `SECRET_KEY` (ficticia), `SEED_FICTICIO` (sin secretos reales)
  - `README.md` reproducible (cómo levantar con Compose, cómo correr tests, datos ficticios)
  - CI mínima (1 job: tests con Python + pytest) si el repo usa GitHub Actions
  - Tests: dummy verde
- **Dependencias**: ninguna
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Recorte — primer change
  - `knowledge-base/02_descripcion_general.md` §Stack tecnológico
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno

---

### [C-02] `catalogo-recursos`
- **Estado**: `[x]` archivado (2026-10-09)
- **Scope**: Entidades referenciadas por Turno + seed ficticio (sin Turno todavía)
  - Modelos SQLAlchemy: `Paciente` (dni único), `Profesional`, `SillonBox` (activo), `Prestacion` (duracion_min > 0 fija), `HorarioAtencion` (desde < hasta, sin solape mismo profesional/día), `Bloqueo` (profesional/sillón nullable, desde < hasta)
  - Alembic revisión 001: tablas del catálogo + índices (`dni`, `activo`)
  - Seed ficticio: 2 profesionales, 2 sillones, 3 prestaciones (20/30/60 min), horarios Lun–Vie 9–18, 1 bloqueo, 3 pacientes ficticios
  - Tests pytest: constraints (dni único, duración > 0, sillón activo, horario desde < hasta), seed carga 2+2+3
- **Dependencias**: C-01
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §Paciente
  - `knowledge-base/04_modelo_de_datos.md` §Prestacion
  - `knowledge-base/04_modelo_de_datos.md` §Seed data inicial
  - `knowledge-base/09_decisiones_y_supuestos.md` §DD-05

---

## FASE 0b — Correcciones de infraestructura (agregada 2026-10-28)

> C-01 dejó defectos que solo se ven al construir la imagen, no con `uvicorn` desde el host:
> el `Dockerfile` copia únicamente `app/` y arranca con `uvicorn app.main:app` mientras el código
> importa `from backend.app...`, `alembic` no está en la imagen, las dependencias no tienen pin y las
> credenciales de Postgres están hardcodeadas en el compose. **Corrige infraestructura, no dominio**:
> no cambia modelos, endpoints ni reglas de negocio. Depende de C-03 (ya archivado), así que puede
> ejecutarse en paralelo con cualquier change pendiente de FASE 1.

### [C-23] `fix-api-contenedor`
- **Estado**: `[ ]` pendiente
- **Scope**: Dejar la API reproducible en contenedor (build + arranque + migraciones + configuración por entorno)
  - **Problema**: `backend/Dockerfile` copia solo `app ./app` y ejecuta `uvicorn app.main:app`, pero `backend/app/main.py` importa `from backend.app.turnos.router import ...`; dentro de la imagen el paquete `backend` no existe y el contenedor no arranca. Además la imagen no incluye `alembic.ini` ni `alembic/`, así que las migraciones no se pueden correr adentro. **Verificación**: `docker compose up --build -d api` deja el servicio `api` arriba sin reinicios y `GET http://localhost:8000/health` responde `200 {"status":"ok"}` (`curl -s -o /dev/null -w "%{http_code}"`), más `docker compose exec api python -c "import backend.app.main"` sin error
  - **Corrección del `Dockerfile`**: construir con el root del repo como contexto (`build.context: .` + `dockerfile: backend/Dockerfile`), copiar `backend/` completo (app + `alembic/` + `alembic.ini` + requirements) y arrancar con `uvicorn backend.app.main:app`; el `.dockerignore` debe excluir `frontend/`, `.venv`, `__pycache__`, `*.pyc`, `.git` y `docs/`. **Dejar registrado** el `WORKDIR` elegido: el proceso corre desde el root del repo para que `backend/` sea importable y `alembic.ini` resuelva `script_location = alembic` (`backend/alembic.ini` → verificar la ruta relativa y ajustarla si hace falta). **Verificación**: además del health, `docker compose exec api python -m alembic -c backend/alembic.ini current` devuelve la revisión aplicada, `... upgrade head` es idempotente (segunda corrida informa que está al día) y `... downgrade -1` + `... upgrade head` funciona dentro del contenedor
  - **Corrección del docstring de `backend/app/main.py`**: hoy dice `"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""` cuando ya monta el router de turnos (con DB y SQLAlchemy). Reemplazarlo por una descripción real de la app y de los routers montados. **Verificación**: revisión manual + `ruff check backend/` en verde; el docstring deja de mencionar "solo /health" y "sin DB"
  - **Versiones de dependencias**: fijar `backend/requirements.txt` con `==` en todas las dependencias de runtime y separar `pytest` y `ruff` en `backend/requirements-dev.txt` (que incluye `-r requirements.txt`). Los pins salen de `pip freeze` del entorno con el que se ejecuta el proyecto; hoy el repo **no tiene `.venv`**, así que el implementador debe crearlo (`py -3.13 -m venv .venv`), instalar y re-congelar antes de fijar. Referencia medida en `py -3.13`: `fastapi==0.143.0`, `sqlalchemy==2.1.4`, `alembic==1.20.0`, `psycopg[binary]==3.3.6`, `uvicorn==0.54.0`, `httpx==0.28.1`, `tzdata==2026.5`, `pytest==9.1.1`, `ruff==0.17.0`. Alinear la versión de Python: hoy el `Dockerfile` y el CI usan 3.12 y los pins se midieron en 3.13 → fijar una sola versión y usarla en ambos. **Verificación**: `pip install -r backend/requirements.txt -r backend/requirements-dev.txt` en un venv limpio en verde; `docker compose build api` instala solo runtime; `pytest -rs backend/tests` y `ruff check backend/` en verde con los dos archivos
  - **Compose por entorno**: leer credenciales de Postgres y `TZ` desde variables de entorno con defaults ficticios — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `TZ` con `${VAR:-valor_ficticio}` en `docker-compose.yml`, reutilizadas en el healthcheck y en el `DATABASE_URL` del servicio `api` (sin credenciales reales ni secretos escritos). **Verificación**: `docker compose config` muestra la interpolación resuelta; `docker compose up -d postgres` con los defaults levanta la base y `docker compose ps` la reporta `healthy`; con `POSTGRES_DB=turnos_test POSTGRES_USER=otro docker compose config` el `DATABASE_URL` de `api` refleja esos valores; `git grep -i "password"` sobre archivos versionados no muestra secretos reales (solo defaults ficticios y `${VAR}`)
  - **README y CI**: actualizar el README (instalación con `requirements.txt` + `requirements-dev.txt`, y cómo correr migraciones dentro del contenedor) y los **dos** jobs de `.github/workflows/tests.yml` para instalar ambos archivos — el job `tests` necesita `pytest`, que a partir de este change vive en el dev file, y el job `lint` necesita `ruff`, también ahí. **Verificación**: los dos jobs de CI en verde en un push de prueba, y un lector siguiendo el README llega a `GET /health` 200 con `docker compose up --build` sin pasos no documentados
- **Dependencias**: C-03
- **Governance**: BAJO
- **Leer antes**:
  - `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `.dockerignore` (si existe)
  - `backend/app/main.py` y `backend/app/turnos/router.py`
  - `backend/alembic.ini` §script_location y `backend/alembic/env.py`
  - `README.md` §1 Clonar e instalar, §3 Levantar PostgreSQL, §4 Migrar
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno
  - `.github/workflows/tests.yml`

---

## FASE 1 — Núcleo agenda (TP)

> C-04 y C-05 son paralelos tras C-03. El evaluable mínimo cierra en C-03.

### [C-03] `crear-turno-sin-solapamientos`
- **Estado**: `[x]` archivado (2026-10-10)
- **Scope**: US-001 completa — núcleo del TP (RN-AG-01..05, RN-ES-02), backend FastAPI + pytest
  - Modelo SQLAlchemy `Turno`: `paciente_id`, `profesional_id`, `sillon_id NOT NULL`, `prestacion_id`, `inicio`, `fin = inicio + duracion`, `estado`, `creado_por`
  - `ServicioTurnos.crear(...)` único punto de validación + `POST /turnos` (FastAPI): calcula fin, exige sillón, verifica horario + bloqueo, busca solapes `[inicio,fin)` en turnos activos mismo profesional y mismo sillón; 201 pendiente | 409 `HTTPException` con causa (`profesional|sillon|horario|bloqueo`) | 422 Pydantic/sin sillón
  - Alembic revisión 002: tabla turno + índices parciales (`profesional_id,inicio,fin` y `sillon_id,inicio,fin` donde estado en pendiente/confirmado; `paciente_id,inicio`)
  - Tests pytest (red-green, skill `tdd`): crear ok, solape profesional 409, solape sillón 409, borde inicio==fin acepta (RN-AG-04), sin sillón 422, fuera de horario 409, sobre bloqueo 409, nada creado en 409
- **Dependencias**: C-02
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-001
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Agenda
  - `knowledge-base/04_modelo_de_datos.md` §Turno

---

### [C-04] `cancelar-reprogramar`
- **Estado**: `[ ]` pendiente
- **Scope**: US-002 — libera y reutiliza horario (RN-TU-01/02, RN-ES-01)
  - `POST /turnos/{id}/cancelar`: pendiente/confirmado → cancelado; 409 si atendido/ausente/cancelado
  - `POST /turnos/{id}/reprogramar`: valida nuevo inicio igual que crear; si falla conserva original intacto (RN-TU-02)
  - Cancelado/ausente excluidos de solape (verificar con test: hueco reutilizable tras cancelar)
  - Tests: cancelar libera (crear mismo slot ok), reprogramar ok, reprogramar con conflicto 409 + original intacto, transición inválida 409
- **Dependencias**: C-03
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-002
  - `knowledge-base/07_flujos_principales.md` §Flujo 2
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Turno — ciclo de vida
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Estados

---

### [C-05] `agenda-del-dia`
- **Estado**: `[ ]` pendiente
- **Scope**: US-003 — lectura de agenda del odontólogo (solo lectura)
  - `GET /agenda?profesional={id}&fecha={yyyy-mm-dd}`: turnos ordenados por inicio con paciente, prestación, sillón, estado
  - 404 profesional inexistente, 422 fecha inválida
  - Tests: orden por inicio, campos completos, día vacío → lista vacía, 404/422
- **Dependencias**: C-03
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-003
  - `knowledge-base/07_flujos_principales.md` §Flujo 3
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/04_modelo_de_datos.md` §Turno

---

## FASE 2 — Paciente y recordatorios (posterior al TP)

> C-06, C-07 y C-08 son paralelos tras C-04. Ninguno entra en el recorte TP.

### [C-06] `lista-de-espera`
- **Estado**: `[ ]` pendiente
- **Scope**: US-004 — rellena cancelaciones (criterio de orden pendiente de Q5, proponer FIFO por defecto)
  - Modelo `ListaEspera`: `paciente_id`, `profesional_id` (nullable), `prestacion_id`, `creado_en`, `estado` (pendiente|ofrecido|asignado|baja)
  - `POST /lista-espera`, `GET /lista-espera?profesional=`, `POST /lista-espera/{id}/ofrecer` (crea turno vía C-03; si acepta → asignado, si rechaza → siguiente)
  - Tests: alta en lista, ofrecer hueco crea turno válido, rechazo pasa al siguiente, orden FIFO
- **Dependencias**: C-04
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-004
  - `knowledge-base/07_flujos_principales.md` §Flujo 4
  - `knowledge-base/10_preguntas_abiertas.md` §Q5
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Turno — ciclo de vida

---

### [C-07] `recordatorios-confirmacion`
- **Estado**: `[ ]` pendiente
- **Scope**: US-005 — recordatorios con confirmación en 1 toque (WhatsApp entra acá, primera integración externa)
  - Modelo `Recordatorio`: `turno_id`, `canal` (whatsapp|email), `estado` (pendiente|enviado|confirmado|cancelado), `token_1toque`
  - Job 48/24h: envía recordatorio; link `POST /confirmar/{token}` → confirmado, `POST /cancelar/{token}` → cancelado (libera vía C-04)
  - `WHATSAPP_TOKEN` solo vía env, cupo incluido; sin token → fallback email/log (tests sin red)
  - Tests: envío programa, confirmación 1 toque, cancelación libera hueco, sin token no rompe
- **Dependencias**: C-04
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/02_descripcion_general.md` §Integraciones externas
  - `knowledge-base/07_flujos_principales.md` §Flujo 2
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno

---

### [C-08] `reserva-online`
- **Estado**: `[ ]` pendiente
- **Scope**: US-006 — reserva 24/7 por link + confirmación/cancelación en 1 toque (primeras rutas públicas)
  - `GET /reservar/{profesional}?prestacion=&fecha=` (slots reales: horario − bloqueos − turnos activos)
  - `POST /reservar`: crea pendiente vía validación C-03 (rate limit por IP); links de confirmación/cancelación que reutilizan C-07
  - Tests: slots excluyen ocupados/bloqueos, crear ok, solape 409, rate limit, links públicos sin login
- **Dependencias**: C-04
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §Rutas públicas
  - `knowledge-base/06_funcionalidades.md` §Épica 5
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Agenda

---

## FASE 3 — Clínico, cobros y cierre (posterior al TP)

> C-09 es paralelo a todo FASE 1 (solo necesita C-02). C-10 corre paralelo a C-04/C-05. C-11 cierra.

### [C-09] `hc-odontograma`
- **Estado**: `[ ]` pendiente
- **Scope**: HC mínima + odontograma FDI + planes/presupuestos atados a piezas (sin PACS/CDSS: etapas posteriores)
  - Modelos: `HistoriaClinica` (paciente_id único), `Odontograma` (pieza FDI, estado de 18 estados DentalSoft como referencia, profesional+fecha), `PlanTratamiento` (pieza, prestación, estado, presupuesto)
  - Endpoints CRUD HC + odontograma por paciente + plan con cobertura OS aplicada (lectura, sin liquidar)
  - Migración 003: tablas clínicas
  - Tests: CRUD, historial por pieza con profesional+fecha, presupuesto suma piezas
- **Dependencias**: C-02
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/04_modelo_de_datos.md` §Dominios
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/10_preguntas_abiertas.md` §Q7

---

### [C-10] `caja-pagos-os-arca`
- **Estado**: `[ ]` pendiente
- **Scope**: Caja diaria + Mercado Pago + OS + factura ARCA (pagos: governance máxima)
  - Modelos: `Caja` (apertura/cierre diario, arqueo), `Cobro` (turno_id, medio, monto centavos, estado), `LiquidacionOS` (nomenclador, cobertura/copago, PDF)
  - `POST /caja/abrir|cerrar`, `POST /cobros` (efectivo/tarjeta/transf/MP/OS), `POST /cobros/{id}/factura-arca` (B/C CAE+QR), `GET /liquidaciones-os`
  - `MP_ACCESS_TOKEN`, `ARCA_CERT` solo env; sin credenciales → modo simulado marcado explícito (tests sin red)
  - Migración 004: tablas caja/cobros/liquidaciones
  - Tests: apertura/cierre/arqueo, cobro por medio, seña vinculada a reserva, factura simulada, liquidación PDF, anulación trazable
- **Dependencias**: C-03
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/02_descripcion_general.md` §Integraciones externas
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Excepciones globales

---

### [C-11] `roles-multisucursal-exportacion`
- **Estado**: `[ ]` pendiente
- **Scope**: Cierre producción — roles, multi-sucursal básico, exportación total, migración asistida
  - Modelos: `Rol`, `Sucursal`, `UsuarioSucursal`; `PermissionContext`: `require_role()`, `require_admin()` (primer login real acá si se exige)
  - `GET /export` — pacientes + HC + agenda + caja en 1 clic (contrato de salida 30 días documentado en README)
  - Migración asistida desde planilla (script `import_planilla.*` + guía en español)
  - Migración 005: roles/sucursales
  - Tests: aislamiento por sucursal, permisos por rol, exportación incluye los 4 dominios, import planilla idempotente
- **Dependencias**: C-09, C-10
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` (completo)
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/04_modelo_de_datos.md` §Dominios

---

## FASE 1b — API de catálogo (agregada 2026-10-28)

> C-02 creó los modelos y el seed del catálogo, pero **no expone endpoints**. Esta fase cierra ese hueco:
> sin ella no hay forma de dar de alta pacientes, profesionales, sillones, prestaciones, horarios ni
> bloqueos desde la UI, y los turnos solo podrían crearse contra datos de seed.

### [C-12] `catalogo-recursos-api`
- **Estado**: `[ ]` pendiente
- **Scope**: API CRUD del catálogo ya modelado en C-02 (sin cambios de esquema)
  - **Criterio único de actualización: `PATCH` en todos los recursos, pacientes incluido.** Razón: la UI edita por campo y hace toggles de `activo` sin reenviar el objeto completo; `PATCH` parcial es idempotente con el mismo body y evita pisar campos que el formulario no tocó (un `PUT` obligaría a un round-trip de lectura previa y a reenviar relaciones).
  - `GET/POST /pacientes`, `PATCH /pacientes/{id}` — `dni` único → 409 `duplicate_dni`; búsqueda `?q=` por nombre o dni con paginación (`limit`/`offset`)
  - `GET/POST /profesionales`, `PATCH /profesionales/{id}` (incluye `activo`)
  - `GET/POST /sillones`, `PATCH /sillones/{id}` — baja lógica por `activo=false`, nunca hard delete
  - `GET/POST /prestaciones`, `PATCH /prestaciones/{id}` — `duracion_min > 0` → 422 si no
  - `GET/POST /horarios-atencion`, `PATCH /horarios-atencion/{id}` — `desde < hasta` → 422; solape del mismo profesional/día → 409
  - `GET/POST /bloqueos`, `DELETE /bloqueos/{id}` — profesional y/o sillón nullable; `desde < hasta` → 422
  - Schemas Pydantic request/response separados de los modelos SQLAlchemy; los `PATCH` usan un schema de actualización parcial (todos los campos opcionales) y solo aplican las claves presentes en el body; listados devuelven solo activos salvo `?incluir_inactivos=true`
  - Sin migración nueva: la revisión 001 de C-02 ya cubre las tablas
  - Tests pytest: CRUD de cada recurso, `PATCH` parcial actualiza solo los campos enviados y conserva el resto, `PATCH` con body vacío no modifica nada, dni duplicado 409 también en `PATCH`, `duracion_min <= 0` 422, `desde >= hasta` 422, horario solapado 409, recurso inactivo excluido de listados por defecto
- **Dependencias**: C-02
- **Governance**: ALTO — escribe las entidades core que referencian todos los turnos
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §Paciente
  - `knowledge-base/04_modelo_de_datos.md` §Prestacion
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Agenda (RN-AG-05)

---

## FASE F — Frontend (agregada 2026-10-28)

> Frontend React 19 + TypeScript + Vite, ya scaffoldeado en `frontend/`. Dos changes base (C-13 y C-14)
> y después un change por capability backend (C-15..C-22).
> **Design system**: `frontend/design-system/` aprobado (`Revision: 1`, `Mode: system-only`) — se consume,
> no se rediseña; no hay mockup por change. Toda pantalla nueva traduce los componentes de
> `frontend/design-system/components.html` a React con los mismos tokens y clases.
> Regla dura: ningún change de frontend se adelanta al endpoint que consume.

### [C-13] `frontend-foundation`
- **Estado**: `[ ]` pendiente
- **Scope**: Base ejecutable del frontend: shell, ruteo y contratos (sin componentes de UI ni pantallas de negocio)
  - **Cableado del design system**: importar `frontend/design-system/tokens.css` desde `frontend/src/main.tsx` con la ruta relativa `../design-system/tokens.css`; verificar que los tokens se aplican en `npm run dev` (color de fondo y tipografía reales, no los del scaffold de Vite) y que el build de Docker los incluye
  - `react-router-dom`: rutas `/`, `/turnos/nuevo`, `/agenda`, `/catalogo/*`, `/lista-espera`, `/hc/:pacienteId`, `/caja`, `/admin`, `/reservar/:profesional`, `/confirmar/:token`, `/cancelar/:token`; `NotFound` y `ErrorBoundary`
  - Layout shell: nav lateral + topbar, tomado de `components.html`, responsive ≤46rem
  - Cliente HTTP tipado (`fetch` wrapper): `VITE_API_BASE_URL`, parseo de error del backend (`409` con `causa: profesional|sillon|horario|bloqueo`, `422` de validación) → objeto de error de dominio, sin `any`, timeout y abort
  - Tipos TS espejo de los schemas Pydantic de C-12 y C-03 (`Paciente`, `Profesional`, `SillonBox`, `Prestacion`, `HorarioAtencion`, `Bloqueo`, `Turno`, `EstadoTurno`)
  - `frontend/Dockerfile` multi-stage (node build → nginx) + servicio `web` en `docker-compose.yml` con `VITE_API_BASE_URL`; `.env.example` del frontend
  - **Limpieza del scaffold de Vite**: reemplazar el `<title>` de `frontend/index.html` por el nombre del producto tomado de `frontend/design-system/brand.js` (`Agenda Odontológica`); reescribir `frontend/README.md` (dejar de describirlo como "estructura base sin funcionalidad" y documentar scripts, estructura, variables de entorno y cómo correrlo); eliminar los archivos del template que ya no se usen: `frontend/src/App.css`, `frontend/src/assets/hero.png`, `frontend/src/assets/react.svg`, `frontend/src/assets/vite.svg` y `frontend/public/icons.svg` (conservar `frontend/public/favicon.svg`, referencia vigente de `index.html`). Verificación: `tsc -b` y `npm run build` en verde después de borrarlos, y `grep` sin referencias colgadas a los archivos eliminados
  - **CI del frontend**: agregar un job `frontend` en `.github/workflows/tests.yml` con `actions/setup-node` (versión de Node acorde a `frontend/package.json`, caché `npm` sobre `frontend/package-lock.json`), `npm ci`, `npm run lint`, `tsc -b` y `npm run build`, ejecutado desde `frontend/`; el job debe fallar si cualquiera de los cuatro pasos falla
  - Tests: Vitest + Testing Library configurados (jsdom, setup global, un test por helper); render del shell, mapeo `409`/`422` → mensaje de dominio; `npm run lint` y `tsc -b` en verde
- **Dependencias**: C-03
- **Governance**: MEDIO
- **Leer antes**:
  - `frontend/design-system/README.md` (completo) §Cómo se consume
  - `frontend/design-system/components.html` §navegación (solo para el shell)
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios
  - `knowledge-base/02_descripcion_general.md` §Stack tecnológico
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos

---

### [C-14] `frontend-componentes-base`
- **Estado**: `[ ]` pendiente
- **Scope**: Librería de componentes y capa de datos del frontend (consume C-13)
  - Componentes base React, traducidos de `components.html` sin redefinir tokens: `Button` (primario/secundario/destructivo), `TextField` (label, help, error, `aria-invalid`), `Select`, `Card`, `EstadoBadge` (5 estados: pendiente, confirmado, atendido, ausente, cancelado — color + texto + forma del punto), `DataTable` (responsive a filas en grilla ≤46rem, orden y vacío), `Modal` (focus trap, `Escape`, retorno de foco), `Toast` (`role="status"`, auto-descarte pausable), `EmptyState`, `Skeleton`
  - Estado de servidor con TanStack Query: `QueryClient` configurado una vez, claves de query por recurso, invalidación tras mutación
  - Formularios con react-hook-form + zod: schemas espejo de las validaciones del backend (dni, `duracion_min > 0`, `desde < hasta`), mapeo de `422` a campos
  - **Contexto de rol sin login (supuesto de implementación, no regla de negocio)**: `knowledge-base/03_actores_y_roles.md` define dos roles internos con permisos distintos — Recepción escribe turnos y lee toda la agenda; Odontólogo solo lee su agenda y su horario — y el primer change no tiene login ni rutas públicas. Como la identidad de sesión recién llega con C-11, la UI necesita un rol explícito para no inventar un privilegio implícito y para poder probar ambas perspectivas. Se implementa como selector visible (Recepción | Odontólogo) con aviso de "modo interno/test", persistido en `localStorage`, y guard de ruta que solo oculta/navega según la matriz. **No es un control de seguridad**: la autorización real es del backend; al llegar C-11 el guard pasa a leer la identidad de sesión. La KB no regula este selector, por eso queda como supuesto del change.
  - Tests RTL: render y estados de cada componente, `EstadoBadge` con los 5 estados y sus etiquetas, `DataTable` vacía y con skeleton, `Modal` atrapa foco y cierra con `Escape`, `Toast` anunciado como `status`, zod bloquea submit inválido, guard redirige según rol
- **Dependencias**: C-13
- **Governance**: MEDIO
- **Leer antes**:
  - `frontend/design-system/components.html` (formularios, card de turno, tabla, modal, toast, vacío, esqueletos)
  - `frontend/design-system/tokens.css` §estados de turno
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Estados
  - `knowledge-base/06_funcionalidades.md` §US-001, §US-002, §US-003

---

### [C-15] `frontend-catalogo-recursos`
- **Estado**: `[ ]` pendiente
- **Scope**: Pantallas de administración del catálogo (consume C-12)
  - `/catalogo/pacientes`: tabla con búsqueda por nombre/dni, alta y edición en modal o ruta, error `409 duplicate_dni` mapeado al campo `dni`
  - `/catalogo/profesionales`: tabla + alta/edición + toggle `activo` con confirmación
  - `/catalogo/sillones`: tabla + alta + toggle `activo`; aviso explícito de que desactivar no borra turnos
  - `/catalogo/prestaciones`: alta/edición con `duracion_min` validado en cliente y servidor
  - `/catalogo/horarios`: editor por profesional y día (Lun–Vie por seed), validación `desde < hasta` y solape `409`
  - `/catalogo/bloqueos`: alta con profesional y/o sillón, rango `desde`/`hasta`, listado y eliminación
  - Invalidación de queries de TanStack Query tras cada mutación; optimistic update solo donde el backend lo permita
  - Tests RTL: alta de paciente, dni duplicado muestra error de campo, duración inválida bloquea submit, desactivar sillón pide confirmación
- **Dependencias**: C-12, C-13, C-14
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §Paciente
  - `knowledge-base/04_modelo_de_datos.md` §Prestacion
  - `knowledge-base/04_modelo_de_datos.md` §Seed data inicial
  - `knowledge-base/06_funcionalidades.md` §Épica 1
  - `frontend/design-system/README.md` §Cómo se consume

---

### [C-16] `frontend-crear-turno`
- **Estado**: `[ ]` pendiente
- **Scope**: US-001 en UI — cierra el recorte TP
  - `/turnos/nuevo`: wizard de una pantalla con paciente (buscador), profesional, prestación, sillón y fecha/hora
  - Cálculo de `fin` en vivo a partir de `duracion_min` de la prestación, mostrado antes de confirmar
  - Selector de horario acotado al horario de atención del profesional y sin bloqueos (lectura de C-12), sin pretender reemplazar la validación del backend
  - Manejo explícito de `409` por causa: mensaje distinto para `profesional`, `sillon`, `horario` y `bloqueo`; `422` mapeado a los campos del formulario
  - Éxito: card de turno en estado `pendiente` con resumen y acción "crear otro"
  - Nunca reintentar automáticamente un `409` (evita duplicar turnos)
  - Tests RTL: happy path crea y muestra `pendiente`, `409 profesional` y `409 sillón` muestran causas distintas, borde `inicio == fin` se acepta, `422` sin sillón marca el campo
- **Dependencias**: C-13, C-14, C-15
- **Governance**: ALTO — es el núcleo del TP y las reglas de solape se hacen visibles al usuario
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-001
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Agenda
  - `knowledge-base/04_modelo_de_datos.md` §Turno
  - `frontend/design-system/components.html` §card de turno, formularios

---

### [C-17] `frontend-agenda-turnos`
- **Estado**: `[ ]` pendiente
- **Scope**: US-002 + US-003 en UI
  - `/agenda`: filtros profesional + fecha (default hoy), turnos ordenados por inicio con paciente, prestación, sillón y estado
  - Tabla responsive: en ≤46rem pasa a filas en grilla con la línea de detalle (patrón de `components.html`)
  - Acción cancelar: modal de confirmación, `POST /turnos/{id}/cancelar`, refresco de la agenda
  - Acción reprogramar: selección de nuevo inicio, validación contra C-04, si el backend responde `409` se muestra la causa y **el turno original sigue visible e intacto**
  - Transiciones inválidas (`atendido`/`ausente`/`cancelado`) no ofrecen acciones: se muestran deshabilitadas con motivo
  - Empty state del día sin turnos
  - Tests RTL: orden por inicio, día vacío, cancelar libera la fila, reprogramar con conflicto conserva el turno original, acciones deshabilitadas por estado
- **Dependencias**: C-04, C-05, C-13, C-14
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-002, §US-003
  - `knowledge-base/07_flujos_principales.md` §Flujo 2, §Flujo 3
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Turno — ciclo de vida
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Estados

---

### [C-18] `frontend-lista-de-espera`
- **Estado**: `[ ]` pendiente
- **Scope**: US-004 en UI (consume C-06)
  - `/lista-espera`: tabla ordenada FIFO por `creado_en`, filtro por profesional
  - Alta en lista: paciente, profesional opcional, prestación
  - Acción "ofrecer hueco": elegir turno cancelado/hueco, crear turno vía C-06; estados `ofrecido` → `asignado` o pasa al siguiente
  - Rechazo explícito del ofrecimiento con motivo; historial de asignaciones
  - Tests RTL: alta, orden FIFO respetado, ofrecer crea turno válido, rechazo avanza al siguiente
- **Dependencias**: C-06, C-13, C-14
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-004
  - `knowledge-base/07_flujos_principales.md` §Flujo 4
  - `knowledge-base/10_preguntas_abiertas.md` §Q5 (criterio de orden)
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Turno — ciclo de vida

---

### [C-19] `frontend-hc-odontograma`
- **Estado**: `[ ]` pendiente
- **Scope**: HC y odontograma en UI (consume C-09)
  - `/hc/:pacienteId`: datos del paciente (solo lectura desde catálogo), historia clínica editable con permisos por rol
  - Odontograma FDI: SVG de 32 piezas, cada pieza con estado y color por token; **navegable por teclado** (roving tabindex), `aria-label` por pieza (`"Pieza 16, superior derecha, estado caries"`), sin depender solo del color
  - Panel de pieza: historial con profesional y fecha, alta de estado, prestación asociada
  - Plan de tratamiento y presupuesto: suma de piezas, cobertura OS aplicada en lectura (sin liquidar)
  - Tests RTL: selección de pieza por teclado, cambio de estado persiste, historial ordenado por fecha, presupuesto suma piezas
- **Dependencias**: C-09, C-13, C-14
- **Governance**: ALTO — datos clínicos; errores de estado de pieza son riesgo real
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §Dominios
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/06_funcionalidades.md` (épica clínica)
  - `knowledge-base/10_preguntas_abiertas.md` §Q7

---

### [C-20] `frontend-caja-pagos`
- **Estado**: `[ ]` pendiente
- **Scope**: Caja y cobros en UI (consume C-10)
  - `/caja`: apertura y cierre diario con arqueo (esperado vs contado, diferencia destacada), historial de cajas
  - Cobro de turno: medio (efectivo/tarjeta/transferencia/MP/OS), monto en centavos, seña vinculada a reserva
  - Factura ARCA: acción explícita, estado simulado marcado visiblemente cuando no hay credenciales
  - Liquidaciones OS: listado y descarga de PDF
  - Anulación con motivo obligatorio y rastro visible; confirmaciones irreversibles con doble paso
  - **Nunca** exponer `MP_ACCESS_TOKEN` ni `ARCA_CERT` en el bundle: todo pasa por el backend
  - Tests RTL: apertura/cierre, arqueo con diferencia, cobro por medio, anulación pide motivo, factura simulada se marca
- **Dependencias**: C-10, C-13, C-14
- **Governance**: CRITICO — pagos y comprobantes fiscales
- **Leer antes**:
  - `knowledge-base/02_descripcion_general.md` §Integraciones externas
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Excepciones globales
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno

---

### [C-21] `frontend-reserva-publica`
- **Estado**: `[ ]` pendiente
- **Scope**: Rutas públicas sin login: reserva + confirmación/cancelación en 1 toque (consume C-07 y C-08)
  - `/reservar/:profesional`: elegir prestación y fecha → slots reales (horario − bloqueos − turnos activos); alta `pendiente` con rate limit y feedback de `409`
  - `/confirmar/:token` y `/cancelar/:token`: páginas públicas de un solo toque de C-07, con estado de resultado explícito (`confirmado`, `cancelado`, `expirado`, `ya usado`) y sin requerir login
  - Mobile-first real: es la pantalla que abre el paciente desde WhatsApp; objetivos táctiles ≥44px, sin dependencia de hover
  - Datos personales mínimos, sin mostrar datos de otros pacientes; `noindex` en rutas con token
  - Tests RTL: slots excluyen ocupados y bloqueos, alta exitosa, `409` muestra alternativa, confirmar/cancelar con token válido y con token vencido
- **Dependencias**: C-07, C-08, C-13, C-14
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §Rutas públicas
  - `knowledge-base/06_funcionalidades.md` §Épica 5
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1

---

### [C-22] `frontend-admin-roles-export`
- **Estado**: `[ ]` pendiente
- **Scope**: Administración y cierre en UI (consume C-11)
  - `/admin/roles`: alta/edición de roles y asignación de permisos por capability
  - `/admin/sucursales`: alta de sucursal y asignación usuario–sucursal; el selector de sucursal activa filtra toda la app
  - `/admin/usuarios`: alta/edición, rol, sucursales; primer login real si C-11 lo define
  - Exportación en 1 clic: descarga del archivo de C-11, con contrato de salida a 30 días visible antes de descargar
  - Importación de planilla: preview de filas, resumen de aceptadas/rechazadas y resultado idempotente
  - Rutas protegidas por `require_admin` en el cliente **y** respaldo del backend (nunca solo en el cliente)
  - Tests RTL: guard de admin, aislamiento por sucursal en listados, exportación dispara descarga, importación muestra resumen
- **Dependencias**: C-11, C-13, C-14
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` (completo)
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/04_modelo_de_datos.md` §Dominios

---

> **Estado del roadmap al 2026-10-28 (rev. 3)**: 23 changes. Archivados: C-01, C-02, C-03. Pendientes: 20.
> Ningún change de frontend está implementado ni marcado; C-23 `fix-api-contenedor` está pendiente y no implementado.
> Próximo paso del recorte TP: `/opsx:propose C-12-catalogo-recursos-api` (o `C-23-fix-api-contenedor`, que no bloquea).

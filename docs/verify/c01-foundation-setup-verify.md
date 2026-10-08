# Verify C-01 foundation-setup — verificación manual pre-archive

Fecha (UTC): 2026-10-08 · Entorno: Windows, Python 3.13.7, pytest 9.1.1, fastapi 0.143.0, ruff 0.16.10
Change: `openspec/changes/c-01-foundation-setup/` · Spec: `specs/foundation/spec.md` (2 requirements, 3 escenarios)
Regla: solo lectura + este reporte. No se modificó código. No se commiteó.

## 1. Comandos corridos y salidas reales

### 1.1 `python -m pytest backend/tests -v` → VERDE
```
platform win32 -- Python 3.13.7, pytest-9.1.1
collected 3 items
backend/tests/test_dummy.py::test_backend_package_importable PASSED      [ 33%]
backend/tests/test_health.py::test_health_responde_ok PASSED             [ 66%]
backend/tests/test_health.py::test_health_sin_base_de_datos PASSED       [100%]
3 passed, 1 warning in 0.36s
warning: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient`
is deprecated; install `httpx2` instead. (solo warning, no falla)
```

### 1.2 `ruff check backend/` → VERDE
```
All checks passed!
EXIT:0
```

### 1.3 Import sin DB + `GET /health` sin `DATABASE_URL` → VERDE
Comando A: `python -c "from backend.app.main import app; ..."`
```
import OK: FastAPI
['/openapi.json', '/docs', '/docs/oauth2-redirect', '/redox'→'/redoc', '/health']
EXIT:0
```
Comando B (env limpio): `DATABASE_URL` eliminado, `TestClient(app).get('/health')`
```
200 {'status': 'ok'}
EXIT:0 (el stderr solo trae el StarletteDeprecationWarning de httpx, ya citado)
```
Postgres no está corriendo en esta máquina; el import no exige `DATABASE_URL` ni abre conexiones
(`backend/app/main.py:1-11` no importa SQLAlchemy).

### 1.4 Parse YAML (`docker-compose.yml` + `.github/workflows/tests.yml`) → VERDE
```
compose: dict_keys(['postgres', 'api'])
workflow jobs: ['tests', 'lint']
```
Lectura de sintaxis moderna OK: `postgres:16` con `healthcheck: pg_isready`
(`docker-compose.yml:10-14`), `api` con `depends_on: postgres: {condition: service_healthy}`
(`docker-compose.yml:24-26`), sin Redis en ningún servicio.

### 1.5 `docker compose config` → NO EJECUTABLE LOCAL (documentado, queda en CI)
```
docker : El término 'docker' no se reconoce como nombre de un cmdlet...
CommandNotFoundException
```
No hay Docker en esta máquina. Cobertura sustituta: parse YAML válido (§1.4) +
revisión por lectura de `healthcheck`/`depends_on service_healthy`. El `config` real
y el build quedan en CI, tal como permite `tasks.md` 4.2 ("o reporte de ausencia").

### 1.6 `cmd /c "openspec validate c-01-foundation-setup --strict"` → VERDE
```
Change 'c-01-foundation-setup' is valid
EXIT:0
```
Nota: el shim `openspec.ps1` sigue bloqueado por ExecutionPolicy; se usó `cmd /c` como workaround conocido.

### 1.7 Extras de tasks 3.2
- Búsqueda `REDIS_URL` en `*.py,*.yml,*.txt,*.example,Dockerfile`: sin coincidencias (verde).
- `pip show fastapi pytest ruff`: instalados (fastapi 0.143.0, pytest 9.1.1, ruff 0.16.10).

## 2. Matriz de trazabilidad escenario → test → resultado

| # | Escenario del spec | Test(s) que lo cubren | Resultado | Evidencia |
|---|--------------------|-----------------------|-----------|-----------|
| 1 | Health check en verde — `GET /health` → 200 `{"status":"ok"}` (`spec.md:13-16`) | `backend/tests/test_health.py:10` `test_health_responde_ok` | VERDE | `test_health_responde_ok PASSED` en §1.1 |
| 2 | Health sin base de datos — import funciona y `GET /health` → 200 sin Postgres (`spec.md:22-25`) | `backend/tests/test_health.py:17` `test_health_sin_base_de_datos` (monkeypatch quita `DATABASE_URL`) + chequeo manual §1.3 comando B (`200 {'status': 'ok'}` con env limpio) | VERDE | `test_health_sin_base_de_datos PASSED` en §1.1 + `200 {'status': 'ok'}` en §1.3 |
| 3 | Suite base reproducible — `pytest backend/tests` verde sin servicios externos (`spec.md:27-30`) | Suite completa: `test_dummy.py:4` `test_backend_package_importable` + los 2 de `test_health.py` | VERDE | `3 passed in 0.36s`, sin servicios externos corriendo (§1.1) |

Gaps: ninguno — los 3 escenarios tienen test automatizado que los cubre y está en verde.
No se escribió código nuevo en este verify (por diseño: un escenario sin test sería hallazgo, no fix acá).

## 3. Veredicto por ítem (tasks.md 4.2)

| Ítem de cierre | Estado | Detalle |
|----------------|--------|---------|
| `pytest backend/tests` verde | VERDE | 3/3 passed |
| `ruff check backend/` verde | VERDE | `All checks passed!` |
| `docker compose config` válido o reporte de ausencia | VERDE-CONDICIONAL (documentado) | Sin Docker local; YAML parsea, sintaxis moderna verificada por lectura; `config` + build quedan en CI |
| `openspec validate` sin errores | VERDE | `Change 'c-01-foundation-setup' is valid` (vía `cmd /c ... --strict`) |

## 4. Veredicto global: ARCHIVABLE

Todo lo ejecutable en esta máquina está en verde; el único ítem no ejecutable localmente
(Docker) tiene la cobertura sustituta que el propio task 4.2 admite y queda en CI.
No hay escenarios en rojo, no hay gaps de cobertura.

**Recomendación: ejecutar `/opsx:archive c-01-foundation-setup`.**

## 5. Issues / bloqueos (no bloqueantes del archive)

1. `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` — warning en cada corrida pytest; no rompe nada, pero conviene seguirlo en un change futuro (pin `httpx2` o silenciar).
2. Sin Docker local — `docker compose config` y build de `backend/Dockerfile` pendientes de validación en CI.
3. Shim `openspec.ps1` bloqueado por ExecutionPolicy — workaround `cmd /c "openspec ..."` funciona; pendiente fix permanente fuera de este change.

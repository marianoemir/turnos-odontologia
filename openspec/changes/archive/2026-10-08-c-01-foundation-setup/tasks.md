# Tasks — C-01 foundation-setup

## 1. Estructura backend + app mínima

- [x] 1.1 Crear `backend/app/{turnos,agenda,seed}/__init__.py` (esqueletos con docstring de alcance C-02/C-03) y `backend/app/main.py` con app FastAPI + `GET /health` → `{"status":"ok"}`, sin importar SQLAlchemy ni abrir conexiones a DB; verificar con `python -c "from backend.app.main import app"` (o import equivalente) sin Postgres en ejecución
- [x] 1.2 Crear `backend/requirements.txt` (`fastapi>=0.115`, `sqlalchemy>=2.0`, `alembic`, `uvicorn`, `httpx`, `pytest>=8`, `ruff`) e instalar en el entorno del apply; verificar con `pip show fastapi pytest ruff`

## 2. Tests base en verde (red-green manual)

- [x] 2.1 Escribir primero `backend/tests/test_dummy.py` y `backend/tests/test_health.py` (ver ROJO con `pytest backend/tests` antes de implementar), luego implementar hasta ver VERDE; `test_health.py` cubre el delta `foundation` vía TestClient (`GET /health` → 200 `{"status":"ok"}`, sin DB); verificar con `pytest backend/tests -v` todo en verde
- [x] 2.2 Ejecutar `ruff check backend/` y dejarlo en verde (cero findings); verificar con la salida del comando

## 3. Compose + entorno + CI

- [x] 3.1 Crear `docker-compose.yml` (servicios `api` con `build: backend` + `postgres:16` con `healthcheck: pg_isready` y `depends_on: service_healthy`, credenciales alineadas a `DATABASE_URL`, sin Redis) y `backend/Dockerfile` (`python:3.12-slim`, instala `requirements.txt`, sirve uvicorn); verificar con `docker compose config` válido
- [x] 3.2 Quitar `REDIS_URL` de `.env.example` (quedan `TZ`, `DATABASE_URL`, `SECRET_KEY` ficticia, `SEED_FICTICIO`) y verificar que ningún archivo del repo referencia `REDIS_URL` (búsqueda en el repo)
- [x] 3.3 Agregar job `lint` (`ruff check backend/`) a `.github/workflows/tests.yml` sin tocar el job `tests` existente; verificar el YAML parsea (p. ej. `python -c "import yaml; yaml.safe_load(...)"` o push que dispare el workflow en verde)

## 4. Docs + cierre reproducible

- [x] 4.1 Ajustar `README.md` para que cada comando documentado corra tal cual (`docker compose up -d postgres`, `pip install -r backend/requirements.txt`, `pytest backend/tests`) y corregir la línea `src/...` de AGENTS.md a `backend/...`; verificar releyendo los pasos contra el repo resultante
- [x] 4.2 Verificación integral de cierre: `pytest backend/tests` verde + `ruff check backend/` verde + `docker compose config` válido (o reporte de que Docker local no existe y el paso queda en CI) + `openspec validate --change c-01-foundation-setup` sin errores; registrar red-green manual y Q1 asumida en el resumen del apply

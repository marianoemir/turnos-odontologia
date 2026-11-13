# Proposal — fix-api-contenedor (C-23)

## Why

El servicio `api` de `docker-compose.yml` no arranca, y no es un problema de dominio sino de imagen: `backend/Dockerfile` copia solo `app ./app` y ejecuta `uvicorn app.main:app`, mientras `backend/app/main.py` importa `from backend.app.<modulo>.router import ...`. Dentro del contenedor el paquete `backend` no existe, así que el proceso muere al importar y `docker compose up` deja `api` reiniciándose. A eso se suman tres defectos del mismo origen: la imagen no incluye `alembic.ini` ni `alembic/`, de modo que las migraciones no se pueden correr adentro; `backend/requirements.txt` mezcla runtime con herramientas de desarrollo y no tiene pins; y las credenciales de Postgres están escritas dos veces a mano en el compose, sin forma de cambiarlas por entorno.

El efecto práctico hoy: el README tiene que advertir "el servicio `api` del compose todavía no arranca" y el camino documentado obliga a correr `uvicorn` desde el host con una `DATABASE_URL` definida a mano en cada consola. Además queda abierta la task 5.2 de C-13 (`frontend-foundation`), que no se pudo verificar porque dependía de que `api` levantara por compose para probar `GET http://localhost:8080/api/health` a través de nginx. C-23 cierra ese hueco, depende solo de C-03 (archivado) y no toca ninguna regla de negocio.

## What Changes

- **`backend/Dockerfile` reconstruido con el root del repo como contexto**: `COPY backend/ ./backend/` (app + `alembic/` + `alembic.ini` + requirements), `WORKDIR` en el root del repo para que el paquete `backend` sea importable, y arranque con `uvicorn backend.app.main:app`. Se deja registrado el `WORKDIR` elegido y por qué.
- **`.dockerignore` nuevo en la raíz del repo** (hoy no existe): excluye `frontend/`, `.venv`, `__pycache__`, `*.pyc`, `.git` y `docs/`. `frontend/.dockerignore` (creado por C-13) ya existe y no se toca.
- **`docker-compose.yml` con contexto raíz para `api`**: `build.context: .` + `build.dockerfile: backend/Dockerfile`, y credenciales/`TZ` leídas de variables de entorno con defaults ficticios (`${POSTGRES_USER:-...}`, `${POSTGRES_PASSWORD:-...}`, `${POSTGRES_DB:-...}`, `${TZ:-...}`), reutilizadas en el healthcheck de `postgres` y en el `DATABASE_URL` de `api`. `POSTGRES_PORT` sigue afectando solo el mapeo host→contenedor; dentro de la red de compose el puerto es siempre 5432. **BREAKING (entorno local)**: `docker compose build api` deja de cachear igual que antes (contexto distinto) y quien tenga `POSTGRES_PORT=5433` debe seguir usándolo igual que hoy; no cambia ningún contrato HTTP.
- **Dependencias con pin y separadas por entorno**: `backend/requirements.txt` queda solo con runtime y todos los pins con `==`; `backend/requirements-dev.txt` incluye `-r requirements.txt` más `pytest`, `ruff` y `httpx`, también con `==` (la clasificación de `httpx` es la pregunta abierta Q6 de `design.md`, con default dev). Los pins definitivos se fijan en apply desde `pip freeze` de un venv real, no se copian de la referencia de `CHANGES.md`.
- **Migraciones dentro del contenedor**: `docker compose exec api python -m alembic -c backend/alembic.ini current|upgrade head|downgrade -1` funciona sin pasos fuera del contenedor y sin `DATABASE_URL` exportada a mano en el host. `script_location` de `backend/alembic.ini` ya es `%(here)s/alembic` (verificado), así que resuelve desde cualquier `WORKDIR` mientras `alembic/` esté al lado del ini; no se cambia salvo que apply demuestre lo contrario.
- **Docstring de `backend/app/main.py` alineado con la realidad**: hoy dice `"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""` cuando monta diez routers que usan DB y SQLAlchemy. Se reemplaza por una descripción real (solo docstring, sin tocar rutas ni comportamiento).
- **README y CI**: el README documenta la instalación con los dos archivos de requirements, las migraciones dentro del contenedor y `docker compose up --build` como camino principal; se elimina la advertencia "el servicio `api` del compose todavía no arranca". En `.github/workflows/tests.yml` (que tiene exactamente tres jobs: `tests`, `lint` y `frontend`) solo cambian `tests` y `lint`, que pasan a instalar `requirements.txt` + `requirements-dev.txt`; el job `frontend` no se toca.
- **Cierre de la task 5.2 de C-13**: la evidencia de `GET http://localhost:8080/api/health` → 200 a través del servicio `web` queda registrada en el `tasks.md` de C-23. El archivo archivado `openspec/changes/archive/2026-11-12-c-13-frontend-foundation/tasks.md` no se edita.
- **Fuera de alcance**: ningún cambio de modelos, endpoints, reglas de negocio ni migraciones nuevas; nada de JWT, Redis ni despliegue a un servidor real.

## Capabilities

### New Capabilities

- `api-contenedor`: reproducibilidad del servicio `api` en Docker Compose — build con el root del repo como contexto, paquete `backend` importable dentro de la imagen, migraciones Alembic ejecutables dentro del contenedor, dependencias runtime con pin y separadas del entorno de desarrollo, y configuración por entorno (credenciales de Postgres, `TZ`, puerto publicado) sin secretos escritos.

### Modified Capabilities

- (ninguna — C-23 es infraestructura: no cambia REQUIREMENTS de `turnos`, `rbac`, `reserva-online` ni de ningún otro spec. `frontend-foundation` tampoco cambia su contrato: C-23 solo permite verificar su task 5.2 con evidencia.)

## Impact

- **Archivos que se modifican en apply**: `backend/Dockerfile`, `docker-compose.yml`, `backend/requirements.txt`, nuevo `backend/requirements-dev.txt`, nuevo `.dockerignore` (raíz), `backend/app/main.py` (solo el docstring), `README.md`, `.github/workflows/tests.yml`. Opcionalmente `.env.example` si se agregan las variables nuevas (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`) — a confirmar en design.
- **No se toca**: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/app/**` más allá del docstring, `frontend/**` (incluido `frontend/.dockerignore` y `frontend/nginx.conf`), `openspec/changes/archive/**`, `AGENTS.md`, `CLAUDE.md`, `CHANGES.md`.
- **Servicios de compose**: los tres siguen siendo `postgres`, `api` y `web`. El servicio `web` de C-13 no cambia su definición funcional (mismo puerto 8080:80, mismo `depends_on: api`) y debe seguir arrancando después del cambio.
- **Riesgo principal**: cambiar el contexto de build a la raíz del repo puede volver más lentos los builds y, sin `.dockerignore`, mandar `frontend/`, `.venv` y `.git` al daemon; el `.dockerignore` de la raíz es la mitigación y por eso es parte del alcance.
- **Riesgo secundario**: alinear la versión de Python entre Dockerfile y CI obliga a re-medir los pins en esa versión; la decisión y su default están en `design.md`.
- **Governance**: BAJO (declarado en `CHANGES.md`). Dependencia: C-03.

# turnos-odontologia

Trabajo de Integración: del Discovery al primer Change, con Spec-Driven Development y Active Stack.

Sistema de gestión de turnos para consultorios odontológicos (Argentina). Núcleo: agenda por profesional y por sillón/box sin solapamientos.

Stack impuesto por el profesor: backend Python + FastAPI + SQLAlchemy + PostgreSQL (+ Redis solo con async) + Docker Compose; frontend React + TypeScript + Vite (change posterior). El primer change es solo backend.

## Requisitos

- Python 3.12+ y Docker + Docker Compose
- Sin servicios externos obligatorios para los tests del núcleo (datos ficticios)

## Instalar y probar (backend)

```bash
docker compose up -d postgres   # o el servicio que defina docker-compose.yml
pip install -r backend/requirements.txt
pytest backend/tests            # suite en verde
```

## Base de datos del catálogo (C-02)

`DATABASE_URL` con esquema `postgresql+psycopg://` (ver `.env.example`).
Para apuntar a otra base sin editar archivos, definí la variable de
entorno en tu shell antes de cada comando:

```powershell
$env:DATABASE_URL="postgresql+psycopg://usuario:clave@localhost:5432/turnos"
```

```bash
export DATABASE_URL="postgresql+psycopg://usuario:clave@localhost:5432/turnos"
```

> ⚠️ Los tests **truncan** las 6 tablas del catálogo (`pacientes`,
> `profesionales`, `sillones`, `prestaciones`, `horarios`, `bloqueos`)
> de **la base a la que apunte `DATABASE_URL`**. Solo se permite la base
> `turnos` o una terminada en `_test`; cualquier otro nombre es rehusado
> con error antes de conectar o truncar.

Con Postgres levantado:

```bash
py -m alembic -c backend/alembic.ini upgrade head   # crea las 6 tablas
SEED_FICTICIO=true py -m backend.app.seed.catalogo # datos ficticios (idempotente, sin turnos)
py -m pytest backend/tests -rs                      # todo en verde, sin skips
```

En PowerShell, el seed es:

```powershell
$env:SEED_FICTICIO="true"; py -m backend.app.seed.catalogo
```

Rollback de la migración (si hace falta):

```bash
py -m alembic -c backend/alembic.ini downgrade -1
```

Sin Postgres, los tests `integration` se skipean y el resto sigue en
verde; con `CI=true` la falta de Postgres falla en lugar de skipear.

## Variables de entorno

Copiar `.env.example` a `.env` si hace falta (valores ficticios; nunca commitear secretos).

## Estructura

- `backend/app/turnos/` — dominio de turnos (C-03)
- `backend/app/agenda/` — horarios, bloqueos, recursos (C-02)
- `backend/app/seed/` — datos ficticios
- `backend/tests/` — suite pytest
- `frontend/` — React + Vite (change posterior)
- `docker-compose.yml` — api + postgres (+ redis con async)
- `knowledge-base/` — fuente de verdad del dominio
- `CHANGES.md` — roadmap de changes (recorte TP: C-01 → C-02 → C-03)

## Datos

Solo datos ficticios en seeds y tests. Nunca datos reales de pacientes ni secretos en el repositorio.

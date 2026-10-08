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

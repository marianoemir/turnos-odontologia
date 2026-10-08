# Arquitectura Propuesta

Fuente: stack impuesto por el profesor (2026-10-07): Python + FastAPI + SQLAlchemy + PostgreSQL + Docker Compose; frontend React + TypeScript + Vite (posterior); Redis solo con async. Ver `02_descripcion_general.md`.

## Patrones aplicados

| Patrón | Dónde se usa | Por qué |
|--------|--------------|---------|
| Servicio de dominio (Turnos) | Validación RN-AG/RN-TU/RN-ES en un solo punto | Evita solapes por caminos alternos; testeable sin UI |
| Intervalo semiabierto [inicio,fin) | Chequeo de solapes | Implementa borde RN-AG-04 sin casos especiales |
| Máquina de estados explícita | pendiente→confirmado→atendido/ausente; →cancelado | Aplica RN-ES-01; cancelado/ausente excluidos de solape |
| Soft-cancel (sin hard delete) | Cancelar = cambio de estado | Preserva auditoría y permite relleno de huecos |
| Repositorio + Unit of Work (SQLAlchemy) | Acceso a datos tras interfaz; sesión por request | Permite tests con rollback transaccional y Postgres real sin cambiar el servicio |
| Errores de dominio → HTTP | `ConflictoTurno{causa}`→409, `InputInvalido`→422 (FastAPI `HTTPException`) | Regla dura: nunca 200/500 ante conflicto de negocio |
| Seed ficticio + tests | Primer change (pytest) | Cumple "solo datos ficticios, un change probado" |

## Estructura de directorios

Propuesta stack-agnóstica mínima (adaptar al stack que defina el change):

```
turnos-odontologia/
├── docs/discovery/          # fuentes (no tocar)
├── knowledge-base/          # esta KB
├── backend/                 # FastAPI (primer change: solo backend)
│   ├── app/
│   │   ├── turnos/          # dominio: crear/cancelar/reprogramar, solapes, estados
│   │   ├── agenda/          # horarios, bloqueos, sillones, prestaciones
│   │   ├── seed/            # datos ficticios
│   │   └── main.py          # app FastAPI + routers
│   ├── tests/               # pytest (RN-AG-02/03, borde RN-AG-04, RN-TU, RN-ES)
│   ├── alembic/             # migraciones (desde C-02)
│   └── requirements.txt
├── frontend/                # React + TS + Vite (change posterior, no C-01..C-03)
├── docker-compose.yml       # api + postgres (+ redis solo con async)
└── README.md                # reproducible, sin secretos
```

## Seguridad

- Autenticación: JWT (change de roles posterior). Primer changes: sin login, uso local/test.
- Autorización: RBAC mínimo según `03_actores_y_roles.md` (recepción escribe, odontólogo lee propia); dependencias FastAPI por rol desde el change de auth.
- Validación de input: schemas Pydantic estrictos; sillón obligatorio, duración > 0, datetimes con zona; 409 conflicto vs 422 inválido.
- Secrets management: sin secretos en repo (regla dura). `SECRET_KEY`/tokens (MP/WhatsApp/ARCA) solo vía env en changes posteriores, nunca commiteados.
- Auditoría mínima: creado_por + transición de estados con timestamp (base para trazabilidad posterior).

## Variables de entorno

| Variable | Descripción | Ejemplo | Sensible |
|----------|-------------|---------|----------|
| `TZ` | Zona horaria de agenda | `America/Argentina/Buenos_Aires` | N |
| `DATABASE_URL` | PostgreSQL (vía Compose en dev; override en tests si aplica) | `postgresql://odontologia:odontologia@localhost:5432/turnos` (ficticio) | Y (credenciales) |
| `SECRET_KEY` | Firma JWT (change de auth; valor ficticio en example) | `cambiar-en-produccion-solo-env` | Y |
| `REDIS_URL` | Solo cuando haya funcionalidad asincrónica (posterior) | `redis://localhost:6379/0` | N |
| `SEED_FICTICIO` | Activa seed de datos ficticios | `true` | N |
| `WHATSAPP_TOKEN` | Posterior — no usar en changes de agenda | — | Y |
| `MP_ACCESS_TOKEN` | Posterior — no usar en changes de agenda | — | Y |

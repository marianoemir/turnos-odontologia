# turnos-odontologia

Trabajo de Integración: del Discovery al primer Change, con Spec-Driven Development y Active Stack.

Sistema de gestión de turnos para consultorios odontológicos (Argentina). Núcleo: agenda por profesional y por sillón/box sin solapamientos.

Stack impuesto por el profesor: backend Python + FastAPI + SQLAlchemy + PostgreSQL (+ Redis solo con async) + Docker Compose; frontend React + TypeScript + Vite (change posterior). El primer change es solo backend.

## Requisitos

- Python 3.12+ y Docker + Docker Compose
- Sin servicios externos obligatorios para los tests del núcleo (datos ficticios)

## Clonar e instalar

```powershell
git clone https://github.com/marianoemir/turnos-odontologia.git
cd turnos-odontologia
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

En Linux o macOS: `python3 -m venv .venv`, `source .venv/bin/activate` y el mismo `pip install`.

Para correr los tests: `pytest backend/tests`. Sin PostgreSQL, los tests de integración se saltean; con la variable `CI=true`, en cambio, fallan (así el CI nunca da verde sin haber probado nada). Para correrlos todos hace falta PostgreSQL (ver más abajo).

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

> ⚠️ Los tests **truncan** las 7 tablas (`pacientes`,
> `profesionales`, `sillones`, `prestaciones`, `horarios`, `bloqueos`
> y `turnos`)
> de **la base a la que apunte `DATABASE_URL`**. Solo se permite la base
> `turnos` o una terminada en `_test`; cualquier otro nombre es rehusado
> con error antes de conectar o truncar.

Con Postgres levantado:

```bash
py -m alembic -c backend/alembic.ini upgrade head   # crea las 7 tablas
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

## Crear turnos (C-03)

`POST /turnos` crea un turno en estado `pendiente`. Con `DATABASE_URL`
definida (ver arriba), base migrada y seed ficticio cargado:

```powershell
py -m alembic -c backend/alembic.ini upgrade head
$env:SEED_FICTICIO="true"; py -m backend.app.seed.catalogo
```

El seed deja 2 profesionales (`MAT-FICT-001/002`), 2 sillones
(`Sillon 1/2`), 3 prestaciones (`Limpieza` 20, `Consulta` 30,
`Endodoncia` 60 min), horario Lun–Vie 9–18 por profesional y
3 pacientes (`DNI-FICT-001/002/003`). Los IDs reales salen de la base:

```powershell
$ids = py -c "import json; from backend.app.db import get_session; from backend.app.agenda.models import Paciente, Profesional, SillonBox, Prestacion; s = get_session()(); q = lambda m, **f: str(s.query(m).filter_by(**f).one().id); print(json.dumps({'paciente': q(Paciente, dni='DNI-FICT-001'), 'profesional': q(Profesional, matricula='MAT-FICT-001'), 'profesional2': q(Profesional, matricula='MAT-FICT-002'), 'sillon': q(SillonBox, nombre='Sillon 1'), 'sillon2': q(SillonBox, nombre='Sillon 2'), 'consulta30': q(Prestacion, nombre='Consulta')})); s.close()" | ConvertFrom-Json
```

Levantá la API y creá un turno (lunes 12/10/2026 10:00, dentro del
horario del seed; `Consulta` dura 30 min):

```powershell
$srv = Start-Process py -ArgumentList "-m uvicorn backend.app.main:app --port 8000" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 6
$body = @{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; sillon_id=$ids.sillon; prestacion_id=$ids.consulta30; inicio="2026-10-12T10:00:00-03:00" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8000/turnos -ContentType "application/json" -Body $body
```

Responde `201` con el turno (`estado` `pendiente`,
`fin` `2026-10-12T10:30:00-03:00`, más `id` y `creado_por: null`).
`fin` lo calcula el servidor (`inicio + prestacion.duracion_min`);
un `fin` enviado por el cliente se ignora (schema `extra="ignore"`):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; sillon_id=$ids.sillon; prestacion_id=$ids.consulta30; inicio="2026-10-12T11:00:00-03:00"; fin="2026-10-12T12:00:00-03:00" } | ConvertTo-Json) | Select-Object inicio, fin
```

Contrato de errores. El solape da `409` con cuerpo EXACTO
`{"detail": {"causa": ..., "detalle": ...}}`:

```powershell
try { Invoke-RestMethod -Method Post -Uri http://localhost:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; sillon_id=$ids.sillon2; prestacion_id=$ids.consulta30; inicio="2026-10-12T10:15:00-03:00" } | ConvertTo-Json) } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
```

`causa` es una de `profesional|sillon|horario|bloqueo`. El resto:

```powershell
try { Invoke-RestMethod -Method Post -Uri http://localhost:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; prestacion_id=$ids.consulta30; inicio="2026-10-12T14:00:00-03:00" } | ConvertTo-Json) } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
$inexistente = [guid]::NewGuid().ToString()
try { Invoke-RestMethod -Method Post -Uri http://localhost:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$inexistente; sillon_id=$ids.sillon; prestacion_id=$ids.consulta30; inicio="2026-10-12T14:00:00-03:00" } | ConvertTo-Json) } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
Stop-Process -Id $srv.Id
```

El primer bloque da `422` (falta `sillon_id`; también `422` con
`{"detail": "<motivo>"}` ante sillón inactivo o `inicio` sin zona
horaria). El segundo da `404` (`{"detail": "<recurso> no existe: <id>"}`).

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

## Uso de inteligencia artificial

Este trabajo se desarrolló con asistencia de agentes de IA (Claude y OpenCode con Active Stack). Todo lo entregado fue leído, revisado y validado por el grupo, y los datos de pacientes son siempre ficticios.

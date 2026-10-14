# turnos-odontologia

Trabajo de Integración de **Metodología I** (UTN, Tecnicatura Universitaria en Programación): del Discovery al primer Change, con Spec-Driven Development (OpenSpec) y Active Stack.

Integrantes: Mariano Chirino, Andres Fabre, Facundo Quiroga.

Sistema de gestión de turnos y agenda de pacientes para consultorios odontológicos (Argentina). Núcleo implementado: **crear un turno sin solapamientos**, por profesional y por sillón/box.

Stack impuesto por el profesor: backend Python + FastAPI + SQLAlchemy + PostgreSQL (+ Redis solo con funcionalidad asincrónica) + Docker Compose; frontend React + TypeScript + Vite estructura base creada en frontend/, sin funcionalidad). El primer change es solo backend.

Recorte del TP (todos archivados en `openspec/changes/archive/`): `C-01 foundation-setup` → `C-02 catalogo-recursos` → `C-03 crear-turno-sin-solapamientos`.

[![Ver video de defensa](https://img.shields.io/badge/▶_Ver_video_de_defensa-8_a_12_min-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/0sj4smXVclY)

[![Ver video de defensa](https://img.shields.io/badge/▶_Ver_video_de_defensa-8_a_12_min-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/0sj4smXVclY)

[![Video de defensa](https://img.youtube.com/vi/0sj4smXVclY/hqdefault.jpg)](https://youtu.be/0sj4smXVclY)

## 🎥 [Ver el video de defensa → https://youtu.be/0sj4smXVclY](https://youtu.be/0sj4smXVclY)


## Requisitos

- **Git**.
- **Python 3.12 o superior** (el CI usa 3.12; también probado con 3.13 en Windows).
- **PostgreSQL 16**: la forma más simple es **Docker Desktop** con el `docker-compose.yml` del repo. Sin base de datos se puede instalar y correr el subconjunto de tests que no la necesita (paso 2).
- Los comandos están en **PowerShell** (Windows) y en **bash** (Linux/macOS).

## 1. Clonar e instalar

PowerShell:

```powershell
git clone https://github.com/marianoemir/turnos-odontologia.git
cd turnos-odontologia
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
```

bash:

```bash
git clone https://github.com/marianoemir/turnos-odontologia.git
cd turnos-odontologia
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

Notas:

- Crear el entorno virtual puede tardar uno o dos minutos: **no lo interrumpas**. Al activarlo, la consola muestra `(.venv)` al principio de la línea.
- Si PowerShell bloquea la activación por la política de ejecución, corré antes `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.
- Si usás una versión de Python muy nueva y `pip install` falla al instalar alguna dependencia, creá el entorno con Python 3.12 o 3.13, por ejemplo `py -3.13 -m venv .venv`.

## 2. Probar sin base de datos

```powershell
python -m pytest backend/tests
```

Resultado esperado sin PostgreSQL: **24 passed, 56 skipped**. Los tests de integración se saltean porque no encuentran la base. Con la variable `CI=true` la falta de PostgreSQL **falla** en lugar de saltear, para que nunca haya un resultado verde sin haber probado nada.

## 3. Levantar PostgreSQL

```powershell
docker compose up -d postgres
```

Hay que tener **Docker Desktop encendido**. El servicio crea la base `turnos` con usuario `odontologia` y contraseña `odontologia` (valores ficticios del `docker-compose.yml`).

**Si el puerto 5432 ya está ocupado** en tu equipo (por ejemplo, por un PostgreSQL instalado), cambiá en `docker-compose.yml` el mapeo `"5432:5432"` por `"5433:5432"` y usá el puerto 5433 en la `DATABASE_URL`. Si en el 5432 hay otro PostgreSQL, la conexión con el usuario `odontologia` va a fallar por autenticación: no crees ese usuario en un servidor que no sea el de este proyecto.

Definí la base a la que apuntan los comandos en **cada consola** donde los uses:

PowerShell:

```powershell
$env:DATABASE_URL="postgresql+psycopg://odontologia:odontologia@localhost:5432/turnos"
```

bash:

```bash
export DATABASE_URL="postgresql+psycopg://odontologia:odontologia@localhost:5432/turnos"
```

> ⚠️ Los tests **truncan** las 7 tablas (`pacientes`, `profesionales`, `sillones`, `prestaciones`, `horarios`, `bloqueos` y `turnos`) de **la base a la que apunte `DATABASE_URL`**. Solo se permite la base `turnos` o una terminada en `_test`; cualquier otro nombre es rehusado con error antes de conectar o truncar. No apuntes los tests a una base con datos que quieras conservar.

## 4. Migrar, cargar datos ficticios y correr todos los tests

PowerShell:

```powershell
python -m alembic -c backend/alembic.ini upgrade head
$env:SEED_FICTICIO="true"; python -m backend.app.seed.catalogo
python -m pytest -rs backend/tests
```

bash:

```bash
python -m alembic -c backend/alembic.ini upgrade head
SEED_FICTICIO=true python -m backend.app.seed.catalogo
python -m pytest -rs backend/tests
```

Resultado esperado:

- La migración crea las 7 tablas (si ya existían, informa que está al día).
- El seed informa `seed ok` con 2 profesionales, 2 sillones, 3 prestaciones, 10 horarios, 1 bloqueo y 3 pacientes ficticios. Es idempotente y no crea turnos.
- Los tests: **80 passed, 0 skipped**.

Rollback de la migración, si hace falta:

```powershell
python -m alembic -c backend/alembic.ini downgrade -1
```

## 5. Probar la API (`POST /turnos`)

Necesitás **dos consolas**. En ambas: carpeta del repo, entorno virtual activado y `DATABASE_URL` definida (paso 3), con la base migrada y el seed cargado (paso 4).

**Consola 1: el servidor.** Queda ocupada mientras corre; no la cierres.

```powershell
python -m uvicorn backend.app.main:app --port 8000
```

Comprobación rápida: `http://127.0.0.1:8000/health` responde `{"status":"ok"}`. FastAPI también trae una pantalla para probar el endpoint en `http://127.0.0.1:8000/docs`.

**Consola 2: los pedidos** (PowerShell). Primero los IDs reales del seed. Es **una sola línea larga**: copiala entera, hasta `ConvertFrom-Json`.

```powershell
$ids = python -c "import json; from backend.app.db import get_session; from backend.app.agenda.models import Paciente, Profesional, SillonBox, Prestacion; s = get_session()(); q = lambda m, **f: str(s.query(m).filter_by(**f).one().id); print(json.dumps({'paciente': q(Paciente, dni='DNI-FICT-001'), 'profesional': q(Profesional, matricula='MAT-FICT-001'), 'profesional2': q(Profesional, matricula='MAT-FICT-002'), 'sillon': q(SillonBox, nombre='Sillon 1'), 'sillon2': q(SillonBox, nombre='Sillon 2'), 'consulta30': q(Prestacion, nombre='Consulta')})); s.close()" | ConvertFrom-Json
```

Comprobá con `$ids`: tienen que aparecer seis códigos.

**a) Turno válido** (lunes 12/10/2026 10:00, dentro del horario del seed; `Consulta` dura 30 min). Responde `201` con estado `pendiente` y `fin` a las 10:30:

```powershell
$body = @{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; sillon_id=$ids.sillon; prestacion_id=$ids.consulta30; inicio="2026-10-12T10:00:00-03:00" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/turnos -ContentType "application/json" -Body $body
```

**b) El `fin` lo calcula el servidor** (`inicio + duración de la prestación`); un `fin` enviado por el cliente se ignora. Responde `201` con `fin` 11:30, no 12:00:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; sillon_id=$ids.sillon; prestacion_id=$ids.consulta30; inicio="2026-10-12T11:00:00-03:00"; fin="2026-10-12T12:00:00-03:00" } | ConvertTo-Json) | Select-Object inicio, fin
```

**c) Solape con el mismo profesional** (otro sillón, 10:15). Responde `409` con cuerpo `{"detail": {"causa": ..., "detalle": ...}}`:

```powershell
try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; sillon_id=$ids.sillon2; prestacion_id=$ids.consulta30; inicio="2026-10-12T10:15:00-03:00" } | ConvertTo-Json) } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
```

`causa` es una de `profesional`, `sillon`, `horario` o `bloqueo`.

**d) Sin sillón.** Responde `422` (el sillón es obligatorio; también da `422` ante un sillón inactivo o un `inicio` sin zona horaria):

```powershell
try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$ids.profesional; prestacion_id=$ids.consulta30; inicio="2026-10-12T14:00:00-03:00" } | ConvertTo-Json) } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
```

**e) Recurso inexistente.** Responde `404` (`{"detail": "<recurso> no existe: <id>"}`):

```powershell
$inexistente = [guid]::NewGuid().ToString()
try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/turnos -ContentType "application/json" -Body (@{ paciente_id=$ids.paciente; profesional_id=$inexistente; sillon_id=$ids.sillon; prestacion_id=$ids.consulta30; inicio="2026-10-12T14:00:00-03:00" } | ConvertTo-Json) } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
```

Resumen de resultados:

| Pedido | Resultado |
|---|---|
| Turno válido | `201`, estado `pendiente`, `fin` calculado |
| Solape con el mismo profesional o sillón | `409` con `causa` |
| Fuera del horario de atención o sobre un bloqueo | `409` con `causa` |
| Sin sillón, sillón inactivo o `inicio` sin zona horaria | `422` |
| Profesional, sillón, paciente o prestación inexistente | `404` |

Si repetís el pedido a), da `409`: el turno de las 10:00 ya quedó guardado. Para cerrar, `Ctrl + C` en la consola 1.

El solape se rechaza en dos niveles: el servicio valida primero y devuelve el `409` con la causa, y dos restricciones `EXCLUDE` de PostgreSQL (`btree_gist`, intervalo `[inicio, fin)`) garantizan que no se creen turnos pisados ni con pedidos simultáneos. Un turno que empieza justo cuando termina otro **no** es solapamiento.

## Variables de entorno

Ver `.env.example` (valores ficticios; **nunca** commitear un `.env` real ni secretos). Los comandos de este README leen `DATABASE_URL` y `SEED_FICTICIO` de la consola.

## Estructura del repositorio

- `backend/app/turnos/` — dominio de turnos: modelo, servicio y `POST /turnos` (C-03).
- `backend/app/agenda/` — horarios, bloqueos y recursos del catálogo (C-02).
- `backend/app/seed/` — datos ficticios.
- `backend/alembic/` — migraciones (001 catálogo, 002 turnos con `EXCLUDE`).
- `backend/tests/` — suite pytest (un test por escenario de la especificación).
- `docker-compose.yml` — PostgreSQL 16 y API. `frontend/` (React + Vite) estructura base creada en frontend/, sin funcionalidad.
- `docs/discovery/` — informe de Discovery (`.md` y PDF) y resultado del checklist de once puntos.
- `docs/explore/` y `docs/verify/` — exploración y verificación de cada change.
- `docs/capturas-evidencia/` — capturas de Engram y del instalador de Active Stack.
- `knowledge-base/` — base de conocimiento del dominio.
- `CHANGES.md` — roadmap de changes (recorte del TP: C-01 → C-02 → C-03).
- `openspec/` — especificaciones vigentes (`specs/`) y changes archivados (`changes/archive/`).
- `AGENTS.md` y `CLAUDE.md` — reglas del agente; `.atl/skill-registry.md` — registro de skills; `.active-orchestrator-state.json` — estado del orquestador.

## Datos

Solo datos ficticios en seeds, tests y ejemplos (`DNI-FICT-*`, `MAT-FICT-*`). Nunca datos reales de pacientes ni secretos en el repositorio.

## Uso de inteligencia artificial

Este trabajo se desarrolló con asistencia de agentes de IA (OpenCode con Active Stack) y asistentes de chat (Claude y Gemini), siguiendo el flujo de la cátedra: Discovery, base de conocimiento, roadmap, reglas del agente y un ciclo OPSX completo por change. Todo lo entregado fue leído, revisado y validado por el grupo; las verificaciones de fuentes del informe y la reflexión escrita las realizaron los integrantes.

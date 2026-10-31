# turnos-odontologia

Trabajo de Integración de **Metodología I** (UTN, Tecnicatura Universitaria en Programación): del Discovery al primer Change, con Spec-Driven Development (OpenSpec) y Active Stack.

Integrantes: Mariano Chirino, Andres Fabre, Facundo Quiroga.

Sistema de gestión de turnos y agenda de pacientes para consultorios odontológicos (Argentina). Núcleo implementado: **crear un turno sin solapamientos**, por profesional y por sillón/box.

Stack impuesto por el profesor: backend Python + FastAPI + SQLAlchemy + PostgreSQL (+ Redis solo con funcionalidad asincrónica) + Docker Compose; frontend React + TypeScript + Vite (estructura base creada en `frontend/`, todavía sin funcionalidad: su desarrollo está planificado en los changes C-13 a C-22). El primer change es solo backend.

Recorte del TP (todos archivados en `openspec/changes/archive/`): `C-01 foundation-setup` → `C-02 catalogo-recursos` → `C-03 crear-turno-sin-solapamientos`.

[![Ver video de defensa](https://img.shields.io/badge/▶_Ver_video_de_defensa-8_a_12_min-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/0sj4smXVclY)

## Roadmap

El roadmap completo tiene **23 changes**: implementados y archivados **C-01, C-02 y C-03**; pendientes los **20** restantes. La rectificación del 2026-10-28 agregó:

- **C-12 `catalogo-recursos-api`** (backend): expone por API el catálogo que C-02 modeló y sembró —pacientes, profesionales, sillones, prestaciones, horarios y bloqueos—, que hasta ahora solo existía en la base.
- **C-13 a C-22** (frontend): React + TypeScript + Vite, un change por capability del backend. C-13 `frontend-foundation` (shell, ruteo y contratos) y C-14 `frontend-componentes-base` (componentes y capa de datos) son la base; C-15 a C-22 son las pantallas.
- **C-23 `fix-api-contenedor`** (corrección): arregla el `Dockerfile` de la API, que hoy no arranca en contenedor (ver la nota del paso 3).

| ID | Nombre | Estado |
|----|--------|--------|
| C-12 | `catalogo-recursos-api` | pendiente |
| C-13 | `frontend-foundation` | pendiente |
| C-14 | `frontend-componentes-base` | pendiente |
| C-15 | `frontend-catalogo-recursos` | pendiente |
| C-16 | `frontend-crear-turno` | pendiente |
| C-17 | `frontend-agenda-turnos` | pendiente |
| C-18 | `frontend-lista-de-espera` | pendiente |
| C-19 | `frontend-hc-odontograma` | pendiente |
| C-20 | `frontend-caja-pagos` | pendiente |
| C-21 | `frontend-reserva-publica` | pendiente |
| C-22 | `frontend-admin-roles-export` | pendiente |
| C-23 | `fix-api-contenedor` | pendiente |

El detalle de cada change, sus dependencias, el orden de ejecución y el recorte evaluable están en [CHANGES.md](CHANGES.md).

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

> **El servicio `api` del compose todavía no arranca.** Su `backend/Dockerfile` copia solo `app/` y ejecuta `uvicorn app.main:app`, pero el código importa `from backend.app...`, paquete que la imagen no incluye; tampoco incluye `alembic`, así que las migraciones no se pueden correr adentro. Está registrado como **C-23 `fix-api-contenedor`** (pendiente). Hasta que se corrija, levantá únicamente la base con `docker compose up -d postgres` y corré la API desde la raíz del repo con `uvicorn`, como indican los pasos 4 y 5.

**Si el puerto 5432 ya está ocupado** en tu equipo (por ejemplo, por un PostgreSQL instalado), cambiá en `docker-compose.yml` el mapeo `"5432:5432"` por `"5433:5432"` y usá el puerto 5433 en la `DATABASE_URL`. Si en el 5432 hay otro PostgreSQL, la conexión con el usuario `odontologia` va a fallar por autenticación: no crees ese usuario en un servidor que no sea el de este proyecto. Síntoma típico: `alembic` o el seed fallan con «la autenticación password falló para el usuario odontologia»; en Windows suele ser un servicio de PostgreSQL instalado que ocupa el 5432. Antes de migrar, esperá a que `docker compose ps` muestre el servicio `postgres` como `healthy`.

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

> **Redis todavía no está en uso.** `.env.example` define `REDIS_URL`, pero `docker-compose.yml` **no** levanta un servicio Redis: ningún change implementado hasta hoy necesita funcionalidad asincrónica. El servicio se incorpora con el primer change que la use (`C-07 recordatorios-confirmacion`); hasta entonces `REDIS_URL` es solo una variable reservada y no hace falta tener Redis corriendo.

## Integración MCP: Postgres MCP Pro

El agente (OpenCode) consulta el esquema real de la base de turnos mediante el MCP **Postgres MCP Pro** (`crystaldba/postgres-mcp`), en modo `restricted` (solo lectura). Es una **integración**, no una skill. Todos los datos son ficticios.

### Para qué sirve y límites

- **Para qué:** ver tablas, columnas, restricciones e índices reales antes de diseñar un change (por ejemplo C-04 `cancelar-reprogramar`).
- **Herramientas que usamos en OpenCode:** `postgres_list_objects`, `postgres_get_object_details`, `postgres_execute_sql`.
- **Regla para el agente:** toda consulta a la base va **solo por el MCP**. Está prohibido usar `docker compose exec` o `psql`. Si el MCP rechaza una consulta, se informa y no se busca un atajo.
- **Límites:** `restricted` valida el SQL y limita el tiempo, pero **no es un sandbox**. `postgres_get_object_details` puede devolver `constraints` vacío; en ese caso se consulta `pg_constraint` con `postgres_execute_sql`.

### Requisitos

- Docker Desktop abierto.
- OpenCode (probado con 1.19.0) abierto en la **raíz del repo**.
- La base del proyecto levantada: `docker compose up -d postgres`.

### Variable de entorno

| Variable | Qué es | Dónde va |
|---|---|---|
| `POSTGRES_PORT` | Puerto del host para Postgres (por defecto 5432) | `.env` local (ignorado por git) |
| `DATABASE_URI` | URI que usa el MCP para conectarse | Variable de entorno de usuario. **Nunca** en archivos del repo |

Formato de `DATABASE_URI` (la clave es la ficticia del proyecto):

```
postgresql://odontologia:<clave-ficticia>@host.docker.internal:5433/turnos
```

En PowerShell, guardarla de forma persistente y **reabrir** la consola y la app de OpenCode (solo la ven los procesos abiertos después):

```powershell
setx DATABASE_URI "postgresql://odontologia:<clave-ficticia>@host.docker.internal:5433/turnos"
```

### Configuración (sin secretos)

Bloque en `opencode.json`:

```json
"mcp": {
  "postgres": {
    "type": "local",
    "command": ["docker", "run", "-i", "--rm", "-e", "DATABASE_URI",
                "crystaldba/postgres-mcp", "--access-mode=restricted"],
    "environment": { "DATABASE_URI": "{env:DATABASE_URI}" },
    "enabled": true
  }
}
```

La URI se toma de la variable de entorno. Los otros MCP que muestra `opencode mcp list` (`context7`, `engram`, `playwright`, `mermaid`) vienen de la configuración global de OpenCode y no se tocan.

### Pasos

1. Levantar la base y verificar el puerto:
   ```powershell
   docker compose up -d postgres
   docker compose ps
   ```
   Esperado: `0.0.0.0:5433->5432` y estado `healthy`.
2. Descargar la imagen del MCP:
   ```powershell
   docker pull crystaldba/postgres-mcp
   ```
3. Definir `DATABASE_URI` (ver arriba) y reabrir consola y app.
4. Comprobar que la variable existe, sin imprimir su valor:
   ```powershell
   if ($env:DATABASE_URI) {"definida"} else {"vacia"}
   ```

### Comprobación

```powershell
opencode mcp list
```

Esperado: `postgres connected`. Después, en una sesión nueva del agente, pedir:

```
Usando ÚNICAMENTE postgres_execute_sql, ejecutá: SELECT count(*) FROM public.pacientes; Mostrame el resultado tal cual.
```

Esperado: un número (con el seed ficticio, 3). Si el agente dice que no existen las herramientas `postgres_*`, cerrar la app por completo y reabrirla.

### Problema de instalación resuelto: puerto 5432 ocupado

- **Síntoma:** al conectar, `autentificación password falló` aunque la clave era correcta.
- **Causa:** otro proceso local ya ocupaba el puerto 5432 del host (probablemente un PostgreSQL de Windows; no se identificó), así que la conexión no llegaba al contenedor del proyecto.
- **Solución:** el puerto del host es configurable en `docker-compose.yml` con `${POSTGRES_PORT:-5432}`. En el `.env` local se fija `POSTGRES_PORT=5433` y la `DATABASE_URI` apunta a `5433`. Se verifica con `docker compose ps`.

Otros tropiezos frecuentes: `opencode mcp list` con `postgres failed — Connection closed` suele indicar Docker o la base apagados, o `DATABASE_URI` ausente (**causa no verificada**); y contenedores huérfanos de `crystaldba/postgres-mcp` que se limpian con `docker rm -f <id>` (sin tocar `turnos-odontologia-postgres-1`).

### Seguridad

- No commitear credenciales ni capturas donde se vea la URI.
- Hay una vulnerabilidad registrada (CVE-2026-85620) sobre la versión 0.3.0 que permitía saltear el modo restringido. No pudimos confirmar la versión de nuestra imagen; por eso se usa solo con datos ficticios en una base local. Recomendación de los autores: usar un usuario de base de solo lectura (pendiente de decidir en este proyecto).


## Estructura del repositorio

- `backend/app/turnos/` — dominio de turnos: modelo, servicio y `POST /turnos` (C-03).
- `backend/app/agenda/` — horarios, bloqueos y recursos del catálogo (C-02).
- `backend/app/seed/` — datos ficticios.
- `backend/alembic/` — migraciones (001 catálogo, 002 turnos con `EXCLUDE`).
- `backend/tests/` — suite pytest (un test por escenario de la especificación).
- `docker-compose.yml` — PostgreSQL 16 y un servicio `api` cuyo `Dockerfile` tiene el problema conocido de C-23 (ver la nota del paso 3).
- `frontend/` — estructura base de React + TypeScript + Vite, todavía sin funcionalidad; su desarrollo está planificado en C-13 a C-22.
- `frontend/design-system/` — fundación visual aprobada: tokens, marca y referencia de componentes, con `components.html` para verla en el navegador.
- `docs/discovery/` — informe de Discovery (`.md` y PDF) y resultado del checklist de once puntos.
- `docs/explore/` y `docs/verify/` — exploración y verificación de cada change.
- `docs/capturas-evidencia/` — capturas de Engram y del instalador de Active Stack.
- `knowledge-base/` — base de conocimiento del dominio.
- `CHANGES.md` — roadmap completo (C-01 a C-23) y recorte del TP original (C-01 → C-02 → C-03).
- `openspec/` — especificaciones vigentes (`specs/`) y changes archivados (`changes/archive/`).
- `AGENTS.md` y `CLAUDE.md` — reglas del agente; `.atl/skill-registry.md` — registro de skills; `.active-orchestrator-state.json` — estado del orquestador.
- `opencode.json` — comandos del flujo active-orchestrator para OpenCode.
- `.gitattributes` — normalización de fin de línea (`* text=auto`; `eol=lf` para `*.sh` y `Dockerfile`).

## Datos

Solo datos ficticios en seeds, tests y ejemplos (`DNI-FICT-*`, `MAT-FICT-*`). Nunca datos reales de pacientes ni secretos en el repositorio.

## Uso de inteligencia artificial

Este trabajo se desarrolló con asistencia de agentes de IA (OpenCode con Active Stack) y asistentes de chat (Claude y Gemini), siguiendo el flujo de la cátedra: Discovery, base de conocimiento, roadmap, reglas del agente y un ciclo OPSX completo por change. Todo lo entregado fue leído, revisado y validado por el grupo; las verificaciones de fuentes del informe y la reflexión escrita las realizaron los integrantes.

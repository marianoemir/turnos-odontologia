# turnos-odontologia

Trabajo de Integración de **Metodología I** (UTN, Tecnicatura Universitaria en Programación), desarrollado con Spec-Driven Development (OpenSpec) y Active Stack.

Integrantes: Mariano Chirino, Andrés Fabre y Facundo Quiroga.

Sistema de gestión de turnos y agenda de pacientes para consultorios odontológicos. Incluye API y aplicación web para catálogo, turnos, agenda y demás funcionalidades del proyecto. Solo se usan datos ficticios.

Stack: Python 3.13, FastAPI, SQLAlchemy, Alembic, PostgreSQL 16, Docker Compose, React, TypeScript y Vite. La autenticación es JWT; la identidad se envía con `Authorization: Bearer <token>`.

[![Ver video de defensa](https://img.shields.io/badge/▶_Ver_video_de_defensa-8_a_12_min-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/0sj4smXVclY)

## Estado del proyecto

Los **24 changes (C-01 a C-24) están implementados y archivados**. El recorte del TP y las funcionalidades posteriores están completos; no hay changes pendientes. El detalle se encuentra en [CHANGES.md](CHANGES.md).

Límite conocido para la demostración: la agenda puede mostrar las horas **3 horas adelantadas** respecto de Argentina (UTC); el dato guardado y la hora mostrada al crear el turno son correctos. Es un defecto de visualización, no de persistencia.

## Requisitos

- Git.
- Docker Desktop con Docker Compose v2 para levantar todo el sistema.
- Python 3.13 para instalar dependencias y ejecutar los tests del backend.
- Node.js `^20.19.0` o `>=22.12.0` (el CI usa Node 24) y npm para desarrollar/probar el frontend fuera del contenedor.
- Los comandos de esta guía están escritos para **PowerShell en Windows**.

## 1. Clonar e instalar dependencias

```powershell
git clone https://github.com/marianoemir/turnos-odontologia.git
cd turnos-odontologia
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
cd frontend
npm ci
cd ..
```

Si PowerShell bloquea la activación del entorno virtual:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## 2. Levantar backend y frontend (recomendado: Docker Compose)

Desde la raíz del repositorio, crear la configuración local ignorada por Git:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

En `.env`, reemplazar `SECRET_KEY` por un valor aleatorio de al menos 32 caracteres. No compartir ni commitear ese archivo. El puerto de PostgreSQL por defecto es 5432; si ya está ocupado, cambiar `POSTGRES_PORT` a `5433` y el puerto de `DATABASE_URL` al mismo valor. Antes de continuar, comprobar que el puerto elegido no lo esté usando otro proyecto.

Construir y levantar PostgreSQL, API y frontend:

```powershell
docker compose up --build -d
docker compose ps
```

Esperar que `postgres` figure como `healthy`. Aplicar migraciones y cargar el catálogo ficticio:

```powershell
docker compose exec api python -m alembic -c backend/alembic.ini upgrade head
$secure = Read-Host "Contraseña local para las cuentas ficticias (entrada oculta)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:SEED_USUARIO_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
docker compose exec -e SEED_FICTICIO=true -e "SEED_USUARIO_PASSWORD=$env:SEED_USUARIO_PASSWORD" api python -c "import backend.app.rbac.models; from backend.app.seed.catalogo import main; main()"
```

El seed carga el catálogo y crea `USUARIO-FICT-001` con rol `admin`. Si se omite `SEED_USUARIO_PASSWORD`, genera una contraseña aleatoria y la muestra una sola vez en la consola. La contraseña que ingreses arriba también se puede usar para la cuenta opcional de recepción que se crea abajo.

El seed **no** crea una cuenta de recepción. Para probar las pantallas operativas del frontend, crear `RECEP-FICT-001` (no existe endpoint de alta de usuarios). Ejecutar desde la raíz del repo y con la variable anterior aún definida; el comando no reemplaza una cuenta que ya exista:

```powershell
docker compose exec -T -e "SEED_USUARIO_PASSWORD=$env:SEED_USUARIO_PASSWORD" api python -c "import os; from backend.app.db import get_session; from backend.app.auth.models import Usuario; from backend.app.auth.password import hashear_password; from backend.app.rbac.models import Rol; s=get_session()(); u=s.query(Usuario).filter_by(dni='RECEP-FICT-001').first(); r=s.query(Rol).filter_by(nombre='recepcion').one(); (s.add(Usuario(dni='RECEP-FICT-001', password_hash=hashear_password(os.environ['SEED_USUARIO_PASSWORD']), rol_id=r.id, activo=True)) if u is None else None); s.commit(); print('RECEP-FICT-001 creado' if u is None else 'RECEP-FICT-001 ya existe'); s.close()"
Remove-Item Env:\SEED_USUARIO_PASSWORD
```

### URLs y acceso

- **Frontend:** [http://localhost:8080](http://localhost:8080)
- **Salud de la API:** [http://localhost:8000/health](http://localhost:8000/health) — debe responder `{"status":"ok"}`.
- **Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs).

Iniciar sesión en la web con `USUARIO-FICT-001` (administración) o, si se creó, `RECEP-FICT-001` (operación), usando la contraseña ficticia elegida localmente. Si la cuenta de recepción ya existía, el comando no cambia su contraseña. No guardar contraseñas ni tokens en este README, capturas o video. El rol `admin` accede a `/agenda` y `/admin`; `recepcion` accede a las pantallas operativas y de catálogo.

Para detener los contenedores sin borrar la base ficticia:

```powershell
docker compose stop
```

No usar `docker compose down -v` salvo que se quiera borrar deliberadamente el volumen y todos sus datos.

## 3. Desarrollo del frontend con Vite (opcional)

Con la API de Compose disponible en el puerto 8000, abrir otra consola:

```powershell
cd frontend
npm ci
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173). Vite reenvía `/api/*` a `http://localhost:8000` y quita el prefijo `/api`; no hace falta configurar CORS. Para detener el servidor, usar `Ctrl+C` en esa consola.

## 4. Ejecutar las pruebas

### Backend

Las pruebas borran/truncan datos de las tablas en la base indicada. **Usar únicamente `turnos_test`; nunca apuntar pytest a `turnos`.** Con Compose levantado, crear la base de pruebas una sola vez:

```powershell
docker compose ps
docker port turnos-odontologia-postgres-1
$existe = docker compose exec -T postgres psql -U odontologia -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='turnos_test';"
if ($existe.Trim() -ne "1") { docker compose exec postgres psql -U odontologia -d postgres -c "CREATE DATABASE turnos_test;" }
```

Confirmar que `docker port` muestra el puerto configurado en `.env` para el contenedor `turnos-odontologia-postgres-1`; no continuar si ese puerto pertenece a otro proyecto.

Desde la raíz del repositorio, en una consola con el entorno `.venv` activado, definir la URL de `turnos_test` (usar 5433 si ese es el puerto configurado en `.env`) y comprobarla antes de pytest:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://odontologia:odontologia@localhost:5432/turnos_test"
$env:PYTHONPATH = (Get-Location).Path
if ((($env:DATABASE_URL -split "/")[-1]) -ne "turnos_test") { throw "DATABASE_URL debe apuntar a turnos_test" }
python -m pytest backend/tests -p no:randomly -q --tb=short
```

Última verificación local (2026-11-17): **789 passed**, 4 warnings de deprecación, sin fallos ni tests omitidos (aprox. 4 minutos).

### Frontend

Desde `frontend/`:

```powershell
npx tsc -b
npm run test:run
npm run build
```

Última verificación local (2026-11-17): **658 tests en 65 archivos**; TypeScript y build correctos. Vite puede mostrar una advertencia de tamaño de bundle; no impide el build.

## 5. Comprobación rápida de la API

Con el stack levantado, `GET /health` debe responder `{"status":"ok"}` y Swagger está disponible en `/docs`. Las rutas protegidas requieren login en `POST /login` y el token JWT en `Authorization: Bearer <token>`. Las pruebas automatizadas cubren login, permisos y los contratos de la API.

---

## Variables de entorno

Ver `.env.example` (valores ficticios; **nunca** commitear un `.env` real ni secretos). La API de Compose usa la URL interna del servicio Postgres; los tests ejecutados desde el host necesitan `DATABASE_URL` apuntando explícitamente a `turnos_test`. Reserva online (C-08): `RESERVA_RATE_LIMIT_N` (default `5`) y `RESERVA_RATE_LIMIT_VENTANA_SEG` (default `600`) definidos en `.env.example`.

> **Redis todavía no está en uso.** `.env.example` define `REDIS_URL`, pero `docker-compose.yml` **no** levanta un servicio Redis: ningún change implementado hasta hoy necesita funcionalidad asincrónica. C-07 `recordatorios-confirmacion` tampoco lo usa: su procesamiento es determinista y se invoca por cron (ver §Recordatorios 48h/24h). Redis queda reservado para el primer change con funcionalidad asincrónica real.

## Recordatorios 48h/24h (job por cron)

El procesamiento de recordatorios no es asincrónico: es un job idempotente que abre su propia sesión, procesa el lote, commitea una sola vez al final e imprime el resumen. Se invoca por cron (o el Programador de tareas de Windows) desde la raíz del repo y con `DATABASE_URL` definida:

```powershell
python -m backend.app.recordatorios.job --limite 200
```

Opciones:

- `--limite N`: máximo de turnos candidatos a procesar (default 200).
- `--ahora ISO-8601`: instante de procesamiento; sin zona horaria se interpreta en `America/Argentina/Buenos_Aires`. Por defecto usa el reloj local.

Salida: `recordatorios: candidatos=N enviados=N omitidos=N fallidos=N`. El código de salida es 0 salvo error de infraestructura; un envío `fallido` no es error de proceso. Ejemplo de crontab cada 15 minutos:

```cron
*/15 * * * * cd /ruta/al/repo && .venv/bin/python -m backend.app.recordatorios.job >> /var/log/recordatorios.log 2>&1
```

## Reserva online (C-08)

Alta pública sin login ni header `X-Actor-Rol` (D3).

- **`GET /reservar/{profesional}?prestacion=<uuid>&fecha=<YYYY-MM-DD>`**: responde 200 con una lista de objetos `{"inicio", "fin"}` ordenada ascendente, sin `sillon_id` ni datos de pacientes. Ofrece un slot si al menos un sillón activo lo permite (validado vía `ServicioTurnos.validar`); solo se listan inicios futuros (`inicio > ahora` local, zona `America/Argentina/Buenos_Aires`).
- **`POST /reservar`**: body `{"nombre", "dni", "contacto" (opcional), "profesional_id", "prestacion_id", "inicio"}`. Límites: `nombre` 1-200 caracteres, `dni` 1-32 caracteres; `inicio` con zona horaria obligatoria (`AwareDatetime`). Respuesta 201 exacta: `{"turno_id", "profesional_id", "prestacion_id", "inicio", "fin", "estado"}` con `estado` `"pendiente"`.

**Errores**

| Código | Causa / detalle |
|---|---|
| 404 | Profesional o prestación inexistente (`detail` string no vacío). |
| 409 | `{"detail": {"causa", "detalle"}}` con `causa` emitida por el código: `horario`, `profesional`, `sillon` o `bloqueo` (según `ConflictoTurno` de `ServicioTurnos`/servicio de reserva). |
| 422 | Input inválido (validación FastAPI/Pydantic, ej. body incompleto, fecha inválida, `inicio` sin zona horaria, longitudes de `nombre`/`dni`, o `TurnoInvalido` del servicio con `detail` string). |
| 429 | `{"detail": {"causa": "rate_limit", "detalle": ...}}` al superar el umbral. |

**Rate limit**: por IP (`request.client.host`), en memoria y por proceso, solo en `POST /reservar`. Cada POST cuenta como intento (aunque luego falle con 409 o 422). Variables: `RESERVA_RATE_LIMIT_N` (default `5`) y `RESERVA_RATE_LIMIT_VENTANA_SEG` (default `600`).

**Límites conocidos**
- No se verifica la identidad del paciente: se reutiliza por `dni` y se ignora el `nombre` enviado, por lo que cualquiera puede agendar a nombre de un `dni` ajeno (Q-C08-10).
- Un paciente inactivo con ese `dni` recibe 422 con detalle propio (Q-C08-13).
- El paciente usado por `GET /reservar` para validar slots es el primer paciente activo; sin pacientes activos devuelve `[]` (Q-C08-12).
- Un turno reservado con menos de 48 h puede no recibir link de C-07 (Q-C08-07).
- El rate limit se reinicia con el proceso y no es efectivo con varios procesos.
- El turno queda con `creado_por` `"reserva_online"` y el paciente creado es `ficticio=true`.

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

### Rol de solo lectura (`mcp_readonly`)

El MCP debe conectarse con un rol que solo pueda leer. El rol del proyecto se creó a mano: este script es una **reconstrucción** del 2026-11-02, hecha a partir de los permisos verificados (sin superusuario, sin membresías de rol, `SELECT` en las tablas de `public`). No se comprobó que sea idéntico al original. Se ejecuta como usuario dueño, con la base levantada:

```powershell
docker compose exec postgres psql -U odontologia -d turnos
```

```sql
CREATE ROLE mcp_readonly LOGIN PASSWORD '<clave-ficticia-del-rol>';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE odontologia IN SCHEMA public GRANT SELECT ON TABLES TO mcp_readonly;
```

El `GRANT` cubre las tablas que ya existen; `ALTER DEFAULT PRIVILEGES` cubre las que cree `odontologia` de ahí en adelante (por ejemplo `lista_espera`, de C-06, que quedó sin acceso hasta el 2026-11-02). Esta segunda línea se ejecutó el 2026-11-02 y se verificó en `pg_default_acl`, pero **no se probó todavía con una migración real**. Se comprueba consultando `information_schema.role_table_grants` con `grantee = 'mcp_readonly'`.

### Variable de entorno

| Variable | Qué es | Dónde va |
|---|---|---|
| `POSTGRES_PORT` | Puerto del host para Postgres (por defecto 5432) | `.env` local (ignorado por git) |
| `DATABASE_URI` | URI que usa el MCP para conectarse | Variable de entorno de usuario. **Nunca** en archivos del repo |

Formato de `DATABASE_URI` (usuario `mcp_readonly`, no el dueño de la base):

```
postgresql://mcp_readonly:<clave-ficticia-del-rol>@host.docker.internal:5433/turnos
```

En PowerShell, guardarla de forma persistente y **reabrir** la consola y la app de OpenCode (solo la ven los procesos abiertos después):

```powershell
setx DATABASE_URI "postgresql://mcp_readonly:<clave-ficticia-del-rol>@host.docker.internal:5433/turnos"
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


## Autenticación (JWT) y Configuración

A partir de C-24, la app requiere autenticación mediante tokens JWT firmados con algoritmo HS256:

1. **SECRET_KEY**: obligatoria en el entorno para arrancar la aplicación (`SECRET_KEY=...`). Debe tener al menos 32 caracteres y ser distinta del valor por defecto de `.env.example` (`cambiar-en-produccion-solo-env`). Si falta o es insegura, la app se niega a iniciar.
2. **Login**: se realiza enviando un `POST /login` con `dni` y `password`. Devuelve un JWT que debe enviarse en todas las solicitudes protegidas bajo la cabecera `Authorization: Bearer <token>`.
3. **Seed de usuario ficticio**: al ejecutar el seed con `SEED_FICTICIO=true`, se crea un usuario de prueba con DNI `USUARIO-FICT-001` y rol `admin`. La contraseña se define mediante `SEED_USUARIO_PASSWORD`; si no se define, se genera una contraseña aleatoria segura y se muestra en la consola una sola vez.
4. **Cabeceras antiguas**: las cabeceras `X-Actor-Rol`, `X-Actor-Usuario` y `X-Sucursal-Id` y el rol por defecto `recepcion` quedan obsoletos y ya no otorgan identidad ni permisos; toda ruta protegida sin un token JWT válido responde `401 Unauthorized` (`token_ausente`).

## Estructura del repositorio

- `backend/app/turnos/` — dominio de turnos: modelo, servicio, `POST /turnos` (C-03) y cancelar y reprogramar (C-04).
- `backend/app/agenda/` — horarios, bloqueos y recursos del catálogo (C-02) y `GET /agenda` (C-05).
- `backend/app/reserva_online/` — reserva pública sin login: `GET /reservar/{profesional}` y `POST /reservar` (C-08).
- `backend/app/seed/` — datos ficticios.
- `backend/alembic/` — migraciones de esquema con Alembic.
- `backend/tests/` — suite pytest (un test por escenario de la especificación).
- `docker-compose.yml` — PostgreSQL 16, API FastAPI y frontend estático servido por Nginx.
- `frontend/` — aplicación React + TypeScript + Vite con login JWT y pantallas operativas, públicas y de administración.
- `frontend/design-system/` — fundación visual aprobada: tokens, marca y referencia de componentes, con `components.html` para verla en el navegador.
- `docs/discovery/` — informe de Discovery (`.md` y PDF) y resultado del checklist de once puntos.
- `docs/export/` — contrato de exportación de datos (`GET /export`, C-11): [docs/export/README.md](docs/export/README.md).
- `docs/migracion/` — guía de importación asistida desde planilla CSV (`scripts/import_planilla.py`, C-11): [docs/migracion/README.md](docs/migracion/README.md).
- `docs/explore/` y `docs/verify/` — exploración y verificación de cada change.
- `docs/capturas-evidencia/` — capturas de Engram y del instalador de Active Stack.
- `knowledge-base/` — base de conocimiento del dominio.
- `CHANGES.md` — índice de los 24 changes archivados (C-01 a C-24) y el recorte del TP.
- `openspec/` — especificaciones vigentes (`specs/`) y changes archivados (`changes/archive/`).
- `AGENTS.md` y `CLAUDE.md` — reglas del agente; `.atl/skill-registry.md` — registro de skills; `.active-orchestrator-state.json` — estado del orquestador.
- `opencode.json` — comandos del flujo active-orchestrator para OpenCode.
- `.gitattributes` — normalización de fin de línea (`* text=auto`; `eol=lf` para `*.sh` y `Dockerfile`).

## Datos

Solo datos ficticios en seeds, tests y ejemplos (`DNI-FICT-*`, `MAT-FICT-*`). Nunca datos reales de pacientes ni secretos en el repositorio.

## Uso de inteligencia artificial

Este trabajo se desarrolló con asistencia de agentes de IA (OpenCode con Active Stack) y asistentes de chat (Claude y Gemini), siguiendo el flujo de la cátedra: Discovery, base de conocimiento, roadmap, reglas del agente y un ciclo OPSX completo por change. Todo lo entregado fue leído, revisado y validado por el grupo; las verificaciones de fuentes del informe y la reflexión escrita las realizaron los integrantes.

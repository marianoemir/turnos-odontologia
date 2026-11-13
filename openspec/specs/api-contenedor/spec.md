# api-contenedor Specification

## Purpose
Deja el servicio `api` reproducible en Docker Compose: la imagen construye desde el root del repo, el paquete `backend` es importable en tiempo de ejecución, las migraciones de Alembic se ejecutan dentro del contenedor y la configuración de Postgres y zona horaria llega por variables de entorno con defaults ficticios.

## Requirements

### Requirement: La API arranca y responde salud dentro del contenedor

El servicio `api` construido con el root del repo como contexto SHALL quedar `running` sin reinicios y SHALL responder `GET /health` con 200 y cuerpo `{"status":"ok"}`, sin depender de que la API se ejecute desde el host.

#### Scenario: Arranque limpio con build y sin reinicios

- **GIVEN** el repositorio en la rama `feature/c-23-fix-api-contenedor` con el `docker-compose.yml` y el `backend/Dockerfile` del change ya aplicados, y Docker Desktop encendido
- **WHEN** se ejecuta `docker compose up --build -d` y se espera a que `postgres` reporte `healthy`
- **THEN** `docker compose ps` muestra `api` y `web` en estado `running`, `api` sin reinicios y `GET http://localhost:8000/health` responde 200 con cuerpo `{"status":"ok"}`

#### Scenario: El paquete backend es importable en la imagen

- **GIVEN** la imagen de `api` ya construida y el contenedor arriba
- **WHEN** se ejecuta `docker compose exec api python -c "import backend.app.main"`
- **THEN** el comando termina con código 0 y sin `ModuleNotFoundError`, porque el paquete `backend` está incluido en la imagen y es importable desde el `WORKDIR` elegido

### Requirement: Las migraciones de Alembic corren dentro del contenedor

La imagen de `api` SHALL incluir `backend/alembic.ini` y el directorio `backend/alembic/` para que `python -m alembic -c backend/alembic.ini` funcione dentro del contenedor, incluidas las revisiones y el `script_location` resuelto desde el `WORKDIR` de la imagen.

#### Scenario: La imagen incluye el archivo de configuración y las revisiones

- **GIVEN** la imagen de `api` construida con el cambio aplicado
- **WHEN** se ejecuta `docker compose exec api python -m alembic -c backend/alembic.ini current`
- **THEN** el comando termina sin error de archivo ausente ni de `script_location` y devuelve la revisión aplicada que reporta la base (o vacío si la base está sin migrar, sin fallar por módulo ausente)

#### Scenario: Segunda corrida de upgrade head es idempotente

- **GIVEN** la base migrada hasta `head` dentro del contenedor
- **WHEN** se ejecuta por segunda vez `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head`
- **THEN** el comando termina con código 0 sin aplicar ninguna revisión nueva y sin error

#### Scenario: Downgrade y upgrade vuelven a la misma revisión

- **GIVEN** la base en `head` con al menos una revisión aplicada dentro del contenedor
- **WHEN** se ejecuta `docker compose exec api python -m alembic -c backend/alembic.ini downgrade -1` y después `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head`
- **THEN** ambos comandos terminan con código 0 y la revisión final vuelve a ser la misma que había antes del `downgrade`

### Requirement: Configuración por entorno sin secretos escritos

`docker-compose.yml` SHALL leer `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `TZ` desde el entorno con defaults ficticios, SHALL reutilizarlas en el healthcheck de `postgres` y en el `DATABASE_URL` de `api`, y SHALL NOT contener credenciales reales ni secretos versionados.

#### Scenario: Credenciales del entorno se reflejan en el DATABASE_URL de api

- **GIVEN** el entorno de la shell sin `POSTGRES_USER` ni `POSTGRES_DB` definidos
- **WHEN** se definen `$env:POSTGRES_DB = "turnos_test"` y `$env:POSTGRES_USER = "otro"` y se ejecuta `docker compose config`
- **THEN** el `DATABASE_URL` de `api` sale con usuario `otro` y base `turnos_test`, y el healthcheck de `postgres` usa esos mismos valores

#### Scenario: POSTGRES_PORT solo cambia el puerto publicado en el host

- **GIVEN** la red interna de compose, donde el servicio de base se alcanza por nombre `postgres` en el puerto 5432
- **WHEN** se ejecuta `docker compose config` con y sin `$env:POSTGRES_PORT = "5433"`
- **THEN** solo cambia el mapeo host→contenedor de `postgres` (de `5432:5432` a `5433:5432`), mientras el `DATABASE_URL` de `api` sigue apuntando a `postgres:5432` en ambas corridas

#### Scenario: Los archivos versionados no contienen secretos reales

- **GIVEN** el repositorio con el cambio aplicado
- **WHEN** se busca `password` en los archivos versionados con `git grep -n -i "password"`
- **THEN** las coincidencias son únicamente defaults ficticios (`odontologia` o equivalente) y referencias `${VAR}`, sin credenciales reales ni valores de producción

### Requirement: Separación de dependencias de runtime y de desarrollo

La imagen de `api` SHALL instalar solo dependencias de runtime, todas con pin `==`, y `pytest`, `ruff` y `httpx` SHALL vivir en `backend/requirements-dev.txt`, que incluye `-r requirements.txt`. El CI SHALL instalar ambos archivos únicamente en los jobs de Python.

#### Scenario: La imagen no instala herramientas de desarrollo

- **GIVEN** la imagen de `api` construida con el cambio aplicado
- **WHEN** se ejecuta `docker compose exec api python -m pip list`
- **THEN** la salida lista las dependencias de runtime con versión pinneada y no incluye `pytest`, `ruff` ni `httpx`

#### Scenario: El CI instala los dos archivos solo en los jobs de Python

- **GIVEN** `.github/workflows/tests.yml` con exactamente tres jobs: `tests`, `lint` y `frontend`
- **WHEN** se lee el workflow después del cambio
- **THEN** los jobs `tests` y `lint` instalan `backend/requirements.txt` y `backend/requirements-dev.txt`, y el job `frontend` no instala ningún archivo de requirements porque trabaja solo con Node y npm

### Requirement: El contexto de build queda acotado por .dockerignore

El repositorio SHALL tener un `.dockerignore` en la raíz que excluya `frontend/`, `.venv`, `**/__pycache__`, `**/*.pyc`, `.git` y `docs/`, de modo que el contexto de build no incluya el frontend ni el entorno virtual.

#### Scenario: El .dockerignore de la raíz excluye los seis patrones

- **GIVEN** el `.dockerignore` nuevo en la raíz del repo
- **WHEN** se inspeccionan sus líneas con `Select-String -Path .dockerignore -Pattern '^(frontend/|\.venv|\*\*/__pycache__|\*\*/\*\.pyc|\.git|docs/)$'`
- **THEN** hay exactamente seis coincidencias, una por cada patrón exigido, y los dos patrones con `**/` cubren `__pycache__` y los `.pyc` a cualquier profundidad del contexto, no solo en la raíz

#### Scenario: El .dockerignore del frontend sigue existiendo

- **GIVEN** `frontend/.dockerignore`, creado por C-13 para el contexto de build de `web`
- **WHEN** se verifica su existencia después del cambio
- **THEN** el archivo sigue presente y sin modificar, y no se reemplaza ni se mueve al root

### Requirement: El servicio web de C-13 sigue funcionando

Los servicios de `docker-compose.yml` SHALL seguir siendo exactamente `postgres`, `api` y `web`, y el servicio `web` SHALL seguir sirviendo el frontend y proxyando `/api/` hacia `api`, de modo que `GET http://localhost:8080/api/health` responda 200.

#### Scenario: Los tres servicios siguen declarados

- **GIVEN** el `docker-compose.yml` con el cambio aplicado
- **WHEN** se ejecuta `docker compose config --services`
- **THEN** la salida lista exactamente `postgres`, `api` y `web`, sin servicios faltantes ni agregados

#### Scenario: Health a través de nginx responde 200

- **GIVEN** el stack levantado con `docker compose up --build -d` y `api` en `running`
- **WHEN** se ejecuta `curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/api/health`
- **THEN** la respuesta es `200`, porque nginx proxya `/api/` al servicio `api` quitando el prefijo

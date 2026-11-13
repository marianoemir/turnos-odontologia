# Tasks — fix-api-contenedor (C-23)

> Todos los comandos están escritos para **Windows PowerShell 5.1** desde la raíz del repo
> (`C:\Users\Mariano_Chirino\Documents\GitHub\turnos-odontologia`), en la rama
> `feature/c-23-fix-api-contenedor`. Se usa `curl.exe` (nunca el alias `curl`), `NUL` en lugar de
> `/dev/null`, `Select-String` en lugar de `grep`, y no se encadenan comandos con `&&`.
> Los pins definitivos de los grupos 4 y 8 se fijan durante apply (ver `design.md` §Preguntas abiertas Q1 y Q2).

## 1. Baseline y medición del estado actual

- [x] 1.1 Registrar el baseline de servicios y del repo antes de tocar nada.
  **Cómo se verifica**: `docker compose config --services` y `git status --short` y `git branch --show-current` y `Select-String -Path docker-compose.yml -Pattern '8000'`.
  **Resultado esperado**: `config --services` lista exactamente `postgres`, `api` y `web` (tres líneas); la rama es `feature/c-23-fix-api-contenedor`; `git status --short` sale vacío (la propuesta ya está commiteada en 8d85955); `Select-String` sobre `docker-compose.yml` encuentra el mapeo que publica `8000` del servicio `api`, del que depende la task 9.2.

- [x] 1.2 Registrar que hoy **no** existe `.dockerignore` en la raíz y que el único es el del frontend.
  **Cómo se verifica**: `Test-Path .dockerignore` y `Test-Path frontend/.dockerignore`.
  **Resultado esperado**: la primera salida es `False`; la segunda es `True`. Se anota en las notas de apply como hecho medido (es el estado que C-23 corrige).

- [x] 1.3 **Diagnóstico (puede fallar por diseño)**: probar el defecto real del contenedor y guardar la evidencia.
  **Cómo se verifica**: `docker compose build api`, luego `docker compose up -d api`, esperar 20 segundos y `docker compose ps --format "{{.Name}} {{.Status}}"`.
  **Resultado esperado**: el servicio `api` aparece como `restarting` o `exited` (no `running`), y `docker compose logs --tail 20 api` muestra `ModuleNotFoundError: No module named 'backend'` o `No module named 'app'`. **Este fallo es la evidencia del defecto, no un bloqueo**: se copia la salida literal en las notas de apply y se continúa. Al terminar, `docker compose stop api` para no dejar el contenedor en loop.

- [x] 1.4 Verificar el valor real de `script_location` para no cambiarlo sin motivo.
  **Cómo se verifica**: `Select-String -Path backend/alembic.ini -Pattern '^script_location'`.
  **Resultado esperado**: una única coincidencia con `script_location = %(here)s/alembic`. Como `%(here)s` se resuelve contra el directorio del ini, `alembic.ini` **no se modifica** en este change (ver `design.md` D3).

- [x] 1.5 Verificar los intérpretes disponibles y la versión del `.venv` existente antes de elegir la versión de Python.
  **Cómo se verifica**: `py --list` y `Select-String -Path .venv\pyvenv.cfg -Pattern 'version'`.
  **Resultado esperado**: `py --list` incluye **3.13** (además de 3.12 y 3.14): sin 3.13 no se pueden crear los venv de medición de las tasks 4.1 y 4.4, así que si falta se frena y se reporta; `pyvenv.cfg` informa `version = 3.14.4`. Se anota que el `.venv` de la raíz es de 3.14 y **no se usa para verificar**: la medición de pins y la suite se corren en el venv 3.13 de `$env:TEMP` (Q1, default `3.13`).

## 2. `.dockerignore` en la raíz

- [x] 2.1 Crear `.dockerignore` en la raíz del repo con exactamente seis líneas: `frontend/`, `.venv`, `**/__pycache__`, `**/*.pyc`, `.git`, `docs/`.
  **Cómo se verifica**: `Select-String -Path .dockerignore -Pattern '^(frontend/|\.venv|\*\*/__pycache__|\*\*/\*\.pyc|\.git|docs/)$' | Measure-Object | Select-Object -ExpandProperty Count`.
  **Resultado esperado**: `6`. Además `(Get-Content .dockerignore).Count` devuelve `6` (sin líneas extra, para que la verificación por regex sea exacta). Los dos patrones con `**/` son obligatorios: `__pycache__/*` y `*.pyc` sin prefijo solo matchean en la raíz del contexto y no cubren `backend/app/**` (ver `design.md` D4).

- [x] 2.2 Confirmar que `frontend/.dockerignore` de C-13 queda intacto y en su lugar.
  **Cómo se verifica**: `Test-Path frontend/.dockerignore` y `git status --short frontend/.dockerignore`.
  **Resultado esperado**: `True` y salida vacía en `git status` (el archivo existe y no fue modificado, movido ni reemplazado por el nuevo de la raíz).

## 3. `backend/Dockerfile` y contexto de build

- [x] 3.1 Reescribir `backend/Dockerfile` para el contexto raíz: `FROM python:3.13-slim` (sujeto a Q1), `WORKDIR /code`, `COPY backend/requirements.txt ./backend/requirements.txt`, `RUN pip install --no-cache-dir -r backend/requirements.txt`, `COPY backend/ ./backend/`, `CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]`.
  **Cómo se verifica**: `Select-String -Path backend/Dockerfile -Pattern '^COPY backend/ \./backend/$'` y `Select-String -Path backend/Dockerfile -Pattern '^CMD \["uvicorn", "backend\.app\.main:app"'` y `Select-String -Path backend/Dockerfile -Pattern '^WORKDIR /code$'`.
  **Resultado esperado**: una coincidencia en cada comando (3 en total). No queda ninguna línea con `COPY app ./app` ni con `uvicorn app.main:app`.

- [x] 3.2 Cambiar el build de `api` en `docker-compose.yml` a contexto raíz: `build: { context: ., dockerfile: backend/Dockerfile }`.
  **Cómo se verifica**: `docker compose config | Select-String -Pattern 'context: |dockerfile: '`.
  **Resultado esperado**: la salida del servicio `api` muestra `context: ...\turnos-odontologia` (la raíz absoluta) y `dockerfile: backend/Dockerfile`; el servicio `web` sigue mostrando `context: ...\frontend`. No aparece `build: backend` en ningún lado.

- [x] 3.3 Construir la imagen y probar que el paquete `backend` es importable dentro del contenedor.
  **Cómo se verifica**: `docker compose build api`, `docker compose up -d postgres`, esperar a que `docker compose ps --format "{{.Name}} {{.Status}}"` muestre el contenedor de `postgres` como `healthy`, luego `docker compose up -d api` y `docker compose exec api python -c "import backend.app.main"`.
  **Resultado esperado**: el build termina con exit code 0; el último comando termina sin salida y sin `ModuleNotFoundError` (exit 0). `docker compose ps --format "{{.Name}} {{.Status}}"` muestra `api` como `Up` sin `(restarting)`.

## 4. Dependencias: runtime con pin vs. desarrollo

- [x] 4.1 Medir los pins en un venv nuevo de la versión elegida (Q1) y guardar el `pip freeze` como evidencia. El venv y el freeze van **fuera del repo**, bajo `$env:TEMP`, para no ensuciar el árbol de trabajo.
  **Cómo se verifica**: `py -3.13 -m venv $env:TEMP\venv-medicion`, `& "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip install --upgrade pip`, `& "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip install fastapi sqlalchemy alembic "psycopg[binary]" uvicorn httpx tzdata pytest ruff`, `& "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip freeze > $env:TEMP\freeze.txt`, `Select-String -Path $env:TEMP\freeze.txt -Pattern '^(fastapi|SQLAlchemy|alembic|psycopg|psycopg-binary|uvicorn|httpx|tzdata|pytest|ruff)=='`.
  **Resultado esperado**: al menos 9 coincidencias con versión exacta (`==`) para fastapi, SQLAlchemy, alembic, psycopg, uvicorn, httpx, tzdata, pytest y ruff. El contenido de `$env:TEMP\freeze.txt` se pega en las notas de apply y el venv se borra al terminar (`Remove-Item -Recurse -Force $env:TEMP\venv-medicion`). Al final de la task, `git status --short` no muestra archivos nuevos fuera de lo esperado.

- [x] 4.2 Confirmar la clasificación de `httpx` (Q6) y escribir `backend/requirements.txt` solo con runtime y **todos** con `==`: `fastapi`, `sqlalchemy`, `alembic`, `psycopg[binary]`, `uvicorn`, `tzdata`.
  **Cómo se verifica**: `Get-ChildItem -Recurse backend/app -Include *.py | Select-String -Pattern "httpx" | Measure-Object | Select-Object -ExpandProperty Count` y `(Get-Content backend/requirements.txt | Where-Object { $_ -match '\S' }).Count` y `(Select-String -Path backend/requirements.txt -Pattern '^[^=]+==[0-9]').Count`.
  **Resultado esperado**: el primer comando devuelve `0` (ningún import de `httpx` en `backend/app/`), que es la medición que justifica el default dev de Q6; si devolviera más de `0`, `httpx` va a runtime, se ajusta la spec y se registra la evidencia. Los otros dos números son iguales (6 y 6): cada línea no vacía tiene pin `==`. `Select-String -Path backend/requirements.txt -Pattern '^(pytest|ruff|httpx)'` devuelve 0 coincidencias.

- [x] 4.3 Crear `backend/requirements-dev.txt` con `-r requirements.txt` primero, y después `pytest==<pin>`, `ruff==<pin>` y `httpx==<pin>` con los valores medidos en 4.1.
  **Cómo se verifica**: `Select-String -Path backend/requirements-dev.txt -Pattern '^-r requirements\.txt$'` y `Select-String -Path backend/requirements-dev.txt -Pattern '^(pytest|ruff|httpx)==[0-9]'`.
  **Resultado esperado**: 1 coincidencia para el `-r` en la primera línea y 3 coincidencias (pytest, ruff y httpx) con pin `==` en el segundo comando.

- [x] 4.4 Probar la instalación limpia de los dos archivos en un venv nuevo **fuera del repo** (`$env:TEMP`). **Este venv no se borra hasta terminar la task 9.5**: es el intérprete 3.13 con el que se corren `pytest` y `ruff` en 7.2 y 9.5. El `.venv` de la raíz (3.14) **no** se usa para verificar.
  **Cómo se verifica**: `py -3.13 -m venv $env:TEMP\venv-verif`, `& "$env:TEMP\venv-verif\Scripts\python.exe" -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt`, luego `& "$env:TEMP\venv-verif\Scripts\python.exe" -m pytest -rs backend/tests` y `& "$env:TEMP\venv-verif\Scripts\python.exe" -m ruff check backend/`.
  **Resultado esperado**: el `pip install` termina sin error de resolución (ningún `No matching distribution found`); `pytest` reporta passed/skipped sin fallos y `ruff` informa `All checks passed!`. Si algún pin no existe para 3.13, se reporta el error real y se ajusta **con evidencia** en las notas de apply (Q2). `git status --short` no muestra archivos nuevos fuera de lo esperado. El borrado del venv queda para la task 9.6.

- [x] 4.5 Confirmar que la imagen de `api` instala solo runtime.
  **Cómo se verifica**: `docker compose build api`, `docker compose up -d api`, `docker compose exec api python -m pip list | Select-String -Pattern '^(pytest|ruff|httpx)\s'`.
  **Resultado esperado**: 0 coincidencias (ni `pytest`, ni `ruff`, ni `httpx` dentro de la imagen) y `docker compose exec api python -m pip list | Select-String -Pattern '^(fastapi|SQLAlchemy|alembic|uvicorn|tzdata)\s'` muestra 5 coincidencias con versión pinneada.

## 5. Compose por entorno: credenciales, `TZ` y puerto

- [x] 5.1 Interpolar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `TZ` con `${VAR:-default}` ficticio en `postgres` y reutilizar los mismos valores en el `healthcheck` (`pg_isready -U ... -d ...`) y en el `DATABASE_URL` de `api` con host `postgres` y puerto interno `5432`.
  **Cómo se verifica**: `docker compose config | Select-String -Pattern 'POSTGRES_|pg_isready|DATABASE_URL|TZ'`.
  **Resultado esperado**: el YAML resuelto muestra `odontologia` / `odontologia` / `turnos` / `America/Argentina/Buenos_Aires` en los tres lugares (`environment` de `postgres`, `healthcheck.test` y `DATABASE_URL` de `api`), y el `DATABASE_URL` de `api` apunta a `postgres:5432`.

- [x] 5.2 Comprobar que cambiar `POSTGRES_DB` y `POSTGRES_USER` en el entorno se refleja en `api`, y que `POSTGRES_PORT` solo mueve el mapeo del host.
  **Cómo se verifica**: `$env:POSTGRES_DB = "turnos_test"; $env:POSTGRES_USER = "otro"; docker compose config | Select-String -Pattern "DATABASE_URL"; Remove-Item Env:POSTGRES_DB; Remove-Item Env:POSTGRES_USER` y después `$env:POSTGRES_PORT = "5433"; docker compose config | Select-String -Pattern "published|target|5432|5433"; Remove-Item Env:POSTGRES_PORT`.
  **Resultado esperado**: en el primer bloque el `DATABASE_URL` sale como `postgresql+psycopg://otro:odontologia@postgres:5432/turnos_test` (usuario y base del entorno, puerto interno 5432). En el segundo bloque el mapeo de `postgres` sale `published: "5433"` con `target: 5432` **y** el `DATABASE_URL` de `api` sigue en `postgres:5432` (el puerto del entorno no contamina la URL interna).

- [x] 5.3 Confirmar que no quedan secretos ni credenciales reales en archivos versionados.
  **Cómo se verifica**: `git grep -n -i "password"`.
  **Resultado esperado**: todas las coincidencias son defaults ficticios (`odontologia`) o referencias `${POSTGRES_PASSWORD:-...}` en `docker-compose.yml`, `.env.example`, `README.md` o `knowledge-base/`; ninguna credencial real, token ni valor de producción.

- [x] 5.4 Agregar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `POSTGRES_PORT` a `.env.example` con los defaults ficticios y un comentario de que los valores reales van solo en un `.env` no versionado.
  **Cómo se verifica**: `Select-String -Path .env.example -Pattern '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|POSTGRES_PORT)='`.
  **Resultado esperado**: 4 coincidencias, todas con valores ficticios (`odontologia`, `odontologia`, `turnos`, `5433` o `5432` según lo que el README documente), sin ningún valor real.

- [x] 5.5 Verificar que `postgres` levanta `healthy` solo con los defaults, sin variables de entorno definidas.
  **Cómo se verifica**: `docker compose down`, `docker compose up -d postgres`, esperar y `docker compose ps --format "{{.Name}} {{.Status}}"`.
  **Resultado esperado**: el contenedor de `postgres` aparece `Up ... (healthy)` sin haber definido ninguna variable `POSTGRES_*` en la shell. **Nota:** si el volumen `pgdata` ya existía, conserva las credenciales y la base con las que se inicializó; los defaults de la shell no lo re-inicializan (ver el riesgo del volumen en `design.md` §Risks y la task 8.3 para el `docker compose down -v`).

## 6. Alembic dentro del contenedor

- [x] 6.1 Verificar que la imagen incluye el ini y las revisiones, consultando la revisión aplicada desde adentro del contenedor.
  **Cómo se verifica**: `docker compose up -d api`, `docker compose exec api python -m alembic -c backend/alembic.ini current`.
  **Resultado esperado**: el comando termina con exit 0, sin `No such file or directory` ni error de `script_location`, e imprime la revisión aplicada que reporta la base (o vacío si la base está sin migrar). Si apareciera un error de `script_location`, se ajusta `backend/alembic.ini` **y se registra la evidencia** antes de seguir (Q4).

- [x] 6.2 Correr `upgrade head` y probar que la segunda corrida es idempotente.
  **Cómo se verifica**: `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head`, luego el mismo comando una segunda vez.
  **Resultado esperado**: la primera corrida aplica las revisiones pendientes hasta `head` (o informa que ya está al día) con exit 0; la segunda corrida termina con exit 0 **sin aplicar ninguna revisión nueva**.

- [x] 6.3 Probar el borde de rollback y re-aplicación dentro del contenedor.
  **Cómo se verifica**: `docker compose exec api python -m alembic -c backend/alembic.ini downgrade -1`, luego `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head` y por último `docker compose exec api python -m alembic -c backend/alembic.ini current`.
  **Resultado esperado**: `downgrade -1` y `upgrade head` terminan con exit 0, y el `current` final devuelve la misma revisión que había antes del `downgrade`. Se anota que estos comandos operan sobre la base local de datos ficticios.

## 7. Docstring real de `backend/app/main.py`

- [x] 7.1 Reemplazar el docstring `"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""` por una descripción real: app FastAPI que expone `/health` y monta los routers de turnos, agenda, catálogo, lista de espera, historia clínica, caja, RBAC, export, recordatorios y reserva online, todos con SQLAlchemy sobre `DATABASE_URL`.
  **Cómo se verifica**: `Select-String -Path backend/app/main.py -Pattern "solo GET /health"` y `Select-String -Path backend/app/main.py -Pattern "sin DB"` y `Select-String -Path backend/app/main.py -Pattern "routers"`.
  **Resultado esperado**: 0 coincidencias en los primeros dos comandos y al menos 1 coincidencia en el tercero (el docstring menciona los routers montados).

- [x] 7.2 Confirmar que la corrección del docstring no tocó rutas ni comportamiento.
  **Cómo se verifica**: `git --no-pager diff -U0 backend/app/main.py | Select-String -Pattern '^[+-]@app|^[+-]app\.include_router'` y después `& "$env:TEMP\venv-verif\Scripts\python.exe" -m ruff check backend/` (el venv 3.13 de la task 4.4, todavía sin borrar; el `.venv` de la raíz en 3.14 **no** se usa para verificar).
  **Resultado esperado**: 0 coincidencias en el diff filtrado (ninguna línea de `@app` ni de `include_router` cambió) y `ruff` informa `All checks passed!`.

## 8. README y CI

- [x] 8.1 En `.github/workflows/tests.yml`, instalar `backend/requirements.txt` **y** `backend/requirements-dev.txt` solo en los jobs `tests` y `lint`; no tocar el job `frontend`.
  **Cómo se verifica**: `Select-String -Path .github/workflows/tests.yml -Pattern 'requirements-dev\.txt'` y `Select-String -Path .github/workflows/tests.yml -Pattern '^  (tests|lint|frontend):$'` y `Select-String -Path .github/workflows/tests.yml -Pattern 'npm ci'`.
  **Resultado esperado**: 2 coincidencias de `requirements-dev.txt` (una por job Python), 3 coincidencias de nombres de job (`tests`, `lint`, `frontend`) y 1 coincidencia de `npm ci` (el job `frontend` sigue igual, sin pasos de Python ni de requirements).

- [x] 8.2 Actualizar el README §1 para instalar los dos archivos (`python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt`), en PowerShell y en bash.
  **Cómo se verifica**: `Select-String -Path README.md -Pattern 'requirements-dev\.txt'`.
  **Resultado esperado**: al menos 2 coincidencias (bloque PowerShell y bloque bash), y ninguna sección queda instalando solo `requirements.txt` para desarrollo.

- [x] 8.3 Documentar las migraciones dentro del contenedor, reemplazar el camino viejo en §3 y §4 y documentar el volumen `pgdata`.
  **Cómo se verifica**: `Select-String -Path README.md -Pattern 'docker compose exec api python -m alembic'` y `Select-String -Path README.md -Pattern 'docker compose up --build'` y `Select-String -Path README.md -Pattern 'down -v'`.
  **Resultado esperado**: al menos 1 coincidencia por patrón: el README muestra `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head` (y `current` / `downgrade -1`) dentro del contenedor, `docker compose up --build` como forma de levantar API + web, y **una nota que explica que cambiar `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` con un volumen `pgdata` ya inicializado no tiene efecto y hace fallar la autenticación de `api`, con `docker compose down -v` como remedio, aclarando que eso borra los datos y solo es aceptable con datos ficticios**.

- [x] 8.4 Borrar la advertencia que dice que el servicio `api` no arranca.
  **Cómo se verifica**: `Select-String -Path README.md -Pattern "todavía no arranca"` y `Select-String -Path README.md -Pattern "no arranca"`.
  **Resultado esperado**: 0 coincidencias en ambos comandos. Si quedara alguna nota sobre C-23, debe describir el estado corregido, no el defecto.

- [x] 8.5 Verificar la coherencia de la versión de Python elegida en README, Dockerfile y CI.
  **Cómo se verifica**: `Select-String -Path backend/Dockerfile -Pattern '^FROM python:'` y `Select-String -Path .github/workflows/tests.yml -Pattern 'python-version'` y `Select-String -Path README.md -Pattern 'Python 3\.'`.
  **Resultado esperado**: el `FROM` del Dockerfile y los dos `python-version` del CI declaran la **misma** versión (default propuesto `3.13`), y el README §Requisitos nombra esa versión como la soportada.

## 9. Verificación end-to-end y cierre de la task 5.2 de C-13

- [x] 9.1 Levantar el stack completo desde cero.
  **Cómo se verifica**: `docker compose down`, `docker compose up --build -d`, esperar a que `postgres` esté `healthy`, luego `docker compose ps --format "{{.Name}} {{.Status}}"`.
  **Resultado esperado**: `postgres` `Up ... (healthy)`, `api` `Up` **sin** `(restarting)` ni reinicios, y `web` `Up`. Ninguno de los tres aparece `exited`.

- [x] 9.2 Verificar `/health` directo contra `api`.
  **Cómo se verifica**: con cualquier `uvicorn` del host detenido (paso 5 del README), `curl.exe -s -o NUL -w "%{http_code}" http://localhost:8000/health` y `curl.exe -s http://localhost:8000/health`. Fallback si `curl.exe` del host no está disponible: `docker compose exec api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"`.
  **Resultado esperado**: el primer comando imprime `200` y el segundo imprime exactamente `{"status":"ok"}` (el fallback imprime lo mismo desde adentro del contenedor).

- [x] 9.3 Verificar `/api/health` a través de nginx (`web`) y **cerrar la task 5.2 de C-13** con la evidencia.
  **Cómo se verifica**: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/api/health` y `curl.exe -s http://localhost:8080/api/health`.
  **Resultado esperado**: `200` y `{"status":"ok"}`. La salida literal de ambos comandos se pega en las notas de apply de este `tasks.md` como evidencia del cierre de la task 5.2 de C-13 (el archivo archivado de C-13 **no se edita**).

- [x] 9.4 Confirmar que C-23 no rompió el servicio `web` de C-13.
  **Cómo se verifica**: `docker compose config --services` y `(docker compose config --services | Measure-Object -Line).Lines`.
  **Resultado esperado**: exactamente `postgres`, `api` y `web` (3 líneas, sin servicios faltantes ni agregados).

- [ ] 9.5 Correr la suite y el lint completos, y validar el change.
  **Cómo se verifica**: `& "$env:TEMP\venv-verif\Scripts\python.exe" -m pytest -rs backend/tests` y `& "$env:TEMP\venv-verif\Scripts\python.exe" -m ruff check backend/` y `openspec validate c-23-fix-api-contenedor --strict`. Se usa el venv 3.13 de la task 4.4, que todavía no se borró; el `.venv` de la raíz en 3.14 **no** se usa para verificar.
  **Resultado esperado**: `pytest` sin fallos (los tests de DB necesitan `DATABASE_URL` apuntando a `turnos` o a una base terminada en `_test`; sin ella se saltean y hay que reportar los conteos reales), `ruff` con `All checks passed!` y la validación de OpenSpec sin issues.

- [ ] 9.6 Dejar el entorno limpio, sin contenedores corriendo, y borrar el venv de verificación.
  **Cómo se verifica**: `docker compose down` y `docker compose ps`, luego `Remove-Item -Recurse -Force $env:TEMP\venv-verif` (recién ahora, después de 9.5) y `Remove-Item -Force $env:TEMP\freeze.txt`.
  **Resultado esperado**: `docker compose ps` sin filas de servicios en ejecución (solo el encabezado). El volumen `pgdata` se conserva, no se borra con `-v`. El venv y el freeze de `$env:TEMP` ya no existen y `git status --short` no muestra archivos nuevos fuera de lo esperado.

## Workflow follow-up

- Marcar `[x]` la línea `**Estado**` de `[C-23]` en `CHANGES.md` al archivar y actualizar el resumen de estado, sin reescribir el texto de changes archivados.
- Verificar si `AGENTS.md` / `CLAUDE.md` necesitan reflejar el arranque por compose (hoy describen `uvicorn` desde el host) y, si se editan, dejarlos idénticos y comprobarlo con `(Get-FileHash AGENTS.md).Hash -eq (Get-FileHash CLAUDE.md).Hash`.
- Archivar el change cuando la revisión esté satisfecha: `openspec archive c-23-fix-api-contenedor`, y confirmar que `api-contenedor` aparece en `openspec/specs/`.
- No editar `openspec/changes/archive/2026-11-12-c-13-frontend-foundation/tasks.md`: la evidencia del cierre de su task 5.2 vive en el punto 9.3 de este archivo.

---

## Notas de apply

### Grupo 1 — Baseline y medición del estado actual (2026-11-13)

Rama `feature/c-23-fix-api-contenedor`, PowerShell 5.1, raíz del repo. Este grupo no modificó ningún archivo del repo salvo este `tasks.md`; no hubo commit ni push.

#### 1.1 — Baseline de servicios y repo

```
PS> docker compose config --services
postgres
api
web
```

```
PS> git status --short
<sin salida>
```

```
PS> git branch --show-current
feature/c-23-fix-api-contenedor
```

```
PS> Select-String -Path docker-compose.yml -Pattern '8000'

docker-compose.yml:21:      - "8000:8000"

```

`git status --short` salió vacío porque la propuesta ya está commiteada en `8d85955`. Verificado con `git ls-files openspec/changes/c-23-fix-api-contenedor` (5 archivos versionados: `.openspec.yaml`, `design.md`, `proposal.md`, `specs/api-contenedor/spec.md`, `tasks.md`), `git check-ignore -v openspec/changes/c-23-fix-api-contenedor` (sin salida: no está ignorada) y `Test-Path openspec/changes/c-23-fix-api-contenedor` (`True`).

#### 1.2 — `.dockerignore` en la raíz

```
PS> Test-Path .dockerignore
False
```

```
PS> Test-Path frontend/.dockerignore
True
```

#### 1.4 — `script_location` real

```
PS> Select-String -Path backend/alembic.ini -Pattern '^script_location'

backend\alembic.ini:2:script_location = %(here)s/alembic

```

#### 1.5 — Intérpretes disponibles y versión del `.venv`

```
PS> py --list
 -V:3.14 *        Python 3.14.4
 -V:3.13          Python 3.13 (64-bit)
 -V:3.12          Python 3.12 (64-bit)
```

```
PS> Select-String -Path .venv\pyvenv.cfg -Pattern 'version'

.venv\pyvenv.cfg:3:version = 3.14.4

```

#### 1.3 — Diagnóstico del contenedor (evidencia del defecto)

**Sobre si hubo build en esta corrida:** sí, `docker compose build api` se ejecutó dos veces en esta sesión (la primera con `2>&1`, que PowerShell reportó como `Exited with code 1` por el manejo de stderr; la segunda para capturar el exit code real). El exit code real fue `0`, pero **todas las capas salieron `CACHED` y no se construyó una imagen nueva**: el tag `turnos-odontologia-api:latest` quedó apuntando a una imagen que ya existía. Salida de la segunda corrida:

```
PS> docker compose build api
#1 [internal] load local bake definitions
#1 reading from stdin 611B done
#1 DONE 0.0s

#2 [internal] load build definition from Dockerfile
#2 transferring dockerfile: 244B 0.0s done
#2 DONE 0.0s

#3 [internal] load metadata for docker.io/library/python:3.12-slim
#3 DONE 0.3s

#4 [internal] load .dockerignore
#4 transferring context: 2B done
#4 DONE 0.0s

#5 [internal] load build context
#5 transferring context: 11.30kB 0.0s done
#5 DONE 0.0s

#6 [1/5] FROM docker.io/library/python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
#6 resolve docker.io/library/python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b 0.0s done
#6 DONE 0.0s

#7 [3/5] COPY requirements.txt .
#7 CACHED

#8 [2/5] WORKDIR /code
#8 CACHED

#9 [4/5] RUN pip install --no-cache-dir -r requirements.txt
#9 CACHED

#10 [5/5] COPY app ./app
#10 CACHED

#11 exporting to image
#11 exporting layers done
#11 exporting manifest sha256:549b77b0133d6ef49d2ee2cd8fd10a904e6b8c5ae3e7da8cfc8f52f68277e15f done
#11 exporting config sha256:cfc7a2d1645be0805284c23ee616f4a12535574063e9ce2fddbc28c425f8a4e8 done
#11 exporting attestation manifest sha256:7252529fdff657358c6b9a538724de954a30ee7a4baebe135b3162575160a08c 0.0s done
#11 exporting manifest list sha256:c94ddf08414699760f7c0f83b177dc253af04817554869e2ea7d51d68d542c9c
#11 exporting manifest list sha256:c94ddf08414699760f7c0f83b177dc253af04817554869e2ea7d51d68d542c9c 0.0s done
#11 naming to docker.io/library/turnos-odontologia-api:latest done
#11 unpacking to docker.io/library/turnos-odontologia-api:latest 0.0s done
#11 DONE 0.1s

#12 resolving provenance for metadata file
#12 DONE 0.0s
EXIT=0
```

```
PS> docker image ls turnos-odontologia-api
IMAGE                           ID             DISK USAGE   CONTENT SIZE   EXTRA
turnos-odontologia-api:latest   03c19150dc97        337MB         81.7MB   U
```

**El contenedor `api-1` no se recreó y corre otra imagen.** `docker compose up -d api` informó `Starting`/`Started` (sin `Recreated`), así que reutilizó el contenedor preexistente, creado el `2026-11-13T01:33:43.84933504Z`. Los IDs no coinciden:

```
PS> docker inspect turnos-odontologia-api-1 --format "{{.Image}}"
sha256:019291acba42d19fdcec73d574bf8924bf7be8367103e7c64666defa81f4011d
```

```
PS> docker image inspect turnos-odontologia-api:latest --format "{{.Id}}"
sha256:c94ddf08414699760f7c0f83b177dc253af04817554869e2ea7d51d68d542c9c
```

```
PS> docker image ls --digests turnos-odontologia-api
REPOSITORY               TAG       DIGEST                                                                    IMAGE ID       CREATED        SIZE
turnos-odontologia-api   latest    sha256:c94ddf08414699760f7c0f83b177dc253af04817554869e2ea7d51d68d542c9c   c94ddf08       10 hours ago   337MB
```

```
PS> docker image inspect sha256:019291acba42d19fdcec73d574bf8924bf7be8367103e7c64666defa81f4011d --format "Id={{.Id}}"
Error response from daemon: No such image: sha256:019291acba42d19fdcec73d574bf8924bf7be8367103e7c64666defa81f4011d
```

```
PS> docker ps -a --filter "name=turnos-odontologia-api-1" --format "{{.Names}} {{.Image}} {{.Status}}"
turnos-odontologia-api-1 019291acba42 Exited (1) 7 minutes ago
```

Consecuencia: **el log de abajo es del contenedor preexistente (`Exited (1)`), no de un contenedor creado a partir de la imagen de esta corrida**. Documenta el defecto en ese contenedor; no prueba el comportamiento de la imagen `c94ddf08`, que recién se va a ejercitar con el build y la recreación del grupo 3.

```
PS> docker compose up -d api
 Container turnos-odontologia-postgres-1 Running 
 Container turnos-odontologia-postgres-1 Waiting 
 Container turnos-odontologia-postgres-1 Healthy 
 Container turnos-odontologia-api-1 Starting 
 Container turnos-odontologia-api-1 Started 
EXIT=0
```

```
PS> Start-Sleep -Seconds 20; docker compose ps --format "{{.Name}} {{.Status}}"
turnos-odontologia-postgres-1 Up 10 hours (healthy)
```

Comando extra (no está en la task; se agregó para ver el estado del contenedor detenido, que `docker compose ps` sin `-a` no lista):

```
PS> docker compose ps -a --format "{{.Name}} {{.Status}}"
turnos-odontologia-api-1 Exited (1) 30 seconds ago
turnos-odontologia-postgres-1 Up 10 hours (healthy)
turnos-odontologia-web-1 Exited (0) 10 hours ago
```

`turnos-odontologia-web-1 Exited (0) 10 hours ago` es un contenedor preexistente de C-13, ajeno a esta task.

```
PS> docker compose logs --tail 20 api
api-1  |   File "/usr/local/lib/python3.12/site-packages/uvicorn/config.py", line 434, in load_app
api-1  |     return import_from_string(self.app)
api-1  |            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
api-1  |   File "/usr/local/lib/python3.12/site-packages/uvicorn/importer.py", line 22, in import_from_string
api-1  |     raise exc from None
api-1  |   File "/usr/local/lib/python3.12/site-packages/uvicorn/importer.py", line 19, in import_from_string
api-1  |     module = importlib.import_module(module_str)
api-1  |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^
api-1  |   File "/usr/local/lib/python3.12/importlib/__init__.py", line 90, in import_module
api-1  |     return _bootstrap._gcd_import(name[level:], package, level)
api-1  |            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
api-1  |   File "<frozen importlib._bootstrap>", line 1387, in _gcd_import
api-1  |   File "<frozen importlib._bootstrap>", line 1360, in _find_and_load
api-1  |   File "<frozen importlib._bootstrap>", line 1331, in _find_and_load_unlocked
api-1  |   File "<frozen importlib._bootstrap>", line 935, in _load_unlocked
api-1  |   File "<frozen importlib._bootstrap_external>", line 999, in exec_module
api-1  |   File "<frozen importlib._bootstrap>", line 488, in _call_with_frames_removed
api-1  |   File "/code/app/main.py", line 5, in <module>
api-1  |     from backend.app.agenda.router import router as agenda_router
api-1  | ModuleNotFoundError: No module named 'backend'
```

```
PS> docker compose stop api
 Container turnos-odontologia-api-1 Stopping 
 Container turnos-odontologia-api-1 Stopped 
EXIT=0
```

**Estado visto para `api`: `Exited (1)`** (sin política de reinicio no queda en `restarting`). El comando de la task (`docker compose ps --format ...`) no lista el contenedor detenido; su estado se ve con `docker compose ps -a`. La desviación queda registrada en estas notas y, por decisión del usuario, **la task se marca `[x]`**.

Observación de BuildKit: el paso `#4 [internal] load .dockerignore / transferring context: 2B` aparece aunque `Test-Path backend/.dockerignore` devuelve `False`; no hay ningún `.dockerignore` en `backend/` ni en la raíz, y el contexto de build sigue siendo `backend/` (11.30kB). (Estado al momento del grupo 1; a partir de la task 2.1 sí existe el `.dockerignore` de la raíz.)

### Grupo 2 — `.dockerignore` en la raíz (2026-11-13)

Archivo creado: sólo `.dockerignore` en la raíz. `frontend/.dockerignore`, Dockerfile, compose, requirements, README y `tests.yml` no se tocaron.

#### 2.1 — Creación y conteo de patrones

```
PS> Get-Content .dockerignore -Encoding UTF8
frontend/
.venv
**/__pycache__
**/*.pyc
.git
docs/
```

```
PS> Select-String -Path .dockerignore -Pattern '^(frontend/|\.venv|\*\*/__pycache__|\*\*/\*\.pyc|\.git|docs/)$' | Measure-Object | Select-Object -ExpandProperty Count
6
```

```
PS> (Get-Content .dockerignore).Count
6
```

Comando extra (no está en la task; confirma que no hay líneas vacías ni comentarios y que los saltos son LF puros):

```
PS> $raw = [IO.File]::ReadAllText((Resolve-Path .dockerignore)); Write-Output ("CR=" + ([regex]::Matches($raw, "`r").Count)); Write-Output ("LF=" + ([regex]::Matches($raw, "`n").Count)); Write-Output ("BYTES=" + (Get-Item .dockerignore).Length)
CR=0
LF=6
BYTES=51
```

#### 2.2 — `frontend/.dockerignore` intacto

```
PS> Test-Path frontend/.dockerignore
True
```

```
PS> git status --short frontend/.dockerignore
<sin salida>
```

```
PS> git status --short
?? .dockerignore
```

### Grupo 3 — `backend/Dockerfile` y contexto de build (2026-11-13)

Archivos: `backend/Dockerfile` (reescrito), `docker-compose.yml` (solo el `build` del servicio `api`) y este `tasks.md`. No se tocaron el servicio `web`, el servicio `postgres`, las variables de entorno de `api`, `requirements`, README ni `tests.yml`.

**WORKDIR elegido: `/code` (raíz del repo).** Por qué (design D2): es el único directorio desde el cual `import backend.app.main` resuelve sin `PYTHONPATH`, porque `backend/__init__.py` existe y alcanza con que el directorio que contiene `backend/` esté en `sys.path`; es además el mismo punto de partida que el README usa desde el host (`python -m uvicorn backend.app.main:app`), así que `-c backend/alembic.ini` sirve igual adentro y afuera. `COPY backend/ ./backend/` reproduce el layout del repo (app + `alembic/` + `alembic.ini` + requirements) y el `COPY` de requirements va separado y antes del código para mantener cacheada la capa de `pip install`.

#### 3.1 — `backend/Dockerfile`

```
PS> Select-String -Path backend/Dockerfile -Pattern '^COPY backend/ \./backend/$'

backend\Dockerfile:5:COPY backend/ ./backend/

```

```
PS> Select-String -Path backend/Dockerfile -Pattern '^CMD \["uvicorn", "backend\.app\.main:app"'

backend\Dockerfile:6:CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

```

```
PS> Select-String -Path backend/Dockerfile -Pattern '^WORKDIR /code$'

backend\Dockerfile:2:WORKDIR /code

```

Comando extra (no está en la task; comprueba que no quedaron los patrones viejos):

```
PS> Select-String -Path backend/Dockerfile -Pattern 'COPY app \./app|uvicorn app\.main:app' | Measure-Object | Select-Object -ExpandProperty Count
0
```

#### 3.2 — `build` de `api` con contexto raíz

```
PS> docker compose config | Select-String -Pattern 'context: |dockerfile: '
      context: C:\Users\Mariano_Chirino\Documents\GitHub\turnos-odontologia
      dockerfile: backend/Dockerfile
      context: C:\Users\Mariano_Chirino\Documents\GitHub\turnos-odontologia\frontend
      dockerfile: Dockerfile
```

`api` resuelve al contexto raíz con `dockerfile: backend/Dockerfile`; `web` sigue con `context: ...\frontend`. No aparece `build: backend` en ningún lado.

#### 3.3 — Build, recreación del contenedor e import del paquete

```
PS> docker compose build api
 Image turnos-odontologia-api Building 
#1 [internal] load local bake definitions
#1 reading from stdin 602B done
#1 DONE 0.0s

#2 [internal] load build definition from Dockerfile
#2 transferring dockerfile: 295B done
#2 DONE 0.1s

#3 [internal] load metadata for docker.io/library/python:3.13-slim
#3 DONE 2.1s

#4 [internal] load .dockerignore
#4 transferring context: 91B done
#4 DONE 0.0s

#5 [internal] load build context
#5 transferring context: 735.25kB 0.1s done
#5 DONE 0.2s

#6 [1/5] FROM docker.io/library/python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
#6 resolve docker.io/library/python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90 0.0s done
#6 sha256:0069ea31add00b9f63dbb3f0bcee44990654c5e2c17ccfeaeae47e74edf44498 0B / 1.29MB 0.2s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 0B / 11.92MB 0.2s
#6 sha256:f7a79299dedd5c817d47e3f61cf6eecae73b92cb193a1ef52180a46b0161c50a 0B / 248B 0.2s
#6 sha256:0069ea31add00b9f63dbb3f0bcee44990654c5e2c17ccfeaeae47e74edf44498 1.29MB / 1.29MB 0.4s done
#6 sha256:f7a79299dedd5c817d47e3f61cf6eecae73b92cb193a1ef52180a46b0161c50a 248B / 248B 0.5s done
#6 extracting sha256:0069ea31add00b9f63dbb3f0bcee44990654c5e2c17ccfeaeae47e74edf44498
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 1.05MB / 11.92MB 0.8s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 2.10MB / 11.92MB 0.9s
#6 extracting sha256:0069ea31add00b9f63dbb3f0bcee44990654c5e2c17ccfeaeae47e74edf44498 0.3s done
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 4.19MB / 11.92MB 1.1s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 6.29MB / 11.92MB 1.4s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 7.34MB / 11.92MB 1.5s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 8.39MB / 11.92MB 1.7s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 9.44MB / 11.92MB 1.8s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 11.53MB / 11.92MB 2.0s
#6 sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 11.92MB / 11.92MB 2.0s done
#6 extracting sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565
#6 extracting sha256:faa890a31e98e11bc3138d9549c86441024fdb24bd555bb0bca17dc9a6c5b565 1.0s done
#6 DONE 3.2s

#6 [1/5] FROM docker.io/library/python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
#6 extracting sha256:f7a79299dedd5c817d47e3f61cf6eecae73b92cb193a1ef52180a46b0161c50a 0.0s done
#6 DONE 3.2s

#7 [2/5] WORKDIR /code
#7 DONE 0.2s

#8 [3/5] COPY backend/requirements.txt ./backend/requirements.txt
#8 DONE 0.1s

#9 [4/5] RUN pip install --no-cache-dir -r backend/requirements.txt
#9 2.481 Collecting fastapi>=0.115 (from -r backend/requirements.txt (line 1))
#9 2.675   Downloading fastapi-0.162.5-py3-none-any.whl.metadata (27 kB)
#9 3.228 Collecting sqlalchemy>=2.0 (from -r backend/requirements.txt (line 2))
#9 3.259   Downloading sqlalchemy-2.1.8-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (9.7 kB)
#9 3.346 Collecting alembic (from -r backend/requirements.txt (line 3))
#9 3.368   Downloading alembic-1.20.1-py3-none-any.whl.metadata (7.3 kB)
#9 3.420 Collecting psycopg>=3.1 (from psycopg[binary]>=3.1->-r backend/requirements.txt (line 4))
#9 3.443   Downloading psycopg-3.3.9-py3-none-any.whl.metadata (4.4 kB)
#9 3.504 Collecting uvicorn (from -r backend/requirements.txt (line 5))
#9 3.528   Downloading uvicorn-0.54.0-py3-none-any.whl.metadata (6.6 kB)
#9 3.572 Collecting httpx (from -r backend/requirements.txt (line 6))
#9 3.597   Downloading httpx-0.28.1-py3-none-any.whl.metadata (7.1 kB)
#9 3.645 Collecting pytest>=8 (from -r backend/requirements.txt (line 7))
#9 3.670   Downloading pytest-9.2.0-py3-none-any.whl.metadata (7.9 kB)
#9 4.113 Collecting ruff (from -r backend/requirements.txt (line 8))
#9 4.151   Downloading ruff-0.17.5-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (20 kB)
#9 4.186 Collecting tzdata (from -r backend/requirements.txt (line 9))
#9 4.209   Downloading tzdata-2026.6-py2.py3-none-any.whl.metadata (1.4 kB)
#9 4.253 Collecting starlette>=0.46.0 (from fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 4.277   Downloading starlette-1.10.0-py3-none-any.whl.metadata (6.6 kB)
#9 4.319 Collecting anyio>=4.1.0 (from fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 4.343   Downloading anyio-4.16.0-py3-none-any.whl.metadata (4.7 kB)
#9 4.484 Collecting pydantic>=2.9.0 (from fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 4.508   Downloading pydantic-2.14.3-py3-none-any.whl.metadata (141 kB)
#9 4.632 Collecting typing-extensions>=4.8.0 (from fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 4.661   Downloading typing_extensions-4.16.0-py3-none-any.whl.metadata (3.3 kB)
#9 4.695 Collecting typing-inspection>=0.4.2 (from fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 4.722   Downloading typing_inspection-0.4.5-py3-none-any.whl.metadata (2.6 kB)
#9 4.758 Collecting annotated-doc>=0.0.2 (from fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 4.785   Downloading annotated_doc-0.0.6-py3-none-any.whl.metadata (6.5 kB)
#9 4.827 Collecting opentelemetry-api>=1.44.0 (from fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 4.850   Downloading opentelemetry_api-1.45.2-py3-none-any.whl.metadata (1.4 kB)
#9 4.890 Collecting Mako (from alembic->-r backend/requirements.txt (line 3))
#9 4.915   Downloading mako-1.4.3-py3-none-any.whl.metadata (2.9 kB)
#9 4.953 Collecting click>=7.0 (from uvicorn->-r backend/requirements.txt (line 5))
#9 4.982   Downloading click-8.5.1-py3-none-any.whl.metadata (2.6 kB)
#9 5.017 Collecting h11>=0.8 (from uvicorn->-r backend/requirements.txt (line 5))
#9 5.042   Downloading h11-0.16.0-py3-none-any.whl.metadata (8.3 kB)
#9 5.083 Collecting certifi (from httpx->-r backend/requirements.txt (line 6))
#9 5.106   Downloading certifi-2026.10.23-py3-none-any.whl.metadata (2.5 kB)
#9 5.141 Collecting httpcore==1.* (from httpx->-r backend/requirements.txt (line 6))
#9 5.164   Downloading httpcore-1.0.9-py3-none-any.whl.metadata (21 kB)
#9 5.206 Collecting idna (from httpx->-r backend/requirements.txt (line 6))
#9 5.233   Downloading idna-3.20-py3-none-any.whl.metadata (7.2 kB)
#9 5.267 Collecting iniconfig>=2 (from pytest>=8->-r backend/requirements.txt (line 7))
#9 5.291   Downloading iniconfig-2.3.1-py3-none-any.whl.metadata (2.8 kB)
#9 5.325 Collecting packaging>=24 (from pytest>=8->-r backend/requirements.txt (line 7))
#9 5.349   Downloading packaging-26.3-py3-none-any.whl.metadata (3.5 kB)
#9 5.382 Collecting pluggy<2,>=1.6 (from pytest>=8->-r backend/requirements.txt (line 7))
#9 5.405   Downloading pluggy-1.7.0-py3-none-any.whl.metadata (5.0 kB)
#9 5.443 Collecting pygments>=2.15 (from pytest>=8->-r backend/requirements.txt (line 7))
#9 5.485   Downloading pygments-2.21.0-py3-none-any.whl.metadata (2.5 kB)
#9 5.686 Collecting psycopg-binary==3.3.9 (from psycopg[binary]>=3.1->-r backend/requirements.txt (line 4))
#9 5.710   Downloading psycopg_binary-3.3.9-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (2.7 kB)
#9 5.739 Collecting annotated-types>=0.6.0 (from pydantic>=2.9.0->fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 5.762   Downloading annotated_types-0.8.0-py3-none-any.whl.metadata (15 kB)
#9 6.686 Collecting pydantic-core==2.50.4 (from pydantic>=2.9.0->fastapi>=0.115->-r backend/requirements.txt (line 1))
#9 6.711   Downloading pydantic_core-2.50.4-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (6.6 kB)
#9 6.806 Collecting MarkupSafe>=2.0 (from Mako->alembic->-r backend/requirements.txt (line 3))
#9 6.833   Downloading markupsafe-3.0.4-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (2.7 kB)
#9 6.862 Downloading fastapi-0.162.5-py3-none-any.whl (151 kB)
#9 6.954 Downloading sqlalchemy-2.1.8-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (4.7 MB)
#9 8.441    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 4.7/4.7 MB 3.2 MB/s  0:00:01
#9 8.465 Downloading alembic-1.20.1-py3-none-any.whl (270 kB)
#9 8.578 Downloading psycopg-3.3.9-py3-none-any.whl (219 kB)
#9 8.664 Downloading uvicorn-0.54.0-py3-none-any.whl (87 kB)
#9 8.721 Downloading httpx-0.28.1-py3-none-any.whl (73 kB)
#9 8.763 Downloading httpcore-1.0.9-py3-none-any.whl (78 kB)
#9 8.814 Downloading pytest-9.2.0-py3-none-any.whl (411 kB)
#9 8.956 Downloading pluggy-1.7.0-py3-none-any.whl (27 kB)
#9 8.986 Downloading ruff-0.17.5-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (10.6 MB)
#9 11.89    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 10.6/10.6 MB 3.7 MB/s  0:00:02
#9 11.93 Downloading tzdata-2026.6-py2.py3-none-any.whl (348 kB)
#9 12.06 Downloading annotated_doc-0.0.6-py3-none-any.whl (5.3 kB)
#9 12.09 Downloading anyio-4.16.0-py3-none-any.whl (134 kB)
#9 12.18 Downloading click-8.5.1-py3-none-any.whl (126 kB)
#9 12.26 Downloading h11-0.16.0-py3-none-any.whl (37 kB)
#9 12.30 Downloading idna-3.20-py3-none-any.whl (69 kB)
#9 12.36 Downloading iniconfig-2.3.1-py3-none-any.whl (7.6 kB)
#9 12.38 Downloading opentelemetry_api-1.45.2-py3-none-any.whl (60 kB)
#9 12.44 Downloading packaging-26.3-py3-none-any.whl (129 kB)
#9 12.52 Downloading psycopg_binary-3.3.9-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (3.9 MB)
#9 13.93    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.9/3.9 MB 2.8 MB/s  0:00:01
#9 13.96 Downloading pydantic-2.14.3-py3-none-any.whl (494 kB)
#9 14.16 Downloading pydantic_core-2.50.4-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (2.3 MB)
#9 15.19    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2.3/2.3 MB 2.2 MB/s  0:00:01
#9 15.21 Downloading annotated_types-0.8.0-py3-none-any.whl (13 kB)
#9 15.24 Downloading pygments-2.21.0-py3-none-any.whl (1.3 MB)
#9 15.65    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.3/1.3 MB 3.2 MB/s  0:00:00
#9 15.67 Downloading starlette-1.10.0-py3-none-any.whl (80 kB)
#9 15.72 Downloading typing_extensions-4.16.0-py3-none-any.whl (45 kB)
#9 15.75 Downloading typing_inspection-0.4.5-py3-none-any.whl (14 kB)
#9 15.78 Downloading certifi-2026.10.23-py3-none-any.whl (135 kB)
#9 15.84 Downloading mako-1.4.3-py3-none-any.whl (80 kB)
#9 15.89 Downloading markupsafe-3.0.4-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (23 kB)
#9 16.10 Installing collected packages: tzdata, typing-extensions, ruff, pygments, psycopg-binary, psycopg, pluggy, packaging, MarkupSafe, iniconfig, idna, h11, click, certifi, annotated-types, annotated-doc, uvicorn, typing-inspection, sqlalchemy, pytest, pydantic-core, opentelemetry-api, Mako, httpcore, anyio, starlette, pydantic, httpx, alembic, fastapi
#9 20.22 
#9 20.23 Successfully installed Mako-1.4.3 MarkupSafe-3.0.4 alembic-1.20.1 annotated-doc-0.0.6 annotated-types-0.8.0 anyio-4.16.0 certifi-2026.10.23 click-8.5.1 fastapi-0.162.5 h11-0.16.0 httpcore-1.0.9 httpx-0.28.1 idna-3.20 iniconfig-2.3.1 opentelemetry-api-1.45.2 packaging-26.3 pluggy-1.7.0 psycopg-3.3.9 psycopg-binary-3.3.9 pydantic-2.14.3 pydantic-core-2.50.4 pygments-2.21.0 pytest-9.2.0 ruff-0.17.5 sqlalchemy-2.1.8 starlette-1.10.0 typing-extensions-4.16.0 typing-inspection-0.4.5 tzdata-2026.6 uvicorn-0.54.0
#9 20.23 WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable. It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning.
#9 20.23 
#9 20.23 [notice] A new release of pip is available: 26.2.2 -> 26.3
#9 20.23 [notice] To update, run: pip install --upgrade pip
#9 DONE 20.7s

#10 [5/5] COPY backend/ ./backend/
#10 DONE 0.1s

#11 exporting to image
#11 exporting layers
#11 exporting layers 4.0s done
#11 exporting manifest sha256:60c9cad5c3a7792c34cd0b5a6a854fd224afe003f448517dfda5fb90c5d7cefd 0.0s done
#11 exporting config sha256:ea3ea73dbe9ac24be2316b300916da3b942d123ef5ccc86e5592a2b7ec3476a3 0.0s done
#11 exporting attestation manifest sha256:396c650ab64f5252d939ffa6d4e119d1a4a3939e300950a0e0e324c052c3c1ea 0.0s done
#11 exporting manifest list sha256:23e773a5340e696a852daf1f584c0c27c77c0a18946330bd82ace50482b2fe82 0.0s done
#11 naming to docker.io/library/turnos-odontologia-api:latest done
#11 unpacking to docker.io/library/turnos-odontologia-api:latest
#11 unpacking to docker.io/library/turnos-odontologia-api:latest 1.6s done
#11 DONE 5.7s

#12 resolving provenance for metadata file
#12 DONE 0.0s
 Image turnos-odontologia-api Built 
```

Contexto de build informado por BuildKit: `.dockerignore` 91B y contexto **735.25kB** (antes, con `context: backend`, era 11.30kB). Segunda corrida para capturar el exit code:

```
PS> docker compose build api 2>$null | Out-Null; Write-Output ("EXIT=" + $LASTEXITCODE)
EXIT=0
```

```
PS> docker compose up -d postgres
 Container turnos-odontologia-postgres-1 Running 
```

```
PS> docker compose ps --format "{{.Name}} {{.Status}}"
turnos-odontologia-postgres-1 Up 10 hours (healthy)
```

```
PS> docker compose up -d api
 Container turnos-odontologia-postgres-1 Running 
 Container turnos-odontologia-api-1 Recreate 
 Container turnos-odontologia-api-1 Recreated 
 Container turnos-odontologia-postgres-1 Waiting 
 Container turnos-odontologia-postgres-1 Healthy 
 Container turnos-odontologia-api-1 Starting 
 Container turnos-odontologia-api-1 Started 
```

```
PS> Start-Sleep -Seconds 5; docker compose ps --format "{{.Name}} {{.Status}}"
turnos-odontologia-api-1 Up 9 seconds
turnos-odontologia-postgres-1 Up 10 hours (healthy)
```

```
PS> docker compose exec api python -c "import backend.app.main"
<sin salida>
```

```
PS> docker compose exec api python -c "import backend.app.main"; Write-Output ("EXIT=" + $LASTEXITCODE)
EXIT=0
```

El contenedor `api-1` se **recreó** (el `up -d` informó `Recreate`/`Recreated`, sin `--force-recreate`). Imagen del contenedor vs. tag `latest`:

```
PS> docker compose ps -a
NAME                            IMAGE                    COMMAND                  SERVICE    CREATED          STATUS                    PORTS
turnos-odontologia-api-1        turnos-odontologia-api   "uvicorn backend.app…"   api        16 seconds ago   Up 15 seconds             0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
turnos-odontologia-postgres-1   postgres:16              "docker-entrypoint.s…"   postgres   9 days ago       Up 10 hours (healthy)     0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp
turnos-odontologia-web-1        turnos-odontologia-web   "/docker-entrypoint.…"   web        10 hours ago     Exited (0) 10 hours ago   
```

```
PS> docker inspect turnos-odontologia-api-1 --format "{{.Image}}"
sha256:0d895e7ce227ff3691b5f45406e54cd4ed6ada16ffbaeef64f8376836f0fd2a8
```

```
PS> docker image ls turnos-odontologia-api --digests
REPOSITORY               TAG       DIGEST                                                                    IMAGE ID       CREATED          SIZE
turnos-odontologia-api   latest    sha256:0d895e7ce227ff3691b5f45406e54cd4ed6ada16ffbaeef64f8376836f0fd2a8   0d895e7ce227   34 seconds ago   335MB
```

**Coinciden:** la imagen del contenedor es `sha256:0d895e7ce227...` y `turnos-odontologia-api:latest` tiene el mismo digest y el mismo ID `0d895e7ce227` (335MB, creada 34 segundos antes de la consulta). A diferencia del grupo 1, el contenedor ahora sí corre la imagen construida en esta corrida.

`turnos-odontologia-web-1 Exited (0) 10 hours ago` sigue siendo un contenedor preexistente de C-13; no se tocó su servicio.

### Grupo 4 — Dependencias: runtime con pin vs. desarrollo (2026-11-13)

Archivos: `backend/requirements.txt` (reescrito con pins), `backend/requirements-dev.txt` (nuevo) y este `tasks.md`. No se tocaron Dockerfile, compose, README ni `tests.yml`. Los venvs viven fuera del repo, bajo `$env:TEMP`.

Estado antes de empezar el grupo: árbol limpio, HEAD en `b39628b fix(docker): reconstruye la imagen de api con contexto raiz (c-23 grupo 3)`.

```
PS> git status --short
<sin salida>
```

#### 4.1 — Medición de pins en `py -3.13`

```
PS> Write-Output ("venv-medicion: " + (Test-Path "$env:TEMP\venv-medicion")); Write-Output ("venv-verif: " + (Test-Path "$env:TEMP\venv-verif")); Write-Output ("freeze.txt: " + (Test-Path "$env:TEMP\freeze.txt"))
venv-medicion: False
venv-verif: False
freeze.txt: False
```

```
PS> py -3.13 -m venv $env:TEMP\venv-medicion
Actual environment location may have moved due to redirects, links or junctions.
  Requested location: "C:\Users\MARIAN~1\AppData\Local\Temp\venv-medicion\Scripts\python.exe"
  Actual location:    "C:\Users\Mariano_Chirino\AppData\Local\Temp\venv-medicion\Scripts\python.exe"
EXIT=0
Python 3.13.7
```

```
PS> & "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip install --upgrade pip
    Uninstalling pip-25.2:
      Successfully uninstalled pip-25.2
Successfully installed pip-26.3
EXIT=0
```

```
PS> & "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip install fastapi sqlalchemy alembic "psycopg[binary]" uvicorn httpx tzdata pytest ruff
...
Installing collected packages: tzdata, typing-extensions, ruff, pygments, psycopg-binary, pluggy, packaging, MarkupSafe, iniconfig, idna, h11, colorama, click, certifi, annotated-types, annotated-doc, uvicorn, typing-inspection, sqlalchemy, pytest, pydantic-core, psycopg, opentelemetry-api, Mako, httpcore, anyio, starlette, pydantic, httpx, alembic, fastapi

Successfully installed Mako-1.4.3 MarkupSafe-3.0.4 alembic-1.20.1 annotated-doc-0.0.6 annotated-types-0.8.0 anyio-4.16.0 certifi-2026.10.23 click-8.5.1 colorama-0.4.6 fastapi-0.162.5 h11-0.16.0 httpcore-1.0.9 httpx-0.28.1 idna-3.20 iniconfig-2.3.1 opentelemetry-api-1.45.2 packaging-26.3 pluggy-1.7.0 psycopg-3.3.9 psycopg-binary-3.3.9 pydantic-2.14.3 pydantic-core-2.50.4 pygments-2.21.0 pytest-9.2.0 ruff-0.17.5 sqlalchemy-2.1.8 starlette-1.10.0 typing-extensions-4.16.0 typing-inspection-0.4.5 tzdata-2026.6 uvicorn-0.54.0
EXIT=0
```

`pip freeze` completo (`$env:TEMP\freeze.txt`, 31 líneas):

```
PS> & "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip freeze > $env:TEMP\freeze.txt
EXIT=0
PS> Get-Content $env:TEMP\freeze.txt
alembic==1.20.1
annotated-doc==0.0.6
annotated-types==0.8.0
anyio==4.16.0
certifi==2026.10.23
click==8.5.1
colorama==0.4.6
fastapi==0.162.5
h11==0.16.0
httpcore==1.0.9
httpx==0.28.1
idna==3.20
iniconfig==2.3.1
Mako==1.4.3
MarkupSafe==3.0.4
opentelemetry-api==1.45.2
packaging==26.3
pluggy==1.7.0
psycopg==3.3.9
psycopg-binary==3.3.9
pydantic==2.14.3
pydantic_core==2.50.4
Pygments==2.21.0
pytest==9.2.0
ruff==0.17.5
SQLAlchemy==2.1.8
starlette==1.10.0
typing-inspection==0.4.5
typing_extensions==4.16.0
tzdata==2026.6
uvicorn==0.54.0
```

```
PS> Select-String -Path $env:TEMP\freeze.txt -Pattern '^(fastapi|SQLAlchemy|alembic|psycopg|psycopg-binary|uvicorn|httpx|tzdata|pytest|ruff)=='

C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:1:alembic==1.20.1
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:8:fastapi==0.162.5
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:11:httpx==0.28.1
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:19:psycopg==3.3.9
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:20:psycopg-binary==3.3.9
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:24:pytest==9.2.0
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:25:ruff==0.17.5
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:26:SQLAlchemy==2.1.8
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:30:tzdata==2026.6
C:\Users\MARIAN~1\AppData\Local\Temp\freeze.txt:31:uvicorn==0.54.0
```

**10 coincidencias** (el esperado era "al menos 9"): fastapi, SQLAlchemy, alembic, psycopg, psycopg-binary, uvicorn, httpx, tzdata, pytest y ruff, todas con `==`.

**Cómo se resolvió el nombre `psycopg[binary]`**: `pip freeze` lista dos distribuciones separadas (`psycopg==3.3.9` y `psycopg-binary==3.3.9`) porque `psycopg-binary` es el artefacto que instala el extra. Se verificó en el metadata:

```
PS> & "$env:TEMP\venv-medicion\Scripts\python.exe" -c "import importlib.metadata as m; d=m.distribution('psycopg'); print('Name:', d.metadata['Name']); print('Version:', d.version); print('Provides-Extra:', d.metadata.get_all('Provides-Extra'))"
Name: psycopg
Version: 3.3.9
Provides-Extra: ['c', 'binary', 'pool', 'test', 'dev', 'docs']
```

Por eso el pin se escribe como `psycopg[binary]==3.3.9` (extra `binary` declarado por `psycopg`), no como dos líneas sueltas: `psycopg-binary` no se instala solo como dependencia directa.

**Comparación con la referencia de `CHANGES.md`** (se usó siempre el valor medido):

| paquete | referencia en CHANGES.md | medido (`pip freeze`) | pin escrito |
|---|---|---|---|
| fastapi | 0.143.0 | 0.162.5 | `fastapi==0.162.5` |
| sqlalchemy | 2.1.4 | 2.1.8 (`SQLAlchemy==2.1.8`) | `sqlalchemy==2.1.8` |
| alembic | 1.20.0 | 1.20.1 | `alembic==1.20.1` |
| psycopg[binary] | 3.3.6 | 3.3.9 (`psycopg` + `psycopg-binary`) | `psycopg[binary]==3.3.9` |
| uvicorn | 0.54.0 | 0.54.0 | `uvicorn==0.54.0` |
| tzdata | 2026.5 | 2026.6 | `tzdata==2026.6` |
| pytest | 9.1.1 | 9.2.0 | `pytest==9.2.0` |
| ruff | 0.17.0 | 0.17.5 | `ruff==0.17.5` |
| httpx | 0.28.1 | 0.28.1 | `httpx==0.28.1` |

Coinciden uvicorn y httpx; el resto difiere y se usó el medido. `SQLAlchemy==2.1.8` se escribió como `sqlalchemy==2.1.8` (el nombre de proyecto normaliza mayúsculas; es la misma distribución).

Borrado del venv de medición y comprobación del árbol:

```
PS> Remove-Item -Recurse -Force $env:TEMP\venv-medicion
venv-medicion existe luego de borrar: False
freeze.txt conservado: True
```

```
PS> git status --short
<sin salida>
```

#### 4.2 — `httpx` (Q6) y `backend/requirements.txt`

```
PS> Get-ChildItem -Recurse backend/app -Include *.py | Select-String -Pattern "httpx" | Measure-Object | Select-Object -ExpandProperty Count
0
```

`0` coincidencias en `backend/app/`: se mantiene el default de Q6 y `httpx` queda en dev.

Contenido escrito (`CRLF`, 6 líneas, sin líneas vacías):

```
fastapi==0.162.5
sqlalchemy==2.1.8
alembic==1.20.1
psycopg[binary]==3.3.9
uvicorn==0.54.0
tzdata==2026.6
```

```
PS> (Get-Content backend/requirements.txt | Where-Object { $_ -match '\S' }).Count
6

PS> (Select-String -Path backend/requirements.txt -Pattern '^[^=]+==[0-9]').Count
6

PS> Select-String -Path backend/requirements.txt -Pattern '^(pytest|ruff|httpx)' | Measure-Object | Select-Object -ExpandProperty Count
0
```

Los tres números coinciden con lo esperado (6 líneas no vacías, 6 con pin `==`, 0 dev en runtime).

#### 4.3 — `backend/requirements-dev.txt`

Contenido (`CRLF`, 4 líneas):

```
-r requirements.txt
pytest==9.2.0
ruff==0.17.5
httpx==0.28.1
```

```
PS> Select-String -Path backend/requirements-dev.txt -Pattern '^-r requirements\.txt$'

backend\requirements-dev.txt:1:-r requirements.txt

PS> Select-String -Path backend/requirements-dev.txt -Pattern '^(pytest|ruff|httpx)==[0-9]'
backend\requirements-dev.txt:2:pytest==9.2.0
backend\requirements-dev.txt:3:ruff==0.17.5
backend\requirements-dev.txt:4:httpx==0.28.1

PS> (Select-String -Path backend/requirements-dev.txt -Pattern '^(pytest|ruff|httpx)==[0-9]').Count
3
```

1 coincidencia para el `-r` en la primera línea y 3 pins dev, como pide la task.

#### 4.4 — BLOQUEADA: `pytest -rs backend/tests` reporta 2 fallos

`DATABASE_URL` en el shell de trabajo y qué base se habría usado (no se seteo ni se tocó Postgres):

```
PS> Write-Output ("[" + $env:DATABASE_URL + "]")
[]

PS> Test-Path .env
True
```

El `.env` de la raíz no se lee automáticamente por `pytest`; `backend/tests/conftest.py` solo mira `os.environ["DATABASE_URL"]`. Sin la variable, las fixtures `integration` se saltean (`pytest.skip`), y dos tests que **no** están marcados `integration` fallan al pedir sesión de DB.

```
PS> py -3.13 -m venv $env:TEMP\venv-verif
Actual environment location may have moved due to redirects, links or junctions.
  Requested location: "C:\Users\MARIAN~1\AppData\Local\Temp\venv-verif\Scripts\python.exe"
  Actual location:    "C:\Users\Mariano_Chirino\AppData\Local\Temp\venv-verif\Scripts\python.exe"
EXIT=0
Python 3.13.7
```

```
PS> & "$env:TEMP\venv-verif\Scripts\python.exe" -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
...
Successfully installed Mako-1.4.3 MarkupSafe-3.0.4 alembic-1.20.1 annotated-doc-0.0.6 annotated-types-0.8.0 anyio-4.16.0 certifi-2026.10.23 click-8.5.1 colorama-0.4.6 fastapi-0.162.5 h11-0.16.0 httpcore-1.0.9 httpx-0.28.1 idna-3.20 iniconfig-2.3.1 opentelemetry-api-1.45.2 packaging-26.3 pluggy-1.7.0 psycopg-3.3.9 psycopg-binary-3.3.9 pydantic-2.14.3 pydantic-core-2.50.4 pygments-2.21.0 pytest-9.2.0 ruff-0.17.5 sqlalchemy-2.1.8 starlette-1.10.0 typing-extensions-4.16.0 typing-inspection-0.4.5 tzdata-2026.6 uvicorn-0.54.0
EXIT=0
```

Sin `No matching distribution found`: la resolución de los dos archivos en 3.13 está en verde.

```
PS> & "$env:TEMP\venv-verif\Scripts\python.exe" -m pytest -rs backend/tests
...
SKIPPED [1] backend\tests\test_turnos_api.py:133: Postgres no alcanzable (sin DATABASE_URL o conexion rechazada); se requiere Postgres real.
...
SKIPPED [3] backend\tests\test_usuarios_sucursal_api.py:292: Postgres no alcanzable (sin DATABASE_URL o conexion rechazada); se requiere Postgres real.
=========== 2 failed, 139 passed, 614 skipped, 4 warnings in 4.33s ============
EXIT=1
```

(Renglones `SKIPPED` omitidos acá sólo por longitud; salida completa en `$env:TEMP\pytest-full.txt`. Conteos literales: **2 failed, 139 passed, 614 skipped**.)

Los dos fallos:

```
================================== FAILURES ===================================
________________________ test_sucursal_no_uuid_da_422 _________________________

    def test_sucursal_no_uuid_da_422() -> None:
>       r = client.get(
            "/contexto",
            headers={"X-Actor-Rol": "admin", "X-Sucursal-Id": "no-es-uuid"},
        )

backend\tests\test_rbac_contexto.py:88:
...
backend\app\rbac\context.py:41: in get_sucursal_session
    session = get_session()()
backend\app\db.py:53: in get_session
    return sessionmaker(bind=get_engine(), expire_on_commit=False)
backend\app\db.py:43: in get_engine
    url = _database_url()
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

    def _database_url() -> str:
        url = os.environ.get("DATABASE_URL")
        if not url:
>           raise RuntimeError(
                "DATABASE_URL no esta definida; "
                "exportarla para conectar a Postgres."
            )
E           RuntimeError: DATABASE_URL no esta definida; exportarla para conectar a Postgres.

backend\app\db.py:34: RuntimeError
____________________ test_sucursal_uuid_inexistente_da_422 ____________________

    def test_sucursal_uuid_inexistente_da_422() -> None:
>       r = client.get(
            "/contexto",
            headers={
                "X-Actor-Rol": "admin",
                "X-Sucursal-Id": str(uuid.uuid4()),
            },
        )

backend\tests\test_rbac_contexto.py:97:
...
E           RuntimeError: DATABASE_URL no esta definida; exportarla para conectar a Postgres.

backend\app\db.py:34: RuntimeError
============================== warnings summary ===============================
```

Ambos viven en `backend/tests/test_rbac_contexto.py` (líneas 87 y 96), no llevan el marcador `integration` y por eso no se saltean: piden `get_sucursal_session` → `get_session()` → `_database_url()`.

`ruff` de la misma task (sí cumple su parte):

```
PS> & "$env:TEMP\venv-verif\Scripts\python.exe" -m ruff check backend/
All checks passed!
EXIT=0
```

```
PS> git status --short
 M backend/requirements.txt
?? backend/requirements-dev.txt
```

**4.4 quedó bloqueada en la primera corrida**: el resultado esperado decía "pytest reporta passed/skipped sin fallos" y hubo **2 failed**, con `EXIT=1`. El fallo es por `DATABASE_URL` ausente (no por los pins: la instalación resolvió sin errores y `ruff` está en verde). El venv `$env:TEMP\venv-verif` **se conserva** (no se borra hasta la task 9.6).

##### 4.4 (bis) — Corrida con `DATABASE_URL` sobre `turnos_test`

Decisión del usuario: usar la base `turnos_test` (NO `turnos`), ya creada en el Postgres del compose.

Qué permite el conftest (`backend/tests/conftest.py`), tal cual:

```
41: def _db_permitida(nombre: str) -> bool:
42:     return nombre == "turnos" or nombre.endswith("_test")
```

```
45: def _exigir_db_permitida(url: str | None) -> None:
46:     """Fail-fast: rehusa DBs fuera de `turnos` / `*_test`.
47: 
48:     Solo parsea la URL (nunca conecta ni trunca). Lanza RuntimeError
49:     con el nombre ofensor y la regla permitida.
50:     """
51:     nombre = _nombre_db(url or "")
52:     if not _db_permitida(nombre):
53:         raise RuntimeError(
54:             f"DATABASE_URL apunta a la base '{nombre}': rehusado. "
55:             "Los tests truncan el catalogo de la base apuntada; "
56:             "solo se permite 'turnos' o una base terminada en '_test'."
57:         )
```

`turnos_test` termina en `_test` → permitida. Qué hacen las fixtures de integración:

```
 96: @pytest.fixture(scope="session")
 97: def _db_engine(_db_url_or_skip, request):
 98:     url = _db_url_or_skip
 99:     os.environ["DATABASE_URL"] = url
100:     ini = os.path.join(str(request.config.rootdir), "backend", "alembic.ini")
101:     if os.path.exists(ini):
102:         from alembic import command
103:         from alembic.config import Config
104:
105:         command.upgrade(Config(ini), "head")
```

```
126: @pytest.fixture()
127: def db_session(_db_engine):
128:     from sqlalchemy.orm import Session
129:
130:     try:
131:         _exigir_db_permitida(_database_url())
132:     except RuntimeError as exc:
133:         pytest.fail(str(exc))
134:     conn = _db_engine.connect()
135:     txn = conn.begin()
136:     # Pizarra en blanco por test: los scenarios parten de
137:     # "catalogo vacio". TRUNCATE es transaccional en Postgres,
138:     # asi el rollback del teardown restaura lo previo.
139:     conn.execute(text(f"TRUNCATE {_CATALOGO_TABLES}"))
140:     session = Session(bind=conn)
141:     yield session
142:     try:
143:         session.close()
144:     finally:
145:         if txn.is_active:
146:             txn.rollback()
147:         conn.close()
```

Es decir: aplica migraciones (`alembic upgrade head`), trunca el catálogo dentro de una transacción por test y hace rollback en el teardown. Credenciales del compose verificadas en solo lectura:

```
PS> docker compose config | Select-String -Pattern 'POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|5433|published'
        published: "8000"
      POSTGRES_DB: turnos
      POSTGRES_PASSWORD: odontologia
      POSTGRES_USER: odontologia
        published: "5433"
        published: "8080"
```

Corrida con la variable definida y borrada en la misma consola:

```
PS> $env:DATABASE_URL = "postgresql+psycopg://odontologia:odontologia@localhost:5433/turnos_test"; Write-Output ("DATABASE_URL=" + $env:DATABASE_URL); & "$env:TEMP\venv-verif\Scripts\python.exe" -m pytest -rs backend/tests
DATABASE_URL=postgresql+psycopg://odontologia:odontologia@localhost:5433/turnos_test
EXIT=0
DATABASE_URL luego del borrado=[]
=== resumen ===
================= 755 passed, 9 warnings in 137.88s (0:02:17) =================
```

**755 passed, 0 failed, 0 skipped**, `EXIT=0`. No se ejecutó nada contra la base `turnos`. Los **2 fallos anteriores eran solo la falta de `DATABASE_URL`**: con la variable apuntando a una base permitida desaparecen, y ningún test quedó skipeado (los `integration` corrieron de verdad). **4.4 se marca `[x]`.**

#### 4.5 — La imagen instala solo runtime

```
PS> docker compose build api
#1 [internal] load local bake definitions
#1 reading from stdin 602B done

#2 [internal] load build definition from Dockerfile
#2 transferring dockerfile: 295B done

#3 [internal] load metadata for docker.io/library/python:3.13-slim
#3 DONE 1.1s

#4 [internal] load .dockerignore
#4 transferring context: 91B done

#5 [internal] load build context
#5 transferring context: 8.02kB 0.0s done

#6 [1/5] FROM docker.io/library/python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
#7 [2/5] WORKDIR /code
#7 CACHED
#8 [3/5] COPY backend/requirements.txt ./backend/requirements.txt
#8 DONE 0.1s
#9 [4/5] RUN pip install --no-cache-dir -r backend/requirements.txt
#9 2.104 Collecting fastapi==0.162.5 (from -r backend/requirements.txt (line 1))
#9 2.660 Collecting sqlalchemy==2.1.8 (from -r backend/requirements.txt (line 2))
#9 2.742 Collecting alembic==1.20.1 (from -r backend/requirements.txt (line 3))
#9 2.804 Collecting psycopg==3.3.9 (from psycopg[binary]==3.3.9->-r backend/requirements.txt (line 4))
#9 2.881 Collecting uvicorn==0.54.0 (from -r backend/requirements.txt (line 5))
#9 2.947 Collecting tzdata==2026.6 (from -r backend/requirements.txt (line 6))
#9 13.60 Successfully installed Mako-1.4.3 MarkupSafe-3.0.4 alembic-1.20.1 annotated-doc-0.0.6 annotated-types-0.8.0 anyio-4.16.0 click-8.5.1 fastapi-0.162.5 h11-0.16.0 idna-3.20 opentelemetry-api-1.45.2 psycopg-3.3.9 psycopg-binary-3.3.9 pydantic-2.14.3 pydantic-core-2.50.4 sqlalchemy-2.1.8 starlette-1.10.0 typing-extensions-4.16.0 typing-inspection-0.4.5 tzdata-2026.6 uvicorn-0.54.0
#9 DONE 13.9s
#10 [5/5] COPY backend/ ./backend/
#10 DONE 0.1s
#11 naming to docker.io/library/turnos-odontologia-api:latest 0.0s done
#11 DONE 3.5s
#12 resolving provenance for metadata file
#12 DONE 0.0s
EXIT=0
```

Línea pedida: `#5 transferring context: 8.02kB 0.0s done`, con `#4 transferring context: 91B` del `.dockerignore`. El contexto es menor que los 735.25kB del grupo 3; no se investigó la causa, pero el build sí usó el `.dockerignore` y el paso `COPY backend/ ./backend/` se ejecutó.

Nota: `docker compose up -d api 2>&1` hizo que PowerShell envolvieran en `NativeCommandError` las líneas de stderr de Docker; el exit real fue `0` y la salida fue esta:

```
PS> docker compose up -d api 2>&1
 Container turnos-odontologia-postgres-1 Running 
 Container turnos-odontologia-api-1 Recreate 
 Container turnos-odontologia-api-1 Recreated 
 Container turnos-odontologia-postgres-1 Waiting 
 Container turnos-odontologia-postgres-1 Healthy 
 Container turnos-odontologia-api-1 Starting 
 Container turnos-odontologia-api-1 Started 
EXIT=0

PS> Start-Sleep -Seconds 8; docker compose ps --format "{{.Name}} {{.Status}}"
turnos-odontologia-api-1 Up 8 seconds
turnos-odontologia-postgres-1 Up 11 hours (healthy)
```

```
PS> docker compose exec api python -m pip list | Select-String -Pattern '^(pytest|ruff|httpx)\s'
<sin coincidencias>

PS> (docker compose exec api python -m pip list | Select-String -Pattern '^(pytest|ruff|httpx)\s' | Measure-Object).Count
0

PS> docker compose exec api python -m pip list | Select-String -Pattern '^(fastapi|SQLAlchemy|alembic|uvicorn|tzdata)\s'

alembic           1.20.1
fastapi           0.162.5
SQLAlchemy        2.1.8
tzdata            2026.6
uvicorn           0.54.0

PS> (docker compose exec api python -m pip list | Select-String -Pattern '^(fastapi|SQLAlchemy|alembic|uvicorn|tzdata)\s' | Measure-Object).Count
5
```

**0 coincidencias** para `pytest`/`ruff`/`httpx` (la imagen no lleva dev) y **5 coincidencias** de runtime con la versión pinneada. **4.5 se marca `[x]`.**

### Grupo 5 — Compose por entorno: credenciales, `TZ` y puerto (2026-11-13)

Archivos: `docker-compose.yml` (solo `postgres.environment`, `postgres.healthcheck` y `api.environment`), `.env.example` y este `tasks.md`. No se tocaron el servicio `web`, el `build` de `api`, `requirements`, README ni `tests.yml`. El `.env` real **no** se editó.

#### Lectura previa del `.env` (solo nombres y valores permitidos)

```
PS> Get-Content .env | ForEach-Object { ($_ -split '=')[0] }
POSTGRES_PORT
```

```
PS> (Get-Content .env | Where-Object { $_ -match '^POSTGRES_PORT=' })
POSTGRES_PORT=5433
POSTGRES_USER definida: False
POSTGRES_DB definida: False
TZ definida: False
```

```
PS> git check-ignore -v .env
.gitignore:10:.env	.env
```

El `.env` define **solo** `POSTGRES_PORT=5433`. Por eso 5.1, 5.2 y 5.5 se corrieron dos veces: con el `.env` real y con `docker compose --env-file "$env:TEMP\empty.env"` (archivo vacío, 0 bytes) para ver los defaults puros. En 5.1 y en el primer bloque de 5.2 las dos salidas son idénticas porque `POSTGRES_PORT` no interviene ahí; la diferencia aparece en el mapeo del host.

Valor de `POSTGRES_PORT` en `.env.example`: **5432**, porque el README documenta ese default (`${POSTGRES_PORT:-5432}`) y trata 5433 como el escape cuando 5432 está ocupado (README líneas 93, 297 y 365-366).

#### 5.1 — Interpolación de credenciales y `TZ`

```
PS> docker compose config | Select-String -Pattern 'POSTGRES_|pg_isready|DATABASE_URL|TZ'
      DATABASE_URL: postgresql+psycopg://odontologia:odontologia@postgres:5432/turnos
      TZ: America/Argentina/Buenos_Aires
      POSTGRES_DB: turnos
      POSTGRES_PASSWORD: odontologia
      POSTGRES_USER: odontologia
      TZ: America/Argentina/Buenos_Aires
        - pg_isready -U odontologia -d turnos
```

```
PS> docker compose --env-file "$env:TEMP\empty.env" config | Select-String -Pattern 'POSTGRES_|pg_isready|DATABASE_URL|TZ'
      DATABASE_URL: postgresql+psycopg://odontologia:odontologia@postgres:5432/turnos
      TZ: America/Argentina/Buenos_Aires
      POSTGRES_DB: turnos
      POSTGRES_PASSWORD: odontologia
      POSTGRES_USER: odontologia
      TZ: America/Argentina/Buenos_Aires
        - pg_isready -U odontologia -d turnos
```

Los tres lugares resuelven `odontologia` / `odontologia` / `turnos` / `America/Argentina/Buenos_Aires` y el `DATABASE_URL` de `api` apunta a `postgres:5432`. Salidas idénticas con y sin `.env`.

#### 5.2 — Bloque 1: base y usuario desde el entorno

```
PS> $env:POSTGRES_DB = "turnos_test"; $env:POSTGRES_USER = "otro"; docker compose config | Select-String -Pattern "DATABASE_URL"
      DATABASE_URL: postgresql+psycopg://otro:odontologia@postgres:5432/turnos_test

PS> docker compose --env-file "$env:TEMP\empty.env" config | Select-String -Pattern "DATABASE_URL"
      DATABASE_URL: postgresql+psycopg://otro:odontologia@postgres:5432/turnos_test

PS> Remove-Item Env:POSTGRES_DB; Remove-Item Env:POSTGRES_USER; Get-ChildItem Env:POSTGRES*
<ninguna>
```

Usuario y base vienen del entorno; la contraseña queda en el default y el puerto interno sigue en `5432`.

#### 5.2 — Bloque 2: `POSTGRES_PORT` solo mueve el mapeo del host

```
PS> $env:POSTGRES_PORT = "5433"; docker compose config | Select-String -Pattern "published|target|5432|5433"
      DATABASE_URL: postgresql+psycopg://odontologia:odontologia@postgres:5432/turnos
        target: 8000
        published: "8000"
        target: 5432
        published: "5433"
        target: /var/lib/postgresql/data
        target: 80
        published: "8080"

PS> docker compose --env-file "$env:TEMP\empty.env" config | Select-String -Pattern "published|target|5432|5433"
      DATABASE_URL: postgresql+psycopg://odontologia:odontologia@postgres:5432/turnos
        target: 8000
        published: "8000"
        target: 5432
        published: "5433"
        target: /var/lib/postgresql/data
        target: 80
        published: "8080"

PS> Remove-Item Env:POSTGRES_PORT; Get-ChildItem Env:POSTGRES*
<ninguna>
```

En las dos salidas `postgres` queda `target: 5432` con `published: "5433"` y el `DATABASE_URL` de `api` sigue en `postgres:5432`. Acá la variable de la shell gana sobre el `.env` en ambos casos, así que las dos corridas coinciden.

Comando extra (no está en la task; muestra el default puro del mapeo, sin variable de shell y sin `.env`):

```
PS> docker compose --env-file "$env:TEMP\empty.env" config | Select-String -Pattern "published|target: 5432"
        published: "8000"
        target: 5432
        published: "5432"
        published: "8080"

PS> docker compose config | Select-String -Pattern "published|target: 5432"
        published: "8000"
        target: 5432
        published: "5433"
        published: "8080"
```

Con el env-file vacío el host publica `5432`; con el `.env` real, `5433`. Ese es el único efecto de `POSTGRES_PORT`.

#### 5.3 — Sin secretos reales en archivos versionados

```
PS> git grep -n -i "password"
.env.example:5:POSTGRES_PASSWORD=odontologia
.github/workflows/tests.yml:15:          POSTGRES_PASSWORD: odontologia
CHANGES.md:276:  - **Compose por entorno**: leer credenciales de Postgres y `TZ` desde variables de entorno con defaults ficticios — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `TZ` con `${VAR:-valor_ficticio}` en `docker-compose.yml`, reutilizadas en el healthcheck y en el `DATABASE_URL` del servicio `api` (sin credenciales reales ni secretos escritos). **Verificación**: `docker compose config` muestra la interpolación resuelta; `docker compose up -d postgres` con los defaults levanta la base y `docker compose ps` la reporta `healthy`; con `POSTGRES_DB=turnos_test POSTGRES_USER=otro docker compose config` el `DATABASE_URL` de `api` refleja esos valores; `git grep -i "password"` sobre archivos versionados no muestra secretos reales (solo defaults ficticios y `${VAR}`)
README.md:93:**Si el puerto 5432 ya está ocupado** en tu equipo (por ejemplo, por un PostgreSQL instalado), cambiá en `docker-compose.yml` el mapeo `"5432:5432"` por `"5433:5432"` y usá el puerto 5433 en la `DATABASE_URL`. Si en el 5432 hay otro PostgreSQL, la conexión con el usuario `odontologia` va a fallar por autenticación: no crees ese usuario en un servidor que no sea el de este proyecto. Síntoma típico: `alembic` o el seed fallan con «la autenticación password falló para el usuario odontologia»; en Windows suele ser un servicio de PostgreSQL instalado que ocupa el 5432. Antes de migrar, esperá a que `docker compose ps` muestre el servicio `postgres` como `healthy`.
README.md:286:CREATE ROLE mcp_readonly LOGIN PASSWORD '<clave-ficticia-del-rol>';
README.md:364:- **Síntoma:** al conectar, `autentificación password falló` aunque la clave era correcta.
docker-compose.yml:6:      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-odontologia}
docker-compose.yml:27:      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-odontologia}:${POSTGRES_PASSWORD:-odontologia}@postgres:5432/${POSTGRES_DB:-turnos}
openspec/changes/c-23-fix-api-contenedor/design.md:38:      POSTGRES_PASSWORD: odontologia
openspec/changes/c-23-fix-api-contenedor/design.md:182:      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-odontologia}
openspec/changes/c-23-fix-api-contenedor/design.md:193:      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-odontologia}:${POSTGRES_PASSWORD:-odontologia}@postgres:5432/${POSTGRES_DB:-turnos}
openspec/changes/c-23-fix-api-contenedor/design.md:200:**Tradeoff:** la interpolación de `POSTGRES_*` en el `healthcheck` hace que `docker compose config` muestre el valor resuelto; con defaults ficticios no hay secreto, pero quien ponga una password real en la shell la verá en el YAML resuelto. Aceptado: es el mismo comportamiento que ya tiene `POSTGRES_PORT` y no hay forma de interpolación que oculte eso.
openspec/changes/c-23-fix-api-contenedor/design.md:202:**`.env.example`:** se agregan `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` junto a los valores ficticios ya presentes. Decisión tomada acá (el proposal lo dejaba a confirmar): **sí**, porque el README pasa a documentar el arranque por compose y sin esas variables el archivo queda incompleto. Sin valores reales.
openspec/changes/c-23-fix-api-contenedor/design.md:267:DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-odontologia}:${POSTGRES_PASSWORD:-odontologia}@postgres:5432/${POSTGRES_DB:-turnos}
openspec/changes/c-23-fix-api-contenedor/design.md:312:- **Riesgo de fuga de credenciales al migrar a `${VAR}`** → los defaults siguen siendo ficticios (`odontologia`), `.env.example` no lleva valores reales y se verifica con `git grep -n -i "password"` que no aparezca nada más que defaults ficticios y `${VAR}`.
openspec/changes/c-23-fix-api-contenedor/design.md:313:- **Cambiar `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` con un volumen `pgdata` ya inicializado no tiene efecto** → Postgres aplica esas variables solo al inicializar el volumen; con un `pgdata` existente conserva las credenciales y la base viejas, así que `api` falla la autenticación (o la base pedida no existe) aunque `docker compose config` muestre los valores nuevos. Remedio documentado: `docker compose down -v` y volver a levantar, **solo con datos ficticios**. Se documenta en el README (task 8.3) y se anota en la task 5.5.
openspec/changes/c-23-fix-api-contenedor/proposal.md:13:- **`docker-compose.yml` con contexto raíz para `api`**: `build.context: .` + `build.dockerfile: backend/Dockerfile`, y credenciales/`TZ` leídas de variables de entorno con defaults ficticios (`${POSTGRES_USER:-...}`, `${POSTGRES_PASSWORD:-...}`, `${POSTGRES_DB:-...}`, `${TZ:-...}`), reutilizadas en el healthcheck de `postgres` y en el `DATABASE_URL` de `api`. `POSTGRES_PORT` sigue afectando solo el mapeo host→contenedor; dentro de la red de compose el puerto es siempre 5432. **BREAKING (entorno local)**: `docker compose build api` deja de cachear igual que antes (contexto distinto) y quien tenga `POSTGRES_PORT=5433` debe seguir usándolo igual que hoy; no cambia ningún contrato HTTP.
openspec/changes/c-23-fix-api-contenedor/proposal.md:33:- **Archivos que se modifican en apply**: `backend/Dockerfile`, `docker-compose.yml`, `backend/requirements.txt`, nuevo `backend/requirements-dev.txt`, nuevo `.dockerignore` (raíz), `backend/app/main.py` (solo el docstring), `README.md`, `.github/workflows/tests.yml`. Opcionalmente `.env.example` si se agregan las variables nuevas (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`) — a confirmar en design.
openspec/changes/c-23-fix-api-contenedor/specs/api-contenedor/spec.md:49:`docker-compose.yml` SHALL leer `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `TZ` desde el entorno con defaults ficticios, SHALL reutilizarlas en el healthcheck de `postgres` y en el `DATABASE_URL` de `api`, y SHALL NOT contener credenciales reales ni secretos versionados.
openspec/changes/c-23-fix-api-contenedor/specs/api-contenedor/spec.md:66:- **WHEN** se busca `password` en los archivos versionados con `git grep -n -i "password"`
openspec/changes/c-23-fix-api-contenedor/tasks.md:79:- [x] 5.1 Interpolar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `TZ` con `${VAR:-default}` ficticio en `postgres` y reutilizar los mismos valores en el `healthcheck` (`pg_isready -U ... -d ...`) y en el `DATABASE_URL` de `api` con host `postgres` y puerto interno `5432`.
openspec/changes/c-23-fix-api-contenedor/tasks.md:88:  **Cómo se verifica**: `git grep -n -i "password"`.
openspec/changes/c-23-fix-api-contenedor/tasks.md:89:  **Resultado esperado**: todas las coincidencias son defaults ficticios (`odontologia`) o referencias `${POSTGRES_PASSWORD:-...}` en `docker-compose.yml`, `.env.example`, `README.md` o `knowledge-base/`; ninguna credencial real, token ni valor de producción.
openspec/changes/c-23-fix-api-contenedor/tasks.md:91:- [x] 5.4 Agregar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `POSTGRES_PORT` a `.env.example` con los defaults ficticios y un comentario de que los valores reales van solo en un `.env` no versionado.
openspec/changes/c-23-fix-api-contenedor/tasks.md:92:  **Cómo se verifica**: `Select-String -Path .env.example -Pattern '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|POSTGRES_PORT)='`.
openspec/changes/c-23-fix-api-contenedor/tasks.md:135:  **Resultado esperado**: al menos 1 coincidencia por patrón: el README muestra `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head` (y `current` / `downgrade -1`) dentro del contenedor, `docker compose up --build` como forma de levantar API + web, y **una nota que explica que cambiar `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` con un volumen `pgdata` ya inicializado no tiene efecto y hace fallar la autenticación de `api`, con `docker compose down -v` como remedio, aclarando que eso borra los datos y solo es aceptable con datos ficticios**.
openspec/changes/c-23-fix-api-contenedor/tasks.md:1140:PS> docker compose config | Select-String -Pattern 'POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|5433|published'
openspec/changes/c-23-fix-api-contenedor/tasks.md:1143:      POSTGRES_PASSWORD: odontologia
```

**28 coincidencias, ninguna es un valor real.** Detalle por archivo:

- `.env.example:5` → `odontologia`, default ficticio.
- `.github/workflows/tests.yml:15` → `odontologia`, contraseña ficticia del servicio de CI (no se modifica en este grupo; es el grupo 8).
- `docker-compose.yml:6` y `:27` → referencias `${POSTGRES_PASSWORD:-odontologia}`.
- `README.md:93`, `:364` → texto que explica el síntoma de autenticación fallida; `README.md:286` → placeholder `<clave-ficticia-del-rol>`.
- `CHANGES.md`, `design.md`, `proposal.md`, `specs/`, `tasks.md` → documentación del propio change y las notas de apply; mencionan la variable, el default ficticio o el comando de verificación.

Los números de línea de `tasks.md` corresponden al estado anterior a agregar esta sección de notas; al pegarla, esas líneas se corren hacia abajo (esta sección también aporta coincidencias del mismo tipo).

#### 5.4 — `.env.example`

```
PS> Select-String -Path .env.example -Pattern '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|POSTGRES_PORT)='
         4 POSTGRES_USER=odontologia
         5 POSTGRES_PASSWORD=odontologia
         6 POSTGRES_DB=turnos
         7 POSTGRES_PORT=5432

PS> (Select-String -Path .env.example -Pattern '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|POSTGRES_PORT)=').Count
4
```

Contenido agregado (encabezado del archivo):

```
# Valores ficticios de ejemplo. Nunca commitear un .env real con secretos.
# Postgres del compose: estos son los defaults ficticios; los valores reales
# van solo en un .env local (ignorado por git), nunca en un archivo versionado.
POSTGRES_USER=odontologia
POSTGRES_PASSWORD=odontologia
POSTGRES_DB=turnos
POSTGRES_PORT=5432
TZ=America/Argentina/Buenos_Aires
```

4 coincidencias, todas ficticias; `5432` es el default que documenta el README.

#### 5.5 — `postgres` levanta `healthy` sin variables en la shell

```
PS> Get-ChildItem Env:POSTGRES*
<ninguna>

PS> docker compose down
 Container turnos-odontologia-web-1 Stopping
 Container turnos-odontologia-web-1 Stopped
 Container turnos-odontologia-web-1 Removing
 Container turnos-odontologia-web-1 Removed
 Container turnos-odontologia-api-1 Stopping
 Container turnos-odontologia-api-1 Stopped
 Container turnos-odontologia-api-1 Removing
 Container turnos-odontologia-api-1 Removed
 Container turnos-odontologia-postgres-1 Stopping
 Container turnos-odontologia-postgres-1 Stopped
 Container turnos-odontologia-postgres-1 Removing
 Container turnos-odontologia-postgres-1 Removed
 Network turnos-odontologia_default Removing
 Network turnos-odontologia_default Removed
EXIT=0

PS> docker compose up -d postgres
 Network turnos-odontologia_default Creating
 Network turnos-odontologia_default Created
 Container turnos-odontologia-postgres-1 Creating
 Container turnos-odontologia-postgres-1 Created
 Container turnos-odontologia-postgres-1 Starting
 Container turnos-odontologia-postgres-1 Started
EXIT=0

PS> Start-Sleep -Seconds 20; docker compose ps --format "{{.Name}} {{.Status}}"
turnos-odontologia-postgres-1 Up 23 seconds (healthy)
```

`down` se corrió **sin `-v`**: los contenedores y la red se removieron, el volumen no. Lo confirma el log de arranque, que reutiliza los datos existentes en vez de inicializar:

```
postgres-1  | 2026-11-13 12:16:45.441 UTC [1] LOG:  starting PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
postgres-1  | 2026-11-13 12:16:45.442 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
postgres-1  | 2026-11-13 12:16:45.446 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
postgres-1  | 2026-11-13 12:16:45.455 UTC [29] LOG:  database system was shut down at 2026-11-13 12:16:43 UTC
postgres-1  | 2026-11-13 12:16:45.462 UTC [1] LOG:  database system is ready to accept connections
```

```
PS> docker volume ls --filter "name=pgdata" --format "{{.Name}}"
prueba-limpia_pgdata
turnos-odontologia_pgdata

PS> docker compose exec postgres printenv POSTGRES_USER POSTGRES_DB TZ
odontologia
turnos
America/Argentina/Buenos_Aires
```

**Límite de esta verificación, sin sobreafirmar:** el volumen `turnos-odontologia_pgdata` ya existía (fue inicializado antes, con `odontologia`/`turnos`). El `healthy` prueba que el contenedor arranca y acepta conexiones con esos valores en el entorno del contenedor, **no** que los defaults de compose inicialicen una base nueva: Postgres aplica `POSTGRES_*` solo al inicializar un volumen vacío. Probar la inicialización limpia requiere `docker compose down -v` (borra datos; solo aceptable con datos ficticios) y está previsto en la task 8.3. Con el `.env` ignorado no se corrió `up`, solo `config` (el mapeo publicaría `5432`, que en esta máquina está ocupado: por eso el `.env` local usa `5433`).

Efecto colateral registrado: `docker compose down` removió también los contenedores `api` y `web`; tras `up -d postgres` solo queda `postgres` corriendo. `api` se vuelve a levantar en el grupo 9.

### Grupo 6 — Alembic dentro del contenedor (2026-11-13)

Estado previo verificado: HEAD `ee38cc5 build(compose): configura postgres y api por entorno (c-23 grupo 5)`, árbol limpio, `api` Up y `postgres` healthy. No se editó `backend/alembic.ini`, `backend/alembic/env.py` ni ningún archivo salvo este `tasks.md`. Todos los comandos se corrieron desde la raíz del repo, en PowerShell 5.1, con `2>&1`, y **operan sobre la base local de datos ficticios** del volumen `turnos-odontologia_pgdata` (no se hizo `down`, ni `down -v`, ni se borró ningún volumen).

Nota sobre la salida: `backend/alembic.ini` solo declara `[alembic]` (sin secciones de logging) y `backend/alembic/env.py` no llama a `fileConfig`, así que alembic no emite los `INFO` habituales. El juicio va por el exit code y por `current`.

#### 6.1 — Revisión antes de tocar nada

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini current 2>&1
008_recordatorio (head)
exit 0
```

Cumple: exit 0, sin `No such file or directory` ni error de `script_location`, e imprime la revisión. **REV_ANTES = `008_recordatorio`**.

#### 6.2 — `upgrade head` idempotente

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini upgrade head 2>&1
exit 0
```

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini upgrade head 2>&1
exit 0
```

Las dos corridas terminan con exit 0 y ninguna imprime `Running upgrade` (la base ya estaba en head, no había pendientes). `current` después:

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini current 2>&1
008_recordatorio (head)
exit 0
```

Cumple el resultado esperado: la segunda corrida no aplica nada. **REV_HEAD = `008_recordatorio`**.

#### 6.3 — `downgrade -1` + `upgrade head`

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini downgrade -1 2>&1
exit 0
```

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini upgrade head 2>&1
exit 0
```

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini current 2>&1
008_recordatorio (head)
exit 0
```

Cumple: `downgrade` y `upgrade` con exit 0 y `current` final igual a REV_HEAD (`008_recordatorio`). Estos comandos operan sobre la base local de datos ficticios.

Comando extra (no está en la task; como alembic no emite log, el efecto del `downgrade` no se veía. Repite el ciclo mostrando el estado intermedio y deja la base otra vez en head):

```
PS> docker compose exec api python -m alembic -c backend/alembic.ini downgrade -1 2>&1
exit 0

PS> docker compose exec api python -m alembic -c backend/alembic.ini current 2>&1
007_roles_sucursales
exit 0

PS> docker compose exec api python -m alembic -c backend/alembic.ini upgrade head 2>&1
exit 0

PS> docker compose exec api python -m alembic -c backend/alembic.ini current 2>&1
008_recordatorio (head)
exit 0
```

Con eso queda probado que `downgrade -1` sí movía la revisión (`008_recordatorio` → `007_roles_sucursales`) y que `upgrade head` la devuelve, aunque sin log visible.

### Grupo 7 — Docstring real de `backend/app/main.py` (2026-11-13)

Estado previo verificado: HEAD `fd59a88 docs(c-23): verifica alembic dentro del contenedor (grupo 6)`, árbol limpio, `$env:TEMP\venv-verif\Scripts\python.exe` presente. Archivos tocados: `backend/app/main.py` (solo el docstring de módulo) y este `tasks.md`. No se cambiaron rutas, imports, `include_router`, `@app` ni finales de línea (CRLF conservados: `CR=37`, `LF=37` antes y después; sin BOM, primeros bytes `34,34,34`).

#### 7.1 — Estado del archivo antes de editar

```
PS> Select-String -Path backend/app/main.py -Pattern "include_router"

backend\app\main.py:17:app.include_router(turnos_router)
backend\app\main.py:18:app.include_router(agenda_router)
backend\app\main.py:19:app.include_router(catalogo_router)
backend\app\main.py:20:app.include_router(lista_espera_router)
backend\app\main.py:21:app.include_router(hc_router)
backend\app\main.py:22:app.include_router(caja_router)
backend\app\main.py:23:app.include_router(rbac_router)
backend\app\main.py:24:app.include_router(export_router)
backend\app\main.py:25:app.include_router(recordatorios_router)
backend\app\main.py:26:app.include_router(reserva_online_router)

PS> (Select-String -Path backend/app/main.py -Pattern "include_router").Count
10

PS> Select-String -Path backend/app/main.py -Pattern '^"""'
backend\app\main.py:1:"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""
```

Los 10 `include_router` reales coinciden **exactamente** con la lista de referencia de la task (turnos, agenda, catálogo, lista de espera, historia clínica, caja, RBAC, export, recordatorios y reserva online), así que no hubo diferencia que anotar entre la task y el código.

Docstring nuevo (línea 1, reemplaza solo al anterior):

```python
"""App FastAPI del sistema de turnos odontológicos.

Expone `GET /health` y monta los routers de turnos, agenda, catálogo,
lista de espera, historia clínica, caja, RBAC, export, recordatorios y
reserva online. Todos acceden a PostgreSQL con SQLAlchemy a través de
la variable de entorno `DATABASE_URL`.
"""
```

Verificación:

```
PS> Select-String -Path backend/app/main.py -Pattern "solo GET /health"
<sin coincidencias>

PS> Select-String -Path backend/app/main.py -Pattern "sin DB"
<sin coincidencias>

PS> Select-String -Path backend/app/main.py -Pattern "routers"

backend\app\main.py:3:Expone `GET /health` y monta los routers de turnos, agenda, catálogo,

PS> Select-String -Path backend/app/main.py -Pattern "FastAPI"
backend\app\main.py:1:"""App FastAPI del sistema de turnos odontológicos.
backend\app\main.py:9:from fastapi import FastAPI
backend\app\main.py:22:app = FastAPI()
```

Cumple: las dos primeras sin coincidencias, la tercera con 1 y el control positivo con 3 líneas (el comando sin salida no estaba mal escrito).

#### 7.2 — Nada fuera del docstring y `ruff` en verde

```
PS> git --no-pager diff -U0 backend/app/main.py | Select-String -Pattern '^[+-]@app|^[+-]app\.include_router'
<sin coincidencias>
exit 0
```

```
PS> git --no-pager diff --stat backend/app/main.py
 backend/app/main.py | 8 +++++++-
 1 file changed, 7 insertions(+), 1 deletion(-)
exit 0
```

```
PS> & "$env:TEMP\venv-verif\Scripts\python.exe" -m ruff check backend/
All checks passed!
exit 0
```

Cumple: el filtro del diff no muestra cambios en `@app` ni en `include_router` (el control positivo confirma que el archivo sí está modificado: 7 inserciones y 1 borrado, todas del docstring) y `ruff` termina con `exit 0` y `All checks passed!`.

### Grupo 8 — README y CI (2026-11-13)

Estado previo verificado: HEAD `e90aefe docs(c-23): docstring real de main.py (grupo 7)`, árbol limpio. Archivos tocados: `.github/workflows/tests.yml`, `README.md` y este `tasks.md`. No se tocaron `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `requirements` ni código de la app. Finales de línea conservados (CRLF en ambos, `CR=LF`, sin BOM: `README.md` primeros bytes `35,32,116`; `tests.yml` `110,97,109`).

#### Estado previo de lo tocado (solo lectura)

```
PS> Get-Content .github\workflows\tests.yml -Encoding UTF8
name: tests

on:
  push:
  pull_request:

jobs:
  tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: odontologia
          POSTGRES_PASSWORD: odontologia
          POSTGRES_DB: turnos
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U odontologia -d turnos"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    env:
      TZ: America/Argentina/Buenos_Aires
      DATABASE_URL: postgresql+psycopg://odontologia:odontologia@localhost:5432/turnos
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r backend/requirements.txt
      - run: pytest -rs backend/tests
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r backend/requirements.txt
      - run: ruff check backend/
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -b
      - run: npm run build
      - run: npm run test:run
```

```
PS> Select-String -Path README.md -Pattern '^#{1,3} ' -Encoding UTF8
1: # turnos-odontologia
15: ## Roadmap
40: ## Requisitos
47: ## 1. Clonar e instalar
75: ## 2. Probar sin base de datos
83: ## 3. Levantar PostgreSQL
111: ## 4. Migrar, cargar datos ficticios y correr todos los tests
141: ## 5. Probar la API (`POST /turnos`)
209: ## Variables de entorno
215: ## Recordatorios 48h/24h (job por cron)
234: ## Reserva online (C-08)
260: ## Integración MCP: Postgres MCP Pro
264: ### Para qué sirve y límites
271: ### Requisitos
277: ### Rol de solo lectura (`mcp_readonly`)
293: ### Variable de entorno
312: ### Configuración (sin secretos)
330: ### Pasos
348: ### Comprobación
362: ### Problema de instalación resuelto: puerto 5432 ocupado
370: ### Seguridad
376: ## Estructura del repositorio
399: ## Datos
403: ## Uso de inteligencia artificial
```

```
PS> Select-String -Path README.md -Pattern 'requirements|uvicorn|alembic|no arranca|arranca|Python 3\.|pgdata|down -v' -Encoding UTF8
21: - **C-23 `fix-api-contenedor`** (corrección): arregla el `Dockerfile` de la API, que hoy no arranca en contenedor (ver la nota del paso 3).
43: - **Python 3.12 o superior** (el CI usa 3.12; también probado con 3.13 en Windows).
56: python -m pip install -r backend/requirements.txt
66: python -m pip install -r backend/requirements.txt
73: - Si usás una versión de Python muy nueva y `pip install` falla al instalar alguna dependencia, creá el entorno con Python 3.12 o 3.13, por ejemplo `py -3.13 -m venv .venv`.
91: > **El servicio `api` del compose todavía no arranca.** Su `backend/Dockerfile` copia solo `app/` y ejecuta `uvicorn app.main:app`, pero el ...
93: **Si el puerto 5432 ya está ocupado** en tu equipo (por ejemplo, por un PostgreSQL instalado), cambiá en `docker-compose.yml` el mapeo `"543 ...
116: python -m alembic -c backend/alembic.ini upgrade head
124: python -m alembic -c backend/alembic.ini upgrade head
138: python -m alembic -c backend/alembic.ini downgrade -1
148: python -m uvicorn backend.app.main:app --port 8000
382: - `backend/alembic/` - migraciones (001 catálogo, 002 turnos con `EXCLUDE`).
```

Con eso decidí: 8.2 en la sección **1. Clonar e instalar**; 8.3 en la **3. Levantar PostgreSQL** (nota de `docker compose up --build`) y en la **4. Migrar…** (migraciones adentro del contenedor + nota del volumen `pgdata`); 8.4 en la nota de la **3**, en la línea del roadmap y en **Estructura del repositorio**; 8.5 en **Requisitos** y en los dos jobs de CI. No se crearon secciones nuevas.

#### 8.1 — CI instala los dos archivos (jobs `tests` y `lint`)

```
PS> (Select-String -Path .github/workflows/tests.yml -Pattern 'requirements-dev\.txt').Count
2

PS> Select-String -Path .github/workflows/tests.yml -Pattern 'requirements-dev\.txt'
.github/workflows/tests.yml:33:      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt
.github/workflows/tests.yml:43:      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt

PS> Select-String -Path .github/workflows/tests.yml -Pattern '^  (tests|lint|frontend):$'
  tests:
  lint:
  frontend:

PS> (Select-String -Path .github/workflows/tests.yml -Pattern '^  (tests|lint|frontend):$').Count
3

PS> Select-String -Path .github/workflows/tests.yml -Pattern 'npm ci'
      - run: npm ci

PS> (Select-String -Path .github/workflows/tests.yml -Pattern 'npm ci').Count
1
```

```
PS> git --no-pager diff -U1 .github/workflows/tests.yml
diff --git a/.github/workflows/tests.yml b/.github/workflows/tests.yml
index f23b04c..ccd7271 100644
--- a/.github/workflows/tests.yml
+++ b/.github/workflows/tests.yml
@@ -30,5 +30,5 @@ jobs:
         with:
-          python-version: "3.12"
+          python-version: "3.13"
           cache: pip
-      - run: pip install -r backend/requirements.txt
+      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt
       - run: pytest -rs backend/tests
@@ -40,5 +40,5 @@ jobs:
         with:
-          python-version: "3.12"
+          python-version: "3.13"
           cache: pip
-      - run: pip install -r backend/requirements.txt
+      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt
       - run: ruff check backend/
```

Este es el diff **literal al cierre del grupo** (incluye también los `python-version` de 8.5, aplicados después). En el momento de 8.1 el diff `-U1` mostraba el mismo cambio de las dos líneas `pip install -r backend/requirements.txt -r backend/requirements-dev.txt` en los jobs `tests` y `lint`, con `python-version: "3.12"` sin tocar.

Cumple: 2 coincidencias de `requirements-dev.txt` (jobs `tests` y `lint`), 3 jobs intactos, 1 `npm ci` y la indentación YAML sin cambios (solo se alargó el `- run:` en las dos líneas). El job `frontend` no se tocó.

#### 8.2 — Instalación en §1 con los dos archivos

```
PS> Select-String -Path README.md -Pattern 'requirements-dev\.txt' -Encoding UTF8
56: python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
66: python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt

PS> (Select-String -Path README.md -Pattern 'requirements-dev\.txt' -Encoding UTF8).Count
2

PS> Select-String -Path README.md -Pattern 'pip install -r backend/requirements\.txt$' -Encoding UTF8
<sin coincidencias>

PS> (Select-String -Path README.md -Pattern 'pip install -r backend/requirements\.txt$' -Encoding UTF8).Count
0
```

Cumple: 2 coincidencias (bloques PowerShell y bash de la sección 1) y ninguna sección vuelve a instalar solo `requirements.txt` para desarrollo.

#### 8.3 — Migraciones dentro del contenedor, `up --build` y volumen `pgdata`

```
PS> Select-String -Path README.md -Pattern 'docker compose exec api python -m alembic' -Encoding UTF8
119: docker compose exec api python -m alembic -c backend/alembic.ini upgrade head
128: docker compose exec api python -m alembic -c backend/alembic.ini upgrade head
142: docker compose exec api python -m alembic -c backend/alembic.ini downgrade -1
148: docker compose exec api python -m alembic -c backend/alembic.ini current

PS> (Select-String -Path README.md -Pattern 'docker compose exec api python -m alembic' -Encoding UTF8).Count
4

PS> Select-String -Path README.md -Pattern 'docker compose up --build' -Encoding UTF8
91: > **El servicio `api` ya funciona en contenedor.** ... para levantar API + web usá `docker compose up --build`. ...
93: Para levantar la API y el frontend junto con la base: `docker compose up --build` (la API queda en `http://127.0.0.1:8000` y el frontend en `http://localhost:8080`).
118: docker compose up --build -d api
127: docker compose up --build -d api

PS> (Select-String -Path README.md -Pattern 'docker compose up --build' -Encoding UTF8).Count
4

PS> Select-String -Path README.md -Pattern 'down -v' -Encoding UTF8
151: > **Cuidado con el volumen `pgdata`:** ... El remedio es `docker compose down -v` y volver a levantar, ...

PS> (Select-String -Path README.md -Pattern 'down -v' -Encoding UTF8).Count
1
```

Comando extra (no está en la task; confirma que no queda `alembic` del host como comando suelto):

```
PS> Select-String -Path README.md -Pattern 'python -m alembic' -Encoding UTF8
119: docker compose exec api python -m alembic -c backend/alembic.ini upgrade head
128: docker compose exec api python -m alembic -c backend/alembic.ini upgrade head
142: docker compose exec api python -m alembic -c backend/alembic.ini downgrade -1
148: docker compose exec api python -m alembic -c backend/alembic.ini current
```

Las 4 apariciones son del contenedor (`docker compose exec api ...`), no del host. Cumple: al menos 1 coincidencia por patrón, y el camino viejo (alembic desde el host) quedó reemplazado en la sección 4. La nota del volumen está dentro de la sección de migraciones (4), como pedía la regla.

#### 8.4 — Fuera la advertencia de que `api` no arranca

```
PS> Select-String -Path README.md -Pattern "todavía no arranca" -Encoding UTF8
<sin coincidencias>

PS> (Select-String -Path README.md -Pattern "todavía no arranca" -Encoding UTF8).Count
0

PS> Select-String -Path README.md -Pattern "no arranca" -Encoding UTF8
<sin coincidencias>

PS> (Select-String -Path README.md -Pattern "no arranca" -Encoding UTF8).Count
0
```

Control positivo:

```
PS> (Select-String -Path README.md -Pattern "api" -Encoding UTF8 | Measure-Object).Count
18
```

Cumple: 0 en ambos patrones y el control positivo devuelve 18 líneas (el comando sin salida no estaba mal escrito). Además se actualizaron las otras dos notas sobre C-23 para que describan el estado corregido: la del roadmap (línea 21) y la de **Estructura del repositorio** (línea 384).

#### 8.5 — Versión de Python alineada a 3.13

Estado antes:

```
PS> Select-String -Path backend/Dockerfile -Pattern '^FROM python:'
FROM python:3.13-slim

PS> Select-String -Path .github/workflows/tests.yml -Pattern 'python-version'
          python-version: "3.12"
          python-version: "3.12"

PS> Select-String -Path README.md -Pattern 'Python 3\.' -Encoding UTF8
43: - **Python 3.12 o superior** (el CI usa 3.12; también probado con 3.13 en Windows).
73: - Si usás una versión de Python muy nueva y `pip install` falla al instalar alguna dependencia, creá el entorno con Python 3.12 o 3.13, por ejemplo `py -3.13 -m venv .venv`.
```

No coincidían (Dockerfile 3.13 vs CI y README 3.12), así que se alineó el CI y el README a la versión del `Dockerfile`. Líneas cambiadas:

- `.github/workflows/tests.yml`: `python-version: "3.12"` → `python-version: "3.13"` (2 ocurrencias, jobs `tests` y `lint`; la razón es que el contenedor de `api` ya se construye con `python:3.13-slim` y los pins se midieron en 3.13).
- `README.md:43`: `- **Python 3.12 o superior** (el CI usa 3.12; también probado con 3.13 en Windows).` → `- **Python 3.13** (el CI usa 3.13; el `Dockerfile` de `api` usa `python:3.13-slim`).`

Estado después:

```
PS> Select-String -Path backend/Dockerfile -Pattern '^FROM python:'
FROM python:3.13-slim

PS> Select-String -Path .github/workflows/tests.yml -Pattern 'python-version'
          python-version: "3.13"
          python-version: "3.13"

PS> Select-String -Path README.md -Pattern 'Python 3\.' -Encoding UTF8
43: - **Python 3.13** (el CI usa 3.13; el `Dockerfile` de `api` usa `python:3.13-slim`).
73: - Si usás una versión de Python muy nueva y `pip install` falla al instalar alguna dependencia, creá el entorno con Python 3.12 o 3.13, por ejemplo `py -3.13 -m venv .venv`.
```

Cumple: `FROM` y los dos `python-version` declaran 3.13 y el README lo nombra como soportada. La línea 73 **no** se cambió (menciona 3.12/3.13 solo para crear el `.venv` local): quedó como observación.

#### Observaciones fuera de alcance (no se tocaron)

1. **`README.md:93` contradice `POSTGRES_PORT` y no se reescribió** (la regla de 8.3 lo pedía así). Texto literal: `**Si el puerto 5432 ya está ocupado** en tu equipo (por ejemplo, por un PostgreSQL instalado), cambiá en docker-compose.yml el mapeo "5432:5432" por "5433:5432" y usá el puerto 5433 en la DATABASE_URL. ...`. Hoy el mapeo ya es `${POSTGRES_PORT:-5432}` y la forma correcta es definir `POSTGRES_PORT` (como dice la nota de "Problema de instalación resuelto: puerto 5432 ocupado", línea 366).
2. **`README.md:36`** — la tabla del roadmap sigue con `| C-23 | fix-api-contenedor | pendiente |`. Los estados de los changes los lleva `CHANGES.md`; no se tocó el README.
3. **Contadores de tests del README desactualizados** — línea 81 dice `24 passed, 131 skipped` sin PostgreSQL y línea 133 dice `155 passed, 0 skipped`. La corrida real del grupo 4 sobre esta rama dio `139 passed, 614 skipped` sin `DATABASE_URL` y `755 passed` con `turnos_test`. Fuera del alcance de 8.1–8.5; no se tocaron.

### Grupo 9 — Verificación end-to-end y cierre de la task 5.2 de C-13 (2026-11-13)

Estado previo verificado: HEAD `28a1d9b docs(c-23): README y CI con requirements-dev y migraciones en contenedor (grupo 8)`, árbol limpio. Contenedores corriendo antes de empezar:

```
PS> docker compose ps
turnos-odontologia-api-1        turnos-odontologia-api   "uvicorn backend.app…"   api        25 minutes ago   Up 25 minutes             0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
turnos-odontologia-postgres-1   postgres:16              "docker-entrypoint.s…"   postgres   34 minutes ago   Up 34 minutes (healthy)   0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp
```

No corría `web` (había quedado removido por el `down` del grupo 5). Puertos del host:

```
PS> Get-NetTCPConnection -LocalPort 8000,8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { "$($_.LocalPort) pid=$($_.OwningProcess) " + (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName }
8000 pid=16896 com.docker.backend
```

Solo escucha `com.docker.backend` en 8000 (es el mapeo de Docker, no un uvicorn del host); 8080 estaba libre. No se mató ningún proceso.

#### 9.1 — Stack completo desde cero

```
PS> docker compose down 2>&1
Container turnos-odontologia-api-1 Stopping
 Container turnos-odontologia-api-1 Stopped 
 Container turnos-odontologia-api-1 Removing 
 Container turnos-odontologia-api-1 Removed 
 Container turnos-odontologia-postgres-1 Stopping 
 Container turnos-odontologia-postgres-1 Stopped 
 Container turnos-odontologia-postgres-1 Removing 
 Container turnos-odontologia-postgres-1 Removed 
 Network turnos-odontologia_default Removing 
 Network turnos-odontologia_default Removed 
exit 0
```

```
PS> docker compose up --build -d 2>&1
 Image turnos-odontologia-web Building 
 Image turnos-odontologia-api Building 
#1 [internal] load local bake definitions
#1 reading from stdin 1.19kB done
#1 DONE 0.0s

#2 [api internal] load build definition from Dockerfile
#2 transferring dockerfile: 295B done
#2 DONE 0.0s

#3 [web internal] load build definition from Dockerfile
#3 transferring dockerfile: 561B 0.0s done
#3 DONE 0.1s

#4 [web internal] load metadata for docker.io/library/nginx:alpine
#4 DONE 1.4s

#5 [api internal] load metadata for docker.io/library/python:3.13-slim
#5 DONE 1.1s

#6 [api internal] load .dockerignore
#6 transferring context: 91B done
#6 DONE 0.0s

#7 [api internal] load build context
#7 transferring context: 9.31kB 0.0s done
#7 DONE 0.0s

#8 [api 1/5] FROM docker.io/library/python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
#8 resolve docker.io/library/python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90 0.0s done
#8 DONE 0.0s

#9 [api 2/5] WORKDIR /code
#9 CACHED

#10 [api 3/5] COPY backend/requirements.txt ./backend/requirements.txt
#10 CACHED

#11 [api 4/5] RUN pip install --no-cache-dir -r backend/requirements.txt
#11 CACHED

#12 [api 5/5] COPY backend/ ./backend/
#12 DONE 0.1s

#13 [web internal] load metadata for docker.io/library/node:24-slim
#13 DONE 1.4s

#16 [web build 1/6] FROM docker.io/library/node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
#16 resolve docker.io/library/node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 0.0s done
#16 DONE 0.1s

#17 [web stage-1 1/3] FROM docker.io/library/nginx:alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11
#17 resolve docker.io/library/nginx:alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11 0.0s done
#17 DONE 0.1s

#15 [api] exporting to image
#15 exporting layers 0.2s done
#15 exporting manifest sha256:9664745567e3d9e02c52ade7bf886741b2ef09ed56e8a614b0ed51c06c429442 0.0s done
#15 exporting config sha256:1f9e3a432aeb2c99bd23566fe45f9f23d582702a8e75905302dbaaa4deeaf5ff 0.0s done
#15 exporting attestation manifest sha256:d22dca241ca76339e15550a5a82f6a55683a947f3ff68e6ff863a95955aa145 0.0s done
#15 exporting manifest list sha256:f4850657a28b391ac30450149fec5bd38b80a2000b3d93804742ee43fe1f786c 0.0s done
#15 naming to docker.io/library/turnos-odontologia-api:latest done
#15 unpacking to docker.io/library/turnos-odontologia-api:latest 0.1s done
#15 DONE 0.5s

#18 [web internal] load build context
#18 transferring context: 173.22kB 0.2s done
#18 DONE 0.2s

#19 [web build 2/6] WORKDIR /app
#19 CACHED

#20 [web build 4/6] RUN npm ci
#20 CACHED

#21 [web build 5/6] COPY . .
#21 CACHED

#22 [web build 6/6] RUN npm run build
#22 CACHED

#23 [web build 3/6] COPY package.json package-lock.json ./
#23 CACHED

#24 [web stage-1 2/3] COPY nginx.conf /etc/nginx/conf.d/default.conf
#24 CACHED

#25 [web stage-1 3/3] COPY --from=build /app/dist /usr/share/nginx/html
#25 CACHED

#26 [web] exporting to image
#26 exporting layers done
#26 exporting manifest sha256:baf4b1fa599cbbbabb0f42dba62311409c6f6a737ab985c4f021c293282efb36 done
#26 exporting config sha256:74adc935c902fa56f843038bbcdc554b1e3d8da31695daa12f00230cf98c5f24 done
#26 exporting attestation manifest sha256:e757d0cd473e028fa669250dfa2228f6c20d4ce395104058330fb5724ac71ab4 0.0s done
#26 exporting manifest list sha256:77e779193b35365795b39a1152fbb8f06db1bcc683cae6803e1fbee8f02ebbe9 0.0s done
#26 naming to docker.io/library/turnos-odontologia-web:latest 0.0s done
#26 unpacking to docker.io/library/turnos-odontologia-web:latest 0.0s done
#26 DONE 0.2s

#27 [api] resolving provenance for metadata file
#27 DONE 0.0s

#28 [web] resolving provenance for metadata file
#28 DONE 0.0s
 Image turnos-odontologia-api Built 
 Image turnos-odontologia-web Built 
 Network turnos-odontologia_default Creating 
 Network turnos-odontologia_default Created 
 Container turnos-odontologia-postgres-1 Creating 
 Container turnos-odontologia-postgres-1 Created 
 Container turnos-odontologia-api-1 Creating 
 Container turnos-odontologia-api-1 Created 
 Container turnos-odontologia-web-1 Creating 
 Container turnos-odontologia-web-1 Created 
 Container turnos-odontologia-postgres-1 Starting 
 Container turnos-odontologia-postgres-1 Started 
 Container turnos-odontologia-postgres-1 Waiting 
 Container turnos-odontologia-postgres-1 Healthy 
 Container turnos-odontologia-api-1 Starting 
 Container turnos-odontologia-api-1 Started 
 Container turnos-odontologia-web-1 Starting 
 Container turnos-odontologia-web-1 Started 
exit 0
```

Espera de healthy (reintentos de `ps` con pausas cortas, sin `Start-Sleep` largos):

```
PS> Start-Sleep -Seconds 5; docker compose ps --format "{{.Name}} {{.Status}}"
turnos-odontologia-api-1 Up 13 seconds
turnos-odontologia-postgres-1 Up 19 seconds (healthy)
turnos-odontologia-web-1 Up 13 seconds

PS> Start-Sleep -Seconds 5; docker compose ps --format "{{.Name}} {{.Status}}"
turnos-odontologia-api-1 Up 18 seconds
turnos-odontologia-postgres-1 Up 24 seconds (healthy)
turnos-odontologia-web-1 Up 18 seconds

PS> docker inspect -f "{{.Name}} restarts={{.RestartCount}}" turnos-odontologia-api-1
/turnos-odontologia-api-1 restarts=0
```

Cumple: `postgres` `Up (healthy)`, `api` `Up` (sin `restarting`) con `restarts=0`, `web` `Up` y ninguno `exited`. No se usó `down -v` ni se tocó ningún volumen.

#### 9.2 — `/health` directo contra `api`

```
PS> curl.exe -s -o NUL -w "%{http_code}" http://localhost:8000/health
200

PS> curl.exe -s http://localhost:8000/health
{"status":"ok"}
```

Cumple: `200` y exactamente `{"status":"ok"}`.

#### 9.3 — `/api/health` a través de nginx (web) y cierre de la task 5.2 de C-13

**Cierre de la task 5.2 de C-13**

```
PS> curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/api/health
200

PS> curl.exe -s http://localhost:8080/api/health
{"status":"ok"}
```

Control extra (raíz del sitio servido por nginx):

```
PS> curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/
200
```

Cumple: `200` y `{"status":"ok"}` a través de nginx en el puerto 8080. La evidencia de la task 5.2 de C-13 vive **solo** en este archivo; no se editó `openspec/changes/archive/2026-11-12-c-13-frontend-foundation/tasks.md`.

#### 9.4 — El web no se rompió

```
PS> docker compose config --services
postgres
api
web

PS> (docker compose config --services | Measure-Object -Line).Lines
3
```

Cumple: exactamente `postgres`, `api` y `web`, y el conteo `3`.

Los contenedores quedaron corriendo al terminar (el `down` final es de la task 9.6, que no se ejecutó).

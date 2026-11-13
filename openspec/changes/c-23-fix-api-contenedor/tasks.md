# Tasks — fix-api-contenedor (C-23)

> Todos los comandos están escritos para **Windows PowerShell 5.1** desde la raíz del repo
> (`C:\Users\Mariano_Chirino\Documents\GitHub\turnos-odontologia`), en la rama
> `feature/c-23-fix-api-contenedor`. Se usa `curl.exe` (nunca el alias `curl`), `NUL` en lugar de
> `/dev/null`, `Select-String` en lugar de `grep`, y no se encadenan comandos con `&&`.
> Los pins definitivos de los grupos 4 y 8 se fijan durante apply (ver `design.md` §Preguntas abiertas Q1 y Q2).

## 1. Baseline y medición del estado actual

- [ ] 1.1 Registrar el baseline de servicios y del repo antes de tocar nada.
  **Cómo se verifica**: `docker compose config --services` y `git status --short` y `git branch --show-current` y `Select-String -Path docker-compose.yml -Pattern '8000'`.
  **Resultado esperado**: `config --services` lista exactamente `postgres`, `api` y `web` (tres líneas); la rama es `feature/c-23-fix-api-contenedor`; `git status --short` solo muestra `openspec/changes/c-23-fix-api-contenedor/` como cambio nuevo; `Select-String` sobre `docker-compose.yml` encuentra el mapeo que publica `8000` del servicio `api`, del que depende la task 9.2.

- [ ] 1.2 Registrar que hoy **no** existe `.dockerignore` en la raíz y que el único es el del frontend.
  **Cómo se verifica**: `Test-Path .dockerignore` y `Test-Path frontend/.dockerignore`.
  **Resultado esperado**: la primera salida es `False`; la segunda es `True`. Se anota en las notas de apply como hecho medido (es el estado que C-23 corrige).

- [ ] 1.3 **Diagnóstico (puede fallar por diseño)**: probar el defecto real del contenedor y guardar la evidencia.
  **Cómo se verifica**: `docker compose build api`, luego `docker compose up -d api`, esperar 20 segundos y `docker compose ps --format "{{.Name}} {{.Status}}"`.
  **Resultado esperado**: el servicio `api` aparece como `restarting` o `exited` (no `running`), y `docker compose logs --tail 20 api` muestra `ModuleNotFoundError: No module named 'backend'` o `No module named 'app'`. **Este fallo es la evidencia del defecto, no un bloqueo**: se copia la salida literal en las notas de apply y se continúa. Al terminar, `docker compose stop api` para no dejar el contenedor en loop.

- [ ] 1.4 Verificar el valor real de `script_location` para no cambiarlo sin motivo.
  **Cómo se verifica**: `Select-String -Path backend/alembic.ini -Pattern '^script_location'`.
  **Resultado esperado**: una única coincidencia con `script_location = %(here)s/alembic`. Como `%(here)s` se resuelve contra el directorio del ini, `alembic.ini` **no se modifica** en este change (ver `design.md` D3).

- [ ] 1.5 Verificar los intérpretes disponibles y la versión del `.venv` existente antes de elegir la versión de Python.
  **Cómo se verifica**: `py --list` y `Select-String -Path .venv\pyvenv.cfg -Pattern 'version'`.
  **Resultado esperado**: `py --list` incluye **3.13** (además de 3.12 y 3.14): sin 3.13 no se pueden crear los venv de medición de las tasks 4.1 y 4.4, así que si falta se frena y se reporta; `pyvenv.cfg` informa `version = 3.14.4`. Se anota que el `.venv` de la raíz es de 3.14 y **no se usa para verificar**: la medición de pins y la suite se corren en el venv 3.13 de `$env:TEMP` (Q1, default `3.13`).

## 2. `.dockerignore` en la raíz

- [ ] 2.1 Crear `.dockerignore` en la raíz del repo con exactamente seis líneas: `frontend/`, `.venv`, `**/__pycache__`, `**/*.pyc`, `.git`, `docs/`.
  **Cómo se verifica**: `Select-String -Path .dockerignore -Pattern '^(frontend/|\.venv|\*\*/__pycache__|\*\*/\*\.pyc|\.git|docs/)$' | Measure-Object | Select-Object -ExpandProperty Count`.
  **Resultado esperado**: `6`. Además `(Get-Content .dockerignore).Count` devuelve `6` (sin líneas extra, para que la verificación por regex sea exacta). Los dos patrones con `**/` son obligatorios: `__pycache__/*` y `*.pyc` sin prefijo solo matchean en la raíz del contexto y no cubren `backend/app/**` (ver `design.md` D4).

- [ ] 2.2 Confirmar que `frontend/.dockerignore` de C-13 queda intacto y en su lugar.
  **Cómo se verifica**: `Test-Path frontend/.dockerignore` y `git status --short frontend/.dockerignore`.
  **Resultado esperado**: `True` y salida vacía en `git status` (el archivo existe y no fue modificado, movido ni reemplazado por el nuevo de la raíz).

## 3. `backend/Dockerfile` y contexto de build

- [ ] 3.1 Reescribir `backend/Dockerfile` para el contexto raíz: `FROM python:3.13-slim` (sujeto a Q1), `WORKDIR /code`, `COPY backend/requirements.txt ./backend/requirements.txt`, `RUN pip install --no-cache-dir -r backend/requirements.txt`, `COPY backend/ ./backend/`, `CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]`.
  **Cómo se verifica**: `Select-String -Path backend/Dockerfile -Pattern '^COPY backend/ \./backend/$'` y `Select-String -Path backend/Dockerfile -Pattern '^CMD \["uvicorn", "backend\.app\.main:app"'` y `Select-String -Path backend/Dockerfile -Pattern '^WORKDIR /code$'`.
  **Resultado esperado**: una coincidencia en cada comando (3 en total). No queda ninguna línea con `COPY app ./app` ni con `uvicorn app.main:app`.

- [ ] 3.2 Cambiar el build de `api` en `docker-compose.yml` a contexto raíz: `build: { context: ., dockerfile: backend/Dockerfile }`.
  **Cómo se verifica**: `docker compose config | Select-String -Pattern 'context: |dockerfile: '`.
  **Resultado esperado**: la salida del servicio `api` muestra `context: ...\turnos-odontologia` (la raíz absoluta) y `dockerfile: backend/Dockerfile`; el servicio `web` sigue mostrando `context: ...\frontend`. No aparece `build: backend` en ningún lado.

- [ ] 3.3 Construir la imagen y probar que el paquete `backend` es importable dentro del contenedor.
  **Cómo se verifica**: `docker compose build api`, `docker compose up -d postgres`, esperar a que `docker compose ps --format "{{.Name}} {{.Status}}"` muestre el contenedor de `postgres` como `healthy`, luego `docker compose up -d api` y `docker compose exec api python -c "import backend.app.main"`.
  **Resultado esperado**: el build termina con exit code 0; el último comando termina sin salida y sin `ModuleNotFoundError` (exit 0). `docker compose ps --format "{{.Name}} {{.Status}}"` muestra `api` como `Up` sin `(restarting)`.

## 4. Dependencias: runtime con pin vs. desarrollo

- [ ] 4.1 Medir los pins en un venv nuevo de la versión elegida (Q1) y guardar el `pip freeze` como evidencia. El venv y el freeze van **fuera del repo**, bajo `$env:TEMP`, para no ensuciar el árbol de trabajo.
  **Cómo se verifica**: `py -3.13 -m venv $env:TEMP\venv-medicion`, `& "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip install --upgrade pip`, `& "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip install fastapi sqlalchemy alembic "psycopg[binary]" uvicorn httpx tzdata pytest ruff`, `& "$env:TEMP\venv-medicion\Scripts\python.exe" -m pip freeze > $env:TEMP\freeze.txt`, `Select-String -Path $env:TEMP\freeze.txt -Pattern '^(fastapi|SQLAlchemy|alembic|psycopg|psycopg-binary|uvicorn|httpx|tzdata|pytest|ruff)=='`.
  **Resultado esperado**: al menos 9 coincidencias con versión exacta (`==`) para fastapi, SQLAlchemy, alembic, psycopg, uvicorn, httpx, tzdata, pytest y ruff. El contenido de `$env:TEMP\freeze.txt` se pega en las notas de apply y el venv se borra al terminar (`Remove-Item -Recurse -Force $env:TEMP\venv-medicion`). Al final de la task, `git status --short` no muestra archivos nuevos fuera de lo esperado.

- [ ] 4.2 Confirmar la clasificación de `httpx` (Q6) y escribir `backend/requirements.txt` solo con runtime y **todos** con `==`: `fastapi`, `sqlalchemy`, `alembic`, `psycopg[binary]`, `uvicorn`, `tzdata`.
  **Cómo se verifica**: `Get-ChildItem -Recurse backend/app -Include *.py | Select-String -Pattern "httpx" | Measure-Object | Select-Object -ExpandProperty Count` y `(Get-Content backend/requirements.txt | Where-Object { $_ -match '\S' }).Count` y `(Select-String -Path backend/requirements.txt -Pattern '^[^=]+==[0-9]').Count`.
  **Resultado esperado**: el primer comando devuelve `0` (ningún import de `httpx` en `backend/app/`), que es la medición que justifica el default dev de Q6; si devolviera más de `0`, `httpx` va a runtime, se ajusta la spec y se registra la evidencia. Los otros dos números son iguales (6 y 6): cada línea no vacía tiene pin `==`. `Select-String -Path backend/requirements.txt -Pattern '^(pytest|ruff|httpx)'` devuelve 0 coincidencias.

- [ ] 4.3 Crear `backend/requirements-dev.txt` con `-r requirements.txt` primero, y después `pytest==<pin>`, `ruff==<pin>` y `httpx==<pin>` con los valores medidos en 4.1.
  **Cómo se verifica**: `Select-String -Path backend/requirements-dev.txt -Pattern '^-r requirements\.txt$'` y `Select-String -Path backend/requirements-dev.txt -Pattern '^(pytest|ruff|httpx)==[0-9]'`.
  **Resultado esperado**: 1 coincidencia para el `-r` en la primera línea y 3 coincidencias (pytest, ruff y httpx) con pin `==` en el segundo comando.

- [ ] 4.4 Probar la instalación limpia de los dos archivos en un venv nuevo **fuera del repo** (`$env:TEMP`). **Este venv no se borra hasta terminar la task 9.5**: es el intérprete 3.13 con el que se corren `pytest` y `ruff` en 7.2 y 9.5. El `.venv` de la raíz (3.14) **no** se usa para verificar.
  **Cómo se verifica**: `py -3.13 -m venv $env:TEMP\venv-verif`, `& "$env:TEMP\venv-verif\Scripts\python.exe" -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt`, luego `& "$env:TEMP\venv-verif\Scripts\python.exe" -m pytest -rs backend/tests` y `& "$env:TEMP\venv-verif\Scripts\python.exe" -m ruff check backend/`.
  **Resultado esperado**: el `pip install` termina sin error de resolución (ningún `No matching distribution found`); `pytest` reporta passed/skipped sin fallos y `ruff` informa `All checks passed!`. Si algún pin no existe para 3.13, se reporta el error real y se ajusta **con evidencia** en las notas de apply (Q2). `git status --short` no muestra archivos nuevos fuera de lo esperado. El borrado del venv queda para la task 9.6.

- [ ] 4.5 Confirmar que la imagen de `api` instala solo runtime.
  **Cómo se verifica**: `docker compose build api`, `docker compose up -d api`, `docker compose exec api python -m pip list | Select-String -Pattern '^(pytest|ruff|httpx)\s'`.
  **Resultado esperado**: 0 coincidencias (ni `pytest`, ni `ruff`, ni `httpx` dentro de la imagen) y `docker compose exec api python -m pip list | Select-String -Pattern '^(fastapi|SQLAlchemy|alembic|uvicorn|tzdata)\s'` muestra 5 coincidencias con versión pinneada.

## 5. Compose por entorno: credenciales, `TZ` y puerto

- [ ] 5.1 Interpolar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `TZ` con `${VAR:-default}` ficticio en `postgres` y reutilizar los mismos valores en el `healthcheck` (`pg_isready -U ... -d ...`) y en el `DATABASE_URL` de `api` con host `postgres` y puerto interno `5432`.
  **Cómo se verifica**: `docker compose config | Select-String -Pattern 'POSTGRES_|pg_isready|DATABASE_URL|TZ'`.
  **Resultado esperado**: el YAML resuelto muestra `odontologia` / `odontologia` / `turnos` / `America/Argentina/Buenos_Aires` en los tres lugares (`environment` de `postgres`, `healthcheck.test` y `DATABASE_URL` de `api`), y el `DATABASE_URL` de `api` apunta a `postgres:5432`.

- [ ] 5.2 Comprobar que cambiar `POSTGRES_DB` y `POSTGRES_USER` en el entorno se refleja en `api`, y que `POSTGRES_PORT` solo mueve el mapeo del host.
  **Cómo se verifica**: `$env:POSTGRES_DB = "turnos_test"; $env:POSTGRES_USER = "otro"; docker compose config | Select-String -Pattern "DATABASE_URL"; Remove-Item Env:POSTGRES_DB; Remove-Item Env:POSTGRES_USER` y después `$env:POSTGRES_PORT = "5433"; docker compose config | Select-String -Pattern "published|target|5432|5433"; Remove-Item Env:POSTGRES_PORT`.
  **Resultado esperado**: en el primer bloque el `DATABASE_URL` sale como `postgresql+psycopg://otro:odontologia@postgres:5432/turnos_test` (usuario y base del entorno, puerto interno 5432). En el segundo bloque el mapeo de `postgres` sale `published: "5433"` con `target: 5432` **y** el `DATABASE_URL` de `api` sigue en `postgres:5432` (el puerto del entorno no contamina la URL interna).

- [ ] 5.3 Confirmar que no quedan secretos ni credenciales reales en archivos versionados.
  **Cómo se verifica**: `git grep -n -i "password"`.
  **Resultado esperado**: todas las coincidencias son defaults ficticios (`odontologia`) o referencias `${POSTGRES_PASSWORD:-...}` en `docker-compose.yml`, `.env.example`, `README.md` o `knowledge-base/`; ninguna credencial real, token ni valor de producción.

- [ ] 5.4 Agregar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `POSTGRES_PORT` a `.env.example` con los defaults ficticios y un comentario de que los valores reales van solo en un `.env` no versionado.
  **Cómo se verifica**: `Select-String -Path .env.example -Pattern '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|POSTGRES_PORT)='`.
  **Resultado esperado**: 4 coincidencias, todas con valores ficticios (`odontologia`, `odontologia`, `turnos`, `5433` o `5432` según lo que el README documente), sin ningún valor real.

- [ ] 5.5 Verificar que `postgres` levanta `healthy` solo con los defaults, sin variables de entorno definidas.
  **Cómo se verifica**: `docker compose down`, `docker compose up -d postgres`, esperar y `docker compose ps --format "{{.Name}} {{.Status}}"`.
  **Resultado esperado**: el contenedor de `postgres` aparece `Up ... (healthy)` sin haber definido ninguna variable `POSTGRES_*` en la shell. **Nota:** si el volumen `pgdata` ya existía, conserva las credenciales y la base con las que se inicializó; los defaults de la shell no lo re-inicializan (ver el riesgo del volumen en `design.md` §Risks y la task 8.3 para el `docker compose down -v`).

## 6. Alembic dentro del contenedor

- [ ] 6.1 Verificar que la imagen incluye el ini y las revisiones, consultando la revisión aplicada desde adentro del contenedor.
  **Cómo se verifica**: `docker compose up -d api`, `docker compose exec api python -m alembic -c backend/alembic.ini current`.
  **Resultado esperado**: el comando termina con exit 0, sin `No such file or directory` ni error de `script_location`, e imprime la revisión aplicada que reporta la base (o vacío si la base está sin migrar). Si apareciera un error de `script_location`, se ajusta `backend/alembic.ini` **y se registra la evidencia** antes de seguir (Q4).

- [ ] 6.2 Correr `upgrade head` y probar que la segunda corrida es idempotente.
  **Cómo se verifica**: `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head`, luego el mismo comando una segunda vez.
  **Resultado esperado**: la primera corrida aplica las revisiones pendientes hasta `head` (o informa que ya está al día) con exit 0; la segunda corrida termina con exit 0 **sin aplicar ninguna revisión nueva**.

- [ ] 6.3 Probar el borde de rollback y re-aplicación dentro del contenedor.
  **Cómo se verifica**: `docker compose exec api python -m alembic -c backend/alembic.ini downgrade -1`, luego `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head` y por último `docker compose exec api python -m alembic -c backend/alembic.ini current`.
  **Resultado esperado**: `downgrade -1` y `upgrade head` terminan con exit 0, y el `current` final devuelve la misma revisión que había antes del `downgrade`. Se anota que estos comandos operan sobre la base local de datos ficticios.

## 7. Docstring real de `backend/app/main.py`

- [ ] 7.1 Reemplazar el docstring `"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""` por una descripción real: app FastAPI que expone `/health` y monta los routers de turnos, agenda, catálogo, lista de espera, historia clínica, caja, RBAC, export, recordatorios y reserva online, todos con SQLAlchemy sobre `DATABASE_URL`.
  **Cómo se verifica**: `Select-String -Path backend/app/main.py -Pattern "solo GET /health"` y `Select-String -Path backend/app/main.py -Pattern "sin DB"` y `Select-String -Path backend/app/main.py -Pattern "routers"`.
  **Resultado esperado**: 0 coincidencias en los primeros dos comandos y al menos 1 coincidencia en el tercero (el docstring menciona los routers montados).

- [ ] 7.2 Confirmar que la corrección del docstring no tocó rutas ni comportamiento.
  **Cómo se verifica**: `git --no-pager diff -U0 backend/app/main.py | Select-String -Pattern '^[+-]@app|^[+-]app\.include_router'` y después `& "$env:TEMP\venv-verif\Scripts\python.exe" -m ruff check backend/` (el venv 3.13 de la task 4.4, todavía sin borrar; el `.venv` de la raíz en 3.14 **no** se usa para verificar).
  **Resultado esperado**: 0 coincidencias en el diff filtrado (ninguna línea de `@app` ni de `include_router` cambió) y `ruff` informa `All checks passed!`.

## 8. README y CI

- [ ] 8.1 En `.github/workflows/tests.yml`, instalar `backend/requirements.txt` **y** `backend/requirements-dev.txt` solo en los jobs `tests` y `lint`; no tocar el job `frontend`.
  **Cómo se verifica**: `Select-String -Path .github/workflows/tests.yml -Pattern 'requirements-dev\.txt'` y `Select-String -Path .github/workflows/tests.yml -Pattern '^  (tests|lint|frontend):$'` y `Select-String -Path .github/workflows/tests.yml -Pattern 'npm ci'`.
  **Resultado esperado**: 2 coincidencias de `requirements-dev.txt` (una por job Python), 3 coincidencias de nombres de job (`tests`, `lint`, `frontend`) y 1 coincidencia de `npm ci` (el job `frontend` sigue igual, sin pasos de Python ni de requirements).

- [ ] 8.2 Actualizar el README §1 para instalar los dos archivos (`python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt`), en PowerShell y en bash.
  **Cómo se verifica**: `Select-String -Path README.md -Pattern 'requirements-dev\.txt'`.
  **Resultado esperado**: al menos 2 coincidencias (bloque PowerShell y bloque bash), y ninguna sección queda instalando solo `requirements.txt` para desarrollo.

- [ ] 8.3 Documentar las migraciones dentro del contenedor, reemplazar el camino viejo en §3 y §4 y documentar el volumen `pgdata`.
  **Cómo se verifica**: `Select-String -Path README.md -Pattern 'docker compose exec api python -m alembic'` y `Select-String -Path README.md -Pattern 'docker compose up --build'` y `Select-String -Path README.md -Pattern 'down -v'`.
  **Resultado esperado**: al menos 1 coincidencia por patrón: el README muestra `docker compose exec api python -m alembic -c backend/alembic.ini upgrade head` (y `current` / `downgrade -1`) dentro del contenedor, `docker compose up --build` como forma de levantar API + web, y **una nota que explica que cambiar `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` con un volumen `pgdata` ya inicializado no tiene efecto y hace fallar la autenticación de `api`, con `docker compose down -v` como remedio, aclarando que eso borra los datos y solo es aceptable con datos ficticios**.

- [ ] 8.4 Borrar la advertencia que dice que el servicio `api` no arranca.
  **Cómo se verifica**: `Select-String -Path README.md -Pattern "todavía no arranca"` y `Select-String -Path README.md -Pattern "no arranca"`.
  **Resultado esperado**: 0 coincidencias en ambos comandos. Si quedara alguna nota sobre C-23, debe describir el estado corregido, no el defecto.

- [ ] 8.5 Verificar la coherencia de la versión de Python elegida en README, Dockerfile y CI.
  **Cómo se verifica**: `Select-String -Path backend/Dockerfile -Pattern '^FROM python:'` y `Select-String -Path .github/workflows/tests.yml -Pattern 'python-version'` y `Select-String -Path README.md -Pattern 'Python 3\.'`.
  **Resultado esperado**: el `FROM` del Dockerfile y los dos `python-version` del CI declaran la **misma** versión (default propuesto `3.13`), y el README §Requisitos nombra esa versión como la soportada.

## 9. Verificación end-to-end y cierre de la task 5.2 de C-13

- [ ] 9.1 Levantar el stack completo desde cero.
  **Cómo se verifica**: `docker compose down`, `docker compose up --build -d`, esperar a que `postgres` esté `healthy`, luego `docker compose ps --format "{{.Name}} {{.Status}}"`.
  **Resultado esperado**: `postgres` `Up ... (healthy)`, `api` `Up` **sin** `(restarting)` ni reinicios, y `web` `Up`. Ninguno de los tres aparece `exited`.

- [ ] 9.2 Verificar `/health` directo contra `api`.
  **Cómo se verifica**: con cualquier `uvicorn` del host detenido (paso 5 del README), `curl.exe -s -o NUL -w "%{http_code}" http://localhost:8000/health` y `curl.exe -s http://localhost:8000/health`. Fallback si `curl.exe` del host no está disponible: `docker compose exec api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"`.
  **Resultado esperado**: el primer comando imprime `200` y el segundo imprime exactamente `{"status":"ok"}` (el fallback imprime lo mismo desde adentro del contenedor).

- [ ] 9.3 Verificar `/api/health` a través de nginx (`web`) y **cerrar la task 5.2 de C-13** con la evidencia.
  **Cómo se verifica**: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/api/health` y `curl.exe -s http://localhost:8080/api/health`.
  **Resultado esperado**: `200` y `{"status":"ok"}`. La salida literal de ambos comandos se pega en las notas de apply de este `tasks.md` como evidencia del cierre de la task 5.2 de C-13 (el archivo archivado de C-13 **no se edita**).

- [ ] 9.4 Confirmar que C-23 no rompió el servicio `web` de C-13.
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

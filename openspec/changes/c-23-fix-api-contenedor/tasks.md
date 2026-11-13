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

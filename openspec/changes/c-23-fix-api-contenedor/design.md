# Design — fix-api-contenedor (C-23)

## Context

Ver `proposal.md` §Why para la motivación. Acá queda solo el estado real medido y las restricciones que condicionan las decisiones.

**`backend/Dockerfile` completo hoy (6 líneas):**

```dockerfile
FROM python:3.12-slim
WORKDIR /code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`COPY app ./app` deja `/code/app/...` y nunca crea `/code/backend/`. El `CMD` arranca `app.main`, que existe solo si el proceso corre dentro de `backend/`; con `WORKDIR /code` no existe, y aun corriendo desde `/code/backend` el módulo `app.main` importaría `backend.app.turnos.router` desde un paquete `backend` inexistente. Las dos variantes fallan: el contenedor no llega a servir `/health`.

**Import real que exige el paquete `backend`** (`backend/app/main.py` líneas 5-14, 10 routers):

```python
from backend.app.agenda.router import router as agenda_router
from backend.app.agenda.router_catalogo import router as catalogo_router
```

`backend/__init__.py` existe, así que basta con que el directorio que contiene `backend/` esté en `sys.path` (lo que ocurre naturalmente si el proceso corre desde el root del repo). Lo mismo vale para `backend/alembic/env.py`, que importa `from backend.app.db import Base` y los `models` de cada módulo: **alembic también necesita el root en `sys.path`**.

**Truncated `docker-compose.yml` — problemas concretos:**

```yaml
  api:
    build: backend          # contexto = backend/, la imagen nunca ve alembic.ini desde el root

  postgres:
    environment:
      POSTGRES_USER: odontologia      # credenciales hardcodeadas
      POSTGRES_PASSWORD: odontologia
      POSTGRES_DB: turnos
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U odontologia -d turnos"]   # hardcodeado otra vez

  api:
    environment:
      DATABASE_URL: postgresql+psycopg://odontologia:odontologia@postgres:5432/turnos  # hardcodeado por tercera vez
```

Son **tres** servicios (`postgres`, `api`, `web`), no dos: `web` lo agregó C-13 con `build.context: frontend`, `ports: "8080:80"` y `depends_on: api`. Cualquier cambio de contexto de build en `api` convive con eso.

**Estado verificado hoy (levantado por el orquestador, no supuesto):**

- `backend/alembic.ini` línea 2 es `script_location = %(here)s/alembic`, **no** `script_location = alembic`. Con `%(here)s` la ruta se resuelve contra el directorio del ini, así que funciona desde cualquier `WORKDIR` mientras `alembic/` esté al lado. **No necesita cambios**; el texto de `CHANGES.md` asumía el valor viejo.
- `backend/requirements.txt` mezcla runtime y dev en 9 líneas sin pins: `fastapi>=0.115`, `sqlalchemy>=2.0`, `alembic`, `psycopg[binary]>=3.1`, `uvicorn`, `httpx`, `pytest>=8`, `ruff`, `tzdata`. `backend/requirements-dev.txt` no existe.
- **No hay `.dockerignore` en la raíz.** El único es `frontend/.dockerignore` (creado por C-13, para el contexto `frontend/`).
- `.github/workflows/tests.yml` tiene exactamente **tres** jobs: `tests`, `lint` y `frontend`. `tests` y `lint` instalan `-r backend/requirements.txt` con `python-version: "3.12"`; `frontend` usa Node 24 y `npm`, no toca Python.
- `frontend/nginx.conf` hace `location /api/ { proxy_pass http://api:8000/; }`; la barra final quita el prefijo, así que `GET http://localhost:8080/api/health` llega a `api:8000/health`.
- Existe un `.venv` en la raíz con Python **3.14.4** (`pyvenv.cfg`), creado tiempo atrás. La afirmación de `CHANGES.md` "hoy el repo no tiene `.venv`" está desactualizada y **no se usa como hecho**.
- El README declara soporte probado en **3.12 y 3.13** (§Requisitos) y advierte en §3 que "el servicio `api` del compose todavía no arranca".

## Goals / Non-Goals

**Goals:**

- Que `docker compose up --build` deje `api` `running` sin reinicios y `GET /health` en 200, con el mismo contrato HTTP que hoy se obtiene corriendo `uvicorn` desde el host.
- Que las migraciones se puedan correr **dentro** del contenedor, sin `DATABASE_URL` exportada a mano en el host.
- Que la imagen de runtime no arrastre `pytest`/`ruff` y que todas las dependencias tengan pin reproducible.
- Que credenciales, base y `TZ` se configuren por entorno con defaults ficticios, y que `POSTGRES_PORT` siga resolviendo el conflicto con el PostgreSQL de Windows sin contaminar la URL interna.
- Dejar evidencia que cierre la task 5.2 de C-13 (`/api/health` a través de `web`).

**Non-Goals:**

- Ningún cambio de dominio: no se tocan modelos, schemas, routers, `ServicioTurnos`, migraciones ni reglas de negocio.
- Nada de JWT ni de identidad real (`X-Actor-Rol` sigue como está, C-11).
- Nada de Redis ni de funcionalidad asincrónica.
- No se orquesta despliegue real (sin registry, sin producción, sin healthchecks de Kubernetes, sin entrypoint que migre).
- No se reestructura el repo (no se mueve `backend/` a `src/`, no se cambia la organización de paquetes).

## Decisions

### D1 — El contexto de build de `api` pasa a ser el root del repo

```yaml
  api:
    build:
      context: .
      dockerfile: backend/Dockerfile
```

**Por qué:** el código importa `backend.app.*` y las migraciones viven en `backend/alembic/` junto a `backend/alembic.ini`. Con `context: backend` la imagen nunca puede tener `/code/backend/backend/...` ni el layout que el import espera; con el root como contexto, `COPY backend/` reproduce la misma estructura que el desarrollador tiene en disco, que es justamente contra la que corre la suite de `backend/tests/` (el número exacto de tests se reporta en apply).

**Tradeoff:** el contexto pasa de ~1 MB a todo el repo. Sin `.dockerignore` eso incluye `frontend/node_modules` y `.venv` (cientos de MB); por eso D4 es parte de la misma decisión y no un extra. Costo aceptado: los builds invalidan caché de `COPY` cuando cambia cualquier archivo de `backend/`.

**Alternativas descartadas:** (a) dejar `context: backend` y agregar un `sys.path` con `PYTHONPATH=/code` copiando `app/` a `backend/app/` — funciona pero deja un layout en la imagen que no existe en el repo y confunde el próximo cambio; (b) mover el paquete a la raíz y cambiar todos los imports — cambio masivo de dominio, fuera de alcance.

### D2 — `WORKDIR` = root del repo, `COPY backend/ ./backend/`, `CMD uvicorn backend.app.main:app`

```dockerfile
FROM python:3.13-slim
WORKDIR /code
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Por qué `WORKDIR /code` (root):** es el único directorio desde el cual `import backend.app.main` resuelve sin trucos de `PYTHONPATH`, y es el mismo punto de partida que usa el README desde el host (`python -m uvicorn backend.app.main:app`). Mantener el mismo `WORKDIR` en host y contenedor es lo que hace que las rutas relativas del README (`-c backend/alembic.ini`) sirvan igual adentro y afuera. `backend/` completo (no `backend/app`) es necesario porque alembic y el seed también se ejecutan dentro de la imagen.

**Por qué `COPY requirements.txt` separado y antes del código:** mantiene la capa de `pip install` cacheada cuando solo cambia código. Se copia a `./backend/requirements.txt` para que la ruta sea idéntica a la del host y el README no necesite dos variantes.

**Tradeoff:** la imagen incluye tests (`backend/tests/`) porque `COPY backend/` es todo o nada. Aceptado: pesa poco, y separar `app` de `tests`/`alembic` obligaría a tres `COPY` con rutas que el próximo change puede romper.

**Alternativa descartada:** `CMD ["python", "-m", "uvicorn", ...]` — equivalente funcional; se prefiere la forma explícita `uvicorn` porque es la que ya está en el `Dockerfile` actual y la que el operador reconoce.

### D3 — Alembic se invoca con `-c backend/alembic.ini`; `script_location` no se toca

```powershell
docker compose exec api python -m alembic -c backend/alembic.ini upgrade head
```

**Hecho verificado:** `backend/alembic.ini` línea 2 = `script_location = %(here)s/alembic`. `%(here)s` es el directorio del ini, así que la ruta resuelve a `/code/backend/alembic` sin importar el `WORKDIR`. El texto de `CHANGES.md` ("`script_location = alembic` → verificar la ruta relativa y ajustarla si hace falta") describe un valor que **ya no es el real**: no hay nada que ajustar.

**Por qué `python -m alembic` y no `alembic`:** `-m` usa el intérprete del venv del sistema de la imagen (evita depender de que el script esté en `PATH`), y es la forma que ya documenta el README en §4.

**Por qué `-c backend/alembic.ini`:** la ruta explícita evita depender del `WORKDIR` y deja el comando copy-pasteable desde el host y desde `docker compose exec`. El `env.py` resuelve `DATABASE_URL` por entorno (`os.environ`), y dentro de `api` esa variable ya viene del compose, así que no hace falta exportarla.

**Tradeoff:** cada comando de migración arrastra la ruta `-c backend/alembic.ini`. Se acepta a cambio de no tocar `alembic.ini` ni `env.py` (ambos con cambios de dominio cero).

**Contingencia registrada:** si en apply `%(here)s` no resolviera en la imagen (por ejemplo, porque el `.ini` se copió a otra ruta), se ajusta y **se registra la evidencia** en las notas de apply antes de seguir. No se cambia por las dudas.

### D4 — `.dockerignore` en la raíz con seis exclusiones, conviviendo con `frontend/.dockerignore`

Contenido propuesto (una entrada por línea, sin comentarios para que la verificación por regex sea exacta):

```
frontend/
.venv
**/__pycache__
**/*.pyc
.git
docs/
```

**Por qué `**/` en los patrones de Python:** en `.dockerignore` los patrones que no llevan barra se aplican solo contra la raíz del contexto, así que `__pycache__/*` y `*.pyc` dejarían pasar `backend/app/**/__pycache__` y sus `.pyc`, que son justamente los que invalidan la caché de `COPY` en cada corrida local. El prefijo `**/` los hace coincidir a cualquier profundidad. Los otros cuatro (`frontend/`, `.venv`, `.git`, `docs/`) son directorios de primer nivel y no necesitan prefijo.

**Por qué en la raíz:** el `.dockerignore` se busca en el **contexto** de build. Como D1 mueve el contexto de `api` a la raíz, el archivo relevante pasa a ser el de la raíz; `frontend/.dockerignore` sigue aplicándose al contexto de `web` (`frontend/`), que no cambia.

**Por qué esos seis:** `frontend/` y `.venv` son el volumen real (mano de obra y bytes); `**/__pycache__` y `**/*.pyc` son ruido que invalida caché de `COPY` en cada corrida local; `.git` es historia completa; `docs/` son insumos de discovery que no se usan en runtime.

**Tradeoff:** excluir `frontend/` significa que un futuro build de `api` que necesite un artefacto del frontend fallará — hoy no lo necesita y el `.dockerignore` de `api` debe ser explícito sobre eso. `docs/` excluido no afecta runtime; si algún día un test leyera `docs/`, habría que revisarlo.

**Alternativa descartada:** un `.dockerignore` en `backend/` — con contexto raíz Docker no lo lee, sería un archivo muerto que confunde.

### D5 — `requirements.txt` runtime con pins + `requirements-dev.txt` con `-r requirements.txt`

`backend/requirements.txt` (runtime, **todos** con `==`): `fastapi`, `sqlalchemy`, `alembic`, `psycopg[binary]`, `uvicorn`, `tzdata`.

`backend/requirements-dev.txt`:

```
-r requirements.txt
pytest==<pin>
ruff==<pin>
httpx==<pin>
```

**`httpx`:** su clasificación (runtime o dev) es la pregunta abierta **Q6**; el default propuesto es que viva en `backend/requirements-dev.txt`, y la medición que lo decide es la de la task 4.2. `CHANGES.md` lo listaba entre los pins de referencia sin clasificarlo como runtime ni como dev.

**De dónde salen los pins:** de `pip freeze` de un venv real creado para medir, fuera del repo (`py -3.13 -m venv $env:TEMP\venv-medicion`), nunca copiados a ciegas de la referencia de `CHANGES.md`. Ver "Preguntas abiertas" Q2.

**Tradeoff:** dos archivos y un `-r` que hay que recordar en el README y en el CI. Se acepta: es la separación estándar y evita que la imagen de producción cargue `ruff`.

**Alternativa descartada:** `requirements/` como directorio con `base.txt`/`dev.txt` — más ordenado a futuro pero cambia rutas que el README, el CI y `.github` ya referencian; churn innecesario para C-23.

### D6 — Configuración por entorno: interpolación en el healthcheck y en `DATABASE_URL`; `POSTGRES_PORT` solo en el host

```yaml
  postgres:
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-odontologia}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-odontologia}
      POSTGRES_DB: ${POSTGRES_DB:-turnos}
      TZ: ${TZ:-America/Argentina/Buenos_Aires}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-odontologia} -d ${POSTGRES_DB:-turnos}"]

  api:
    environment:
      TZ: ${TZ:-America/Argentina/Buenos_Aires}
      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-odontologia}:${POSTGRES_PASSWORD:-odontologia}@postgres:5432/${POSTGRES_DB:-turnos}
```

**Por qué el puerto interno es literal 5432:** dentro de la red de compose el servicio se llama `postgres` y escucha en 5432; `POSTGRES_PORT` mueve solo el mapeo host→contenedor. Mezclarlos rompe el caso del README §3 (PostgreSQL de Windows ocupando 5432): el host necesita 5433 y la red interna sigue en 5432.

**Por qué `TZ` en ambos servicios:** el dominio agenda usa zona horaria (`tzdata` está en requirements y el CI define `TZ`). Sin `TZ` en `api`, los horarios calculados dentro del contenedor dependerían del default UTC de la imagen y diferirían de los del host.

**Tradeoff:** la interpolación de `POSTGRES_*` en el `healthcheck` hace que `docker compose config` muestre el valor resuelto; con defaults ficticios no hay secreto, pero quien ponga una password real en la shell la verá en el YAML resuelto. Aceptado: es el mismo comportamiento que ya tiene `POSTGRES_PORT` y no hay forma de interpolación que oculte eso.

**`.env.example`:** se agregan `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` junto a los valores ficticios ya presentes. Decisión tomada acá (el proposal lo dejaba a confirmar): **sí**, porque el README pasa a documentar el arranque por compose y sin esas variables el archivo queda incompleto. Sin valores reales.

**Alternativa descartada:** `env_file: .env` — exige que cada desarrollador cree un archivo que hoy no es obligatorio, y rompe `docker compose up --build` en un clon nuevo sin `.env`. Los defaults en el YAML mantienen el "clone and run".

### D7 — El CI cambia solo en `tests` y `lint`

Los tres jobs existentes se quedan. `tests` y `lint` pasan de `pip install -r backend/requirements.txt` a:

```yaml
      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt
```

**Por qué:** `pytest` y `ruff` se mudan a `requirements-dev.txt` en D5; si el CI sigue instalando solo runtime, los jobs fallan por comando ausente. El job `tests` además necesita `pytest` explícitamente.

**Por qué el job `frontend` no se toca:** instala Node con `npm ci` y corre `lint`/`tsc`/`build`/`test:run` en `frontend/`; no tiene ningún paso de Python ni de requirements. Tocarlo sería ruido y riesgo sin beneficio.

**Tradeoff:** el CI instala dos archivos en lugar de uno; el costo es un pip resuelve más, ya cacheado por `cache: pip`.

### D8 — El servicio `web` de C-13 no se rompe

`web` conserva `build.context: frontend`, `ports: "8080:80"` y `depends_on: api`. Como `api` ahora se construye desde la raíz, hay que confirmar que `docker compose config --services` siga devolviendo exactamente `postgres`, `api` y `web`, y que `GET http://localhost:8080/api/health` devuelva 200 a través de nginx.

**Por qué se verifica y no se asume:** un `build:` mal anidado en `api` (por ejemplo dejar `build: backend` y agregar `dockerfile:` al lado) no falla en `docker compose config` con un error obvio y puede dejar el servicio `web` apuntando a un `api` que no arranca. La verificación explícita de ambos hechos es la evidencia que cierra la task 5.2 de C-13.

**Alternativa descartada:** mover `web` a depender de `postgres` para que "no moleste" — cambia el contrato de C-13 sin necesidad.

### D9 — Solo el docstring de `backend/app/main.py`

Reemplazar `"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""` por una descripción real: app FastAPI que expone `/health` y monta los routers de turnos, agenda, catálogo, lista de espera, historia clínica, caja, RBAC, export, recordatorios y reserva online, los cuales usan SQLAlchemy y la base vía `DATABASE_URL`.

**Por qué:** el docstring es documentación de contrato engañosa — describe una app de un solo endpoint que ya no existe. `ruff` ya pasa con el texto actual, así que la corrección es de veracidad, no de lint; por eso la verificación combina revisión del texto y `ruff check backend/` en verde para probar que no se rompió el archivo.

**Tradeoff:** ninguno. Cambio de una línea, sin efecto en runtime.

## Preguntas abiertas (con default propuesto)

> Ninguna de estas bloquea el diseño: todas tienen un default y se resuelven con evidencia durante apply. Se dejan explícitas en lugar de decidirlas en silencio.

### Q1 — Versión única de Python para el Dockerfile y el CI

**Situación:** hoy el `Dockerfile` y los dos jobs Python del CI usan `3.12`. Los pins de referencia de `CHANGES.md` se midieron en `3.13`. El `.venv` local está en `3.14.4`. El README declara probados 3.12 y 3.13.

**Default propuesto: `3.13`** (`FROM python:3.13-slim` y `python-version: "3.13"` en los jobs `tests` y `lint`).

**Justificación:** los pins de referencia se midieron ahí; el README ya lo declara probado; y el cambio son dos archivos con una línea cada uno. Quedarse en 3.12 exige re-medir todos los pins en 3.12 y contradice la referencia existente. Pasar a 3.14 significa que ni la referencia ni el README cubren esa versión.

**Condición:** el venv de medición se crea con `py -3.13 -m venv $env:TEMP\venv-medicion` para que `pip freeze` coincida con la imagen y con el CI, sin dejar artefactos en el repo. Si se usa 3.14 (el `.venv` de la raíz), los pins medidos no representan lo que instala la imagen.

**Qué lo resuelve:** ejecutar la medición con `py -3.13` en apply y confirmar que `pytest -rs backend/tests` y `ruff check backend/` pasan con esos pins; si el `.venv` existente se reutiliza, se reporta la versión usada y se re-mide en 3.13 antes de pinear.

### Q2 — Pins exactos de las dependencias

**Situación:** los valores de `CHANGES.md` (`fastapi==0.143.0`, `sqlalchemy==2.1.4`, `alembic==1.20.0`, `psycopg[binary]==3.3.6`, `uvicorn==0.54.0`, `httpx==0.28.1`, `tzdata==2026.5`, `pytest==9.1.1`, `ruff==0.17.0`) son **referencia**, no definitivos.

**Default propuesto: re-medir y pinear todo desde `pip freeze`**, sin copiar la referencia a ciegas.

**Justificación:** un pin copiado sin medir puede no existir en PyPI para la versión de Python elegida, o arrastrar una dependencia transitiva distinta a la que resolvió el entorno medido. Si algún pin no existe o no resuelve para la versión elegida en Q1, se reporta con el error real y se ajusta **con evidencia**, no por conveniencia.

**Qué lo resuelve:** `pip install` en venv limpio + `pip freeze` + suite y lint en verde, registrando el `pip freeze` completo en las notas de apply.

### Q3 — Cómo se pasa `DATABASE_URL` a `api` y cómo convive con `POSTGRES_PORT`

**Default propuesto:**

```yaml
DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-odontologia}:${POSTGRES_PASSWORD:-odontologia}@postgres:5432/${POSTGRES_DB:-turnos}
```

El nombre de servicio `postgres` y el puerto interno `5432` son literales; `POSTGRES_PORT` queda **fuera** de esa URL y solo mueve el mapeo host→contenedor.

**Justificación:** el caso concreto del README §3 es el PostgreSQL de Windows ocupando 5432 en el host, con el contenedor publicado en 5433. Si la URL interna usara `POSTGRES_PORT`, `api` intentaría `postgres:5433` dentro de la red y fallaría.

**Qué lo resuelve:** `docker compose config` con y sin `POSTGRES_PORT` seteado, comprobando que el `DATABASE_URL` de `api` no cambia entre las dos corridas mientras el mapeo de `postgres` sí.

### Q4 — `WORKDIR` de la imagen y `script_location` de `backend/alembic.ini`

**Default propuesto:** `WORKDIR` = `/code` (root del repo). `script_location` **no se modifica**: verificado como `%(here)s/alembic`, que ya resuelve desde cualquier `WORKDIR` mientras `backend/alembic/` esté al lado del ini (D3).

**Justificación:** `/code` es el único punto de partida donde `import backend.app.*` y `-c backend/alembic.ini` funcionan sin `PYTHONPATH` ni rutas especiales, y coincide con el host.

**Qué lo resuelve:** `docker compose exec api python -m alembic -c backend/alembic.ini current` sin error de `script_location`. **Si `%(here)s` no resolviera dentro de la imagen**, se ajusta `script_location` a la ruta que funcione y se registra la evidencia en las notas de apply — no se cambia de antemano.

### Q5 — ¿`api` corre migraciones al arrancar (entrypoint) o solo manualmente?

**Default propuesto: NO migrar en el arranque.** La migración queda explícita (`docker compose exec api python -m alembic -c backend/alembic.ini upgrade head`).

**Justificación:** C-23 es reproducibilidad de la imagen, no orquestación de despliegue. Un entrypoint que migra acopla el arranque a la base, esconde fallos (el contenedor reinicia en loop en lugar de exponer el error) y crea carrera cuando hay más de una réplica. El camino explícito además es el que el README ya documenta desde el host y el que necesita el operador para hacer `downgrade -1` a mano.

**Qué lo resuelve:** si más adelante se pide despliegue real, se decide en un change propio (con gobernanza más alta que BAJO).

### Q6 — `httpx` en runtime o en dev

**Situación:** `CHANGES.md` lista `httpx` entre los pins de referencia sin clasificarlo como runtime ni como dev. Hoy vive en `backend/requirements.txt`, mezclado con las dependencias de la imagen.

**Default propuesto: `backend/requirements-dev.txt`.**

**Justificación:** `httpx` es la dependencia que usa `TestClient` de `fastapi.testclient` en los tests de API, no un import del runtime; el requisito de la spec es que la imagen instale solo runtime. La evidencia que confirma o refuta el default es la medición de la **task 4.2** (búsqueda de `httpx` en `backend/app/`), que es también la que se reporta en apply: acá no se adelantan cifras.

**Qué lo resuelve:** la task 4.2 con `Get-ChildItem -Recurse backend/app -Include *.py | Select-String -Pattern "httpx"` (0 coincidencias esperadas) y la task 4.5, que comprueba que `httpx` no está instalado en la imagen. Si la medición mostrara algún import en `backend/app/`, se mueve a runtime, se registra la evidencia y se ajusta la spec.

**Qué se pierde si el default es incorrecto:** un import de `httpx` en runtime aparecería recién al ejercitar ese endpoint en el contenedor, no en el build. Por eso la medición tiene que quedar registrada en apply y no darse por hecha acá.

## Risks / Trade-offs

- **Contexto de build grande y builds lentos** → `.dockerignore` de la raíz (D4) es parte del change, no un extra; se verifica con seis patrones antes de construir.
- **Cambiar el contexto de `api` puede romper el servicio `web` de C-13 sin error visible** → verificación explícita de `docker compose config --services` (debe dar tres servicios) y de `GET http://localhost:8080/api/health` → 200 (D8). Es la evidencia que cierra la task 5.2 de C-13.
- **Pins medidos en una versión de Python distinta a la de la imagen y el CI** → Q1 fija una sola versión (default 3.13) y Q2 exige medir en esa versión; si se reutiliza el `.venv` de 3.14 los pins no representan la imagen.
- **Un pin inexistente en PyPI frena el build sin explicación clara** → Q2 obliga a reportar el error real y ajustar con evidencia antes de seguir; nunca se "arregla" bajando el pin sin registrar por qué.
- **`%(here)s` podría no resolver en la imagen** → D3/Q4: se verifica con `alembic current` dentro del contenedor antes de dar la migración por buena; contingencia registrada.
- **La imagen incluye `backend/tests/`** → costo de tamaño aceptado (D2); no se intenta separar `app` de `tests` en este change.
- **Riesgo de fuga de credenciales al migrar a `${VAR}`** → los defaults siguen siendo ficticios (`odontologia`), `.env.example` no lleva valores reales y se verifica con `git grep -n -i "password"` que no aparezca nada más que defaults ficticios y `${VAR}`.
- **Cambiar `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` con un volumen `pgdata` ya inicializado no tiene efecto** → Postgres aplica esas variables solo al inicializar el volumen; con un `pgdata` existente conserva las credenciales y la base viejas, así que `api` falla la autenticación (o la base pedida no existe) aunque `docker compose config` muestre los valores nuevos. Remedio documentado: `docker compose down -v` y volver a levantar, **solo con datos ficticios**. Se documenta en el README (task 8.3) y se anota en la task 5.5.
- **El puerto 8000 del host puede estar ocupado por un `uvicorn` local del paso 5 del README** → la verificación de `/health` directo a `api` debe hacerse con el `uvicorn` del host detenido; si `curl.exe` del host no está disponible, se usa `docker compose exec api python -c "..."`, que prueba lo mismo desde adentro.

## Migration Plan

1. **Orden de aplicación** (en la rama `feature/c-23-fix-api-contenedor`): `.dockerignore` de la raíz → `backend/Dockerfile` → `backend/requirements.txt` + `backend/requirements-dev.txt` → `docker-compose.yml` (+ `.env.example`) → docstring de `backend/app/main.py` → `.github/workflows/tests.yml` → `README.md`. Los primeros tres son los que hacen arrancar el contenedor; el orden permite construir y verificar antes de tocar documentación.
2. **Rollback:** los cambios son de infraestructura y no tocan datos ni migraciones. Revertir los archivos versionados (`git revert` del commit del change) y reconstruir con `docker compose build --no-cache api` restaura el estado anterior. **La base no se toca**: no hay migración nueva, así que `alembic downgrade` no hace falta para revertir el change.
3. **Efecto en el entorno del desarrollador:** la primera construcción después del cambio no reutiliza caché (contexto distinto). Quien hoy corre `uvicorn` desde el host puede seguir haciéndolo: el change no lo prohíbe ni cambia rutas del host.
4. **Efecto en el CI:** los jobs `tests` y `lint` instalan un archivo más. Si el split de D5 se aplica sin D7, el CI se pone rojo por `pytest`/`ruff` ausentes; por eso ambos van en el mismo commit.
5. **Cierre de C-13 task 5.2:** la evidencia (`config --services` con tres servicios y `/api/health` en 200 vía `web`) se pega en el `tasks.md` de C-23. El archivo archivado de C-13 **no se edita**.

## Governance

BAJO (declarado en `CHANGES.md`). No hay cambios de dominio, ni de esquema, ni de contratos HTTP. Dependencia única: C-03 (archivado).

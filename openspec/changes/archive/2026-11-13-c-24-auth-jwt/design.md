## Context

Hoy `get_permission_context` (`backend/app/rbac/context.py`) arma la identidad desde el header `X-Actor-Rol` y, si falta, usa `recepcion`. Esto contradice el stack del profesor (JWT). Este change reemplaza ese mecanismo por login y JWT, solo en backend.

Marca de confianza: lo que figura abajo como [NO VERIFICADO] salió del borrador anterior o de la revisión externa y no se leyó en el repo. La tarea 0.1 lo lee y lo registra en la sección "Hechos verificados" al final de este archivo, antes de escribir código.

## Goals / Non-Goals

**Goals**

- Que ninguna ruta protegida acepte identidad que no venga de un JWT firmado por el servidor.
- Que `SECRET_KEY` débil o ausente impida arrancar la app.
- Que la verificación de contraseñas no agregue dependencias.

**Non-Goals**

- Pantalla de login, cliente HTTP del frontend, refresh, logout, revocación, gestión de usuarios por API, Redis, RS256.

## Decisions

### Q-C24-01: tabla de usuarios y relación con `UsuarioSucursal`

- **Default:** tabla propia `usuarios` (plural, como `roles`; estilo de nombres y tipo de id de las tablas existentes confirmados en 0.1). Columnas: `id`, `dni` único, `password_hash`, `rol_id` con FK a `roles` (RESTRICT), `activo`, `creado_en`. `usuarios.rol_id` es la fuente de verdad del rol del usuario y del claim `rol` en el token emitido.
- **Sucursal:** la fuente de sucursales es `UsuarioSucursal` (tabla `usuarios_sucursal`: `usuario` texto libre, `rol_id`, `sucursal_id` NOT NULL, `activo`), unida por `usuarios.dni = usuarios_sucursal.usuario`. El campo `rol_id` de `usuarios_sucursal` NO se utiliza para autenticar ni determina el rol del token (queda documentado como límite del modelo).
- **Costo de la alternativa** (reutilizar `UsuarioSucursal` como tabla de usuarios): mezcla credenciales con una asociación que se describió como histórica, y obligaría a una migración sobre una tabla de C-11 ya archivado.
- **Por qué el default:** aísla las credenciales y la migración solo crea una tabla.

### Q-C24-02: hash de contraseña

- **Decisión:** `hashlib.pbkdf2_hmac` con SHA-256, sal aleatoria por usuario (`secrets.token_bytes`) y comparación con `hmac.compare_digest`.
- **Formato almacenado:** un solo texto con el prefijo del esquema, las iteraciones, la sal y el hash codificados, para poder subir las iteraciones sin invalidar hashes viejos. Las iteraciones son una constante del código (valor inicial 600000, [NO VERIFICADO] hasta confirmar en la tarea 1.2 contra la recomendación vigente). Los tests la reemplazan con `monkeypatch` para no hacer lenta la suite.
- **Usuario inexistente:** el login calcula igual un hash contra una sal de relleno para que el tiempo de respuesta no delate si el DNI existe.
- **Costo de la alternativa** (bcrypt o argon2): dependencia nueva con compilación nativa en Docker, a cambio de mejor resistencia a hardware especializado. Para el alcance del TP no compensa.

### Q-C24-03: librería JWT, algoritmo y clave

- **Decisión:** `PyJWT==2.10.1` en `backend/requirements.txt`. [NO VERIFICADO] la condición de la versión con más de dos semanas de antigüedad se confirma en la tarea 1.2. No existe `jwt` en la librería estándar.
- **Algoritmo:** HS256, constante en el código. No se lee de variable de entorno. `jwt.decode` recibe siempre `algorithms=["HS256"]` y exige los claims `sub`, `rol` y `exp`. Aceptar la lista de algoritmos desde el entorno abre ataques de degradación (por ejemplo `none`).
- **Clave:** `SECRET_KEY` obligatoria. La app no arranca si falta, está vacía, es el valor de ejemplo actual del `.env.example` (`cambiar-en-produccion-solo-env`, 30 caracteres) o tiene menos de 32 caracteres. La validación ocurre al construir la configuración, antes de aceptar requests. Compose, CI y tests usan un valor ficticio de 32 o más caracteres.
- **Costo de RS256:** par de claves y su distribución, sin beneficio mientras un único servicio emite y valida.

### Q-C24-04: duración y refresh

- **Decisión:** sin refresh. La duración se lee de `ACCESS_TOKEN_EXPIRES_MIN`.
- **Default:** 60 minutos, configurable (`ACCESS_TOKEN_EXPIRES_MIN`). Con 15 minutos y sin refresh, el usuario tendría que volver a loguearse cuatro veces por hora. Con 60 la ventana de uso de un token robado es mayor, y como no hay revocación en este change, esa ventana es lo único que lo limita. El usuario inactivo se corta antes porque la validación consulta la base (ver más abajo).
- **Costo de agregar refresh:** otra tabla o almacén, rotación y revocación; es un change aparte.

### Q-C24-05: eliminar `X-Actor-Rol` y `X-Actor-Usuario`

- **Decisión:** se eliminan, junto con el default `recepcion`. Sin token válido, 401, salvo en las rutas públicas de C-07 y C-08. Sin período de transición.
- **Costo de la alternativa** (convivencia con el header): deja el agujero abierto, porque cualquiera sin token elige su rol y el JWT no protege nada.
- **Costo de la decisión:**
  - Tests: los que dependen del header explícito o del default `recepcion` deben autenticarse con token. Conteo de la revisión externa: 8 archivos y 31 líneas con el header explícito; los que dependen del default no están contados. La tarea 0.4 remide ambos y se registra en "Hechos verificados".
  - Frontend: el cliente de C-13 envía el header y recibirá 401 hasta el change siguiente.

### Q-C24-06: sucursal

- **Decisión:** `sucursal_id` sale del token y se valida contra la base. `X-Sucursal-Id` deja de leerse. El claim es opcional.
- **Cómo se obtiene al hacer login** (a partir de asociaciones activas en `UsuarioSucursal` unidas por `usuarios.dni = usuarios_sucursal.usuario` con `activo = True`):
  - Cero asociaciones activas (por ejemplo un rol que opera sin sucursal o admin general): el token no lleva `sucursal_id` y el contexto queda sin sucursal (sin filtro por sucursal).
  - Una sola asociación activa: se usa automáticamente esa sucursal en el token.
  - Varias asociaciones activas: el body de `/login` debe indicar `sucursal_id` y se valida que pertenezca a las asociaciones activas del usuario; si falta o no corresponde, 422.
- **Validación por request:** el usuario existe y está activo en `usuarios`, y si el token trae `sucursal_id`, sigue teniendo una asociación activa con esa sucursal en `UsuarioSucursal`. La validación de rutas protegidas consulta la base siempre vía `get_sucursal_session` (que pasa a abrir sesión incondicionalmente para verificar identidad y sucursal).
- **Costo:** un usuario con varias sucursales debe volver a loguearse para cambiar de sucursal.

### Q-C24-07: rutas públicas

- **Default:** `/confirmar`, `/cancelar` (C-07) y `GET /reservar/{profesional}`, `POST /reservar` (C-08) siguen sin autenticación. `POST /login` también es público. Costo de la alternativa: romper el flujo del paciente, que no tiene usuario.
- **Inventario pendiente:** [NO VERIFICADO] el inventario completo de rutas públicas (incluyendo `/health`, `/docs` y `/openapi.json`) se hace en la tarea 0.1; los escenarios de esta spec cubren solo los de C-07, C-08 y `POST /login`.

### Q-C24-08: seed

- **Default:** el seed crea un usuario ficticio (DNI `USUARIO-FICT-001`, rol existente y sucursal si corresponde) solo con `SEED_FICTICIO=true`. La contraseña sale de `SEED_USUARIO_PASSWORD`; si no está definida, el seed genera una al azar con `secrets.token_urlsafe` y la imprime una sola vez. El repo no contiene ninguna contraseña. Los tests crean sus usuarios con contraseñas generadas en el propio test.
- **Admin para pruebas:** el usuario del seed debe permitir probar rutas de administración; la elección de rol (admin u otra) se cierra en la tarea 0.2 y se registra acá.
- **Dónde corre:** el seed expone una función. No se fija un comando de consola hasta leer `backend/app/seed` (en 12.2 el seed suelto ya fallaba y se corría con un `python -c`; [NO VERIFICADO] que `python -m backend.app.seed` exista).
- **Costo de la alternativa** (contraseña fija en el seed): credencial conocida en un repo público.

### Q-C24-09: rate limit del login

- **Decisión:** por IP, reutilizando el patrón de C-08 (`request.client.host` en `backend/app/reserva_online/router.py`). El rate limit cuenta únicamente intentos fallidos dentro de la ventana de tiempo. El límite y la ventana son configurables, y su valor por defecto se fija en la tarea 0.1 tras leer el rate limit de C-08. Los logins exitosos no cuentan para el límite. Al superarse el límite de intentos fallidos, el endpoint responde 429 y no se evalúan las credenciales. En memoria: se reinicia con el proceso y no se comparte entre procesos; ese reinicio es un límite documentado, no un comportamiento testeable.
- **PREGUNTA ABIERTA:** detrás del proxy nginx de C-13 (`frontend/nginx.conf`, que no agrega cabeceras `X-Forwarded-For`), la IP detectada puede ser la del proxy, por lo que múltiples clientes que comparten la misma IP pueden verse afectados si uno de ellos genera fallos repetidos hasta alcanzar el 429. Opciones a evaluar:
  1. Utilizar una clave combinada de IP + DNI para el rate limit.
  2. Documentarlo como límite del entorno con proxy reverso en memoria y mantener la clave por IP.
- **Costo:** protege contra fuerza bruta casual, no contra un atacante distribuido ni contra varios workers.

### Q-C24-10: 401

- **Decisión:** token ausente, inválido o expirado responde 401 con `detail.causa` y `detail.detalle` y el header `WWW-Authenticate: Bearer`. Esto reemplaza la regla "nunca 401" de C-11, por lo que la spec lleva `## MODIFIED Requirements` sobre los requisitos de la capability de roles que la contradicen, con los textos reales de `openspec/specs/` (tarea 0.3).
- **Forma de errores confirmada:** no hay `exception_handler` personalizado; FastAPI serializa excepciones de `HTTPException` directamente como `{"detail": {"causa": ..., "detalle": ...}}`. Los escenarios del spec utilizan `detail.causa` y `detail.detalle`.

### Q-C24-11: alcance

- **Decisión:** solo backend (confirmada). La pantalla de login y el cliente HTTP quedan en un change siguiente, sin número asignado. Así no se toca `frontend/` (C-13, PR #38) y C-24 se verifica solo con pytest.

## Architecture

### Login

1. El cliente envía DNI y contraseña a `POST /login`. Se valida `dni` hasta 32 caracteres y `password` hasta 128 caracteres ([NO VERIFICADO] 128 caracteres como decisión por confirmar; 32 caracteres de DNI coincide con C-08); si se supera el máximo, responde 422 sin calcular hash.
2. Se aplica el rate limit por IP.
3. Se busca el usuario por DNI. Si no existe o la contraseña no coincide, 401 con el mismo cuerpo en ambos casos.
4. Si las credenciales son correctas y el usuario está inactivo, 403.
5. Se resuelve la sucursal (Q-C24-06) y se emite el token.

### Forma del token

JWT firmado con HS256, tres segmentos separados por puntos. El payload lleva `sub` (id del usuario como string, cumpliendo la validación de PyJWT), `rol`, `sucursal_id` (opcional), `iat` y `exp`. El cuerpo de la respuesta de login lleva el token, el rol, el usuario (DNI) y, si corresponde, la sucursal. En `PermissionContext`, `usuario` toma el `dni` del usuario autenticado y el `Literal` de `origen` pasa a `"jwt"`.

### Validación en `get_permission_context`

1. Leer el header `Authorization: Bearer ...` con `HTTPBearer(auto_error=False)` de `fastapi.security` (el `auto_error=False` deja a la app responder el 401 propio con `detail.causa` y `detail.detalle` y hace que Swagger muestre el botón Authorize). Si falta o tiene otro formato: 401.
2. Decodificar con PyJWT, algoritmo fijo y claims obligatorios (`sub`, `rol`, `exp`). El claim `sub` contiene el id de usuario (string, cumpliendo la validación estándar de `sub` como string de PyJWT); `context.usuario` toma el `dni` del usuario autenticado; el `Literal` de origen pasa a `"jwt"`. Firma inválida: 401. Expirado: 401 con causa distinta. Faltan claims: 401.
3. Consultar la base (Q-C24-06). Para validar usuario y sucursal, `get_sucursal_session` (en `backend/app/rbac/context.py`) pasa a abrir una sesión SQLAlchemy siempre en cada request protegida (a diferencia de C-11 donde sin `X-Sucursal-Id` devolvía `None`). Se mantiene el nombre `get_sucursal_session` para preservar la compatibilidad con los tests existentes que la sobreescriben (`app.dependency_overrides[get_sucursal_session] = lambda: db_session`). Usuario inexistente o inactivo, rol del token distinto del rol actual del usuario, o sucursal no asociada: 401.
4. Devolver el contexto con `origen="jwt"`, `rol` del token, `usuario = dni` y `sucursal_id` correspondiente.
5. El 403 por falta de permiso sigue saliendo de `Depends(require_permission(...))` y `require_admin()`, sin cambios, respondiendo `detail.causa = "permiso_denegado"`.

### Migración 009

Revisión nueva con `down_revision = "008_recordatorio"` ([NO VERIFICADO] que sea el head actual; se confirma en 0.1). `upgrade` crea la tabla de usuarios y su índice único en `dni`. `downgrade` la elimina. No inserta datos. Se verifica reversibilidad (bajar una revisión y volver a subir), no idempotencia.

### Configuración

| Variable | Uso | Observación |
|----------|-----|-------------|
| `SECRET_KEY` | firma del JWT | obligatoria; valor de ejemplo de `.env.example` (`cambiar-en-produccion-solo-env`) y claves < 32 chars rechazadas |
| `ACCESS_TOKEN_EXPIRES_MIN` | minutos de validez | default 60 |
| `SEED_USUARIO_PASSWORD` | contraseña del usuario ficticio | opcional; vacía en `.env.example` |

No hay variable de algoritmo ni de refresh.

- **docker-compose.yml:** C-23 está mergeado en main (commit 298d54e, PR #41) y dejó variables con defaults ficticios. Quitar cualquier suposición sobre cómo queda `SECRET_KEY` (por ejemplo un valor por defecto) y marcar [NO VERIFICADO] hasta leer el compose en la tarea 0.1. Tener en cuenta que un patrón `${VAR:?}` podría hacer fallar `docker compose up -d postgres` y se prueba en 0.1.

## Risks / Trade-offs

- La suite existente se rompe al eliminar el header y hay que migrarla; es el costo principal del change.
- El rate limit en memoria no cubre varios procesos.
- Una consulta a la base por request protegida.
- Entre el merge de C-24 y el change de frontend, las pantallas que dependen de rol no funcionan.
- El change de frontend (login y cliente HTTP) necesita número propio y debe quedar como dependencia de C-14; se registra en la rama `docs/rev-11`. No se inventa el número aquí.

## Hechos verificados

1. **Tablas y modelos (`backend/app/*/models.py`):**
   - No hay un `models.py` central en `backend/app/`; cada dominio tiene su submódulo `models.py`.
   - `backend/app/rbac/models.py` define:
     - `Rol`: tabla `roles`, PK `id: uuid.UUID`, `nombre: String(100)` único, `descripcion: Text | None`, `activo: bool`, `creado_en: datetime`.
     - `Sucursal`: tabla `sucursales`, PK `id: uuid.UUID`, `nombre: String(200)` único, `direccion: Text | None`, `activo: bool`, `creado_en: datetime`.
     - `UsuarioSucursal`: tabla `usuarios_sucursal`, PK `id: uuid.UUID`, `usuario: String(200)` (texto libre, DNI del usuario), `rol_id: uuid.UUID` (FK `roles.id`, RESTRICT), `sucursal_id: uuid.UUID` (FK `sucursales.id`, RESTRICT), `activo: bool`, `creado_en: datetime`. Unique constraint `(usuario, sucursal_id)`.
   - La nueva tabla de usuarios `usuarios` usará PK `id: uuid.UUID`, `dni: String(32)` único, `password_hash: Text`, `rol_id: uuid.UUID` (FK `roles.id`, RESTRICT), `activo: bool`, `creado_en: datetime`.
2. **Head de Alembic:**
   - La última migración en `backend/alembic/versions/` es `008_recordatorio.py` (`down_revision = '007_roles_sucursales'`).
   - La migración de C-24 será `009_auth_usuarios.py` con `down_revision = '008_recordatorio'`.
3. **Seed (`backend/app/seed/catalogo.py`):**
   - El seed se ubica en `backend/app/seed/catalogo.py` con la función `seed_catalogo(session) -> dict`. No existe `python -m backend.app.seed`.
   - Responde a la variable de entorno `SEED_FICTICIO=true`.
   - La función nueva de seed de usuario se ubicará en `backend/app/seed/` y será invocable como función Python idempotente.
4. **Rate limit de C-08 (`backend/app/reserva_online/router.py`):**
   - Implementado en `_verificar_rate_limit(request: Request)` usando `_RATE_LIMIT: dict[str, list[float]] = {}`.
   - Lee `ip = request.client.host if request.client else "unknown"`.
   - Variables de entorno: `RESERVA_RATE_LIMIT_N` (default `5`), `RESERVA_RATE_LIMIT_VENTANA_SEG` (default `600`).
   - `frontend/nginx.conf` realiza un simple `proxy_pass http://api:8000/;` sin directivas `proxy_set_header X-Forwarded-For`, por lo que la IP vista por FastAPI detrás de nginx es la del contenedor.
5. **Esquema de tests y base de datos (`backend/tests/conftest.py`):**
   - La suite ejecuta migraciones Alembic vía `command.upgrade(Config(ini), "head")` sobre la base de tests configurada.
6. **Forma de serialización de errores:**
   - No hay `add_exception_handler` en `main.py`. FastAPI responde `HTTPException` con payload `{"detail": {"causa": "...", "detalle": "..."}}`.
   - En C-11, las denegaciones devuelven HTTP 403 con `detail.causa = "permiso_denegado"`.
7. **Inventario de rutas:**
   - **Públicas:** `POST /confirmar/{token}` y `POST /cancelar/{token}` (`recordatorios`), `GET /reservar/{profesional}` y `POST /reservar` (`reserva_online`), `GET /health` (`main.py`), y la nueva `POST /login`. Las rutas automáticas `/docs` y `/openapi.json` de FastAPI no requieren autenticación.
   - **Nota sobre `/lista-espera/{id}/responder`:** es invocada con el body `RespuestaPaciente(acepta: bool)`. No utiliza decorador de autenticación ni dependencias de rol (`PermissionContext`).
   - **Protegidas:** endpoints de `agenda`, `caja`, `export` (`GET /export`), `hc`, `lista_espera` (alta y oferta), `rbac`, `turnos` y `catalogo-recursos` (`pacientes`, `profesionales`, `sillones`, `prestaciones`, `horarios-atencion`, `bloqueos`).
8. **Medición de tests existentes (0.4):**
   - Archivos de tests que mencionan explícitamente `X-Actor-Rol`, `X-Actor-Usuario` o `X-Sucursal-Id`: 8 archivos (`test_caja_roles_api.py`, `test_export_api.py`, `test_multisucursal_aislamiento.py`, `test_rbac_contexto.py`, `test_reserva_api.py`, `test_roles_api.py`, `test_sucursales_api.py`, `test_usuarios_sucursal_api.py`).
   - Líneas totales que contienen estos headers en tests: 42 líneas (control positivo: 12 líneas en `backend/app`).
   - Coincidencias exactas de `X-Actor-Rol` en tests: 31 ocurrencias.
9. **Configuración de docker-compose y CI:**
   - `docker-compose.yml`: el servicio `api` utiliza `DATABASE_URL` y `TZ`. No tiene `SECRET_KEY` configurada actualmente.
   - `.github/workflows/tests.yml`: define el servicio `postgres:16` y variables `TZ` y `DATABASE_URL`. No define `SECRET_KEY`.
   - `.env.example`: línea 11 define `SECRET_KEY=cambiar-en-produccion-solo-env` (30 caracteres). No contiene `REFRESH_TOKEN_EXPIRES_D`.

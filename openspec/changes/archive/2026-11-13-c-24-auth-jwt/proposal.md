## Why

El stack impuesto por el profesor incluye JWT para autenticación y el proyecto no lo implementa. Hoy la identidad llega por el header `X-Actor-Rol` (C-11), que nadie verifica: cualquier cliente puede enviar `X-Actor-Rol: admin` y actuar como administrador, y si no envía nada actúa como `recepcion`. C-11 lo archivó como supuesto de implementación y no como control de seguridad.

Hechos de partida (a reconfirmar en la tarea 0.1 con lectura del repo):

- No existe tabla de usuarios con credenciales: `models.py` tiene `Rol`, `Sucursal` y `UsuarioSucursal`.
- `backend/requirements.txt` no tiene librería JWT. El hash de contraseña se resuelve con la librería estándar de Python.
- La KB menciona JWT en `02_descripcion_general.md`, `08_arquitectura_propuesta.md`, `09_decisiones_y_supuestos.md` y `10_preguntas_abiertas.md` (Q6). Los números de línea se verifican con `Select-String` antes de citarlos.
- Las rutas públicas de C-07 (`/confirmar`, `/cancelar`) y C-08 (`/reservar`) no llevan login y siguen así.

## What Changes

- **BREAKING:** se eliminan los headers `X-Actor-Rol`, `X-Actor-Usuario` y `X-Sucursal-Id`, y el rol por defecto `recepcion` / `default_compatibilidad`. Sin token válido, toda ruta protegida responde 401 y la sucursal sale del token y se valida contra la base; el `Literal` de `origen` pasa a `"jwt"`. No hay período de transición.
- Tabla nueva de usuarios con hash de contraseña, con migración 009 sobre `008_recordatorio`. La migración solo crea la tabla.
- Endpoint `POST /login` que recibe DNI y contraseña y emite un JWT firmado con HS256. Tiene rate limit por IP, en memoria, reutilizando el patrón de C-08.
- Validación del JWT en `get_permission_context` (rbac), con 401 y cuerpo `causa` y `detalle` para token ausente, inválido o expirado.
- Hash de contraseña con `hashlib.pbkdf2_hmac`, sal por usuario y `hmac.compare_digest`. Sin dependencia nueva para esto.
- Dependencia nueva `PyJWT` fijada con `==` en `backend/requirements.txt`. El algoritmo se fija en el código y la app no arranca si `SECRET_KEY` falta, es el valor de ejemplo del `.env.example` (`cambiar-en-produccion-solo-env`) o tiene menos de 32 caracteres. Compose, CI y tests usan un valor ficticio de 32 o más caracteres.
- Seed de usuario ficticio en el seed (no en la migración), idempotente y sin contraseñas escritas en el repo.
- `SECRET_KEY` y la duración del token en `.env.example`, `docker-compose.yml` y el job de CI (valor ficticio), y documentación en el README.
- Los tests existentes se adaptan para autenticarse con token en vez de enviar el header.

## Capabilities

### New Capabilities

- `auth-jwt`: login, emisión y validación de JWT, tabla de usuarios con hash de contraseña, configuración segura de la clave y seed ficticio.

### Modified Capabilities

- `rbac`: cambia la identidad por header, el default `recepcion` / `default_compatibilidad` y la regla "nunca 401".
- `caja-pagos`: cambia la identidad por header y el default `recepcion`.
- `multisucursal`: cambia el contexto de identidad (el `Literal` de origen pasa a `"jwt"`) en los escenarios que usan `X-Sucursal-Id`.
- `reserva-online`: solo de redacción (menciona el header).

## Impact

- **Backend:** `rbac/context.py`, `rbac/router.py` (comentario "never 401"), `rbac/models.py` o `models.py`, módulo nuevo de autenticación, `seed`, migración 009, configuración.
- **Tests:** los 755 tests actuales dependen en distinta medida del header y del default. El conteo de la revisión externa fue 8 archivos y 31 líneas con el header explícito; se remide en la tarea 0.4 junto con los que dependen del default.
- **Frontend (fuera de alcance):** el cliente HTTP de C-13 envía `X-Actor-Rol` y recibirá 401 en las rutas protegidas hasta que se haga el change siguiente de frontend. Ese change (pantalla de login y cliente HTTP con `Authorization`) queda anotado sin número asignado. Este change no toca `frontend/`. La spec `frontend-foundation` (cabecera `X-Actor-Rol`) queda desactualizada y la modifica el change de frontend, no C-24.
- **Configuración:** `SECRET_KEY` pasa a ser obligatoria. Variables nuevas para duración del token y contraseña del seed.
- **Documentación:** README, y la fila Auth de `AGENTS.md` y `CLAUDE.md` (idénticos) se actualiza al archivar.

## Fuera de alcance

- Pantalla de login y cliente HTTP del frontend (change siguiente).
- Refresh token, logout y revocación de tokens.
- Alta, baja y edición de usuarios por API.
- Redis y algoritmos asimétricos (RS256).

## Preguntas abiertas y decisiones

Cada una tiene su desarrollo (default, costo de la alternativa y motivo) en `design.md`.

- Q-C24-01, tabla de usuarios y relación con `UsuarioSucursal`: default, tabla propia con FK a roles. Abierta hasta leer `UsuarioSucursal` (tarea 0.2).
- Q-C24-02, hash: decidida, `pbkdf2_hmac` de la librería estándar.
- Q-C24-03, JWT: decidida, PyJWT fijado con `==`, HS256 en el código, arranque bloqueado sin clave real.
- Q-C24-04, duración y refresh: decidida, sin refresh. Default de duración 60 minutos, configurable.
- Q-C24-05, `X-Actor-Rol`: decidida, se elimina sin transición.
- Q-C24-06, sucursal: decidida, sale del token y se valida contra la base. El detalle depende de `UsuarioSucursal` (tarea 0.2).
- Q-C24-07, rutas públicas de C-07 y C-08: default, siguen públicas.
- Q-C24-08, seed: default, contraseña desde variable de entorno o generada al azar.
- Q-C24-09, rate limit del login: decidida, por IP, patrón de C-08, en memoria.
- Q-C24-10, 401: decidida, `causa` y `detalle`, con MODIFIED sobre C-11.
- Q-C24-11, alcance: decidida, solo backend.

Convenciones: cada grupo sigue RED (los tests nuevos fallan por la razón correcta, a la vista), GREEN (mínimo para pasar) y suite completa. Los tests corren solo contra la base de tests, nunca contra `turnos`. Comando de la suite: `pytest backend/tests -p no:randomly -q --tb=short`. Los nombres de archivos de tests son propuestos y se ajustan a la estructura real leída en 0.1.

## 0. Lectura y medición (sin código)

- [x] 0.1 Leer `models.py` completo (con `UsuarioSucursal`, estilo y tipo de id de las tablas), `backend/app/seed` completo (incluida la variable `SEED_FICTICIO` y cómo se ejecuta), `rbac/context.py`, `rbac/router.py`, `rbac/permissions.py`, el rate limit de C-08, cómo se serializan los errores, `docker-compose.yml`, `.github/workflows/tests.yml`, el README, `knowledge-base/03_actores_y_roles.md` (sección de rutas públicas y roles) y el head de Alembic. Registrar lo leído en la sección "Hechos verificados" de `design.md`.
  - (i) Inventario de TODAS las rutas con su dependencia (pública, protegida con `get_permission_context`/`require_permission`, o sin protección), como tabla en la sección "Hechos verificados" de `design.md`.
  - (ii) Cómo obtiene la IP el rate limit de C-08 (patrón actual: `request.client.host` en `backend/app/reserva_online/router.py`) y si nginx (C-13) reenvía la IP.
  - (iii) Si la suite arma el esquema con Alembic o con `Base.metadata.create_all` (actualmente Alembic vía `backend/alembic.ini` → `upgrade head`, ver `backend/tests/conftest.py`).
  - (iv) Cómo quedó `docker-compose.yml` tras C-23 (variables con defaults ficticios; `[NO VERIFICADO]` cómo queda `SECRET_KEY`).
  - (v) Confirmar cómo serializa errores el proyecto y si el 403 actual de C-11 usa `detail.causa` igual a `permiso_denegado`; si no coincide, se corrige el spec ANTES de la tarea 1.1.
  Verificación: la sección "Hechos verificados" lista nombre y tipo de id de las tablas, columnas de `UsuarioSucursal`, head de Alembic, módulo y función del seed, valor del rate limit de C-08 y forma confirmada de serialización de errores. Comando del head: `alembic heads` con el comando de alembic del proyecto (confirmar en README o CI).
- [x] 0.2 Cerrar Q-C24-01 y Q-C24-06 con las columnas reales de `UsuarioSucursal`: cómo se une con el usuario, criterio de vigencia y si hace falta `sucursal_id` en la tabla de usuarios. Actualizar `design.md`.
  Verificación: `design.md` ya no tiene [NO VERIFICADO] en Q-C24-01 ni Q-C24-06.
- [x] 0.3 Ampliar y completar los deltas de las cuatro capabilities listadas como modificadas en el proposal (`rbac`, `caja-pagos`, `multisucursal`, `reserva-online`):
  - Para cada capability, listar con `Get-ChildItem openspec\specs` el nombre real de la carpeta correspondiente.
  - Buscar los requisitos afectados que contradigan la identidad por token, el fin de `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id`, el default `recepcion` o la nueva regla de 401. Buscar con: `Select-String -Path openspec\specs\*\spec.md -Pattern 'X-Actor|recepcion|401' -Encoding UTF8 | ForEach-Object { "$(Split-Path (Split-Path $_.Path -Parent) -Leaf):$($_.LineNumber): $($_.Line.Trim())" }`.
  - Crear o completar en `openspec/changes/c-24-auth-jwt/specs/<capability>/spec.md` la sección `## MODIFIED Requirements` con el texto completo y literal del requisito existente tomado de `openspec/specs/`.
  Verificación: chequeo por capability con `cmd /c "openspec validate c-24-auth-jwt --strict"` en verde, existencia de los archivos de delta para las cuatro capabilities y confirmación de que cada encabezado de MODIFIED coincide con un `### Requirement:` existente mediante `Select-String` sobre `openspec\specs`.
- [x] 0.4 Medir el impacto en los 755 tests. Con el header explícito: `Get-ChildItem backend\tests -Recurse -Filter *.py | Select-String -Pattern 'X-Actor-Rol|X-Actor-Usuario|X-Sucursal-Id' -Encoding UTF8 | Group-Object Path | Measure-Object` (archivos) y el mismo sin `Group-Object` (líneas). Control positivo: el mismo patrón sobre `backend\app` debe devolver coincidencias. Para los que dependen del default, listar los tests que llaman rutas protegidas sin enviar header. Registrar los conteos en `design.md`.
  - Línea base: conteo de tests pasados con `DATABASE_URL` apuntando a la base `turnos_test`, registrado en `design.md`; lo consumen las tasks 1.3 y 5.4.
  Verificación: los tres números (archivos, líneas, tests por default) figuran en "Hechos verificados".

## 1. Dependencia y configuración segura

- [x] 1.1 RED: escribir `backend/tests/test_auth_config.py` con los escenarios "Arranque sin SECRET_KEY falla", "Arranque con valor de ejemplo o clave corta falla" (rechazando `cambiar-en-produccion-solo-env` y claves de menos de 32 caracteres) y "Una variable de algoritmo no cambia el algoritmo".
  Verificación: `pytest backend/tests/test_auth_config.py -p no:randomly -q --tb=short` falla porque el módulo de configuración no existe.
- [x] 1.2 Agregar `PyJWT==2.10.1` a `backend/requirements.txt` y crear el módulo de configuración: validación de `SECRET_KEY` (rechaza el valor de ejemplo del `.env.example` y claves menores a 32 caracteres), duración de `ACCESS_TOKEN_EXPIRES_MIN` (default 60) y algoritmo HS256 como constante. Compose, CI y tests usan un valor ficticio de 32 o más caracteres.
  Verificación: `pytest backend/tests/test_auth_config.py -p no:randomly -q --tb=short` en verde; `Select-String -Path backend\requirements.txt -Pattern '^PyJWT==' -Encoding UTF8` devuelve una línea.
- [x] 1.3 Dar `SECRET_KEY` de prueba al entorno de tests (conftest) para que la suite siga arrancando.
  Verificación: `pytest backend/tests -p no:randomly -q --tb=short` sin fallos nuevos respecto de la línea base de 0.4.
- [x] 1.5 Mutación: bajar el mínimo de longitud de `SECRET_KEY` de 32 a 1. Verificación: el escenario "Arranque con valor de ejemplo o clave corta falla" (tarea 1.1) debe fallar con la mutación aplicada; revertir con `git restore`.

## 2. Hash de contraseña

- [x] 2.1 RED: `backend/tests/test_auth_password.py` con el escenario "El hash no es la contraseña y la sal es propia" (dos hashes distintos, verificación correcta e incorrecta, formato con iteraciones guardadas).
  Verificación: `pytest backend/tests/test_auth_password.py -p no:randomly -q --tb=short` falla por falta del módulo.
- [x] 2.2 GREEN: funciones de hash y verificación con `hashlib.pbkdf2_hmac`, `secrets` y `hmac.compare_digest`. Iteraciones como constante reemplazable en tests.
  Verificación: el mismo comando en verde; `ruff check backend scripts` sin errores.

## 3. Tabla de usuarios y migración 009

- [x] 3.1 RED: `backend/tests/test_usuario_migracion.py` con los escenarios "La migración 009 crea la tabla y es reversible" y "DNI duplicado es rechazado".
  Verificación: `pytest backend/tests/test_usuario_migracion.py -p no:randomly -q --tb=short` falla porque la tabla no existe.
- [x] 3.2 GREEN: modelo de usuarios (nombre y tipos según 0.1) y migración 009 con `down_revision = "008_recordatorio"` que solo crea la tabla y el índice único, sin insertar datos.
  Verificación: el mismo comando en verde. Reversibilidad a mano: subir a la 009, bajar una revisión y volver a subir con el comando de alembic del proyecto (0.1); `alembic heads` muestra una sola cabeza. La reversibilidad se verifica según lo que resuelva 0.1 (base separada o paso manual) y no se corre dentro de la suite sobre `turnos_test` si esa base comparte estado con los demás tests.
- [x] 3.3 Suite completa.
  Verificación: `pytest backend/tests -p no:randomly -q --tb=short` sin fallos nuevos.

## 4. Login y rate limit

- [x] 4.1 RED: `backend/tests/test_auth_login.py` con los escenarios de "Login con emisión de JWT": exitoso, credenciales inválidas, cuenta inactiva, body inválido, varias sucursales, sucursal no asociada, usuario sin sucursales y límite de intentos. Los usuarios y contraseñas los crea el propio test.
  Verificación: `pytest backend/tests/test_auth_login.py -p no:randomly -q --tb=short` falla porque `POST /login` no existe.
- [x] 4.2 GREEN: emisión de token (claims `sub`, `rol`, `sucursal_id` opcional, `iat`, `exp`), resolución de sucursal según Q-C24-06, `POST /login` público con cuerpo de error `causa` y `detalle`, hash de relleno para DNI inexistente y rate limit por IP con el patrón de C-08.
  Verificación: el mismo comando en verde.
- [x] 4.3 Fixture de tests que obtiene un token real (rol y sucursal parametrizables) y un cliente autenticado, para usar en el grupo 5.
  Verificación: un test mínimo del fixture en `backend/tests/test_auth_login.py` en verde.
- [x] 4.4 Suite completa.
  Verificación: `pytest backend/tests -p no:randomly -q --tb=short` sin fallos nuevos.
- [x] 4.5 Mutación: quitar el hash de relleno para DNI inexistente en el login. Verificación: el escenario "Credenciales inválidas responden 401 sin distinguir la causa" (tarea 4.1) debe fallar al medir con `monkeypatch` las llamadas al hash; revertir con `git restore`.

## 5. Identidad solo por JWT

- [x] 5.1 RED: `backend/tests/test_auth_contexto.py` con los escenarios de "Identidad solo por JWT": token válido, sin token, Authorization con esquema distinto o token vacío, Token con formato que no es un JWT, headers de C-11 sin efecto, firma inválida (incluido `none`), expirado, sin claims, sesión inválida, 403 por rol sin permiso, Token con sucursal filtra profesionales y sillones, y rutas públicas sin token.
  Verificación: `pytest backend/tests/test_auth_contexto.py -p no:randomly -q --tb=short` falla (los headers todavía otorgan identidad).
- [x] 5.2 GREEN: reescribir `get_permission_context` según `design.md`: validar el token con algoritmo fijo, consultar la base, devolver `origen="jwt"`, y eliminar la lectura de `X-Actor-Rol`, `X-Actor-Usuario` y `X-Sucursal-Id` y el default `recepcion`. Actualizar el comentario "never 401" de `rbac/router.py`. `WWW-Authenticate: Bearer` en los 401. Los filtros de C-11 por sucursal pasan a usar la sucursal del contexto.
  Verificación: el mismo comando en verde; cubre el escenario nuevo de filtro por sucursal (profesionales y sillones se filtran por la sucursal del token).
- [x] 5.3 Migrar los tests existentes medidos en 0.4 al cliente autenticado de 4.3, archivo por archivo, sin cambiar lo que cada test afirma salvo el origen de la identidad. Incluye verificar en `backend/tests/test_export.py` que `GET /export` excluye la tabla de usuarios y campos de `password_hash`.
  Verificación: tras cada archivo, `pytest backend/tests/<archivo> -p no:randomly -q --tb=short` en verde; al final `Select-String` del patrón de 0.4 sobre `backend\tests` solo devuelve los tests que prueban que el header ya no funciona. Además, el JSON exportado de `GET /export` no contiene claves de usuarios ni campos con hash.
- [x] 5.4 Suite completa y lint.
  Verificación: `pytest backend/tests -p no:randomly -q --tb=short` con la cantidad de tests pasados mayor o igual a la línea base de 0.4, y `ruff check backend scripts` sin errores.
- [x] 5.5 Mutación: quitar el chequeo de `exp` en la validación del token. Verificación: el escenario "Token expirado responde 401" debe fallar con la mutación aplicada; revertir con `git restore`.
- [x] 5.6 Mutación: quitar el chequeo de usuario activo en la validación del token. Verificación: el escenario del usuario desactivado (token válido de un usuario que ya no es válido) debe fallar con la mutación aplicada; revertir con `git restore`.
- [x] 5.7 Mutación: quitar la validación de sucursal del token contra la base. Verificación: el escenario de sucursal desasociada (token válido de un usuario que ya no es válido) debe fallar con la mutación aplicada; revertir con `git restore`.
- [x] 5.8 Mutación: aceptar el algoritmo none en la validación del token. Verificación: el escenario 'Token con algoritmo none responde 401' debe fallar con la mutación aplicada; revertir con git restore.

## 6. Seed de usuario ficticio

- [x] 6.1 RED: `backend/tests/test_auth_seed.py` con los escenarios "Seed crea un único usuario y es repetible", "Seed sin contraseña definida genera una al azar" y "Seed inactivo no crea usuarios".
  Verificación: `pytest backend/tests/test_auth_seed.py -p no:randomly -q --tb=short` falla por falta de la función.
- [x] 6.2 GREEN: función de seed de usuarios en `backend/app/seed`, invocada desde el punto de entrada que exista (0.1), sin contraseñas literales. La migración 009 no inserta nada.
  Verificación: el mismo comando en verde; `Select-String` de `password` con valor literal sobre `backend\app\seed` sin coincidencias, con control positivo sobre el mismo archivo.
- [x] 6.3 Suite completa.
  Verificación: `pytest backend/tests -p no:randomly -q --tb=short` sin fallos nuevos.

## 7. Configuración, CI y documentación

- [x] 7.1 Actualizar `.env.example`: `SECRET_KEY` con un valor de ejemplo que la app rechaza, `ACCESS_TOKEN_EXPIRES_MIN`, `SEED_USUARIO_PASSWORD` vacía. Sin variable de algoritmo ni de refresh.
  Verificación: `Select-String -Path .env.example -Pattern 'ALGORITHM|REFRESH' -Encoding UTF8` sin coincidencias, con control positivo sobre `SECRET_KEY` en el mismo archivo.
- [x] 7.2 Pasar `SECRET_KEY` al servicio de la API en `docker-compose.yml` leyéndola del entorno.
  Verificación doble: con `SECRET_KEY` definida en el entorno, `docker compose config` muestra la variable en el servicio api; con `SECRET_KEY` sin definir, `docker compose up -d postgres` no falla (si falla, se ajusta el compose y se registra la decisión en `design.md`). Además, la verificación de `/health` de C-23 se repite con `SECRET_KEY` definida.
- [x] 7.3 Agregar `SECRET_KEY` con valor ficticio de más de 32 caracteres al job de tests en `.github/workflows/tests.yml` (sin tocar los jobs de otros changes).
  Verificación: `Select-String -Path .github\workflows\tests.yml -Pattern 'SECRET_KEY' -Encoding UTF8` devuelve la línea; el CI de la PR en verde.
- [x] 7.4 README: cómo definir `SECRET_KEY`, cómo hacer login con el usuario del seed y qué pasa con el header antiguo.
  Verificación: `Select-String -Path README.md -Pattern 'SECRET_KEY' -Encoding UTF8` devuelve coincidencias.
- [x] 7.5 Confirmar que no se commitea ninguna credencial.
  Verificación: `git --no-pager diff --stat` y `git --no-pager diff` sin contraseñas ni claves reales; `git status --short` solo con archivos del change.

## 8. Cierre

- [x] 8.1 Suite completa, lint y validación.
  Verificación: `pytest backend/tests -p no:randomly -q --tb=short`, `ruff check backend scripts` y `cmd /c "openspec validate c-24-auth-jwt --strict"` en verde.
- [x] 8.2 Al archivar: actualizar la fila Auth de `AGENTS.md` y `CLAUDE.md` (idénticos) para reflejar el login con JWT, anotar el change de frontend pendiente sin inventar su número y marcar C-24 en `CHANGES.md`.
  - Antes de marcar C-24 en `CHANGES.md`, verificar que exista su entrada (creada en la rama `docs/rev-11`); si no existe, anotar como bloqueo y no inventar el texto.
  Verificación: hash de `AGENTS.md` igual al de `CLAUDE.md` (`Get-FileHash`), y `Select-String -Path AGENTS.md -Pattern 'X-Actor-Rol' -Encoding UTF8` sin la descripción vieja de la fila Auth.

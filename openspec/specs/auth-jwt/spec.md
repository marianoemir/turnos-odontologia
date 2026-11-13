# auth-jwt Specification

## Purpose
TBD - created by archiving change c-24-auth-jwt. Update Purpose after archive.

## Requirements

### Requirement: Login con emisión de JWT

La app SHALL exponer `POST /login`, público, que recibe `dni` y `password` y, con credenciales correctas de un usuario activo, responde 200 con un JWT firmado, el rol, el usuario y, si corresponde, la sucursal.

#### Scenario: Login exitoso con credenciales válidas

- **GIVEN** un usuario activo con rol `recepcion` y una sola sucursal asociada, con contraseña conocida por el test
- **WHEN** se envía `POST /login` con su DNI y esa contraseña
- **THEN** el response es 200, el cuerpo trae `token`, `rol` igual a `recepcion`, `usuario` y `sucursal_id` igual a la sucursal asociada
- **AND** el token decodificado con la clave del servidor y HS256 contiene `sub`, `rol`, `sucursal_id`, `iat` y un `exp` posterior a `iat` en tantos minutos como indica `ACCESS_TOKEN_EXPIRES_MIN`

#### Scenario: Credenciales inválidas responden 401 sin distinguir la causa

- **GIVEN** un usuario existente y un DNI que no existe
- **WHEN** se envía `POST /login` con el DNI existente y una contraseña incorrecta, y luego con el DNI inexistente
- **THEN** ambos responden 401 con el mismo `detail.causa` (`credenciales_invalidas`) y el mismo `detail.detalle`, y no emite token
- **AND** con el DNI inexistente se ejecuta igual la verificación de hash de relleno (sal de relleno), para no delatar la existencia del DNI

#### Scenario: Cuenta inactiva con credenciales correctas responde 403

- **GIVEN** un usuario con `activo` en falso y contraseña conocida por el test
- **WHEN** se envía `POST /login` con su DNI y la contraseña correcta
- **THEN** el response es 403 con `detail.causa` igual a `cuenta_inactiva` y no se emite token

#### Scenario: Body sin password responde 422

- **GIVEN** el endpoint `POST /login`
- **WHEN** se envía un body sin `password`
- **THEN** el response es 422 y no se consulta ni se emite token

#### Scenario: Body con dni vacío responde 422

- **GIVEN** el endpoint `POST /login`
- **WHEN** se envía un body con `dni` vacío
- **THEN** el response es 422 y no se consulta ni se emite token

#### Scenario: Body que no es JSON responde 422

- **GIVEN** el endpoint `POST /login`
- **WHEN** se envía un body que no es JSON
- **THEN** el response es 422 y no se consulta ni se emite token

#### Scenario: Password o DNI por encima del máximo responde 422 sin calcular el hash

- **GIVEN** el endpoint `POST /login`
- **WHEN** se envía un `dni` de más de 32 caracteres o un `password` de más de 128 caracteres
- **THEN** el response es 422 y no se calcula el hash de verificación

#### Scenario: Usuario sin sucursales asociadas recibe token sin sucursal_id

- **GIVEN** un usuario activo sin ninguna sucursal asociada y con credenciales válidas
- **WHEN** se envía `POST /login` con sus credenciales
- **THEN** el response es 200, el cuerpo y el token decodificado no contienen `sucursal_id`, y el contexto subsiguiente queda sin filtro por sucursal

#### Scenario: Usuario con varias sucursales debe indicar una

- **GIVEN** un usuario activo asociado a dos sucursales
- **WHEN** se envía `POST /login` con credenciales correctas y sin `sucursal_id`
- **THEN** el response es 422 con `detail.causa` igual a `sucursal_requerida` y no emite token

#### Scenario: Sucursal no asociada al usuario responde 403

- **GIVEN** un usuario activo asociado a dos sucursales y un `sucursal_id` que no es de las asociadas
- **WHEN** se envía `POST /login` con credenciales correctas y con ese `sucursal_id`
- **THEN** el response es 403 con `detail.causa` igual a `sucursal_no_asociada` y no se emite token

#### Scenario: Se supera el límite de intentos por IP

- **GIVEN** un límite de intentos fallidos de login por IP dentro de una ventana de tiempo, configurables y con valor por defecto fijado en la tarea 0.1
- **WHEN** una misma IP envía un intento fallido más que el límite dentro de la ventana de tiempo
- **THEN** el response es 429 y no se evalúan las credenciales

#### Scenario: Los logins exitosos no cuentan para el límite

- **GIVEN** un límite de intentos fallidos de login por IP dentro de una ventana de tiempo
- **WHEN** una misma IP realiza múltiples logins correctos seguidos dentro de la ventana, superando en cantidad al límite
- **THEN** todos los logins correctos responden 200 y no se bloquean con 429

### Requirement: Identidad solo por JWT

El sistema SHALL resolver la identidad en `get_permission_context` únicamente desde un JWT válido en el header `Authorization: Bearer`, y SHALL responder 401 con `detail.causa` y `detail.detalle` cuando el token falte, sea inválido o haya expirado, en toda ruta que dependa de `get_permission_context`, salvo en las rutas públicas de C-07, C-08 y `POST /login`. `/health`, `/docs` y `/openapi.json` no dependen del contexto y siguen públicas.

#### Scenario: JWT válido produce contexto con origen jwt

- **GIVEN** un usuario activo y un token emitido por el login para él
- **WHEN** se llama a una ruta protegida con `Authorization: Bearer` y ese token
- **THEN** el contexto resuelve con el rol y el usuario del token, `origen` igual a `jwt`, y la operación prosigue

#### Scenario: Sin token en ruta protegida responde 401

- **GIVEN** una ruta protegida
- **WHEN** se llama sin header `Authorization`
- **THEN** el response es 401 con `detail.causa` igual a `token_ausente`, `detail.detalle` no vacío y header `WWW-Authenticate` con valor `Bearer`

#### Scenario: Authorization con esquema distinto o token vacío responde 401 token_ausente

- **GIVEN** una ruta protegida
- **WHEN** se llama con un header `Authorization` cuyo esquema no es `Bearer` o con token vacío
- **THEN** el response es 401 con `detail.causa` igual a `token_ausente`, `detail.detalle` no vacío y header `WWW-Authenticate` con valor `Bearer`

#### Scenario: Token con formato que no es un JWT responde 401 token_invalido

- **GIVEN** una ruta protegida
- **WHEN** se llama con `Authorization: Bearer abc` que no es un JWT
- **THEN** el response es 401 con `detail.causa` igual a `token_invalido`

#### Scenario: Header `X-Actor-Rol` sin token no otorga identidad

- **GIVEN** una ruta protegida de administración
- **WHEN** se llama sin token pero con `X-Actor-Rol` igual a `admin`
- **THEN** el response es 401 con `detail.causa` igual a `token_ausente` y no actúa como administrador ni como `recepcion`

#### Scenario: Header `X-Sucursal-Id` sin token no otorga identidad

- **GIVEN** una ruta protegida
- **WHEN** se llama sin token pero con `X-Sucursal-Id`
- **THEN** el response es 401 con `detail.causa` igual a `token_ausente` y no se resuelve identidad

#### Scenario: Token de recepcion con header admin responde 403 y el header de sucursal se ignora

- **GIVEN** un token válido emitido para un usuario con rol `recepcion` y un `sucursal_id`, y una request que además lleva el header `X-Actor-Rol: admin` y un `X-Sucursal-Id` distinto del claim del token
- **WHEN** se llama a una ruta protegida que exige permiso de administrador con ese token y esos headers
- **THEN** el contexto sigue siendo el del token (`recepcion`) y la ruta de administración responde 403 con `detail.causa` `permiso_denegado`; el `X-Sucursal-Id` distinto del claim se ignora

#### Scenario: Token firmado con clave distinta de la del servidor responde 401

- **GIVEN** un token firmado con una clave distinta de la del servidor
- **WHEN** se llama a una ruta protegida con ese token
- **THEN** el response es 401 con `detail.causa` igual a `token_invalido`

#### Scenario: Token con algoritmo `none` responde 401

- **GIVEN** un token con el algoritmo `none`
- **WHEN** se llama a una ruta protegida con ese token
- **THEN** el response es 401 con `detail.causa` igual a `token_invalido`

#### Scenario: Token expirado responde 401

- **GIVEN** un token firmado con la clave correcta cuyo `exp` ya pasó
- **WHEN** se llama a una ruta protegida
- **THEN** el response es 401 con `detail.causa` igual a `token_expirado`

#### Scenario: Token sin claims obligatorios responde 401

- **GIVEN** un token firmado con la clave correcta al que le falta `sub`, le falta `rol` o le falta `exp`
- **WHEN** se llama a una ruta protegida
- **THEN** el response es 401 con `detail.causa` igual a `token_incompleto` y no se resuelve el contexto; la ausencia de cada claim requerido (`sub`, `rol` o `exp`) se reporta con esa misma `detail.causa`

#### Scenario: Token de usuario desactivado responde 401 con sesion_invalida

- **GIVEN** un token vigente de un usuario que luego fue desactivado
- **WHEN** se llama a una ruta protegida
- **THEN** el response es 401 con `detail.causa` igual a `sesion_invalida`

#### Scenario: Token de rol cambiado responde 401 con sesion_invalida

- **GIVEN** un token vigente emitido para un usuario cuyo rol luego cambió
- **WHEN** se llama a una ruta protegida
- **THEN** el response es 401 con `detail.causa` igual a `sesion_invalida`

#### Scenario: Token con sucursal desasociada responde 401 con sesion_invalida

- **GIVEN** un token vigente con un `sucursal_id` del que el usuario luego quedó desasociado
- **WHEN** se llama a una ruta protegida
- **THEN** el response es 401 con `detail.causa` igual a `sesion_invalida`

#### Scenario: Token válido con rol sin permiso responde 403

- **GIVEN** un token válido de un usuario con rol `recepcion`
- **WHEN** se llama a una ruta que exige permiso de administrador
- **THEN** el response es 403 con `detail.causa` igual a `permiso_denegado` y no 401

#### Scenario: Token con sucursal filtra profesionales y sillones por esa sucursal

- **GIVEN** un token válido con un `sucursal_id` de un usuario con sucursal
- **WHEN** se consulta el listado de profesionales o sillones con el contexto resuelto desde el token
- **THEN** los profesionales y sillones se filtran por la sucursal del token (comportamiento que hoy se resolvía con `X-Sucursal-Id` de C-11)

#### Scenario: GET /reservar/{profesional} es pública y no exige token

- **GIVEN** un profesional y una prestación existentes
- **WHEN** se llama a `GET /reservar/{profesional}` con `prestacion` y `fecha` válidos, sin header `Authorization`
- **THEN** el response es 200 con los slots

#### Scenario: POST /reservar es pública y no exige token

- **GIVEN** un profesional y una prestación existentes
- **WHEN** se envía `POST /reservar` sin header `Authorization`
- **THEN** el response es 201 y no responde 401 por falta de token

#### Scenario: POST /confirmar/{token} es pública y no exige token

- **GIVEN** un turno con token de C-07
- **WHEN** se llama a `POST /confirmar/{token}` sin header `Authorization`
- **THEN** el response es 200 y no responde 401 por falta de token

#### Scenario: POST /cancelar/{token} es pública y no exige token

- **GIVEN** un turno con token de C-07
- **WHEN** se llama a `POST /cancelar/{token}` sin header `Authorization`
- **THEN** el response es 200 y no responde 401 por falta de token

### Requirement: Usuarios con contraseña hasheada

La base de datos SHALL tener una tabla de usuarios con `dni` único, `password_hash`, `rol_id` (FK a roles), `activo` y `creado_en`, creada por la migración 009 sin insertar datos, y las contraseñas SHALL almacenarse con `pbkdf2_hmac`, sal propia por usuario y verificarse con comparación en tiempo constante.

#### Scenario: La migración 009 crea la tabla y es reversible

- **GIVEN** una base en la revisión `008_recordatorio`
- **WHEN** se sube a la 009 y luego se baja una revisión y se vuelve a subir
- **THEN** tras subir existen la tabla y el índice único sobre `dni`, la tabla no tiene filas, y tras bajar la tabla ya no existe

#### Scenario: El hash no es la contraseña y la sal es propia

- **GIVEN** dos usuarios creados con la misma contraseña
- **WHEN** se compara el contenido guardado en `password_hash` de ambos
- **THEN** ninguno contiene la contraseña en claro, los dos valores son distintos entre sí, y la verificación acepta la contraseña correcta y rechaza una incorrecta

#### Scenario: DNI duplicado es rechazado

- **GIVEN** un usuario con un DNI dado
- **WHEN** se intenta crear otro usuario con el mismo DNI
- **THEN** la base rechaza la inserción por la restricción de unicidad

#### Scenario: Exportación total excluye usuarios y credenciales

- **GIVEN** la base con usuarios cargados y un token de administrador válido
- **WHEN** se invoca `GET /export`
- **THEN** la respuesta es 200 con el archivo JSON y el payload no contiene la clave `usuarios` ni campos `password_hash` en ningún dominio exportado

### Requirement: Clave de firma obligatoria

La app SHALL negarse a arrancar si `SECRET_KEY` no está definida, está vacía, es el valor de ejemplo del `.env.example` (`cambiar-en-produccion-solo-env`) o tiene menos de 32 caracteres, y el algoritmo de firma SHALL estar fijado en el código y no ser configurable por variable de entorno. Compose, CI y tests SHALL usar un valor ficticio de 32 o más caracteres.

#### Scenario: Arranque sin SECRET_KEY falla

- **GIVEN** un entorno sin `SECRET_KEY`, o con ella vacía
- **WHEN** se construye la aplicación
- **THEN** falla con un error que nombra `SECRET_KEY` y la app no queda lista para recibir requests

#### Scenario: Arranque con valor de ejemplo o clave corta falla

- **GIVEN** un entorno con `SECRET_KEY` igual al valor de ejemplo del `.env.example` (`cambiar-en-produccion-solo-env`), y otro con una clave de menos de 32 caracteres
- **WHEN** se construye la aplicación en cada uno
- **THEN** ambos fallan con un error que nombra `SECRET_KEY`

#### Scenario: Una variable de algoritmo no cambia el algoritmo

- **GIVEN** un entorno que define una variable de algoritmo con otro valor
- **WHEN** se emite y se valida un token
- **THEN** el token se firma con HS256 y la validación rechaza un token firmado con otro algoritmo

### Requirement: Seed de usuario ficticio

El seed SHALL crear un usuario ficticio con datos ficticios solo cuando `SEED_FICTICIO` esté activo, de forma idempotente y sin contraseñas escritas en el repositorio.

#### Scenario: Seed crea un único usuario y es repetible

- **GIVEN** `SEED_FICTICIO` activo, `SEED_USUARIO_PASSWORD` definida por el test y una base sin ese usuario
- **WHEN** se invoca dos veces la función de seed de usuarios
- **THEN** existe exactamente un usuario con DNI `USUARIO-FICT-001`, la segunda invocación no falla, su `password_hash` no es la contraseña en claro y la verificación acepta la contraseña definida

#### Scenario: Seed sin contraseña definida genera una al azar

- **GIVEN** `SEED_FICTICIO` activo y `SEED_USUARIO_PASSWORD` sin definir
- **WHEN** se invoca la función de seed de usuarios
- **THEN** el usuario queda creado, la contraseña generada se informa una sola vez en la salida del seed y no aparece en ningún archivo del repositorio

#### Scenario: Seed inactivo no crea usuarios

- **GIVEN** `SEED_FICTICIO` inactivo
- **WHEN** se invoca la función de seed de usuarios
- **THEN** no se crea ningún usuario

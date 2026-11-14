# Spec Delta

## Purpose

Define el ingreso y la sesión del frontend para que la navegación interna represente la identidad JWT ya validada por el backend, sin convertir al cliente en autoridad de permisos.

## ADDED Requirements

### Requirement: Login inicia una sesión con la respuesta autorizada
El frontend SHALL ofrecer `/login` como ruta SPA pública y permitir que una persona ingrese DNI y contraseña a `POST /api/login`, que el proxy/rewrite interno reenvía a FastAPI `POST /login`. Tras una respuesta exitosa SHALL establecer una sesión con el token, rol, usuario y sucursal provistos por el servidor.

#### Scenario: Credenciales válidas
- **WHEN** se envían credenciales válidas en el formulario de login
- **THEN** el frontend establece la sesión desde la respuesta del servidor y navega al retorno interno solicitado solamente si el rol tiene permiso de navegación; en otro caso navega a `/agenda`

#### Scenario: Credenciales rechazadas
- **WHEN** el login responde 401, 403 o 422
- **THEN** el frontend mantiene la sesión anónima y presenta el error normalizado sin exponer la contraseña ni distinguir credenciales inexistentes de incorrectas

#### Scenario: Login de usuario con varias sucursales
- **WHEN** el primer envío de `{ dni, password }` recibe HTTP 422 con `detail.causa` igual a `sucursal_requerida` y `detail.detalle` igual a `Debe especificar una sucursal_id entre las asociadas`
- **THEN** el frontend no inicia sesión, mantiene los datos solamente en el estado del formulario y presenta un control requerido para ingresar una `sucursal_id` UUID válida
- **AND** no enumera sucursales, no consulta recursos protegidos sin token, no prueba IDs ni registra, persiste o coloca credenciales en la URL
- **AND** al elegir una sucursal por el canal operativo autorizado reintenta una sola vez con `{ dni, password, sucursal_id }`

#### Scenario: Sucursal no asociada durante el reintento
- **WHEN** el reintento de login con `sucursal_id` responde HTTP 403 con `detail.causa` igual a `sucursal_no_asociada`
- **THEN** el frontend conserva la sesión anónima, comunica que la sucursal no está autorizada y permite corregir el identificador sin revelar asociaciones

### Requirement: Navegación interna se adapta al rol de la sesión
El frontend SHALL redirigir una visita anónima a una ruta interna a `/login`. `recepcion` SHALL poder navegar toda ruta interna y `odontologo` SHALL poder navegar sólo `/agenda`. Una navegación autenticada incompatible SHALL redirigirse a `/agenda` con un aviso de permiso insuficiente, sin sustituir la autorización del backend.

#### Scenario: Ruta interna sin sesión
- **WHEN** una persona sin sesión abre una ruta interna
- **THEN** el frontend la lleva a `/login` y preserva sólo ese destino si es una ruta interna; tras autenticar, lo retoma solamente si el rol resultante tiene acceso de navegación

#### Scenario: Odontólogo ante una ruta interna no permitida
- **WHEN** una sesión de odontólogo intenta abrir cualquier ruta interna distinta de `/agenda`
- **THEN** el frontend no ofrece ese destino, redirige a `/agenda` y comunica el aviso de permiso insuficiente

#### Scenario: Retorno externo o público no se acepta tras login
- **WHEN** el login recibe un destino de retorno externo o una de las rutas públicas
- **THEN** el frontend lo descarta y navega a `/agenda` tras autenticar

### Requirement: Errores de autenticación y autorización tienen respuestas cliente distintas
El frontend SHALL finalizar la sesión y redirigir al login ante un 401 de una request protegida, y SHALL conservar la sesión y comunicar falta de permiso ante un 403.

#### Scenario: Token ausente, inválido, vencido o sesión invalidada
- **WHEN** una request protegida responde 401
- **THEN** el frontend elimina la sesión local, evita reintentos automáticos de esa request y navega al login con un mensaje de sesión finalizada

#### Scenario: Rol válido sin permiso
- **WHEN** una request protegida responde 403
- **THEN** el frontend conserva la sesión, no la trata como expiración y muestra un mensaje de permiso insuficiente

### Requirement: Rutas públicas se mantienen independientes de la sesión
El frontend SHALL permitir que `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` se visiten y hagan sus requests públicas sin token ni redirección al login.

#### Scenario: Reserva pública sin sesión
- **WHEN** un visitante anónimo abre una ruta pública de reserva, confirmación o cancelación
- **THEN** la pantalla continúa accesible y una respuesta exitosa no inicia ni exige una sesión interna

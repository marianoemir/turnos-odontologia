## MODIFIED Requirements

### Requirement: Navegación interna se adapta al rol de la sesión
El frontend SHALL redirigir una visita anónima a una ruta interna a `/login`. `recepcion` SHALL poder navegar toda ruta interna excepto `/admin` y sus subrutas; `admin` SHALL poder navegar `/admin`, sus subrutas y `/agenda`; `odontologo` y cualquier otro rol sin acceso definido SHALL poder navegar sólo `/agenda`. Una navegación autenticada incompatible SHALL redirigirse a `/agenda` con un aviso de permiso insuficiente, sin sustituir la autorización del backend.

#### Scenario: Ruta interna sin sesión
- **WHEN** una persona sin sesión abre una ruta interna
- **THEN** el frontend la lleva a `/login` y preserva sólo ese destino si es una ruta interna; tras autenticar, lo retoma solamente si el rol resultante tiene acceso de navegación

#### Scenario: Odontólogo ante una ruta interna no permitida
- **WHEN** una sesión de odontólogo intenta abrir cualquier ruta interna distinta de `/agenda`
- **THEN** el frontend no ofrece ese destino, redirige a `/agenda` y comunica el aviso de permiso insuficiente

#### Scenario: Retorno externo o público no se acepta tras login
- **WHEN** el login recibe un destino de retorno externo o una de las rutas públicas
- **THEN** el frontend lo descarta y navega a `/agenda` tras autenticar

#### Scenario: Administrador navega administración y agenda
- **WHEN** una sesión de `admin` abre `/admin`, una subruta de `/admin` o `/agenda`
- **THEN** el frontend muestra la pantalla solicitada y, tras un login con retorno a una ruta de administración, lo retoma

#### Scenario: Administrador ante una ruta interna operativa
- **WHEN** una sesión de `admin` abre una ruta interna distinta de `/agenda`, de `/admin` y de las subrutas de `/admin`
- **THEN** el frontend redirige a `/agenda` y comunica el aviso de permiso insuficiente

#### Scenario: Recepción ante administración
- **WHEN** una sesión de `recepcion` abre `/admin` o cualquier subruta de `/admin`
- **THEN** el frontend redirige a `/agenda`, comunica el aviso de permiso insuficiente y no realiza ninguna request administrativa

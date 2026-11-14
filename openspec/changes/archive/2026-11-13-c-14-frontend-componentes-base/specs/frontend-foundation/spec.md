# Spec Delta

## MODIFIED Requirements

### Requirement: Identidad por cabeceras en las requests internas
El sistema SHALL eliminar, aun cuando el llamador las suministre por request y sin distinguir mayúsculas/minúsculas, `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` y todo `Authorization` antes de armar las cabeceras. En una request interna que requiera identidad con sesión válida SHALL agregar exclusivamente `Authorization: Bearer <token>` derivado de esa sesión; en una request pública SHALL no agregar identidad. Asimismo SHALL retirar el valor por defecto `recepcion` de su comportamiento.

#### Scenario: Login de API no colisiona con la ruta SPA

- **Dado** (GIVEN) que `/login` está reservado a la ruta de login de la SPA
- **Cuando** (WHEN) el formulario solicita autenticación
- **Entonces** (THEN) envía `POST /api/login`, y el proxy/rewrite same-origin lo reenvía internamente como `POST /login` a FastAPI sin exponer ni convertir `/login` en una ruta de API

#### Scenario: La configuración no permite salir de `/api`

- **Dado** (GIVEN) cualquier valor de build para `VITE_API_BASE_URL`
- **Cuando** (WHEN) el cliente calcula la base para una request de API
- **Entonces** (THEN) usa exclusivamente `/api` o una variante relativa normalizada que permanezca bajo `/api`
- **Y** (AND) un valor vacío, absoluto, protocol-relative, de otro origen o relativo fuera de `/api` se normaliza a `/api`, sin que el navegador pueda enviar tráfico API fuera del origen actual

#### Scenario: Rol por defecto en ausencia de selección

- **Dado** (GIVEN) que no existe una sesión válida en el cliente
- **Cuando** (WHEN) se intenta acceder a una ruta interna protegida
- **Entonces** (THEN) el cliente no asume `recepcion` ni inventa otro rol, no envía las cabeceras transitorias y redirige a la persona al login antes de realizar la request protegida

#### Scenario: Rol no admitido no se envía

- **Dado** (GIVEN) una sesión cuyo token no puede usarse o una respuesta del backend por permiso insuficiente
- **Cuando** (WHEN) el cliente arma o procesa una request protegida
- **Entonces** (THEN) no envía `X-Actor-Rol` ni ningún rol elegido por la interfaz y, si el backend responde 403, conserva la sesión y devuelve un error de dominio de permiso denegado en lugar de tratarlo como éxito

#### Scenario: Sucursal opcional y rutas públicas

- **Dado** (GIVEN) una sesión con token emitido por `POST /login`, o una request dirigida a una ruta pública del paciente
- **Cuando** (WHEN) el cliente envía la request
- **Entonces** (THEN) una request protegida incluye exclusivamente `Authorization: Bearer <token>` sin `X-Sucursal-Id`, y en `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` no envía token ni cabeceras retiradas y no redirige al login por falta de sesión

#### Scenario: Cabeceras de identidad inyectadas por un llamador no atraviesan el cliente

- **Dado** (GIVEN) una request protegida o pública con `headers` por llamada que incluyen cualquier combinación de mayúsculas/minúsculas de `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` o `Authorization`
- **Cuando** (WHEN) el cliente construye la request
- **Entonces** (THEN) elimina esas cabeceras inyectadas antes de enviar
- **Y** (AND) sólo agrega `Authorization: Bearer <token>` derivado de la sesión para una request protegida con sesión válida; una request pública no envía ninguna cabecera de identidad

#### Scenario: Prueba de integración del proxy no colisiona con un backend local

- **Dado** (GIVEN) que un Uvicorn u otro proceso legítimo puede estar escuchando en el puerto `8000`
- **Cuando** (WHEN) se ejecuta la prueba de integración del proxy de Vite
- **Entonces** (THEN) levanta su backend falso en un puerto efímero disponible, configura el target del proxy para esa instancia y verifica los rewrites sin ocupar ni depender del puerto `8000`
- **Y** (AND) si falla el setup, su cleanup condicional no intenta cerrar instancias no creadas ni reemplaza el error inicial

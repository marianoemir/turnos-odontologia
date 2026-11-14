# Design

## UI Mockups

- Design system revision: 1 (`frontend/design-system/README.md`)
- Decision: no (project policy)
- Approval: approved (2026-10-28, by user)

## Context

C-13 ya expone rutas internas y públicas, un `fetch` tipado, tipos espejo y pruebas Vitest/RTL. Su cliente mantiene puntos de extensión transitorios para rol y sucursal que aún envían `X-Actor-Rol` y `X-Sucursal-Id`; C-24 los sustituyó por JWT Bearer y exige leer el contrato de `auth-jwt` directamente. La fundación visual aprobada está en modo `system-only`, por lo que se traduce su referencia local a React sin mockups ni cambios de tokens.

## Goals / Non-Goals

**Goals:**

- Proveer una capa UI, de formularios y de estado de servidor que las capabilities C-15..C-22 puedan reutilizar.
- Centralizar sesión, envío de credenciales y reacción a 401/403 sin cambiar la autoridad del backend.
- Probar el flujo de autenticación y los contratos accesibles antes de construir pantallas de negocio.

**Non-Goals:**

- No crear pantallas de catálogo, agenda, alta de turno ni reserva.
- No modificar el contrato, la firma, el vencimiento ni la autorización de JWT del backend.
- No implementar un mecanismo de refresh hasta que se decida y exista un endpoint de backend que lo soporte.
- No rediseñar ni alterar la revisión 1 del sistema visual.

## Decisions

### D1. Composición por dominios reutilizables

Los componentes se organizarán como primitives UI, formularios y feedback, separando sus props tipadas de las pantallas. Reutilizarán clases semánticas y variables de `tokens.css` de la referencia aprobada; no duplicarán valores CSS.

**Alternativas consideradas:** CSS-in-JS o una librería de componentes externa. Se descartan porque introducirían otra fuente visual y no traducen directamente la referencia local aprobada.

### D2. Un proveedor para estado de servidor y límites de responsabilidad

La raíz de la aplicación montará una única configuración de caché de servidor. Los servicios conservarán el cliente HTTP tipado y las hooks por recurso definirán claves estables e invalidaciones tras mutaciones exitosas. Los estados locales de interacción (modal, toast y formulario) no se guardarán en la caché de servidor.

**Alternativa considerada:** requests y estados manuales por pantalla. Se descarta porque C-15..C-22 repetirían loading, error, invalidación y cancelación.

### D3. Formularios con validación dual

Los formularios reutilizables validarán DNI, duración y rangos antes de enviar; la respuesta 422 del backend seguirá siendo la autoridad y se proyectará a cada campo cuando indique ubicación. Las reglas de agenda y permisos no se duplicarán en cliente.

**Alternativa considerada:** validar sólo en API. Se descarta porque pierde feedback inmediato y accesible, aunque la API seguirá cubriendo toda regla de negocio.

### D4. Sesión derivada del contrato de C-24 y elección explícita de sucursal

El formulario usa la respuesta documentada de `POST /login` (`token`, `rol`, `usuario`, `sucursal_id` cuando corresponda). El contexto de sesión usa el token para armar el Bearer y representa rol/sucursal recibidos; el rol no es elegible por selector. Las guardas sólo filtran navegación de acuerdo con la KB; cualquier permiso efectivo sigue validándose en backend.

Cuando el primer envío de `{ dni, password }` recibe exactamente HTTP 422 con `detail.causa` igual a `sucursal_requerida` y `detail.detalle` igual a `Debe especificar una sucursal_id entre las asociadas`, el frontend conserva el formulario únicamente en memoria, no inicia sesión y muestra el control de sucursal requerido. C-24 no expone las asociaciones en ese error ni un endpoint público para enumerarlas: el control no debe inventar opciones, consultar catálogos protegidos sin token, ni probar IDs. La persona provee una sucursal asociada mediante un identificador UUID válido que recibió por el canal operativo autorizado; el reintento envía una única vez `{ dni, password, sucursal_id }` a `POST /api/login`. La respuesta 403 `detail.causa=sucursal_no_asociada` se muestra como selección no autorizada, conserva la sesión anónima y permite corregir el valor sin revelar asociaciones. Cualquier otro 422 conserva el tratamiento normalizado de validación de formulario. DNI, contraseña y sucursal no se registran, persisten ni se incluyen en la URL.

**Alternativa considerada:** conservar el selector y cabeceras C-13. Se descarta porque contradice `auth-jwt`: esos headers no otorgan identidad ni pueden sobrescribir los claims.

### D5. Requests protegidas y públicas se separan explícitamente

El cliente HTTP recibirá una opción explícita de request pública. Antes de completar las cabeceras de cualquier request, eliminará de las cabeceras por llamada —sin importar mayúsculas/minúsculas— `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` y cualquier `Authorization` inyectado. Las requests protegidas con sesión agregarán después exclusivamente `Authorization: Bearer <token>` de la sesión; las públicas no incluirán token ni cabeceras retiradas. Un 401 de una request protegida finaliza la sesión y lleva a login sin reintento; un 403 conserva sesión y se presenta como permiso insuficiente.

**Alternativa considerada:** adjuntar el Bearer globalmente. Se descarta porque las rutas públicas deben permanecer utilizables sin sesión y no necesitan identidad.

### D6. Sesión en memoria con expiración proactiva

El access token vivirá solamente en memoria: una recarga completa vuelve la sesión a anónima y requiere login. El cliente leerá `exp`, programará el cierre proactivo y tratará cualquier 401 como fallback que limpia la sesión y redirige al login. No se almacenará token, rol, usuario ni sucursal en `localStorage` o `sessionStorage`.

**Alternativas consideradas:** `localStorage` fue descartado por exposición a XSS; cookie HttpOnly requeriría cambios de backend y política CSRF que no pertenecen a C-14.

### D7. Refresh fuera de alcance

No se implementará refresh token: el backend no expone endpoint ni contrato de refresh. Es trabajo futuro condicionado a un change backend que defina emisión, rotación, revocación y protección CSRF si correspondiera.

### D8. Base de API y proxy same-origin para API y login

El navegador sólo consumirá URLs bajo `/api`: el formulario llama `POST /api/login` y las requests API siguen el prefijo `/api`. La configuración normaliza `VITE_API_BASE_URL` a `/api` sólo si el valor es `/api` o una variante relativa bajo `/api` que pueda colapsarse sin salir de ese prefijo; valor vacío, absoluto, protocol-relative, con otro origen, o relativo que no quede bajo `/api` se resuelve a `/api`. No se concatenan ni se permiten bases que puedan escapar a otro origen. Vite en desarrollo y nginx en producción reescriben/proxyan internamente `/api/login` a FastAPI `POST /login`; no exponen ni proxyan `/login`, que queda reservado exclusivamente para la ruta SPA. La verificación temprana confirmará que login y una request protegida con `Authorization` atraviesan este recorrido same-origin sin requerir CORS del navegador; la respuesta del backend seguirá normalizándose en el cliente.

### D9. Ruta SPA, matriz de guardas y retorno seguro

`/login` será una ruta pública de la SPA. Las rutas internas requieren sesión: `recepcion` puede navegar todas; `odontologo` sólo puede navegar `/agenda`. Las rutas públicas `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` nunca quedan detrás de la guarda. Una visita anónima a una ruta interna guarda solamente ese destino interno como retorno y redirige a `/login`. Tras login, se vuelve al destino guardado sólo si es una ruta interna permitida para el rol resultante; de lo contrario se navega a `/agenda`. Una navegación autenticada pero prohibida también redirige a `/agenda` y muestra un aviso de permiso insuficiente. No se acepta un destino externo ni una ruta pública como retorno.

### D10. Verificación local reproducible de proxy y login

Antes de depender de pantallas, la verificación levantará backend con un `SECRET_KEY` ficticio de 32 o más caracteres y una `DATABASE_URL` de prueba cuyo nombre termine en `turnos_test`; aplicará las migraciones y ejecutará el seed documentado. El usuario ficticio de C-24 es el DNI `USUARIO-FICT-001`, creado por `backend/app/seed/usuario.py`; su contraseña se aporta por `SEED_USUARIO_PASSWORD` o, si se omite, se usa la contraseña aleatoria impresa una sola vez por el seed. No se documentará ni fijará ninguna contraseña. La prueba usa esas credenciales para `POST /api/login`, conserva el token sólo en memoria y lo utiliza en una ruta protegida a través del proxy.

La prueba automatizada de integración del proxy levantará un backend falso en un puerto efímero disponible y configurará explícitamente el target del proxy de esa instancia; no usará ni asumirá el puerto `8000`, que puede pertenecer a un Uvicorn local legítimo. Su teardown será idempotente y condicional: cerrará Vite y el backend falso sólo si fueron creados/están escuchando, aun cuando falle el setup, preservando el error original.

**Verificación manual (2026-11-13):** contra FastAPI local con migraciones aplicadas sobre `turnos_test`, `SECRET_KEY` ficticio de 32+ caracteres y el seed C-24, el login con el usuario ficticio devolvió 200 mediante `POST /api/login` en `http://localhost:5173/login`. La inspección del navegador no mostró errores de consola (salvo el mensaje informativo de React DevTools) y mostró la request de login; una recarga completa volvió a `/login`, confirmando que la sesión no persiste. A través del proxy de Vite, una ruta protegida con Bearer devolvió 200. El recorrido se completó same-origin sin CORS; no se registraron token, contraseña ni otros secretos.

**Verificación manual adicional (2026-11-13):** con un usuario ficticio multi-sucursal en `turnos_test`, el primer login sin sucursal recibió el 422 esperado `sucursal_requerida` y no inició sesión. Al ingresar por el canal operativo una sucursal ficticia asociada, el único reintento llegó a 200 mediante la URL same-origin `/api/login`. Con Vite reiniciado en el puerto 5174 y `VITE_API_BASE_URL` configurada con un origen hostil, el navegador mantuvo la request en `http://localhost:5174/api/login`; no intentó el origen externo. Los gates posteriores a 1.4 y 4.6 registraron: suite frontend completa 24 archivos/118 pruebas, integración del proxy 2/2, lint, `tsc -b` y build. No se registraron credenciales, tokens ni identificadores de sucursal.

## Risks / Trade-offs

- [Recarga completa elimina la sesión en memoria] → Mostrar el login normalmente; no simular persistencia ni guardar credenciales.
- [Token vencido mientras se completa un formulario] → Tratar el 401 como sesión terminada, no reintentar mutaciones, y conservar un mensaje claro; no prometer preservación de borradores.
- [Proxy de Vite o nginx no reescribe `/api/login` o no reenvía `Authorization`] → Ejecutar la verificación same-origin temprana contra FastAPI antes de integrar pantallas dependientes.
- [Guarda UI divergente de permisos reales] → Mantenerla limitada a navegación y cubrir el 403 del backend.
- [Componentes no accesibles por teclado] → Pruebas RTL para foco de modal, Escape, labels, errores asociados y anuncio de toast.

## Migration Plan

1. Incorporar dependencias y providers sin cambiar rutas públicas.
2. Reemplazar el estado transitorio de rol/sucursal y las cabeceras heredadas por sesión JWT y Bearer.
3. Añadir la ruta SPA `/login` y guardas de las rutas internas, manteniendo los layouts públicos fuera de ellas.
4. Verificar proxy/rewrite `/api/login`, `Authorization` y los gates de lint, tipos, build y tests.
5. Rollback: revertir el despliegue frontend completo; no hay migración de datos ni cambio de API en este change.

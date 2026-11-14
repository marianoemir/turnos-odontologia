# Proposal

## Why

La fundación C-13 dejó el shell, las rutas y el cliente HTTP listos, pero todavía no hay componentes React reutilizables, manejo de estado de servidor, formularios ni una sesión real. C-24 ya provee login y autorización exclusivamente por JWT, por lo que esta base debe reemplazar de forma coherente el contrato transitorio de cabeceras antes de que las pantallas de negocio lo consuman.

## What Changes

- Incorporar la biblioteca React de componentes accesibles basada en `frontend/design-system/components.html`, sin redefinir tokens: controles, estados de carga/vacío, tabla responsive, modal y toast.
- Configurar TanStack Query una vez para estado de servidor, con claves por recurso e invalidación posterior a mutaciones.
- Incorporar React Hook Form y Zod para validación de formularios compartida con mapeo de errores 422 a campos.
- Agregar la ruta SPA `/login`, contexto de sesión y guardas de navegación que usan el JWT emitido por `POST /api/login` (reescrito internamente a FastAPI `POST /login`), incluido el reintento explícito con `sucursal_id` cuando C-24 responda `422 detail.causa=sucursal_requerida`; el guard solamente mejora la navegación y no sustituye la autorización del backend.
- **BREAKING** para el cliente interno: retirar `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` y el valor por defecto `recepcion`; las requests protegidas pasarán a usar exclusivamente `Authorization: Bearer <token>`.
- Normalizar el tratamiento cliente de 401 y 403, preservando el acceso sin token y sin redirección a las rutas públicas de reserva, confirmación y cancelación.
- Normalizar cualquier `VITE_API_BASE_URL` a `/api` y rechazar valores externos, para que todo tráfico API del navegador permanezca same-origin bajo ese prefijo.
- Verificar temprano el recorrido same-origin navegador → `/api` → FastAPI, incluido login y `Authorization`, con configuración y seed ficticios reproducibles.

## Capabilities

### New Capabilities

- `frontend-componentes`: componentes UI React reutilizables, accesibles y responsivos, proveedor de estado de servidor y utilidades de formulario para las futuras pantallas.
- `frontend-sesion`: login, representación de sesión derivada de un JWT, guardas de navegación por rol y respuestas cliente ante autenticación o autorización fallida.

### Modified Capabilities

- `frontend-foundation`: sustituir la identidad interna transitoria basada en cabeceras por el envío de Bearer JWT, y definir la separación de comportamiento entre requests protegidas y rutas públicas.

## Impact

- Afecta `frontend/src/` (cliente HTTP, router, providers, componentes, formularios, sesión y pruebas RTL) y `frontend/package.json`/lockfile para TanStack Query, React Hook Form y Zod.
- Consume sin cambiar `POST /login` ni las reglas de JWT definidas por `auth-jwt`; no modifica APIs de backend ni autorizaciones servidor.
- Consume la revisión 1 aprobada de `frontend/design-system/` en modo `system-only`; no requiere mockups por change.
- El token queda sólo en memoria, con cierre proactivo por `exp` y fallback 401; no hay refresh. Login y API se consumen por el proxy same-origin, sin depender de CORS del navegador.

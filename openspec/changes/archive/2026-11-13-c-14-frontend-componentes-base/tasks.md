# Tasks

## 1. Dependencias y base de integración

- [x] 1.1 Agregar TanStack Query, React Hook Form y Zod al frontend, actualizar el lockfile y verificar `npm ci` seguido de `npm run lint`.
- [x] 1.2 Montar una única configuración de QueryClient en la raíz y definir convenciones de claves e invalidación por recurso; verificar con pruebas Vitest de una mutación que invalida su consulta relacionada.
- [x] 1.3 Configurar Vite para que el navegador llame sólo bajo `/api`, reescribiendo/proxyando `POST /api/login` a FastAPI `POST /login` y el resto de `/api` a la API; conservar `/login` exclusivamente como ruta SPA. Verificar tempranamente con backend local que login y una request protegida con `Authorization: Bearer` atraviesan el proxy same-origin sin CORS.
- [x] 1.4 Normalizar `VITE_API_BASE_URL` para aceptar únicamente una base relativa bajo `/api` y resolver a `/api` cualquier valor vacío, absoluto, protocol-relative, de otro origen o relativo fuera del prefijo; agregar pruebas unitarias que demuestren que ninguna configuración puede dirigir una request API fuera de `/api`.

## 2. Componentes visuales y feedback

- [x] 2.1 Implementar `Button`, `TextField`, `Select` y `Card` con tokens/clases de `frontend/design-system/`, etiquetas, ayuda y errores accesibles; verificar sus variantes y `aria-invalid` con pruebas RTL.
- [x] 2.2 Implementar `EstadoBadge`, `EmptyState` y `Skeleton`; verificar en RTL las cinco etiquetas/indicadores de estado y los estados vacío y cargando.
- [x] 2.3 Implementar `DataTable` sin orden inicial, con columnas configuradas ordenables y `aria-sort`, vacío, carga y transformación responsive de filas en tarjetas/grilla hasta 46rem; verificar orden explícito, `aria-sort`, vacío/esqueleto y el layout en viewport móvil.
- [x] 2.4 Implementar `Modal` con focus trap, Escape y retorno de foco, y `Toast` con `role="status"` y auto-descarte pausado tanto al hover como al foco; verificar ambos comportamientos con RTL y temporizadores falsos.

## 3. Formularios compartidos

- [x] 3.1 Crear schemas y adaptadores de formulario para DNI, `duracion_min > 0` y `desde < hasta`; verificar que los valores inválidos bloquean el envío y anuncian el error asociado.
- [x] 3.2 Mapear los errores de campos HTTP 422 normalizados a los formularios; verificar en RTL que un error de API aparece en el campo correspondiente sin reemplazarse por un mensaje genérico.

## 4. Sesión JWT, cliente HTTP y navegación

- [x] 4.1 Reemplazar el estado transitorio de rol/sucursal y los headers `X-Actor-Rol`, `X-Actor-Usuario` y `X-Sucursal-Id` por una sesión JWT estrictamente en memoria; verificar que una request protegida sólo envía `Authorization: Bearer` y que una recarga completa requiere login de nuevo.
- [x] 4.2 Implementar la ruta SPA `/login` y su formulario validado contra `POST /api/login`, contexto de sesión y lectura de rol/sucursal de la respuesta; verificar login exitoso, retorno seguro a una ruta interna permitida y los errores 401, 403 y 422 sin exponer contraseñas.
- [x] 4.3 Leer `exp` del access token y cerrar proactivamente la sesión al vencer; verificar con temporizadores falsos que se limpia la sesión y se navega al login, y que no se implementa refresh.
- [x] 4.4 Integrar el fallback 401 y el manejo 403 del cliente: 401 limpia sesión y vuelve al login sin reintento; 403 conserva sesión y comunica permiso insuficiente; verificar ambos flujos con pruebas del cliente y RTL.
- [x] 4.5 Añadir guardas para que `recepcion` navegue toda ruta interna y `odontologo` sólo `/agenda`, manteniendo las rutas públicas fuera de sesión; verificar redirección anónima a `/login` con retorno sólo a destinos internos permitidos, redirección autenticada prohibida a `/agenda` con aviso, y acceso anónimo a reserva, confirmación y cancelación.
- [x] 4.6 Extender el login para detectar exclusivamente el 422 de C-24 `detail.causa=sucursal_requerida` con su `detail.detalle` documentado, solicitar una `sucursal_id` UUID mediante un control seguro sin enumerar ni probar asociaciones y reintentar una sola vez con `{ dni, password, sucursal_id }`; verificar en RTL/cliente el 422, el body de reintento, el 403 `sucursal_no_asociada`, la sesión anónima y que credenciales/ID no se persisten ni se exponen en URL o logs.
- [x] 4.7 Endurecer el límite de cabeceras de `apiRequest`: eliminar de `opciones.headers`, sin distinguir mayúsculas/minúsculas, `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` y todo `Authorization` antes de armar la request; sólo una request protegida con sesión válida puede agregar el Bearer de esa sesión y una pública no puede enviar identidad. Agregar pruebas unitarias con cabeceras inyectadas para ambos tipos de request, verificando que el Bearer del llamador tampoco atraviesa.

## 5. Verificación integrada

- [x] 5.1 Ejecutar y corregir `npm run lint`, `tsc -b`, `npm run build` y `npm run test:run`; verificar además que no quedan referencias ni envío de los headers de identidad retirados.
- [x] 5.2 Con backend local, usar un `SECRET_KEY` ficticio de 32+ caracteres, una `DATABASE_URL` terminada en `turnos_test`, migraciones aplicadas y el seed de C-24 documentado en `backend/app/seed/usuario.py` (DNI `USUARIO-FICT-001`, contraseña aportada por `SEED_USUARIO_PASSWORD` o impresa una vez por el seed). Repetir la prueba manual de `POST /api/login` y una ruta protegida, inspeccionar consola y requests del navegador, y documentar el resultado same-origin sin CORS ni registrar credenciales.
- [x] 5.3 Repetir los gates de lint, tipos, build y tests tras 1.4 y 4.6; verificar manualmente contra un usuario ficticio multi-sucursal que el 422 `sucursal_requerida` no inicia sesión, que el reintento con una sucursal asociada llega a 200 por `/api/login`, y que una configuración hostil de `VITE_API_BASE_URL` sigue produciendo tráfico same-origin bajo `/api`, sin registrar secretos.
- [x] 5.4 Hacer reproducible la prueba de integración del proxy con un backend falso en puerto efímero/configurable, sin ocupar ni depender de `127.0.0.1:8000` cuando Uvicorn esté activo; restaurar la configuración temporal y realizar cleanup idempotente/condicional de Vite y del backend aun si falla `beforeAll`, sin ocultar el error primario. Verificar la suite completa con un proceso independiente escuchando en 8000 y confirmar que los dos rewrites siguen pasando.

## Workflow follow-up

- No implementar refresh token: requiere un change backend futuro con contrato de emisión, rotación y revocación.
- Aplicar el change sólo mediante una solicitud explícita de `/opsx-apply`.

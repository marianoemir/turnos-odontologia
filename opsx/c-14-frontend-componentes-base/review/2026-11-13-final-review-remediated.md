# Revisión final C-14 — remediaciones 4.7 y 5.4

Fecha: 2026-11-13  
Alcance: revisión read-only posterior a las tareas 4.7 y 5.4. No se modificó código, configuración de producto, tareas, commits ni estado de archive.

## Veredicto

**Listo para archivar. Sin bloqueadores.**

## Evidencia revisada

- `frontend/src/services/http.ts:34-121` construye `Headers`, elimina de forma case-insensitive `Authorization`, `X-Actor-Rol`, `X-Actor-Usuario` y `X-Sucursal-Id`, y sólo agrega el Bearer de `getSession()` cuando la request no es pública.
- `frontend/src/services/http.test.ts:183-210` prueba que una request protegida descarta identidad inyectada y usa sólo el Bearer de sesión; `:236-262` prueba que una pública descarta toda identidad inyectada, incluso `AUTHORIZATION` en mayúsculas.
- `frontend/src/services/vite-proxy.integration.test.ts:67-112` levanta backend falso en puerto efímero, permite que 8000 esté ocupado, restaura `VITE_API_PROXY_TARGET` y hace teardown condicional/idempotente con `Promise.allSettled`; `:119-150` conserva los rewrites `/api/login` → `/login` y `/api/*`.
- `frontend/vite.config.ts:5-22` toma el target temporal sólo para el proxy de desarrollo y mantiene `/api` como único prefijo proxyado; `frontend/src/services/config.ts:1-39` conserva la normalización same-origin bajo `/api`.
- El contrato de login/multi-sucursal de C-24 se mantiene en `frontend/src/auth/login.ts:16-40` y está cubierto en `frontend/src/auth/login.test.tsx:95-263`; las rutas públicas permanecen fuera de la guarda en `frontend/src/app/router.tsx:56-63`.
- Se contrastó con `openspec/changes/archive/2026-11-13-c-24-auth-jwt/specs/auth-jwt/spec.md:57-67,81-125,181-203`.

## Verificación fresca

Con un proceso independiente escuchando en `127.0.0.1:8000`, desde `frontend/`:

- `npm run test:run`: 24 archivos, 120 pruebas aprobadas.
- `npm run lint`: aprobado.
- `npx tsc -b`: aprobado.
- `npm run build`: aprobado (203 módulos transformados).
- `git diff --check`: aprobado; sin errores de whitespace.

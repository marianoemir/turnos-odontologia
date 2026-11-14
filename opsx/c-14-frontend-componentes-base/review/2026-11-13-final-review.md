# C-14 — revisión final read-only

Fecha: 2026-11-13

## Veredicto

**Sin blockers funcionales en los dos bloqueos previos; no recomiendo archivar todavía sin resolver los importantes siguientes.**

La implementación satisface el contrato C-24 de multi-sucursal: reconoce exclusivamente el `422` exacto, mantiene la sesión anónima, solicita un UUID manual sin enumerar asociaciones y reintenta con el body correcto. La normalización de `VITE_API_BASE_URL` impide que la base de la API salga de `/api` same-origin. No encontré persistencia de sesión ni envío automático de cabeceras heredadas.

## Blockers

- Ninguno.

## Importantes

1. **La capa HTTP no impone la eliminación de cabeceras de identidad inyectadas por el llamador.**  
   `frontend/src/services/http.ts:103-111` copia `opciones.headers` y sólo añade `Authorization` para una sesión; no elimina `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` ni un `Authorization` proporcionado a una request `publica`. Por lo tanto, un consumidor futuro puede vulnerar el contrato C-14 de requests públicas sin identidad y de retirada de las cabeceras legacy. Las pruebas (`frontend/src/services/http.test.ts:157-205`) cubren sólo el caso sin cabeceras suministradas.

2. **La prueba de integración del proxy no es reproducible con el backend local activo y su cleanup encubre el error primario.**  
   `frontend/src/services/vite-proxy.integration.test.ts:32-48` reserva fijo `127.0.0.1:8000`; con ese puerto ocupado, `beforeAll` falla con `EADDRINUSE` y `afterAll` intenta `vite.close()` cuando `vite` no fue creado. En esta revisión, `npm run test:run` produjo 116 pruebas aprobadas, 2 omitidas y 1 suite fallida por ese motivo. Debe usar un puerto disponible/configurable y cleanup condicional para que el gate no dependa de detener un backend legítimo.

## Nits

- Ninguno.

## Evidencia

- Contrato C-24 cotejado: `backend/app/auth/router.py:124-144`.
- Multi-sucursal exacta, retry UUID y anonimato/ausencia de storage cubiertos en `frontend/src/pages/login.tsx:23-80` y `frontend/src/auth/login.test.tsx:95-263`.
- Same-origin normalizado y probado en `frontend/src/services/config.ts:5-31` y `frontend/src/services/config.test.ts:10-46`; evidencia manual registrada en `openspec/changes/c-14-frontend-componentes-base/design.md:86`.
- Sesión en memoria, expiry y guardas revisados en `frontend/src/auth/session.ts`, `frontend/src/auth/session-expiry.tsx`, `frontend/src/auth/protected-route.tsx` y sus pruebas.
- Búsqueda del código de aplicación: sin storage ni referencias activas a headers legacy; sólo fixtures/aseveraciones de tests.
- Verificación fresca: `npm run lint`, `npx tsc -b` y `npm run build` pasaron; build Vite transformó 203 módulos. `npm run test:run` no completó exclusivamente por la colisión de puerto indicada.

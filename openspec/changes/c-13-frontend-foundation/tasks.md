# Tasks — C-13 `frontend-foundation`

> Orden TDD: cada task declara su RED (la verificación que falla primero), el GREEN mínimo y el
> comando exacto que la cierra. Todas las tasks se ejecutan desde `frontend/` salvo las que indican
> otra ruta. No se toca `backend/` ni `CHANGES.md`.
>
> **Red de seguridad** (solo aplica a archivos existentes): antes de modificar
> `package.json`, `tsconfig.app.json`, `.oxlintrc.json`, `index.html`, `README.md`,
> `src/main.tsx`, `.env.example`, `vite.config.ts`, `.github/workflows/tests.yml` o
> `docker-compose.yml`, correr la línea base y anotarla:
> `npm ci && npm run lint && npx tsc -b && npm run build` (verde hoy con Node v24.19.0).

## 1. Arnés de tests y gates de tipos

- [x] **1.1 Instalar dependencias y configurar Vitest + Testing Library**
  - RED: crear `src/services/config.test.ts` que importa `API_BASE_URL` desde `./config`; `npm run test` falla porque el script no existe y el módulo tampoco.
  - GREEN: agregar `react-router-dom`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`; scripts `test` (`vitest`) y `test:run` (`vitest run`); `vitest.config.ts` con `environment: "jsdom"` y `src/test/setup.ts` que importa `@testing-library/jest-dom/vitest`; `src/services/config.ts` con `API_BASE_URL` leyendo `import.meta.env.VITE_API_BASE_URL` y default `/api`.
  - La misma task declara `"engines": { "node": "^20.19.0 || >=22.12.0" }` en `package.json` (design D8).
  - Verify: `npm run test:run` verde con 2 casos (`vi.stubEnv` con valor definido y sin valor → `/api`); `npm pkg get engines.node` devuelve el rango; `package-lock.json` commiteado junto con `package.json`.

- [x] **1.2 Forzar "sin `any`": `strict` explícito + regla de oxlint**
  - RED: crear **dos** probes temporales, uno por capa, porque cada herramienta cubre un caso distinto. (a) `src/__any_probe__.ts` con `const probe: any = 1; export default probe` (`any` explícito): `npm run lint` pasa y `npx tsc -b` **también** pasa — TypeScript acepta `any` escrito a mano incluso con `strict`, así que el chequeo de tipos no es el gate de esta capa. (b) `src/__implicit_any_probe__.ts` con `export const f = (x) => x` (`any` implícito): `npm run lint` pasa y `npx tsc -b` pasa mientras `noImplicitAny` esté apagado. Falla el gate que no existe, no el archivo.
  - GREEN: `"strict": true` en `tsconfig.app.json` y `"typescript/no-explicit-any": "error"` en `.oxlintrc.json` (el id existe: `node_modules/oxlint/configuration_schema.json:7979`).
  - Verify: con `src/__any_probe__.ts` presente, `npm run lint` **falla** (regla `typescript/no-explicit-any`) y `npx tsc -b` **pasa** (el `any` explícito no es un error de tipos: si `tsc` fallara, la causa es otra). Con `src/__implicit_any_probe__.ts` presente, `npx tsc -b` **falla** con TS7006 ("Parameter 'x' implicitly has an 'any' type") y `npm run lint` **pasa**. Borrar los dos probes (no se commitean) y confirmar `npm run lint` + `npx tsc -b` en verde. Si algún probe pasa donde debía fallar, esa capa no está implementada: no continuar.
  - Nota: si el probe implícito ya falla `npx tsc -b` en el RED, `strict`/`noImplicitAny` ya estaban activos por otra vía; entonces hay que corregir en `design.md` la frase "strict es `false`" (D7, "Corrección condicional del diagnóstico") citando la fuente real, antes de seguir.

## 2. Contratos de datos

- [x] **2.1 Tipos espejo de los schemas de lectura**
  - RED: `src/types/api.test.ts` usa `expectTypeOf` de `vitest` para exigir igualdad exacta de tipo, por entidad y sobre la forma de la respuesta real: `expectTypeOf<Paciente>().toEqualTypeOf<{...}>()`, y lo mismo para `Profesional`, `SillonBox`, `Prestacion`, `HorarioAtencion`, `Bloqueo` y `Turno` (incluidos los campos nulos); más un `// @ts-expect-error` sobre un objeto al que le falta un campo obligatorio. `npx tsc -b` falla porque `./api` no existe: el contrato todavía no está escrito.
  - GREEN: `src/types/api.ts` con los campos de `PacienteOut` (`backend/app/agenda/schemas.py:60-68`), `ProfesionalOut` (`:103-110`), `SillonOut` (`:136-142`), `PrestacionOut` (`:168-174`), `HorarioOut` (`:223-231`), `BloqueoOut` (`:251-259`) y `TurnoOut` (`backend/app/turnos/schemas.py:23-34`). `SillonBox` se exporta como alias de `Sillon` (design Q3). `desde`/`hasta` de `HorarioAtencion` son `string` `"HH:MM:SS"`, no `Date`.
  - Verify: `npx tsc -b` verde **y** `npm run test:run` verde. La comprobación es de compilación, no de claves en runtime: un campo de más, de menos o con otro tipo rompe `tsc -b`, y el `@ts-expect-error` falla como "Unused '@ts-expect-error' directive" si el tipo se afloja (un `any` o una firma de índice lo silenciaría, y por eso se detecta). `expectTypeOf` no ejecuta nada: su valor está en que `tsc -b` lo revisa. Chequeo cruzado manual: cada campo se compara contra la línea del schema citado.

- [x] **2.2 `EstadoTurno` como unión y mapeo exhaustivo**
  - RED: test que exige `ESTADO_TURNO_LABELS` con las 5 claves de `backend/app/turnos/models.py:27-33` y que cada etiqueta sea no vacía; falla porque no existe.
  - GREEN: `EstadoTurno` como unión de los 5 valores y `ESTADO_TURNO_LABELS` con un `switch` que termina en `never`.
  - Verify: `npm run test:run` + `npx tsc -b` verdes. Prueba de exhaustividad: agregar temporalmente un sexto estado a la unión → `npx tsc -b` falla por rama no cubierta → revertir.

## 3. Cliente HTTP

- [x] **3.1 Normalizador de las cuatro formas de error**
  - RED: `src/services/api-error.test.ts` con una tabla de fixtures: 409 `{causa:"profesional",detalle:...}`, 409 con campo extra `accion_previa`, 404 `detail` string, 422 `detail` string, 422 `detail` lista `[{loc,msg,type}]`, 422 `{causa:"rol_desconocido"}`, 403 `{causa:"permiso_denegado"}`, cuerpo vacío y cuerpo HTML. Falla porque el módulo no existe.
  - GREEN: `src/types/errors.ts` (`ApiError`, `CampoError`, `ApiErrorKind`) y `src/services/api-error.ts` discriminando por `typeof detail` (design D5), leyendo solo `causa`/`detalle` e ignorando claves extra; cuerpo entra como `unknown` y se estrecha, sin `any`.
  - Verify: `npm run test:run` verde; los 9 casos producen el `kind` esperado y ningún `any` aparece en el archivo (`npm run lint` en verde).

- [x] **3.2 Wrapper de `fetch` con timeout, aborto y cabeceras**
  - RED: `src/services/http.test.ts` con `fetch` stubbeado (`vi.stubGlobal`): 201 con JSON → valor tipado; 409 → `ApiError` de conflicto; `fetch` rechaza con `TypeError` (red caída) → `kind: "red"`; respuesta con cuerpo no JSON → `kind: "red"`; rechazo con `TimeoutError` (lo que produce `AbortSignal.timeout`) → `kind: "timeout"`; `AbortController` del llamador disparado → `kind: "red"`; la request incluye `X-Actor-Rol` y `Content-Type: application/json`.
  - GREEN: `src/services/http.ts` con `AbortSignal.timeout(ms)` combinado con la señal del llamador (`AbortSignal.any`), discriminación por `error.name` antes de parsear el cuerpo (`TimeoutError` → `'timeout'`; `AbortError` → `'red'`; `TypeError` → `'red'`; mapeo exacto en design D5), parseo JSON tolerante (cuerpo ilegible → `'red'`) y delegación en el normalizador de 3.1.
  - Verify: `npm run test:run` verde; `npx tsc -b` verde; cada una de las cuatro causas de D5 (timeout, aborto del llamador, red caída, cuerpo no JSON) produce el `kind` indicado en la tabla, y el `mensaje` de timeout y de aborto se distingue.

- [x] **3.3 Punto de enganche del rol para C-14**
  - RED: `src/services/role.test.ts`: sin selección `getActiveRole()` es `"recepcion"`; `setActiveRole("odontologo")` cambia el valor; `setActiveRole("inventado")` no lo cambia. Falla porque no existe.
  - GREEN: `src/services/role.ts` con `getActiveRole`/`setActiveRole`, unión `Rol` derivada de `ROLES` (`backend/app/rbac/permissions.py:10`) y validación en `setActiveRole` (design D4). Sin `localStorage`: eso es de C-14.
  - Verify: `npm run test:run` verde.

- [x] **3.4 Cabeceras de identidad en las requests (rol y sucursal)**
  - RED: `src/services/http.test.ts` (ampliar) y `src/services/sucursal.test.ts`: sin sucursal seleccionada la request **no** incluye `X-Sucursal-Id`; tras `setActiveSucursalId("<uuid>")` la incluye con ese valor; cambiar la sucursal entre dos requests hace que la segunda envíe el valor nuevo (se lee por request, no al construir el cliente); `setActiveSucursalId("no-es-uuid")` no aplica el valor y `setActiveSucursalId(null)` la vuelve a omitir; una request a ruta pública no incluye `X-Actor-Rol` **ni** `X-Sucursal-Id`. Falla porque `services/sucursal.ts` y esas ramas de `http.ts` no existen.
  - GREEN: `src/services/sucursal.ts` con `getActiveSucursalId(): string | null` y `setActiveSucursalId(id: string | null): void` —estado de módulo, `null` inicial, validación de formato UUID con regex, sin `localStorage` (eso es de C-14/C-22)—; `http.ts` lee rol y sucursal en cada request (no al construirse) y acepta una opción explícita para rutas públicas (design D4).
  - Verify: `npm run test:run` verde; `npx tsc -b` verde; ningún test deja estado de sucursal entre casos (reset en `beforeEach`).

## 4. Ruteo, shell y sistema visual

- [x] **4.1 Cablear `tokens.css` en el punto de entrada**
  - RED: `npm run build` y luego buscar los tokens en el CSS emitido (`dist/assets/*.css`) no encuentra `--surface-page` ni `--brand-600`: el sistema visual no está aplicado.
  - GREEN: `src/main.tsx` importa `../design-system/tokens.css` (ruta relativa, dentro del root de Vite; `frontend/design-system/README.md:65-71`).
  - Verify: `npm run build` verde y `dist/assets/*.css` contiene `--surface-page` y `--brand-600`. Chequeo manual en `npm run dev`: el fondo es papel cálido y la tipografía del sistema, no los del scaffold.
  - Nota (2026-11-10, alcance agregado autorizado por el usuario): el chequeo manual no podía pasar con el scaffold intacto, porque `src/index.css` definía tokens propios (`--bg: #fff`, `--border`, …), `background: var(--bg)` en `:root`, `#root` a 1126px centrado y `h1` a 56px. En esta task `src/index.css` se reemplaza por la base mínima de `design-system/components.html:18-29` (`body` + `var(--token)`, sin definir tokens). `App.css` y los assets siguen siendo de 5.3.

- [x] **4.2 Tabla de rutas y binding de parámetros**
  - RED: `src/app/router.test.tsx` renderiza el router en cada una de las 11 rutas declaradas y espera el encabezado de su pantalla; falla porque no hay router.
  - GREEN: `src/app/router.tsx` con las 11 rutas y `src/pages/` con una pantalla placeholder por ruta; las rutas con parámetro leen `useParams()`.
  - Verify: `npm run test:run` verde para las 11 rutas; test que navega a `/hc/abc` y verifica que la pantalla recibe `pacienteId === "abc"`.

- [x] **4.3 No encontrado y parámetro ausente**
  - RED: test que navega a `/ruta-inexistente` y a `/hc/` esperando el texto de "No encontrado" **y** la navegación del shell visible (los cuatro enlaces del nav, design D12); falla.
  - GREEN: ruta catch-all `*` → `not-found.tsx`, y una ruta sin el segmento obligatorio cae en el catch-all sin lanzar. El `not-found` se renderiza **dentro** del `<Outlet/>` del shell (D10), no como ruta hermana del layout.
  - Verify: `npm run test:run` verde; en los **dos** casos el test afirma además que la navegación sigue visible y operable (los cuatro enlaces presentes y con su `href`) y que la consola del test no registra errores no capturados.
  - Nota (2026-11-10, inversión autorizada por el usuario): esta task se ejecuta **después** de 4.4. Su RED y su Verify exigen la navegación del shell (design D12), que nace en 4.4; con el orden literal 4.3 → 4.4 la verificación no era satisfacible.

- [x] **4.4 Shell interno: navegación, topbar y estilos propios**
  - RED: test que renderiza `/agenda` y espera los cuatro enlaces con su destino —Agenda → `/agenda`, Pacientes → `/catalogo/pacientes`, Sillones → `/catalogo/sillones`, Caja → `/caja`— más el nombre de marca; falla.
  - GREEN: `src/app/shell.tsx` traducido de `components.html` §Navegación (líneas 1016-1049), con `NavLink` a esas rutas y el nombre de marca en una constante de la app (`design-system/README.md:75`); `src/app/shell.css` importado por el shell, con `.app-shell`, `.side`, `.side__brand`, `.side__label`, `.side__group`, `.side__link` (`:hover` y `[aria-current="page"]`), `.app-main` y `.app-title` copiados de `components.html:372-394`, más la regla base `.ico` de `components.html:195` (única regla tomada de fuera de ese rango), referenciando solo `var(--token)` y sin redefinir tokens (design D12).
  - Verify: `npm run test:run` verde; `Select-String -Path src/app/shell.css -Pattern "@media|\.app-shell|\.side__link"` encuentra las reglas y `Select-String -Path src/app/shell.css -Pattern "^\s*--[a-z0-9-]+\s*:"` **no** encuentra definiciones de tokens; `npm run build` verde y `dist/assets/*.css` contiene `.side__link` y `.app-shell`.
  - Nota (2026-11-11, hallazgo del chequeo visual): los íconos del nav se veían enormes porque `.ico` vive en `components.html:195`, fuera del rango 372-394 que citaba D12. Se amplía esta task para copiar **sólo** esa regla de fuera del rango (nada de `.ico--sm` ni del resto de `components.html`); el resto sigue saliendo de `:372-394` y la media query de 4.7. Su RED es `src/app/shell-css.test.ts`, que lee `shell.css` y falla si falta el bloque `.ico` con `width` y `height`.

- [x] **4.5 Límite de error dentro del shell**
  - RED: test que monta el shell con un hijo que lanza durante el render y espera el fallback **y** la navegación visible; falla.
  - GREEN: `src/app/error-boundary.tsx` (class component con `getDerivedStateFromError`) montado dentro del shell, no por fuera.
  - Verify: `npm run test:run` verde; `console.error` del error esperado silenciado en el test.

- [x] **4.6 Layout público sin navegación interna**
  - RED: test que renderiza `/reservar/abc`, `/confirmar/abc` y `/cancelar/abc` y afirma que **no** existe el landmark de navegación interna; falla.
  - GREEN: `src/app/public-layout.tsx` y las tres rutas anidadas bajo él (design D10).
  - Verify: `npm run test:run` verde.

- [x] **4.7 Navegación compacta ≤46rem**
  - RED: el CSS emitido no contiene la regla de 46rem para la navegación del shell; falla.
  - GREEN: `@media (max-width: 46rem)` copiada de `components.html:396-402` a `src/app/shell.css` (`.app-shell` a una columna, `.side` como franja inferior, `.side__group` en flex con wrap, `.side__label` oculta, `.app-main` con padding reducido); no va en `tokens.css` y no redefine tokens (design D12).
  - Verify: `npm run build` y `grep -c "46rem" dist/assets/*.css` ≥ 1, con `.side__group` y `.side__label` dentro de ese bloque; chequeo manual a 390×844: `document.documentElement.scrollWidth === window.innerWidth` y la navegación se ve como franja compacta.
  - Nota (2026-11-11): el Verify original pedía `grep -c "@media (max-width: 46rem)" dist/assets/*.css` = 1. El minificador de Vite 8 reescribe la consulta a sintaxis de rango (`@media (width<=46rem)`), así que ese literal da 0 aunque la regla esté emitida una sola vez y completa. Se verifica buscando `46rem` en el CSS emitido y revisando que `.side__group` y `.side__label` estén dentro de ese bloque.

- [x] **4.8 Proxy de desarrollo en `vite.config.ts`**
  - RED: con el backend levantado (`docker compose up -d api`, o `python -m uvicorn backend.app.main:app --port 8000` desde la raíz del repo) y `npm run dev` en marcha, `curl localhost:5173/api/health` **no** devuelve `{"status":"ok"}`: sin `server.proxy`, Vite responde el `index.html` del SPA (200 HTML), porque `/api/health` no es un asset del proyecto.
  - Nota (2026-11-11): el comando original (`uvicorn app.main:app --port 8000` desde `backend/`) no arranca: `backend/app/main.py` importa `backend.app.*`, así que sin la raíz del repo en el path falla con `ModuleNotFoundError: No module named 'backend'`. Desde la raíz el arranque es `python -m uvicorn backend.app.main:app --port 8000` (requiere las dependencias de `backend/requirements.txt` instaladas).
  - GREEN: `vite.config.ts` con `server.proxy: { "/api": { target: "http://localhost:8000", rewrite: (path) => path.replace(/^\/api/, "") } }` (design D1). Es la contraparte de desarrollo del `location /api/` de nginx (design D3): mismo prefijo, mismo rewrite que deja `/health`.
  - Verify: `curl localhost:5173/api/health` → `{"status":"ok"}` con el backend levantado; `curl -s -o /dev/null -w "%{http_code}" localhost:5173/reservar/abc` → 200 con HTML (las rutas del SPA **no** se proxean, D1); con el backend abajo el proxy responde 500/502 y no el HTML del SPA, de modo que el fallo es visible y no silencioso.

## 5. Empaquetado y distribución

- [ ] **5.1 `Dockerfile` multi-stage y configuración de nginx**
  - RED: `docker build -t turnos-web frontend` falla: no existe `frontend/Dockerfile`.
  - GREEN: stage build (Node 24, `npm ci`, `ARG VITE_API_BASE_URL=/api`, `npm run build`) → stage nginx que copia `dist/`; `frontend/nginx.conf` con `location /api/` (`proxy_pass http://api:8000/`) declarado antes de `location /`, y `try_files $uri $uri/ /index.html` con `index.html` en `no-cache` (design D3); `.dockerignore` con `node_modules`, `dist`, `.env`.
  - Verify: `docker build` verde; `docker run --rm --add-host api:127.0.0.1 -p 8080:80 turnos-web` (el `--add-host` es necesario: fuera de la red de compose nginx no resuelve `api` y no arranca) y `curl -I localhost:8080/` → 200; `curl -I localhost:8080/turnos/nuevo` → 200 (no 404); `curl localhost:8080/api/health` → 502 (esperado: no hay backend detrás de ese `docker run`); `asset=$(curl -s localhost:8080/ | grep -o '/assets/[^"]*\.css' | head -1); curl -s "localhost:8080$asset" | grep -c -- "--surface-page"` ≥ 1 (el CSS que sirve nginx conserva los tokens del design system: prueba que `tokens.css` entró al bundle y que nginx entrega el asset real y no el `index.html` del fallback).

- [ ] **5.2 Servicio `web` en la composición y `.env.example`**
  - RED: `docker compose config --services` no lista `web`; `.env.example` sigue con `http://localhost:8000`.
  - GREEN: servicio `web` en `docker-compose.yml` (`build: frontend` con `args: VITE_API_BASE_URL: ${VITE_API_BASE_URL:-/api}`, puerto publicado, `depends_on: api`) y `.env.example` con `VITE_API_BASE_URL=/api` (design D2).
  - Verify: `docker compose config --services` lista `postgres`, `api` y `web`; `docker compose up -d --build web` y `curl -I localhost:<puerto>/` → 200 con el `<title>` de marca; `curl localhost:8080/api/health` → `{"status":"ok"}` con `api` y `postgres` arriba (chequeo completo del proxy `/api`, solo posible vía compose).
  - Nota (2026-11-12): 5.1 y 5.2 quedan `[ ]` a propósito: se escribieron sin Docker disponible y las verifica quien lo tenga (Mariano). Dos precisiones: (1) el `.env.example` de la task es `frontend/.env.example`; el de la raíz nunca tuvo `VITE_API_BASE_URL`. (2) El Verify de 5.1 se ajustó con `--add-host api:127.0.0.1`: nginx resuelve `api` al cargar la config y sin la red de compose el contenedor no arranca; el chequeo de `/api/health` con respuesta `{"status":"ok"}` se hace por compose.

- [x] **5.3 Limpieza del scaffold y documentación**
  - RED: `Select-String -Path frontend/src/*,frontend/index.html -Pattern "hero.png|react.svg|vite.svg|icons.svg|App.css"` encuentra referencias, y `index.html:7` tiene `<title>frontend</title>`.
  - GREEN: `<title>` con el nombre de marca de `design-system/brand.js:14`; borrar `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`; conservar `public/favicon.svg` (`index.html:5`); reescribir `README.md` con scripts, estructura, variables de entorno, cómo correrlo, el proxy `/api` y la advertencia de que `VITE_API_BASE_URL` exige rebuild.
  - Verify: el `Select-String` del RED no devuelve coincidencias; `npx tsc -b` y `npm run build` verdes después de borrar.
  - Nota (2026-11-10): `src/index.css` ya se redujo a la base mínima dentro de 4.1 (alcance agregado autorizado); 5.3 no lo borra, solo confirma que no reintroduce tokens ni valores del scaffold.
  - Nota (2026-11-11, alcance agregado autorizado por el usuario): dos ampliaciones y un hallazgo. (1) Se borra también `src/App.tsx`: es un archivo huérfano (grep recursivo de imports `from "./App"` → 0 coincidencias) y, con `main.tsx` montando el router desde 4.1, no participa del bundle; `tsc -b` y `build` quedan verdes sin él. (2) En `index.html`, además del `<title>` de marca (`design-system/brand.js:14` → "Agenda Odontológica"), se cambia `lang="en"` por `lang="es"` (la aplicación es en español; `brand.js` declara `es-AR`). **Hallazgo:** en esta revisión del scaffold `src/App.tsx` **no importa** `App.css` ni los assets, y `icons.svg` tampoco se referencia en `index.html`; el `Select-String` del RED devuelve **0 coincidencias** antes del borrado, así que esa parte del RED no distingue estados (la premisa "App.tsx importa App.css y los assets" no aplica a este repo). El RED que sí discriminaba era `<title>frontend</title>` en `index.html:7`, y el GREEN se confirma con `npm run lint`, `npx tsc -b`, `npm run build` y `npm run test:run` (86 tests) verdes. `README.md` se reescribió en español con scripts, estructura real de `src/`, `VITE_API_BASE_URL` (default `/api`, de tiempo de build), `npm ci` + `npm run dev`, el proxy `/api` de `vite.config.ts` hacia `http://localhost:8000` con rewrite, el rango de `engines` y los cuatro gates; no documenta Docker/nginx ni el servicio `web` porque 5.1 y 5.2 siguen pendientes.

## 6. Integración continua y cierre

- [ ] **6.1 Job `frontend` en `.github/workflows/tests.yml`**
  - RED: `Select-String -Path .github/workflows/tests.yml -Pattern "frontend:"` no encuentra el job; el archivo solo tiene `tests` y `lint` (líneas 8 y 35). Además, la suite de Vitest existe desde 1.1 pero **ningún** gate automático la ejecuta: un test rojo pasa el CI en verde.
  - GREEN: job `frontend` con `actions/checkout@v4`, `actions/setup-node@v4` (`node-version: "24"`, `cache: npm`, `cache-dependency-path: frontend/package-lock.json`), `working-directory: frontend` y **cinco** pasos en este orden: `npm ci`, `npm run lint`, `npx tsc -b`, `npm run build`, `npm run test:run`, sin `continue-on-error` (design D9; la spec exige los tests en CI).
  - Verify: el YAML parsea (`python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/tests.yml'))"`); el job corre en verde en el PR; romper a propósito cada gate hace fallar el job: un `any` explícito en `src/` (lint), un error de tipos (tsc), un import roto (build) y un `expect` falso en un test (`test:run`).
  - Nota de alcance: el quinto paso **agranda en uno el alcance de C-13 registrado en `CHANGES.md`** (rev. 10 describe cuatro pasos). La decisión es provisoria y requiere confirmación del equipo; no se edita `CHANGES.md` desde este change (design D9).

- [x] **6.2 Verificación final del change**
  - Verify: desde `frontend/`: `npm ci`, `npm run lint`, `npx tsc -b`, `npm run build`, `npm run test:run` — los cinco en verde. Desde la raíz: `git status --short` sin `__any_probe__`, `__implicit_any_probe__` ni `dist/`; `git diff --stat` sin archivos de `backend/` ni `CHANGES.md`; `cmd /c "openspec validate c-13-frontend-foundation --strict"` → válido.

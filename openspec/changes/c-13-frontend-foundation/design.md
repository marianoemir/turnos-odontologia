# Design — C-13 `frontend-foundation`

## Context

Motivación en `proposal.md`. Estado actual verificado en el repo (citas archivo:línea):

- `frontend/` es el scaffold de Vite sin tocar: `src/App.tsx` muestra un placeholder, `src/main.tsx`
  solo importa `./index.css`, `index.html:7` tiene `<title>frontend</title>`, y `README.md:24` dice
  "sin tests; el frontend funcional queda como trabajo futuro".
- `frontend/package.json:6-11` tiene cuatro scripts (`dev`, `build`, `lint`, `preview`); **no hay
  script `test` ni campo `engines`**. `package-lock.json` no contiene `vitest` ni
  `@testing-library/*`.
- `frontend/tsconfig.app.json` no declara `strict` (no aparece en el archivo, líneas 1-26) y
  `frontend/.oxlintrc.json:4-7` solo activa dos reglas de React.
- `frontend/.env.example:1` ya existe con `VITE_API_BASE_URL=http://localhost:8000`.
- `.github/workflows/tests.yml` tiene exactamente dos jobs, `tests` (línea 8) y `lint` (línea 35),
  ambos de backend.
- `docker-compose.yml` solo define `postgres` y `api` (líneas 2 y 18); no hay servicio web ni
  `frontend/Dockerfile` (el único `Dockerfile` del repo es `backend/Dockerfile`).
- El design system está aprobado: `frontend/design-system/README.md:7-9`
  (`Mode: system-only`, `Revision: 1`, `Approval: approved (2026-10-28, by user)`) y
  `README.md:65-71` delega explícitamente en C-13 el import de `tokens.css` desde `src/main.tsx`.
- El backend no tiene CORS: `grep -r "CORS\|allow_origins" backend/app` no devuelve coincidencias,
  con control positivo `FastAPI()` en `backend/app/main.py:16`.
- Roles: `backend/app/rbac/permissions.py:10` → `ROLES = ("admin", "recepcion", "odontologo", "paciente")`.
  `backend/app/rbac/context.py:94-100` asume `recepcion` si falta `X-Actor-Rol`;
  `context.py:102-109` responde 422 `rol_desconocido` (comparación exacta, sin recortar);
  `context.py:76` y `:89` responden 422 `sucursal_invalida`; `backend/app/rbac/dependencies.py:38-44`
  responde 403 `permiso_denegado`.
- Formas de error del backend: 409 con `{"causa","detalle"}` (`backend/app/turnos/router.py:54-58`),
  404 con `detail` string (`turnos/router.py:60`), 422 de dominio con `detail` string
  (`turnos/router.py:61-62`), 422 de validación de FastAPI con `detail` lista
  `[{loc,msg,type}]`, y 422/403 de rol o sucursal con `{"causa","detalle"}`. Las causas de conflicto
  son `profesional`, `sillon`, `horario` y `bloqueo` (`backend/app/turnos/service.py:160-245`).
  `backend/app/recordatorios/router.py:55-63` agrega un campo extra `accion_previa` al mismo objeto.
- Colisión de paths: el backend ya publica `POST /confirmar/{token}` y `POST /cancelar/{token}`
  (`backend/app/recordatorios/router.py:66,75`), `GET /reservar/{profesional}`
  (`backend/app/reserva_online/router.py:65-66`) y `POST /reservar` (`:91`); el frontend declara
  `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` en la misma posición del árbol.

## Goals / Non-Goals

**Goals:**

- Una base que cualquier pantalla de C-14..C-22 pueda consumir sin reabrir decisiones de ruteo,
  tipado, errores, identidad o distribución.
- Que las decisiones dudosas (CORS, versión de Node, dureza de tipos) queden resueltas y forzadas por
  un gate ejecutable, no solo documentadas.

**Non-Goals:**

- Componentes de UI, estado de servidor y guard de ruta por rol (C-14).
- Cualquier cambio en `backend/` (incluido agregar CORS) y cualquier cambio en C-23.
- Autenticación real: `X-Actor-Rol` sigue siendo un supuesto de implementación, no un control de
  seguridad (rev. 8 de `CHANGES.md`).

## Decisions

### D1 — Proxy con prefijo `/api` en lugar de CORS

**Decisión:** el cliente usa una URL base **relativa con prefijo** (`/api`). En desarrollo la resuelve
el proxy de Vite (`server.proxy` → `http://localhost:8000`, con `rewrite` que quita `/api`); en el
contenedor la resuelve nginx (`location /api/` → `proxy_pass http://api:8000/`, donde la barra final
quita el prefijo). El backend no se toca.

**Por qué no CORS:**

1. `backend/app/main.py:16` construye `FastAPI()` sin `CORSMiddleware`; habilitarlo es un cambio de
   backend, y C-13 no modifica backend.
2. `X-Actor-Rol` y `X-Sucursal-Id` son cabeceras personalizadas: en origen cruzado disparan
   preflight `OPTIONS`, que sin CORS falla antes de llegar al endpoint. Aun con CORS habría que
   declarar `allow_headers` explícitos.
3. Con mismo origen no hay preflight, no hay `Origin`, y las cookies/credenciales futuras quedan
   abiertas sin reabrir la decisión.

**Por qué el prefijo es obligatorio (no un proxy por path "tal cual"):** el backend y el cliente
comparten paths exactos. `/reservar/{profesional}`, `/confirmar/{token}` y `/cancelar/{token}` son
rutas del SPA y también endpoints del backend (`recordatorios/router.py:66,75`,
`reserva_online/router.py:65-66`). Un proxy que reenviara `/reservar/*` al backend se comería la
navegación del paciente y devolvería JSON en lugar de la pantalla. El prefijo `/api` separa los dos
espacios de nombres por construcción, sin listas de excepciones que se desactualicen.

**Alternativas consideradas:**

- *CORS en el backend*: descartada (toca backend; preflight con cabeceras custom).
- *Proxy sin prefijo, con lista blanca de paths de API*: descartada (frágil; cada endpoint nuevo de
  C-14..C-22 obliga a editar la lista, y el path de API y el del SPA coinciden hoy).
- *Servir el frontend desde FastAPI (`StaticFiles`)*: descartada (acopla despliegue, contradice el
  `Dockerfile` multi-stage que pide C-13 y obliga a tocar backend).

### D2 — `VITE_API_BASE_URL` es variable de build; valor por defecto `/api`

Vite reemplaza `import.meta.env.VITE_*` **en tiempo de build**, no en runtime. En la imagen
multi-stage, el stage de build recibe `ARG VITE_API_BASE_URL` (default `/api`), lo exporta como `ENV`
y corre `npm run build`; el stage final (nginx) solo copia `dist/`. Consecuencias, todas aceptadas:

- Cambiar la URL de la API **exige reconstruir la imagen**. Es el costo de un artefacto estático; la
  alternativa (runtime config con `envsubst` sobre un `config.js`) agrega un paso de arranque y un
  archivo mutable en la imagen, y no lo pide el alcance.
- El default `/api` es el valor que **funciona en los dos entornos sin configuración**: en dev lo
  resuelve el proxy de Vite y en el contenedor el de nginx. Por eso `.env.example` pasa de
  `http://localhost:8000` a `/api`: con el valor absoluto, `npm run dev` apuntaría a origen cruzado y
  fallaría por falta de CORS (D1).
- El compose pasa el valor como **build arg**, no como `environment`: una variable de entorno en
  runtime no tiene efecto sobre un bundle ya compilado y sugeriría lo contrario.

### D3 — Fallback de ruteo en nginx

`try_files $uri $uri/ /index.html;` en `location /` para que una recarga directa de `/turnos/nuevo`
devuelva el `index.html` y el router del cliente resuelva la pantalla (sin esto, nginx responde 404 en
toda ruta interna recargada). El orden importa: `location /api/` se declara **antes** y gana por
prefijo más específico, de modo que el fallback de la SPA nunca capture las llamadas a la API; los
assets con hash de Vite los resuelve `$uri` y no llegan al fallback. El `index.html` se sirve con
`Cache-Control: no-cache` para que un despliegue nuevo no quede pegado a un bundle viejo.

### D4 — Punto de enganche de identidad para C-14: rol y sucursal

C-13 no implementa el selector (es de C-14), pero define el **contrato** para que C-14 se enchufe sin
reescribir el cliente HTTP:

- Un módulo `services/role.ts` expone `getActiveRole(): Rol` y `setActiveRole(rol: Rol): void`, con
  `recepcion` como valor inicial. `Rol` es la unión derivada de `ROLES`
  (`backend/app/rbac/permissions.py:10`), no un `string`.
- El cliente HTTP lee el rol **en el momento de cada request** (no lo captura al construirse), así
  que cuando C-14 conecte el selector y `localStorage`, todas las requests cambian de rol sin tocar
  `http.ts`.
- El default `recepcion` replica el comportamiento del backend cuando falta la cabecera
  (`context.py:94-100`), así que la UI y la API coinciden incluso antes de que C-14 exista.
- `setActiveRole` valida contra `ROLES` y **no envía** un rol fuera de la lista: el backend compara
  exacto y responde 422 `rol_desconocido` (`context.py:102-109`), así que el error se previene en el
  cliente en vez de provocarse.
- **Sucursal, simétrica al rol:** un módulo `services/sucursal.ts` expone
  `getActiveSucursalId(): string | null` y `setActiveSucursalId(id: string | null): void`, con `null`
  como valor inicial. Se elige un módulo y no una opción por llamada porque el valor tiene el mismo
  ciclo de vida que el rol (una selección por sesión que C-14/C-22 conectan al selector): pasarlo por
  parámetro obligaría a enhebrarlo en cada llamada de C-15..C-22 y a repetir el default en cada sitio.
- `http.ts` lee la sucursal **en el momento de cada request**, igual que el rol, y **omite** la
  cabecera cuando es `null`: sin la cabecera el backend no abre sesión ni consulta la base
  (`context.py:38-40`), y con un UUID inexistente responde 422 `sucursal_invalida`
  (`context.py:85-92`). Por eso `setActiveSucursalId` valida el formato UUID con una regex y descarta
  lo que no lo cumpla (`null` siempre es válido): el mismo criterio que el rol —el error se previene
  en el cliente en vez de provocarse—. C-14/C-22 reemplazan el estado del módulo por el selector sin
  tocar `http.ts`.

### D5 — Un único error de dominio, discriminado por la forma de `detail`

`detail` del backend tiene tres formas estructurales y cuatro casos semánticos (los cuatro que enumera
C-13):

| Caso | status | `detail` | Resultado |
|------|--------|----------|-----------|
| Conflicto de agenda | 409 | `{causa, detalle}` (y extras como `accion_previa`) | `kind: 'conflicto'`, `causa` ∈ `profesional\|sillon\|horario\|bloqueo` |
| Recurso / dominio | 404, 422 | `string` | `kind: 'no_encontrado'` \| `'validacion'`, `detalle` = el string |
| Validación de request | 422 | `[{loc, msg, type}]` | `kind: 'validacion'`, `campos` mapeados |
| Rol / sucursal / permiso | 422, 403 | `{causa, detalle}` | `kind: 'validacion'` \| `'permiso'`, `causa` = `rol_desconocido\|sucursal_invalida\|permiso_denegado` |
| Sin respuesta o cuerpo ilegible | — | — | `kind: 'red'` \| `'timeout'` (mapeo exacto abajo) |

**Regla de implementación:** se discrimina por `typeof detail` (objeto / string / array), **no** por el
status, y el parseo de objetos lee solo `causa` y `detalle` e ignora claves extra
(`recordatorios/router.py:55-63` agrega `accion_previa` al mismo objeto). Un status inesperado con
forma conocida sigue produciendo un error de dominio; una forma desconocida cae en `kind: 'servidor'`
con el texto crudo truncado. Ninguna rama usa `any`: el cuerpo entra como `unknown` y se estrecha.

Timeout, aborto y red: `AbortSignal.timeout(ms)` combinado con la señal del llamador vía
`AbortSignal.any`, discriminado por el **nombre del error** con el que rechaza `fetch`, no por el
status (no hay status). Mapeo exacto:

| Causa | Error observado | `kind` | Justificación |
|-------|-----------------|--------|---------------|
| Vence el plazo de `AbortSignal.timeout` | `TimeoutError` (DOMException) | `timeout` | Es el único caso en que el reloj del cliente se agotó: el nombre del error lo distingue sin ambigüedad |
| Aborto del llamador (`AbortController` propio) | `AbortError` (DOMException) | `red` | El llamador canceló: no hubo respuesta, pero tampoco venció ningún plazo. Se usa `red` y no un `kind` nuevo porque el escenario "Respuesta que no es JSON, timeout o aborto" solo admite error de red o de timeout; agregar `'cancelado'` obligaría a ampliar `ApiErrorKind` y el escenario. El `mensaje` distingue cada caso, así que quien necesite tratarlos distinto lo puede hacer; si C-21 lo pide, es un `kind` aditivo, no un cambio de los existentes |
| Red caída, DNS o `fetch` rechaza con `TypeError` | `TypeError` | `red` | No hubo respuesta HTTP: no hay status ni cuerpo que normalizar |
| Cuerpo recibido que no es JSON (HTML, vacío, texto) | — (sí hay respuesta) | `red` | No se puede leer el contrato de error; se conserva el status y el texto crudo truncado en el mensaje |

El orden de la discriminación importa: primero se identifica el error de transporte
(`TimeoutError` / `AbortError` / `TypeError`) y solo después se intenta parsear el cuerpo, para que un
cuerpo HTML de un 502 del proxy no se confunda con el `detail` del backend.

### D6 — Tipos espejo, sin generación automática

Los tipos se escriben a mano contra los schemas reales, con estas fuentes y ninguna otra:
`PacienteOut` (`backend/app/agenda/schemas.py:60-68`), `ProfesionalOut` (`:103-110`), `SillonOut`
(`:136-142`), `PrestacionOut` (`:168-174`), `HorarioOut` (`:223-231`), `BloqueoOut` (`:251-259`),
`TurnoOut` (`backend/app/turnos/schemas.py:23-34`) y `EstadoTurno` desde `ESTADOS`
(`backend/app/turnos/models.py:27-33`, cinco valores).

Detalles que se respetan y que un generador ingenuo perdería: `contacto`, `sucursal_id`,
`profesional_id` y `sillon_id` son nulos en los schemas de lectura (`contacto: str | None = None` en
`agenda/schemas.py:66`; `profesional_id: UUID | None` en `:255`); `TurnoOut.estado` es `str` en el
schema pero el dominio lo acota a los cinco estados, por eso `EstadoTurno` es una unión y el mapeo
estado→etiqueta es exhaustivo con `never`. `HorarioOut.desde/hasta` son `time` (`"HH:MM:SS"`), no
`Date`.

**Alternativa considerada:** generar los tipos desde el OpenAPI del backend. Descartada en C-13: agrega
una dependencia y un paso de build que hay que mantener sincronizado, y el alcance pide tipos espejo.
Queda como mejora futura si el contrato empieza a moverse seguido.

### D7 — Forzar "sin `any`": `strict` explícito + regla de oxlint en `error`

Hoy el `any` implícito ya está bloqueado y el explícito no: `tsconfig.app.json` no declara
`strict`, pero TypeScript 6.0.3 —la versión instalada— trata `strict` como activo cuando el flag
está ausente (`getStrictOptionValue` en
`frontend/node_modules/typescript/lib/typescript.js:22255-22257` devuelve
`compilerOptions.strict !== false`, es decir `true` si nadie lo apagó), así que `noImplicitAny`
está encendido por defecto; `.oxlintrc.json:4-7`, en cambio, no activa ninguna regla de `any`.

**Decisión:** `"strict": true` explícito en `tsconfig.app.json` **y** `"typescript/no-explicit-any":
"error"` en `.oxlintrc.json`. La regla existe en el oxlint instalado
(`frontend/node_modules/oxlint/configuration_schema.json:7979`), así que no se inventa un id.

Las dos capas cubren casos distintos y por eso van las dos: `strict` atrapa el `any` **implícito**
(parámetros sin tipo, retornos inferidos de un `any`), y la regla de oxlint atrapa el `any`
**explícito** escrito a mano, que TypeScript acepta por diseño. `strict` se declara explícito aunque
algún día un `extends` lo traiga: deja la intención en el archivo y evita que un cambio de preset la
apague en silencio.

**Verificación RED (obligatoria, no opcional):** dos probes temporales, uno por capa, porque cada
herramienta cubre un caso distinto y uno solo no prueba las dos:

1. **`src/__any_probe__.ts`** con `const probe: any = 1; export default probe` — `any` **explícito**.
   - RED: `npm run lint` pasa (la regla no está activa) y `npx tsc -b` **también pasa**: TypeScript
     acepta `any` escrito a mano incluso con `strict`, así que el chequeo de tipos no puede ser el
     gate de esta capa.
   - GREEN: `npm run lint` **falla** con `typescript/no-explicit-any`, y `npx tsc -b` sigue en verde.
     Si `tsc -b` fallara acá, la causa sería otra y hay que investigarla antes de seguir.
2. **`src/__implicit_any_probe__.ts`** con `export const f = (x) => x` — `any` **implícito**.
   - RED: `npm run lint` pasa (la regla es solo para `any` explícito) y `npx tsc -b` pasa mientras
     `noImplicitAny` esté apagado.
   - GREEN: `npx tsc -b` **falla** con TS7006 ("Parameter 'x' implicitly has an 'any' type"), y
     `npm run lint` sigue en verde.

Borrar los dos archivos (no se commitean) y confirmar `npm run lint` + `npx tsc -b` en verde. Si algún
probe pasa en verde donde debía fallar, esa capa no está implementada y la decisión no está cumplida.

**Corrección condicional del diagnóstico:** la afirmación de arriba —"`tsconfig.app.json` no declara
`strict` (por lo tanto `strict` es `false` y `noImplicitAny` también)"— vale solo si el probe 2 **pasa
en verde** antes de tocar la configuración. Si el probe implícito **ya falla** `npx tsc -b` en el RED,
entonces `strict` o `noImplicitAny` ya estaban activos por otra vía (un `extends`, `tsconfig.node.json`
o un preset del scaffold) y esa frase **debe corregirse en este mismo documento**, citando la fuente
real del flag; en ese caso la única capa que falta es la regla de oxlint, y `"strict": true` se
declara explícito igual (D7 lo pide por intención, no para activar algo que ya estaba).

**Corrección aplicada (2026-11-10):** el probe 2 **ya falló** `npx tsc -b` en el RED con `TS7006`
(`src/__implicit_any_probe__.ts(1,19): error TS7006: Parameter 'x' implicitly has an 'any' type`),
así que la condición se cumplió: `strict`/`noImplicitAny` ya estaban activos. La fuente real es
TypeScript 6.0.3 (`frontend/node_modules/typescript/package.json`), cuyo `getStrictOptionValue`
(`frontend/node_modules/typescript/lib/typescript.js:22255-22257`) devuelve
`compilerOptions.strict !== false` cuando el flag está ausente. La frase de arriba quedó corregida y
la única capa que faltaba era la regla de oxlint.

### D8 — Versión de Node: job en 24, `engines` con el mínimo real

Única evidencia disponible: `frontend/node_modules/vite/package.json:178-179` declara
`"node": "^20.19.0 || >=22.12.0"`. La línea base (lint, `tsc -b`, build) está verde en Node
**v24.19.0**, la versión instalada en la máquina.

**Decisión:** el job de CI usa `node-version: "24"` (la versión donde la línea base está verificada) y
`package.json` declara `"engines": { "node": "^20.19.0 || >=22.12.0" }`, copiando el rango de Vite en
lugar de inventar uno. `engines` documenta el piso real y hace que un entorno viejo avise; el job fija
la versión probada. Alternativa considerada: fijar `22` (también válido, ≥22.12.0) — descartada porque
introduce una versión distinta de la única donde la línea base se verificó, y el objetivo de C-13 es
reducir divergencia, no ampliarla. `engines` es advisory (npm advierte, no bloquea) salvo
`engine-strict`; no se activa porque rompería instalaciones válidas del rango.

### D9 — El job `frontend` de CI tiene cinco pasos

`npm ci` → `npm run lint` → `tsc -b` → `npm run build` → `npm run test:run`, desde `frontend/`, con
`cache: npm` sobre `frontend/package-lock.json`.

- **`npm ci`** (no `npm install`): instala exactamente el lockfile y **falla si el lockfile no
  coincide con `package.json`**. Es el único paso que detecta una dependencia agregada sin lockfile.
- **`npm run lint`**: oxlint es rápido y atrapa `any` explícito (D7) y reglas de hooks; un fallo acá
  señala una causa distinta de un error de tipos.
- **`tsc -b`**: `npm run build` ya incluye `tsc -b` (`package.json:8`), así que el paso es redundante
  en el caso feliz. Se mantiene **por diagnóstico**: separa "no compila" de "no empaqueta" en la
  salida del job, y sigue protegiendo los tipos si alguien cambia `build` para que no invoque a `tsc`
  (por ejemplo, para acelerar el build local). El costo es un chequeo incremental casi instantáneo.
- **`npm run build`**: es el único paso que prueba el artefacto real: resuelve el import de
  `../design-system/tokens.css` fuera de `src/`, sustituye `VITE_API_BASE_URL` (D2) y produce `dist/`.
  Un build roto con lint y tipos en verde es perfectamente posible.
- **`npm run test:run`** (`vitest run`, sin watch): es el único paso que ejecuta el código que escribió
  este change. Lint y tipos verifican la forma; los tests verifican el comportamiento (normalización de
  errores, cabeceras de identidad, mapeo de timeout/aborto, ruteo, shell y límite de error). Sin este
  paso, la suite existe solo en la máquina de quien se acuerde de correrla, y un test rojo en `main`
  pasa el CI en verde.

El job falla si cualquiera falla (comportamiento por defecto de `run` en GitHub Actions, sin
`continue-on-error`).

**Por qué los tests entran en C-13 y no en C-14:** la spec de este mismo change ya los exige. El
requisito "Gates automáticos de calidad del frontend" manda mantener en verde lint, tipos, build **y la
suite de tests** y ejecutar los cuatro en integración continua; su primer escenario nombra
explícitamente "lint, comprobación de tipos, build y tests". Un job de cuatro pasos contradecía el
contrato que la spec fija, así que agregar el quinto paso es la corrección de una inconsistencia, no
una ampliación opcional. **Q1 queda resuelta con esta decisión.**

**Nota de alcance:** `CHANGES.md` (rev. 10) describe el job de C-13 con cuatro pasos (`npm ci`,
`npm run lint`, `tsc -b`, `npm run build`). Este quinto paso **agranda en uno el alcance registrado en
`CHANGES.md`**, por lo que la decisión es **provisoria** y requiere confirmación del equipo antes de
dar el change por cerrado. `CHANGES.md` no se edita desde este change: si el equipo confirma, la
diferencia se registra como nota de rectificación en el roadmap, fuera de C-13.

### D10 — Layout: shell interno vs layout público

Las rutas internas (`/`, `/turnos/nuevo`, `/agenda`, `/catalogo/*`, `/lista-espera`, `/hc/:pacienteId`,
`/caja`, `/admin`) viven bajo el shell con navegación. Las tres rutas de paciente
(`/reservar/:profesional`, `/confirmar/:token`, `/cancelar/:token`) viven bajo un layout público sin
navegación interna: son para alguien que no opera la agenda y a quien no corresponde ofrecerle
Pacientes, Sillones, Caja o Admin. Se implementa con dos rutas de layout en `react-router-dom`
(`<Route element={<Shell/>}>` y `<Route element={<PublicLayout/>}>`), no con condicionales dentro de un
único layout.

### D11 — Estructura de `src/`

```
src/
  main.tsx                 # importa ../design-system/tokens.css y monta el router
  app/
    router.tsx             # tabla de rutas (internas bajo Shell, públicas bajo PublicLayout)
    shell.tsx              # nav lateral + topbar (traducido de components.html §Navegación)
    shell.css              # estilos del shell copiados de components.html §Navegación (D12)
    public-layout.tsx
    not-found.tsx
    error-boundary.tsx
  services/
    config.ts              # lectura de VITE_API_BASE_URL con default /api
    http.ts                # fetch tipado, timeout/abort, cabeceras (D4)
    api-error.ts           # normalización (D5)
    role.ts                # getActiveRole / setActiveRole (D4)
  types/
    api.ts                 # contratos espejo (D6)
    errors.ts              # ApiError y CampoError (D5)
  pages/                   # una pantalla placeholder por ruta
```

Respeta las carpetas ya reservadas (`components/`, `pages/`, `services/`, `types/`, con `.gitkeep`) y
no crea capas nuevas de dominio.

### D12 — Estilos del shell: hoja propia `src/app/shell.css`, solo `var(--token)`

Los estilos del shell **no están en `tokens.css`**: `.app-shell`, `.side`, `.side__brand`,
`.side__label`, `.side__group`, `.side__link` (con `:hover` y `[aria-current="page"]`), `.app-main` y
`.app-title` viven en el `<style>` inline de `frontend/design-system/components.html:372-402`, junto
con su media query de 46rem (`:396-402`). `tokens.css` solo define variables: importarlo no trae
ninguna regla de layout. Copiarlos desde ese bloque no es un detalle de implementación: es de dónde
sale el aspecto aprobado del shell.

**Decisión:** crear `src/app/shell.css` e importarlo desde `shell.tsx`, con esas reglas copiadas tal
cual del bloque de `components.html` (mismos nombres de clase, mismos valores), referenciando **solo**
`var(--token)` ya definidos por `tokens.css` y **sin redefinir ningún token**. Así el design system
sigue siendo la única fuente de valores y un cambio de token se propaga al shell sin editarlo. La
media query de 46rem también vive en este archivo, no duplicada en otro lado.

**Destinos del nav (decidido):** la referencia muestra cuatro enlaces con `href="#navegacion"`
(`components.html:1031-1046`) y la spec fija esos mismos cuatro; se resuelven con `NavLink` a rutas
que la tabla de 4.2 ya declara:

| Enlace | Destino | Change dueño de la pantalla |
|--------|---------|-----------------------------|
| Agenda | `/agenda` | C-17 |
| Pacientes | `/catalogo/pacientes` | C-15 |
| Sillones | `/catalogo/sillones` | C-15 |
| Caja | `/caja` | C-20 |

`/catalogo/pacientes` y `/catalogo/sillones` son las subrutas reales de `/catalogo/*` que declara el
scope de C-15 (`CHANGES.md:531,533`). Las otras tres rutas declaradas —`/turnos/nuevo`,
`/lista-espera` y `/admin`— **no** tienen entrada en la navegación de la referencia: C-13 las declara
y las prueba (4.2) pero no las enlaza; su punto de entrada se decide en el change que construye la
pantalla (Q4).

## Risks / Trade-offs

- **El prefijo `/api` es un contrato entre tres piezas** (cliente, proxy de Vite, nginx) → se declara
  una sola vez en `services/config.ts` y en `.env.example`; si el prefijo cambia, cambian los tres
  archivos y hay un test que verifica el valor por defecto.
- **`VITE_API_BASE_URL` inmutable en runtime** (D2) → aceptado y documentado en `README.md`; el compose
  la pasa como build arg para que quede visible en el `docker-compose.yml` que hay que reconstruir.
- **`strict: true` puede destapar errores en código futuro de C-14** → es el objetivo; se activa en
  C-13, cuando `src/` todavía es pequeño, y no después.
- **El `npm ci` falla si el lockfile queda desincronizado** → es el comportamiento deseado, pero obliga
  a commitear `package-lock.json` junto con `package.json` en el mismo cambio.
- **Tipos escritos a mano se desactualizan** (D6) → mitigado por el escenario de discrepancia de
  contrato y por `tsc -b` en CI; la generación desde OpenAPI queda como mejora futura.
- **El build de Docker depende de `node_modules` locales si se copia todo** → el `Dockerfile` usa
  `npm ci` sobre `package*.json` y un `.dockerignore` que excluye `node_modules` y `dist`.
- **Los dos proxies —el de Vite en desarrollo y el de nginx en el contenedor— pueden divergir** (D1,
  D3) → la task 4.8 y la 5.1 verifican el mismo request (`/api/health` → `{"status":"ok"}`) por los
  dos caminos, y el contenedor además prueba la recarga directa de una ruta interna y que las rutas
  del SPA no se proxean.

## Migration Plan

Cambio aditivo sobre un frontend vacío; no hay datos ni migración. Orden de aplicación: dependencias y
gates de calidad primero (para que el resto se escriba bajo `strict`), después tipos y cliente HTTP,
después ruteo y shell, y al final empaquetado y CI. El rollback es revertir el change: el único
consumidor es el propio `frontend/`, y `docker-compose.yml` recupera su estado de dos servicios.

## Open Questions

- **Q1 — resuelta en D9 (2026-11-10, decisión provisoria):** `npm run test:run` es el quinto paso del
  job `frontend`, porque la spec de C-13 ya lo exige. Queda pendiente solo la confirmación del equipo
  sobre el alcance de `CHANGES.md`, que registra cuatro pasos.
- **Q4** — ¿Dónde entran `/turnos/nuevo`, `/lista-espera` y `/admin`? La navegación aprobada del
  design system tiene cuatro enlaces y ninguno apunta a esas tres rutas; C-13 las declara y las prueba
  (4.2) pero no las enlaza, y agregarlas al nav inventaría navegación que el design system no tiene.
  Opciones, todas de changes posteriores: (a) `/turnos/nuevo` como acción primaria de la Agenda (C-16,
  botón en `/agenda`); (b) `/lista-espera` como segundo acceso desde Agenda (C-18); (c) `/admin` desde
  la topbar o el área de rol (C-22, que además ya muestra el selector de sucursal). Se decide cuando la
  pantalla exista, no antes.
- **Q2** — El nombre de marca (`Agenda Odontológica`, `frontend/design-system/brand.js:14`) sigue
  marcado `provisional: true` en el design system. C-13 lo usa tal cual; el reemplazo definitivo es
  una decisión de marca ya registrada como `(TBD)` en `design-system/README.md:105-112`, no de este
  change.
- **Q3** — ¿Conviene un tipo `SillonBox` (nombre del alcance) o `Sillon` (nombre del schema
  `SillonOut`)? Se usa `SillonBox` como alias exportado del tipo, para no renombrar el concepto del
  alcance; si C-14 prefiere `Sillon`, es un renombre de una línea sin cambio de comportamiento.

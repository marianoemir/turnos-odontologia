# Frontend — Turnos Odontológicos

Aplicación React + TypeScript + Vite de la agenda odontológica. Este documento describe
únicamente lo que existe hoy en `frontend/`.

## Requisitos

- Node.js `^20.19.0 || >=22.12.0` (campo `engines` de `package.json`; es el mínimo que
  exige Vite).
- El backend corriendo en `http://localhost:8000` para que el proxy de desarrollo tenga a
  quién reenviar (ver [Proxy de desarrollo](#proxy-de-desarrollo)).

## Cómo correrlo

```bash
cd frontend
npm ci
npm run dev
```

`npm run dev` levanta Vite en `http://localhost:5173` (el puerto que informa la consola).
Se usa `npm ci` y no `npm install` para instalar exactamente el `package-lock.json`.

## Scripts

| Script | Comando | Qué hace |
|--------|---------|----------|
| `npm run dev` | `vite` | Servidor de desarrollo con recarga en caliente. |
| `npm run build` | `tsc -b && vite build` | Comprueba tipos y genera el bundle de producción en `dist/`. |
| `npm run preview` | `vite preview` | Sirve localmente el contenido de `dist/` ya construido. |
| `npm run lint` | `oxlint` | Lint del proyecto. |
| `npm test` | `vitest` | Suite de tests en modo watch. |
| `npm run test:run` | `vitest run` | Suite de tests una sola vez (modo CI). |

## Variables de entorno

| Variable | Valor por defecto | Uso |
|----------|-------------------|-----|
| `VITE_API_BASE_URL` | `/api` | Prefijo de las requests a la API. |

`src/services/config.ts` lee `import.meta.env.VITE_API_BASE_URL` y usa `/api` cuando la
variable no está definida o está vacía. Sin definirla, el default funciona tanto en
desarrollo como en el bundle de producción.

> **La variable es de tiempo de build.** Vite sustituye `import.meta.env.VITE_*` al
> compilar, no al arrancar: cambiarla exige volver a correr `npm run build` (y, por lo
> tanto, reconstruir cualquier artefacto que se sirva desde `dist/`). Definirla en el
> entorno del proceso que sirve el bundle no tiene efecto.

## Proxy de desarrollo

`vite.config.ts` declara `server.proxy` para el prefijo `/api`:

- destino: `http://localhost:8000` (el backend local);
- `rewrite`: quita el prefijo `/api`, así `/api/health` se reenvía como `/health`.

El prefijo separa el espacio de nombres de la API del de las rutas del SPA. Las rutas del
router (`/agenda`, `/reservar/:profesional`, etc.) **no** se proxean: las resuelve Vite
con el `index.html` de la aplicación.

## Estructura de `src/`

```
src/
  main.tsx        Punto de entrada: importa index.css y ../design-system/tokens.css y monta el router.
  index.css       Base mínima de la página (html y body); consume var(--token), no define tokens.
  app/            Router, shell interno, layout público, no encontrado y límite de error, con sus tests.
  pages/          Una pantalla por ruta declarada (inicio, turno-nuevo, agenda, catálogo,
                  lista-espera, historia clínica, caja, admin, reservar, confirmar, cancelar).
  services/       Cliente HTTP y estado de sesión: config.ts, http.ts, api-error.ts, role.ts, sucursal.ts.
  types/          Contratos de datos espejo de la API (api.ts) y errores de dominio (errors.ts).
  test/           setup.ts con la configuración de Testing Library / jest-dom.
  components/     Carpeta reservada para componentes reutilizables (hoy vacía).
```

- `app/router.tsx` declara las rutas; las internas viven bajo `shell.tsx` y las públicas
  del paciente bajo `public-layout.tsx`.
- Los estilos del shell están en `app/shell.css` y solo referencian `var(--token)`.
- Los valores visuales viven en `frontend/design-system/` (`tokens.css`, `brand.js`), fuera
  de `src/`.
- Los tests están junto al código que prueban (`*.test.ts` / `*.test.tsx`).

## Gates de calidad

Los cuatro deben quedar en verde antes de dar por terminado un cambio:

```bash
npm run lint
npx tsc -b
npm run build
npm run test:run
```

`npm run build` ya ejecuta `tsc -b`, pero se corre por separado para distinguir un error de
tipos de un error de empaquetado.

## Empaquetado (contenedor)

Estos archivos existen en `frontend/`, pero **no se verificaron en este entorno** porque
Docker no está disponible:

- `Dockerfile` multi-stage: `node:24-slim` instala con `npm ci` y compila con
  `VITE_API_BASE_URL` (build arg, default `/api`); la imagen final es `nginx:alpine` y
  solo recibe `dist/`.
- `nginx.conf`: `location /api/` reenvía a `http://api:8000/` quitando el prefijo (el
  mismo contrato que el proxy de Vite) y `location /` cae en `/index.html`; el
  `index.html` se sirve con `Cache-Control: no-cache`.
- `.dockerignore` excluye `node_modules`, `dist` y `.env` del contexto de build.
- En `docker-compose.yml` (raíz), el servicio `web` construye `frontend` con el build arg
  `VITE_API_BASE_URL` (default `/api`) y publica el puerto `8080` contra el `80` del
  contenedor.

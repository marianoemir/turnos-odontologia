# Fundación visual — turnos-odontologia

> Fundación visual del proyecto. Portable y local: CSS variables más HTML de referencia.
> Sin framework de CSS, sin fuentes remotas, sin cuentas de terceros.

```
Mode: system-only
Revision: 1
Approval: approved (2026-10-28, by user)
Created by: design-system (skill), 2026-10-28
Location: frontend/design-system/
```

Con `system-only` el sistema visual se define una vez y se reutiliza; no se piden mockups por change.
Este documento y los archivos que lo acompañan son la referencia para cualquier pantalla futura.

La fundación vive dentro del proyecto frontend (`frontend/design-system/`), no en la raíz del repo:
es un artefacto de UI y su consumo ocurre desde `frontend/src/`. El resto de `frontend/`
(`src/`, `package.json`, `vite.config.ts`) sigue siendo el scaffold vacío hasta que se implementen
`C-13 frontend-foundation` (cableado de `tokens.css`, shell y ruteo) y
`C-14 frontend-componentes-base` (traducción de `components.html` a componentes React).

---

## Qué hay acá

| Archivo | Para qué sirve |
|---------|----------------|
| `tokens.css` | **Fuente de verdad** de color, tipografía, espaciado, radios, sombras, foco y motion. Incluye los cinco estados de turno y el bloqueo de movimiento reducido. |
| `brand.md` | Nombre, tono, logo, imagery, reglas de uso y decisiones abiertas de marca. |
| `brand.js` | Constante única del nombre visible y binding de `[data-brand-name]`. Autocontenido, sin dependencias. |
| `assets/logo.svg` | Ruta estable del logo. Hoy es un placeholder visible (`PROV.`). |
| `components.html` | Referencia visual: botones, formularios, chips de estado, card de turno, tabla de agenda, navegación, modal, avisos, toast, vacío y esqueletos. |
| `previews/` | Capturas renderizadas del archivo de referencia. |

`components.html` es documentación, no producto: no se compila, no se publica y no reemplaza a las
pantallas reales.

## Fuentes de la fundación

- `knowledge-base/01_vision_y_objetivos.md` — problema, actores y alcance (agenda, ausentismo, huecos).
- `knowledge-base/02_descripcion_general.md` — stack impuesto y arquitectura.
- `knowledge-base/03_actores_y_roles.md` — recepción escribe, odontólogo lee; RBAC mínimo.
- `knowledge-base/05_reglas_de_negocio.md` — RN-ES-01: pendiente → confirmado → atendido/ausente, y → cancelado.
- `knowledge-base/06_funcionalidades.md` — US-001 a US-003 (crear, cancelar/reprogramar, agenda del día).
- `knowledge-base/08_arquitectura_propuesta.md` — estructura y convenciones.
- `frontend/` — scaffold Vite + React 19 + TypeScript. Se auditó y su código (`src/`, `package.json`,
  `vite.config.ts`) **no se modificó**; la fundación visual se agregó en `frontend/design-system/`.
- Pedido explícito del usuario (2026-10-28): tono clínico, cálido, sin estética de startup ni morados;
  modo `system-only`; UI en español es-AR.

## Decisiones de diseño

- **Superficie de papel cálido** (`#F7F5F0`) en lugar de blanco total: separa el fondo de trabajo de las
  tarjetas y baja el brillo en una pantalla que se mira toda la jornada.
- **Petróleo** (`#0E5B55`) para acción y navegación activa; **ocre** (`#B4761A`) para lo que pide atención.
  Ningún gradiente y ningún morado: el scaffold de Vite traía un acento violeta que no pertenece a la identidad.
- **Cinco estados con cinco señales**: color + texto + forma del punto. El color nunca es la única pista.
  `cancelado` se muestra tachado y apagado, no se borra.
- **Cifras tabulares** en horas, duraciones y documentos, para que las columnas de la agenda no bailen.
- **Densidad de recepción**: 14px de UI, controles de 40px, filas de agenda de 48px.
- **Una sola elevación**: superficie con borde no lleva sombra; modal y toast llevan sombra y no llevan borde.
- **Contraste AA** en todos los pares de texto. Las relaciones están listadas dentro de `components.html`.

## Cómo se consume

1. `tokens.css` se importa una vez. Como la fundación vive dentro del root de Vite (`frontend/`), el
   punto de entrada (`frontend/src/main.tsx`) importa la ruta relativa `../design-system/tokens.css`
   sin necesidad de `server.fs.allow` ni de copiar archivos: está dentro del root del proyecto.
   **El cableado de ese import, su verificación en `npm run dev` y en el build de Docker es tarea del
   change `C-13 frontend-foundation`**; hoy `frontend/src/` sigue intacto.
2. Los componentes de `components.html` son CSS de referencia: se traducen a componentes React con las
   mismas clases y tokens, sin redefinir valores. Eso ocurre en `C-14 frontend-componentes-base`; las
   pantallas que los consumen son `C-15` a `C-22`.
3. `brand.js` solo aplica a los HTML de referencia. En React, el nombre va en una constante de la app.

## Capturas

Renderizadas con Chromium headless (Playwright) sobre `components.html`, locale `es-AR`.

| Vista | Archivo |
|-------|---------|
| Escritorio 1440×900 (viewport) | `previews/desktop-1440x900.png` |
| Escritorio 1440 (página completa) | `previews/desktop-1440-full.png` |
| Móvil 390×844 (viewport) | `previews/mobile-390x844.png` |
| Móvil 390 (página completa) | `previews/mobile-390-full.png` |

Verificado en ambas capturas: sin scroll horizontal (`scrollWidth == innerWidth`), sin errores de consola,
logo y `brand.js` cargando. En menos de 46rem la tabla de agenda cambia a filas en grilla con columnas
prioritarias, y prestación, sillón y profesional bajan a la línea de detalle del paciente.

Para revisar el HTML localmente: abrir `frontend/design-system/components.html` en el navegador.
No hace falta servidor. Las rutas internas (`tokens.css`, `brand.js`, `assets/logo.svg`) son relativas
a la carpeta, así que siguen resolviendo después del movimiento.

## Cómo reemplazar lo provisorio

| Qué | Dónde | Cómo |
|-----|-------|------|
| Nombre del producto | `brand.js` → `BRAND.name` | Editar la constante. Todo `[data-brand-name]` se actualiza. En React, replicar en la constante de la app. |
| Logo | `assets/logo.svg` | Reemplazar el archivo por el logo definitivo, mismo nombre, `viewBox` cuadrado. No hay que tocar mockups ni componentes: todos apuntan a esa ruta. |
| Paleta o tipografía | `tokens.css` | Cambiar el valor del token, **subir `Revision`**, volver a renderizar `components.html` y pedir aprobación de nuevo. |
| Marcas de provisionalidad | `brand.js` → `provisional: false` y `assets/logo.svg` | Al aprobar nombre e isotipo, el chip «Marca provisoria» se oculta solo y se reemplaza el logo. |

## Decisiones abiertas `(TBD)`

1. **Nombre definitivo del producto.** Hoy «Agenda Odontológica» es un descriptivo de trabajo.
2. **Isotipo definitivo.** El placeholder dice `PROV.` a propósito.
3. **Modo oscuro.** No existe: `color-scheme: light` está fijado. Falta decidir si recepción lo necesita.
4. **Tipografía definitiva.** Hoy pila del sistema, por la restricción de no usar fuentes remotas.
   Si se permite self-hosting, se evalúa una tipografía con más carácter.
5. **Fotografía o ausencia total de imágenes.** No hay brief fotográfico.

Ninguna de estas bloquea el uso del sistema: todas están aisladas en un archivo o en una constante.

## Aprobación

`Approval: approved (2026-10-28, by user)` — fundación **Revision 1** aprobada explícitamente por el
usuario el 2026-10-28, a partir de las capturas en `previews/` y de `components.html`.

Estado del proyecto: `visual_design.mode = system-only`, `visual_design.status = approved`,
`visual_design.revision = 1`, `visual_design.path = frontend/design-system/README.md`.

Un cambio de token o asset compartido sube `Revision`, vuelve `Approval` a `pending` y obliga a
re-renderizar las capturas y pedir aprobación de nuevo. La política `system-only` no exige mockups
por change.

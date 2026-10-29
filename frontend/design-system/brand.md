# Marca

> Fundación visual · Revisión 1 · Aprobación **pendiente**.
> Este documento describe la identidad **provisoria** del proyecto. Todo dato marcado `(TBD)` espera
> definición del usuario antes de considerarse parte de la marca.

## Nombre del producto

| Campo | Valor | Fuente |
|-------|-------|--------|
| Nombre visible | **Agenda Odontológica** — provisorio | `(TBD)`. No existe nombre de producto en `knowledge-base/`; se usa un descriptivo de trabajo. |
| Nombre corto | Agenda | Derivado del anterior. |
| Nombre del repositorio | turnos-odontologia | `git`, raíz del proyecto. |
| Idioma de la interfaz | Español rioplatense (es-AR), voseo en acciones y mensajes | `knowledge-base/01_vision_y_objetivos.md`, `03_actores_y_roles.md` (usuarios y contexto Argentina). |
| Cómo se escribe | Mayúscula inicial, sin todo-mayúsculas, sin signos de marca alrededor | Decisión de esta fundación. |

Reemplazo: editar la constante `name` en `brand.js`. Todo elemento con `[data-brand-name]` se actualiza solo.

## Qué es y para quién

Sistema de turnos y agenda para consultorios odontológicos de Argentina. El problema que resuelve no es captar
reservas sino el ausentismo, los huecos que quedan vacíos y las dobles reservas: la competencia real es
WhatsApp más una planilla de papel (`knowledge-base/01_vision_y_objetivos.md`).

- **Recepción / Secretaría**: escribe. Carga catálogo, crea, confirma, cancela y reprograma turnos; después cobra.
  Trabaja en escritorio durante toda la jornada, con interrupciones constantes (teléfono, mostrador).
- **Odontólogo**: lee. Consulta su agenda del día entre pacientes, muchas veces en tablet o celular.
- **Paciente**: todavía no usa el sistema de forma directa; en el recorte actual solo existe como titular del turno
  (`knowledge-base/03_actores_y_roles.md`).

## Tono

Profesional, clínico y confiable, con calidez de consultorio de barrio. La interfaz habla como una buena
recepcionista: clara, breve, sin dramatismo y sin jerga técnica del sistema.

| Sí | No |
|----|----|
| Frases cortas en presente: «El turno se creó», «Ese horario ya está ocupado» | «¡Genial! 🎉», signos de exclamación múltiples |
| Nombrar el recurso concreto: profesional, sillón, horario | «Error 409», «conflicto de entidad» |
| Decir qué hacer a continuación | Mensajes que solo describen el fallo |
| Voseo: «Elegí otra hora», «Cargá el turno» | Tuteo neutro o inglés |

Origen: `knowledge-base/06_funcionalidades.md` (criterios de aceptación redactados en primera persona),
`knowledge-base/05_reglas_de_negocio.md` (vocabulario de dominio), y la restricción explícita de evitar una
estética de «startup genérica».

## Logo

| Campo | Valor | Fuente |
|-------|-------|--------|
| Archivo | `frontend/design-system/assets/logo.svg` | Ruta estable definida por esta fundación. |
| Estado | **Placeholder visible**: cuadrado petróleo, pieza dental de trazo simple, marco punteado ocre y leyenda `PROV.` | `(TBD)` — no hay isotipo aprobado. |
| Uso permitido | Solo en la referencia interna y en prototipos marcados como provisorios. No usar en material externo. | Decisión de esta fundación. |
| Área de resguardo | Un cuarto del lado del isotipo, mínimo 8px | Decisión de esta fundación. |
| Tamaño mínimo | 24px de lado; por debajo, usar solo el nombre | Decisión de esta fundación. |

Reemplazo: reemplazar el archivo `frontend/design-system/assets/logo.svg` por el logo definitivo con el mismo nombre y
`viewBox` cuadrado. No hace falta tocar ningún mockup.

El isotipo nunca se dibuja con la pieza dental inclinada, con sombras ni con degradados. Un diente es un signo,
no una ilustración.

## Imagery

| Campo | Valor | Fuente |
|-------|-------|--------|
| Fotografía | `(TBD)` | No hay banco de imágenes ni brief fotográfico. |
| Si se usa fotografía | Detalle real del consultorio: instrumental, sillón, luz de trabajo. Sin modelos sonriendo a cámara, sin stock genérico de salud. | Decisión de esta fundación, alineada al tono clínico. |
| Ilustración | Solo geometría: diagramas de agenda, odontograma FDI, líneas de tiempo. Nada de dibujos tipo doodle. | Decisión de esta fundación. |
| Iconografía | SVG propio, trazo 1.7, extremos redondeados, 24×24, un solo peso. | `components.html`. |
| Decoración | Ninguna. Sin gradientes, sin glassmorphism, sin patrones de fondo. | Restricción explícita del pedido. |

## Reglas de uso

1. **El color de estado nunca va solo.** Todo chip de estado lleva texto; el color y la forma del punto acompañan.
   Es requisito de accesibilidad y también de lectura rápida en un mostrador con luz variable.
2. **Petróleo es acción, ocre es atención.** El petróleo (`brand-600`) marca la acción primaria y la navegación
   activa. El ocre (`accent-*`) marca lo que pide seguimiento, no lo que celebra.
3. **El papel es el fondo.** `surface-page` (`#F7F5F0`) es el fondo de la aplicación; el blanco queda para las
   superficies donde se trabaja. Una pantalla con todo blanco pierde la jerarquía de capas.
4. **Sin gradientes de marca.** Ninguno, en ninguna superficie.
5. **Sin morado.** El scaffold de Vite traía un acento violeta (`#aa3bff` en `frontend/src/index.css`); no
   pertenece a esta identidad y no se traslada.
6. **Cifras tabulares en datos.** Horas, duraciones, DNI, matrículas y montos usan `--font-mono` con
   `font-variant-numeric: tabular-nums`, para que las columnas de la agenda no bailen.
7. **No hay modo oscuro todavía.** `(TBD)`: falta decidir si la recepción lo necesita y con qué paleta. Hasta
   entonces `color-scheme: light` está fijado a propósito.

## Decisiones abiertas

| ID | Decisión | Estado |
|----|----------|--------|
| B-01 | Nombre definitivo del producto | `(TBD)` |
| B-02 | Isotipo / logo definitivo | `(TBD)` — placeholder `PROV.` en uso |
| B-03 | Paleta de modo oscuro | `(TBD)` — hoy solo claro |
| B-04 | Fotografía o ausencia total de imágenes | `(TBD)` |
| B-05 | Tipografía definitiva (hoy pila del sistema) | `(TBD)` — depende de si se permite self-hosting de fuentes |

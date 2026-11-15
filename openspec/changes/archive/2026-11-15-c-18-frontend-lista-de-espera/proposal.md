# Proposal

## Why

La capability backend `lista-espera` (C-06, archivada) ya permite dar de alta pacientes en espera, listar entradas pendientes en orden FIFO, ofrecer un hueco creando un turno y registrar la respuesta del paciente, pero el frontend solo tiene un placeholder en `/lista-espera`. C-18 cubre esa brecha de UI para recepción consumiendo exclusivamente los endpoints y contratos reales de `backend/app/lista_espera/`, respetando las dependencias frontend (C-13/C-14) y la sesión JWT vigente (C-24).

## What Changes

- Reemplaza el contenido placeholder de `frontend/src/pages/lista-espera.tsx` por la UI operativa de lista de espera, conservando el `<h1>` "Lista de espera".
- Agrega contratos TS espejo y servicios/hooks de lista de espera alineados al backend real (`ListaEsperaCreate`, `ListaEsperaOut`, `OfrecerHueco`, `RespuestaPaciente`) siguiendo los patrones de C-14/C-20 (`frontend/src/types/api-*.ts`, `frontend/src/services/*.ts`, `ApiError`/`http.ts`, TanStack Query).
- Implementa alta en lista (paciente, profesional opcional, prestación), listado FIFO tal como lo entrega el backend sin reordenar en el cliente, y filtro por profesional que incluye entradas generales.
- Resuelve nombres legibles (no UUID) en tabla y controles mediante lecturas de solo lectura de catálogos (`GET /pacientes`, `/profesionales`, `/prestaciones`, `/sillones`) implementadas como funciones dentro de `frontend/src/services/lista-espera.ts`, reutilizando tipos de `frontend/src/types/api.ts`; no crea `frontend/src/services/catalogo.ts` (C-15). El select de pacientes del alta busca con el parámetro `q` de `GET /pacientes` y `limit=200` (sin otros parámetros). Para resolver nombres en la tabla, las lecturas de catálogo usan `incluir_inactivos=true` (parámetro verificado, confirmado por Mariano) para que una entidad inactiva referenciada pueda resolverse; los selects usan el valor por defecto. Si un nombre no se resuelve, la tabla muestra el texto "No disponible" en vez del UUID. Si falla un catálogo, muestra error sin romper la pantalla.
- Implementa la acción "ofrecer hueco" con doble paso usando el Modal de C-14 (sin `confirm()`), enviando `inicio` como `AwareDatetime` con offset (offset local del navegador en el valor seleccionado, confirmado por Mariano; un valor sin offset no se envía y muestra error de campo), `profesional_id` y `sillon_id`; muestra el resultado devuelto por el backend (entrada y turno). Ante `409` al ofrecer, muestra la causa del servidor y deja la entrada intacta. Ante `422` al ofrecer, muestra la causa del servidor y deja la entrada intacta.
- Implementa la respuesta a una oferta (aceptar/rechazar) con `POST /lista-espera/{id}/responder`: aceptar deja la entrada en `asignado`; rechazar deja la entrada en `baja` y refresca la lista. Ante `409` al responder, muestra el aviso y deja la entrada intacta. Los resultados de oferta se mantienen en memoria en una colección indexada por id de entrada (una segunda oferta no descarta la primera); tras refrescar el listado, la entrada ofrecida puede no aparecer en la tabla pero sigue disponible para responder en el flujo actual (opción (a) confirmada por Mariano; la opción (b), listar ofrecidas desde backend, queda como mejora futura sujeta a un change de backend). Una oferta respondida queda resuelta en el flujo actual: sus acciones de responder se deshabilitan y no se envía un segundo POST. Un refresh de página deja la entrada en `ofrecido` con un turno `pendiente` sin forma de responder desde la UI (limitación documentada, no resuelta).
- Muestra estados de carga y error con los componentes de C-14, estado vacío con `EmptyState`, y maneja errores de permiso (`ApiError` de kind `"permiso"`, probado con mock del cliente) sin romper la pantalla.
- Deshabilita botones mientras una petición está en vuelo y no reintenta automáticamente `POST` ni respuestas `409`.
- No modifica `frontend/src/services/http.ts`, `frontend/src/services/api-error.ts` ni `frontend/src/types/errors.ts`. No modifica `frontend/src/app/router.tsx`, `frontend/src/auth/navigation.ts` ni enlaces del nav. El único archivo compartido con C-15 que puede tocarse es `frontend/src/services/query.ts`, con una sola línea en `resourceKeys`.

## Capabilities

### New Capabilities

- `frontend-lista-espera`: UI de lista de espera para recepción que permite alta, consulta FIFO con filtro por profesional (incluidas entradas generales), ofrecer hueco con doble confirmación y respuesta aceptar/rechazar, alineada a los endpoints, estados y errores reales del backend de C-06.

### Modified Capabilities

- Ninguna. No se modifican requisitos de specs existentes; se consumen los contratos vigentes de `lista-espera` (backend), `frontend-componentes`, `frontend-sesion` y `frontend-foundation`.

## Impact

- **Frontend (alcance previsto en apply, no ejecutado en esta propuesta):** reemplazo de `frontend/src/pages/lista-espera.tsx` (conservando `<h1>` "Lista de espera"), nuevos `frontend/src/types/api-lista-espera.ts`, `frontend/src/services/lista-espera.ts`, y tests RTL/Vitest asociados según TDD; una línea nueva en `resourceKeys` de `frontend/src/services/query.ts`.
- **Backend:** sin cambios. Se consumen `POST /lista-espera`, `GET /lista-espera?profesional=`, `POST /lista-espera/{id}/ofrecer` y `POST /lista-espera/{id}/responder`.
- **Specs/KB de referencia:** `openspec/specs/lista-espera/spec.md`, `knowledge-base/06_funcionalidades.md` §US-004, `knowledge-base/07_flujos_principales.md` §Flujo 4, `knowledge-base/10_preguntas_abiertas.md` §Q5, `knowledge-base/05_reglas_de_negocio.md` (solo RN-AG-02, RN-AG-03, RN-TU-01 verificadas).
- **Riesgos/limitaciones conocidas:** tras ofrecer, la entrada pasa a `ofrecido` y desaparece del `GET` (que solo devuelve `pendiente`), lo que exige tratar el flujo de respuesta con resultados en memoria indexados por id de entrada (opción (a) confirmada por Mariano; la opción (b), listar ofrecidas desde backend, queda como mejora futura sujeta a un change de backend). Un refresh de página deja la entrada en `ofrecido` con un turno `pendiente` sin forma de responder desde la UI (no resuelto). El offset enviado en `inicio` (`AwareDatetime`) es el offset local del navegador en el valor seleccionado (confirmado por Mariano). El 409 de responder no tiene forma verificada y se trata con `normalizeApiError` sin asumir estructura. De `turno` en la respuesta de ofrecer solo está probado el campo `estado`; no se tipan otros campos como seguros. Si un paciente queda fuera de las páginas consultadas de `GET /pacientes`, su nombre puede no resolverse y la tabla muestra "No disponible" (Open Question acotada en `design.md`). La resolución de nombres en tabla usa `incluir_inactivos=true` (confirmado por Mariano).

## Desajustes con el backend (registrados)

- **Sin motivo de rechazo:** el contrato de `RespuestaPaciente` solo acepta `acepta: bool`; no existe campo ni endpoint para registrar un motivo. La UI no implementa captura de motivo.
- **Sin historial de asignaciones:** no hay endpoint de historial ni estados expuestos para consultar asignaciones pasadas más allá del estado actual; la UI no muestra historial.
- **Sin listado de huecos:** el backend no expone un listado de huecos cancelados/disponibles para ofrecer; la selección del slot (`inicio`, `profesional_id`, `sillon_id`) es manual en el flujo de oferta según los datos que el usuario ingrese/seleccione.
- **Sin permisos por rol en este módulo:** los endpoints de lista de espera no aplican restricción por rol específica en backend; la UI solo contempla el aviso de permiso ante un `ApiError` de kind `"permiso"` (simulado con mock del cliente) sin romper la pantalla, sin asumir un 403 real del módulo.

# Design

## Context

See `proposal.md` (Why/What Changes) for motivation and scope. This change adds the `frontend-lista-espera` capability in the React/Vite frontend to consume the archived backend capability `lista-espera` implemented in `backend/app/lista_espera/` (endpoints, schemas, models, service) and specified in `openspec/specs/lista-espera/spec.md`. C-13 provides shell/routing/contracts and C-14 provides components, TanStack Query setup, form patterns, JWT session, and `ApiError`/`normalizeApiError` handling; C-24 established `Authorization: Bearer` as the only identity mechanism.

The current UI state is a placeholder in `frontend/src/pages/lista-espera.tsx` that must be replaced while preserving the `<h1>` "Lista de espera". No backend changes are in scope. Relevant KB sources: `knowledge-base/06_funcionalidades.md` §US-004, `knowledge-base/07_flujos_principales.md` §Flujo 4, `knowledge-base/10_preguntas_abiertas.md` §Q5 (FIFO provisional, orden sigue abierto), and `knowledge-base/05_reglas_de_negocio.md`.

**RN-* citation note:** only `RN-AG-02`, `RN-AG-03`, and `RN-TU-01` are cited in this change. Each was verified against `knowledge-base/05_reglas_de_negocio.md` (see pre-work evidence in the proposal report): they justify why an offered slot must be created/validated through the existing turnos service behavior surfaced by backend conflicts and why a rejected/cancelled slot is released, but no new RN logic is implemented in the frontend.

## Goals / Non-Goals

**Goals:**
- Implement `/lista-espera` as a traceable UI over the four existing backend endpoints: alta, listado FIFO con filtro, ofrecer hueco y responder oferta.
- Preserve backend order and semantics: do not re-sort pending entries client-side, do not auto-retry `POST` or `409`, disable actions while requests are in flight, and use C-14 components for loading/error/empty/modal states.
- Keep implementation aligned with real contracts: mirror backend schemas, handle `409`/`422`/permission errors through `normalizeApiError`, and type only fields evidenced by backend/spec (for `turno` in offer response, only `estado` is treated as safe).

**Non-Goals:**
- No backend changes, no invented endpoints/fields/states, and no client-side persistence simulating a server listing.
- No motivo de rechazo, no historial de asignaciones, no listado de huecos, and no role-permission model beyond handling a normalized permission error shape in UI.
- No changes to `frontend/src/services/http.ts`, `frontend/src/services/api-error.ts`, `frontend/src/types/errors.ts`, `frontend/src/app/router.tsx`, `frontend/src/auth/navigation.ts`, or nav links. No changes to shared files except one line in `frontend/src/services/query.ts` `resourceKeys`.

## Decisions

### D1 — Contract-first types and services mirror the backend
- **Decision:** Add `frontend/src/types/api-lista-espera.ts` and `frontend/src/services/lista-espera.ts` mirroring verified backend contracts: `ListaEsperaCreate { paciente_id, profesional_id?, prestacion_id }`, `ListaEsperaOut { id, paciente_id, profesional_id, prestacion_id, creado_en, estado, turno_id? }`, `OfrecerHueco { inicio, profesional_id, sillon_id }`, `RespuestaPaciente { acepta }`, and offer response `{ lista: ListaEsperaOut, turno: ... }` where only `turno.estado` is relied upon.
- **Rationale:** The backend Pydantic models and router define the authoritative shapes; typing unverified turno fields would invent contract guarantees.
- **Alternatives considered:** (a) Reuse generic/untyped payloads — rejected (loses traceability and weakens validation). (b) Type full `TurnoOut` for offer response — rejected (only `estado` is evidenced as required for this flow).

### D2 — FIFO order and filtering are owned by the backend
- **Decision:** The UI renders `GET /lista-espera` results in received order and never applies client-side sorting. Professional filtering passes `?profesional=` and relies on backend behavior that includes entries of that professional and general entries (`profesional_id` null).
- **Rationale:** Service `listar` already orders by `creado_en.asc()` and applies the general-entry rule; reordering in UI could diverge from backend FIFO (Q5 remains open/provisional at domain level but the contract is FIFO now).
- **Alternatives considered:** (a) Sort by `creado_en` in client — rejected (duplicates logic and risks masking backend contract issues). (b) Filter general entries client-side — rejected (backend is the source of truth for the query semantics).

### D3 — Offer flow uses C-14 Modal double confirmation and in-memory result handling
- **Decision:** "Ofrecer hueco" requires an explicit second confirmation in the C-14 Modal (no `confirm()`), disables actions while in flight, sends `POST /lista-espera/{id}/ofrecer` once, and keeps returned offer results in component/page state as a collection of offers indexed by waitlist entry id for the immediate response step. A second offer MUST NOT discard previously stored offer results. On 409/422 it shows normalized server cause and leaves the previously visible entry intact.
- **Fecha y hora (`OfrecerHueco.inicio`):** the field is `AwareDatetime` in the backend contract. The UI MUST NOT send a value without a timezone offset and MUST show a field error for `inicio` in that case. The offset sent is the browser local offset at the selected datetime (confirmado por Mariano).
- **Rationale:** The endpoint mutates state and may create a turno (validated by C-03, raising conflicts tied to RN-AG-02/RN-AG-03 and related validations); double confirmation and no auto-retry prevent accidental duplicate side effects. Because offered entries disappear from `GET`, in-memory results are necessary unless/until backend changes (see Open Questions). Indexing by entry id preserves multiple in-flight offers/responses in the same session.
- **Alternatives considered:** (a) Single-click offer — rejected (explicit requirement). (b) Auto-refetch pending list as the only post-offer view — rejected (cannot show/respond to an offered entry not returned by GET). (c) Persist offered state locally as a fake listing — rejected (invented persistence/listing). (d) Store a single latest offer result — rejected (a second offer would discard the first).

### D4 — Respond flow follows backend states and refresh semantics
- **Decision:** Accept sends `{acepta: true}` and displays returned `asignado`; reject sends `{acepta: false}`, displays returned `baja`, and invalidates/refetches the pending waitlist query so the list reflects backend FIFO advancement. Response actions operate on the stored offer result indexed by waitlist entry id; after a pending-list refresh, an offered entry may disappear from the table but its stored offer result MUST remain available for response in the current flow. Once an offer is answered (accepted or rejected), the stored offer MUST be marked as resolved in the current flow, its respond actions MUST be disabled, and the UI MUST NOT send a second `POST /lista-espera/{id}/responder` for that offer. On 409 the UI shows the normalized notice and leaves the current entry state intact without retry.
- **Rationale:** Backend `responder` cancels the offered turno on reject (releasing resources per RN-TU-01 at domain level) and advances FIFO server-side; UI must reflect returned states, not infer transitions. Keeping the stored offer available after refresh preserves the ability to respond when GET no longer returns the entry. Marking answered offers as resolved prevents duplicate responses and conflicting UI actions in the same session.
- **Alternatives considered:** (a) Optimistically remove/advance entries on reject — rejected (server is authoritative and response/409 handling must be explicit). (b) Assume 409 body shape for responder — rejected (shape not verified). (c) Drop stored offers on every pending-list refresh — rejected (would remove the ability to respond in the current flow). (d) Allow repeated respond actions after answer — rejected (risks duplicate POSTs and inconsistent local state).

### D5 — Loading, empty, error, and permission handling reuse C-14 patterns
- **Decision:** Use C-14 loading and error components for query states, `EmptyState` for empty pending results, and `normalizeApiError` for display. Permission UX is covered by handling an `ApiError` with `kind === "permiso"` from a mocked client response; the backend does not provide a verified 403 for this module.
- **Rationale:** Keeps UI consistent with the design system/data layer and satisfies the required permission-notice scenario without inventing backend behavior.
- **Alternatives considered:** (a) Build ad-hoc loaders/errors — rejected (inconsistent with C-14). (b) Assert a real 403 contract for lista endpoints — rejected (not verified).

### D6 — Query key and shared-file boundary
- **Decision:** Add a single `listaEspera` entry to `resourceKeys` in `frontend/src/services/query.ts` and use it for list queries/mutation invalidation. Do not touch router, navigation, nav links, http/api-error/errors modules, or the `<h1>` text in the page.
- **Rationale:** TanStack Query invalidation needs a stable resource key, but C-15 shares `query.ts`; limiting the change to one line minimizes conflict while preserving required cache behavior.
- **Alternatives considered:** (a) Inline query keys without `resourceKeys` — rejected (inconsistent with project pattern). (b) Broader `query.ts` refactor — rejected (conflicts with shared-file constraint).

### D7 — Catalog reads for human-readable names
- **Decision:** The table and selection controls MUST display human-readable names, not raw UUIDs. Read-only catalog data for patients, professionals, services, and chairs is fetched through functions implemented inside `frontend/src/services/lista-espera.ts`, reusing existing types from `frontend/src/types/api.ts`. Do NOT create `frontend/src/services/catalogo.ts` (C-15 owns it).
- **Backend read contracts (verified in `backend/app/agenda/router_catalogo.py`):**
  - `GET /pacientes`: `q: str | None = None`, `limit: Annotated[int, Query(ge=1, le=200)] = 50`, `offset: Annotated[int, Query(ge=0)] = 0`, `incluir_inactivos: bool = False`; response envelope `PacientesEnvelopeOut` with `items`, `total`, `limit`, `offset`.
  - `GET /profesionales`: `incluir_inactivos: bool = False`, `sucursal_id: uuid.UUID | None = None` (plus optional permission context dependency); returns `list[ProfesionalOut]`.
  - `GET /prestaciones`: `incluir_inactivos: bool = False`; returns `list[PrestacionOut]`.
  - `GET /sillones`: `incluir_inactivos: bool = False`, `sucursal_id: uuid.UUID | None = None` (plus optional permission context dependency); returns `list[SillonOut]`.
- **Patient select (alta):** searches using only the verified `q` parameter of `GET /pacientes` with `limit=200`; no other parameters are used for this search.
- **Name resolution in table:** catalog reads for name resolution use `incluir_inactivos=true` (verified parameter) so an inactive referenced entity can still be resolved (confirmado por Mariano). Select controls use the default parameter values.
- **Unresolved names:** when a referenced name cannot be resolved, the table MUST display the neutral label `"No disponible"` instead of the raw UUID.
- **No invented search params:** the UI MUST NOT invent search/filter parameters beyond those verified above.
- **Rationale:** Reception needs recognizable names, while C-15 is the owner of a shared catalog service. Keeping reads local to `lista-espera.ts` avoids cross-change ownership conflicts and stays within verified backend contracts. Allowing inactive references to resolve in the table avoids showing opaque identifiers for historical/inactive entities; unresolved cases still degrade to a neutral label.
- **Alternatives considered:** (a) Create `frontend/src/services/catalogo.ts` now — rejected (C-15 scope). (b) Display UUIDs — rejected (not operable for reception). (c) Invent patient lookup/search params — rejected (unverified backend contract). (d) Resolve only active entities in table — rejected as less robust for inactive references.

## Risks / Trade-offs

- **[Offered entry not listable by GET] →** The response flow depends on in-memory offer results indexed by waitlist entry id; a reload/navigation loses that context until backend supports listing offered entries. This is explicit in Open Questions and acceptance scope.
- **[Page refresh loses ability to respond] →** A full page refresh clears in-memory offer state and leaves the entry in backend state `ofrecido` with a `pendiente` turno, with no way to respond from the current UI. This is documented and not resolved in this change.
- **[Unverified responder 409 detail shape] →** UI relies on `normalizeApiError` generic messaging/cause extraction without assuming fields; tests must cover normalized display, not a specific payload.
- **[No slot listing endpoint] →** Offer requires user-provided slot inputs (`inicio`, `profesional_id`, `sillon_id`) rather than selecting from backend-provided available holes; UX is constrained but traceable to backend contract.
- **[Catalog pagination/lookup limits] →** `GET /pacientes` is paginated and no by-id lookup contract is introduced here; a patient may fall outside the consulted pages used by the UI, preventing name resolution in that case. The patient select for alta searches with `q` and `limit=200`; unresolved references in the table are shown as `"No disponible"`. Table name resolution uses `incluir_inactivos=true` (confirmado por Mariano).
- **[FIFO criterion domain uncertainty (Q5)] →** UI does not compute priority; it presents backend FIFO results and labels behavior as backend-defined.

## Migration Plan

Planning-only artifact set. No frontend/backend code changes are performed in this propose step. Apply (separate, user-requested workflow) should implement tasks in TDD order, preserve the stated file boundaries, and run frontend lint/test/build verification before archive.

## Open Questions

- **Estado `ofrecido` desaparece del `GET /lista-espera` (solo devuelve `pendiente`) y no existe endpoint para listar ofrecidas.** Impacto: tras ofrecer, la UI no puede recuperar la entrada ofrecida desde el listado para mostrarla/responderla si pierde el estado en memoria. Un refresh de página deja la entrada en estado `ofrecido` con un turno `pendiente` sin forma de responder desde la UI.
  - **(a) Responder en el mismo flujo con el estado en memoria (devuelto por `ofrecer`)**: **decisión confirmada por Mariano** para C-18. La pantalla conserva resultados de oferta en estado local indexado por id de entrada y habilita aceptar/rechazar inmediatamente; al recargar o salir se pierde el contexto de esa oferta. Impacto: implementable sin backend, pero UX frágil ante navegación/refresh y sin visibilidad histórica de ofrecidas.
  - **(b) Change de backend que liste las ofrecidas (o exponga consulta por estado/id)**: queda como mejora futura sujeta a un change de backend. Impacto: requiere cambio de contrato/capability backend y coordinación fuera de C-18; no se inventa endpoint en este change.

- **Forma del cuerpo de error `409` en `POST /lista-espera/{id}/responder`:** no verificada en backend/spec más allá de usar `HTTPException(409, detail=...)` en conflictos; la UI debe mostrar el aviso mediante `normalizeApiError` sin asumir una estructura concreta. Impacto: los mensajes pueden variar según normalización existente.

- **Campos utilizables de `turno` en la respuesta de `ofrecer`:** solo está probado `estado`; el resto del objeto turno no se tipa ni se muestra como dato seguro. Impacto: la UI puede mostrar un resumen mínimo (estado) sin afirmar identificadores u otros campos no verificados.

- **Selección de slot para ofrecer sin listado de huecos del backend:** el usuario debe proveer `inicio`, `profesional_id` y `sillon_id` manualmente (o desde datos ya disponibles en UI) porque no hay endpoint de huecos/cancelaciones. Impacto: la UX depende de información externa al módulo; cualquier selector asistido requeriría nuevos contratos.

- **Resolución de nombres de pacientes con `GET /pacientes` paginado:** el endpoint devuelve un envelope `{items,total,limit,offset}` con `limit` por defecto 50 (máx. 200) y no se inventan parámetros de búsqueda/lookup adicionales. El select de pacientes del alta busca con `q` y `limit=200`. La open question ahora solo cubre un paciente que quede fuera de las páginas consultadas por la UI, en cuyo caso la tabla muestra `"No disponible"`. La lectura con `incluir_inactivos=true` para resolver nombres en la tabla está confirmada por Mariano.

- **Offset de `OfrecerHueco.inicio` (`AwareDatetime`):** confirmado por Mariano; se envía el offset local del navegador en el valor seleccionado.

- **Criterio de orden FIFO (Q5 en KB):** sigue abierto a nivel dominio aunque el backend actual ordena por `creado_en` ascendente. Impacto: la UI presenta el orden del backend como contractualmente recibido, sin prometer una política de prioridad futura.

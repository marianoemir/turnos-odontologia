# Design

## Context

See `proposal.md` (Why/What Changes) for motivation and scope. This change adds the `frontend-caja` capability in the React/Vite frontend to consume the archived backend capability `caja-pagos` (9 endpoints in `backend/app/caja/router.py`, schemas in `backend/app/caja/schemas.py`, requirements in `openspec/specs/caja-pagos/spec.md`). C-13 provides shell/routing/contracts and C-14 provides components, data layer, JWT session, and `ApiError`/`http.ts` patterns. C-24 made `Authorization: Bearer` the only identity mechanism.

Current UI state: `frontend/src/pages/caja.tsx` is a placeholder ("Pantalla pendiente") mounted at `/caja` in `frontend/src/app/router.tsx`. The "Leer antes" KB sources constrain integration and environment handling: `knowledge-base/02_descripcion_general.md` §Integraciones externas (MP/ARCA/OS are backend concerns in this domain; credentials via env in later changes, not UI), `knowledge-base/07_flujos_principales.md` §Flujo 1 (turno creation context; payments/seña may reference turno), `knowledge-base/05_reglas_de_negocio.md` §Dominio: Excepciones globales (no agenda-specific RN-* added here; no invented domain rules), `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno (`MP_ACCESS_TOKEN` posterior/sensitive, never committed; no secrets in frontend bundle).

**RN-* citation note:** No `RN-*` rules are cited in this change's artifacts. The relevant verified section is `knowledge-base/05_reglas_de_negocio.md` §Dominio: Excepciones globales (no RN codes present). Domain behavior is traced to `openspec/specs/caja-pagos/spec.md` and backend contracts.

## Goals / Non-Goals

**Goals:**
- Implement `/caja` for `recepcion` as a traceable UI over existing caja-pagos endpoints: open/close with arqueo by date, register cobros (all medios/conceptos, obra social fields, seña), annul with mandatory reason and double confirmation, issue ARCA invoice with double confirmation and simulated marking, list liquidaciones with `pdf_referencia` shown as text and `SIM-` marked.
- Enforce UI safeguards required by the request: integer centavos only (no float), no automatic retry for POST or 409, disable submit actions while requests are in flight, visible simulated markers, no credentials in `VITE_*`/bundle, Buenos Aires local date for "today" selection.
- Reuse C-22/C-14 frontend patterns: `frontend/src/types/api-*.ts`, `frontend/src/services/*.ts`, page-level composition with existing components, `ApiError` handling, and no `http.ts` change unless indispensable.

**Non-Goals:**
- No backend changes, no new endpoints, no PDF download, no caja history listing.
- No changes to `frontend-sesion`, auth flow, or route guards (D2).
- No UI access for `admin` to `/caja` (explicit limitation, D2) even if backend permits.
- No invention of domain/business rules not present in verified KB/spec/backend contracts.

## Decisions

### D2 — UI access limited to `recepcion` (no `frontend-sesion` delta)
- **Decision:** `/caja` remains recepcion-only in UI. `admin` does not use caja from UI despite backend permission; client guard is not security and backend 403 is the enforcement backstop.
- **Rationale:** Explicit instruction for this change; avoids unrequested auth/routing deltas and keeps traceability to reviewed scope.
- **Alternatives considered:** (a) Allow admin in UI because backend permits — rejected (changes session/guard scope and contradicts D2). (b) Add frontend-sesion delta — rejected (out of scope).

### D3 — No caja history; query by date
- **Decision:** Screen queries `GET /caja?fecha=` (and may use `GET /caja/{id}` when id is known) for a selected date; default date is Buenos Aires local "today". Treat 404 "caja no existe para la fecha" as a normal "no caja for date" state.
- **Rationale:** Backend exposes no historical list endpoint; original scope bullet "historial de cajas" is not implementable.
- **Alternatives considered:** (a) Client-side history by iterating dates — rejected (invented behavior, unbounded calls, not backed by endpoint). (b) Add backend endpoint — rejected (out of scope, no backend changes).

### D4 — No PDF download; show `pdf_referencia` as text
- **Decision:** Liquidations list (`GET /liquidaciones-os`) displays `pdf_referencia` as text and marks it simulated when prefixed with `SIM-`; no download action/link.
- **Rationale:** Backend returns only textual reference; original scope "descarga de PDF" is not implementable.
- **Alternatives considered:** (a) Generate/download client-side PDF — rejected (invented artifact, no source data/contract). (b) Treat `pdf_referencia` as URL — rejected (contract is reference text/prefix convention, not guaranteed URL).

### D5 — Money and request safety in UI
- **Decision:** All monetary inputs/outputs are integer centavos (`*_centavos`). Amounts are entered in pesos and converted to integer centavos by string parsing (max 2 decimals), accepting comma and dot as decimal separator, never using `float` arithmetic. The parser rejects empty, zero, values with more than 2 decimals, and values exceeding `MONTO_MAX_CENTAVOS = 1_000_000_000_000` centavos (backend authority: `backend/app/caja/models.py`). Display is formatted from integer centavos. Disable submit buttons while async requests are pending; never auto-retry POST requests or HTTP 409 responses.
- **Rationale:** Aligns with backend authority (`MONTO_MAX_CENTAVOS = 1_000_000_000_000`, 422 on invalid amounts) and explicit design rules; prevents duplicate side effects and float/rounding errors in payment/cash operations.
- **Alternatives considered:** (a) Allow decimal currency inputs converted with float/Number arithmetic — rejected (risk of float/rounding errors). (b) Auto-retry on transient failures — rejected (forbidden for POST/409).

### D6 — Irreversible actions use double confirmation
- **Decision:** `POST /caja/cerrar`, `POST /cobros/{id}/anular`, and `POST /cobros/{id}/factura-arca` require an explicit second confirmation step in UI before sending, implemented with the C-14 Modal (focus trap, Escape). The browser `confirm()` alternative is removed. Annulment requires non-empty `motivo` and keeps annulment trace visible (`estado`, `motivo_anulacion`, `anulado_en`).
- **Rationale:** Matches requested safeguards and backend semantics (cierre/anulación/factura are sensitive/irreversible or conflict-prone actions) with a testable, accessible confirmation UX consistent with C-14 components.
- **Alternatives considered:** (a) Single-click actions — rejected (violates explicit rule). (b) Browser-only `confirm()` — rejected (not consistent with C-14 Modal/focus-trap/Escape behavior and less testable).

### D7 — Simulated integrations are visibly marked, never exposed
- **Decision:** Mark simulated states from backend fields: cobro `simulado` and `SIM-MP-` references, factura `simulado/mode="simulado"` and `SIM-` CAE, liquidación `pdf_referencia` starting `SIM-`. No `MP_ACCESS_TOKEN`, `ARCA_CERT`, or similar credentials in `VITE_*`, source, or bundle; all operations go through backend.
- **Rationale:** Backend spec and KB 08/02 establish simulation and env-only credentials; UI must reflect truth without claiming real fiscal/payment processing.
- **Alternatives considered:** (a) Hide simulation markers — rejected (misleading). (b) Read env flags in frontend — rejected (credential/exposure risk and unnecessary).

### D8 — Frontend structure and contracts
- **Decision:** Add caja types mirroring backend schemas (`CajaAbrir`, `CajaCerrar`, `CajaOut`, `CobroCreate`, `CobroOut`, `AnularCobro`, `FacturaArcaCreate`, `FacturaArcaOut`, `LiquidacionOSOut`) and service/query hooks using `apiRequest`/`ApiError` and resource-key invalidation pattern consistent with C-22. Do not modify `frontend/src/services/http.ts` unless indispensable; if needed, document before changing.
- **Rationale:** Traceability to verified contracts and consistency with existing frontend architecture.
- **Alternatives considered:** (a) Ad-hoc fetch calls in page — rejected (bypasses shared error/auth handling). (b) Reuse generic untyped payloads — rejected (loses contract traceability).

### D9 — Annulment/invoice scope without cobros listing [propuesta, revisable por PO/cátedra]
- **Decision:** As there is no endpoint to list cobros of a caja (verified: `CajaOut` and caja endpoints do not expose cobros; only `GET /cobros/{id}` exists for cobros), the UI allows annul and invoice only for: (a) cobros created in this screen (kept in memory state, refreshable with `GET /cobros/{id}`) and (b) cobros opened by pasting a cobro id. A pasted id that does not exist yields 404 with plain-string `detail`, shown without breaking; text that is not a UUID is blocked client-side and does not call the backend.
- **Limitation:** In-memory cobros are lost on page reload; the operator can recover actions only by pasting a known cobro id.
- **Rationale:** Scope must remain traceable to existing backend endpoints without inventing a listing API or unsupported history behavior.
- **Alternatives considered:** (a) Assume/list cobros by caja — rejected (no backend contract). (b) Only allow actions on cobros created in current session — rejected as too restrictive for valid ids known to the operator; pasted-id access is an explicit, reviewable alternative.

### D10 — `CajaCerrar.fecha` sent from UI
- **Decision:** By default the UI sends the selected date in `POST /caja/cerrar` (does not omit `fecha`). This aligns with the verified backend behavior in `ServicioCaja.cerrar` (`backend/app/caja/service.py`: uses `datos.fecha` when provided, else `hoy_local`, and closes the caja for that date).
- **Rationale:** Keeps close action explicit and traceable to the date the user is viewing/closing.
- **Alternatives considered:** (a) Omit `fecha` and rely on backend "today" default — rejected (less explicit; selected-date UX could diverge).

### D11 — `turno_id` input and `caja_id` not exposed [propuesta, revisable por PO/cátedra]
- **Decision:** `turno_id` is an optional text field for a UUID, validated in client-side format before submit; a backend 404 for a nonexistent turno is shown to the user. `caja_id` is not exposed in the UI (backend uses the open caja of the day when omitted).
- **Rationale:** Traceable to `POST /cobros` contract (`turno_id` optional UUID, `caja_id` optional) without inventing selection UIs not yet available.
- **Alternatives considered:** (a) Provide a turno selector — deferred/reviewable when C-15 exists. (b) Expose `caja_id` input — rejected (unnecessary; backend resolves open caja by day).

## Risks / Trade-offs

- **[404-by-date as normal state] →** UI must distinguish "no caja for date" from other 404s/errors using endpoint context and `ApiError` normalization; tests should cover empty-day UX.
- **[Admin backend-allowed but UI-blocked per D2] →** Documented limitation; backend 403 still protects operations if reached. PO/cátedra may revise in future change.
- **[No PDF/history despite original CHANGES text] →** Explicitly rectified in proposal/design/spec; prevents apply from inventing unsupported features.
- **[Double confirmation UX complexity] →** Use clear two-step interaction and disable controls during in-flight requests to avoid duplicates and ambiguous state.
- **[Buenos Aires "today" in browser] →** Use explicit America/Argentina/Buenos_Aires date calculation for default query; verify in tests where feasible.

## Migration Plan

Planning-only artifact set. No deployment or code migration performed in this propose step. Apply (separate, user-requested workflow) should implement tasks in order, run frontend tests/build/lint as applicable, and verify endpoint-aligned scenarios before archive.

## Open Questions

- **`detail` normalization in `ApiError` (verified shapes, apply task):** 404 for missing caja/cobro returns plain-string `detail` (e.g. `"caja no existe para la fecha {fecha}"`, `"cobro no existe: {id}"`) and some domain 422/409 responses may use string or `{causa, detalle}`; Pydantic validation 422 returns a list. Group 1.3/3 must verify how `ApiError` normalizes string detail (404 and domain 422) vs list detail (Pydantic 422); exact user-facing copy remains revisable in apply.
- **Cobro discovery without listing endpoint (verified, D9):** No endpoint lists cobros by caja/date and `CajaOut` does not include cobros. Annul/factura actions are limited to in-memory created cobros (refresh via `GET /cobros/{id}`) or pasted cobro ids; in-memory cobros are lost on reload. Additional UX affordances are revisable by PO/cátedra.
- **PO/cátedra review:** D2/D3/D4/D5/D6/D9/D11 may be revised; D10 is decided from verified backend behavior. Revisions require updating proposal/design/specs/tasks before apply.

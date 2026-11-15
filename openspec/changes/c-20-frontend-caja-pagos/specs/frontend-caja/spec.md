# Spec Delta

## Purpose

Provide a reception-only cash register UI that consumes existing caja-pagos endpoints to manage daily cash opening/closing, charges, annulments, simulated ARCA invoices, and OS liquidations.

## ADDED Requirements

### Requirement: Cash register consultation by date
The `/caja` UI SHALL query the day cash register by date using `GET /caja?fecha=` (defaulting to the current Buenos Aires local date) and present its state, opening amount, closing amounts when present, and totals by payment method.

#### Scenario: Open cash register is shown without closing amounts (happy-path)
- **GIVEN** an authenticated `recepcion` user and `GET /caja?fecha=2026-11-14` returns an open `CajaOut` with `estado = "abierta"`, `monto_apertura_centavos`, `totales_por_medio_centavos`, and `monto_esperado_centavos = null`, `monto_cierre_contado_centavos = null`, `diferencia_centavos = null`
- **WHEN** the user opens `/caja` for date `2026-11-14`
- **THEN** the UI displays the open cash register state, opening amount, and totals by payment method without showing closing or expected amounts as finalized values

#### Scenario: Closed cash register is shown with counted amount and difference (happy-path)
- **GIVEN** an authenticated `recepcion` user and `GET /caja?fecha=2026-11-14` returns a closed `CajaOut` with `monto_cierre_contado_centavos` and `diferencia_centavos`
- **WHEN** the user opens `/caja` for date `2026-11-14`
- **THEN** the UI displays expected vs counted amounts, difference, and totals by payment method

#### Scenario: Backend denies access to cash register query as enforcement backstop (business-error)
- **GIVEN** an authenticated UI session attempts to view cash register data but backend authorization remains the enforcement backstop and `GET /caja?fecha=` returns HTTP 403 with `detail.causa = "permiso_denegado"`
- **WHEN** the user attempts to view `/caja` data
- **THEN** the UI shows a permission error state based on the backend response and does not present cash register actions as successful

#### Scenario: No cash register exists for selected date (edge-case)
- **GIVEN** `GET /caja?fecha=2026-11-14` returns HTTP 404 with detail indicating the cash register does not exist for that date
- **WHEN** the user views `/caja` for `2026-11-14`
- **THEN** the UI treats it as "no cash register for selected date", allows selecting another date, and offers opening only if the selected date is today without treating the 404 as a fatal application error

#### Scenario: Default date uses Buenos Aires local date near UTC boundary (edge-case)
- **GIVEN** the current time is 23:30 in America/Argentina/Buenos_Aires (02:30Z the next day)
- **WHEN** the user opens `/caja` without selecting a date
- **THEN** the UI defaults the selected/query date to the Buenos Aires local date, not the UTC date

### Requirement: Open and close daily cash register with double confirmation
The UI SHALL open cash (`POST /caja/abrir`) and close cash (`POST /caja/cerrar`) with integer cent amounts, disabling submit actions while requests are in flight and requiring a second explicit confirmation before closing.

#### Scenario: Reception opens cash register successfully (happy-path)
- **GIVEN** an authenticated `recepcion` user and no cash register exists for today
- **WHEN** the user submits a valid non-negative `monto_apertura_centavos` to `POST /caja/abrir`
- **THEN** the UI sends the request once, disables the submit action until completion, and shows the returned open `CajaOut`

#### Scenario: Opening an already opened day is rejected (business-error)
- **GIVEN** `POST /caja/abrir` returns HTTP 409 with `detail.causa = "caja_ya_abierta"`
- **WHEN** the user attempts to open the cash register for that day
- **THEN** the UI shows the business conflict without automatic retry and triggers a refetch of `GET /caja` so the existing cash register state is visible

#### Scenario: Close requires double confirmation and counted amount edge (edge-case)
- **GIVEN** an open cash register for the selected date and the user entered `monto_cierre_contado_centavos = 0`
- **WHEN** the user initiates close and confirms the irreversible action in a second explicit step using the C-14 Modal
- **THEN** the UI sends `POST /caja/cerrar` only after the second confirmation and displays the returned `estado = "cerrada"`, expected amount, counted amount, and `diferencia_centavos`

### Requirement: Register payments by supported means
The UI SHALL register payments via `POST /cobros` using integer `monto_centavos`, supported `medio` and `concepto` values, an optional `turno_id` text field validated as UUID when provided, and obra social fields only when `medio = "obra_social"`; `caja_id` is not exposed in the UI.

#### Scenario: Register a valid cash payment with deposit concept (happy-path)
- **GIVEN** an authenticated `recepcion` user, an open cash register, and a valid `turno_id` UUID entered in the optional text field
- **WHEN** the user submits `POST /cobros` with `medio = "efectivo"`, `concepto = "sena"`, positive `monto_centavos`, and the validated `turno_id`
- **THEN** the UI sends the payload once, disables submit while in flight, and shows the returned `CobroOut` including `estado`, `concepto`, `medio`, and `simulado`

#### Scenario: Payment registration without open cash register is rejected (business-error)
- **GIVEN** there is no open cash register for the day and `POST /cobros` returns HTTP 409 with `detail.causa = "caja_no_abierta"`
- **WHEN** the user attempts to register a payment
- **THEN** the UI shows a business error explaining that a cash register must be opened, without automatic retry, and does not present a created payment

#### Scenario: Obra social payment omits nomenclador_codigo (business-error)
- **GIVEN** the user selects `medio = "obra_social"` and enters `nomenclador_codigo` as empty or whitespace-only
- **WHEN** the user tries to submit the payment
- **THEN** the UI blocks submission, shows a clear notice, and does not call the backend (the Pydantic 422 validation response remains a backend fallback; its request/response shape is derived and not measured against the backend)

#### Scenario: Invalid turno_id format is blocked before request (edge-case)
- **GIVEN** the user enters a `turno_id` value that is not a valid UUID
- **WHEN** the user tries to submit the payment
- **THEN** the UI blocks submission and does not call the backend

#### Scenario: Nonexistent turno_id returns not found (edge-case)
- **GIVEN** the user enters a syntactically valid `turno_id` UUID and `POST /cobros` returns HTTP 404 with a plain-string `detail`
- **WHEN** the user submits the payment
- **THEN** the UI shows the not-found error from the normalized string detail without breaking and does not present a created payment

#### Scenario: Peso amount parser rejects invalid values (edge-case)
- **GIVEN** the user enters a peso amount that is empty, zero, has more than 2 decimals, or exceeds `1_000_000_000_000` centavos
- **WHEN** the UI parses the amount to integer centavos
- **THEN** the parser rejects the value and never uses float arithmetic

#### Scenario: Peso amount parser accepts comma and dot separators (edge-case)
- **GIVEN** the user enters `"1.250,50"` or `"1250.5"` as a valid peso amount
- **WHEN** the UI parses the amount to integer centavos
- **THEN** both inputs produce the same integer centavos value and the parser never uses float arithmetic

#### Scenario: Mercado Pago payment is marked simulated (edge-case)
- **GIVEN** the user submits a valid `POST /cobros` request with `medio = "mercado_pago"`
- **WHEN** the backend returns `CobroOut` with `simulado = true` and a `referencia_externa` prefixed with `SIM-MP-`
- **THEN** the UI visibly marks the payment as simulated and displays the simulated reference without exposing credentials or making network calls outside the backend API

### Requirement: Annul payments and issue simulated ARCA invoices with safeguards
The UI SHALL annul registered payments via `POST /cobros/{id}/anular` with mandatory reason and double confirmation, and issue ARCA invoices via `POST /cobros/{id}/factura-arca` with user-chosen concrete type and double confirmation, scoped to in-memory cobros or pasted cobro ids (D9), with visible simulated marking.

#### Scenario: Payment annulment succeeds with visible trace (happy-path)
- **GIVEN** a registered payment eligible for annulment and an authenticated `recepcion` user
- **WHEN** the user provides a non-empty reason, confirms the irreversible action in a second explicit step using the C-14 Modal, and submits `POST /cobros/{id}/anular`
- **THEN** the UI shows the returned annulled payment state including `motivo_anulacion` and `anulado_en` and keeps the payment visible as annulled

#### Scenario: Invoice request is rejected for already invoiced payment (business-error)
- **GIVEN** a payment already invoiced and `POST /cobros/{id}/factura-arca` returns HTTP 409 with `detail.causa = "cobro_ya_facturado"`
- **WHEN** the user attempts to issue an ARCA invoice after explicit confirmation in the C-14 Modal
- **THEN** the UI shows the conflict without automatic retry and does not display a newly issued invoice

#### Scenario: Annulment conflicts with closed cash register (business-error)
- **GIVEN** `POST /cobros/{id}/anular` returns HTTP 409 with `detail.causa = "caja_cerrada"`
- **WHEN** the user confirms and submits the annulment
- **THEN** the UI shows the conflict without automatic retry and does not mark the payment as annulled

#### Scenario: Annulment conflicts with invoiced payment (business-error)
- **GIVEN** `POST /cobros/{id}/anular` returns HTTP 409 with `detail.causa = "cobro_facturado"`
- **WHEN** the user confirms and submits the annulment
- **THEN** the UI shows the conflict without automatic retry and does not mark the payment as annulled

#### Scenario: Annulment with empty reason is blocked before request (business-error)
- **GIVEN** the user attempts to annul a known cobro and `motivo.trim()` is empty
- **WHEN** the user tries to submit the annulment action
- **THEN** the UI blocks submission and does not send `POST /cobros/{id}/anular`

#### Scenario: Pasted nonexistent cobro id shows not found without breaking (edge-case)
- **GIVEN** the user pastes a syntactically valid cobro UUID that does not exist and `GET /cobros/{id}` returns HTTP 404 with a plain-string `detail`
- **WHEN** the UI loads or acts on that cobro id
- **THEN** the UI shows the not-found error from the normalized string detail without breaking and without changing local cobro state

#### Scenario: Non-UUID cobro id text does not call backend (edge-case)
- **GIVEN** the user enters cobro id text that is not a valid UUID
- **WHEN** the user tries to load, annul, or invoice that cobro id
- **THEN** the UI blocks the action and does not call the backend

#### Scenario: Simulated ARCA invoice type B is explicitly marked (edge-case)
- **GIVEN** a registered payment, the user chooses invoice type `B`, and `POST /cobros/{id}/factura-arca` is sent with `tipo = "B"`
- **WHEN** the backend returns `FacturaArcaOut` with `tipo = "B"`, `simulado = true`, `modo = "simulado"`, and `cae` prefixed with `SIM-`
- **THEN** the UI visibly marks the invoice as simulated and displays the returned `tipo = "B"`, `cae`, and `qr` without claiming a real fiscal emission

### Requirement: List OS liquidations without PDF download
The UI SHALL list OS liquidations from `GET /liquidaciones-os`, show `pdf_referencia` as text, and visibly mark references prefixed with `SIM-` as simulated without providing file download.

#### Scenario: Liquidations list is displayed (happy-path)
- **GIVEN** `GET /liquidaciones-os` returns liquidation items including amounts, `estado`, and `pdf_referencia`
- **WHEN** the user views the liquidations section in `/caja`
- **THEN** the UI renders the list with each liquidation's key data and `pdf_referencia` shown as text

#### Scenario: Liquidations endpoint denies access as enforcement backstop (business-error)
- **GIVEN** an authenticated UI session attempts to load liquidations but backend authorization remains the enforcement backstop and `GET /liquidaciones-os` returns HTTP 403 with `detail.causa = "permiso_denegado"`
- **WHEN** the user attempts to load liquidations
- **THEN** the UI shows a permission/business error state for that section without automatic retry

#### Scenario: Empty liquidations list shows empty state (edge-case)
- **GIVEN** `GET /liquidaciones-os` returns an empty list
- **WHEN** the user views the liquidations section
- **THEN** the UI shows an empty state

#### Scenario: Simulated liquidation reference is marked as text without download (edge-case)
- **GIVEN** `GET /liquidaciones-os` returns an item whose `pdf_referencia` starts with `SIM-`
- **WHEN** the user views the liquidations section
- **THEN** the UI marks the `pdf_referencia` as simulated, displays it as text, and provides no download action

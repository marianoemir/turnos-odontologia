# Spec Delta

## Purpose

Provides the reception UI for the waitlist capability so users can register patients, review pending entries in backend FIFO order, offer a slot with confirmation, and record accept/reject responses aligned with the existing backend behavior.

## ADDED Requirements

### Requirement: Register a patient in the waitlist
The UI SHALL allow reception to submit a waitlist entry with a required patient and service and an optional professional, and SHALL show the created pending entry or the backend error without inventing fields.

#### Scenario: Successful waitlist registration (happy-path)
- **GIVEN** an authenticated reception session and valid patient and service selections
- **WHEN** the user submits the waitlist registration form with no professional selected
- **THEN** the UI sends `POST /lista-espera` once and displays the returned pending entry using backend data

#### Scenario: Backend rejects registration with entity not found (business-error)
- **GIVEN** the registration request is submitted with an entity identifier that does not exist
- **WHEN** the backend responds with HTTP 404 for the submitted data
- **THEN** the UI shows the normalized backend error cause, does not present a created entry, and does not automatically retry the POST

#### Scenario: Backend rejects registration with validation error (business-error)
- **GIVEN** the registration request is submitted with invalid input data
- **WHEN** the backend responds with HTTP 422 for the submitted data
- **THEN** the UI shows the normalized backend error cause, does not present a created entry, and does not automatically retry the POST

#### Scenario: Submit is blocked while registration is in flight (edge-case)
- **GIVEN** a valid registration submit is already in progress
- **WHEN** the user attempts to trigger the registration action again
- **THEN** the submit action remains disabled until the request completes and no duplicate `POST /lista-espera` request is sent

### Requirement: Display pending waitlist entries in backend FIFO order
The UI SHALL load pending waitlist entries from `GET /lista-espera`, preserve the order returned by the backend without client-side reordering, and support filtering by professional including general entries.

#### Scenario: Entries are shown in backend FIFO order (happy-path)
- **GIVEN** `GET /lista-espera` returns pending entries ordered by `creado_en` ascending
- **WHEN** the waitlist screen renders the list
- **THEN** the UI displays entries in the same order received from the backend without applying client-side sorting

#### Scenario: Professional filter includes general entries (edge-case)
- **GIVEN** the user selects a professional filter
- **WHEN** the UI requests `GET /lista-espera?profesional=<id>`
- **THEN** the UI renders only the entries returned by the backend for that professional and its general entries as provided by the response

#### Scenario: Empty waitlist shows empty state (edge-case)
- **GIVEN** `GET /lista-espera` returns an empty list
- **WHEN** the waitlist screen finishes loading
- **THEN** the UI shows the C-14 `EmptyState` component and no waitlist rows

### Requirement: Show catalog names instead of UUIDs
The UI SHALL resolve patient, professional, service, and chair identifiers to human-readable names in the table and selection controls using read-only catalog data, SHALL show the neutral label "No disponible" in the table when a referenced name cannot be resolved, and SHALL keep the screen usable when catalog loading fails.

#### Scenario: Names are visible in the table (happy-path)
- **GIVEN** pending waitlist entries and catalog read data for patients, professionals, services, and chairs are available
- **WHEN** the waitlist screen renders the table and selection controls
- **THEN** the UI displays human-readable names for referenced entities instead of raw UUIDs

#### Scenario: Unresolved reference shows a neutral label (edge-case)
- **GIVEN** a pending waitlist entry references an entity whose name cannot be resolved from the consulted catalog data
- **WHEN** the waitlist screen renders the table
- **THEN** the UI displays the neutral label "No disponible" for that reference instead of a raw UUID

#### Scenario: Catalog read failure shows error without breaking the screen (edge-case)
- **GIVEN** one catalog read request fails with a normalized `ApiError`
- **WHEN** the waitlist screen handles the failure
- **THEN** the UI shows an error state for that failure and keeps the screen usable without crashing

### Requirement: Show loading, error, and permission states with C-14 components
The UI SHALL use C-14 loading and error presentation patterns for waitlist queries and SHALL handle permission errors from the client error model without breaking the screen.

#### Scenario: Waitlist query is loading (edge-case)
- **GIVEN** the waitlist query has not resolved yet
- **WHEN** the user opens the waitlist screen
- **THEN** the UI shows the C-14 loading state until the query resolves

#### Scenario: Waitlist query fails with a non-permission error (business-error)
- **GIVEN** `GET /lista-espera` fails with a normalized non-permission `ApiError`
- **WHEN** the error state is rendered
- **THEN** the UI shows the C-14 error presentation with the server-provided message and keeps the screen usable

#### Scenario: Permission error is shown without breaking the screen (business-error)
- **GIVEN** the waitlist client returns an `ApiError` with kind `"permiso"` in a mocked client response
- **WHEN** the UI handles the error
- **THEN** the UI displays a permission notice based on the normalized error and keeps the screen intact without a crash

### Requirement: Offer a slot with double confirmation
The UI SHALL require an explicit second confirmation in the C-14 Modal before offering a slot, send the offer request once, and present the backend result showing the entry became offered.

#### Scenario: Offer succeeds and shows offered result (happy-path)
- **GIVEN** a pending waitlist entry and a user-entered slot with `inicio`, `profesional_id`, and `sillon_id`
- **WHEN** the user confirms the offer in the second explicit step of the C-14 Modal
- **THEN** the UI sends `POST /lista-espera/{id}/ofrecer` once and displays the returned entry as `ofrecido` together with the returned turno information available in the response

#### Scenario: Offer conflict keeps the entry intact (business-error)
- **GIVEN** the user confirms an offer action
- **WHEN** the backend responds with HTTP 409
- **THEN** the UI shows the normalized server cause, does not automatically retry the request, and leaves the previously visible waitlist entry state intact in the UI

#### Scenario: Offer validation error keeps the entry intact (business-error)
- **GIVEN** the user confirms an offer action
- **WHEN** the backend responds with HTTP 422
- **THEN** the UI shows the normalized server cause, does not automatically retry the request, and leaves the previously visible waitlist entry state intact in the UI

#### Scenario: Offer start value without offset is rejected locally (edge-case)
- **GIVEN** the user enters an `inicio` value without a timezone offset
- **WHEN** the user attempts to confirm the offer
- **THEN** the UI does not send `POST /lista-espera/{id}/ofrecer` and shows a field error for `inicio`

#### Scenario: Offer action is guarded while in flight (edge-case)
- **GIVEN** the user has already started the second confirmation step for an offer
- **WHEN** the offer request is in progress
- **THEN** the confirm and trigger actions remain disabled until completion and the browser `confirm()` dialog is never used

### Requirement: Respond to an offered entry
The UI SHALL allow recording acceptance or rejection of an offered entry and SHALL reflect the backend state transitions without simulating a listing endpoint.

#### Scenario: Accepting an offer marks the entry as assigned (happy-path)
- **GIVEN** an offered entry is available to respond in the current flow
- **WHEN** the user submits acceptance through `POST /lista-espera/{id}/responder` with `acepta = true`
- **THEN** the UI shows the returned entry state as `asignado`

#### Scenario: Rejecting an offer marks the entry as baja and refreshes the list (happy-path)
- **GIVEN** an offered entry is available to respond in the current flow
- **WHEN** the user submits rejection through `POST /lista-espera/{id}/responder` with `acepta = false`
- **THEN** the UI shows the returned entry state as `baja` and refreshes the pending waitlist query

#### Scenario: Respond conflict shows notice and leaves entry intact (business-error)
- **GIVEN** the user submits a response for an offered entry
- **WHEN** the backend responds with HTTP 409
- **THEN** the UI shows the normalized conflict notice, does not automatically retry the POST, and leaves the current entry state intact in the UI

#### Scenario: A refreshed list hides the offered entry but response remains available (edge-case)
- **GIVEN** an offered entry result is stored in memory for the current flow
- **WHEN** the pending waitlist query is refreshed and the backend no longer returns that entry
- **THEN** the offered entry no longer appears in the pending table and the stored offer remains available for the user to respond in the current flow

#### Scenario: A second offer keeps the first offer available (edge-case)
- **GIVEN** an offered entry result is stored in memory for the current flow
- **WHEN** the user offers a slot for a different pending waitlist entry
- **THEN** the stored offer result for the first entry remains available for the user to respond in the current flow

#### Scenario: An answered offer cannot be answered again (edge-case)
- **GIVEN** an offered entry has been answered with acceptance or rejection in the current flow
- **WHEN** the user views that answered offer
- **THEN** the stored offer is resolved, its respond actions are disabled, and the UI does not send a second `POST /lista-espera/{id}/responder` for that offer

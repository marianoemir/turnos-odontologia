# C-14 review blockers — approved planning decision

Date: 2026-11-13

The user explicitly approved correcting the two blockers found before archive:

1. Consume the C-24 multi-sucursal login flow. On the exact HTTP 422 payload
   `detail.causa=sucursal_requerida` and `detail.detalle=Debe especificar una
   sucursal_id entre las asociadas`, keep the login anonymous and show a
   UUID-validated `sucursal_id` control. C-24 does not disclose associations,
   so the UI must not enumerate, guess, or probe branch IDs. Retry once with
   `{ dni, password, sucursal_id }`; handle 403 `sucursal_no_asociada` as a
   correctable unauthorized selection.
2. Keep browser API traffic same-origin below `/api`. Normalize
   `VITE_API_BASE_URL` so only relative `/api` values survive; invalid, absolute,
   protocol-relative, cross-origin, or escaping relative values fall back to
   `/api`.

The resulting implementation and verification work is intentionally unchecked
in C-14 tasks 1.4, 4.6, and 5.3. No application code was changed by this
planning update.

# Proposal

## Why

El backend ya expone reserva pública sin login (C-08, `reserva-online`) y confirmación/cancelación por token (C-07, `recordatorios`), pero el frontend no ofrece las pantallas del paciente: reservar desde el link, confirmar o cancelar en un toque desde WhatsApp. C-21 completa la cara pública del MVP para que esas rutas sean utilizables en mobile, sin sesión interna, sin exponer datos de terceros y con feedback alineado a los contratos reales del backend.

## What Changes

- Agregar la pantalla pública `/reservar/:profesional`: selección de prestación y fecha, consulta de slots reales, alta pendiente y feedback explícito ante 409 (con alternativa), 422 y 429.
- Agregar las pantallas públicas `/confirmar/:token` y `/cancelar/:token`: resultado explícito (`confirmado`, `cancelado`, `expirado`, `ya usado`), sin login y sin disparar efectos globales de sesión.
- Definir comportamiento mobile-first para estas rutas (objetivos táctiles `>= 44px`, sin dependencia de hover), protección de privacidad (sin datos de otros pacientes, datos personales mínimos) y `noindex` en rutas con token.
- Definir consumo HTTP público (sin `Authorization`, sin notificaciones/redirecciones globales de 401/403/429/timeout/red propias de sesión interna) y la estrategia de ejecución de confirmación/cancelación frente a links abiertos por GET desde WhatsApp o previsualizadores.
- Incorporar verificación RTL por escenario, incluyendo estados vacíos, cambios con solicitudes en curso, doble envío y límites de rate limit.

## Capabilities

### New Capabilities
- `frontend-reserva-publica`: pantallas y flujos frontend públicos para reserva online y confirmación/cancelación por token, consumiendo los contratos existentes de `reserva-online` y `recordatorios` sin autenticación ni efectos de sesión interna.

### Modified Capabilities
- (ninguna)

## Impact

- Frontend: `frontend/src/pages/reservar.tsx`, `frontend/src/pages/confirmar.tsx`, `frontend/src/pages/cancelar.tsx`, servicios/tipos/utilidades de reserva pública, tests RTL y ajustes acotados de routing/layout público solo si hacen falta para `noindex` o estados de resultado.
- Contratos consumidos (sin cambios): `GET /reservar/{profesional}?prestacion=&fecha=`, `POST /reservar` (`reserva-online`); `POST /confirmar/{token}`, `POST /cancelar/{token}` (`recordatorios`).
- Infraestructura frontend existente reutilizada: rutas públicas fuera de `ProtectedRoute`/shell interno (`frontend/src/app/router.tsx`, `frontend/src/app/public-layout.tsx`), cliente HTTP con opción `publica` y handlers globales de auth (`frontend/src/services/http.ts`, `frontend/src/auth/auth-events.ts`, `frontend/src/auth/session-expiry.tsx`).
- Sin cambios de backend, sin migraciones, sin nuevos endpoints, sin credenciales ni secretos. Sin cambios en `CHANGES.md`.
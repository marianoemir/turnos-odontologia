# Design

## Context

Ver `proposal.md` (motivación y alcance) y `specs/frontend-reserva-publica/spec.md` (contrato observable). Este change planifica solo artefactos OpenSpec; no implementa código.

### Fuentes leídas y citadas

- **C-08 contrato vigente:** `openspec/specs/reserva-online/spec.md` (Purpose y Requirements: slots `GET /reservar/{profesional}?prestacion=&fecha=` como lista ordenada `[{inicio,fin}]` sin datos de pacientes/sillón; `POST /reservar` crea `pendiente` con 201 `{turno_id, profesional_id, prestacion_id, inicio, fin, estado}` sin `sillon_id`/`paciente_id`/`nombre`/`dni`/`contacto`/`creado_por`; DNI existente reutiliza paciente con misma forma 201 sin revelar existencia; 409 con `detail.causa` `profesional|sillon|horario|bloqueo`; 422 body/fecha/inicio sin zona, 404 refs inexistentes, 429 rate limit por IP en alta, rutas públicas sin auth; borde `inicio==fin` aceptado).
- **C-08 diseño archivado:** `openspec/changes/archive/2026-11-10-c-08-reserva-online/design.md` (D1 paquete `backend/app/reserva_online/`; D2 slots por candidatos `duracion_min` filtrados por `ServicioTurnos.validar`; D3 rutas sin dependencia RBAC; D4 alta por `nombre/dni/contacto` con reutilización por DNI ignorando nombre/contacto y 422 propio si paciente inactivo; D5 sillón asignado por servidor; D6 rate limit en memoria solo en `POST /reservar`, `GET` sin límite, best-effort single-process; D7 sin token inmediato en 201, confirmación/cancelación vía C-07 cuando el job genere recordatorio y hueco si reserva con menos anticipación que ventana/corrida del job; D8 respuesta mínima y `creado_por` no expuesto; Q-C08-07/09/10/13 como abiertos/diferidos relevantes).
- **C-07 contrato vigente:** `openspec/specs/recordatorios/spec.md` (rutas públicas `POST /confirmar/{token}` y `POST /cancelar/{token}`; 200 `{resultado, turno_id, inicio}` con `confirmado|cancelado|expirado` sin datos personales; misma acción repetida idempotente 200; acción opuesta 409 `{"detail":{"causa":"ya_usado","detalle","accion_previa":"confirmado|cancelado"}}`; token inexistente 404; formato inválido 422; token vencido/no aplicable 200 `expirado`; token de 43 chars URL-safe; confirmación sobre turno ya confirmado puede consumir token como confirmación aplicada según contrato).
- **C-07 diseño archivado:** `openspec/changes/archive/2026-11-06-c-07-recordatorios-confirmacion/design.md` (D7 precedencia y semántica: 422 formato, 404 inexistente, 200 misma acción ya aplicada, 409 opuesta `ya_usado`, 200 `expirado` para token no enviado/vencido o turno no aplicable, consumo atómico; D8 `no_aplica` mapeado a `expirado`; D11 rutas públicas sin auth, `Path` con patrón 43 chars, respuesta sin PII; contrato para C-21: estados de pantalla `confirmado`, `cancelado`, `expirado` y `ya usado` derivado del 409).
- **C-14 specs:** `openspec/specs/frontend-componentes/spec.md` (componentes accesibles, formularios con validación local + 422 de API a campos, tabla/estados/toast/modal) y `openspec/specs/frontend-sesion/spec.md` (login, navegación interna por rol, 401 finaliza sesión y redirige a login, 403 conserva sesión y comunica permiso insuficiente, rutas públicas `/reservar/:profesional`, `/confirmar/:token`, `/cancelar/:token` independientes de sesión sin token ni redirección al login).
- **Cliente HTTP y efectos globales:** `frontend/src/services/http.ts` (`publica` omite Bearer y elimina `Authorization/X-Actor-Rol/X-Actor-Usuario/X-Sucursal-Id`; en respuestas no ok solo para requests no públicas llama `notifyUnauthorized()` en 401 y `notifyForbidden()` en 403; normaliza 409/422/404/429/red/timeout a `ApiError`), `frontend/src/auth/auth-events.ts` (`notifyUnauthorized/notifyForbidden` delegan a handlers registrados), `frontend/src/auth/session-expiry.tsx` (registra handlers: `onUnauthorized` limpia sesión y navega a `/login` con aviso; `onForbidden` muestra aviso "Permiso insuficiente"; también expira sesión por `exp`).
- **Router, layout y guarda:** `frontend/src/app/router.tsx` (rutas públicas bajo `PublicLayout` fuera de `ProtectedRoute`/`Shell`; `/login` pública; internas bajo `ProtectedRoute`), `frontend/src/app/public-layout.tsx` (layout sin nav interna), `frontend/src/auth/protected-route.tsx` (anónimo → `/login?returnTo=...`; rol sin permiso → `/agenda` con `notice`), `frontend/src/auth/navigation.ts` (`isInternalPath`, `canNavigate`, `safeReturnTo` descarta destinos no internos o no permitidos y cae en `/agenda`).
- **KB:** `knowledge-base/03_actores_y_roles.md` (RBAC y rutas públicas), `knowledge-base/06_funcionalidades.md` (US-005 implementada C-07, US-006/007 pendientes), `knowledge-base/07_flujos_principales.md` (Flujo 1 crear turno y validaciones; Flujo 2 cancelar/reprogramar), `knowledge-base/01_vision_y_objetivos.md` (alcance v1 incluye reserva online 24/7 por link y confirmación/cancelación 1 toque).
- **Backend real (repo):** `backend/app/reserva_online/schemas.py` (`ReservaCreate` exige `nombre`, `dni`, `profesional_id`, `prestacion_id`, `inicio` con timezone y admite `contacto` opcional `str | None`; `ReservaOut` expone `turno_id`, `profesional_id`, `prestacion_id`, `inicio`, `fin`, `estado`; `SlotOut` expone `inicio`, `fin`), `backend/app/reserva_online/router.py` (`GET /reservar/{profesional}?prestacion=&fecha=`, `POST /reservar` público con rate limit en memoria, 404 refs inexistentes, 409/422 normalizados), `backend/app/reserva_online/service.py` (422 propio "el paciente esta inactivo" cuando DNI existe e inactivo; `creado_por="reserva_online"` interno). `backend/app/agenda/router_catalogo.py` expone `GET /prestaciones` sin dependencia de auth en el handler, con `incluir_inactivos` en `false` por defecto y `PrestacionOut` limitado a `id`, `nombre`, `duracion_min`, `activo`.

## Goals / Non-Goals

**Goals:**
- Planificar UI pública de reserva y de tokens alineada a contratos backend vigentes, mobile-first y sin exponer datos de terceros.
- Aislar completamente las rutas y requests públicas de la sesión interna (sin Bearer, sin redirects/avisos globales por 401/403 de requests públicas).
- Cubrir estados de resultado, errores, concurrencia de UI (cambios con requests en curso, doble submit) y verificación RTL por escenario.

**Non-Goals:**
- No cambiar backend, endpoints, modelos, migraciones, rate limit, tokens ni reglas de negocio.
- No implementar login, selección de sucursal ni flujos internos.
- No agregar proveedor real de mensajería, reintentos automáticos ni tracking.
- No modificar `CHANGES.md`.

## Decisions

### D1 (a) — Rutas públicas fuera de `ProtectedRoute`, `canNavigate` y shell interno
- **Decisión:** mantener `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` bajo `PublicLayout` y fuera del árbol de `ProtectedRoute`/`Shell`, como ya declara `frontend/src/app/router.tsx`. No se agregarán a `isInternalPath`/`canNavigate` de `frontend/src/auth/navigation.ts` ni a la navegación interna.
- **Sesión activa:** estas rutas no dependen de `useSession` para acceso; aunque exista sesión, se renderizan en layout público y no se redirigen a rutas internas. `safeReturnTo` ya rechaza rutas no internas.
- **Rationale:** cumple `frontend-sesion` "Rutas públicas se mantienen independientes de la sesión" y evita que la guarda interna o el shell las traten como recursos protegidos.

### D2 (b) — Cliente HTTP público sin credenciales ni efectos globales
- **Decisión:** todas las requests de estas pantallas usarán `apiRequest(..., { publica: true })` (o helper equivalente que fuerce `publica: true`). Según `frontend/src/services/http.ts`, esto elimina `Authorization` y cabeceras retiradas, y **no** invoca `notifyUnauthorized()`/`notifyForbidden()` aunque el status sea 401/403. La UI pública manejará localmente `ApiError` de dominio/transporte (409/422/404/429/timeout/red) sin reintentos automáticos.
- **Rate limit:** el backend limita `POST /reservar` (429 `rate_limit`); `GET /reservar` no tiene rate limit documentado en C-08. La UI no debe reintentar automáticamente ningún 429 público.

### D3 (c) — Confirmación/cancelación por token: POST explícito con botón, no automático en montaje
- **Decisión:** la página cargará en modo informativo/neutro y ejecutará el `POST /confirmar/{token}` o `POST /cancelar/{token}` solo tras una acción explícita del usuario (botón con objetivo táctil `>=44px`). Una vez obtenido un resultado final, la UI quedará en ese estado y no repetirá la mutación automáticamente.
- **Rationale:** los links llegan por WhatsApp y se abren con GET del navegador; previsualizadores, crawlers, antivirus o restauración de pestañas pueden cargar la URL. Hacer POST mutante automático en montaje aumenta el riesgo de confirmar/cancelar sin intención (acción irreversible desde la perspectiva del paciente y potencial 409 `ya_usado` posterior). El botón explícito preserva la semántica de "un toque" del usuario real.
- **Mapeo de estados (C-07):** 200 `confirmado` → pantalla confirmado; 200 `cancelado` → pantalla cancelado; 200 `expirado` → pantalla expirado; 409 `detail.causa=ya_usado` → pantalla `ya usado` mostrando `accion_previa` si está disponible; 404 → estado de token no encontrado; 422 → token/formato inválido. No se interpretan estados no definidos por el backend.
- **Idempotencia:** reintento manual de la misma acción puede devolver 200 con el mismo resultado (C-07 idempotente); la UI lo trata como resultado final equivalente sin error. Acción opuesta tras uso previo queda cubierta por 409 `ya_usado`.

### D4 (d) — Pantalla posterior al alta según respuesta 201 real
- **Decisión:** tras 201, mostrar confirmación de reserva creada en estado `pendiente` usando solo campos devueltos por `POST /reservar`: `turno_id`, `profesional_id`, `prestacion_id`, `inicio`, `fin`, `estado` (según `ReservaOut` en `backend/app/reserva_online/schemas.py`). No se mostrará ni inferirá link de confirmación/cancelación porque el contrato C-08 no lo incluye (D7: sin token inmediato; links dependen del job/recordatorio de C-07). El mensaje debe explicar que la reserva quedó pendiente sin prometer tiempos ni disponibilidad del link.

### D5 (e) — Nombre, DNI y contacto: captura mínima, validación cliente acotada y postura única ante 422 de paciente inactivo
- **Decisión:** el formulario de alta solicitará solo los datos requeridos/admitidos por `ReservaCreate` (`backend/app/reserva_online/schemas.py`): `nombre` (obligatorio), `dni` (obligatorio), `contacto` (opcional, `str | None`), `profesional_id` (de la ruta), `prestacion_id` (seleccionado) e `inicio` (slot seleccionado, con timezone). Se aplicará validación cliente solo donde sea inequívoca y compatible con el schema (presencia/formato básico no contradictorio); la autoridad final es el backend (422/409/404/429).
- **Postura única ante 422 "paciente inactivo":** cuando el backend rechaza el alta porque el DNI corresponde a un paciente inactivo (detalle propio expuesto por el servicio real de reserva online), la UI SHALL presentar ese rechazo como un error local claro del formulario usando el detalle provisto por el backend, sin exponer datos de otros pacientes, sin agregar inferencias sobre terceros y sin reintentar automáticamente. No se inventan otros códigos ni estados. Esta misma postura se refleja en `specs/frontend-reserva-publica/spec.md` y en las tareas de verificación.
- **Privacidad:** no se muestran datos de terceros; no se precargan datos por DNI.

### D6 (f) — Rate limit 429: mensaje local, sin reintento automático
- **Decisión:** ante 429 en `POST /reservar` (o en request pública si llegara), mostrar mensaje explícito de límite de solicitudes/rate limit, mantener el formulario y no reintentar automáticamente ni con backoff. Solo se permite reintento manual iniciado por la persona si no crea bucles automáticos.

### D7 (g) — Slots vacíos, cambios con requests en curso y doble submit
- **Slots vacíos:** `GET /reservar` puede devolver `[]` por día sin horario, por ocupación/bloqueos u otras causas según implementación real. La UI mostrará un estado vacío neutro y permitirá cambiar fecha/prestación sin inferir causa interna.
- **Requests en curso:** al cambiar prestación o fecha, cancelar/abortar la consulta anterior cuando sea posible y/o descartar respuestas obsoletas (comparando clave solicitud-estado actual) para no mostrar slots de una selección distinta. Indicador de carga accesible.
- **Doble submit:** deshabilitar el control de envío y bloquear submits repetidos mientras el `POST /reservar` esté pendiente; al terminar (éxito o error recuperable) rehabilitar según corresponda. Nunca reintentar automáticamente un 409.

### D8 (h) — `noindex` en rutas con token en SPA
- **Decisión:** implementar `noindex` en cliente para `/confirmar/:token` y `/cancelar/:token` mediante meta robots (`noindex, nofollow` o equivalente restrictivo) gestionado al montar/actualizar la ruta y limpiado al desmontar para no contaminar otras vistas. Como es SPA, esto es verificable en tests RTL/DOM sobre `document.head` durante el render de la ruta; no garantiza comportamiento de crawlers que no ejecuten JS.
- **Límite:** si se requiere garantía a nivel HTTP/header o prerender, excede el alcance frontend SPA actual y requeriría decisión de infraestructura/proxy (fuera de este change).

### D9 (i) — Diferencias entre CHANGES.md y repo/backend
- **CHANGES.md C-21:** "pendiente" y dependencias C-07,C-08,C-13,C-14 archivadas. Coincide con el estado de specs/implementaciones archivadas.
- **Repo gana:** para contratos y comportamiento se siguen `openspec/specs/reserva-online/spec.md`, `openspec/specs/recordatorios/spec.md`, los diseños archivados y el backend real leído.
- **Ubicación de spec C-07:** el spec vigente está en `openspec/specs/recordatorios/spec.md` (el change archivado fue `2026-11-06-c-07-recordatorios-confirmacion`).
- **Campos/errores:** apply debe seguir backend/specs, no inferencias del resumen de CHANGES.

### D10 — Listado público de prestaciones en `/reservar/:profesional` (resuelve Open Question 1)
- **Decisión:** `/reservar/:profesional` lista las prestaciones consumiendo `GET /prestaciones` como request pública (`apiRequest` con `publica: true`, sin `Authorization`, sin enviar `incluir_inactivos`), para obtener únicamente prestaciones activas con los campos expuestos por `PrestacionOut` (`id`, `nombre`, `duracion_min`, `activo`) según `backend/app/agenda/router_catalogo.py` y `backend/app/agenda/schemas.py`.
- **Excepción acotada (no reutilizar hooks de `services/catalogo.ts`):** no se reutilizan `usePrestaciones` ni otros hooks de `frontend/src/services/catalogo.ts` porque estos invocan el cliente en modo normal: ante una sesión presente adjuntan `Authorization: Bearer <token>` y, ante 401/403 en requests no públicas, disparan `notifyUnauthorized/notifyForbidden` (handlers globales de sesión/permiso). La pantalla pública debe funcionar sin sesión y no debe disparar efectos globales aunque exista sesión interna o el endpoint responda 401/403. Crear esta lectura pública dedicada es una excepción acotada a la regla de no crear lecturas de catálogo propias, justificada por el requisito de aislamiento de sesión y por el modo `publica` del cliente HTTP.
- **QueryKey propia:** la lectura pública de prestaciones usa una `queryKey` propia y separada (no comparte caché con las lecturas internas de catálogo), para evitar mezclar datos/semántica de requests públicas con las de `resourceKeys.prestaciones` usadas en flujos internos autenticados.
- **Contraste con contrato:** el handler no declara dependencia de auth y hoy es accesible sin credenciales, pero esto no está formalizado como contrato público de C-08/C-12; se trata como una decisión pragmática de C-21 sujeta a seguimiento.

### D11 (i/j) — Accesibilidad, mobile-first y privacidad
- Controles interactivos principales (selección/inputs/botones/enlaces de acción) con objetivo táctil `>= 44x44px` CSS, espaciado suficiente y sin dependencia de hover.
- Mensajes de estado con semántica accesible (`role="status"`/`alert` según corresponda), foco visible y orden lógico en mobile.
- Datos mínimos: solicitar solo los campos admitidos por `ReservaCreate`; no mostrar `sillon_id`, `paciente_id`, datos de otros pacientes ni PII en respuestas de token.
- Usar componentes/patrones de `frontend-componentes` cuando aplique, respetando tokens del design system en modo `system-only` (sin mockups por change).

## Risks / Trade-offs

- **[GET del navegador en link de token] → Mitigación:** POST solo tras acción explícita del usuario (D3); estado inicial informativo.
- **[Endpoint de prestaciones público por omisión de auth, no por contrato] → Mitigación:** se consume `GET /prestaciones` como request pública acotada (D10) y se registra seguimiento al PO; si el backend pasa a protegerlo, `/reservar/:profesional` dejará de poder listar prestaciones.
- **[noindex en SPA no visible para crawlers sin JS] → Mitigación:** meta robots en DOM verificable por test; documentar límite y escalar a infraestructura solo si se exige garantía fuerte.
- **[Slots `[]` por causas indistinguibles] → Mitigación:** mensaje neutro y opciones de cambio de fecha/prestación (D7).
- **[422 paciente inactivo puede revelar existencia de DNI] → Mitigación:** postura única: mostrar el rechazo local con el detalle provisto por el backend sin inferencias adicionales ni exposición de datos de terceros (D5); riesgo conocido de C-08.
- **[Request pública mal marcada podría disparar handlers globales] → Mitigación:** usar `publica: true` de forma consistente y verificar en tests ausencia de Bearer y ausencia de navegación/cierre de sesión/aviso global ante 401/403.

## Migration Plan

- Planning: artefactos `proposal.md`, `specs/frontend-reserva-publica/spec.md`, `design.md`, `tasks.md` y validación strict en verde.
- Implementación futura (apply, fuera de este turno): TDD por grupos, verificación RTL por escenario, lint/tsc/build/frontend tests según gobernanza del repo.
- Rollback: revertir cambios del change; sin migraciones ni datos persistentes nuevos.

## Open Questions

1. **Seguimiento (PO, fuera de C-21):** `GET /prestaciones` se consume como endpoint público por decisión pragmática (D10), pero hoy su accesibilidad sin auth puede ser una omisión y no un contrato explícito. Si el backend lo protege, la pantalla de reserva dejará de listar prestaciones. Definir con el PO si se formaliza su carácter público o si se crea un endpoint público dedicado.
2. **Mecanismo de selección de slot en UI:** el backend devuelve `[{inicio,fin}]`. ¿La UI permite elegir cualquier slot devuelto como inicio del POST y cómo presenta `fin`? Impacto: formato de interacción; no cambia contrato.
3. **Copy factual tras alta 201 sin link de confirmación (C-08 D7/Q-C08-07):** ¿qué texto comunica que la reserva quedó pendiente sin prometer link inmediato, dado que el 201 no incluye token? Impacto: expectativa del paciente.
4. **Verificación fuerte de `noindex`:** DOM/meta en SPA es verificable por test; ¿se requiere además header HTTP o regla de proxy/robots para crawlers sin JS? Impacto: infraestructura fuera del alcance de C-21 si se exige garantía fuerte.
5. **Comportamiento con sesión activa al completar reserva pública:** se mantiene en layout público (D1). ¿Se ofrece enlace a `/login` o a rutas internas desde la pantalla pública? Impacto: navegación secundaria, no contrato backend.
6. **Token `404` vs `422` en UI:** C-07 distingue inexistente (404) y formato inválido (422). ¿Se muestran como estados separados o se unifican en "enlace no válido"? Ambos deben manejarse sin efectos globales.

**No se citan RN-*** en este diseño para evitar referencias no verificadas en texto normativo; las reglas relevantes se cubren por los contratos/specs C-03/C-07/C-08 citados.
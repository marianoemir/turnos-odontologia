# Tasks

## 1. Contratos públicos y base de implementación

- [x] 1.1 Definir tipos/DTOs y helpers de cliente para reserva pública (`GET /reservar/{profesional}`, `POST /reservar`) y tokens (`POST /confirmar/{token}`, `POST /cancelar/{token}`) alineados a specs `reserva-online`/`recordatorios` y al schema real `ReservaCreate` (`nombre`, `dni`, `contacto` opcional, `profesional_id`, `prestacion_id`, `inicio` con timezone), sin inventar campos ni endpoints.
- [x] 1.2 Implementar la lectura pública de prestaciones para `/reservar/:profesional` consumiendo `GET /prestaciones` con `apiRequest(..., { publica: true })`, sin `Authorization` y sin `incluir_inactivos`, usando una `queryKey` propia (no compartida con `services/catalogo.ts`) y sin reutilizar hooks internos de catálogo (que operan en modo normal y pueden disparar handlers globales ante 401/403); verificar que la request sale sin `Authorization`/headers retirados y sin `incluir_inactivos`, y que un 401/403 en esta lectura no dispara `notifyUnauthorized`/`notifyForbidden` ni efectos globales.

## 2. Enrutado público y layout

- [x] 2.1 Confirmar/ajustar que `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` permanecen bajo `PublicLayout` fuera de `ProtectedRoute`/`Shell` y sin `canNavigate` interno.
- [x] 2.2 Implementar la gestión de `noindex` en cliente SPA para `/confirmar/:token` y `/cancelar/:token` (meta robots en montaje/actualización y limpieza al desmontar) sin contaminar otras rutas.

## 3. Reserva pública (`/reservar/:profesional`)

- [x] 3.1 Implementar la selección de prestación y fecha y la consulta de slots reales `GET /reservar/{profesional}?prestacion=&fecha=` mostrando solo `[{inicio,fin}]` y permitiendo elegir un slot para el alta.
- [x] 3.2 Implementar el estado vacío cuando la consulta devuelve `[]`, permitiendo cambiar fecha/prestación sin inferir causa interna.
- [x] 3.3 Implementar el manejo de cambios de prestación/fecha con request en curso (cancelar o descartar respuestas obsoletas) para no mostrar slots de una selección anterior.
- [x] 3.4 Implementar el alta `POST /reservar` con datos mínimos del contrato (`nombre`, `dni`, `contacto` opcional, `profesional_id`, `prestacion_id`, `inicio`), bloqueo de doble envío en vuelo y confirmación de estado `pendiente` usando solo campos del 201 (`turno_id`, `profesional_id`, `prestacion_id`, `inicio`, `fin`, `estado`) sin link inventado.
- [x] 3.5 Implementar manejo de 409 con causa y alternativa explícita (reconsultar/elegir otro horario o fecha) sin reintento automático.
- [x] 3.6 Implementar manejo de 422 (entrada inválida y rechazo por paciente inactivo con el detalle provisto por el backend, como error local claro sin inferencias ni exposición de terceros) y de 429 con mensaje local sin reintento automático, conservando el contexto del formulario.

## 4. Confirmación y cancelación por token

- [ ] 4.1 Implementar pantallas `/confirmar/:token` y `/cancelar/:token` con estado inicial informativo y ejecución de `POST` solo por acción explícita del usuario (control táctil `>= 44px`), sin mutación automática en montaje.
- [ ] 4.2 Implementar estados finales `confirmado`, `cancelado`, `expirado`, `ya usado` (409 `detail.causa=ya_usado`, mostrando `accion_previa` si existe), `no encontrado` (404) y error/formato inválido (422) o fallo de transporte, todos locales y sin efectos globales de sesión.

## 5. Accesibilidad, mobile-first y privacidad

- [ ] 5.1 Asegurar objetivos táctiles `>= 44px` CSS, operación sin hover, feedback accesible y contenido con datos mínimos sin revelar terceros en reserva y token.

## 6. Verificación por escenario (RTL, una task por escenario)

- [x] 6.1 Verificar escenario `"Visitante anónimo accede a la reserva pública"`: visitante sin sesión abre `/reservar/:profesional` y la pantalla se muestra sin navegación interna ni redirección a `/login`.
- [x] 6.2 Verificar escenario `"Visitante anónimo accede a rutas con token"`: visitante sin sesión abre `/confirmar/:token` o `/cancelar/:token` y la pantalla se muestra sin navegación interna ni redirección a `/login`.
- [x] 6.3 Verificar escenario `"Sesión interna activa no interfiere con rutas públicas"`: con sesión interna válida, abrir `/reservar/:profesional`, `/confirmar/:token` o `/cancelar/:token` mantiene la ruta pública accesible, sin redirigir a `/agenda` ni a `/login` y sin navegación del shell interno.
- [x] 6.4 Verificar escenario `"Reserva sin token de sesión"`: la consulta de slots o el alta se envían sin `Authorization` y la respuesta exitosa se presenta en la propia pantalla sin iniciar sesión interna.
- [x] 6.5 Verificar escenario `"Error 401 o 403 en request pública no altera la sesión"`: ante 401 o 403 en request pública se muestra error local comprensible, no navega a `/login`, no finaliza sesión activa y no muestra aviso global de permiso insuficiente.
- [x] 6.6 Verificar escenario `"Error 429 en request pública se maneja localmente"`: ante 429 en request pública se informa el límite alcanzado sin reintento automático, sin redirección y sin efectos globales de sesión.
- [x] 6.7 Verificar escenario `"Las prestaciones se listan sin sesión"`: la pantalla solicita `GET /prestaciones` como request pública sin `Authorization` y sin `incluir_inactivos`, con `queryKey` propia, muestra prestaciones activas y un 401/403 no dispara `notifyUnauthorized`/`notifyForbidden` ni efectos globales.
- [x] 6.8 Verificar escenario `"Slots disponibles se muestran tras elegir prestación y fecha"`: con respuesta 200 con slots se muestran los intervalos disponibles y se permite continuar con el alta sobre un slot elegido.
- [x] 6.9 Verificar escenario `"Respuesta vacía se comunica como ausencia de disponibilidad"`: con respuesta 200 vacía se muestra mensaje de ausencia de disponibilidad para la selección sin datos de otros pacientes ni error genérico.
- [x] 6.10 Verificar escenario `"Respuesta tardía no reemplaza la selección vigente"`: al cambiar prestación o fecha con consulta en curso, solo queda visible el resultado de la selección vigente y se descartan/cancelan respuestas obsoletas.
- [x] 6.11 Verificar escenario `"Alta exitosa muestra confirmación pendiente"`: `POST /reservar` responde 201 y la pantalla confirma turno pendiente con los campos devueltos (`turno_id`, `profesional_id`, `prestacion_id`, `inicio`, `fin`, `estado`) sin datos de terceros ni enlace inventado.
- [x] 6.12 Verificar escenario `"Conflicto de agenda ofrece alternativa"`: `POST /reservar` responde 409 con causa y la pantalla informa indisponibilidad, permitiendo reconsultar/elegir otro horario o fecha sin reintento automático.
- [x] 6.13 Verificar escenario `"Datos inválidos, DNI inactivo o límite se informan sin reintento automático"`: `POST /reservar` responde 422 (incluido paciente inactivo con detalle provisto por backend) o 429 y la pantalla muestra mensaje local acorde sin reenviar automáticamente, conservando controles para corregir o reintentar manualmente cuando corresponda.
- [x] 6.14 Verificar escenario `"Doble envío bloqueado y fallo de transporte recuperable"`: solo hay una solicitud activa a la vez y, ante red o timeout, se informa el fallo sin éxito falso y se permite reintentar manualmente.
- [ ] 6.15 Verificar escenario `"abrir el enlace no ejecuta la acción hasta que la persona la confirma"`: al renderizar `/confirmar/:token` o `/cancelar/:token` no se envía POST automático, no hay efectos de sesión y se muestra estado informativo con control explícito.
- [ ] 6.16 Verificar escenario `"Confirmación o cancelación exitosa"`: tras acción explícita, respuesta 200 `confirmado` o `cancelado` muestra el estado correspondiente sin datos personales de terceros.
- [ ] 6.17 Verificar escenario `"Token expirado o ya usado"`: tras acción explícita, respuesta 200 `expirado` o 409 `ya_usado` se distingue de éxito/inexistente y muestra `accion_previa` si está disponible.
- [ ] 6.18 Verificar escenario `"Token inexistente o inválido y errores de transporte"`: tras acción explícita, 404/422 o fallo de red/timeout muestra estado de error o no encontrado comprensible sin redirigir a login ni alterar sesión.
- [ ] 6.19 Verificar escenario `"Controles táctiles y estados perceptibles"`: en viewport móvil los controles interactivos tienen objetivo táctil `>= 44x44px` CSS, estados/errores legibles y la tarea se completa sin hover.
- [x] 6.20 Verificar escenario `"Rutas con token declaran noindex"`: al renderizar `/confirmar/:token` o `/cancelar/:token` el documento expone directiva `noindex` verificable y otras rutas no quedan contaminadas.
- [ ] 6.21 Verificar escenario `"Contenido público no revela terceros"`: slots, confirmación de alta y resultado de token no incluyen datos personales de otros pacientes ni información no provista por contratos públicos.

## 7. Calidad del change

- [ ] 7.1 Ejecutar la suite de tests frontend relevante (Vitest/RTL) y verificar que pasan los escenarios nuevos de `frontend-reserva-publica` sin regresiones en rutas públicas/sesión relacionadas.
- [ ] 7.2 Ejecutar `npm run lint`, `tsc -b` y `npm run build` en `frontend/` (si aplica al estado del repo en apply) y verificar que finalizan en verde.
- [ ] 7.3 Verificar que no se modificaron `CHANGES.md`, backend ni archivos fuera del alcance, y que no hay credenciales/secretos en los cambios.

## Workflow follow-up

- Al aplicar, revisar las Open Questions de seguimiento de `design.md`; si alguna cambia contrato o enfoque, actualizar artefactos antes de implementar.
- Tras aplicar y verificar, archivar el change con `/opsx:archive frontend-reserva-publica` cuando corresponda.
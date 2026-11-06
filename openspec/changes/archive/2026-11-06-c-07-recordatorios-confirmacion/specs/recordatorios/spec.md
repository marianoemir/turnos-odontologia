# Spec Delta

## Purpose

Programa y entrega recordatorios de turnos a 48 y 24 horas, y permite que el
paciente confirme o cancele el turno desde un enlace público de un solo toque
con un token opaco, único y con expiración.

## ADDED Requirements

### Requirement: Ejecución no interactiva del procesamiento

El sistema SHALL exponer una ejecución no interactiva que procesa los
recordatorios debidos para un instante dado y termina con código 0 cuando no hay
errores de infraestructura, de modo que pueda invocarse desde cron.

#### Scenario: Ejecución sin turnos en ventana

- **WHEN** se ejecuta el procesamiento y ningún turno está en la ventana de 48 horas
- **THEN** termina con código 0 y no crea recordatorios

#### Scenario: Ejecución con turnos en ventana

- **WHEN** se ejecuta el procesamiento y hay un turno en ventana
- **THEN** termina con código 0 y el recordatorio correspondiente queda persistido

### Requirement: Ventanas de 48 y 24 horas

El sistema SHALL considerar debidos los turnos activos cuyo inicio esté a más de
0 y hasta 48 horas del instante de procesamiento: etapa `24h` cuando falten 24
horas o menos, y etapa `48h` cuando falten más de 24 y hasta 48 horas.

#### Scenario: Turno a 47 horas

- **WHEN** un turno activo inicia 47 horas después del instante procesado
- **THEN** se registra y envía un recordatorio de etapa `48h`

#### Scenario: Turno a 23 horas sin recordatorio previo

- **WHEN** un turno activo inicia 23 horas después y no tiene recordatorio de etapa `48h`
- **THEN** se registra y envía un recordatorio de etapa `24h`, y no uno de etapa `48h`

### Requirement: La etapa 24h solo se envía a turnos pendientes

El sistema SHALL programar la etapa `48h` para todo turno activo y la etapa `24h`
solo cuando el turno siga en estado `pendiente` al momento de procesar.

#### Scenario: Turno confirmado a 20 horas

- **WHEN** un turno `confirmado` inicia 20 horas después y ya recibió su recordatorio de etapa `48h`
- **THEN** no se registra ni envía recordatorio de etapa `24h`

#### Scenario: Turno pendiente a 20 horas

- **WHEN** un turno `pendiente` inicia 20 horas después
- **THEN** se registra y envía un recordatorio de etapa `24h`

### Requirement: Un solo recordatorio por turno, etapa e inicio programado

El sistema SHALL registrar como máximo un recordatorio por combinación de turno,
etapa e inicio programado, de modo que reprocesar la misma ventana —o procesar
dos veces en paralelo— no duplique el registro ni el envío.

#### Scenario: Reprocesar la misma ventana

- **WHEN** se procesa dos veces el mismo instante con el mismo turno en ventana
- **THEN** existe un solo recordatorio para ese turno y etapa y se envió una sola vez

#### Scenario: Dos ejecuciones concurrentes

- **WHEN** dos ejecuciones procesan el mismo turno y etapa a la vez
- **THEN** solo una registra el recordatorio y solo una envía

### Requirement: Turnos excluidos de recordatorio

El sistema SHALL excluir de la programación los turnos cancelados, atendidos,
ausentes, y los que ya comenzaron respecto del instante procesado.

#### Scenario: Turno cancelado en ventana

- **WHEN** un turno `cancelado` inicia dentro de las próximas 48 horas
- **THEN** no se registra ni envía recordatorio

#### Scenario: Turno ya iniciado

- **WHEN** un turno activo comenzó antes del instante procesado
- **THEN** no se registra ni envía recordatorio

### Requirement: Envío simulado y sin red

El sistema SHALL marcar como simulado todo recordatorio enviado en este change,
registrar una referencia de proveedor no vacía y no realizar llamadas de red en
ningún caso.

#### Scenario: Envío registrado como simulado

- **WHEN** se procesa un turno en ventana
- **THEN** el recordatorio queda `enviado`, con `simulado` verdadero y una referencia de proveedor no vacía

### Requirement: Canal de reemplazo sin credenciales

El sistema SHALL usar el canal `whatsapp` cuando exista la credencial de WhatsApp
configurada y el canal `log` cuando no exista, sin leer ni exponer el valor de la
credencial y sin fallar por su ausencia.

#### Scenario: Sin credencial configurada

- **WHEN** se procesa un turno en ventana y no hay credencial de WhatsApp configurada
- **THEN** el recordatorio se registra con canal `log`, queda `enviado` y el procesamiento termina sin error

#### Scenario: Con credencial configurada

- **WHEN** se procesa un turno en ventana y la credencial de WhatsApp está configurada
- **THEN** el recordatorio se registra con canal `whatsapp` y queda `enviado`

### Requirement: Paciente sin contacto disponible

El sistema SHALL dejar el recordatorio en estado `fallido` con `error` igual a
`sin_contacto`, sin invocar al notificador, cuando el paciente del turno no tenga
contacto registrado (`NULL`) o su contacto esté vacío o compuesto solo por
espacios; SHALL NOT reintentarlo en ejecuciones posteriores.

#### Scenario: Paciente sin contacto registrado

- **WHEN** un turno en ventana pertenece a un paciente cuyo contacto es `NULL`
- **THEN** el recordatorio queda `fallido` con `error` `sin_contacto` y no se envía ningún mensaje

#### Scenario: Contacto vacío no cuenta como contacto

- **WHEN** un turno en ventana pertenece a un paciente cuyo contacto es una cadena vacía o solo espacios
- **THEN** el recordatorio queda `fallido` con `error` `sin_contacto` y una ejecución posterior no lo vuelve a enviar

### Requirement: Token opaco, único y con expiración

El sistema SHALL generar por cada recordatorio un token opaco e impredecible, no
reutilizable entre recordatorios, y SHALL considerarlo válido solo hasta el inicio
del turno programado al momento del envío.

#### Scenario: Dos recordatorios del mismo turno

- **WHEN** un turno recibe recordatorio de etapa `48h` y luego de etapa `24h`
- **THEN** cada recordatorio tiene un token distinto

#### Scenario: Token vencido

- **WHEN** se usa un token después del inicio del turno programado al momento del envío
- **THEN** responde 200 con resultado `expirado` y no modifica el turno

### Requirement: Cuerpo de respuesta de las rutas públicas

El sistema SHALL responder las rutas públicas de confirmar y cancelar con un
cuerpo que incluya `resultado`, `turno_id` e `inicio`, sin exponer datos
personales del paciente.

#### Scenario: Respuesta de una confirmación exitosa

- **WHEN** se confirma un turno con un token válido
- **THEN** el cuerpo incluye `resultado` igual a `confirmado`, el `turno_id` del turno y su `inicio`, y no incluye nombre, DNI ni contacto del paciente

### Requirement: Confirmación por enlace de un toque

El sistema SHALL, al recibir un token válido y no usado de un turno `pendiente`,
cambiar el turno a `confirmado` y responder 200 con resultado `confirmado`, sin
modificar su inicio, fin, recursos ni paciente.

#### Scenario: Confirmar turno pendiente

- **WHEN** se envía `POST /confirmar/{token}` con un token válido de un turno `pendiente`
- **THEN** responde 200 con resultado `confirmado`, el turno queda `confirmado` y conserva inicio, fin, profesional y sillón

### Requirement: Confirmación sobre un turno ya confirmado

El sistema SHALL responder 200 con resultado `confirmado` cuando el token sea
válido y no usado pero el turno ya esté en `confirmado`, marcando el token como
usado.

#### Scenario: Turno confirmado por otro canal

- **WHEN** se envía `POST /confirmar/{token}` con un token no usado de un turno que ya está `confirmado`
- **THEN** responde 200 con resultado `confirmado` y el token queda usado

### Requirement: Cancelación por enlace de un toque libera el hueco

El sistema SHALL, al recibir un token válido y no usado de un turno `pendiente` o
`confirmado`, cambiar el turno a `cancelado` y responder 200 con resultado
`cancelado`, dejando el intervalo reutilizable.

#### Scenario: Cancelar turno confirmado

- **WHEN** se envía `POST /cancelar/{token}` con un token válido de un turno `confirmado`
- **THEN** responde 200 con resultado `cancelado` y el turno queda `cancelado` sin borrar la fila

#### Scenario: Hueco liberado tras la cancelación

- **WHEN** un turno se canceló con su token y luego se crea otro turno para el mismo profesional y sillón en el mismo intervalo
- **THEN** el alta responde 201

### Requirement: Repetición de la misma acción es idempotente

El sistema SHALL responder 200 con el resultado ya obtenido cuando se repita la
misma acción sobre un token ya usado, sin volver a modificar el turno.

#### Scenario: Segundo confirmar

- **WHEN** se envía `POST /confirmar/{token}` por segunda vez con el mismo token ya usado para confirmar
- **THEN** responde 200 con resultado `confirmado` y el turno sigue `confirmado`

#### Scenario: Segundo cancelar

- **WHEN** se envía `POST /cancelar/{token}` por segunda vez con el mismo token ya usado para cancelar
- **THEN** responde 200 con resultado `cancelado` y el turno sigue `cancelado`

### Requirement: Acción opuesta sobre un token usado es conflicto

El sistema SHALL responder 409 con cuerpo `{"detail": {"causa": "ya_usado",
"detalle": "<texto>", "accion_previa": "<confirmado|cancelado>"}}` cuando se pida
la acción contraria sobre un token ya usado, sin modificar el turno.

#### Scenario: Cancelar después de confirmar

- **WHEN** se envía `POST /cancelar/{token}` con un token ya usado para confirmar
- **THEN** responde 409 con causa `ya_usado` y acción previa `confirmado`, y el turno sigue `confirmado`

#### Scenario: Confirmar después de cancelar

- **WHEN** se envía `POST /confirmar/{token}` con un token ya usado para cancelar
- **THEN** responde 409 con causa `ya_usado` y acción previa `cancelado`, y el turno sigue `cancelado`

### Requirement: Token válido sobre un turno que no admite la acción

El sistema SHALL responder 200 con resultado `expirado` y no modificar el turno
cuando el token sea válido y no usado, pero el turno no admita la acción
solicitada por su estado actual.

#### Scenario: Turno cancelado por recepción antes del click

- **WHEN** se envía `POST /confirmar/{token}` con un token no usado de un turno que recepción canceló
- **THEN** responde 200 con resultado `expirado` y el turno sigue `cancelado`

#### Scenario: Cancelar un turno ya cancelado por recepción

- **WHEN** se envía `POST /cancelar/{token}` con un token no usado de un turno que ya está `cancelado`
- **THEN** responde 200 con resultado `expirado` y el turno sigue `cancelado`

### Requirement: Token inexistente

El sistema SHALL responder 404 cuando el token tenga formato válido pero no
corresponda a ningún recordatorio.

#### Scenario: Token bien formado inexistente

- **WHEN** se envía `POST /confirmar/{token}` con un token bien formado que no corresponde a ningún recordatorio
- **THEN** responde 404 y no modifica ningún turno

### Requirement: Formato de token inválido

El sistema SHALL responder 422 cuando el token no cumpla el formato esperado de
43 caracteres URL-safe.

#### Scenario: Token demasiado corto

- **WHEN** se envía `POST /confirmar/abc`
- **THEN** responde 422 y no modifica ningún turno

### Requirement: Sin reintentos automáticos de recordatorios fallidos

El sistema SHALL dejar un recordatorio en estado `fallido` cuando el envío falle
y no SHALL reintentarlo en ejecuciones posteriores.

#### Scenario: Envío fallido no se reintenta

- **WHEN** el notificador informa un fallo al enviar un recordatorio
- **THEN** el recordatorio queda `fallido` y una ejecución posterior no lo vuelve a enviar

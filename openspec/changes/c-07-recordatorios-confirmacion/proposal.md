# Proposal

## Why

El consultorio pierde huecos por ausentismo y hoy no tiene forma de que un turno
`pendiente` pase a `confirmado`: C-04 dejó explícito que no existe endpoint ni
servicio de confirmación. US-005 pide recordatorios a 48h y 24h con confirmación
y cancelación en un solo toque, que es la palanca directa contra el no-show y el
primer punto del sistema donde entra una integración externa (WhatsApp).

## What Changes

- **Nueva tabla `recordatorio`**: `turno_id`, `canal` (`whatsapp`/`email`/`log`),
  `etapa` (`48h`/`24h`), `estado` (`pendiente`/`enviado`/`confirmado`/`cancelado`/
  `fallido`), `token_hash` único, `expira_en`, `inicio_turno` (snapshot),
  `proveedor_ref`, `simulado`, `mensaje` y timestamps.
- **Job de recordatorios**: `ServicioRecordatorios.procesar(session, *, ahora=None,
  notificador=None)` con modelo de ventana vencida (48h/24h), dedupe por
  `(turno_id, etapa, inicio_turno)` y persistencia previa al envío. Invocable por
  CLI (`python -m backend.app.recordatorios.job`) desde cron. **Sin Redis.**
- **`ServicioTurnos.confirmar`**: nueva transición `pendiente → confirmado` según
  RN-ES-01; 409 `transicion` desde cualquier otro estado. No se expone endpoint de
  operador en este change.
- **Rutas públicas de un toque**: `POST /confirmar/{token}` y
  `POST /cancelar/{token}`, sin login (el token es la capacidad). La cancelación
  reutiliza `ServicioTurnos.cancelar` de C-04 y por lo tanto libera el hueco.
- **Notificador inyectable con fallback**: WhatsApp simulado si `WHATSAPP_TOKEN`
  está configurado; si no, notificación simulada por log. Nunca se hace red ni se
  lee el valor del token desde código de producción. `WHATSAPP_TOKEN` se agrega a
  `.env.example` **sin valor**.
- **Migración Alembic** `006_recordatorio` sobre el head vigente, con índice
  parcial `ix_turnos_inicio_activo` para la consulta de ventana del job.
- **Tests**: job (ventanas, dedupe, paciente sin contacto, concurrencia con dos
  sesiones), token (expiración, doble uso, acción opuesta), confirmar/cancelar por
  link y no-solape tras cancelar. La tabla nueva se agrega a `_CATALOGO_TABLES` de
  `backend/tests/conftest.py`.

## Capabilities

### New Capabilities

- `recordatorios`: programación y envío de recordatorios 48h/24h, generación y
  ciclo de vida del token de un toque, y acciones públicas de confirmar/cancelar
  un turno a partir de ese token.

### Modified Capabilities

- `turnos`: se agrega la transición `pendiente → confirmado` (RN-ES-01) con
  rechazo 409 desde estados finales; el resto del contrato de turnos no cambia.

## Impact

- **Código nuevo**: `backend/app/recordatorios/` (models, schemas, service,
  reloj, notificadores, router, job CLI) y registro del router en
  `backend/app/main.py`.
- **Código modificado**: `backend/app/turnos/service.py` (método `confirmar`),
  `backend/app/turnos/models.py` (índice `ix_turnos_inicio_activo` declarado en el
  modelo), `backend/tests/conftest.py` (`_CATALOGO_TABLES`).
- **Base de datos**: migración `006_recordatorio` (tabla nueva + índice parcial
  sobre `turnos.inicio`). Sin cambios destructivos ni columnas nuevas en tablas
  existentes.
- **Configuración**: `WHATSAPP_TOKEN` en `.env.example` sin valor. No se toca
  `docker-compose.yml` (el scheduler es cron externo; C-23 sigue siendo el change
  que ordena el compose).
- **Consumidores**: C-08 reutiliza los links y `confirmar`; C-21 consume el
  contrato de resultado de las rutas públicas.
- **Fuera de alcance**: Redis/colas, proveedor real de WhatsApp, email real,
  reintentos automáticos, horario silencioso, invalidación de tokens al
  reprogramar, endpoint de operador para confirmar.

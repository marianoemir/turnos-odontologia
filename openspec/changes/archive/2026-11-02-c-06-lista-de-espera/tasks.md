# Tasks

## 1. Modelo y migracion

- [x] 1.1 Crear modulo `backend/app/lista_espera/` con `__init__.py` y verificar import
- [x] 1.2 Modelo `ListaEspera` en `models.py` con FKs RESTRICT, CHECK estado,
  turno_id nullable SET NULL y verificar `Base.metadata` lo registra
- [x] 1.3 Migracion Alembic `003_lista_espera.py` (revision 002_turno) creando tabla
  + indices y verificar `alembic upgrade head` sin error

## 2. Schemas y servicio FIFO

- [x] 2.1 Schemas Pydantic (`ListaEsperaCreate`, `ListaEsperaOut`, `OfrecerHueco`,
  `RespuestaPaciente`) y verificar validacion
- [x] 2.2 Servicio `ServicioListaEspera.alta` validando FKs y verificar test de alta
- [x] 2.3 Servicio `listar` con ORDER BY creado_en asc y filtro profesional y
  verificar test FIFO
- [x] 2.4 Servicio `ofrecer` creando turno via `ServicioTurnos.crear()` y
  revirtiendo a pendiente si falla y verificar test de turno valido
- [x] 2.5 Servicio `responder` (aceptar/rechazar + avance FIFO) y verificar test
  de rechazo

## 3. Router y registro

- [x] 3.1 Router FastAPI con POST/GET/ofrecer/responder y mapeo de errores
  404/409/422 y verificar con TestClient
- [x] 3.2 Registrar router en `main.py` y actualizar `conftest._CATALOGO_TABLES`
  y verificar import de app

## 4. Tests de integracion

- [x] 4.1 Tests de alta y consulta FIFO y verificar en verde
- [x] 4.2 Tests de ofrecer (turno valido + conflicto 409) y verificar en verde
- [x] 4.3 Tests de respuesta (aceptar/rechazar + avance) y verificar en verde
- [x] 4.4 Ejecutar `pytest` completo y verificar sin regresiones

## Workflow follow-up

- Archive the change after tests green and review.

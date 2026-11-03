---
name: lista-espera-odontologia
description: Implementa el change C-06 (lista-de-espera) del TP turnos-odontologia: modelo SQLAlchemy ListaEspera, endpoints POST/GET/ofrecer, logica FIFO, migracion Alembic y tests pytest. Usar SIEMPRE que el usuario pida "implementar lista de espera", "agregar lista de espera", "rellenar cancelaciones", "ofrecer hueco a paciente en lista", "waitlist", "lista de espera odontologia", "C-06" o "US-004", o cuando trabaje en el backend FastAPI de turnos y mencione reutilizar ServicioTurnos.crear() para asignar un turno desde la lista. Tambien aplica cuando se pida orden FIFO por creado_en, estados pendiente/ofrecido/asignado/baja, o tests de que ofrecer crea un turno valido sin solape.
---

# Skill: lista-espera-odontologia

Guia de implementacion del change **C-06 `lista-de-espera`** (US-004) para el TP
`turnos-odontologia`. Depende de **C-04** (cancelar/reprogramar) y consume
`ServicioTurnos.crear()` de C-03. Governance MEDIO.

Antes de codear: leer `knowledge-base/05_reglas_de_negocio.md` (dominio Turno),
`knowledge-base/06_funcionalidades.md` (US-004), `knowledge-base/07_flujos_principales.md`
(Flujo 4) y `CHANGES.md` seccion C-06.

## Reglas duras (no negociables)

- NUNCA crear turno sin validar solape via `ServicioTurnos.crear()` (RN-AG-02/03/04).
- NUNCA 200/500 ante conflicto de negocio: 409 conflicto (solape/horario/bloqueo)
  vs 422 input invalido.
- NUNCA hard delete de turnos ni de entradas de lista: cancelar/baja es cambio de
  estado.
- NUNCA cerrar sin tests en verde (alta, ofrecer crea turno valido, rechazo pasa
  al siguiente, orden FIFO).
- Solo datos ficticios en seeds y tests.

## Estructura a crear

```
backend/app/lista_espera/
├── __init__.py
├── models.py       # ListaEspera
├── schemas.py      # Pydantic
├── service.py      # ServicioListaEspera (FIFO)
└── router.py       # FastAPI router
backend/alembic/versions/003_lista_espera.py
backend/tests/test_lista_espera_*.py
```

Registrar router en `backend/app/main.py` y tabla en `conftest._CATALOGO_TABLES`.

## 1. Modelo `ListaEspera` (`backend/app/lista_espera/models.py`)

Estados: `pendiente | ofrecido | asignado | baja`. FKs RESTRICT (consistencia con
Turno). `profesional_id` nullable (lista general por prestacion).

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db import Base

ESTADOS_LISTA = ("pendiente", "ofrecido", "asignado", "baja")

class ListaEspera(Base):
    __tablename__ = "lista_espera"
    __table_args__ = (
        CheckConstraint(
            "estado IN ('pendiente','ofrecido','asignado','baja')",
            name="estado_lista_valido",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pacientes.id", ondelete="RESTRICT"), nullable=False
    )
    profesional_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profesionales.id", ondelete="RESTRICT"), nullable=True
    )
    prestacion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("prestaciones.id", ondelete="RESTRICT"), nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, default="pendiente", server_default=text("'pendiente'")
    )
    turno_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("turnos.id", ondelete="SET NULL"), nullable=True
    )
```

## 2. Schemas (`backend/app/lista_espera/schemas.py`)

```python
from __future__ import annotations
import uuid
from datetime import datetime
from pydantic import AwareDatetime, BaseModel, ConfigDict

class ListaEsperaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    paciente_id: uuid.UUID
    profesional_id: uuid.UUID | None = None
    prestacion_id: uuid.UUID

class ListaEsperaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    paciente_id: uuid.UUID
    profesional_id: uuid.UUID | None
    prestacion_id: uuid.UUID
    creado_en: datetime
    estado: str
    turno_id: uuid.UUID | None = None

class OfrecerHueco(BaseModel):
    model_config = ConfigDict(extra="ignore")
    inicio: AwareDatetime
    profesional_id: uuid.UUID
    sillon_id: uuid.UUID

class RespuestaPaciente(BaseModel):
    model_config = ConfigDict(extra="ignore")
    acepta: bool
```

## 3. Servicio FIFO (`backend/app/lista_espera/service.py`)

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.agenda.models import Paciente, Prestacion, Profesional, SillonBox
from backend.app.lista_espera.models import ListaEspera
from backend.app.turnos.service import (
    ConflictoTurno, ServicioTurnos, TurnoInvalido, TurnoNoEncontrado,
)

class ListaNoEncontrada(Exception):
    def __init__(self, ref_id):
        self.ref_id = ref_id
        self.detalle = f"entrada de lista no existe: {ref_id}"

class ListaEsperaInvalida(Exception):
    def __init__(self, detalle):
        self.detalle = detalle

class ServicioListaEspera:
    @staticmethod
    def alta(session, *, paciente_id, profesional_id=None, prestacion_id):
        # valida FKs
        if session.get(Paciente, paciente_id) is None:
            raise TurnoNoEncontrado("paciente", paciente_id)
        if profesional_id is not None and session.get(Profesional, profesional_id) is None:
            raise TurnoNoEncontrado("profesional", profesional_id)
        if session.get(Prestacion, prestacion_id) is None:
            raise TurnoNoEncontrado("prestacion", prestacion_id)
        entrada = ListaEspera(
            paciente_id=paciente_id,
            profesional_id=profesional_id,
            prestacion_id=prestacion_id,
            estado="pendiente",
        )
        session.add(entrada)
        session.flush()
        return entrada

    @staticmethod
    def listar(session, *, profesional_id=None):
        q = session.query(ListaEspera).filter(ListaEspera.estado == "pendiente")
        if profesional_id is not None:
            # Spec "Filtro por profesional": las de ese profesional y las generales.
            q = q.filter(
                or_(
                    ListaEspera.profesional_id == profesional_id,
                    ListaEspera.profesional_id.is_(None),
                )
            )
        return q.order_by(ListaEspera.creado_en.asc()).all()

    @staticmethod
    def ofrecer(session, lista_id, *, inicio, profesional_id, sillon_id):
        entrada = session.get(ListaEspera, lista_id)
        if entrada is None:
            raise ListaNoEncontrada(lista_id)
        if entrada.estado != "pendiente":
            raise ListaEsperaInvalida(
                f"no se puede ofrecer una entrada en estado {entrada.estado}"
            )
        entrada.estado = "ofrecido"
        session.flush()
        try:
            turno = ServicioTurnos.crear(
                session,
                paciente_id=entrada.paciente_id,
                profesional_id=profesional_id,
                sillon_id=sillon_id,
                prestacion_id=entrada.prestacion_id,
                inicio=inicio,
            )
        except (ConflictoTurno, TurnoInvalido, TurnoNoEncontrado):
            entrada.estado = "pendiente"
            session.flush()
            raise
        entrada.turno_id = turno.id
        session.flush()
        return entrada, turno

    @staticmethod
    def responder(session, lista_id, *, acepta):
        entrada = session.get(ListaEspera, lista_id)
        if entrada is None:
            raise ListaNoEncontrada(lista_id)
        if entrada.estado != "ofrecido" or entrada.turno_id is None:
            raise ListaEsperaInvalida("no hay oferta pendiente de respuesta")
        if acepta:
            entrada.estado = "asignado"
            session.flush()
            return entrada
        # rechazo: cancela el turno ofrecido y pasa al siguiente en FIFO
        # Si cancelar falla (ConflictoTurno), el error se propaga y la entrada
        # NO pasa a baja. Nunca silenciar la falla con try/except.
        ServicioTurnos.cancelar(session, entrada.turno_id)
        entrada.estado = "baja"
        session.flush()
        siguiente = (
            session.query(ListaEspera)
            .filter(
                ListaEspera.estado == "pendiente",
                ListaEspera.profesional_id == entrada.profesional_id,
            )
            .order_by(ListaEspera.creado_en.asc())
            .first()
        )
        return entrada, siguiente
```

## 4. Router (`backend/app/lista_espera/router.py`)

```python
from __future__ import annotations
import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.db import get_session
from backend.app.lista_espera.schemas import (
    ListaEsperaCreate, ListaEsperaOut, OfrecerHueco, RespuestaPaciente,
)
from backend.app.lista_espera.service import (
    ListaEsperaInvalida, ListaNoEncontrada, ServicioListaEspera,
)
from backend.app.turnos.service import (
    ConflictoTurno, TurnoInvalido, TurnoNoEncontrado,
)

router = APIRouter()

def get_db():
    session = get_session()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

@router.post("/lista-espera", response_model=ListaEsperaOut, status_code=201)
def alta(body: ListaEsperaCreate, session: Annotated[Session, Depends(get_db)]):
    try:
        return ServicioListaEspera.alta(
            session,
            paciente_id=body.paciente_id,
            profesional_id=body.profesional_id,
            prestacion_id=body.prestacion_id,
        )
    except TurnoNoEncontrado as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc

@router.get("/lista-espera", response_model=list[ListaEsperaOut])
def listar(
    profesional: uuid.UUID | None = Query(default=None),
    session: Annotated[Session, Depends(get_db)] = None,
):
    return ServicioListaEspera.listar(session, profesional_id=profesional)

@router.post("/lista-espera/{lista_id}/ofrecer")
def ofrecer(
    lista_id: uuid.UUID,
    body: OfrecerHueco,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        entrada, turno = ServicioListaEspera.ofrecer(
            session,
            lista_id,
            inicio=body.inicio,
            profesional_id=body.profesional_id,
            sillon_id=body.sillon_id,
        )
        return {"lista": ListaEsperaOut.model_validate(entrada), "turno": turno}
    except ListaNoEncontrada as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except ListaEsperaInvalida as exc:
        raise HTTPException(status_code=409, detail=exc.detalle) from exc
    except ConflictoTurno as exc:
        raise HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        ) from exc
    except TurnoNoEncontrado as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except TurnoInvalido as exc:
        raise HTTPException(status_code=422, detail=exc.detalle) from exc

@router.post("/lista-espera/{lista_id}/responder", response_model=ListaEsperaOut)
def responder(
    lista_id: uuid.UUID,
    body: RespuestaPaciente,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        resultado = ServicioListaEspera.responder(
            session, lista_id, acepta=body.acepta
        )
        entrada = resultado[0] if isinstance(resultado, tuple) else resultado
        return entrada
    except ListaNoEncontrada as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except ListaEsperaInvalida as exc:
        raise HTTPException(status_code=409, detail=exc.detalle) from exc
    except ConflictoTurno as exc:  # falla al cancelar el turno ofrecido
        raise HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        ) from exc
```

## 5. Registro en `main.py`

```python
from backend.app.lista_espera.router import router as lista_espera_router
app.include_router(lista_espera_router)
```

## 6. Migracion Alembic `003_lista_espera.py`

`revision="003_lista_espera"`, `down_revision="002_turno"`. Crear tabla `lista_espera`
con FKs RESTRICT a pacientes/profesionales/prestaciones y SET NULL a turnos.
CHECK estado. Index en (profesional_id, creado_en) para FIFO y (paciente_id).

## 7. Tests

Marcar `pytestmark = pytest.mark.integration`. Usar `seed_catalogo` + `_ids` pattern
de `test_turno_servicio.py`. Casos minimos:

- `test_alta_crea_pendiente`: POST alta → estado pendiente, creado_en set.
- `test_listar_fifo_por_creado_en`: 3 altas → GET devuelve orden creado_en asc.
- `test_listar_filtra_por_profesional`: devuelve las del profesional **y las
  generales** (`profesional_id` nulo).
- `test_ofrecer_crea_turno_valido`: ofrecer con hueco libre → turno estado
  pendiente, lista estado ofrecido, turno_id set, sin solape.
- `test_ofrecer_conflicto_revierte_pendiente`: slot ocupado → 409 y lista
  vuelve a pendiente.
- `test_rechazo_cancela_y_avanza`: rechazar entrada A → estado baja, turno
  cancelado, siguiente en FIFO es B.
- `test_aceptar_marca_asignado`: aceptar → estado asignado.
- `test_ofrecer_ya_ofrecido_no_duplica_turno`: ofrecer una entrada ya `ofrecido`
  → `ListaEsperaInvalida` (409) y no se crea un segundo turno.
- `test_rechazo_no_da_baja_si_falla_la_cancelacion`: si `cancelar` falla, la
  entrada sigue `ofrecido`; en la API, `responder` devuelve 409 (no 500).

Actualizar `conftest._CATALOGO_TABLES` para incluir `lista_espera` (TRUNCATE).

## 8. Checklist de tasks (estilo tasks.md)

- [ ] 1.1 Crear modulo `backend/app/lista_espera/` con `__init__.py`
- [ ] 1.2 Modelo `ListaEspera` + constantes
- [ ] 1.3 Schemas Pydantic
- [ ] 1.4 Servicio `ServicioListaEspera` (alta, listar, ofrecer, responder)
- [ ] 1.5 Router FastAPI (POST/GET/ofrecer/responder)
- [ ] 1.6 Registrar router en `main.py`
- [ ] 1.7 Migracion Alembic `003_lista_espera`
- [ ] 1.8 Actualizar `conftest._CATALOGO_TABLES`
- [ ] 1.9 Tests (alta, FIFO, ofrecer, rechazo, aceptar)
- [ ] 1.10 Ejecutar `pytest` y dejar en verde

## Notes

- `profesional_id` nullable permite lista general por prestacion.
- Reutilizar `ServicioTurnos.crear()` es el unico punto de validacion de solape.
- No hard delete: bajas son cambio de estado.
- Datos solo ficticios (seed_catalogo).
- El orden FIFO por `creado_en` es una decision **provisional**: Q5
  (`knowledge-base/10_preguntas_abiertas.md`) sigue abierta con el PO.

## Correcciones posteriores (2026-11-02)

El codigo de arriba ya incluye las correcciones hechas despues de archivar C-06
(detalle en `docs/correcciones/c-06-correcciones.md`):

- **B1:** `listar(profesional_id=X)` incluye tambien las entradas generales.
- **B4:** `ofrecer` solo acepta entradas `pendiente`; ofrecer una ya ofrecida da 409.
- **B3:** `responder(acepta=False)` no pasa a `baja` si falla la cancelacion del
  turno; el router devuelve 409.
- **Limitaciones abiertas:** B2 (el "siguiente" se calcula pero el endpoint no lo
  devuelve) y B5 (`ofrecer` no valida que el profesional coincida con el de la
  entrada ni que haga la prestacion). No resolver sin decision del PO.

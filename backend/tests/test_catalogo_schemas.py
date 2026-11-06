"""Tests de validación para schemas Pydantic de catálogo de recursos (C-12, tarea 3.1).

Verifica validaciones 422:
- max_length y min_length=1
- extra="forbid" en todos los schemas *Patch
- profesional_id no permitido en HorarioPatch
- rechazo de null explícito en campos NOT NULL
- PATCH con body vacío {} preserva None
- duracion_min > 0 en PrestacionCreate y PrestacionPatch
- dia_semana 0..6 en HorarioCreate y HorarioPatch
- desde < hasta en HorarioCreate y BloqueoCreate
- AwareDatetime en BloqueoCreate (rechazo de datetimes naive)
Sin depender de la fecha real del sistema.
"""

import uuid
from datetime import UTC, datetime, time

import pytest
from pydantic import ValidationError

from backend.app.agenda.schemas import (
    BloqueoCreate,
    BloqueoOut,
    HorarioCreate,
    HorarioOut,
    HorarioPatch,
    PacienteCreate,
    PacienteOut,
    PacientePatch,
    PacientesEnvelopeOut,
    PrestacionCreate,
    PrestacionOut,
    PrestacionPatch,
    ProfesionalCreate,
    ProfesionalOut,
    ProfesionalPatch,
    SillonCreate,
    SillonOut,
    SillonPatch,
)

# ============================================================================
# 1. Paciente
# ============================================================================


def test_paciente_create_ok():
    p = PacienteCreate(nombre="Juan Perez", dni="12345678", contacto="11-1234")
    assert p.nombre == "Juan Perez"
    assert p.dni == "12345678"
    assert p.contacto == "11-1234"
    assert p.ficticio is True


def test_paciente_create_longitudes_limite():
    # Longitudes máximas permitidas
    p = PacienteCreate(nombre="A" * 200, dni="D" * 32)
    assert len(p.nombre) == 200
    assert len(p.dni) == 32

    # Exceso de longitud en nombre (>200)
    with pytest.raises(ValidationError):
        PacienteCreate(nombre="A" * 201, dni="12345678")

    # Exceso de longitud en dni (>32)
    with pytest.raises(ValidationError):
        PacienteCreate(nombre="Juan", dni="D" * 33)

    # min_length=1
    with pytest.raises(ValidationError):
        PacienteCreate(nombre="", dni="12345678")
    with pytest.raises(ValidationError):
        PacienteCreate(nombre="Juan", dni="")


def test_paciente_patch_ok():
    patch = PacientePatch(nombre="Nuevo Nombre")
    assert patch.nombre == "Nuevo Nombre"
    assert patch.dni is None
    assert patch.contacto is None
    assert patch.activo is None


def test_paciente_patch_vacio():
    patch = PacientePatch()
    assert patch.model_dump(exclude_unset=True) == {}


def test_paciente_patch_forbid_extra():
    with pytest.raises(ValidationError):
        PacientePatch.model_validate({"campo_inexistente": "valor"})


def test_paciente_patch_rechazar_null():
    with pytest.raises(ValidationError):
        PacientePatch.model_validate({"nombre": None})
    with pytest.raises(ValidationError):
        PacientePatch.model_validate({"dni": None})
    with pytest.raises(ValidationError):
        PacientePatch.model_validate({"activo": None})
    # contacto SÍ permite None
    p = PacientePatch.model_validate({"contacto": None})
    assert p.contacto is None


def test_paciente_patch_exceso_longitud():
    with pytest.raises(ValidationError):
        PacientePatch(nombre="A" * 201)
    with pytest.raises(ValidationError):
        PacientePatch(dni="D" * 33)
    with pytest.raises(ValidationError):
        PacientePatch(nombre="")
    with pytest.raises(ValidationError):
        PacientePatch(dni="")


def test_paciente_envelope_out():
    env = PacientesEnvelopeOut(
        items=[
            PacienteOut(
                id=uuid.uuid4(),
                nombre="Juan",
                dni="1234",
                contacto=None,
                ficticio=True,
                activo=True,
            )
        ],
        total=1,
        limit=50,
        offset=0,
    )
    assert len(env.items) == 1
    assert env.total == 1


# ============================================================================
# 2. Profesional
# ============================================================================


def test_profesional_create_ok():
    p = ProfesionalCreate(nombre="Dra. Gomez", matricula="MN-12345")
    assert p.nombre == "Dra. Gomez"
    assert p.matricula == "MN-12345"


def test_profesional_create_longitudes_limite():
    p = ProfesionalCreate(nombre="B" * 200, matricula="M" * 32)
    assert len(p.nombre) == 200
    assert len(p.matricula) == 32

    with pytest.raises(ValidationError):
        ProfesionalCreate(nombre="B" * 201, matricula="MN-123")
    with pytest.raises(ValidationError):
        ProfesionalCreate(nombre="Dra.", matricula="M" * 33)
    with pytest.raises(ValidationError):
        ProfesionalCreate(nombre="", matricula="MN-123")
    with pytest.raises(ValidationError):
        ProfesionalCreate(nombre="Dra.", matricula="")


def test_profesional_patch_ok():
    patch = ProfesionalPatch(activo=False)
    assert patch.activo is False
    assert patch.nombre is None
    assert patch.matricula is None


def test_profesional_patch_vacio():
    patch = ProfesionalPatch()
    assert patch.model_dump(exclude_unset=True) == {}


def test_profesional_patch_forbid_extra():
    with pytest.raises(ValidationError):
        ProfesionalPatch.model_validate({"campo_extra": "foo"})


def test_profesional_patch_rechazar_null():
    with pytest.raises(ValidationError):
        ProfesionalPatch.model_validate({"nombre": None})
    with pytest.raises(ValidationError):
        ProfesionalPatch.model_validate({"matricula": None})
    with pytest.raises(ValidationError):
        ProfesionalPatch.model_validate({"activo": None})


def test_profesional_patch_exceso_longitud():
    with pytest.raises(ValidationError):
        ProfesionalPatch(nombre="B" * 201)
    with pytest.raises(ValidationError):
        ProfesionalPatch(matricula="M" * 33)


def test_profesional_out():
    uid = uuid.uuid4()
    out = ProfesionalOut(id=uid, nombre="Dra.", matricula="M-1", activo=True)
    assert out.id == uid
    assert out.activo is True


# ============================================================================
# 3. Sillón
# ============================================================================


def test_sillon_create_ok():
    s = SillonCreate(nombre="Sillón 1")
    assert s.nombre == "Sillón 1"


def test_sillon_create_longitudes_limite():
    s = SillonCreate(nombre="S" * 100)
    assert len(s.nombre) == 100

    with pytest.raises(ValidationError):
        SillonCreate(nombre="S" * 101)
    with pytest.raises(ValidationError):
        SillonCreate(nombre="")


def test_sillon_patch_ok():
    patch = SillonPatch(activo=False)
    assert patch.activo is False
    assert patch.nombre is None


def test_sillon_patch_vacio():
    patch = SillonPatch()
    assert patch.model_dump(exclude_unset=True) == {}


def test_sillon_patch_forbid_extra():
    with pytest.raises(ValidationError):
        SillonPatch.model_validate({"desconocido": 123})


def test_sillon_patch_rechazar_null():
    with pytest.raises(ValidationError):
        SillonPatch.model_validate({"nombre": None})
    with pytest.raises(ValidationError):
        SillonPatch.model_validate({"activo": None})


def test_sillon_patch_exceso_longitud():
    with pytest.raises(ValidationError):
        SillonPatch(nombre="S" * 101)


def test_sillon_out():
    uid = uuid.uuid4()
    out = SillonOut(id=uid, nombre="Sillon A", activo=True)
    assert out.id == uid


# ============================================================================
# 4. Prestación
# ============================================================================


def test_prestacion_create_ok():
    p = PrestacionCreate(nombre="Consulta General", duracion_min=30)
    assert p.nombre == "Consulta General"
    assert p.duracion_min == 30


def test_prestacion_create_duracion_invalida():
    with pytest.raises(ValidationError):
        PrestacionCreate(nombre="Consulta", duracion_min=0)
    with pytest.raises(ValidationError):
        PrestacionCreate(nombre="Consulta", duracion_min=-15)


def test_prestacion_create_longitudes_limite():
    p = PrestacionCreate(nombre="P" * 100, duracion_min=20)
    assert len(p.nombre) == 100

    with pytest.raises(ValidationError):
        PrestacionCreate(nombre="P" * 101, duracion_min=20)
    with pytest.raises(ValidationError):
        PrestacionCreate(nombre="", duracion_min=20)


def test_prestacion_patch_ok():
    patch = PrestacionPatch(duracion_min=45)
    assert patch.duracion_min == 45
    assert patch.nombre is None
    assert patch.activo is None


def test_prestacion_patch_vacio():
    patch = PrestacionPatch()
    assert patch.model_dump(exclude_unset=True) == {}


def test_prestacion_patch_duracion_invalida():
    with pytest.raises(ValidationError):
        PrestacionPatch(duracion_min=0)
    with pytest.raises(ValidationError):
        PrestacionPatch(duracion_min=-10)


def test_prestacion_patch_forbid_extra():
    with pytest.raises(ValidationError):
        PrestacionPatch.model_validate({"otro_campo": 99})


def test_prestacion_patch_rechazar_null():
    with pytest.raises(ValidationError):
        PrestacionPatch.model_validate({"nombre": None})
    with pytest.raises(ValidationError):
        PrestacionPatch.model_validate({"duracion_min": None})
    with pytest.raises(ValidationError):
        PrestacionPatch.model_validate({"activo": None})


def test_prestacion_patch_exceso_longitud():
    with pytest.raises(ValidationError):
        PrestacionPatch(nombre="P" * 101)


def test_prestacion_out():
    uid = uuid.uuid4()
    out = PrestacionOut(id=uid, nombre="Limpieza", duracion_min=20, activo=True)
    assert out.duracion_min == 20


# ============================================================================
# 5. Horario de Atención
# ============================================================================


def test_horario_create_ok():
    prof_id = uuid.uuid4()
    h = HorarioCreate(
        profesional_id=prof_id,
        dia_semana=0,
        desde=time(9, 0),
        hasta=time(18, 0),
    )
    assert h.profesional_id == prof_id
    assert h.dia_semana == 0
    assert h.desde == time(9, 0)
    assert h.hasta == time(18, 0)


def test_horario_create_dia_semana_invalido():
    prof_id = uuid.uuid4()
    with pytest.raises(ValidationError):
        HorarioCreate(
            profesional_id=prof_id,
            dia_semana=-1,
            desde=time(9, 0),
            hasta=time(18, 0),
        )
    with pytest.raises(ValidationError):
        HorarioCreate(
            profesional_id=prof_id,
            dia_semana=7,
            desde=time(9, 0),
            hasta=time(18, 0),
        )


def test_horario_create_rango_invalido():
    prof_id = uuid.uuid4()
    # desde == hasta
    with pytest.raises(ValidationError):
        HorarioCreate(
            profesional_id=prof_id,
            dia_semana=1,
            desde=time(10, 0),
            hasta=time(10, 0),
        )
    # desde > hasta
    with pytest.raises(ValidationError):
        HorarioCreate(
            profesional_id=prof_id,
            dia_semana=1,
            desde=time(14, 0),
            hasta=time(10, 0),
        )


def test_horario_patch_ok():
    patch = HorarioPatch(dia_semana=2, hasta=time(17, 0))
    assert patch.dia_semana == 2
    assert patch.hasta == time(17, 0)
    assert patch.desde is None
    assert patch.activo is None


def test_horario_patch_vacio():
    patch = HorarioPatch()
    assert patch.model_dump(exclude_unset=True) == {}


def test_horario_patch_rechaza_profesional_id():
    # profesional_id no es modificable en PATCH -> extra="forbid" -> ValidationError (422)
    with pytest.raises(ValidationError):
        HorarioPatch.model_validate({"profesional_id": str(uuid.uuid4())})


def test_horario_patch_forbid_extra():
    with pytest.raises(ValidationError):
        HorarioPatch.model_validate({"sillon_id": str(uuid.uuid4())})


def test_horario_patch_rechazar_null():
    with pytest.raises(ValidationError):
        HorarioPatch.model_validate({"dia_semana": None})
    with pytest.raises(ValidationError):
        HorarioPatch.model_validate({"desde": None})
    with pytest.raises(ValidationError):
        HorarioPatch.model_validate({"hasta": None})
    with pytest.raises(ValidationError):
        HorarioPatch.model_validate({"activo": None})


def test_horario_patch_dia_semana_invalido():
    with pytest.raises(ValidationError):
        HorarioPatch(dia_semana=-1)
    with pytest.raises(ValidationError):
        HorarioPatch(dia_semana=7)

def test_horario_create_rechaza_tzinfo_aware():
    prof_id = uuid.uuid4()
    # desde aware
    with pytest.raises(ValidationError):
        HorarioCreate(
            profesional_id=prof_id,
            dia_semana=1,
            desde=time(10, 0, tzinfo=UTC),
            hasta=time(11, 0),
        )
    # hasta aware
    with pytest.raises(ValidationError):
        HorarioCreate(
            profesional_id=prof_id,
            dia_semana=1,
            desde=time(10, 0),
            hasta=time(11, 0, tzinfo=UTC),
        )
    # mixto (desde naive, hasta aware string o objeto) -> debe dar ValidationError, no TypeError
    with pytest.raises(ValidationError):
        HorarioCreate.model_validate(
            {
                "profesional_id": str(prof_id),
                "dia_semana": 1,
                "desde": "10:00",
                "hasta": "11:00+00:00",
            }
        )


def test_horario_patch_rechaza_tzinfo_aware():
    with pytest.raises(ValidationError):
        HorarioPatch(desde=time(10, 0, tzinfo=UTC))
    with pytest.raises(ValidationError):
        HorarioPatch(hasta=time(11, 0, tzinfo=UTC))



def test_horario_out():
    uid = uuid.uuid4()
    prof_id = uuid.uuid4()
    out = HorarioOut(
        id=uid,
        profesional_id=prof_id,
        dia_semana=3,
        desde=time(8, 0),
        hasta=time(12, 0),
        activo=True,
    )
    assert out.profesional_id == prof_id


# ============================================================================
# 6. Bloqueo
# ============================================================================


def test_bloqueo_create_ok_profesional_y_sillon():
    prof_id = uuid.uuid4()
    sil_id = uuid.uuid4()
    b = BloqueoCreate(
        profesional_id=prof_id,
        sillon_id=sil_id,
        desde=datetime(2026, 12, 24, 8, 0, tzinfo=UTC),
        hasta=datetime(2026, 12, 24, 12, 0, tzinfo=UTC),
        motivo="Feriado",
    )
    assert b.profesional_id == prof_id
    assert b.sillon_id == sil_id
    assert b.motivo == "Feriado"


def test_bloqueo_create_global_ok():
    b = BloqueoCreate(
        profesional_id=None,
        sillon_id=None,
        desde=datetime(2026, 12, 25, 0, 0, tzinfo=UTC),
        hasta=datetime(2026, 12, 25, 23, 59, tzinfo=UTC),
        motivo="Feriado Nacional",
    )
    assert b.profesional_id is None
    assert b.sillon_id is None


def test_bloqueo_create_rechaza_datetime_naive():
    with pytest.raises(ValidationError):
        BloqueoCreate(
            desde=datetime(2026, 12, 24, 8, 0),  # naive sin tzinfo
            hasta=datetime(2026, 12, 24, 12, 0, tzinfo=UTC),
            motivo="Prueba",
        )
    with pytest.raises(ValidationError):
        BloqueoCreate(
            desde=datetime(2026, 12, 24, 8, 0, tzinfo=UTC),
            hasta=datetime(2026, 12, 24, 12, 0),  # naive
            motivo="Prueba",
        )


def test_bloqueo_create_rango_invalido():
    # desde == hasta
    with pytest.raises(ValidationError):
        BloqueoCreate(
            desde=datetime(2026, 12, 24, 8, 0, tzinfo=UTC),
            hasta=datetime(2026, 12, 24, 8, 0, tzinfo=UTC),
            motivo="Prueba",
        )
    # desde > hasta
    with pytest.raises(ValidationError):
        BloqueoCreate(
            desde=datetime(2026, 12, 24, 14, 0, tzinfo=UTC),
            hasta=datetime(2026, 12, 24, 8, 0, tzinfo=UTC),
            motivo="Prueba",
        )


def test_bloqueo_create_motivo_vacio():
    with pytest.raises(ValidationError):
        BloqueoCreate(
            desde=datetime(2026, 12, 24, 8, 0, tzinfo=UTC),
            hasta=datetime(2026, 12, 24, 12, 0, tzinfo=UTC),
            motivo="",
        )


def test_bloqueo_out():
    out = BloqueoOut(
        id=uuid.uuid4(),
        profesional_id=None,
        sillon_id=None,
        desde=datetime(2026, 12, 25, 0, 0, tzinfo=UTC),
        hasta=datetime(2026, 12, 25, 23, 59, tzinfo=UTC),
        motivo="Feriado",
    )
    assert out.profesional_id is None
    assert out.motivo == "Feriado"

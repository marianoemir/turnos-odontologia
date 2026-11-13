"""Matriz RBAC de caja: 9 endpoints x 4 roles (C-11, grupo 8).

La matriz de abajo está escrita a mano desde design.md D3 y NO se deriva
de `permissions.py`. El test `test_matriz_coincide_con_roles_con_permiso`
compara ambas para detectar divergencias (código contra código).

Sesión: se sobreescribe el `get_db` propio del router de caja con
`db_session` (no el de turnos), como en test_multisucursal_aislamiento.py.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.auth.jwt_service import emitir_token
from backend.app.auth.models import Usuario
from backend.app.auth.password import hashear_password
from backend.app.caja.router import get_db as caja_get_db
from backend.app.main import app
from backend.app.rbac.context import get_sucursal_session
from backend.app.rbac.models import Rol
from backend.app.rbac.permissions import roles_con_permiso

# Matriz D3 escrita a mano: endpoint -> roles permitidos (allow).
CAPABILITY_POR_ENDPOINT = {
    "abrir": "caja:escribir",
    "cerrar": "caja:escribir",
    "caja_id": "caja:leer",
    "caja": "caja:leer",
    "cobros": "cobros:escribir",
    "cobro_id": "cobros:leer",
    "anular": "cobros:escribir",
    "factura": "cobros:facturar",
    "liquidaciones": "liquidaciones:leer",
}

PERMITIDOS_D3 = {
    "abrir": {"admin", "recepcion"},
    "cerrar": {"admin", "recepcion"},
    "caja_id": {"admin", "recepcion", "odontologo"},
    "caja": {"admin", "recepcion", "odontologo"},
    "cobros": {"admin", "recepcion"},
    "cobro_id": {"admin", "recepcion", "odontologo"},
    "anular": {"admin", "recepcion"},
    "factura": {"admin", "recepcion"},
    "liquidaciones": {"admin", "recepcion", "odontologo"},
}

ROLES = ["admin", "recepcion", "odontologo", "paciente"]

_ID_ALEATORIO = "00000000-0000-0000-0000-000000000099"


def _llamar(client, endpoint: str, headers: dict | None):
    if endpoint == "abrir":
        return client.post(
            "/caja/abrir", json={"monto_apertura_centavos": 10000}, headers=headers
        )
    if endpoint == "cerrar":
        return client.post(
            "/caja/cerrar",
            json={"monto_cierre_contado_centavos": 1000},
            headers=headers,
        )
    if endpoint == "caja_id":
        return client.get(f"/caja/{_ID_ALEATORIO}", headers=headers)
    if endpoint == "caja":
        return client.get("/caja", headers=headers)
    if endpoint == "cobros":
        return client.post(
            "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}, headers=headers
        )
    if endpoint == "cobro_id":
        return client.get(f"/cobros/{_ID_ALEATORIO}", headers=headers)
    if endpoint == "anular":
        return client.post(
            f"/cobros/{_ID_ALEATORIO}/anular", json={"motivo": "x"}, headers=headers
        )
    if endpoint == "factura":
        return client.post(
            f"/cobros/{_ID_ALEATORIO}/factura-arca",
            json={"tipo": "B"},
            headers=headers,
        )
    if endpoint == "liquidaciones":
        return client.get("/liquidaciones-os", headers=headers)
    raise AssertionError(f"endpoint desconocido: {endpoint}")


@pytest.fixture()
def tokens_por_rol(db_session):
    tokens = {}
    for rol_nombre in ROLES:
        rol_obj = db_session.query(Rol).filter_by(nombre=rol_nombre).first()
        if not rol_obj:
            rol_obj = Rol(nombre=rol_nombre)
            db_session.add(rol_obj)
            db_session.flush()
        u = db_session.query(Usuario).filter_by(dni=f"88884{rol_nombre[:3]}").first()
        if not u:
            u = Usuario(
                dni=f"88884{rol_nombre[:3]}",
                password_hash=hashear_password("pwd"),
                rol_id=rol_obj.id,
                activo=True,
            )
            db_session.add(u)
            db_session.commit()
        tokens[rol_nombre] = emitir_token(usuario_id=u.id, rol=rol_nombre)
    return tokens


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[caja_get_db] = lambda: db_session
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(caja_get_db, None)
    app.dependency_overrides.pop(get_sucursal_session, None)


@pytest.mark.parametrize("endpoint", sorted(PERMITIDOS_D3))
@pytest.mark.parametrize("rol", ROLES)
def test_matriz_9x4(client, tokens_por_rol, endpoint: str, rol: str) -> None:
    token = tokens_por_rol[rol]
    r = _llamar(client, endpoint, headers={"Authorization": f"Bearer {token}"})
    if rol in PERMITIDOS_D3[endpoint]:
        assert r.status_code not in (401, 403, 500), (
            f"{endpoint} con {rol} debía pasar; status={r.status_code} {r.text}"
        )
    else:
        assert r.status_code == 403, (
            f"{endpoint} con {rol} debía dar 403; status={r.status_code} {r.text}"
        )
        assert r.status_code != 500
        assert r.json()["detail"]["causa"] == "permiso_denegado"


def test_matriz_coincide_con_roles_con_permiso() -> None:
    for endpoint, capability in CAPABILITY_POR_ENDPOINT.items():
        assert roles_con_permiso(capability) == frozenset(
            PERMITIDOS_D3[endpoint]
        ), endpoint


@pytest.mark.parametrize("endpoint", sorted(PERMITIDOS_D3))
def test_sin_header_da_401_token_ausente(client, endpoint: str) -> None:
    """Sin header, toda ruta de caja responde 401 token_ausente (C-24)."""
    r_sin = _llamar(client, endpoint, headers=None)
    assert r_sin.status_code == 401, (endpoint, r_sin.text)
    assert r_sin.json()["detail"]["causa"] == "token_ausente"


@pytest.mark.parametrize("endpoint", sorted(PERMITIDOS_D3))
def test_ningun_denegado_se_convierte_en_500(client, tokens_por_rol, endpoint: str) -> None:
    """Todo rol denegado responde exactamente 403, nunca 500."""
    for rol in ROLES:
        if rol in PERMITIDOS_D3[endpoint]:
            continue
        token = tokens_por_rol[rol]
        r = _llamar(client, endpoint, headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403, (endpoint, rol, r.status_code, r.text)
        assert r.status_code != 500

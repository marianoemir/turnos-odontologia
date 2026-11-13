"""Fixture para pruebas autenticadas con JWT (C-24, Grupo 4, Tarea 4.3)."""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from backend.app.auth.jwt_service import emitir_token
from backend.app.main import app


@pytest.fixture
def auth_token_factory() -> Callable[[str, uuid.UUID | None, uuid.UUID | None], str]:
    """Fabrica un JWT válido para cualquier rol y sucursal."""

    def _crear(
        rol: str = "recepcion",
        sucursal_id: uuid.UUID | None = None,
        usuario_id: uuid.UUID | None = None,
    ) -> str:
        uid = usuario_id or uuid.uuid4()
        return emitir_token(usuario_id=uid, rol=rol, sucursal_id=sucursal_id)

    return _crear


@pytest.fixture
def auth_client_factory(
    auth_token_factory: Callable[[str, uuid.UUID | None, uuid.UUID | None], str],
) -> Callable[[str, uuid.UUID | None, uuid.UUID | None], TestClient]:
    """Crea un TestClient con cabecera Authorization: Bearer <token> configurada."""

    def _crear(
        rol: str = "recepcion",
        sucursal_id: uuid.UUID | None = None,
        usuario_id: uuid.UUID | None = None,
    ) -> TestClient:
        token = auth_token_factory(
            rol=rol, sucursal_id=sucursal_id, usuario_id=usuario_id
        )
        return TestClient(
            app,
            headers={"Authorization": f"Bearer {token}"},
            raise_server_exceptions=False,
        )

    return _crear

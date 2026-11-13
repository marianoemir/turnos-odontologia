"""Schemas Pydantic para autenticación y login (C-24)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    dni: str = Field(..., min_length=1, max_length=32)
    password: str = Field(..., min_length=1, max_length=128)
    sucursal_id: uuid.UUID | None = None


class LoginResponse(BaseModel):
    token: str
    rol: str
    usuario: str
    sucursal_id: uuid.UUID | None = None

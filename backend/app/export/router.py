"""Router FastAPI para la exportación total (C-11, grupo 9, design D7).

`GET /export` es solo-admin (`Depends(require_admin())` en la firma).
El reloj es la dependencia `get_ahora` (de `backend.app.caja.reloj`),
sobreescribible en tests.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.app.caja.reloj import ahora_local
from backend.app.export import service as export_service
from backend.app.rbac.context import PermissionContext
from backend.app.rbac.dependencies import require_admin
from backend.app.turnos.router import get_db

router = APIRouter(tags=["export"])


def get_ahora() -> datetime:
    """Reloj inyectable (mismo de caja)."""
    return ahora_local()


@router.get("/export", status_code=200)
def exportar(
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
    desde: Annotated[date | None, Query()] = None,
    hasta: Annotated[date | None, Query()] = None,
) -> Response:
    try:
        datos = export_service.construir_export(session, ahora, desde, hasta)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    cuerpo = json.dumps(
        datos, indent=2, ensure_ascii=False, default=str
    ).encode("utf-8")
    nombre = (
        f"export-turnos-{ahora.strftime('%Y%m%d')}-"
        f"{ahora.strftime('%H%M%S')}.json"
    )
    return Response(
        content=cuerpo,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )

"""App FastAPI del sistema de turnos odontológicos.

Expone `GET /health` y monta los routers de turnos, agenda, catálogo,
lista de espera, historia clínica, caja, RBAC, export, recordatorios y
reserva online. Todos acceden a PostgreSQL con SQLAlchemy a través de
la variable de entorno `DATABASE_URL`.
"""

from fastapi import FastAPI

from backend.app.agenda.router import router as agenda_router
from backend.app.agenda.router_catalogo import router as catalogo_router
from backend.app.auth.router import router as auth_router
from backend.app.caja.router import router as caja_router
from backend.app.export.router import router as export_router
from backend.app.hc.router import router as hc_router
from backend.app.lista_espera.router import router as lista_espera_router
from backend.app.rbac.router import router as rbac_router
from backend.app.recordatorios.router import router as recordatorios_router
from backend.app.reserva_online.router import router as reserva_online_router
from backend.app.turnos.router import router as turnos_router

app = FastAPI()
app.include_router(auth_router)
app.include_router(turnos_router)
app.include_router(agenda_router)
app.include_router(catalogo_router)
app.include_router(lista_espera_router)
app.include_router(hc_router)
app.include_router(caja_router)
app.include_router(rbac_router)
app.include_router(export_router)
app.include_router(recordatorios_router)
app.include_router(reserva_online_router)


@app.get("/health")
def health():
    return {"status": "ok"}

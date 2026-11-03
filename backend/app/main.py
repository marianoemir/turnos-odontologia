"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""

from fastapi import FastAPI

from backend.app.agenda.router import router as agenda_router
from backend.app.hc.router import router as hc_router
from backend.app.lista_espera.router import router as lista_espera_router
from backend.app.turnos.router import router as turnos_router

app = FastAPI()
app.include_router(turnos_router)
app.include_router(agenda_router)
app.include_router(lista_espera_router)
app.include_router(hc_router)


@app.get("/health")
def health():
    return {"status": "ok"}


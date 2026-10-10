"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""

from fastapi import FastAPI

from backend.app.turnos.router import router as turnos_router

app = FastAPI()
app.include_router(turnos_router)


@app.get("/health")
def health():
    return {"status": "ok"}


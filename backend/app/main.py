"""App FastAPI minima (C-01): solo GET /health, sin DB ni SQLAlchemy."""

from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


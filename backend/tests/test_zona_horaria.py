"""Zona horaria America/Argentina/Buenos_Aires (C-03, D9).

`ZoneInfo(...)` en Windows no tiene base tz del sistema: depende del
paquete `tzdata` (backend/requirements.txt). Sin `tzdata` este test
falla con ZoneInfoNotFoundError; con `tzdata` instalado pasa en
Windows y Linux.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

ZONA = "America/Argentina/Buenos_Aires"


def test_zoneinfo_buenos_aires_resuelve():
    tz = ZoneInfo(ZONA)

    assert tz.key == ZONA


def test_zoneinfo_buenos_aires_offset_menos_tres():
    tz = ZoneInfo(ZONA)
    invierno = datetime(2026, 7, 6, 10, 0, tzinfo=tz)

    assert invierno.utcoffset().total_seconds() == -3 * 3600


def test_tzdata_instalado():
    import tzdata  # noqa: F401  (falla si el paquete no esta instalado)

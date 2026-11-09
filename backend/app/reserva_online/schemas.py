from datetime import datetime

from pydantic import BaseModel


class SlotOut(BaseModel):
    inicio: datetime
    fin: datetime

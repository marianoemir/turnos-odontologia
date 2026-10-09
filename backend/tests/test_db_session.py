"""T1.3 (C-02): fixture db_session contra Postgres real.

Smoke test de la fixture: si Postgres no esta alcanzable el test se
skipea (salvo con CI=true, donde la ausencia de Postgres falla).
"""

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.integration


def test_db_session_transaccional(db_session):
    assert db_session.execute(text("SELECT 1")).scalar() == 1

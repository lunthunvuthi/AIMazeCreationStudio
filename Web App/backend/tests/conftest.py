"""Test-suite configuration.

The two environment variables below MUST be set before anything imports
`maze_api`: `maze_api.config` reads the environment once, at import, and freezes
the result. That is also why this file imports nothing from the app at module
level.

* `DATABASE_URL` points at a throwaway SQLite file per test session, so running
  the suite never touches the developer's real `maze_studio.db`.
* `DEV_AUTH_BYPASS` turns on the fixed-token login from auth.py. Without it the
  suite would need a live Auth0 tenant to test anything behind a login, which
  would make `pytest -q` depend on a network service.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TMP_DB = Path(tempfile.mkdtemp(prefix="maze-studio-tests-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ["DEV_AUTH_BYPASS"] = "1"
os.environ.setdefault("APP_ENV", "development")

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def bypass_headers() -> dict[str, str]:
    from maze_api.config import DEV_BYPASS_TOKEN

    return {"Authorization": f"Bearer {DEV_BYPASS_TOKEN}"}


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    """Build the throwaway database once per session.

    The suite constructs its TestClients at module level rather than inside a
    `with` block, so FastAPI's lifespan -- which is what calls ensure_schema()
    in the running app -- never fires. Running the real Alembic migration here
    rather than Base.metadata.create_all also means a migration that drifts
    from the models fails the suite instead of passing it.
    """
    from maze_api.db import ensure_schema

    ensure_schema()

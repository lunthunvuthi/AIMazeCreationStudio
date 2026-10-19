"""SQLAlchemy engine/session wiring (roadmap step 7a).

Deliberately tiny: one engine, one sessionmaker, one FastAPI dependency. The
owner's storage decision (2026-08-28) is "Auth0 login plus a deliberately tiny
backend store", and 7a's share of that store is exactly one table -- `users`,
so the app can answer "who is using this". Sheets and revisions arrive in 7b.

DATABASE_URL defaults to a local SQLite file (see config.py) so nothing has to
be installed to run the app. The models and migrations avoid SQLite-only and
Postgres-only constructs, so the same `alembic upgrade head` builds either.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

if TYPE_CHECKING:
    from alembic.config import Config

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _engine_kwargs() -> dict:
    if settings.database_url.startswith("sqlite"):
        # TestClient and uvicorn both touch the session from worker threads.
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True}


engine = create_engine(settings.database_url, future=True, **_engine_kwargs())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def alembic_config() -> "Config":
    """Alembic's Config, pointed at this backend's migrations directory.

    Built in code rather than found by CWD so `alembic upgrade head` behaves the
    same whether it is run from the repo root, from `Web App/backend`, or from
    the app's own startup.
    """
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "migrations"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    return cfg


def ensure_schema() -> None:
    """Bring the database up to head at startup -- development only.

    In production the operator runs `alembic upgrade head` as a deploy step. A
    server that migrates itself is convenient locally and a liability in
    production, where two instances starting at once would race and where an
    unintended migration is exactly the kind of thing that should require a
    human to have typed it.
    """
    if settings.is_production:
        logger.info("APP_ENV=production: skipping automatic migration; run `alembic upgrade head`.")
        return

    from alembic import command

    command.upgrade(alembic_config(), "head")

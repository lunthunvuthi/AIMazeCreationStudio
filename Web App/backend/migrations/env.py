"""Alembic environment.

Takes its URL and its metadata from the application itself rather than from
alembic.ini, so there is exactly one definition of "the database" and one of
"the schema". `render_as_batch` is on because SQLite is the default engine in
development and cannot ALTER a column without table rebuilds; Postgres ignores
it.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import engine_from_config, pool

from maze_api.config import settings
from maze_api.db import Base
from maze_api import models  # noqa: F401  -- imported for its side effect: registering tables

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

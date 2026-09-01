"""Runtime configuration for auth, CORS and the database (roadmap step 7a).

Everything here is read from the environment once, at import, and exposed as a
single frozen `settings` object. Two rules shape the whole module:

* **Development must keep working with no configuration at all.** Until the
  owner has created an Auth0 tenant there is nothing to configure, and a repo
  whose `main` cannot be run is worse than one without auth. So when Auth0 is
  unconfigured and APP_ENV is not "production", the API runs in **bypass mode**
  (see auth.py) and says so loudly at startup.
* **Production must never silently do that.** With APP_ENV=production, missing
  Auth0 settings is a startup error, not a downgrade, and the bypass cannot be
  switched on at all. A misconfiguration that fails to boot is recoverable; one
  that boots wide open is not.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Origins the Vite dev server actually uses. :5174 is in the list because a
# stale Vite from an older session routinely holds :5173 (see the handoffs).
DEV_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

# The single bearer token the dev bypass accepts. Deliberately a fixed, obvious
# string rather than a generated secret: it is not a credential, it is a marker
# saying "this request came from a machine running without Auth0". Anything
# that treats it as a secret has misunderstood it -- it only works at all on a
# server that has already announced it is unauthenticated.
DEV_BYPASS_TOKEN = "dev-bypass-token"


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


class ConfigError(RuntimeError):
    """Raised at startup when production configuration is incomplete."""


@dataclass(frozen=True)
class Settings:
    app_env: str
    auth0_domain: str
    auth0_audience: str
    database_url: str
    bootstrap_admin_email: str
    cors_origins: list[str] = field(default_factory=list)
    _bypass_requested: bool = False

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def auth_configured(self) -> bool:
        return bool(self.auth0_domain and self.auth0_audience)

    @property
    def auth_bypass(self) -> bool:
        """True when the API accepts DEV_BYPASS_TOKEN instead of a real JWT.

        Never true in production -- not even if DEV_AUTH_BYPASS is set, which is
        why this is a computed property and not a plain field.
        """
        if self.is_production:
            return False
        return self._bypass_requested or not self.auth_configured

    @property
    def issuer(self) -> str:
        return f"https://{self.auth0_domain}/"

    @property
    def jwks_url(self) -> str:
        return f"https://{self.auth0_domain}/.well-known/jwks.json"


def load_settings() -> Settings:
    app_env = os.environ.get("APP_ENV", "development").strip().lower()

    raw_origins = os.environ.get("CORS_ORIGINS", "").strip()
    origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

    # SQLite by default so `git pull && python scripts/run_backend.py` needs no
    # database server. The schema and the migrations are engine-neutral, so
    # moving to Postgres is a DATABASE_URL change plus `alembic upgrade head`.
    default_db = f"sqlite:///{BACKEND_DIR / 'maze_studio.db'}"

    settings = Settings(
        app_env=app_env,
        auth0_domain=os.environ.get("AUTH0_DOMAIN", "").strip(),
        auth0_audience=os.environ.get("AUTH0_AUDIENCE", "").strip(),
        database_url=os.environ.get("DATABASE_URL", "").strip() or default_db,
        bootstrap_admin_email=os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower(),
        cors_origins=origins or (list(DEV_CORS_ORIGINS) if app_env != "production" else []),
        _bypass_requested=_flag("DEV_AUTH_BYPASS"),
    )

    if settings.is_production:
        if not settings.auth_configured:
            raise ConfigError(
                "APP_ENV=production requires AUTH0_DOMAIN and AUTH0_AUDIENCE. "
                "Refusing to start an unauthenticated production API."
            )
        if not settings.cors_origins:
            raise ConfigError(
                "APP_ENV=production requires CORS_ORIGINS (comma-separated). "
                'The old allow_origins=["*"] is not safe once requests carry credentials.'
            )

    return settings


settings = load_settings()

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import DEV_BYPASS_TOKEN, settings
from .db import ensure_schema
from .routes import router
from .users import router as users_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    ensure_schema()
    if settings.auth_bypass:
        # Loud on purpose. A server in this mode accepts one fixed string as a
        # bearer token; anyone reading the log must be able to tell at a glance
        # that what they are looking at is not authenticated.
        reason = "DEV_AUTH_BYPASS is set" if settings.auth_configured else "Auth0 is not configured"
        logger.warning(
            "=" * 72
            + f"\nAUTH BYPASS ACTIVE ({reason}). The API accepts the fixed token "
            f"{DEV_BYPASS_TOKEN!r} as a valid login. This is for local development and "
            "the browser-driven checks in scripts/ only, and is impossible with "
            "APP_ENV=production.\n" + "=" * 72
        )
    else:
        logger.info("Auth0 enabled: issuer=%s audience=%s", settings.issuer, settings.auth0_audience)
    yield


app = FastAPI(title="Maze Studio API", lifespan=lifespan)

# Tightened in step 7a. The old allow_origins=["*"] carried a comment saying it
# was fine *because* the API was stateless and unauthenticated; that stopped
# being true in the commit that started reading Authorization headers. The dev
# default is the Vite origins (config.DEV_CORS_ORIGINS); production must set
# CORS_ORIGINS or the app refuses to start.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(router)
app.include_router(users_router)


@app.get("/api/health")
def health() -> dict:
    """Unauthenticated liveness probe.

    Deliberately public and deliberately says nothing about the data: it exists
    so a deployment, and `scripts/run_backend.py`, can tell a running server
    from a dead one without a token. It does report whether the bypass is on,
    which is information worth being able to check from outside the log.
    """
    return {"status": "ok", "authBypass": settings.auth_bypass, "env": settings.app_env}

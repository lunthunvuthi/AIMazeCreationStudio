"""Auth0 access-token verification and the current-user dependency (step 7a).

The frontend is a public SPA using Authorization Code + PKCE (@auth0/auth0-react),
so it holds an access token and sends it as `Authorization: Bearer <jwt>`. This
module is the only place that decides whether such a token is real.

Verification is the standard RS256/JWKS check -- signature against Auth0's
published keys, plus `aud` and `iss`. PyJWT's PyJWKClient caches the key set, so
this is one network call per key rotation, not per request.

**The dev bypass.** When config.settings.auth_bypass is on, one fixed token
string (config.DEV_BYPASS_TOKEN) is accepted and maps to a fixed local user.
This exists because every frontend guarantee in this repo is verified by driving
the real app in a browser (there is no frontend test runner), and both Google
and Auth0's hosted login block automated sign-in -- so `scripts/autosave_check.mjs`
(29 checks, the only automated coverage of Modify Maze) and `scripts/phase_b_run.mjs`
would stop working the day auth landed. It is a decision recorded in
`auth_spec.md` §4, chosen over a password-grant test user and over a
backend-issued test-login endpoint. It cannot be enabled with APP_ENV=production.
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import DEV_BYPASS_TOKEN, settings
from .db import get_db
from .models import ROLE_ADMIN, ROLES, User, utcnow

logger = logging.getLogger(__name__)

# Auth0 puts OIDC profile claims in an ID token, not an access token, so an
# access token normally carries only `sub`. The frontend's Auth0 Action can add
# email/name under a namespaced claim; when it hasn't, /api/users/me still
# records the subject and the profile fields stay null.
CLAIM_NAMESPACE = "https://maze-studio/"

BYPASS_SUB = "dev|bypass"
BYPASS_EMAIL = "dev-bypass@localhost"

# Writing last_seen_at on every request would turn each API call into a write.
# Five minutes is enough resolution to answer "who used this today", which is
# the question the owner actually asked for.
LAST_SEEN_THROTTLE = dt.timedelta(minutes=5)

_jwk_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(settings.jwks_url, cache_keys=True)
    return _jwk_client


@dataclass(frozen=True)
class Principal:
    """Who the token says this is, before the database has an opinion."""

    sub: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    via_bypass: bool = False


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def bearer_token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Missing bearer token")
    return token.strip()


def verify_token(token: str) -> Principal:
    if settings.auth_bypass and token == DEV_BYPASS_TOKEN:
        return Principal(sub=BYPASS_SUB, email=BYPASS_EMAIL, name="Dev Bypass", via_bypass=True)

    if not settings.auth_configured:
        # Only reachable when the bypass is on and the caller sent something
        # else; there is no key set to check a real token against.
        raise _unauthorized("Auth0 is not configured on this server")

    try:
        key = _jwks().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.auth0_audience,
            issuer=settings.issuer,
        )
    except jwt.PyJWTError as exc:
        raise _unauthorized(f"Invalid token: {exc}") from exc

    sub = claims.get("sub")
    if not sub:
        raise _unauthorized("Token has no subject")

    return Principal(
        sub=sub,
        email=claims.get(CLAIM_NAMESPACE + "email") or claims.get("email"),
        name=claims.get(CLAIM_NAMESPACE + "name") or claims.get("name"),
        picture=claims.get(CLAIM_NAMESPACE + "picture") or claims.get("picture"),
    )


def _as_utc(value: dt.datetime | None) -> dt.datetime | None:
    # SQLite hands back naive datetimes even for DateTime(timezone=True).
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=dt.timezone.utc)
    return value


def _initial_role(principal: Principal) -> str:
    """Someone has to be able to make the first HeadTeacher (collab spec §2).

    Until 7f ships an invite/role-assignment screen, BOOTSTRAP_ADMIN_EMAIL is
    that mechanism: the named address becomes an admin the first time it signs
    in. It is applied on creation only -- it cannot silently re-promote someone
    an admin later demoted.
    """
    if settings.bootstrap_admin_email and principal.email:
        if principal.email.strip().lower() == settings.bootstrap_admin_email:
            return ROLE_ADMIN
    return ROLES[0]


def upsert_user(db: Session, principal: Principal) -> User:
    user = db.scalar(select(User).where(User.auth0_sub == principal.sub))

    if user is None:
        user = User(
            auth0_sub=principal.sub,
            email=principal.email,
            name=principal.name,
            picture=principal.picture,
            role=_initial_role(principal),
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            # Two first requests from one new user can race. Whoever lost reads
            # the winner's row rather than failing the request.
            db.rollback()
            user = db.scalar(select(User).where(User.auth0_sub == principal.sub))
            if user is None:
                raise
        return user

    changed = False
    for field_name in ("email", "name", "picture"):
        incoming = getattr(principal, field_name)
        if incoming and incoming != getattr(user, field_name):
            setattr(user, field_name, incoming)
            changed = True

    last_seen = _as_utc(user.last_seen_at)
    if last_seen is None or utcnow() - last_seen > LAST_SEEN_THROTTLE:
        user.last_seen_at = utcnow()
        changed = True

    if changed:
        db.commit()
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """The dependency every protected route uses.

    Role checks are built on top of this in one place (require_role) rather
    than as per-endpoint `if` statements -- collaboration_workflow_spec.md §7
    is explicit that the code making approval mean anything must be auditable
    in a single location.
    """
    principal = verify_token(bearer_token(request))
    return upsert_user(db, principal)


def require_role(*allowed: str):
    for role in allowed:
        if role not in ROLES:
            raise ValueError(f"unknown role: {role}")

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"requires role: {' or '.join(allowed)}",
            )
        return user

    return dependency

"""User endpoints (roadmap step 7a).

The owner's stated goal for 7a is "I want users to log into this webapp to
track who is using". That is what these three routes are:

  GET   /api/users/me          who am I, and what role do I have
  GET   /api/users             the roster of everyone who has ever signed in
  PATCH /api/users/{id}/role   change someone's role

/api/users/me doubles as the write path: the current-user dependency upserts on
every authenticated request, so simply signing in records the account. Roles
are read from the database, not from an Auth0 claim -- see models.py.

Role *assignment* has no UI in 7a; step 7f owns the admin screen. The PATCH
route exists anyway so the roles column is not inert -- without it the only way
to make anyone a HeadTeacher would be BOOTSTRAP_ADMIN_EMAIL plus hand-editing
the database.
"""

from __future__ import annotations

import datetime as dt
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_serializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user, require_role
from .db import get_db
from .models import ROLE_ADMIN, ROLES, User

router = APIRouter(prefix="/api/users")


class UserOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: int
    email: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    role: str
    created_at: dt.datetime = Field(alias="createdAt")
    last_seen_at: dt.datetime = Field(alias="lastSeenAt")

    @field_serializer("created_at", "last_seen_at")
    def _as_utc(self, value: dt.datetime) -> str:
        # SQLite hands back naive datetimes even for DateTime(timezone=True), so
        # without this the wire format is an ISO string with no offset and the
        # client cannot tell which zone it is in. Everything stored is UTC.
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.isoformat()


class RoleUpdate(BaseModel):
    role: str


@router.get("/me", response_model=UserOut, response_model_by_alias=True)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("", response_model=List[UserOut], response_model_by_alias=True)
def list_users(
    _: User = Depends(require_role(ROLE_ADMIN)),
    db: Session = Depends(get_db),
) -> List[User]:
    return list(db.scalars(select(User).order_by(User.last_seen_at.desc())))


@router.patch("/{user_id}/role", response_model=UserOut, response_model_by_alias=True)
def set_role(
    user_id: int,
    body: RoleUpdate,
    actor: User = Depends(require_role(ROLE_ADMIN)),
    db: Session = Depends(get_db),
) -> User:
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"unknown role: {body.role}")

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="no such user")

    # An admin demoting themselves can leave a deployment with nobody able to
    # assign roles, recoverable only by editing the database by hand.
    if target.id == actor.id and body.role != ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="an admin cannot remove their own admin role")

    target.role = body.role
    db.commit()
    return target

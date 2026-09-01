"""Database models. One table in 7a: `users`.

Roles live here rather than in Auth0 `app_metadata` because the owner chose a
users table on 2026-09-01. That choice matters beyond storage location: role
changes become an application concern with an audit trail to hang off in 7f,
instead of something only reachable through the Auth0 dashboard.

Personal data held: an Auth0 subject id, an email, a display name and a picture
URL -- teacher identity only. `collaboration_workflow_spec.md` records the
constraint that worksheets contain no student data; nothing here changes that.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

# Additive, exactly as collaboration_workflow_spec.md §2 describes them: a
# HeadTeacher is a Teacher with more powers, an Admin is the one who can hand
# those powers out. Stored as plain strings, not a DB enum -- adding a role to
# a Postgres enum needs a migration that SQLite cannot replay identically, and
# the value set is enforced in Python anyway.
ROLE_TEACHER = "teacher"
ROLE_HEAD_TEACHER = "head_teacher"
ROLE_ADMIN = "admin"
ROLES = (ROLE_TEACHER, ROLE_HEAD_TEACHER, ROLE_ADMIN)


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # The Auth0 `sub` claim, e.g. "google-oauth2|1234567890". This, not email,
    # is the identity: an email can be reassigned by a school's IT department,
    # and Auth0 lets a user change theirs.
    auth0_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320), index=True, default=None)
    name: Mapped[str | None] = mapped_column(String(255), default=None)
    picture: Mapped[str | None] = mapped_column(String(1024), default=None)
    role: Mapped[str] = mapped_column(String(32), default=ROLE_TEACHER)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

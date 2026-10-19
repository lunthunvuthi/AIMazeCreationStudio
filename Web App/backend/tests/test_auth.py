"""Tests for step 7a's login rules.

Two things are being pinned down here. The first is ordinary: protected routes
reject callers without a valid token, and the users table records who signed
in. The second matters more -- the *bypass* that keeps the browser-driven checks
in `scripts/` working must be impossible to reach in production. Those are the
tests that would catch the one mistake in this change that could actually hurt.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from maze_api.auth import Principal, _initial_role
from maze_api.config import DEV_BYPASS_TOKEN, ConfigError, load_settings
from maze_api.main import app
from maze_api.models import ROLE_ADMIN, ROLE_TEACHER

anon = TestClient(app)
signed_in = TestClient(app, headers={"Authorization": f"Bearer {DEV_BYPASS_TOKEN}"})


# --- the gate ------------------------------------------------------------


def test_maze_routes_reject_an_anonymous_caller():
    resp = anon.post("/api/maze/generate", json={"type": "pickaxe", "star": 1})
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


def test_maze_routes_reject_a_token_that_is_not_the_bypass_token():
    resp = anon.post(
        "/api/maze/generate",
        json={"type": "pickaxe", "star": 1},
        headers={"Authorization": "Bearer not-the-dev-token"},
    )
    assert resp.status_code == 401


def test_a_non_bearer_authorization_header_is_rejected():
    resp = anon.post(
        "/api/maze/generate",
        json={"type": "pickaxe", "star": 1},
        headers={"Authorization": f"Basic {DEV_BYPASS_TOKEN}"},
    )
    assert resp.status_code == 401


def test_health_is_public():
    resp = anon.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# --- the users table -----------------------------------------------------


def test_signing_in_records_the_user():
    resp = signed_in.get("/api/users/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == ROLE_TEACHER
    assert body["email"] == "dev-bypass@localhost"
    # Naive timestamps on the wire would leave a client guessing the zone;
    # SQLite drops the offset, so UserOut puts it back.
    assert body["createdAt"].endswith("+00:00")
    assert body["lastSeenAt"].endswith("+00:00")


def test_the_same_subject_is_upserted_not_duplicated():
    first = signed_in.get("/api/users/me").json()
    second = signed_in.get("/api/users/me").json()
    assert first["id"] == second["id"]


def test_listing_users_requires_an_admin():
    assert signed_in.get("/api/users").status_code == 403


def test_role_assignment_requires_an_admin():
    resp = signed_in.patch("/api/users/1/role", json={"role": ROLE_ADMIN})
    assert resp.status_code == 403


def test_bootstrap_admin_email_only_matches_that_address(monkeypatch):
    # Settings is a frozen dataclass, so the module's reference is swapped for a
    # copy rather than mutated in place.
    from dataclasses import replace

    from maze_api import auth

    monkeypatch.setattr(
        auth, "settings", replace(auth.settings, bootstrap_admin_email="head@school.example")
    )
    assert _initial_role(Principal(sub="a", email="Head@School.Example")) == ROLE_ADMIN
    assert _initial_role(Principal(sub="b", email="someone@school.example")) == ROLE_TEACHER
    assert _initial_role(Principal(sub="c", email=None)) == ROLE_TEACHER


# --- the bypass cannot escape into production ----------------------------


def _settings_with(monkeypatch, **env):
    for key in ("APP_ENV", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "CORS_ORIGINS", "DEV_AUTH_BYPASS"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return load_settings()


def test_development_with_no_auth0_falls_back_to_the_bypass(monkeypatch):
    s = _settings_with(monkeypatch)
    assert s.auth_bypass is True
    assert s.auth_configured is False


def test_production_refuses_to_start_without_auth0(monkeypatch):
    with pytest.raises(ConfigError):
        _settings_with(monkeypatch, APP_ENV="production", CORS_ORIGINS="https://example.test")


def test_production_refuses_to_start_without_cors_origins(monkeypatch):
    with pytest.raises(ConfigError):
        _settings_with(
            monkeypatch, APP_ENV="production", AUTH0_DOMAIN="t.auth0.com", AUTH0_AUDIENCE="api"
        )


def test_production_ignores_dev_auth_bypass(monkeypatch):
    s = _settings_with(
        monkeypatch,
        APP_ENV="production",
        AUTH0_DOMAIN="t.auth0.com",
        AUTH0_AUDIENCE="https://api.maze-studio",
        CORS_ORIGINS="https://example.test",
        DEV_AUTH_BYPASS="1",
    )
    assert s.auth_bypass is False


def test_cors_is_never_a_wildcard(monkeypatch):
    dev = _settings_with(monkeypatch)
    assert "*" not in dev.cors_origins
    assert dev.cors_origins

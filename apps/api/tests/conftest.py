from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Base

# No Postgres is available for automated tests in this environment (or in
# CI, generally) — an in-memory SQLite database stands in for it here.
# StaticPool keeps the same in-memory DB alive across the multiple
# connections FastAPI's TestClient opens per request. Real Postgres is
# still the deployment target (docker-compose.yml, DATABASE_URL in .env);
# see the design notes D021 for why the schema (generic JSON with a
# JSONB variant, not JSONB-only) supports both.
_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False)

Base.metadata.create_all(_engine)


def _override_get_session():
    session = _TestSession()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_session] = _override_get_session


@pytest.fixture(autouse=True)
def _clean_database():
    yield
    with _engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


@pytest.fixture(autouse=True)
def _reset_auth_rate_limits():
    # D042 — auth_rate_limit.py's buckets are module-level dicts, shared
    # process-wide by design (same single-process limitation as
    # rate_limit.py/D021). Every test's TestClient hits the endpoints from
    # the same "unknown" IP key, so without a reset the register/login
    # limits trip partway through an unrelated test file just from earlier
    # tests' registrations sharing the bucket. Clear before, not after: a
    # failed test that leaves state behind shouldn't poison the next one.
    from app import auth_rate_limit

    auth_rate_limit._login_ip_attempts.clear()
    auth_rate_limit._login_email_attempts.clear()
    auth_rate_limit._register_ip_attempts.clear()
    # D051 follow-up: the password-reset limiter is per-minute and keyed
    # partly on the caller IP — every TestClient request shares the same
    # "testclient" IP, so without this reset the very first forgot-password
    # call in a test would 429 every later test's forgot-password call.
    auth_rate_limit._reset_ip_last.clear()
    auth_rate_limit._reset_email_last.clear()
    yield


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    # get_settings() is @lru_cache'd now (perf pass — a real API process
    # never needs to re-read/re-parse the root .env file on every single
    # call, which was the previous behavior). That cache must not survive
    # across tests, or the monkeypatch.setenv calls below (and in individual
    # tests) would silently stop taking effect the moment any earlier test
    # populated the cache first. Cleared before each test runs — every
    # monkeypatch.setenv in this file happens before the first request that
    # would actually call get_settings() within a given test, so there is no
    # ordering hazard between this and the env-setting fixtures below.
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _default_to_mock_mode(monkeypatch):
    # Most tests assume mock mode (fast, deterministic, no network/API key
    # needed) — but Settings reads ANALYSIS_MOCK_MODE from the developer's
    # real root .env at call time, and it isn't overridden anywhere else in
    # the test suite. If a developer flips ANALYSIS_MOCK_MODE=false locally
    # to test the real provider (exactly what happened once already — see
    # D024), every "mock mode" test would silently start hitting the real
    # provider instead, and fail in confusing, unrelated-looking ways. Force
    # it back to true by default for every test; the handful of tests that
    # specifically exercise the real-provider failure path call
    # monkeypatch.setenv("ANALYSIS_MOCK_MODE", "false") themselves, which
    # runs after this fixture and correctly overrides it (see
    # _clear_settings_cache above for why that override is still honored
    # now that get_settings() is cached).
    monkeypatch.setenv("ANALYSIS_MOCK_MODE", "true")


@pytest.fixture(autouse=True)
def _default_turnstile_disabled(monkeypatch):
    # Same class of problem as _default_to_mock_mode above (D047): once the
    # user enabled Cloudflare Turnstile in their real .env (TURNSTILE_ENABLED
    # =true, R018), every register/login test began failing with
    # captcha_failed — the TestClient can't solve a real CAPTCHA, and Settings
    # reads TURNSTILE_ENABLED live from that .env. The auth/session tests
    # assume CAPTCHA is off (its disabled-by-default state, captcha.py), so
    # force it off here regardless of the ambient .env. A test that
    # specifically exercises the enabled path can still monkeypatch it back on
    # after this fixture runs.
    monkeypatch.setenv("TURNSTILE_ENABLED", "false")


@pytest.fixture
def db_session():
    """A raw session against the same test database the app uses, for
    assertions that go beyond what the HTTP response exposes (e.g.
    diagnostics rows in analysis_events)."""
    session = _TestSession()
    try:
        yield session
    finally:
        session.close()

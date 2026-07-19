from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

_engine = None
_session_factory = None


def _database_url() -> str:
    settings = get_settings()
    # Falls back to a local SQLite file if DATABASE_URL is unset — keeps the
    # API runnable without Postgres for quick local checks; real dev/deploy
    # should set DATABASE_URL (see docker-compose.yml / .env).
    return settings.database_url or "sqlite:///./scopeforge.db"


def get_engine():
    global _engine
    if _engine is None:
        url = _database_url()
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    return _engine


def get_session_factory() -> sessionmaker:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)
    return _session_factory


def get_session() -> Iterator[Session]:
    """FastAPI dependency. Tests override this entirely (see
    tests/conftest.py) to point at an isolated SQLite database instead of
    the real Postgres instance — this module is never exercised as-is by
    the test suite.
    """
    session_factory = get_session_factory()
    session = session_factory()
    try:
        yield session
    finally:
        session.close()

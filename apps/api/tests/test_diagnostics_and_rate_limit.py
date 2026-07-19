from __future__ import annotations

from fastapi.testclient import TestClient

from app import rate_limit
from app.main import app
from app.models import AnalysisEvent

client = TestClient(app)

VALID_BRIEF = (
    "Build a small marketing website with a contact form, blog, and newsletter signup. "
    "The client wants a clean modern design and needs it hosted on Vercel within four weeks."
)


def test_successful_analysis_logs_a_diagnostic_event(db_session):
    response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF},
        headers={"X-Installation-Id": "diagnostics-test"},
    )
    assert response.status_code == 200
    analysis_id = response.json()["id"]

    event = db_session.query(AnalysisEvent).filter(AnalysisEvent.analysis_id == analysis_id).one_or_none()
    assert event is not None
    assert event.event_type == "analysis_succeeded"
    assert event.status_code == 200
    assert event.installation_id == "diagnostics-test"
    assert event.latency_ms >= 0


def test_failed_analysis_logs_a_diagnostic_event_without_an_analysis_id(monkeypatch, db_session):
    from app import analysis_service
    from app.provider import ProviderError

    def boom(system_prompt: str, user_prompt: str) -> str:
        raise ProviderError("simulated outage")

    monkeypatch.setenv("ANALYSIS_MOCK_MODE", "false")
    monkeypatch.setattr(analysis_service, "call_model", boom)

    response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF},
        headers={"X-Installation-Id": "diagnostics-fail-test"},
    )
    assert response.status_code == 502

    event = (
        db_session.query(AnalysisEvent)
        .filter(AnalysisEvent.installation_id == "diagnostics-fail-test")
        .one_or_none()
    )
    assert event is not None
    assert event.event_type == "analysis_failed"
    assert event.analysis_id is None
    assert event.error_code == "provider_error"
    assert event.status_code == 502


def test_rate_limit_blocks_after_threshold(monkeypatch):
    # Isolate the hourly abuse-rate limiter (rate_limit.py) from the
    # separate monthly plan quota (usage.py, D037/Phase 9) — the two are
    # deliberately independent layers (see the design notes D037), and
    # _MAX_REQUESTS_PER_WINDOW (20) comfortably exceeds Spark's 5/month
    # quota, so without this the quota would trip first and this test would
    # stop actually exercising rate_limit.py at all. Usage-quota behavior
    # itself is covered separately in test_billing.py.
    from app import usage

    monkeypatch.setattr(usage, "enforce_usage_limit", lambda *args, **kwargs: None)

    rate_limit._requests.clear()
    installation_id = "rate-limit-test"
    try:
        for _ in range(rate_limit._MAX_REQUESTS_PER_WINDOW):
            response = client.post(
                "/v1/analyses",
                json={"description": VALID_BRIEF},
                headers={"X-Installation-Id": installation_id},
            )
            assert response.status_code == 200

        blocked = client.post(
            "/v1/analyses",
            json={"description": VALID_BRIEF},
            headers={"X-Installation-Id": installation_id},
        )
        assert blocked.status_code == 429
        assert blocked.json()["detail"]["code"] == "rate_limited"
    finally:
        rate_limit._requests.clear()


def test_database_unavailable_returns_a_clean_503_not_a_500(monkeypatch):
    # When Postgres is down/unreachable (as the dev preflight warns about
    # when `docker compose up -d` hasn't been run), a connection-level
    # OperationalError must surface as a typed 503 the client can degrade on
    # — not an unhandled 500 dumping SQLAlchemy's whole traceback on every
    # /v1/usage poll. Simulate the failure at the point the endpoint touches
    # the DB.
    from sqlalchemy.exc import OperationalError

    from app import usage as usage_module

    def _boom(*args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("connection timeout expired"))

    monkeypatch.setattr(usage_module, "usage_public_for", _boom)

    response = client.get("/v1/usage", headers={"X-Installation-Id": "db-down-check"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "database_unavailable"

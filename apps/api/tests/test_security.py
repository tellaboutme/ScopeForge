from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth import check_password_strength
from app.main import app

# See tests/test_auth.py's docstring on `client` for why TestClient is
# reused rather than recreated per request within a single test — same
# reasoning applies here.


def _fresh_client() -> TestClient:
    return TestClient(app)


# --- D042: password strength --------------------------------------------


def test_check_password_strength_rejects_short_passwords():
    assert check_password_strength("abc123") is not None


def test_check_password_strength_rejects_all_digits():
    assert check_password_strength("12345678") is not None


def test_check_password_strength_rejects_all_letters():
    assert check_password_strength("abcdefgh") is not None


def test_check_password_strength_rejects_common_passwords():
    assert check_password_strength("password123") is not None


def test_check_password_strength_accepts_a_reasonable_password():
    assert check_password_strength("correcthorsebattery1") is None


def test_register_rejects_a_weak_password_with_422():
    # 8+ chars (clears Pydantic's min_length so it reaches our own check),
    # but all letters, no digit — check_password_strength's job to catch.
    client = _fresh_client()
    response = client.post(
        "/v1/auth/register", json={"email": "weak-pw@example.com", "password": "abcdefgh"}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "weak_password"


# --- D042: auth rate limiting ---------------------------------------------


def test_register_rate_limit_blocks_after_the_configured_max(monkeypatch):
    from app import auth_rate_limit

    monkeypatch.setattr(auth_rate_limit, "_REGISTER_IP_MAX", 2)
    client = _fresh_client()

    for i in range(2):
        response = client.post(
            "/v1/auth/register",
            json={"email": f"rl-register-{i}@example.com", "password": "correcthorsebattery1"},
        )
        assert response.status_code == 201, response.text

    blocked = client.post(
        "/v1/auth/register",
        json={"email": "rl-register-over@example.com", "password": "correcthorsebattery1"},
    )
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "too_many_attempts"


def test_login_rate_limit_blocks_after_repeated_wrong_password(monkeypatch):
    from app import auth_rate_limit

    monkeypatch.setattr(auth_rate_limit, "_LOGIN_EMAIL_MAX", 2)
    client = _fresh_client()
    client.post(
        "/v1/auth/register",
        json={"email": "rl-login@example.com", "password": "correcthorsebattery1"},
    )
    fresh_client = _fresh_client()

    for _ in range(2):
        response = fresh_client.post(
            "/v1/auth/login", json={"email": "rl-login@example.com", "password": "wrong-password"}
        )
        assert response.status_code == 401

    blocked = fresh_client.post(
        "/v1/auth/login", json={"email": "rl-login@example.com", "password": "wrong-password"}
    )
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "too_many_attempts"


def test_successful_login_clears_the_rate_limit_bucket(monkeypatch):
    from app import auth_rate_limit

    monkeypatch.setattr(auth_rate_limit, "_LOGIN_EMAIL_MAX", 2)
    client = _fresh_client()
    client.post(
        "/v1/auth/register",
        json={"email": "rl-clear@example.com", "password": "correcthorsebattery1"},
    )
    fresh_client = _fresh_client()

    fresh_client.post("/v1/auth/login", json={"email": "rl-clear@example.com", "password": "wrong-password"})
    ok = fresh_client.post(
        "/v1/auth/login", json={"email": "rl-clear@example.com", "password": "correcthorsebattery1"}
    )
    assert ok.status_code == 200

    # Bucket was cleared on success, so another wrong attempt right after
    # shouldn't already be sitting at the limit.
    retry = fresh_client.post(
        "/v1/auth/login", json={"email": "rl-clear@example.com", "password": "wrong-password"}
    )
    assert retry.status_code == 401


# --- D042: CAPTCHA (Turnstile) --------------------------------------------


def test_captcha_is_a_noop_when_turnstile_disabled():
    # turnstile_enabled defaults to False — register/login should succeed
    # with no turnstile_token at all, exactly like before D042.
    client = _fresh_client()
    response = client.post(
        "/v1/auth/register", json={"email": "no-captcha@example.com", "password": "correcthorsebattery1"}
    )
    assert response.status_code == 201


def test_register_fails_captcha_when_enabled_and_no_token_given(monkeypatch):
    monkeypatch.setenv("TURNSTILE_ENABLED", "true")
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    client = _fresh_client()
    response = client.post(
        "/v1/auth/register", json={"email": "captcha-fail@example.com", "password": "correcthorsebattery1"}
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "captcha_failed"


def test_register_fails_closed_when_turnstile_enabled_without_a_secret_key(monkeypatch):
    monkeypatch.setenv("TURNSTILE_ENABLED", "true")
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "")
    client = _fresh_client()
    response = client.post(
        "/v1/auth/register",
        json={
            "email": "captcha-nosecret@example.com",
            "password": "correcthorsebattery1",
            "turnstileToken": "some-token",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "captcha_failed"


def test_register_succeeds_when_turnstile_verify_call_succeeds(monkeypatch):
    import httpx

    monkeypatch.setenv("TURNSTILE_ENABLED", "true")
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")

    class _FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"success": True}

    def _fake_post(url, data=None, timeout=None):
        assert data["secret"] == "test-secret"
        assert data["response"] == "good-token"
        return _FakeResponse()

    monkeypatch.setattr(httpx, "post", _fake_post)

    client = _fresh_client()
    response = client.post(
        "/v1/auth/register",
        json={
            "email": "captcha-ok@example.com",
            "password": "correcthorsebattery1",
            "turnstileToken": "good-token",
        },
    )
    assert response.status_code == 201


# --- D042: email verification ---------------------------------------------


def test_new_accounts_start_unverified():
    client = _fresh_client()
    body = client.post(
        "/v1/auth/register", json={"email": "unverified@example.com", "password": "correcthorsebattery1"}
    ).json()
    assert body["emailVerified"] is False


def test_verify_email_with_an_unknown_token_returns_400():
    client = _fresh_client()
    response = client.post("/v1/auth/verify-email", json={"token": "not-a-real-token"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_token"


def test_verify_email_marks_the_account_verified(monkeypatch, db_session):
    from app import main as main_module
    from app.models import User

    captured: dict[str, str] = {}

    def _capture(session, user):
        # Piggyback on the real function so create_verification_token still
        # runs (that's the raw token we need), just capture it instead of
        # depending on send_verification_email actually reaching Resend
        # (RESEND_API_KEY is blank in tests, so it's already a no-op —
        # this just gets us the raw token to complete the flow).
        from app.auth import create_verification_token

        raw_token = create_verification_token(session, user)
        captured["token"] = raw_token
        session.commit()

    monkeypatch.setattr(main_module, "_send_verification_email", _capture)

    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "verify-me@example.com", "password": "correcthorsebattery1"}
    )
    assert "token" in captured

    response = client.post("/v1/auth/verify-email", json={"token": captured["token"]})
    assert response.status_code == 200
    assert response.json()["emailVerified"] is True

    user = db_session.query(User).filter(User.email == "verify-me@example.com").one()
    assert user.email_verified_at is not None


def test_verify_email_token_cannot_be_reused(monkeypatch):
    from app import main as main_module

    captured: dict[str, str] = {}

    def _capture(session, user):
        from app.auth import create_verification_token

        captured["token"] = create_verification_token(session, user)
        session.commit()

    monkeypatch.setattr(main_module, "_send_verification_email", _capture)

    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "verify-once@example.com", "password": "correcthorsebattery1"}
    )

    first = client.post("/v1/auth/verify-email", json={"token": captured["token"]})
    assert first.status_code == 200

    second = client.post("/v1/auth/verify-email", json={"token": captured["token"]})
    assert second.status_code == 400
    assert second.json()["detail"]["code"] == "invalid_token"


def test_resend_verification_requires_auth():
    client = _fresh_client()
    response = client.post("/v1/auth/resend-verification")
    assert response.status_code == 401


def test_resend_verification_is_a_noop_for_an_already_verified_account(monkeypatch, db_session):
    from datetime import datetime, timezone

    from app import main as main_module
    from app.models import User

    sent = {"count": 0}
    original = main_module._send_verification_email

    def _counting(session, user):
        sent["count"] += 1
        original(session, user)

    monkeypatch.setattr(main_module, "_send_verification_email", _counting)

    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "already-verified@example.com", "password": "correcthorsebattery1"}
    )
    assert sent["count"] == 1  # the registration call itself

    user = db_session.query(User).filter(User.email == "already-verified@example.com").one()
    user.email_verified_at = datetime.now(timezone.utc)
    db_session.commit()

    response = client.post("/v1/auth/resend-verification")
    assert response.status_code == 204
    assert sent["count"] == 1  # unchanged — no second email for an already-verified account


# --- D042: active sessions --------------------------------------------------


def test_sessions_list_requires_auth():
    client = _fresh_client()
    response = client.get("/v1/auth/sessions")
    assert response.status_code == 401


def test_sessions_list_shows_the_current_session_marked_current():
    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "sessions-current@example.com", "password": "correcthorsebattery1"}
    )
    response = client.get("/v1/auth/sessions")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["isCurrent"] is True


def test_sessions_list_shows_multiple_devices_and_only_one_current():
    email = "sessions-multi@example.com"
    password = "correcthorsebattery1"
    primary = _fresh_client()
    primary.post("/v1/auth/register", json={"email": email, "password": password})

    secondary = _fresh_client()
    secondary.post("/v1/auth/login", json={"email": email, "password": password})

    rows = primary.get("/v1/auth/sessions").json()
    assert len(rows) == 2
    assert sum(1 for row in rows if row["isCurrent"]) == 1


def test_revoke_a_specific_session_signs_it_out():
    email = "sessions-revoke@example.com"
    password = "correcthorsebattery1"
    primary = _fresh_client()
    primary.post("/v1/auth/register", json={"email": email, "password": password})

    secondary = _fresh_client()
    secondary.post("/v1/auth/login", json={"email": email, "password": password})
    assert secondary.get("/v1/auth/me").status_code == 200

    rows = primary.get("/v1/auth/sessions").json()
    other_session_id = next(row["id"] for row in rows if not row["isCurrent"])

    delete_response = primary.delete(f"/v1/auth/sessions/{other_session_id}")
    assert delete_response.status_code == 204

    # The revoked device's cookie no longer maps to a live session.
    assert secondary.get("/v1/auth/me").status_code == 401
    # The revoking device's own session is untouched.
    assert primary.get("/v1/auth/me").status_code == 200


def test_revoke_unknown_session_id_is_404():
    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "sessions-404@example.com", "password": "correcthorsebattery1"}
    )
    response = client.delete("/v1/auth/sessions/sess_does_not_exist")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "session_not_found"


def test_revoke_other_sessions_keeps_the_current_one_alive():
    email = "sessions-revoke-others@example.com"
    password = "correcthorsebattery1"
    primary = _fresh_client()
    primary.post("/v1/auth/register", json={"email": email, "password": password})

    secondary = _fresh_client()
    secondary.post("/v1/auth/login", json={"email": email, "password": password})
    third = _fresh_client()
    third.post("/v1/auth/login", json={"email": email, "password": password})

    response = primary.delete("/v1/auth/sessions")
    assert response.status_code == 200
    assert response.json()["revoked"] == 2

    assert primary.get("/v1/auth/me").status_code == 200
    assert secondary.get("/v1/auth/me").status_code == 401
    assert third.get("/v1/auth/me").status_code == 401


def test_a_user_cannot_revoke_another_users_session():
    client_a = _fresh_client()
    client_a.post(
        "/v1/auth/register", json={"email": "user-a@example.com", "password": "correcthorsebattery1"}
    )
    rows_a = client_a.get("/v1/auth/sessions").json()
    session_id_a = rows_a[0]["id"]

    client_b = _fresh_client()
    client_b.post(
        "/v1/auth/register", json={"email": "user-b@example.com", "password": "correcthorsebattery1"}
    )
    response = client_b.delete(f"/v1/auth/sessions/{session_id_a}")
    assert response.status_code == 404  # scoped lookup — never leaks that the id exists under another account

    # user A's session is still alive.
    assert client_a.get("/v1/auth/me").status_code == 200


# --- D051: password reset ---------------------------------------------------


def _register_and_request_reset(monkeypatch, db_session, email: str, password: str = "correcthorsebattery1"):
    """Registers a user, triggers /v1/auth/forgot-password, and returns
    (client, raw_reset_token). The raw token only ever lives in the emailed
    link, so we capture it by patching main.send_password_reset_email (a
    no-op in tests anyway — RESEND_API_KEY is blank) and parsing the URL,
    mirroring how the verification tests capture their token.

    D058: forgot-password only mints/sends a token for a *verified* account
    now (see test_forgot_password_does_not_send_for_an_unverified_account
    below, which covers that gate directly) — every test that exercises the
    reset-token flow itself (expiry, reuse, revocation, ...) needs a
    verified account first, same as marking a row verified directly in
    test_resend_verification_is_a_noop_for_an_already_verified_account.
    """
    from datetime import datetime, timezone

    from app import main as main_module
    from app.models import User

    captured: dict[str, str] = {}

    def _capture(to, reset_url):
        captured["token"] = reset_url.split("token=", 1)[1]
        return True

    monkeypatch.setattr(main_module, "send_password_reset_email", _capture)

    client = _fresh_client()
    client.post("/v1/auth/register", json={"email": email, "password": password})

    user = db_session.query(User).filter(User.email == email.strip().lower()).one()
    user.email_verified_at = datetime.now(timezone.utc)
    db_session.commit()

    response = client.post("/v1/auth/forgot-password", json={"email": email})
    assert response.status_code == 204
    assert "token" in captured
    return client, captured["token"]


def test_forgot_password_is_204_for_an_unknown_email(monkeypatch):
    # No account enumeration — an unregistered address gets the same 204 as
    # a real one, and no reset email is attempted.
    from app import main as main_module

    sent = {"count": 0}

    def _capture(to, reset_url):
        sent["count"] += 1
        return True

    monkeypatch.setattr(main_module, "send_password_reset_email", _capture)
    client = _fresh_client()
    response = client.post("/v1/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 204
    assert sent["count"] == 0


def test_reset_password_changes_the_password(monkeypatch, db_session):
    email = "reset-me@example.com"
    client, token = _register_and_request_reset(monkeypatch, db_session, email, password="correcthorsebattery1")

    response = client.post("/v1/auth/reset-password", json={"token": token, "password": "brandnewsecret9"})
    assert response.status_code == 204

    stale = _fresh_client()
    old = stale.post("/v1/auth/login", json={"email": email, "password": "correcthorsebattery1"})
    assert old.status_code == 401

    fresh = _fresh_client()
    new = fresh.post("/v1/auth/login", json={"email": email, "password": "brandnewsecret9"})
    assert new.status_code == 200


def test_reset_password_revokes_existing_sessions(monkeypatch, db_session):
    client, token = _register_and_request_reset(monkeypatch, db_session, "reset-revokes@example.com")
    assert client.get("/v1/auth/me").status_code == 200

    response = client.post("/v1/auth/reset-password", json={"token": token, "password": "brandnewsecret9"})
    assert response.status_code == 204

    assert client.get("/v1/auth/me").status_code == 401


def test_reset_password_with_an_unknown_token_is_400():
    client = _fresh_client()
    response = client.post("/v1/auth/reset-password", json={"token": "not-a-real-token", "password": "brandnewsecret9"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_token"


def test_reset_password_token_cannot_be_reused(monkeypatch, db_session):
    client, token = _register_and_request_reset(monkeypatch, db_session, "reset-once@example.com")

    first = client.post("/v1/auth/reset-password", json={"token": token, "password": "brandnewsecret9"})
    assert first.status_code == 204

    second = client.post("/v1/auth/reset-password", json={"token": token, "password": "anothersecret8"})
    assert second.status_code == 400
    assert second.json()["detail"]["code"] == "invalid_token"


def test_reset_password_rejects_a_weak_new_password(monkeypatch, db_session):
    email = "reset-weak@example.com"
    client, token = _register_and_request_reset(monkeypatch, db_session, email, password="correcthorsebattery1")

    response = client.post("/v1/auth/reset-password", json={"token": token, "password": "12345678"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "weak_password"

    ok = client.post("/v1/auth/reset-password", json={"token": token, "password": "brandnewsecret9"})
    assert ok.status_code == 204


def test_reset_password_with_an_expired_token_is_400(monkeypatch, db_session):
    from datetime import datetime, timedelta, timezone

    from app.auth import hash_token
    from app.models import PasswordResetToken

    client, token = _register_and_request_reset(monkeypatch, db_session, "reset-expired@example.com")

    row = db_session.query(PasswordResetToken).filter(PasswordResetToken.token_hash == hash_token(token)).one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    response = client.post("/v1/auth/reset-password", json={"token": token, "password": "brandnewsecret9"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_token"


def test_requesting_a_new_reset_link_invalidates_the_previous_one(monkeypatch, db_session):
    from datetime import datetime, timezone

    from app import auth_rate_limit
    from app import main as main_module
    from app.models import User

    # This test needs two back-to-back reset requests; the per-minute limiter
    # (below) would 429 the second, so relax its window to 0 here — it's
    # covered on its own in test_forgot_password_is_rate_limited_to_one_a_minute.
    monkeypatch.setattr(auth_rate_limit, "_RESET_WINDOW_SECONDS", 0)

    email = "reset-latest@example.com"
    tokens: list[str] = []

    def _capture(to, reset_url):
        tokens.append(reset_url.split("token=", 1)[1])
        return True

    monkeypatch.setattr(main_module, "send_password_reset_email", _capture)

    client = _fresh_client()
    client.post("/v1/auth/register", json={"email": email, "password": "correcthorsebattery1"})

    user = db_session.query(User).filter(User.email == email).one()
    user.email_verified_at = datetime.now(timezone.utc)
    db_session.commit()

    client.post("/v1/auth/forgot-password", json={"email": email})
    client.post("/v1/auth/forgot-password", json={"email": email})
    assert len(tokens) == 2

    first = client.post("/v1/auth/reset-password", json={"token": tokens[0], "password": "brandnewsecret9"})
    assert first.status_code == 400

    second = client.post("/v1/auth/reset-password", json={"token": tokens[1], "password": "brandnewsecret9"})
    assert second.status_code == 204


def test_forgot_password_is_rate_limited_to_one_a_minute(monkeypatch, db_session):
    from datetime import datetime, timezone

    from app import main as main_module
    from app.models import User

    monkeypatch.setattr(main_module, "send_password_reset_email", lambda to, reset_url: True)
    client = _fresh_client()
    client.post(
        "/v1/auth/register",
        json={"email": "reset-rl@example.com", "password": "correcthorsebattery1"},
    )

    user = db_session.query(User).filter(User.email == "reset-rl@example.com").one()
    user.email_verified_at = datetime.now(timezone.utc)
    db_session.commit()

    # D058: the rate limiter (auth_rate_limit) runs before the account/
    # verification lookup, and fires regardless of whether a token actually
    # gets sent (see forgot_password's docstring) — so this test's "does the
    # 2nd request 429" intent is independent of the account being verified.
    # Verified anyway above so this test doesn't silently start depending on
    # the (separately tested) unverified-skips-sending behavior.
    first = client.post("/v1/auth/forgot-password", json={"email": "reset-rl@example.com"})
    assert first.status_code == 204

    blocked = client.post("/v1/auth/forgot-password", json={"email": "reset-rl@example.com"})
    assert blocked.status_code == 429
    detail = blocked.json()["detail"]
    assert detail["code"] == "reset_rate_limited"
    # Carries an exact countdown (both in the body and the standard header) so
    # the UI can render "resend available in 0:NN".
    assert 0 < detail["retryAfter"] <= 60
    assert 0 < int(blocked.headers["retry-after"]) <= 60


def test_forgot_password_rate_limit_does_not_enumerate_accounts(monkeypatch):
    # An unregistered email must trip the same per-minute limiter as a real
    # one — otherwise a 204-then-204 vs. 204-then-429 difference would leak
    # which addresses exist. Both requests below are for an email with no
    # account; the second must still be a 429.
    from app import main as main_module

    monkeypatch.setattr(main_module, "send_password_reset_email", lambda to, reset_url: True)
    client = _fresh_client()

    first = client.post("/v1/auth/forgot-password", json={"email": "ghost@example.com"})
    assert first.status_code == 204

    blocked = client.post("/v1/auth/forgot-password", json={"email": "ghost@example.com"})
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "reset_rate_limited"


# --- D058: mandatory email verification to use the service ------------------

_GATE_BRIEF = (
    "Build a small marketing website with a contact form, blog, and newsletter signup. "
    "The client wants a clean modern design and needs it hosted on Vercel within four weeks."
)

_GATE_PROPOSAL_PAYLOAD = {
    "sourceDescription": "Marketing website with a blog and newsletter signup, built with Next.js.",
    "platform": "Direct",
    "verdictSummary": "Clear scope, manageable timeline, and reasonable economics for this brief.",
    "budgetRecommended": 2500,
    "currency": "USD",
    "durationMinDays": 14,
    "durationMaxDays": 28,
    "techStack": ["Next.js", "Stripe"],
}


def _verify(db_session, email: str) -> None:
    from datetime import datetime, timezone

    from app.models import User

    user = db_session.query(User).filter(User.email == email).one()
    user.email_verified_at = datetime.now(timezone.utc)
    db_session.commit()


def test_unverified_signed_in_user_cannot_create_an_analysis():
    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "gate-unverified@example.com", "password": "correcthorsebattery1"}
    )
    response = client.post("/v1/analyses", json={"description": _GATE_BRIEF})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "email_verification_required"


def test_verified_signed_in_user_can_create_an_analysis(db_session):
    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "gate-verified@example.com", "password": "correcthorsebattery1"}
    )
    _verify(db_session, "gate-verified@example.com")

    response = client.post("/v1/analyses", json={"description": _GATE_BRIEF})
    assert response.status_code == 200


def test_anonymous_no_signup_usage_is_unaffected_by_the_verification_gate():
    # D004: anonymous, no-account usage stays fully available — the D058
    # gate (main._require_verified_email) only fires when `user is not
    # None`, so a request carrying no session cookie at all must still
    # succeed exactly as before.
    client = _fresh_client()
    response = client.post(
        "/v1/analyses",
        json={"description": _GATE_BRIEF},
        headers={"X-Installation-Id": "gate-anon-inst"},
    )
    assert response.status_code == 200


def test_unverified_signed_in_user_cannot_regenerate_a_proposal():
    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "gate-proposal-unverified@example.com", "password": "correcthorsebattery1"}
    )
    response = client.post("/v1/proposals/regenerate", json=_GATE_PROPOSAL_PAYLOAD)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "email_verification_required"


def test_verified_signed_in_user_can_regenerate_a_proposal(db_session):
    client = _fresh_client()
    client.post(
        "/v1/auth/register", json={"email": "gate-proposal-verified@example.com", "password": "correcthorsebattery1"}
    )
    _verify(db_session, "gate-proposal-verified@example.com")

    response = client.post("/v1/proposals/regenerate", json=_GATE_PROPOSAL_PAYLOAD)
    assert response.status_code == 200


def test_forgot_password_does_not_send_for_an_unverified_account(monkeypatch):
    # D058: an unverified account's recovery path is to verify first, not
    # reset a password on an unproven address — forgot-password must stay
    # 204 (D051's no-enumeration guarantee) but skip minting/sending a token.
    from app import main as main_module

    sent = {"count": 0}

    def _capture(to, reset_url):
        sent["count"] += 1
        return True

    monkeypatch.setattr(main_module, "send_password_reset_email", _capture)

    client = _fresh_client()
    client.post(
        "/v1/auth/register",
        json={"email": "gate-reset-unverified@example.com", "password": "correcthorsebattery1"},
    )

    response = client.post("/v1/auth/forgot-password", json={"email": "gate-reset-unverified@example.com"})
    assert response.status_code == 204
    assert sent["count"] == 0

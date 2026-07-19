from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

# TestClient keeps cookies across requests within one instance (like a real
# browser session), which is exactly what session-cookie auth needs to be
# testable end-to-end without manually threading a Set-Cookie header.
client = TestClient(app)


def _register(email: str = "auth-test@example.com", password: str = "correcthorsebattery1", **extra) -> dict:
    response = client.post(
        "/v1/auth/register",
        json={"email": email, "password": password, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_register_creates_a_spark_subscription_by_default():
    body = _register()
    assert body["subscription"]["tier"] == "spark"
    assert body["subscription"]["status"] == "active"
    assert body["usage"]["analysesLimit"] == 5
    assert body["usage"]["analysesUsed"] == 0


def test_register_normalizes_email_and_rejects_duplicates():
    _register(email="Dup@Example.com")
    response = client.post(
        "/v1/auth/register",
        json={"email": "dup@example.com", "password": "correcthorsebattery1"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "email_taken"


def test_register_sets_a_session_cookie_that_me_accepts():
    _register(email="cookie-test@example.com")
    response = client.get("/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "cookie-test@example.com"


def test_me_without_a_session_is_401():
    fresh_client = TestClient(app)  # no cookies at all
    response = fresh_client.get("/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"


def test_login_with_wrong_password_is_401_and_generic():
    _register(email="wrongpw@example.com", password="correcthorsebattery1")
    fresh_client = TestClient(app)
    response = fresh_client.post(
        "/v1/auth/login", json={"email": "wrongpw@example.com", "password": "not-the-password"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_credentials"


def test_login_with_unknown_email_gives_the_same_generic_error():
    # Same error/code as a wrong password — distinguishing them would let a
    # caller enumerate which emails are registered (see auth.py comment).
    fresh_client = TestClient(app)
    response = fresh_client.post(
        "/v1/auth/login", json={"email": "nobody-here@example.com", "password": "whatever12345"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_credentials"


def test_login_succeeds_with_correct_credentials_and_is_case_insensitive_email():
    _register(email="caseinsensitive@example.com", password="correcthorsebattery1")
    fresh_client = TestClient(app)
    response = fresh_client.post(
        "/v1/auth/login",
        json={"email": "CaseInsensitive@Example.com", "password": "correcthorsebattery1"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "caseinsensitive@example.com"


def test_logout_clears_the_session_so_me_becomes_401():
    fresh_client = TestClient(app)
    fresh_client.post(
        "/v1/auth/register",
        json={"email": "logout-test@example.com", "password": "correcthorsebattery1"},
    )
    assert fresh_client.get("/v1/auth/me").status_code == 200

    logout_response = fresh_client.post("/v1/auth/logout")
    assert logout_response.status_code == 204

    assert fresh_client.get("/v1/auth/me").status_code == 401


def test_password_is_never_stored_in_plaintext(db_session):
    from app.models import User

    _register(email="hash-test@example.com", password="correcthorsebattery1")
    user = db_session.query(User).filter(User.email == "hash-test@example.com").one()
    assert user.password_hash != "correcthorsebattery1"
    assert user.password_hash.startswith("$argon2")

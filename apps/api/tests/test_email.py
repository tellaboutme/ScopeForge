from __future__ import annotations

import logging

from app import email as email_module


class _FakeResponse:
    def __init__(self, status_code: int, text: str = "") -> None:
        self.status_code = status_code
        self.text = text


def test_send_email_is_a_noop_without_a_key(monkeypatch):
    # Env var overrides the ambient .env's real key (config.get_settings reads
    # env vars ahead of the dotenv file, uncached). No key -> never call out.
    monkeypatch.setenv("RESEND_API_KEY", "")
    calls = {"n": 0}

    def _fake_post(*args, **kwargs):
        calls["n"] += 1
        return _FakeResponse(200)

    monkeypatch.setattr(email_module.httpx, "post", _fake_post)
    assert email_module.send_email("someone@example.com", "s", "<p>h</p>") is False
    assert calls["n"] == 0  # request was never attempted


def test_send_email_surfaces_resend_rejection_instead_of_swallowing_it(monkeypatch, caplog):
    # The exact failure the user hit: a real key is set, but Resend's shared
    # sandbox sender rejects any recipient that isn't the account owner (403).
    # The reason must now be visible in the logs, not silently discarded.
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "ScopeForge <onboarding@resend.dev>")

    def _fake_post(*args, **kwargs):
        return _FakeResponse(403, '{"statusCode":403,"message":"You can only send testing emails to your own email address."}')

    monkeypatch.setattr(email_module.httpx, "post", _fake_post)

    with caplog.at_level(logging.ERROR, logger="scopeforge.email"):
        result = email_module.send_email("not-the-owner@example.com", "s", "<p>h</p>")

    assert result is False
    messages = [record.getMessage() for record in caplog.records]
    assert any("Resend rejected the email" in message for message in messages)
    # The targeted domain-verification hint is emitted for the shared sender.
    assert any("resend.com/domains" in message for message in messages)


def test_send_email_returns_true_on_success(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(email_module.httpx, "post", lambda *args, **kwargs: _FakeResponse(200, '{"id":"email_123"}'))
    assert email_module.send_email("owner@example.com", "s", "<p>h</p>") is True


def test_send_email_returns_false_when_resend_is_unreachable(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")

    def _boom(*args, **kwargs):
        raise email_module.httpx.ConnectError("connection refused")

    monkeypatch.setattr(email_module.httpx, "post", _boom)
    assert email_module.send_email("owner@example.com", "s", "<p>h</p>") is False

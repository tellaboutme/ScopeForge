from __future__ import annotations

import logging

import httpx

from .config import get_settings

logger = logging.getLogger("scopeforge.captcha")

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile(token: str | None, remote_ip: str | None) -> bool:
    """Verifies a Cloudflare Turnstile token server-side (D042).

    Mirrors ANALYSIS_MOCK_MODE's shape: when TURNSTILE_ENABLED is false
    (the default — no Cloudflare account needed for local dev/tests), this
    always returns True so the CAPTCHA check is a no-op. When enabled, it
    fails closed: a missing token, a missing secret key, or any network/
    verification error all count as "not verified" rather than silently
    passing — a broken CAPTCHA integration should block signups/logins,
    not quietly disable itself.
    """
    settings = get_settings()
    if not settings.turnstile_enabled:
        return True

    if not token:
        return False

    if not settings.turnstile_secret_key:
        logger.error("TURNSTILE_ENABLED=true but TURNSTILE_SECRET_KEY is not set — failing closed.")
        return False

    payload = {"secret": settings.turnstile_secret_key, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        response = httpx.post(_VERIFY_URL, data=payload, timeout=10.0)
        response.raise_for_status()
        result = response.json()
    except Exception:
        logger.exception("Turnstile verification request failed — treating as not verified.")
        return False

    return bool(result.get("success"))

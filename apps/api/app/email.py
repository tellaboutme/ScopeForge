from __future__ import annotations

import logging

import httpx

from .config import get_settings

logger = logging.getLogger("scopeforge.email")

_RESEND_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> bool:
    """Sends a transactional email via Resend's REST API (D042 — chosen for
    the best free ceiling among Resend/Postmark/Brevo/Mailtrap as of
    2026-07: 3,000 emails/month, permanently free, no card required).

    RESEND_API_KEY is left blank in .env.example on purpose (the user
    supplies their own — get one free at resend.com). Without a key set,
    this logs a clear warning and returns False rather than raising:
    registration/login/sessions all still work without email verification
    (D042 keeps it non-blocking, matching D004/D037's "accounts are
    opt-in, zero friction" rule) — a missing mail-provider key should
    degrade the verification feature specifically, not break sign-up.
    """
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY is not set — skipping email send (subject=%r, to=%s).", subject, to)
        return False

    try:
        response = httpx.post(
            _RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from_address, "to": [to], "subject": subject, "html": html},
            timeout=10.0,
        )
    except Exception:
        # Never let a mail-provider outage break the request that triggered
        # the send (registration, resend-verification) — same "log and
        # continue" posture as _safe_log_event in main.py.
        logger.exception("Could not reach Resend to send email (subject=%r, to=%s).", subject, to)
        return False

    if response.status_code >= 400:
        # Previously this went through response.raise_for_status(), whose
        # exception message does NOT include Resend's JSON body — so the
        # actual reason a send failed (unverified domain, restricted sandbox
        # sender, bad key) was completely invisible, and the email just
        # silently never arrived. Log the real response body so the cause is
        # diagnosable from the server log.
        logger.error(
            "Resend rejected the email (status=%s, from=%r, to=%s): %s",
            response.status_code,
            settings.email_from_address,
            to,
            response.text,
        )
        # By far the most common cause in practice: Resend's shared sandbox
        # sender (onboarding@resend.dev) only delivers to the email address
        # that owns the Resend account. Sending to any other recipient is
        # rejected (403) and never appears in the Resend dashboard at all.
        if response.status_code == 403 and "resend.dev" in settings.email_from_address:
            logger.error(
                "Resend's shared sender (%s) only delivers to the address that owns your "
                "Resend account. To email real users, verify a domain at "
                "https://resend.com/domains and set EMAIL_FROM_ADDRESS to an address on it.",
                settings.email_from_address,
            )
        return False

    return True


def send_verification_email(to: str, verification_url: str) -> bool:
    subject = "Confirm your ScopeForge email"
    html = f"""
      <p>Confirm your email address to finish setting up your ScopeForge account.</p>
      <p><a href="{verification_url}">Confirm email address</a></p>
      <p>This link expires in 24 hours. If you didn't create a ScopeForge account, you can ignore this email.</p>
    """.strip()
    return send_email(to, subject, html)


def send_password_reset_email(to: str, reset_url: str) -> bool:
    subject = "Reset your ScopeForge password"
    html = f"""
      <p>We received a request to reset the password for your ScopeForge account.</p>
      <p><a href="{reset_url}">Choose a new password</a></p>
      <p>This link expires in 1 hour and can be used once. If you didn't request a password reset, you can ignore this email — your password won't change.</p>
    """.strip()
    return send_email(to, subject, html)

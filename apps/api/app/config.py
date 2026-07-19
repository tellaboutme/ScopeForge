from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The repo's shared .env lives at the monorepo root, not inside apps/api —
# resolve it relative to this file so it works regardless of the process cwd
# (uvicorn from apps/api, pytest from apps/api, or a root-level dev script).
_ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    frontend_url: str = "http://localhost:3000"
    model_config = SettingsConfigDict(env_file=str(_ROOT_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    ai_provider: str = "groq"
    ai_base_url: str = "https://api.groq.com/openai/v1"
    ai_api_key: str = ""
    ai_model: str = "openai/gpt-oss-120b"
    # Matches the flag already scaffolded in .env/.env.example. True by
    # default so local dev and tests never call the real provider (and never
    # spend API quota) unless explicitly turned off.
    analysis_mock_mode: bool = True
    database_url: str | None = None
    # Phase 9 (D037): the session cookie's Secure attribute. Defaults to
    # False because local dev (dev.bat/scripts/dev.mjs) and this project's
    # own test suite both run over plain http://localhost — a Secure=True
    # cookie is silently dropped by both real browsers and httpx's test
    # client over http (not a bug in either, that's the Secure attribute
    # working as designed), which would make login *look* like it worked
    # (200 response) while the session never actually persists. Real
    # deployments behind HTTPS should set SESSION_COOKIE_SECURE=true.
    session_cookie_secure: bool = False

    # D042 — Cloudflare Turnstile CAPTCHA on register/login. Mirrors
    # ANALYSIS_MOCK_MODE's ergonomics: disabled by default so local dev and
    # the test suite never need real Cloudflare keys to run. When enabled
    # without a secret key configured, requests fail closed (see
    # captcha.py) rather than silently skipping verification.
    turnstile_enabled: bool = False
    turnstile_secret_key: str = ""

    # D042 — outbound email (verification links) via Resend's REST API
    # (resend.com — 3,000 free emails/month, no card required, chosen for
    # best free-tier ceiling among Resend/Postmark/Brevo/Mailtrap as of
    # 2026-07). Left blank on purpose — the user provides their own key.
    # When empty, email.py logs a clear warning and skips the send rather
    # than crashing registration — the account itself is still created.
    # D058 note: registration succeeding is NOT the same as the account
    # being usable anymore. Since D058, a signed-in account cannot run an
    # analysis or regenerate a proposal until its email is verified
    # (main._require_verified_email) — anonymous, no-signup usage (D004) is
    # unaffected, but a *registered* account with no working outbound email
    # (this key blank, or Resend rejecting the send — see R020/D057) has no
    # way to receive that verification link at all and is effectively
    # locked out of the product until it's fixed. Set this before real users
    # register, or they'll hit a dead end.
    resend_api_key: str = ""
    # Resend's shared sandbox sender works immediately with no domain setup,
    # but can only deliver to the email address on the Resend account itself
    # until a custom domain is verified in the Resend dashboard. Switch this
    # once a real sending domain (e.g. "ScopeForge <noreply@yourdomain.com>")
    # is verified there.
    email_from_address: str = "ScopeForge <onboarding@resend.dev>"
    app_base_url: str = "http://localhost:3000"


def get_settings() -> Settings:
    # Deliberately not cached: this is a low-traffic local API, and tests
    # rely on re-reading env vars (via monkeypatch.setenv) on every call.
    return Settings()

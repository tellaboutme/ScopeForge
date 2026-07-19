from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnalysisRecord(Base):
    """Maps to the `analyses` table per docs/DATA_MODEL.md's recommended
    fields. `analysis_json` stores the full validated ProjectAnalysis
    (camelCase, by_alias — see schemas.py's CamelModel / D018) so the record
    can be reconstructed exactly via repository.record_to_project_analysis().
    Uses JSONB on Postgres, plain JSON elsewhere (SQLite in tests — see
    the design notes D021) via SQLAlchemy's `.with_variant`.
    """

    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    installation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Nullable, additive (D037/Phase 9): analyses created while signed in are
    # scoped to the account instead of the browser, so they follow the user
    # across devices. Anonymous analyses (the vast majority pre-Phase-9, and
    # still fully supported) keep installation_id-only scoping — the two
    # columns are not mutually exclusive by schema, but repository.py only
    # ever sets one or the other per request depending on auth state.
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    source_title: Mapped[str | None] = mapped_column(String(140), nullable=True)
    source_platform: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_description: Mapped[str] = mapped_column(String(30000))
    analysis_json: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(24), default="complete")
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AnalysisEvent(Base):
    """Diagnostics per docs/ARCHITECTURE.md ("analysis_events for
    diagnostics"). One row per POST /v1/analyses attempt, success or
    failure — lets a future ops view answer "why did this fail" and "how
    often" without external logging infrastructure. Never stores the
    AI_API_KEY or the full provider response, only enough to diagnose.
    """

    __tablename__ = "analysis_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    installation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # String(40), not String(24) (widened post-D037, see the risk log R012):
    # D033's "proposal_regenerate_succeeded"/"proposal_regenerate_failed"
    # values are 27/30 chars, both over the original 24-char cap. SQLite (the
    # only DB the test suite ever ran against) silently truncates nothing and
    # enforces no VARCHAR length at all, so this was invisible until a real
    # Postgres deployment raised StringDataRightTruncation on every proposal
    # regeneration. 40 leaves headroom for future event_type values too.
    event_type: Mapped[str] = mapped_column(String(40))  # "analysis_succeeded" | "analysis_failed" | "proposal_regenerate_succeeded" | "proposal_regenerate_failed"
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(80))
    status_code: Mapped[int] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class User(Base):
    """Phase 9 (D037) — real accounts, additive alongside the pre-existing
    anonymous installation_id flow (D004), not a replacement for it. `id` is
    a `user_<uuid4hex>` string to match the existing id style used across
    this codebase (AnalysisRecord.id, etc.) rather than a raw UUID column.
    `password_hash` is an argon2id hash (see auth.py) — never a plaintext or
    reversibly-encrypted password, and never logged (mirrors the AI_API_KEY
    handling rule already established for this project).
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Stored lowercased at write time (auth.py) so lookups are a plain
    # equality match — avoids needing citext/a functional index for an MVP
    # with a small user base.
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # D042: set once the address behind the token in EmailVerificationToken
    # has been confirmed. Nullable/unverified by default — verification is
    # non-blocking (the account is fully usable immediately after
    # registration, matching D004/D037's "accounts are opt-in, zero
    # friction" rule) rather than gating login or analysis creation. Its
    # practical value today is proving the freelancer actually owns the
    # address before any future password-reset/notification flow trusts it.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailVerificationToken(Base):
    """D042 — same shape/reasoning as UserSession's token handling: only the
    SHA-256 hash of the raw token is ever persisted, the raw token exists
    only in the (mock-sent, see email.py) verification link. `consumed_at`
    marks a token used rather than deleting the row, so a reused/expired
    link can return a specific, honest error instead of a generic 404.
    """

    __tablename__ = "email_verification_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PasswordResetToken(Base):
    """D051 — password-reset link token. Deliberately identical in shape and
    reasoning to EmailVerificationToken (D042): only the SHA-256 hash of the
    raw token is ever persisted, the raw token lives only in the (Resend-sent,
    see email.py) reset link, and `consumed_at` marks a token spent rather
    than deleting the row so a reused link returns a specific "invalid or
    expired" message instead of a bare 404. Kept as its own table rather than
    reusing EmailVerificationToken so the two concerns can have independent
    TTLs and lifecycles (a reset token is shorter-lived — see auth.py) and so
    a bug in one flow can never accidentally consume the other's tokens.
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSession(Base):
    """Server-side, revocable session (D037) — deliberately not a JWT (see
    the design notes D037 for the reasoning). `token_hash` is the SHA-256
    hex digest of a random 32-byte token; only the hash is ever persisted,
    the raw token exists only in the httpOnly cookie sent to the browser and
    in-memory for the single request that creates it. Named UserSession
    (not Session) to avoid any confusion with SQLAlchemy's own Session type
    imported throughout this codebase.
    """

    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Subscription(Base):
    """One row per user (D037) — `tier` is one of billing.PLAN_CATALOG's
    keys ("spark" | "forge" | "furnace"). Every user gets a Subscription row
    at registration time (defaults to "spark", status "active", no period
    end — the free tier never expires), so calling code can always assume
    a subscription exists for a signed-in user rather than treating "no
    row" as an implicit free tier.

    mock_stripe_customer_id / mock_stripe_subscription_id are locally
    generated identifiers (billing.py) that only ever exist inside this
    database — no real Stripe account or API key is involved anywhere
    (see D037: this is mock billing, not real billing).
    """

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, index=True)
    tier: Mapped[str] = mapped_column(String(16), default="spark")
    status: Mapped[str] = mapped_column(String(16), default="active")  # "active" | "canceled"
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # D039: cancellation now takes effect at current_period_end, not
    # immediately (overrides D037's original "simpler and more honest"
    # immediate-downgrade design, per explicit user request). `status` stays
    # "active" and `tier` stays unchanged while this is true — the actual
    # downgrade to spark is applied lazily the next time the subscription is
    # read (billing.apply_pending_downgrade()), once current_period_end has
    # passed. See the design notes D039.
    cancel_at_period_end: Mapped[bool] = mapped_column(default=False)
    # Masked card representation captured at checkout-confirm time (D039) —
    # only ever the last 4 digits and a sniffed brand name, never the full
    # card number (CheckoutConfirmRequest's fields are still validated for
    # shape only and otherwise discarded, unchanged from D037). Lets
    # /settings show "which card is on file" and offer to unlink it.
    card_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    card_brand: Mapped[str | None] = mapped_column(String(20), nullable=True)
    mock_stripe_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mock_stripe_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class CheckoutSession(Base):
    """A pending mock-checkout attempt (D037) — created by
    POST /v1/billing/checkout, consumed by
    POST /v1/billing/checkout/{id}/confirm. Expires (`status` moves to
    "expired") if never confirmed, exactly like a real payment-provider
    checkout session would, so the mock behaves realistically rather than
    being a bare tier-switch button.
    """

    __tablename__ = "checkout_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    tier: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # "pending" | "confirmed" | "expired"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UsageCounter(Base):
    """DB-backed monthly quota tracking (D037) — resolves R007's "in-memory
    only" limitation for the product-facing plan limit specifically (the
    separate hourly abuse-rate limiter in rate_limit.py stays in-memory on
    purpose; it's a burst backstop, not the real quota, and losing a few
    minutes of burst history on restart is harmless).

    Identity is polymorphic on purpose: `owner_type` is "user" or
    "installation" so both signed-in and anonymous usage share one table and
    one enforcement code path (usage.py) instead of two parallel systems.
    `period_start` is always the first day of the calendar month (UTC) the
    row covers — a new row is created for each new month rather than
    resetting a counter in place, which gives a free, zero-cost usage
    history for later (e.g. a "your usage over time" chart) without any
    extra design work now.
    """

    __tablename__ = "usage_counters"
    __table_args__ = (UniqueConstraint("owner_type", "owner_id", "period_start", name="uq_usage_counter_period"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_type: Mapped[str] = mapped_column(String(16))  # "user" | "installation"
    owner_id: Mapped[str] = mapped_column(String(64), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    analyses_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

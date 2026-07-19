from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import CheckoutSession, Subscription
from .schemas import CheckoutSessionPublic, PlanPublic, PlanTier, SubscriptionPublic

# Single source of truth for tier pricing/limits/copy — both the plan-catalog
# endpoint (feeds the /billing pricing cards) and usage.py's quota
# enforcement read from this dict, so the numbers shown to a user and the
# numbers actually enforced can never drift apart. See the design notes
# D037 for the naming rationale (Spark/Forge/Furnace — a forge motif
# matching the "ScopeForge" product name, not a generic Free/Pro/Enterprise
# ladder).
# The first feature bullet of spark/forge used to hardcode its own copy of
# monthly_analyses ("5 analyses per month" next to monthly_analyses=5,
# "60 analyses per month" next to monthly_analyses=60) — two independent
# literals that happened to agree, with nothing enforcing that they would
# keep agreeing if the limit ever changed. Derived from the field itself
# below instead, so there is exactly one number per tier to edit.
_SPARK_MONTHLY_ANALYSES = 5
_FORGE_MONTHLY_ANALYSES = 60

PLAN_CATALOG: dict[PlanTier, PlanPublic] = {
    "spark": PlanPublic(
        tier="spark",
        name="Spark",
        tagline="Try it out, no card required.",
        price_cents=0,
        monthly_analyses=_SPARK_MONTHLY_ANALYSES,
        features=[
            f"{_SPARK_MONTHLY_ANALYSES} analyses per month",
            "Full report: score, pricing, timeline, risks, proposal",
            "Local history, no account required",
        ],
    ),
    "forge": PlanPublic(
        tier="forge",
        name="Forge",
        tagline="For freelancers scoping every week.",
        price_cents=1200,
        monthly_analyses=_FORGE_MONTHLY_ANALYSES,
        features=[
            f"{_FORGE_MONTHLY_ANALYSES} analyses per month",
            "Everything in Spark",
            "Cross-device history (account-backed)",
            "Priority support",
        ],
    ),
    "furnace": PlanPublic(
        tier="furnace",
        name="Furnace",
        tagline="For agencies and high-volume scoping.",
        price_cents=2900,
        monthly_analyses=None,
        features=[
            "Unlimited analyses",
            "Everything in Forge",
            "Early access to new report sections",
        ],
    ),
}

_CHECKOUT_TTL_MINUTES = 30

# Tier ordering for upgrade/downgrade comparisons. Keyed by plain str (not
# the PlanTier Literal) so it can be indexed with a Subscription.tier column
# value without a cast. Monotonic with price_cents (0 < 1200 < 2900) — kept
# as an explicit map rather than comparing prices so the intent ("furnace is
# above forge is above spark") is stated directly and survives any future
# price change.
_TIER_RANK: dict[str, int] = {"spark": 0, "forge": 1, "furnace": 2}


def _reject_downgrade(current_tier: str, target_tier: str) -> None:
    """Guards against paying to move to a *lower* paid tier. Downgrades are
    not allowed through checkout at all (explicit product decision) — the
    only supported way down is cancelling to the free Spark plan at period
    end (cancel_subscription), which is a separate, deliberate flow. Same
    tier (a renewal) and any strict upgrade are both permitted.
    """
    if _TIER_RANK[target_tier] < _TIER_RANK[current_tier]:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "downgrade_not_allowed",
                "message": (
                    "You can't switch to a lower-priced plan. Cancel to the free Spark "
                    "plan first, then choose the plan you want."
                ),
            },
        )

# D039: sniffed from the card number's leading digit(s) — the same
# recognizable BIN-prefix convention every real card form uses to show a
# brand icon while typing, applied here only to a mock, well-known test
# number (still no real card-network validation, see CheckoutConfirmRequest's
# docstring). Order matters — check longer/more specific prefixes first.
_CARD_BRAND_PREFIXES: list[tuple[str, tuple[str, ...]]] = [
    ("American Express", ("34", "37")),
    ("Visa", ("4",)),
    ("Mastercard", ("51", "52", "53", "54", "55", "2221", "2720")),
    ("Discover", ("6011", "65")),
]


def _sniff_card_brand(card_number: str) -> str:
    digits = "".join(ch for ch in card_number if ch.isdigit())
    for brand, prefixes in _CARD_BRAND_PREFIXES:
        if digits.startswith(prefixes):
            return brand
    return "Card"


def list_plans() -> list[PlanPublic]:
    return list(PLAN_CATALOG.values())


def get_plan(tier: PlanTier) -> PlanPublic:
    plan = PLAN_CATALOG.get(tier)
    if plan is None:
        raise HTTPException(status_code=422, detail={"code": "invalid_tier", "message": f"Unknown plan: {tier}"})
    return plan


def apply_pending_downgrade(session: Session, subscription: Subscription) -> Subscription:
    """Lazily applies a scheduled cancel-at-period-end downgrade (D039) once
    `current_period_end` has actually passed. There is no background job
    infrastructure in this project (or sandbox) to fire this the instant the
    period ends, so it is instead checked every time a subscription is read
    — every call site that returns subscription state to the client
    (_user_public in main.py, the cancel/unlink-card endpoints, and
    usage.py's tier resolution for quota enforcement) runs this first, which
    in practice means the downgrade takes effect on the very next request
    after the deadline rather than being genuinely time-triggered. Acceptable
    for a mock billing system with no real recurring charge to actually stop.
    """
    if not subscription.cancel_at_period_end or subscription.current_period_end is None:
        return subscription

    period_end = subscription.current_period_end
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)

    if period_end <= datetime.now(timezone.utc):
        subscription.tier = "spark"
        subscription.status = "active"
        subscription.cancel_at_period_end = False
        subscription.current_period_end = None
        subscription.card_last4 = None
        subscription.card_brand = None
        session.flush()

    return subscription


def subscription_public(subscription: Subscription) -> SubscriptionPublic:
    return SubscriptionPublic(
        tier=subscription.tier,  # type: ignore[arg-type]
        status=subscription.status,  # type: ignore[arg-type]
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
        card_last4=subscription.card_last4,
        card_brand=subscription.card_brand,
    )


def create_checkout_session(session: Session, user_id: str, tier: PlanTier) -> CheckoutSessionPublic:
    """Mock Stripe Checkout Session creation — entirely local, no network
    call, no real Stripe account. Mirrors the *shape* of a real Checkout
    Session (an id, an expiry, a redirect target) so the frontend flow reads
    like a real integration, without pretending any money moves (D037).
    """
    plan = get_plan(tier)
    if plan.price_cents == 0:
        raise HTTPException(
            status_code=422,
            detail={"code": "free_tier_checkout", "message": "Spark is free — no checkout needed to switch to it."},
        )

    # Block a checkout that would move the user *down* a tier. Resolve any
    # pending cancel-at-period-end first so the comparison is against the
    # tier that's actually in effect, not a stale one about to lapse.
    subscription = session.scalar(select(Subscription).where(Subscription.user_id == user_id))
    if subscription is not None:
        apply_pending_downgrade(session, subscription)
        _reject_downgrade(subscription.tier, tier)

    now = datetime.now(timezone.utc)
    record = CheckoutSession(
        id=f"cs_mock_{uuid.uuid4().hex[:20]}",
        user_id=user_id,
        tier=tier,
        status="pending",
        created_at=now,
        expires_at=now + timedelta(minutes=_CHECKOUT_TTL_MINUTES),
    )
    session.add(record)
    session.flush()

    return CheckoutSessionPublic(
        id=record.id,
        tier=tier,
        price_cents=plan.price_cents,
        plan_name=plan.name,
        expires_at=record.expires_at,
    )


def confirm_checkout_session(
    session: Session, user_id: str, checkout_id: str, *, card_number: str
) -> Subscription:
    """Activates the subscription tied to a pending checkout session. Called
    once the (mock) payment form is submitted — see
    apps/web/src/app/billing/checkout/[sessionId]/page.tsx. `card_number` is
    used only to derive a display-safe last-4/brand pair for /settings
    (D039) — the full number is never persisted, matching
    CheckoutConfirmRequest's existing docstring (D037): nothing here is ever
    sent anywhere, charged, or stored beyond this single request, beyond
    that four-digit display fragment.
    """
    record = session.scalar(
        select(CheckoutSession).where(CheckoutSession.id == checkout_id, CheckoutSession.user_id == user_id)
    )
    if record is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Checkout session not found."})
    if record.status != "pending":
        raise HTTPException(
            status_code=422,
            detail={"code": "checkout_not_pending", "message": f"This checkout session is already {record.status}."},
        )
    expires_at = record.expires_at if record.expires_at.tzinfo else record.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        record.status = "expired"
        session.flush()
        raise HTTPException(
            status_code=422,
            detail={"code": "checkout_expired", "message": "This checkout session expired. Start a new upgrade."},
        )

    record.status = "confirmed"

    subscription = session.scalar(select(Subscription).where(Subscription.user_id == user_id))
    if subscription is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Subscription not found."})

    # Defense in depth: create_checkout_session already blocks starting a
    # downgrade, but a stale pending session (created before an upgrade) must
    # not be confirmable into a lower tier either. Compare against the tier
    # actually in effect right now.
    apply_pending_downgrade(session, subscription)
    _reject_downgrade(subscription.tier, record.tier)

    now = datetime.now(timezone.utc)
    subscription.tier = record.tier
    subscription.status = "active"
    subscription.current_period_end = now + timedelta(days=30)
    subscription.cancel_at_period_end = False  # a fresh/renewed checkout always clears any prior pending cancellation
    digits = "".join(ch for ch in card_number if ch.isdigit())
    subscription.card_last4 = digits[-4:] if len(digits) >= 4 else None
    subscription.card_brand = _sniff_card_brand(card_number)
    if not subscription.mock_stripe_customer_id:
        subscription.mock_stripe_customer_id = f"cus_mock_{uuid.uuid4().hex[:16]}"
    subscription.mock_stripe_subscription_id = f"sub_mock_{uuid.uuid4().hex[:16]}"
    session.flush()
    return subscription


def cancel_subscription(session: Session, user_id: str) -> Subscription:
    """Schedules a downgrade to Spark at the end of the current billing
    period (D039) — overrides D037's original "immediate downgrade, simpler
    and more honest for a mock system" design, per explicit user request to
    model real subscription-cancellation semantics (e.g. a plan started
    1.1.2026 should stay active through 1.2.2026, not end the moment
    cancellation is requested). The actual downgrade is applied lazily by
    apply_pending_downgrade() once current_period_end passes. Also the
    target of /settings' "unlink card" action (D039) — unlinking the only
    payment method on a paid plan has the same real-world consequence as
    cancelling: the plan can't renew, so it should end at the same period
    boundary rather than immediately. If there's nothing to schedule (already
    on Spark, or no period end to schedule against), this is a no-op.
    """
    subscription = session.scalar(select(Subscription).where(Subscription.user_id == user_id))
    if subscription is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Subscription not found."})

    if subscription.tier == "spark" or subscription.current_period_end is None:
        subscription.cancel_at_period_end = False
        session.flush()
        return subscription

    subscription.cancel_at_period_end = True
    # tier/status/current_period_end are left untouched on purpose — the
    # plan and its benefits stay fully active until the period actually ends.
    session.flush()
    return subscription


def resume_subscription(session: Session, user_id: str) -> Subscription:
    """Undoes a pending cancel-at-period-end before the period actually
    ends (D039) — the natural counterpart action to cancel_subscription(),
    surfaced wherever the pending-cancellation state is shown (billing page,
    settings).
    """
    subscription = session.scalar(select(Subscription).where(Subscription.user_id == user_id))
    if subscription is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Subscription not found."})

    apply_pending_downgrade(session, subscription)
    subscription.cancel_at_period_end = False
    session.flush()
    return subscription


def unlink_card(session: Session, user_id: str) -> Subscription:
    """/settings' "unlink card" action (D039) — removes the displayed
    payment method immediately and schedules the subscription to end at the
    current period's boundary (see cancel_subscription's docstring for the
    full reasoning). Free (Spark) accounts have no card to unlink; this is
    a no-op for them beyond ensuring the fields stay clear.
    """
    subscription = session.scalar(select(Subscription).where(Subscription.user_id == user_id))
    if subscription is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Subscription not found."})

    subscription.card_last4 = None
    subscription.card_brand = None
    session.flush()
    return cancel_subscription(session, user_id)

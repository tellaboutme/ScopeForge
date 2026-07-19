from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .billing import apply_pending_downgrade, get_plan
from .models import Subscription, UsageCounter, User
from .schemas import PlanTier, UsagePublic

OwnerType = Literal["user", "installation", "ip"]

# Anonymous usage (no account) is capped at the Spark limit — the same
# ceiling a free account gets, just tracked per-browser (installation_id)
# instead of per-account, since there's no login to attach it to. Preserves
# the no-signup entry point (D004/PROJECT_SPEC.md) rather than requiring an
# account just to try the product — see the design notes D037.
_ANONYMOUS_TIER: PlanTier = "spark"


def _period_start(today: date | None = None) -> date:
    d = today or datetime.now(timezone.utc).date()
    return d.replace(day=1)


def hash_ip(ip: str) -> str:
    """One-way hash of the caller's IP (D039, see the risk log R014) —
    used only as an opaque secondary quota key, never stored or logged in
    reversible form. sha256 truncated to 32 hex chars is plenty of
    collision-resistance for this purpose (a rate-limit bucket key, not a
    security credential) and keeps the owner_id column comfortably under its
    64-char cap.
    """
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:32]


def resolve_owner(user: User | None, installation_id: str | None) -> tuple[OwnerType, str] | None:
    if user is not None:
        return "user", user.id
    if installation_id:
        return "installation", installation_id
    return None


def _resolve_tier(session: Session, owner_type: OwnerType, owner_id: str) -> PlanTier:
    if owner_type != "user":
        return _ANONYMOUS_TIER
    subscription = session.scalar(select(Subscription).where(Subscription.user_id == owner_id))
    if subscription is None:
        return _ANONYMOUS_TIER
    # D039: a subscription scheduled to cancel at period end (see billing.py)
    # should stop counting against its old, higher limit the moment the
    # period actually ends, even if the user hasn't hit /v1/auth/me since
    # then to trigger the lazy downgrade there — quota enforcement reads the
    # subscription independently of that endpoint.
    apply_pending_downgrade(session, subscription)
    return subscription.tier  # type: ignore[return-value]


def _get_or_create_counter(session: Session, owner_type: OwnerType, owner_id: str) -> UsageCounter:
    period_start = _period_start()
    counter = session.scalar(
        select(UsageCounter).where(
            UsageCounter.owner_type == owner_type,
            UsageCounter.owner_id == owner_id,
            UsageCounter.period_start == period_start,
        )
    )
    if counter is None:
        counter = UsageCounter(owner_type=owner_type, owner_id=owner_id, period_start=period_start, analyses_count=0)
        session.add(counter)
        session.flush()
    return counter


def enforce_usage_limit(
    session: Session, user: User | None, installation_id: str | None, client_ip: str | None = None
) -> None:
    """Raises 402 once the caller's plan quota for the current calendar
    month is used up. Separate from rate_limit.py's hourly abuse guard
    (still applied on every request regardless) — this is the actual
    product-facing plan limit tied to a subscription tier, not a burst-abuse
    backstop. See the design notes D037; resolves R007 for the
    product-facing limit specifically (rate_limit.py's own in-memory-only
    limitation is unchanged and documented as acceptable for its narrower
    burst-guard purpose).

    D039 hardening (see the risk log R014): `installation_id` is a
    client-generated, client-persisted value (localStorage) — clearing it
    (or opening a private window) has always been enough to reset the
    per-browser quota to zero, which is a real, trivially-discoverable abuse
    path for a product whose entire cost driver is metered model calls. For
    anonymous callers only, this now also checks a second counter keyed by a
    one-way hash of the caller's IP address (never the raw IP — see
    hash_ip()) and blocks once *either* counter is exhausted. This isn't
    bulletproof (shared IPs, VPNs, mobile carrier NAT can all cause
    false-positive throttling for unrelated users on the same address) —
    that tradeoff is deliberate and documented, not an oversight: a
    same-IP false positive costs a legitimate user a wait/upgrade prompt,
    while no IP check at all costs the product unlimited free generations
    per abuser. Signed-in users are unaffected (their quota is keyed on
    their account, which is not spoofable this way).
    """
    owner = resolve_owner(user, installation_id)
    if owner is None:
        return  # No identity at all to key a quota on — rate_limit.py's own "anonymous" bucket still applies.
    owner_type, owner_id = owner

    tier = _resolve_tier(session, owner_type, owner_id)
    plan = get_plan(tier)
    if plan.monthly_analyses is None:
        return  # Furnace: unlimited

    counter = _get_or_create_counter(session, owner_type, owner_id)
    used = counter.analyses_count

    ip_counter = None
    if owner_type == "installation" and client_ip:
        ip_counter = _get_or_create_counter(session, "ip", hash_ip(client_ip))
        used = max(used, ip_counter.analyses_count)

    if used >= plan.monthly_analyses:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "usage_limit_reached",
                "message": (
                    f"You've used all {plan.monthly_analyses} analyses on the {plan.name} plan this month. "
                    "Upgrade for more."
                ),
            },
        )


def increment_usage(
    session: Session, user: User | None, installation_id: str | None, client_ip: str | None = None
) -> None:
    """Called only after a successful analysis — mirrors the existing
    "don't penalize failed generations" pattern already used elsewhere in
    this codebase (analysis_service's retry logic, the persistence
    best-effort save). Increments both the installation-id and IP-hash
    counters for anonymous callers (D039) so the two stay in sync and
    enforce_usage_limit's max() comparison stays meaningful.
    """
    owner = resolve_owner(user, installation_id)
    if owner is None:
        return
    owner_type, owner_id = owner
    counter = _get_or_create_counter(session, owner_type, owner_id)
    counter.analyses_count += 1

    if owner_type == "installation" and client_ip:
        ip_counter = _get_or_create_counter(session, "ip", hash_ip(client_ip))
        ip_counter.analyses_count += 1


def usage_public_for(
    session: Session, user: User | None, installation_id: str | None, client_ip: str | None = None
) -> UsagePublic | None:
    """Generalized version of the old user-only usage_public() (D039) — same
    shape, but works for anonymous callers too (keyed on installation_id),
    which the new sidebar usage plaque needs (apps/web's
    AppSidebar/MobileNav, restoring a real version of the fake D030-removed
    DEMO_USAGE widget). Returns None only when there is truly no identity to
    report on (should not happen in practice — the frontend always sends
    X-Installation-Id).

    D048: the reported `analyses_used` MUST match what enforce_usage_limit
    actually blocks on. For anonymous callers that's max(installation counter,
    IP-hash counter) — the IP-hash counter (D039) accumulates across every
    installation_id seen from the same IP, so it can be higher than the
    current browser's own counter (e.g. after clearing local data, using a
    private window, or several browsers behind one IP). Reporting only the
    installation counter made the sidebar plaque under-count and contradict
    the 402 "you've used all N" the user actually hit. Mirror the same
    max() here (guarded to anonymous callers with a client_ip, exactly like
    enforce_usage_limit) so the plaque and the enforcement never disagree.
    """
    owner = resolve_owner(user, installation_id)
    if owner is None:
        return None
    owner_type, owner_id = owner
    tier = _resolve_tier(session, owner_type, owner_id)
    plan = get_plan(tier)
    counter = _get_or_create_counter(session, owner_type, owner_id)
    used = counter.analyses_count

    if owner_type == "installation" and client_ip:
        ip_counter = _get_or_create_counter(session, "ip", hash_ip(client_ip))
        used = max(used, ip_counter.analyses_count)

    return UsagePublic(
        period_start=counter.period_start.isoformat(),
        analyses_used=used,
        analyses_limit=plan.monthly_analyses,
        tier=tier,
    )


def usage_public(session: Session, user: User) -> UsagePublic:
    result = usage_public_for(session, user, None)
    assert result is not None  # a signed-in user always resolves to an owner
    return result

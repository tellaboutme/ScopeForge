from __future__ import annotations

import math
import time
from collections import defaultdict, deque

from fastapi import HTTPException

# D042 — brute-force / credential-stuffing protection for /v1/auth/login and
# /v1/auth/register. Same in-memory fixed-window shape as rate_limit.py
# (D021/R007) and the same documented limitation: single-process only,
# resets on restart, no cross-worker coordination. That tradeoff is
# unchanged from the existing limiter and revisited together with it (see
# the backlog) rather than solved twice, differently, in one pass.
#
# Two independent buckets, not one:
#   - per-IP: a blunt backstop against a single source hammering the
#     endpoint (works even if the attacker tries many different emails).
#   - per-email (login only): stops one target *account* being brute-forced
#     even from a rotating pool of IPs (a botnet, a proxy list) — a
#     narrower, tighter window than the IP bucket because a legitimate user
#     mistyping their own password a few times should never be the one who
#     trips it.
_LOGIN_IP_WINDOW_SECONDS = 15 * 60
_LOGIN_IP_MAX = 15
_LOGIN_EMAIL_WINDOW_SECONDS = 15 * 60
_LOGIN_EMAIL_MAX = 6
_REGISTER_IP_WINDOW_SECONDS = 60 * 60
_REGISTER_IP_MAX = 8

# Password reset: at most one /v1/auth/forgot-password request per minute,
# per email and per originating IP. A reset request triggers an outbound
# email to a real inbox, so one-a-minute is plenty for a genuine "I forgot
# my password" and tight enough that it can't be used to spam someone's
# inbox or probe the endpoint in a loop. Unlike the login/register buckets
# (a rolling count over a long window) this is a single "last request" clock
# so we can hand the UI an exact seconds-until-next-allowed for a live
# countdown — see check_password_reset_allowed.
_RESET_WINDOW_SECONDS = 60

_login_ip_attempts: dict[str, deque[float]] = defaultdict(deque)
_login_email_attempts: dict[str, deque[float]] = defaultdict(deque)
_register_ip_attempts: dict[str, deque[float]] = defaultdict(deque)
_reset_ip_last: dict[str, float] = {}
_reset_email_last: dict[str, float] = {}

_TOO_MANY_ATTEMPTS = HTTPException(
    status_code=429,
    detail={"code": "too_many_attempts", "message": "Too many attempts. Wait a while and try again."},
)


def _prune(bucket: deque[float], now: float, window_seconds: int) -> None:
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()


def check_login_allowed(ip: str | None, email: str) -> None:
    """Raises 429 without recording an attempt — call before verifying the
    password, so a request that's already over the limit doesn't also
    spend an argon2 verify cycle (a cheap way to blunt CPU-exhaustion
    attempts riding along with the brute-force ones).
    """
    now = time.monotonic()
    ip_key = ip or "unknown"
    _prune(_login_ip_attempts[ip_key], now, _LOGIN_IP_WINDOW_SECONDS)
    _prune(_login_email_attempts[email], now, _LOGIN_EMAIL_WINDOW_SECONDS)

    if len(_login_ip_attempts[ip_key]) >= _LOGIN_IP_MAX or len(_login_email_attempts[email]) >= _LOGIN_EMAIL_MAX:
        raise _TOO_MANY_ATTEMPTS


def record_login_attempt(ip: str | None, email: str) -> None:
    """Records one attempt in both buckets — called once per login request
    regardless of whether it succeeds, right after check_login_allowed
    passes. A successful login still counts: it costs nothing to a
    legitimate user (they're never near either limit) and keeps the
    accounting simple (one call site, no separate "only count failures"
    branch to get wrong).
    """
    now = time.monotonic()
    _login_ip_attempts[ip or "unknown"].append(now)
    _login_email_attempts[email].append(now)


def clear_login_attempts(ip: str | None, email: str) -> None:
    """Called on a successful login — resets both buckets so a legitimate
    user who mistyped their password a couple of times isn't left sitting
    near the limit for the next 15 minutes just because of that.
    """
    _login_ip_attempts.pop(ip or "unknown", None)
    _login_email_attempts.pop(email, None)


def enforce_register_rate_limit(ip: str | None) -> None:
    now = time.monotonic()
    key = ip or "unknown"
    bucket = _register_ip_attempts[key]
    _prune(bucket, now, _REGISTER_IP_WINDOW_SECONDS)

    if len(bucket) >= _REGISTER_IP_MAX:
        raise _TOO_MANY_ATTEMPTS

    bucket.append(now)


def check_password_reset_allowed(ip: str | None, email: str) -> None:
    """Raises 429 if a password-reset request for this email/IP came in less
    than a minute ago, without recording anything (record separately, after
    this passes). The 429 carries a `retryAfter` (whole seconds until the
    next request is allowed) in both the JSON detail and a standard
    `Retry-After` header, so the client can render an exact live countdown
    instead of a vague "try again later". Checked for every request — hit or
    miss — before the account lookup, so it can't be used to tell a
    registered email from an unregistered one (D051's no-enumeration
    invariant).
    """
    now = time.monotonic()
    ip_key = ip or "unknown"
    last = max(_reset_ip_last.get(ip_key, 0.0), _reset_email_last.get(email, 0.0))
    elapsed = now - last
    if last and elapsed < _RESET_WINDOW_SECONDS:
        retry_after = max(1, math.ceil(_RESET_WINDOW_SECONDS - elapsed))
        raise HTTPException(
            status_code=429,
            detail={
                "code": "reset_rate_limited",
                "message": "You can only request a reset link once a minute. Please wait a moment.",
                "retryAfter": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )


def record_password_reset_attempt(ip: str | None, email: str) -> None:
    """Stamps 'now' as the last reset request for this email and IP — call
    once, right after check_password_reset_allowed passes, for every request
    regardless of whether the email turned out to belong to a real account.
    """
    now = time.monotonic()
    _reset_ip_last[ip or "unknown"] = now
    _reset_email_last[email] = now

import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from . import billing, repository, usage
from .analysis_service import AnalysisFailure, regenerate_proposal, run_analysis
from .auth import (
    check_password_strength,
    clear_session,
    consume_verification_token,
    create_password_reset_token,
    create_session,
    create_verification_token,
    get_current_user_optional,
    get_current_user_required,
    hash_password,
    hash_token,
    list_sessions,
    normalize_email,
    reset_password_with_token,
    revoke_other_sessions,
    revoke_session,
    verify_password,
)
from .auth_rate_limit import (
    check_login_allowed,
    check_password_reset_allowed,
    clear_login_attempts,
    enforce_register_rate_limit,
    record_login_attempt,
    record_password_reset_attempt,
)
from .captcha import verify_turnstile
from .config import get_settings
from .db import get_session
from .email import send_password_reset_email, send_verification_email
from .models import Subscription, User
from .rate_limit import enforce_rate_limit
from .schemas import (
    AnalysisCreate,
    CheckoutConfirmRequest,
    CheckoutRequest,
    CheckoutSessionPublic,
    LoginRequest,
    MIN_BRIEF_WORDS,
    PlanPublic,
    ProjectAnalysis,
    Proposal,
    ProposalRegenerateRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequestRequest,
    RegisterRequest,
    SubscriptionPublic,
    UsagePublic,
    UserPublic,
    UserSessionPublic,
    VerifyEmailRequest,
)

logger = logging.getLogger("scopeforge.main")

app = FastAPI(title="ScopeForge API", version="0.1.0")

settings = get_settings()

# D042: SESSION_COOKIE_SECURE is off by default so local http://localhost
# dev keeps working (see config.py's comment on session_cookie_secure) —
# but that same default silently ships an insecure cookie if someone
# forgets to flip it in a real deployment. A loud startup-time log line
# (impossible to miss in any deploy platform's log viewer) is cheap
# insurance against that specific, easy-to-forget footgun; it can't force
# the right value since this process has no way to know if it's actually
# behind HTTPS.
if not settings.session_cookie_secure:
    logger.warning(
        "SESSION_COOKIE_SECURE is false — session cookies are NOT marked Secure and will be sent over plain "
        "HTTP. This is expected for local dev (http://localhost) but must be set to true for any real "
        "deployment behind HTTPS, or session tokens are interceptable on the network."
    )

# D060: ANALYSIS_MOCK_MODE defaults to true (config.py) so a fresh local
# clone works with zero external keys — but that exact same default is what
# makes it possible to ship a real deployment that silently serves the
# canned, deterministic mock.py report (whose own verdict text literally
# says "This is a deterministic mock result") to every real user, with
# nothing in the UI making that obvious unless someone reads the report
# text closely. A loud startup-time log line, same pattern as
# SESSION_COOKIE_SECURE above, makes this impossible to miss in any deploy
# platform's log viewer the moment the service boots.
if settings.analysis_mock_mode:
    logger.warning(
        "ANALYSIS_MOCK_MODE is true — every analysis and proposal regeneration returns a canned, deterministic "
        "mock result instead of calling the real AI provider. This is expected for local dev with no AI_API_KEY, "
        "but must be set to false with a valid AI_API_KEY for any real deployment, or every user sees fake output."
    )

# Anonymous usage (D004) still works with zero friction — see
# installation_id_header below — but Phase 9 (D037) added real accounts on
# top, which need cookies to cross the browser<->API origin boundary, so
# allow_credentials is now True and the origin allowlist stays explicit
# (required by the CORS spec once credentials are allowed — "*" is invalid
# alongside allow_credentials=True). The two localhost origins always work
# for local dev regardless of config; APP_BASE_URL adds the real deployed
# frontend's origin on top (D059 — this used to be a separate FRONTEND_URL
# setting, merged into APP_BASE_URL since both meant the same thing; see
# config.py's comment on app_base_url).

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", settings.app_base_url.rstrip("/")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _short_db_error(exc: OperationalError) -> str:
    """One concise line for the log, not SQLAlchemy's full multi-frame dump."""
    orig = getattr(exc, "orig", None)
    text = str(orig) if orig is not None else str(exc)
    first_line = text.splitlines()[0] if text else exc.__class__.__name__
    return first_line[:200]


@app.exception_handler(OperationalError)
async def _database_unavailable_handler(request: Request, exc: OperationalError) -> JSONResponse:
    """A connection-level database failure (Postgres down/unreachable, as when
    `docker compose up -d` hasn't been run — the dev preflight warns about
    exactly this) would otherwise surface as an unhandled 500 dumping
    SQLAlchemy's entire traceback on *every* request, including the sidebar's
    /v1/usage poll that fires on every page load. Turn it into one concise
    WARN line and a clean, typed 503 the client can degrade on, instead. This
    is the read-path complement to _safe_log_event/save_analysis's best-effort
    write handling (D026/R009) — same principle: a DB outage is an
    infrastructure condition to report cleanly, not an exception to crash on.
    """
    logger.warning(
        "Database unavailable handling %s %s: %s", request.method, request.url.path, _short_db_error(exc)
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": {
                "code": "database_unavailable",
                "message": "The database is temporarily unavailable. Please try again shortly.",
            }
        },
    )


def installation_id_header(x_installation_id: str | None = Header(default=None, alias="X-Installation-Id")) -> str | None:
    """Anonymous per-browser scoping (D004) — the web app generates and
    persists a random id locally (src/lib/installation.ts) and sends it on
    every request. Still fully supported post-Phase-9 (D037): signing in is
    opt-in, not required to use the product. When a request is both
    authenticated and carries an installation id, the account takes
    precedence for data scoping (repository.py's _scope()) — the
    installation id is effectively only meaningful for anonymous requests.
    """
    return x_installation_id


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _failure_status_code(code: str) -> int:
    """Maps AnalysisFailure.code -> HTTP status (D039, see R013). Split out
    from the two call sites (create_analysis, regenerate_proposal_endpoint)
    since both need the exact same mapping now that provider_rate_limited
    exists alongside the original provider_error/schema_validation_failed.
    """
    if code == "provider_rate_limited":
        return 429
    if code == "provider_error":
        return 502
    return 422


def _safe_log_event(session: Session, **kwargs) -> None:
    """Diagnostics logging must never be able to break the actual response.
    If the database itself is unreachable/misconfigured (e.g. migrations
    were never applied against a real Postgres — the automated test suite
    only ever exercises SQLite, so this class of failure was never caught
    until a real deployment hit it), a failed log_event() call used to
    propagate as an unhandled 500 on top of whatever the real problem was.
    Log it server-side and move on instead.
    """
    try:
        repository.log_event(session, **kwargs)
    except Exception:
        logger.exception("Failed to write diagnostics event (event_type=%s) — continuing anyway.", kwargs.get("event_type"))
        session.rollback()  # a failed statement leaves a Postgres transaction unusable until rolled back


# --- Phase 9: accounts (D037) ------------------------------------------------


def _user_public(session: Session, user: User) -> UserPublic:
    subscription = session.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if subscription is None:
        # Should never happen (registration always creates one) — treat as
        # Spark rather than 500ing a /me call over a data inconsistency.
        subscription = Subscription(user_id=user.id, tier="spark", status="active")
        session.add(subscription)
        session.flush()
    # D039: apply any cancel-at-period-end downgrade whose period has
    # already ended — this is the primary place that lazy check actually
    # fires in practice, since every authenticated page load calls /me.
    billing.apply_pending_downgrade(session, subscription)
    return UserPublic(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        created_at=user.created_at,
        subscription=billing.subscription_public(subscription),
        usage=usage.usage_public(session, user),
        email_verified=user.email_verified_at is not None,
    )


def _send_verification_email(session: Session, user: User) -> None:
    """Shared by register and resend-verification. Any failure here (no
    RESEND_API_KEY configured, Resend itself erroring) is swallowed by
    email.send_email() already — this wrapper just keeps the two call
    sites from duplicating the URL-building and commit.
    """
    raw_token = create_verification_token(session, user)
    # get_settings() (not the module-level `settings` used for CORS/startup
    # logging above) — request-handling code should read live config, not a
    # snapshot frozen at import time. This was briefly using the stale
    # module-level `settings` (D059 found it while looking at the Render
    # deploy changes) — harmless in a real single-env deployment where
    # APP_BASE_URL never changes at runtime, but inconsistent with every
    # other handler in this file and would silently ignore a test's
    # monkeypatch.setenv("APP_BASE_URL", ...). Cheap now regardless
    # (get_settings() is @lru_cache'd, see config.py).
    verification_url = f"{get_settings().app_base_url}/verify-email?token={raw_token}"
    session.commit()
    send_verification_email(user.email, verification_url)


@app.post("/v1/auth/register", response_model=UserPublic, status_code=201)
def register(
    payload: RegisterRequest,
    response: Response,
    request: Request,
    session: Session = Depends(get_session),
) -> UserPublic:
    enforce_register_rate_limit(_client_ip(request))

    strength_error = check_password_strength(payload.password)
    if strength_error:
        raise HTTPException(status_code=422, detail={"code": "weak_password", "message": strength_error})

    if not verify_turnstile(payload.turnstile_token, _client_ip(request)):
        raise HTTPException(
            status_code=400, detail={"code": "captcha_failed", "message": "CAPTCHA verification failed. Try again."}
        )

    email = normalize_email(payload.email)
    existing = session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=409, detail={"code": "email_taken", "message": "An account with this email already exists."}
        )

    user = User(
        id=f"user_{uuid.uuid4().hex[:20]}",
        email=email,
        password_hash=hash_password(payload.password),
        display_name=(payload.display_name or "").strip() or None,
        created_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.flush()

    subscription = Subscription(
        id=f"sub_{uuid.uuid4().hex[:20]}",
        user_id=user.id,
        tier="spark",
        status="active",
    )
    session.add(subscription)
    session.flush()

    create_session(session, response, user, request.headers.get("user-agent"))
    session.commit()
    _send_verification_email(session, user)
    return _user_public(session, user)


@app.post("/v1/auth/login", response_model=UserPublic)
def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    session: Session = Depends(get_session),
) -> UserPublic:
    email = normalize_email(payload.email)
    client_ip = _client_ip(request)
    check_login_allowed(client_ip, email)

    if not verify_turnstile(payload.turnstile_token, client_ip):
        raise HTTPException(
            status_code=400, detail={"code": "captcha_failed", "message": "CAPTCHA verification failed. Try again."}
        )

    user = session.scalar(select(User).where(User.email == email))
    # Deliberately identical error for "no such user" and "wrong password" —
    # distinguishing them lets an attacker enumerate registered emails.
    invalid = HTTPException(status_code=401, detail={"code": "invalid_credentials", "message": "Incorrect email or password."})
    if user is None or not verify_password(payload.password, user.password_hash):
        record_login_attempt(client_ip, email)
        raise invalid

    clear_login_attempts(client_ip, email)
    create_session(session, response, user, request.headers.get("user-agent"))
    session.commit()
    return _user_public(session, user)


@app.post("/v1/auth/logout", status_code=204)
def logout(
    response: Response,
    sf_session: str | None = Cookie(default=None),
    session: Session = Depends(get_session),
) -> None:
    clear_session(session, response, sf_session)
    session.commit()


@app.get("/v1/auth/me", response_model=UserPublic)
def me(
    session: Session = Depends(get_session),
    user: User | None = Depends(get_current_user_optional),
) -> UserPublic:
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Not signed in."})
    return _user_public(session, user)


@app.post("/v1/auth/verify-email", response_model=UserPublic)
def verify_email(
    payload: VerifyEmailRequest,
    session: Session = Depends(get_session),
) -> UserPublic:
    user = consume_verification_token(session, payload.token)
    if user is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_token", "message": "This verification link is invalid or has expired. Request a new one."},
        )
    session.commit()
    return _user_public(session, user)


@app.post("/v1/auth/resend-verification", status_code=204)
def resend_verification(
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> None:
    # Reuses the login rate limiter's per-email bucket keyed on the user's
    # own address — cheap way to stop someone signed into an account from
    # hammering their own inbox (or someone else's Resend quota) via this
    # endpoint without a third rate-limit table just for this one action.
    check_login_allowed(_client_ip(request), user.email)
    record_login_attempt(_client_ip(request), user.email)
    if user.email_verified_at is not None:
        return
    _send_verification_email(session, user)


@app.post("/v1/auth/forgot-password", status_code=204)
def forgot_password(
    payload: PasswordResetRequestRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    """D051 — starts a password reset. Always responds 204, whether or not
    the email belongs to a real account, so this endpoint can't be used to
    enumerate registered addresses. The rate-limit check + record run
    before the user lookup (and for every request, hit or miss) so an
    existing and a non-existing email are indistinguishable by behavior or
    timing at this layer too. When the address does exist, a single-use
    reset token is minted and a Resend email is sent — which itself
    silently no-ops without RESEND_API_KEY (see email.py), exactly like
    verification.

    D058: per explicit user request, a reset link is now only issued for an
    account with a *verified* email — an unverified account's actual
    recovery path is to verify first (from the link already sent at
    registration, or a resend from Settings), not to reset a password it
    hasn't finished proving ownership of. This still returns 204 and still
    does nothing observably different for "no such account" vs. "account
    exists but unverified" — both simply skip minting a token/sending mail
    below — so D051's no-enumeration guarantee is unchanged.
    """
    client_ip = _client_ip(request)
    email = normalize_email(payload.email)
    # Dedicated 1-request-per-minute limit (per IP and per email) — the
    # user-facing throttle, and the one that surfaces a live countdown in the
    # UI via its `retryAfter`. Runs first, and (like the login checks below)
    # before the account lookup so a registered and an unregistered email
    # stay indistinguishable (D051's no-enumeration invariant).
    check_password_reset_allowed(client_ip, email)
    record_password_reset_attempt(client_ip, email)
    # Also count toward the login limiter's per-IP + per-email buckets as a
    # longer-window backstop — a reset is another way to trigger an email to
    # an address, so it shares the same 15-minute abuse ceiling rather than
    # getting an uncapped path once past the per-minute gate (R019).
    check_login_allowed(client_ip, email)
    record_login_attempt(client_ip, email)

    user = session.scalar(select(User).where(User.email == email))
    if user is None or user.email_verified_at is None:
        return
    raw_token = create_password_reset_token(session, user)
    # get_settings(), not module-level `settings` — see the matching note in
    # _send_verification_email above.
    reset_url = f"{get_settings().app_base_url}/reset-password?token={raw_token}"
    session.commit()
    send_password_reset_email(user.email, reset_url)


@app.post("/v1/auth/reset-password", status_code=204)
def reset_password(
    payload: PasswordResetConfirmRequest,
    session: Session = Depends(get_session),
) -> None:
    """D051 — completes a reset with the token from the emailed link and a
    new password. The new password gets the same strength rules as
    registration (422 on failure); a bad/expired/used token returns a
    specific 400 so the UI can tell the user to request a fresh link. On
    success every session on the account is revoked (auth.py) — the user
    signs in again with the new password.
    """
    strength_error = check_password_strength(payload.password)
    if strength_error:
        raise HTTPException(status_code=422, detail={"code": "weak_password", "message": strength_error})

    user = reset_password_with_token(session, payload.token, payload.password)
    if user is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_token", "message": "This reset link is invalid or has expired. Request a new one."},
        )
    session.commit()


@app.get("/v1/auth/sessions", response_model=list[UserSessionPublic])
def get_sessions(
    sf_session: str | None = Cookie(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> list[UserSessionPublic]:
    current_hash = hash_token(sf_session) if sf_session else None
    return [
        UserSessionPublic(
            id=row.id,
            created_at=row.created_at,
            last_seen_at=row.last_seen_at,
            user_agent=row.user_agent,
            is_current=(row.token_hash == current_hash),
        )
        for row in list_sessions(session, user)
    ]


@app.delete("/v1/auth/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> None:
    found = revoke_session(session, user, session_id)
    if not found:
        raise HTTPException(status_code=404, detail={"code": "session_not_found", "message": "Session not found."})
    session.commit()


@app.delete("/v1/auth/sessions", status_code=200)
def delete_other_sessions(
    sf_session: str | None = Cookie(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> dict[str, int]:
    current_hash = hash_token(sf_session) if sf_session else None
    count = revoke_other_sessions(session, user, current_hash)
    session.commit()
    return {"revoked": count}


# --- Phase 9: mock billing (D037) -------------------------------------------


@app.get("/v1/billing/plans", response_model=list[PlanPublic])
def get_plans() -> list[PlanPublic]:
    return billing.list_plans()


@app.post("/v1/billing/checkout", response_model=CheckoutSessionPublic)
def start_checkout(
    payload: CheckoutRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> CheckoutSessionPublic:
    result = billing.create_checkout_session(session, user.id, payload.tier)
    session.commit()
    return result


@app.post("/v1/billing/checkout/{checkout_id}/confirm", response_model=SubscriptionPublic)
def confirm_checkout(
    checkout_id: str,
    payload: CheckoutConfirmRequest,  # validated for shape only — see schema docstring (D037, mock billing); only the last 4 digits/brand of card_number are ever derived and kept (D039)
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> SubscriptionPublic:
    subscription = billing.confirm_checkout_session(session, user.id, checkout_id, card_number=payload.card_number)
    session.commit()
    return billing.subscription_public(subscription)


@app.post("/v1/billing/cancel", response_model=SubscriptionPublic)
def cancel_billing(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> SubscriptionPublic:
    """Schedules a downgrade to Spark at the end of the current billing
    period (D039) — no longer immediate, see billing.cancel_subscription's
    docstring.
    """
    subscription = billing.cancel_subscription(session, user.id)
    session.commit()
    return billing.subscription_public(subscription)


@app.post("/v1/billing/resume", response_model=SubscriptionPublic)
def resume_billing(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> SubscriptionPublic:
    """Undoes a pending cancel-at-period-end before the period ends (D039)."""
    subscription = billing.resume_subscription(session, user.id)
    session.commit()
    return billing.subscription_public(subscription)


@app.post("/v1/billing/unlink-card", response_model=SubscriptionPublic)
def unlink_card(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user_required),
) -> SubscriptionPublic:
    """/settings' "unlink card" action (D039) — see billing.unlink_card's
    docstring for the full cancel-at-period-end reasoning.
    """
    subscription = billing.unlink_card(session, user.id)
    session.commit()
    return billing.subscription_public(subscription)


@app.get("/v1/usage", response_model=UsagePublic)
def get_usage(
    request: Request,
    session: Session = Depends(get_session),
    installation_id: str | None = Depends(installation_id_header),
    user: User | None = Depends(get_current_user_optional),
) -> UsagePublic:
    """Backs the sidebar usage plaque (D039) for both anonymous
    (installation_id-scoped) and signed-in (account-scoped) callers — a real
    replacement for the fake, unlabeled DEMO_USAGE widget removed in D030.

    D048: passes the client IP so the plaque reflects the same
    max(installation, IP-hash) count enforce_usage_limit blocks on — otherwise
    the sidebar can show "2/5" while the analyze call 402s with "used all 5".
    """
    result = usage.usage_public_for(session, user, installation_id, _client_ip(request))
    if result is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "no_identity", "message": "No installation id or session provided."},
        )
    return result


# --- Analyses ----------------------------------------------------------------


def _require_verified_email(user: User | None) -> None:
    """D058 — the model call is the expensive, real-money part of this
    product, and until now an account with an unverified email could use it
    exactly like a verified one (D042 made verification explicitly
    non-blocking: "accounts still work unverified"). Per explicit user
    request, that's now reversed for signed-in accounts: a registered user
    must verify their email before running an analysis or regenerating a
    proposal. Anonymous, no-signup usage (D004) is deliberately untouched —
    this only applies when `user` is not None, so the free, no-account entry
    point to the product still works exactly as before. 403 (not 401): the
    caller *is* authenticated, they just haven't completed the one required
    extra step — a 401 would incorrectly suggest they need to sign in again.
    """
    if user is not None and user.email_verified_at is None:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "email_verification_required",
                "message": "Verify your email address before using ScopeForge. Check your inbox for the verification link, or resend it from Settings.",
            },
        )


def _client_ip(request: Request) -> str | None:
    """Best-effort caller IP for the anonymous-abuse hardening in usage.py
    (D039, see R014). Trusts X-Forwarded-For's first hop only when present
    (this API has no known reverse proxy in front of it today, but a future
    deployment behind one shouldn't silently start keying everyone off the
    proxy's own address) — falls back to the direct connection's address,
    same as any request.client.host read.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@app.post("/v1/analyses", response_model=ProjectAnalysis)
def create_analysis(
    payload: AnalysisCreate,
    request: Request,
    session: Session = Depends(get_session),
    installation_id: str | None = Depends(installation_id_header),
    user: User | None = Depends(get_current_user_optional),
) -> ProjectAnalysis:
    client_ip = _client_ip(request)
    enforce_rate_limit(installation_id)
    _require_verified_email(user)
    usage.enforce_usage_limit(session, user, installation_id, client_ip)

    if len(payload.description.split()) < MIN_BRIEF_WORDS:
        raise HTTPException(
            status_code=422,
            detail={"code": "brief_too_short", "message": "Project brief is too short."},
        )

    provider = "mock" if settings.analysis_mock_mode else settings.ai_provider
    model = "mock" if settings.analysis_mock_mode else settings.ai_model
    started = time.perf_counter()

    try:
        analysis = run_analysis(payload)
    except AnalysisFailure as failure:
        # provider_rate_limited: a genuine 429 from the provider that survived the
        # one bounded retry in provider.py -> 429 (the caller should wait, not treat
        # this like a broken provider). provider_error: any other provider-side
        # failure (network/auth/empty response) -> 502. schema_validation_failed: it
        # responded but never matched the schema, even after one repair retry -> 422
        # (bad output, not a transport failure). See D039/R013.
        status_code = _failure_status_code(failure.code)
        _safe_log_event(
            session,
            analysis_id=None,
            installation_id=installation_id,
            event_type="analysis_failed",
            provider=provider,
            model=model,
            status_code=status_code,
            error_code=failure.code,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        raise HTTPException(
            status_code=status_code,
            detail={"code": failure.code, "message": failure.message},
        ) from failure

    # The model call already succeeded and produced a valid, schema-checked
    # analysis at this point — that's the expensive, hard-to-repeat part.
    # A database problem here (wrong/missing DATABASE_URL, migrations never
    # applied against a real Postgres, connection drop, ...) should not
    # throw that work away and crash with an opaque 500. Best-effort save:
    # log and continue on failure, still return the computed analysis. The
    # frontend caches every successful response in `analysisStore`
    # (localStorage, D022) regardless of server-side persistence, so the
    # user doesn't lose it — it just won't show up in `/history` or be
    # fetchable from another browser until the underlying DB issue is fixed.
    try:
        repository.save_analysis(
            session,
            analysis,
            installation_id=installation_id,
            provider=provider,
            model=model,
            user_id=user.id if user else None,
        )
    except Exception:
        logger.exception("Failed to persist analysis %s — returning it to the client anyway.", analysis.id)
        session.rollback()  # a failed statement leaves a Postgres transaction unusable until rolled back

    # Quota only counts real, successful generations (D037) — mirrors the
    # existing philosophy that a failed model call shouldn't cost the caller
    # anything (see the AnalysisFailure branch above, which never reaches
    # here). A best-effort DB persistence failure above still counts as
    # "used" — the expensive model call happened either way.
    try:
        usage.increment_usage(session, user, installation_id, client_ip)
        session.commit()
    except Exception:
        logger.exception("Failed to increment usage counter for analysis %s — continuing anyway.", analysis.id)
        session.rollback()

    _safe_log_event(
        session,
        analysis_id=analysis.id,
        installation_id=installation_id,
        event_type="analysis_succeeded",
        provider=provider,
        model=model,
        status_code=200,
        error_code=None,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    return analysis


@app.post("/v1/proposals/regenerate", response_model=Proposal)
def regenerate_proposal_endpoint(
    payload: ProposalRegenerateRequest,
    session: Session = Depends(get_session),
    installation_id: str | None = Depends(installation_id_header),
    user: User | None = Depends(get_current_user_optional),
) -> Proposal:
    """Stateless tone-regeneration for the proposal only (D033) — driven by
    ProposalEditor.tsx's Confident/Technical pills. Shares the same
    per-installation rate limit as full analyses (it's still a real model call)
    but is not persisted anywhere: the frontend already holds the analysis
    this belongs to (analysisStore, D022) and merges the new text in locally.
    """
    enforce_rate_limit(installation_id)
    _require_verified_email(user)

    provider = "mock" if settings.analysis_mock_mode else settings.ai_provider
    model = "mock" if settings.analysis_mock_mode else settings.ai_model
    started = time.perf_counter()

    try:
        proposal = regenerate_proposal(payload)
    except AnalysisFailure as failure:
        status_code = _failure_status_code(failure.code)
        _safe_log_event(
            session,
            analysis_id=None,
            installation_id=installation_id,
            event_type="proposal_regenerate_failed",
            provider=provider,
            model=model,
            status_code=status_code,
            error_code=failure.code,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        raise HTTPException(
            status_code=status_code,
            detail={"code": failure.code, "message": failure.message},
        ) from failure

    _safe_log_event(
        session,
        analysis_id=None,
        installation_id=installation_id,
        event_type="proposal_regenerate_succeeded",
        provider=provider,
        model=model,
        status_code=200,
        error_code=None,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    return proposal


@app.get("/v1/analyses/{analysis_id}", response_model=ProjectAnalysis)
def get_analysis(
    analysis_id: str,
    session: Session = Depends(get_session),
    installation_id: str | None = Depends(installation_id_header),
    user: User | None = Depends(get_current_user_optional),
) -> ProjectAnalysis:
    record = repository.get_analysis(
        session, analysis_id, installation_id=installation_id, user_id=user.id if user else None
    )
    if record is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Analysis not found."})
    return repository.record_to_project_analysis(record)


@app.get("/v1/analyses")
def list_analyses(
    session: Session = Depends(get_session),
    installation_id: str | None = Depends(installation_id_header),
    user: User | None = Depends(get_current_user_optional),
) -> list[dict]:
    records = repository.list_analyses(session, installation_id=installation_id, user_id=user.id if user else None)
    return [
        {
            "id": record.id,
            "createdAt": record.created_at.isoformat(),
            "title": record.source_title,
            "platform": record.source_platform,
            "status": record.status,
        }
        for record in records
    ]


@app.delete("/v1/analyses/{analysis_id}", status_code=204)
def delete_analysis(
    analysis_id: str,
    session: Session = Depends(get_session),
    installation_id: str | None = Depends(installation_id_header),
    user: User | None = Depends(get_current_user_optional),
) -> None:
    deleted = repository.delete_analysis(
        session, analysis_id, installation_id=installation_id, user_id=user.id if user else None
    )
    if not deleted:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Analysis not found."})


@app.post("/v1/analyses/{analysis_id}/duplicate", response_model=ProjectAnalysis)
def duplicate_analysis(
    analysis_id: str,
    session: Session = Depends(get_session),
    installation_id: str | None = Depends(installation_id_header),
    user: User | None = Depends(get_current_user_optional),
) -> ProjectAnalysis:
    new_id = f"analysis_{uuid.uuid4().hex[:10]}"
    record = repository.duplicate_analysis(
        session,
        analysis_id,
        installation_id=installation_id,
        new_id=new_id,
        user_id=user.id if user else None,
    )
    if record is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Analysis not found."})
    return repository.record_to_project_analysis(record)

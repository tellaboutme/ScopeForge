from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_session
from .models import EmailVerificationToken, PasswordResetToken, User, UserSession

# Argon2id (argon2-cffi's default Type.ID) — OWASP's current top password
# hashing recommendation, memory-hard against GPU/ASIC cracking, stronger
# than bcrypt/PBKDF2 for this threat model. See the design notes D037.
_hasher = PasswordHasher()

SESSION_COOKIE_NAME = "sf_session"
_SESSION_TTL_DAYS = 30


def hash_password(raw_password: str) -> str:
    return _hasher.hash(raw_password)


def verify_password(raw_password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, raw_password)
    except VerifyMismatchError:
        return False
    except Exception:
        # Any other argon2 error (malformed hash, unsupported params) is
        # treated as "does not match" rather than propagating a 500 for a
        # login attempt — a hashing library error should never be more
        # informative to a caller than a generic wrong-password response.
        return False


def normalize_email(email: str) -> str:
    return email.strip().lower()


# D042 — "medium" password strength: Pydantic's min_length=8 on
# RegisterRequest already sets the floor; this adds the two checks that
# actually matter at that length (a pure-digit or pure-letter 8-char string
# is trivially weak) plus a short deny-list of the passwords real leaked-
# credential lists show over and over. Deliberately not a full breach-
# database check (e.g. Have I Been Pwned's k-anonymity API) or a
# complexity-scoring library — either is a reasonable future upgrade, not
# a must-have for a product this size, and both would be a new external
# dependency for something this short list already covers well enough.
_COMMON_WEAK_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789",
    "1234567890", "qwerty123", "qwertyuiop", "letmein123", "iloveyou1",
    "admin1234", "welcome123", "abc123456", "changeme1", "passw0rd",
}


def check_password_strength(password: str) -> str | None:
    """Returns a human-readable reason the password is too weak, or None if
    it passes. Called from the /v1/auth/register handler, not a Pydantic
    validator on RegisterRequest — the reason string needs to reach the
    user as a specific 422 message, and schemas.py stays free of
    business-rule imports (auth.py already owns password handling).
    """
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not any(char.isalpha() for char in password):
        return "Password must include at least one letter."
    if not any(char.isdigit() for char in password):
        return "Password must include at least one number."
    if password.lower() in _COMMON_WEAK_PASSWORDS:
        return "This password is too common. Choose something less predictable."
    return None


def hash_token(raw_token: str) -> str:
    """Public so main.py can hash the current request's raw session cookie
    to compare against UserSession.token_hash when marking "this device" in
    the /v1/auth/sessions list (D042) — same hash used to store/look up
    sessions here, exposed rather than reimplemented at the call site.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


_hash_token = hash_token


def create_session(session: Session, response: Response, user: User, user_agent: str | None) -> None:
    """Issues a new server-side session and sets the cookie on `response`.
    The raw token exists only here and in the browser's cookie jar — only
    its SHA-256 hash is ever persisted (D037), so a database leak alone
    cannot be used to impersonate a user the way a leaked JWT signing key
    or a leaked plaintext-comparable token could.
    """
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    record = UserSession(
        id=f"sess_{uuid.uuid4().hex[:20]}",
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        created_at=now,
        expires_at=now + timedelta(days=_SESSION_TTL_DAYS),
        last_seen_at=now,
        user_agent=(user_agent or "")[:255] or None,
    )
    session.add(record)
    session.flush()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=get_settings().session_cookie_secure,
        samesite="none" 
        if get_settings().session_cookie_secure else "lax",
        max_age=_SESSION_TTL_DAYS * 24 * 3600,
        path="/",
    )


def clear_session(session: Session, response: Response, raw_token: str | None) -> None:
    if raw_token:
        token_hash = _hash_token(raw_token)
        record = session.scalar(select(UserSession).where(UserSession.token_hash == token_hash))
        if record is not None:
            session.delete(record)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


# --- D042: email verification -----------------------------------------------

_VERIFICATION_TTL_HOURS = 24


def create_verification_token(session: Session, user: User) -> str:
    """Same token shape as sessions: a random 32-byte token, only its
    SHA-256 hash persisted, raw token exists only in the verification link
    (see email.py). 24h expiry is short enough that a stale, unclicked link
    from an old registration attempt isn't a standing risk, long enough
    that a legitimate user checking email the next morning isn't punished.
    """
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    session.add(
        EmailVerificationToken(
            id=f"evt_{uuid.uuid4().hex[:20]}",
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            created_at=now,
            expires_at=now + timedelta(hours=_VERIFICATION_TTL_HOURS),
        )
    )
    session.flush()
    return raw_token


def consume_verification_token(session: Session, raw_token: str) -> User | None:
    """Marks the token consumed and the owning user's email verified, or
    returns None for an unknown/expired/already-used token — callers
    (main.py) turn None into a specific "invalid or expired" error rather
    than a generic 404, so a user re-clicking an old link gets a message
    that tells them to request a new one instead of just "not found".
    """
    token_hash = _hash_token(raw_token)
    record = session.scalar(select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash))
    if record is None or record.consumed_at is not None:
        return None

    now = datetime.now(timezone.utc)
    expires_at = record.expires_at if record.expires_at.tzinfo else record.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        return None

    record.consumed_at = now
    user = session.get(User, record.user_id)
    if user is not None:
        user.email_verified_at = now
    return user


# --- D051: password reset ----------------------------------------------------

# Shorter than the 24h verification TTL: a reset link is a live credential
# for changing a password, so the window a leaked/intercepted link stays
# usable should be small. One hour is long enough for a user to open their
# email and click through, short enough that an old link in an inbox isn't a
# standing liability.
_PASSWORD_RESET_TTL_HOURS = 1


def create_password_reset_token(session: Session, user: User) -> str:
    """Mints a single-use reset token for `user`, persisting only its
    SHA-256 hash (same handling as sessions/verification). Returns the raw
    token for the reset link (email.py). Any still-valid earlier reset
    tokens for the same user are consumed first so only the newest link
    works — requesting a fresh link should invalidate the previous one.
    """
    now = datetime.now(timezone.utc)
    prior = session.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.consumed_at.is_(None)
        )
    ).all()
    for row in prior:
        row.consumed_at = now

    raw_token = secrets.token_urlsafe(32)
    session.add(
        PasswordResetToken(
            id=f"prt_{uuid.uuid4().hex[:20]}",
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            created_at=now,
            expires_at=now + timedelta(hours=_PASSWORD_RESET_TTL_HOURS),
        )
    )
    session.flush()
    return raw_token


def reset_password_with_token(session: Session, raw_token: str, new_password: str) -> User | None:
    """Consumes a valid reset token, sets the user's new password, and
    revokes every existing session on the account. Returns the User on
    success, or None for an unknown/expired/already-used token (main.py
    maps None to a specific "invalid or expired" 400).

    Revoking all sessions is deliberate: a password reset is the recovery
    path for a possibly-compromised or lost-access account, so every
    device — including any an attacker may hold — is signed out, and the
    user re-authenticates fresh with the new password.
    """
    token_hash = _hash_token(raw_token)
    record = session.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    if record is None or record.consumed_at is not None:
        return None

    now = datetime.now(timezone.utc)
    expires_at = record.expires_at if record.expires_at.tzinfo else record.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        return None

    user = session.get(User, record.user_id)
    if user is None:
        return None

    record.consumed_at = now
    user.password_hash = hash_password(new_password)
    # Sign out every session on the account (see docstring).
    for row in session.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
        session.delete(row)
    return user


# --- D042: active sessions ---------------------------------------------------


def list_sessions(session: Session, user: User) -> list[UserSession]:
    now = datetime.now(timezone.utc)
    rows = session.scalars(
        select(UserSession).where(UserSession.user_id == user.id).order_by(UserSession.last_seen_at.desc())
    ).all()
    # Expired-but-not-yet-cleaned-up rows shouldn't appear as "active" in a
    # user-facing list even though get_current_user_optional already treats
    # them as logged-out for auth purposes.
    return [row for row in rows if (row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)) >= now]


def revoke_session(session: Session, user: User, session_id: str) -> bool:
    """Deletes a specific session, scoped to the caller — returns False
    (never raises) for a missing id or one owned by someone else, so
    main.py can turn that into a 404 without leaking whether the id exists
    at all under another account.
    """
    record = session.scalar(select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id))
    if record is None:
        return False
    session.delete(record)
    return True


def revoke_other_sessions(session: Session, user: User, current_token_hash: str | None) -> int:
    """'Sign out everywhere else' — keeps the session making the request
    alive so the user isn't immediately logged out of the page they used to
    trigger this, revokes every other session on the account. Returns the
    count revoked for the response.
    """
    query = select(UserSession).where(UserSession.user_id == user.id)
    if current_token_hash:
        query = query.where(UserSession.token_hash != current_token_hash)
    rows = session.scalars(query).all()
    for row in rows:
        session.delete(row)
    return len(rows)


def get_current_user_optional(
    sf_session: str | None = Cookie(default=None),
    session: Session = Depends(get_session),
) -> User | None:
    """FastAPI dependency — resolves the session cookie to a User, or None
    for an anonymous request. Expired sessions are treated exactly like a
    missing cookie (not an error) since anonymous usage is a fully
    supported, first-class state in this product (D037/D004), not a
    fallback for a broken login.
    """
    if not sf_session:
        return None

    token_hash = _hash_token(sf_session)
    record = session.scalar(select(UserSession).where(UserSession.token_hash == token_hash))
    if record is None:
        return None

    now = datetime.now(timezone.utc)
    expires_at = record.expires_at if record.expires_at.tzinfo else record.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        return None

    record.last_seen_at = now
    return session.get(User, record.user_id)


def get_current_user_required(user: User | None = Depends(get_current_user_optional)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Sign in required."})
    return user

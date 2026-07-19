from __future__ import annotations

import logging
import re
import time

from openai import OpenAI, RateLimitError

from .config import get_settings

logger = logging.getLogger("scopeforge.provider")


class ProviderError(Exception):
    """The provider call itself failed (network, auth, rate limit, empty response).

    Distinct from a schema/format failure — this is not something a repair
    retry can fix, since the model never actually responded.

    `rate_limited` (D039, see the risk log R013) distinguishes a genuine
    429 token-per-minute rate limit from every other provider failure
    (network, auth, empty response, ...) — those are all still surfaced as
    "did not respond", but a rate limit is a real, expected-under-load
    condition with a specific fix (wait a moment), not a broken provider, so
    analysis_service.py maps it to its own AnalysisFailure code and main.py
    maps that to 429 rather than 502.
    """

    def __init__(self, message: str, *, rate_limited: bool = False):
        super().__init__(message)
        self.rate_limited = rate_limited


# Without an explicit timeout the openai SDK defaults to 600s, and with no
# retries configured a slow/unresponsive provider makes the whole request
# (and the /analyze UI, which has no client-side timeout of its own — see
# apps/web/src/lib/api.ts) look permanently frozen instead of failing with a
# typed error. Groq's LPU inference is fast (D025) — 45s is generous headroom
# for a real completion, well above normal latency, while still surfacing a
# ProviderError in a bounded time if something is actually stuck. If the
# provider changes again to something slower, raise this back up.
# max_retries=0: the analysis_service repair retry already gives the model
# one more attempt on schema failure — an SDK-level retry on top of that
# would double an already-slow worst case for no benefit on genuinely
# network-level errors. The one exception is RateLimitError (see below),
# which gets its own narrow, bounded retry specifically because Groq's error
# message tells us exactly how long to wait.
_REQUEST_TIMEOUT_SECONDS = 45.0

# D039: real-world evidence (a user's own debug-mode log) showed Groq's free
# on-demand tier has an 8000 tokens-per-minute budget, and a single
# proposal-regenerate call using the old max_tokens=4000 request/completion
# budget could burn over half of it — meaning two calls issued only a few
# seconds apart (well past the 400ms debounce, still well within the same
# 60s TPM window) could genuinely trip the limit even with no client-side
# race at all. Capping the wait to 15s keeps the bounded-retry promise (a
# request should never look silently stuck) while still giving Groq's own
# advertised cooldown (usually under 12s per the log) room to clear.
_RATE_LIMIT_MAX_WAIT_SECONDS = 15.0
_RETRY_AFTER_RE = re.compile(r"try again in ([\d.]+)s", re.IGNORECASE)


def _client() -> OpenAI:
    settings = get_settings()
    return OpenAI(
        base_url=settings.ai_base_url,
        api_key=settings.ai_api_key,
        timeout=_REQUEST_TIMEOUT_SECONDS,
        max_retries=0,
    )


def _extract_retry_after_seconds(exc: Exception) -> float:
    """Groq's 429 body includes "Please try again in 7.5s" — parse it so the
    bounded retry waits close to the provider's own advertised cooldown
    instead of a fixed guess. Falls back to the full bounded wait if the
    message shape ever changes.
    """
    match = _RETRY_AFTER_RE.search(str(exc))
    if not match:
        return _RATE_LIMIT_MAX_WAIT_SECONDS
    try:
        return min(float(match.group(1)), _RATE_LIMIT_MAX_WAIT_SECONDS)
    except ValueError:
        return _RATE_LIMIT_MAX_WAIT_SECONDS


def call_model(system_prompt: str, user_prompt: str, *, max_tokens: int = 4000) -> str:
    """Single chat-completion call against the configured OpenAI-compatible
    provider (Groq by default — D025, switched from NVIDIA NIM/D014). Returns
    raw text; parsing and schema validation happen in analysis_service.py.

    `max_tokens` is a parameter (not always 4000, D039) because the full
    scoring analysis and the much smaller proposal-tone regeneration have
    very different real completion-size needs — see
    analysis_service.regenerate_proposal(), which passes a much lower value
    to reduce the tokens-per-minute budget a single regenerate call burns.
    """
    settings = get_settings()
    completion = None

    # One bounded retry, specifically for 429 rate limits (D039) — not a
    # general network-error retry (max_retries=0 above is deliberate for
    # those). A rate limit is a real, predictable, temporary condition with
    # a provider-given cooldown; waiting that out once and retrying is a
    # better user experience than surfacing an error for something that
    # would very likely succeed a few seconds later.
    for attempt in range(2):
        try:
            # Client construction can itself fail (e.g. this sandbox's SOCKS
            # proxy env vars make httpx try to build a SOCKS transport and
            # blow up with an ImportError for a missing optional dependency)
            # — that needs to become a typed ProviderError too, not an
            # unhandled 500, so it's inside the same try/except as the
            # actual request.
            client = _client()
            completion = client.chat.completions.create(
                model=settings.ai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                # Lowered from 0.4 (D032) — the user noticed the same brief
                # scoring noticeably differently (e.g. 52 vs. 66/100) across
                # separate runs. Lower sampling temperature reduces, but cannot
                # fully eliminate, that run-to-run variance: it's inherent to
                # how the model samples tokens, and a scoping tool re-analyzing
                # the exact same brief should feel far more stable than that.
                temperature=0.15,
                max_tokens=max_tokens,
            )
            break
        except RateLimitError as exc:
            if attempt == 0:
                wait_seconds = _extract_retry_after_seconds(exc)
                logger.info("provider_rate_limited_retrying_after: %.1fs", wait_seconds)
                time.sleep(wait_seconds)
                continue
            raise ProviderError(
                "The model provider is rate-limited right now (too many requests in the last minute). "
                "Please wait a few seconds and try again.",
                rate_limited=True,
            ) from exc
        except Exception as exc:  # network/auth/other — the openai SDK raises its own exception hierarchy
            raise ProviderError(str(exc)) from exc

    if completion is None or not completion.choices:
        raise ProviderError("Provider returned no completion choices.")

    content = completion.choices[0].message.content
    if not content or not content.strip():
        raise ProviderError("Provider returned an empty response.")

    return content

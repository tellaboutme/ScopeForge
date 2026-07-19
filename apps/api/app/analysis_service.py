from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone

from pydantic import ValidationError

from .config import get_settings
from .mock import build_mock_analysis, build_mock_proposal
from .prompt import (
    PROPOSAL_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    build_proposal_regenerate_prompt,
    build_repair_prompt,
    build_user_prompt,
)
from .provider import ProviderError, call_model
from .schemas import AnalysisCreate, ProjectAnalysis, Proposal, ProposalRegenerateRequest

logger = logging.getLogger("scopeforge.analysis")


class AnalysisFailure(Exception):
    """Typed failure returned to the API layer (R001: repair once, then a
    typed failure rather than a raw 500 — apps/api/app/main.py maps `code`
    to an HTTP status and passes both through in the response body).
    """

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _extract_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in provider response.")
    return json.loads(candidate[start : end + 1])


def _try_parse_and_validate(
    raw_text: str, request_id: str, now: datetime
) -> tuple[ProjectAnalysis | None, Exception | None]:
    try:
        raw_json = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError) as exc:
        return None, exc

    raw_json = {**raw_json, "id": request_id, "created_at": now.isoformat()}
    try:
        return ProjectAnalysis.model_validate(raw_json), None
    except ValidationError as exc:
        return None, exc


def run_analysis(payload: AnalysisCreate) -> ProjectAnalysis:
    settings = get_settings()
    request_id = f"analysis_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)

    if settings.analysis_mock_mode:
        return build_mock_analysis(payload, request_id, now)

    user_prompt = build_user_prompt(payload)

    try:
        raw_text = call_model(SYSTEM_PROMPT, user_prompt)
    except ProviderError as exc:
        logger.warning("provider_call_failed: %s", exc)
        if exc.rate_limited:
            raise AnalysisFailure("provider_rate_limited", str(exc)) from exc
        raise AnalysisFailure("provider_error", "The analysis provider did not respond.") from exc

    analysis, format_error = _try_parse_and_validate(raw_text, request_id, now)
    if analysis is not None:
        return analysis

    logger.info("schema_validation_failed_first_attempt: %s", format_error)

    # One repair retry (R001): tell the model exactly what was wrong and ask
    # it to correct its own previous output, rather than starting over.
    try:
        repair_prompt = build_repair_prompt(user_prompt, raw_text, format_error)
        repaired_text = call_model(SYSTEM_PROMPT, repair_prompt)
    except ProviderError as exc:
        logger.warning("provider_call_failed_on_repair: %s", exc)
        if exc.rate_limited:
            raise AnalysisFailure("provider_rate_limited", str(exc)) from exc
        raise AnalysisFailure("provider_error", "The analysis provider did not respond during the repair attempt.") from exc

    analysis, format_error = _try_parse_and_validate(repaired_text, request_id, now)
    if analysis is not None:
        return analysis

    logger.warning("schema_validation_failed_after_repair: %s", format_error)
    raise AnalysisFailure(
        "schema_validation_failed",
        "The analysis result did not match the required format after one repair attempt.",
    )


def _try_parse_proposal(raw_text: str) -> tuple[Proposal | None, Exception | None]:
    try:
        raw_json = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError) as exc:
        return None, exc
    try:
        return Proposal.model_validate(raw_json), None
    except ValidationError as exc:
        return None, exc



# D039: proposal.short (<=700 chars) + proposal.full (<=5000 chars) need at
# most ~1450 completion tokens including JSON structure overhead — nowhere
# near the 4000 the full scoring analysis needs. The old shared max_tokens=
# 4000 meant every regenerate call requested roughly the same token budget
# as a full analysis for a job a third the size, which is what let two
# ordinary (debounced, non-overlapping) tone toggles blow through Groq's
# 8000 TPM budget in the same 60s window — see the real log evidence behind
# R013/D039. 1800 leaves comfortable headroom while cutting the per-call
# budget by more than half.
_PROPOSAL_REGENERATE_MAX_TOKENS = 1800


def regenerate_proposal(payload: ProposalRegenerateRequest) -> Proposal:
    """Reword proposal.short/full in the requested tone(s) (D033), without
    re-running the full scoring analysis. Same repair-retry shape as
    run_analysis, just against the much smaller Proposal schema.
    """
    settings = get_settings()
    if settings.analysis_mock_mode:
        return build_mock_proposal(payload)

    user_prompt = build_proposal_regenerate_prompt(payload)

    try:
        raw_text = call_model(PROPOSAL_SYSTEM_PROMPT, user_prompt, max_tokens=_PROPOSAL_REGENERATE_MAX_TOKENS)
    except ProviderError as exc:
        logger.warning("provider_call_failed_proposal_regen: %s", exc)
        if exc.rate_limited:
            raise AnalysisFailure("provider_rate_limited", str(exc)) from exc
        raise AnalysisFailure("provider_error", "The analysis provider did not respond.") from exc

    proposal, format_error = _try_parse_proposal(raw_text)
    if proposal is not None:
        return proposal

    logger.info("schema_validation_failed_proposal_regen_first_attempt: %s", format_error)

    try:
        repair_prompt = build_repair_prompt(user_prompt, raw_text, format_error)
        repaired_text = call_model(PROPOSAL_SYSTEM_PROMPT, repair_prompt, max_tokens=_PROPOSAL_REGENERATE_MAX_TOKENS)
    except ProviderError as exc:
        logger.warning("provider_call_failed_proposal_regen_on_repair: %s", exc)
        if exc.rate_limited:
            raise AnalysisFailure("provider_rate_limited", str(exc)) from exc
        raise AnalysisFailure("provider_error", "The analysis provider did not respond during the repair attempt.") from exc

    proposal, format_error = _try_parse_proposal(repaired_text)
    if proposal is not None:
        return proposal

    logger.warning("schema_validation_failed_proposal_regen_after_repair: %s", format_error)
    raise AnalysisFailure(
        "schema_validation_failed",
        "The regenerated proposal did not match the required format after one repair attempt.",
    )

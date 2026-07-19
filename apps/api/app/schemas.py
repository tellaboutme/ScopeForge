from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

Severity = Literal["low", "medium", "high"]
Decision = Literal["take", "negotiate", "skip"]


class CamelModel(BaseModel):
    """Base for every request/response model. Python code stays snake_case
    (idiomatic, and what the model prompt asks the model to produce — see
    prompt.py); the wire format is camelCase, matching the frontend's
    ProjectAnalysis TypeScript type in apps/web/src/types/analysis.ts
    field-for-field (e.g. client_budget -> clientBudget, duration_min_days ->
    durationMinDays). `populate_by_name` lets model_validate() accept either
    the alias or the original field name, so both model responses (snake_case)
    and frontend requests (camelCase) parse without extra mapping code.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ClientBudget(CamelModel):
    min: float | None = Field(default=None, ge=0)
    max: float | None = Field(default=None, ge=0)
    currency: str = Field(min_length=3, max_length=3)

class Source(CamelModel):
    title: str | None = Field(default=None, max_length=140)
    description: str = Field(min_length=40, max_length=30000)
    platform: str | None = Field(default=None, max_length=40)
    client_budget: ClientBudget | None = None

class Verdict(CamelModel):
    decision: Decision
    confidence: int = Field(ge=0, le=100)
    summary: str = Field(min_length=20, max_length=320)
    primary_reason: str = Field(min_length=10, max_length=180)

class Score(CamelModel):
    total: int = Field(ge=0, le=100)
    profitability: int = Field(ge=0, le=10)
    clarity: int = Field(ge=0, le=10)
    portfolio_value: int = Field(ge=0, le=10)
    complexity: int = Field(ge=0, le=10)
    risk: int = Field(ge=0, le=10)

class Estimate(CamelModel):
    budget_min: float = Field(ge=0)
    budget_recommended: float = Field(ge=0)
    budget_max: float = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    duration_min_days: int = Field(ge=1, le=730)
    duration_max_days: int = Field(ge=1, le=730)

    @model_validator(mode="after")
    def ordered_ranges(self):
        if not (self.budget_min <= self.budget_recommended <= self.budget_max):
            raise ValueError("budget range must be ordered")
        if self.duration_min_days > self.duration_max_days:
            raise ValueError("duration range must be ordered")
        return self

class Requirements(CamelModel):
    explicit: list[str] = Field(max_length=16)
    hidden: list[str] = Field(max_length=16)
    assumptions: list[str] = Field(max_length=16)

class Risk(CamelModel):
    title: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=10, max_length=260)
    severity: Severity
    mitigation: str = Field(min_length=10, max_length=260)

class Milestone(CamelModel):
    title: str = Field(min_length=3, max_length=72)
    description: str = Field(min_length=10, max_length=220)
    duration_days: int = Field(ge=1, le=365)
    percentage: int = Field(ge=0, le=100)

class TechItem(CamelModel):
    name: str = Field(min_length=1, max_length=48)
    category: str = Field(min_length=1, max_length=32)
    reason: str = Field(min_length=8, max_length=220)
    # D040: a distinct, more detailed hover-tooltip line — genuinely new
    # content (an integration note, a caveat, a concrete "how to use it"
    # detail), not a restatement of `reason`. Optional/nullable so older
    # cached ProjectAnalysis records saved before this field existed
    # (analysis_json blobs, no migration needed since this isn't its own
    # column — see repository.py) still validate; the frontend falls back
    # to `reason` when absent.
    tip: str | None = Field(default=None, max_length=280)

class Proposal(CamelModel):
    short: str = Field(min_length=20, max_length=700)
    # `full` is the neutral/base variant shown by default. `confident` and
    # `technical` are complete, self-contained restyled variants of the same
    # proposal (D047) — generated up front in the one analysis call so the
    # Confident/Technical pills swap between them instantly, with no further
    # model call. Optional/nullable so older cached ProjectAnalysis records saved
    # before these fields existed still validate (the frontend falls back to
    # `full` when a variant is absent). Every variant ends with the literal
    # "[YOUR NAME]" placeholder, which the frontend substitutes live from the
    # freelancer's Settings name (or leaves as-is when unset).
    full: str = Field(min_length=80, max_length=5000)
    confident: str | None = Field(default=None, max_length=5000)
    technical: str | None = Field(default=None, max_length=5000)

class ProjectAnalysis(CamelModel):
    id: str
    created_at: datetime
    source: Source
    verdict: Verdict
    score: Score
    estimate: Estimate
    requirements: Requirements
    risks: list[Risk] = Field(max_length=6)
    milestones: list[Milestone] = Field(min_length=2, max_length=12)
    tech_stack: list[TechItem] = Field(max_length=10)
    client_questions: list[str] = Field(max_length=8)
    proposal: Proposal

ProposalTone = Literal["confident", "technical"]


class ProposalRegenerateRequest(CamelModel):
    """Stateless proposal-rewrite request (D033) — the frontend already holds
    the full analysis client-side (analysisStore, D022), so this carries just
    the facts needed to reword proposal.short/full in a different tone
    rather than depending on server-side persistence (which is best-effort,
    D026) or re-running the whole scoring analysis.
    """

    source_description: str = Field(min_length=20, max_length=2000)
    platform: str | None = Field(default=None, max_length=40)
    verdict_summary: str = Field(min_length=1, max_length=400)
    budget_recommended: float = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    duration_min_days: int = Field(ge=1, le=730)
    duration_max_days: int = Field(ge=1, le=730)
    tech_stack: list[str] = Field(default_factory=list, max_length=10)
    # Both pills can be active at once, one, or neither (neutral default) —
    # mirrors ProposalEditor.tsx's independent-toggle UI, not a single select.
    tones: list[ProposalTone] = Field(default_factory=list)
    freelancer_name: str | None = Field(default=None, max_length=80)
    freelancer_bio: str | None = Field(default=None, max_length=500)


# Word-count floor enforced in main.create_analysis() (Pydantic's
# min_length=40 above is a *character* floor and lets a low-effort brief
# like "aaaa...aaaa" through — the word count is what actually keeps a brief
# useful). Was a bare literal `8` in main.py with no link to
# apps/web/src/lib/format.ts's MIN_BRIEF_WORDS, which enforces the identical
# rule client-side for the same reason (fail fast before spending a model
# call). The two are still two separate numbers in two languages/repos (no
# shared source across the FastAPI/Next.js boundary), so keep them in sync
# by hand if this ever changes — but at least each side has exactly one
# named place to change now, not a second bare copy nearby.
MIN_BRIEF_WORDS = 8


class AnalysisCreate(CamelModel):
    description: str = Field(min_length=40, max_length=30000)
    experience_level: Literal["beginner", "intermediate", "expert"] = "intermediate"
    currency: str = Field(default="USD", min_length=3, max_length=3)
    depth: Literal["quick", "detailed"] = "detailed"
    # Structured client-stated facts, entered directly by the freelancer from
    # the listing rather than left for the model to extract (or fail to)
    # from free-text prose — see the design notes D029. Both optional:
    # not every listing states a fixed budget or a hard deadline.
    client_budget: float | None = Field(default=None, ge=0)
    # D040: a fixed total and an hourly rate are very different signals for
    # the model's verdict/estimate ("$50" could mean a $50 total project or a
    # $50/hr rate on an unknown-length engagement) — the type has to travel
    # with the number so the prompt can treat it correctly, not just be a
    # client-side display label. Ignored when client_budget is None.
    client_budget_type: Literal["fixed", "hourly"] = "fixed"
    client_deadline_days: int | None = Field(default=None, ge=1, le=730)
    # Freelancer identity from /settings (D030) — optional. `freelancer_bio`
    # gives the model background to write a more grounded proposal. As of
    # D047 the name is NO LONGER baked into the proposal sign-off server-side
    # — every generated variant ends with the literal "[YOUR NAME]"
    # placeholder and the frontend substitutes the Settings name live — so
    # `freelancer_name` is now only informational context for the model, not
    # what determines the sign-off.
    freelancer_name: str | None = Field(default=None, max_length=80)
    freelancer_bio: str | None = Field(default=None, max_length=500)
    # D047 — the freelancer's preferred tech stack from /settings (e.g.
    # "React, TypeScript, Python"). When set, the proposal (especially the
    # Technical variant) is told to reference it as the stack the freelancer
    # will build with. Optional; omitted when the setting is blank.
    preferred_stack: str | None = Field(default=None, max_length=200)


# --- Phase 9: accounts, subscriptions, mock billing (D037) -----------------

PlanTier = Literal["spark", "forge", "furnace"]

# Single source of truth for the password length floor — previously the
# literal `8` was duplicated three times (here on both password fields, plus
# again in auth.check_password_strength()'s length check), with nothing
# tying them together. auth.py imports this instead of hardcoding its own
# copy; if the floor ever changes it changes in exactly one place.
PASSWORD_MIN_LENGTH = 8


class RegisterRequest(CamelModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=200)
    display_name: str | None = Field(default=None, max_length=80)
    # D042 — Cloudflare Turnstile response token, required only when
    # TURNSTILE_ENABLED=true server-side (see captcha.py). Optional here so
    # requests still validate with the field omitted while the feature is
    # off, which is the default until the user configures Cloudflare keys.
    turnstile_token: str | None = Field(default=None, max_length=4000)


class LoginRequest(CamelModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)
    turnstile_token: str | None = Field(default=None, max_length=4000)


class VerifyEmailRequest(CamelModel):
    token: str = Field(min_length=1, max_length=200)


class PasswordResetRequestRequest(CamelModel):
    """D051 — the "forgot password" form: just the account email. The
    endpoint always responds 204 regardless of whether the address is
    registered (no account enumeration), so there's nothing else to carry.
    """

    email: str = Field(min_length=3, max_length=255)


class PasswordResetConfirmRequest(CamelModel):
    """D051 — the "set a new password" form. `password` gets the same
    strength check as registration (auth.check_password_strength) in the
    handler, not a Pydantic validator, so the reason string can reach the
    user as a specific 422 (mirrors RegisterRequest's handling)."""

    token: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=200)


class SubscriptionPublic(CamelModel):
    tier: PlanTier
    status: Literal["active", "canceled"]
    current_period_end: datetime | None = None
    # D039: cancel-at-period-end state and a display-safe payment-method
    # fragment (never the full card number — see billing.py's
    # confirm_checkout_session docstring). card_last4/card_brand are both
    # None whenever there's no card on file (Spark, or after unlinking).
    cancel_at_period_end: bool = False
    card_last4: str | None = None
    card_brand: str | None = None


class UsagePublic(CamelModel):
    period_start: str  # ISO date (YYYY-MM-DD)
    analyses_used: int
    analyses_limit: int | None  # None = unlimited (Furnace)
    # D039: lets a single UsagePublic response drive the sidebar usage
    # plaque for both anonymous and signed-in callers without a second
    # round trip to figure out which plan's limits are being shown.
    tier: PlanTier


class UserPublic(CamelModel):
    id: str
    email: str
    display_name: str | None = None
    created_at: datetime
    subscription: SubscriptionPublic
    usage: UsagePublic
    email_verified: bool = False  # D042


class UserSessionPublic(CamelModel):
    """D042 — one row on the /settings 'Active sessions' list. `userAgent`
    is shown as-is (raw header string) rather than parsed into a friendly
    "Chrome on macOS" label — a real user-agent parser is a reasonable
    future addition, not worth a new dependency for this pass.
    """

    id: str
    created_at: datetime
    last_seen_at: datetime
    user_agent: str | None = None
    is_current: bool


class PlanPublic(CamelModel):
    tier: PlanTier
    name: str
    tagline: str
    price_cents: int
    monthly_analyses: int | None  # None = unlimited
    features: list[str]


class CheckoutRequest(CamelModel):
    tier: PlanTier


class CheckoutSessionPublic(CamelModel):
    id: str
    tier: PlanTier
    price_cents: int
    plan_name: str
    expires_at: datetime


class CheckoutConfirmRequest(CamelModel):
    """Fields only ever validated for realistic *shape* (length ranges, not
    a real card-network Luhn/BIN check) — nothing here is ever sent
    anywhere, charged, or persisted beyond this single request. See D037:
    this is mock billing, no real payment processor is involved.
    """

    card_number: str = Field(min_length=12, max_length=19)
    card_expiry: str = Field(min_length=4, max_length=7)
    card_cvc: str = Field(min_length=3, max_length=4)
    cardholder_name: str = Field(min_length=1, max_length=120)

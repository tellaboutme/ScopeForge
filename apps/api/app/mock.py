from __future__ import annotations

from datetime import datetime

from .schemas import AnalysisCreate, ProjectAnalysis, Proposal, ProposalRegenerateRequest


def build_mock_analysis(payload: AnalysisCreate, request_id: str, now: datetime) -> ProjectAnalysis:
    """Deterministic fallback used while ANALYSIS_MOCK_MODE=true (the .env
    default — see the design notes). Lets the whole request/response loop
    be exercised locally without an AI_API_KEY or spending provider quota.
    Loosely responsive to the actual brief length so it doesn't feel static.
    """
    word_count = len(payload.description.split())
    score_total = max(35, min(96, 40 + word_count // 3))
    decision = "take" if score_total >= 80 else "negotiate" if score_total >= 55 else "skip"

    duration_min_days, duration_max_days = 5, 10
    if payload.client_deadline_days is not None:
        duration_max_days = payload.client_deadline_days
        duration_min_days = min(duration_min_days, duration_max_days)

    # Reflect the structured client-stated facts (D029/D040) the same way
    # the real prompt is instructed to — echoed, not re-derived from the
    # brief. An hourly rate isn't a total: mirror the real prompt's rule of
    # deriving a total from rate x estimated hours (assume ~6 effective
    # hours/day across the estimated timeline) rather than treating the
    # rate number as if it were the whole budget.
    if payload.client_budget is not None and payload.client_budget_type == "hourly":
        estimated_hours = max(1, duration_max_days) * 6
        recommended = payload.client_budget * estimated_hours
        budget_min, budget_max = recommended * 0.8, recommended * 1.2
    elif payload.client_budget is not None:
        recommended = payload.client_budget
        budget_min, budget_max = recommended * 0.8, recommended * 1.2
    else:
        budget_min, recommended, budget_max = 1500, 3000, 4500

    raw = {
        "id": request_id,
        "created_at": now.isoformat(),
        "source": {
            "title": None,
            "description": payload.description[:200],
            "platform": None,
            "client_budget": (
                {"min": payload.client_budget, "max": payload.client_budget, "currency": payload.currency}
                if payload.client_budget is not None
                else None
            ),
        },
        "verdict": {
            "decision": decision,
            "confidence": min(95, 50 + word_count // 4),
            "summary": (
                "This is a deterministic mock result (ANALYSIS_MOCK_MODE=true in .env). "
                "Set it to false and provide a valid AI_API_KEY to call the real provider."
            ),
            "primary_reason": f"Mock verdict derived from a {word_count}-word brief.",
        },
        "score": {
            "total": score_total,
            "profitability": 6,
            "clarity": 6,
            "portfolio_value": 6,
            "complexity": 5,
            "risk": 4,
        },
        "estimate": {
            "budget_min": budget_min,
            "budget_recommended": recommended,
            "budget_max": budget_max,
            "currency": payload.currency,
            "duration_min_days": duration_min_days,
            "duration_max_days": duration_max_days,
        },
        "requirements": {
            "explicit": ["Requirement extracted from the brief"],
            "hidden": ["Inferred technical requirement"],
            "assumptions": ["Assumption made due to missing information"],
        },
        "risks": [
            {
                "title": "Scope ambiguity",
                "description": "The brief leaves some scope details open to interpretation.",
                "severity": "medium",
                "mitigation": "Confirm the open questions with the client before pricing.",
            }
        ],
        # Short timeline (D029) — assumes model-assisted development, not a
        # traditional from-scratch manual build, matching the real prompt's
        # duration guidance in prompt.py.
        "milestones": [
            {"title": "Discovery", "description": "Confirm scope and delivery plan.", "duration_days": 1, "percentage": 15},
            {"title": "Build", "description": "Implement the core scope.", "duration_days": 6, "percentage": 65},
            {"title": "QA and delivery", "description": "Test, polish, and hand off.", "duration_days": 2, "percentage": 20},
        ],
        "tech_stack": [
            {
                "name": "Next.js",
                "category": "Frontend",
                "reason": "Fast to build a polished, responsive UI.",
                "tip": "Deploys cleanly to Vercel with zero config, and its App Router pairs well with the FastAPI "
                "backend below over a simple REST boundary.",
            },
            {
                "name": "FastAPI",
                "category": "Backend",
                "reason": "Typed Python API with fast schema development.",
                "tip": "Pydantic models double as request validation and auto-generated OpenAPI docs, which speeds "
                "up handing off the API contract to a frontend-only collaborator.",
            },
        ],
        "client_questions": [
            "What is the target launch date?",
            "Are there existing designs or brand guidelines to follow?",
        ],
        # D047: three complete, self-contained proposal variants (neutral /
        # confident / technical), each ending with the literal "[YOUR NAME]"
        # placeholder the frontend substitutes live from Settings. Generated up
        # front so the Confident/Technical pills swap instantly with no call.
        "proposal": _mock_proposal(payload, recommended, budget_max, duration_min_days, duration_max_days),
    }
    return ProjectAnalysis.model_validate(raw)


def _mock_proposal(
    payload: AnalysisCreate,
    recommended: float,
    budget_max: float,
    duration_min_days: int,
    duration_max_days: int,
) -> dict:
    currency = payload.currency
    money = f"{recommended:g} {currency}"
    timeline = f"{duration_min_days}-{duration_max_days} days"
    stack = payload.preferred_stack.strip() if payload.preferred_stack else ""
    stack_line = (
        f"I'd build this with {stack}, a stack I work in regularly and can move quickly with.\n\n" if stack else ""
    )
    tech_stack_line = (
        f"Proposed stack: {stack}. Each piece is chosen to keep the build fast to develop and straightforward to "
        "maintain.\n\n"
        if stack
        else "I'll choose a stack that keeps the build fast to develop and straightforward to maintain.\n\n"
    )

    full = (
        "Hi,\n\n"
        "Thank you for sharing the brief. After reviewing it, I believe this is a strong fit for my experience and "
        "I'd be glad to take it on.\n\n"
        "I'd approach the work in clear stages: a short discovery step to confirm scope and priorities, a focused "
        "build phase for the core functionality, and a final round of testing, polish, and handoff. You'll have "
        "regular check-ins throughout, so you always know where things stand.\n\n"
        f"{stack_line}"
        f"Recommended budget: {money}, with an estimated timeline of {timeline}. I'm happy to refine the plan once "
        "we've confirmed the open details.\n\n"
        "Best regards,\n[YOUR NAME]"
    )
    confident = (
        "Hi,\n\n"
        "I've reviewed your brief and I'm confident I can deliver exactly what you're describing, on time and on "
        "budget. I've handled similar projects end to end and I know what it takes to ship something you'll be happy "
        "with.\n\n"
        "My plan is straightforward: confirm the scope, build the core product in focused milestones, and finish "
        "with thorough testing and a clean handoff. You'll get regular updates and a finished result that matches the "
        "brief, not a watered-down version of it.\n\n"
        f"{stack_line}"
        f"I can start as soon as you give the go-ahead. Recommended budget: {money}; estimated timeline: {timeline}."
        "\n\n"
        "Best regards,\n[YOUR NAME]"
    )
    technical = (
        "Hi,\n\n"
        "Based on the requirements, here's how I'd approach this technically. I'd structure the work as a modular "
        "build with clear separation of concerns, automated tests around the critical paths, and continuous "
        "integration from day one so regressions are caught before they ship.\n\n"
        f"{tech_stack_line}"
        "I'd begin with a short architecture step to lock down the data model and integration points, then implement "
        "the core functionality in reviewable increments, and finish with a documented, maintainable handoff.\n\n"
        f"Recommended budget: {money}; estimated timeline: {timeline}. Happy to walk through the technical approach "
        "in more detail before we start.\n\n"
        "Best regards,\n[YOUR NAME]"
    )
    return {
        "short": "I can deliver this project — see the scope breakdown for details.",
        "full": full,
        "confident": confident,
        "technical": technical,
    }


def build_mock_proposal(payload: ProposalRegenerateRequest) -> Proposal:
    """Deterministic fallback for POST /v1/proposals/regenerate (D033) while
    ANALYSIS_MOCK_MODE=true — loosely reflects the requested tone(s) so the
    checkbox/pill UI has something visibly different to animate in during
    local dev without spending real provider quota.
    """
    if "confident" in payload.tones and "technical" in payload.tones:
        opening = "I'm confident I can deliver this precisely, using the exact stack outlined below."
    elif "confident" in payload.tones:
        opening = "I'm confident I'm the right fit for this project and can start right away."
    elif "technical" in payload.tones:
        opening = "Here is a technical breakdown of how I'd approach this project."
    else:
        opening = "Thank you for the opportunity to review this project."

    stack_line = f"Planned stack: {', '.join(payload.tech_stack)}.\n\n" if payload.tech_stack and "technical" in payload.tones else ""

    signoff = f"Best regards,\n{payload.freelancer_name}" if payload.freelancer_name else "Best regards,"

    full = (
        f"Hi,\n\n{opening}\n\n"
        f"{stack_line}"
        f"Recommended budget: {payload.budget_recommended} {payload.currency}. "
        f"Estimated timeline: {payload.duration_min_days}-{payload.duration_max_days} days.\n\n"
        "This is a deterministic mock proposal (ANALYSIS_MOCK_MODE=true in .env).\n\n"
        f"{signoff}"
    )
    return Proposal(short=opening, full=full)

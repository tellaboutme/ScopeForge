from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app import analysis_service
from app.main import app
from app.provider import ProviderError

client = TestClient(app)

VALID_BRIEF = (
    "Build a small marketing website with a contact form, blog, and newsletter signup. "
    "The client wants a clean modern design and needs it hosted on Vercel within four weeks."
)

VALID_JSON_RESPONSE = json.dumps(
    {
        "source": {
            "title": "Marketing site",
            "description": "Marketing website with a blog and newsletter signup.",
            "platform": "Direct",
            "client_budget": None,
        },
        "verdict": {
            "decision": "take",
            "confidence": 80,
            "summary": "Clear scope, manageable timeline, and reasonable economics for this brief.",
            "primary_reason": "Well-specified marketing site with a standard stack.",
        },
        "score": {"total": 78, "profitability": 7, "clarity": 8, "portfolio_value": 6, "complexity": 4, "risk": 3},
        "estimate": {
            "budget_min": 1500,
            "budget_recommended": 2500,
            "budget_max": 3500,
            "currency": "USD",
            "duration_min_days": 14,
            "duration_max_days": 28,
        },
        "requirements": {
            "explicit": ["Contact form", "Blog", "Newsletter signup"],
            "hidden": ["Spam protection for the contact form"],
            "assumptions": ["Client will supply written content"],
        },
        "risks": [
            {
                "title": "Content delay",
                "description": "Client-provided content may arrive late.",
                "severity": "low",
                "mitigation": "Set a content deadline before development starts.",
            }
        ],
        "milestones": [
            {"title": "Design", "description": "Confirm layout and structure.", "duration_days": 5, "percentage": 25},
            {"title": "Build", "description": "Implement pages and integrations.", "duration_days": 15, "percentage": 75},
        ],
        "tech_stack": [
            {"name": "Next.js", "category": "Frontend", "reason": "Fast static site generation for a marketing site."}
        ],
        "client_questions": ["What is the preferred hosting provider?"],
        "proposal": {
            "short": "I can build this marketing site within four weeks using Next.js.",
            "full": (
                "Hi,\n\nThis is a great fit for my stack. I would deliver design, build, and launch in staged "
                "milestones.\n\nLooking forward to it."
            ),
        },
    }
)


def test_mock_mode_returns_valid_camel_case_analysis():
    response = client.post("/v1/analyses", json={"description": VALID_BRIEF})
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"]["decision"] in {"take", "negotiate", "skip"}
    assert "createdAt" in body
    assert "clientQuestions" in body
    assert "techStack" in body
    assert body["estimate"]["durationMinDays"] <= body["estimate"]["durationMaxDays"]


def test_provider_error_returns_typed_502(monkeypatch):
    def boom(system_prompt: str, user_prompt: str) -> str:
        raise ProviderError("network exploded")

    monkeypatch.setenv("ANALYSIS_MOCK_MODE", "false")
    monkeypatch.setattr(analysis_service, "call_model", boom)

    response = client.post("/v1/analyses", json={"description": VALID_BRIEF})
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "provider_error"


def test_repair_retry_recovers_from_malformed_first_response(monkeypatch):
    calls = {"count": 0}

    def flaky(system_prompt: str, user_prompt: str) -> str:
        calls["count"] += 1
        return "not json at all" if calls["count"] == 1 else VALID_JSON_RESPONSE

    monkeypatch.setenv("ANALYSIS_MOCK_MODE", "false")
    monkeypatch.setattr(analysis_service, "call_model", flaky)

    response = client.post("/v1/analyses", json={"description": VALID_BRIEF})
    assert response.status_code == 200
    assert calls["count"] == 2
    assert response.json()["verdict"]["decision"] == "take"


def test_schema_failure_after_repair_returns_typed_422(monkeypatch):
    def always_broken(system_prompt: str, user_prompt: str) -> str:
        return "still not json"

    monkeypatch.setenv("ANALYSIS_MOCK_MODE", "false")
    monkeypatch.setattr(analysis_service, "call_model", always_broken)

    response = client.post("/v1/analyses", json={"description": VALID_BRIEF})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "schema_validation_failed"


def test_analysis_create_accepts_camel_case_request():
    response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF, "experienceLevel": "expert", "currency": "EUR", "depth": "quick"},
    )
    assert response.status_code == 200
    assert response.json()["estimate"]["currency"] == "EUR"


def test_client_budget_and_deadline_are_optional_and_reflected_in_mock_output():
    # Omitted entirely — must not be required (D029).
    response = client.post("/v1/analyses", json={"description": VALID_BRIEF})
    assert response.status_code == 200
    assert response.json()["source"]["clientBudget"] is None

    # Supplied — mock mode echoes them rather than inventing its own numbers.
    response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF, "clientBudget": 50, "clientDeadlineDays": 14},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"]["clientBudget"]["min"] == 50
    assert body["source"]["clientBudget"]["max"] == 50
    assert body["estimate"]["budgetRecommended"] == 50
    assert body["estimate"]["durationMaxDays"] == 14


def test_hourly_client_budget_is_derived_into_a_total_not_treated_as_one(monkeypatch):
    # D040: an hourly rate is not a total budget — mock mode (and the real
    # prompt) must derive a total from rate x estimated hours rather than
    # echoing the rate number as-is into estimate.budgetRecommended.
    fixed_response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF, "clientBudget": 50, "clientBudgetType": "fixed", "clientDeadlineDays": 10},
    )
    hourly_response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF, "clientBudget": 50, "clientBudgetType": "hourly", "clientDeadlineDays": 10},
    )
    assert fixed_response.status_code == 200
    assert hourly_response.status_code == 200
    assert fixed_response.json()["estimate"]["budgetRecommended"] == 50
    assert hourly_response.json()["estimate"]["budgetRecommended"] > 50


def test_tech_stack_items_include_an_ai_generated_tip():
    # D040: `tip` is a distinct hover-tooltip field from `reason` — mock
    # mode's fixed tech stack always supplies one so the frontend tooltip
    # has real content to show without a live provider.
    response = client.post("/v1/analyses", json={"description": VALID_BRIEF})
    assert response.status_code == 200
    tech_stack = response.json()["techStack"]
    assert len(tech_stack) > 0
    assert all(item.get("tip") for item in tech_stack)


def test_mock_proposal_has_all_three_variants_ending_in_name_placeholder():
    # D047: the analysis returns three complete proposal variants (neutral
    # base + confident + technical), each ending with the literal "[YOUR NAME]"
    # placeholder. The name is NOT baked in server-side any more — the frontend
    # substitutes it live from Settings — so even when a name is supplied it
    # must not appear in the generated text, and the placeholder must remain.
    response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF, "freelancerName": "Egor Rytov"},
    )
    assert response.status_code == 200
    proposal = response.json()["proposal"]
    for key in ("full", "confident", "technical"):
        assert proposal[key], f"proposal.{key} should be present and non-empty"
        assert proposal[key].rstrip().endswith("[YOUR NAME]")
        assert "Egor Rytov" not in proposal[key]
    # The three variants must be genuinely different texts, not duplicates.
    assert len({proposal["full"], proposal["confident"], proposal["technical"]}) == 3


def test_preferred_stack_is_optional_and_reflected_in_mock_proposal():
    # Omitted — accepted without error, no leftover placeholder text.
    response = client.post("/v1/analyses", json={"description": VALID_BRIEF})
    assert response.status_code == 200

    # Supplied — the mock technical variant references the preferred stack.
    response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF, "preferredStack": "SvelteKit, Go, SQLite"},
    )
    assert response.status_code == 200
    assert "SvelteKit, Go, SQLite" in response.json()["proposal"]["technical"]


PROPOSAL_REGENERATE_BASE = {
    "sourceDescription": "Marketing website with a blog and newsletter signup, built with Next.js.",
    "platform": "Direct",
    "verdictSummary": "Clear scope, manageable timeline, and reasonable economics for this brief.",
    "budgetRecommended": 2500,
    "currency": "USD",
    "durationMinDays": 14,
    "durationMaxDays": 28,
    "techStack": ["Next.js", "Stripe"],
}


def test_regenerate_proposal_mock_mode_returns_valid_camel_case_proposal():
    response = client.post("/v1/proposals/regenerate", json=PROPOSAL_REGENERATE_BASE)
    assert response.status_code == 200
    body = response.json()
    assert len(body["short"]) >= 20
    assert len(body["full"]) >= 80


def test_regenerate_proposal_reflects_requested_tones_in_mock_output():
    neutral = client.post("/v1/proposals/regenerate", json=PROPOSAL_REGENERATE_BASE).json()
    confident = client.post(
        "/v1/proposals/regenerate", json={**PROPOSAL_REGENERATE_BASE, "tones": ["confident"]}
    ).json()
    technical = client.post(
        "/v1/proposals/regenerate", json={**PROPOSAL_REGENERATE_BASE, "tones": ["technical"]}
    ).json()

    # Different tones should produce visibly different text in mock mode too
    # (not just pass the tone through unused) — this is what the frontend
    # animates in when a pill is toggled.
    assert neutral["short"] != confident["short"]
    assert neutral["short"] != technical["short"]
    assert confident["short"] != technical["short"]
    assert "Next.js" in technical["full"]  # tech stack surfaced for the "technical" tone


def test_regenerate_proposal_signs_off_without_placeholder():
    response = client.post("/v1/proposals/regenerate", json=PROPOSAL_REGENERATE_BASE)
    assert response.status_code == 200
    assert "[Your Name]" not in response.json()["full"]

    response = client.post(
        "/v1/proposals/regenerate", json={**PROPOSAL_REGENERATE_BASE, "freelancerName": "Egor Rytov"}
    )
    assert response.status_code == 200
    assert "Egor Rytov" in response.json()["full"]

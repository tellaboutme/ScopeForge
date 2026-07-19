from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import Subscription

VALID_BRIEF = (
    "Build a small marketing website with a contact form, blog, and newsletter signup. "
    "The client wants a clean modern design and needs it hosted on Vercel within four weeks."
)


def _fresh_client() -> TestClient:
    return TestClient(app)


def _register(client: TestClient, email: str, db_session=None) -> dict:
    response = client.post(
        "/v1/auth/register", json={"email": email, "password": "correcthorsebattery1"}
    )
    assert response.status_code == 201, response.text
    # D058: signed-in accounts must verify their email before using the
    # service (POST /v1/analyses, proposal regeneration). Every test in this
    # file that goes on to actually call one of those endpoints needs a
    # verified account first — passing `db_session` (the conftest fixture)
    # marks it verified directly, the same shortcut test_security.py uses,
    # rather than threading a real verification-token round trip through
    # every billing test that isn't about verification itself.
    if db_session is not None:
        from app.models import User

        user = db_session.query(User).filter(User.email == email).one()
        user.email_verified_at = datetime.now(timezone.utc)
        db_session.commit()
    return response.json()


def _checkout_and_confirm(client: TestClient, tier: str) -> dict:
    checkout = client.post("/v1/billing/checkout", json={"tier": tier})
    assert checkout.status_code == 200, checkout.text
    checkout_id = checkout.json()["id"]
    confirm = client.post(
        f"/v1/billing/checkout/{checkout_id}/confirm",
        json={"cardNumber": "4242424242424242", "cardExpiry": "12/29", "cardCvc": "123", "cardholderName": "Test"},
    )
    assert confirm.status_code == 200, confirm.text
    return confirm.json()


def test_plan_catalog_has_three_tiers_with_expected_shape():
    client = _fresh_client()
    response = client.get("/v1/billing/plans")
    assert response.status_code == 200
    plans = {plan["tier"]: plan for plan in response.json()}
    assert set(plans.keys()) == {"spark", "forge", "furnace"}
    assert plans["spark"]["priceCents"] == 0
    assert plans["spark"]["monthlyAnalyses"] == 5
    assert plans["forge"]["monthlyAnalyses"] == 60
    assert plans["furnace"]["monthlyAnalyses"] is None  # unlimited


def test_checkout_requires_authentication():
    client = _fresh_client()
    response = client.post("/v1/billing/checkout", json={"tier": "forge"})
    assert response.status_code == 401


def test_cannot_checkout_into_the_free_tier():
    client = _fresh_client()
    _register(client, "free-checkout@example.com")
    response = client.post("/v1/billing/checkout", json={"tier": "spark"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "free_tier_checkout"


def test_checkout_confirm_upgrades_the_subscription_and_raises_the_quota():
    client = _fresh_client()
    _register(client, "upgrade@example.com")
    subscription = _checkout_and_confirm(client, "forge")
    assert subscription["tier"] == "forge"
    assert subscription["status"] == "active"
    assert subscription["currentPeriodEnd"] is not None

    me = client.get("/v1/auth/me").json()
    assert me["usage"]["analysesLimit"] == 60


def test_cannot_checkout_into_a_lower_paid_tier():
    # Downgrades are not allowed through checkout at all — a Furnace user
    # must not be able to "upgrade" (and pay) into the cheaper Forge tier.
    client = _fresh_client()
    _register(client, "downgrade-blocked@example.com")
    _checkout_and_confirm(client, "furnace")

    response = client.post("/v1/billing/checkout", json={"tier": "forge"})
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "downgrade_not_allowed"

    # Tier is unchanged — the rejected checkout didn't touch the subscription.
    assert client.get("/v1/auth/me").json()["subscription"]["tier"] == "furnace"


def test_upgrade_and_same_tier_renewal_are_still_allowed():
    client = _fresh_client()
    _register(client, "upgrade-allowed@example.com")
    _checkout_and_confirm(client, "forge")

    # Strict upgrade (Forge -> Furnace) is fine.
    assert client.post("/v1/billing/checkout", json={"tier": "furnace"}).status_code == 200
    # A same-tier renewal (Forge -> Forge) is fine too — not a downgrade.
    assert client.post("/v1/billing/checkout", json={"tier": "forge"}).status_code == 200


def test_confirming_a_stale_lower_tier_checkout_is_blocked():
    # Defense in depth: a checkout session started while on a lower tier must
    # not be confirmable into a downgrade after an upgrade has happened.
    client = _fresh_client()
    _register(client, "stale-checkout@example.com")

    # Start (but don't confirm) a Forge checkout while still on Spark.
    stale = client.post("/v1/billing/checkout", json={"tier": "forge"}).json()
    # Meanwhile jump straight to Furnace.
    _checkout_and_confirm(client, "furnace")

    # The still-pending Forge session would now be a downgrade — reject it.
    response = client.post(
        f"/v1/billing/checkout/{stale['id']}/confirm",
        json={"cardNumber": "4242424242424242", "cardExpiry": "12/29", "cardCvc": "123", "cardholderName": "Test"},
    )
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "downgrade_not_allowed"
    assert client.get("/v1/auth/me").json()["subscription"]["tier"] == "furnace"


def test_confirming_an_already_confirmed_checkout_session_fails():
    client = _fresh_client()
    _register(client, "double-confirm@example.com")
    checkout = client.post("/v1/billing/checkout", json={"tier": "forge"}).json()
    first = client.post(
        f"/v1/billing/checkout/{checkout['id']}/confirm",
        json={"cardNumber": "4242424242424242", "cardExpiry": "12/29", "cardCvc": "123", "cardholderName": "Test"},
    )
    assert first.status_code == 200
    second = client.post(
        f"/v1/billing/checkout/{checkout['id']}/confirm",
        json={"cardNumber": "4242424242424242", "cardExpiry": "12/29", "cardCvc": "123", "cardholderName": "Test"},
    )
    assert second.status_code == 422
    assert second.json()["detail"]["code"] == "checkout_not_pending"


def test_cancel_schedules_downgrade_at_period_end_not_immediately(db_session):
    # D039: cancelling no longer downgrades on the spot — the plan and its
    # benefits stay active through the already-paid-for period, matching
    # real subscription semantics (a plan started 1.1 stays active through
    # 1.2 even if cancelled on 1.10). Overrides D037's original "immediate,
    # simpler for a mock system" design per explicit user request.
    client = _fresh_client()
    _register(client, "cancel-test@example.com")
    _checkout_and_confirm(client, "furnace")
    assert client.get("/v1/auth/me").json()["subscription"]["tier"] == "furnace"

    cancel = client.post("/v1/billing/cancel")
    assert cancel.status_code == 200
    body = cancel.json()
    assert body["tier"] == "furnace"  # unchanged — still active until period end
    assert body["status"] == "active"
    assert body["cancelAtPeriodEnd"] is True
    assert body["currentPeriodEnd"] is not None

    me = client.get("/v1/auth/me").json()
    assert me["subscription"]["tier"] == "furnace"
    assert me["subscription"]["cancelAtPeriodEnd"] is True

    # Fast-forward the period end into the past (no real 30-day wait or
    # background job in this sandbox — see billing.apply_pending_downgrade's
    # docstring for why this is checked lazily on every subscription read).
    # _clean_database (conftest.py) resets the test DB after every test, so
    # this is the only subscription row present.
    subscription = db_session.scalar(select(Subscription))
    subscription.current_period_end = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    after_period_end = client.get("/v1/auth/me").json()
    assert after_period_end["subscription"]["tier"] == "spark"
    assert after_period_end["subscription"]["status"] == "active"
    assert after_period_end["subscription"]["cancelAtPeriodEnd"] is False
    assert after_period_end["subscription"]["currentPeriodEnd"] is None


def test_resume_undoes_a_pending_cancellation():
    client = _fresh_client()
    _register(client, "resume-test@example.com")
    _checkout_and_confirm(client, "forge")

    client.post("/v1/billing/cancel")
    assert client.get("/v1/auth/me").json()["subscription"]["cancelAtPeriodEnd"] is True

    resume = client.post("/v1/billing/resume")
    assert resume.status_code == 200
    assert resume.json()["cancelAtPeriodEnd"] is False
    assert resume.json()["tier"] == "forge"


def test_unlink_card_clears_card_and_schedules_cancellation():
    client = _fresh_client()
    _register(client, "unlink-test@example.com")
    confirmed = _checkout_and_confirm(client, "forge")
    assert confirmed["cardLast4"] == "4242"
    assert confirmed["cardBrand"] == "Visa"

    unlinked = client.post("/v1/billing/unlink-card")
    assert unlinked.status_code == 200
    body = unlinked.json()
    assert body["cardLast4"] is None
    assert body["cardBrand"] is None
    assert body["cancelAtPeriodEnd"] is True
    assert body["tier"] == "forge"  # still active until period end


def test_anonymous_usage_is_capped_at_the_spark_limit_by_installation_id():
    client = _fresh_client()
    for i in range(5):
        response = client.post(
            "/v1/analyses",
            json={"description": VALID_BRIEF},
            headers={"X-Installation-Id": "quota-anon-test"},
        )
        assert response.status_code == 200, f"request {i} failed: {response.text}"

    blocked = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF},
        headers={"X-Installation-Id": "quota-anon-test"},
    )
    assert blocked.status_code == 402
    assert blocked.json()["detail"]["code"] == "usage_limit_reached"


def test_usage_plaque_matches_enforcement_across_installation_ids_on_one_ip():
    # D048 regression: the sidebar plaque (GET /v1/usage) must report the same
    # count enforce_usage_limit blocks on. For anonymous callers that's
    # max(installation counter, IP-hash counter). When analyses ran under
    # several installation_ids from one IP (cleared local data, private
    # window, etc.), the IP counter is higher than the current browser's own
    # counter — the plaque used to show only the (lower) installation count,
    # so it read "2/5" while the analyze call 402'd with "used all 5".
    client = _fresh_client()
    ip = {"X-Forwarded-For": "203.0.113.7"}

    for i in range(3):
        r = client.post("/v1/analyses", json={"description": VALID_BRIEF}, headers={"X-Installation-Id": "dev-A", **ip})
        assert r.status_code == 200, r.text
    for i in range(2):
        r = client.post("/v1/analyses", json={"description": VALID_BRIEF}, headers={"X-Installation-Id": "dev-B", **ip})
        assert r.status_code == 200, r.text

    # device B's own counter is only 2, but the shared IP counter is now 5.
    usage = client.get("/v1/usage", headers={"X-Installation-Id": "dev-B", **ip}).json()
    assert usage["analysesUsed"] == 5, usage
    assert usage["analysesLimit"] == 5

    # ...and enforcement agrees: B is blocked, so plaque and 402 never disagree.
    blocked = client.post("/v1/analyses", json={"description": VALID_BRIEF}, headers={"X-Installation-Id": "dev-B", **ip})
    assert blocked.status_code == 402
    assert blocked.json()["detail"]["code"] == "usage_limit_reached"


def test_upgrading_raises_the_quota_for_a_signed_in_user_past_the_free_cap(db_session):
    client = _fresh_client()
    _register(client, "quota-upgrade@example.com", db_session)
    # Explicit installation id even though the account is what actually
    # scopes usage/data once signed in (D037) — keeps this test's requests
    # out of rate_limit.py's shared "anonymous" bucket (keyed off a missing
    # installation id), which every other test file's no-installation-id
    # calls also share; giving each test its own key avoids cross-test
    # rate-limit flakiness that has nothing to do with what this test
    # actually verifies.
    headers = {"X-Installation-Id": "quota-upgrade-device"}

    for i in range(5):
        response = client.post("/v1/analyses", json={"description": VALID_BRIEF}, headers=headers)
        assert response.status_code == 200, f"request {i} failed: {response.text}"

    # Spark limit reached — the 6th should be blocked.
    assert client.post("/v1/analyses", json={"description": VALID_BRIEF}, headers=headers).status_code == 402

    _checkout_and_confirm(client, "forge")

    # Same account, same calendar month, now on Forge (60/mo) — the next
    # request should succeed since Forge's limit is far from used up, even
    # though the 5 Spark-era analyses already counted against this month's
    # counter (the counter is per-owner-per-month, not per-tier).
    response = client.post("/v1/analyses", json={"description": VALID_BRIEF}, headers=headers)
    assert response.status_code == 200


def test_signed_in_analyses_are_scoped_to_the_account_not_the_browser(db_session):
    client = _fresh_client()
    _register(client, "account-scoping@example.com", db_session)

    created = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF},
        headers={"X-Installation-Id": "device-a"},
    ).json()

    # Same signed-in session, different installation id (as if opened on a
    # different device/browser but still logged into the same account) —
    # should still resolve, because repository._scope() prefers the account
    # over the installation id once a user is present (D037).
    fetched = client.get(
        f"/v1/analyses/{created['id']}",
        headers={"X-Installation-Id": "device-b"},
    )
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]


def test_furnace_tier_has_no_monthly_cap(db_session):
    client = _fresh_client()
    _register(client, "furnace-unlimited@example.com", db_session)
    _checkout_and_confirm(client, "furnace")
    headers = {"X-Installation-Id": "furnace-unlimited-device"}  # keep out of the shared anonymous rate-limit bucket

    for i in range(8):  # comfortably past Spark's 5 and Forge's implicit low end
        response = client.post("/v1/analyses", json={"description": VALID_BRIEF}, headers=headers)
        assert response.status_code == 200, f"request {i} failed: {response.text}"

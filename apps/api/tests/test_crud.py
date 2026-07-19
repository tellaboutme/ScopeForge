from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_BRIEF = (
    "Build a small marketing website with a contact form, blog, and newsletter signup. "
    "The client wants a clean modern design and needs it hosted on Vercel within four weeks."
)


def _create(installation_id: str = "inst-a") -> dict:
    response = client.post(
        "/v1/analyses",
        json={"description": VALID_BRIEF},
        headers={"X-Installation-Id": installation_id},
    )
    assert response.status_code == 200
    return response.json()


def test_get_analysis_by_id_round_trips():
    created = _create()
    response = client.get(f"/v1/analyses/{created['id']}", headers={"X-Installation-Id": "inst-a"})
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]
    assert response.json()["verdict"]["decision"] == created["verdict"]["decision"]


def test_get_analysis_scoped_to_installation():
    created = _create(installation_id="inst-a")
    response = client.get(f"/v1/analyses/{created['id']}", headers={"X-Installation-Id": "inst-b"})
    assert response.status_code == 404


def test_get_missing_analysis_returns_404():
    response = client.get("/v1/analyses/does-not-exist", headers={"X-Installation-Id": "inst-a"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_list_analyses_scoped_to_installation():
    _create(installation_id="inst-a")
    _create(installation_id="inst-a")
    _create(installation_id="inst-b")

    response = client.get("/v1/analyses", headers={"X-Installation-Id": "inst-a"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all("id" in item and "createdAt" in item for item in body)


def test_delete_analysis_then_404():
    created = _create()
    delete_response = client.delete(f"/v1/analyses/{created['id']}", headers={"X-Installation-Id": "inst-a"})
    assert delete_response.status_code == 204

    get_response = client.get(f"/v1/analyses/{created['id']}", headers={"X-Installation-Id": "inst-a"})
    assert get_response.status_code == 404


def test_delete_missing_analysis_returns_404():
    response = client.delete("/v1/analyses/does-not-exist", headers={"X-Installation-Id": "inst-a"})
    assert response.status_code == 404


def test_duplicate_analysis_creates_new_id_with_copy_suffix():
    created = _create()
    response = client.post(f"/v1/analyses/{created['id']}/duplicate", headers={"X-Installation-Id": "inst-a"})
    assert response.status_code == 200
    duplicate = response.json()
    assert duplicate["id"] != created["id"]

    list_response = client.get("/v1/analyses", headers={"X-Installation-Id": "inst-a"})
    assert len(list_response.json()) == 2


def test_duplicate_missing_analysis_returns_404():
    response = client.post("/v1/analyses/does-not-exist/duplicate", headers={"X-Installation-Id": "inst-a"})
    assert response.status_code == 404

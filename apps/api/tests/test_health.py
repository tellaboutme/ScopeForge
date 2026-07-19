from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_short_brief_is_rejected():
    response = client.post("/v1/analyses", json={"description": "too short for analysis"})
    assert response.status_code == 422

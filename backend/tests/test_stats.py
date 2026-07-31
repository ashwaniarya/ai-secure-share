import pytest
from pydantic import ValidationError

from app.config import Settings, settings


def _create(client, **body):
    body.setdefault("content", "# Hello")
    response = client.post("/api/shares", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_stats_returns_zero_on_empty_database(client, monkeypatch):
    monkeypatch.setattr(settings, "stats_baseline", 0)
    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.json() == {"share_count": 0}


def test_stats_counts_created_shares(client, monkeypatch):
    monkeypatch.setattr(settings, "stats_baseline", 0)
    _create(client)
    _create(client)

    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.json() == {"share_count": 2}


def test_stats_applies_baseline_offset(client, monkeypatch):
    monkeypatch.setattr(settings, "stats_baseline", 1000)
    _create(client)
    _create(client)

    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.json() == {"share_count": 1002}


def test_stats_baseline_ships_a_nonzero_default():
    # The shipped default is what production serves; the tests above override it.
    assert Settings().stats_baseline == 1200


def test_stats_baseline_rejects_a_negative_offset():
    # A negative total fails the frontend's visibility guard, which hides the
    # counter in a way that looks identical to the stats route being down.
    with pytest.raises(ValidationError):
        Settings(stats_baseline=-5000)

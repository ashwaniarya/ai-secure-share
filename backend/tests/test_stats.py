def _create(client, **body):
    body.setdefault("content", "# Hello")
    response = client.post("/api/shares", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_stats_returns_zero_on_empty_database(client):
    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.json() == {"share_count": 0}


def test_stats_counts_created_shares(client):
    _create(client)
    _create(client)

    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.json() == {"share_count": 2}

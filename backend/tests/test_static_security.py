"""Containment of the static-file handler.

``static_dir / full_path`` does not normalise ``..``, so before the containment
check a request could walk out of the served tree and read any file the process
could open. A hostile path can also be unstattable rather than merely absent,
which must not surface as a 500.
"""

import pytest


def test_encoded_traversal_does_not_serve_a_file_outside_the_static_dir(spa_client):
    response = spa_client.get("/..%2fsecret.txt")

    assert "SUPER-SECRET" not in response.text


@pytest.mark.parametrize(
    "path",
    [
        "/..%2fsecret.txt",
        "/%2e%2e%2fsecret.txt",
        "/....//secret.txt",
        "/..%5csecret.txt",
        "/..%2f..%2f..%2fetc%2fpasswd",
        "//etc/passwd",
    ],
)
def test_traversal_payloads_never_escape_the_static_dir(spa_client, path):
    assert "SUPER-SECRET" not in spa_client.get(path).text


@pytest.mark.parametrize(
    ("label", "path"),
    [
        ("null byte", "/x%00.js"),
        ("segment over NAME_MAX", "/" + "a" * 6000),
        ("path over PATH_MAX", "/" + "a/" * 900),
    ],
)
def test_an_unstattable_path_does_not_crash_the_server(spa_client, label, path):
    assert spa_client.get(path).status_code < 500, label


def test_built_assets_are_still_served(spa_client):
    response = spa_client.get("/assets/index-abc123.js")

    assert response.status_code == 200
    assert "console.log" in response.text


@pytest.mark.parametrize("path", ["/", "/s/abc123/manage"])
def test_real_spa_routes_are_still_served(spa_client, path):
    assert spa_client.get(path).status_code == 200

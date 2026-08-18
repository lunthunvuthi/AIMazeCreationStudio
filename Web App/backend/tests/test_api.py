from fastapi.testclient import TestClient

from maze_api.main import app

client = TestClient(app)


def test_generate_returns_a_maze_with_camelcase_seeds():
    resp = client.post(
        "/api/maze/generate",
        json={"type": "pickaxe", "star": 1, "sgSeed": 1, "pathSeed": 1, "wallSeed": 1},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pickaxe_count"] >= 1
    assert "maze" in data
    assert "solutionTrace" in data
    assert data["seeds"] == {"sgSeed": 1, "pathSeed": 1, "wallSeed": 1}


def test_generate_omitted_seeds_are_picked_randomly():
    resp = client.post("/api/maze/generate", json={"type": "pickaxe", "star": 2})
    assert resp.status_code == 200
    seeds = resp.json()["seeds"]
    assert all(isinstance(v, int) for v in seeds.values())


def test_generate_rejects_unknown_type():
    resp = client.post("/api/maze/generate", json={"type": "bogus", "star": 1})
    assert resp.status_code == 400


def test_generate_rejects_unknown_star():
    resp = client.post("/api/maze/generate", json={"type": "pickaxe", "star": 99})
    assert resp.status_code == 400


def test_validate_round_trip_on_a_freshly_generated_maze():
    gen = client.post(
        "/api/maze/generate",
        json={"type": "pickaxe", "star": 3, "sgSeed": 5, "pathSeed": 5, "wallSeed": 5},
    )
    maze = gen.json()

    resp = client.post(
        "/api/maze/validate",
        json={
            "type": "pickaxe",
            "maze": {
                "pickaxe_count": maze["pickaxe_count"],
                "width": maze["width"],
                "height": maze["height"],
                "maze": maze["maze"],
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["solutionCount"] == 1
    assert body["trace"]
    assert body["diagnostic"] is None


def test_validate_rejects_unknown_type():
    resp = client.post(
        "/api/maze/validate",
        json={"type": "bogus", "maze": {"pickaxe_count": 1, "width": 2, "height": 2, "maze": ["s,.", ".,g"]}},
    )
    assert resp.status_code == 400

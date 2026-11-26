import json

from fastapi.testclient import TestClient

from app.main import _mount_frontend, build_csp, create_app
from tests.conftest import ok, out_of_stock
from tests.integration.test_api import csrf, sign_up


def add(client, fake_prices, url, target, *outcomes):
    fake_prices[url] = list(outcomes)
    response = client.post("/api/products", json={"url": url, "desired_price": target}, headers=csrf(client))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_summary_counts_and_schedule(client, fake_prices) -> None:
    sign_up(client)
    add(client, fake_prices, "https://www.amazon.es/dp/B000000001", 100, ok("90"))
    add(client, fake_prices, "https://www.amazon.es/dp/B000000002", 100, ok("150"))
    add(client, fake_prices, "https://www.amazon.es/dp/B000000003", 100, out_of_stock())

    data = client.get("/api/summary").json()
    assert data["products"] == {
        "total": 3,
        "below_target": 1,
        "above_target": 1,
        "unavailable": 1,
        "error": 0,
        "never_checked": 0,
    }
    assert data["checks_24h"] == 3
    assert data["failed_checks_24h"] == 0
    assert data["last_check_at"] is not None
    assert data["next_check_at"] > data["last_check_at"]
    assert data["check_interval_minutes"] == 360


def test_readings_show_previous_price_and_are_scoped(app, client, fake_prices) -> None:
    sign_up(client)
    product_id = add(client, fake_prices, "https://www.amazon.es/dp/B000000001", 100, ok("120"), ok("95"))
    client.post(f"/api/products/{product_id}/check", headers=csrf(client))

    readings = client.get("/api/readings?limit=5").json()
    assert [(r["price"], r["previous_price"]) for r in readings] == [(95.0, 120.0), (120.0, None)]
    assert readings[0]["desired_price"] == 100.0
    assert client.get(f"/api/readings?product_id={product_id}").status_code == 200

    other = TestClient(app)
    sign_up(other, "otra@example.com")
    assert other.get("/api/readings").json() == []
    assert other.get(f"/api/readings?product_id={product_id}").status_code == 404


def test_astro_pages_are_served_by_folder(tmp_path) -> None:
    (tmp_path / "entrar").mkdir()
    (tmp_path / "_astro").mkdir()
    (tmp_path / "index.html").write_text("inicio", encoding="utf-8")
    (tmp_path / "entrar" / "index.html").write_text("entrar", encoding="utf-8")
    (tmp_path / "404.html").write_text("no existe", encoding="utf-8")
    (tmp_path / "_astro" / "app.abc123.js").write_text("js", encoding="utf-8")
    application = create_app(run_lifespan=False)
    _mount_frontend(application, tmp_path)
    client = TestClient(application)

    assert client.get("/").text == "inicio"
    assert client.get("/entrar").text == "entrar"
    assert client.get("/entrar/").text == "entrar"
    asset = client.get("/_astro/app.abc123.js")
    assert "immutable" in asset.headers["cache-control"]
    missing = client.get("/no-existe")
    assert (missing.status_code, missing.text) == (404, "no existe")
    assert client.get("/api/nada").status_code == 404
    (tmp_path.parent / "secreto.txt").write_text("no", encoding="utf-8")
    assert client.get("/..%2Fsecreto.txt").text == "no existe"
    assert "default-src 'self'" in client.get("/").headers["content-security-policy"]
    legacy = client.get("/productos/12", follow_redirects=False)
    assert (legacy.status_code, legacy.headers["location"]) == (301, "/producto?id=12")


def test_csp_allows_only_the_hashed_inline_scripts(tmp_path, monkeypatch) -> None:
    from app.main import _load_script_hashes

    (tmp_path / "csp-hashes.json").write_text(
        json.dumps(["sha256-abc+/=", "'unsafe-inline'", "sha256-ok"]), encoding="utf-8"
    )
    hashes = _load_script_hashes(tmp_path)
    assert hashes == ["sha256-abc+/=", "sha256-ok"]
    csp = build_csp(hashes)
    assert "script-src 'self' 'sha256-abc+/=' 'sha256-ok';" in csp
    assert "unsafe-inline'" not in csp.split("style-src")[0]

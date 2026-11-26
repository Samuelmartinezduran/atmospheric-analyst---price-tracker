"""Recorridos completos por la API con TestClient (sin navegador real)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.routes.products import get_price_checker
from app.db.session import get_db_session
from app.main import _mount_frontend, create_app
from app.services.price_check_service import check_products
from tests.conftest import ok

PASSWORD = "UnaContraseñaLarga123"


@pytest.fixture()
def fake_prices() -> dict[str, list]:
    """Precios que devolverá el lector falso, por URL canónica."""
    return {}


@pytest.fixture()
def app(session_factory, fake_prices):
    application = create_app(run_lifespan=False)

    def db() -> Iterator:
        with session_factory() as session:
            yield session

    def checker():
        def fetch(product):
            outcomes = fake_prices.get(product.url) or [ok("100")]
            outcome = outcomes.pop(0) if len(outcomes) > 1 else outcomes[0]
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        return lambda session, ids: check_products(session, ids, fetch=fetch)

    application.dependency_overrides[get_db_session] = db
    application.dependency_overrides[get_price_checker] = checker
    return application


@pytest.fixture()
def client(app) -> TestClient:
    return TestClient(app)


def csrf(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("csrf_token", "")}


def sign_up(client: TestClient, email: str = "samuel@example.com") -> None:
    response = client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    token = response.json()["debug_token"]
    assert token, "en dev con AUTH_ENABLE_DEBUG_TOKENS el token llega en la respuesta"
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text


def test_health(client) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_unverified_login_gets_a_clear_403(client) -> None:
    client.post("/api/auth/register", json={"email": "nuevo@example.com", "password": PASSWORD})
    response = client.post("/api/auth/login", json={"email": "nuevo@example.com", "password": PASSWORD})
    assert response.status_code == 403
    assert "verificar" in response.json()["detail"]


def test_wrong_password_is_401_and_unknown_email_looks_the_same(client) -> None:
    sign_up(client)
    client.post("/api/auth/logout", headers=csrf(client))
    wrong = client.post("/api/auth/login", json={"email": "samuel@example.com", "password": "otra-cosa-123456"})
    unknown = client.post("/api/auth/login", json={"email": "nadie@example.com", "password": "otra-cosa-123456"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_registering_an_existing_email_does_not_reveal_it(client) -> None:
    first = client.post("/api/auth/register", json={"email": "ya@example.com", "password": PASSWORD})
    second = client.post("/api/auth/register", json={"email": "ya@example.com", "password": PASSWORD})
    assert first.status_code == second.status_code == 201
    assert first.json()["message"] == second.json()["message"]
    assert second.json()["debug_token"] is None


def test_debug_tokens_only_exist_in_dev(monkeypatch) -> None:
    from app.core.config import Settings

    assert Settings(app_env="dev", auth_enable_debug_tokens=True).debug_tokens_enabled is True
    assert Settings(app_env="prod", auth_enable_debug_tokens=True).debug_tokens_enabled is False


def test_products_require_a_session(client) -> None:
    assert client.get("/api/products").status_code == 401


def test_mutations_require_csrf_header(client) -> None:
    sign_up(client)
    response = client.post("/api/products", json={"url": "https://www.amazon.es/dp/B0DTHV8THW", "desired_price": 50})
    assert response.status_code == 403


def test_full_product_flow(client, fake_prices) -> None:
    sign_up(client)
    url = "https://www.amazon.es/dp/B0DTHV8THW"
    fake_prices[url] = [ok("120", title="RTX 5090"), ok("95"), ok("110")]

    created = client.post(
        "/api/products",
        json={"url": "https://www.amazon.es/Lo-Que-Sea/dp/B0DTHV8THW/ref=sr_1?th=1", "desired_price": 100},
        headers=csrf(client),
    )
    assert created.status_code == 201, created.text
    product = created.json()
    assert product["url"] == url
    assert product["title"] == "RTX 5090"
    assert product["last_price"] == 120.0
    assert product["is_below_target"] is False

    # El mismo producto con otro enlace no se duplica: se actualiza el objetivo.
    again = client.post("/api/products", json={"url": url + "?tag=x", "desired_price": 99}, headers=csrf(client))
    assert again.status_code == 200
    assert again.json()["id"] == product["id"]

    check = client.post(f"/api/products/{product['id']}/check", headers=csrf(client))
    assert check.json()["alerts_created"] == 1

    client.post("/api/jobs/check-now", headers=csrf(client))

    listed = client.get("/api/products").json()
    assert len(listed) == 1
    stats = listed[0]["stats"]
    assert (stats["lowest_price"], stats["highest_price"], stats["checks_count"]) == (95.0, 120.0, 3)
    assert stats["avg_price_30d"] == pytest.approx(108.33, abs=0.01)
    assert listed[0]["previous_price"] == 95.0

    patched = client.patch(f"/api/products/{product['id']}", json={"desired_price": 150}, headers=csrf(client))
    assert patched.status_code == 200
    assert patched.json()["desired_price"] == 150.0
    assert patched.json()["is_below_target"] is True

    history = client.get(f"/api/products/{product['id']}/history").json()
    assert [point["price"] for point in history] == [120.0, 95.0, 110.0]

    alerts = client.get("/api/alerts").json()
    assert [(a["status"], a["triggered_price"], a["attempts"]) for a in alerts] == [("pending", 95.0, 0)]

    assert client.delete(f"/api/products/{product['id']}", headers=csrf(client)).status_code == 204
    assert client.get("/api/products").json() == []


def test_unsupported_and_dangerous_urls_are_rejected(client) -> None:
    sign_up(client)
    for url in ("http://169.254.169.254/?x=amazon.es", "https://www.ebay.es/itm/123"):
        response = client.post("/api/products", json={"url": url, "desired_price": 10}, headers=csrf(client))
        assert response.status_code == 400, url


def test_users_cannot_see_each_others_products(app, fake_prices) -> None:
    alice, bob = TestClient(app), TestClient(app)
    sign_up(alice, "alice@example.com")
    sign_up(bob, "bob@example.com")
    product = alice.post(
        "/api/products", json={"url": "https://www.amazon.es/dp/B0DTHV8THW", "desired_price": 10}, headers=csrf(alice)
    ).json()
    assert bob.get("/api/products").json() == []
    assert bob.get(f"/api/products/{product['id']}/history").status_code == 404
    assert bob.patch(f"/api/products/{product['id']}", json={"desired_price": 1}, headers=csrf(bob)).status_code == 404
    assert bob.delete(f"/api/products/{product['id']}", headers=csrf(bob)).status_code == 404


def test_stores_endpoint(client) -> None:
    codes = [store["code"] for store in client.get("/api/stores").json()]
    assert codes == ["amazon_es", "pccomponentes"]


def test_spa_is_served_with_history_fallback(tmp_path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path.parent / "secreto.txt").write_text("no", encoding="utf-8")
    application = create_app(run_lifespan=False)
    _mount_frontend(application, tmp_path)
    client = TestClient(application)

    assert client.get("/productos/12").text == "<html>app</html>"
    assert client.get("/verificar?token=abc").text == "<html>app</html>"
    asset = client.get("/assets/app.js")
    assert asset.text == "console.log(1)"
    assert "immutable" in asset.headers["cache-control"]
    assert client.get("/api/no-existe").status_code == 404
    assert client.get("/..%2Fsecreto.txt").text == "<html>app</html>"
    assert "default-src 'self'" in client.get("/").headers["content-security-policy"]


def test_insecure_defaults_refuse_to_start_outside_dev() -> None:
    from app.core.config import ConfigError, Settings

    with pytest.raises(ConfigError):
        Settings(app_env="prod").assert_safe_for_runtime()
    Settings(app_env="dev").assert_safe_for_runtime()
    Settings(
        app_env="prod",
        auth_jwt_secret="x" * 40,
        database_url="postgresql+psycopg2://tracker:otra@db:5432/tracker",
    ).assert_safe_for_runtime()

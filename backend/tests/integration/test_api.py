"""Recorridos completos por la API con TestClient (sin navegador real)."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import ok

PASSWORD = "UnaContraseñaLarga123"


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


def test_registering_a_verified_email_does_not_reveal_it(client) -> None:
    sign_up(client, "ya@example.com")
    client.cookies.clear()
    again = client.post("/api/auth/register", json={"email": "ya@example.com", "password": PASSWORD})
    fresh = client.post("/api/auth/register", json={"email": "nueva@example.com", "password": PASSWORD})
    assert again.status_code == fresh.status_code == 201
    assert again.json()["message"] == fresh.json()["message"]
    assert again.json()["debug_token"] is None


def test_squatting_an_unverified_email_does_not_steal_the_account(client) -> None:
    """Regresión: quien registraba primero un email ajeno dejaba puesta su contraseña."""
    attacker = client.post(
        "/api/auth/register", json={"email": "victima@example.com", "password": "del-atacante-123456"}
    )
    victim = client.post("/api/auth/register", json={"email": "victima@example.com", "password": PASSWORD})
    old_token, new_token = attacker.json()["debug_token"], victim.json()["debug_token"]
    assert client.post("/api/auth/verify-email", json={"token": old_token}).status_code == 400
    assert client.post("/api/auth/verify-email", json={"token": new_token}).status_code == 200
    assert (
        client.post("/api/auth/login", json={"email": "victima@example.com", "password": PASSWORD}).status_code == 200
    )
    client.cookies.clear()
    stolen = client.post("/api/auth/login", json={"email": "victima@example.com", "password": "del-atacante-123456"})
    assert stolen.status_code == 401


def test_register_is_rate_limited_per_connection(client) -> None:
    codes = [
        client.post("/api/auth/register", json={"email": f"spam{i}@example.com", "password": PASSWORD}).status_code
        for i in range(7)
    ]
    assert codes[:5] == [201] * 5
    assert codes[-1] == 429


def test_debug_tokens_only_exist_in_dev_without_email() -> None:
    from app.core.config import Settings

    assert Settings(app_env="dev", auth_enable_debug_tokens=True).debug_tokens_enabled is True
    assert Settings(app_env="prod", auth_enable_debug_tokens=True).debug_tokens_enabled is False
    with_email = Settings(app_env="dev", auth_enable_debug_tokens=True, email_enabled=True, smtp_sender="a@b.es")
    assert with_email.debug_tokens_enabled is False


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


def test_insecure_configuration_refuses_to_start() -> None:
    from app.core.config import ConfigError, Settings

    strong = "x" * 40
    # Secreto vacío o corto: no arranca ni siquiera en dev (con "" se podían fabricar sesiones).
    for secret in ("", "corto"):
        with pytest.raises(ConfigError):
            Settings(app_env="dev", auth_jwt_secret=secret).assert_safe_for_runtime()
    with pytest.raises(ConfigError):
        Settings(
            app_env="prod",
            auth_jwt_secret=strong,
            database_url="postgresql+psycopg2://tracker:dev-only-password@db:5432/tracker",
        ).assert_safe_for_runtime()
    Settings(app_env="dev", auth_jwt_secret=strong).assert_safe_for_runtime()
    Settings(
        app_env="prod",
        auth_jwt_secret=strong,
        database_url="postgresql+psycopg2://tracker:otra@db:5432/tracker",
    ).assert_safe_for_runtime()


def test_tokens_signed_with_an_empty_secret_are_rejected(session, make_user) -> None:
    import jwt

    from app.services.auth_service import get_user_and_session_from_access_token

    forged = jwt.encode({"sub": "1", "sid": "1", "typ": "access", "exp": 9999999999}, "", algorithm="HS256")
    with pytest.raises(ValueError):
        get_user_and_session_from_access_token(session, forged)


def test_manual_checks_are_limited_to_protect_the_api(monkeypatch) -> None:
    from app.api.routes import products as routes

    calls = []
    monkeypatch.setattr(routes, "check_products", lambda session, ids: calls.append(ids))
    checker = routes.get_price_checker()
    for _ in range(routes.MAX_CONCURRENT_MANUAL_CHECKS):
        assert routes._manual_checks.acquire(blocking=False)
    try:
        with pytest.raises(routes.ChecksBusyError):
            checker(None, [1])
    finally:
        for _ in range(routes.MAX_CONCURRENT_MANUAL_CHECKS):
            routes._manual_checks.release()
    checker(None, [1])
    assert calls == [[1]]

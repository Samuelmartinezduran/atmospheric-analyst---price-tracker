from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.cli import create_admin, remove_admin
from app.db.models import Product, User
from tests.integration.test_api import PASSWORD, csrf, sign_up


def login(client: TestClient, email: str, password: str) -> None:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text


def test_cli_creates_a_verified_admin_with_a_generated_password(session) -> None:
    user, generated, created = create_admin(session, "Admin@Example.com", None)
    assert created and user.is_admin and user.is_email_verified
    assert user.email == "admin@example.com"
    assert generated and len(generated) >= 20


def test_cli_promotes_an_existing_account_and_resets_its_password(session, make_user) -> None:
    existing = make_user("yo@example.com")
    user, generated, created = create_admin(session, "yo@example.com", "una-contraseña-larga-1")
    assert not created and generated is None
    assert user.id == existing.id and user.is_admin
    assert remove_admin(session, "yo@example.com")
    session.refresh(user)
    assert user.is_admin is False


def test_cli_rejects_short_passwords(session) -> None:
    with pytest.raises(ValueError):
        create_admin(session, "a@example.com", "corta")


def test_regular_users_cannot_use_the_admin_api(client) -> None:
    sign_up(client)
    assert client.get("/api/auth/me").json()["is_admin"] is False
    assert client.get("/api/admin/overview").status_code == 403
    assert client.delete("/api/admin/users/1", headers=csrf(client)).status_code == 403


def test_admin_overview_and_user_deletion(client, session_factory) -> None:
    with session_factory() as db:
        create_admin(db, "admin@example.com", PASSWORD)
        victim = User(email="prueba@example.com", password_hash=None, is_email_verified=False, is_active=True)
        db.add(victim)
        db.flush()
        db.add(
            Product(
                user_id=victim.id,
                url="https://www.amazon.es/dp/B000000001",
                store="amazon_es",
                desired_price=Decimal("10"),
                currency="EUR",
                last_status="never_checked",
            )
        )
        db.commit()
        victim_id = victim.id

    login(client, "admin@example.com", PASSWORD)
    assert client.get("/api/auth/me").json()["is_admin"] is True

    data = client.get("/api/admin/overview").json()
    assert data["totals"]["users"] == 2
    assert data["totals"]["products"] == 1
    rows = {row["email"]: row for row in data["users"]}
    assert rows["prueba@example.com"]["products"] == 1
    assert rows["admin@example.com"]["is_admin"] is True
    assert rows["admin@example.com"]["last_login_at"] is not None

    admin_id = rows["admin@example.com"]["id"]
    assert client.delete(f"/api/admin/users/{admin_id}", headers=csrf(client)).status_code == 400
    assert client.delete(f"/api/admin/users/{victim_id}", headers=csrf(client)).status_code == 204
    assert client.delete(f"/api/admin/users/{victim_id}", headers=csrf(client)).status_code == 404
    after = client.get("/api/admin/overview").json()
    assert (after["totals"]["users"], after["totals"]["products"]) == (1, 0)

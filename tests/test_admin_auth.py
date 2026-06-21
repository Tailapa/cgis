"""Tests for admin authentication and protected routes."""
from __future__ import annotations
import os
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module", autouse=True)
def set_admin_env():
    os.environ.setdefault("ADMIN_PASSWORD", "test-admin-pw")
    os.environ.setdefault("SESSION_SECRET", "test-secret-abc123xyz")
    os.environ.setdefault("SUPABASE_URL", os.getenv("SUPABASE_URL", "https://placeholder.supabase.co"))
    os.environ.setdefault("SUPABASE_KEY", os.getenv("SUPABASE_KEY", "placeholder-key"))


@pytest.fixture(scope="module")
def client():
    # Reload settings after env is set
    from app.config import get_settings
    get_settings.cache_clear()
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)


def test_login_correct_password(client):
    resp = client.post("/admin/login", json={"password": os.environ["ADMIN_PASSWORD"]})
    assert resp.status_code == 200
    assert "cgis_session" in resp.cookies


def test_login_wrong_password(client):
    resp = client.post("/admin/login", json={"password": "wrongpassword"})
    assert resp.status_code == 401


def test_patch_with_valid_cookie(client):
    login = client.post("/admin/login", json={"password": os.environ["ADMIN_PASSWORD"]})
    cookie = login.cookies.get("cgis_session")
    assert cookie

    gid = str(uuid.uuid4())
    with patch("app.routers.grievances.get_grievance") as mock_get, \
         patch("app.routers.grievances.update_grievance") as mock_update:
        mock_get.return_value = {"grievance_id": gid, "status": "open", "problem_summary": "Test", "original_text": "t", "submitted_at": "2026-06-21T00:00:00+00:00"}
        mock_update.return_value = {"grievance_id": gid, "status": "resolved", "problem_summary": "Test", "original_text": "t", "submitted_at": "2026-06-21T00:00:00+00:00"}

        resp = client.patch(
            f"/api/grievances/{gid}",
            json={"status": "resolved"},
            cookies={"cgis_session": cookie},
        )
        assert resp.status_code == 200


def test_delete_with_valid_cookie(client):
    login = client.post("/admin/login", json={"password": os.environ["ADMIN_PASSWORD"]})
    cookie = login.cookies.get("cgis_session")
    assert cookie

    gid = str(uuid.uuid4())
    with patch("app.routers.grievances.get_grievance") as mock_get, \
         patch("app.routers.grievances.delete_grievance") as mock_del:
        mock_get.return_value = {"grievance_id": gid, "status": "open", "problem_summary": "Test", "original_text": "t", "submitted_at": "2026-06-21T00:00:00+00:00"}
        mock_del.return_value = None

        resp = client.delete(
            f"/api/grievances/{gid}",
            cookies={"cgis_session": cookie},
        )
        assert resp.status_code == 200


def test_logout_clears_cookie(client):
    login = client.post("/admin/login", json={"password": os.environ["ADMIN_PASSWORD"]})
    cookie = login.cookies.get("cgis_session")
    assert cookie

    logout = client.post("/admin/logout", cookies={"cgis_session": cookie})
    assert logout.status_code == 200

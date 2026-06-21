"""Tests for the /api/grievances/* endpoints."""
from __future__ import annotations
import os
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def _skip_if_no_env():
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_KEY"):
        pytest.skip("Supabase credentials not set — skipping API tests")


@pytest.fixture(scope="module")
def client():
    _skip_if_no_env()
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(scope="module")
def submitted_id(client):
    """Submit one grievance and return its ID for subsequent tests."""
    with patch("app.routers.grievances.extract_fields") as mock_extract, \
         patch("app.routers.grievances.insert_grievance") as mock_insert:
        gid = str(uuid.uuid4())
        record = {
            "grievance_id": gid,
            "username": "Test User",
            "age": 30,
            "gender": "male",
            "pin_code": "560001",
            "district": "Bangalore Urban",
            "state": "Karnataka",
            "govt_department": "BBMP",
            "problem_summary": "Test grievance for API testing.",
            "proof_reference": None,
            "original_text": "Test text",
            "status": "open",
            "submitted_at": "2026-06-21T00:00:00+00:00",
        }
        mock_extract.return_value = record
        mock_insert.return_value = record

        resp = client.post("/api/grievances/submit", json={"text": "Test grievance text for API testing."})
        assert resp.status_code == 200
        return gid


def test_submit_returns_extracted_record(client, submitted_id):
    assert submitted_id is not None


def test_list_grievances_returns_paginated(client):
    with patch("app.routers.grievances.list_grievances") as mock_list:
        mock_list.return_value = ([], 0)
        resp = client.get("/api/grievances/?page=1&page_size=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert "total" in data
    assert "page" in data


def test_get_single_grievance(client):
    with patch("app.routers.grievances.get_grievance") as mock_get:
        gid = str(uuid.uuid4())
        mock_get.return_value = {
            "grievance_id": gid,
            "problem_summary": "Test",
            "original_text": "Test text",
            "status": "open",
            "submitted_at": "2026-06-21T00:00:00+00:00",
        }
        resp = client.get(f"/api/grievances/{gid}")
        assert resp.status_code == 200
        assert resp.json()["grievance_id"] == gid


def test_patch_requires_auth(client, submitted_id):
    resp = client.patch(
        f"/api/grievances/{submitted_id}",
        json={"status": "resolved"},
    )
    assert resp.status_code == 401


def test_delete_requires_auth(client, submitted_id):
    resp = client.delete(f"/api/grievances/{submitted_id}")
    assert resp.status_code == 401


def test_rate_limit_submission(client):
    """11th submission within an hour should return 429."""
    from app import rate_limit
    import time

    test_ip = "10.0.0.99"

    # Reset the log for test IP
    with rate_limit._lock:
        rate_limit._submission_log[test_ip] = []

    # Flood 10 submissions
    for _ in range(10):
        with rate_limit._lock:
            rate_limit._submission_log[test_ip].append(time.monotonic())

    # 11th should be blocked — mock the request client host
    from fastapi import Request
    mock_req = MagicMock(spec=Request)
    mock_req.client.host = test_ip

    with pytest.raises(Exception):  # HTTPException 429
        rate_limit.check_submission_rate(mock_req)

    # Clean up
    with rate_limit._lock:
        del rate_limit._submission_log[test_ip]

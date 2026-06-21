"""Tests for the /api/dashboard/stats endpoint."""
from __future__ import annotations
import os
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


def _skip_if_no_env():
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_KEY"):
        pytest.skip("Supabase credentials not set — skipping dashboard API tests")


MOCK_STATS = {
    "kpis": {
        "total": 42,
        "open": 10,
        "resolved": 20,
        "this_week": 5,
        "departments_count": 7,
        "trend_total": 2.5,
        "trend_open": -1.0,
    },
    "status_breakdown": [
        {"status": "open", "count": 10},
        {"status": "resolved", "count": 20},
        {"status": "under_review", "count": 8},
        {"status": "rejected", "count": 4},
    ],
    "by_state": [{"state": "Karnataka", "count": 15, "open": 5, "resolved": 7, "under_review": 3}],
    "by_department": [{"dept": "BBMP", "count": 8}],
    "submissions_over_time": [{"date": "2026-06-01", "count": 3}],
    "gender_breakdown": [{"gender": "male", "count": 25}, {"gender": "female", "count": 17}],
    "age_distribution": [{"bin": "18-27", "count": 5}, {"bin": "28-37", "count": 12}],
}


@pytest.fixture(scope="module")
def client():
    from app.main import app
    return TestClient(app)


def test_dashboard_stats_returns_all_keys(client):
    with patch("app.routers.dashboard.get_dashboard_stats", return_value=MOCK_STATS):
        resp = client.get("/api/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "kpis" in data
    assert "status_breakdown" in data
    assert "by_state" in data
    assert "by_department" in data
    assert "submissions_over_time" in data
    assert "gender_breakdown" in data
    assert "age_distribution" in data


def test_kpi_values_non_negative(client):
    with patch("app.routers.dashboard.get_dashboard_stats", return_value=MOCK_STATS):
        resp = client.get("/api/dashboard/stats")
    kpis = resp.json()["kpis"]
    assert kpis["total"] >= 0
    assert kpis["open"] >= 0
    assert kpis["resolved"] >= 0
    assert kpis["this_week"] >= 0
    assert kpis["departments_count"] >= 0


def test_status_breakdown_sums_to_total(client):
    with patch("app.routers.dashboard.get_dashboard_stats", return_value=MOCK_STATS):
        resp = client.get("/api/dashboard/stats")
    data = resp.json()
    total = data["kpis"]["total"]
    status_sum = sum(s["count"] for s in data["status_breakdown"])
    assert status_sum == total


def test_response_time_under_2_seconds(client):
    with patch("app.routers.dashboard.get_dashboard_stats", return_value=MOCK_STATS):
        start = time.time()
        resp = client.get("/api/dashboard/stats")
        elapsed = time.time() - start
    assert resp.status_code == 200
    assert elapsed < 2.0, f"Response took {elapsed:.2f}s (limit 2s)"

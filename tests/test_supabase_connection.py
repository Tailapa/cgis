"""Test Supabase connectivity before running any other test."""
from __future__ import annotations
import os
import uuid

import pytest


def _skip_if_no_env():
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_KEY"):
        pytest.skip("SUPABASE_URL / SUPABASE_KEY not set — skipping connectivity tests")


@pytest.fixture(scope="module")
def client():
    _skip_if_no_env()
    from app.database import get_client
    return get_client()


def test_env_vars_set():
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    assert url.startswith("https://"), "SUPABASE_URL must start with https://"
    assert len(key) > 20, "SUPABASE_KEY looks too short"


def test_grievances_table_reachable(client):
    resp = client.table("grievances").select("grievance_id").limit(1).execute()
    assert resp.data is not None


def test_insert_and_delete_test_row(client):
    test_id = str(uuid.uuid4())
    record = {
        "grievance_id": test_id,
        "problem_summary": "TEST ROW — safe to delete",
        "original_text": "This is a connectivity test record.",
        "status": "open",
    }
    client.table("grievances").insert(record).execute()
    fetched = client.table("grievances").select("*").eq("grievance_id", test_id).single().execute()
    assert fetched.data is not None
    assert fetched.data["grievance_id"] == test_id
    client.table("grievances").delete().eq("grievance_id", test_id).execute()
    after_delete = client.table("grievances").select("*").eq("grievance_id", test_id).execute()
    assert after_delete.data == []


def test_query_sessions_table_reachable(client):
    resp = client.table("query_sessions").select("session_id").limit(1).execute()
    assert resp.data is not None


def test_query_messages_table_reachable(client):
    resp = client.table("query_messages").select("id").limit(1).execute()
    assert resp.data is not None


def test_execute_query_rpc(client):
    result = client.rpc("execute_query", {"query_text": "SELECT 1 AS val"}).execute()
    assert result.data is not None

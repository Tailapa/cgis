from __future__ import annotations
import time
from datetime import datetime, timezone, timedelta
from typing import Any
from functools import lru_cache

from supabase import create_client, Client

from .config import get_settings

_settings = get_settings()

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(_settings.SUPABASE_URL, _settings.SUPABASE_KEY)
    return _client


# ── Dashboard stats cache ────────────────────────────────────────────────────

_stats_cache: dict | None = None
_stats_ts: float = 0.0
_STATS_TTL = 60.0


def insert_grievance(record: dict) -> dict:
    client = get_client()
    resp = client.table("grievances").insert(record).execute()
    return resp.data[0]


def get_grievance(grievance_id: str) -> dict | None:
    client = get_client()
    resp = client.table("grievances").select("*").eq("grievance_id", grievance_id).maybe_single().execute()
    return resp.data if resp else None


def list_grievances(
    filters: dict | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "submitted_at",
    sort_desc: bool = True,
) -> tuple[list[dict], int]:
    client = get_client()
    filters = filters or {}

    query = client.table("grievances").select("*", count="exact")
    if filters.get("state"):
        query = query.ilike("state", filters["state"])
    if filters.get("department"):
        query = query.ilike("govt_department", filters["department"])
    if filters.get("status"):
        query = query.eq("status", filters["status"])
    if filters.get("search"):
        search = filters["search"]
        query = query.or_(
            f"username.ilike.%{search}%,district.ilike.%{search}%,govt_department.ilike.%{search}%"
        )

    offset = (page - 1) * page_size
    order_col = sort_by if sort_by in {"submitted_at", "username", "state", "status"} else "submitted_at"
    query = query.order(order_col, desc=sort_desc).range(offset, offset + page_size - 1)

    resp = query.execute()
    return resp.data, resp.count or 0


def update_grievance(grievance_id: str, updates: dict) -> dict:
    allowed = {"status", "internal_notes"}
    safe = {k: v for k, v in updates.items() if k in allowed}
    client = get_client()
    resp = client.table("grievances").update(safe).eq("grievance_id", grievance_id).execute()
    return resp.data[0]


def delete_grievance(grievance_id: str) -> None:
    client = get_client()
    client.table("grievances").delete().eq("grievance_id", grievance_id).execute()


def get_dashboard_stats() -> dict:
    global _stats_cache, _stats_ts
    if _stats_cache and (time.monotonic() - _stats_ts) < _STATS_TTL:
        return _stats_cache

    client = get_client()

    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=7)).isoformat()
    prev_week_start = (now - timedelta(days=14)).isoformat()

    # total, open, resolved, this_week
    all_rows = client.table("grievances").select("status, state, govt_department, gender, age, submitted_at").execute().data or []

    total = len(all_rows)
    open_count = sum(1 for r in all_rows if r["status"] == "open")
    resolved_count = sum(1 for r in all_rows if r["status"] == "resolved")
    this_week = sum(1 for r in all_rows if r.get("submitted_at", "") >= week_start)
    prev_week = sum(1 for r in all_rows if prev_week_start <= r.get("submitted_at", "") < week_start)

    departments = {r["govt_department"] for r in all_rows if r.get("govt_department")}

    def trend(curr: int, prev: int) -> float:
        if prev == 0:
            return 0.0
        return round((curr - prev) / prev * 100, 1)

    prev_open = sum(1 for r in all_rows if r["status"] == "open" and r.get("submitted_at", "") < week_start)

    # Status breakdown
    status_map: dict[str, int] = {}
    for r in all_rows:
        s = r["status"]
        status_map[s] = status_map.get(s, 0) + 1
    status_breakdown = [{"status": k, "count": v} for k, v in status_map.items()]

    # By state (top 10)
    state_map: dict[str, dict] = {}
    for r in all_rows:
        st = r.get("state") or "Unknown"
        if st not in state_map:
            state_map[st] = {"state": st, "count": 0, "open": 0, "resolved": 0, "under_review": 0}
        state_map[st]["count"] += 1
        if r["status"] == "open":
            state_map[st]["open"] += 1
        elif r["status"] == "resolved":
            state_map[st]["resolved"] += 1
        elif r["status"] == "under_review":
            state_map[st]["under_review"] += 1
    by_state = sorted(state_map.values(), key=lambda x: x["count"], reverse=True)[:10]

    # By department
    dept_map: dict[str, int] = {}
    for r in all_rows:
        d = r.get("govt_department") or "Unknown"
        dept_map[d] = dept_map.get(d, 0) + 1
    by_department = [{"dept": k, "count": v} for k, v in sorted(dept_map.items(), key=lambda x: x[1], reverse=True)]

    # Submissions over time (last 30 days)
    thirty_days_ago = (now - timedelta(days=30)).date()
    day_map: dict[str, int] = {}
    for r in all_rows:
        dt_str = r.get("submitted_at", "")
        if dt_str:
            try:
                day = dt_str[:10]
                if day >= str(thirty_days_ago):
                    day_map[day] = day_map.get(day, 0) + 1
            except Exception:
                pass
    submissions_over_time = [{"date": k, "count": v} for k, v in sorted(day_map.items())]

    # Gender breakdown
    gender_map: dict[str, int] = {}
    for r in all_rows:
        g = r.get("gender") or "not_specified"
        gender_map[g] = gender_map.get(g, 0) + 1
    gender_breakdown = [{"gender": k, "count": v} for k, v in gender_map.items()]

    # Age distribution
    bins = ["0-17", "18-27", "28-37", "38-47", "48-57", "58-67", "68+"]
    bin_map = {b: 0 for b in bins}
    for r in all_rows:
        age = r.get("age")
        if age is not None:
            try:
                a = int(age)
                if a < 18:
                    bin_map["0-17"] += 1
                elif a <= 27:
                    bin_map["18-27"] += 1
                elif a <= 37:
                    bin_map["28-37"] += 1
                elif a <= 47:
                    bin_map["38-47"] += 1
                elif a <= 57:
                    bin_map["48-57"] += 1
                elif a <= 67:
                    bin_map["58-67"] += 1
                else:
                    bin_map["68+"] += 1
            except Exception:
                pass
    age_distribution = [{"bin": k, "count": v} for k, v in bin_map.items()]

    stats = {
        "kpis": {
            "total": total,
            "open": open_count,
            "resolved": resolved_count,
            "this_week": this_week,
            "departments_count": len(departments),
            "trend_total": trend(this_week, prev_week),
            "trend_open": trend(open_count, prev_open),
        },
        "status_breakdown": status_breakdown,
        "by_state": by_state,
        "by_department": by_department,
        "submissions_over_time": submissions_over_time,
        "gender_breakdown": gender_breakdown,
        "age_distribution": age_distribution,
    }

    _stats_cache = stats
    _stats_ts = time.monotonic()
    return stats


def invalidate_stats_cache() -> None:
    global _stats_cache, _stats_ts
    _stats_cache = None
    _stats_ts = 0.0


# ── Chat sessions ─────────────────────────────────────────────────────────────

def create_session() -> str:
    client = get_client()
    resp = client.table("query_sessions").insert({}).execute()
    return resp.data[0]["session_id"]


def get_session_messages(session_id: str) -> list[dict]:
    client = get_client()
    resp = (
        client.table("query_messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return resp.data or []


def save_message(session_id: str, role: str, content: str, sql_query: str | None = None) -> None:
    client = get_client()
    client.table("query_messages").insert(
        {"session_id": session_id, "role": role, "content": content, "sql_query": sql_query}
    ).execute()
    client.table("query_sessions").update({"last_active": datetime.now(timezone.utc).isoformat()}).eq(
        "session_id", session_id
    ).execute()


def list_sessions() -> list[dict]:
    client = get_client()
    resp = (
        client.table("query_sessions")
        .select("session_id, created_at, last_active")
        .order("last_active", desc=True)
        .limit(50)
        .execute()
    )
    return resp.data or []


def execute_raw_query(sql: str) -> list[dict]:
    client = get_client()
    resp = client.rpc("execute_query", {"query_text": sql}).execute()
    data = resp.data
    if isinstance(data, list):
        return data
    if data is None:
        return []
    return data


def seed_test_data() -> None:
    """Insert 20 sample grievances for visual testing."""
    import uuid
    from datetime import datetime, timezone, timedelta
    import random

    states = ["Karnataka", "Rajasthan", "Bihar", "Maharashtra", "Tamil Nadu", "Uttar Pradesh", "West Bengal"]
    depts = ["BBMP", "PWD", "PHED", "UPPCL", "Municipal Corporation", "PHC", "Revenue Department"]
    statuses = ["open", "open", "open", "under_review", "resolved", "rejected"]
    names = ["Rajesh Kumar", "Sunita Sharma", "Amit Verma", "Priya Singh", "Suresh Goud", "Murugan", "Anita Patel"]

    records = []
    for i in range(20):
        submitted = (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30))).isoformat()
        records.append({
            "grievance_id": str(uuid.uuid4()),
            "username": names[i % len(names)],
            "age": random.randint(20, 65),
            "gender": random.choice(["male", "female", "other"]),
            "pin_code": f"{random.randint(100000, 999999)}",
            "district": f"District {i+1}",
            "state": states[i % len(states)],
            "govt_department": depts[i % len(depts)],
            "problem_summary": f"Sample grievance #{i+1}: infrastructure issue requiring attention.",
            "proof_reference": f"REF/2026/{1000+i}" if i % 3 == 0 else None,
            "original_text": f"This is sample grievance text #{i+1} for testing purposes.",
            "status": statuses[i % len(statuses)],
            "submitted_at": submitted,
        })

    client = get_client()
    client.table("grievances").insert(records).execute()
    print(f"Inserted {len(records)} test grievances.")

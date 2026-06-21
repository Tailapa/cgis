from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from ..auth import require_admin
from ..database import (
    delete_grievance,
    get_grievance,
    insert_grievance,
    invalidate_stats_cache,
    list_grievances,
    update_grievance,
)
from ..extraction import extract_fields
from ..rate_limit import check_submission_rate

router = APIRouter(prefix="/api/grievances", tags=["grievances"])


class SubmitRequest(BaseModel):
    text: str


class UpdateRequest(BaseModel):
    status: Optional[str] = None
    internal_notes: Optional[str] = None


@router.post("/submit")
async def submit_grievance(body: SubmitRequest, request: Request):
    check_submission_rate(request)
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="Grievance text cannot be empty")
    record = extract_fields(body.text)
    stored = insert_grievance(record)
    invalidate_stats_cache()
    return stored


@router.get("/")
async def list_all_grievances(
    state: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("submitted_at"),
    sort_desc: bool = Query(True),
):
    filters = {
        "state": state,
        "department": department,
        "status": status,
        "search": search,
    }
    data, total = list_grievances(filters, page, page_size, sort_by, sort_desc)
    return {"data": data, "total": total, "page": page, "page_size": page_size}


@router.get("/{grievance_id}")
async def get_single_grievance(grievance_id: str):
    record = get_grievance(grievance_id)
    if not record:
        raise HTTPException(status_code=404, detail="Grievance not found")
    return record


@router.patch("/{grievance_id}")
async def patch_grievance(grievance_id: str, body: UpdateRequest, request: Request):
    require_admin(request)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No valid fields to update")
    if "status" in updates and updates["status"] not in ("open", "under_review", "resolved", "rejected"):
        raise HTTPException(status_code=422, detail="Invalid status value")
    record = update_grievance(grievance_id, updates)
    invalidate_stats_cache()
    return record


@router.delete("/{grievance_id}")
async def remove_grievance(grievance_id: str, request: Request):
    require_admin(request)
    existing = get_grievance(grievance_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Grievance not found")
    delete_grievance(grievance_id)
    invalidate_stats_cache()
    return {"deleted": grievance_id}

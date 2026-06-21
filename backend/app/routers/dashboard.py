from fastapi import APIRouter
from ..database import get_dashboard_stats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats():
    return get_dashboard_stats()

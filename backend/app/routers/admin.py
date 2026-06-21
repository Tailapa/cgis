from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from ..auth import create_session_token, require_admin
from ..config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def admin_login(body: LoginRequest, response: Response):
    settings = get_settings()
    token = create_session_token(body.password)
    response.set_cookie(
        key="cgis_session",
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=86400 * 7,
    )
    return {"status": "ok"}


@router.post("/logout")
async def admin_logout(response: Response):
    response.delete_cookie(key="cgis_session")
    return {"status": "ok"}


@router.get("/check")
async def admin_check(request: Request):
    require_admin(request)
    return {"authenticated": True}

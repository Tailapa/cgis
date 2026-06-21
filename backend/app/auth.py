from __future__ import annotations
import time
from datetime import datetime, timezone

import jwt
from fastapi import Cookie, HTTPException, Request, status

from .config import get_settings

_ALG = "HS256"
_TTL = 86400 * 7  # 7 days


def create_session_token(password: str) -> str:
    settings = get_settings()
    if password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")
    payload = {"sub": "admin", "iat": int(time.time()), "exp": int(time.time()) + _TTL}
    return jwt.encode(payload, settings.SESSION_SECRET, algorithm=_ALG)


def _decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.SESSION_SECRET, algorithms=[_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")


def require_admin(request: Request) -> None:
    token = request.cookies.get("cgis_session")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    _decode_token(token)

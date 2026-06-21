from __future__ import annotations
import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status

_lock = Lock()

# {ip: [(timestamp, count), ...]}
_submission_log: dict[str, list[float]] = defaultdict(list)
_chat_log: dict[str, list[float]] = defaultdict(list)

_SUBMISSION_LIMIT = 10  # per hour per IP
_CHAT_LIMIT = 30        # per hour per session
_WINDOW = 3600.0


def _prune(log: list[float]) -> list[float]:
    cutoff = time.monotonic() - _WINDOW
    return [t for t in log if t > cutoff]


def check_submission_rate(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    with _lock:
        _submission_log[ip] = _prune(_submission_log[ip])
        if len(_submission_log[ip]) >= _SUBMISSION_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded: max 10 submissions per hour",
            )
        _submission_log[ip].append(time.monotonic())


def check_chat_rate(session_id: str) -> None:
    with _lock:
        _chat_log[session_id] = _prune(_chat_log[session_id])
        if len(_chat_log[session_id]) >= _CHAT_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded: max 30 messages per session per hour",
            )
        _chat_log[session_id].append(time.monotonic())

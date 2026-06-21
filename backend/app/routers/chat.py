from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth import require_admin
from ..chatbot import chatbot_turn
from ..database import create_session, get_session_messages, list_sessions
from ..rate_limit import check_chat_rate

router = APIRouter(prefix="/api/chat", tags=["chat"])


class MessageRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


@router.post("/message")
async def send_message(body: MessageRequest):
    session_id = body.session_id
    if not session_id:
        session_id = create_session()

    check_chat_rate(session_id)

    if not body.question.strip():
        raise HTTPException(status_code=422, detail="Question cannot be empty")

    result = chatbot_turn(body.question, session_id)
    result["session_id"] = session_id
    return result


@router.post("/session")
async def new_session():
    session_id = create_session()
    return {"session_id": session_id}


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    messages = get_session_messages(session_id)
    return {"session_id": session_id, "messages": messages}


@router.get("/sessions")
async def get_sessions(request: Request):
    require_admin(request)
    return list_sessions()

from __future__ import annotations
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .routers import grievances, dashboard, chat, admin

app = FastAPI(title="Citizen Grievance Intelligence System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(grievances.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(admin.router)

# Serve the built Vite frontend
_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if _dist.exists():
    @app.get("/chat")
    async def serve_chat():
        return FileResponse(str(_dist / "chat.html"))

    @app.get("/admin")
    async def serve_admin_page():
        return FileResponse(str(_dist / "admin.html"))

    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")

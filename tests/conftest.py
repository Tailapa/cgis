"""Shared pytest fixtures for CGIS backend tests."""
from __future__ import annotations
import os
import sys
from pathlib import Path

import pytest

# Make sure the backend package is importable
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))


@pytest.fixture(scope="session", autouse=True)
def load_env():
    """Load .env from project root if present."""
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path)

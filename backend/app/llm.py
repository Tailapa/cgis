from __future__ import annotations
from .config import get_settings
from openai import OpenAI

_settings = get_settings()


def get_llm_client():
    """Return an OpenAI-compatible client — Groq if key set, else OpenRouter."""
    if _settings.GROQ_API_KEY:
        from groq import Groq
        return Groq(api_key=_settings.GROQ_API_KEY)
    else:
        return OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=_settings.OPENROUTER_API_KEY,
        )

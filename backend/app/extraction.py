from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone

from .config import get_settings
from .llm import get_llm_client

_settings = get_settings()

SYSTEM_PROMPT = """You are a grievance intake officer for an Indian government portal.
A citizen has submitted a complaint in free text — it may be in English,
Hinglish, Hindi, or any Indian language. Extract the structured fields
from the text. Be precise: only extract what is explicitly stated or
strongly implied. Do not invent information. If a field is not mentioned,
return null. problem_summary is always required — write it as a single
clear, factual sentence describing the core problem.

Return a JSON object with exactly these keys:
{
  "username": string or null,
  "age": integer or null,
  "gender": "male" or "female" or "other" or null,
  "pin_code": string (6-digit) or null,
  "district": string or null,
  "state": string or null,
  "govt_department": string or null,
  "problem_summary": string (required),
  "proof_reference": string or null
}"""


def extract_fields(raw_text: str) -> dict:
    if len(raw_text) > 50000:
        raw_text = raw_text[:50000] + " [...input truncated]"

    client = get_llm_client()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Extract structured fields from this grievance submission:\n\n{raw_text}"},
    ]

    response = client.chat.completions.create(
        model=_settings.MODEL,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=1024,
    )

    raw_json = response.choices[0].message.content
    extracted = json.loads(raw_json)

    # Normalise / validate
    gender = extracted.get("gender")
    if gender and gender.lower() not in ("male", "female", "other"):
        gender = None

    age = extracted.get("age")
    if age is not None:
        try:
            age = int(age)
            if age < 0 or age > 150:
                age = None
        except (TypeError, ValueError):
            age = None

    problem_summary = extracted.get("problem_summary") or "Grievance submitted — details not extracted."

    record = {
        "grievance_id": str(uuid.uuid4()),
        "username": extracted.get("username"),
        "age": age,
        "gender": gender,
        "pin_code": extracted.get("pin_code"),
        "district": extracted.get("district"),
        "state": extracted.get("state"),
        "govt_department": extracted.get("govt_department"),
        "problem_summary": problem_summary,
        "proof_reference": extracted.get("proof_reference"),
        "original_text": raw_text,
        "status": "open",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    return record

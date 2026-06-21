"""Tests for the LLM extraction pipeline."""
from __future__ import annotations
import os
import uuid

import pytest


def _skip_if_no_llm():
    if not os.getenv("GROQ_API_KEY") and not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("No LLM API key set — skipping LLM extraction tests")


FULL_ENGLISH = (
    "My name is Rajesh Kumar, 42, male, Indiranagar, Bengaluru (PIN 560038), Karnataka. "
    "Streetlights on 100 Feet Road have not been working for 3 weeks. "
    "Very dangerous for pedestrians. Complained to BBMP local office — no action taken. "
    "I have the complaint acknowledgment letter dated June 12 as proof."
)

PARTIAL_TEXT = "The road has potholes. Nobody is fixing it."

HINGLISH_TEXT = (
    "Mera naam Priya Singh hai, 31 saal, female. "
    "Main Lucknow ke Gomti Nagar (PIN 226010), UP mein rehti hoon. "
    "Pichle 2 hafte se hamare area mein roz 8-10 ghante bijli nahi aati. "
    "UPPCL ke number pe call karo toh line engage rehti hai. "
    "Mere paas complaint receipt number UP/LKO/2026/7712 hai."
)


@pytest.fixture(scope="module")
def extraction():
    _skip_if_no_llm()
    from app.extraction import extract_fields
    return extract_fields


def test_full_english_extraction(extraction):
    result = extraction(FULL_ENGLISH)
    assert result["username"] is not None
    assert "Rajesh" in result["username"]
    assert result["age"] == 42
    assert result["gender"] == "male"
    assert result["pin_code"] == "560038"
    assert result["state"] is not None
    assert "Karnataka" in result["state"]
    assert result["problem_summary"]


def test_partial_text_null_fields(extraction):
    result = extraction(PARTIAL_TEXT)
    assert result["username"] is None
    assert result["age"] is None
    assert result["problem_summary"]  # always required


def test_hinglish_no_error(extraction):
    result = extraction(HINGLISH_TEXT)
    assert result["problem_summary"]
    assert result["pin_code"] == "226010"


def test_always_has_problem_summary(extraction):
    result = extraction("Bad roads.")
    assert isinstance(result["problem_summary"], str)
    assert len(result["problem_summary"]) > 0


def test_input_clamped_at_50000():
    from app.extraction import extract_fields
    _skip_if_no_llm()
    long_text = "A" * 60000
    result = extract_fields(long_text)
    # Should not raise; problem_summary should still be populated
    assert result["problem_summary"]


def test_returns_valid_uuid(extraction):
    result = extraction(FULL_ENGLISH)
    uid = result["grievance_id"]
    parsed = uuid.UUID(uid)
    assert str(parsed) == uid

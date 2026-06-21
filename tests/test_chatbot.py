"""Tests for the text-to-SQL chatbot agent."""
from __future__ import annotations
import os

import pytest


def _skip_if_no_llm():
    if not os.getenv("GROQ_API_KEY") and not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("No LLM API key set — skipping chatbot tests")

def _skip_if_no_db():
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_KEY"):
        pytest.skip("Supabase credentials not set — skipping chatbot DB tests")


@pytest.fixture(scope="module")
def chatbot_mod():
    _skip_if_no_llm()
    import app.chatbot as mod
    return mod


def test_generate_sql_count_question(chatbot_mod):
    sql = chatbot_mod.generate_sql("How many grievances are in the database?", [])
    assert sql.strip().upper().startswith("SELECT")
    assert "COUNT" in sql.upper() or "grievances" in sql.lower()


def test_generate_sql_filter_query(chatbot_mod):
    sql = chatbot_mod.generate_sql("Show all open complaints from Karnataka", [])
    assert sql.strip().upper().startswith("SELECT")
    assert "Karnataka" in sql or "karnataka" in sql.lower() or "ILIKE" in sql.upper()


def test_generate_sql_raises_for_non_select(monkeypatch, chatbot_mod):
    """If the model somehow returns non-SELECT we should raise."""
    from unittest.mock import MagicMock, patch

    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock()]
    mock_resp.choices[0].message.content = "DELETE FROM grievances"

    with patch.object(chatbot_mod, "get_llm_client") as mock_client:
        mock_instance = MagicMock()
        mock_instance.chat.completions.create.return_value = mock_resp
        mock_client.return_value = mock_instance
        with pytest.raises(ValueError, match="non-SELECT"):
            chatbot_mod.generate_sql("Delete everything", [])


def test_execute_sql_returns_list(chatbot_mod):
    _skip_if_no_db()
    results = chatbot_mod.execute_sql("SELECT COUNT(*) AS cnt FROM grievances")
    assert isinstance(results, list)


def test_execute_sql_raises_for_non_select(chatbot_mod):
    with pytest.raises(ValueError, match="Only SELECT"):
        chatbot_mod.execute_sql("DROP TABLE grievances")


def test_synthesise_answer_non_empty(chatbot_mod):
    answer = chatbot_mod.synthesise_answer(
        question="How many grievances?",
        sql="SELECT COUNT(*) AS cnt FROM grievances",
        results=[{"cnt": 42}],
        history=[],
    )
    assert isinstance(answer, str)
    assert len(answer) > 0


def test_multi_turn_history_used(chatbot_mod):
    """Second question should reference first via history."""
    history = [
        {"role": "user", "content": "How many grievances are open?"},
        {"role": "assistant", "content": "There are 10 open grievances."},
    ]
    sql = chatbot_mod.generate_sql("Of those, how many are from Karnataka?", history)
    assert sql.strip().upper().startswith("SELECT")

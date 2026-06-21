from __future__ import annotations
import re
from typing import Any

from .config import get_settings
from .llm import get_llm_client
from . import database

_settings = get_settings()

TABLE_SCHEMA = """
Table: grievances
Columns:
  grievance_id   uuid
  username       text (citizen name)
  age            integer
  gender         text  -- values: 'male', 'female', 'other', or NULL
  pin_code       text
  district       text
  state          text
  govt_department text
  problem_summary text
  proof_reference text (NULL if no proof)
  original_text  text
  submitted_at   timestamptz
  status         text  -- values: 'open', 'under_review', 'resolved', 'rejected'
  internal_notes text

Database: PostgreSQL (via Supabase).
Use ILIKE for case-insensitive text search.
Return SELECT queries ONLY. No INSERT/UPDATE/DELETE/DROP.
Always alias aggregations clearly (e.g. COUNT(*) AS count).
"""

SQL_SYSTEM = f"""You are a PostgreSQL query generator for a citizen grievance database.
{TABLE_SCHEMA}
Given a user question and optional conversation history, produce a single valid SELECT query.
Return ONLY the raw SQL — no markdown fences, no explanation.
"""

ANSWER_SYSTEM = """You are an analyst summarising query results for a citizen grievance portal.
Given a user question, the SQL used, and the results, produce a concise natural-language answer.
Be factual and precise. If results are empty, say so clearly.
If the question refers to previous context, use the history to give a coherent answer.
"""


def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:sql)?\s*", "", text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text.strip())
    return text.strip()


def generate_sql(question: str, history: list[dict]) -> str:
    client = get_llm_client()

    messages = [{"role": "system", "content": SQL_SYSTEM}]
    for msg in history[-10:]:
        if msg["role"] in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": question})

    response = client.chat.completions.create(
        model=_settings.MODEL,
        messages=messages,
        temperature=0.0,
        max_tokens=512,
    )

    sql = _strip_fences(response.choices[0].message.content)

    first_word = sql.strip().split()[0].upper() if sql.strip() else ""
    if first_word != "SELECT":
        raise ValueError(f"LLM returned non-SELECT query: {sql[:200]}")

    return sql


def execute_sql(sql: str) -> list[dict]:
    sql = sql.strip().rstrip(";").strip()
    first_word = sql.split()[0].upper() if sql else ""
    if first_word != "SELECT":
        raise ValueError("Only SELECT queries are permitted")
    return database.execute_raw_query(sql)


def synthesise_answer(question: str, sql: str, results: list[Any], history: list[dict]) -> str:
    client = get_llm_client()

    row_count = len(results) if results else 0
    results_text = str(results[:50]) if results else "[]"

    messages = [{"role": "system", "content": ANSWER_SYSTEM}]
    for msg in history[-6:]:
        if msg["role"] in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    user_msg = (
        f"Question: {question}\n\n"
        f"SQL used:\n{sql}\n\n"
        f"Results ({row_count} rows):\n{results_text}"
    )
    messages.append({"role": "user", "content": user_msg})

    response = client.chat.completions.create(
        model=_settings.MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
    )
    return response.choices[0].message.content.strip()


def chatbot_turn(question: str, session_id: str) -> dict:
    history_rows = database.get_session_messages(session_id)
    history = [{"role": r["role"], "content": r["content"]} for r in history_rows]

    sql = generate_sql(question, history)
    results = execute_sql(sql)
    answer = synthesise_answer(question, sql, results, history)

    database.save_message(session_id, "user", question)
    database.save_message(session_id, "assistant", answer, sql_query=sql)

    return {"answer": answer, "sql": sql, "row_count": len(results) if results else 0}

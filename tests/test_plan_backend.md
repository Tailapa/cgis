# Backend Test Plan

## Supabase Connectivity (`test_supabase_connection.py`)

- [x] `SUPABASE_URL` and `SUPABASE_KEY` are set and correctly formatted
- [x] `grievances` table is reachable via the Data API
- [x] A test row can be inserted and deleted
- [x] `query_sessions` and `query_messages` tables are reachable
- [x] `execute_query` RPC function exists and returns results for a simple SELECT

## Extraction Pipeline (`test_extraction.py`)

- [x] Extracts all fields correctly from a complete English grievance text
- [x] Returns null for missing fields from a partial text
- [x] Handles Hinglish text without error
- [x] Always populates `problem_summary`
- [x] Clamps input text at 50,000 characters
- [x] Returns a valid UUID for `grievance_id`

## Chatbot Agent (`test_chatbot.py`)

- [x] `generate_sql` produces a valid SELECT query for a simple count question
- [x] `generate_sql` correctly handles a filter query ("from Karnataka")
- [x] `generate_sql` raises if output is not a SELECT
- [x] `execute_sql` returns results for a valid query
- [x] `execute_sql` raises for non-SELECT input
- [x] Multi-turn: second question uses context from first
- [x] `synthesise_answer` returns non-empty string

## Grievances API (`test_grievances_api.py`)

- [x] `POST /api/grievances/submit` returns 200 with extracted record
- [x] `GET /api/grievances/` returns paginated list
- [x] `GET /api/grievances/{id}` returns correct record
- [x] `PATCH /api/grievances/{id}` returns 401 without admin cookie
- [x] `DELETE /api/grievances/{id}` returns 401 without admin cookie
- [x] Rate limit: 11th submission within an hour returns 429

## Dashboard API (`test_dashboard_api.py`)

- [x] `GET /api/dashboard/stats` returns all required keys
- [x] KPI values are non-negative integers
- [x] Status breakdown sums to total
- [x] Response time under 2 seconds

## Admin Authentication (`test_admin_auth.py`)

- [x] `POST /admin/login` with correct password returns 200 and sets cookie
- [x] `POST /admin/login` with wrong password returns 401
- [x] `PATCH /api/grievances/{id}` with valid admin cookie returns 200
- [x] `DELETE /api/grievances/{id}` with valid admin cookie returns 200
- [x] `POST /admin/logout` clears the cookie

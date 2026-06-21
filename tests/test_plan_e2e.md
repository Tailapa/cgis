# End-to-End Docker Test Plan

Run these steps after `docker build` completes.

## Docker Build

- [ ] `docker build -t cgis-app .` completes without error

## Container Start

- [ ] `docker run -d --name cgis-test -p 8000:8000 --env-file .env cgis-app` starts
- [ ] `docker ps` shows container running after 90 seconds

## HTTP Smoke Tests

- [ ] `curl http://localhost:8000/` returns 200
- [ ] `curl http://localhost:8000/api/dashboard/stats` returns valid JSON with `kpis` key

## API Integration

- [ ] Submit a grievance via curl:
  ```bash
  curl -s -X POST http://localhost:8000/api/grievances/submit \
    -H "Content-Type: application/json" \
    -d '{"text":"My name is Test, I live in Bengaluru. Streetlights broken on main road."}' | jq .
  ```
  Confirm 200 response with extracted fields.

- [ ] Send a chatbot message via curl:
  ```bash
  curl -s -X POST http://localhost:8000/api/chat/message \
    -H "Content-Type: application/json" \
    -d '{"question":"How many grievances are in the database?","session_id":null}' | jq .
  ```
  Confirm answer and sql fields in response.

- [ ] Admin login via curl:
  ```bash
  curl -sc /tmp/cookies.txt -X POST http://localhost:8000/admin/login \
    -H "Content-Type: application/json" \
    -d '{"password":"YOUR_ADMIN_PASSWORD"}' | jq .
  ```
  Confirm `{"status":"ok"}` and cookie set.

## Full Playwright Suite Against Container

- [ ] Run `TEST_BASE_URL=http://localhost:8000 npx playwright test`
- [ ] All Playwright tests pass with screenshots

## Log Check

- [ ] `docker logs cgis-test` shows no ERROR lines

## Cleanup

- [ ] Delete test grievance records from Supabase
- [ ] `docker stop cgis-test && docker rm cgis-test`

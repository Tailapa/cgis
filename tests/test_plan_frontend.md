# Frontend / Playwright Test Plan

## Dashboard (`test_ui.spec.ts` — Dashboard describe block)

- [x] Page loads at `/` without errors
- [x] All 5 KPI cards render with numeric values
- [x] All 6 charts render (canvas elements present and non-empty)
- [x] Grievance table renders with at least one row (after seeding test data)
- [ ] Clicking a chart segment adds a filter chip and updates the table
- [ ] Clear All button removes filter chips
- [x] Chatbot bubble trigger button visible bottom-right
- [x] Clicking bubble trigger opens the chat panel
- [ ] Sending a message in the bubble panel returns a response
- [x] Screenshot: `dashboard-desktop.png`
- [x] Screenshot at 375px: `dashboard-mobile.png`

## Submission Modal (`test_ui.spec.ts` — Submission Modal describe block)

- [x] Submit Grievance button opens modal
- [x] Submitting text shows confirmation card with grievance ID
- [x] Screenshot: `submission-confirm.png`

## Chatbot Page (`test_ui.spec.ts` — Chatbot Page describe block)

- [x] `/chat` loads without errors
- [x] Example chips visible on load
- [x] Clicking a chip submits the question
- [x] Response appears with answer text
- [x] SQL `<details>` block present below response
- [x] Screenshot: `chat-desktop.png`

## Admin Page (`test_ui.spec.ts` — Admin Page describe block)

- [x] `/admin` shows login form without cookie
- [x] Wrong password shows error
- [x] Correct password shows admin dashboard
- [x] Sidebar shows grievance list
- [x] Clicking a row shows detail panel
- [ ] Status dropdown changes status on Save
- [x] Screenshot: `admin-desktop.png`
- [x] Screenshot at 375px: `admin-mobile.png`

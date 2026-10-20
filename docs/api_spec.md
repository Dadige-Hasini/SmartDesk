# SmartDesk — REST API Specification

All API endpoints reside under `/api` and adhere to JSON request and response payloads.

## Standard Response Format
```json
// Success
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}

// Error
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "BAD_REQUEST",
    "details": ["Title is required"]
  }
}
```

## Core Endpoints Overview

### 1. System & Health
- `GET /api/health` — Basic liveness probe (HTTP 200).
- `GET /api/ready` — Readiness probe (checks DB & storage connectivity).

### 2. Authentication & Profile
- `POST /api/auth/register/student` — Register student account.
- `POST /api/auth/register/staff` — Register staff account (`PENDING_APPROVAL`).
- `GET /api/auth/me` — Current authenticated user profile with role.
- `PATCH /api/auth/profile` — Update permitted profile fields.

### 3. Tickets
- `POST /api/tickets` — Create a new ticket (with optional attachments).
- `GET /api/tickets` — List tickets with search, filters, sorting, pagination.
- `GET /api/tickets/:id` — Retrieve ticket details with permission check.
- `PATCH /api/tickets/:id/status` — State machine transition.
- `POST /api/tickets/:id/reopen` — Reopen ticket within 7 days.
- `POST /api/tickets/:id/comments` — Add comment (public or internal).
- `GET /api/tickets/:id/comments` — List comments (internal comments filtered for students).
- `POST /api/tickets/:id/attachments` — Upload attachment files.
- `GET /api/tickets/:id/attachments/:attachmentId/signed-url` — Get authorized download URL.
- `POST /api/tickets/:id/rate` — Submit feedback/rating for resolved ticket.

### 4. AI & Knowledge
- `POST /api/ai/chat` — Conversational RAG with college document citations.
- `POST /api/ai/suggest-ticket` — AI assistance to draft category, title, description.
- `POST /api/ai/feedback` — Submit thumbs-up/down on AI answers.
- `POST /api/ai/summarize-ticket` — Staff summary generator for resolved tickets.
- `POST /api/ai/classify` — Predict ticket category and department from text.

### 5. Staff & Administration
- `GET /api/admin/staff/pending` — List pending staff approvals.
- `PATCH /api/admin/staff/:id/approve` — Approve staff account.
- `PATCH /api/admin/staff/:id/suspend` — Suspend staff account.
- `GET /api/admin/metrics` — Global ticket, SLA, and AI deflection metrics.
- `POST /api/admin/announcements` — Publish system announcements.
- `GET /api/admin/audit-logs` — Paginated system audit records.

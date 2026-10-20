# SmartDesk — Master Project Specification

**Project:** SmartDesk — AI-Powered College Student Help Desk  
**Document type:** Authoritative product, architecture, security, and implementation specification  
**Version:** 1.0  
**Status:** Baseline specification for phased implementation

---

## 1. Purpose and product vision

SmartDesk is a full-stack college support portal for students, departmental staff, and Super Administrators. Students can ask an AI assistant questions about college procedures, find answers in approved knowledge sources, raise and track support tickets, exchange messages with staff, upload permitted attachments, and rate resolutions.

Staff manage tickets routed to their authorized departments. Super Administrators manage staff approvals, departments, categories, routing rules, service-level agreements (SLAs), announcements, knowledge sources, and audits.

The system must be useful without AI. Students must always be able to create a ticket directly, even if an AI provider is unavailable.

## 2. Goals

1. Provide secure, role-based college support.
2. Track each ticket from creation through resolution and closure.
3. Route tickets to the correct department and staff member.
4. Keep student-visible messages separate from internal staff notes.
5. Provide searchable, approved college FAQs and documents.
6. Use Generative AI (GenAI) to answer supported questions with source citations and assist with ticket drafting.
7. Use Deep Learning (DL) techniques for semantic retrieval and ticket classification, with reproducible evaluation.
8. Provide meaningful dashboards, SLA tracking, and audit history.
9. Support local development, testing, and deployment with documented configuration.

## 3. Non-goals and boundaries

- Do not train a large language model from scratch.
- Do not let an LLM make authoritative payment, academic eligibility, disciplinary, access-control, or staff-approval decisions.
- Do not let AI submit a ticket without explicit student confirmation.
- Do not expose private tickets, internal notes, or confidential grievances to general AI retrieval.
- Do not claim an external integration or test passed unless it was actually verified.
- Do not use fake dashboard metrics in production.
- Do not make AI a mandatory step before ticket submission.

## 4. Technology stack

### Frontend
- React, Vite, JavaScript ES modules, JSX
- Tailwind CSS
- React Router
- Axios
- TanStack Query
- Recharts
- React Hot Toast
- React Dropzone
- date-fns
- DOMPurify
- Supabase JavaScript client for supported client-side Auth and Realtime use

### Backend
- Node.js and Express using ES modules
- Supabase JavaScript client
- express-validator or Zod for validation
- Helmet, CORS, express-rate-limit
- Nodemailer with a configured SMTP/transactional email provider
- Structured logging and request IDs
- Centralized error handling

### Data and infrastructure
- Supabase PostgreSQL
- Supabase Auth
- Row Level Security (RLS)
- Supabase Storage with private buckets
- Supabase Realtime
- PostgreSQL `pgvector`
- Versioned SQL migrations

### AI/ML
- An LLM API accessed only by the server
- A configurable embedding model
- Retrieval-Augmented Generation (RAG)
- Embedding-based or pretrained transformer ticket classification
- Reproducible evaluation scripts and metrics

### Testing
- Vitest
- React Testing Library
- Supertest
- Browser-based end-to-end tests using available Antigravity browser tools or Playwright if configured

Use compatible, maintained package versions. Avoid duplicate packages and unnecessary dependencies.

## 5. Architecture and trust boundaries

Use a single repository:

```text
smartdesk/
  client/
    src/
      api/
      components/
      context/
      hooks/
      layouts/
      pages/
      routes/
      styles/
      utils/
    public/
    package.json
    vite.config.js
  server/
    src/
      config/
      controllers/
      middleware/
      routes/
      services/
      repositories/
      validators/
      jobs/
      utils/
      app.js
      server.js
    tests/
    package.json
  supabase/
    migrations/
    seed.sql
    config.toml
  scripts/
  docs/
    IMPLEMENTATION_PLAN.md
  tests/
  package.json
  .env.example
  .gitignore
  README.md
```

The structure may evolve when there is a clear reason, but separation of concerns must be preserved.

### Responsibilities
- **React:** presentation, form validation, route navigation, query caching, and authorized realtime UI subscriptions.
- **Express:** trusted business operations, authorization checks, ticket lifecycle, staff approval, AI provider calls, email jobs, exports, audit events, and SLA jobs.
- **Supabase Auth:** identity and session management.
- **PostgreSQL:** relational data, constraints, transactions, search metadata, and audit records.
- **RLS:** database-level least-privilege protection for exposed tables.
- **Supabase Storage:** private attachment and document storage.
- **pgvector:** semantic similarity retrieval.
- **LLM/embedding provider:** text generation and vector generation, called server-side only.

Do not issue a second, incompatible custom JWT system. The Express API must validate Supabase access tokens using a supported verification method and then enforce current account status and role on the server. Do not trust role claims or IDs supplied by the browser without validation.

## 6. Roles and account states

### Roles
- `STUDENT`
- `STAFF`
- `SUPER_ADMIN`

### Account states
Use explicit account states, for example:
- `PENDING_APPROVAL`
- `ACTIVE`
- `SUSPENDED`
- `REJECTED` where applicable

A student account may become active after successful registration and any configured verification. Staff accounts must remain pending until approved by a Super Admin. Suspended accounts must not use protected application operations.

Public registration must never allow a user to assign themselves `SUPER_ADMIN`. The initial Super Admin must be provisioned through a documented, trusted, server-side development/administrative procedure. Do not ship default production credentials.

### Registration fields
Student:
- Name
- Roll number
- Department
- Year
- Email
- Password

Staff:
- Name
- Employee ID
- Department
- Email
- Password
- Pending approval state

Validate unique roll numbers and employee IDs where applicable. Normalize email addresses and enforce appropriate uniqueness.

## 7. Ticket model and lifecycle

### Core fields
A ticket should include:
- Internal UUID primary key
- Unique human-readable ticket number
- Title and description
- Category reference
- Priority
- Status
- Creator reference
- Assignee reference, optional
- Student's academic department
- Assigned/responsible department
- Tags
- Created, updated, and resolved timestamps
- SLA due timestamp and pause intervals where applicable
- Resolution summary
- Visibility/confidentiality fields where needed

Keep the student's academic department separate from the department responsible for resolving the ticket. Category-to-department routing must be configurable.

### Categories
- Fee
- ID Card
- Timetable
- Library
- Hostel
- Grievance
- Academic
- Transport
- Exam
- Other

Categories must be managed through database records, not hardcoded in multiple frontend and backend files.

### Priorities
- Low
- Medium
- High
- Urgent

### Statuses
- `OPEN`
- `IN_PROGRESS`
- `AWAITING_INFO`
- `RESOLVED`
- `CLOSED`
- `REJECTED`

### Lifecycle rules
- Students create tickets in `OPEN`.
- Authorized staff can claim or assign tickets and move them to `IN_PROGRESS`.
- Staff can request more information, moving the ticket to `AWAITING_INFO`.
- A student response may move the ticket back to `IN_PROGRESS` according to policy.
- Staff resolve tickets with a resolution summary.
- Closure follows a documented college policy.
- A student may reopen a closed ticket once within seven days, subject to authorization.
- Rejection requires a reason and follows a documented appeal or clarification policy.
- Invalid transitions must be rejected by the backend.
- Every meaningful status, assignment, priority, or department change must create an audit/history event.

Generate ticket numbers atomically using a database sequence or transaction-safe counter, e.g. `TKT-YYYYMMDD-0001`. Never generate identifiers by counting existing tickets.

### Ratings
A student may rate an eligible resolved/closed ticket from 1 to 5 stars and optionally provide feedback. Enforce one rating per ticket using a database constraint.

## 8. Comments, attachments, and notifications

### Comments
Each comment contains ticket, author, role/identity reference, body, visibility, and timestamp. Visibility must be explicit, e.g. `PUBLIC` or `INTERNAL`.

- Students may read and create permitted public comments only.
- Staff may create internal notes only within authorized ticket scope.
- Student API responses must not include internal notes.
- Attachments inherit the visibility and access rules of their parent comment or ticket.

### Attachments
- Maximum three files per ticket creation request.
- Maximum 5 MB per file.
- Allowed types: approved images, PDF, DOCX.
- Validate file extension, MIME type, file signature, size, and authorization.
- Use private Supabase Storage buckets.
- Store metadata and storage paths in PostgreSQL, not file contents.
- Authorize each download against the ticket and comment visibility.
- Use short-lived signed URLs or an equivalent secure download path.
- Define cleanup for orphaned files and document retention.

### Notifications and email
Create in-app notifications for ticket creation, assignment, status changes, comments, resolution, reopening, announcements, and other configured events.

Notification features:
- Unread count
- Mark one or all as read
- Per-event email preferences
- Duplicate-send protection
- Email delivery status and retries

Email delivery must be asynchronous. A mail-provider failure must not undo a committed ticket update. Use an outbox/job pattern or equivalent reliable mechanism.

## 9. SLA and metrics

Super Admin can configure SLA targets by priority and optionally category/department. Define whether targets use calendar hours or working hours.

Metrics must have documented definitions:
- First response time: creation to first public staff response.
- Resolution time: creation to the policy-defined resolution point.
- SLA compliance: eligible tickets resolved within target.
- Overdue tickets: active tickets past deadline.
- Satisfaction: average valid student rating.
- Reopened rate: tickets reopened under the configured policy.

Specify how unresolved tickets, paused waiting periods, reopened tickets, and time zones affect calculations. Store UTC timestamps and display times in `Asia/Kolkata`. Use server-side scheduled work, not browser timers, for SLA checks and escalations.

## 10. AI assistant and RAG

### User experience
The AI assistant must:
- Answer common college questions from approved, current knowledge.
- Show source citations with document title and relevant section.
- Ask clarifying questions when needed.
- Offer a ticket when the answer is insufficient or the student wants staff help.
- Suggest ticket title, description, category, priority, and responsible department.
- Let the student review and explicitly submit a ticket draft.
- Support safe fallback when the AI service is unavailable.

### Knowledge ingestion pipeline
1. Authorized administrator uploads or registers a source document.
2. Extract text from supported PDF, DOCX, or text formats.
3. Normalize and chunk the text while preserving document metadata.
4. Generate embeddings using a configured model.
5. Store document metadata, version, chunk text, visibility, approval status, and vector embedding.
6. Retrieve only approved, current, authorized passages.
7. Generate an answer from the retrieved passages.
8. Return citations and an evidence/abstention indicator.
9. Re-index updated documents and prevent retired versions from being used.

### AI safety
- Do not expose LLM or embedding secrets to the frontend.
- Apply authentication where appropriate, rate limits, input limits, timeouts, and budget controls.
- Treat user messages and retrieved documents as untrusted content.
- Prompt-injection attempts must not override system instructions.
- Do not retrieve internal notes, private tickets, or confidential grievances for general knowledge.
- Do not claim a payment or transaction succeeded unless an authorized system verifies it.
- AI predictions are suggestions, not authorization decisions.
- If evidence is insufficient, say so and offer human support.
- Ticket creation must remain available without AI.

### Suggested API endpoints
- `POST /api/ai/chat`
- `POST /api/ai/suggest-ticket`
- `POST /api/ai/feedback`
- `POST /api/ai/summarize-ticket`

Use consistent request/response validation and documented error codes.

## 11. Deep Learning and evaluation

Implement measurable ML functionality:
- Transformer or embedding-based semantic retrieval.
- Ticket intent/category prediction.
- Similar-ticket and FAQ suggestions.
- Reproducible evaluation scripts.
- Admin metrics for AI usage and feedback.

Where labeled data is available, split data into training, validation, and test sets. Prevent near-duplicate leakage across splits. Report appropriate metrics, including accuracy, precision, recall, macro-F1, confusion matrix, and retrieval Recall@5 where applicable.

If labeled data is insufficient, use a pretrained model or embedding baseline and document the limitation. Never fabricate training results or present synthetic evaluation as real-world performance. Track model, dataset, configuration, and evaluation versions.

## 12. FAQ and knowledge base

Public guests may view only published, approved FAQs. Features:
- Search and category filtering
- Accessible accordion UI
- Helpful/unhelpful votes with abuse prevention
- Staff FAQ drafts from eligible resolved tickets
- Admin review, approval, publication, editing, and retirement
- Document versioning and freshness
- Source references shared with AI responses

Only authorized users can approve or publish knowledge. Retired or outdated content must not remain eligible for AI retrieval.

## 13. Dashboards

### Student
- Total tickets
- Open tickets
- Resolved tickets
- Average resolution time
- Recent tickets and status timeline
- Quick-create ticket
- AI assistant
- Notifications
- Profile and preferences

### Staff
- Assigned tickets
- Pending tickets
- Resolved today
- First response and resolution metrics
- Priority-sorted queue
- Filters and bulk actions
- Tickets-over-time line chart
- Category pie chart
- Status donut chart
- Satisfaction and SLA metrics

### Super Admin
- Global ticket statistics
- Department-wise performance
- Staff approval/suspension
- Department/category/routing management
- SLA policies and overdue escalation
- Announcements
- Audit log
- Authorized CSV exports
- AI usage, feedback, retrieval quality, and ticket-deflection metrics

Use real database data, documented metric definitions, loading states, and access controls. Never hardcode production statistics.

## 14. Search, filtering, and pagination

Support:
- Ticket number, title, and description search
- Category, status, priority, department, assignee, and date filters
- Sorting by newest, oldest, priority, and last updated
- URL query parameters reflecting shareable filters
- Server-side pagination, default 10 items per page
- Appropriate indexes and bounded query limits

Do not expose tickets through global search unless the current user is authorized to access them.

## 15. UI/UX requirements

Use a modern, clean, mobile-first design:
- Primary navy `#1a1a2e`
- Coral accent `#e94560` and restrained amber accents
- Accessible contrast and keyboard navigation
- Responsive navbar and sidebar
- Dark mode stored in localStorage
- Skeleton loading states
- Empty and error states
- Color-coded status badges
- Breadcrumbs on detail pages
- Confirmation dialogs for destructive actions
- Inline form validation
- Toast feedback
- Accessible charts, tables, and dialogs
- AI chat with citations, retry, feedback, and ticket handoff

Avoid decorative UI that is not connected to functioning actions.

## 16. Security requirements

- Validate Supabase access tokens using a supported server-side method.
- Check account status and current role on protected operations.
- Enable RLS on exposed tables.
- Use least-privilege grants and policies.
- Never trust client-supplied roles, ownership IDs, or department permissions.
- Keep service-role/secret keys and AI credentials server-only.
- Validate all POST/PUT/PATCH inputs and request sizes.
- Use parameterized queries or safe Supabase query APIs.
- Configure CORS for the intended frontend origin.
- Use Helmet and rate limits.
- Use secure cookie/session settings where applicable.
- Restrict file uploads and downloads.
- Avoid logging tokens, passwords, confidential grievance details, or unnecessary personal data.
- Add audit events for privileged actions.
- Test denied access as thoroughly as permitted access.

## 17. API conventions and error handling

All custom Express API responses use:

```json
{
  "success": true,
  "message": "Human-readable message",
  "data": {}
}
```

Use suitable HTTP status codes and a consistent error shape, such as `success: false`, `message`, and a safe error code. Do not expose stack traces or secrets to clients.

Use async/await, centralized error handling, request IDs, structured logs, input validation, and clear service boundaries.

## 18. Environment configuration

Create `.env.example` with safe placeholders. Include the configuration required by the actual implementation, such as:
- `NODE_ENV`
- `PORT`
- `CLIENT_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` or the SDK-appropriate public key variable
- Server-only Supabase secret/service-role credential if needed
- LLM provider API key and model
- Embedding model and vector dimensions
- SMTP/email configuration

Use `VITE_` variables only for values safe to expose in the browser. Never place privileged Supabase or AI secrets in a Vite-exposed variable.

## 19. Development scripts and seed data

Root scripts should support:
- Starting client and server concurrently
- Running client/server tests
- Running lint/build checks
- Applying database migrations where supported
- Seeding development data

Seed development data for one Super Admin, three approved staff in separate departments, ten students, twenty tickets across categories/statuses, example FAQs, routing rules, and SLA policies. Use clearly labeled demonstration knowledge documents.

Never ship default production credentials. Use a secure documented process to provision the development Super Admin.

## 20. Testing and acceptance criteria

Test:
- Registration, login, logout, session restoration, and password reset
- Pending staff approval and suspended accounts
- Role-based authorization and RLS
- Cross-student and cross-department access denial
- Ticket ownership, transitions, assignment, unique ticket IDs, and reopening
- Internal-note privacy
- Attachment validation and download authorization
- Notification deduplication and email failure handling
- FAQ publication and document retirement
- AI citations, insufficient evidence, prompt injection, rate limits, and provider failure
- Classifier evaluation and retrieval metrics
- Dashboard metrics and export permissions
- Frontend production build
- End-to-end student-to-staff resolution

A phase is complete only when implementation exists, relevant tests have been run, actual failures are fixed, and limitations are documented. Do not claim unexecuted tests passed.

## 21. Definition of done

The project is considered ready for a release candidate when:
- All required core flows work end-to-end.
- Database migrations are reproducible.
- RLS and API authorization tests pass.
- The frontend production build passes.
- The AI works with configured credentials and safely degrades without them.
- No secret is exposed in the frontend build.
- Setup, migrations, seeding, deployment, and troubleshooting are documented.
- Remaining limitations are listed honestly.

When external credentials or services are unavailable, implement the safe integration boundary and mocks for testing, document the exact setup steps, and do not claim live integration has been verified.

## 22. Agent working protocol

Work in phases using `docs/IMPLEMENTATION_PLAN.md`.

Before each phase:
1. Read this specification and the implementation plan.
2. Inspect current files and identify dependencies.
3. State a concise plan and acceptance criteria.

During each phase:
1. Implement real files and working code.
2. Preserve working features and avoid unnecessary rewrites.
3. Run relevant commands and tests.
4. Fix failures rather than suppressing them.
5. Update documentation and the checklist.

At phase completion, report:
- Files created/changed
- Features implemented
- Commands/tests actually executed and their results
- Configuration still required
- Known issues and acceptance criteria status

Implement Phase 0 only when first instructed. Do not silently advance through all phases.

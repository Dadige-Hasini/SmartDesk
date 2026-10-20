# SmartDesk — Master Implementation Plan

## 1. Project Overview
SmartDesk is an AI-powered college student support portal built with modern full-stack engineering standards. It provides college students with grounded, document-backed AI answers, formal departmental ticketing, automated routing, SLA compliance tracking, and private attachment handling.

---

## 2. Architecture & Technology Stack Alignment

| Tier | Technology | Purpose & Architectural Justification |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite | Rapid ESM build cycles, reactive component tree, SPA routing |
| **Styling** | Tailwind CSS | Utility-first CSS configured with custom brand palette (Navy `#1a1a2e`, Coral `#e94560`, Amber) |
| **State & Cache** | TanStack Query v5 | Server-state caching, optimistic updates, request deduplication |
| **Routing** | React Router v7 | Nested layouts, protected role-based routes, query-param filtering |
| **Backend API** | Node.js + Express (ESM) | High throughput, modular ES modules, structured middleware pipeline |
| **Security** | Helmet, CORS, Rate Limit | Defensive HTTP headers, origin restriction, DDoS/brute-force defense |
| **Database** | Supabase PostgreSQL 15 | Relational integrity, ACID transactions, relational constraints |
| **Vector Engine** | PostgreSQL `pgvector` | In-database 768-dim vector embeddings and cosine similarity search |
| **Authorization** | PostgreSQL RLS | Zero-trust database-level security policies |
| **Storage** | Supabase Storage (Private) | Private buckets with short-lived signed URLs |
| **AI / ML** | Gemini / OpenAI + RAG | Server-side document chunk retrieval and grounded response generation |
| **Email** | Nodemailer | Asynchronous SMTP transactional notification delivery |
| **Testing** | Vitest + Supertest + RTL | Unit, integration, and component testing across client and server |

---

## 3. Phase-by-Phase Implementation Roadmap

### Phase 0: Workspace Foundation & Architecture Setup (Current Phase)
- **Objective**: Establish the repository foundation, development environment, tooling, security base, and verified entry points.
- **Dependencies**: None.
- **Deliverables**:
  - Root monorepo orchestration with `package.json`, `.gitignore`, `.env.example`, `README.md`.
  - Scaffolding of `client/`, `server/`, `supabase/`, `docs/`, `scripts/`, `tests/`.
  - Express server with ES modules, Helmet, CORS, Rate Limiter, Request ID middleware, Structured Logger, Centralized Error Handler, and standard response envelope `{ success, message, data }`.
  - Health & readiness endpoints: `GET /api/health`, `GET /api/ready`.
  - React + Vite client with Tailwind CSS, custom color palette, dark mode context, Axios client with interceptors, and root responsive layout.
  - Vite development proxy routing `/api` requests to Express on port 5000.
  - Comprehensive master plan in `docs/IMPLEMENTATION_PLAN.md`.
- **Acceptance Criteria**:
  - `npm test` runs both server and client tests with 100% pass rate.
  - Client production build succeeds without errors.
  - Express health endpoint responds with HTTP 200 and standard envelope.
  - React dev server loads successfully via browser/HTTP probe.
- **Risks & Mitigations**:
  - *Risk*: Dependency mismatch between client/server. *Mitigation*: Separate scoped `package.json` files unified by root npm scripts.

---

### Phase 1: Database Schema, Security (RLS) & Migrations
- **Objective**: Design and migrate the relational database schema, configure RLS, and populate reproducible seed data.
- **Dependencies**: Phase 0.
- **Deliverables**:
  - 18 PostgreSQL tables: `profiles`, `departments`, `categories`, `category_routing_rules`, `tickets`, `ticket_comments`, `attachments`, `ticket_events`, `ratings`, `notifications`, `notification_preferences`, `faqs`, `knowledge_documents`, `document_chunks`, `sla_policies`, `announcements`, `email_jobs`, `audit_events`.
  - Transactional sequence function for collision-free ticket IDs (`TKT-YYYYMMDD-0001`).
  - Row Level Security (RLS) policies for Student, Staff, and Super Admin personas.
  - `pgvector` extension setup with vector cosine index (`HNSW` / `IVFFlat`).
  - Seed script provisioning: 1 Super Admin, 3 Staff across departments, 10 Students, 20 sample tickets across all categories and statuses, FAQs, and SLA policies.
- **Acceptance Criteria**:
  - Migrations execute cleanly from clean database state.
  - Foreign keys, check constraints, and unique indexes validated.
  - RLS prevents student A from accessing student B's tickets.
  - Ticket ID generator produces contiguous, collision-free numbers under concurrency.
- **Risks & Mitigations**:
  - *Risk*: Concurrent ticket insertions cause duplicate numbers. *Mitigation*: Use PostgreSQL atomic sequence or row-level locked transaction (`FOR UPDATE`).

---

### Phase 2: Authentication, Authorization & User Management
- **Objective**: Implement secure authentication, profile management, and role-based access control.
- **Dependencies**: Phase 1.
- **Deliverables**:
  - Student registration endpoint (roll number, department, year, email, password).
  - Staff registration endpoint (employee ID, department, email, password) with default `PENDING_APPROVAL` status.
  - Super Admin staff management APIs (approve, suspend, reactivate).
  - Server-side JWT verification and profile lookup middleware.
  - Client authentication context and role-based protected routes (`<ProtectedRoute allowedRoles={['STUDENT']} />`).
- **Acceptance Criteria**:
  - Unapproved staff cannot access operational ticketing features.
  - Clients cannot elevate their own roles via payload injection.
  - Student, Staff, and Super Admin sessions persist and refresh securely.
- **Risks & Mitigations**:
  - *Risk*: Spoofed role claims from client tokens. *Mitigation*: Always re-verify user role directly against database `profiles` on protected server routes.

---

### Phase 3: Core Ticket Management & Lifecycle Engine
- **Objective**: Build the finite-state ticket machine, category-to-department routing, and triage tools.
- **Dependencies**: Phase 2.
- **Deliverables**:
  - Ticket creation endpoint with dynamic category-to-department resolution.
  - Finite-state transition validator: `OPEN` → `IN_PROGRESS` → `AWAITING_INFO` → `RESOLVED` → `CLOSED` / `REJECTED`.
  - Append-only `ticket_events` audit logger tracking every status, assignment, and priority change.
  - Single reopen policy (within 7 days of resolution timestamp).
  - Rejection reason enforcement and resolution summary requirements.
  - Query engine supporting search, category/status/priority filters, date ranges, sorting, and pagination with URL sync.
  - Confidential grievance access protection.
- **Acceptance Criteria**:
  - Invalid state transitions (e.g. `CLOSED` → `AWAITING_INFO`) return HTTP 400.
  - Ticket reopening fails if attempted after 7 days or more than once.
  - Grievance tickets inaccessible to unauthorized departmental staff.
- **Risks & Mitigations**:
  - *Risk*: Data leakage between departments. *Mitigation*: Enforce departmental filtering in both Express controller logic and PostgreSQL RLS.

---

### Phase 4: Comments, Attachments & Notifications
- **Objective**: Enable secure communication, controlled file uploads, and multi-channel notifications.
- **Dependencies**: Phase 3.
- **Deliverables**:
  - Public comments vs private internal notes (internal notes stripped from student API responses).
  - Attachment upload endpoint: up to 3 files, 5MB max, PDF/DOCX/Images, MIME and magic-byte validation.
  - Private Supabase Storage integration with short-lived signed download URLs.
  - In-app notification creation with Supabase Realtime subscriptions.
  - Asynchronous email queue worker (`email_jobs`) with exponential backoff retries and delivery tracking.
- **Acceptance Criteria**:
  - Internal staff notes never appear in student network payloads.
  - Malicious files (e.g. executables renamed to `.pdf`) rejected by magic-byte validator.
  - Email failures do not roll back successful ticket status updates.
- **Risks & Mitigations**:
  - *Risk*: Public attachment access. *Mitigation*: Private buckets only; signed URLs expire in 5 minutes and require authenticated ownership check.

---

### Phase 5: AI & Deep Learning Integration (RAG + Classifier)
- **Objective**: Implement grounded college policy RAG assistant and ticket intent/category text classifier.
- **Dependencies**: Phase 1, Phase 3.
- **Deliverables**:
  - Document ingestion pipeline: text extraction, chunking with metadata (title, section, department).
  - Vector embedding generation (768-dim) and pgvector semantic retrieval.
  - RAG conversational endpoint (`POST /api/ai/chat`) with source citations and confidence-based abstention.
  - Ticket drafting assistant (`POST /api/ai/suggest-ticket`) requiring explicit student confirmation before submission.
  - Text classification model for ticket category/department intent with reproducible evaluation pipeline (accuracy, precision, recall, F1).
  - Resilient fallback handling when AI APIs are unreachable.
- **Acceptance Criteria**:
  - Queries lacking supporting document chunks trigger grounded abstention and offer ticket creation.
  - AI cannot autonomously submit tickets or mutate permissions.
  - Text classifier evaluation script outputs measurable classification metrics on benchmark dataset.
- **Risks & Mitigations**:
  - *Risk*: AI hallucinations or prompt injection. *Mitigation*: Strict ground-truth prompt template, untrusted input isolation, and citation checks.

---

### Phase 6: Dashboards, UI/UX Polish & Analytics
- **Objective**: Create specialized dashboards for Student, Staff, and Super Admin personas with rich aesthetics.
- **Dependencies**: Phase 3, Phase 4, Phase 5.
- **Deliverables**:
  - Student Dashboard: ticket counters, activity timeline, AI quick-help widget, notification panel.
  - Staff Dashboard: department triage queue, priority sorting, SLA breach countdowns, resolution charts (Recharts).
  - Super Admin Dashboard: system-wide SLA metrics, staff approvals, category routing rules, audit viewer, AI deflection analytics.
  - UI refinement: Deep Navy `#1a1a2e`, Coral `#e94560`, Amber accents, dark mode toggle, skeleton loaders, confirmation dialogs, toast alerts.
- **Acceptance Criteria**:
  - All metrics computed dynamically from real database records (no hardcoded statistics).
  - High accessibility: contrast ratios conform to WCAG AA, full keyboard navigation support.
- **Risks & Mitigations**:
  - *Risk*: Performance degradation on large datasets. *Mitigation*: Server-side aggregation, indexed date queries, and TanStack Query pagination caching.

---

### Phase 7: End-to-End Testing, Security Auditing & Verification
- **Objective**: Conduct comprehensive regression, integration, browser E2E tests, and security audits.
- **Dependencies**: Phases 1 through 6.
- **Deliverables**:
  - Full API integration test suite covering every lifecycle transition.
  - Browser-based end-to-end test of the complete lifecycle: Student registration → AI query → Ticket submission → Staff claim → Resolution → Student rating.
  - Security audit: RLS verification, role escalation attack testing, input sanitization check, rate-limiting verification.
  - Production build verification and deployment guide.
- **Acceptance Criteria**:
  - All test suites pass with zero failures.
  - Zero high or critical security vulnerabilities in custom code.
  - Complete operational documentation provided in `README.md`.

---

---

## 4. Current Phase Status

- **Completed**:
  - **Phase 0**: Workspace Foundation & Architecture Setup
  - **Supabase Integration Milestone**:
    - Browser-safe frontend Supabase client (`client/src/config/supabase.js`) and AuthContext (`client/src/context/AuthContext.jsx`).
    - Server-side Supabase client with role separation (`server/src/config/supabase.js`).
    - Environment templates configured with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CLIENT_URL`, `PORT`.
    - Native Supabase Auth token validation and RBAC middleware (`server/src/middleware/auth.js`).
    - Versioned SQL migrations for `departments` and `profiles` with least-privilege RLS policies and auth trigger (`supabase/migrations/20261020000001_departments_and_profiles.sql`).
    - Frontend route protection foundation (`ProtectedRoute.jsx`, `LoginPage.jsx`, `RegisterPage.jsx`).
    - Super Admin provisioning script (`scripts/provision-super-admin.js`) and documentation (`docs/supabase_setup.md`).
    - Full test suite passing (20/20 unit/integration tests).
- **Next Phase**: Full Phase 1 (Remaining Database Schema Tables: categories, routing rules, tickets, comments, attachments, vector index, and seed scripts).

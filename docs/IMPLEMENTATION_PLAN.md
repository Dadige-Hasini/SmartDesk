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
    - Versioned SQL migrations for `departments` and `profiles` with least-privilege RLS policies and auth trigger.
  - **Phase 2**: Complete SmartDesk Ticket System
    - Dynamic category-to-department routing rules.
    - Transactional human-readable ticket ID generation (`TKT-YYYYMMDD-XXXX`).
    - Deterministic finite-state machine (`OPEN`, `IN_PROGRESS`, `AWAITING_INFO`, `RESOLVED`, `CLOSED`, `REJECTED`).
    - Append-only ticket event auditing, staff claim, resolution summaries, and rejection reasons.
    - Single reopening within 7 days rule.
    - Star ratings (1-5) and feedback collection.
    - URL query-synced filtering, sorting, pagination, and authorized CSV export.
  - **Phase 3**: Comments, Attachments, Notifications & Email Outbox
    - Public comments and isolated staff internal notes.
    - Magic-byte file validator for PDF, DOCX, PNG, JPEG, WEBP with 5 MB / 3 files limit.
    - In-app notification creation with unread counter and mark-as-read.
    - Per-event email notification preferences and outbox table (`email_jobs`) with deduplication.
  - **Phase 4**: Complete SmartDesk Student Experience
    - Student Dashboard (`/dashboard`) powered by real API data (`totalTickets`, `openTickets`, `resolvedTickets`, `averageResolutionTime`).
    - Dedicated Create Ticket Page & Form (`/tickets/new`) with field-level validation and drag-and-drop attachments.
    - My Tickets queue (`/tickets`) with live search, URL-synced filters, sorting, and pagination.
    - Ticket Detail View (`/tickets/:id`) with activity timeline, public discussion, rating widget, and reopening support.
    - Student Profile Page (`/profile`) with verified academic records and contact details editor.
    - In-app Notifications Dropdown (`NotificationsBell.jsx`), Notifications Center (`NotificationsPage.jsx`), and Event Preferences modal.
    - Timezone standardization: All UI timestamps formatted in `Asia/Kolkata` (`IST`, UTC+05:30) while persisting UTC timestamps.
    - Persistent Dark/Light theme mode.
    - **Phase 5**: Staff & Super Admin Portals, Metrics & Governance
    - Departmental ticket queue with strict departmental isolation and multi-factor sorting (priority, age, SLA deadline).
    - Queue filtering by status, priority, category, assignee, date range, and keyword search.
    - Quick ticket claim, single assignment, and bulk multi-ticket assignment.
    - Status management with mandatory resolution summaries and rejection reasons.
    - Recharts visual analytics: Tickets-over-time line chart (14-day window), category distribution pie chart, and status breakdown donut chart.
    - Real-time KPI cards: Average response time, average resolution time, SLA compliance rate, and satisfaction scores.
    - Super Admin Operations Center (`/admin`): Global university-wide stats, department-wise performance scorecard, staff account approvals, suspensions with mandatory reason, and document approval permission toggling (`can_approve_documents`).
    - Administrative management for departments, categories, routing rules, SLA policies, and campus bulletins/announcements with audience visibility.
    - Server-side scheduled SLA watchdog daemon (`sla.worker.js`) running every 30 seconds independently of browser sessions.
    - Formal metric definitions document (`docs/PHASE5_METRICS_AND_GOVERNANCE.md`) detailing treatment of reopened tickets, paused SLAs (`AWAITING_INFO`), and unresolved cases.
    - 100% test pass rate across backend (64 tests across 6 suites) and client (18 tests across 4 suites) with clean production build.
  - **Phase 6**: Production-Oriented AI Assistant & Grounded RAG Pipeline
    - Complete RAG Pipeline with Document Ingestion: Admin document upload for PDF, DOCX, TXT, MD via `pdf-parse` and `mammoth` with section-aware chunking and token counting.
    - Supabase PostgreSQL with `pgvector` (`vector(768)`): Stored chunks, document versioning, departmental metadata, HNSW cosine index, and `match_document_chunks` RPC similarity search.
    - Provider-Independent LLM Interface (`llm.provider.interface.js`): Base contract with unified `generateCompletion` and `validateConfig`. Concrete providers for Google Gemini (`gemini.provider.js`), OpenAI (`openai.provider.js`), and deterministic test/offline fallback (`mock.provider.js`).
    - Configurable Embedding Service (`embedding.service.js`): 768-dimensional normalized embeddings with Google Gemini / OpenAI embeddings and deterministic cosine-preserving fallback.
    - Grounded Q&A Controller (`POST /api/ai/chat`): Injects retrieved knowledge chunks into strict system prompt forbidding hallucinations or ungrounded claims. Returns source citations with document titles and sections, confidence scoring, and evidence verification indicator (`hasSufficientEvidence`).
    - Grounded Abstention & Fallback: Generates explicit abstention when evidence is insufficient and automatically offers ticket creation handoff.
    - AI Ticket Assistance (`POST /api/ai/suggest-ticket`): Analyzes inquiries to suggest category, responsible department, title, description, priority, and missing information. Validated by deterministic server rules, requiring student review and explicit submission.
    - Helpfulness Feedback Loop (`POST /api/ai/feedback`): Records thumbs up/down, feedback reasons, and citations in `ai_feedback` table.
    - Staff Ticket Summarization (`POST /api/ai/summarize-ticket`): Generates executive ticket summaries restricted strictly to authorized department staff and Super Admins (enforces 403 Forbidden on department mismatches).
    - Security & Prompt Injection Defense: Neutralizes adversarial prompts attempting to override college rules or simulate transactions. Never exposes LLM API keys to browser. Rate limiting (30 req/min) and 1,000 char input limits.
    - React Frontend AI Interface: Dedicated AI Assistant Page (`/ai-chat`), floating AI Chat Widget (`AiChatWidget.jsx`), conversation history, citations accordion, evidence badge, quick prompt chips, and prefilled ticket handoff to `CreateTicketPage.jsx`.
    - Verification & Testing: 100% test pass rate across all 7 backend test suites (77 tests) and all 5 client test suites (23 tests). Verified via browser subagent recording (`phase6_ai_assistant_verification_1792562119817.webp`).
  - **Phase 7**: Deep Learning, Classification & Retrieval Evaluation
    - **Dataset Architecture & Format**: Created standardized, reproducible JSON dataset (`server/src/ml/data/student_queries_v1.json`) containing 200 labeled student queries balanced across 10 canonical university categories.
    - **Canonical Taxonomy**: Formalized 10 ticket categories (`ACADEMIC_RECORDS`, `TUITION_FEES`, `SCHOLARSHIPS`, `EXAM_CELL`, `HOSTEL_HOUSING`, `CAMPUS_IT`, `LIBRARY_SERVICES`, `TRANSPORTATION`, `CAREER_PLACEMENT`, `STUDENT_AFFAIRS`) with associated query intents, keywords, and resolving department codes in `server/src/ml/taxonomy.js`.
    - **Near-Duplicate Leakage Guard**: Implemented seeded stratified splitting (70% train / 15% validation / 15% test) in `server/src/ml/dataset.js`. Enforced pairwise token Jaccard similarity checks (`max_cross_split_similarity = 0.3333 < 0.60`) guaranteeing zero near-duplicate question leakage across splits.
    - **Embedding Prototype Classifier**: Built `EmbeddingCategoryClassifier` (`server/src/ml/classifier.js`) calculating 768-dimensional centroid prototypes per category with temperature-scaled softmax probabilities, calibrated ambiguity detection (`ambiguityMargin = 0.08`), and low-confidence thresholding (`minConfidenceThreshold = 0.40`). Kept suggestions strictly advisory (`isAdvisory: true`) with zero authoritative routing bypass.
    - **Defensive Edge Case Handling**: Added automated handling and test coverage for ambiguous multi-department inquiries (e.g., hostel rent scholarship), out-of-domain/unknown queries triggering manual category fallback, sparse classes with single-shot examples, and input sanitization.
    - **Semantic FAQ Retrieval & Deflection**: Built `SemanticSearchService` (`server/src/services/ai/semantic_search.service.js`) and database migration `20261020000006_phase7_semantic_search_and_ml.sql` with `match_faqs` stored procedure, HNSW index on `faqs.embedding`, and `ai_deflection_events` tracking table.
    - **Retrieval Benchmark & Ranking Metrics**: Created `server/src/ml/data/faq_retrieval_benchmark.json` (20 FAQs + 25 test queries). Built `evaluateFaqRetrieval` (`server/src/ml/retrieval_evaluator.js`) reporting empirical Recall@1 (68.00%), Recall@3 (80.00%), Recall@5 (88.00%), and MRR@5 (0.7580).
    - **Reproducible Evaluation Script**: Created CLI runner `server/src/ml/scripts/evaluate.js` (`npm run evaluate:ml`). Automatically outputs raw results to `ml/evaluation_results.json` and human-readable audit report to `docs/PHASE7_EVALUATION_REPORT.md` with model metadata, dataset version, and execution timestamps.
    - **Admin AI & ML Analytics Dashboard**: Built `AiAnalyticsView.jsx` integrated into Super Admin Operations Center (`/admin`) presenting real-time telemetry: total AI queries, deflection rates, satisfaction scores, Recall@5/MRR@5 retrieval benchmarks, model architecture specs, and 10-class precision/recall/F1 performance breakdown.
    - **Real-Time Student Ticket Deflection**: Integrated debounced semantic FAQ suggestion cards and advisory category suggestion pills directly into `CreateTicketPage.jsx`, allowing instant ticket deflection ("This solves my issue") while allowing full manual student override.
    - **Verified Metrics & Documented Limitations**: Real evaluation results recorded without fabricated metrics: Accuracy 73.33%, Macro Precision 73.50%, Macro Recall 73.33%, Macro F1 69.45%. Documented semantic overlap limitations between `SCHOLARSHIPS` and `TUITION_FEES` as areas for future transformer fine-tuning.
    - **Testing & Build Verification**: 100% test pass rate across all 8 backend test suites (91 tests including 14 Phase 7 tests) and client test suite (26 tests including 3 Phase 7 tests). Production client build verified (`vite build` in 11.98s).
  - **Phase 8**: Knowledge Base & FAQ Management System (Completed)
    - **Public FAQ Page (`/faqs`)**: Fully responsive, accessible to guests and unauthenticated visitors without login prompts. Features hero search, instant keyword filtering, category filter pills across all 10 canonical categories with live count, and modern accordion solution cards.
    - **Accordion Interface & Rich Metadata**: Displays question titles, full multi-line approved procedures, responsible department tags, approved version badges (`Approved v1.0`), view counts, and clickable keyword tags.
    - **Helpful / Unhelpful Voting with Abuse Prevention**: Implemented single-vote enforcement for authenticated users (`(faq_id, user_id)` unique constraint) and 24-hour IP window debouncing for anonymous guest visitors. Returns HTTP 429 `DUPLICATE_VOTE` when abuse is detected.
    - **Staff FAQ Draft Promotion from Resolved Tickets**: Added "Promote to FAQ Draft" modal in `TicketDetailPage.jsx` for department staff and administrators when viewing `RESOLVED` or `CLOSED` tickets. Drafts are safely saved in `DRAFT` status and excluded from public search and AI retrieval until administrator approval.
    - **Super Admin Review, Approval & Version Management**: Super Admins and authorized document approvers can review drafts, approve & publish (`POST /api/faqs/:id/approve`), edit contents with automatic version incrementation (`PATCH /api/faqs/:id`), and retire outdated entries (`POST /api/faqs/:id/retire`). Approval automatically triggers vector embedding computation for instantaneous similarity search and deflection.
    - **Knowledge Base Document Ingestion, Versioning & Re-indexing**: Created `AdminKnowledgeManagement.jsx` inside the Super Admin Operations Center (`/admin`). Admins can upload institutional documents (PDF, DOCX, TXT, MD), view parsed chunk counts, version history, and trigger re-indexing (`POST /api/ai/documents/:id/reindex`), which purges previous chunks, extracts new text, and updates vector embeddings.
    - **Retrieval Pipeline Invalidation**: Updated both `queryKnowledge` (RAG service) and `searchSimilarFaqs` (semantic deflection service) to strictly exclude items marked with `status = 'RETIRED'` or `is_active = false`. Retired knowledge content is immediately purged from active similarity retrieval, ensuring the AI assistant never cites outdated policies.
    - **Single Source of Truth**: Unified `inMemoryFaqs` across `faq.service.js` and `semantic_search.service.js` so that the public FAQ UI, staff drafts, and AI assistant share identical approved knowledge representations.
    - **Database Security & RLS**: Migration `20261020000007_phase8_knowledge_and_faqs.sql` adds column constraints, `faq_votes` tracking table, and RLS policies enforcing public read on published/public FAQs while barring students from publishing FAQs or modifying document approval states.
    - **Automated Verification & Build**: 100% test pass rate across all 9 backend test suites (106 tests including 15 Phase 8 tests) and client test suite (32 tests including 6 Phase 8 tests). Client production build verified clean (`vite build` in 30.89s).
    - **Browser Live Verification**: Verified end-to-end guest access, instant search, accordion expansion, and helpful voting feedback using browser subagent (`phase8_faq_verification_1792575985265.webp`).
  - **Phase 9**: Final Security, Integration, Testing & Deployment Preparation (Completed)
    - **Endpoint Security & Authorization Audit**: Performed complete audit of every Express route. Enforced strict RBAC (`requireAuth`, `requireActiveUser`, `requireRole`) on all administrative, staff, and ticket routes. Verified that unauthenticated requests return 401, suspended/pending accounts return 403, and students accessing staff/admin endpoints receive 403.
    - **Role Escalation Protection**: Audited `PATCH /api/auth/profile` ensuring that `role`, `status`, `department_id`, and `can_approve_documents` are strictly ignored from request bodies and cannot be escalated by unauthorized users.
    - **Cross-Student & Cross-Department Isolation**: Verified multi-tenant isolation via unit and integration tests. Students are blocked from reading or commenting on other students' tickets. Staff from outside departments are prevented from claiming, triaging, or viewing tickets assigned to different departments.
    - **Attachment Authorization & Expiry**: Audited `AttachmentService.getAttachmentDownload`. Enforced rechecks verifying student ownership, staff departmental matching, and blocking students from accessing internal note attachments (HTTP 403). Signed URLs expire with a strict 60-second TTL.
    - **Secret Exposure Audit**: Scanned client codebase, environment templates, and production build artifact (`client/dist/`). Confirmed zero service-role keys (`SUPABASE_SECRET_KEY`), LLM provider API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`), or SMTP passwords are leaked to the client bundle.
    - **Structured Logger Redaction**: Implemented `sanitizeMeta` utility in `server/src/utils/logger.js` that recursively masks sensitive keys (`password`, `token`, `access_token`, `refresh_token`, `authorization`, `secret`, `apikey`, `ai_api_key`, `smtp_pass`, `cookie`, `service_role_key`) with `[REDACTED]`.
    - **Reliability & Failure Resilience**: Verified database transaction isolation and constraints. Verified transactional email retries with exponential backoff and deduplication (`dedup_key`). Confirmed that LLM provider outages fall back gracefully to deterministic responses (`MockProvider`) without crashing the ticketing pipeline. Verified SLA watchdog scheduling and `Asia/Kolkata` timezone consistency.
    - **Production Health & Readiness Probes**: Updated `/api/health` (liveness probe reporting uptime) and `/api/ready` (readiness probe verifying API, database, storage, AI provider, and SLA watchdog without exposing internal secrets).
    - **Super Admin Provisioning Script**: Created `server/scripts/provision_super_admin.js` for secure CLI provisioning via Supabase Auth admin API, eliminating insecure default credentials from version control.
    - **Production Seed Data**: Created comprehensive `supabase/seed.sql` populating all 10 college departments, 10 canonical categories, routing rules, default SLA targets, and baseline FAQs.
    - **Production Deployment Guide**: Authored `docs/DEPLOYMENT_GUIDE.md` detailing architecture, environment configuration, migration sequences, SPA routing (`_redirects`, `vercel.json`), SLA daemon execution, backup/PITR protocols, and capacity/cost planning.
    - **100% Test Pass Rate Across All Suites**: 119 backend tests across 10 test suites + 32 frontend tests across 7 test suites = 151 total tests, all passing with zero errors.
    - **Production Build Clean**: Production client bundle built via `vite build` with exit code 0.


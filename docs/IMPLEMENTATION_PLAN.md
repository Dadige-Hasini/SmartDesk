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
  - **Phase: Supabase Foundation, Migrations, Least-Privilege RLS & Idempotent Demo Seed Pack (Prompt 2 Deliverable)**:
    - **Client/Server Separation**: Verified role-separated Supabase architecture:
      - Browser client (`client/src/config/supabase.js`) strictly uses public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with session persistence. Zero backend secrets.
      - Server client (`server/src/config/supabase.js`) isolates public unprivileged client (`supabaseClient`) from administrative service-role client (`supabaseAdmin`), preventing credential leakage.
    - **Supabase Auth**: Auth token validation implemented in `server/src/middleware/auth.js` via native `supabaseClient.auth.getUser(token)`, coupled with authoritative database profile lookup and active user account checks. Client authentication wired in `client/src/context/AuthContext.jsx`.
    - **Versioned Migrations & Schema Fixes**:
      - `20261020000001_departments_and_profiles.sql`: Added missing `get_current_user_department_id()` SECURITY DEFINER function to support department-scoped RLS policies.
      - `20261020000002_tickets_system.sql`: Enhanced `can_access_ticket` function to enforce confidential grievance access isolation (only creator, Super Admin, and Student Affairs / Grievance Cell staff `STU`/`AFFAIRS` may view confidential tickets).
      - `20261020000003_comments_attachments_notifications.sql`: Updated comments and attachments RLS policies to allow Student Affairs staff to view confidential grievance notes while isolating regular staff.
      - `20261020000005_phase6_rag_ai_assistant.sql`: Fixed SQL syntax error in `match_document_chunks` stored procedure (`ORDER JOIN` -> `ORDER BY`).
      - `20261020000006_phase7_semantic_search_and_ml.sql`: Fixed SQL syntax error in `match_faqs` stored procedure (`ORDER JOIN` -> `ORDER BY`).
      - `20261020000008_ai_interactions_and_audit_events.sql`: Created versioned migration for `ai_interactions` table, `audit_events` table matching the demo pack, routing rules extended attributes (`rule_id`, `confidence_threshold`, `fallback_department_id`, `human_review`), SLA demo targets, document codes, and demo ticket identifiers.
      - `supabase/full_schema.sql`: Consolidated production schema combining all 8 migrations into an idempotent single-file script for one-click Supabase deployment.
    - **Least-Privilege RLS Policies**:
      - Students see only their own tickets (`created_by = auth.uid()`) and non-internal comments/attachments.
      - Staff see only tickets and comments within their assigned department.
      - Confidential grievances (`is_confidential = true`) are strictly restricted to the student creator, Super Admins, and authorized Student Affairs & Grievances officers (`STU`/`AFFAIRS`).
      - Service-role isolation enforced on `email_jobs` outbox and system audit events.
    - **Exact pgvector Embeddings (768 Dimensions)**: Verified model dimensions against schema. OpenAI `text-embedding-3-small` with `{ dimensions: 768 }` and Gemini `text-embedding-004` (768 dims native) align with `vector(768)` in `document_chunks` and `faqs`. HNSW vector cosine indexes configured for sub-millisecond retrieval.
    - **Demo Data Seed & Import Script**: Created `server/scripts/seed_demo_pack.js` (`npm run seed`), reading all data files in `SmartDesk_AI_Demo_Data/data/` (`departments.json`, `categories.json`, `routing_rules.json`, `sla_policies.json`, `faqs.json`, `knowledge_documents.json`, `demo_tickets.json`, `audit_events.json`). Uses upsert logic on unique natural keys (`code`, `rule_id`, `priority`, `faq_code`, `document_code`, `event_id`) ensuring 100% idempotent repeated executions with zero duplicate records.
    - **Automated Verification & Tests**:
      - Created `server/tests/supabase.foundation.test.js` verifying credential boundaries, secret isolation, seed idempotency, scoped ticket access, department isolation, confidential grievance restriction, internal note isolation, vector dimensions, and live Supabase connectivity.
      - Backend test suite: 139 passed / 139 tests across 12 test suites.
      - Client test suite: 32 passed / 32 tests across 7 test suites.
      - Total test pass rate: 171 passed tests (100%).
    - **Prompt 3: Conversational AI Assistant and Grounded RAG Pipeline (Completed)**:
      - **Server-Side AI Service & API Endpoint**: Dedicated conversational endpoint (`POST /api/ai/chat`) in `server/src/routes/ai.routes.js` and `server/src/controllers/ai.controller.js` protected by `requireAuth`, dedicated AI rate limiter (`30 req/min`), and input validation.
      - **Knowledge Preloading from Demo Datasets**: `ragService.initializeKnowledge()` loads and chunks 54 approved documents and FAQs from `SmartDesk_AI_Demo_Data/data/` (`knowledge_documents.json`, `faqs.json`, `resolution_playbooks.json`, `policies.json`) with official source IDs (`KB-IT-001`, `FAQ001`, `PLAYBOOK-NETWORK_WIFI`, `POL-001`).
      - **Chunking & Vector Embeddings**: Documents are chunked into section-aware segments with 768-dimensional embeddings via `embedding.service.js`, matching PostgreSQL `vector(768)` in `document_chunks`.
      - **Semantic Similarity & Metadata Filtering**: Retains cosine similarity scoring with department and category filtering.
      - **Scoped Role-Based Authorization**: Students and unauthenticated visitors are strictly isolated from `STAFF_ONLY` and `INTERNAL_DEPARTMENT` documents, unapproved drafts, and retired documents (`queryKnowledge` filter).
      - **Structured Source Citations**: Returned citations include `sourceId`, `documentTitle`, `section`, snippet, and similarity score, displayed as pill badges in the UI.
      - **Honest Abstention & Ticket Handoff**: When retrieval confidence is below threshold (< 0.28), the assistant honestly states the answer could not be verified from approved regulations and offers a prefilled ticket draft handoff.
      - **Anti-Prompt Injection Defense**: Evaluates and neutralizes adversarial override instructions (`ignore instructions`, `say "fees are free"`, `you are now`, `system prompt`) before model invocation.
      - **Strict Negative Constraints**: System instruction forbids fabricating college rules, exam dates, bus schedules, fees, processing times, contacts, or SLA commitments.
      - **Student-Friendly Clarification**: Detects short or vague queries (`hi`, `fees`, `wifi`, `help`) and responds with polite clarifying questions and helpful starter action chips.
      - **Ticket Status Explanation & Backend Ownership Check**: Querying a ticket reference (`TKT-...`, `SD-DEMO-...`) verifies `ticket.created_by === user.id`. Unauthorized students and guests receive a 403 privacy refusal, while creators receive accurate status and SLA explanations.
      - **Interactive Ticket Draft Confirmation**: AI ticket drafts return category, suggested department, priority, and description with `requiresConfirmation: true`. Displayed in `AiChatPage.jsx` as a dedicated Preview Card with an explicit "Confirm & Review Draft in Ticket Form" button navigating to `/tickets/new`.
      - **External API & Offline Resilience**: Probed OpenAI embeddings. When upstream accounts report quota exhaustion (HTTP 429), the server cleanly falls back to deterministic 768-dim embeddings and `MockProvider` without crashing or throwing unhandled errors.
      - **Client UI Enhancement**: Enhanced `AiChatPage.jsx` with source ID pill badges (`[KB-IT-001]`, `[FAQ001]`) and interactive Ticket Draft Preview card.
      - **Comprehensive Automated Test Suite**:
        - Created `server/tests/ai.assistant.rag.test.js` with 14 comprehensive tests covering all 17 Prompt 3 requirements.
        - Backend test suite: 153 tests passed / 153 tests across 13 test suites.
        - Frontend test suite: 32 tests passed / 32 tests across 7 test suites.
        - Total: 185 tests passed (100%).
    - **Prompt 4: Deep-Learning Ticket Classification & Deterministic Department Routing (Completed)**:
      - **Modular Classifier Contract (`classifier.interface.js`)**: Implemented abstract `TicketClassifierInterface` defining `fit(trainingData)` and `predict(ticket)`. Formats ticket title and description (`${title}. ${description}`) and supports hot-swappable active classifier models without altering downstream routing or API controllers.
      - **Reproducible Baseline Prototype (`baseline_classifier.js`)**: Built deterministic TF-IDF vectorizer with domain anchor reinforcement and centroid prototype vectors across all 16 canonical categories. Implemented calibrated temperature softmax (`temperature = 0.12`) producing well-calibrated confidence scores and alternative category rankings in sub-millisecond latency.
      - **Transformer Classifier Adapter & Honest Claim Policy (`transformer_classifier.js`)**: Configured `distilbert-base-uncased` transformer architecture and training pipeline (`distilbert_trainer.py`). In strict adherence to Requirement 3, transparently reports `is_fine_tuned = false` and `model_status = 'PRETRAINED_UNTRAINED_DELEGATED_TO_BASELINE'` because the GPU fine-tuning loop was not run in this environment; zero false claims of completed transformer training.
      - **Leakage-Free Dataset Splitting & Limitation Notice (`dataset_loader.js`)**: Seeded split (`Mulberry32` seed 42) into train (26), validation (1), and test (16) splits. Verified pairwise cross-split Jaccard token similarity (`0.3333` vs. `< 0.60` threshold). Documented statistical limitation: 43 synthetic demo samples across 16 categories is too small for a statistically reliable independent holdout; reported strictly as a functional demo dataset.
      - **Empirical Classification Metrics (`evaluate_ticket_classification.js`)**:
        - *Unseen Test Split (16 classes)*: Accuracy: **93.75%**, Macro Precision: **90.63%**, Macro Recall: **93.75%**, Macro F1-Score: **91.67%**.
        - *All 43 Demo Samples (16 classes)*: Accuracy: **97.67%**, Macro Precision: **97.92%**, Macro Recall: **97.92%**, Macro F1-Score: **97.50%**.
        - Zero fabricated metrics; actual results exported to `ml/ticket_classification_evaluation.json` and human-readable audit report in `docs/TICKET_CLASSIFICATION_REPORT.md`.
      - **Deterministic Department Routing Engine (`routing_engine.js`)**: Enforces institutional rules from `routing_rules.json` after classification. Strict non-authoritative boundary: model only suggests category and confidence; department assignment, priority, and permissions are exclusively controlled by deterministic policy rules.
      - **Human-Review & Priority Triggers (Requirement 9)**:
        - Sensitive student grievances (harassment, ragging, discrimination, abuse) -> Routed to Student Affairs (`STU`), priority `P1`, mandatory human review.
        - Financial discrepancies (charged twice, money deducted, unpaid status) -> Routed to Accounts Section (`FEE`), priority `P1`, manual reconciliation required.
        - Critical exam deadlines & missing hall tickets -> Routed to Examinations Cell (`EXAM`), priority `P1`, emergency triage flag.
      - **Low-Confidence Fallback & Clarifying Questions (Requirement 8)**: Confidence below threshold (< 0.70) or unmapped unknown categories automatically trigger safe fallback to Student Affairs review desk (`STU`) with `human_review_required: true` and generate context-aware clarifying questions comparing top candidate categories.
      - **Secret-Scrubbed Audit Logging (`audit_logger.js`)**: Masks Bearer tokens, API keys, passwords, bank cards, and personal contact PII before writing structured telemetry to `ai_interactions` and `audit_events`.
      - **Student Ticket Form Review Integration (`CreateTicketPage.jsx`)**: Debounced real-time classification presents students with an "AI Triage & Department Routing" preview card displaying suggested category, target department, priority, human review notices, clarifying question banners, and an "Apply Suggestion" button while leaving final submission authority with the student.
      - **Real College Data Replacement Guide (`docs/DATA_REPLACEMENT_AND_GOVERNANCE_GUIDE.md`)**: Comprehensive institutional SOP detailing student opt-in consent protocols (FERPA/GDPR/DPDP compliance), automated PII scrubbing (regex + NER), minimum volume requirements (1,600-3,200 consented tickets, 100-200 per category), and step-by-step hot-swapping procedures.
      - **Automated Verification & Tests**:
        - 21 comprehensive tests in `server/tests/ticket_classification_routing.test.js` covering modular interface, deterministic baseline, transformer integrity, leakage-free splitting, metric evaluation, deterministic rules, human review triggers, low confidence, unknown categories, secret redaction, and API endpoints.
        - Backend test suite: 174 passed / 174 tests across 14 test suites (100%).
        - Frontend test suite: 32 passed / 32 tests across 7 test suites (100%).
        - Total Workspace Tests: **206 passed / 206 tests (100% pass rate)**.
    - **Prompt 5: Ticket Workflow, SLA and Audit Engine (Completed)**:
      - **Supported Statuses & Finite State Machine (Requirements 1 & 2)**:
        - Implemented all 6 canonical ticket statuses: `OPEN`, `IN_PROGRESS`, `AWAITING_INFO`, `RESOLVED`, `CLOSED`, `REJECTED`.
        - Server-side finite state transition validation enforced via `ALLOWED_STATUS_TRANSITIONS` in `server/src/services/ticket.service.js`. Invalid transitions (e.g., `OPEN` → `CLOSED` or `OPEN` → `RESOLVED`) are strictly rejected with HTTP 400 `INVALID_STATUS_TRANSITION`.
        - Role-based transition restrictions prevent students from executing staff-only resolution statuses (HTTP 403 `FORBIDDEN`).
        - Mandatory resolution summary (minimum 5 characters) enforced for `RESOLVED` status (HTTP 400 `RESOLUTION_SUMMARY_REQUIRED`).
        - Mandatory documented rejection reason (minimum 5 characters) enforced for `REJECTED` status (HTTP 400 `REJECTION_REASON_REQUIRED`).
      - **Database-Safe Unique Ticket Numbering (Requirement 3)**:
        - Generated unique, sequential ticket identifiers adhering strictly to `TKT-YYYYMMDD-XXXX` format via PostgreSQL sequence and atomic fallback, preventing duplicates under high concurrency.
      - **Submission Persistence, Ownership & Deterministic Department Routing (Requirements 4 & 5)**:
        - Ticket creation saves student confirmed description, category, department, priority, and student ownership (`created_by`, `student_department_id`).
        - Deterministic category-to-department routing rules applied during submission.
        - Added department reassignment endpoint (`POST /api/tickets/:id/reassign-department`) enabling authorized staff and administrators to transfer tickets across departments with a mandatory recorded reason (minimum 5 characters).
        - Department isolation checks strictly bar outside department staff from modifying or reassigning tickets belonging to other departments (HTTP 403 `FORBIDDEN`).
      - **Demonstration SLA Deadlines & Asia/Kolkata (IST) Display (Requirements 6 & 7)**:
        - Demonstration SLA policies loaded directly from `sla_policies.json` in `server/src/services/sla.service.js`, explicitly tagged with `policy_label = 'Demonstration Target (sla_policies.json)'` and `is_demo_target = true`.
        - Multi-tier SLA deadline calculation for P1 (Urgent: 60m response, 8h resolution, 2h escalation), P2 (High: 4h response, 24h resolution, 8h escalation), P3 (Medium: 8h response, 72h resolution, 24h escalation), and P4 (Low: 24h response, 120h resolution, 48h escalation).
        - Deadlines stored as canonical UTC ISO strings (`first_response_due_at`, `resolution_due_at`, `escalation_due_at`, `sla_due_at`).
        - Localized display helpers implemented in `server/src/utils/date.js` (`formatToIST`, `toIstIsoString`, `formatDateOnlyIST`, `formatTimeOnlyIST`) formatting all timestamps into `Asia/Kolkata` (IST, UTC+05:30).
      - **SLA Watchdog, Approaching Warnings, Escalations & Deduplication (Requirement 8)**:
        - Upgraded background SLA watchdog in `server/src/workers/sla.worker.js`.
        - Detects tickets approaching SLA resolution targets (elapsed time >= 80% threshold) and emits `SLA_WARNING` audit events and in-app staff alerts.
        - Detects tickets exceeding resolution deadlines, flags `is_overdue = true`, and emits `STATUS_CHANGED (OVERDUE)` audit events.
        - Detects unacknowledged tickets exceeding escalation thresholds, flags `is_escalated = true`, and emits `TICKET_ESCALATED` audit events.
        - Persistent deduplication cache (`slaAlertsSent` Set, database flags) guarantees zero duplicate notifications across watchdog cycles.
      - **Asynchronous Notification Resilience (Requirement 9)**:
        - All notification and email dispatches (`NotificationService.notifyUser`, `EmailService.queueTicketEmail`) are asynchronous and non-blocking with error suppression handlers (`.catch(...)`).
        - Verified that upstream email or SMTP dispatch failures never interrupt, reject, or undo successful ticket status transitions or reassignments.
      - **Centralized Append-Only Audit Engine & Secret Sanitization (Requirements 10, 11 & 12)**:
        - Created `server/src/services/audit.service.js` capturing all critical operations: `TICKET_CREATED`, `TICKET_ASSIGNED`, `TICKET_REASSIGNED`, `STATUS_CHANGED`, `COMMENT_ADDED`, `AI_SUGGESTION`, `ROUTING_SUGGESTION_ACCEPTED`, `ROUTING_SUGGESTION_REJECTED`, `SLA_WARNING`, `TICKET_ESCALATED`, and `KNOWLEDGE_APPROVED`.
        - Structured records capture actor, actorId, role, action, entity, entityId, UTC timestamp, correlation ID, and minimal contextual metadata.
        - Strict recursive sanitization (`sanitizeAuditData`) redacts passwords, API keys, Bearer access tokens, OTPs, auth headers, and credit card patterns with `[REDACTED_SECRET]` while preserving UUIDs without false positives.
        - Append-only integrity enforced at the database level via PostgreSQL Row Level Security (RLS) policies prohibiting `UPDATE` or `DELETE` operations by non-admin users.
      - **Private Internal Note Isolation from Students (Requirement 13)**:
        - Internal staff comments (`is_internal = true`) and internal note events are strictly filtered out from students in database queries (`CommentService.getTicketComments`) and API responses (`ticketService.getTicket`).
        - Staff members and administrators retain visibility into full internal collaboration discussions.
      - **Confidential Grievance Record Access Restrictions (Requirement 14)**:
        - Confidential tickets (`is_confidential = true` or `CAT_GRIEVANCE`) restricted strictly to the student creator, Super Admin, and authorized grievance officers (`can_review_grievances: true` or department code `STU`/`AFFAIRS`/`GRIEVANCE`).
        - Outside department staff and unrelated students receive HTTP 403 `FORBIDDEN` on both read and write attempts.
      - **Student Single Reopen Within 7 Calendar Days (Requirement 15)**:
        - Implemented reopen endpoint `POST /api/tickets/:id/reopen` with server-side validation in `ticketService.reopenTicket`.
        - Permitted strictly once (`reopened_count < 1`) within 7 calendar days after `RESOLVED` or `CLOSED` status. Reopening attempts after the 7-day window or repeated reopens are rejected with HTTP 400.
        - Reopen events are recorded in `ticket_events` and the centralized append-only audit log (`TICKET_REOPENED`).
      - **Staff Dashboard Dedicated Views & Queue Presets (Requirement 16)**:
        - Implemented query presets in `server/src/services/staff.service.js`: `department_queue` (all active tickets in staff department), `assigned_to_me` (tickets assigned to the current staff user), `overdue_cases` (breached/escalated tickets), and `resolution_summaries` (tickets with documented resolution summaries).
        - Updated `client/src/pages/StaffDashboardPage.jsx` with dedicated tab navigation (Department Queue, Assigned to Me, Overdue Cases, Resolution Summaries), active counter badges, and inline resolution summary display.
      - **Automated Verification & Tests (Requirement 17)**:
        - Created `server/tests/ticket.workflow.sla.audit.test.js` containing 26 comprehensive automated tests covering all 18 requirements.
        - All 26 Prompt 5 tests passed (100%).
        - Full server test suite: 15/15 test files passed, **200/200 tests passed (100% pass rate)**.
        - Client test suite: 7/7 test files passed, **32/32 tests passed (100% pass rate)**.
        - Total Workspace Tests: **232 passed / 232 tests (100% pass rate)**.
        - Client production build verified clean (`vite build` in 13.60s).
      - **Safety Boundary Adherence**:
        - Strictly enforced: neither the LLM assistant nor classification models can bypass authorization or directly modify official attendance, fee, exam, or student records.
      - **Remaining Work**:
        - Live production SMTP credentials integration for outbound production email delivery.
        - Continuous daemon runner setup for standalone production deployment of the SLA watchdog.

---

### Prompt 6: Student-Facing AI Workflows & Tool Validation
- **Objective**: Integrate the SmartDesk AI assistant with verified backend ticket APIs through structured tool calling, implementing 10 end-to-end conversation workflows, permission validation, source grounding, and institutional safety boundaries.
- **Dependencies**: Prompt 3 (RAG Pipeline), Prompt 4 (Ticket Classification), Prompt 5 (Workflow, SLA & Audit Engine).
- **Deliverables & Implementation Details**:
  - **Structured Backend Tool Architecture (`server/src/services/ai/ai_workflow_tools.service.js`)**:
    - Created universal structured tool dispatcher enforcing backend validation of arguments and caller authorization before execution.
    - Defined 9 tool schemas in `TOOL_DEFINITIONS`:
      1. `get_ticket_status`: Live status with ownership verification.
      2. `get_sla_explanation`: SLA deadlines in IST with anti-promising disclaimer.
      3. `get_ticket_resolution`: Staff-approved public resolution summary with internal note isolation.
      4. `get_info_request_details`: Details on requested information when ticket is `AWAITING_INFO`.
      5. `reply_to_ticket`: Submit public comment directly to ticket thread.
      6. `prepare_ticket_draft`: Entity extraction, missing info check, category/dept routing, priority explanation.
      7. `confirm_and_create_ticket`: Verified ticket creation only upon explicit confirmation (`confirmed: true`).
      8. `handoff_to_human`: Department contact directory, physical office locations, and working hours.
      9. `search_faqs_offline`: Deterministic keyword FAQ search without LLM or external API dependencies.
    - Added REST endpoints: `GET /api/ai/tools` and `POST /api/ai/tool-call` in `server/src/controllers/ai.controller.js` and `server/src/routes/ai.routes.js`.
  - **Workflow 1: Grounded FAQ with Source Citations**:
    - Generates document-grounded answers strictly referencing approved policies in `knowledge_documents`.
    - Returns structured citations (`sourceId`, `documentTitle`, `section`, `snippet`, `similarity`).
    - Defends against prompt injection attempts attempting to override policies or bypass instructions.
  - **Workflow 2: Ticket Creation & Draft Confirmation**:
    - Collects missing information (e.g. room/block for Wi-Fi, transaction ID for fees, course codes for exams).
    - Predicts category and department using deep learning and deterministic rules.
    - Explains priority assignments (P1/Urgent for exam deadlines, P2/High for fee discrepancies, P3/Medium for standard issues).
    - Displays complete draft and strictly mandates explicit confirmation before creating the ticket (`confirmed: true`).
  - **Workflow 3: Ticket Live Status & Ownership Verification**:
    - Verifies authenticated student ticket ownership (`isOwner: true` or `role: SUPER_ADMIN`).
    - Unauthorized students attempting to view another student's ticket are rejected with HTTP 403 `FORBIDDEN`.
    - Supports conversational natural language queries (e.g., `"status of ticket TKT-20261024-0001"`).
  - **Workflow 4: Request for More Information & Student Reply**:
    - When ticket is in `AWAITING_INFO`, extracts the latest public staff request and explains what is needed.
    - Allows student to reply directly via `reply_to_ticket` tool or conversational syntax (`"reply to ticket TKT-... with: ..."`).
  - **Workflow 5: Resolution Communication & Privacy Boundary**:
    - Summarizes staff-approved public resolution notes in clear, student-friendly language.
    - Strictly isolates and filters internal staff notes (`is_internal: true`), guaranteeing internal diagnostics and tokens are never revealed.
    - Communicates institutional single-reopen policy permitted within 7 days of resolution.
  - **Workflow 6: SLA Explanation without Unverified Promises**:
    - Reads active ticket's actual SLA fields and converts deadlines into `Asia/Kolkata` (IST, UTC+05:30).
    - Explains escalation level and status when SLA is breached.
    - Appends mandatory anti-promising disclaimer preventing unverified commitments.
  - **Workflow 7: Department Routing Rationale & Student Correction**:
    - Explains why a department was recommended based on classification signals.
    - Allows students to correct misunderstood details (e.g., `"actually route this to Finance Office"`) before confirmation.
  - **Workflow 8: Human Handoff Route to Staff**:
    - Provides physical office locations, working hours, and contact email directory whenever confidence is low (< 0.28), evidence is insufficient, or student requests human assistance.
  - **Workflow 9: Sensitive Cases & Confidential Grievances**:
    - Detects sensitive keywords (harassment, ragging, sexual misconduct, threats, mental health crisis).
    - Activates restricted grievance protocol (`is_confidential: true`, routed strictly to Student Affairs `STU`, priority `P1`/`Urgent`).
    - Strictly advises students against sharing distressing or graphic personal details in open chat.
  - **Workflow 10: LLM & Embedding Service Failure Recovery**:
    - When upstream LLM or embedding provider throws errors or timeouts, executes offline recovery.
    - Provides non-AI offline keyword FAQ matching and direct support ticket links.
  - **Institutional Safety Boundary**:
    - Verified: AI workflows and tools can NEVER alter official student grades, examination records, enrollment status, or fee balances directly.
- **Verification & Test Results**:
  - `server/tests/student_ai_workflows.test.js`: **34 passed / 34 tests (100% pass rate)**.
  - `server/tests/phase6.ai.rag.test.js`: **13 passed / 13 tests (100% pass rate)**.
  - `server/tests/ticket.workflow.sla.audit.test.js`: **26 passed / 26 tests (100% pass rate)**.
  - Client test suite: **32 passed / 32 tests (100% pass rate)**.
  - Total Verified Tests in Workspace: **266 passed tests**.



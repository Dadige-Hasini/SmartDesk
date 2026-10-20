# SmartDesk — Comprehensive Phase Roadmap

## Implementation Strategy
SmartDesk is built iteratively across eight distinct phases (Phase 0 through Phase 7). Each phase establishes tested, functional components that downstream phases rely upon.

### Phase 0: Workspace Foundation & Architecture Setup (Active)
- Repository structure, monorepo orchestration scripts, git repository setup.
- Root configuration: `.gitignore`, `.env.example`, `package.json`.
- Express backend scaffolding with Helmet, CORS, Rate Limit, Structured Logger, Centralized Error Handling, Standardized Envelope.
- React + Vite + Tailwind frontend scaffolding with custom color palette (Navy `#1a1a2e`, Coral `#e94560`, Amber), dark mode context, and API client.
- Base integration tests with Vitest and Supertest.
- Architectural blueprint, API specifications, and risk mitigation plan.

### Phase 1: Database Schema, Security (RLS) & Migrations
- Supabase PostgreSQL schema with 18 core relational tables.
- Collision-free ticket sequence generator: `TKT-YYYYMMDD-0001`.
- Row-Level Security (RLS) policies enforcing Student, Staff, and Super Admin boundaries.
- pgvector extension with cosine similarity vector indexes.
- Comprehensive seed data: Super Admin, 3 Staff in distinct departments, 10 Students, 20 sample tickets across all statuses/categories, FAQs, routing rules, and SLA policies.

### Phase 2: Authentication, Authorization & User Management
- Supabase Auth integration with strict server-side role validation.
- Student registration (roll number, department, year, email, password).
- Staff registration (employee ID, department, email, password) with `PENDING_APPROVAL` workflow.
- Super Admin staff approval and suspension workflows.
- Role-based middleware, route guards, and session state persistence.

### Phase 3: Core Ticket Management & Lifecycle Engine
- Ticket creation with validation, dynamic category-to-department routing.
- State transition machine: OPEN, IN_PROGRESS, AWAITING_INFO, RESOLVED, CLOSED, REJECTED.
- Append-only ticket event log capturing all state changes, reassignments, and notes.
- Search, filter, sorting, and pagination with synchronized URL query parameters.
- Reopen logic (single reopen within 7 days of resolution), resolution summaries, and rejection justification.

### Phase 4: Comments, Attachments & Notifications
- Split comment model: public student-staff dialogue vs confidential staff-only internal notes.
- Secure attachment pipeline: up to 3 files, 5MB limit, MIME and magic-byte signature validation.
- Private Supabase Storage bucket integration with temporary signed download URLs.
- In-app notification dispatcher with Realtime subscriptions.
- Asynchronous email queue (`email_jobs`) with automatic retries and failure decoupling.

### Phase 5: AI & Deep Learning Integration (RAG + Classifier)
- Grounded college document ingestion: PDF/text parser, semantic chunking, metadata enrichment.
- Vector embedding generation and pgvector similarity retrieval.
- Grounded RAG conversational endpoint (`/api/ai/chat`) with citation generation and threshold-based abstention.
- AI ticket drafting assistant (`/api/ai/suggest-ticket`) requiring explicit student confirmation.
- Ticket category and intent text classifier with reproducible evaluation metrics (accuracy, precision, recall, F1).
- Graceful degradation and fallback handlers for AI service downtime.

### Phase 6: Dashboards, UI/UX Polish & Analytics
- Student Dashboard: ticket summary counters, real-time activity feed, AI quick-help, notification tray.
- Staff Dashboard: department queue, priority triage, SLA timers, interactive resolution charts.
- Super Admin Dashboard: global performance metrics, staff administration, SLA policies, audit viewer, AI deflection metrics.
- UI/UX refinements: accessible contrast, skeleton loaders, confirmation dialogs, toast alerts, keyboard navigation.

### Phase 7: End-to-End Testing, Security Auditing & Verification
- Comprehensive API integration tests with Supertest.
- Component and unit test suite with Vitest and React Testing Library.
- Browser-based end-to-end lifecycle verification (Student submission -> Staff claim -> Resolution -> Student rating).
- Security penetration verification (RLS policy check, role-escalation defense, sanitization).
- Production build validation and deployment documentation.

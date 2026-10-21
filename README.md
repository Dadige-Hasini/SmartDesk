# SmartDesk — AI-Powered College Student Help Desk

[![Status](https://img.shields.io/badge/Status-Phase%209%20Complete-emerald.svg)]()
[![Backend Tests](https://img.shields.io/badge/Backend%20Tests-119%20Passed-brightgreen.svg)]()
[![Frontend Tests](https://img.shields.io/badge/Frontend%20Tests-32%20Passed-brightgreen.svg)]()
[![Build](https://img.shields.io/badge/Production%20Build-Passing-blue.svg)]()
[![Security](https://img.shields.io/badge/Zero%20Secret%20Exposure-Verified-blueviolet.svg)]()

SmartDesk is an enterprise-grade AI-powered college support portal designed to streamline student inquiries, deflect repetitive questions, and empower staff ticket resolution. It combines a grounded Retrieval-Augmented Generation (RAG) assistant, finite-state ticket lifecycle management, departmental routing, magic-byte verified private attachments, transactional email delivery, public FAQ self-service, deep learning query classification, and multi-tenant security backed by PostgreSQL Row Level Security (RLS).

---

## 🏗️ Technology Stack

| Domain | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, React Router v7, TanStack Query v5, Recharts, React Hot Toast, React Dropzone, date-fns (Asia/Kolkata timezone formatting), DOMPurify, Lucide React |
| **Backend** | Node.js (ES Modules), Express.js, Helmet, CORS, express-rate-limit, Zod, Nodemailer, Multer, Structured JSON Logger with Request IDs and automatic secret redaction |
| **Database & Auth** | Supabase PostgreSQL 15+, Supabase Auth, Row Level Security (RLS) across 18 tables, pgvector cosine similarity, Private Supabase Storage |
| **AI / Machine Learning** | Google Gemini 1.5 Flash / OpenAI GPT-4o-mini / Deterministic Fallback, 768-dim text embeddings (`text-embedding-004`), hybrid vector search, intent and category classification |
| **Testing** | Vitest, Supertest, React Testing Library, jsdom (151 unit, integration, and security tests) |

---

## 📁 Repository Structure

```
smartdesk/
  ├── client/                 # React frontend application (Vite)
  │   ├── src/
  │   │   ├── api/            # Axios API client and interceptors
  │   │   ├── components/     # Reusable UI components (FAQAccordion, AiAssistant, TicketCard, etc.)
  │   │   ├── context/        # React contexts (ThemeContext, AuthContext)
  │   │   ├── layouts/        # Application layouts (RootLayout, Sidebar)
  │   │   ├── pages/          # Application views (Student, Staff, Admin, FAQs, AiChat)
  │   │   └── utils/          # Frontend helpers (date formatting, ticket badges)
  │   ├── index.html
  │   ├── vite.config.js
  │   └── tailwind.config.js
  ├── server/                 # Express backend API (ES Modules)
  │   ├── scripts/            # Super Admin provisioning & operations scripts
  │   ├── src/
  │   │   ├── config/         # Environment, Supabase, and AI provider configurations
  │   │   ├── controllers/    # Route controllers (Ticket, Staff, Admin, AI, FAQ, Auth)
  │   │   ├── middleware/     # Request ID, centralized error handler, RBAC auth guards
  │   │   ├── repositories/   # Database access layer with in-memory resilient fallbacks
  │   │   ├── routes/         # Express routers
  │   │   ├── services/       # Business logic (Ticket, Comment, Attachment, AI, RAG, FAQ)
  │   │   ├── utils/          # Structured logger, response envelopes, file validation
  │   │   ├── workers/        # SLA watchdog and escalation worker
  │   │   └── app.js          # Express app configuration
  │   └── tests/              # 10 comprehensive Vitest test suites
  ├── supabase/
  │   ├── migrations/         # 8 version-controlled PostgreSQL schema migrations
  │   └── seed.sql            # Canonical seed data (10 departments, 10 categories, SLAs, FAQs)
  ├── docs/                   # Complete architecture, implementation plan, and deployment guide
  │   ├── DEPLOYMENT_GUIDE.md # Production deployment, backup, and operations manual
  │   └── IMPLEMENTATION_PLAN.md # Detailed phase tracking and verification status
  └── package.json            # Root workspace orchestration
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **Git**

### 2. Installation
Install all dependencies across root, server, and client:
```bash
npm run install:all
```

### 3. Environment Setup
Configure server and client environment variables:
- **Server**: copy `server/.env.example` to `server/.env` and configure your Supabase and AI provider credentials.
- **Client**: copy `client/.env.example` to `client/.env.local` with public Supabase URL and anonymous key.

### 4. Running Locally
Run both backend and frontend development servers concurrently:
```bash
npm run dev
```
- **Client Application**: [http://localhost:5173](http://localhost:5173)
- **Express Backend API**: [http://localhost:5000](http://localhost:5000)
- **Liveness Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **Readiness Probe**: [http://localhost:5000/api/ready](http://localhost:5000/api/ready)

### 5. Provisioning the Initial Super Admin
Run the CLI provisioning script to securely create the primary administrator:
```bash
cd server
node scripts/provision_super_admin.js "admin@college.edu" "SecureAdminPassword2026!" "Chief Administrator"
```

---

## 🧪 Comprehensive Verification & Test Suite

SmartDesk includes 151 unit, integration, RBAC, and UI tests across 17 test suites with a **100% pass rate**:

```bash
# Run all server tests (10 suites, 119 tests)
cd server && npm test

# Run all client tests (7 suites, 32 tests)
cd client && npm test -- --run

# Validate client production bundle
cd client && npm run build
```

### Verified Backend Test Suites:
1. `tests/auth.middleware.test.js`: Token verification, active account status, RBAC role restrictions.
2. `tests/comments.attachments.notifications.test.js`: Magic bytes validation, comment isolation, attachment authorization.
3. `tests/health.test.js`: `/api/health` and `/api/ready` envelope compliance and dependency reporting.
4. `tests/phase5.staff.admin.test.js`: Department queues, priority sorting, SLA policies, audit logging.
5. `tests/phase6.ai.rag.test.js`: Grounded RAG synthesis, source citations, document ingestion and vector search.
6. `tests/phase7.ml.evaluation.test.js`: Multi-intent classification, Recall@5 metrics, confusion matrix reporting.
7. `tests/phase8.knowledge.faq.test.js`: Public FAQ search, helpfulness voting, draft promotion, retirement invalidation.
8. `tests/phase9.security.audit.test.js`: Cross-student and cross-department isolation, role escalation prevention, logger sanitization.
9. `tests/supabase.config.test.js`: Environment configuration verification.
10. `tests/ticket.system.test.js`: Ticket numbering, state machine transitions, SLA calculation, and event auditing.

---

## 🛡️ Security Architecture & Privacy Safeguards

1. **Authoritative Server Profiles**: User roles and status are fetched directly from the database and verified via Supabase Auth; client-supplied role claims are rejected.
2. **Role Escalation Protection**: `PATCH /api/auth/profile` strictly ignores attempts to update `role`, `status`, `department_id`, or `can_approve_documents`.
3. **Cross-Tenant Data Isolation**: Students are strictly prohibited from viewing or commenting on other students' tickets. Staff are restricted to tickets within their assigned department.
4. **Internal Note Separation**: Internal staff notes are stripped from student API payloads and guarded by PostgreSQL RLS.
5. **Private Attachment Downloads**: Attachments are stored in private Supabase buckets. Downloads require parent-ticket authorization and generate signed URLs with strict 60-second TTLs.
6. **Zero Secret Exposure**: Build scanners confirm that no service-role keys or AI provider secrets are included in client bundles.
7. **Structured Logger Sanitization**: The logger automatically masks passwords, tokens, cookies, and secret keys with `[REDACTED]`.

---

## 📖 Documentation & Guides

- [Production Deployment Guide](file:///docs/DEPLOYMENT_GUIDE.md): End-to-end cloud deployment, migrations, backups, and provider costs.
- [Implementation Plan](file:///docs/IMPLEMENTATION_PLAN.md): Detailed task breakdown and verification notes for Phases 1 through 9.
- [System Architecture](file:///docs/architecture.md): High-level system architecture and component interactions.
- [API Specification](file:///docs/api_spec.md): Comprehensive REST API endpoint definitions.
- [Phase 5 Metrics & Governance](file:///docs/PHASE5_METRICS_AND_GOVERNANCE.md): Departmental KPIs and audit logging specifications.
- [Phase 7 ML Evaluation Report](file:///docs/PHASE7_EVALUATION_REPORT.md): Classifier evaluation metrics, confusion matrix, and Recall@5 benchmarks.

# SmartDesk — AI-Powered College Student Help Desk

[![Status](https://img.shields.io/badge/Status-Phase%2010%20Complete%20%7C%20Demo%20Ready-emerald.svg)]()
[![Backend Tests](https://img.shields.io/badge/Backend%20Tests-303%20Passed%20(19%20Suites)-brightgreen.svg)]()
[![Frontend Tests](https://img.shields.io/badge/Frontend%20Tests-63%20Passed%20(12%20Suites)-brightgreen.svg)]()
[![Total Tests](https://img.shields.io/badge/Total%20Tests-366%20Passed%20(100%25)-brightgreen.svg)]()
[![Production Build](https://img.shields.io/badge/Vite%20Build-Passing%20(9.4s)-blue.svg)]()
[![Security](https://img.shields.io/badge/Zero%20Secret%20Exposure-Verified-blueviolet.svg)]()

SmartDesk is an enterprise-grade AI-powered college student support portal engineered to streamline institutional inquiries, deflect repetitive queries, and empower staff ticket resolution. It combines a grounded Retrieval-Augmented Generation (RAG) assistant, finite-state ticket lifecycle management, automated departmental routing, magic-byte verified private attachments, transactional notification delivery, public FAQ self-service, deep learning query classification, and multi-tenant security backed by PostgreSQL Row Level Security (RLS).

---

## 🎨 Brand Design System & Aesthetic Principles

SmartDesk implements a tailored college portal aesthetic adhering to strict visual hierarchy and accessibility standards:

- **Deep Navy (`#1a1a2e`)**: Represents academic authority, operational stability, and structural contrast. Used for dark mode backdrops, command navigation, and headers.
- **Coral Accent (`#e94560`)**: Provides high-visibility focal points for primary calls-to-action, alerts, status indicators, and SLA urgency markers.
- **Warm Amber (`#f59e0b`)**: Highlights SLA at-risk warnings, pending approval notices, and advisory banners.
- **Electric Blue / Sky (`#64CEFB` / `#38bdf8`)**: Identifies grounded AI assistant contributions, vector search citations, and active model status.
- **Typography & Layout**: Standardized on Inter typography with responsive slide-over drawers, mobile hamburgers (375px+ viewports), card grids, accessible focus outlines, and Asia/Kolkata (IST) localized timestamps.

---

## 🏗️ Technology Stack

| Domain | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite 6, Tailwind CSS 3, React Router v7, TanStack Query v5, Recharts, React Hot Toast, React Dropzone, date-fns (Asia/Kolkata timezone formatting), DOMPurify, Lucide React |
| **Backend** | Node.js (ES Modules >= 20.0.0), Express.js 4, Helmet, CORS, express-rate-limit, Zod 3, Nodemailer, Multer, Structured JSON Logger with Request IDs and automatic secret redaction |
| **Database & Auth** | Supabase PostgreSQL 15+, Supabase Auth, Row Level Security (RLS) across 18 tables, pgvector cosine similarity, Private Supabase Storage |
| **AI / Machine Learning** | Google Gemini 1.5 Flash / OpenAI GPT-4o-mini / Deterministic Fallback, 768-dim text embeddings (`text-embedding-004`), hybrid vector search, intent and category classification |
| **Testing** | Vitest 3, Supertest 7, React Testing Library 16, jsdom 26 (366 unit, integration, and security tests across 31 suites) |

---

## 📁 Repository Structure

```
smartdesk/
  ├── client/                 # React frontend application (Vite)
  │   ├── src/
  │   │   ├── api/            # Axios API client and interceptors
  │   │   ├── components/     # Reusable UI components (CommentThread, NotificationsBell, Hero, etc.)
  │   │   ├── context/        # React contexts (ThemeContext, AuthContext)
  │   │   ├── layouts/        # Application layouts (RootLayout, StudentLayout, StaffLayout)
  │   │   ├── pages/          # Application views (Student, Staff, Admin, FAQs, AiChat, Tickets)
  │   │   └── utils/          # Frontend helpers (date formatting, ticket badges)
  │   ├── index.html
  │   ├── vite.config.js
  │   ├── tailwind.config.js
  │   └── .env.example
  ├── server/                 # Express backend API (ES Modules)
  │   ├── scripts/            # Super Admin provisioning & demo seeding scripts
  │   ├── src/
  │   │   ├── config/         # Environment, Supabase, and AI provider configurations
  │   │   ├── controllers/    # Route controllers (Ticket, Staff, Admin, AI, FAQ, Auth, Attachment)
  │   │   ├── middleware/     # Request ID, rate limiters, centralized error handler, RBAC auth guards
  │   │   ├── ml/             # Classification taxonomy and evaluation scripts
  │   │   ├── repositories/   # Database access layer with in-memory resilient fallbacks
  │   │   ├── routes/         # Express routers
  │   │   ├── services/       # Business logic (Ticket, Comment, Attachment, AI, RAG, FAQ, SLA, Audit)
  │   │   ├── utils/          # Structured logger, response envelopes, file signature validation
  │   │   ├── validators/     # Zod schema validation
  │   │   ├── workers/        # SLA watchdog and escalation worker
  │   │   └── app.js          # Express app configuration
  │   ├── tests/              # 19 comprehensive Vitest test suites (303 passing tests)
  │   └── .env.example
  ├── supabase/
  │   ├── migrations/         # 9 version-controlled PostgreSQL schema migrations
  │   └── seed.sql            # Canonical seed data (departments, categories, SLAs, FAQs)
  ├── SmartDesk_AI_Demo_Data_Pack/ # Idempotent seed data pack (synthetic data with zero PII)
  ├── docs/                   # Complete architecture, implementation plan, and guides
  │   ├── DEPLOYMENT_GUIDE.md # Production deployment, backup, and operations manual
  │   ├── IMPLEMENTATION_PLAN.md # Detailed phase tracking and verification status
  │   └── DATA_REPLACEMENT_AND_GOVERNANCE_GUIDE.md # Production data migration guide
  ├── CHECKLIST.md            # Verified Phase 1-10 completion checklist
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

### 3. Environment Configuration
Create environment files from the provided templates:
- **Server**: copy `server/.env.example` to `server/.env`
- **Client**: copy `client/.env.example` to `client/.env.local`

```bash
# Server configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SECRET_KEY=your-supabase-service-role-secret-key

# Client configuration (browser-safe only with VITE_ prefix)
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

### 4. Database Migrations & Seed Data
Apply the 9 version-controlled database migrations in `supabase/migrations/` using the Supabase CLI or SQL Editor:
```bash
# Apply migrations to remote Supabase project
npx supabase db push

# Run the idempotent demo data seed runner
npm run seed
```
*Note*: The seed runner is fully idempotent and can be re-run safely at any time. It imports departments, categories, SLAs, FAQs, knowledge documents, and routing rules using upsert logic.

### 5. Running Locally
Run both backend and frontend development servers concurrently:
```bash
npm run dev
```
- **Client Application**: [http://localhost:5173](http://localhost:5173)
- **Express Backend API**: [http://localhost:5000](http://localhost:5000)
- **Liveness Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **Readiness Probe**: [http://localhost:5000/api/ready](http://localhost:5000/api/ready)

### 6. Quick Demo Login Credentials
For demonstration and testing purposes, pre-configured roles are available:
- **Student**: `student@demo.college.edu` / `DemoStudent@2026`
- **Staff (CSE)**: `staff.cse@demo.college.edu` / `DemoStaff@2026`
- **Staff (Finance)**: `staff.finance@demo.college.edu` / `DemoStaff@2026`
- **Super Admin**: `admin@college.edu` / `DemoAdmin@2026`

---

## 🧪 Comprehensive Verification & Test Suite

SmartDesk includes 366 unit, integration, RBAC, and UI tests across 31 test suites with a **100% pass rate**:

```bash
# Run all server tests (19 suites, 303 tests)
npm --prefix server test

# Run all client tests (12 suites, 63 tests)
npm --prefix client test

# Run full project test suite sequentially
npm test

# Build client production bundle
npm run build
```

---

## 🛡️ Security Architecture & Privacy Safeguards

1. **Row Level Security (RLS)**: Enforced across all 18 exposed tables. Students can access only their own tickets; staff can access only tickets within their authorized department.
2. **Confidential Grievance Protection**: Grievance tickets (`is_confidential: true`) are strictly hidden from general staff and visible only to the student creator, authorized Student Affairs grievance officers, and Super Admin.
3. **Internal Note Separation**: Internal staff notes (`is_internal: true`) are filtered on both server and client; students never receive or view internal staff notes.
4. **File Signature Hardening**: Magic-byte verification inspects binary headers to reject spoofed files (e.g. bash scripts disguised as PDF), with strict 5 MB file size limits.
5. **Private Storage Downloads**: Attachments are stored in private Supabase buckets. Downloads generate signed URLs with strict 60-second TTLs after parent-ticket authorization.
6. **Zero Secret Exposure**: Centralized error sanitization redacts API keys, JWTs, bearer tokens, and connection strings from error responses. Vite build audits confirm zero secrets in client bundles.
7. **Rate Limiting & Abuse Protection**: Express rate limiters protect ticket creation, comment submission, attachment upload, and bulk triage endpoints.

---

## ⚠️ Known Limitations & Manual External Configuration

SmartDesk runs fully locally out-of-the-box with built-in fallbacks. For production deployment, the following external services require manual configuration:
1. **Live LLM Provider**: To use live Google Gemini or OpenAI instead of deterministic offline search, set `LLM_API_KEY` in `server/.env`.
2. **SMTP Email Delivery**: For real outbound email notifications, configure valid SMTP credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) in `server/.env`. By default, notification jobs are queued and logged safely in memory/database outbox without throwing errors.
3. **Supabase Realtime**: WebSocket realtime events require enabling replication for the `tickets` table in the Supabase Dashboard (`Database -> Replication -> tickets`). If realtime is disconnected, the client automatically falls back to safe polling and window focus/online refetching.
4. **Storage Bucket**: The `ticket-attachments` bucket must be created as a **private** bucket in Supabase Storage with signed URL access enabled.

---

## 📖 Documentation & Guides

- [Production Deployment Guide](file:///docs/DEPLOYMENT_GUIDE.md): End-to-end cloud deployment, migrations, backups, and provider costs.
- [Implementation Plan](file:///docs/IMPLEMENTATION_PLAN.md): Detailed task breakdown and verification notes for Phases 1 through 10.
- [Phase 1-10 Checklist](file:///CHECKLIST.md): Complete phase verification record and test statistics.
- [Data Replacement & Governance Guide](file:///docs/DATA_REPLACEMENT_AND_GOVERNANCE_GUIDE.md): Replacing demo fixtures with institutional production data.
- [Ticket Classification Report](file:///docs/TICKET_CLASSIFICATION_REPORT.md): Deep learning and taxonomy evaluation results.

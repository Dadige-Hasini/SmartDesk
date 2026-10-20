# SmartDesk — AI-Powered College Student Help Desk

[![Status](https://img.shields.io/badge/Status-Phase%200%20Complete-emerald.svg)]()
[![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Express%20%7C%20Supabase-1a1a2e.svg)]()
[![License](https://img.shields.io/badge/License-Proprietary-coral.svg)]()

SmartDesk is an enterprise-grade AI-powered college support portal designed to streamline student inquiries and staff ticket management. It features a grounded Retrieval-Augmented Generation (RAG) assistant, finite-state ticket lifecycle management, departmental routing, private attachment handling, in-app/email notifications, and multi-tenant security backed by PostgreSQL Row Level Security (RLS).

---

## 🏗️ Technology Stack

| Domain | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, React Router v7, TanStack Query v5, Recharts, React Hot Toast, React Dropzone, date-fns, DOMPurify, Lucide React |
| **Backend** | Node.js (ES Modules), Express.js, Helmet, CORS, express-rate-limit, Zod, Nodemailer, Multer, Structured Logger with Request IDs |
| **Database & Auth** | Supabase PostgreSQL, Supabase Auth, Row Level Security (RLS), pgvector, Private Supabase Storage |
| **AI / Machine Learning** | Gemini / OpenAI LLM APIs (server-side only), 768-dim semantic embeddings, pgvector cosine similarity, text classifier evaluation |
| **Testing** | Vitest, Supertest, React Testing Library, jsdom |

---

## 📁 Repository Structure

```
smartdesk/
  ├── client/                 # React frontend application (Vite)
  │   ├── src/
  │   │   ├── api/            # Axios API client and interceptors
  │   │   ├── components/     # Reusable UI components
  │   │   ├── context/        # React contexts (Theme, Auth)
  │   │   ├── layouts/        # Application layouts (Root, Sidebar)
  │   │   ├── pages/          # Application views
  │   │   ├── styles/         # Global styles
  │   │   └── utils/          # Frontend helpers
  │   ├── index.html
  │   ├── vite.config.js
  │   └── tailwind.config.js
  ├── server/                 # Express backend API (ES Modules)
  │   ├── src/
  │   │   ├── config/         # Environment and service configurations
  │   │   ├── controllers/    # Route controllers
  │   │   ├── middleware/     # Request ID, error handler, auth guards
  │   │   ├── routes/         # API routes
  │   │   ├── services/       # Business logic (RAG, tickets, email)
  │   │   ├── utils/          # Response envelope, structured logger
  │   │   ├── app.js          # Express app setup
  │   │   └── server.js       # HTTP server entry point
  │   └── tests/              # Backend integration tests (Supertest + Vitest)
  ├── supabase/
  │   ├── migrations/         # Version-controlled SQL migrations
  │   ├── seed.sql            # Reproducible development seed script
  │   └── config.toml         # Supabase CLI configuration
  ├── docs/                   # System design, architecture, and API docs
  ├── scripts/                # Database management & seed runners
  ├── .env.example            # Environment variables template
  ├── CHECKLIST.md            # Master phase tracking checklist
  └── package.json            # Root workspace orchestration
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **Git**

### 2. Environment Setup
Copy the environment template and populate your local credentials:
```bash
cp .env.example .env
```
Key configuration values are described in `.env.example`.

### 3. Installation
Install all dependencies across the workspace:
```bash
npm run install:all
```

### 4. Running Locally
Run both client and server concurrently:
```bash
npm run dev
```
- **Client**: `http://localhost:5173`
- **Server API**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/api/health`

Alternatively, run services independently:
```bash
npm run dev:server    # Starts Express backend on port 5000 with watch mode
npm run dev:client    # Starts Vite dev server on port 5173
```

---

## 🧪 Testing

Execute test suites across both server and client:
```bash
npm test              # Runs all test suites
npm run test:server   # Runs backend tests with Vitest & Supertest
npm run test:client   # Runs frontend tests with Vitest & React Testing Library
```

---

## 🛡️ Security Architecture
1. **Zero-Trust Roles**: Roles are never trusted from client payloads or headers. The database and server authenticate users strictly using `auth.uid()` and verified PostgreSQL `profiles` records.
2. **Departmental Isolation**: Staff are restricted to tickets matching their assigned department. Confidential grievance tickets require explicit permissions.
3. **Internal Note Redaction**: Internal staff notes are stripped from student API responses and guarded by RLS.
4. **Rate Limiting & Headers**: Endpoints are fortified with Helmet and express-rate-limit.
5. **Private Storage**: Attachments are stored in private Supabase Storage buckets and served via short-lived signed URLs.

---

## 📑 Implementation Phases
SmartDesk is built iteratively:
- **Phase 0**: Workspace Foundation & Architecture Setup *(Completed)*
- **Phase 1**: Database Schema, Security (RLS) & Migrations *(Next)*
- **Phase 2**: Authentication, Authorization & User Management
- **Phase 3**: Core Ticket Management & Lifecycle Engine
- **Phase 4**: Comments, Attachments & Notifications
- **Phase 5**: AI & Deep Learning Integration (RAG + Classifier)
- **Phase 6**: Dashboards, UI/UX Polish & Analytics
- **Phase 7**: End-to-End Testing, Security Auditing & Production Verification

Refer to [CHECKLIST.md](file:///d:/smartdesk/CHECKLIST.md) for detailed progress tracking.

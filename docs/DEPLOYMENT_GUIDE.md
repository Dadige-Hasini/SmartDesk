# SmartDesk Production Deployment & Operations Guide

This guide details the complete deployment, configuration, database initialization, security provisioning, and disaster recovery procedures for **SmartDesk — AI-Powered College Student Help Desk**.

---

## 1. System Architecture Overview

SmartDesk operates on a modern, decoupled, cloud-ready architecture:

```mermaid
graph TD
    Client["Vite React Client SPA<br/>(Vercel / Netlify / Cloudflare Pages)"]
    Express["Express REST API Backend<br/>(Render / Railway / AWS ECS)"]
    SLAWorker["SLA Watchdog Worker<br/>(Node.js Daemon / Cron)"]
    SupaAuth["Supabase Auth<br/>(JWT Verification)"]
    SupaDB[("Supabase PostgreSQL 15+<br/>+ pgvector Extension")]
    SupaStorage["Supabase Storage<br/>(Private Encrypted S3 Bucket)"]
    AIProvider["AI Provider<br/>(Google Gemini / OpenAI / Mock)"]
    SMTP["SMTP Mail Provider<br/>(Transactional Outbox)"]

    Client -->|HTTPS / Bearer JWT| Express
    Client -->|Auth Handshake| SupaAuth
    Express -->|Postgres / RLS / Vector Search| SupaDB
    Express -->|Signed URLs (60s TTL)| SupaStorage
    Express -->|Ingestion & RAG Generation| AIProvider
    Express -->|Deduplicated Notifications| SMTP
    SLAWorker -->|Watches Tickets & Escalations| SupaDB
```

---

## 2. Environment Configuration

### A. Express Backend (`server/.env`)

Create `server/.env` based on `server/.env.example`:

```env
# Server Runtime
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://smartdesk.college.edu

# Supabase Infrastructure (SERVER ONLY)
# CRITICAL: NEVER expose SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY to the client!
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_STORAGE_BUCKET=ticket-attachments

# AI Assistant & RAG Settings
AI_PROVIDER=gemini # 'gemini' | 'openai' | 'mock'
GEMINI_API_KEY=AIzaSy...
# OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-004

# Email Outbox & Notification Delivery
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@smartdesk.college.edu
SMTP_PASS=production-smtp-secret
SMTP_FROM="SmartDesk College Help Desk <support@smartdesk.college.edu>"
EMAIL_ENABLED=true

# Security & CORS
CORS_ORIGIN=https://smartdesk.college.edu
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=300
```

### B. Client Single Page Application (`client/.env.production`)

Create `client/.env.production`:

```env
# Public Supabase credentials for client authentication
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend Express API Endpoint
VITE_API_URL=https://api.smartdesk.college.edu/api
```

> [!CAUTION]
> **Zero Secret Leakage Guarantee**:
> Verify that no server-only environment variables (`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `SMTP_PASS`) are prefixed with `VITE_`. Any variable starting with `VITE_` is automatically bundled and visible to anyone inspecting the browser bundle.

---

## 3. Database Migration & Seed Sequence

All database migrations are located in `supabase/migrations/` and must be executed in chronological order:

| Step | Migration File | Description |
| :--- | :--- | :--- |
| 1 | `00001_initial_schema.sql` | Base schema, ENUMs, departments, profiles, tickets, events, RLS. |
| 2 | `00002_comments_attachments_notifications.sql` | Private attachments, comments, notifications, email outbox. |
| 3 | `00003_storage_bucket.sql` | Configures private `ticket-attachments` Supabase storage bucket. |
| 4 | `00004_fix_profiles_rls.sql` | Restricts profile modifications to authorized owners and admins. |
| 5 | `00005_audit_logs.sql` | Immutable audit logging and administrative governance tables. |
| 6 | `00006_rag_knowledge_base.sql` | Enables `pgvector`, creates knowledge documents and chunks. |
| 7 | `00007_rag_hybrid_functions.sql` | Vector similarity match function `match_knowledge_chunks`. |
| 8 | `00008_faq_and_knowledge_base.sql` | Public FAQs, helpfulness counters, and document versioning. |

### Applying Migrations via Supabase CLI

```bash
# Log in to Supabase CLI
npx supabase login

# Link your local repository to your remote Supabase project
npx supabase link --project-ref your-project-ref

# Push all migrations to remote database
npx supabase db push
```

### Executing Canonical Seed Data

To populate the 10 college departments, 10 canonical categories, automatic routing rules, default SLA targets, and baseline FAQs:

```bash
# Apply seed via Supabase CLI
npx supabase db execute --file supabase/seed.sql
```

Alternatively, open the **SQL Editor** in the Supabase Dashboard and run `supabase/seed.sql`.

---

## 4. Secure Super Admin Provisioning

To prevent insecure default credentials from being committed to source control, provision the first Super Admin account directly using the secure CLI provisioning script:

```bash
cd server
node scripts/provision_super_admin.js "admin@college.edu" "StrongAdminPassword2026!" "Chief Administrator"
```

This script:
1. Provisions the user in Supabase Auth via `supabaseAdmin.auth.admin.createUser` with `email_confirm: true`.
2. Upserts the `public.profiles` record setting:
   - `role: 'SUPER_ADMIN'`
   - `status: 'ACTIVE'`
   - `can_approve_documents: true`
3. Audits the provisioning event.

---

## 5. Frontend Deployment (Vercel / Netlify / Cloudflare Pages)

### Build Command & Output
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: 18.x or 20.x

### Single Page Application (SPA) Routing Configuration

Because SmartDesk uses `react-router` client-side routing, configure rewrite rules so that all deep URLs (e.g. `/tickets/new`, `/admin`, `/faqs`) serve `index.html`:

**For Vercel (`vercel.json`):**
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**For Netlify (`client/public/_redirects`):**
```text
/*    /index.html   200
```

---

## 6. Express Backend Deployment (Render / Railway / AWS / Docker)

### Starting the Production Server
```bash
cd server
npm ci --omit=dev
npm start
```

### Running the SLA Watchdog Daemon
The SLA Watchdog periodically checks ticket response and resolution deadlines and applies automated warnings and escalations:

```bash
# In production, run as a supervised background daemon (PM2, systemd, or secondary container):
node src/workers/sla.worker.js
```

Or configure a cron job to trigger the SLA evaluation endpoint every 5 minutes:
```bash
*/5 * * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://api.smartdesk.college.edu/api/admin/sla/evaluate
```

---

## 7. Health & Readiness Monitoring

SmartDesk includes standard probes designed for Kubernetes, AWS ALB, Render, and Uptime monitors:

### 1. Liveness Probe: `GET /api/health`
- **Purpose**: Fast check to verify Express process is alive and accepting connections.
- **Response**: HTTP 200 `{ "success": true, "data": { "status": "ok", "uptimeSeconds": 1284 } }`

### 2. Readiness Probe: `GET /api/ready`
- **Purpose**: Deep verification of downstream systems (Database, Storage, AI Assistant, SLA Worker).
- **Security**: Reports operational status without leaking connection strings, secrets, or internal keys.
- **Response**: HTTP 200 `{ "success": true, "data": { "status": "ready", "services": { "api": "operational", "database": "connected", "storage": "configured", "aiAssistant": "gemini", "slaScheduler": "operational" } } }`

---

## 8. Backup, Disaster Recovery & Rollback Protocols

### Database Backups
- **Supabase Automated Backups**: Daily automated snapshots retained for 7 to 30 days depending on plan.
- **Point-in-Time Recovery (PITR)**: Enable PITR in the Supabase Dashboard for zero-data-loss recovery down to the second.
- **Manual Hot Backup**:
  ```bash
  pg_dump -h db.your-project.supabase.co -U postgres -d postgres -F c -b -v -f smartdesk_backup_$(date +%F).dump
  ```

### Rollback Strategy
1. **Frontend**: Pin production releases using git tags (`v1.0.0`). In Vercel or Netlify, instantaneous one-click rollbacks are supported.
2. **Backend**: Keep the previous Docker image tagged (`smartdesk-api:v1.0.0`). Revert container orchestrator definition if needed.
3. **Database**: If a migration fails, inspect the migration's corresponding down-migration script or restore the snapshot taken prior to applying the migration.

---

## 9. Provider Costs & Capacity Planning

| Component | Free / Low-Tier | Recommended Production Tier | Monthly Estimated Cost |
| :--- | :--- | :--- | :--- |
| **Supabase** | Free (500MB DB, 1GB Storage) | Pro Plan ($25/mo) | $25/month |
| **Express Backend** | Free Tier (Render/Railway) | Render Team / Railway Pro (1GB RAM, 1 vCPU) | $7 – $20/month |
| **Frontend Hosting** | Vercel Hobby (Free) | Vercel Pro ($20/mo) or Cloudflare Pages ($0) | $0 – $20/month |
| **Google Gemini API** | Free tier (15 RPM) | Pay-as-you-go Gemini 1.5 Flash ($0.075 / 1M tokens) | ~$5 – $15/month for 50,000 queries |
| **SMTP Delivery** | Mailgun / Resend Free (3,000 emails/mo) | Mailgun / SendGrid Starter | $0 – $15/month |
| **Total Estimated Cost** | **$0** (PoC / Testing) | **Production Tier** | **~$35 – $75 / month** |

---

## 10. Operational Limitations & Constraints

1. **File Upload Limits**:
   - Maximum upload size: 5 MB per file.
   - Maximum files per ticket/comment: 3 files.
   - Permitted formats: PDF, JPEG, PNG, WEBP, DOCX. Executable or script files are rejected via magic-byte inspection.
2. **Rate Limiting**:
   - Global API limit: 300 requests per 15 minutes per IP address.
   - AI Chat queries: Rate limited to prevent model quota exhaustion.
3. **Document Ingestion for RAG**:
   - Supported document formats: Plain text (`.txt`, `.md`), PDF (`.pdf`), and Word (`.docx`).
   - Chunks are generated at 500 characters with 100 character overlap.

# Supabase Setup, Migrations & Super Admin Provisioning Guide

This guide describes how to connect SmartDesk to your Supabase project, execute the SQL migrations, and provision your initial development Super Administrator.

---

## 1. Retrieve Your Supabase Credentials

1. Navigate to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project and click **Project Settings** (gear icon) in the sidebar.
3. Select the **API** tab:
   - **Project URL**: Copy this value.
   - **Project API Keys**:
     - `anon` / `public`: Copy this value. This is safe for browser use.
     - `service_role` / `secret`: Click "Reveal" and copy this value. **This key has administrative bypass rights and must NEVER be exposed to the browser or committed to Git.**

---

## 2. Configure Environment Variables

Create a `.env` file in the root of the `smartdesk` repository by copying `.env.example`:

```bash
cp .env.example .env
```

Populate the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Server-side Supabase credentials
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
SUPABASE_SECRET_KEY=eyJhbGciOi...

# Browser-side Supabase credentials (Vite exposes VITE_ prefixed variables to client bundles)
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
```

> [!CAUTION]
> Never set `VITE_SUPABASE_SECRET_KEY`. Vite bundles anything prefixed with `VITE_` into client JavaScript code. The `SUPABASE_SECRET_KEY` must remain strictly server-only.

---

## 3. Apply Database Migrations

SmartDesk uses version-controlled SQL migrations stored in `supabase/migrations/`.

### Method A: Via Supabase Dashboard (Recommended for Quick Cloud Setup)
1. Open your Supabase Dashboard and click **SQL Editor** in the left sidebar.
2. Click **New Query**.
3. Copy the contents of:
   - [20261020000000_init.sql](file:///d:/smartdesk/supabase/migrations/20261020000000_init.sql) (Initial extensions)
   - [20261020000001_departments_and_profiles.sql](file:///d:/smartdesk/supabase/migrations/20261020000001_departments_and_profiles.sql) (Departments, profiles, triggers, and RLS policies)
4. Paste the SQL into the editor and click **Run**.
5. Verify in the **Table Editor** that `departments` and `profiles` tables now exist with Row Level Security (RLS) enabled.

### Method B: Via Supabase CLI
If using the Supabase CLI:
```bash
npx supabase login
npx supabase link --project-ref <your-project-id>
npx supabase db push
```

---

## 4. Provisioning the Initial Super Administrator

In compliance with our zero-trust security architecture, public registration forms **never** allow self-assigning the `SUPER_ADMIN` role. An administrator must be provisioned through our trusted server-side script using the service-role key.

Run the provisioning script from the repository root:

```bash
node scripts/provision-super-admin.js --email admin@college.edu --password "YourStrongPassword123!" --name "Chief Campus Administrator"
```

### What this script performs:
1. Creates the user account in Supabase Auth (`auth.users`) with `email_confirm: true`.
2. Upserts a record in `public.profiles` setting:
   - `role: 'SUPER_ADMIN'`
   - `status: 'ACTIVE'`
   - `full_name: 'Chief Campus Administrator'`
3. Sets up full administrative access to department management, staff approval queues, and system audits.

---

## 5. Verifying the Connection

1. Start both servers:
   ```bash
   npm run dev
   ```
2. Navigate to `http://localhost:5173/login`.
3. Sign in using the Super Administrator credentials you provisioned.
4. The top navigation bar will reflect your authenticated status:
   `Chief Campus Administrator (SUPER_ADMIN)`.
5. Verify token verification by querying the backend API:
   ```bash
   # From your browser console or terminal with your access token:
   curl -H "Authorization: Bearer <your_access_token>" http://localhost:5000/api/auth/me
   ```
   The backend will validate the token against Supabase Auth, query the authoritative profile from PostgreSQL, and return the verified profile.

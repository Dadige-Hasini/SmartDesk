-- ====================================================================
-- SmartDesk Consolidated Production Schema
-- Version: 20261030_FINAL_REVIEWED
-- Description: Complete schema for SmartDesk — an AI-Powered College
--              Student Help Desk. Provisions extensions, 24 tables,
--              pgvector(768), sequences, triggers, least-privilege RLS
--              policies (with DROP POLICY IF EXISTS idempotency),
--              and vector retrieval RPC functions.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_departments_code ON public.departments(code);
CREATE INDEX IF NOT EXISTS idx_departments_active ON public.departments(is_active);

-- 3. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'STAFF', 'SUPER_ADMIN')),
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  roll_number TEXT UNIQUE,
  year_of_study INTEGER CHECK (year_of_study BETWEEN 1 AND 5),
  employee_id TEXT UNIQUE,
  designation TEXT,
  phone_number TEXT,
  avatar_url TEXT,
  can_approve_documents BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles(department_id);

-- 4. SECURITY DEFINER HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_status()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_department_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN' AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('STAFF', 'SUPER_ADMIN') AND status = 'ACTIVE'
  );
$$;

-- 5. AUTOMATIC PROFILE CREATION TRIGGER (FOR NEW SIGNUPS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
  v_full_name TEXT;
  v_department_id UUID;
  v_roll_number TEXT;
  v_year_of_study INTEGER;
  v_employee_id TEXT;
  v_designation TEXT;
  v_phone TEXT;
BEGIN
  -- Extract requested role, default to STUDENT
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'STUDENT');

  -- Zero-Trust Safeguard: Never permit self-assignment of SUPER_ADMIN via metadata
  IF v_role = 'SUPER_ADMIN' THEN
    v_role := 'STUDENT';
  END IF;
  IF v_role NOT IN ('STUDENT', 'STAFF') THEN
    v_role := 'STUDENT';
  END IF;

  -- Staff requires administrator verification; Students start ACTIVE
  IF v_role = 'STAFF' THEN
    v_status := 'PENDING_APPROVAL';
  ELSE
    v_status := 'ACTIVE';
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_department_id := (NEW.raw_user_meta_data->>'department_id')::UUID;
  v_roll_number := NEW.raw_user_meta_data->>'roll_number';
  v_year_of_study := (NEW.raw_user_meta_data->>'year_of_study')::INTEGER;
  v_employee_id := NEW.raw_user_meta_data->>'employee_id';
  v_designation := NEW.raw_user_meta_data->>'designation';
  v_phone := NEW.raw_user_meta_data->>'phone_number';

  INSERT INTO public.profiles (
    id, email, full_name, role, status, department_id,
    roll_number, year_of_study, employee_id, designation, phone_number
  ) VALUES (
    NEW.id, NEW.email, v_full_name, v_role, v_status, v_department_id,
    v_roll_number, v_year_of_study, v_employee_id, v_designation, v_phone
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to prevent unprivileged role/status escalation on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT public.is_super_admin() AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Unauthorized: Only Super Administrators can alter user roles or approval statuses.';
    END IF;
  END IF;
  
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- 6. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_categories_code ON public.categories(code);

-- 7. CATEGORY ROUTING RULES
CREATE TABLE IF NOT EXISTS public.category_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  default_department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  default_priority TEXT NOT NULL DEFAULT 'Medium' CHECK (default_priority IN ('Low', 'Medium', 'High', 'Urgent', 'P1', 'P2', 'P3', 'P4')),
  confidence_threshold FLOAT DEFAULT 0.7,
  fallback_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  human_review BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_category_routing UNIQUE (category_id, default_department_id)
);

CREATE INDEX IF NOT EXISTS idx_routing_category ON public.category_routing_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_routing_rule_id ON public.category_routing_rules(rule_id);

-- 8. SLA POLICIES
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent', 'P1', 'P2', 'P3', 'P4')),
  response_time_hours INTEGER NOT NULL DEFAULT 8 CHECK (response_time_hours > 0),
  resolution_time_hours INTEGER NOT NULL DEFAULT 48 CHECK (resolution_time_hours > 0),
  first_response_minutes INTEGER,
  resolution_hours INTEGER,
  escalate_hours INTEGER,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sla_priority_category 
ON public.sla_policies (priority, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- 9. TICKET NUMBER SEQUENCE & GENERATOR
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  today_str TEXT;
  seq_val BIGINT;
BEGIN
  today_str := to_char(timezone('utc'::text, now()), 'YYYYMMDD');
  seq_val := nextval('public.ticket_number_seq');
  RETURN 'TKT-' || today_str || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

-- 10. TICKETS
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_id TEXT UNIQUE,
  ticket_number TEXT NOT NULL UNIQUE DEFAULT public.generate_ticket_number(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 5),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_INFO', 'RESOLVED', 'CLOSED', 'REJECTED')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  is_overdue BOOLEAN NOT NULL DEFAULT false,
  sla_breached_at TIMESTAMPTZ,
  resolution_summary TEXT,
  rejection_reason TEXT,
  reopened_count INTEGER NOT NULL DEFAULT 0 CHECK (reopened_count >= 0),
  last_reopened_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_dept ON public.tickets(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON public.tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON public.tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_demo_id ON public.tickets(demo_id);

-- Automatic SLA calculation trigger on tickets
CREATE OR REPLACE FUNCTION public.calculate_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolution_hours INTEGER;
BEGIN
  IF NEW.sla_due_at IS NULL THEN
    SELECT resolution_time_hours INTO v_resolution_hours
    FROM public.sla_policies
    WHERE priority = NEW.priority AND is_active = true
    LIMIT 1;

    IF v_resolution_hours IS NOT NULL THEN
      NEW.sla_due_at := NEW.created_at + (v_resolution_hours || ' hours')::INTERVAL;
    ELSE
      NEW.sla_due_at := NEW.created_at + INTERVAL '48 hours';
    END IF;
  END IF;
  
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_ticket_sla ON public.tickets;
CREATE TRIGGER trg_calculate_ticket_sla
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.calculate_ticket_sla();

-- 11. TICKET ACCESS HELPER FUNCTION (LEAST-PRIVILEGE AUTHORIZATION)
CREATE OR REPLACE FUNCTION public.can_access_ticket(ticket_dept_id UUID, ticket_creator_id UUID, is_confidential BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Super Admin has universal access
    public.is_super_admin()
    OR
    -- Student creator has access to their own ticket
    (auth.uid() = ticket_creator_id)
    OR
    -- Department staff can view non-confidential tickets for their assigned department
    (
      public.is_staff()
      AND NOT is_confidential
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND department_id = ticket_dept_id AND status = 'ACTIVE'
      )
    )
    OR
    -- Authorized grievance officers: staff in Student Affairs/Grievance Cell can view confidential tickets for their department
    (
      public.is_staff()
      AND is_confidential
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.departments d ON p.department_id = d.id
        WHERE p.id = auth.uid()
          AND p.department_id = ticket_dept_id
          AND p.status = 'ACTIVE'
          AND d.code IN ('STU', 'AFFAIRS')
      )
    )
  );
$$;

-- 12. TICKET EVENTS & RATINGS
CREATE TABLE IF NOT EXISTS public.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON public.ticket_events(ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. COMMENTS, ATTACHMENTS, NOTIFICATIONS & EMAIL OUTBOX
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON public.ticket_comments(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_internal ON public.ticket_comments(ticket_id, is_internal);

CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON public.attachments(ticket_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_on_ticket_created BOOLEAN NOT NULL DEFAULT true,
  email_on_ticket_assigned BOOLEAN NOT NULL DEFAULT true,
  email_on_comment_added BOOLEAN NOT NULL DEFAULT true,
  email_on_status_changed BOOLEAN NOT NULL DEFAULT true,
  email_on_ticket_resolved BOOLEAN NOT NULL DEFAULT true,
  email_on_ticket_reopened BOOLEAN NOT NULL DEFAULT true,
  in_app_notifications BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  dedup_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_dispatch ON public.email_jobs(status, next_attempt_at);

-- 14. ANNOUNCEMENTS & ADMIN AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 5),
  target_audience TEXT NOT NULL DEFAULT 'ALL' CHECK (target_audience IN ('ALL', 'STUDENTS', 'STAFF')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.announcements(target_audience, is_active, published_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON public.admin_audit_logs(target_type, target_id);

-- 15. KNOWLEDGE DOCUMENTS & PGVECTOR (768-DIMENSIONS)
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_code TEXT UNIQUE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  description TEXT,
  content TEXT,
  file_path TEXT,
  file_type TEXT NOT NULL DEFAULT 'TXT' CHECK (file_type IN ('PDF', 'DOCX', 'TXT', 'MD')),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED', 'ARCHIVED')),
  visibility VARCHAR(30) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'INTERNAL_DEPARTMENT', 'STAFF_ONLY')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  retired_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_kdoc_approved_active ON public.knowledge_documents(is_approved, is_active);
CREATE INDEX IF NOT EXISTS idx_kdoc_status ON public.knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_kdoc_visibility ON public.knowledge_documents(visibility);

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 10),
  section TEXT,
  token_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id ON public.document_chunks(document_id, chunk_index);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_document_chunks_vector ON public.document_chunks USING hnsw (embedding vector_cosine_ops)';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 16. FAQS WITH PGVECTOR (768-DIMENSIONS) & VOTING
CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_code TEXT UNIQUE,
  question TEXT NOT NULL CHECK (char_length(trim(question)) >= 5),
  answer TEXT NOT NULL CHECK (char_length(trim(answer)) >= 10),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  keywords TEXT[] DEFAULT '{}',
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  unhelpful_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'RETIRED')),
  visibility VARCHAR(30) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'INTERNAL_DEPARTMENT', 'STAFF_ONLY')),
  source_document TEXT,
  version INT NOT NULL DEFAULT 1,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_faqs_category ON public.faqs(category_id);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON public.faqs(is_published);
CREATE INDEX IF NOT EXISTS idx_faqs_faq_code ON public.faqs(faq_code);
CREATE INDEX IF NOT EXISTS idx_faqs_status ON public.faqs(status);
CREATE INDEX IF NOT EXISTS idx_faqs_visibility ON public.faqs(visibility);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_faqs_embedding_hnsw ON public.faqs USING hnsw (embedding vector_cosine_ops)';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.faq_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id UUID NOT NULL REFERENCES public.faqs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address VARCHAR(45) NOT NULL,
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_faq_votes_faq_id ON public.faq_votes(faq_id);
CREATE INDEX IF NOT EXISTS idx_faq_votes_ip ON public.faq_votes(ip_address, faq_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_faq_vote_user ON public.faq_votes(faq_id, user_id) WHERE user_id IS NOT NULL;

-- 17. AI INTERACTIONS, DEFLECTIONS, FEEDBACK & ML EVALUATIONS
CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  response TEXT,
  model TEXT,
  tokens_used INT,
  latency_ms INT,
  deflected BOOLEAN NOT NULL DEFAULT false,
  matched_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  confidence_score FLOAT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_user ON public.ai_interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_session ON public.ai_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_deflected ON public.ai_interactions(deflected);

CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_helpful BOOLEAN NOT NULL,
  feedback_text TEXT,
  citations JSONB DEFAULT '[]'::jsonb,
  has_sufficient_evidence BOOLEAN DEFAULT true,
  confidence_score NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON public.ai_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_helpful ON public.ai_feedback(is_helpful);

CREATE TABLE IF NOT EXISTS public.ai_deflection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  deflected_by TEXT NOT NULL CHECK (deflected_by IN ('AI_ASSISTANT', 'SIMILAR_FAQ', 'KNOWLEDGE_BASE')),
  matched_faq_id UUID REFERENCES public.faqs(id) ON DELETE SET NULL,
  similarity_score FLOAT,
  was_ticket_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.ai_model_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  split_strategy TEXT NOT NULL,
  num_train_samples INT NOT NULL,
  num_val_samples INT NOT NULL,
  num_test_samples INT NOT NULL,
  num_classes INT NOT NULL DEFAULT 10,
  accuracy FLOAT NOT NULL,
  macro_precision FLOAT NOT NULL,
  macro_recall FLOAT NOT NULL,
  macro_f1 FLOAT NOT NULL,
  recall_at_1 FLOAT,
  recall_at_5 FLOAT,
  mrr_at_5 FLOAT,
  confusion_matrix JSONB NOT NULL DEFAULT '{}'::jsonb,
  per_class_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  hardware_environment TEXT,
  evaluation_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  evaluated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 18. AUDIT EVENTS
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  actor TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_events_event ON public.audit_events(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events(actor, role);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events(entity);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON public.audit_events(timestamp DESC);

-- 19. VECTOR RETRIEVAL RPC FUNCTIONS
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.35,
  match_count int DEFAULT 5,
  filter_department_id uuid DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  document_title text,
  section text,
  content text,
  similarity float,
  version int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    kd.title AS document_title,
    dc.section,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::float AS similarity,
    kd.version
  FROM public.document_chunks dc
  JOIN public.knowledge_documents kd ON dc.document_id = kd.id
  WHERE
    kd.is_approved = true
    AND kd.is_active = true
    AND kd.status = 'ACTIVE'
    AND (filter_department_id IS NULL OR kd.department_id = filter_department_id)
    AND (filter_category_id IS NULL OR kd.category_id = filter_category_id)
    AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_faqs(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.25,
  match_count int DEFAULT 5,
  p_category_id UUID DEFAULT NULL,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  category_id UUID,
  category_code TEXT,
  department_id UUID,
  similarity FLOAT,
  view_count INT,
  helpful_count INT,
  status VARCHAR,
  visibility VARCHAR
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.question,
    f.answer,
    f.category_id,
    c.code AS category_code,
    f.department_id,
    (1 - (f.embedding <=> query_embedding))::FLOAT AS similarity,
    f.view_count,
    f.helpful_count,
    f.status,
    f.visibility
  FROM public.faqs f
  LEFT JOIN public.categories c ON f.category_id = c.id
  WHERE
    f.is_published = true
    AND f.status = 'PUBLISHED'
    AND (p_include_internal = true OR f.visibility = 'PUBLIC')
    AND (p_category_id IS NULL OR f.category_id = p_category_id)
    AND (1 - (f.embedding <=> query_embedding)) >= match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 20. ROW LEVEL SECURITY (RLS) ACTIVATION ON ALL 24 TABLES
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_deflection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- 21. LEAST-PRIVILEGE RLS POLICIES (IDEMPOTENT VIA DROP POLICY IF EXISTS)

-- Departments
DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select" ON public.departments FOR SELECT TO authenticated
USING (is_active = true OR public.is_super_admin());

DROP POLICY IF EXISTS "departments_admin_all" ON public.departments;
CREATE POLICY "departments_admin_all" ON public.departments FOR ALL TO authenticated
USING (public.is_super_admin());

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;
CREATE POLICY "profiles_select_staff" ON public.profiles FOR SELECT TO authenticated
USING (public.is_staff());

DROP POLICY IF EXISTS "profiles_select_staff_public" ON public.profiles;
CREATE POLICY "profiles_select_staff_public" ON public.profiles FOR SELECT TO authenticated
USING (role IN ('STAFF', 'SUPER_ADMIN') AND status = 'ACTIVE');

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Categories
DROP POLICY IF EXISTS "categories_read" ON public.categories;
CREATE POLICY "categories_read" ON public.categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "categories_admin" ON public.categories;
CREATE POLICY "categories_admin" ON public.categories FOR ALL TO authenticated USING (public.is_super_admin());

-- Category Routing Rules
DROP POLICY IF EXISTS "routing_rules_read" ON public.category_routing_rules;
CREATE POLICY "routing_rules_read" ON public.category_routing_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "routing_rules_admin" ON public.category_routing_rules;
CREATE POLICY "routing_rules_admin" ON public.category_routing_rules FOR ALL TO authenticated USING (public.is_super_admin());

-- SLA Policies
DROP POLICY IF EXISTS "sla_read" ON public.sla_policies;
CREATE POLICY "sla_read" ON public.sla_policies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sla_admin" ON public.sla_policies;
CREATE POLICY "sla_admin" ON public.sla_policies FOR ALL TO authenticated USING (public.is_super_admin());

-- Tickets
DROP POLICY IF EXISTS "tickets_select" ON public.tickets;
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
USING (public.can_access_ticket(assigned_department_id, created_by, is_confidential));

DROP POLICY IF EXISTS "tickets_insert" ON public.tickets;
CREATE POLICY "tickets_insert" ON public.tickets FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "tickets_update" ON public.tickets;
CREATE POLICY "tickets_update" ON public.tickets FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    public.is_staff()
    AND (
      (NOT is_confidential AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND department_id = assigned_department_id AND status = 'ACTIVE'))
      OR (is_confidential AND EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.departments d ON p.department_id = d.id
        WHERE p.id = auth.uid() AND p.department_id = assigned_department_id AND p.status = 'ACTIVE' AND d.code IN ('STU', 'AFFAIRS')
      ))
    )
  )
  OR (created_by = auth.uid())
);

-- Ticket Events
DROP POLICY IF EXISTS "ticket_events_select" ON public.ticket_events;
CREATE POLICY "ticket_events_select" ON public.ticket_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_events.ticket_id
    AND public.can_access_ticket(t.assigned_department_id, t.created_by, t.is_confidential)
  )
);

DROP POLICY IF EXISTS "ticket_events_insert" ON public.ticket_events;
CREATE POLICY "ticket_events_insert" ON public.ticket_events FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL OR public.is_staff());

-- Ratings
DROP POLICY IF EXISTS "ratings_select" ON public.ratings;
CREATE POLICY "ratings_select" ON public.ratings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ratings.ticket_id
    AND public.can_access_ticket(t.assigned_department_id, t.created_by, t.is_confidential)
  )
);

DROP POLICY IF EXISTS "ratings_insert_student" ON public.ratings;
CREATE POLICY "ratings_insert_student" ON public.ratings FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

-- Ticket Comments
DROP POLICY IF EXISTS "comments_select_student" ON public.ticket_comments;
CREATE POLICY "comments_select_student" ON public.ticket_comments FOR SELECT TO authenticated
USING (
  is_internal = false
  AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_comments.ticket_id AND t.created_by = auth.uid())
);

DROP POLICY IF EXISTS "comments_select_staff" ON public.ticket_comments;
CREATE POLICY "comments_select_staff" ON public.ticket_comments FOR SELECT TO authenticated
USING (
  public.is_staff()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_comments.ticket_id
    AND public.can_access_ticket(t.assigned_department_id, t.created_by, t.is_confidential)
  )
);

DROP POLICY IF EXISTS "comments_insert_student" ON public.ticket_comments;
CREATE POLICY "comments_insert_student" ON public.ticket_comments FOR INSERT TO authenticated
WITH CHECK (
  is_internal = false
  AND author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_comments.ticket_id AND t.created_by = auth.uid() AND t.status NOT IN ('CLOSED', 'REJECTED'))
);

DROP POLICY IF EXISTS "comments_insert_staff" ON public.ticket_comments;
CREATE POLICY "comments_insert_staff" ON public.ticket_comments FOR INSERT TO authenticated
WITH CHECK (public.is_staff() AND author_id = auth.uid());

-- Attachments
DROP POLICY IF EXISTS "attachments_select_student" ON public.attachments;
CREATE POLICY "attachments_select_student" ON public.attachments FOR SELECT TO authenticated
USING (
  is_internal = false
  AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = attachments.ticket_id AND t.created_by = auth.uid())
);

DROP POLICY IF EXISTS "attachments_select_staff" ON public.attachments;
CREATE POLICY "attachments_select_staff" ON public.attachments FOR SELECT TO authenticated
USING (
  public.is_staff()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = attachments.ticket_id
    AND public.can_access_ticket(t.assigned_department_id, t.created_by, t.is_confidential)
  )
);

DROP POLICY IF EXISTS "attachments_insert" ON public.attachments;
CREATE POLICY "attachments_insert" ON public.attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = attachments.ticket_id
    AND public.can_access_ticket(t.assigned_department_id, t.created_by, t.is_confidential)
  )
);

-- Notifications
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- Notification Preferences
DROP POLICY IF EXISTS "notification_prefs_own" ON public.notification_preferences;
CREATE POLICY "notification_prefs_own" ON public.notification_preferences FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Email Jobs (Outbox restricted to service role)
DROP POLICY IF EXISTS "email_jobs_service" ON public.email_jobs;
CREATE POLICY "email_jobs_service" ON public.email_jobs FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Announcements
DROP POLICY IF EXISTS "announcements_read_active" ON public.announcements;
CREATE POLICY "announcements_read_active" ON public.announcements FOR SELECT TO authenticated
USING (
  is_active = true 
  AND (expires_at IS NULL OR expires_at > timezone('utc'::text, now()))
  AND (
    target_audience = 'ALL' 
    OR (target_audience = 'STUDENTS' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'STUDENT'))
    OR (target_audience = 'STAFF' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('STAFF', 'SUPER_ADMIN')))
    OR public.is_super_admin()
  )
);

DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
CREATE POLICY "announcements_admin_all" ON public.announcements FOR ALL TO authenticated
USING (public.is_super_admin());

-- Admin Audit Logs
DROP POLICY IF EXISTS "admin_audit_read" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_read" ON public.admin_audit_logs FOR SELECT TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "admin_audit_insert" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_insert" ON public.admin_audit_logs FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

-- Knowledge Documents & Chunks
DROP POLICY IF EXISTS "kdocs_public_read" ON public.knowledge_documents;
CREATE POLICY "kdocs_public_read" ON public.knowledge_documents FOR SELECT
USING (is_approved = true AND is_active = true AND status = 'ACTIVE');

DROP POLICY IF EXISTS "kdocs_staff_read" ON public.knowledge_documents;
CREATE POLICY "kdocs_staff_read" ON public.knowledge_documents FOR SELECT TO authenticated
USING (public.is_staff());

DROP POLICY IF EXISTS "kdocs_admin_manage" ON public.knowledge_documents;
CREATE POLICY "kdocs_admin_manage" ON public.knowledge_documents FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role = 'SUPER_ADMIN' OR p.can_approve_documents = true)));

DROP POLICY IF EXISTS "chunks_public_read" ON public.document_chunks;
CREATE POLICY "chunks_public_read" ON public.document_chunks FOR SELECT
USING (EXISTS (SELECT 1 FROM public.knowledge_documents kd WHERE kd.id = document_chunks.document_id AND kd.is_approved = true AND kd.is_active = true));

DROP POLICY IF EXISTS "chunks_admin_manage" ON public.document_chunks;
CREATE POLICY "chunks_admin_manage" ON public.document_chunks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role = 'SUPER_ADMIN' OR p.can_approve_documents = true)));

-- FAQs & Votes
DROP POLICY IF EXISTS "faqs_public_read" ON public.faqs;
CREATE POLICY "faqs_public_read" ON public.faqs FOR SELECT
USING (status = 'PUBLISHED' AND visibility = 'PUBLIC');

DROP POLICY IF EXISTS "faqs_staff_read" ON public.faqs;
CREATE POLICY "faqs_staff_read" ON public.faqs FOR SELECT TO authenticated
USING (public.is_staff());

DROP POLICY IF EXISTS "faqs_staff_insert_draft" ON public.faqs;
CREATE POLICY "faqs_staff_insert_draft" ON public.faqs FOR INSERT TO authenticated
WITH CHECK (public.is_staff() AND (public.is_super_admin() OR status = 'DRAFT'));

DROP POLICY IF EXISTS "faqs_admin_update" ON public.faqs;
CREATE POLICY "faqs_admin_update" ON public.faqs FOR UPDATE TO authenticated
USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.can_approve_documents = true));

DROP POLICY IF EXISTS "faq_votes_insert" ON public.faq_votes;
CREATE POLICY "faq_votes_insert" ON public.faq_votes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "faq_votes_read" ON public.faq_votes;
CREATE POLICY "faq_votes_read" ON public.faq_votes FOR SELECT TO authenticated
USING (public.is_staff());

-- AI Interactions & Feedback
DROP POLICY IF EXISTS "ai_interactions_own" ON public.ai_interactions;
CREATE POLICY "ai_interactions_own" ON public.ai_interactions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "ai_interactions_insert" ON public.ai_interactions;
CREATE POLICY "ai_interactions_insert" ON public.ai_interactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL OR public.is_staff());

DROP POLICY IF EXISTS "ai_feedback_insert" ON public.ai_feedback;
CREATE POLICY "ai_feedback_insert" ON public.ai_feedback FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "ai_feedback_read" ON public.ai_feedback;
CREATE POLICY "ai_feedback_read" ON public.ai_feedback FOR SELECT TO authenticated
USING (public.is_staff());

-- AI Deflection Events
DROP POLICY IF EXISTS "ai_deflection_events_select" ON public.ai_deflection_events;
CREATE POLICY "ai_deflection_events_select" ON public.ai_deflection_events FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "ai_deflection_events_insert" ON public.ai_deflection_events;
CREATE POLICY "ai_deflection_events_insert" ON public.ai_deflection_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL OR public.is_staff());

-- AI Model Evaluations
DROP POLICY IF EXISTS "evaluations_read" ON public.ai_model_evaluations;
CREATE POLICY "evaluations_read" ON public.ai_model_evaluations FOR SELECT TO authenticated
USING (public.is_staff());

DROP POLICY IF EXISTS "evaluations_admin" ON public.ai_model_evaluations;
CREATE POLICY "evaluations_admin" ON public.ai_model_evaluations FOR ALL TO authenticated
USING (public.is_super_admin());

-- Audit Events
DROP POLICY IF EXISTS "audit_events_read" ON public.audit_events;
CREATE POLICY "audit_events_read" ON public.audit_events FOR SELECT TO authenticated
USING (public.is_staff());

DROP POLICY IF EXISTS "audit_events_insert" ON public.audit_events;
CREATE POLICY "audit_events_insert" ON public.audit_events FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

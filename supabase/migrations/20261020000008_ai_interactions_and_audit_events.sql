-- ====================================================================
-- SmartDesk Migration: AI Interactions, Audit Events & Demo Schema Alignment
-- Version: 20261020000008
-- Description: AI interactions log, system audit events table matching
--              demo pack, routing rule attributes, and RLS policies.
-- ====================================================================

-- 1. Create AI Interactions Table
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

-- 2. Create Audit Events Table (System and cross-domain audit logs)
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

CREATE INDEX IF NOT EXISTS idx_audit_events_event_id ON public.audit_events(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events(actor, role);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events(entity);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON public.audit_events(timestamp DESC);

-- 3. Enhance Category Routing Rules with Demo Attributes
ALTER TABLE public.category_routing_rules
  ADD COLUMN IF NOT EXISTS rule_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS confidence_threshold FLOAT DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS fallback_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS human_review BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_routing_rule_id ON public.category_routing_rules(rule_id);

-- 4. Enhance SLA Policies with Demo Attributes & Flexible Priority
ALTER TABLE public.sla_policies
  ADD COLUMN IF NOT EXISTS first_response_minutes INT,
  ADD COLUMN IF NOT EXISTS resolution_hours INT,
  ADD COLUMN IF NOT EXISTS escalate_hours INT;

-- 5. Enhance Knowledge Documents and FAQs with Demo Codes
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS document_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS content TEXT;

CREATE INDEX IF NOT EXISTS idx_kdoc_code ON public.knowledge_documents(document_code);

ALTER TABLE public.faqs
  ADD COLUMN IF NOT EXISTS faq_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS source_document TEXT;

CREATE INDEX IF NOT EXISTS idx_faqs_code ON public.faqs(faq_code);

-- 6. Enhance Tickets with Demo Identifier
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS demo_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_tickets_demo_id ON public.tickets(demo_id);

-- 7. Row Level Security Policies

ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- AI Interactions:
-- A. Authenticated users can view their own interactions
CREATE POLICY "ai_interactions_select_own"
  ON public.ai_interactions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_staff()
  );

-- B. Authenticated users can insert interactions
CREATE POLICY "ai_interactions_insert"
  ON public.ai_interactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IS NULL
    OR public.is_staff()
  );

-- C. Super Admin has full management access
CREATE POLICY "ai_interactions_admin_all"
  ON public.ai_interactions
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Audit Events:
-- A. Staff and Super Admins can view audit logs
CREATE POLICY "audit_events_select_staff_admin"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- B. Super Admin or service role can insert audit events
CREATE POLICY "audit_events_insert_admin"
  ON public.audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

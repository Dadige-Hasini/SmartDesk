-- ====================================================================
-- SmartDesk Migration: Phase 5 Staff & Super Admin Enhancements
-- Version: 20261020000004
-- Description: Announcements, Admin Audit Logs, SLA Policy Enhancements,
--              Overdue Ticket Tracking, and Document Approval Permissions.
-- ====================================================================

-- 1. Extend profiles with knowledge document approval permissions
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS can_approve_documents BOOLEAN NOT NULL DEFAULT false;

-- 2. Extend tickets with overdue SLA tracking
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_overdue ON public.tickets(status, is_overdue, sla_due_at);

-- 3. Extend SLA Policies with optional category-specific targets
ALTER TABLE public.sla_policies
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE;

-- Drop previous unique priority constraint if it exists to allow category+priority pairs
ALTER TABLE public.sla_policies
DROP CONSTRAINT IF EXISTS sla_policies_priority_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sla_priority_category 
ON public.sla_policies (priority, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- 4. Create Announcements Table
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

-- 5. Create Admin Audit Logs Table (System-wide administrative actions)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('STAFF', 'DEPARTMENT', 'CATEGORY', 'ROUTING_RULE', 'SLA_POLICY', 'ANNOUNCEMENT', 'TICKET')),
  target_id TEXT NOT NULL,
  reason TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON public.admin_audit_logs(target_type, target_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Announcements: Viewable by target audience or super admin; Mutated by Super Admin only
CREATE POLICY "announcements_read_active" ON public.announcements
FOR SELECT TO authenticated
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

CREATE POLICY "announcements_admin_all" ON public.announcements
FOR ALL TO authenticated
USING (public.is_super_admin());

-- Admin Audit Logs: Super Admin only
CREATE POLICY "admin_audit_read" ON public.admin_audit_logs
FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE POLICY "admin_audit_insert" ON public.admin_audit_logs
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

-- 7. Seed Default SLA Policies if table is empty
INSERT INTO public.sla_policies (name, priority, response_time_hours, resolution_time_hours, is_active)
VALUES
  ('Urgent Priority SLA', 'Urgent', 2, 8, true),
  ('High Priority SLA', 'High', 4, 24, true),
  ('Medium Priority SLA', 'Medium', 8, 48, true),
  ('Low Priority SLA', 'Low', 24, 96, true)
ON CONFLICT DO NOTHING;

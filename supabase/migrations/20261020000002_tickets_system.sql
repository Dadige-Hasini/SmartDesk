-- ====================================================================
-- SmartDesk Migration: Tickets, Categories, Routing Rules, Events, SLAs, Ratings
-- Version: 20261020000002
-- Description: Core ticketing schema, sequence-based human-readable IDs,
--              SLA calculations, audit logs, and departmental RLS.
-- ====================================================================

-- 1. Create Categories Table
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
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(is_active);

-- 2. Create Category Routing Rules Table
CREATE TABLE IF NOT EXISTS public.category_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  default_department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  default_priority TEXT NOT NULL DEFAULT 'Medium' CHECK (default_priority IN ('Low', 'Medium', 'High', 'Urgent')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_category_routing UNIQUE (category_id, default_department_id)
);

CREATE INDEX IF NOT EXISTS idx_routing_category ON public.category_routing_rules(category_id);

-- 3. Create SLA Policies Table
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  priority TEXT NOT NULL UNIQUE CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  response_time_hours INTEGER NOT NULL CHECK (response_time_hours > 0),
  resolution_time_hours INTEGER NOT NULL CHECK (resolution_time_hours > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Safe Sequence for Unique Human-Readable Ticket Numbers (TKT-YYYYMMDD-0001)
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

-- 5. Create Tickets Table
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE DEFAULT public.generate_ticket_number(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 5),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_INFO', 'RESOLVED', 'CLOSED', 'REJECTED')),
  
  -- Separation of student's academic department and assigned resolving department
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  
  -- Lifecycle metadata
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

-- Indexes for performant filtering and searching
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_dept ON public.tickets(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON public.tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON public.tickets(ticket_number);

-- 6. Create Ticket Events Table (Append-only audit & history log)
CREATE TABLE IF NOT EXISTS public.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'REASSIGNED', 
    'PRIORITY_CHANGED', 'REOPENED', 'RESOLVED', 'REJECTED', 
    'CLOSED', 'TAGS_UPDATED', 'RATED'
  )),
  old_value JSONB,
  new_value JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON public.ticket_events(ticket_id, created_at ASC);

-- 7. Create Ratings Table (1 to 5 stars with optional feedback)
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ratings_ticket ON public.ratings(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ratings_student ON public.ratings(student_id);

-- 8. Auto SLA Calculation Trigger
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
      -- Default to 48 hours if no explicit policy
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

-- 9. Row Level Security (RLS) Configuration

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- Categories & SLA policies: read by all authenticated, modified by Super Admin only
CREATE POLICY "categories_read_all" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_admin_all" ON public.categories FOR ALL TO authenticated USING (public.is_super_admin());

CREATE POLICY "routing_rules_read_all" ON public.category_routing_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "routing_rules_admin_all" ON public.category_routing_rules FOR ALL TO authenticated USING (public.is_super_admin());

CREATE POLICY "sla_read_all" ON public.sla_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "sla_admin_all" ON public.sla_policies FOR ALL TO authenticated USING (public.is_super_admin());

-- Helper function to check if caller is assigned department staff
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
  );
$$;

-- Tickets Policies
-- A. SELECT: Students see own tickets; Staff see department tickets; Admin sees all
CREATE POLICY "tickets_select_policy"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (public.can_access_ticket(assigned_department_id, created_by, is_confidential));

-- B. INSERT: Students can create tickets (or staff creating on behalf)
CREATE POLICY "tickets_insert_policy"
  ON public.tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() 
    OR public.is_staff()
  );

-- C. UPDATE: Staff in assigned department or Super Admin can update status/assignment
CREATE POLICY "tickets_update_policy"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.is_staff()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND department_id = assigned_department_id AND status = 'ACTIVE'
      )
    )
    OR (
      -- Student can only update their own ticket to reopen
      created_by = auth.uid()
    )
  );

-- Ticket Events Policies
CREATE POLICY "ticket_events_select_policy"
  ON public.ticket_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND public.can_access_ticket(t.assigned_department_id, t.created_by, t.is_confidential)
    )
  );

CREATE POLICY "ticket_events_insert_policy"
  ON public.ticket_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid() 
    OR actor_id IS NULL
  );

-- Ratings Policies
CREATE POLICY "ratings_select_policy"
  ON public.ratings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND public.can_access_ticket(t.assigned_department_id, t.created_by, t.is_confidential)
    )
  );

CREATE POLICY "ratings_insert_student"
  ON public.ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- 10. Seed Core Categories
INSERT INTO public.categories (name, code, description)
VALUES
  ('Fee & Payments', 'FEE', 'Tuition, hostel fees, payment receipts, fines, and scholarship credits'),
  ('ID Card Services', 'IDCARD', 'New student ID card issuance, lost card replacement, RFID activation'),
  ('Timetable & Schedules', 'TIMETABLE', 'Class schedules, lab timings, room allocations, elective conflicts'),
  ('Library Resources', 'LIBRARY', 'Book borrowing, overdue books, digital library access, research journals'),
  ('Hostel & Mess', 'HOSTEL', 'Room allocation, maintenance, hostel leave permissions, mess quality'),
  ('Student Grievances', 'GRIEVANCE', 'Ragging reports, harassment complaints, disputes, confidential inquiries'),
  ('Academic Queries', 'ACADEMIC', 'Attendance shortage, syllabus queries, elective choices, faculty meetings'),
  ('Transport & Bus', 'TRANSPORT', 'College bus passes, route schedules, bus stops, driver concerns'),
  ('Examinations & Grades', 'EXAM', 'Hall tickets, exam revaluation, marksheets, grade corrections, backlogs'),
  ('General / Other', 'OTHER', 'General administrative assistance, lost and found, campus facilities')
ON CONFLICT (code) DO NOTHING;

-- 11. Seed SLA Policies
INSERT INTO public.sla_policies (name, priority, response_time_hours, resolution_time_hours)
VALUES
  ('Urgent Priority SLA', 'Urgent', 2, 12),
  ('High Priority SLA', 'High', 4, 24),
  ('Medium Priority SLA', 'Medium', 8, 48),
  ('Low Priority SLA', 'Low', 24, 96)
ON CONFLICT (priority) DO UPDATE SET
  response_time_hours = EXCLUDED.response_time_hours,
  resolution_time_hours = EXCLUDED.resolution_time_hours;

-- 12. Seed Category Routing Rules (Category -> Responsible Department)
INSERT INTO public.category_routing_rules (category_id, default_department_id, default_priority)
SELECT c.id, d.id, 'Medium'
FROM public.categories c, public.departments d
WHERE 
  (c.code = 'FEE' AND d.code = 'FIN') OR
  (c.code = 'IDCARD' AND d.code = 'REGISTRAR') OR
  (c.code = 'TIMETABLE' AND d.code = 'ACAD') OR
  (c.code = 'LIBRARY' AND d.code = 'LIB') OR
  (c.code = 'HOSTEL' AND d.code = 'HOSTEL') OR
  (c.code = 'GRIEVANCE' AND d.code = 'AFFAIRS') OR
  (c.code = 'ACADEMIC' AND d.code = 'REGISTRAR') OR
  (c.code = 'TRANSPORT' AND d.code = 'TRANS') OR
  (c.code = 'EXAM' AND d.code = 'EXAM') OR
  (c.code = 'OTHER' AND d.code = 'AFFAIRS')
ON CONFLICT (category_id, default_department_id) DO NOTHING;

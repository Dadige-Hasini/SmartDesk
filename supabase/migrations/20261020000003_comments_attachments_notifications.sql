-- ====================================================================
-- SmartDesk Migration: Comments, Attachments, Notifications, Preferences & Email Outbox
-- Version: 20261020000003
-- Description: Public comments & internal staff notes, private storage metadata,
--              in-app notifications, user preferences, and async email job outbox.
-- ====================================================================

-- 1. Create Ticket Comments Table
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for comment lookups
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_author ON public.ticket_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_internal ON public.ticket_comments(ticket_id, is_internal);

-- 2. Create Attachments Table
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880), -- 5 MB limit
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  extension TEXT NOT NULL CHECK (extension IN ('jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx')),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON public.attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_comment_id ON public.attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON public.attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_attachments_is_internal ON public.attachments(ticket_id, is_internal);

-- 3. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'TICKET_CREATED', 'STATUS_CHANGED', 'ASSIGNED',
    'NEW_COMMENT', 'RESOLVED', 'REOPENED'
  )),
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_ticket ON public.notifications(ticket_id);

-- 4. Create Notification Preferences Table
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

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON public.notification_preferences(user_id);

-- 5. Create Email Jobs Table (Reliable Asynchronous Outbox)
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
CREATE INDEX IF NOT EXISTS idx_email_jobs_dedup ON public.email_jobs(dedup_key);
CREATE INDEX IF NOT EXISTS idx_email_jobs_ticket ON public.email_jobs(ticket_id);

-- 6. Initialize Private Storage Bucket for Attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

-- 7. Row Level Security Policies

-- Enable RLS
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;

-- 7a. Comments RLS: Students only see public comments; Staff see both public and internal notes
CREATE POLICY "Students can view public comments on their own tickets"
  ON public.ticket_comments FOR SELECT
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
      AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Staff can view all comments for their department tickets"
  ON public.ticket_comments FOR SELECT
  USING (
    public.get_current_user_role() IN ('STAFF', 'SUPER_ADMIN')
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
      AND (
        public.get_current_user_role() = 'SUPER_ADMIN'
        OR (t.assigned_department_id = public.get_current_user_department_id() AND t.is_confidential = false)
        OR (
          t.assigned_department_id = public.get_current_user_department_id() 
          AND t.is_confidential = true 
          AND EXISTS (SELECT 1 FROM public.departments d WHERE d.id = t.assigned_department_id AND d.code IN ('STU', 'AFFAIRS'))
        )
        OR t.assigned_to = auth.uid()
      )
    )
  );

CREATE POLICY "Students can create public comments on their open tickets"
  ON public.ticket_comments FOR INSERT
  WITH CHECK (
    is_internal = false
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
      AND t.created_by = auth.uid()
      AND t.status NOT IN ('CLOSED', 'REJECTED')
    )
  );

CREATE POLICY "Staff and Super Admin can create public or internal comments"
  ON public.ticket_comments FOR INSERT
  WITH CHECK (
    public.get_current_user_role() IN ('STAFF', 'SUPER_ADMIN')
    AND author_id = auth.uid()
  );

-- 7b. Attachments RLS: Enforce ticket permission & internal note isolation
CREATE POLICY "Students can view non-internal attachments for their tickets"
  ON public.attachments FOR SELECT
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = attachments.ticket_id
      AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Staff can view attachments for their department tickets"
  ON public.attachments FOR SELECT
  USING (
    public.get_current_user_role() IN ('STAFF', 'SUPER_ADMIN')
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = attachments.ticket_id
      AND (
        public.get_current_user_role() = 'SUPER_ADMIN'
        OR (t.assigned_department_id = public.get_current_user_department_id() AND t.is_confidential = false)
        OR (
          t.assigned_department_id = public.get_current_user_department_id() 
          AND t.is_confidential = true 
          AND EXISTS (SELECT 1 FROM public.departments d WHERE d.id = t.assigned_department_id AND d.code IN ('STU', 'AFFAIRS'))
        )
        OR t.assigned_to = auth.uid()
      )
    )
  );

-- 7c. Notifications RLS: Users can only see and update their own notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- 7d. Notification Preferences RLS: Users manage their own preferences
CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 7e. Email Jobs RLS: Service role only (direct user access blocked)
CREATE POLICY "Service role can manage email outbox jobs"
  ON public.email_jobs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 8. Enable Realtime Publications (Safely handle already existing)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_comments;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

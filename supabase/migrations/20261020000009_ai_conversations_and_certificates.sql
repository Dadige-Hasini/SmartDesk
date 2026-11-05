-- ====================================================================
-- SmartDesk Migration: AI Conversations, Messages & Certificate Workflow
-- Version: 20261020000009
-- Description: Multi-turn conversational persistence tables (ai_conversations,
--              ai_messages), RLS policies, and certificate status expansion.
-- ====================================================================

-- 1. Expand Tickets Status Check to support Certificate & Student Service Workflow
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_status_check'
  ) THEN
    ALTER TABLE public.tickets DROP CONSTRAINT tickets_status_check;
  END IF;
  
  ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check 
    CHECK (status IN (
      'OPEN', 
      'UNDER_REVIEW', 
      'DOCUMENT_VERIFICATION', 
      'IN_PROGRESS', 
      'AWAITING_INFO', 
      'READY_FOR_COLLECTION', 
      'ISSUED', 
      'RESOLVED', 
      'CLOSED', 
      'REJECTED'
    ));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not alter tickets_status_check: %', SQLERRM;
END $$;

-- 2. Create AI Conversations Table
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_student ON public.ai_conversations(student_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_archived ON public.ai_conversations(is_archived);

-- 3. Create AI Messages Table
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  workflow_mode TEXT,
  workflow_label TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for AI Conversations
DROP POLICY IF EXISTS "Students can view own conversations" ON public.ai_conversations;
CREATE POLICY "Students can view own conversations"
  ON public.ai_conversations FOR SELECT
  USING (
    student_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'STAFF'))
  );

DROP POLICY IF EXISTS "Students can insert own conversations" ON public.ai_conversations;
CREATE POLICY "Students can insert own conversations"
  ON public.ai_conversations FOR INSERT
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can update own conversations" ON public.ai_conversations;
CREATE POLICY "Students can update own conversations"
  ON public.ai_conversations FOR UPDATE
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can delete own conversations" ON public.ai_conversations;
CREATE POLICY "Students can delete own conversations"
  ON public.ai_conversations FOR DELETE
  USING (student_id = auth.uid());

-- 6. RLS Policies for AI Messages
DROP POLICY IF EXISTS "Users can view messages in accessible conversations" ON public.ai_messages;
CREATE POLICY "Users can view messages in accessible conversations"
  ON public.ai_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
      AND (
        c.student_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'STAFF'))
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert messages into own conversations" ON public.ai_messages;
CREATE POLICY "Users can insert messages into own conversations"
  ON public.ai_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
      AND c.student_id = auth.uid()
    )
  );


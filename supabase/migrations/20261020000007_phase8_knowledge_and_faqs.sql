-- ====================================================================
-- SmartDesk Migration: Phase 8 Knowledge Base & FAQ Management
-- Version: 20261020000007
-- Description: FAQ lifecycle (DRAFT, APPROVED, PUBLISHED, RETIRED),
--              helpful/unhelpful voting with abuse prevention,
--              knowledge document versioning, retirement, and RLS.
-- ====================================================================

-- 1. Extend FAQs Table with Lifecycle & Governance Columns
ALTER TABLE public.faqs
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED'
    CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'RETIRED')),
  ADD COLUMN IF NOT EXISTS unhelpful_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(30) NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC', 'INTERNAL_DEPARTMENT', 'STAFF_ONLY'));

CREATE INDEX IF NOT EXISTS idx_faqs_status ON public.faqs(status);
CREATE INDEX IF NOT EXISTS idx_faqs_visibility ON public.faqs(visibility);
CREATE INDEX IF NOT EXISTS idx_faqs_source_ticket ON public.faqs(source_ticket_id);

-- 2. FAQ Helpful/Unhelpful Voting with Abuse Prevention
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_faq_vote_user 
  ON public.faq_votes(faq_id, user_id) 
  WHERE user_id IS NOT NULL;

-- 3. Extend Knowledge Documents Table with Retirement & Department Visibility
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RETIRED', 'ARCHIVED')),
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(30) NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC', 'INTERNAL_DEPARTMENT', 'STAFF_ONLY')),
  ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_kdoc_status ON public.knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_kdoc_visibility ON public.knowledge_documents(visibility);

-- 4. Update Match FAQs Stored Procedure to strictly exclude retired FAQs
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

-- 5. Update Match Document Chunks RPC to exclude retired documents
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

-- 6. Row Level Security Policies for FAQs and Knowledge Documents
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_votes ENABLE ROW LEVEL SECURITY;

-- Anonymous and students can read published, public FAQs
CREATE POLICY faqs_public_read ON public.faqs
  FOR SELECT
  USING (
    (status = 'PUBLISHED' AND visibility = 'PUBLIC')
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('STAFF', 'SUPER_ADMIN')
          AND (p.role = 'SUPER_ADMIN' OR faqs.department_id IS NULL OR p.department_id = faqs.department_id)
      )
    )
  );

-- Staff can insert drafts
CREATE POLICY faqs_staff_insert ON public.faqs
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('STAFF', 'SUPER_ADMIN')
        -- Ordinary staff can ONLY insert DRAFT status
        AND (p.role = 'SUPER_ADMIN' OR status = 'DRAFT')
    )
  );

-- Only Super Admins or document approvers can update status to PUBLISHED or APPROVED
CREATE POLICY faqs_admin_update ON public.faqs
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'SUPER_ADMIN' OR (p.role = 'STAFF' AND p.can_approve_documents = true))
    )
  );

-- FAQ Votes RLS: anyone can insert a vote
CREATE POLICY faq_votes_insert ON public.faq_votes
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY faq_votes_read ON public.faq_votes
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('STAFF', 'SUPER_ADMIN')
    )
  );

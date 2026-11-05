-- ====================================================================
-- SmartDesk Migration: Phase 6 RAG & Production-Oriented AI Assistant
-- Version: 20261020000005
-- Description: Knowledge documents, pgvector document chunks, similarity search,
--              and AI feedback tracking.
-- ====================================================================

-- 1. Enable pgvector extension if available in Supabase PostgreSQL
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Knowledge Documents Table
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  description TEXT,
  file_path TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('PDF', 'DOCX', 'TXT', 'MD')),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_kdoc_approved_active ON public.knowledge_documents(is_approved, is_active);
CREATE INDEX IF NOT EXISTS idx_kdoc_department ON public.knowledge_documents(department_id);
CREATE INDEX IF NOT EXISTS idx_kdoc_category ON public.knowledge_documents(category_id);

-- 3. Document Chunks Table with Vector Embeddings (768-dimensional)
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

-- HNSW Vector Index for Fast Cosine Similarity Retrieval
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_document_chunks_vector ON public.document_chunks USING hnsw (embedding vector_cosine_ops)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fallback gracefully if HNSW index options differ in specific environment
  NULL;
END $$;

-- 4. Match Document Chunks RPC Function
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.45,
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
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    kd.title AS document_title,
    dc.section,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  JOIN public.knowledge_documents kd ON dc.document_id = kd.id
  WHERE kd.is_approved = true
    AND kd.is_active = true
    AND (filter_department_id IS NULL OR kd.department_id = filter_department_id)
    AND (filter_category_id IS NULL OR kd.category_id = filter_category_id)
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. AI Feedback Table (Quality and Deflection Metrics)
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

-- 6. Row Level Security Policies
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

-- Knowledge Documents: Public/Students can read approved documents; Staff/Admins can read/write
CREATE POLICY "Anyone can view approved and active knowledge documents"
  ON public.knowledge_documents FOR SELECT
  USING (is_approved = true AND is_active = true);

CREATE POLICY "Staff and Admins can view all knowledge documents"
  ON public.knowledge_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('STAFF', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Super Admins and Approved Document Staff can manage documents"
  ON public.knowledge_documents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'SUPER_ADMIN' OR p.can_approve_documents = true)
    )
  );

-- Document Chunks: Read allowed if parent document is approved/active
CREATE POLICY "View approved document chunks"
  ON public.document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents kd
      WHERE kd.id = document_chunks.document_id
        AND kd.is_approved = true
        AND kd.is_active = true
    )
  );

CREATE POLICY "Manage document chunks"
  ON public.document_chunks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'SUPER_ADMIN' OR p.can_approve_documents = true)
    )
  );

-- AI Feedback: Authenticated users can insert their own feedback
CREATE POLICY "Users can create ai feedback"
  ON public.ai_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can view ai feedback"
  ON public.ai_feedback FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'SUPER_ADMIN'
    )
  );

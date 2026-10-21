-- ====================================================================
-- SmartDesk Migration: Phase 7 Deep Learning, Semantic Search & Evaluation
-- Version: 20261020000006
-- Description: FAQs with pgvector embeddings, deflection event tracking,
--              canonical 10 category seeds, and ML evaluation runs history.
-- ====================================================================

-- 1. Seed or Ensure 10 Canonical University Support Categories
INSERT INTO public.categories (id, name, code, description, is_active)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Academic Records & Transcripts', 'ACADEMIC_RECORDS', 'Transcripts, degree certificates, grade cards, credit transfer, course registration', true),
  ('c1000000-0000-0000-0000-000000000002', 'Tuition Fees & Payments', 'TUITION_FEES', 'Semester fees, payment gateways, fee receipts, installment requests, duplicate charges', true),
  ('c1000000-0000-0000-0000-000000000003', 'Scholarships & Financial Aid', 'SCHOLARSHIPS', 'Merit scholarships, need-based aid, government grant verification, fee waivers', true),
  ('c1000000-0000-0000-0000-000000000004', 'Examinations & Hall Tickets', 'EXAM_CELL', 'Exam schedule, hall ticket download, revaluation, backlog registration, exam clashes', true),
  ('c1000000-0000-0000-0000-000000000005', 'Hostel & Accommodation', 'HOSTEL_HOUSING', 'Room allotment, mess food, hostel curfew, maintenance repairs, room change', true),
  ('c1000000-0000-0000-0000-000000000006', 'IT Services & WiFi Access', 'CAMPUS_IT', 'Student portal login, WiFi credentials, ERP bugs, email reset, lab computers', true),
  ('c1000000-0000-0000-0000-000000000007', 'Library & Digital Resources', 'LIBRARY_SERVICES', 'Book renewals, overdue fines, digital journal access, lost book reporting', true),
  ('c1000000-0000-0000-0000-000000000008', 'Campus Transport & Bus Passes', 'TRANSPORTATION', 'Route schedules, bus pass issuance, parking permits, college shuttle', true),
  ('c1000000-0000-0000-0000-000000000009', 'Placement & Career Services', 'CAREER_PLACEMENT', 'Internship NOC, campus placement drives, resume verification, company visits', true),
  ('c1000000-0000-0000-0000-000000000010', 'Student Affairs & Disciplinary', 'STUDENT_AFFAIRS', 'ID card replacement, club activities, anti-ragging cell, grievances, bonafide letters', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = timezone('utc'::text, now());

-- 2. FAQs Table with pgvector Embeddings
CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL CHECK (char_length(trim(question)) >= 5),
  answer TEXT NOT NULL CHECK (char_length(trim(answer)) >= 10),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  keywords TEXT[] DEFAULT '{}',
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_faqs_category ON public.faqs(category_id);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON public.faqs(is_published);

-- HNSW Vector Index for Fast Cosine Similarity on FAQs
CREATE INDEX IF NOT EXISTS idx_faqs_embedding_hnsw 
ON public.faqs USING hnsw (embedding vector_cosine_ops);

-- 3. Stored Procedure for Semantic FAQ Matching
CREATE OR REPLACE FUNCTION public.match_faqs(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.50,
  match_count int DEFAULT 5,
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  category_id UUID,
  department_id UUID,
  view_count INT,
  helpful_count INT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.question,
    f.answer,
    f.category_id,
    f.department_id,
    f.view_count,
    f.helpful_count,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM public.faqs f
  WHERE f.is_published = true
    AND f.embedding IS NOT NULL
    AND (p_category_id IS NULL OR f.category_id = p_category_id)
    AND (1 - (f.embedding <=> query_embedding)) >= match_threshold
  ORDER JOIN f.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 4. Ticket Deflection Events Table
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

CREATE INDEX IF NOT EXISTS idx_deflection_created ON public.ai_deflection_events(created_at);
CREATE INDEX IF NOT EXISTS idx_deflection_ticket_created ON public.ai_deflection_events(was_ticket_created);

-- 5. ML Model Evaluation Runs Table
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

CREATE INDEX IF NOT EXISTS idx_model_eval_date ON public.ai_model_evaluations(evaluation_date DESC);

-- Enable RLS
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_deflection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_evaluations ENABLE ROW LEVEL SECURITY;

-- FAQs RLS: Published FAQs are readable by all authenticated users
CREATE POLICY faqs_read_policy ON public.faqs
  FOR SELECT TO authenticated
  USING (is_published = true);

-- Staff & Admins can manage FAQs
CREATE POLICY faqs_manage_policy ON public.faqs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('STAFF', 'SUPER_ADMIN')
    )
  );

-- Deflection Events RLS: Insertable by authenticated users; readable by staff/admin
CREATE POLICY deflection_insert_policy ON public.ai_deflection_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY deflection_read_policy ON public.ai_deflection_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('STAFF', 'SUPER_ADMIN')
    )
  );

-- Model Evaluations RLS: Readable by Staff and Admins
CREATE POLICY model_eval_read_policy ON public.ai_model_evaluations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('STAFF', 'SUPER_ADMIN')
    )
  );

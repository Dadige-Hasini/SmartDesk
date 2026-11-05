-- ====================================================================
-- SmartDesk Storage Buckets & Policies Setup
-- Version: 20261030_STORAGE_SETUP
-- Description: Creates private buckets for ticket attachments and
--              knowledge base documents with file-size and mime-type limits,
--              plus authenticated RLS access policies on storage.objects.
-- ====================================================================

-- 1. Create Private Storage Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'ticket-attachments',
    'ticket-attachments',
    false, -- Private bucket: access controlled via signed URLs and RLS
    5242880, -- 5 MB limit
    ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  ),
  (
    'knowledge-documents',
    'knowledge-documents',
    false, -- Private bucket
    52428800, -- 50 MB limit
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Objects Access Policies (Idempotent via DROP POLICY IF EXISTS)

-- Ticket Attachments (Upload): Authenticated users
DROP POLICY IF EXISTS "attachments_storage_upload" ON storage.objects;
CREATE POLICY "attachments_storage_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments');

-- Ticket Attachments (Download/View): Authenticated users
DROP POLICY IF EXISTS "attachments_storage_select" ON storage.objects;
CREATE POLICY "attachments_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ticket-attachments');

-- Knowledge Documents (Download/View): Authenticated users
DROP POLICY IF EXISTS "knowledge_storage_select" ON storage.objects;
CREATE POLICY "knowledge_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'knowledge-documents');

-- Knowledge Documents (Upload): Super Admin or authorized document approver staff
DROP POLICY IF EXISTS "knowledge_storage_upload" ON storage.objects;
CREATE POLICY "knowledge_storage_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-documents'
  AND (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND can_approve_documents = true)
  )
);


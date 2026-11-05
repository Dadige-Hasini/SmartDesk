-- ====================================================================
-- SmartDesk Post-Migration Comprehensive Verification Suite
-- Run this in the Supabase SQL Editor after applying migrations
-- ====================================================================

-- 1. Verify Installed PostgreSQL Extensions
SELECT 
  extname AS extension_name, 
  extversion AS version,
  'ACTIVE' AS status
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'vector')
ORDER BY extname;

-- 2. Verify All 24 Tables Exist in Public Schema with RLS Enabled
SELECT 
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'RLS ENABLED (SECURE)' ELSE 'RLS DISABLED (WARNING)' END AS rls_status,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
  AND c.relname IN (
    'departments', 'profiles', 'categories', 'category_routing_rules',
    'sla_policies', 'tickets', 'ticket_events', 'ratings',
    'ticket_comments', 'attachments', 'notifications', 'notification_preferences',
    'email_jobs', 'announcements', 'admin_audit_logs', 'knowledge_documents',
    'document_chunks', 'faqs', 'faq_votes', 'ai_interactions',
    'ai_feedback', 'ai_deflection_events', 'ai_model_evaluations', 'audit_events'
  )
ORDER BY c.relname;

-- Count summary: Must equal 24
SELECT 
  count(*) AS total_tables_created,
  CASE WHEN count(*) = 24 THEN 'PASS: All 24 tables present' ELSE 'FAIL: Table count mismatch' END AS result
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

-- 3. Verify Active Triggers
SELECT 
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema IN ('public', 'auth')
  AND trigger_name IN ('on_auth_user_created', 'trg_protect_profile_privileges', 'trg_calculate_ticket_sla')
ORDER BY event_object_table;

-- 4. Verify RPC Functions (Vector Similarity Retrieval)
SELECT 
  routine_name, 
  routine_type,
  security_type,
  data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('match_document_chunks', 'match_faqs', 'can_access_ticket', 'is_super_admin', 'is_staff', 'generate_ticket_number')
ORDER BY routine_name;

-- 5. Verify User Profile Backfill vs Auth Users
SELECT 
  (SELECT count(*) FROM auth.users) AS auth_users_count,
  (SELECT count(*) FROM public.profiles) AS profiles_count,
  CASE 
    WHEN (SELECT count(*) FROM auth.users) = (SELECT count(*) FROM public.profiles) 
    THEN 'PASS: All auth users have synchronized profiles'
    ELSE 'WARNING: Profile count does not match auth user count'
  END AS synchronization_status;

-- 6. Verify User Roles & Statuses in Public Profiles
SELECT 
  id, 
  email, 
  full_name, 
  role, 
  status, 
  department_id, 
  roll_number, 
  employee_id
FROM public.profiles
ORDER BY created_at DESC;

-- 7. Verify Private Storage Buckets
SELECT 
  id AS bucket_name,
  public AS is_public,
  file_size_limit / 1048576 AS max_mb,
  allowed_mime_types
FROM storage.buckets
WHERE id IN ('ticket-attachments', 'knowledge-documents')
ORDER BY id;

-- 8. Verify Seed Data Counts
SELECT 
  (SELECT count(*) FROM public.departments) AS departments_count,
  (SELECT count(*) FROM public.categories) AS categories_count,
  (SELECT count(*) FROM public.category_routing_rules) AS routing_rules_count,
  (SELECT count(*) FROM public.sla_policies) AS sla_policies_count,
  (SELECT count(*) FROM public.faqs) AS faqs_count;


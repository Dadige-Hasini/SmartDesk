-- ====================================================================
-- SmartDesk Safe Profile Backfill (Auth.Users -> Public.Profiles)
-- Version: 20261030_SAFE_BACKFILL_V2
-- Description: Synchronizes existing registered accounts in auth.users
--              into public.profiles safely:
--              - Resolves duplicate roll numbers/employee IDs between accounts.
--              - Never permits self-assignment of SUPER_ADMIN from metadata.
--              - Sets STAFF to PENDING_APPROVAL unless verified.
--              - Completely non-destructive: ON CONFLICT (id) DO NOTHING.
-- ====================================================================

WITH deduplicated_users AS (
  SELECT 
    u.id,
    u.email,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      split_part(u.email, '@', 1)
    ) AS full_name,
    
    -- Zero-Trust Role Safeguard:
    -- Never trust SUPER_ADMIN from user-editable signup metadata
    CASE 
      WHEN u.raw_user_meta_data->>'role' = 'STAFF' THEN 'STAFF'
      ELSE 'STUDENT'
    END AS role,
    
    -- Account Approval State:
    -- Staff accounts must be approved by an administrator before activating
    CASE 
      WHEN u.raw_user_meta_data->>'role' = 'STAFF' THEN 'PENDING_APPROVAL'
      ELSE 'ACTIVE'
    END AS status,
    
    (u.raw_user_meta_data->>'department_id')::UUID AS department_id,
    
    -- Deduplication Guard for roll_number:
    -- If multiple accounts registered with the same roll number,
    -- assign the roll number to the institutional email first, and NULL to duplicates.
    CASE 
      WHEN u.raw_user_meta_data->>'roll_number' IS NOT NULL 
           AND ROW_NUMBER() OVER (
             PARTITION BY u.raw_user_meta_data->>'roll_number' 
             ORDER BY 
               CASE WHEN u.email LIKE '%@mallareddyuniversity.ac.in' THEN 0 ELSE 1 END,
               u.created_at ASC
           ) = 1 
      THEN u.raw_user_meta_data->>'roll_number'
      ELSE NULL
    END AS roll_number,
    
    -- Deduplication Guard for employee_id:
    CASE 
      WHEN u.raw_user_meta_data->>'employee_id' IS NOT NULL 
           AND ROW_NUMBER() OVER (
             PARTITION BY u.raw_user_meta_data->>'employee_id' 
             ORDER BY u.created_at ASC
           ) = 1 
      THEN u.raw_user_meta_data->>'employee_id'
      ELSE NULL
    END AS employee_id,
    
    u.raw_user_meta_data->>'phone_number' AS phone_number,
    COALESCE(u.created_at, timezone('utc'::text, now())) AS created_at
  FROM auth.users u
)
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  status,
  department_id,
  roll_number,
  employee_id,
  phone_number,
  can_approve_documents,
  created_at,
  updated_at
)
SELECT 
  id,
  email,
  full_name,
  role,
  status,
  department_id,
  roll_number,
  employee_id,
  phone_number,
  false,
  created_at,
  timezone('utc'::text, now())
FROM deduplicated_users
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- OPTIONAL: Designate Initial Super Administrator Account
-- If you want to elevate one of your accounts to SUPER_ADMIN,
-- uncomment the block below and replace with your exact login email:
-- ====================================================================
-- UPDATE public.profiles
-- SET role = 'SUPER_ADMIN', status = 'ACTIVE'
-- WHERE email = 'YOUR_EMAIL@gmail.com';

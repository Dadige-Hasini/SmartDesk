-- ====================================================================
-- SmartDesk Migration: Departments and Profiles Schema
-- Version: 20261020000001
-- Description: Creates departments, profiles, role constraints,
--              account approval states, auth triggers, and RLS policies.
-- ====================================================================

-- 1. Ensure required extensions are active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Departments Table
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for department lookups
CREATE INDEX IF NOT EXISTS idx_departments_code ON public.departments(code);
CREATE INDEX IF NOT EXISTS idx_departments_active ON public.departments(is_active);

-- 3. Create Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'STAFF', 'SUPER_ADMIN')),
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  
  -- Student-specific fields
  roll_number TEXT UNIQUE,
  year_of_study INTEGER CHECK (year_of_study BETWEEN 1 AND 5),
  
  -- Staff-specific fields
  employee_id TEXT UNIQUE,
  designation TEXT,
  
  -- Common contact & profile fields
  phone_number TEXT,
  avatar_url TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes on Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_roll_number ON public.profiles(roll_number) WHERE roll_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id) WHERE employee_id IS NOT NULL;

-- 4. Secure Helper Functions (SECURITY DEFINER to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_status()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN' AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('STAFF', 'SUPER_ADMIN') AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_department_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 5. Automatic Profile Creation on auth.users Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
  v_full_name TEXT;
  v_department_id UUID;
  v_roll_number TEXT;
  v_year_of_study INTEGER;
  v_employee_id TEXT;
  v_designation TEXT;
  v_phone TEXT;
BEGIN
  -- Extract role from metadata, defaulting to STUDENT
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'STUDENT');

  -- SECURITY SAFEGUARD: Never permit self-assignment of SUPER_ADMIN via public registration!
  IF v_role = 'SUPER_ADMIN' THEN
    v_role := 'STUDENT';
  END IF;

  -- Validate role is legal
  IF v_role NOT IN ('STUDENT', 'STAFF') THEN
    v_role := 'STUDENT';
  END IF;

  -- Set initial account approval state
  -- Staff MUST be approved by a Super Admin; Students start ACTIVE
  IF v_role = 'STAFF' THEN
    v_status := 'PENDING_APPROVAL';
  ELSE
    v_status := 'ACTIVE';
  END IF;

  -- Extract user profile fields
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_department_id := (NEW.raw_user_meta_data->>'department_id')::UUID;
  v_roll_number := NEW.raw_user_meta_data->>'roll_number';
  v_year_of_study := (NEW.raw_user_meta_data->>'year_of_study')::INTEGER;
  v_employee_id := NEW.raw_user_meta_data->>'employee_id';
  v_designation := NEW.raw_user_meta_data->>'designation';
  v_phone := NEW.raw_user_meta_data->>'phone_number';

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    status,
    department_id,
    roll_number,
    year_of_study,
    employee_id,
    designation,
    phone_number
  ) VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_role,
    v_status,
    v_department_id,
    v_roll_number,
    v_year_of_study,
    v_employee_id,
    v_designation,
    v_phone
  );

  RETURN NEW;
END;
$$;

-- Trigger firing after new user creation in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Trigger to prevent unprivileged role or status tampering on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If not running as super admin (or service role / trigger), block role or status changes
  IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT public.is_super_admin() AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Unauthorized: Only Super Administrators can alter user roles or approval statuses.';
    END IF;
  END IF;
  
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- 7. Row Level Security (RLS) Configuration

-- Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Departments RLS Policies:
-- A. All authenticated users can read active departments
CREATE POLICY "departments_select_active"
  ON public.departments
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_super_admin());

-- B. Only Super Admin can insert, update, or delete departments
CREATE POLICY "departments_admin_insert"
  ON public.departments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "departments_admin_update"
  ON public.departments
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "departments_admin_delete"
  ON public.departments
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- Profiles RLS Policies:
-- A. Users can always read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- B. Staff and Super Admins can view all profiles for ticket resolution and administration
CREATE POLICY "profiles_select_staff_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- C. Students can view active staff and super admin profiles (for ticket assignment transparency)
CREATE POLICY "profiles_select_staff_public"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (role IN ('STAFF', 'SUPER_ADMIN') AND status = 'ACTIVE');

-- D. Users can update their own permitted personal profile fields
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- E. Super Admins have full access to manage all profiles (approve, suspend, reassign)
CREATE POLICY "profiles_admin_all"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 8. Seed Initial Standard College Departments
INSERT INTO public.departments (name, code, description)
VALUES
  ('Computer Science & Engineering', 'CSE', 'Academic Department for CSE undergraduate and postgraduate studies'),
  ('Electronics & Communication', 'ECE', 'Academic Department for Electronics and Communication Engineering'),
  ('Hostel & Student Housing', 'HOSTEL', 'Department managing hostel allocations, mess, and campus accommodation'),
  ('Finance & Accounts Office', 'FIN', 'Tuition fees, scholarships, refunds, and payroll records'),
  ('Central Library', 'LIB', 'Circulation, book borrowing, digital repository, and study spaces'),
  ('Examination & Evaluation Cell', 'EXAM', 'Timetables, hall tickets, grade sheets, revaluation, and transcripts'),
  ('Student Affairs & Grievances', 'AFFAIRS', 'Student welfare, anti-ragging, discipline, and confidential grievances'),
  ('Transport & Commute Services', 'TRANS', 'College bus routes, passes, parking, and transit logistics'),
  ('Academic Registrar Office', 'REGISTRAR', 'Admissions, enrollments, degree certificates, and transfer verification')
ON CONFLICT (code) DO NOTHING;

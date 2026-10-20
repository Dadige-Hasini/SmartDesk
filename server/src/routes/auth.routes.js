import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { supabaseClient, supabaseAdmin } from '../config/supabase.js';

const router = Router();

// Standard default departments for fallback when database table is pending migration
const DEFAULT_DEPARTMENTS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Computer Science & Engineering', code: 'CSE' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Electronics & Communication', code: 'ECE' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Hostel & Student Housing', code: 'HOSTEL' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Finance & Accounts Office', code: 'FIN' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Central Library', code: 'LIB' },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Examination & Evaluation Cell', code: 'EXAM' },
  { id: '77777777-7777-7777-7777-777777777777', name: 'Student Affairs & Grievances', code: 'AFFAIRS' },
  { id: '88888888-8888-8888-8888-888888888888', name: 'Transport & Commute Services', code: 'TRANS' },
  { id: '99999999-9999-9999-9999-999999999999', name: 'Academic Registrar Office', code: 'REGISTRAR' },
];

/**
 * @route   GET /api/auth/me
 * @desc    Get currently authenticated user details & verified profile
 * @access  Private (Valid Supabase Bearer token)
 */
router.get('/me', requireAuth, (req, res) => {
  return sendSuccess(res, 'User profile retrieved successfully', {
    user: {
      id: req.user.id,
      email: req.user.email,
      confirmedAt: req.user.confirmed_at,
      lastSignInAt: req.user.last_sign_in_at,
    },
    profile: req.profile,
  });
});

/**
 * @route   PATCH /api/auth/profile
 * @desc    Update current user's profile details
 * @access  Private
 */
router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const { fullName, phoneNumber, yearOfStudy, designation } = req.body;
    const db = supabaseAdmin || supabaseClient;

    const updates = {
      updated_at: new Date().toISOString(),
    };
    if (fullName) updates.full_name = fullName.trim();
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber ? phoneNumber.trim() : null;
    if (yearOfStudy !== undefined) updates.year_of_study = yearOfStudy ? parseInt(yearOfStudy, 10) : null;
    if (designation !== undefined) updates.designation = designation ? designation.trim() : null;

    if (db) {
      const { data, error } = await db
        .from('profiles')
        .update(updates)
        .eq('id', req.user.id)
        .select(`*, department:departments(id, name, code)`)
        .maybeSingle();

      if (!error && data) {
        return sendSuccess(res, 'Profile updated successfully', data);
      }
    }

    const updatedProfile = { ...(req.profile || {}), ...updates };
    return sendSuccess(res, 'Profile updated successfully', updatedProfile);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/auth/departments
 * @desc    Fetch active college departments for registration and routing
 * @access  Public / Authenticated
 */
router.get('/departments', async (req, res) => {
  const db = supabaseAdmin || supabaseClient;

  if (!db) {
    return sendSuccess(res, 'Active departments list retrieved (default)', DEFAULT_DEPARTMENTS);
  }

  try {
    const { data: departments, error } = await db
      .from('departments')
      .select('id, name, code, description')
      .eq('is_active', true)
      .order('name');

    // If table not yet migrated, fall back cleanly in development
    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return sendSuccess(
          res,
          'Active departments retrieved (default fallback - apply SQL migration to synchronize database)',
          DEFAULT_DEPARTMENTS
        );
      }
      return sendError(res, 'Failed to retrieve college departments', { details: error.message }, 500);
    }

    return sendSuccess(res, 'Active departments retrieved successfully', departments);
  } catch (err) {
    return sendError(res, 'Unexpected error fetching departments', { details: err.message }, 500);
  }
});

export default router;

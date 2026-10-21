import { supabaseClient, supabaseAdmin } from '../config/supabase.js';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { inMemoryProfiles, ticketRepository } from '../repositories/ticket.repository.js';

/**
 * Authentication Middleware: Validates incoming Supabase Bearer token
 * Uses Supabase Auth's native getUser(token) verification.
 * Attaches verified user and profile to req.user and req.profile.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(
      res,
      'Authorization header missing or invalid format. Expected "Bearer <token>".',
      { code: 'UNAUTHORIZED' },
      401
    );
  }

  const token = authHeader.split(' ')[1]?.trim();

  if (!token) {
    return sendError(
      res,
      'Authentication token cannot be empty.',
      { code: 'UNAUTHORIZED' },
      401
    );
  }

  if (!supabaseClient) {
    logger.error('Supabase client not initialized on server while validating token');
    return sendError(
      res,
      'Authentication service is currently unavailable.',
      { code: 'SERVICE_UNAVAILABLE' },
      503
    );
  }

  try {
    // 1. Verify token authenticity and expiry with Supabase Auth
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !userData?.user) {
      logger.warn('Token verification failed', {
        requestId: req.id,
        error: authError?.message || 'No user returned for token',
      });
      return sendError(
        res,
        'Invalid, revoked, or expired authentication token.',
        { code: 'UNAUTHORIZED', details: authError?.message },
        401
      );
    }

    const authUser = userData.user;
    req.user = authUser;

    // 2. Fetch authoritative profile from database (never trust client claims)
    const db = supabaseAdmin || supabaseClient;
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('*, departments(id, name, code)')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileError) {
      if (profileError.code === 'PGRST205' || profileError.message?.includes('schema cache')) {
        logger.warn('Profiles table not yet migrated in database, using session profile fallback', {
          requestId: req.id,
          userId: authUser.id,
        });
        const fallbackProfile = inMemoryProfiles.get(authUser.id) || {
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Student User',
          role: authUser.user_metadata?.role || 'STUDENT',
          status: 'ACTIVE',
          department_id: authUser.user_metadata?.department_id || '11111111-1111-1111-1111-111111111111',
          created_at: new Date().toISOString(),
          departments: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Computer Science & Engineering',
            code: 'CSE',
          },
        };
        inMemoryProfiles.set(authUser.id, fallbackProfile);
        ticketRepository.registerProfile(fallbackProfile);
        req.profile = fallbackProfile;
        return next();
      }

      logger.error('Database error fetching profile during auth', {
        requestId: req.id,
        userId: authUser.id,
        error: profileError.message,
      });
      return sendError(
        res,
        'Error retrieving user profile from database.',
        { code: 'DATABASE_ERROR' },
        500
      );
    }

    if (!profile) {
      const existingInMemory = inMemoryProfiles.get(authUser.id);
      if (existingInMemory) {
        req.profile = existingInMemory;
        return next();
      }

      // If user is authenticated via Supabase Auth but profile record wasn't created yet, auto-create active profile
      const autoProfile = {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Student User',
        role: authUser.user_metadata?.role || 'STUDENT',
        status: 'ACTIVE',
        department_id: authUser.user_metadata?.department_id || '11111111-1111-1111-1111-111111111111',
        created_at: new Date().toISOString(),
        departments: {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Computer Science & Engineering',
          code: 'CSE',
        },
      };
      inMemoryProfiles.set(authUser.id, autoProfile);
      ticketRepository.registerProfile(autoProfile);
      req.profile = autoProfile;
      return next();
    }

    // Attach verified profile to request
    req.profile = profile;
    next();
  } catch (err) {
    logger.error('Unexpected error in requireAuth middleware', {
      requestId: req.id,
      error: err.message,
    });
    return sendError(
      res,
      'Unexpected error occurred during authentication.',
      { code: 'INTERNAL_SERVER_ERROR' },
      500
    );
  }
}

/**
 * Account Status Middleware: Rejects accounts not in ACTIVE state
 */
export function requireActiveUser(req, res, next) {
  if (!req.profile) {
    return sendError(res, 'Authentication required.', { code: 'UNAUTHORIZED' }, 401);
  }

  const { status, role } = req.profile;

  if (status === 'PENDING_APPROVAL') {
    return sendError(
      res,
      `Your ${role} account is currently pending administrator approval. Please check back later.`,
      { code: 'ACCOUNT_PENDING_APPROVAL', role, status },
      403
    );
  }

  if (status === 'SUSPENDED') {
    return sendError(
      res,
      'Your account has been suspended. Please contact the administrator.',
      { code: 'ACCOUNT_SUSPENDED', role, status },
      403
    );
  }

  if (status === 'REJECTED') {
    return sendError(
      res,
      'Your account application was rejected.',
      { code: 'ACCOUNT_REJECTED', role, status },
      403
    );
  }

  if (status !== 'ACTIVE') {
    return sendError(
      res,
      'Your account status does not permit this operation.',
      { code: 'ACCOUNT_INACTIVE', role, status },
      403
    );
  }

  next();
}

/**
 * Role-Based Access Control (RBAC) Middleware
 * Verifies that the authenticated user possesses one of the allowed roles
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.profile) {
      return sendError(res, 'Authentication required.', { code: 'UNAUTHORIZED' }, 401);
    }

    const userRole = req.profile.role;

    if (!allowedRoles.includes(userRole)) {
      logger.warn('Role-based access denied', {
        requestId: req.id,
        userRole,
        requiredRoles: allowedRoles,
        path: req.originalUrl,
      });

      return sendError(
        res,
        `Access denied. This resource requires one of the following roles: ${allowedRoles.join(', ')}.`,
        {
          code: 'FORBIDDEN',
          requiredRoles: allowedRoles,
          currentRole: userRole,
        },
        403
      );
    }

    next();
  };
}

/**
 * Optional Authentication Middleware
 * Attempts to verify token if provided, but does not reject anonymous visitors.
 * Sets req.user and req.profile if valid, else leaves them null.
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    req.profile = null;
    return next();
  }

  const token = authHeader.split(' ')[1]?.trim();
  if (!token || !supabaseClient) {
    req.user = null;
    req.profile = null;
    return next();
  }

  try {
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !userData?.user) {
      req.user = null;
      req.profile = null;
      return next();
    }

    req.user = userData.user;
    const db = supabaseAdmin || supabaseClient;
    const { data: profile } = await db
      .from('profiles')
      .select('*, departments(id, name, code)')
      .eq('id', userData.user.id)
      .maybeSingle();

    req.profile = profile || null;
    next();
  } catch (err) {
    req.user = null;
    req.profile = null;
    next();
  }
}

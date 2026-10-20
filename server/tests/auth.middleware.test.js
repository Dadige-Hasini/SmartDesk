import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock supabase clients for unit testing
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('../src/config/supabase.js', () => ({
  supabaseClient: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
    },
    from: (...args) => mockFrom(...args),
  },
  supabaseAdmin: {
    from: (...args) => mockFrom(...args),
  },
  isSupabaseConfigured: () => true,
  isSupabaseAdminConfigured: () => true,
}));

import { requireAuth, requireActiveUser, requireRole } from '../src/middleware/auth.js';

describe('Authentication & Authorization Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      headers: {},
      id: 'test-req-123',
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  describe('requireAuth', () => {
    it('returns 401 when Authorization header is missing', async () => {
      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header does not use Bearer scheme', async () => {
      req.headers.authorization = 'Basic dXNlcjpwYXNz';

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token is rejected by Supabase Auth', async () => {
      req.headers.authorization = 'Bearer invalid-or-expired-token';

      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('attaches user and profile and calls next() on valid token', async () => {
      req.headers.authorization = 'Bearer valid-token';

      const mockUser = { id: 'usr-123', email: 'student@college.edu' };
      const mockProfile = {
        id: 'usr-123',
        email: 'student@college.edu',
        full_name: 'Student User',
        role: 'STUDENT',
        status: 'ACTIVE',
      };

      mockGetUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: mockProfile, error: null }),
      });

      await requireAuth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(req.profile).toEqual(mockProfile);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('requireActiveUser', () => {
    it('returns 403 when user is PENDING_APPROVAL', () => {
      req.profile = { role: 'STAFF', status: 'PENDING_APPROVAL' };

      requireActiveUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'ACCOUNT_PENDING_APPROVAL' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when user is SUSPENDED', () => {
      req.profile = { role: 'STUDENT', status: 'SUSPENDED' };

      requireActiveUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when user is ACTIVE', () => {
      req.profile = { role: 'STUDENT', status: 'ACTIVE' };

      requireActiveUser(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('requireRole', () => {
    it('returns 403 when user does not have required role', () => {
      req.profile = { role: 'STUDENT', status: 'ACTIVE' };

      const superAdminOnly = requireRole('SUPER_ADMIN');
      superAdminOnly(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows access when user role matches one of the allowed roles', () => {
      req.profile = { role: 'STAFF', status: 'ACTIVE' };

      const staffOrAdmin = requireRole('STAFF', 'SUPER_ADMIN');
      staffOrAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});

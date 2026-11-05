import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../config/supabase';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to fetch user's database profile
  const fetchProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setProfile(null);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, departments(id, name, code)')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        if (error) {
          console.warn('Profiles table not yet in schema cache, using active user metadata fallback:', error.message);
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const activeUser = sessionData?.session?.user;
        const fallback = {
          id: userId,
          email: activeUser?.email || 'student@college.edu',
          full_name: activeUser?.user_metadata?.full_name || activeUser?.email?.split('@')[0] || 'Student User',
          role: activeUser?.user_metadata?.role || 'STUDENT',
          status: 'ACTIVE',
          department_id: activeUser?.user_metadata?.department_id || '11111111-1111-1111-1111-111111111111',
          departments: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Computer Science & Engineering',
            code: 'CSE',
          },
        };
        setProfile(fallback);
        return fallback;
      }

      setProfile(data);
      return data;
    } catch (err) {
      console.error('Failed to load profile:', err);
      return null;
    }
  }, []);

  const loginAsDemoUser = useCallback((demoRole = 'STUDENT') => {
    const isSuperAdmin = demoRole === 'SUPER_ADMIN';
    const isStaff = demoRole === 'STAFF';
    const demoUser = {
      id: isSuperAdmin
        ? '7502fc89-9c77-4d07-b29a-77779cc410eb'
        : (isStaff ? '22222222-2222-2222-2222-222222222222' : '1a1a6f63-690d-4698-bdbf-d93c6a792c55'),
      email: isSuperAdmin
        ? 'hasinirajdadige@gmail.com'
        : (isStaff ? 'staff@smartdesk.edu' : 'student@mallareddyuniversity.ac.in'),
      user_metadata: {
        role: demoRole,
        full_name: isSuperAdmin ? 'Chief Administrator' : (isStaff ? 'Prof. Priya Sharma' : 'Test Student'),
        department_id: isSuperAdmin ? null : '11111111-1111-1111-1111-111111111111',
      },
    };
    const demoProfile = {
      id: demoUser.id,
      email: demoUser.email,
      full_name: demoUser.user_metadata.full_name,
      role: demoRole,
      status: 'ACTIVE',
      department_id: isSuperAdmin ? null : '11111111-1111-1111-1111-111111111111',
      departments: isSuperAdmin ? null : {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Computer Science & Engineering',
        code: 'CSE',
      },
    };
    setUser(demoUser);
    setProfile(demoProfile);
    const mockToken = `mock-dev-token-${demoRole.toLowerCase()}`;
    const sess = { access_token: mockToken, user: demoUser };
    setSession(sess);
    localStorage.setItem(
      'sb-auth-token',
      JSON.stringify({ access_token: mockToken, demoRole, user: demoUser, profile: demoProfile })
    );
    return { user: demoUser, profile: demoProfile };
  }, []);

  useEffect(() => {
    // Check if there is an existing demo role session in localStorage
    try {
      const stored = localStorage.getItem('sb-auth-token');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.demoRole) {
          loginAsDemoUser(parsed.demoRole);
          setLoading(false);
          return;
        }
      }
    } catch {}

    if (!supabase) {
      setLoading(false);
      return;
    }

    // 1. Get initial active session
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession }, error }) => {
        if (error) {
          console.warn('Error fetching Supabase session:', error.message);
        }

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.access_token) {
          localStorage.setItem(
            'sb-auth-token',
            JSON.stringify({ access_token: initialSession.access_token })
          );
        } else {
          localStorage.removeItem('sb-auth-token');
        }

        if (initialSession?.user?.id) {
          await fetchProfile(initialSession.user.id);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    // 2. Listen to real-time auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.access_token) {
        localStorage.setItem(
          'sb-auth-token',
          JSON.stringify({ access_token: currentSession.access_token })
        );
      } else {
        localStorage.removeItem('sb-auth-token');
      }

      if (currentSession?.user?.id) {
        await fetchProfile(currentSession.user.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  // Sign In with email & password
  const signIn = async ({ email, password }) => {
    if (!supabase) {
      throw new Error('Supabase is not configured yet. Please configure credentials in .env');
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  // Sign Up with email, password & user metadata
  const signUp = async ({ email, password, metadata = {} }) => {
    if (!supabase) {
      throw new Error('Supabase is not configured yet. Please configure credentials in .env');
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    if (error) throw error;
    return data;
  };

  // Sign Out
  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    localStorage.removeItem('sb-auth-token');
  };

  // Refresh profile
  const refreshProfile = async () => {
    if (user?.id) {
      return await fetchProfile(user.id);
    }
    return null;
  };

  const value = {
    session,
    user,
    profile,
    loading,
    role: profile?.role ?? null,
    status: profile?.status ?? null,
    isAuthenticated: Boolean(user),
    isActive: profile?.status === 'ACTIVE',
    isPendingApproval: profile?.status === 'PENDING_APPROVAL',
    isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    loginAsDemoUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

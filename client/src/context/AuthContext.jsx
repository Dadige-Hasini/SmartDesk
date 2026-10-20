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

      if (error) {
        console.error('Error fetching profile from Supabase:', error.message);
        return null;
      }

      setProfile(data);
      return data;
    } catch (err) {
      console.error('Failed to load profile:', err);
      return null;
    }
  }, []);

  useEffect(() => {
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

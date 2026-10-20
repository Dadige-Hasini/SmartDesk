import { describe, it, expect } from 'vitest';
import { config } from '../src/config/env.js';
import { supabaseClient, isSupabaseConfigured } from '../src/config/supabase.js';

describe('Supabase Client Configuration', () => {
  it('loads supabase configuration object safely', () => {
    expect(config).toHaveProperty('supabase');
    expect(config.supabase).toHaveProperty('url');
    expect(config.supabase).toHaveProperty('publishableKey');
    expect(config.supabase).toHaveProperty('secretKey');
  });

  it('exposes supabaseClient or handles uninitialized state without throwing', () => {
    expect(typeof isSupabaseConfigured).toBe('function');
  });
});

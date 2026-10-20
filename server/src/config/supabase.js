import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

let supabaseClient = null;
let supabaseAdmin = null;

const hasBasicConfig = Boolean(config.supabase.url && config.supabase.publishableKey);
const hasAdminConfig = Boolean(config.supabase.url && config.supabase.secretKey);

if (hasBasicConfig) {
  try {
    supabaseClient = createClient(config.supabase.url, config.supabase.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    logger.error('Failed to initialize public Supabase client', { error: err.message });
  }
} else {
  logger.warn('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set. Supabase public client is uninitialized.');
}

if (hasAdminConfig) {
  try {
    supabaseAdmin = createClient(config.supabase.url, config.supabase.secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    logger.error('Failed to initialize admin Supabase client', { error: err.message });
  }
} else {
  logger.warn('SUPABASE_SECRET_KEY is not set. Administrative database operations will be restricted.');
}

export function isSupabaseConfigured() {
  return Boolean(supabaseClient);
}

export function isSupabaseAdminConfigured() {
  return Boolean(supabaseAdmin);
}

export { supabaseClient, supabaseAdmin };

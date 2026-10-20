import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

let supabaseClient = null;
let supabaseAdmin = null;

try {
  if (config.supabase.url && config.supabase.anonKey) {
    supabaseClient = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  if (config.supabase.url && config.supabase.serviceRoleKey) {
    supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } else {
    logger.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Administrative database operations will be restricted.');
  }
} catch (err) {
  logger.error('Failed to initialize Supabase client', { error: err.message });
}

export { supabaseClient, supabaseAdmin };

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabasePublishableKey &&
    !supabaseUrl.includes('placeholder') &&
    !supabaseUrl.includes('your-project-id')
);

let client = null;

if (supabaseUrl && supabasePublishableKey) {
  try {
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.error('Failed to initialize client Supabase client:', err);
  }
} else {
  console.warn(
    'Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) are missing. Running with mock authentication.'
  );
}

export const supabase = client;
export default supabase;

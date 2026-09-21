import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase credentials are not set. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local file.');
}

// Server / Admin client (used by Bot and API routes)
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
    },
  }
);

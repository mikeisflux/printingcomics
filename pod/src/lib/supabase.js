import { createClient } from '@supabase/supabase-js';
import { runtimeConfig } from './runtime-config';

// Hosted builds can receive browser-safe configuration from the Node server at
// request time. Vite values remain the fallback for local development.
const environment = runtimeConfig;
const supabaseUrl = environment.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
export const isProductionBackendEnabled = isSupabaseConfigured && environment.VITE_USE_SUPABASE_BACKEND === 'true';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export async function checkSupabaseConnection() {
  if (!supabase) return { connected: false, reason: 'not_configured' };

  const { error } = await supabase
    .from('public_catalog')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  return { connected: true };
}

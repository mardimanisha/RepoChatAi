import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info.tsx';

let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }
  
  const supabaseUrl = `https://${projectId}.supabase.co`;
  
  console.log('Initializing Supabase client with URL:', supabaseUrl);
  
  supabaseInstance = createSupabaseClient(supabaseUrl, publicAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });
  
  return supabaseInstance;
}
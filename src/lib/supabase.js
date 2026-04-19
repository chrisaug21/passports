import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabaseClient;

export function initializeSupabase(env) {
  if (!supabaseClient) {
    supabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return supabaseClient;
}

export function getSupabase() {
  if (!supabaseClient) {
    throw new Error("Supabase client accessed before initialization.");
  }

  return supabaseClient;
}

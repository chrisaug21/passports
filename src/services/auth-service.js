import { getSupabase } from "../lib/supabase.js";

export async function signIn({ email, password }) {
  const { error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }
}

export async function signUp({ email, password }) {
  const { error } = await getSupabase().auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();

  if (error) {
    throw error;
  }
}

export async function getSession() {
  const { data, error } = await getSupabase().auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

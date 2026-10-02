// Accounts via Supabase Auth: email sign-in link, Google and Microsoft.
// The client library loads only when a backend is configured, so the app
// still works offline and in on-device-only mode.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

let clientPromise = null;

export function accountsEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function client() {
  if (!accountsEnabled()) return Promise.resolve(null);
  clientPromise ||= import(SDK)
    .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }))
    .catch(() => {
      clientPromise = null; // offline: try again next time
      return null;
    });
  return clientPromise;
}

function redirectTo() {
  return location.origin + location.pathname;
}

export async function currentUser() {
  const sb = await client();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}

export async function onAuthChange(fn) {
  const sb = await client();
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => fn(session?.user || null));
}

export async function sendEmailLink(email) {
  const sb = await client();
  if (!sb) throw new Error("Can't reach the sign-in service. Check your internet connection.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
}

// provider: "google" | "azure" (Microsoft) | "apple"
export async function signInWith(provider) {
  const sb = await client();
  if (!sb) throw new Error("Can't reach the sign-in service. Check your internet connection.");
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signOut() {
  const sb = await client();
  if (sb) await sb.auth.signOut();
}

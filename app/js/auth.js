// Accounts via Supabase Auth: email sign-in link, Google and Microsoft.
// The client library loads only when a backend is configured, so the app
// still works offline and in on-device-only mode.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

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
  sb.auth.onAuthStateChange((event, session) => fn(session?.user || null, event));
}

async function need() {
  const sb = await client();
  if (!sb) throw new Error("Can't reach the sign-in service. Check your internet connection.");
  return sb;
}

// Turn Supabase's error text into something a person can act on.
export function friendlyError(err) {
  const msg = String(err?.message || err || "");
  if (/rate limit/i.test(msg)) return "Too many emails sent in the last hour. Sign in with your password instead, or try the email link again later.";
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password. If you've only used email links so far, sign in with a link once and set a password under your account.";
  if (/already registered|already been registered/i.test(msg)) return "There's already an account for this email. Use Sign in instead.";
  if (/password should be at least/i.test(msg)) return "Use a password of at least 8 characters.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first using the link we sent, then sign in.";
  return msg || "Something went wrong. Try again.";
}

export async function signInWithPassword(email, password) {
  const { error } = await (await need()).auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Returns true when the account is ready, false when Supabase is waiting for
// the person to confirm their email first.
export async function signUpWithPassword(email, password) {
  const { data, error } = await (await need()).auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
  return Boolean(data.session);
}

export async function sendPasswordReset(email) {
  const { error } = await (await need()).auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw error;
}

export async function setPassword(password) {
  const { error } = await (await need()).auth.updateUser({ password });
  if (error) throw error;
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

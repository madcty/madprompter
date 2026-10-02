// Backend settings. Leave SUPABASE_URL empty to run in on-device-only mode
// (no sign-in, scripts stay on this device).
// The anon key is designed to be public; row-level security in
// supabase/schema.sql keeps each person's scripts private.

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// Sign-in options shown on the sign-in screen. Each provider must also be
// switched on in the Supabase dashboard (Authentication > Providers).
export const AUTH_PROVIDERS = ["email", "google", "azure"];

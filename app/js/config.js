// Backend settings. Leave SUPABASE_URL empty to run in on-device-only mode
// (no sign-in, scripts stay on this device).
// The anon key is designed to be public; row-level security in
// supabase/schema.sql keeps each person's scripts private.

export const SUPABASE_URL = "https://odymuifcnallvoimsomn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_nD6T1nXRYH5GoG35VV2h5Q_JVnZS2X-";

// Sign-in options shown on the sign-in screen. Each provider must also be
// switched on in the Supabase dashboard (Authentication > Providers).
// Add "google" and "azure" (Microsoft) once they are set up in Supabase (docs/accounts-setup.md).
export const AUTH_PROVIDERS = ["email"];

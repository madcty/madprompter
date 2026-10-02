# Accounts and sync setup (Supabase)

Sign-in stays hidden until `app/js/config.js` has a Supabase URL and key, so the app works without any of this.

## 1. Create the project
1. Sign up at https://supabase.com and click **New project**. Name: `madprompter`. Region: nearest to you.
2. **Project Settings > API**: copy the **Project URL** and the **anon / publishable** key into `app/js/config.js`.
   Never put the `service_role` / secret key in the app.

## 2. Create the tables
**SQL Editor > New query**, paste all of [`supabase/schema.sql`](../supabase/schema.sql), click **Run**.
It creates `scripts` (one row per script, private to its owner by row-level security) and `profiles` (plan per account, for subscriptions later).

## 3. Tell Supabase where the app lives
**Authentication > URL Configuration**
- Site URL: `https://madcty.github.io/madprompter/`
- Redirect URLs: add `https://madcty.github.io/madprompter/` and `http://localhost:8000/`

Email sign-in links and email + password accounts work as soon as this is done.

### Email limits
Supabase's built-in mailer only sends a few emails per hour (sign-in links, confirmations, password resets).
Password sign-in avoids email entirely after the account exists. Before opening sign-ups to customers, add your own
mail service under **Project Settings > Authentication > SMTP Settings** (for example Resend or Postmark), then raise
the limit under **Authentication > Rate Limits**.

## 4. Google sign-in
1. https://console.cloud.google.com > create a project `madprompter`.
2. **APIs & Services > OAuth consent screen**: External, app name `madprompter`, your email as support and developer contact. Save.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**: type **Web application**.
   Authorized redirect URI: the **Callback URL** shown in Supabase under **Authentication > Providers > Google**
   (looks like `https://<project>.supabase.co/auth/v1/callback`).
4. Copy the Client ID and Client secret into Supabase **Authentication > Providers > Google**, enable, save.

## 5. Microsoft sign-in
1. https://portal.azure.com > **Microsoft Entra ID > App registrations > New registration**.
   Name `madprompter`; Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**;
   Redirect URI (Web): the Supabase callback URL from **Authentication > Providers > Azure**.
2. Copy the **Application (client) ID**. Then **Certificates & secrets > New client secret**, copy its **Value**.
3. In Supabase **Authentication > Providers > Azure**: paste both, Azure Tenant URL `https://login.microsoftonline.com/common`, enable, save.

## Apple (later)
Needs an Apple Developer account ($99/yr). Add `"apple"` to `AUTH_PROVIDERS` in `config.js` once set up.

## How sync works
Each device keeps a full copy, so prompting works offline. When signed in, changes sync a moment after you make them,
when the app comes back to the foreground, and when the device reconnects. The newest edit of a script wins.
Signing out removes the scripts from that device; they stay in the account.

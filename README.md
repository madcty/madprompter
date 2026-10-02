# madprompter

Teleprompter for MADCTY. Load a script from Word, TextEdit, a text file or paste, then prompt it on an iPad or
Android tablet/phone. Voice follow listens as you read and keeps your line on the reading marker near the camera.

- `app/` the web app (static, no build step, installable as a PWA). See [app/README.md](app/README.md).
- `docs/feature-spec.md` feature research (PromptSmart, CloudPrompter), roadmap and subscription tiers.
- `supabase/schema.sql` database tables for accounts and synced scripts; setup steps in [docs/accounts-setup.md](docs/accounts-setup.md).
- `tests/` unit tests for the speech matcher and script sync: `npm test`.

## Hosting
`.github/workflows/pages.yml` publishes `app/` to GitHub Pages on every push to `main`.
One-time setup: repository Settings > Pages > Build and deployment > Source: **GitHub Actions**.
(GitHub Pages on a private repository needs a paid GitHub plan; otherwise make the repo public or use another static host.)

The site is served over HTTPS, which browsers require before they allow the microphone.

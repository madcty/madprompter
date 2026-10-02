# Teleprompter web app (prototype)

Static web app, no build step and no dependencies. Open `index.html` through any web server.

## Run locally
    cd app && python3 -m http.server 8000
Then open http://localhost:8000 (the microphone works on localhost).

## Use on iPad / Android
Voice follow needs the microphone, which browsers only allow over HTTPS. Host this folder on any static host
(GitHub Pages, Netlify, Cloudflare Pages, Vercel), open the URL on the tablet, then Share > Add to Home Screen
for a full-screen app that also works offline.
- iPad: Safari, with Settings > Siri (or Keyboard) > Dictation turned on.
- Android: Chrome.

## Code map
- `js/app.js` library, editor, import, send-to-device, boot
- `js/prompter.js` prompting screen, scroll engine, controls, keyboard/Bluetooth remotes
- `js/matcher.js` aligns recognised speech to the script (pure logic, engine-independent)
- `js/voice.js` Web Speech API wrapper with auto-restart
- `js/importers.js` .txt/.md/.rtf/.docx/.odt/.html to plain text
- `js/store.js` ScriptStore boundary (local today, API-backed for accounts later)
- `js/plans.js` subscription tiers and `can(feature)` checks
- `js/share.js` script packed into a link to move it between devices
- `sw.js`, `manifest.webmanifest` installable PWA / offline

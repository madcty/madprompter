# Teleprompter: feature research and spec

_Prepared 2026-10-02 for Brian. Scripts are written and uploaded on a Mac/PC; prompting happens on an iPad or Android phone/tablet._

## 1. What the market leaders do

### PromptSmart (Pro / Studio)
- **VoiceTrack**: speech-recognition scrolling that follows the speaker, pauses when they pause or ad-lib, and resumes when they return to the script. This is the signature feature and sits behind the paid tier.
- Works offline (on-device recognition), iOS, Android and Mac apps.
- Script library with folders, sync across devices (iCloud on Apple).
- Import from text files and cloud storage (Dropbox, Google Drive, etc.).
- Adjustable font, size, colour, margins, scroll speed, and a fixed reading position marker.
- Mirror/flip text for beam-splitter teleprompter glass.
- Camera mode: record video with the script overlaid near the lens.
- Remote control from a second device or Bluetooth remote / keyboard.
- Pricing: free core prompter, VoiceTrack in a paid subscription (around $20 to $25/yr at last report; price history varies).
- Weak spots reviewers call out: VoiceTrack drifts with noisy rooms (HVAC, traffic), stumbles, or inconsistent pacing; busy UI; thin free tier.

### CloudPrompter
- Fully browser-based prompter, plus iOS/Mac apps for offline use.
- **Controller + presenter split**: one device edits and drives scrolling, another displays. Scrolling, edits and layout changes sync in real time.
- **Broadcast mode**: share a URL so a remote presenter can be prompted from anywhere.
- **Transparency / overlay mode** for prompting on top of Zoom, Teams, Meet, Twitch, Discord.
- Live editing while prompting.
- Freemium pricing with paid tiers for pro and team use.

### Table-stakes features across both (and other prompters)
Mirror modes, countdown before start, reading marker, adjustable speed, keyboard and Bluetooth-pedal control, dark background, large text, script library, import from common formats, full-screen mode.

## 2. Our product, phased

### Phase 1: single-user prototype (built now)
| Area | Feature |
|---|---|
| Script input | Paste text; import .txt, .md, .rtf (TextEdit default), .docx (Word / Pages export), .html; drag-and-drop on desktop |
| Library | Create, edit, rename, duplicate, delete scripts; word count and estimated read time; stored on the device |
| Getting a script to the tablet | "Send to device" link: the whole script is compressed into a link you can AirDrop, email or message to the iPad/phone. Export/import the whole library as a backup file |
| Voice follow | Browser speech recognition (Chrome on Android, Safari on iPad) matches what you say against the script and keeps the line you are reading on the marker. It tolerates skipped words, ad-libs, and re-reads, and pauses when you stop talking |
| Other scroll modes | Constant-speed auto-scroll with live speed control; manual (swipe/scroll) |
| Display | Font size, line spacing, side margins, text alignment, colour themes, reading-marker position (put it near the camera), horizontal and vertical mirror, dimming of words already read |
| Controls | Tap to pause/resume, countdown, keyboard and Bluetooth page-turner keys (Space, arrows, Page Up/Down), screen wake-lock so the tablet does not sleep |
| Platform | Installable web app (PWA): add to home screen on iPad and Android, works offline once loaded (voice recognition itself may need a connection on some devices) |

### Phase 2: accounts and sync (the step toward a sellable service)
- Sign-in (email magic link + Google/Apple), scripts stored server-side and synced to every device.
- Upload on desktop, open on tablet instantly, with no links to pass around.
- Remote control: phone or laptop drives the tablet's scroll position in real time (CloudPrompter's controller/presenter model).
- Folders, tags, search, version history.
- Import from Google Drive, Dropbox, OneDrive.

### Phase 3: pro features
- Camera mode: record video on the tablet with the script near the lens.
- Cue marks inside the script ([PAUSE], [SLOW], colour-highlighted lines) and speaker notes not read aloud.
- Higher-accuracy voice tracking via a cloud speech service (better in noisy rooms, more languages), on-device fallback.
- Broadcast link for remote presenters; overlay/transparent mode on desktop for video calls.
- Team workspaces: shared libraries, roles, an operator who controls the presenter's prompter.

## 3. Subscription tiers (proposal)
| Tier | Price idea | Includes |
|---|---|---|
| Free | $0 | 3 scripts, manual + auto scroll, all display settings, watermark-free |
| Pro | ~$8/mo or $60/yr | Unlimited scripts, voice follow, sync across devices, cloud import, remote control, camera mode |
| Team | ~$15/user/mo | Pro plus shared workspaces, operator mode, broadcast links, admin billing |

The prototype already reads these tiers from one config file (`app/js/plans.js`), and every gated feature asks `can(feature)` rather than checking a plan by name, so switching on billing later means changing who the user is, not rewriting features.

## 4. Architecture for growth
- **Front end**: a static web app (HTML/CSS/vanilla JS modules, no build step) so it runs in any modern tablet browser and can be wrapped later as a native app (Capacitor) for the App Store and Play Store if needed.
- **Storage boundary**: all script reads/writes go through a `ScriptStore` interface (`app/js/store.js`). Today it is a local, on-device store; Phase 2 adds an API-backed store with the same methods.
- **Entitlements boundary**: `plans.js` defines tiers and features; the account system will supply the user's tier.
- **Suggested Phase 2 backend**: managed Postgres + auth + storage (e.g. Supabase or Firebase) with Stripe for subscriptions and Stripe customer portal for self-serve upgrades; real-time channel for remote control. Hosting on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) for the front end.
- **Voice**: the `VoiceFollower` module separates "speech in" from "where am I in the script", so the Web Speech API can be swapped for a cloud streaming recogniser later without touching the prompter.

## 5. Known constraints
- Microphone access needs the app served over HTTPS (or localhost).
- Safari on iPad supports speech recognition only when Siri/Dictation is enabled; it also stops listening after silence, which the app handles by restarting automatically.
- Apple `.pages` files cannot be read directly in a browser; export as Word (.docx), RTF or plain text.
- Until Phase 2, each device keeps its own library; use the "Send to device" link or library backup to move scripts.

## Sources
- [PromptSmart Pro review (teleprompter.works)](https://teleprompter.works/blog/promptsmart-pro-review/)
- [PromptSmart Pro on the App Store](https://apps.apple.com/us/app/promptsmart-pro-teleprompter/id894811756)
- [PromptSmart Pro pricing (sharespeak.co)](https://sharespeak.co/promptsmart-pro-pricing)
- [PromptSmart](https://promptsmart.com/)
- [CloudPrompter: How it works](https://cloudprompter.com/how-it-works)
- [CloudPrompter reviews (SourceForge)](https://sourceforge.net/software/product/CloudPrompter/)
- Items not stated on those pages (e.g. mirroring, Bluetooth remotes, countdown) come from general product knowledge and are typical of the category.

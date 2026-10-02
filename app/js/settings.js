// Prompter display/behaviour preferences, kept per device.

const KEY = "tp.settings.v1";

export const DEFAULTS = {
  // The embedded preview has no microphone, so it starts in auto-scroll.
  mode: globalThis.TP_PREVIEW ? "auto" : "voice", // voice | auto | manual
  fontSize: 56,           // px
  lineHeight: 1.4,
  margin: 8,              // % each side
  align: "left",          // left | center
  theme: "dark",          // dark | amber | light
  marker: 28,             // % from top; keep near the camera
  mirrorX: false,
  mirrorY: false,
  speed: 60,              // px per second in auto mode
  countdown: 3,           // seconds, 0 = off
  dimRead: true,
  lang: "",               // "" = device language
};

export function loadSettings() {
  // Phones get a smaller starting text size than tablets.
  const base = { ...DEFAULTS, fontSize: Math.min(innerWidth, innerHeight) < 600 ? 38 : DEFAULTS.fontSize };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return base;
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

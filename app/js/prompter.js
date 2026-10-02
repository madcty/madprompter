// The prompting screen: renders the script, keeps the line being read on the
// reading marker, and drives voice-follow, auto-scroll or manual modes.

import { tokenize, ScriptMatcher } from "./matcher.js";
import { VoiceInput, voiceSupported } from "./voice.js";
import { can } from "./plans.js";

export class Prompter {
  constructor(root, { settings, onSettingsChange, onExit, toast }) {
    this.root = root;
    this.settings = settings;
    this.onSettingsChange = onSettingsChange;
    this.onExit = onExit;
    this.toast = toast;

    this.stage = root.querySelector(".pr-stage");
    this.text = root.querySelector(".pr-text");
    this.marker = root.querySelector(".pr-marker");
    this.countdownEl = root.querySelector(".pr-countdown");
    this.progressEl = root.querySelector(".pr-progress span");
    this.timerEl = root.querySelector("[data-timer]");
    this.voiceDot = root.querySelector("[data-voice-state]");
    this.playBtn = root.querySelector("[data-action=play]");
    this.heardEl = root.querySelector(".pr-heard");

    this.playing = false;
    this.spans = [];          // token index -> span element
    this.wordEls = [];        // all rendered word spans
    this.position = -1;       // last spoken token index (voice mode)
    this.scrollPos = 0;       // our own float scroll position
    this.target = null;       // voice-mode scroll target
    this.userScrollUntil = 0;
    this.elapsed = 0;

    this._bind();
  }

  // ---------- lifecycle ----------

  open(script) {
    this.script = script;
    this._render(script.body);
    this.applySettings();
    this.root.hidden = false;
    document.body.classList.add("prompting");
    this.rewind();
    this._showChrome(true);
    this._loop();
    this._requestFullscreen();
  }

  close() {
    this.pause();
    cancelAnimationFrame(this.raf);
    this.root.hidden = true;
    document.body.classList.remove("prompting");
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  _requestFullscreen() {
    const el = document.documentElement;
    // iPad Safari has no element fullscreen; "Add to Home Screen" gives full screen there.
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
  }

  // ---------- rendering ----------

  _render(body) {
    this.text.textContent = "";
    this.spans = [];
    this.wordEls = [];
    let tokenIndex = 0;
    const frag = document.createDocumentFragment();

    for (const para of body.split(/\n/)) {
      const p = document.createElement("p");
      if (!para.trim()) p.className = "pr-gap";
      // Keep whitespace between words as text nodes so wrapping stays natural.
      for (const part of para.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          p.append(" ");
          continue;
        }
        const span = document.createElement("span");
        span.className = "w";
        span.textContent = part;
        const n = tokenize(part).length;
        if (n) {
          span.dataset.i = tokenIndex;
          for (let k = 0; k < n; k++) this.spans[tokenIndex + k] = span;
          tokenIndex += n;
        }
        // Stage directions like [PAUSE] are shown as cues and are not expected to be spoken.
        if (/^\[.*\]$/.test(part)) span.classList.add("cue");
        this.wordEls.push(span);
        p.append(span);
      }
      frag.append(p);
    }
    this.text.append(frag);
    this.tokens = tokenize(body);
    this.matcher = new ScriptMatcher(this.tokens);
  }

  applySettings() {
    const s = this.settings;
    const r = this.root;
    r.dataset.theme = s.theme;
    r.dataset.align = s.align;
    r.classList.toggle("dim-read", s.dimRead);
    r.style.setProperty("--pr-font", s.fontSize + "px");
    r.style.setProperty("--pr-line", s.lineHeight);
    r.style.setProperty("--pr-margin", s.margin + "%");
    const markerTop = s.mirrorY ? 100 - s.marker : s.marker;
    r.style.setProperty("--pr-marker", markerTop + "%");
    r.style.setProperty("--pr-marker-pad", s.marker + "%");
    this.stage.style.transform = `scale(${s.mirrorX ? -1 : 1}, ${s.mirrorY ? -1 : 1})`;
    this._pad();
    r.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === s.mode));
    r.querySelector("[data-speed-label]").textContent = s.speed;
    r.querySelector(".pr-speed").hidden = s.mode !== "auto";
    if (this.voiceDot) this.voiceDot.hidden = s.mode !== "voice";
    this._syncSettingsForm();
    // Layout changed: keep the current word on the marker.
    if (s.mode === "voice") this._targetWord(this.position);
  }

  // Room above the first line and below the last, so both can reach the marker.
  _pad() {
    const h = this.stage.clientHeight || window.innerHeight;
    const halfLine = (this.settings.fontSize * this.settings.lineHeight) / 2;
    this.text.style.paddingTop = Math.max(0, Math.round(h * this.settings.marker / 100 - halfLine)) + "px";
    this.text.style.paddingBottom = Math.round(h * (1 - this.settings.marker / 100)) + "px";
  }

  _syncSettingsForm() {
    const form = this.root.querySelector(".pr-settings");
    for (const el of form.elements) {
      if (!el.name || !(el.name in this.settings)) continue;
      if (el.type === "checkbox") el.checked = this.settings[el.name];
      else el.value = this.settings[el.name];
      const out = form.querySelector(`[data-out="${el.name}"]`);
      if (out) out.textContent = el.value;
    }
  }

  _set(patch) {
    Object.assign(this.settings, patch);
    this.onSettingsChange(this.settings);
    this.applySettings();
  }

  // ---------- playback ----------

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  async play() {
    if (this.playing || this.counting) return;
    const mode = this.settings.mode;
    if (mode === "voice") {
      if (!can("voiceFollow")) {
        this.toast("Voice follow is part of the Pro plan.");
        return;
      }
      if (!voiceSupported()) {
        this.toast("Voice follow isn't available in this browser. Use Chrome on Android or Safari on iPad. Switched to auto-scroll.");
        this._set({ mode: "auto" });
        return;
      }
    }
    if (this.settings.countdown > 0 && this.scrollPos < 5) await this._countdown(this.settings.countdown);
    this.playing = true;
    this.lastTick = performance.now();
    this.playBtn.classList.add("on");
    this.playBtn.setAttribute("aria-label", "Pause");
    this._wake(true);
    if (mode === "voice") this._startVoice();
    this._showChrome(false);
  }

  pause() {
    this.playing = false;
    this.playBtn.classList.remove("on");
    this.playBtn.setAttribute("aria-label", "Play");
    if (this.voice) this.voice.stop();
    this._wake(false);
    this._showChrome(true);
  }

  rewind() {
    this.pause();
    this.position = -1;
    this.matcher?.reset(-1);
    this.elapsed = 0;
    this.scrollPos = 0;
    this.target = null;
    this.stage.scrollTop = 0;
    this._markRead(-1, true);
  }

  _countdown(n) {
    this.counting = true;
    return new Promise((resolve) => {
      const el = this.countdownEl;
      el.hidden = false;
      const step = () => {
        if (n <= 0 || !this.counting) {
          el.hidden = true;
          this.counting = false;
          resolve();
          return;
        }
        el.textContent = n--;
        setTimeout(step, 1000);
      };
      step();
    });
  }

  _startVoice() {
    if (!this.voice) {
      this.voice = new VoiceInput({
        lang: this.settings.lang || undefined,
        onWords: (text) => this._heard(text),
        onState: (state) => { if (this.voiceDot) this.voiceDot.dataset.voiceState = state; },
        onError: (err) => {
          const msg = {
            denied: "Microphone access was blocked. Allow the microphone for this site (on iPad also turn on Siri & Dictation in Settings), or switch to auto-scroll.",
            unsupported: "Voice follow isn't available in this browser.",
            network: "Speech recognition needs an internet connection on this device.",
            "audio-capture": "No microphone was found.",
          }[err] || `Voice follow stopped (${err}).`;
          this.toast(msg);
          if (err === "denied" || err === "unsupported") this.pause();
        },
      });
    }
    this.voice.lang = this.settings.lang || navigator.language || "en-US";
    this.voice.start();
  }

  _heard(text) {
    if (this.heardEl) this.heardEl.textContent = text.split(/\s+/).slice(-6).join(" ");
    const pos = this.matcher.update(text);
    if (pos === null) return;
    this.position = pos;
    this._markRead(pos);
    this._targetWord(pos);
  }

  _markRead(pos, reset = false) {
    const upto = pos >= 0 && this.spans[pos] ? this.wordEls.indexOf(this.spans[pos]) : -1;
    if (reset || this._readUpto === undefined) {
      this.wordEls.forEach((el, k) => el.classList.toggle("read", k <= upto));
    } else {
      const a = Math.min(this._readUpto, upto), b = Math.max(this._readUpto, upto);
      for (let k = a + 1; k <= b; k++) this.wordEls[k]?.classList.toggle("read", k <= upto);
    }
    this._readUpto = upto;
    this._now?.classList.remove("now");
    this._now = upto >= 0 ? this.wordEls[upto] : null;
    this._now?.classList.add("now");
  }

  _markerOffset() {
    return this.stage.clientHeight * (this.settings.marker / 100);
  }

  _targetWord(pos) {
    const span = pos >= 0 ? this.spans[pos] : null;
    if (!span) return;
    // Centre the spoken word's line on the marker.
    this.target = span.offsetTop + span.offsetHeight / 2 - this._markerOffset();
  }

  // ---------- frame loop ----------

  _loop() {
    const tick = (now) => {
      const dt = Math.min(0.1, (now - (this.lastTick || now)) / 1000);
      this.lastTick = now;
      const max = this.stage.scrollHeight - this.stage.clientHeight;
      const userActive = now < this.userScrollUntil;

      if (userActive) {
        this.scrollPos = this.stage.scrollTop;
      } else if (this.playing && this.settings.mode === "auto") {
        this.scrollPos = Math.min(max, this.scrollPos + this.settings.speed * dt);
        this.stage.scrollTop = this.scrollPos;
      } else if (this.settings.mode === "voice" && this.target !== null) {
        const diff = this.target - this.scrollPos;
        // Ease toward the spoken line: fast for big jumps, gentle for small steps.
        this.scrollPos += diff * Math.min(1, dt * 5);
        if (Math.abs(diff) < 0.5) this.scrollPos = this.target;
        this.scrollPos = Math.max(0, Math.min(max, this.scrollPos));
        this.stage.scrollTop = this.scrollPos;
      } else {
        this.scrollPos = this.stage.scrollTop;
      }

      if (this.playing) {
        this.elapsed += dt;
        this.timerEl.textContent = fmtTime(this.elapsed);
      }
      const pct = max > 0 ? (this.stage.scrollTop / max) * 100 : 0;
      this.progressEl.style.width = pct + "%";

      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  // After the user drags or wheels, re-anchor voice tracking to the line now on the marker.
  _userScrolled() {
    this.userScrollUntil = performance.now() + 700;
    clearTimeout(this._reanchor);
    this._reanchor = setTimeout(() => {
      this.scrollPos = this.stage.scrollTop;
      if (this.settings.mode !== "voice") return;
      const y = this.stage.scrollTop + this._markerOffset();
      let idx = -1;
      for (let i = 0; i < this.spans.length; i++) {
        const s = this.spans[i];
        if (s && s.offsetTop > y) break;
        idx = i;
      }
      // Position is the last word spoken; the line on the marker is about to be read.
      const lineStart = this._lineStartIndex(idx);
      this.position = lineStart - 1;
      this.matcher.reset(this.position);
      this._markRead(this.position);
      this.target = null;
    }, 750);
  }

  _lineStartIndex(idx) {
    if (idx < 0) return 0;
    const top = this.spans[idx].offsetTop;
    let i = idx;
    while (i > 0 && this.spans[i - 1] && this.spans[i - 1].offsetTop === top) i--;
    return i;
  }

  nudge(dir, amount) {
    const step = amount ?? this.stage.clientHeight * 0.35;
    this.stage.scrollTop += dir * step;
    this._userScrolled();
  }

  // ---------- chrome & input ----------

  _showChrome(show) {
    clearTimeout(this._chromeTimer);
    this.root.classList.toggle("chrome-hidden", !show);
    if (show && this.playing) {
      this._chromeTimer = setTimeout(() => this.root.classList.add("chrome-hidden"), 3000);
    }
  }

  async _wake(on) {
    try {
      if (on && "wakeLock" in navigator) this.wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && this.wakeLock) { await this.wakeLock.release(); this.wakeLock = null; }
    } catch {}
  }

  _bind() {
    const r = this.root;

    r.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action],[data-mode]");
      if (btn) {
        e.stopPropagation();
        if (btn.dataset.mode) {
          this.pause();
          this._set({ mode: btn.dataset.mode });
          return;
        }
        const a = btn.dataset.action;
        if (a === "play") this.toggle();
        else if (a === "rewind") this.rewind();
        else if (a === "exit") this.onExit();
        else if (a === "settings") r.querySelector(".pr-settings").toggleAttribute("hidden");
        else if (a === "close-settings") r.querySelector(".pr-settings").hidden = true;
        else if (a === "slower") this._set({ speed: Math.max(5, this.settings.speed - 10) });
        else if (a === "faster") this._set({ speed: Math.min(400, this.settings.speed + 10) });
        else if (a === "bigger") this._set({ fontSize: Math.min(160, this.settings.fontSize + 4) });
        else if (a === "smaller") this._set({ fontSize: Math.max(20, this.settings.fontSize - 4) });
        return;
      }
      if (e.target.closest(".pr-settings, .pr-bar")) return;
      // Tap anywhere on the text: pause/resume, and bring the controls back.
      if (this.counting) { this.counting = false; return; }
      this.toggle();
    });

    const form = r.querySelector(".pr-settings");
    form.addEventListener("input", (e) => {
      const el = e.target;
      if (!el.name) return;
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "range" || el.type === "number" || el.name === "countdown") v = Number(v);
      this._set({ [el.name]: v });
    });
    form.addEventListener("submit", (e) => e.preventDefault());

    this.stage.addEventListener("wheel", () => this._userScrolled(), { passive: true });
    this.stage.addEventListener("touchmove", () => this._userScrolled(), { passive: true });

    document.addEventListener("keydown", (e) => {
      if (r.hidden || e.target.closest?.("input,select,textarea")) return;
      const k = e.key;
      // Bluetooth page-turner pedals and presentation remotes send these keys.
      if (k === " " || k === "Enter" || k === "MediaPlayPause") { e.preventDefault(); this.toggle(); }
      else if (k === "ArrowDown" || k === "PageDown") { e.preventDefault(); this.nudge(1); }
      else if (k === "ArrowUp" || k === "PageUp") { e.preventDefault(); this.nudge(-1); }
      else if (k === "ArrowRight" || k === "+" || k === "=") this._set({ speed: Math.min(400, this.settings.speed + 10) });
      else if (k === "ArrowLeft" || k === "-") this._set({ speed: Math.max(5, this.settings.speed - 10) });
      else if (k === "Home" || k === "r") this.rewind();
      else if (k === "m") this._set({ mirrorX: !this.settings.mirrorX });
      else if (k === "Escape") this.onExit();
    });

    window.addEventListener("resize", () => {
      if (r.hidden) return;
      this._pad();
      if (this.settings.mode === "voice") this._targetWord(this.position);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.playing) this.pause();
    });
    r.addEventListener("pointermove", () => { if (this.playing) this._showChrome(true); });
  }
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

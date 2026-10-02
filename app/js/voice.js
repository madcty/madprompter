// Speech input via the browser's Web Speech API (Chrome on Android,
// Safari on iPad/iPhone with Siri & Dictation enabled). Emits the recent
// transcript; the ScriptMatcher decides where that is in the script.

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export function voiceSupported() {
  return Boolean(Recognition);
}

export class VoiceInput {
  constructor({ lang = navigator.language || "en-US", onWords, onState, onError } = {}) {
    this.lang = lang;
    this.onWords = onWords || (() => {});
    this.onState = onState || (() => {});
    this.onError = onError || (() => {});
    this.wanted = false;
    this.rec = null;
    this.restarts = 0;
  }

  start() {
    if (!Recognition) {
      this.onError("unsupported");
      return;
    }
    this.wanted = true;
    this.restarts = 0;
    this._spawn();
  }

  stop() {
    this.wanted = false;
    if (this.rec) {
      try { this.rec.abort(); } catch {}
      this.rec = null;
    }
    this.onState("off");
  }

  _spawn() {
    const rec = new Recognition();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this.rec = rec;

    rec.onstart = () => this.onState("listening");
    rec.onresult = (e) => {
      this.restarts = 0;
      // Join the results that are still changing with the last final one, so
      // the matcher always sees the most recent few words in order.
      let text = "";
      const from = Math.max(0, e.resultIndex - 1);
      for (let i = from; i < e.results.length; i++) text += " " + e.results[i][0].transcript;
      this.onWords(text.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.wanted = false;
        this.onError("denied");
      } else {
        this.onError(e.error || "error");
      }
    };
    rec.onend = () => {
      // Safari and Chrome stop after silence or about a minute; keep listening.
      if (this.wanted && this.rec === rec && this.restarts < 50) {
        this.restarts++;
        this.onState("restarting");
        setTimeout(() => this.wanted && this.rec === rec && this._spawn(), 150);
      } else if (!this.wanted) {
        this.onState("off");
      }
    };
    try {
      rec.start();
    } catch (err) {
      this.onError(err.message || "error");
    }
  }
}

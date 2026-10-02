// Aligns recognised speech with the script. Pure logic, no browser APIs, so it
// can be reused with any speech engine (Web Speech today, a cloud recogniser later).

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// Scripts say "18", speech engines may hear "eighteen" (or the reverse).
// Map 0-99 to a single spoken form; larger numbers are compared as digits.
function numberWord(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : "");
}

export function normalizeWord(w) {
  let s = w.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .replace(/'/g, "");
  if (/^\d{1,2}$/.test(s)) s = numberWord(Number(s));
  return s;
}

export function tokenize(text) {
  return text.split(/[\s—–/-]+/).map(normalizeWord).filter(Boolean);
}

function editDistanceAtMost1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Speech engines often mishear endings ("walk" / "walked") or spell words differently.
export function similar(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    if (a.slice(0, 4) === b.slice(0, 4) && Math.abs(a.length - b.length) <= 3) return true;
    if (editDistanceAtMost1(a, b)) return true;
  }
  return false;
}

// Longest common subsequence length between heard words and a script slice,
// counting only alignments that end on the final heard word's match.
function lcs(heard, script, from, to) {
  const m = heard.length, n = to - from;
  if (n <= 0) return 0;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      cur[j] = similar(heard[i - 1], script[from + j - 1])
        ? prev[j - 1] + 1
        : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Tracks the reading position. `position` is the index of the last script
 * word the speaker has said (-1 before they start).
 */
export class ScriptMatcher {
  constructor(scriptWords, { tail = 8, ahead = 30, behind = 8 } = {}) {
    this.words = scriptWords;
    this.tail = tail;
    this.ahead = ahead;
    this.behind = behind;
    this.position = -1;
    this.misses = 0;
  }

  reset(position = -1) {
    this.position = position;
    this.misses = 0;
  }

  /** Feed the most recent recognised words. Returns the new position, or null if unchanged. */
  update(heardText) {
    const heard = tokenize(heardText).slice(-this.tail);
    if (!heard.length) return null;

    let best = this._search(heard, this.position - this.behind, this.position + this.ahead);
    // Lost for a while (skipped a section, jumped around): search the whole script,
    // but demand a longer, more certain match before jumping.
    if (!best && this.misses >= 3 && heard.length >= 5) {
      best = this._search(heard, 0, this.words.length - 1, Math.min(5, heard.length));
    }

    if (!best) {
      this.misses++;
      return null;
    }
    this.misses = 0;
    if (best.end === this.position) return null;
    this.position = best.end;
    return best.end;
  }

  _search(heard, lo, hi, minScore) {
    const words = this.words;
    lo = Math.max(0, lo);
    hi = Math.min(words.length - 1, hi);
    const last = heard[heard.length - 1];
    const need = minScore ?? (heard.length === 1 ? 1 : heard.length === 2 ? 2 : Math.min(3, heard.length));
    let best = null;

    for (let e = lo; e <= hi; e++) {
      // The alignment must end on the last (or second-last) heard word, so
      // the marker sits on what was just spoken, not something said earlier.
      const lastHit = similar(last, words[e]);
      const prevHit = !lastHit && heard.length > 1 && similar(heard[heard.length - 2], words[e]);
      if (!lastHit && !prevHit) continue;
      // A lone short word ("the", "a") is too ambiguous to move on unless it is next.
      if (heard.length === 1 && e !== this.position + 1) continue;

      const from = Math.max(0, e - heard.length - 3);
      const score = lcs(heard, words, from, e + 1) - (prevHit ? 0.5 : 0);
      if (score < need) continue;

      // Prefer strong matches close to (and just after) where we are.
      const dist = e - this.position;
      const penalty = dist >= 0 ? dist * 0.03 : -dist * 0.15;
      const value = score - penalty;
      if (!best || value > best.value) best = { end: e, value, score };
    }
    return best;
  }
}

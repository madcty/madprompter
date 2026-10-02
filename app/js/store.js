// Script storage boundary. The app always reads and writes the on-device
// copy first, so prompting works offline. When someone is signed in,
// sync() reconciles that copy with their account (newest edit wins), so a
// script imported on a laptop shows up on the tablet.

const KEY = "tp.scripts.v1";
const TOMBSTONES = "tp.deleted.v1";

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode or sandbox): keep in memory only.
  }
}

export class LocalScriptStore {
  constructor() {
    this._memory = null;
    this.onChange = () => {};
  }

  _read() {
    return readJSON(KEY, this._memory || []);
  }

  _write(list) {
    this._memory = list;
    writeJSON(KEY, list);
  }

  _changed() {
    this.onChange();
  }

  async list() {
    return this._read().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id) {
    return this._read().find((s) => s.id === id) || null;
  }

  async create({ title, body, sample = false }) {
    const now = Date.now();
    const script = { id: uid(), title: title || "Untitled script", body: body || "", createdAt: now, updatedAt: now };
    if (sample) script.sample = true;
    this._write([...this._read(), script]);
    this._changed();
    return script;
  }

  async update(id, patch) {
    const list = this._read();
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return null;
    const next = { ...list[i], ...patch, id, updatedAt: Date.now() };
    // Once the sample script is edited it becomes the person's own and syncs.
    if (next.sample && patch.body !== undefined && patch.body !== list[i].body) delete next.sample;
    list[i] = next;
    this._write(list);
    this._changed();
    return list[i];
  }

  async remove(id) {
    this._write(this._read().filter((s) => s.id !== id));
    const gone = readJSON(TOMBSTONES, []);
    if (!gone.includes(id)) writeJSON(TOMBSTONES, [...gone, id]);
    this._changed();
  }

  async exportAll() {
    return { app: "teleprompter", version: 1, exportedAt: new Date().toISOString(), scripts: this._read() };
  }

  async importAll(data) {
    const incoming = Array.isArray(data?.scripts) ? data.scripts : [];
    const list = this._read();
    const ids = new Set(list.map((s) => s.id));
    let added = 0;
    for (const s of incoming) {
      if (typeof s?.body !== "string") continue;
      list.push({ ...s, id: ids.has(s.id) || !s.id ? uid() : s.id, updatedAt: Date.now() });
      added++;
    }
    this._write(list);
    this._changed();
    return added;
  }

  // Forget this device's copy (used on sign-out so the next person on a
  // shared tablet doesn't see someone else's scripts).
  clear() {
    this._write([]);
    writeJSON(TOMBSTONES, []);
  }

  /**
   * Two-way sync with the signed-in account.
   * `remote` is a Supabase client; rows live in the `scripts` table.
   * Returns { pulled, pushed } counts.
   */
  async sync(remote) {
    const { data: rows, error } = await remote
      .from("scripts")
      .select("id,title,body,created_at,updated_at,deleted");
    if (error) throw error;

    const local = new Map(this._read().map((s) => [s.id, s]));
    const tombstones = new Set(readJSON(TOMBSTONES, []));
    const server = new Map(rows.map((r) => [r.id, r]));
    const upserts = [];
    let pulled = 0;

    // Server rows newer than ours (or new to this device) come down.
    for (const r of rows) {
      const mine = local.get(r.id);
      if (r.deleted) {
        if (mine && mine.updatedAt <= r.updated_at) { local.delete(r.id); pulled++; }
        continue;
      }
      if (tombstones.has(r.id)) continue; // deleted here; pushed below
      if (!mine || r.updated_at > mine.updatedAt) {
        local.set(r.id, { id: r.id, title: r.title, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at });
        pulled++;
      }
    }

    // Ours that are newer (or new to the server) go up.
    for (const s of local.values()) {
      if (s.sample) continue; // the built-in sample stays on each device
      const r = server.get(s.id);
      if (!r || s.updatedAt > r.updated_at) {
        upserts.push({ id: s.id, title: s.title, body: s.body, created_at: s.createdAt, updated_at: s.updatedAt, deleted: false });
      }
    }
    // Deletions made on this device.
    const now = Date.now();
    for (const id of tombstones) {
      const r = server.get(id);
      if (r && !r.deleted) upserts.push({ id, title: r.title, body: "", created_at: r.created_at, updated_at: now, deleted: true });
    }

    if (upserts.length) {
      const { error: upErr } = await remote.from("scripts").upsert(upserts);
      if (upErr) throw upErr;
    }
    this._write([...local.values()]);
    writeJSON(TOMBSTONES, []);
    return { pulled, pushed: upserts.length };
  }
}

export const store = new LocalScriptStore();

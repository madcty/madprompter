// Script storage boundary. Everything reads and writes scripts through a
// ScriptStore; today that is LocalScriptStore (this device only). Phase 2 adds
// an ApiScriptStore with the same async methods, backed by user accounts.

const KEY = "tp.scripts.v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class LocalScriptStore {
  _read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return this._memory || [];
    }
  }

  _write(list) {
    this._memory = list;
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // Storage unavailable (private mode or sandbox): keep in memory only.
    }
  }

  async list() {
    return this._read().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id) {
    return this._read().find((s) => s.id === id) || null;
  }

  async create({ title, body }) {
    const now = Date.now();
    const script = { id: uid(), title: title || "Untitled script", body: body || "", createdAt: now, updatedAt: now };
    this._write([...this._read(), script]);
    return script;
  }

  async update(id, patch) {
    const list = this._read();
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, id, updatedAt: Date.now() };
    this._write(list);
    return list[i];
  }

  async remove(id) {
    this._write(this._read().filter((s) => s.id !== id));
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
      const copy = { ...s, id: ids.has(s.id) || !s.id ? uid() : s.id };
      list.push(copy);
      added++;
    }
    this._write(list);
    return added;
  }
}

export const store = new LocalScriptStore();

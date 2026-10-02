// Sync logic against an in-memory stand-in for the Supabase table.
import assert from "node:assert";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
};
const { LocalScriptStore } = await import("../app/js/store.js");

function fakeRemote(table) {
  return {
    from: () => ({
      select: async () => ({ data: [...table.values()], error: null }),
      upsert: async (rows) => { rows.forEach((r) => table.set(r.id, { ...r })); return { error: null }; },
    }),
  };
}

const server = new Map();
const remote = fakeRemote(server);

// Device A creates two scripts and syncs.
mem.clear();
const a = new LocalScriptStore();
const s1 = await a.create({ title: "One", body: "first" });
await a.create({ title: "Sample", body: "x", sample: true });
await a.sync(remote);
assert.equal(server.size, 1, "sample script is not uploaded");
const deviceA = new Map(mem);

// Device B starts empty, pulls, edits.
mem.clear();
const b = new LocalScriptStore();
assert.deepEqual((await b.sync(remote)).pulled, 1);
await new Promise((r) => setTimeout(r, 5));
await b.update(s1.id, { title: "One v2" });
await b.sync(remote);
assert.equal(server.get(s1.id).title, "One v2");

// Device A pulls the newer edit; then deletes it; B sees the delete.
mem.clear(); deviceA.forEach((v, k) => mem.set(k, v));
await a.sync(remote);
assert.equal((await a.get(s1.id)).title, "One v2");
await a.remove(s1.id);
await a.sync(remote);
assert.equal(server.get(s1.id).deleted, true);

mem.clear();
const b2 = new LocalScriptStore();
await b2.sync(remote);
assert.equal(await b2.get(s1.id), null, "deleted script does not come back");
console.log("all sync tests passed");

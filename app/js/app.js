import { store } from "./store.js";
import { importFile, ACCEPT } from "./importers.js";
import { loadSettings, saveSettings } from "./settings.js";
import { shareLink, decodeScript } from "./share.js";
import { Prompter } from "./prompter.js";
import { plan, limit } from "./plans.js";
import { tokenize } from "./matcher.js";
import { accountsEnabled, client, currentUser, onAuthChange, sendEmailLink, signInWith, signOut } from "./auth.js";
import { AUTH_PROVIDERS } from "./config.js";

const $ = (sel, root = document) => root.querySelector(sel);
const views = { library: $("#library"), editor: $("#editor") };
const settings = loadSettings();
let current = null; // script open in the editor

// ---------- helpers ----------

function toast(msg, ms = 4000) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

function stats(body) {
  const words = tokenize(body).length;
  const minutes = words / 150; // typical speaking pace
  const time = minutes < 1 ? `${Math.max(1, Math.round(minutes * 60))} s` : `${Math.round(minutes * 10) / 10} min`;
  return { words, label: `${words.toLocaleString()} words · about ${time} spoken` };
}

function show(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  window.scrollTo(0, 0);
}

function download(filename, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function safeName(s) {
  return (s || "script").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
}

// In-page confirmation (native confirm() is blocked in some embedded views).
function confirmDelete(title) {
  const dlg = $("#confirm-dialog");
  $("#confirm-title").textContent = `Delete "${title}"?`;
  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
  });
}

async function canAddScript() {
  const max = limit("scripts");
  if ((await store.list()).length < max) return true;
  toast(`The ${plan().name} plan holds ${max} scripts. Upgrade for unlimited scripts.`);
  return false;
}

// ---------- library ----------

async function renderLibrary() {
  $("[data-plan]").textContent = plan().name;
  const list = await store.list();
  const box = $("#script-list");
  box.textContent = "";
  if (!list.length) {
    box.innerHTML = `<div class="empty"><p><strong>No scripts yet.</strong></p><p>Paste a script, or import a Word, RTF or text file from your computer.</p></div>`;
    return;
  }
  for (const s of list) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = s.id;
    const preview = s.body.slice(0, 180).replace(/\s+/g, " ");
    card.innerHTML = `
      <button class="card-main" data-action="open">
        <h3></h3>
        <p class="preview"></p>
        <p class="meta"></p>
      </button>
      <div class="card-actions">
        <button class="btn primary sm" data-action="prompt">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>Prompt</button>
        <button class="link" data-action="duplicate">Duplicate</button>
        <button class="link danger" data-action="delete">Delete</button>
      </div>`;
    $("h3", card).textContent = s.title;
    $(".preview", card).textContent = preview || "Empty script";
    $(".meta", card).textContent = `${stats(s.body).label} · edited ${new Date(s.updatedAt).toLocaleDateString()}`;
    box.append(card);
  }
}

$("#script-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  const card = e.target.closest(".card");
  if (!btn || !card) return;
  const s = await store.get(card.dataset.id);
  if (!s) return;
  const a = btn.dataset.action;
  if (a === "open") openEditor(s);
  else if (a === "prompt") startPrompter(s);
  else if (a === "duplicate") {
    if (!(await canAddScript())) return;
    await store.create({ title: s.title + " (copy)", body: s.body });
    renderLibrary();
  } else if (a === "delete") {
    if (await confirmDelete(s.title)) {
      await store.remove(s.id);
      renderLibrary();
    }
  }
});

$("#library").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-action]")?.dataset.action;
  if (a === "new") {
    if (!(await canAddScript())) return;
    const s = await store.create({ title: "Untitled script", body: "" });
    openEditor(s, true);
  } else if (a === "export-library") {
    const data = await store.exportAll();
    download(`teleprompter-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
  }
});

function firstLineTitle(body) {
  const line = body.split("\n").find((l) => l.trim()) || "Untitled script";
  return line.length > 60 ? line.slice(0, 57).trim() + "…" : line.trim();
}

async function importFiles(files) {
  let last = null;
  for (const f of files) {
    if (!(await canAddScript())) break;
    try {
      const { title, body } = await importFile(f);
      if (!body) { toast(`"${f.name}" has no text in it.`); continue; }
      last = await store.create({ title, body });
      toast(`Imported "${title}" (${stats(body).words.toLocaleString()} words).`);
    } catch (err) {
      toast(err.message || `Couldn't read "${f.name}".`, 7000);
    }
  }
  await renderLibrary();
  if (last && files.length === 1) openEditor(last);
}

const fileInput = $("#file-input");
fileInput.accept = ACCEPT;
fileInput.addEventListener("change", () => {
  importFiles([...fileInput.files]);
  fileInput.value = "";
});

$("#backup-input").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const n = await store.importAll(JSON.parse(await f.text()));
    toast(`Restored ${n} script${n === 1 ? "" : "s"}.`);
    renderLibrary();
  } catch {
    toast("That file isn't a teleprompter backup.");
  }
});

// Drag and drop from the desktop.
let dragDepth = 0;
const dropzone = $(".dropzone");
document.addEventListener("dragenter", (e) => {
  if (views.library.hidden || !e.dataTransfer?.types.includes("Files")) return;
  dragDepth++;
  dropzone.hidden = false;
});
document.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) { dragDepth = 0; dropzone.hidden = true; }
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropzone.hidden = true;
  if (!views.library.hidden && e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
});

// ---------- editor ----------

const titleInput = $("#title-input");
const bodyInput = $("#body-input");

function openEditor(s, focusBody = false) {
  current = s;
  titleInput.value = s.title;
  bodyInput.value = s.body;
  $("#stats").textContent = stats(s.body).label;
  show("editor");
  (focusBody || !s.body ? bodyInput : titleInput).focus({ preventScroll: true });
}

let saveTimer;
function scheduleSave() {
  $("#stats").textContent = stats(bodyInput.value).label;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
async function saveNow() {
  clearTimeout(saveTimer);
  if (!current) return;
  current = await store.update(current.id, { title: titleInput.value.trim() || "Untitled script", body: bodyInput.value });
}
titleInput.addEventListener("input", scheduleSave);
bodyInput.addEventListener("input", scheduleSave);
// Pasting into an empty script also names it from the first line.
bodyInput.addEventListener("paste", () => {
  setTimeout(() => {
    if (/^untitled script$/i.test(titleInput.value.trim()) && bodyInput.value.trim()) {
      titleInput.value = firstLineTitle(bodyInput.value);
      scheduleSave();
    }
  });
});

$("#editor").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-action]")?.dataset.action;
  if (!a) return;
  if (a === "back") {
    await saveNow();
    show("library");
    renderLibrary();
  } else if (a === "prompt") {
    await saveNow();
    if (!current.body.trim()) return toast("Add some script text first.");
    startPrompter(current);
  } else if (a === "delete") {
    if (await confirmDelete(current.title)) {
      await store.remove(current.id);
      current = null;
      show("library");
      renderLibrary();
    }
  } else if (a === "download") {
    await saveNow();
    download(safeName(current.title) + ".txt", current.body);
  } else if (a === "share") {
    await saveNow();
    openShare(current);
  }
});

// ---------- send to device ----------

async function openShare(s) {
  const url = await shareLink(s);
  const dlg = $("#share-dialog");
  $("#share-url").value = url;
  const native = $("[data-action=native-share]", dlg);
  native.hidden = !navigator.share;
  native.onclick = () => navigator.share({ title: s.title, text: `Teleprompter script: ${s.title}`, url }).catch(() => {});
  $("[data-action=copy-link]", dlg).onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      $("#share-url").select();
      toast("Select the link and copy it.");
    }
  };
  if (url.length > 60000) toast("This script is very long; the link may be too big for some apps. Use Download .txt instead.", 7000);
  dlg.showModal();
}

async function checkIncoming() {
  const m = location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const s = await decodeScript(m[1]);
    const dlg = $("#incoming-dialog");
    $("#incoming-summary").textContent = `"${s.title}" · ${stats(s.body).label}`;
    dlg.onclose = async () => {
      if (dlg.returnValue !== "add" || !(await canAddScript())) return;
      const created = await store.create(s);
      await renderLibrary();
      toast(`Added "${created.title}".`);
    };
    dlg.showModal();
  } catch {
    toast("That shared link is incomplete or damaged.");
  }
}

// ---------- accounts & sync ----------

let user = null;
let syncing = null;
let syncState = "idle"; // idle | pending | error

function renderAccount() {
  const btn = $("#account-btn");
  btn.hidden = !accountsEnabled();
  btn.textContent = user ? (user.email || "Account") : "Sign in to sync";
  btn.classList.toggle("primary", !user);
  const note = $("#storage-note");
  if (!user) {
    note.textContent = accountsEnabled() ? "Scripts are saved on this device. Sign in to use them on your other devices." : "Scripts are saved on this device.";
  } else {
    const label = { idle: "Synced to your account", pending: "Syncing…", error: "Not synced yet, will retry" }[syncState];
    note.innerHTML = `<span class="sync-dot ${syncState === "idle" ? "" : syncState}"></span>`;
    note.append(label);
  }
}

async function syncNow({ quiet = true } = {}) {
  if (!user) return;
  if (syncing) return syncing;
  syncState = "pending";
  renderAccount();
  syncing = (async () => {
    try {
      const sb = await client();
      if (!sb) throw new Error("offline");
      const { pulled } = await store.sync(sb);
      syncState = "idle";
      if (pulled && !views.library.hidden) await renderLibrary();
      if (!quiet) toast("Your scripts are up to date.");
    } catch (err) {
      syncState = "error";
      if (!quiet) toast(navigator.onLine ? `Sync failed: ${err.message || err}` : "You're offline. Changes will sync when you reconnect.");
    } finally {
      syncing = null;
      renderAccount();
    }
  })();
  return syncing;
}

let syncTimer;
store.onChange = () => {
  if (!user) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
};

async function initAccounts() {
  renderAccount();
  if (!accountsEnabled()) return;
  for (const b of document.querySelectorAll("[data-provider]")) b.hidden = !AUTH_PROVIDERS.includes(b.dataset.provider);
  $("[data-provider-block=email]").hidden = !AUTH_PROVIDERS.includes("email");

  user = await currentUser();
  renderAccount();
  if (user) syncNow();
  onAuthChange((u) => {
    const signedIn = !user && u;
    user = u;
    renderAccount();
    if (signedIn) {
      $("#signin-dialog").open && $("#signin-dialog").close();
      syncNow().then(() => toast("Signed in. Your scripts now sync across your devices."));
    }
  });
  window.addEventListener("online", () => syncNow());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
}

$("#account-btn").addEventListener("click", () => {
  if (user) {
    $("#account-summary").textContent = `Signed in as ${user.email || "your account"}. Scripts sync automatically between every device where you're signed in.`;
    $("#account-dialog").showModal();
  } else {
    $("#signin-dialog").showModal();
  }
});

$("#signin-dialog").addEventListener("click", async (e) => {
  const provider = e.target.closest("[data-provider]")?.dataset.provider;
  const action = e.target.closest("[data-action]")?.dataset.action;
  try {
    if (provider) {
      await signInWith(provider); // leaves the page and comes back signed in
    } else if (action === "email-link") {
      const email = $("#signin-email").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter your email address.");
      await sendEmailLink(email);
      $("#signin-dialog").close();
      toast(`Check ${email} for a sign-in link. Open it on this device.`, 8000);
    }
  } catch (err) {
    toast(err.message || "Sign-in didn't work. Try again.");
  }
});

$("#account-dialog").addEventListener("click", async (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "sync-now") {
    await syncNow({ quiet: false });
  } else if (action === "sign-out") {
    await syncNow();
    if (syncState === "error") {
      toast("Some changes haven't synced yet. Reconnect to the internet before signing out.", 7000);
      return;
    }
    await signOut();
    user = null;
    store.clear();
    $("#account-dialog").close();
    await renderLibrary();
    renderAccount();
    toast("Signed out. Scripts were removed from this device and are safe in your account.");
  }
});

// ---------- prompter ----------

const prompter = new Prompter($("#prompter"), {
  settings,
  onSettingsChange: saveSettings,
  onExit: () => {
    prompter.close();
    renderLibrary();
  },
  toast,
});

function startPrompter(s) {
  prompter.open(s);
}

// ---------- boot ----------

const SAMPLE = `Hi, and thanks for trying the teleprompter.

This is a sample script so you can test voice follow. Press Prompt, then Play, and start reading out loud. The line you are reading stays on the red arrows, close to the camera, so your eyes never drift far from the lens.

If you stop to make a comment, the text waits for you. When you come back to the script, it picks up where you are. [PAUSE]

You can also skip ahead a sentence or two and it will catch up.

When you are ready, import your own script from Word, TextEdit or a text file, or paste it in. Delete this sample whenever you like.`;

async function seedSample() {
  let seeded = false;
  try { seeded = localStorage.getItem("tp.seeded") === "1"; } catch {}
  if (seeded || (await store.list()).length) return;
  await store.create({ title: "Sample: try voice follow", body: SAMPLE, sample: true });
  try { localStorage.setItem("tp.seeded", "1"); } catch {}
}

await seedSample();
renderLibrary();
initAccounts();
checkIncoming();
window.addEventListener("hashchange", checkIncoming);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

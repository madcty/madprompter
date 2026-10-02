// "Send to device": pack a script into a link (compressed, no server needed)
// so a script written on a laptop can be opened on a tablet.

function toBase64Url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeScript({ title, body }) {
  const json = new TextEncoder().encode(JSON.stringify({ t: title, b: body }));
  if (typeof CompressionStream === "undefined") return "j" + toBase64Url(json);
  return "z" + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeScript(code) {
  const kind = code[0];
  let bytes = fromBase64Url(code.slice(1));
  if (kind === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  const { t, b } = JSON.parse(new TextDecoder().decode(bytes));
  return { title: String(t || "Shared script"), body: String(b || "") };
}

export async function shareLink(script) {
  const base = location.href.replace(/#.*$/, "");
  return `${base}#s=${await encodeScript(script)}`;
}

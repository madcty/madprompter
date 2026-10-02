// Turn an uploaded file into plain script text. No third-party libraries:
// .docx/.odt are unzipped with the browser's DecompressionStream.

export const ACCEPT = ".txt,.text,.md,.markdown,.rtf,.docx,.odt,.html,.htm,.fountain,text/plain,text/rtf,application/rtf";

export async function importFile(file) {
  const name = file.name || "Imported script";
  const ext = (name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  const title = name.replace(/\.[^.]+$/, "");
  const buf = new Uint8Array(await file.arrayBuffer());

  let body;
  if (ext === "pages" || ext === "key" || ext === "numbers") {
    throw new Error("Apple Pages files can't be read in a browser. In Pages choose File > Export To > Word (or Plain Text), then import that file.");
  } else if (ext === "docx" || looksLikeZip(buf) && ext !== "odt") {
    body = await docxToText(buf);
  } else if (ext === "odt") {
    body = await odtToText(buf);
  } else if (ext === "rtf" || startsWith(buf, "{\\rtf")) {
    body = rtfToText(decodeText(buf, "windows-1252"));
  } else if (ext === "html" || ext === "htm") {
    body = htmlToText(decodeText(buf));
  } else {
    body = decodeText(buf);
  }
  return { title, body: cleanText(body) };
}

export function cleanText(text) {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeText(buf, fallback = "windows-1252") {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Older Mac/Windows files that are not UTF-8.
    return new TextDecoder(fallback).decode(buf);
  }
}

function startsWith(buf, s) {
  for (let i = 0; i < s.length; i++) if (buf[i] !== s.charCodeAt(i)) return false;
  return true;
}

function looksLikeZip(buf) {
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

// ---------- ZIP ----------

async function unzipEntry(buf, wanted) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Find End Of Central Directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This file looks damaged (not a valid Word document).");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return dec.decode(data);
      if (method === 8) return dec.decode(await inflateRaw(data));
      throw new Error("Unsupported compression in this document.");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can't open Word files. Update it, or paste the text instead.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------- DOCX / ODT ----------

export async function docxToText(buf) {
  const xml = await unzipEntry(buf, "word/document.xml");
  if (!xml) throw new Error("No document text found. If this is a Pages file, export it as Word first.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paras = [];
  for (const p of doc.getElementsByTagNameNS(W, "p")) {
    let line = "";
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.namespaceURI === W) {
          if (c.localName === "t") line += c.textContent;
          else if (c.localName === "tab") line += "\t";
          else if (c.localName === "br" || c.localName === "cr") line += "\n";
          else if (c.localName === "delText" || c.localName === "instrText") continue;
          else if (c.localName === "p") continue; // nested paragraphs handled on their own
          else walk(c);
        } else if (c.nodeType === 1) {
          walk(c);
        }
      }
    };
    walk(p);
    paras.push(line);
  }
  return paras.join("\n");
}

async function odtToText(buf) {
  const xml = await unzipEntry(buf, "content.xml");
  if (!xml) throw new Error("No document text found.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const T = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
  const out = [];
  for (const el of doc.getElementsByTagNameNS(T, "*")) {
    if (el.localName === "p" || el.localName === "h") out.push(el.textContent);
  }
  return out.join("\n");
}

// ---------- RTF (TextEdit's default format) ----------

const SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr",
  "footerl", "footerr", "expandedcolortbl", "listtable", "listoverridetable", "generator",
  "themedata", "colorschememapping", "latentstyles", "datastore", "xmlnstbl", "rsidtbl", "fldinst",
]);

export function rtfToText(rtf) {
  let out = "";
  let i = 0;
  const stack = [];
  let state = { skip: false, uc: 1 };
  let pendingSkip = 0;
  const win1252 = new TextDecoder("windows-1252");

  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === "{") {
      stack.push(state);
      state = { ...state };
      i++;
    } else if (ch === "}") {
      state = stack.pop() || state;
      i++;
    } else if (ch === "\\") {
      const next = rtf[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        if (!state.skip) out += next;
        i += 2;
      } else if (next === "'") {
        const hex = rtf.substr(i + 2, 2);
        if (pendingSkip > 0) pendingSkip--;
        else if (!state.skip) out += win1252.decode(new Uint8Array([parseInt(hex, 16)]));
        i += 4;
      } else if (next === "*") {
        state.skip = true;
        i += 2;
      } else if (next === "\n" || next === "\r") {
        if (!state.skip) out += "\n";
        i += 2;
      } else if (next === "~") {
        if (!state.skip) out += " ";
        i += 2;
      } else if (next === "-" || next === "_") {
        if (!state.skip && next === "_") out += "-";
        i += 2;
      } else {
        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
        if (!m) { i++; continue; }
        const word = m[1];
        const arg = m[2] !== undefined ? parseInt(m[2], 10) : null;
        i += m[0].length;
        if (SKIP_DESTINATIONS.has(word)) state.skip = true;
        else if (state.skip) continue;
        else if (word === "par" || word === "line" || word === "sect" || word === "page") out += "\n";
        else if (word === "tab") out += "\t";
        else if (word === "emdash") out += "—";
        else if (word === "endash") out += "–";
        else if (word === "lquote") out += "‘";
        else if (word === "rquote") out += "’";
        else if (word === "ldblquote") out += "“";
        else if (word === "rdblquote") out += "”";
        else if (word === "bullet") out += "•";
        else if (word === "uc") state.uc = arg ?? 1;
        else if (word === "u" && arg !== null) {
          out += String.fromCharCode(arg < 0 ? arg + 65536 : arg);
          pendingSkip = state.uc;
        }
      }
    } else if (ch === "\n" || ch === "\r") {
      i++;
    } else {
      if (pendingSkip > 0) pendingSkip--;
      else if (!state.skip) out += ch;
      i++;
    }
  }
  return out;
}

// ---------- HTML ----------

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li,tr").forEach((n) => n.append("\n"));
  return doc.body?.textContent || "";
}

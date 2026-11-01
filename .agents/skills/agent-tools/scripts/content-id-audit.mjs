#!/usr/bin/env deno run --allow-read

const DEFAULT_SCOPE = "src,tests";

export function parseArgs(argv) {
  const opts = { id: "", scope: DEFAULT_SCOPE, limit: 160 };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if ((arg === "--id" || arg === "-i") && argv[i + 1]) {
      opts.id = String(argv[++i]);
    } else if (arg === "--scope" && argv[i + 1]) opts.scope = String(argv[++i]);
    else if (arg === "--limit" && argv[i + 1]) {
      opts.limit = Math.max(1, Number(argv[++i]) | 0);
    } else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (!opts.id) opts.id = arg;
  }
  return opts;
}

export function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/content-id-audit.mjs ID

Shows where a monster/item/spell/material id is defined, referenced, tested, rendered, or emitted.`;
}

export async function collectFiles(root, out = []) {
  const st = await Deno.stat(root);
  if (st.isFile) {
    if (/\.(js|mjs|json|md)$/.test(root)) out.push(root);
    return out;
  }
  for await (const entry of Deno.readDir(root)) {
    const path = `${root.replace(/\/$/, "")}/${entry.name}`;
    if (path.includes("/.git/") || path.includes("/src/lib/")) continue;
    if (entry.isDirectory) await collectFiles(path, out);
    else if (entry.isFile && /\.(js|mjs|json|md)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

export function classify(file, line, id) {
  const isVisualFile = file.includes("/display/") || file.includes("/palette/");
  if (/define(Item|Monster|Spell)\s*\(/.test(line)) return "definition";
  if (!isVisualFile && new RegExp(`\\b${id}\\s*:`).test(line)) {
    return "definition";
  }
  if (file.includes("/palette/") || /glyph|fg|bg|color|sprite/i.test(line)) {
    return "visual";
  }
  if (
    /loot|drop|table|spawn|pickMonster|materialize/i.test(file + " " + line)
  ) return "spawn-loot";
  if (file.startsWith("tests/")) return "test";
  if (/\bworld\.(on|emit)\b|\bctx\.io\.emit\b/.test(line)) return "event";
  return "reference";
}

export async function main() {
  const opts = parseArgs(Deno.args);
  if (opts.help || !opts.id) {
    console.log(usage());
    return;
  }
  const roots = opts.scope.split(",").map((s) => s.trim()).filter(Boolean);
  let files = [];
  for (const root of roots) files = files.concat(await collectFiles(root));
  files = [...new Set(files)].sort();

  const needle = opts.id.toLowerCase();
  const rows = [];
  for (const file of files) {
    const text = await Deno.readTextFile(file).catch(() => "");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(needle)) continue;
      rows.push({
        kind: classify(file, lines[i], opts.id),
        file,
        line: i + 1,
        text: lines[i].trim(),
      });
      if (rows.length >= opts.limit) break;
    }
    if (rows.length >= opts.limit) break;
  }

  const counts = new Map();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) || 0) + 1);
  console.log(`content id: ${opts.id}`);
  console.log(
    `matches: ${rows.length}${
      rows.length >= opts.limit ? ` (limited to ${opts.limit})` : ""
    }`,
  );
  console.log(
    [...counts.entries()].sort().map(([k, v]) => `${k}=${v}`).join(" "),
  );
  console.log("");
  for (const row of rows) {
    console.log(`${row.kind.padEnd(10)} ${row.file}:${row.line}  ${row.text}`);
  }
}

if (import.meta.main) await main();

#!/usr/bin/env deno run --allow-read

export function parseArgs(argv) {
  const opts = { term: "", scope: "src,tests", limit: 120 };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if ((arg === "--scope" || arg === "-s") && argv[i + 1]) {
      opts.scope = String(argv[++i]);
    } else if (arg === "--limit" && argv[i + 1]) {
      opts.limit = Math.max(1, Number(argv[++i]) | 0);
    } else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (!opts.term) opts.term = arg;
  }
  return opts;
}

export function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/agent-target.mjs TERM [--scope src,tests] [--limit 120]

Searches files, event names, imports, function names, and ordinary text for TERM.`;
}

export async function collectFiles(root, out = []) {
  const st = await Deno.stat(root);
  if (st.isFile) {
    if (/\.(js|mjs|md|json|html)$/.test(root)) out.push(root);
    return out;
  }
  for await (const entry of Deno.readDir(root)) {
    const path = `${root.replace(/\/$/, "")}/${entry.name}`;
    if (path.includes("/.git/") || path.includes("/src/lib/")) continue;
    if (entry.isDirectory) await collectFiles(path, out);
    else if (entry.isFile && /\.(js|mjs|md|json|html)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

export function classify(line, term) {
  if (
    line.includes(`"${term}"`) || line.includes(`'${term}'`) ||
    line.includes(`\`${term}\``)
  ) {
    if (/\b(world|ctx(?:\.io)?)\s*\.\s*(on|emit)/.test(line)) return "event";
  }
  if (/\bimport\b/.test(line)) return "import";
  if (
    /\b(function|class)\s+|\bexport\s+(function|class|const)\s+|=>/.test(line)
  ) return "symbol";
  return "text";
}

export function scoreMatch(row, term) {
  const text = row.text || row.file;
  const quoted = text.includes(`"${term}"`) || text.includes(`'${term}'`) ||
    text.includes(`\`${term}\``);
  const word = new RegExp(
    `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  ).test(text);
  const kindScore =
    { event: 0, symbol: 1, file: 2, import: 3, text: 4 }[row.kind] ?? 5;
  return (quoted ? 0 : word ? 10 : 20) + kindScore;
}

export async function main() {
  const opts = parseArgs(Deno.args);
  if (opts.help || !opts.term) {
    console.log(usage());
    return;
  }
  const roots = opts.scope.split(",").map((s) => s.trim()).filter(Boolean);
  let files = [];
  for (const root of roots) files = files.concat(await collectFiles(root));
  files = [...new Set(files)].sort();

  const termLower = opts.term.toLowerCase();
  const rows = [];
  for (const file of files) {
    if (file.toLowerCase().includes(termLower)) {
      rows.push({ kind: "file", file, line: 0, text: "" });
    }
    const text = await Deno.readTextFile(file).catch(() => "");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(termLower)) continue;
      rows.push({
        kind: classify(lines[i], opts.term),
        file,
        line: i + 1,
        text: lines[i].trim(),
      });
    }
  }
  rows.sort((a, b) =>
    scoreMatch(a, opts.term) - scoreMatch(b, opts.term) ||
    a.file.localeCompare(b.file) || a.line - b.line
  );
  const limitedRows = rows.slice(0, opts.limit);

  const counts = new Map();
  for (const row of limitedRows) {
    counts.set(row.kind, (counts.get(row.kind) || 0) + 1);
  }
  console.log(`target: ${opts.term}`);
  console.log(
    `matches: ${rows.length}${
      rows.length > opts.limit ? ` (showing ${opts.limit})` : ""
    }`,
  );
  console.log(
    [...counts.entries()].sort().map(([k, v]) => `${k}=${v}`).join(" "),
  );
  console.log("");
  for (const row of limitedRows) {
    const loc = row.line ? `${row.file}:${row.line}` : row.file;
    console.log(
      `${row.kind.padEnd(7)} ${loc}${row.text ? `  ${row.text}` : ""}`,
    );
  }
}

if (import.meta.main) await main();

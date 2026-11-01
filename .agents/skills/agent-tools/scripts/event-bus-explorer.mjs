#!/usr/bin/env deno run --allow-read --allow-write

const DEFAULT_SCOPE = "src";
const DEFAULT_EXCLUDES = [
  "/.git/",
  "/src/lib/",
  "/node_modules/",
];

export function parseArgs(argv) {
  const opts = {
    scope: DEFAULT_SCOPE,
    format: "summary",
    out: "",
    event: "",
    top: 40,
    includeLib: false,
    includeTests: false,
    producerOnly: false,
    consumerOnly: false,
    orphans: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--scope" && argv[i + 1]) opts.scope = String(argv[++i]);
    else if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--out" && argv[i + 1]) opts.out = String(argv[++i]);
    else if (arg === "--event" && argv[i + 1]) opts.event = String(argv[++i]);
    else if (arg === "--top" && argv[i + 1]) {
      opts.top = Math.max(1, Number(argv[++i]) | 0);
    } else if (arg === "--include-lib") opts.includeLib = true;
    else if (arg === "--include-tests") opts.includeTests = true;
    else if (arg === "--producer-only") opts.producerOnly = true;
    else if (arg === "--consumer-only") opts.consumerOnly = true;
    else if (arg === "--orphans") opts.orphans = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }

  return opts;
}

export function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/event-bus-explorer.mjs [options]

Options:
  --format summary|csv|mermaid   Output format. Default: summary
  --scope PATH                   Directory or file to scan. Default: src
  --event NAME                   Restrict output to one event name
  --top N                        Summary/Mermaid event limit. Default: 40
  --out PATH                     Write output to a file instead of stdout
  --include-lib                  Include src/lib matches
  --include-tests                Use tests as the default scope when --scope is omitted
  --producer-only                Restrict to literal producers with no literal consumers
  --consumer-only                Restrict to literal consumers with no literal producers
  --orphans                      Restrict to producer-only and consumer-only events

Examples:
  deno run --allow-read .agents/skills/agent-tools/scripts/event-bus-explorer.mjs --format summary
  deno run --allow-read .agents/skills/agent-tools/scripts/event-bus-explorer.mjs --format csv --out /tmp/events.csv
  deno run --allow-read .agents/skills/agent-tools/scripts/event-bus-explorer.mjs --format mermaid --event damaged
  deno run --allow-read .agents/skills/agent-tools/scripts/event-bus-explorer.mjs --producer-only --format csv
`;
}

export function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function shouldSkip(path, opts) {
  const p = `/${normalizePath(path)}`;
  if (!opts.includeLib && p.includes("/src/lib/")) return true;
  return DEFAULT_EXCLUDES.some((part) => {
    if (part === "/src/lib/" && opts.includeLib) return false;
    return p.includes(part);
  });
}

export async function collectFiles(root, opts, out = []) {
  const info = await Deno.stat(root);
  if (info.isFile) {
    if (/\.(mjs|js)$/.test(root) && !shouldSkip(root, opts)) {
      out.push(normalizePath(root));
    }
    return out;
  }

  for await (const entry of Deno.readDir(root)) {
    const path = `${root.replace(/\/$/, "")}/${entry.name}`;
    if (shouldSkip(path, opts)) continue;
    if (entry.isDirectory) await collectFiles(path, opts, out);
    else if (entry.isFile && /\.(mjs|js)$/.test(entry.name)) {
      out.push(normalizePath(path));
    }
  }
  return out;
}

export function layerFor(file) {
  if (file.startsWith("src/rules/")) return "rules";
  if (file.startsWith("src/display/")) return "display";
  if (file.startsWith("src/bridge/")) return "bridge";
  if (file.startsWith("src/main/") || file === "src/main.js") return "main";
  if (file.startsWith("src/content/")) return "content";
  if (file.startsWith("tests/")) return "tests";
  return "other";
}

export function extractKeys(text) {
  const src = String(text || "").trim();
  const destructured = src.match(/^\(?\s*\{([^}]*)\}/);
  if (destructured) {
    return destructured[1]
      .split(",")
      .map((part) => part.trim().replace(/\s*=.*$/, "").replace(/\s*:.*$/, ""))
      .filter(Boolean)
      .join("|");
  }

  const objectLiteral = src.match(/^\{([^}]*)\}/);
  if (objectLiteral) {
    return objectLiteral[1]
      .split(",")
      .map((part) => part.trim().match(/^([A-Za-z_$][\w$]*)\s*:/)?.[1] || "")
      .filter(Boolean)
      .join("|");
  }

  return "";
}

export function scanText(file, text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  const literalCall =
    /\b(world|ctx\.io|ctx)\s*\.\s*(on|emit)\s*(?:\?\.)?\s*\(\s*(['"`])([^'"`]+)\3\s*,?\s*([^)]*)?/g;
  const dynamicCall =
    /\b(world|ctx\.io|ctx)\s*\.\s*(on|emit)\s*(?:\?\.)?\s*\(\s*([^'"`\s][^,\)]*)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    literalCall.lastIndex = 0;
    let match;
    while ((match = literalCall.exec(line))) {
      const api = `${match[1]}.${match[2]}`;
      const event = match[4];
      const kind = match[2] === "on" ? "consumer" : "producer";
      const tail = match[5] || "";
      rows.push({
        event,
        kind,
        api,
        file,
        line: i + 1,
        layer: layerFor(file),
        payloadKeys: extractKeys(tail),
        dynamic: false,
      });
    }

    dynamicCall.lastIndex = 0;
    while ((match = dynamicCall.exec(line))) {
      const firstArg = String(match[3] || "").trim();
      if (!firstArg || /^['"`]/.test(firstArg)) continue;
      rows.push({
        event: `(dynamic:${firstArg})`,
        kind: match[2] === "on" ? "consumer" : "producer",
        api: `${match[1]}.${match[2]}`,
        file,
        line: i + 1,
        layer: layerFor(file),
        payloadKeys: "",
        dynamic: true,
      });
    }
  }

  return rows;
}

export function csvEscape(value) {
  const s = String(value ?? "");
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replaceAll('"', '""')}"`;
}

export function toCsv(rows) {
  const header = [
    "event",
    "kind",
    "api",
    "layer",
    "file",
    "line",
    "payload_keys",
    "dynamic",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.event,
        row.kind,
        row.api,
        row.layer,
        row.file,
        row.line,
        row.payloadKeys,
        row.dynamic ? "yes" : "no",
      ].map(csvEscape).join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function eventStats(rows) {
  const stats = new Map();
  for (const row of rows) {
    let rec = stats.get(row.event);
    if (!rec) {
      rec = {
        event: row.event,
        producers: 0,
        consumers: 0,
        files: new Set(),
        producerFiles: new Set(),
        consumerFiles: new Set(),
      };
      stats.set(row.event, rec);
    }
    rec.files.add(row.file);
    if (row.kind === "producer") {
      rec.producers += 1;
      rec.producerFiles.add(row.file);
    } else {
      rec.consumers += 1;
      rec.consumerFiles.add(row.file);
    }
  }
  return [...stats.values()].sort((a, b) => {
    const ac = a.producers + a.consumers;
    const bc = b.producers + b.consumers;
    return bc - ac || a.event.localeCompare(b.event);
  });
}

export function toSummary(rows, opts) {
  const stats = eventStats(rows);
  const dynamic = rows.filter((row) => row.dynamic).length;
  const producers = rows.filter((row) => row.kind === "producer").length;
  const consumers = rows.filter((row) => row.kind === "consumer").length;
  const zeroProducer = stats.filter((rec) =>
    rec.producers === 0 && !rec.event.startsWith("(dynamic:")
  );
  const zeroConsumer = stats.filter((rec) =>
    rec.consumers === 0 && !rec.event.startsWith("(dynamic:")
  );

  const lines = [];
  lines.push(`event bus static scan`);
  lines.push(`scope: ${opts.scope}`);
  lines.push(
    `call sites: ${rows.length} (${producers} producers, ${consumers} consumers, ${dynamic} dynamic)`,
  );
  lines.push(`unique events: ${stats.length}`);
  lines.push(
    `events with consumers but no literal producers: ${zeroProducer.length}`,
  );
  lines.push(
    `events with producers but no literal consumers: ${zeroConsumer.length}`,
  );
  lines.push("");
  lines.push(
    `top ${Math.min(opts.top, stats.length)} events by call-site count:`,
  );
  for (const rec of stats.slice(0, opts.top)) {
    lines.push(
      `${
        String(rec.producers + rec.consumers).padStart(4)
      }  ${rec.event}  producers=${rec.producers} consumers=${rec.consumers} files=${rec.files.size}`,
    );
  }
  lines.push("");
  lines.push("largest consumer-only event names:");
  for (const rec of zeroProducer.slice(0, 20)) {
    lines.push(
      `  ${rec.event} consumers=${rec.consumers} files=${rec.consumerFiles.size}`,
    );
  }
  lines.push("");
  lines.push("largest producer-only event names:");
  for (const rec of zeroConsumer.slice(0, 20)) {
    lines.push(
      `  ${rec.event} producers=${rec.producers} files=${rec.producerFiles.size}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function nodeId(prefix, value) {
  let id = `${prefix}_${value.replace(/[^A-Za-z0-9_]/g, "_")}`;
  if (/^\d/.test(id)) id = `n_${id}`;
  return id.slice(0, 120);
}

export function mermaidLabel(value) {
  return String(value).replaceAll('"', '\\"');
}

export function toMermaid(rows, opts) {
  const stats = eventStats(rows);
  const selectedEvents = new Set(
    opts.event
      ? [opts.event]
      : stats.slice(0, opts.top).map((rec) => rec.event),
  );
  const selected = rows.filter((row) => selectedEvents.has(row.event));
  const lines = ["flowchart LR"];
  const files = new Set();
  const events = new Set();
  const edges = new Set();

  for (const row of selected) {
    files.add(row.file);
    events.add(row.event);
    const f = nodeId("file", row.file);
    const e = nodeId("event", row.event);
    if (row.kind === "producer") edges.add(`${f} --> ${e}`);
    else edges.add(`${e} --> ${f}`);
  }

  for (const event of [...events].sort()) {
    lines.push(`  ${nodeId("event", event)}(["${mermaidLabel(event)}"])`);
  }
  for (const file of [...files].sort()) {
    lines.push(`  ${nodeId("file", file)}["${mermaidLabel(file)}"]`);
  }
  for (const edge of [...edges].sort()) {
    lines.push(`  ${edge}`);
  }
  return `${lines.join("\n")}\n`;
}

export function filterRows(rows, opts) {
  if (!opts.producerOnly && !opts.consumerOnly && !opts.orphans) return rows;
  const stats = eventStats(rows);
  const keep = new Set();
  for (const rec of stats) {
    if (rec.event.startsWith("(dynamic:")) continue;
    const isProducerOnly = rec.producers > 0 && rec.consumers === 0;
    const isConsumerOnly = rec.consumers > 0 && rec.producers === 0;
    if (opts.producerOnly && isProducerOnly) keep.add(rec.event);
    if (opts.consumerOnly && isConsumerOnly) keep.add(rec.event);
    if (opts.orphans && (isProducerOnly || isConsumerOnly)) keep.add(rec.event);
  }
  return rows.filter((row) => keep.has(row.event));
}

export async function main() {
  const opts = parseArgs(Deno.args);
  if (opts.help) {
    console.log(usage());
    return;
  }
  if (opts.includeTests && opts.scope === DEFAULT_SCOPE) opts.scope = "tests";

  const files = (await collectFiles(opts.scope, opts)).sort();
  let rows = [];
  for (const file of files) {
    const text = await Deno.readTextFile(file);
    rows = rows.concat(scanText(file, text));
  }
  if (opts.event) rows = rows.filter((row) => row.event === opts.event);
  rows = filterRows(rows, opts);

  let output;
  if (opts.format === "csv") output = toCsv(rows);
  else if (opts.format === "mermaid") output = toMermaid(rows, opts);
  else if (opts.format === "summary") output = toSummary(rows, opts);
  else throw new Error(`Unknown --format ${opts.format}`);

  if (opts.out) await Deno.writeTextFile(opts.out, output);
  else console.log(output.trimEnd());
}

if (import.meta.main) await main();

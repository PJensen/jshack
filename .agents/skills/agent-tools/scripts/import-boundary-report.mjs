#!/usr/bin/env deno run --allow-read

const DEFAULT_SCOPE = "src";

export function parseArgs(argv) {
  const opts = { scope: DEFAULT_SCOPE, format: "summary" };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--scope" && argv[i + 1]) opts.scope = String(argv[++i]);
    else if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

export function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/import-boundary-report.mjs [--format summary|csv]

Reports layer import violations and suspicious cross-layer imports.`;
}

export async function collectFiles(root, out = []) {
  const st = await Deno.stat(root);
  if (st.isFile) {
    if (root.endsWith(".js") || root.endsWith(".mjs")) out.push(root);
    return out;
  }
  for await (const entry of Deno.readDir(root)) {
    const path = `${root.replace(/\/$/, "")}/${entry.name}`;
    if (path.includes("/src/lib/")) continue;
    if (entry.isDirectory) await collectFiles(path, out);
    else if (entry.isFile && /\.(mjs|js)$/.test(entry.name)) out.push(path);
  }
  return out;
}

export function layerOf(path) {
  if (path.startsWith("src/rules/")) return "rules";
  if (path.startsWith("src/display/")) return "display";
  if (path.startsWith("src/bridge/")) return "bridge";
  if (path.startsWith("src/main/") || path === "src/main.js") return "main";
  if (path.startsWith("src/shared/")) return "shared";
  if (path.startsWith("src/content/")) return "content";
  return "other";
}

export function normalizeImport(fromFile, spec) {
  if (!spec.startsWith(".")) return spec;
  const base = fromFile.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

export function classify(fromLayer, target) {
  const targetLayer = layerOf(target);
  if (
    fromLayer === "rules" &&
    (targetLayer === "display" || targetLayer === "bridge")
  ) return "violation";
  if (fromLayer === "display" && targetLayer === "rules") return "violation";
  if (
    fromLayer === "shared" && targetLayer !== "shared" &&
    targetLayer !== "other"
  ) return "violation";
  if (fromLayer === "bridge" && targetLayer === "display") return "violation";
  if (
    fromLayer === "main" &&
    (targetLayer === "rules" || targetLayer === "display")
  ) return "main-cross-layer";
  return "";
}

export async function scanFile(file) {
  const rows = [];
  const text = await Deno.readTextFile(file);
  const fromLayer = layerOf(file);
  const lines = text.split(/\r?\n/);
  const re = /\bimport(?:\s+[^"'()]+?\s+from\s+|\s*\(\s*)(["'])([^"']+)\1/g;
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(lines[i]))) {
      const spec = match[2];
      const target = normalizeImport(file, spec);
      const issue = classify(fromLayer, target);
      if (!issue) continue;
      rows.push({
        issue,
        file,
        line: i + 1,
        fromLayer,
        spec,
        target,
        targetLayer: layerOf(target),
      });
    }
  }
  return rows;
}

export function csv(rows) {
  return [
    "issue,file,line,from_layer,target_layer,spec,target",
    ...rows.map((r) =>
      [r.issue, r.file, r.line, r.fromLayer, r.targetLayer, r.spec, r.target]
        .join(",")
    ),
  ].join("\n") + "\n";
}

export function summary(rows) {
  const violations = rows.filter((r) => r.issue === "violation");
  const mainCross = rows.filter((r) => r.issue === "main-cross-layer");
  const lines = [];
  lines.push(`import boundary report`);
  lines.push(`violations: ${violations.length}`);
  lines.push(`main cross-layer imports: ${mainCross.length}`);
  if (violations.length) {
    lines.push("");
    lines.push("violations:");
    for (const r of violations) {
      lines.push(
        `  ${r.file}:${r.line} ${r.fromLayer} -> ${r.targetLayer} (${r.spec})`,
      );
    }
  }
  if (mainCross.length) {
    lines.push("");
    lines.push("main cross-layer imports:");
    for (const r of mainCross.slice(0, 80)) {
      lines.push(`  ${r.file}:${r.line} main -> ${r.targetLayer} (${r.spec})`);
    }
    if (mainCross.length > 80) {
      lines.push(`  ... ${mainCross.length - 80} more`);
    }
  }
  return lines.join("\n") + "\n";
}

export async function main() {
  const opts = parseArgs(Deno.args);
  if (opts.help) {
    console.log(usage());
    return;
  }
  const files = await collectFiles(opts.scope);
  let rows = [];
  for (const file of files) rows = rows.concat(await scanFile(file));
  console.log((opts.format === "csv" ? csv(rows) : summary(rows)).trimEnd());
}

if (import.meta.main) await main();

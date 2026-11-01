#!/usr/bin/env deno run --allow-read

export async function collectFiles(root, out = []) {
  const st = await Deno.stat(root);
  if (st.isFile) {
    if (/\.(js|mjs|md)$/.test(root)) out.push(root);
    return out;
  }
  for await (const entry of Deno.readDir(root)) {
    const path = `${root.replace(/\/$/, "")}/${entry.name}`;
    if (path.includes("/.git/") || path.includes("/src/lib/")) continue;
    if (entry.isDirectory) await collectFiles(path, out);
    else if (entry.isFile && /\.(js|mjs|md)$/.test(entry.name)) out.push(path);
  }
  return out;
}

export async function grep(files, re) {
  const rows = [];
  for (const file of files) {
    const text = await Deno.readTextFile(file).catch(() => "");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
        re.lastIndex = 0;
        continue;
      }
      if (re.test(lines[i])) rows.push({ file, line: i + 1, text: trimmed });
      re.lastIndex = 0;
    }
  }
  return rows;
}

export function layerOf(path) {
  if (path.startsWith("src/rules/")) return "rules";
  if (path.startsWith("src/display/")) return "display";
  if (path.startsWith("src/bridge/")) return "bridge";
  if (path.startsWith("src/shared/")) return "shared";
  return "other";
}

export function normalizeImport(fromFile, spec) {
  if (!spec.startsWith(".")) return spec;
  const parts = fromFile.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export async function boundaryViolations(files) {
  const rows = [];
  const re = /\bimport(?:\s+[^"'()]+?\s+from\s+|\s*\(\s*)(["'])([^"']+)\1/g;
  for (const file of files) {
    const fromLayer = layerOf(file);
    const lines = (await Deno.readTextFile(file).catch(() => "")).split(
      /\r?\n/,
    );
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(lines[i]))) {
        const target = normalizeImport(file, match[2]);
        const toLayer = layerOf(target);
        const bad = (fromLayer === "rules" &&
          (toLayer === "display" || toLayer === "bridge")) ||
          (fromLayer === "display" && toLayer === "rules") ||
          (fromLayer === "shared" && toLayer !== "shared" &&
            toLayer !== "other");
        if (bad) {
          rows.push({
            file,
            line: i + 1,
            text: `${fromLayer} -> ${toLayer}: ${match[2]}`,
          });
        }
      }
    }
  }
  return rows;
}

export async function systemCounts() {
  const scheduler = await Deno.readTextFile("src/main/scheduler.js");
  const registered = [...scheduler.matchAll(/registerSystem\s*\(/g)].length;
  let files = 0;
  for await (const entry of Deno.readDir("src/rules/systems")) {
    if (entry.isFile && entry.name.endsWith(".js")) files += 1;
  }
  return { registered, files };
}

export function classifyNondeterminism(row) {
  if (
    row.file.startsWith("src/rules/environment/dungeon/") &&
    /\bawait\b|\bPromise\b|\brequestAnimationFrame\b/.test(row.text)
  ) {
    return "generation-async";
  }
  return "rules-hazard";
}

export function classifySystemCall(row) {
  if (
    row.file === "src/rules/systems/interactionSystem.js" &&
    /\bInteractionSystem\s*\(/.test(row.text)
  ) {
    return "local-dispatch-helper";
  }
  if (
    row.file === "src/rules/systems/plasmaCloudSystem.js" &&
    /\bhazardSystem\s*\(\s*world\b/.test(row.text)
  ) {
    return "compatibility-shim";
  }
  return "possible-violation";
}

export async function buildHealthReport() {
  const src = await collectFiles("src");
  const rules = src.filter((f) => f.startsWith("src/rules/"));
  const all = src.concat(
    await collectFiles("tools"),
    await collectFiles("docs"),
  )
    .filter((file) => !file.endsWith(".agents/skills/agent-tools/scripts/agent-health.mjs"));
  const emitSafe = await grep(all, /\bemitSafe\b/);
  const rulesNondeterminism = await grep(
    rules,
    /\bMath\.random\b|\bDate\.now\b|\bsetTimeout\b|\bsetInterval\b|\bfetch\s*\(|\bawait\b|\bPromise\b/,
  );
  const directSystemCallRows = (await grep(
    rules.filter((f) => f.includes("/systems/")),
    /\b[A-Za-z_$][\w$]*System\s*\(\s*world\b/,
  ))
    .filter((row) =>
      !/\bexport\s+function\s+[A-Za-z_$][\w$]*System\s*\(/.test(row.text)
    );
  const generationAsync = rulesNondeterminism.filter((row) =>
    classifyNondeterminism(row) === "generation-async"
  );
  const nondeterminismHazards = rulesNondeterminism.filter((row) =>
    classifyNondeterminism(row) === "rules-hazard"
  );
  const systemCallNotes = directSystemCallRows.map((row) => ({
    ...row,
    kind: classifySystemCall(row),
  }));
  const directSystemCalls = systemCallNotes.filter((row) =>
    row.kind === "possible-violation"
  );
  const boundaries = await boundaryViolations(src);
  const systems = await systemCounts();
  return {
    src,
    systems,
    emitSafe,
    rulesNondeterminism: nondeterminismHazards,
    generationAsync,
    directSystemCalls,
    systemCallNotes,
    boundaries,
  };
}

export function formatHealthReport(report) {
  const {
    src,
    systems,
    emitSafe,
    rulesNondeterminism,
    generationAsync = [],
    directSystemCalls,
    systemCallNotes = directSystemCalls,
    boundaries,
  } = report;
  const lines = [];
  lines.push("agent health");
  lines.push(`files scanned: ${src.length}`);
  lines.push(
    `systems: ${systems.registered} registered / ${systems.files} files`,
  );
  lines.push(`emitSafe refs: ${emitSafe.length}`);
  lines.push(`rules nondeterminism hazards: ${rulesNondeterminism.length}`);
  lines.push(`generation async allowances: ${generationAsync.length}`);
  lines.push(`layer boundary violations: ${boundaries.length}`);
  lines.push(`possible system-to-system calls: ${directSystemCalls.length}`);
  const sections = [
    ["emitSafe refs", emitSafe],
    ["rules nondeterminism hazards", rulesNondeterminism],
    ["generation async allowances", generationAsync],
    ["layer boundary violations", boundaries],
    ["system call classifications", systemCallNotes],
  ];
  for (const [title, rows] of sections) {
    if (!rows.length) continue;
    lines.push("");
    lines.push(title + ":");
    for (const row of rows.slice(0, 30)) {
      const prefix = row.kind ? `[${row.kind}] ` : "";
      lines.push(`  ${row.file}:${row.line} ${prefix}${row.text}`);
    }
    if (rows.length > 30) lines.push(`  ... ${rows.length - 30} more`);
  }
  return lines.join("\n") + "\n";
}

export async function main() {
  const report = await buildHealthReport();
  console.log(formatHealthReport(report).trimEnd());
}

if (import.meta.main) await main();

#!/usr/bin/env deno run --allow-read

const SCHEDULER = "src/main/scheduler.js";
const SYSTEM_DIR = "src/rules/systems";
const TEST_DIR = "tests";
const PHASES = new Set(["ai", "intents", "effects", "scripts", "cleanup"]);

export function parseArgs(argv) {
  const opts = {
    format: "summary",
    phase: "",
    unregistered: false,
    missingTests: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--phase" && argv[i + 1]) opts.phase = String(argv[++i]);
    else if (arg === "--unregistered") opts.unregistered = true;
    else if (arg === "--missing-tests") opts.missingTests = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

export function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/system-map.mjs [options]

Options:
  --format summary|csv       Output format. Default: summary
  --phase NAME               Restrict registered systems to one phase
  --unregistered             Show only system files not imported by scheduler
  --missing-tests            Show only registered systems without obvious tests
`;
}

export async function readText(path) {
  return await Deno.readTextFile(path);
}

export async function fileExists(path) {
  try {
    const st = await Deno.stat(path);
    return st.isFile;
  } catch {
    return false;
  }
}

export async function listSystemFiles() {
  const out = [];
  for await (const entry of Deno.readDir(SYSTEM_DIR)) {
    if (entry.isFile && entry.name.endsWith(".js")) {
      out.push(`${SYSTEM_DIR}/${entry.name}`);
    }
  }
  return out.sort();
}

export function parseImports(text) {
  const imports = new Map();
  const re = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(text))) {
    const names = match[1].split(",").map((s) => {
      const parts = s.trim().split(/\s+as\s+/);
      return (parts[1] || parts[0] || "").trim();
    }).filter(Boolean);
    const spec = match[2];
    if (!spec.includes("/systems/") && !spec.startsWith("../rules/systems/")) {
      continue;
    }
    const file = spec.split("/").at(-1);
    for (const name of names) {
      imports.set(name, file.endsWith(".js") ? file : `${file}.js`);
    }
  }
  return imports;
}

export function parseRegistrations(text, imports) {
  const rows = [];
  const re = /registerSystem\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(text))) {
    const name = match[1];
    const phase = match[2];
    rows.push({
      name,
      phase: PHASES.has(phase) ? phase : `(unknown:${phase})`,
      file: imports.get(name) || "",
    });
  }
  return rows;
}

export async function buildRows() {
  const scheduler = await readText(SCHEDULER);
  const imports = parseImports(scheduler);
  const registered = parseRegistrations(scheduler, imports);
  const importedFiles = new Set([...imports.values()]);
  const systemFiles = await listSystemFiles();
  const registeredNames = new Set(
    registered.map((row) => row.file).filter(Boolean),
  );
  const allTests = [];
  for await (const entry of Deno.readDir(TEST_DIR)) {
    if (entry.isFile && entry.name.endsWith(".mjs")) allTests.push(entry.name);
  }

  const rows = [];
  for (const row of registered) {
    const base = row.file.replace(/\.js$/, "");
    const obviousTest = await fileExists(`${TEST_DIR}/${base}.test.mjs`) ||
      allTests.some((name) =>
        name.toLowerCase().includes(base.toLowerCase().replace(/system$/, ""))
      );
    rows.push({
      kind: "registered",
      phase: row.phase,
      name: row.name,
      file: row.file ? `${SYSTEM_DIR}/${row.file}` : "",
      imported: row.file ? "yes" : "unknown",
      registered: "yes",
      obviousTest: obviousTest ? "yes" : "no",
    });
  }

  for (const path of systemFiles) {
    const file = path.split("/").at(-1);
    if (registeredNames.has(file)) continue;
    rows.push({
      kind: importedFiles.has(file)
        ? "imported-not-registered"
        : "unregistered",
      phase: "",
      name: file.replace(/\.js$/, ""),
      file: path,
      imported: importedFiles.has(file) ? "yes" : "no",
      registered: "no",
      obviousTest: "unknown",
    });
  }

  return rows;
}

export function csv(rows) {
  return [
    "kind,phase,name,file,imported,registered,obvious_test",
    ...rows.map((r) =>
      [r.kind, r.phase, r.name, r.file, r.imported, r.registered, r.obviousTest]
        .join(",")
    ),
  ].join("\n") + "\n";
}

export function summary(rows) {
  const registered = rows.filter((r) => r.kind === "registered");
  const phases = new Map();
  for (const row of registered) {
    phases.set(row.phase, (phases.get(row.phase) || 0) + 1);
  }
  const unregistered = rows.filter((r) => r.registered === "no");
  const missingTests = registered.filter((r) => r.obviousTest === "no");
  const lines = [];
  lines.push(`systems: ${rows.length} files/registrations`);
  lines.push(`registered: ${registered.length}`);
  lines.push(
    `unregistered/imported-not-registered files: ${unregistered.length}`,
  );
  lines.push(
    `registered systems without obvious tests: ${missingTests.length}`,
  );
  lines.push("");
  lines.push("phase counts:");
  for (const [phase, count] of [...phases.entries()].sort()) {
    lines.push(`  ${phase}: ${count}`);
  }
  lines.push("");
  lines.push("unregistered/imported-not-registered:");
  for (const row of unregistered) lines.push(`  ${row.kind}: ${row.file}`);
  lines.push("");
  lines.push("registered systems without obvious tests:");
  for (const row of missingTests.slice(0, 40)) {
    lines.push(`  ${row.phase}: ${row.name} (${row.file})`);
  }
  return lines.join("\n") + "\n";
}

export async function main() {
  const opts = parseArgs(Deno.args);
  if (opts.help) {
    console.log(usage());
    return;
  }
  let rows = await buildRows();
  if (opts.phase) rows = rows.filter((r) => r.phase === opts.phase);
  if (opts.unregistered) rows = rows.filter((r) => r.registered === "no");
  if (opts.missingTests) {
    rows = rows.filter((r) =>
      r.kind === "registered" && r.obviousTest === "no"
    );
  }
  console.log((opts.format === "csv" ? csv(rows) : summary(rows)).trimEnd());
}

if (import.meta.main) await main();

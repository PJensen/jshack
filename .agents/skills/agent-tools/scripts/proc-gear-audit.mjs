#!/usr/bin/env deno run --allow-read

import "../../../../src/content/items/index.js";
import { allContentItems } from "../../../../src/content/registry.js";

export function parseArgs(argv) {
  const opts = { format: "summary", unconverted: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--unconverted") opts.unconverted = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

export function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/proc-gear-audit.mjs
  deno run --allow-read .agents/skills/agent-tools/scripts/proc-gear-audit.mjs --unconverted
  deno run --allow-read .agents/skills/agent-tools/scripts/proc-gear-audit.mjs --format csv

Lists proc-package gear and whether each package has an authored Equip mechanic format.`;
}

export function collectRows(items = allContentItems()) {
  const rows = [];
  for (const [id, item] of items) {
    const packages = Array.isArray(item?.procPackages) ? item.procPackages : [];
    if (packages.length === 0 || item?.catalogKind !== "equipment") continue;
    const formats = item?.mechanicFormats?.procPackages || {};
    for (const packageId of packages) {
      const format = formats?.[packageId];
      rows.push({
        id,
        name: String(item?.name || id),
        packageId,
        status: format ? "authored" : "unconverted",
        context: typeof format === "object" && format?.context ? String(format.context) : "",
        format: typeof format === "string" ? format : String(format?.format || ""),
      });
    }
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id) || a.packageId.localeCompare(b.packageId));
}

export function printRows(rows, opts) {
  const visible = opts.unconverted ? rows.filter((row) => row.status === "unconverted") : rows;
  if (opts.format === "csv") {
    console.log("id,name,packageId,status,context,format");
    for (const row of visible) {
      console.log([row.id, row.name, row.packageId, row.status, row.context, row.format]
        .map((value) => JSON.stringify(value))
        .join(","));
    }
    return;
  }

  const authored = rows.filter((row) => row.status === "authored").length;
  const unconverted = rows.length - authored;
  console.log(`proc gear packages: ${rows.length}`);
  console.log(`authored=${authored} unconverted=${unconverted}`);
  console.log("");
  for (const row of visible) {
    const detail = row.status === "authored"
      ? `${row.context || "Equip"}: ${row.format}`
      : "missing authored mechanic format";
    console.log(`${row.status.padEnd(11)} ${row.id} / ${row.packageId} — ${detail}`);
  }
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  if (opts.help) console.log(usage());
  else printRows(collectRows(), opts);
}

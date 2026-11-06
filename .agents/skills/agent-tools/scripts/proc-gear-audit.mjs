#!/usr/bin/env deno run --allow-read

import "../../../../src/content/items/index.js";
import { allContentItems } from "../../../../src/content/registry.js";
import { getProcPackage } from "../../../../src/rules/data/procPackages.js";

export function parseArgs(argv) {
  const opts = { format: "summary", unconverted: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--") continue;
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
      const packageSpec = getProcPackage(packageId);
      const packageFormat = packageSpec?.display || null;
      const itemFormat = formats?.[packageId] || null;
      const format = itemFormat || packageFormat;
      const formatText = typeof format === "string" ? format : String(format?.format || "");
      const tokens = [...formatText.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)].map((match) => match[1]);
      const allowedTokens = new Set(["id", "name", "summary", ...Object.keys(format?.values || {})]);
      rows.push({
        id,
        name: String(item?.name || id),
        packageId,
        packageStatus: packageFormat ? "configured" : "missing",
        status: itemFormat ? "item-override" : (packageFormat ? "package" : "unconverted"),
        context: typeof format === "object" && format?.context ? String(format.context) : "",
        format: formatText,
        invalidTokens: tokens.filter((token) => !allowedTokens.has(token)),
        packageExists: !!packageSpec,
      });
    }
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id) || a.packageId.localeCompare(b.packageId));
}

export function printRows(rows, opts) {
  const visible = opts.unconverted
    ? rows.filter((row) => row.packageStatus === "missing" || !row.packageExists || row.invalidTokens.length > 0)
    : rows;
  if (opts.format === "csv") {
    console.log("id,name,packageId,status,packageStatus,packageExists,context,format,invalidTokens");
    for (const row of visible) {
      console.log([row.id, row.name, row.packageId, row.status, row.packageStatus, row.packageExists, row.context, row.format, row.invalidTokens.join("|")]
        .map((value) => JSON.stringify(value))
        .join(","));
    }
    return;
  }

  const packageIds = new Set(rows.map((row) => row.packageId));
  const configuredPackages = new Set(rows.filter((row) => row.packageStatus === "configured").map((row) => row.packageId));
  const invalid = rows.filter((row) => row.invalidTokens.length > 0 || !row.packageExists).length;
  const unconverted = rows.filter((row) => row.packageStatus === "missing").length;
  console.log(`proc gear packages: ${rows.length}`);
  console.log(`uniquePackages=${packageIds.size} configuredPackages=${configuredPackages.size} unconvertedEntries=${unconverted} invalidEntries=${invalid}`);
  console.log("");
  for (const row of visible) {
    const detail = row.packageStatus === "configured"
      ? `${row.context || "Equip"}: ${row.format}${row.status === "item-override" ? " (item override)" : ""}`
      : (!row.packageExists ? "unknown ProcPackage" : "missing package display format");
    const tokenWarning = row.invalidTokens.length > 0 ? ` [invalid tokens: ${row.invalidTokens.join(", ")}]` : "";
    console.log(`${row.status.padEnd(13)} ${row.id} / ${row.packageId} — ${detail}${tokenWarning}`);
  }
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  if (opts.help) console.log(usage());
  else printRows(collectRows(), opts);
}

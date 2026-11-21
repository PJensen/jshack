#!/usr/bin/env -S deno run --allow-read

// Read-only completeness audit for authored item economy fields. This treats
// omitted value or weight as a real gap; no pricing or weight fallback is
// applied here.

import "../../../../src/content/items/index.js";
import { installContent } from "../../../../src/content/install.js";
import { listCatalogItems } from "../../../../src/rules/data/itemCatalog.js";

installContent();

export function parseArgs(argv) {
  const opts = { format: "summary", issues: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--issues") opts.issues = true;
    else if (arg === "--limit" && argv[i + 1]) opts.limit = Math.max(0, Number(argv[++i]) | 0);
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function auditItemEconomy(items = listCatalogItems()) {
  return [...items].map((item) => {
    const issues = [];
    if (!positive(item.value)) issues.push("missing-value");
    if (!positive(item.weight)) issues.push("missing-weight");
    return {
      id: String(item.id || ""),
      name: String(item.name || ""),
      catalogKind: String(item.catalogKind || ""),
      type: String(item.type || ""),
      slot: String(item.slot || ""),
      rarity: String(item.rarityName || ""),
      value: Number(item.value || 0),
      weight: Number(item.weight || 0),
      issues,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function filterItems(items, opts) {
  return items.filter((item) => !opts.issues || item.issues.length > 0);
}

function formatCsv(items) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = ["id,name,catalogKind,type,slot,rarity,value,weight,issues"];
  for (const item of items) rows.push([
    item.id, item.name, item.catalogKind, item.type, item.slot, item.rarity,
    item.value, item.weight, item.issues.join("|"),
  ].map(quote).join(","));
  return rows.join("\n");
}

export function formatReport(items, format = "summary") {
  if (format === "json") return JSON.stringify(items, null, 2);
  if (format === "csv") return formatCsv(items);
  const missingValue = items.filter((item) => item.issues.includes("missing-value")).length;
  const missingWeight = items.filter((item) => item.issues.includes("missing-weight")).length;
  const lines = [`items: ${items.length}`, `missing values: ${missingValue}`, `missing weights: ${missingWeight}`];
  for (const item of items) {
    if (item.issues.length > 0) lines.push(`${item.id} ${item.name} [${item.issues.join(";")}]`);
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  if (opts.help) console.log("Usage: deno run --allow-read .agents/skills/agent-tools/scripts/item-economy-audit.mjs [--issues] [--format summary|csv|json] [--limit N]");
  else {
    const filtered = filterItems(auditItemEconomy(), opts);
    const limited = opts.limit > 0 ? filtered.slice(0, opts.limit) : filtered;
    console.log(formatReport(limited, opts.format));
  }
}

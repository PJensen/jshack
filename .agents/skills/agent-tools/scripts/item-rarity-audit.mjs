#!/usr/bin/env -S deno run --allow-read

// Deterministic inventory of the canonical item catalog. This intentionally
// reports authored rarity labels and numeric tiers separately: legacy labels
// such as "magic" are useful evidence during a rarity rebalance.

import "../../../../src/content/items/index.js";
import { installContent } from "../../../../src/content/install.js";
import { listCatalogItems } from "../../../../src/rules/data/itemCatalog.js";

installContent();

export const RARITY_SLOTS = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
});

const CANONICAL_NAMES = new Set(Object.keys(RARITY_SLOTS));

export function parseArgs(argv) {
  const opts = { format: "summary", kind: "", rarity: "", gearOnly: false, issues: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--kind" && argv[i + 1]) opts.kind = String(argv[++i]).toLowerCase();
    else if (arg === "--rarity" && argv[i + 1]) opts.rarity = String(argv[++i]).toLowerCase();
    else if (arg === "--gear-only") opts.gearOnly = true;
    else if (arg === "--issues") opts.issues = true;
    else if (arg === "--limit" && argv[i + 1]) opts.limit = Math.max(0, Number(argv[++i]) | 0);
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

export function auditItems(items = listCatalogItems()) {
  return [...items]
    .map((item) => {
      const rarityName = String(item.rarityName || "").toLowerCase();
      const rarity = Number(item.rarity || 0) | 0;
      const canonicalRarity = RARITY_SLOTS[rarityName] || 0;
      const issues = [];
      if (!CANONICAL_NAMES.has(rarityName)) issues.push("legacy-or-unknown-name");
      if (canonicalRarity && rarity !== canonicalRarity) issues.push("name-number-mismatch");
      if (!rarity) issues.push("missing-number");
      return {
        id: String(item.id || ""),
        name: String(item.name || ""),
        catalogKind: String(item.catalogKind || ""),
        type: String(item.type || ""),
        slot: String(item.slot || ""),
        rarity,
        rarityName,
        canonicalSlot: canonicalRarity ? `${canonicalRarity}:${rarityName}` : "legacy",
        value: Number(item.value || 0),
        tags: Array.isArray(item.tags) ? [...item.tags].map(String).sort() : [],
        issues,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function filterItems(items, opts) {
  return items.filter((item) => {
    if (opts.kind && item.catalogKind !== opts.kind) return false;
    if (opts.rarity && item.rarityName !== opts.rarity) return false;
    if (opts.gearOnly && item.catalogKind !== "equipment") return false;
    if (opts.issues && item.issues.length === 0) return false;
    return true;
  });
}

function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/item-rarity-audit.mjs [options]

Options: --format summary|csv|json --kind equipment --rarity uncommon
         --gear-only --issues --limit N`;
}

function formatSummary(items) {
  const byName = new Map();
  const byKind = new Map();
  for (const item of items) {
    byName.set(item.rarityName || "(missing)", (byName.get(item.rarityName || "(missing)") || 0) + 1);
    byKind.set(item.catalogKind || "(missing)", (byKind.get(item.catalogKind || "(missing)") || 0) + 1);
  }
  const counts = (map) => [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}=${count}`).join(" ");
  const issueCount = items.filter((item) => item.issues.length > 0).length;
  return [
    `items: ${items.length}`,
    `by rarityName: ${counts(byName)}`,
    `by catalogKind: ${counts(byKind)}`,
    `items with audit issues: ${issueCount}`,
  ].join("\n");
}

function formatCsv(items) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = ["id,name,catalogKind,type,slot,rarity,rarityName,canonicalSlot,value,tags,issues"];
  for (const item of items) {
    rows.push([
      item.id, item.name, item.catalogKind, item.type, item.slot, item.rarity,
      item.rarityName, item.canonicalSlot, item.value, item.tags.join("|"), item.issues.join("|")
    ].map(quote).join(","));
  }
  return rows.join("\n");
}

export function formatReport(items, format = "summary") {
  if (format === "json") return JSON.stringify(items, null, 2);
  if (format === "csv") return formatCsv(items);
  return formatSummary(items);
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  if (opts.help) console.log(usage());
  else {
    const filtered = filterItems(auditItems(), opts);
    const limited = opts.limit > 0 ? filtered.slice(0, opts.limit) : filtered;
    console.log(formatReport(limited, opts.format));
  }
}

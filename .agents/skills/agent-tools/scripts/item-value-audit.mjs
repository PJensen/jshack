#!/usr/bin/env -S deno run --allow-read

// Deterministic item-economy audit. This reports the authored shop value,
// the existing stat-based appraisal fallback, combat strength, and loot
// exposure together so balance review can distinguish pricing from rarity.

import "../../../../src/content/items/index.js";
import { installContent } from "../../../../src/content/install.js";
import { allContentAbilities } from "../../../../src/content/registry.js";
import { listCatalogItems } from "../../../../src/rules/data/itemCatalog.js";
import { LOOT_TABLES } from "../../../../src/rules/data/lootTables.js";
import { estimateItemValueFromInfo } from "../../../../src/rules/utils/shopAppraisal.js";
import { RARITY_SLOTS } from "./item-rarity-audit.mjs";
import { scoreItem } from "./item-strength-audit.mjs";

installContent();

export function parseArgs(argv) {
  const opts = { kind: "", issues: false, format: "summary", limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--kind" && argv[i + 1]) opts.kind = String(argv[++i]).toLowerCase();
    else if (arg === "--issues") opts.issues = true;
    else if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--limit" && argv[i + 1]) opts.limit = Math.max(0, Number(argv[++i]) | 0);
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptyExposure() {
  return { tables: new Set(), entries: 0, affixOpportunity: 0, affixChance: 0 };
}

function collectLootExposure(tables) {
  const exposure = new Map();
  const ensure = (id) => {
    if (!exposure.has(id)) exposure.set(id, emptyExposure());
    return exposure.get(id);
  };
  for (const [tableId, table] of Object.entries(tables || {})) {
    const entries = Array.isArray(table?.entries) ? table.entries : [];
    for (const entry of entries) {
      const ids = entry?.type === "equip"
        ? (Array.isArray(entry.pool) ? entry.pool : [])
        : entry?.type === "item" && entry.itemId ? [entry.itemId] : [];
      for (const id of ids) {
        const record = ensure(String(id));
        record.tables.add(tableId);
        record.entries += 1;
        if (entry?.type === "equip") {
          const chance = Math.max(0, Math.min(1, number(entry.affixChance, 0)));
          const count = Math.max(0, number(entry.affixCountMax, 0));
          record.affixOpportunity = Math.max(record.affixOpportunity, chance * count);
          record.affixChance = Math.max(record.affixChance, chance);
        }
      }
    }
  }
  return exposure;
}

function ratio(a, b) {
  return b > 0 ? a / b : 0;
}

function strengthFor(item) {
  if (String(item.catalogKind) !== "equipment") return 0;
  const abilities = allContentAbilities().get(String(item.id || ""));
  const abilitySpecs = abilities ? [...abilities.values()] : [];
  const enriched = abilitySpecs.length > 0 ? { ...item, abilities: abilitySpecs } : item;
  const result = scoreItem(enriched);
  const abilityPoints = abilitySpecs.reduce((sum, ability) => {
    const range = Math.max(1, number(ability.range, 1));
    const cooldown = Math.max(0, number(ability.cooldown, 0));
    const effects = Array.isArray(ability.effects) ? ability.effects.length : 0;
    return sum + 4 + range * 0.5 + effects - cooldown * 0.05;
  }, 0);
  return Number((result.score + abilityPoints).toFixed(2));
}

export function auditItemValues(items = listCatalogItems(), tables = LOOT_TABLES) {
  const exposure = collectLootExposure(tables);
  return [...items].map((item) => {
    const id = String(item.id || "");
    const authoredValue = Math.max(0, number(item.value, 0));
    const modelValue = estimateItemValueFromInfo({ ...item, value: 0 });
    const loot = exposure.get(id) || emptyExposure();
    const strength = strengthFor(item);
    const issues = [];
    if (authoredValue <= 0 && String(item.type || "").toLowerCase() !== "gem") issues.push("missing-authored-value");
    if (String(item.catalogKind) === "equipment" && loot.tables.size === 0) issues.push("not-in-loot-table");
    if (authoredValue > 0 && modelValue > 0) {
      const pricingRatio = ratio(authoredValue, modelValue);
      if (pricingRatio >= 2.5) issues.push(`priced-high-vs-model:${pricingRatio.toFixed(2)}x`);
      else if (pricingRatio <= 0.4) issues.push(`priced-low-vs-model:${pricingRatio.toFixed(2)}x`);
    }
    if (loot.affixOpportunity > 0) issues.push("randomized-affix-opportunity");
    return {
      id,
      name: String(item.name || ""),
      catalogKind: String(item.catalogKind || ""),
      type: String(item.type || ""),
      slot: String(item.slot || ""),
      rarity: String(item.rarityName || "").toLowerCase(),
      rarityNumber: Number(RARITY_SLOTS[String(item.rarityName || "").toLowerCase()] || item.rarity || 0),
      authoredValue,
      modelValue,
      strength,
      lootTables: [...loot.tables].sort(),
      lootEntries: loot.entries,
      affixChance: Number(loot.affixChance.toFixed(3)),
      affixOpportunity: Number(loot.affixOpportunity.toFixed(3)),
      valuePerStrength: Number(ratio(authoredValue || modelValue, strength).toFixed(2)),
      issues,
    };
  }).sort((a, b) => b.valuePerStrength - a.valuePerStrength || a.id.localeCompare(b.id));
}

export function filterItems(items, opts) {
  return items.filter((item) => {
    if (opts.kind && item.catalogKind !== opts.kind) return false;
    if (opts.issues && item.issues.length === 0) return false;
    return true;
  });
}

function formatCsv(items) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = ["id,name,catalogKind,type,slot,rarity,rarityNumber,authoredValue,modelValue,strength,valuePerStrength,lootTables,lootEntries,affixChance,affixOpportunity,issues"];
  for (const item of items) rows.push([
    item.id, item.name, item.catalogKind, item.type, item.slot, item.rarity, item.rarityNumber,
    item.authoredValue, item.modelValue, item.strength, item.valuePerStrength,
    item.lootTables.join("|"), item.lootEntries, item.affixChance, item.affixOpportunity,
    item.issues.join("|"),
  ].map(quote).join(","));
  return rows.join("\n");
}

export function formatReport(items, format = "summary") {
  if (format === "json") return JSON.stringify(items, null, 2);
  if (format === "csv") return formatCsv(items);
  const lines = [`items: ${items.length}`];
  for (const item of items) {
    lines.push(`${item.rarity.padEnd(9)} ${String(item.authoredValue).padStart(5)} gold / model ${String(item.modelValue).padStart(5)}  ${item.id}  loot=${item.lootTables.length} affix=${item.affixOpportunity}${item.issues.length ? `  REVIEW ${item.issues.join(";")}` : ""}`);
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  if (opts.help) console.log("Usage: deno run --allow-read .agents/skills/agent-tools/scripts/item-value-audit.mjs [--kind equipment|magic] [--issues] [--format summary|csv|json] [--limit N]");
  else {
    const filtered = filterItems(auditItemValues(), opts);
    const limited = opts.limit > 0 ? filtered.slice(0, opts.limit) : filtered;
    console.log(formatReport(limited, opts.format));
  }
}

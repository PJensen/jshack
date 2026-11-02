#!/usr/bin/env deno run --allow-read

// Advisory, deterministic gear comparison. This is deliberately not a power
// oracle: it exposes a small, stable budget of authored signals so playtest
// results can overrule the estimate.

import "../../../../src/content/items/index.js";
import { installContent } from "../../../../src/content/install.js";
import { listCatalogItems } from "../../../../src/rules/data/itemCatalog.js";
import { allContentAbilities } from "../../../../src/content/registry.js";
import { RARITY_SLOTS } from "./item-rarity-audit.mjs";

installContent();

const BONUS_WEIGHTS = Object.freeze({
  attack: 4, accuracy: 3, dexterity: 3, spellHit: 3, defense: 4,
  damagePower: 3, bluntPenetration: 1.5, slashPenetration: 1.5, piercePenetration: 1.5,
  maxHp: 0.2, maxStamina: 0.2, maxMana: 0.25,
  staminaRegen: 3, manaRegen: 3, critChance: 35, critMult: 10,
  fireResist: 10, poisonResist: 10, acidResist: 10, coldResist: 10, bluntResist: 10,
  slashResist: 10, pierceResist: 10, electricOhms: 0.02, kineticDR: 1.5,
  spellAvoid: 2, spellRadius: 1, luck: 2, visionRange: 1, dig: 1,
  polymorphControl: 5, hungerRate: -2,
});

export function parseArgs(argv) {
  const opts = { slot: "", rarity: "", outliers: false, format: "summary", limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--slot" && argv[i + 1]) opts.slot = String(argv[++i]).toLowerCase();
    else if (arg === "--rarity" && argv[i + 1]) opts.rarity = String(argv[++i]).toLowerCase();
    else if (arg === "--outliers") opts.outliers = true;
    else if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--limit" && argv[i + 1]) opts.limit = Math.max(0, Number(argv[++i]) | 0);
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

function diceAverage(dice) {
  const match = String(dice || "").match(/^(\d+)d(\d+)(?:[+-](\d+))?$/i);
  if (!match) return 0;
  return (Number(match[1]) * (Number(match[2]) + 1)) / 2 + Number(match[3] || 0);
}

function addContribution(contributions, label, amount) {
  if (!Number.isFinite(amount) || amount === 0) return;
  contributions.push({ label, points: Number(amount.toFixed(2)) });
}

export function scoreItem(item) {
  const contributions = [];
  const manualReview = [];
  const bonuses = item.bonuses && typeof item.bonuses === "object" ? item.bonuses : {};
  for (const [key, value] of Object.entries(bonuses)) {
    const weight = BONUS_WEIGHTS[key];
    const amount = Number(value);
    if (weight && Number.isFinite(amount) && amount !== 0) {
      addContribution(contributions, `bonus:${key}`, amount * weight);
    }
  }

  const averageDamage = diceAverage(item.damageDice);
  const staminaCost = Math.max(1, Number(item.staminaCost || 1));
  if (averageDamage > 0) addContribution(contributions, "weapon:average-damage", averageDamage * 2);
  if (averageDamage > 0) addContribution(contributions, "weapon:stamina-efficiency", (averageDamage / staminaCost) * 8);
  if (Number(item.maxSockets) > 0) addContribution(contributions, "topology:sockets", Number(item.maxSockets) * 2);
  if (Array.isArray(item.affixes)) addContribution(contributions, "topology:authored-affixes", item.affixes.length * 3);
  if (Array.isArray(item.procPackages)) addContribution(contributions, "topology:proc-packages", item.procPackages.length * 6);
  if (Number(item.range) > 0) addContribution(contributions, "combat:range", Math.max(0, Number(item.range) - 4) * 0.5);
  if (Number(item.charges) > 0) addContribution(contributions, "resource:charges", Math.min(8, Number(item.charges)) * 0.5);
  if (item.chargePool && Number(item.chargePool.max) > 0) {
    addContribution(contributions, "resource:charge-pool", Math.min(8, Number(item.chargePool.max)) * 0.5);
  }

  if (item.ammoAffinities && typeof item.ammoAffinities === "object") {
    let affinityPoints = 0;
    for (const affinity of Object.values(item.ammoAffinities)) {
      for (const [key, value] of Object.entries(affinity || {})) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) continue;
        if (key === "damageBonus") affinityPoints += amount * 4;
        else if (key.endsWith("ChanceBonus")) affinityPoints += amount * 20;
        else if (key.endsWith("RadiusBonus")) affinityPoints += amount * 2;
        else affinityPoints += Math.max(0, amount);
      }
    }
    addContribution(contributions, "ammo-affinities", affinityPoints);
    manualReview.push("ammo-affinity-context");
  }
  if (item.lootBiases && typeof item.lootBiases === "object") {
    const biasPoints = Object.values(item.lootBiases).reduce((sum, value) => sum + Math.max(0, Number(value) - 1) * 2, 0);
    addContribution(contributions, "loot-biases", biasPoints);
    manualReview.push("loot-bias-context");
  }
  if (item.dropRequirement) manualReview.push("drop-requirement");
  if (Array.isArray(item.tags) && item.tags.length > 0) {
    for (const tag of item.tags) manualReview.push(`tag:${tag}`);
  }

  const score = Math.max(0, contributions.reduce((sum, entry) => sum + entry.points, 0));
  contributions.sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));
  return { score: Number(score.toFixed(2)), contributions, manualReview: [...new Set(manualReview)].sort() };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function auditStrength(items = listCatalogItems()) {
  const scored = items
    .filter((item) => String(item.catalogKind) === "equipment")
    .map((item) => {
      const abilityMap = allContentAbilities().get(String(item.id || ""));
      const abilitySpecs = abilityMap ? [...abilityMap.values()] : [];
      const abilityPoints = abilitySpecs.reduce((sum, ability) => {
        const range = Math.max(1, Number(ability.range || 1));
        const cooldown = Math.max(0, Number(ability.cooldown || 0));
        const effects = Array.isArray(ability.effects) ? ability.effects.length : 0;
        return sum + 4 + range * 0.5 + effects - cooldown * 0.05;
      }, 0);
      const enriched = abilitySpecs.length > 0
        ? { ...item, abilities: abilitySpecs, abilityPoints }
        : item;
      const { score: baseScore, contributions, manualReview } = scoreItem(enriched);
      if (abilityPoints > 0) contributions.push({ label: "active-abilities", points: Number(abilityPoints.toFixed(2)) });
      const score = baseScore + abilityPoints;
      if (abilitySpecs.length > 0) manualReview.push("active-ability-context");
      const rarityName = String(item.rarityName || "common").toLowerCase();
      return {
        id: String(item.id || ""),
        name: String(item.name || ""),
        slot: String(item.slot || ""),
        rarity: rarityName,
        rarityNumber: Number(RARITY_SLOTS[rarityName] || item.rarity || 1),
        score,
        topContributions: contributions.slice(0, 5),
        manualReview: [...new Set(manualReview)].sort(),
        outliers: [],
      };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot) || a.score - b.score || a.id.localeCompare(b.id));

  const bySlotRarity = new Map();
  for (const item of scored) {
    const key = `${item.slot}|${item.rarity}`;
    if (!bySlotRarity.has(key)) bySlotRarity.set(key, []);
    bySlotRarity.get(key).push(item.score);
  }
  for (const item of scored) {
    const peers = bySlotRarity.get(`${item.slot}|${item.rarity}`) || [];
    if (peers.length < 3) continue;
    const typical = median(peers);
    if (typical <= 0) continue;
    const ratio = item.score / typical;
    if (ratio >= 1.75) item.outliers.push(`high-vs-${item.rarity}-peers:${ratio.toFixed(2)}x`);
    else if (ratio <= 0.45) item.outliers.push(`low-vs-${item.rarity}-peers:${ratio.toFixed(2)}x`);
  }
  return scored;
}

export function filterItems(items, opts) {
  return items.filter((item) => {
    if (opts.slot && item.slot !== opts.slot) return false;
    if (opts.rarity && item.rarity !== opts.rarity) return false;
    if (opts.outliers && item.outliers.length === 0) return false;
    return true;
  });
}

function formatCsv(items) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = ["id,name,slot,rarity,rarityNumber,score,topContributions,manualReview,outliers"];
  for (const item of items) {
    rows.push([
      item.id, item.name, item.slot, item.rarity, item.rarityNumber, item.score,
      item.topContributions.map((entry) => `${entry.label}:${entry.points}`).join("|"),
      item.manualReview.join("|"),
      item.outliers.join("|"),
    ].map(quote).join(","));
  }
  return rows.join("\n");
}

export function formatReport(items, format = "summary") {
  if (format === "json") return JSON.stringify(items, null, 2);
  if (format === "csv") return formatCsv(items);
  const lines = [`gear items: ${items.length}`];
  for (const item of items) {
    const reasons = item.topContributions.map((entry) => `${entry.label}=${entry.points}`).join(", ");
    lines.push(`${item.slot.padEnd(8)} ${item.rarity.padEnd(9)} ${String(item.score).padStart(7)} ${item.id}  [${reasons}]${item.outliers.length ? `  OUTLIER ${item.outliers.join(";")}` : ""}`);
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  if (opts.help) {
    console.log("Usage: deno run --allow-read .agents/skills/agent-tools/scripts/item-strength-audit.mjs [--slot SLOT] [--rarity RARITY] [--outliers] [--format summary|csv|json]");
  } else {
    const filtered = filterItems(auditStrength(), opts);
    const limited = opts.limit > 0 ? filtered.slice(0, opts.limit) : filtered;
    console.log(formatReport(limited, opts.format));
  }
}

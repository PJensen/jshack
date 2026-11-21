#!/usr/bin/env -S deno run --allow-read

// Seeded loot-preview tool. This is an agent-facing generator, not a second
// gameplay path: it calls the canonical resolver and only decorates its drop
// descriptors with inspection metadata and provisional alignment language.

import "../../../../src/content/items/index.js";
import { installContent } from "../../../../src/content/install.js";
import { getCatalogItem } from "../../../../src/rules/data/itemCatalog.js";
import { resolveLootTable } from "../../../../src/rules/data/lootResolver.js";
import { createRng, seedFromString } from "../../../../src/lib/ecs-js/rng.js";
import { estimateItemValueFromInfo } from "../../../../src/rules/utils/shopAppraisal.js";

installContent();

const ALIGNMENT_WORDS = Object.freeze([
  ["holy", "dawn-forged"],
  ["light", "sunlit"],
  ["shadow", "gravebound"],
  ["grave", "ossuary-marked"],
  ["thorn", "thornsworn"],
  ["root", "rootbound"],
  ["wild", "wildborn"],
  ["fire", "emberforged"],
  ["ember", "cinder-marked"],
  ["frost", "frostbound"],
  ["cold", "winter-kissed"],
  ["venom", "venom-touched"],
  ["poison", "serpent-marked"],
  ["storm", "storm-touched"],
  ["shock", "thunderbound"],
  ["arcane", "star-scribed"],
  ["magic", "spellwoven"],
  ["hearth", "hearthblessed"],
  ["moon", "moon-veiled"],
]);

const SUFFIX_WORDS = Object.freeze([
  ["holy", "of Dawn"],
  ["light", "of the Sun"],
  ["shadow", "of the Veiled Night"],
  ["grave", "of the Ossuary"],
  ["thorn", "of Thorns"],
  ["root", "of Deep Roots"],
  ["wild", "of the Long Hunt"],
  ["fire", "of Embers"],
  ["ember", "of Cinders"],
  ["frost", "of Frostbite"],
  ["cold", "of Winter"],
  ["venom", "of Venom"],
  ["poison", "of Serpents"],
  ["storm", "of Thunder"],
  ["shock", "of Lightning"],
  ["arcane", "of the Star Archive"],
  ["magic", "of Spellwoven Glass"],
  ["hearth", "of the Hearth"],
  ["moon", "of Moonlight"],
]);

export function parseArgs(argv) {
  const opts = { tableId: "chest:common", seed: "jshack", depth: 1, format: "summary" };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if ((arg === "--table" || arg === "--table-id") && argv[i + 1]) opts.tableId = String(argv[++i]);
    else if (arg === "--seed" && argv[i + 1]) opts.seed = String(argv[++i]);
    else if (arg === "--depth" && argv[i + 1]) opts.depth = Math.max(0, Number(argv[++i]) | 0);
    else if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

function searchableText(def, drop) {
  return [
    def?.id, def?.name, def?.description,
    ...(Array.isArray(def?.tags) ? def.tags : []),
    ...(Array.isArray(drop?.params?.affixes) ? drop.params.affixes : []),
    ...(Array.isArray(drop?.params?.generation?.resonances) ? drop.params.generation.resonances : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function alignmentWordsFor(def, drop = null) {
  const text = searchableText(def, drop);
  const words = [];
  for (const [signal, word] of ALIGNMENT_WORDS) {
    if (text.includes(signal) && !words.includes(word)) words.push(word);
  }
  return words;
}

export function suffixWordsFor(def, drop = null) {
  const text = searchableText(def, drop);
  const words = [];
  for (const [signal, word] of SUFFIX_WORDS) {
    if (text.includes(signal) && !words.includes(word)) words.push(word);
  }
  return words;
}

function decorateDrop(drop, index) {
  const id = String(drop?.params?.equipId || drop?.params?.itemId || "");
  const def = id ? getCatalogItem(id) : null;
  const words = alignmentWordsFor(def, drop);
  const suffixes = suffixWordsFor(def, drop);
  const baseName = String(def?.name || drop?.params?.archetype || drop?.kind || "Unknown drop");
  const prefix = drop?.params?.generatedName ? "" : (words[0] || "unmarked");
  const suffix = drop?.params?.generatedName ? "" : (suffixes[0] || "");
  const generation = drop?.params?.generation;
  const info = def ? {
    ...def,
    value: 0,
    rarity: generation?.rarity || def.rarity,
    rarityName: generation?.rarityName || def.rarityName,
    affixes: drop?.params?.affixes || def.affixes,
    bonuses: { ...(def.bonuses || {}), ...(drop?.params?.bonuses || {}) },
  } : null;
  return {
    index,
    kind: String(drop?.kind || ""),
    params: drop?.params || {},
    itemId: id,
    name: baseName,
    suggestedName: drop?.params?.generatedName || `${prefix} ${baseName}${suffix ? ` ${suffix}` : ""}`,
    alignmentWords: words,
    suffixWords: suffixes,
    estimatedValue: info ? estimateItemValueFromInfo(info) : 0,
    rolledBonuses: drop?.params?.bonuses || {},
  };
}

export function generateLootPreview(tableId, seed = "jshack", depth = 1) {
  const seedText = String(seed);
  const numericSeed = seedFromString(seedText);
  const drops = resolveLootTable(String(tableId || ""), createRng(numericSeed), Math.max(0, Number(depth) | 0));
  return {
    tableId: String(tableId || ""),
    seed: seedText,
    numericSeed,
    depth: Math.max(0, Number(depth) | 0),
    drops: drops.map(decorateDrop),
  };
}

export function formatReport(report, format = "summary") {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [`table: ${report.tableId}`, `seed: ${report.seed} (${report.numericSeed})`, `depth: ${report.depth}`, `drops: ${report.drops.length}`];
  for (const drop of report.drops) {
    const affixes = Array.isArray(drop.params?.affixes) && drop.params.affixes.length > 0
      ? ` affixes=${drop.params.affixes.join("|")}` : "";
    const alignment = drop.alignmentWords.length > 0 ? drop.alignmentWords.join("|") : "unmarked";
    lines.push(`${drop.index}: ${drop.suggestedName} [${alignment}] value≈${drop.estimatedValue}${affixes}`);
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  if (opts.help) console.log("Usage: deno run --allow-read .agents/skills/agent-tools/scripts/loot-generator.mjs [--table TABLE] [--seed SEED] [--depth N] [--format summary|json]");
  else console.log(formatReport(generateLootPreview(opts.tableId, opts.seed, opts.depth), opts.format));
}

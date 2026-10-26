// main/wiring/itemName.js
// Central display name resolver for items.
// All callsites that need a player-facing item name should use this
// instead of directly reading NamedIdentity.name.

import { ItemInfo } from "../../rules/components/ItemInfo.js";
import { MaterialState } from "../../rules/components/MaterialState.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { FoodDecay } from "../../rules/components/FoodDecay.js";
import { children } from "../../lib/ecs-js/index.js";
import { ActivationGate } from "../../rules/components/ActivationGate.js";
import { AffixTopologyNode } from "../../rules/components/AffixTopologyNode.js";
import { isIdentified } from "../../rules/data/identification.js";
import { getUnidentifiedName, requiresIdentification } from "../../rules/data/itemAppearances.js";
import { getDecayStage } from "../../rules/data/food.js";
import { getAffixDescription, getAffixName } from "../../rules/data/affixes.js";
import { Beatitude } from "../../rules/components/Beatitude.js";
import { GemSocketNode } from "../../rules/components/GemSocketNode.js";
import { ProcEffect } from "../../rules/components/ProcEffect.js";
import { ProcNode } from "../../rules/components/ProcNode.js";
import { ProcPackageNode } from "../../rules/components/ProcPackageNode.js";
import { ScriptRef } from "../../rules/components/ScriptRef.js";
import { getProcPackage } from "../../rules/data/procPackages.js";
import { getCatalogItem } from "../../rules/data/itemCatalog.js";
import {
  getSpell,
  describeSpellDetailLines,
  describeSpellTargetEffects,
} from "../../rules/data/spells.js";

/**
 * Resolve the display name for an item entity.
 * - Gems: if the gem type is identified, return the true name; otherwise return the appearance.
 * - Identifiable items (equipment, scrolls, potions, wands): if not identified, return
 *   "Unidentified <Category>"; otherwise return the true name.
 * - All other items: existing fallback chain.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} entityId
 * @returns {string}
 */
export function resolveItemDisplayName(world, entityId) {
  const ni = world.get(entityId, NamedIdentity);
  const info = world.get(entityId, ItemInfo);
  const materialState = world.get(entityId, MaterialState);
  const corrosionStacks = Math.max(
    Number(materialState?.corrosionStacks || 0) | 0,
    Number(info?.corrosionStacks || 0) | 0,
    materialState?.corrosion >= 0.34 ? 1 : 0,
  );
  const wetness = Math.max(0, Number(materialState?.wetness || 0));
  const waterloggedStacks = Math.max(Number(materialState?.waterloggedStacks || 0) | 0, Number(info?.waterloggedStacks || 0) | 0, wetness >= 0.35 ? 1 : 0);
  const soggyStacks = Math.max(Number(materialState?.soggyStacks || 0) | 0, Number(info?.soggyStacks || 0) | 0, wetness >= 0.45 ? 1 : 0);
  const dilutedStacks = Math.max(Number(materialState?.dilutedStacks || 0) | 0, Number(info?.dilutedStacks || 0) | 0, wetness >= 0.5 ? 1 : 0);
  const swollenStacks = Math.max(Number(materialState?.swollenStacks || 0) | 0, Number(info?.swollenStacks || 0) | 0, wetness >= 0.55 ? 1 : 0);

  function withRustedTag(label) {
    const base = String(label || "item");
    if (corrosionStacks <= 0) return base;
    if (base.startsWith("[Rusted] ")) return base;
    return `[Rusted] ${base}`;
  }

  function withWaterTags(label) {
    let out = String(label || "item");
    if (waterloggedStacks > 0 && !out.startsWith("[Waterlogged] ")) out = `[Waterlogged] ${out}`;
    if (soggyStacks > 0 && !out.startsWith("[Soggy] ")) out = `[Soggy] ${out}`;
    if (dilutedStacks > 0 && !out.startsWith("[Diluted] ")) out = `[Diluted] ${out}`;
    if (swollenStacks > 0 && !out.startsWith("[Swollen] ")) out = `[Swollen] ${out}`;
    return out;
  }

  if (info && info.type === 'gem') {
    const identity = ni?.identity || '';
    const identified = info.identified === true || (identity && isIdentified(identity));
    if (identified) {
      return withWaterTags(withRustedTag(ni?.name || info.description || info.type || 'gem'));
    }
    // Unidentified gem: show appearance (e.g. "red gem")
    return withWaterTags(withRustedTag(info.appearance || info.description || info.type || 'gem'));
  }

  // Check if this item requires identification
  if (info && requiresIdentification(info)) {
    const identity = ni?.identity || '';
    if (identity && !isIdentified(identity)) {
      return withWaterTags(withRustedTag(getUnidentifiedName(info) || 'Unidentified Item'));
    }
  }

  // Identified or exempt items: true name → description → type fallback
  let name = ni?.name || info?.description || info?.type || 'item';

  // Prepend decay stage for food that has gone off
  const decay = world.get(entityId, FoodDecay);
  if (decay) {
    const { stage } = getDecayStage(decay.turnsHeld, decay.shelfLife);
    if (stage !== 'fresh') {
      const prefix = stage.charAt(0).toUpperCase() + stage.slice(1);
      name = `${prefix} ${name}`;
    }
  }

  name = withWaterTags(withRustedTag(name));

  // Prepend BUC status when identified and beatitude is not the default uncursed
  const beat = world.get(entityId, Beatitude);
  if (beat && beat.state !== 'uncursed') {
    const identity = ni?.identity || '';
    const needsId = info ? requiresIdentification(info) : false;
    const isKnown = !needsId || (identity && isIdentified(identity));
    if (isKnown) {
      name = `${beat.state.charAt(0).toUpperCase() + beat.state.slice(1)} ${name}`;
    }
  }

  return name;
}

/**
 * Resolve affix IDs into display-friendly objects.
 * @param {any[]} rawAffixes
 * @returns {{ id: string, name: string, description: string }[]}
 */
export function resolveAffixes(rawAffixes) {
  return (Array.isArray(rawAffixes) ? rawAffixes : []).map(aid => {
    return { id: aid, name: getAffixName(aid), description: getAffixDescription(aid) };
  });
}

/**
 * @param {string} identity
 * @returns {string}
 */
function spellIdFromIdentity(identity) {
  const raw = String(identity || "").trim();
  if (!raw) return "";
  for (const prefix of ["book_", "scroll_", "wand_", "spell:"]) {
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  return "";
}

function humanizeToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  return raw
    .replace(/^procPackage:/i, "")
    .replace(/^gem_socket:/i, "")
    .replace(/^gem_/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function signedNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n > 0 ? '+' : ''}${n}`;
}

function signedPercent(value) {
  const n = Number(value) * 100;
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function formatAmmoModifier(key, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (key === 'damageMultiplier') return `${signedPercent(n - 1)} damage`;
  if (key === 'fireSpreadChanceBonus') return `${signedPercent(n)} fire spread chance`;
  if (key === 'damageBonus') return `${signedNumber(n)} damage`;
  if (key === 'hazardRadiusBonus') return `${signedNumber(n)} hazard radius`;
  return `${signedNumber(n)} ${humanizeToken(key).toLowerCase()}`;
}

function applyMechanicFormat(format, value) {
  return String(format || '').replace(/\{value\}/g, String(value));
}

function authoredMechanic(format, value, fallbackContext) {
  if (typeof format === 'string') {
    return { context: fallbackContext, text: applyMechanicFormat(format, value) };
  }
  if (!format || typeof format !== 'object') return null;
  const text = applyMechanicFormat(format.format, value);
  const context = String(format.context || fallbackContext).trim();
  return context && text ? { context, text } : null;
}

function formatAmmoMechanics(info, mechanicFormats = {}) {
  const mechanics = [];
  const affinities = info?.ammoAffinities && typeof info.ammoAffinities === 'object'
    ? info.ammoAffinities
    : {};
  const authoredAffinities = mechanicFormats?.ammoAffinities && typeof mechanicFormats.ammoAffinities === 'object'
    ? mechanicFormats.ammoAffinities
    : {};
  for (const [ammoId, modifiers] of Object.entries(affinities)) {
    if (!modifiers || typeof modifiers !== 'object') continue;
    const ammoName = humanizeToken(ammoId).replace(/^Ammo\s+/i, '');
    for (const [key, value] of Object.entries(modifiers)) {
      const authoredFormat = authoredAffinities?.[ammoId]?.[key];
      const authored = authoredMechanic(authoredFormat, value, 'Wearing');
      if (authored) {
        mechanics.push(authored);
        continue;
      }
      const text = formatAmmoModifier(key, value);
      if (ammoName && text) mechanics.push({ context: 'Wearing', text });
    }
  }

  const lootBiases = info?.lootBiases && typeof info.lootBiases === 'object'
    ? info.lootBiases
    : {};
  const authoredLootBiases = mechanicFormats?.lootBiases && typeof mechanicFormats.lootBiases === 'object'
    ? mechanicFormats.lootBiases
    : {};
  for (const [lootId, value] of Object.entries(lootBiases)) {
    const multiplier = Number(value);
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier === 1) continue;
    const lootName = humanizeToken(lootId).replace(/\s+Stack$/i, '');
    const authoredFormat = authoredLootBiases?.[lootId];
    const authored = authoredMechanic(authoredFormat, multiplier, 'Loot');
    if (authored) {
      mechanics.push(authored);
      continue;
    }
    mechanics.push({ context: 'Loot', text: `${lootName} appear at ${multiplier}× weighting` });
  }
  return mechanics;
}

function formatEventKind(value) {
  const key = String(value || "").trim();
  if (!key) return "On Trigger";
  const map = {
    onBeforeHit: "On Before Hit",
    onHit: "On Hit",
    onMiss: "On Miss",
    onDamaged: "On Damaged",
    onTurnStart: "On Turn Start",
    onSpellCast: "On Spell Cast",
    onSpellHit: "On Spell Hit",
  };
  return map[key] || `On ${humanizeToken(key)}`;
}

function formatGate(gate) {
  const kind = String(gate?.kind || "");
  if (kind === "eventKind") return { event: formatEventKind(gate?.a), qualifier: "" };
  if (kind === "chance") {
    const pct = Math.max(0, Math.min(100, Math.round(Number(gate?.b || 0) * 100)));
    return { event: "", qualifier: `${pct}%` };
  }
  if (kind === "critOnly") return { event: "", qualifier: "Crit Only" };
  if (kind === "sourceStatAtLeast") return { event: "", qualifier: `${humanizeToken(gate?.a)} ≥ ${Number(gate?.b || 0)}` };
  if (kind === "targetTag") return { event: "", qualifier: `Target: ${humanizeToken(gate?.a)}` };
  if (kind === "healthBelowPct") {
    const subject = String(gate?.c || "target").toLowerCase() === "source" ? "Source" : "Target";
    const pct = Math.max(0, Math.min(100, Math.round(Number(gate?.b || 0) * 100)));
    return { event: "", qualifier: `${subject} < ${pct}% HP` };
  }
  if (kind === "damageType") return { event: "", qualifier: `Damage: ${humanizeToken(gate?.a)}` };
  if (kind === "hasActionTag") return { event: "", qualifier: `Tag: ${humanizeToken(gate?.a)}` };
  if (kind === "oncePerTurn") return { event: "", qualifier: "Once / Turn" };
  if (kind === "hasCharge") return { event: "", qualifier: `Charges ≥ ${Math.max(1, Number(gate?.b || 1) | 0)}` };
  return { event: "", qualifier: humanizeToken(kind) || "Gate" };
}

function formatEffect(effect) {
  const kind = String(effect?.kind || "");
  if (kind === "bonusDamageFlat") {
    const min = Number(effect?.a || 0);
    const max = Number(effect?.b || min);
    const dtype = humanizeToken(effect?.c || "physical");
    return max > min ? `+${min}-${max} ${dtype} Damage` : `+${min} ${dtype} Damage`;
  }
  if (kind === "bonusDamageScaleFromSourceStat") {
    const stat = humanizeToken(effect?.a || "Stat");
    const factor = Number(effect?.b || 0);
    const dtype = humanizeToken(effect?.c || "physical");
    return `+${stat}×${factor} ${dtype} Damage`;
  }
  if (kind === "addCritChance") return `+${Number(effect?.a || 0)} Crit Chance`;
  if (kind === "restoreResource") {
    const resource = humanizeToken(effect?.a || "resource");
    const amount = Number(effect?.b || 0);
    const target = String(effect?.c || "source").toLowerCase() === "target" ? "Target" : "Source";
    return `Restore ${amount} ${resource} (${target})`;
  }
  if (kind === "applyStatus") {
    const status = humanizeToken(effect?.a || "status");
    const turns = Math.max(0, Number(effect?.b || 0) | 0);
    const potency = Number(effect?.c || 1);
    return `Apply ${status} (${turns}t, p${potency})`;
  }
  if (kind === "attachTimedBuff") {
    const buff = humanizeToken(effect?.a || "buff");
    const turns = Math.max(0, Number(effect?.b || 0) | 0);
    const target = String(effect?.c || "source").toLowerCase() === "target" ? "Target" : "Source";
    return `Buff ${buff} (${turns}t, ${target})`;
  }
  if (kind === "spawnEntity") {
    const who = humanizeToken(effect?.a || "entity");
    const count = Math.max(1, Number(effect?.b || 1) | 0);
    const anchor = humanizeToken(effect?.c || "target");
    return `Spawn ${count} ${who} (${anchor})`;
  }
  if (kind === "consumeCharge") return `Consume ${Math.max(1, Number(effect?.a || 1) | 0)} Charge`;
  const fallbackKind = humanizeToken(kind);
  if (fallbackKind) return fallbackKind;
  const a = String(effect?.a ?? "").trim();
  const b = String(effect?.b ?? "").trim();
  const c = String(effect?.c ?? "").trim();
  const params = [a, b, c].filter(Boolean).join(", ");
  return params ? `Custom Effect (${params})` : "Custom Effect";
}

function packageIdFromScriptRef(ref) {
  const raw = String(ref || "").trim();
  if (!raw) return "";
  return raw.startsWith("procPackage:") ? raw.slice("procPackage:".length) : "";
}

function summarizeProcNode(world, procNodeId, sourceLabel) {
  const gateRows = [];
  const effectRows = [];
  let scriptRef = "";
  for (const childId of children(world, procNodeId)) {
    const gate = world.get(childId, ActivationGate);
    if (gate && gate.enabled !== false) gateRows.push(gate);
    const effect = world.get(childId, ProcEffect);
    if (effect && effect.enabled !== false) effectRows.push(effect);
  }
  const script = world.get(procNodeId, ScriptRef);
  if (script?.ref) scriptRef = String(script.ref);

  let trigger = "On Trigger";
  const qualifiers = [];
  for (const gate of gateRows) {
    const parts = formatGate(gate);
    if (parts.event) trigger = parts.event;
    if (parts.qualifier) qualifiers.push(parts.qualifier);
  }

  const effects = effectRows.map(formatEffect).filter(Boolean);
  if (scriptRef) {
    const packageId = packageIdFromScriptRef(scriptRef);
    const procPackage = packageId ? getProcPackage(packageId) : null;
    if (procPackage) {
      const summary = String(procPackage.summary || "").trim();
      effects.push(summary ? `${procPackage.name}: ${summary}` : `Script: ${procPackage.name}`);
    } else {
      effects.push(`Script: ${humanizeToken(scriptRef)}`);
    }
  }
  if (!effects.length) effects.push("Custom Proc");

  return {
    source: sourceLabel || "Item",
    trigger,
    qualifiers,
    effects,
  };
}

function buildProcNodeSummaries(world, itemId) {
  const out = [];
  const stack = [{ id: itemId, source: "Item" }];
  while (stack.length) {
    const current = stack.pop();
    const entityId = Number(current?.id || 0) | 0;
    if (!(entityId > 0)) continue;
    let nextSource = current?.source || "Item";
    const pkg = world.get(entityId, ProcPackageNode);
    if (pkg?.packageId) nextSource = `Package: ${humanizeToken(pkg.packageId)}`;
    const gem = world.get(entityId, GemSocketNode);
    if (gem?.gemId) nextSource = `Gem: ${humanizeToken(gem.gemId)}`;
    const affix = world.get(entityId, AffixTopologyNode);
    if (affix?.affixId) nextSource = `Affix: ${humanizeToken(affix.affixId)}`;
    const proc = world.get(entityId, ProcNode);
    if (proc && proc.enabled !== false) out.push(summarizeProcNode(world, entityId, nextSource));
    for (const childId of children(world, entityId)) {
      stack.push({ id: childId, source: nextSource });
    }
  }
  return out;
}

function buildProcPackageSummaries(world, itemId) {
  const seen = new Set();
  const out = [];
  const stack = [Number(itemId || 0) | 0];
  while (stack.length) {
    const entityId = stack.pop();
    if (!(entityId > 0) || !world.isAlive?.(entityId)) continue;

    const pkgNode = world.get(entityId, ProcPackageNode);
    if (pkgNode?.packageId) {
      const packageId = String(pkgNode.packageId || "");
      if (packageId && !seen.has(packageId)) {
        seen.add(packageId);
        const spec = getProcPackage(packageId);
        if (spec) {
          out.push({ id: spec.id, name: spec.name, summary: String(spec.summary || "").trim() });
        } else {
          out.push({ id: packageId, name: humanizeToken(packageId), summary: "" });
        }
      }
    }

    for (const childId of children(world, entityId)) stack.push(childId);
  }
  return out;
}

/**
 * Build a standardised display-data object for an item entity.
 * Used by inventory, chest, ground-pickup and any other UI that shows item info.
 * When an item is unidentified, bonuses, affixes, description, and spell details
 * are suppressed so the UI does not reveal hidden properties.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} itemId
 * @returns {object|null}
 */
export function buildItemDisplayData(world, itemId) {
  const info = world.get(itemId, ItemInfo);
  if (!info) return null;
  const ni = world.get(itemId, NamedIdentity);

  // Determine if this item is unidentified
  const identity = ni?.identity || '';
  const needsId = requiresIdentification(info);
  const gemType = String(info?.type || "") === "gem";
  const identified = gemType
    ? (info.identified === true || (identity && isIdentified(identity)))
    : (info.identified === true || !needsId || (identity && isIdentified(identity)));

  const spellId = identified ? spellIdFromIdentity(identity) : "";
  const linkedSpell = spellId ? getSpell(spellId) : null;
  const procPackages = identified ? buildProcPackageSummaries(world, itemId) : [];
  const procPackageDetailLines = procPackages.map((pkg) => {
    const summary = String(pkg?.summary || "").trim();
    return summary ? `Proc: ${pkg.name} - ${summary}` : `Proc: ${pkg.name}`;
  });
  const detailLines = identified
    ? [
        ...(Array.isArray(info.detailLines) ? info.detailLines.map((line) => String(line || "").trim()).filter(Boolean) : []),
        ...(linkedSpell ? describeSpellDetailLines(linkedSpell) : []),
        ...procPackageDetailLines,
      ]
    : [];
  const targetEffects = linkedSpell ? describeSpellTargetEffects(linkedSpell) : [];
  const description = identified
    ? (linkedSpell
        ? String(linkedSpell.description || info.details || info.description || "").trim()
        : String(info.details || info.description || "").trim())
    : "";
  const catalogItem = identified ? getCatalogItem(identity) : null;
  const mechanics = catalogItem?._contentAbilities
    ? Object.values(catalogItem._contentAbilities).map((ability) => {
        const format = String(ability.displayFormat || ability.description || '').trim();
        const text = format.replace(/\{(name|description|range|cooldown|icon)\}/g, (_match, key) => String(ability[key] ?? ''));
        return {
          context: `Use — ${String(ability.name || ability.id || 'Ability')}`,
          text,
        };
      }).filter((mechanic) => mechanic.text)
    : [];
  mechanics.push(...formatAmmoMechanics(info, catalogItem?.mechanicFormats));

  return {
    id: itemId,
    identity,
    type: info.type || 'item',
    name: resolveItemDisplayName(world, itemId),
    slot: info.slot || '',
    count: info.count || 1,
    rarityName: info.rarityName || 'common',
    description,
    bonuses: identified && info.bonuses && typeof info.bonuses === 'object' ? { ...info.bonuses } : {},
    mechanics,
    affixes: identified ? resolveAffixes(info.affixes) : [],
    damageDice: identified ? (info.damageDice || null) : null,
    staminaCost: identified ? (info.staminaCost ?? null) : null,
    twoHanded: identified ? !!info.twoHanded : false,
    coating: identified && info.coating && typeof info.coating === 'object' ? { ...info.coating } : null,
    sockets: Array.isArray(info.sockets) ? info.sockets.slice() : [],
    maxSockets: Number(info.maxSockets || 0) | 0,
    procNodes: identified ? buildProcNodeSummaries(world, itemId) : [],
    spellId: linkedSpell?.id || null,
    detailLines,
    targetEffects,
    identified,
    noQuickChip: info.noQuickChip === true,
    beatitude: identified ? (world.get(itemId, Beatitude)?.state || null) : null,
    weight: Number(info.weight || 0),
  };
}

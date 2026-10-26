import { getCatalogItem } from "./itemCatalog.js";
import { Beatitude } from "../components/Beatitude.js";
import { Consumable } from "../components/Consumable.js";
import { FoodDecay } from "../components/FoodDecay.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Material } from "../components/Material.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Potion } from "../components/Potion.js";
import { attachProcPackage } from "./procPackages.js";
import { ScriptRef } from "../components/ScriptRef.js";
import { ScriptState } from "../components/ScriptState.js";
import { Charges } from "../components/Charges.js";

function cloneWeaponVfxProfile(profile) {
  if (typeof profile === "string") return profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const out = { ...profile };
  if (Array.isArray(profile.alphaStops)) {
    out.alphaStops = profile.alphaStops.map((stop) => Array.isArray(stop) ? [stop[0], stop[1]] : stop);
  }
  return out;
}

/**
 * Build an item entity from the unified item catalog.
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {string} itemId
 * @param {{ affixes?: string[], count?: number }} [opts]
 */
export function buildCatalogItem(world, itemId, opts = {}) {
  const def = getCatalogItem(itemId);
  if (!def) throw new Error(`Unknown item id: ${itemId}`);

  const isEquip = String(def.catalogKind || "") === "equipment";
  const explicitCount = Number(opts.count || 0) | 0;
  const count = explicitCount > 0
    ? explicitCount
    : (isEquip ? 1 : Math.max(1, Number(def.charges || 1) | 0));

  const id = world.create();
  world.add(id, NamedIdentity, { name: def.name, identity: def.id });

  const info = {
    type: def.type || (isEquip ? "equip" : "item"),
    slot: def.slot || "",
    weight: Number(def.weight || 1),
    value: Number(def.value || 0),
    description: def.description || def.desc || def.name || "",
    count,
    bonuses: def.bonuses || {},
    twoHanded: def.twoHanded || false,
    rarity: def.rarity || 1,
    rarityName: def.rarityName || "common",
    affixes: [...new Set([
      ...(Array.isArray(def.affixes) ? def.affixes : []),
      ...(Array.isArray(opts.affixes) ? opts.affixes : []),
    ])],
    sockets: [],
    maxSockets: Number(def.maxSockets || 0) | 0,
    damageDice: def.damageDice || null,
    damageType: def.damageType || null,
    combatFlavor: typeof def.combatFlavor === "string" ? def.combatFlavor : "",
    staminaCost: def.staminaCost ?? null,
    subtype: def.subtype || null,
    range: def.range || null,
    weaponLengthCm: Number(def.weaponLengthCm || 0) > 0 ? (Number(def.weaponLengthCm) | 0) : null,
    weaponVfxProfile: cloneWeaponVfxProfile(def.weaponVfxProfile),
    weaponFamily: typeof def.weaponFamily === "string" ? def.weaponFamily : "",
    identified: def.identified === true,
    noQuickChip: def.noQuickChip === true,
    tags: Array.isArray(def.tags) ? def.tags.slice() : [],
    ammoAffinities: def.ammoAffinities && typeof def.ammoAffinities === "object" ? structuredClone(def.ammoAffinities) : {},
    lootBiases: def.lootBiases && typeof def.lootBiases === "object" ? { ...def.lootBiases } : {},
  };
  world.add(id, ItemInfo, info);
  if (def.chargePool) world.add(id, Charges, { ...def.chargePool });

  if (String(def.type || "").toLowerCase() === "potion") {
    const potionDef = (def.potion && typeof def.potion === "object") ? def.potion : {};
    const beatitude = String(potionDef.beatitude || def.beatitude || "").toLowerCase();
    world.add(id, Potion, {
      name: String(def.name || potionDef.name || "Potion"),
      route: String(potionDef.route || "oral"),
      doses: Math.max(1, Number(potionDef.doses ?? count) | 0),
      channels: Array.isArray(potionDef.channels) ? potionDef.channels.slice() : [],
      effects: Array.isArray(potionDef.effects) ? potionDef.effects.map((e) => ({ ...e })) : [],
      toxicity: (potionDef.toxicity && typeof potionDef.toxicity === "object") ? { ...potionDef.toxicity } : null,
      feel: String(potionDef.feel || ""),
    });
    if (beatitude === "blessed" || beatitude === "uncursed" || beatitude === "cursed") {
      world.add(id, Beatitude, { state: beatitude });
    }
  }

  // General beatitude for non-potion items (e.g. cursed rings, blessed armor)
  if (String(def.type || "").toLowerCase() !== "potion") {
    const beatitude = String(def.beatitude || "").toLowerCase();
    if (beatitude === "blessed" || beatitude === "uncursed" || beatitude === "cursed") {
      world.add(id, Beatitude, { state: beatitude });
    }
  }

  if (typeof def.material === "string" && def.material) {
    world.add(id, Material, { kind: def.material });
  }
  if (typeof def.script === "string" && def.script) {
    world.add(id, ScriptRef, { ref: def.script, params: { from: def.id } });
  }

  const procPackages = [...new Set([
    ...(Array.isArray(def.procPackages) ? def.procPackages : []),
    ...(Array.isArray(opts.procPackages) ? opts.procPackages : []),
  ])];
  for (let i = 0; i < procPackages.length; i++) {
    attachProcPackage(world, id, procPackages[i]);
  }

  // Content-DSL food items: attach Consumable + FoodDecay components
  if (def._contentFood) {
    world.add(id, Consumable, { ...def._contentFood.consumable });
    world.add(id, FoodDecay, { ...def._contentFood.decay });
  }

  // Content-DSL local state: attach ScriptState component
  if (def._contentState) {
    world.add(id, ScriptState, { data: { ...def._contentState } });
  }

  return id;
}

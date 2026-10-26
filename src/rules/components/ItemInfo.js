import { defineComponent } from "../../lib/ecs-js/index.js";
/**
 * ItemInfo — rules-side description of an item.
 * Used for inventory logic, weight calculations, equipment slots, etc.
 * No display names, glyphs, or color info.
 */
export const ItemInfo = defineComponent(
  "ItemInfo",
  {
    type: "", // logical category, e.g. "weapon", "potion", "scroll"
    slot: "", // intended equipment or container slot, e.g. "hand", "bag"
    weight: 0, // numeric weight (for encumbrance or turn cost)
    value: 0, // optional numeric value for trade/scoring
    description: "", // flavor text description of the item
    count: 1, // stacking count; >=1 for any item entity
    bonuses: {}, // flat bonuses: { attack, defense, maxHp, critChance, critMult, ... }
    twoHanded: false, // requires both hands; blocks offhand slot
    rarity: 1,
    rarityName: "common",
    // Legacy compatibility arrays. Runtime affixes/enchantments/sockets should
    // prefer attached topology nodes; see RUNTIME_TOPOLOGY_DOCTRINE.md.
    affixes: [], // list of affix ids applied to this item (rules/data/affixes)
    sockets: [], // gem ids socketed into this item (e.g. ['gem_ruby'])
    maxSockets: 0, // maximum number of gem sockets this item can hold
    weaponLengthCm: null, // physical weapon length in centimeters (rules -> display)
    weaponVfxProfile: null, // density profile key (grip->tip) for weapon VFX
    weaponFamily: "", // semantic weapon family for combat/audio affordances
    noQuickChip: false, // suppress pickup quick-chip UI for this item
    tags: [], // behavioral flags: "conflict", "sunlight", "levitate", etc.
    ammoAffinities: {}, // ammo identity -> projectile modifiers from this gear
    lootBiases: {}, // loot/archetype id -> weight multiplier while equipped
  },
  {
    validate(rec) {
      if (typeof rec.type !== "string")
        throw new Error("ItemInfo.validate(): type must be a string");
      if (typeof rec.slot !== "string")
        throw new Error("ItemInfo.validate(): slot must be a string");
      if (typeof rec.weight !== "number" || rec.weight < 0)
        throw new Error(
          "ItemInfo.validate(): weight must be a non-negative number"
        );
      if (typeof rec.value !== "number" || rec.value < 0)
        throw new Error(
          "ItemInfo.validate(): value must be a non-negative number"
        );
      if (typeof rec.description !== "string")
        throw new Error("ItemInfo.validate(): description must be a string");
      if (!Number.isFinite(rec.count) || rec.count < 1)
        throw new Error("ItemInfo.validate(): count must be >= 1");
      if (rec.bonuses && typeof rec.bonuses !== 'object')
        throw new Error("ItemInfo.validate(): bonuses must be an object");
      if (!Number.isFinite(rec.rarity) || rec.rarity < 1)
        throw new Error("ItemInfo.validate(): rarity must be >= 1");
      if (typeof rec.rarityName !== 'string')
        throw new Error("ItemInfo.validate(): rarityName must be a string");
      if (!Array.isArray(rec.affixes))
        throw new Error("ItemInfo.validate(): affixes must be an array");
      if (typeof rec.noQuickChip !== "boolean")
        throw new Error("ItemInfo.validate(): noQuickChip must be a boolean");
      if (!Array.isArray(rec.tags))
        throw new Error("ItemInfo.validate(): tags must be an array");
      if (!rec.ammoAffinities || typeof rec.ammoAffinities !== 'object' || Array.isArray(rec.ammoAffinities))
        throw new Error("ItemInfo.validate(): ammoAffinities must be an object");
      if (!rec.lootBiases || typeof rec.lootBiases !== 'object' || Array.isArray(rec.lootBiases))
        throw new Error("ItemInfo.validate(): lootBiases must be an object");
      if (rec.weaponLengthCm != null && (!Number.isFinite(rec.weaponLengthCm) || rec.weaponLengthCm <= 0))
        throw new Error("ItemInfo.validate(): weaponLengthCm must be null or a positive number");
      if (rec.weaponVfxProfile != null && typeof rec.weaponVfxProfile !== "string" && typeof rec.weaponVfxProfile !== "object")
        throw new Error("ItemInfo.validate(): weaponVfxProfile must be null, string, or object");
      if (typeof rec.weaponFamily !== "string")
        throw new Error("ItemInfo.validate(): weaponFamily must be a string");
      return true;
    },
  }
);

// src/content/helpers.js
// Shared utilities for the content DSL: dice parsing, template interpolation.

/**
 * Parse a dice expression like "2d6+4", "1d8", "3d4-1", or a plain number.
 * @param {string|number} expr
 * @returns {{ count: number, sides: number, mod: number } | null}
 */
export function parseDice(expr) {
  if (typeof expr === 'number') {
    return Number.isFinite(expr) ? { count: 0, sides: 0, mod: expr | 0 } : null;
  }
  const src = String(expr || "").trim().toLowerCase();
  if (!src) return null;
  const plain = Number(src);
  if (Number.isFinite(plain)) return { count: 0, sides: 0, mod: plain | 0 };
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(src);
  if (!match) return null;
  return {
    count: Math.max(1, Number(match[1]) | 0),
    sides: Math.max(1, Number(match[2]) | 0),
    mod: Number(match[3] || 0) | 0,
  };
}

/**
 * Roll a dice expression using the provided RNG function.
 * @param {() => number} rng - returns [0, 1)
 * @param {string|number} expr - "2d6+4", "1d8", 10, etc.
 * @returns {number}
 */
export function rollWith(rng, expr) {
  const parsed = parseDice(expr);
  if (!parsed) return 0;
  let total = parsed.mod;
  for (let i = 0; i < parsed.count; i++) {
    total += 1 + Math.floor(rng() * parsed.sides);
  }
  return total;
}

/**
 * Interpolate a template string with named bindings.
 * Replaces {key} tokens. Unmatched tokens are left as-is.
 * @param {string} template - e.g. "{user} drinks the {item}."
 * @param {Record<string, string|number>} bindings
 * @returns {string}
 */
export function interpolate(template, bindings) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => {
    const val = bindings[key];
    return val != null ? String(val) : match;
  });
}

/**
 * Infer catalogKind and slot from a DSL item type string.
 * @param {string} type
 * @returns {{ catalogKind: string, slot: string, itemType: string }}
 */
export function inferItemCategory(type) {
  const t = String(type || "").toLowerCase();
  switch (t) {
    case 'weapon':
      return { catalogKind: 'equipment', slot: 'weapon', itemType: 'equip' };
    case 'armor': case 'chest':
      return { catalogKind: 'equipment', slot: 'armor', itemType: 'equip' };
    case 'helm': case 'helmet':
      return { catalogKind: 'equipment', slot: 'helm', itemType: 'equip' };
    case 'shield':
      return { catalogKind: 'equipment', slot: 'shield', itemType: 'equip' };
    case 'boots': case 'feet':
      return { catalogKind: 'equipment', slot: 'feet', itemType: 'equip' };
    case 'gloves':
      return { catalogKind: 'equipment', slot: 'gloves', itemType: 'equip' };
    case 'ring':
      return { catalogKind: 'equipment', slot: 'ring', itemType: 'equip' };
    case 'amulet': case 'neck':
      return { catalogKind: 'equipment', slot: 'neck', itemType: 'equip' };
    case 'belt':
      return { catalogKind: 'equipment', slot: 'belt', itemType: 'equip' };
    case 'legs':
      return { catalogKind: 'equipment', slot: 'legs', itemType: 'equip' };
    case 'offhand':
      return { catalogKind: 'equipment', slot: 'offhand', itemType: 'equip' };
    case 'ranged':
      return { catalogKind: 'equipment', slot: 'ranged', itemType: 'equip' };
    case 'head':
      return { catalogKind: 'equipment', slot: 'head', itemType: 'equip' };
    case 'potion':
      return { catalogKind: 'magic', slot: 'bag', itemType: 'potion' };
    case 'scroll':
      return { catalogKind: 'magic', slot: 'bag', itemType: 'scroll' };
    case 'wand':
      return { catalogKind: 'magic', slot: 'bag', itemType: 'wand' };
    case 'food':
      return { catalogKind: 'food', slot: 'bag', itemType: 'food' };
    case 'tool':
      return { catalogKind: 'magic', slot: 'bag', itemType: 'tool' };
    case 'learn':
      return { catalogKind: 'magic', slot: 'bag', itemType: 'learn' };
    case 'book':
      return { catalogKind: 'magic', slot: 'bag', itemType: 'book' };
    case 'material':
      return { catalogKind: 'material', slot: 'bag', itemType: 'material' };
    case 'ingredient':
      return { catalogKind: 'material', slot: 'bag', itemType: 'ingredient' };
    case 'seed':
      return { catalogKind: 'seed', slot: 'bag', itemType: 'seed' };
    case 'utility':
      return { catalogKind: 'utility', slot: 'bag', itemType: 'utility' };
    case 'fuel':
      return { catalogKind: 'fuel', slot: 'bag', itemType: 'fuel' };
    case 'junk':
      return { catalogKind: 'junk', slot: 'bag', itemType: 'junk' };
    default:
      return { catalogKind: 'magic', slot: 'bag', itemType: t || 'item' };
  }
}

/** Standard shelf-life constants matching Food.js */
export const SHELF_LIFE = Object.freeze({
  ration:  5040, // 7 days at TURNS_PER_DAY=720
  short:   720,  // 1 day
  medium:  2160, // 3 days
  long:    5040, // 7 days
  iron:    10080, // 14 days
});

/** Standard rarity tiers. */
export const RARITY = Object.freeze({
  common:    { rarity: 1, rarityName: 'common' },
  uncommon:  { rarity: 2, rarityName: 'uncommon' },
  // `magic` is the one legacy rarity spelling still accepted for old authored
  // content. It normalizes into the green uncommon slot; unique/artifact are
  // semantic tags, not visible rarity tiers.
  magic:     { rarity: 2, rarityName: 'uncommon' },
  rare:      { rarity: 3, rarityName: 'rare' },
  epic:      { rarity: 4, rarityName: 'epic' },
  legendary: { rarity: 5, rarityName: 'legendary' },
});

/**
 * Resolve a rarity string or number into { rarity, rarityName }.
 * @param {string|number|undefined} input
 * @returns {{ rarity: number, rarityName: string }}
 */
export function resolveRarity(input) {
  if (typeof input === 'string') {
    return RARITY[input.toLowerCase()] || RARITY.common;
  }
  if (typeof input === 'number') {
    for (const r of Object.values(RARITY)) {
      if (r.rarity === input) return r;
    }
  }
  return RARITY.common;
}

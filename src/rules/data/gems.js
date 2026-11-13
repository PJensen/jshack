// rules/data/gems.js
// Gem definitions. Each gem has a true identity, an appearance (color), a value,
// weight, hardness, probability weight, and material.
// Future: unidentified gems show only their appearance ("White Gem"), requiring
// identification (touchstone, scroll) to reveal their true name.

/**
 * @typedef {Object} GemDef
 * @property {string} id
 * @property {string} name         - true name
 * @property {string} appearance   - color-based description (for future ID system)
 * @property {number} value        - sale value in gold
 * @property {number} weight
 * @property {'hard'|'soft'} hardness
 * @property {number} prob         - relative probability weight
 * @property {string} material - mineral material id (e.g. 'diamond', 'corundum', 'glass', 'quartz', 'stone')
 */

/** @type {Record<string, GemDef>} */
export const GEM_DEFS = {
  // ── Precious gemstones ─────────────────────────────────────────────
  gem_dilithium:   { id: 'gem_dilithium',   name: 'Dilithium Crystal',   appearance: 'White Gem',           value: 4500, weight: 1, hardness: 'soft', prob: 2,   material: 'gemstone' },
  gem_diamond:     { id: 'gem_diamond',     name: 'Diamond',             appearance: 'White Gem',           value: 4000, weight: 1, hardness: 'hard', prob: 3,   material: 'diamond',    socketable: true, socketAffixId: 'gem_socket:diamond' },
  gem_ruby:        { id: 'gem_ruby',        name: 'Ruby',                appearance: 'Red Gem',             value: 3500, weight: 1, hardness: 'hard', prob: 4,   material: 'corundum',   socketable: true, socketAffixId: 'gem_socket:ruby' },
  gem_jacinth:     { id: 'gem_jacinth',     name: 'Jacinth Stone',       appearance: 'Orange Gem',          value: 3250, weight: 1, hardness: 'hard', prob: 3,   material: 'zircon',     socketable: true, socketAffixId: 'gem_socket:jacinth' },
  gem_sapphire:    { id: 'gem_sapphire',    name: 'Sapphire',            appearance: 'Blue Gem',            value: 3000, weight: 1, hardness: 'hard', prob: 4,   material: 'corundum',   socketable: true, socketAffixId: 'gem_socket:sapphire' },
  gem_black_opal:  { id: 'gem_black_opal',  name: 'Black Opal',          appearance: 'Black Gem',           value: 2500, weight: 1, hardness: 'hard', prob: 3,   material: 'opal' },
  gem_emerald:     { id: 'gem_emerald',     name: 'Emerald',             appearance: 'Green Gem',           value: 2500, weight: 1, hardness: 'hard', prob: 5,   material: 'beryl',      socketable: true, socketAffixId: 'gem_socket:emerald' },
  gem_turquoise:   { id: 'gem_turquoise',   name: 'Turquoise Stone',     appearance: 'Green Gem',           value: 2000, weight: 1, hardness: 'soft', prob: 6,   material: 'turquoise' },
  gem_citrine:     { id: 'gem_citrine',     name: 'Citrine Stone',       appearance: 'Yellow Gem',          value: 1500, weight: 1, hardness: 'soft', prob: 4,   material: 'quartz' },
  gem_aquamarine:  { id: 'gem_aquamarine',  name: 'Aquamarine Stone',    appearance: 'Green Gem',           value: 1500, weight: 1, hardness: 'hard', prob: 6,   material: 'beryl',      socketable: true, socketAffixId: 'gem_socket:aquamarine' },
  gem_amber:       { id: 'gem_amber',       name: 'Amber Stone',         appearance: 'Yellowish Brown Gem', value: 1000, weight: 1, hardness: 'soft', prob: 8,   material: 'amber' },
  gem_topaz:       { id: 'gem_topaz',       name: 'Topaz Stone',         appearance: 'Yellowish Brown Gem', value: 900,  weight: 1, hardness: 'hard', prob: 10,  material: 'topaz',      socketable: true, socketAffixId: 'gem_socket:topaz' },
  gem_jet:         { id: 'gem_jet',         name: 'Jet Stone',           appearance: 'Black Gem',           value: 850,  weight: 1, hardness: 'soft', prob: 6,   material: 'jet' },
  gem_opal:        { id: 'gem_opal',        name: 'Opal',                appearance: 'White Gem',           value: 800,  weight: 1, hardness: 'soft', prob: 12,  material: 'opal',       socketable: true, socketAffixId: 'gem_socket:opal' },
  gem_chrysoberyl: { id: 'gem_chrysoberyl', name: 'Chrysoberyl Stone',   appearance: 'Yellow Gem',          value: 700,  weight: 1, hardness: 'soft', prob: 8,   material: 'chrysoberyl' },
  gem_garnet:      { id: 'gem_garnet',      name: 'Garnet Stone',        appearance: 'Red Gem',             value: 700,  weight: 1, hardness: 'soft', prob: 12,  material: 'garnet',     socketable: true, socketAffixId: 'gem_socket:garnet' },
  gem_amethyst:    { id: 'gem_amethyst',    name: 'Amethyst Stone',      appearance: 'Violet Gem',          value: 600,  weight: 1, hardness: 'soft', prob: 14,  material: 'quartz',     socketable: true, socketAffixId: 'gem_socket:amethyst' },
  gem_jasper:      { id: 'gem_jasper',      name: 'Jasper Stone',        appearance: 'Red Gem',             value: 500,  weight: 1, hardness: 'soft', prob: 15,  material: 'quartz' },
  gem_fluorite:    { id: 'gem_fluorite',    name: 'Fluorite Stone',      appearance: 'Green Gem',           value: 400,  weight: 1, hardness: 'soft', prob: 15,  material: 'fluorite',   socketable: true, socketAffixId: 'gem_socket:fluorite' },
  gem_jade:        { id: 'gem_jade',        name: 'Jade Stone',          appearance: 'Green Gem',           value: 300,  weight: 1, hardness: 'soft', prob: 10,  material: 'jadeite' },
  gem_obsidian:    { id: 'gem_obsidian',    name: 'Obsidian Stone',      appearance: 'Black Gem',           value: 200,  weight: 1, hardness: 'soft', prob: 9,   material: 'obsidian',   socketable: true, socketAffixId: 'gem_socket:obsidian' },
  gem_voidstone:   { id: 'gem_voidstone',   name: 'Voidstone',           appearance: 'Black Gem',           value: 5000, weight: 1, hardness: 'hard', prob: 1,   material: 'voidstone',  socketable: true, socketAffixId: 'gem_socket:voidstone' },
  gem_agate:       { id: 'gem_agate',       name: 'Agate Stone',         appearance: 'Orange Gem',          value: 200,  weight: 1, hardness: 'soft', prob: 12,  material: 'quartz' },

  // ── Worthless glass (look like gems when unidentified) ─────────────
  glass_white:     { id: 'glass_white',     name: 'Worthless Piece of White Glass',           appearance: 'White Gem',           value: 0, weight: 1, hardness: 'soft', prob: 77, material: 'glass' },
  glass_blue:      { id: 'glass_blue',      name: 'Worthless Piece of Blue Glass',            appearance: 'Blue Gem',            value: 0, weight: 1, hardness: 'soft', prob: 77, material: 'glass' },
  glass_red:       { id: 'glass_red',       name: 'Worthless Piece of Red Glass',             appearance: 'Red Gem',             value: 0, weight: 1, hardness: 'soft', prob: 77, material: 'glass' },
  glass_brown:     { id: 'glass_brown',     name: 'Worthless Piece of Yellowish Brown Glass', appearance: 'Yellowish Brown Gem', value: 0, weight: 1, hardness: 'soft', prob: 77, material: 'glass' },
  glass_orange:    { id: 'glass_orange',    name: 'Worthless Piece of Orange Glass',          appearance: 'Orange Gem',          value: 0, weight: 1, hardness: 'soft', prob: 76, material: 'glass' },
  glass_yellow:    { id: 'glass_yellow',    name: 'Worthless Piece of Yellow Glass',          appearance: 'Yellow Gem',          value: 0, weight: 1, hardness: 'soft', prob: 77, material: 'glass' },
  glass_black:     { id: 'glass_black',     name: 'Worthless Piece of Black Glass',           appearance: 'Black Gem',           value: 0, weight: 1, hardness: 'soft', prob: 76, material: 'glass' },
  glass_green:     { id: 'glass_green',     name: 'Worthless Piece of Green Glass',           appearance: 'Green Gem',           value: 0, weight: 1, hardness: 'soft', prob: 77, material: 'glass' },
  glass_violet:    { id: 'glass_violet',    name: 'Worthless Piece of Violet Glass',          appearance: 'Violet Gem',          value: 0, weight: 1, hardness: 'soft', prob: 77, material: 'glass' },

  // ── Gray stones ────────────────────────────────────────────────────
  stone_luckstone:  { id: 'stone_luckstone',  name: 'Luckstone',    appearance: 'Gray Stone', value: 60,  weight: 10,  hardness: 'soft', prob: 10,  material: 'quartz' },
  stone_loadstone:  { id: 'stone_loadstone',  name: 'Loadstone',    appearance: 'Gray Stone', value: 1,   weight: 500, hardness: 'soft', prob: 10,  material: 'iron' },
  stone_touchstone: { id: 'stone_touchstone', name: 'Touchstone',   appearance: 'Gray Stone', value: 45,  weight: 10,  hardness: 'soft', prob: 8,   material: 'quartz' },
  stone_flint:      { id: 'stone_flint',      name: 'Flint Stone',  appearance: 'Gray Stone', value: 1,   weight: 10,  hardness: 'soft', prob: 10,  material: 'quartz' },
  stone_rock:       { id: 'stone_rock',       name: 'Rock',         appearance: 'Rock',       value: 0,   weight: 10,  hardness: 'soft', prob: 100, material: 'stone' },
};

export function getGem(id) { return GEM_DEFS[id] || null; }
export function listGems() { return Object.values(GEM_DEFS); }
export function listGemIds() { return Object.keys(GEM_DEFS); }

export function isRealGemstone(gem) {
  return !!gem && typeof gem.id === "string" && gem.id.startsWith("gem_") && Number(gem.value) > 0;
}

function matchesGemMaterial(gem, materialTag) {
  const tag = String(materialTag || "").toLowerCase();
  if (!tag) return false;
  if (tag === "gemstone") return isRealGemstone(gem);
  if (tag === "glass") return String(gem.material || "").toLowerCase() === "glass";
  return String(gem.material || "").toLowerCase() === tag;
}

const GEM_SOCKET_DETAIL_LINES = Object.freeze({
  gem_diamond: Object.freeze([
    "Socketed: +2 attack, +2 defense.",
    "On hit: 20% chance to deal 2-3 bonus damage.",
  ]),
  gem_ruby: Object.freeze([
    "Socketed: +10% fire resist.",
    "On hit: 25% chance to ignite the target.",
  ]),
  gem_sapphire: Object.freeze([
    "Socketed: +1 defense.",
    "On hit: 20% chance to inflict frost.",
  ]),
  gem_emerald: Object.freeze([
    "Socketed: +10% poison resist.",
    "On hit: 20% chance to poison the target.",
  ]),
  gem_topaz: Object.freeze([
    "Socketed: +1 attack.",
    "On hit: 20% chance to shock the target.",
  ]),
  gem_amethyst: Object.freeze([
    "Socketed: +1 mana regeneration.",
    "On hit: 20% chance to restore 2 mana.",
  ]),
  gem_opal: Object.freeze([
    "Socketed: +1 luck.",
    "On hit: 15% chance for +5% crit on the next attack.",
  ]),
  gem_obsidian: Object.freeze([
    "Socketed: +2 kinetic damage reduction.",
    "On hit: 20% chance to weaken the target.",
  ]),
  gem_garnet: Object.freeze([
    "Socketed: +20% fire resist.",
    "On hit: 25% chance to ignite the target.",
  ]),
  gem_jacinth: Object.freeze([
    "Socketed: +10% acid resist.",
    "On hit: 20% chance to inflict agony.",
  ]),
  gem_aquamarine: Object.freeze([
    "Socketed: +0.5 mana regeneration.",
    "On hit: 20% chance to cause bleeding.",
  ]),
  gem_voidstone: Object.freeze([
    "Socketed: +3 attack, +3 damage power.",
    "On hit: 25% chance to drain 3 HP from the target.",
  ]),
  gem_fluorite: Object.freeze([
    "Socketed: +20 electrical resistance.",
    "Absorbs electric energy (taking lightning damage, fighting near a shrine in good standing).",
    "At 3+ charges: next hit discharges as blinding phosphorescent flash — bonus electric damage + blinds target.",
  ]),
});

/**
 * @param {string|GemDef|undefined|null} gemOrId
 * @returns {GemDef|null}
 */
function resolveGemDef(gemOrId) {
  if (!gemOrId) return null;
  if (typeof gemOrId === "string") return getGem(gemOrId);
  if (typeof gemOrId === "object" && typeof gemOrId.id === "string") return gemOrId;
  return null;
}

/**
 * @param {string|GemDef|undefined|null} gemOrId
 * @returns {string[]}
 */
export function describeGemDetailLines(gemOrId) {
  const gem = resolveGemDef(gemOrId);
  if (!gem) return [];
  return GEM_SOCKET_DETAIL_LINES[gem.id] ? [...GEM_SOCKET_DETAIL_LINES[gem.id]] : [];
}

/**
 * @param {string|GemDef|undefined|null} gemOrId
 * @returns {{ context:string, text:string }[]}
 */
export function describeGemMechanics(gemOrId) {
  return describeGemDetailLines(gemOrId).flatMap((line) => {
    const match = String(line || '').match(/^([^:]+):\s*(.*)$/);
    if (!match || !match[2].trim()) return [];
    return [{
      context: match[1].trim() === 'Socketed' ? 'Socket' : match[1].trim(),
      text: match[2].trim(),
    }];
  });
}

/**
 * @param {string|GemDef|undefined|null} gemOrId
 * @param {{ identified?: boolean }} [opts]
 * @returns {null|{ name:string, identity:string, weight:number, value:number, appearance:string, description:string, details:string, detailLines:string[], identified:boolean }}
 */
export function buildGemItemParams(gemOrId, opts = {}) {
  const gem = resolveGemDef(gemOrId);
  if (!gem) return null;
  const detailLines = describeGemDetailLines(gem);
  return {
    name: gem.name,
    identity: gem.id,
    weight: gem.weight,
    value: gem.value,
    appearance: gem.appearance,
    description: gem.appearance,
    details: detailLines.join(" "),
    detailLines,
    identified: opts.identified === true,
  };
}

/**
 * Pick a random gem using probability weights.
 * @param {Object} rng - createRng() instance
 * @param {Object} [opts]
 * @param {string[]} [opts.materials] - restrict to these materials (e.g. ['gemstone'])
 * @returns {GemDef}
 */
export function pickGem(rng, opts = {}) {
  let pool = Object.values(GEM_DEFS);
  if (opts.materials) pool = pool.filter(g => opts.materials.some((m) => matchesGemMaterial(g, m)));
  const total = pool.reduce((s, g) => s + g.prob, 0);
  let roll = rng.float(0, total);
  for (const gem of pool) {
    roll -= gem.prob;
    if (roll <= 0) return gem;
  }
  return pool[pool.length - 1];
}

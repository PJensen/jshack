// rules/data/classes.js
// Player class definitions. Pure data — no behavior, no display.

export const CLASS_DEFS = {
  warden: {
    id: 'warden',
    name: 'Warden',
    icon: '🛡️',
    description: 'A brute devoted to slaughter. Every kill is an offering.',
    deityId: 'molkhar',
    stats: {
      maxHp: 33,
      maxMana: 20,
      manaRegen: 0.05,
      maxStamina: 130,
      staminaRegen: 3.75,
      intelligence: 6,
      dexterity: 12,
      visionRange: 6,
    },
    equipment: {
      weapon: 'axe_heavy',
      armor: 'leather_armor',
      offhand: null,
      feet: 'boots_leather',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'savage_strike',   // 🦬 generator: free melee, +20 stamina
      'cleave',          // 🪓 spender: AoE sweep, hits all adjacent hostiles
    ],
  },

  druid: {
    id: 'druid',
    name: 'Druid',
    icon: '🌿',
    description: 'A guardian of nature. Communes with the wild, heals the wounded.',
    deityId: 'gaia',
    stats: {
      maxHp: 23,
      maxMana: 70,
      manaRegen: 0.15,
      maxStamina: 80,
      staminaRegen: 2.25,
      intelligence: 12,
      dexterity: 14,
      visionRange: 6,
    },
    equipment: {
      weapon: 'staff_oak',
      armor: 'leather_armor',
      offhand: null,
      feet: 'sandals_hemp',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'natures_touch',   // 🌿 generator: free ranged, +8 mana
      'barkskin',        // 🌳 buff: +2 AC, thorns, regen
    ],
  },

  outlaw: {
    id: 'outlaw',
    name: 'Outlaw',
    icon: '🗡️',
    description: 'Quick, slippery, unreliable. Loki loves a good con.',
    deityId: 'loki',
    stats: {
      maxHp: 20,
      maxMana: 35,
      manaRegen: 0.12,
      maxStamina: 110,
      staminaRegen: 3.3,
      intelligence: 10,
      dexterity: 16,
      visionRange: 6,
      perception: 7,
    },
    equipment: {
      weapon: 'dagger_quick',
      armor: 'leather_armor',
      offhand: null,
      feet: 'boots_leather',
      ranged: 'bow_short',
      ammo: 'ammo_arrows',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'scroll_blastwave', count: 1 },
      { itemId: 'potion_poison', count: 2 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
      { itemId: 'ammo_arrows', count: 1 },
      { itemId: 'ammo_blunt_arrows', count: 1 },
      { itemId: 'ammo_fire_arrows', count: 1 }
    ],
    startingSpells: [
      'cheap_shot',      // 👊 generator: free melee, +10 mana
      'poison_blade',    // utility: coat weapon in venom
    ],
  },

  archeologist: {
    id: 'archeologist',
    name: 'Archeologist',
    icon: '⛏️',
    description: 'A scholar of ruins. Digs deep, identifies relics, and trusts in luck.',
    deityId: 'gaia',
    stats: {
      maxHp: 22,
      maxMana: 30,
      manaRegen: 0.08,
      maxStamina: 100,
      staminaRegen: 3.0,
      intelligence: 11,
      dexterity: 16,
      visionRange: 6,
    },
    equipment: {
      weapon: 'iron_pickaxe',
      armor: 'leather_armor',
      offhand: null,
      neck: 'pendant_lucky',
      feet: 'boots_leather',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'stone_touchstone', count: 1 },
      { itemId: 'potion_anti_venom', count: 2 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [],
  },

  warlock: {
    id: 'warlock',
    name: 'Warlock',
    icon: '🔮',
    description: 'A dark conjurer bound to forces beyond the veil. Commands the dead and channels hellfire through a familiar.',
    deityId: 'molkhar',
    stats: {
      maxHp: 22,
      maxMana: 65,
      manaRegen: 0.14,
      maxStamina: 75,
      staminaRegen: 2.0,
      intelligence: 13,
      dexterity: 12,
      visionRange: 6,
    },
    equipment: {
      weapon: 'staff_oak',
      armor: null,
      offhand: null,
      gloves: 'gloves_arcane',
      feet: 'shoes_cloth',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'agony',     // core ranged damage
      'shadow_bolt',         // generator: sacrifice HP → mana
    ],
  },

  necromancer: {
    id: 'necromancer',
    name: 'Necromancer',
    icon: '💀',
    description: 'A gravebinder who turns fallen enemies into temporary allies. Every corpse is a choice.',
    deityId: 'molkhar',
    stats: {
      maxHp: 21,
      maxMana: 60,
      manaRegen: 0.14,
      maxStamina: 80,
      staminaRegen: 2.0,
      intelligence: 14,
      dexterity: 12,
      visionRange: 6,
    },
    equipment: {
      weapon: 'staff_oak',
      armor: null,
      offhand: null,
      gloves: 'gloves_arcane',
      feet: 'shoes_cloth',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'agony',
      'summon_skeleton',
    ],
  },

  mage: {
    id: 'mage',
    name: 'Mage',
    icon: '🔥',
    description: 'Pure elemental destruction. Glass cannon — lowest HP, highest mana.',
    deityId: 'loki',
    stats: {
      maxHp: 18,
      maxMana: 75,
      manaRegen: 0.16,
      maxStamina: 70,
      staminaRegen: 1.8,
      intelligence: 15,
      dexterity: 11,
      visionRange: 6,
    },
    equipment: {
      weapon: 'staff_oak',
      armor: null,
      offhand: null,
      gloves: 'gloves_arcane',
      feet: 'shoes_cloth',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'frost',    // core: frost projectile + slow
      'evocation'       // ✨ channel: stand still, restore mana over time
    ],
  },

  mireborn: {
    id: 'mireborn',
    name: 'Mireborn',
    icon: '🪷',
    description: 'Swamp-born and thick-skinned. Poisons, entangles, and outlasts.',
    deityId: 'gaia',
    stats: {
      maxHp: 28,
      maxMana: 35,
      manaRegen: 0.08,
      maxStamina: 100,
      staminaRegen: 3.0,
      intelligence: 9,
      dexterity: 13,
      visionRange: 6,
    },
    equipment: {
      weapon: 'morningstar',
      armor: 'leather_armor',
      offhand: null,
      feet: 'boots_leather',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'potion_anti_venom', count: 2 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'leech_spores',    // 🍄 generator: free ranged, +6 mana +10 stam
      'entangle',        // 🔗 CC: targeted stun + poison
    ],
  },

  pilgrim: {
    id: 'pilgrim',
    name: 'Pilgrim',
    icon: '🙏',
    description: 'Wandering ascetic. Starts with almost nothing — rewards exploration and patience.',
    deityId: 'seraphine',
    stats: {
      maxHp: 19,
      maxMana: 45,
      manaRegen: 0.18,
      maxStamina: 90,
      staminaRegen: 2.5,
      intelligence: 11,
      dexterity: 12,
      visionRange: 6,
      perception: 8,
    },
    equipment: {
      weapon: 'staff_oak',
      armor: null,
      offhand: null,
      feet: 'sandals_hemp',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [],
  },

  cleric: {
    id: 'cleric',
    name: 'Cleric',
    icon: '✨',
    description: 'Devoted to Seraphine. Shields the faithful, smites the wicked.',
    deityId: 'seraphine',
    stats: {
      maxHp: 25,
      maxMana: 55,
      manaRegen: 0.13,
      maxStamina: 90,
      staminaRegen: 2.7,
      intelligence: 10,
      dexterity: 12,
      visionRange: 6,
    },
    equipment: {
      weapon: 'iron_mace',
      armor: 'leather_armor',
      offhand: 'shield_wood',
      feet: 'shoes_cloth',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'potion_holy_water', count: 1 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'holy_strike',     // ☀️ generator: free melee, +8 mana
      'smite',           // core: ranged holy damage
    ],
  },

  valkyrie: {
    id: 'valkyrie',
    name: 'Valkyrie',
    icon: '🪽',
    glyph: '@',
    description: 'Death-aware and fate-bound. Reads the shape of battle and draws strength from those who fall nearby.',
    deityId: 'seraphine',
    stats: {
      maxHp: 27,
      maxMana: 45,
      manaRegen: 0.11,
      maxStamina: 105,
      staminaRegen: 3.15,
      intelligence: 10,
      dexterity: 14,
      visionRange: 6,
      luck: 2,
    },
    equipment: {
      weapon: 'sword_plain',
      armor: 'leather_armor',
      offhand: null,
      feet: 'boots_leather',
    },
    inventoryItems: [
      { itemId: 'hearthstone', count: 1 },
      { itemId: 'potion_health', count: 2 },
      { itemId: 'potion_mana', count: 3 },
      { itemId: 'potion_holy_water', count: 1 },
      { itemId: 'lockpick', count: 5 },
      { itemId: 'scroll_identify', count: 4 },
    ],
    startingSpells: [
      'holy_strike',
      'smite',
    ],
    fate: {
      deathAware: true,
      nearbyDeathPower: true,
      corpseDisposition: 'chooser',
      draugrDisposition: 'judgment',
    },
  },
};

/** @param {string} id */
export function getClass(id) {
  return CLASS_DEFS[id] ?? null;
}

/** @returns {string[]} */
export function listClassIds() {
  return Object.keys(CLASS_DEFS);
}

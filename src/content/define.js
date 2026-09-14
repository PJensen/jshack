// src/content/define.js
// Content DSL builders: defineItem(), defineMonster(), and defineInteractable().
// Each call compiles a single definition object into engine-compatible
// registrations (catalog entry, palette entry, monster def, hooks).

import { registerItem, registerMonster, registerEncounter, registerInteractable, registerPalette, registerPresentation, registerAbility } from './registry.js';
import { registerMonsterDef } from '../rules/data/monsters.js';
import { compileHook, ScriptCtx } from './scriptCtx.js';
import { createWorldFacade } from './worldFacade.js';
import { inferItemCategory, resolveRarity, SHELF_LIFE } from './helpers.js';
import { resolveWeaponFamily } from '../rules/data/weaponFamilies.js';
import { resolveWeaponVisualMeta, isWeaponCatalogItem } from '../rules/data/weaponVisuals.js';
import { clamp } from '../shared/math/math.js';
import { normalizePolymorphStability } from '../rules/components/PolymorphProfile.js';

// ── Hook names the DSL recognises, mapped to catalog hook keys ──────
const ITEM_HOOK_MAP = {
  onUse:       'on_use',
  onDrink:     'on_drink',
  onThrow:     'on_throw',
  onDip:       'on_dip',
  beforeUse:   'before_use',
  afterUse:    'after_use',
  beforeDrink: 'before_drink',
  afterDrink:  'after_drink',
  beforeThrow: 'before_throw',
  afterThrow:  'after_throw',
};

export function defineInteractable(action, def) {
  if (!action || typeof action !== 'string') throw new Error('[defineInteractable] action is required');
  if (!def || typeof def !== 'object') throw new Error(`[defineInteractable "${action}"] definition is required`);
  const hasHook = ['beforeInteract', 'onInteract', 'afterInteract'].some((name) => typeof def[name] === 'function');
  const verbs = (def.verbs && typeof def.verbs === 'object') ? { ...def.verbs } : null;
  if (!hasHook && !verbs) throw new Error(`[defineInteractable "${action}"] requires hooks or verb rules`);
  if (def.actions != null && !Array.isArray(def.actions) && typeof def.actions !== 'function') {
    throw new Error(`[defineInteractable "${action}"] actions must be an array or function`);
  }
  if (def.affordance != null && typeof def.affordance !== 'object' && typeof def.affordance !== 'function') {
    throw new Error(`[defineInteractable "${action}"] affordance must be an object or function`);
  }
  if (verbs) {
    for (const [verb, rule] of Object.entries(verbs)) {
      if (!rule || typeof rule !== 'object' || typeof rule.apply !== 'function') {
        throw new Error(`[defineInteractable "${action}"] verb "${verb}" is not a rule`);
      }
      if (String(rule.verb || '') !== verb) {
        throw new Error(`[defineInteractable "${action}"] verb key "${verb}" does not match rule verb "${rule.verb}"`);
      }
    }
  }
  const compiled = Object.freeze({
    beforeInteract: typeof def.beforeInteract === 'function' ? def.beforeInteract : null,
    onInteract: typeof def.onInteract === 'function' ? def.onInteract : null,
    afterInteract: typeof def.afterInteract === 'function' ? def.afterInteract : null,
    actions: def.actions || null,
    affordance: def.affordance || null,
    defaultVerb: String(def.defaultVerb || ''),
    verbs: verbs ? Object.freeze(verbs) : null,
  });
  registerInteractable(action, compiled);
  return action;
}

// ═══════════════════════════════════════════════════════════════════
//  defineEncounter()
// ═══════════════════════════════════════════════════════════════════

/**
 * Define how one or more creatures enter the world.
 *
 * Encounter definitions intentionally live beside, rather than inside,
 * monster definitions. A creature can have several manifestations: a normal
 * population entry, a guarded hoard, or a heroic singleton.
 *
 * @param {string} id
 * @param {object} def
 * @returns {string}
 */
export function defineEncounter(id, def) {
  if (!id || typeof id !== 'string') throw new Error('[defineEncounter] id is required');
  if (!def || typeof def !== 'object') throw new Error(`[defineEncounter "${id}"] definition is required`);
  const kind = String(def.kind || '');
  if (!kind) throw new Error(`[defineEncounter "${id}"] kind is required`);
  if (kind !== 'overworld_population' && kind !== 'dungeon_group' && kind !== 'singleton') {
    throw new Error(`[defineEncounter "${id}"] unknown kind "${kind}"`);
  }
  if (kind !== 'dungeon_group' && !def.creatureId) {
    throw new Error(`[defineEncounter "${id}"] creatureId is required for ${kind}`);
  }
  const compiled = {
    ...def,
    id,
    kind,
    creatureId: def.creatureId ? String(def.creatureId) : '',
    followers: Array.isArray(def.followers) ? def.followers.map((f) => ({ ...f })) : undefined,
    activation: def.activation && typeof def.activation === 'object' ? { ...def.activation } : null,
    placement: def.placement && typeof def.placement === 'object' ? { ...def.placement } : null,
  };
  registerEncounter(id, Object.freeze(compiled));
  return id;
}

/**
 * Compile DSL hook functions into catalog-compatible hook entries.
 * Each DSL hook `(ctx: ScriptCtx) => void` becomes
 * `(ictx, state) => result` via compileHook.
 */
function compileItemHooks(def) {
  const hooks = {};
  for (const [dslName, catalogName] of Object.entries(ITEM_HOOK_MAP)) {
    if (typeof def[dslName] === 'function') {
      hooks[catalogName] = compileHook(def[dslName]);
    }
  }
  return Object.keys(hooks).length > 0 ? hooks : null;
}

// ═══════════════════════════════════════════════════════════════════
//  defineItem()
// ═══════════════════════════════════════════════════════════════════

/**
 * Define an item via the content DSL.
 * One call registers everything: catalog entry, palette, hooks.
 *
 * @param {string} id - Unique identity string (e.g. "potion_antidote")
 * @param {object} def - Item definition
 *
 * @param {string} def.name - Display name
 * @param {string} def.type - Item type: "food", "potion", "weapon", "armor", "tool", "scroll", etc.
 * @param {string} [def.description] - Flavor text
 *
 * // Display
 * @param {string} [def.glyph] - ASCII/Unicode glyph
 * @param {string} [def.color] - Foreground hex color
 * @param {string} [def.glow] - Glow hex color (defaults to color)
 * @param {number} [def.scale] - Base scale for rendering
 *
 * // Stats
 * @param {number} [def.weight=1]
 * @param {number} [def.value=0]
 * @param {string|number} [def.rarity="common"]
 * @param {string} [def.material]
 *
 * // Equipment fields (weapons/armor)
 * @param {object} [def.bonuses] - { attack, defense, accuracy, ... }
 * @param {string} [def.damageDice] - "1d8"
 * @param {string} [def.damageType] - "slash", "blunt", "pierce"
 * @param {number} [def.staminaCost]
 * @param {boolean} [def.twoHanded]
 * @param {number} [def.maxSockets]
 * @param {string} [def.slot] - Override auto-inferred slot
 *
 * // Food fields
 * @param {number} [def.nutrition] - Nutrition value for food
 * @param {string|number} [def.shelfLife] - "ration", "short", "medium", "long", or number
 *
 * // Potion fields
 * @param {object} [def.potion] - { route, doses, channels, effects, toxicity, feel }
 *
 * // Hooks (content scripts)
 * @param {Function} [def.onUse] - (ctx: ScriptCtx) => void
 * @param {Function} [def.onDrink] - (ctx: ScriptCtx) => void
 * @param {Function} [def.onThrow] - (ctx: ScriptCtx) => void
 * @param {Function} [def.onDip] - (ctx: ScriptCtx) => void
 * @param {Function} [def.beforeUse]
 * @param {Function} [def.afterUse]
 *
 * // Recipe
 * @param {string[]} [def.recipe] - Ingredient identity strings
 *
 * // Metadata (arbitrary, for future features)
 * @param {object} [def.meta] - Free-form metadata
 *
 * @returns {string} The registered item id
 */
export function defineItem(id, def) {
  if (!id || typeof id !== 'string') throw new Error('[defineItem] id is required');
  if (!def || typeof def !== 'object') throw new Error('[defineItem] def is required');
  if (!def.name) throw new Error(`[defineItem "${id}"] name is required`);
  if (!def.type) throw new Error(`[defineItem "${id}"] type is required`);

  const { catalogKind, slot: inferredSlot, itemType } = inferItemCategory(def.type);
  const { rarity, rarityName } = resolveRarity(def.rarity);
  const hooks = compileItemHooks(def);
  const slot = def.slot || inferredSlot;

  // ── Build catalog entry ───────────────────────────────────────
  const catalogEntry = {
    id,
    catalogKind,
    name: def.name,
    type: itemType,
    slot,
    material: def.material || null,
    rarity,
    rarityName,
    weight: Number(def.weight ?? 1),
    value: Number(def.value ?? 0),
    description: def.description || def.name,
    identified: def.identified ?? false,
    tags: Array.isArray(def.tags) ? def.tags.slice() : [],
  };

  // Equipment-specific
  if (catalogKind === 'equipment') {
    catalogEntry.bonuses = def.bonuses || {};
    catalogEntry.damageDice = def.damageDice || null;
    catalogEntry.damageType = def.damageType || null;
    catalogEntry.staminaCost = def.staminaCost ?? null;
    catalogEntry.twoHanded = def.twoHanded || false;
    catalogEntry.maxSockets = def.maxSockets || 0;
    if (def.combatFlavor) catalogEntry.combatFlavor = def.combatFlavor;
    if (def.range) catalogEntry.range = def.range;
    if (def.affixes) catalogEntry.affixes = def.affixes;
    if (def.subtype) catalogEntry.subtype = def.subtype;
    if (def.beatitude) catalogEntry.beatitude = def.beatitude;
    if (Array.isArray(def.procPackages) && def.procPackages.length > 0) catalogEntry.procPackages = def.procPackages.slice();
    if (def.tags) catalogEntry.tags = def.tags;
    if (def.maxCharges != null) catalogEntry.maxCharges = def.maxCharges;
    if (def.charges != null) catalogEntry.charges = def.charges;
    if (def.dropRequirement) catalogEntry.dropRequirement = def.dropRequirement;

    // Swing profile — authored weapon VFX identity
    if (def.swingProfile) {
      const sp = def.swingProfile;
      if (sp.lengthCm) catalogEntry.weaponLengthCm = sp.lengthCm;
      if (sp.tint || sp.density || sp.alphaStops || sp.widthScale || sp.handleStart) {
        catalogEntry.weaponVfxProfile = {};
        if (sp.density === 'heavy')  catalogEntry.weaponVfxProfile.length = 1.18;
        if (sp.density === 'light')  catalogEntry.weaponVfxProfile.length = 0.85;
        if (sp.length)      catalogEntry.weaponVfxProfile.length = sp.length;
        if (sp.widthScale)   catalogEntry.weaponVfxProfile.widthScale = sp.widthScale;
        if (sp.handleStart)  catalogEntry.weaponVfxProfile.handleStart = sp.handleStart;
        if (sp.alphaStops)   catalogEntry.weaponVfxProfile.alphaStops = sp.alphaStops;
        if (sp.tint)         catalogEntry.weaponVfxProfile.tint = sp.tint;
      }
      // String shorthand: "sword", "axe", "mace" etc.
      if (typeof sp === 'string') catalogEntry.weaponVfxProfile = sp;
    }

    // Auto-resolve weapon visual meta (length + profile) and family
    // for items that don't have an explicit swingProfile — mirrors buildItemCatalog().
    if (isWeaponCatalogItem(catalogEntry)) {
      if (!catalogEntry.weaponLengthCm || !catalogEntry.weaponVfxProfile) {
        const meta = resolveWeaponVisualMeta(catalogEntry);
        if (!catalogEntry.weaponLengthCm) catalogEntry.weaponLengthCm = meta.weaponLengthCm;
        if (!catalogEntry.weaponVfxProfile) catalogEntry.weaponVfxProfile = meta.weaponVfxProfile;
      }
    }
    const resolvedFamily = def.weaponFamily || resolveWeaponFamily(catalogEntry);
    if (resolvedFamily) catalogEntry.weaponFamily = resolvedFamily;
  }

  // Potion-specific
  if (itemType === 'potion' && def.potion) {
    catalogEntry.potion = {
      route: def.potion.route || 'oral',
      doses: def.potion.doses ?? 1,
      channels: def.potion.channels || [],
      effects: def.potion.effects || [],
      toxicity: def.potion.toxicity || null,
      feel: def.potion.feel || '',
    };
  }

  // Food-specific: extra components to attach at entity build time
  if (itemType === 'food') {
    const shelfLife = _resolveShelfLife(def.shelfLife);
    catalogEntry._contentFood = {
      consumable: {
        effectKey: '',
        effectParams: { nutrition: Number(def.nutrition ?? 50), special: null },
        remainingUses: 1,
        potency: 0,
        meta: {},
      },
      decay: {
        turnsHeld: 0,
        shelfLife,
      },
    };
  }

  // Scrolls: charges
  if (def.charges) catalogEntry.charges = def.charges;
  if (def.noQuickChip) catalogEntry.noQuickChip = true;
  if (def.beatitude && catalogKind !== 'equipment') catalogEntry.beatitude = def.beatitude;

  // Hooks: merge DSL-compiled hooks with any raw snake_case hooks passed directly
  catalogEntry.hooks = hooks ? { ...hooks } : {};
  if (def.hooks && typeof def.hooks === 'object') {
    Object.assign(catalogEntry.hooks, def.hooks);
  }

  // Auto-generate on_use for items with abilities:
  // When the player "uses" a weapon that has a single ability, dispatch it.
  // When multiple abilities exist, dispatch the first (action bar handles selection).
  if (def.abilities && !def.onUse) {
    const abilityIds = Object.keys(def.abilities);
    if (abilityIds.length > 0) {
      const primaryAbilityId = abilityIds[0];
      catalogEntry.hooks.on_use = (ctx, state) => {
        const actorId = Number(state?.actor || ctx.actor || 0) | 0;
        const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
        ctx.io.emit('content:ability:request', {
          actor: actorId,
          itemId,
          abilityId: primaryAbilityId,
          identity: id,
        });
        return { consumed: false };
      };
    }
  }

  // Local persistent state — initial values for ScriptState component
  if (def.state && typeof def.state === 'object') {
    catalogEntry._contentState = { ...def.state };
  }

  // Status function — authored tooltip lines from live state
  if (typeof def.status === 'function') {
    catalogEntry._contentStatus = def.status;
  }

  // Tick hooks — stored separately, consumed by scriptTickSystem
  const tickHooks = {};
  if (typeof def.onTurnWhileCarried === 'function') tickHooks.onTurnWhileCarried = def.onTurnWhileCarried;
  if (typeof def.onTurnWhileEquipped === 'function') tickHooks.onTurnWhileEquipped = def.onTurnWhileEquipped;
  if (Object.keys(tickHooks).length > 0) catalogEntry._contentTickHooks = tickHooks;

  // Combat hooks — stored for combatSystem integration
  const combatHooks = {};
  if (typeof def.onHit === 'function') combatHooks.onHit = def.onHit;
  if (typeof def.onEquip === 'function') combatHooks.onEquip = def.onEquip;
  if (typeof def.onUnequip === 'function') combatHooks.onUnequip = def.onUnequip;
  if (Object.keys(combatHooks).length > 0) catalogEntry._contentCombatHooks = combatHooks;

  // Recipe pointer (stored for future recipe system integration)
  if (def.recipe) catalogEntry._contentRecipe = def.recipe;

  // Metadata
  if (def.meta) catalogEntry._contentMeta = def.meta;

  // AI hints
  if (def.aiHints) catalogEntry._contentAiHints = def.aiHints;

  // ── Register catalog entry ────────────────────────────────────
  registerItem(id, catalogEntry);

  // ── Register palette ──────────────────────────────────────────
  if (def.glyph || def.color) {
    const paletteEntry = {};
    if (def.glyph) paletteEntry.glyph = def.glyph;
    if (def.color) paletteEntry.fg = def.color;
    paletteEntry.glow = def.glow || def.color || null;
    if (def.scale != null) paletteEntry.baseScale = def.scale;
    if (Array.isArray(def.layers)) paletteEntry.layers = def.layers;
    registerPalette(id, paletteEntry);
  }

  // ── Register presentations ────────────────────────────────────
  if (def.presentations && typeof def.presentations === 'object') {
    for (const [presId, spec] of Object.entries(def.presentations)) {
      registerPresentation(id, presId, spec);
    }
  }

  // ── Register abilities ────────────────────────────────────────
  // Abilities are named actions that appear in the spell bar,
  // have cooldowns, and may require targeting.
  if (def.abilities && typeof def.abilities === 'object') {
    const abilityMap = {};
    for (const [abilityId, spec] of Object.entries(def.abilities)) {
      const compiled = {
        id: abilityId,
        name: spec.name || abilityId,
        icon: spec.icon || '?',
        targeting: spec.targeting || 'none',  // 'none' | 'enemy' | 'ally' | 'tile'
        range: spec.range || 1,
        cooldown: spec.cooldown || 0,
        cost: spec.cost || 0,
        costKind: spec.costKind || 'item',
        onActivate: spec.onActivate || null,
        description: spec.description || '',
      };
      registerAbility(id, abilityId, compiled);
      abilityMap[abilityId] = compiled;
    }
    catalogEntry._contentAbilities = abilityMap;
  }

  return id;
}


// ═══════════════════════════════════════════════════════════════════
//  defineMonster()
// ═══════════════════════════════════════════════════════════════════

/**
 * Define a monster via the content DSL.
 * One call registers: MonsterDef, palette entry, scripted hooks.
 *
 * @param {string} id - Unique monster identity (e.g. "fire_elemental")
 * @param {object} def
 *
 * @param {string} def.name
 * @param {string} [def.glyph]
 * @param {string} [def.color]
 * @param {string} [def.glow]
 * @param {string[]} [def.tags]
 * @param {number} [def.tier=0]
 * @param {string} [def.description]
 *
 * // Combat
 * @param {number} def.hp - Base HP
 * @param {number} [def.hpPerLevel=1]
 * @param {number} [def.attack=1]
 * @param {number} [def.defense=0]
 * @param {string} [def.damageDice="1d4"]
 * @param {number} [def.speed=1]
 *
 * // Physics
 * @param {string} [def.sizeClass="M"]
 * @param {number} [def.massKg=60]
 *
 * // AI
 * @param {number} [def.intelligence=3]
 * @param {number} [def.visionRange]
 * @param {string} [def.aggro] - "passive" | default
 * @param {string} [def.faction="enemy"]
 * @param {boolean} [def.solid=true]
 * @param {boolean} [def.blocksSight=false]
 * @param {boolean} [def.packSense]
 * @param {number} [def.packRadius]
 * @param {number} [def.retreatHpPct]
 * @param {boolean} [def.ambush]
 * @param {string|{pattern?:string,context?:string,chance?:number}} [def.sleep]
 * @param {number} [def.polymorphResistance] - 0..1 chance to reject a polymorph attempt before transformation.
 * @param {string|number} [def.polymorphStability] - serialized body coherence enum: "unstable"|"ordinary"|"anchored"|"fixed". Legacy numbers normalize to that enum.
 *
 * // Resistances
 * @param {object} [def.resistances]
 * @param {string[]} [def.immune] - shorthand: auto-sets resistance mult to 0
 * @param {string[]} [def.vulnerable] - shorthand: auto-sets resistance mult to 2
 *
 * // Equipment
 * @param {Array} [def.wielding]
 * @param {Array} [def.equipped]
 * @param {Array} [def.inventory]
 *
 * // Spells
 * @param {string[]} [def.learnedSpellIds]
 * @param {number} [def.maxMana]
 * @param {number} [def.manaRegen]
 *
 * // Loot
 * @param {string} [def.lootTable]
 * @param {number} [def.corpseDropChance]
 * @param {string} [def.goreType]
 *
 * // Scripted hooks (raw callback arrays, compatible with existing system)
 * @param {object} [def.hooks] - { onHit: [...], onDamaged: [...], onDeath: [...], whileLOS: [...] }
 *
 * // Metadata
 * @param {object} [def.meta]
 *
 * @returns {string} The registered monster id
 */
export function defineMonster(id, def) {
  if (!id || typeof id !== 'string') throw new Error('[defineMonster] id is required');
  if (!def || typeof def !== 'object') throw new Error('[defineMonster] def is required');
  if (!def.name) throw new Error(`[defineMonster "${id}"] name is required`);

  const resistances = _buildResistances(def);

  const monsterDef = {
    id,
    name: def.name,
    tags: def.tags || [],
    tier: def.tier ?? 0,
    intelligence: def.intelligence ?? 3,
    baseHp: def.hp ?? 10,
    hpPerLevel: def.hpPerLevel ?? 1,
    attack: def.attack ?? 1,
    defense: def.defense ?? 0,
    damageDice: def.damageDice || '1d4',
    sizeClass: def.sizeClass || 'M',
    massKg: def.massKg ?? 60,
    resistances,
    speed: def.speed ?? 1,
    description: def.description || def.name,
  };

  // Optional AI fields
  if (def.visionRange != null) monsterDef.visionRange = def.visionRange;
  if (def.aggro) monsterDef.aggro = def.aggro;
  if (def.alertOnSight != null) monsterDef.alertOnSight = def.alertOnSight === true;
  if (def.sightAlertCooldownTurns != null) monsterDef.sightAlertCooldownTurns = Math.max(0, Number(def.sightAlertCooldownTurns || 0) | 0);
  if (def.faction) monsterDef.faction = def.faction;
  if (def.solid != null) monsterDef.solid = def.solid === true;
  if (def.blocksSight != null) monsterDef.blocksSight = def.blocksSight === true;
  if (def.packSense != null) monsterDef.packSense = def.packSense;
  if (def.packRadius != null) monsterDef.packRadius = def.packRadius;
  if (def.retreatHpPct != null) monsterDef.retreatHpPct = def.retreatHpPct;
  if (def.ambush != null) monsterDef.ambush = def.ambush;
  if (def.polymorphResistance != null) monsterDef.polymorphResistance = clamp(Number(def.polymorphResistance || 0), 0, 1);
  if (def.polymorphStability != null) monsterDef.polymorphStability = normalizePolymorphStability(def.polymorphStability);
  if (typeof def.sleep === 'string') {
    monsterDef.sleep = def.sleep;
  } else if (def.sleep && typeof def.sleep === 'object') {
    monsterDef.sleep = { ...def.sleep };
  }

  // Equipment
  if (def.wielding) monsterDef.wielding = def.wielding;
  if (def.equipped) monsterDef.equipped = def.equipped;
  if (def.inventory) monsterDef.inventory = def.inventory;

  // Spells
  if (def.learnedSpellIds) monsterDef.learnedSpellIds = def.learnedSpellIds;
  if (def.maxMana != null) monsterDef.maxMana = def.maxMana;
  if (def.manaRegen != null) monsterDef.manaRegen = def.manaRegen;

  // Loot
  if (def.lootTable) monsterDef.lootTable = def.lootTable;
  if (def.corpseDropChance != null) monsterDef.corpseDropChance = def.corpseDropChance;
  if (def.goreType) monsterDef.goreType = def.goreType;

  // ── Hooks ──────────────────────────────────────────────────────
  // Merge raw callback arrays (existing pattern) with compiled DSL hooks.
  const hooks = def.hooks ? { ...def.hooks } : {};
  _compileMonsterDslHooks(id, def, hooks);
  if (Object.keys(hooks).length > 0) monsterDef.hooks = hooks;

  // Special descriptions (for bestiary / tooltip)
  if (def.specials) monsterDef.specials = def.specials;

  // Flags
  if (def.canFly) monsterDef.canFly = def.canFly;
  if (def.rare) monsterDef.rare = def.rare;
  if (def.disabled) monsterDef.disabled = def.disabled;
  if (def.minDepth != null) monsterDef.minDepth = def.minDepth;
  if (def.equipment) monsterDef.equipment = def.equipment;
  if (def.guardianRole && typeof def.guardianRole === "object") {
    monsterDef.guardianRole = { ...def.guardianRole };
  }

  // Corpse eating
  if (def.corpseEat) monsterDef.corpseEat = def.corpseEat;

  // Local persistent state
  if (def.state && typeof def.state === 'object') {
    monsterDef._contentState = { ...def.state };
  }

  // AI hints
  if (def.aiHints) monsterDef._contentAiHints = def.aiHints;

  // Metadata
  if (def.meta) monsterDef._contentMeta = def.meta;

  // ── Register ──────────────────────────────────────────────────
  registerMonster(id, monsterDef);
  registerMonsterDef(monsterDef);  // eager: available via getMonster() immediately

  // ── Palette ───────────────────────────────────────────────────
  if (def.glyph || def.color) {
    const entry = {};
    if (def.glyph) entry.glyph = def.glyph;
    if (def.color) entry.fg = def.color;
    entry.glow = def.glow || def.color || null;
    if (def.scale != null) entry.baseScale = Number(def.scale);
    registerPalette(id, entry);
  }

  // ── Presentations ─────────────────────────────────────────────
  if (def.presentations && typeof def.presentations === 'object') {
    for (const [presId, spec] of Object.entries(def.presentations)) {
      registerPresentation(id, presId, spec);
    }
  }

  return id;
}

// ── DSL monster hook compilation ────────────────────────────────────
// Wraps ScriptCtx-style functions into callbacks that the existing
// combat/AI/death systems can invoke. Each hook type gets a different
// adapter because the callback context shapes differ.

const _MONSTER_DSL_HOOKS = ['whileLOS', 'onSeen', 'onHit', 'onDamaged', 'onDeath'];

function _compileMonsterDslHooks(id, def, hooks) {
  for (const hookName of _MONSTER_DSL_HOOKS) {
    if (typeof def[hookName] !== 'function') continue;
    const compiled = _wrapMonsterHook(id, hookName, def[hookName]);
    if (!hooks[hookName]) hooks[hookName] = [];
    hooks[hookName].push(compiled);
  }
}

function _wrapMonsterHook(identity, hookName, dslFn) {
  return (callbackCtx) => {
    try {
      const world = callbackCtx.world;
      let actor, target;

      if (hookName === 'whileLOS' || hookName === 'onSeen') {
        actor = callbackCtx.actor | 0;
        target = callbackCtx.target | 0;
      } else if (hookName === 'onHit') {
        actor = callbackCtx.attacker | 0;   // the monster that hit
        target = callbackCtx.defender | 0;   // who got hit
      } else if (hookName === 'onDamaged') {
        actor = callbackCtx.defender | 0;    // the monster taking damage
        target = callbackCtx.attacker | 0;   // who dealt it
      } else if (hookName === 'onDeath') {
        actor = callbackCtx.deadId | 0;
        target = callbackCtx.killer | 0;
      } else {
        return;
      }

      const facade = createWorldFacade(world, actor, actor);
      const state = { actor, itemId: actor, target, identity };
      const ctx = new ScriptCtx(facade, state);

      // Expose combat-specific context for damage hooks
      if (hookName === 'onHit' || hookName === 'onDamaged') {
        ctx._combatCtx = callbackCtx;
      }

      dslFn(ctx);
    } catch (err) {
      console.error(`[defineMonster] Error in ${hookName} hook for "${identity}":`, err);
    }
  };
}


// ═══════════════════════════════════════════════════════════════════
//  Internal helpers
// ═══════════════════════════════════════════════════════════════════

function _resolveShelfLife(input) {
  if (typeof input === 'number') return Math.max(0, input | 0);
  if (typeof input === 'string') return SHELF_LIFE[input] || input;
  return SHELF_LIFE.ration;
}

/**
 * Build resistances object from def, merging immune/vulnerable shorthands.
 */
function _buildResistances(def) {
  const base = def.resistances ? { ...def.resistances } : {};
  // Shorthand: immune => set mult to 0
  if (Array.isArray(def.immune)) {
    for (const key of def.immune) _setResistMult(base, key, 0);
  }
  // Shorthand: vulnerable => set mult to 2
  if (Array.isArray(def.vulnerable)) {
    for (const key of def.vulnerable) _setResistMult(base, key, 2.0);
  }
  return base;
}

const _RESIST_KEY_MAP = {
  fire:     ['thermal', 'burnMult'],
  cold:     ['thermal', 'freezeMult'],
  burn:     ['thermal', 'burnMult'],
  poison:   ['chemical', 'toxMult'],
  acid:     ['chemical', 'acidMult'],
  electric: ['electric', 'ohms'],
  blunt:    ['kinetic', 'bluntMult'],
  slash:    ['kinetic', 'slashMult'],
  pierce:   ['kinetic', 'pierceMult'],
};

function _setResistMult(resistances, shortKey, mult) {
  const mapping = _RESIST_KEY_MAP[shortKey];
  if (!mapping) return;
  const [group, field] = mapping;
  if (!resistances[group]) resistances[group] = {};
  if (field === 'ohms') {
    // electric immunity = very high ohms, vulnerability = low ohms
    resistances[group][field] = mult === 0 ? 999999 : (mult > 1 ? 100 : 900);
  } else {
    resistances[group][field] = mult;
  }
}

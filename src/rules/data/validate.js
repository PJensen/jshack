// rules/data/validate.js
// Assert that item-catalog and affix data conform to expected shapes.

const ITEM_HOOK_KEY_ALIASES = Object.freeze({
  before_drink: 'beforeDrink',
  on_drink: 'onDrink',
  after_drink: 'afterDrink',
  can_dip_target: 'canDipTarget',
  before_throw: 'beforeThrow',
  on_throw: 'onThrow',
  after_throw: 'afterThrow',
  before_dip: 'beforeDip',
  on_dip: 'onDip',
  after_dip: 'afterDip',
  before_use: 'beforeUse',
  on_use: 'onUse',
  after_use: 'afterUse',
  before_apply: 'beforeApply',
  on_apply: 'onApply',
  after_apply: 'afterApply',
  on_loot_roll: 'onLootRoll',
});

const ITEM_HOOK_KEYS = new Set([
  'beforeDrink', 'onDrink', 'afterDrink',
  'canDipTarget',
  'beforeThrow', 'onThrow', 'afterThrow',
  'beforeDip', 'onDip', 'afterDip',
  'beforeUse', 'onUse', 'afterUse',
  'beforeApply', 'onApply', 'afterApply',
  'onLootRoll',
  ...Object.keys(ITEM_HOOK_KEY_ALIASES),
]);

const AMMO_HOOK_KEY_ALIASES = Object.freeze({
  on_projectile_actor_impact: "onProjectileActorImpact",
  on_projectile_wall_impact: "onProjectileWallImpact",
  on_projectile_ground_impact: "onProjectileGroundImpact",
  on_projectile_miss: "onProjectileMiss",
});

const AMMO_HOOK_KEYS = new Set([
  "onProjectileActorImpact",
  "onProjectileWallImpact",
  "onProjectileGroundImpact",
  "onProjectileMiss",
  ...Object.keys(AMMO_HOOK_KEY_ALIASES),
]);

/**
 * @param {any} value
 * @returns {boolean}
 */
function isScriptRefLike(value) {
  if (typeof value === "string" && value) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const key = value.ref ?? value.script ?? value.key ?? value.id ?? "";
  return typeof key === "string" && key.length > 0;
}

/**
 * @param {string} itemId
 * @param {Record<string, any>} source
 * @param {string} sourceLabel
 */
function validateItemHookSurface(itemId, source, sourceLabel) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`item ${itemId}: ${sourceLabel} must be an object`);
  }

  for (const [key, value] of Object.entries(source)) {
    if (ITEM_HOOK_KEYS.has(key)) {
      if (typeof value !== 'function') {
        throw new Error(`item ${itemId}: ${sourceLabel}.${key} must be a function`);
      }
      continue;
    }

    const looksLikeHook = /^(before|on|after)([A-Z_].*)?$/.test(String(key || ''));
    if (looksLikeHook) {
      throw new Error(`item ${itemId}: ${sourceLabel}.${key} is not a supported item hook key`);
    }
  }
}

export function validateItemCatalog(ITEM_CATALOG) {
  if (typeof ITEM_CATALOG !== 'object' || !ITEM_CATALOG) throw new Error('ITEM_CATALOG must be an object');
  for (const [id, rec] of Object.entries(ITEM_CATALOG)) {
    if (rec.id !== id) throw new Error(`item ${id}: id mismatch`);
    if (typeof rec.name !== 'string' || !rec.name) throw new Error(`item ${id}: name required`);
    if (typeof rec.type !== 'string' || !rec.type) throw new Error(`item ${id}: type required`);
    if (typeof rec.catalogKind !== 'string' || !rec.catalogKind) throw new Error(`item ${id}: catalogKind required`);
    if (typeof rec.rarity !== 'number' || rec.rarity < 1) throw new Error(`item ${id}: rarity >= 1`);
    if (typeof rec.rarityName !== 'string' || !rec.rarityName) throw new Error(`item ${id}: rarityName required`);

    validateItemHookSurface(id, rec, 'record');
    if (rec.hooks != null) validateItemHookSurface(id, rec.hooks, 'hooks');
    if (rec.potion != null) validateItemHookSurface(id, rec.potion, 'potion');

    if (rec.catalogKind === 'equipment') {
      if (rec.type !== 'equip') throw new Error(`item ${id}: equipment must have type 'equip'`);
      if (typeof rec.slot !== 'string' || !rec.slot) throw new Error(`item ${id}: equipment slot required`);
      if (rec.bonuses && typeof rec.bonuses !== 'object') throw new Error(`item ${id}: bonuses must be object`);
      if (rec.bonuses) {
        for (const [k, v] of Object.entries(rec.bonuses)) {
          if (typeof v !== 'number') throw new Error(`item ${id}: bonus ${k} must be number`);
        }
      }
    }
  }
  return true;
}

/**
 * @param {Record<string, any>} AMMO_DEFS
 */
export function validateAmmoDefs(AMMO_DEFS) {
  if (typeof AMMO_DEFS !== "object" || !AMMO_DEFS) throw new Error("AMMO_DEFS must be an object");

  for (const [id, rec] of Object.entries(AMMO_DEFS)) {
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) {
      throw new Error(`ammo ${id}: def must be an object`);
    }
    if (String(rec.id || id) !== id) throw new Error(`ammo ${id}: id mismatch`);
    const scriptsSurface = rec.scripts && typeof rec.scripts === "object"
      ? rec.scripts
      : (rec.hooks && typeof rec.hooks === "object" ? rec.hooks : rec);
    for (const [key, value] of Object.entries(scriptsSurface)) {
      if (key === "id" || key === "name" || key === "hooks" || key === "scripts") continue;
      if (!AMMO_HOOK_KEYS.has(key)) {
        throw new Error(`ammo ${id}: unknown hook key '${key}'`);
      }
      if (!Array.isArray(value)) {
        throw new Error(`ammo ${id}: hook '${key}' must be an array`);
      }
      for (let i = 0; i < value.length; i++) {
        if (!isScriptRefLike(value[i])) {
          throw new Error(`ammo ${id}: hook '${key}' entry ${i} must be a script ref`);
        }
      }
    }
  }
  return true;
}

export function validateAffixes(AFFIX_DEFS) {
  const entries = Array.isArray(AFFIX_DEFS)
    ? AFFIX_DEFS.map((entry) => [String(entry?.id || ""), entry?.record ?? entry])
    : (typeof AFFIX_DEFS === 'object' && AFFIX_DEFS
        ? Object.entries(AFFIX_DEFS)
        : null);
  if (!entries) throw new Error('affix registry must be iterable');
  for (const [id, rec] of entries) {
    if (typeof rec.name !== 'string' || !rec.name) throw new Error(`affix ${id}: name required`);
    if (!Array.isArray(rec.slots) || rec.slots.length === 0) throw new Error(`affix ${id}: slots required`);
    if (typeof rec.weight !== 'number') throw new Error(`affix ${id}: weight must be number`);
    if (rec.description != null && typeof rec.description !== 'string') throw new Error(`affix ${id}: description must be string`);
    if (rec.passiveRefs != null) {
      if (!Array.isArray(rec.passiveRefs)) throw new Error(`affix ${id}: passiveRefs must be array`);
      for (let i = 0; i < rec.passiveRefs.length; i++) {
        const ref = rec.passiveRefs[i];
        if (typeof ref !== 'string' && (!ref || typeof ref !== 'object')) {
          throw new Error(`affix ${id}: passiveRefs[${i}] must be a script ref`);
        }
      }
    }
    if (rec.triggerScripts != null) {
      if (typeof rec.triggerScripts !== 'object' || Array.isArray(rec.triggerScripts)) {
        throw new Error(`affix ${id}: triggerScripts must be an object`);
      }
      for (const [trigger, refs] of Object.entries(rec.triggerScripts)) {
        if (!Array.isArray(refs)) throw new Error(`affix ${id}: triggerScripts.${trigger} must be an array`);
        for (let i = 0; i < refs.length; i++) {
          const ref = refs[i];
          if (typeof ref !== 'string' && (!ref || typeof ref !== 'object')) {
            throw new Error(`affix ${id}: triggerScripts.${trigger}[${i}] must be a script ref`);
          }
        }
      }
    }
  }
  return true;
}

export function validateMaterialReactionRules(MATERIAL_REACTION_RULES, opts = {}) {
  if (!Array.isArray(MATERIAL_REACTION_RULES)) throw new Error('MATERIAL_REACTION_RULES must be an array');
  const outcomeIds = new Set(Array.isArray(opts.outcomeIds) ? opts.outcomeIds : []);
  const allowedWaterTypes = new Set(["holy", "unholy", "plain"]);
  const allowedBeatitudes = new Set(["blessed", "uncursed", "cursed"]);
  const ruleIds = new Set();

  for (let i = 0; i < MATERIAL_REACTION_RULES.length; i++) {
    const rule = MATERIAL_REACTION_RULES[i];
    const id = String(rule?.id || '');
    if (!id) throw new Error(`material reaction rule[${i}]: id required`);
    if (ruleIds.has(id)) throw new Error(`material reaction rule ${id}: duplicate id`);
    ruleIds.add(id);

    const hasStatuses = Array.isArray(rule.sourceStatuses) && rule.sourceStatuses.length > 0;
    const hasEvents = Array.isArray(rule.sourceEvents) && rule.sourceEvents.length > 0;
    if (!hasStatuses && !hasEvents) {
      throw new Error(`material reaction rule ${id}: sourceStatuses or sourceEvents required`);
    }
    if (hasStatuses) {
      for (const status of rule.sourceStatuses) {
        if (typeof status !== 'string' || !status.trim()) {
          throw new Error(`material reaction rule ${id}: sourceStatuses must contain non-empty strings`);
        }
      }
    }
    if (hasEvents) {
      for (const eventName of rule.sourceEvents) {
        if (typeof eventName !== 'string' || !eventName.trim()) {
          throw new Error(`material reaction rule ${id}: sourceEvents must contain non-empty strings`);
        }
      }
    }

    if (!Array.isArray(rule.itemScopes) || rule.itemScopes.length === 0) {
      throw new Error(`material reaction rule ${id}: itemScopes required`);
    }
    for (const scope of rule.itemScopes) {
      if (scope !== 'ground' && scope !== 'inventory' && scope !== 'target') {
        throw new Error(`material reaction rule ${id}: itemScopes must be 'ground', 'inventory', or 'target'`);
      }
    }

    if (typeof rule.eventKind !== 'string' || !rule.eventKind.trim()) {
      throw new Error(`material reaction rule ${id}: eventKind required`);
    }

    if (!Array.isArray(rule.reactions) || rule.reactions.length === 0) {
      throw new Error(`material reaction rule ${id}: reactions required`);
    }

    const reactionIds = new Set();
    for (let r = 0; r < rule.reactions.length; r++) {
      const reaction = rule.reactions[r];
      const reactionId = String(reaction?.id || '');
      if (!reactionId) throw new Error(`material reaction rule ${id}: reaction[${r}] id required`);
      if (reactionIds.has(reactionId)) throw new Error(`material reaction rule ${id}: duplicate reaction id ${reactionId}`);
      reactionIds.add(reactionId);

      const match = reaction?.match;
      if (!match || typeof match !== 'object') {
        throw new Error(`material reaction rule ${id}.${reactionId}: match object required`);
      }

      const itemTypes = Array.isArray(match.itemTypes) ? match.itemTypes : [];
      const materials = Array.isArray(match.materials) ? match.materials : [];
      const identities = Array.isArray(match.identities) ? match.identities : [];

      if (itemTypes.length + materials.length + identities.length === 0) {
        throw new Error(`material reaction rule ${id}.${reactionId}: match must include at least one clause`);
      }

      for (const arr of [itemTypes, materials, identities]) {
        for (const val of arr) {
          if (typeof val !== 'string' || !val.trim()) {
            throw new Error(`material reaction rule ${id}.${reactionId}: match values must be non-empty strings`);
          }
        }
      }

      if (typeof reaction.outcome !== 'string' || !reaction.outcome.trim()) {
        throw new Error(`material reaction rule ${id}.${reactionId}: outcome required`);
      }
      if (outcomeIds.size > 0 && !outcomeIds.has(reaction.outcome)) {
        throw new Error(`material reaction rule ${id}.${reactionId}: unknown outcome ${reaction.outcome}`);
      }

      if (reaction.outcome === "set_beatitude") {
        const state = String(reaction.state || "").toLowerCase();
        if (!allowedBeatitudes.has(state)) {
          throw new Error(`material reaction rule ${id}.${reactionId}: state must be blessed|uncursed|cursed`);
        }
      }
      if (reaction.waterTypes != null) {
        if (!Array.isArray(reaction.waterTypes) || reaction.waterTypes.length === 0) {
          throw new Error(`material reaction rule ${id}.${reactionId}: waterTypes must be a non-empty array when provided`);
        }
        for (const waterType of reaction.waterTypes) {
          if (!allowedWaterTypes.has(String(waterType || "").toLowerCase())) {
            throw new Error(`material reaction rule ${id}.${reactionId}: unknown waterType ${waterType}`);
          }
        }
      }
    }
  }

  return true;
}

function validateHookPhaseFns(def, id, phaseKeys) {
  let hasAnyHook = false;
  for (const key of phaseKeys) {
    const fn = def?.[key];
    if (fn == null) continue;
    hasAnyHook = true;
    if (typeof fn !== 'function') throw new Error(`${id}: ${key} must be a function`);
  }
  if (!hasAnyHook) throw new Error(`${id}: at least one hook phase is required`);
}

export function validateApplyPayloads(APPLY_PAYLOADS) {
  if (!Array.isArray(APPLY_PAYLOADS)) throw new Error('APPLY_PAYLOADS must be an array');
  const ids = new Set();
  for (let i = 0; i < APPLY_PAYLOADS.length; i++) {
    const def = APPLY_PAYLOADS[i];
    const id = String(def?.id || '');
    if (!id) throw new Error(`apply payload[${i}]: id required`);
    if (ids.has(id)) throw new Error(`apply payload ${id}: duplicate id`);
    ids.add(id);
    if (typeof def?.matches !== 'function') throw new Error(`apply payload ${id}: matches function required`);
    validateHookPhaseFns(def, `apply payload ${id}`, ['beforeApply', 'onApply', 'afterApply']);
  }
  return true;
}

/**
 * @param {Record<string, any>} payloads
 * @param {string} label
 */
function validateNamedUsePayloadMap(payloads, label) {
  if (typeof payloads !== 'object' || !payloads || Array.isArray(payloads)) {
    throw new Error(`${label} must be an object`);
  }
  for (const [key, payload] of Object.entries(payloads)) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`${label}.${key} must be a payload object`);
    }
    const id = String(payload.id || key || '');
    if (!id) throw new Error(`${label}.${key}: id required`);
    validateHookPhaseFns(payload, `${label}.${key}`, ['beforeUse', 'onUse', 'afterUse']);
  }
  return true;
}

export function validateUseItemPayloads(USE_ITEM_PAYLOADS) {
  return validateNamedUsePayloadMap(USE_ITEM_PAYLOADS, 'USE_ITEM_PAYLOADS');
}

export function validateUseMatcherPayloads(USE_ITEM_MATCHER_PAYLOADS) {
  if (!Array.isArray(USE_ITEM_MATCHER_PAYLOADS)) throw new Error('USE_ITEM_MATCHER_PAYLOADS must be an array');
  const ids = new Set();
  for (let i = 0; i < USE_ITEM_MATCHER_PAYLOADS.length; i++) {
    const payload = USE_ITEM_MATCHER_PAYLOADS[i];
    const id = String(payload?.id || '');
    if (!id) throw new Error(`use matcher payload[${i}]: id required`);
    if (ids.has(id)) throw new Error(`use matcher payload ${id}: duplicate id`);
    ids.add(id);
    if (typeof payload?.matches !== 'function') {
      throw new Error(`use matcher payload ${id}: matches function required`);
    }
    validateHookPhaseFns(payload, `use matcher payload ${id}`, ['beforeUse', 'onUse', 'afterUse']);
  }
  return true;
}

export function validateEffectDefs(EFFECT_DEFS, opts = {}) {
  if (!Array.isArray(EFFECT_DEFS)) throw new Error('EFFECT_DEFS must be an array');
  const operationIds = new Set(Array.isArray(opts.operationIds) ? opts.operationIds : []);
  const defIds = new Set();
  const seenKeys = new Set();

  for (let i = 0; i < EFFECT_DEFS.length; i++) {
    const def = EFFECT_DEFS[i];
    const id = String(def?.id || '');
    if (!id) throw new Error(`effect def[${i}]: id required`);
    if (defIds.has(id)) throw new Error(`effect def ${id}: duplicate id`);
    defIds.add(id);

    if (!Array.isArray(def.keys) || def.keys.length === 0) {
      throw new Error(`effect def ${id}: keys required`);
    }
    for (const key of def.keys) {
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error(`effect def ${id}: keys must be non-empty strings`);
      }
      const normalized = key.trim().toLowerCase();
      if (seenKeys.has(normalized)) throw new Error(`effect def ${id}: duplicate key ${normalized}`);
      seenKeys.add(normalized);
    }

    const operation = String(def.operation || '');
    if (!operation) throw new Error(`effect def ${id}: operation required`);
    if (operationIds.size > 0 && !operationIds.has(operation)) {
      throw new Error(`effect def ${id}: unknown operation ${operation}`);
    }
    if (def.operations != null) {
      if (!Array.isArray(def.operations) || def.operations.length === 0) {
        throw new Error(`effect def ${id}: operations must be a non-empty array`);
      }
      for (const op of def.operations) {
        const opId = String(op || '');
        if (!opId) throw new Error(`effect def ${id}: operations must contain non-empty strings`);
        if (operationIds.size > 0 && !operationIds.has(opId)) {
          throw new Error(`effect def ${id}: unknown operation ${opId}`);
        }
      }
    }

    if (!Array.isArray(def.statuses)) throw new Error(`effect def ${id}: statuses must be an array`);
    for (const status of def.statuses) {
      if (typeof status !== 'string' || !status.trim()) {
        throw new Error(`effect def ${id}: statuses must contain non-empty strings`);
      }
    }
  }

  return true;
}

const VALID_HOOK_KEYS = new Set([
  'onHit', 'onBeforeHit', 'onDamaged', 'onDeath', 'onSeen', 'whileLOS',
]);

export function validateHookCallbacks(defs, opts = {}) {
  if (!Array.isArray(defs)) throw new Error('defs must be an array');
  const allowedKeys = opts.allowedKeys instanceof Set ? opts.allowedKeys : VALID_HOOK_KEYS;

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const id = String(def?.id || `[${i}]`);
    const hooks = def?.hooks;
    if (hooks == null) continue;
    if (typeof hooks !== 'object' || Array.isArray(hooks)) {
      throw new Error(`${id}: hooks must be a plain object`);
    }
    for (const key of Object.keys(hooks)) {
      if (allowedKeys.size > 0 && !allowedKeys.has(key)) {
        throw new Error(`${id}: unknown hook key '${key}'`);
      }
      const arr = hooks[key];
      if (!Array.isArray(arr)) {
        throw new Error(`${id}: hooks.${key} must be an array`);
      }
      for (let j = 0; j < arr.length; j++) {
        if (typeof arr[j] !== 'function') {
          throw new Error(`${id}: hooks.${key}[${j}] must be a function`);
        }
      }
    }
  }
  return true;
}

export function validateAll({
  ITEM_CATALOG,
  AMMO_DEFS,
  AFFIXES,
  MATERIAL_REACTION_RULES,
  MATERIAL_REACTION_OUTCOME_IDS,
  APPLY_PAYLOADS,
  USE_ITEM_PAYLOADS,
  USE_ITEM_MATCHER_PAYLOADS,
  EFFECT_DEFS,
  EFFECT_OPERATION_IDS,
  MONSTERS,
}) {
  return validateItemCatalog(ITEM_CATALOG)
    && (AMMO_DEFS
      ? validateAmmoDefs(AMMO_DEFS)
      : true)
    && validateAffixes(AFFIXES)
    && (MATERIAL_REACTION_RULES
      ? validateMaterialReactionRules(MATERIAL_REACTION_RULES, { outcomeIds: MATERIAL_REACTION_OUTCOME_IDS })
      : true)
    && (USE_ITEM_PAYLOADS
      ? validateUseItemPayloads(USE_ITEM_PAYLOADS)
      : true)
    && (USE_ITEM_MATCHER_PAYLOADS
      ? validateUseMatcherPayloads(USE_ITEM_MATCHER_PAYLOADS)
      : true)
    && (APPLY_PAYLOADS
      ? validateApplyPayloads(APPLY_PAYLOADS)
      : true)
    && (EFFECT_DEFS
      ? validateEffectDefs(EFFECT_DEFS, { operationIds: EFFECT_OPERATION_IDS })
      : true)
    && (MONSTERS
      ? validateHookCallbacks(MONSTERS)
      : true);
}

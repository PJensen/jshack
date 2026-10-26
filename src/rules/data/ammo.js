// rules/data/ammo.js
// Data-driven ammo behavior keyed by ammo identity.
// Projectile content is authored as script refs, not inline callback arrays.

import { registerScript, ScriptVerb } from "../scripting.js";

const EMPTY_HOOK_SCRIPTS = Object.freeze([]);

export const AMMO_HOOK_ALIASES = Object.freeze({
  on_projectile_actor_impact: "onProjectileActorImpact",
  on_projectile_wall_impact: "onProjectileWallImpact",
  on_projectile_miss: "onProjectileMiss",
});

export const AMMO_HOOK_KEYS = Object.freeze([
  "onProjectileActorImpact",
  "onProjectileWallImpact",
  "onProjectileMiss",
]);

const AMMO_FIRE_ARROW_ACTOR_IMPACT = "ammo:fireArrows:onProjectileActorImpact";
const AMMO_PIERCING_ARROW_ACTOR_IMPACT = "ammo:piercingArrows:onProjectileActorImpact";
const AMMO_BODKIN_ARROW_ACTOR_IMPACT = "ammo:bodkinArrows:onProjectileActorImpact";
const AMMO_BLUNT_ARROW_ACTOR_IMPACT = "ammo:bluntArrows:onProjectileActorImpact";
const AMMO_CHALK_ARROW_ACTOR_IMPACT = "ammo:chalkArrows:onProjectileActorImpact";
const AMMO_CHALK_ARROW_WALL_IMPACT = "ammo:chalkArrows:onProjectileWallImpact";
const AMMO_CHALK_ARROW_MISS = "ammo:chalkArrows:onProjectileMiss";

registerScript(AMMO_FIRE_ARROW_ACTOR_IMPACT, {
  [ScriptVerb.ProjectileActorImpact]: (_world, ctx) => {
    const extra = ctx.rollDice("1d4");
    if (extra > 0) ctx.addDamage(extra);
    ctx.deferResolved((resolvedCtx) => {
      if (!resolvedCtx.applied || resolvedCtx.killed) return;
      resolvedCtx.pushEffect(resolvedCtx.defender, {
        key: "burn",
        turnsLeft: 3,
        potency: 2,
        stacks: 1,
      });
      resolvedCtx.emit("proc:burning", {
        actor: resolvedCtx.attacker,
        target: resolvedCtx.defender,
      });
    });
  },
});

registerScript(AMMO_PIERCING_ARROW_ACTOR_IMPACT, {
  [ScriptVerb.ProjectileActorImpact]: (_world, ctx) => {
    // Piercing arrows are a DR-answer lane for ranged builds.
    ctx.addArmorPenetration(2);
  },
});

registerScript(AMMO_BODKIN_ARROW_ACTOR_IMPACT, {
  [ScriptVerb.ProjectileActorImpact]: (_world, ctx) => {
    // Bodkins are the dedicated high-DR ranged answer.
    ctx.addArmorPenetration(4);
  },
});

registerScript(AMMO_BLUNT_ARROW_ACTOR_IMPACT, {
  [ScriptVerb.ProjectileActorImpact]: (_world, ctx) => {
    // Blunt heads trade damage for control.
    ctx.damageType = "blunt";
    ctx.damage = Math.max(1, ctx.damage - 1);
    if (!ctx.chance(30)) return;
    ctx.deferResolved((resolvedCtx) => {
      if (!resolvedCtx.applied || resolvedCtx.killed) return;
      resolvedCtx.pushEffect(resolvedCtx.defender, {
        key: "stun",
        turnsLeft: 1,
        potency: 1,
        stacks: 1,
      });
      resolvedCtx.emit("proc:stunned", {
        actor: resolvedCtx.attacker,
        target: resolvedCtx.defender,
      });
    });
  },
});

registerScript(AMMO_CHALK_ARROW_ACTOR_IMPACT, {
  [ScriptVerb.ProjectileActorImpact]: (world, ctx) => {
    ctx.deferResolved((resolvedCtx) => {
      if (!resolvedCtx.applied || resolvedCtx.killed) return;
      resolvedCtx.pushEffect(resolvedCtx.defender, { key: "chalk_mark", turnsLeft: 5, potency: 1, stacks: 1 });
      resolvedCtx.emit("proc:chalkArrows:mark", { actor: resolvedCtx.attacker, target: resolvedCtx.defender });
    });
  },
});

registerScript(AMMO_CHALK_ARROW_WALL_IMPACT, {
  [ScriptVerb.ProjectileWallImpact]: (_world, ctx) => {
    ctx.spawnHazard({
      kind: "chalk_mark",
      medium: "floor",
      turnsLeft: 6,
      radius: 1,
      identity: "chalk_arrow_mark",
      name: "Chalk Mark",
      cause: "chalk_arrows:wall",
      meta: { chalk: true },
    });
    ctx.emit("proc:chalkArrows:wallMark", { actor: ctx.attacker, at: ctx.impact });
  },
});

registerScript(AMMO_CHALK_ARROW_MISS, {
  [ScriptVerb.ProjectileMiss]: (_world, ctx) => {
    ctx.spawnHazard({
      kind: "chalk_mark",
      medium: "floor",
      turnsLeft: 4,
      radius: 0,
      identity: "chalk_arrow_miss",
      name: "Chalk Mark",
      cause: "chalk_arrows:miss",
      meta: { chalk: true, miss: true },
    });
    ctx.emit("proc:chalkArrows:missMark", { actor: ctx.attacker, at: ctx.impact });
  },
});

/**
 * @param {string} key
 * @returns {string}
 */
export function canonicalAmmoHookKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return "";
  return AMMO_HOOK_ALIASES[normalized] || normalized;
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isScriptRefValue(value) {
  if (typeof value === "string" && value) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const key = value.ref ?? value.script ?? value.key ?? value.id ?? "";
  return typeof key === "string" && key.length > 0;
}

/**
 * @param {Record<string, unknown> | null | undefined} source
 * @returns {Record<string, Array<string | object>>}
 */
function normalizeAmmoHookScripts(source) {
  if (!source || typeof source !== "object") return {};
  const out = {};

  for (let i = 0; i < AMMO_HOOK_KEYS.length; i++) {
    const key = AMMO_HOOK_KEYS[i];
    const direct = source[key];
    if (Array.isArray(direct)) {
      out[key] = direct.filter(isScriptRefValue);
      continue;
    }

    const aliasEntries = Object.entries(AMMO_HOOK_ALIASES);
    for (let a = 0; a < aliasEntries.length; a++) {
      const [alias, canonical] = aliasEntries[a];
      if (canonical !== key) continue;
      const maybeList = source[alias];
      if (Array.isArray(maybeList)) {
        out[key] = maybeList.filter(isScriptRefValue);
        break;
      }
    }
  }

  return out;
}

/**
 * @param {any} def
 * @returns {Record<string, Array<string | object>>}
 */
export function resolveAmmoHookScripts(def) {
  const topLevel = normalizeAmmoHookScripts(def);
  const nestedScripts = normalizeAmmoHookScripts(def?.scripts && typeof def.scripts === "object" ? def.scripts : null);
  const nestedHooks = normalizeAmmoHookScripts(def?.hooks && typeof def.hooks === "object" ? def.hooks : null);
  return { ...topLevel, ...nestedHooks, ...nestedScripts };
}

const AMMO_ID_ALIASES = Object.freeze({
  arrows: "ammo_arrows",
  fire_arrows: "ammo_fire_arrows",
  piercing_arrows: "ammo_piercing_arrows",
  bodkin_arrows: "ammo_bodkin_arrows",
  blunt_arrows: "ammo_blunt_arrows",
  blunt_head_arrows: "ammo_blunt_arrows",
  chalk_arrows: "ammo_chalk_arrows",
  plain: "ammo_arrows",
  fire: "ammo_fire_arrows",
  piercing: "ammo_piercing_arrows",
  bodkin: "ammo_bodkin_arrows",
  blunt: "ammo_blunt_arrows",
});

/**
 * @param {string} key
 * @returns {string}
 */
function normalizeAmmoIdentity(key) {
  const normalized = String(key || "").toLowerCase().trim();
  if (!normalized) return "";
  if (AMMO_ID_ALIASES[normalized]) return AMMO_ID_ALIASES[normalized];
  if (normalized.startsWith("ammo_")) return normalized;
  return `ammo_${normalized}`;
}

export const AMMO_DEFS = Object.freeze({
  ammo_arrows: Object.freeze({
    id: "ammo_arrows",
    name: "Arrows",
    scripts: Object.freeze({
      onProjectileActorImpact: EMPTY_HOOK_SCRIPTS,
      onProjectileWallImpact: EMPTY_HOOK_SCRIPTS,
      onProjectileMiss: EMPTY_HOOK_SCRIPTS,
    }),
  }),
  ammo_fire_arrows: Object.freeze({
    id: "ammo_fire_arrows",
    name: "Fire Arrows",
    scripts: Object.freeze({
      onProjectileActorImpact: Object.freeze([AMMO_FIRE_ARROW_ACTOR_IMPACT]),
      onProjectileWallImpact: EMPTY_HOOK_SCRIPTS,
      onProjectileMiss: EMPTY_HOOK_SCRIPTS,
    }),
  }),
  ammo_piercing_arrows: Object.freeze({
    id: "ammo_piercing_arrows",
    name: "Piercing Arrows",
    scripts: Object.freeze({
      onProjectileActorImpact: Object.freeze([AMMO_PIERCING_ARROW_ACTOR_IMPACT]),
      onProjectileWallImpact: EMPTY_HOOK_SCRIPTS,
      onProjectileMiss: EMPTY_HOOK_SCRIPTS,
    }),
  }),
  ammo_bodkin_arrows: Object.freeze({
    id: "ammo_bodkin_arrows",
    name: "Bodkin Arrows",
    scripts: Object.freeze({
      onProjectileActorImpact: Object.freeze([AMMO_BODKIN_ARROW_ACTOR_IMPACT]),
      onProjectileWallImpact: EMPTY_HOOK_SCRIPTS,
      onProjectileMiss: EMPTY_HOOK_SCRIPTS,
    }),
  }),
  ammo_blunt_arrows: Object.freeze({
    id: "ammo_blunt_arrows",
    name: "Blunt-Head Arrows",
    scripts: Object.freeze({
      onProjectileActorImpact: Object.freeze([AMMO_BLUNT_ARROW_ACTOR_IMPACT]),
      onProjectileWallImpact: EMPTY_HOOK_SCRIPTS,
      onProjectileMiss: EMPTY_HOOK_SCRIPTS,
    }),
  }),
  ammo_chalk_arrows: Object.freeze({
    id: "ammo_chalk_arrows",
    name: "Chalk Arrows",
    scripts: Object.freeze({
      onProjectileActorImpact: Object.freeze([AMMO_CHALK_ARROW_ACTOR_IMPACT]),
      onProjectileWallImpact: Object.freeze([AMMO_CHALK_ARROW_WALL_IMPACT]),
      onProjectileMiss: Object.freeze([AMMO_CHALK_ARROW_MISS]),
    }),
  }),
});

/**
 * @param {string} key ammo identity (ammo_fire_arrows) or alias (fire_arrows, fire)
 * @returns {{ id:string, name:string, scripts?:Record<string, Array<string|object>> }|null}
 */
export function getAmmoDef(key) {
  const identity = normalizeAmmoIdentity(key);
  return identity ? (AMMO_DEFS[identity] || null) : null;
}

/**
 * @param {string} key ammo identity or alias
 * @param {string} hookKey canonical or alias hook key
 * @returns {Array<string | object>}
 */
export function getAmmoHookScripts(key, hookKey) {
  const canonical = canonicalAmmoHookKey(hookKey);
  if (!canonical) return EMPTY_HOOK_SCRIPTS;
  const scripts = resolveAmmoHookScripts(getAmmoDef(key));
  const list = scripts[canonical];
  return Array.isArray(list) ? list : EMPTY_HOOK_SCRIPTS;
}

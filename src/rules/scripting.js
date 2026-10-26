import { ScriptRef } from "./components/ScriptRef.js";

const REGISTRY = new Map();

export const ScriptVerb = Object.freeze({
  ProcEvaluate: "proc:evaluate",
  SpellCast: "spell:cast",
  ProjectileActorImpact: "projectile:actorImpact",
  ProjectileWallImpact: "projectile:wallImpact",
  ProjectileGroundImpact: "projectile:groundImpact",
  ProjectileMiss: "projectile:miss",
  AffixOnBeforeHit: "affix:onBeforeHit",
  AffixOnHit: "affix:onHit",
  AffixOnDamaged: "affix:onDamaged",
  AffixPassive: "affix:passive",
  ItemOnEquip: "item:onEquip",
  ItemOnUnequip: "item:onUnequip",
  ItemUse: "item:use",
  ItemThrow: "item:throw",
  TrapTrigger: "trap:trigger",
  ItemApply: "item:apply",
  AltarOffered: "altar:offered",
});

/**
 * Register a script handler map for a given key.
 * @param {string} key
 * @param {Record<string, Function> | Function} handlers
 */
export function registerScript(key, handlers) {
  if (!key) return;
  if (typeof handlers !== "function" && (typeof handlers !== "object" || !handlers)) return;
  const normalizedKey = String(key);
  const existing = REGISTRY.get(normalizedKey);
  if (existing && typeof existing === "object" && typeof handlers === "object") {
    REGISTRY.set(normalizedKey, { ...existing, ...handlers });
  } else {
    REGISTRY.set(normalizedKey, handlers);
  }
}

/**
 * Fetch the handler map for a script key.
 * @param {string} key
 */
export function getScriptHandlers(key) {
  return REGISTRY.get(String(key));
}

function normalizeRef(ref) {
  if (!ref) return { key: "", params: null };
  if (typeof ref === "string") return { key: ref, params: null };
  if (typeof ref === "object") {
    // Support both local ScriptRef { ref, params } and ecs-js ScriptRef { id, args }
    const key = ref.key ?? ref.id ?? ref.ref ?? ref.script ?? "";
    const params = ref.params ?? ref.args ?? null;
    return { key, params };
  }
  return { key: "", params: null };
}

function resolveHandler(handlers, verb) {
  if (!handlers) return null;
  if (typeof handlers === "function") return handlers;
  if (verb && typeof handlers[verb] === "function") return handlers[verb];
  if (typeof handlers.default === "function") return handlers.default;
  if (typeof handlers.run === "function") return handlers.run;
  return null;
}

function mergeParams(target, params) {
  if (!params) return target;
  const out = target && typeof target === "object" ? target : {};
  if (!out.params || typeof out.params !== "object") out.params = {};
  for (const [k, v] of Object.entries(params)) {
    if (!(k in out.params)) out.params[k] = v;
  }
  return out;
}

/**
 * Run a script by key or ScriptRef.
 * @param {string | object} ref
 * @param {string} verb
 * @param {import('../lib/ecs-js/index.js').World} world
 * @param {any} context
 */
export function runScript(ref, verb, world, context = {}) {
  const { key, params } = normalizeRef(ref);
  const handlerSource = key ? REGISTRY.get(String(key)) : null;
  const handler = resolveHandler(handlerSource, verb);
  if (typeof handler !== "function") return;
  const ctx = context && typeof context === "object" ? context : {};
  if (!ctx.world) ctx.world = world;
  mergeParams(ctx, params);
  try {
    return handler(world, ctx);
  } catch (err) {
    console.error?.("Script error", key || "<inline>", verb, err);
    return undefined;
  }
}

/**
 * Look up ScriptRef on an entity and execute the handler for the given verb.
 * @param {import('../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 * @param {string} verb
 * @param {any} context
 */
export function runEntityScript(world, entityId, verb, context = {}) {
  if (!world || !(entityId > 0)) return;
  const ref = world.get(entityId, ScriptRef);
  if (!ref) return;
  return runScript(ref, verb, world, { ...context, entityId });
}

export function listRegisteredScripts() {
  return Array.from(REGISTRY.keys());
}

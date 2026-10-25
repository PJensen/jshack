import { EFFECT_DEFS } from "./effectDefs.js";

const definitions = new Map();
const OPERATIONS = new Set(["damage", "heal", "stamina_restore", "mana_restore", "mana_drain", "stamina_drain"]);

// Static authoring registry. Runtime state is always stored on attached entities.
export function registerEffectDefinition(id, def) {
  if (!/^[a-z][a-z0-9_]*$/.test(id) || definitions.has(id)) throw new Error(`Invalid or duplicate effect definition: ${id}`);
  if (!def || typeof def !== "object") throw new Error(`Missing effect definition: ${id}`);
  const stacking = def.stacking || "refresh";
  if (!["refresh", "extend", "replace", "stack", "independent"].includes(stacking)) throw new Error(`Invalid effect stacking: ${stacking}`);
  const maxStacks = def.maxStacks ?? 1;
  if (!Number.isInteger(maxStacks) || maxStacks < 1) throw new Error("Effect maxStacks must be a positive integer");
  const match = def.match || "definition";
  if (!["definition", "actor", "item"].includes(match)) throw new Error(`Invalid effect match: ${match}`);
  if (def.periodic != null && !Array.isArray(def.periodic)) throw new Error("Effect periodic operations must be an array");
  if (def.statuses != null && (!Array.isArray(def.statuses) || def.statuses.some((key) => typeof key !== "string" || !key))) throw new Error("Effect statuses must be non-empty strings");
  const periodic = (def.periodic || []).map((op) => {
    if (!OPERATIONS.has(op.operation)) throw new Error(`Unknown periodic operation: ${op.operation}`);
    if (!Number.isFinite(op.amount) || op.amount < 0) throw new Error("Effect amount must be non-negative");
    const interval = op.interval ?? 1;
    if (!Number.isInteger(interval) || interval < 1) throw new Error("Effect interval must be a positive integer");
    return Object.freeze({ ...op, interval });
  });
  const out = Object.freeze({ ...def, id, stacking, maxStacks, match, statuses: Object.freeze([...(def.statuses || [])]), periodic: Object.freeze(periodic) });
  definitions.set(id, out);
  return out;
}

export function getEffectDefinition(id) {
  return definitions.get(String(id || "").toLowerCase()) || null;
}

const stew = EFFECT_DEFS.find((def) => def.id === "town_stew");
registerEffectDefinition("town_stew", {
  name: "Town Stew",
  description: stew.description,
  visualIdentity: "food_stew",
  statuses: stew.statuses,
  periodic: stew.operations.map((operation) => ({ operation, amount: 1 })),
});

import { ActiveEffects } from "../../rules/components/ActiveEffects.js";
import { Status } from "../../rules/components/Status.js";
import { canonicalStatusKey } from "../../rules/utils/effectSemantics.js";
import { snapshotEffectInstances } from "../../rules/utils/effectInstances.js";
import { getEffectDefinition } from "../../rules/data/effectInstances.js";
import { enrichStatusRowDisplay } from "./statusDisplayMetadata.js";

// One read-only projection feeds both the live VIS stack and character details.
export function buildEffectRows(world, actor) {
  const byKey = new Map();
  const active = world.get(actor, ActiveEffects)?.effects || [];
  const statuses = world.get(actor, Status)?.statuses || [];
  const instances = snapshotEffectInstances(world, actor);
  const instanceKeys = new Set(instances.map((row) => row.key));
  for (const entry of [...active, ...statuses]) {
    if (entry?.key === "stat_envelope" || Number(entry?.onsetLeft || 0) > 0) continue;
    const rawKey = String(entry?.key || entry?.type || "");
    if (getEffectDefinition(rawKey) && (!active.includes(entry) || instanceKeys.has(rawKey))) continue;
    const key = canonicalStatusKey(rawKey);
    const turns = Number(entry.turnsLeft ?? entry.duration ?? 0);
    if (!key || turns <= 0) continue;
    const sourceKey = String(
      entry.sourceKey
      || ((key === "stun" || key === "stunned") ? entry.meta?.source : "")
      || "",
    );
    const row = { key, turns, stacks: Math.max(1, Number(entry.stacks || 1)), potency: Number(entry.potency || 0), masked: entry.meta?.masked === true, sourceKey };
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, row);
    else byKey.set(key, { ...row, turns: Math.max(prev.turns, turns), stacks: Math.max(prev.stacks, row.stacks), potency: Math.max(prev.potency, row.potency), masked: prev.masked && row.masked, sourceKey: row.sourceKey || prev.sourceKey });
  }
  return [...byKey.values(), ...instances].map(enrichStatusRowDisplay);
}

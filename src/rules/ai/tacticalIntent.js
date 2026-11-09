import {
  TacticalIntent,
  TACTICAL_KINDS,
  TACTICAL_SOURCES,
} from "../components/TacticalIntent.js";

const SOURCE_PRIORITY = Object.freeze({
  [TACTICAL_SOURCES.chase]: 40,
  [TACTICAL_SOURCES.policy]: 20,
});

function normalizeInt(value, fallback = 0) {
  return Number.isFinite(value) ? value | 0 : fallback;
}

/**
 * Propose the actor's objective. Higher-priority proposals win; ties are
 * resolved by the deterministic source priority table and then first writer.
 */
export function proposeTacticalIntent(world, actorId, proposal = {}) {
  const kind = String(proposal.kind || "");
  if (!Object.prototype.hasOwnProperty.call(TACTICAL_KINDS, kind)) return false;

  const source = String(proposal.source || "");
  if (!Object.prototype.hasOwnProperty.call(SOURCE_PRIORITY, source)) return false;

  const priority = normalizeInt(proposal.priority, SOURCE_PRIORITY[source]);
  const existing = world.get(actorId, TacticalIntent);
  if (existing && existing.expiresAtStep > (world.step | 0)) {
    if (existing.priority >= priority) return false;
  }

  const next = {
    kind,
    source,
    priority,
    targetId: normalizeInt(proposal.targetId),
    targetX: normalizeInt(proposal.targetX),
    targetY: normalizeInt(proposal.targetY),
    dx: normalizeInt(proposal.dx),
    dy: normalizeInt(proposal.dy),
    expiresAtStep: (world.step | 0) + Math.max(1, normalizeInt(proposal.duration, 1)),
  };
  if (existing) world.set(actorId, TacticalIntent, next);
  else world.add(actorId, TacticalIntent, next);
  return true;
}

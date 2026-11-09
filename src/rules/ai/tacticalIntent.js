import {
  TacticalIntent,
  TACTICAL_KINDS,
  TACTICAL_SOURCES,
} from "../components/TacticalIntent.js";
import { TacticalProposal } from "../components/TacticalProposal.js";
import { Owner } from "../components/Owner.js";

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
  if (!world.isAlive(actorId)) return false;
  const proposalId = world.create();
  world.add(proposalId, Owner, { ownerId: actorId });
  world.add(proposalId, TacticalProposal, {
    kind,
    source,
    priority,
    targetId: normalizeInt(proposal.targetId),
    targetX: normalizeInt(proposal.targetX),
    targetY: normalizeInt(proposal.targetY),
    dx: normalizeInt(proposal.dx),
    dy: normalizeInt(proposal.dy),
    expiresAtStep: (world.step | 0) + Math.max(1, normalizeInt(proposal.duration, 1)),
  });
  return true;
}

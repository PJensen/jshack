import { Owner } from "../components/Owner.js";
import { TacticalIntent } from "../components/TacticalIntent.js";
import { TacticalProposal } from "../components/TacticalProposal.js";

function compareCandidates(a, b) {
  if (a.proposal.priority !== b.proposal.priority) {
    return b.proposal.priority - a.proposal.priority;
  }
  return a.id - b.id;
}

/** Select exactly one tactical objective per actor from transient candidates. */
export function tacticalArbitrationSystem(world) {
  const now = world.step | 0;
  const candidates = new Map();
  const stale = [];

  for (const [id, proposal, owner] of world.query(TacticalProposal, Owner)) {
    const actorId = Number(owner.ownerId || 0) | 0;
    if (!(actorId > 0) || !world.isAlive(actorId) || proposal.expiresAtStep <= now) {
      stale.push(id);
      continue;
    }
    const list = candidates.get(actorId) || [];
    list.push({ id, proposal });
    candidates.set(actorId, list);
  }

  for (const [actorId, list] of candidates) {
    list.sort(compareCandidates);
    const selected = list[0].proposal;
    const intent = {
      kind: selected.kind,
      source: selected.source,
      priority: selected.priority,
      targetId: selected.targetId,
      targetX: selected.targetX,
      targetY: selected.targetY,
      dx: selected.dx,
      dy: selected.dy,
      expiresAtStep: selected.expiresAtStep,
    };
    if (world.has(actorId, TacticalIntent)) world.set(actorId, TacticalIntent, intent);
    else world.add(actorId, TacticalIntent, intent);
  }

  for (const [actorId, list] of candidates) {
    for (const { id } of list) world.destroy(id);
  }
  for (const id of stale) world.destroy(id);
}

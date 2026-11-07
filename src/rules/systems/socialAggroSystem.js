import { AggroState, AGGRO_LEVELS } from "../components/AggroState.js";
import { AttackIntent } from "../components/Intents/AttackIntent.js";
import { MoveIntent } from "../components/Intents/MoveIntent.js";
import { Faction } from "../components/Faction.js";
import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { findNextCardinalStep } from "../utils/gridPathfind.js";
import { playerEntity } from "../utils/queries.js";
import { hasCapability } from "../utils/statusFacade.js";

const SOCIAL_AGGRO_FACTIONS = new Set(["shopkeeper", "townfolk", "neutral"]);

function isSocialFaction(value) {
  return SOCIAL_AGGRO_FACTIONS.has(String(value || "").trim().toLowerCase());
}

function cardinalDistance(a, b) {
  return Math.abs((a.x | 0) - (b.x | 0)) + Math.abs((a.y | 0) - (b.y | 0));
}

function directCardinalStep(from, to) {
  const dx = (to.x | 0) - (from.x | 0);
  const dy = (to.y | 0) - (from.y | 0);
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return { dx: Math.sign(dx), dy: 0 };
  if (dy !== 0) return { dx: 0, dy: Math.sign(dy) };
  return null;
}

export function socialAggroSystem(world) {
  const player = playerEntity(world);
  if (!player) return;
  const playerId = player.id | 0;
  const playerPos = player.pos;
  if (!playerPos) return;

  const playerInvisible = hasCapability(world, playerId, "concealed");

  for (const [id, pos, faction, aggro] of world.query(Position, Faction, AggroState)) {
    if (id === playerId) continue;
    if (!isSocialFaction(faction?.key)) continue;
    if (aggro.alertLevel !== AGGRO_LEVELS.hunting) continue;

    const vit = world.get(id, Vitality);
    if (vit && (vit.hp | 0) <= 0) continue;

    const dist = cardinalDistance(pos, playerPos);
    if (playerInvisible && dist > 1) continue;

    try { world.remove(id, MoveIntent); } catch {}

    if (dist === 1) {
      try { world.add(id, AttackIntent, { targetId: playerId, allowNonHostile: true }); } catch {}
      continue;
    }

    const step = findNextCardinalStep(
      world,
      pos.x | 0,
      pos.y | 0,
      playerPos.x | 0,
      playerPos.y | 0,
      id,
      {
        goalRadius: 1,
        maxNodes: 128,
        searchPadding: 12,
        passThroughDoors: true,
      },
    ) || directCardinalStep(pos, playerPos);
    if (!step) continue;
    try { world.add(id, MoveIntent, { dx: step.dx | 0, dy: step.dy | 0 }); } catch {}
  }
}

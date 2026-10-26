import { SoundEmitter } from "../components/SoundEmitter.js";
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_ALERTED, SEARCH_TURNS_CURIOUS } from "../components/AggroState.js";
import { Anatomy, HEARING_HL_THRESHOLD } from "../components/Anatomy.js";
import { Faction } from "../components/Faction.js";
import { Position } from "../components/Position.js";
import { Player } from "../components/Player.js";
import { InvestigationSignal } from "../components/InvestigationSignal.js";
import { queryEnemyListeners } from "../utils/queries.js";
import { chebyshevScalar } from "../utils/distance.js";

// Maximum tile radius any hearing system can reach (caps computation cost).
const MAX_HEAR_RADIUS = 30;

// Decibel attenuation per tile of distance (rough grid approximation).
const DB_PER_TILE = 3;

/**
 * Compute how many tiles away a sound source of `sourceDb` can be heard
 * by a creature with the given hearing tier threshold.
 */
function detectRadius(sourceDb, hearingTier) {
  const threshold = HEARING_HL_THRESHOLD[hearingTier];
  if (threshold == null || sourceDb <= threshold) return 0;
  return Math.min(MAX_HEAR_RADIUS, Math.floor((sourceDb - threshold) / DB_PER_TILE));
}


/**
 * soundPropagationSystem — checks SoundEmitter entities against nearby
 * Anatomy hearing tiers and routes InvestigationSignal entities to curious AI.
 *
 * Phase: effects (runs after movement/combat produce sounds; before the
 * next ai phase where AggroState is read to produce intents).
 *
 * After processing, SoundEmitter.lastActionNoise is zeroed (one-shot).
 *
 * Rules:
 *   - Noise >= 60 dB detected → escalate to "alerted".
 *   - Noise >= 30 dB detected → escalate to "curious" (if currently "unaware").
 *   - Already "hunting" entities are never downgraded by this system.
 *   - lastKnownX/Y is set to the emitter's position when a sound is detected.
 */
export function soundPropagationSystem(world) {
  // Collect all active sound sources this tick.
  /** @type {Array<{ x: number, y: number, db: number, isPlayer: boolean }>} */
  const sources = [];

  for (const [srcId, emitter, srcPos] of world.query(SoundEmitter, Position)) {
    const db = Math.max(emitter.ambient, emitter.lastActionNoise);
    if (db <= 0) continue;
    sources.push({
      x:        srcPos.x | 0,
      y:        srcPos.y | 0,
      db,
      isPlayer: world.has(srcId, Player),
    });
    // Decay the one-shot spike immediately after reading.
    emitter.lastActionNoise = 0;
  }

  const signals = [];
  for (const [signalId, signal, pos] of world.query(InvestigationSignal, Position)) {
    signals.push({
      x: pos.x | 0,
      y: pos.y | 0,
      range: Math.max(0, Number(signal.range) || 0),
      priority: Number(signal.priority) || 0,
      createdAt: Number(signal.createdAt) | 0,
      id: signalId,
    });
  }
  signals.sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt || b.id - a.id);

  if (sources.length === 0 && signals.length === 0) return;

  // Check each entity that has hearing + aggro capability.
  // queryEnemyListeners already filters to faction.key === "enemy".
  for (const [listenerId, anatomy, aggroState, faction, listenPos] of
       queryEnemyListeners(world)) {

    // Already hunting — the aiChaseSystem handles this entity; don't interfere.
    if (aggroState.alertLevel === AGGRO_LEVELS.hunting) continue;

    const hearingTier = anatomy.hearing;
    const lx = listenPos.x | 0;
    const ly = listenPos.y | 0;

    for (const src of sources) {
      // Enemies react primarily to player-emitted sounds.
      if (!src.isPlayer) continue;

      const radius = detectRadius(src.db, hearingTier);
      if (radius <= 0) continue;

      const dist = chebyshevScalar(lx, ly, src.x, src.y);
      if (dist > radius) continue;

      // Sound detected — escalate AggroState.
      const wasAlerted = aggroState.alertLevel === AGGRO_LEVELS.alerted;
      const wasCurious = aggroState.alertLevel === AGGRO_LEVELS.curious;
      const wasUnaware = aggroState.alertLevel === AGGRO_LEVELS.unaware;

      if (src.db >= 60) {
        // Loud enough (conversation-level or above) → alerted.
        if (wasUnaware || wasCurious) {
          aggroState.alertLevel      = AGGRO_LEVELS.alerted;
          aggroState.lastKnownX      = src.x;
          aggroState.lastKnownY      = src.y;
          aggroState.searchTurnsLeft = SEARCH_TURNS_ALERTED;
        }
      } else {
        // Quiet sound (footstep-level) → curious only if currently unaware.
        if (wasUnaware) {
          aggroState.alertLevel      = AGGRO_LEVELS.curious;
          aggroState.lastKnownX      = src.x;
          aggroState.lastKnownY      = src.y;
          aggroState.searchTurnsLeft = SEARCH_TURNS_CURIOUS;
        }
      }

      // One escalation per tick is enough; stop checking sources for this listener.
      break;
    }

    // Persistent investigation signals can draw curious creatures along a trail.
    // Hunting creatures keep their live target and ignore decoys.
    if (aggroState.alertLevel === AGGRO_LEVELS.hunting) continue;
    for (const signal of signals) {
      if (lx === signal.x && ly === signal.y) continue;
      if (chebyshevScalar(lx, ly, signal.x, signal.y) > signal.range) continue;
      aggroState.alertLevel = AGGRO_LEVELS.curious;
      aggroState.lastKnownX = signal.x;
      aggroState.lastKnownY = signal.y;
      aggroState.searchTurnsLeft = SEARCH_TURNS_CURIOUS;
      break;
    }
  }
}

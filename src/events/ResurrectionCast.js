import { EcsEvent } from "../lib/ecs-js/index.js";

function point(payload, key) {
  const value = payload?.[key] || {};
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`ResurrectionCast.${key} must have finite x/y`);
  }
  return { x: x | 0, y: y | 0 };
}

export class ResurrectionCast extends EcsEvent {
  constructor(payload = {}) {
    super();
    const actor = Number(payload.actor || 0) | 0;
    if (!(actor > 0)) throw new Error("ResurrectionCast.actor must be a positive entity id");

    this.actor = actor;
    this.at = point(payload, "at");
    this.corpseId = Number(payload.corpseId || 0) | 0;
    this.reanimatedId = Number(payload.reanimatedId || 0) | 0;
    this.identity = String(payload.identity || "");
    this.durationTurns = Math.max(0, Number(payload.durationTurns || 0) | 0);
    this.fizzle = payload.fizzle === true;
    this.reason = String(payload.reason || "");

    Object.freeze(this);
  }
}

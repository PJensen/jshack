import { EcsEvent } from "../lib/ecs-js/index.js";

export class RendCast extends EcsEvent {
  constructor(payload = {}) {
    super();
    this.actor = Number(payload.actor || 0) | 0;
    this.targetId = Number(payload.targetId || 0) | 0;
    this.at = Object.freeze({
      x: Number(payload.at?.x || 0) | 0,
      y: Number(payload.at?.y || 0) | 0,
    });
    this.amount = Number(payload.amount || 0) | 0;
    this.hit = payload.hit === true;
    this.bleeding = payload.bleeding === true;
    this.fizzle = payload.fizzle === true;
    this.missed = payload.missed === true;
    Object.freeze(this);
  }
}

import { EcsEvent } from "../lib/ecs-js/index.js";

export class ChargeCast extends EcsEvent {
  constructor(payload = {}) {
    super();
    this.actor = Number(payload.actor || 0) | 0;
    this.targetId = Number(payload.targetId || 0) | 0;
    this.from = Object.freeze({ x: Number(payload.from?.x || 0) | 0, y: Number(payload.from?.y || 0) | 0 });
    this.to = Object.freeze({ x: Number(payload.to?.x || 0) | 0, y: Number(payload.to?.y || 0) | 0 });
    this.amount = Number(payload.amount || 0) | 0;
    this.hit = payload.hit === true;
    this.stunned = payload.stunned === true;
    this.fizzle = payload.fizzle === true;
    this.missed = payload.missed === true;
    Object.freeze(this);
  }
}

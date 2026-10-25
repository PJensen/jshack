import { EcsEvent } from "../lib/ecs-js/index.js";

export class EffectChanged extends EcsEvent {
  constructor(payload = {}) {
    super();
    this.actor = Number(payload.actor || 0) | 0;
    this.instanceId = Number(payload.instanceId || 0) | 0;
    this.key = String(payload.key || "");
    this.phase = String(payload.phase || "");
    this.reason = String(payload.reason || "");
    Object.freeze(this);
  }
}

import { EcsEvent } from "../lib/ecs-js/index.js";

export class EncounterActivated extends EcsEvent {
  constructor(payload = {}) {
    super();
    this.encounterId = String(payload.encounterId || "");
    this.creatureId = String(payload.creatureId || "");
    this.stateId = Number(payload.stateId || 0) | 0;
    this.source = String(payload.source || "");
    this.step = Number(payload.step || 0) | 0;
    if (!this.encounterId) throw new Error("EncounterActivated.encounterId is required");
    Object.freeze(this);
  }
}

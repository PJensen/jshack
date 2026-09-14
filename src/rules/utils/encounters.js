import { EncounterState, ENCOUNTER_STATES } from "../components/EncounterState.js";

export function findEncounterState(world, encounterId) {
  const wanted = String(encounterId || "");
  for (const [id, state] of world.query(EncounterState)) {
    if (String(state?.encounterId || "") === wanted) return { id, state };
  }
  return null;
}

export function findActiveEncounter(world, encounterId) {
  const found = findEncounterState(world, encounterId);
  if (!found || found.state.status !== ENCOUNTER_STATES.active) return null;
  return found;
}

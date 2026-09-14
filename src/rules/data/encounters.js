// First-class authored encounter definitions.
//
// Monster definitions describe creature capabilities. Encounter definitions
// describe how those creatures enter the world: population, composition,
// placement, activation, and uniqueness.

const _byId = new Map();

function freezeDefinition(def) {
  const copy = { ...def };
  if (Array.isArray(copy.biomes)) copy.biomes = Object.freeze([...copy.biomes]);
  if (Array.isArray(copy.followers)) copy.followers = Object.freeze(copy.followers.map((f) => Object.freeze({ ...f })));
  if (copy.activation && typeof copy.activation === "object") copy.activation = Object.freeze({ ...copy.activation });
  if (copy.placement && typeof copy.placement === "object") copy.placement = Object.freeze({ ...copy.placement });
  return Object.freeze(copy);
}

/** @param {object} def */
export function registerEncounterDef(def) {
  if (!def || typeof def !== "object" || !def.id) return;
  if (_byId.has(def.id)) return;
  _byId.set(String(def.id), freezeDefinition(def));
}

/** @param {string} id @returns {object|null} */
export function getEncounter(id) {
  return _byId.get(String(id || "")) || null;
}

/** @returns {object[]} */
export function getAllEncounters() {
  return [..._byId.values()];
}

/** @param {string} kind @returns {object[]} */
export function getEncountersByKind(kind) {
  const wanted = String(kind || "");
  return getAllEncounters().filter((def) => String(def.kind || "") === wanted);
}

/** @param {string} creatureId @returns {object[]} */
export function getEncountersForCreature(creatureId) {
  const wanted = String(creatureId || "");
  return getAllEncounters().filter((def) => String(def.creatureId || "") === wanted);
}

export function clearEncounterDefinitions() {
  _byId.clear();
}

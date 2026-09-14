// src/content/registry.js
// Central content registry. All defineItem() / defineMonster() /
// defineInteractable() calls
// register their compiled outputs here. installContent() reads from here
// and wires everything into the existing engine registries.

/** @type {Map<string, object>} id → compiled catalog-compatible item def */
const _items = new Map();

/** @type {Map<string, object>} id → compiled MonsterDef-compatible object */
const _monsters = new Map();

/** @type {Map<string, object>} id → compiled encounter definition */
const _encounters = new Map();

/** @type {Map<string, object>} action → compiled interaction definition */
const _interactables = new Map();

/** @type {Map<string, { glyph: string, fg: string, glow?: string, baseScale?: number }>} */
const _palettes = new Map();

// ── Items ──────────────────────────────────────────────────────────

export function registerItem(id, compiledDef) {
  if (_items.has(id)) {
    throw new Error(`[content] Duplicate item definition: "${id}"`);
  }
  _items.set(id, compiledDef);
}

export function getContentItem(id) { return _items.get(id) || null; }
export function allContentItems() { return _items; }

// ── Monsters ───────────────────────────────────────────────────────

export function registerMonster(id, compiledDef) {
  if (_monsters.has(id)) {
    throw new Error(`[content] Duplicate monster definition: "${id}"`);
  }
  _monsters.set(id, compiledDef);
}

export function getContentMonster(id) { return _monsters.get(id) || null; }
export function allContentMonsters() { return _monsters; }

// ── Encounters ────────────────────────────────────────────────────

export function registerEncounter(id, compiledDef) {
  if (_encounters.has(id)) {
    throw new Error(`[content] Duplicate encounter definition: "${id}"`);
  }
  _encounters.set(id, compiledDef);
}

export function getContentEncounter(id) { return _encounters.get(id) || null; }
export function allContentEncounters() { return _encounters; }

// ── Interactables ───────────────────────────────────────────────────

export function registerInteractable(action, compiledDef) {
  if (_interactables.has(action)) {
    throw new Error(`[content] Duplicate interactable definition: "${action}"`);
  }
  _interactables.set(action, compiledDef);
}

export function allContentInteractables() { return _interactables; }

// ── Palette ────────────────────────────────────────────────────────

export function registerPalette(identity, entry) {
  _palettes.set(identity, entry);
}

export function allContentPalettes() { return _palettes; }

// ── Presentations ──────────────────────────────────────────────────

/** @type {Map<string, Map<string, object>>} identity → presentationId → spec */
const _presentations = new Map();

export function registerPresentation(identity, presentationId, spec) {
  if (!_presentations.has(identity)) _presentations.set(identity, new Map());
  _presentations.get(identity).set(presentationId, spec);
}

/**
 * Look up a presentation spec.
 * @param {string} identity - thing identity (e.g. "sun_vessel")
 * @param {string} presentationId - event name (e.g. "sun_vessel_pulse")
 * @returns {object|null}
 */
export function getPresentation(identity, presentationId) {
  return _presentations.get(identity)?.get(presentationId) || null;
}

export function allContentPresentations() { return _presentations; }

// ── Abilities ──────────────────────────────────────────────────────

/** @type {Map<string, Map<string, object>>} itemIdentity → abilityId → ability spec */
const _abilities = new Map();

export function registerAbility(identity, abilityId, spec) {
  if (!_abilities.has(identity)) _abilities.set(identity, new Map());
  _abilities.get(identity).set(abilityId, spec);
}

/**
 * Get all abilities for an item identity.
 * @param {string} identity
 * @returns {Map<string, object>|null}
 */
export function getAbilities(identity) {
  return _abilities.get(identity) || null;
}

/**
 * Get a single ability spec.
 * @param {string} identity
 * @param {string} abilityId
 * @returns {object|null}
 */
export function getAbility(identity, abilityId) {
  return _abilities.get(identity)?.get(abilityId) || null;
}

export function allContentAbilities() { return _abilities; }

// ── Testing ────────────────────────────────────────────────────────

/** Reset all registries. Test-only. */
export function clearContentRegistry() {
  _items.clear();
  _monsters.clear();
  _encounters.clear();
  _interactables.clear();
  _palettes.clear();
  _presentations.clear();
  _abilities.clear();
}

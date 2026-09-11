/**
 * Normalize faction keys for table lookups.
 * @param {unknown} key
 * @returns {string}
 */
function normalizeFactionKey(key) {
  return String(key || "").trim().toLowerCase();
}

/**
 * Explicit faction hostility table.
 * - player + pet + summoned + stone_taunter are allies
 * - enemy is hostile to that ally group
 * - neutral/shopkeeper are non-hostile by default
 * Unknown factions fall back to legacy behavior (different faction => hostile).
 * @type {Readonly<Record<string, ReadonlySet<string>>>}
 */
const HOSTILITY = Object.freeze({
  player: Object.freeze(new Set(["enemy"])),
  pet: Object.freeze(new Set(["enemy"])),
  summoned: Object.freeze(new Set(["enemy"])),
  stone_taunter: Object.freeze(new Set(["enemy"])),
  enemy: Object.freeze(new Set(["player", "pet", "summoned", "stone_taunter", "townfolk"])),
  neutral: Object.freeze(new Set()),
  shopkeeper: Object.freeze(new Set()),
  townfolk: Object.freeze(new Set(["enemy"])),
});

/**
 * Return whether attacker faction is hostile toward defender faction.
 * @param {unknown} attackerFaction
 * @param {unknown} defenderFaction
 * @returns {boolean}
 */
export function areFactionsHostile(attackerFaction, defenderFaction) {
  const attacker = normalizeFactionKey(attackerFaction);
  const defender = normalizeFactionKey(defenderFaction);

  // Preserve legacy behavior for entities with no faction metadata.
  if (!attacker || !defender) return true;

  // Check explicit table first — allows same-faction hostility (e.g. enemy vs
  // enemy when Ring of Conflict is active).
  const explicit = HOSTILITY[attacker];
  if (explicit && explicit.has(defender)) return true;

  if (attacker === defender) return false;
  if (explicit) return false; // in table but not hostile

  // Legacy fallback for unknown factions.
  return true;
}

/**
 * Return whether two factions are allies rather than merely non-hostile.
 * Neutral/social factions are intentionally excluded from alliance checks.
 * @param {unknown} firstFaction
 * @param {unknown} secondFaction
 * @returns {boolean}
 */
export function areFactionsAllied(firstFaction, secondFaction) {
  const first = normalizeFactionKey(firstFaction);
  const second = normalizeFactionKey(secondFaction);
  if (!first || !second) return false;
  if (first === "neutral" || second === "neutral") return false;
  if (first === "shopkeeper" || second === "shopkeeper") return false;
  if (areFactionsHostile(first, second) || areFactionsHostile(second, first)) return false;
  return true;
}

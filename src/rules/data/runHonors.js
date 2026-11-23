export const RUN_HONORS = Object.freeze({
  pacifist: Object.freeze({ id: "pacifist", label: "Pacifist", description: "No player-credited creature kills." }),
  spellless: Object.freeze({ id: "spellless", label: "Spellless", description: "No spells cast." }),
  prayerless: Object.freeze({ id: "prayerless", label: "Prayerless", description: "No prayers made." }),
  honest: Object.freeze({ id: "honest", label: "Honest hands", description: "No shop theft escapes." }),
  corpse_pure: Object.freeze({ id: "corpse_pure", label: "Corpse-pure", description: "No pet corpses desecrated." }),
});

export function deriveRunHonors(chronicle = {}) {
  const checks = {
    pacifist: Number(chronicle.kills || 0) === 0,
    spellless: Number(chronicle.spellsCast || 0) === 0,
    prayerless: Number(chronicle.prayers || 0) === 0,
    honest: Number(chronicle.thefts || 0) === 0,
    corpse_pure: Number(chronicle.corpsesDesecrated || 0) === 0,
  };
  return Object.values(RUN_HONORS).filter((honor) => checks[honor.id]);
}

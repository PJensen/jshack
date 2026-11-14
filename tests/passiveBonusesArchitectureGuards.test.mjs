import { assertEquals } from "jsr:@std/assert";

const GUARDED_FILES = Object.freeze([
  "src/rules/utils/dealDamage.js",
  "src/rules/utils/resolveCombatSnapshot.js",
  "src/rules/utils/spellDamage.js",
  "src/rules/systems/manaRegenerationSystem.js",
  "src/rules/systems/staminaRegenerationSystem.js",
  "src/rules/systems/hungerSystem.js",
  "src/rules/systems/disarmTrapSystem.js",
  "src/rules/systems/effectSystem.js",
]);

const FORBIDDEN_TOKENS = Object.freeze([
  "eq?.accuracyDerived",
  "eq.accuracyDerived",
  "eq?.damagePowerDerived",
  "eq.damagePowerDerived",
  "eq?.evadeDerived",
  "eq.evadeDerived",
  "eq?.maxHpDerived",
  "eq.maxHpDerived",
  "eq?.critChanceDerived",
  "eq.critChanceDerived",
  "eq?.critMultDerived",
  "eq.critMultDerived",
  "eq?.manaRegenDerived",
  "eq.manaRegenDerived",
  "eq?.maxManaDerived",
  "eq.maxManaDerived",
  "eq?.staminaRegenDerived",
  "eq.staminaRegenDerived",
  "eq?.maxStaminaDerived",
  "eq.maxStaminaDerived",
  "eq?.kineticDRDerived",
  "eq.kineticDRDerived",
  "eq?.fireResistDerived",
  "eq.fireResistDerived",
  "eq?.poisonResistDerived",
  "eq.poisonResistDerived",
  "eq?.acidResistDerived",
  "eq.acidResistDerived",
  "eq?.radiationResistDerived",
  "eq.radiationResistDerived",
  "eq?.electricOhmsDerived",
  "eq.electricOhmsDerived",
  "eq?.bluntResistDerived",
  "eq.bluntResistDerived",
  "eq?.slashResistDerived",
  "eq.slashResistDerived",
  "eq?.pierceResistDerived",
  "eq.pierceResistDerived",
  "eq?.luckDerived",
  "eq.luckDerived",
  "eq?.visionRangeDerived",
  "eq.visionRangeDerived",
  "eq?.hungerRateDerived",
  "eq.hungerRateDerived",
]);

Deno.test("migrated rules files do not read Equipment.*Derived directly", async () => {
  const root = Deno.cwd();
  const offenders = [];

  for (let i = 0; i < GUARDED_FILES.length; i++) {
    const relPath = GUARDED_FILES[i];
    const text = await Deno.readTextFile(`${root}/${relPath}`);
    for (let t = 0; t < FORBIDDEN_TOKENS.length; t++) {
      const token = FORBIDDEN_TOKENS[t];
      if (text.includes(token)) offenders.push(`${relPath}::${token}`);
    }

    const usesPassive = text.includes("getPassiveBonuses(")
      || text.includes("resolveDerivedStats(")
      || text.includes("resolveCanonicalStats(")
      || text.includes("resolveResourceStats(");
    if (!usesPassive) offenders.push(`${relPath}::missing passive resolver usage`);
  }

  assertEquals(
    offenders,
    [],
    `Migrated rules files must read passive state from the resolver, not Equipment.*Derived. Offenders: ${offenders.join(", ")}`,
  );
});

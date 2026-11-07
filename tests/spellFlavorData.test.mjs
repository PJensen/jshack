import { assert, assertEquals } from "jsr:@std/assert";
import {
  getSpell,
  listSpells,
  describeSpellDetailLines,
  describeSpellTargetEffects,
} from "../src/rules/data/spells.js";

Deno.test("spell defs include tooltip flavor and impact notes", () => {
  const frost = getSpell("frost");
  assert(frost, "frost should exist");
  assertEquals(frost.manaCost, 5);
  assert(typeof frost.description === "string" && frost.description.length > 0, "frost should have flavor description");
  assert(Array.isArray(frost.effects) && frost.effects.length > 0, "frost should have effects");
  const targetEffects = describeSpellTargetEffects(frost);
  assert(targetEffects.some((line) => String(line).toLowerCase().includes("frost")), "frost target effects should mention frost");
  const detailLines = describeSpellDetailLines(frost);
  assert(detailLines.some((line) => String(line).includes("Mana 5")), "frost details should include mana cost");
});

Deno.test("physical spells can declare stamina costs in tooltip detail lines", () => {
  const phaseStrike = getSpell("phase_strike");
  assert(phaseStrike, "phase_strike should exist");
  const details = describeSpellDetailLines(phaseStrike);
  assert(details.some((line) => String(line).includes("Stamina 10")), "phase_strike should show stamina cost");
});

Deno.test("owned effect tooltip duration comes from authored active mechanics", () => {
  const barkskin = getSpell("barkskin");
  const lines = describeSpellTargetEffects(barkskin);
  assert(lines.some((line) => line.includes("20 turns")), "barkskin duration should come from activeEffect");
  assert(lines.some((line) => line.includes("recovery")), "barkskin mechanics should remain visible");
});

Deno.test("all spells expose tooltip-ready description and impacts", () => {
  for (const spell of listSpells()) {
    assert(typeof spell.description === "string" && spell.description.length > 0, `${spell.id} missing description`);
    assert(Array.isArray(spell.effects) && spell.effects.length > 0, `${spell.id} missing effects`);
    assert(describeSpellTargetEffects(spell).length > 0, `${spell.id} missing target effects`);
  }
});

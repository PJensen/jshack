import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { CLASS_DEFS, getClass, listClassIds } from '../src/rules/data/classes.js';
import { DEITY_DEFS } from '../src/rules/data/deities.js';
import { getCatalogItem } from '../src/rules/data/itemCatalog.js';
import { getSpell } from "../src/rules/data/spells.js";

Deno.test("CLASS_DEFS has exactly 11 classes", () => {
  const ids = listClassIds();
  assertEquals(ids.length, 11);
  for (const id of ['druid', 'warden', 'outlaw', 'cleric', 'archeologist', 'warlock', 'necromancer', 'mage', 'mireborn', 'pilgrim', 'valkyrie']) {
    assert(ids.includes(id), `missing class: ${id}`);
  }
});

Deno.test("each class has a valid deityId", () => {
  for (const [id, def] of Object.entries(CLASS_DEFS)) {
    assert(DEITY_DEFS[def.deityId] != null,
      `class ${id} references unknown deity: ${def.deityId}`);
  }
});

Deno.test("each class has positive maxHp and maxMana", () => {
  for (const [id, def] of Object.entries(CLASS_DEFS)) {
    assert(def.stats.maxHp > 0, `class ${id} has non-positive maxHp`);
    assert(def.stats.maxMana > 0, `class ${id} has non-positive maxMana`);
  }
});

Deno.test("getClass returns null for unknown id", () => {
  assertEquals(getClass('wizard'), null);
});

Deno.test("druid maps to gaia", () => {
  assertEquals(getClass('druid').deityId, 'gaia');
});

Deno.test("warden maps to molkhar", () => {
  assertEquals(getClass('warden').deityId, 'molkhar');
});

Deno.test("outlaw maps to loki", () => {
  assertEquals(getClass('outlaw').deityId, 'loki');
});

Deno.test("cleric maps to seraphine", () => {
  assertEquals(getClass('cleric').deityId, 'seraphine');
});

Deno.test("cleric starts with one vial of holy water", () => {
  const cleric = getClass('cleric');
  const holyWater = cleric.inventoryItems.find((entry) => entry.itemId === 'potion_holy_water');
  assert(holyWater, 'cleric should include potion_holy_water in starter inventory');
  assertEquals(holyWater.count, 1);
});

Deno.test("cleric starts with holy_strike and smite as class spells", () => {
  const cleric = getClass("cleric");
  assert(Array.isArray(cleric.startingSpells), "cleric should expose startingSpells");
  assert(cleric.startingSpells.includes("holy_strike"), "cleric should start with holy_strike");
  assert(cleric.startingSpells.includes("smite"), "cleric should start with smite");
  assertEquals(cleric.startingSpells.length, 2, "cleric should start with exactly 2 spells");
});

Deno.test("valkyrie is fate-oriented and death-aware", () => {
  const valkyrie = getClass('valkyrie');
  assert(valkyrie, 'valkyrie should be a class');
  assertEquals(valkyrie.deityId, 'seraphine');
  assertEquals(valkyrie.fate.deathAware, true);
  assertEquals(valkyrie.fate.nearbyDeathPower, true);
  assertEquals(valkyrie.fate.draugrDisposition, 'judgment');
  assert(valkyrie.startingSpells.includes('holy_strike'), 'valkyrie should start with holy_strike');
  assert(valkyrie.startingSpells.includes('smite'), 'valkyrie should start with smite');
});

Deno.test("warden has highest maxHp", () => {
  const hps = Object.values(CLASS_DEFS).map(c => c.stats.maxHp);
  const warden = getClass('warden').stats.maxHp;
  assert(hps.every(hp => hp <= warden), 'warden should have highest maxHp');
});

Deno.test("equipment and inventory items have valid string ids", () => {
  for (const [classId, def] of Object.entries(CLASS_DEFS)) {
    for (const [slot, itemId] of Object.entries(def.equipment)) {
      if (itemId !== null) {
        assert(typeof itemId === 'string' && itemId.length > 0,
          `class ${classId} equipment.${slot} has invalid itemId`);
      }
    }
    for (const entry of def.inventoryItems) {
      assert(typeof entry.itemId === 'string' && entry.itemId.length > 0,
        `class ${classId} has invalid inventory itemId`);
      assert(typeof entry.count === 'number' && entry.count > 0,
        `class ${classId} inventory item ${entry.itemId} has invalid count`);
    }
  }
});

Deno.test("each class has a valid deity", () => {
  for (const [id, def] of Object.entries(CLASS_DEFS)) {
    assert(DEITY_DEFS[def.deityId] != null,
      `class ${id} references unknown deity: ${def.deityId}`);
  }
});

Deno.test("warlock maps to molkhar", () => {
  assertEquals(getClass('warlock').deityId, 'molkhar');
});

Deno.test("warlock starts with shadow_bolt and lifetap", () => {
  const warlock = getClass('warlock');
  assert(Array.isArray(warlock.startingSpells), 'warlock should have startingSpells array');
  assert(warlock.startingSpells.includes('shadow_bolt'), 'warlock should start with shadow_bolt');
  assert(warlock.startingSpells.includes('agony'), 'warlock should start with agony');
  assertEquals(warlock.startingSpells.length, 2, "warlock should start with exactly 2 spells");
});

Deno.test("necromancer is a Molkhar caster with grave-themed starter spells", () => {
  const necromancer = getClass('necromancer');
  assert(necromancer, 'necromancer should be a class');
  assertEquals(necromancer.deityId, 'molkhar');
  assertEquals(necromancer.icon, '💀');
  assert(necromancer.description.includes('temporary allies'));
  assertEquals(necromancer.startingSpells.length, 2);
  assert(necromancer.startingSpells.includes('agony'));
  assert(necromancer.startingSpells.includes('summon_skeleton'));
  assertEquals(necromancer.equipment.weapon, 'staff_oak');
  assertEquals(necromancer.equipment.gloves, 'gloves_arcane');
});

Deno.test("outlaw starts with cheap_shot and poison_blade", () => {
  const outlaw = getClass('outlaw');
  assert(Array.isArray(outlaw.startingSpells), 'outlaw should have startingSpells array');
  assert(outlaw.startingSpells.includes('cheap_shot'), 'outlaw should start with cheap_shot');
  assert(outlaw.startingSpells.includes('poison_blade'), 'outlaw should start with poison_blade');
  assertEquals(outlaw.startingSpells.length, 2, "outlaw should start with exactly 2 spells");
});

Deno.test("druid starts with natures_touch and barkskin", () => {
  const druid = getClass('druid');
  assert(Array.isArray(druid.startingSpells), 'druid should have startingSpells array');
  assert(druid.startingSpells.includes('natures_touch'), 'druid should start with natures_touch');
  assert(druid.startingSpells.includes('barkskin'), 'druid should start with barkskin');
  assertEquals(druid.startingSpells.length, 2, "druid should start with exactly 2 spells");
});

Deno.test("warlock starts with arcane handwraps for spell hit", () => {
  const warlock = getClass("warlock");
  assertEquals(warlock.equipment.gloves, "gloves_arcane");
  const gloves = getCatalogItem("gloves_arcane");
  assert(gloves, "gloves_arcane should exist");
  assertEquals(Number(gloves.bonuses?.spellHit || 0), 2);
});

Deno.test("caster jewelry exposes spell hit bonuses", () => {
  assertEquals(Number(getCatalogItem("ring_arcana")?.bonuses?.spellHit || 0), 1);
  assertEquals(Number(getCatalogItem("amulet_focus")?.bonuses?.spellHit || 0), 1);
  assertEquals(Number(getCatalogItem("amulet_arcanum")?.bonuses?.spellHit || 0), 3);
});

Deno.test("shadow_bolt has tuned cast time and deals damage", () => {
  const spell = getSpell("shadow_bolt");
  assert(spell, "shadow_bolt should exist");
  assertEquals(spell.castTime, 1);
  assert(spell.manaCost > 0, "shadow_bolt should cost mana");
  const dmgEffect = spell.effects.find(e => e.kind === 'damage');
  assert(dmgEffect, "shadow_bolt should have a damage effect");
  const amountText = String(dmgEffect.amount ?? "");
  assert(/[1-9]/.test(amountText), "shadow_bolt damage should describe a positive amount");
});

Deno.test("summon_skeleton has 5-turn cast time", () => {
  const spell = getSpell("summon_skeleton");
  assert(spell, "summon_skeleton should exist");
  assertEquals(spell.castTime, 5);
});

Deno.test("druid starts with at least +1 defense from equipped gear", () => {
  const druid = getClass('druid');
  const equippedIds = Object.values(druid.equipment).filter((id) => typeof id === 'string');
  const defenseTotal = equippedIds.reduce((sum, itemId) => {
    const def = getCatalogItem(itemId);
    const bonus = Number(def?.bonuses?.defense || 0);
    return sum + bonus;
  }, 0);
  assert(defenseTotal >= 1, `druid defense from starter gear should be >= 1, got ${defenseTotal}`);
});

Deno.test("non-outlaw classes have raised starter dexterity for steadier melee hit rates", () => {
  for (const id of ["warden", "druid", "archeologist", "warlock", "cleric"]) {
    const dexterity = Number(getClass(id)?.stats?.dexterity || 0);
    assert(dexterity >= 12, `${id} should start at dexterity 12+ to avoid excessive early misses`);
  }
  assertEquals(Number(getClass("outlaw")?.stats?.dexterity || 0), 16, "outlaw dexterity should remain unchanged");
});

Deno.test("all classes start with baseline utility consumables", () => {
  for (const [classId, def] of Object.entries(CLASS_DEFS)) {
    const byId = new Map(def.inventoryItems.map((entry) => [entry.itemId, Number(entry.count || 0)]));
    assert((byId.get("scroll_identify") || 0) >= 4, `${classId} should start with at least 4 scroll_identify`);
    assert((byId.get("potion_health") || 0) >= 2, `${classId} should start with at least 2 potion_health`);
    assert((byId.get("potion_mana") || 0) >= 3, `${classId} should start with at least 3 potion_mana`);
    assert((byId.get("lockpick") || 0) >= 5, `${classId} should start with at least 5 lockpick`);
  }
});

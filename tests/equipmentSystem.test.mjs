import { assert } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { equipmentSystem } from '../src/rules/systems/equipmentSystem.js';
import { Equipment } from '../src/rules/components/Equipment.js';
import { ItemInfo } from '../src/rules/components/ItemInfo.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';

function makeEquip(world, { name, id, slot, bonuses, affixes = [] }) {
  const eid = world.create();
  world.add(eid, NamedIdentity, { name, identity: id });
  world.add(eid, ItemInfo, { type: 'equip', slot, weight: 1, value: 0, description: '', count: 1, bonuses: bonuses || {}, rarity: 1, rarityName: 'common', affixes });
  return eid;
}

Deno.test("equipment system derives stats from equipped items", () => {
  const world = new World({ seed: 7 });

  const actor = world.create();
  world.add(actor, Equipment, {});
  const eq = world.get(actor, Equipment);

  const sword = makeEquip(world, { name: 'Sword', id: 'sword_plain', slot: 'weapon', bonuses: { accuracy: 2, damagePower: 2 } });
  const armor = makeEquip(world, { name: 'Leather', id: 'leather_armor', slot: 'armor', bonuses: { evade: 1 }, affixes: ['life1'] });
  const helm = makeEquip(world, { name: 'Iron Helm', id: 'helm_iron', slot: 'head', bonuses: { evade: 1 } });
  const bow = makeEquip(world, { name: 'Short Bow', id: 'bow_short', slot: 'ranged', bonuses: { accuracy: 1, damagePower: 1 } });

  eq.weapon = sword;
  eq.armor = armor;
  eq.head = helm;
  eq.ranged = bow;

  equipmentSystem(world);

  assert(eq.accuracyDerived === 3, 'accuracy derived from sword + ranged item');
  assert(eq.damagePowerDerived === 3, 'damagePower derived from sword + ranged item');
  assert(eq.evadeDerived === 2, 'evade derived from armor + head');
  assert(eq.maxHpDerived >= 5, 'life1 passive applied');
});

Deno.test("equipment system derives physical penetration channels from equipped items", () => {
  const world = new World({ seed: 12 });
  const actor = world.create();
  world.add(actor, Equipment, {});
  const eq = world.get(actor, Equipment);

  const weapon = makeEquip(world, {
    name: 'Piercing Knife',
    id: 'piercing_knife',
    slot: 'weapon',
    bonuses: { accuracy: 1, physicalPenetration: 1, piercePenetration: 2 },
  });
  const gloves = makeEquip(world, {
    name: 'Brawler Gloves',
    id: 'brawler_gloves',
    slot: 'gloves',
    bonuses: { bluntPenetration: 2 },
  });

  eq.weapon = weapon;
  eq.gloves = gloves;

  equipmentSystem(world);

  assert(eq.accuracyDerived === 1, 'accuracy should still derive normally');
  assert(eq.physicalPenetrationDerived === 1, 'generic physical penetration should derive from gear');
  assert(eq.piercePenetrationDerived === 2, 'pierce penetration should derive from gear');
  assert(eq.bluntPenetrationDerived === 2, 'blunt penetration should derive from gear');
});

Deno.test("equipment system applies head-specific affix passives", () => {
  const world = new World({ seed: 8 });
  const actor = world.create();
  world.add(actor, Equipment, {});
  const eq = world.get(actor, Equipment);

  const helm = makeEquip(world, {
    name: 'Attuned Helm',
    id: 'helm_iron',
    slot: 'head',
    bonuses: { evade: 1 },
    affixes: ['helmGuard1', 'helmAttuned1'],
  });

  eq.head = helm;
  equipmentSystem(world);

  assert(eq.evadeDerived === 2, 'head bonus + helmGuard1 should add evade');
  assert(eq.manaRegenDerived >= 0.25, 'helmAttuned1 should add mana regen');
});

Deno.test("equipment system projects spellHit from arcane handwraps", () => {
  const world = new World({ seed: 10 });
  const actor = world.create();
  world.add(actor, Equipment, {});
  const eq = world.get(actor, Equipment);

  const wraps = makeEquip(world, {
    name: 'Arcane Handwraps',
    id: 'gloves_arcane',
    slot: 'gloves',
    bonuses: { defense: 1, maxMana: 12, manaRegen: 0.5, critChance: 0.03, spellHit: 2 },
  });

  eq.gloves = wraps;
  equipmentSystem(world);

  assert(eq.spellHitDerived === 2, 'arcane handwraps should add spell hit');
});

Deno.test("equipment system stacks spellHit across caster gear slots", () => {
  const world = new World({ seed: 11 });
  const actor = world.create();
  world.add(actor, Equipment, {});
  const eq = world.get(actor, Equipment);

  const wraps = makeEquip(world, {
    name: 'Arcane Handwraps',
    id: 'gloves_arcane',
    slot: 'gloves',
    bonuses: { spellHit: 2 },
  });
  const ring = makeEquip(world, {
    name: 'Ring of Arcana',
    id: 'ring_arcana',
    slot: 'ring1',
    bonuses: { manaRegen: 0.5, spellHit: 1 },
  });
  const amulet = makeEquip(world, {
    name: 'Amulet of Focus',
    id: 'amulet_focus',
    slot: 'neck',
    bonuses: { maxMana: 15, manaRegen: 0.4, spellHit: 1 },
  });

  eq.gloves = wraps;
  eq.ring1 = ring;
  eq.neck = amulet;
  equipmentSystem(world);

  assert(eq.spellHitDerived === 4, 'caster starter/jewelry pieces should stack spell hit');
});

Deno.test("equipment system stacks legacy and canonical bonus keys into canonical derived stats", () => {
  const world = new World({ seed: 9 });
  const actor = world.create();
  world.add(actor, Equipment, {});
  const eq = world.get(actor, Equipment);

  const legacySword = makeEquip(world, {
    name: 'Legacy Sword',
    id: 'legacy_sword',
    slot: 'weapon',
    bonuses: { attack: 2 },
  });
  const modernBow = makeEquip(world, {
    name: 'Modern Bow',
    id: 'modern_bow',
    slot: 'ranged',
    bonuses: { accuracy: 1, damagePower: 3 },
  });
  const legacyArmor = makeEquip(world, {
    name: 'Legacy Armor',
    id: 'legacy_armor',
    slot: 'armor',
    bonuses: { defense: 1 },
  });
  const modernHelm = makeEquip(world, {
    name: 'Modern Helm',
    id: 'modern_helm',
    slot: 'head',
    bonuses: { evade: 2, spellAvoid: 2 },
  });
  const focusCharm = makeEquip(world, {
    name: 'Focus Charm',
    id: 'focus_charm',
    slot: 'neck',
    bonuses: { spellHit: 3 },
  });
  const dexBoots = makeEquip(world, {
    name: "Dex Boots",
    id: "dex_boots",
    slot: "feet",
    bonuses: { dexterity: 2 },
  });
  const spellMantle = makeEquip(world, {
    name: "Spell Mantle",
    id: "spell_mantle",
    slot: "offhand",
    bonuses: { spellPower: 4 },
  });

  eq.weapon = legacySword;
  eq.ranged = modernBow;
  eq.armor = legacyArmor;
  eq.head = modernHelm;
  eq.neck = focusCharm;
  eq.feet = dexBoots;
  eq.offhand = spellMantle;

  equipmentSystem(world);

  assert(eq.accuracyDerived === 3, 'legacy attack should still contribute to accuracy');
  assert(eq.damagePowerDerived === 5, 'legacy attack should still contribute to damage power');
  assert(eq.evadeDerived === 3, 'legacy defense should still contribute to evade');
  assert(eq.spellHitDerived === 3, 'canonical spellHit should map into equipment derived stats');
  assert(eq.spellAvoidDerived === 2, 'canonical spellAvoid should map into equipment derived stats');
  assert(eq.dexterityDerived === 2, "canonical dexterity should map into equipment derived stats");
  assert(eq.spellPowerDerived === 4, "canonical spellPower should map into equipment derived stats");
});

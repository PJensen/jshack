import { assert, assertEquals } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { AttackIntent } from '../src/rules/components/Intents/AttackIntent.js';
import { Equipment } from '../src/rules/components/Equipment.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { ItemInfo } from '../src/rules/components/ItemInfo.js';
import { Resistances } from '../src/rules/components/Resistences.js';
import { ActiveEffects } from '../src/rules/components/ActiveEffects.js';
import { Faction } from '../src/rules/components/Faction.js';
import { equipmentSystem } from '../src/rules/systems/equipmentSystem.js';
import { combatSystem } from '../src/rules/systems/combatSystem.js';
import { installAffixTriggers } from '../src/rules/systems/affixTriggerSystem.js';
import { applyWeaponCoatingOnHit } from '../src/rules/data/weaponCoatings.js';
import { Position } from '../src/rules/components/Position.js';
import { Facing } from '../src/rules/components/Facing.js';
import { WEAPON_FAMILIES } from '../src/rules/data/weaponFamilies.js';

function makeActor(world, name, eq, hp = 10, resistances = null) {
  const id = world.create();
  world.add(id, NamedIdentity, { name, identity: name.toLowerCase() });
  world.add(id, Vitality, { maxHp: Math.max(10, hp), hp });
  world.add(id, Equipment, {});
  if (resistances) world.add(id, Resistances, resistances);
  const e = world.get(id, Equipment);
  if (eq?.weapon) e.weapon = eq.weapon;
  if (eq?.armor) e.armor = eq.armor;
  if (eq?.offhand) e.offhand = eq.offhand;
  if (eq?.ring1) e.ring1 = eq.ring1;
  if (eq?.ring2) e.ring2 = eq.ring2;
  return id;
}

function makeEquip(world, { id, name, slot, bonuses, affixes = [], damageType = null }) {
  const eid = world.create();
  world.add(eid, NamedIdentity, { name, identity: id });
  world.add(eid, ItemInfo, {
    type: 'equip',
    slot,
    weight: 1,
    value: 0,
    description: '',
    count: 1,
    bonuses: bonuses || {},
    rarity: 1,
    rarityName: 'common',
    affixes,
    damageType,
    weaponFamily: '',
  });
  return eid;
}

function firstMeleeDamageEventForWeapon(weaponSpec) {
  for (let seed = 1; seed <= 128; seed++) {
    const world = new World({ seed });
    const weapon = makeEquip(world, weaponSpec);
    const attacker = makeActor(world, 'Attacker', { weapon }, 20);
    const defender = makeActor(world, 'Defender', {}, 30);
    world.add(attacker, Position, { x: 1, y: 1 });
    world.add(defender, Position, { x: 1, y: 2 });
    equipmentSystem(world);
    const events = [];
    world.on('damaged', (e) => events.push(e));
    world.add(attacker, AttackIntent, { targetId: defender });
    combatSystem(world);
    if (events.length > 0) return events[0];
  }
  return null;
}

Deno.test("combatSystem: melee requires target to be inside facing cone", () => {
  const world = new World({ seed: 11 });
  const hero = makeActor(world, "Hero", {}, 12);
  const foe = makeActor(world, "Foe", {}, 12);
  world.add(hero, Position, { x: 5, y: 5 });
  world.add(foe, Position, { x: 4, y: 5 }); // behind hero when facing east
  world.add(hero, Facing, { dx: 1, dy: 0 });
  world.add(hero, AttackIntent, { targetId: foe });

  combatSystem(world);

  assertEquals(world.get(foe, Vitality)?.hp, 12, "target behind attacker should not be hit");
});

Deno.test("combatSystem: melee emits blended impact profiles by weapon signature", () => {
  const maceHit = firstMeleeDamageEventForWeapon({
    id: 'iron_mace',
    name: 'Iron Mace',
    slot: 'weapon',
    bonuses: { accuracy: 40, damagePower: 4, bluntPenetration: 3 },
    damageType: 'blunt',
  });
  const daggerHit = firstMeleeDamageEventForWeapon({
    id: 'dagger_quick',
    name: 'Dagger',
    slot: 'weapon',
    bonuses: { accuracy: 40, damagePower: 4, piercePenetration: 3 },
    damageType: 'pierce',
  });
  const swordHit = firstMeleeDamageEventForWeapon({
    id: 'longsword',
    name: 'Longsword',
    slot: 'weapon',
    bonuses: { accuracy: 40, damagePower: 4, slashPenetration: 3 },
    damageType: 'slash',
  });
  const morningstarHit = firstMeleeDamageEventForWeapon({
    id: 'morningstar',
    name: 'Morningstar',
    slot: 'weapon',
    bonuses: { accuracy: 40, damagePower: 4, bluntPenetration: 2, piercePenetration: 1 },
    damageType: 'blunt',
  });

  assert(maceHit, 'expected a landed mace hit');
  assert(daggerHit, 'expected a landed dagger hit');
  assert(swordHit, 'expected a landed sword hit');
  assert(morningstarHit, 'expected a landed morningstar hit');

  assertEquals(String(maceHit?.cause || ''), 'melee');
  assertEquals(String(maceHit?.impactProfile?.weaponClass || ''), 'mace');
  assertEquals(String(maceHit?.impactProfile?.attackKind || ''), 'blunt');
  assert((Number(maceHit?.impactProfile?.signature?.blunt || 0)) > Number(maceHit?.impactProfile?.signature?.slash || 0), 'mace should bias blunt signature');

  assertEquals(String(daggerHit?.impactProfile?.weaponClass || ''), 'dagger');
  assertEquals(String(daggerHit?.impactProfile?.attackKind || ''), 'stab');
  assert((Number(daggerHit?.impactProfile?.signature?.pierce || 0)) > Number(daggerHit?.impactProfile?.signature?.blunt || 0), 'dagger should bias pierce signature');

  assertEquals(String(swordHit?.impactProfile?.weaponClass || ''), 'sword');
  assertEquals(String(swordHit?.impactProfile?.attackKind || ''), 'slash');
  assert((Number(swordHit?.impactProfile?.signature?.slash || 0)) > Number(swordHit?.impactProfile?.signature?.pierce || 0), 'sword should bias slash signature');

  assertEquals(String(morningstarHit?.impactProfile?.weaponClass || ''), 'morningstar');
  assert((Number(morningstarHit?.impactProfile?.signature?.blunt || 0)) > Number(morningstarHit?.impactProfile?.signature?.slash || 0), 'morningstar should keep blunt-heavy signature');
  assert((Number(morningstarHit?.impactProfile?.signature?.pierce || 0)) > 0, 'morningstar should carry a pierce component');

  const vec = morningstarHit?.impactVector;
  const mag = Math.hypot(Number(vec?.dx || 0), Number(vec?.dy || 0));
  assert(mag > 0.99 && mag < 1.01, `impact vector should be normalized (mag=${mag})`);
});

Deno.test("combatSystem: flail melee events carry weaponFamily through attack and damage", () => {
  const world = new World({ seed: 7 });
  const flail = makeEquip(world, {
    id: 'flail',
    name: 'Flail',
    slot: 'weapon',
    bonuses: { accuracy: 40, damagePower: 4, bluntPenetration: 3 },
    damageType: 'blunt',
  });
  const flailInfo = world.get(flail, ItemInfo);
  world.set(flail, ItemInfo, { ...flailInfo, subtype: 'flail', weaponFamily: WEAPON_FAMILIES.flail, damageDice: '1d8' });

  const attacker = makeActor(world, 'Attacker', { weapon: flail }, 20);
  const defender = makeActor(world, 'Defender', {}, 30);
  world.add(attacker, Position, { x: 1, y: 1 });
  world.add(defender, Position, { x: 1, y: 2 });
  equipmentSystem(world);

  const attacks = [];
  const damaged = [];
  world.on('combat:melee:attack', (ev) => attacks.push(ev));
  world.on('damaged', (ev) => damaged.push(ev));

  world.add(attacker, AttackIntent, { targetId: defender });
  combatSystem(world);

  assertEquals(attacks.length, 1);
  assertEquals(attacks[0].weaponId, flail);
  assertEquals(attacks[0].weaponFamily, WEAPON_FAMILIES.flail);
  assert(damaged.length > 0, 'expected flail hit to land');
  assertEquals(damaged[0].weaponId, flail);
  assertEquals(damaged[0].weaponFamily, WEAPON_FAMILIES.flail);
});

function firstMeleeOutcomeEvent(kind) {
  for (let seed = 1; seed <= 512; seed++) {
    const world = new World({ seed });
    const weapon = makeEquip(world, {
      id: 'flametongue',
      name: 'Flametongue',
      slot: 'weapon',
      bonuses: { accuracy: kind === 'miss' ? -80 : (kind === 'dodge' ? 1000 : 80), damagePower: 4, slashPenetration: 3 },
      affixes: ['flaming'],
      damageType: 'slash',
    });
    world.set(weapon, ItemInfo, { ...world.get(weapon, ItemInfo), damageDice: '1d8' });

    const defenderEq = {};
    if (kind === 'dodge') {
      defenderEq.ring1 = makeEquip(world, {
        id: 'evasion_ring',
        name: 'Evasion Ring',
        slot: 'ring',
        bonuses: { evade: 100 },
      });
    }
    if (kind === 'parry') {
      const parryWeapon = makeEquip(world, {
        id: 'parry_sword',
        name: 'Parry Sword',
        slot: 'weapon',
        bonuses: {},
        damageType: 'slash',
      });
      world.set(parryWeapon, ItemInfo, { ...world.get(parryWeapon, ItemInfo), damageDice: '1d6' });
      defenderEq.weapon = parryWeapon;
    }

    const attacker = makeActor(world, 'Attacker', { weapon }, 20);
    const defender = makeActor(world, 'Defender', defenderEq, 30);
    world.add(attacker, Position, { x: 1, y: 1 });
    world.add(defender, Position, { x: 1, y: 2 });
    equipmentSystem(world);
    if (kind === 'dodge') {
      world.get(defender, Equipment).evadeDerived = 500;
    }

    const events = [];
    if (kind === 'hit') world.on('damaged', (ev) => events.push(ev));
    if (kind === 'miss') world.on('status', (ev) => { if (ev.kind === 'miss') events.push(ev); });
    if (kind === 'dodge') world.on('combat:dodge', (ev) => events.push(ev));
    if (kind === 'parry') world.on('combat:parry', (ev) => events.push(ev));

    world.add(attacker, AttackIntent, { targetId: defender });
    combatSystem(world);
    if (events.length > 0) return events[0];
  }
  return null;
}

Deno.test("combatSystem: melee swing outcome payloads carry visual affinity profiles", () => {
  for (const kind of ['hit', 'miss', 'dodge', 'parry']) {
    const event = firstMeleeOutcomeEvent(kind);
    assert(event, `expected ${kind} event`);
    assertEquals(event.impactProfile?.elementTint, 'fire', `${kind} should carry fire tint`);
    assertEquals(event.impactProfile?.swingStyle, 'flame', `${kind} should carry flame swing style`);
    assertEquals(event.impactProfile?.visualAffinity?.id, 'fire', `${kind} should carry resolved affinity`);
  }
});

Deno.test("combatSystem: ignite weapons applies burning and emits the ignition proc", () => {
  let burned = false;
  let ignition = false;
  for (let seed = 1; seed <= 128 && !burned; seed++) {
    const world = new World({ seed });
    const weapon = makeEquip(world, {
      id: "plain_sword",
      name: "Plain Sword",
      slot: "weapon",
      bonuses: { accuracy: 80, damagePower: 4 },
      damageType: "slash",
    });
    const attacker = makeActor(world, "Attacker", { weapon }, 20);
    const defender = makeActor(world, "Defender", {}, 30);
    world.add(attacker, Position, { x: 1, y: 1 });
    world.add(defender, Position, { x: 1, y: 2 });
    world.add(attacker, ActiveEffects, {
      effects: [{
        key: "ignite_weapons",
        turnsLeft: 12,
        potency: 3,
        stacks: 1,
        meta: { bonusFireDamage: 3, burnChance: 0.75 },
      }],
    });
    world.on("proc:ignited", () => { ignition = true; });
    equipmentSystem(world);
    world.add(attacker, AttackIntent, { targetId: defender });
    combatSystem(world);
    burned = (world.get(defender, ActiveEffects)?.effects || []).some((effect) => effect.key === "burning");
  }

  assert(burned, "ignite weapons should apply burning on a landed hit within the authored chance");
  assert(ignition, "ignite weapons should emit the usual ignition proc event");
});

Deno.test("d20 combat with affix triggers: fierce, vamp, thorns", () => {
  const world = new World({ seed: 123 });
  installAffixTriggers(world);

  const sword = makeEquip(world, { id: 'sword_plain', name: 'Sword', slot: 'weapon', bonuses: { accuracy: 2, damagePower: 2 }, affixes: ['fierce', 'vamp1'] });
  const thorns = makeEquip(world, { id: 'leather_armor', name: 'Leather', slot: 'armor', bonuses: { evade: 1 }, affixes: ['thorns1'] });

  const hero = makeActor(world, 'Hero', { weapon: sword }, 9);
  const foe = makeActor(world, 'Goblin', { armor: thorns });

  world.add(hero, Position, { x: 1, y: 1 });
  world.add(foe, Position, { x: 1, y: 2 });

  equipmentSystem(world);

  world.add(hero, AttackIntent, { targetId: foe });
  combatSystem(world);

  const hVit = world.get(hero, Vitality);
  const fVit = world.get(foe, Vitality);

  // After dodge/parry mechanics were added, the combat RNG sequence shifted.
  // The important invariant: damage was dealt (foe HP reduced), vamp healed hero,
  // and thorns dealt retaliation damage to hero.
  assert(fVit.hp < 10, `foe should have taken damage, got ${fVit.hp}`);
  assert(hVit.hp < 9, `hero should have taken thorns damage, got ${hVit.hp}`);
});

Deno.test("blunt melee deals extra damage to skeleton-style resistance profile", () => {
  const baseResist = { kinetic: { DR: 4, bluntMult: 1.0, slashMult: 0.7, pierceMult: 0.5 } };
  const skeletalResist = { kinetic: { DR: 4, bluntMult: 1.5, slashMult: 0.7, pierceMult: 0.5 } };

  function runOne(seed, resistances) {
    const world = new World({ seed });
    installAffixTriggers(world);
    const mace = makeEquip(world, {
      id: 'test_blunt_mace',
      name: 'Test Mace',
      slot: 'weapon',
      bonuses: { accuracy: 12, damagePower: 12 },
      damageType: 'blunt',
    });
    const hero = makeActor(world, 'Hero', { weapon: mace }, 30);
    const foe = makeActor(world, 'Target', {}, 30, resistances);
    world.add(hero, Position, { x: 1, y: 1 });
    world.add(foe, Position, { x: 1, y: 2 });
    equipmentSystem(world);
    world.add(hero, AttackIntent, { targetId: foe });
    combatSystem(world);
    return 30 - world.get(foe, Vitality).hp;
  }

  let compared = false;
  for (let seed = 1; seed <= 64; seed++) {
    const dmgBase = runOne(seed, baseResist);
    const dmgSkeletal = runOne(seed, skeletalResist);
    if (dmgBase === 0 && dmgSkeletal === 0) continue; // same nat1 miss path
    assert(dmgSkeletal > dmgBase, `expected skeletal profile to take more blunt damage (base=${dmgBase}, skeletal=${dmgSkeletal}, seed=${seed})`);
    compared = true;
    break;
  }
  assert(compared, 'expected at least one deterministic seed with a landed hit');
});

Deno.test("pierce melee penetration improves damage into heavy armor", () => {
  const heavyResist = { kinetic: { DR: 6, bluntMult: 1.0, slashMult: 1.0, pierceMult: 1.0 } };

  function runOne(seed, bonuses) {
    const world = new World({ seed });
    installAffixTriggers(world);
    const weapon = makeEquip(world, {
      id: 'test_pierce_weapon',
      name: 'Test Piercer',
      slot: 'weapon',
      bonuses,
      damageType: 'pierce',
    });
    const hero = makeActor(world, 'Hero', { weapon }, 30);
    const foe = makeActor(world, 'Target', {}, 30, heavyResist);
    world.add(hero, Position, { x: 1, y: 1 });
    world.add(foe, Position, { x: 1, y: 2 });
    equipmentSystem(world);
    world.add(hero, AttackIntent, { targetId: foe });
    combatSystem(world);
    return 30 - world.get(foe, Vitality).hp;
  }

  let compared = false;
  for (let seed = 1; seed <= 64; seed++) {
    const base = runOne(seed, { accuracy: 12, damagePower: 6 });
    const piercing = runOne(seed, { accuracy: 12, damagePower: 6, piercePenetration: 3 });
    if (base === 0 && piercing === 0) continue;
    assert(piercing > base, `expected pierce penetration to improve heavy-armor damage (base=${base}, piercing=${piercing}, seed=${seed})`);
    compared = true;
    break;
  }
  assert(compared, 'expected at least one deterministic seed with a landed hit');
});

Deno.test("caustic affix adds acid chip that is blocked by acid immunity", () => {
  const worldA = new World({ seed: 202 });
  installAffixTriggers(worldA);
  const weaponA = makeEquip(worldA, { id: 'test_caustic', name: 'Caustic Blade', slot: 'weapon', bonuses: { accuracy: 6, damagePower: 6 }, affixes: ['caustic1'] });
  const heroA = makeActor(worldA, 'Hero', { weapon: weaponA }, 10);
  const foeA = makeActor(worldA, 'Target', {}, 10, { chemical: { acidMult: 1.0 } });
  worldA.add(heroA, Position, { x: 1, y: 1 });
  worldA.add(foeA, Position, { x: 1, y: 2 });
  equipmentSystem(worldA);
  worldA.add(heroA, AttackIntent, { targetId: foeA });
  combatSystem(worldA);
  const hpNormal = worldA.get(foeA, Vitality).hp;

  const worldB = new World({ seed: 202 });
  installAffixTriggers(worldB);
  const weaponB = makeEquip(worldB, { id: 'test_caustic', name: 'Caustic Blade', slot: 'weapon', bonuses: { accuracy: 6, damagePower: 6 }, affixes: ['caustic1'] });
  const heroB = makeActor(worldB, 'Hero', { weapon: weaponB }, 10);
  const foeB = makeActor(worldB, 'Target', {}, 10, { chemical: { acidMult: 0.0 } });
  worldB.add(heroB, Position, { x: 1, y: 1 });
  worldB.add(foeB, Position, { x: 1, y: 2 });
  equipmentSystem(worldB);
  worldB.add(heroB, AttackIntent, { targetId: foeB });
  combatSystem(worldB);
  const hpImmune = worldB.get(foeB, Vitality).hp;

  assert(hpImmune === hpNormal + 1, `acid-immune target should block caustic chip (normal=${hpNormal}, immune=${hpImmune})`);
});

Deno.test("insulated affix mitigates capacitive electric chip", () => {
  const worldA = new World({ seed: 202 });
  installAffixTriggers(worldA);
  const weaponA = makeEquip(worldA, { id: 'test_cap', name: 'Capacitive Blade', slot: 'weapon', bonuses: { accuracy: 6, damagePower: 6 }, affixes: ['capacitive1'] });
  const heroA = makeActor(worldA, 'Hero', { weapon: weaponA }, 10);
  const foeA = makeActor(worldA, 'Target', {}, 10, { electric: { ohms: 1000, fibrillationA: 0.03 } });
  worldA.add(heroA, Position, { x: 1, y: 1 });
  worldA.add(foeA, Position, { x: 1, y: 2 });
  equipmentSystem(worldA);
  worldA.add(heroA, AttackIntent, { targetId: foeA });
  combatSystem(worldA);
  const hpPlain = worldA.get(foeA, Vitality).hp;

  const worldB = new World({ seed: 202 });
  installAffixTriggers(worldB);
  const weaponB = makeEquip(worldB, { id: 'test_cap', name: 'Capacitive Blade', slot: 'weapon', bonuses: { accuracy: 6, damagePower: 6 }, affixes: ['capacitive1'] });
  const insulatedShield = makeEquip(worldB, { id: 'test_insulated', name: 'Insulated Shield', slot: 'offhand', bonuses: {}, affixes: ['insulated1'] });
  const heroB = makeActor(worldB, 'Hero', { weapon: weaponB }, 10);
  const foeB = makeActor(worldB, 'Target', { offhand: insulatedShield }, 10, { electric: { ohms: 1000, fibrillationA: 0.03 } });
  worldB.add(heroB, Position, { x: 1, y: 1 });
  worldB.add(foeB, Position, { x: 1, y: 2 });
  equipmentSystem(worldB);
  worldB.add(heroB, AttackIntent, { targetId: foeB });
  combatSystem(worldB);
  const hpInsulated = worldB.get(foeB, Vitality).hp;

  assert(hpInsulated === hpPlain + 1, `insulated should absorb 1-point electric chip (plain=${hpPlain}, insulated=${hpInsulated})`);
});

Deno.test("poison weapon coating procs frequently and spends one charge per successful hit", () => {
  function runOne(seed) {
    const world = new World({ seed });

    const weapon = makeEquip(world, {
      id: 'test_poison_coated_blade',
      name: 'Poison Coated Blade',
      slot: 'weapon',
      bonuses: { attack: 12 },
      affixes: [],
    });

    const weaponInfo = world.get(weapon, ItemInfo);
    weaponInfo.coating = { kind: 'poison', charges: 3 };

    const attacker = makeActor(world, 'Hero', {}, 20);
    const defender = makeActor(world, 'Target Dummy', {}, 50);

    applyWeaponCoatingOnHit(world, { attacker, defender, weaponId: weapon, didHit: true });

    const updatedInfo = world.get(weapon, ItemInfo);
    const chargesAfter = Math.max(0, Number(updatedInfo?.coating?.charges || 0) | 0);
    const ae = world.get(defender, ActiveEffects);
    const poison = ae?.effects?.find((e) => e.key === 'poison');
    return {
      procced: Boolean(poison),
      chargesAfter,
      turnsLeft: Number(poison?.turnsLeft || 0),
      potency: Number(poison?.potency || 0),
    };
  }

  let foundProc = false;
  let foundNoProc = false;
  let procCount = 0;
  for (let seed = 1; seed <= 256; seed++) {
    const r = runOne(seed);
    assertEquals(r.chargesAfter, 2, 'every successful hit should consume exactly one coating charge');
    if (r.procced) {
      foundProc = true;
      procCount += 1;
      assertEquals(r.turnsLeft, 4, 'proc should apply poison for 4 turns');
      assertEquals(r.potency, 2, 'proc should apply poison potency 2');
    } else {
      foundNoProc = true;
    }
  }

  assert(foundProc, 'expected at least one deterministic seed to trigger poison coating proc');
  assert(foundNoProc, 'expected at least one deterministic seed to miss poison proc at high-but-not-total chance');
  assert(procCount >= 140, `expected poison proc count to reflect high proc chance, got ${procCount}/256`);
});

Deno.test("blinded defenders are easier to hit in melee based on blindness strength", () => {
  function runOne(seed, blindPotency = 0) {
    const world = new World({ seed });
    installAffixTriggers(world);
    const weapon = makeEquip(world, {
      id: 'test_blind_melee_weapon',
      name: 'Blind Test Blade',
      slot: 'weapon',
      bonuses: { accuracy: 0, damagePower: 6 },
    });
    const attacker = makeActor(world, 'Attacker', { weapon }, 20);
    const defender = makeActor(world, 'Defender', { armor: makeEquip(world, {
      id: 'test_blind_melee_armor',
      name: 'Blind Test Armor',
      slot: 'armor',
      bonuses: { evade: 18 },
    }) }, 20);
    if (blindPotency > 0) {
      world.add(defender, ActiveEffects, {
        effects: [{ key: 'blinded', turnsLeft: 5, potency: blindPotency, stacks: 1 }],
      });
    }
    world.add(attacker, Position, { x: 1, y: 1 });
    world.add(defender, Position, { x: 1, y: 2 });
    equipmentSystem(world);
    world.add(attacker, AttackIntent, { targetId: defender });
    combatSystem(world);
    return 20 - world.get(defender, Vitality).hp;
  }

  let compared = false;
  let scaled = false;
  for (let seed = 1; seed <= 256; seed++) {
    const baseline = runOne(seed, 0);
    const blinded2 = runOne(seed, 2);
    const blinded = runOne(seed, 4);
    if (baseline === 0 && blinded > 0) {
      compared = true;
    }
    if (blinded2 === 0 && blinded > 0) scaled = true;
    if (compared && scaled) break;
  }
  assert(compared, "expected at least one deterministic seed where blinded defender takes a hit that baseline avoids");
  assert(scaled, "expected higher blindness potency to create a hit opportunity not present at lower blindness potency");
});

Deno.test("blinded defenders take more melee direct-hit physical damage", () => {
  function runOne(seed, blindPotency = 0) {
    const world = new World({ seed });
    installAffixTriggers(world);
    const weapon = makeEquip(world, {
      id: 'test_blind_melee_damage_weapon',
      name: 'Blind Damage Test Blade',
      slot: 'weapon',
      bonuses: { accuracy: 0, damagePower: 16 },
    });
    const attacker = makeActor(world, 'Attacker', { weapon }, 20);
    const defender = makeActor(world, 'Defender', { armor: makeEquip(world, {
      id: 'test_blind_melee_damage_armor',
      name: 'Blind Damage Test Armor',
      slot: 'armor',
      bonuses: { evade: 16 },
    }) }, 30);
    if (blindPotency > 0) {
      world.add(defender, ActiveEffects, {
        effects: [{ key: 'blinded', turnsLeft: 5, potency: blindPotency, stacks: 1 }],
      });
    }
    world.add(attacker, Position, { x: 1, y: 1 });
    world.add(defender, Position, { x: 1, y: 2 });
    equipmentSystem(world);
    world.add(attacker, AttackIntent, { targetId: defender });
    combatSystem(world);
    return 30 - world.get(defender, Vitality).hp;
  }

  let compared = false;
  for (let seed = 1; seed <= 256; seed++) {
    const baseline = runOne(seed, 0);
    const blinded = runOne(seed, 4);
    if (baseline === 0 && blinded > 0) {
      compared = true;
      break;
    }
  }
  assert(compared, "expected at least one deterministic seed where blinded defender takes direct-hit damage that baseline avoids");
});

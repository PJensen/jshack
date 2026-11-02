import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { Status } from "../src/rules/components/Status.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Traits } from "../src/rules/components/Traits.js";
import "../src/content/monsters/animals.js";
import { resolveCombatSnapshot } from "../src/rules/utils/resolveCombatSnapshot.js";

/**
 * @param {World} world
 * @param {{accuracyDerived?:number, damagePowerDerived?:number, physicalPenetrationDerived?:number, bluntPenetrationDerived?:number, slashPenetrationDerived?:number, piercePenetrationDerived?:number, evadeDerived?:number, statuses?:Array<any>}} [opts]
 */
function makeActor(world, opts = {}) {
  const id = world.create();
  world.add(id, Equipment, {
    accuracyDerived: Number(opts.accuracyDerived || 0),
    damagePowerDerived: Number(opts.damagePowerDerived || 0),
    physicalPenetrationDerived: Number(opts.physicalPenetrationDerived || 0),
    bluntPenetrationDerived: Number(opts.bluntPenetrationDerived || 0),
    slashPenetrationDerived: Number(opts.slashPenetrationDerived || 0),
    piercePenetrationDerived: Number(opts.piercePenetrationDerived || 0),
    evadeDerived: Number(opts.evadeDerived || 0),
  });
  if (Array.isArray(opts.statuses)) {
    world.add(id, Status, { statuses: opts.statuses });
  }
  return id;
}

Deno.test("resolveCombatSnapshot(melee): preserves status parity with stoneskin", () => {
  const world = new World({ seed: 7 });

  const attacker = makeActor(world, {
    accuracyDerived: 4,
    damagePowerDerived: 4,
    statuses: [
      { type: "disease", duration: 5, potency: 1, stacks: 2 },
      { type: "hungry", duration: 5, potency: 3, stacks: 1 },
      { type: "weakened", duration: 5, potency: 2, stacks: 1 },
      { type: "cursed", duration: 5, potency: 1, stacks: 1 },
      { type: "blessed", duration: 5, potency: 2, stacks: 1 },
    ],
  });
  const defender = makeActor(world, {
    evadeDerived: 1,
    statuses: [
      { type: "disease", duration: 5, potency: 1, stacks: 1 },
      { type: "famished", duration: 5, potency: 2, stacks: 1 },
      { type: "weakened", duration: 5, potency: 1, stacks: 1 },
      { type: "cursed", duration: 5, potency: 1, stacks: 1 },
      { type: "blessed", duration: 5, potency: 3, stacks: 1 },
      { type: "stoneskin", duration: 5, potency: 2, stacks: 1 },
    ],
  });

  const atk = resolveCombatSnapshot(world, attacker, { mode: "melee" });
  const def = resolveCombatSnapshot(world, defender, { mode: "melee" });

  assertEquals(atk.attackBonus, 0, "melee attack bonus should clamp to zero");
  assertEquals(atk.damageFlatBonus, 2, "flat damage should still derive from equipment attack");
  assert(atk.modifiers.some((m) => m.source === "rule:attackFloor"), "attack floor breadcrumb expected");

  assertEquals(def.armorClass, 11, "melee armor class should include stoneskin and status penalties");
  assert(def.modifiers.some((m) => m.source === "status:stoneskin" && m.value === 2), "stoneskin modifier expected");
});

Deno.test("resolveCombatSnapshot: feline trait grants bonuses against rodents only", () => {
  const world = new World({ seed: 17 });
  const feline = makeActor(world, { accuracyDerived: 1, damagePowerDerived: 2 });
  world.add(feline, Traits, { feline: true });
  const rat = world.create();
  world.add(rat, NamedIdentity, { name: "Rat", identity: "rat" });
  const humanoid = world.create();
  world.add(humanoid, NamedIdentity, { name: "Goblin", identity: "goblin" });

  const againstRat = resolveCombatSnapshot(world, feline, { mode: "melee", targetId: rat });
  const againstHumanoid = resolveCombatSnapshot(world, feline, { mode: "melee", targetId: humanoid });

  assertEquals(againstRat.attackBonus, againstHumanoid.attackBonus + 2);
  assertEquals(againstRat.targetDamageMult, 1.25);
  assertEquals(againstHumanoid.targetDamageMult, 1);
  assert(againstRat.modifiers.some((m) => m.source === "trait:feline"));
});

Deno.test("resolveCombatSnapshot(ranged): ignores non-stoneskin status modifiers", () => {
  const world = new World({ seed: 9 });

  const attacker = makeActor(world, {
    accuracyDerived: 4,
    damagePowerDerived: 4,
    statuses: [
      { type: "disease", duration: 5, potency: 4, stacks: 1 },
      { type: "starving", duration: 5, potency: 4, stacks: 1 },
      { type: "weakened", duration: 5, potency: 4, stacks: 1 },
      { type: "cursed", duration: 5, potency: 4, stacks: 1 },
      { type: "blessed", duration: 5, potency: 4, stacks: 1 },
    ],
  });
  const defender = makeActor(world, {
    evadeDerived: 2,
    statuses: [
      { type: "disease", duration: 5, potency: 4, stacks: 1 },
      { type: "wasting", duration: 5, potency: 4, stacks: 1 },
      { type: "weakened", duration: 5, potency: 4, stacks: 1 },
      { type: "cursed", duration: 5, potency: 4, stacks: 1 },
      { type: "blessed", duration: 5, potency: 4, stacks: 1 },
      { type: "stoneskin", duration: 5, potency: 3, stacks: 1 },
    ],
  });

  const atk = resolveCombatSnapshot(world, attacker, { mode: "ranged" });
  const def = resolveCombatSnapshot(world, defender, { mode: "ranged" });

  assertEquals(atk.attackBonus, 5, "ranged to-hit should stay 1 + accuracyDerived");
  assertEquals(def.armorClass, 15, "ranged AC should include defense + stoneskin only");
  assert(!atk.modifiers.some((m) => m.source.startsWith("status:") && m.stat === "attack"), "ranged attack should ignore status penalties/bonuses");
  assert(def.modifiers.some((m) => m.source === "status:stoneskin"), "ranged defense still consumes stoneskin");
});

Deno.test("resolveCombatSnapshot: modifier ordering is deterministic", () => {
  const world = new World({ seed: 11 });
  const actor = makeActor(world, {
    accuracyDerived: 2,
    damagePowerDerived: 2,
    evadeDerived: 1,
    statuses: [
      { type: "blessed", duration: 5, potency: 1, stacks: 1 },
      { type: "stoneskin", duration: 5, potency: 2, stacks: 1 },
    ],
  });

  const snapA = resolveCombatSnapshot(world, actor, { mode: "melee" });
  const snapB = resolveCombatSnapshot(world, actor, { mode: "melee" });

  assertEquals(snapA.modifiers, snapB.modifiers);
  assertEquals(
    snapA.modifiers.map((m) => `${m.stat}:${m.source}:${m.value}`),
    [
      "attack:base:1",
      "attack:resolved:accuracy:2",
      "attack:status:blessed:1",
      "defense:base:10",
      "defense:resolved:evade:1",
      "defense:status:blessed:1",
      "defense:status:stoneskin:2",
    ],
  );
});

Deno.test("resolveCombatSnapshot exposes physical penetration channels", () => {
  const world = new World({ seed: 13 });
  const actor = makeActor(world, {
    accuracyDerived: 2,
    damagePowerDerived: 3,
    physicalPenetrationDerived: 1,
    bluntPenetrationDerived: 2,
    slashPenetrationDerived: 3,
    piercePenetrationDerived: 4,
  });

  const snap = resolveCombatSnapshot(world, actor, { mode: "melee" });
  assertEquals(snap.physicalPenetration, 1);
  assertEquals(snap.bluntPenetration, 2);
  assertEquals(snap.slashPenetration, 3);
  assertEquals(snap.piercePenetration, 4);
});

Deno.test("resolveCombatSnapshot applies dexterity-derived gear bonus through canonical stats", () => {
  const world = new World({ seed: 21 });
  const actor = world.create();
  world.add(actor, BaseStats, {
    strength: 10,
    intelligence: 10,
    dexterity: 10,
    vitality: 10,
  });
  world.add(actor, Equipment, {
    dexterityDerived: 4,
  });

  const snap = resolveCombatSnapshot(world, actor, { mode: "melee" });
  assertEquals(snap.attackBonus, 3, "base 1 + dex-derived accuracy 2");
  assertEquals(snap.armorClass, 12, "base 10 + dex-derived evade 2");
  assertEquals(snap.critChance, 0.02, "dex-derived breakpoint should add physical crit chance");
});

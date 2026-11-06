import { assert, assertEquals } from "jsr:@std/assert";
import { children, World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { DerivedExpression } from "../src/rules/components/DerivedExpression.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Faction } from "../src/rules/components/Faction.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Lifespan } from "../src/rules/components/Lifespan.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Owner } from "../src/rules/components/Owner.js";
import { Position } from "../src/rules/components/Position.js";
import { ProcNode } from "../src/rules/components/ProcNode.js";
import { ProcPackageNode } from "../src/rules/components/ProcPackageNode.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { dealDamage } from "../src/rules/utils/dealDamage.js";
import { resolveCombatSnapshot } from "../src/rules/utils/resolveCombatSnapshot.js";
import {
  attachProcPackage,
  detachProcPackages,
  getProcPackage,
  hasProcPackageScript,
  listProcPackageIds,
  PROC_PACKAGE_KEYS,
} from "../src/rules/data/procPackages.js";
import { getScriptHandlers, runScript, ScriptVerb } from "../src/rules/scripting.js";

function makeProcContext(overrides = {}) {
  const directDamage = [];
  const statusesToApply = [];
  const resourcesToRestore = [];
  const vitalityToRestore = [];
  const spawnedEntities = [];
  const messages = [];
  let bonusCritChance = 0;

  return {
    source: overrides.source ?? 1,
    target: overrides.target ?? 2,
    kind: overrides.kind ?? "onHit",
    damage: overrides.damage ?? { amount: 8, type: "physical", crit: false, blocked: false },
    tags: overrides.tags ?? new Set(),
    proc: {
      addBonusDamage(min, max = min, type = "physical") {
        this._bonusDamage = { min, max, type };
      },
      addCritChance(amount) {
        bonusCritChance += Number(amount || 0);
      },
      dealDamage(target, amount, type = "physical", options = {}) {
        directDamage.push({ target, amount, type, ...options });
      },
      applyStatus(target, key, turnsLeft, potency = 1) {
        statusesToApply.push({ target, key, turnsLeft, potency });
      },
      restoreResource(target, resource, amount) {
        resourcesToRestore.push({ target, resource, amount });
      },
      heal(target, amount) {
        vitalityToRestore.push({ target, amount });
      },
      spawnEntity(kind, count = 1, anchor = "target") {
        spawnedEntities.push({ kind, count, anchor });
      },
      message(text) {
        messages.push(text);
      },
      emit() {},
    },
    get directDamage() { return directDamage; },
    get statusesToApply() { return statusesToApply; },
    get resourcesToRestore() { return resourcesToRestore; },
    get vitalityToRestore() { return vitalityToRestore; },
    get spawnedEntities() { return spawnedEntities; },
    get messages() { return messages; },
    get bonusCritChance() { return bonusCritChance; },
  };
}

function collectSubtreeWith(world, rootId, Comp, out = []) {
  const record = world.get(rootId, Comp);
  if (record) out.push({ entityId: rootId, record });
  for (const childId of children(world, rootId)) {
    collectSubtreeWith(world, childId, Comp, out);
  }
  return out;
}

Deno.test("proc package registry structural invariants", () => {
  const ids = listProcPackageIds();
  assert(ids.length > 0, "registry must contain at least one package");
  assertEquals(new Set(ids).size, ids.length, "package IDs must be unique");

  for (const id of ids) {
    const pkg = getProcPackage(id);
    assert(pkg, `getProcPackage("${id}") must return a spec`);
    assertEquals(typeof pkg.id, "string", `${id}: id must be a string`);
    assertEquals(typeof pkg.name, "string", `${id}: name must be a string`);
    assertEquals(typeof pkg.summary, "string", `${id}: summary must be a string`);
    assert(Array.isArray(pkg.procTrees), `${id}: procTrees must be an array`);
    assertEquals(pkg.id, id, `${id}: spec.id must match registry key`);
    if (pkg.display) {
      assertEquals(typeof pkg.display.context, "string", `${id}: display context must be a string`);
      assertEquals(typeof pkg.display.format, "string", `${id}: display format must be a string`);
    }
  }

  for (const key of Object.values(PROC_PACKAGE_KEYS)) {
    assert(hasProcPackageScript(key), `expected script ${key} to be registered`);
    assert(getScriptHandlers(key), `expected handlers for ${key}`);
  }

  assertEquals(getProcPackage("soulMortgage")?.deferredHooks, ["onDeath", "onShrineInteract"]);
  assertEquals(getProcPackage("ritualOverdraw")?.params, {
    healthCost: 2,
    fireDamage: 4,
    manaRestore: 2,
    killHeal: 2,
    minimumHealth: 3,
  });
  assertEquals(getProcPackage("doomClock")?.params, {
    stackLimit: 3,
    effectTurns: 9,
    damageFloor: 4,
    damageRatio: 0.5,
    stunTurns: 1,
  });
  assertEquals(getProcPackage("thunderGod")?.params, {
    arcDamage: 3,
    radius: 2,
    shockTurns: 2,
  });
  assertEquals(getProcPackage("deathAscendant")?.params, {
    invulnerabilityTurns: 2,
    berserkTurns: 4,
    staminaRestore: 10,
  });
  assertEquals(getProcPackage("venomClock")?.params, {
    stackLimit: 3,
    effectTurns: 6,
    damageFloor: 5,
    damageRatio: 0.6,
    poisonTurns: 4,
    poisonPotency: 2,
    diseaseTurns: 3,
    diseasePotency: 1,
  });
  assertEquals(getProcPackage("dawnbreaker")?.params, { awakenThreshold: 7 });
  assertEquals(getProcPackage("bloodCovenant")?.params, { hpCostPercent: 8, bonusFireDamage: 5 });
  assertEquals(getProcPackage("predatorMark")?.params, { maxStacks: 5, durationTurns: 4 });
  assertEquals(getProcPackage("soulAscendant")?.params, {
    healAmount: 8,
    regenTurns: 4,
    regenPotency: 2,
    stoneskinTurns: 3,
    stoneskinPotency: 2,
  });
  assertEquals(getProcPackage("eternalHunger")?.params, { maxStacks: 10, durationTurns: 12, damageDivisor: 2 });
});

Deno.test("proc package attachment materializes detached topology under a host", () => {
  const world = new World({ seed: 19 });
  const host = world.create();
  const echoRoot = attachProcPackage(world, host, "echoStrike");
  const soulRoot = attachProcPackage(world, host, "soulMortgage");
  const cataclysmRoot = attachProcPackage(world, host, "cataclysmChain");

  assert(world.get(echoRoot, ProcPackageNode));
  assert(world.get(soulRoot, ProcPackageNode));
  assert(world.get(cataclysmRoot, ProcPackageNode));

  assertEquals(collectSubtreeWith(world, echoRoot, ProcNode).length, 2);
  assertEquals(collectSubtreeWith(world, soulRoot, DerivedExpression).length, 4);
  assertEquals(collectSubtreeWith(world, soulRoot, ProcNode).length, 1);
  assertEquals(collectSubtreeWith(world, cataclysmRoot, ProcNode).length, 3);

  assertEquals(detachProcPackages(world, host, "echoStrike"), 1);
  assert(!world.isAlive(echoRoot), "expected detached package subtree to be destroyed");
});

Deno.test("echo strike package stores and replays prior hit memory", () => {
  const world = new World({ seed: 7 });
  const attacker = world.create();
  const defender = world.create();
  world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
  world.add(defender, Vitality, { maxHp: 20, hp: 20 });
  world.add(attacker, ActiveEffects, { effects: [] });

  const onHit = makeProcContext({ source: attacker, target: defender, kind: "onHit", damage: { amount: 10, type: "physical" } });
  runScript(PROC_PACKAGE_KEYS.EchoStrike, ScriptVerb.ProcEvaluate, world, onHit);

  const stored = world.get(attacker, ActiveEffects).effects.find((entry) => entry.key === "echo_strike_memory");
  assert(stored, "expected echo memory to be stored");
  assertEquals(stored.potency, 10);

  const onBeforeHit = makeProcContext({ source: attacker, target: defender, kind: "onBeforeHit", damage: { amount: 4, type: "physical" } });
  runScript(PROC_PACKAGE_KEYS.EchoStrike, ScriptVerb.ProcEvaluate, world, onBeforeHit);
  assert(onBeforeHit.proc._bonusDamage.min > 0, "expected echo strike to replay bonus damage");
});

Deno.test("doom clock package builds debt and detonates on the third toll", () => {
  const world = new World({ seed: 11 });
  const attacker = world.create();
  const defender = world.create();
  world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
  world.add(defender, Vitality, { maxHp: 20, hp: 20 });
  world.add(defender, ActiveEffects, { effects: [] });

  for (let i = 0; i < 2; i++) {
    const ctx = makeProcContext({ source: attacker, target: defender, kind: "onHit" });
    runScript(PROC_PACKAGE_KEYS.DoomClock, ScriptVerb.ProcEvaluate, world, ctx);
  }
  const ticking = world.get(defender, ActiveEffects).effects.find((entry) => entry.key === "doom_clock");
  assert(ticking, "expected doom clock to be ticking");
  assertEquals(ticking.stacks, 2);

  const third = makeProcContext({ source: attacker, target: defender, kind: "onHit", damage: { amount: 12, type: "physical" } });
  runScript(PROC_PACKAGE_KEYS.DoomClock, ScriptVerb.ProcEvaluate, world, third);
  assert(third.directDamage.length > 0, "expected doom clock to detonate into direct damage");
  assert(third.statusesToApply.some((entry) => entry.key === "stun"), "expected doom clock to apply stun");
});

Deno.test("ricochet theology package rebounds off wall-adjacent targets", () => {
  const world = new World({ seed: 13 });
  const attacker = world.create();
  const defender = world.create();
  const bystanderA = world.create();
  const bystanderB = world.create();
  const backward = world.create();
  const projectileEvents = [];
  world.on("projectile:spawn", (payload) => projectileEvents.push(payload));
  world.add(attacker, Position, { x: 1, y: 1 });
  world.add(defender, Position, { x: 2, y: 1 });
  world.add(bystanderA, Position, { x: 3, y: 1 });
  world.add(bystanderB, Position, { x: 3, y: 2 });
  world.add(backward, Position, { x: 1, y: 2 });
  world.add(attacker, Faction, { key: "player" });
  world.add(defender, Faction, { key: "enemy" });
  world.add(bystanderA, Faction, { key: "enemy" });
  world.add(backward, Faction, { key: "enemy" });
  world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
  world.add(defender, Vitality, { maxHp: 20, hp: 20 });
  world.add(bystanderA, Vitality, { maxHp: 20, hp: 20 });
  world.add(bystanderB, Vitality, { maxHp: 20, hp: 20 });
  world.add(backward, Vitality, { maxHp: 20, hp: 20 });

  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  tiles[0 * CHUNK_SIZE + 2] = TILE_WALL;
  loadChunk(0, 0, tiles);

  const ctx = makeProcContext({
    source: attacker,
    target: defender,
    kind: "onHit",
    damage: { amount: 10, type: "physical" },
    tags: new Set(["ranged", "projectile", "wallRicochet"]),
  });
  runScript(PROC_PACKAGE_KEYS.RicochetTheology, ScriptVerb.ProcEvaluate, world, ctx);
  assertEquals(ctx.directDamage.length, 2);
  assert(ctx.directDamage.some((entry) => entry.target === bystanderA && entry.type === "electric"), "expected first rebound to deal immediate electric damage");
  assert(ctx.directDamage.some((entry) => entry.target === bystanderB && entry.type === "electric"), "expected second rebound to deal immediate electric damage");
  assert(!ctx.directDamage.some((entry) => entry.target === backward), "expected backward target to be ignored");
  assertEquals(ctx.statusesToApply, []);
  assertEquals(projectileEvents.length, 2);
});

Deno.test("cataclysm chain package marks nearby hostiles and cashes a marked follow-up into crit pressure", () => {
  const world = new World({ seed: 23 });
  const attacker = world.create();
  const corpse = world.create();
  const marked = world.create();
  world.add(attacker, Position, { x: 1, y: 1 });
  world.add(corpse, Position, { x: 2, y: 1 });
  world.add(marked, Position, { x: 3, y: 1 });
  world.add(attacker, Faction, { key: "player" });
  world.add(corpse, Faction, { key: "enemy" });
  world.add(marked, Faction, { key: "enemy" });
  world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
  world.add(corpse, Vitality, { maxHp: 20, hp: 0 });
  world.add(marked, Vitality, { maxHp: 20, hp: 20 });
  world.add(marked, ActiveEffects, { effects: [] });

  const onCritKill = makeProcContext({
    source: attacker,
    target: corpse,
    kind: "onCritKill",
    damage: { amount: 14, type: "physical", crit: true },
  });
  runScript(PROC_PACKAGE_KEYS.CataclysmChain, ScriptVerb.ProcEvaluate, world, onCritKill);
  assert(onCritKill.spawnedEntities.some((entry) => entry.kind === "cataclysm_hazard"), "expected cataclysm hazard spawn");
  assert(onCritKill.statusesToApply.some((entry) => entry.target === marked && entry.key === "cataclysm_mark"), "expected nearby enemy to be marked");

  world.get(marked, ActiveEffects).effects.push({ key: "cataclysm_mark", turnsLeft: 4, potency: 1, stacks: 1 });
  const onBeforeHit = makeProcContext({
    source: attacker,
    target: marked,
    kind: "onBeforeHit",
    damage: { amount: 8, type: "physical", crit: false },
  });
  runScript(PROC_PACKAGE_KEYS.CataclysmChain, ScriptVerb.ProcEvaluate, world, onBeforeHit);
  assert(onBeforeHit.bonusCritChance > 0, "expected marked follow-up to gain forced crit pressure");
});

Deno.test("dealDamage dispatches onKill procs through equipped package topology", () => {
  const world = new World({ seed: 29 });
  const attacker = world.create();
  const defender = world.create();
  const hostItem = world.create();

  world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
  world.add(defender, Vitality, { maxHp: 6, hp: 6 });
  world.add(attacker, ActiveEffects, { effects: [] });
  world.add(attacker, Equipment, { offhand: hostItem });
  world.add(hostItem, ItemInfo, { type: "equip", slot: "offhand", affixes: [] });
  attachProcPackage(world, hostItem, "hungerSurge");

  const result = dealDamage(world, {
    source: attacker,
    target: defender,
    amount: 10,
    type: "physical",
    critical: false,
  });

  assert(result.killed, "expected defender to be killed");
  const hunger = world.get(attacker, ActiveEffects)?.effects?.find((e) => e?.key === "hunger_surge");
  assert(hunger, "expected onKill package to apply hunger_surge");
});

Deno.test("grave current package grants item charges on kill", () => {
  const world = new World({ seed: 31 });
  const attacker = world.create();
  const defender = world.create();
  const focus = world.create();

  world.add(attacker, Vitality, { maxHp: 24, hp: 24 });
  world.add(defender, Vitality, { maxHp: 5, hp: 5 });
  world.add(attacker, Equipment, { offhand: focus });
  world.add(focus, ItemInfo, {
    type: "equip",
    slot: "offhand",
    affixes: [],
    charges: 0,
    maxCharges: 3,
  });
  attachProcPackage(world, focus, "graveCurrent");

  let info = world.get(focus, ItemInfo);
  assertEquals(info.charges, 0);

  dealDamage(world, {
    source: attacker,
    target: defender,
    amount: 9,
    type: "physical",
    critical: true,
  });
  info = world.get(focus, ItemInfo);
  assertEquals(info.charges, 1, "expected charge gain on kill");
});

Deno.test("serpentBoundBreeches onHit applies serpent_hide", () => {
  const world = new World({ seed: 41 });
  const wearer = world.create();
  const target = world.create();
  world.add(wearer, ActiveEffects, { effects: [] });
  world.rand = () => 0.0; // force proc

  const onHit = makeProcContext({
    source: wearer,
    target,
    kind: "onHit",
    damage: { amount: 9, type: "physical", crit: false },
  });
  runScript(PROC_PACKAGE_KEYS.SerpentBoundBreeches, ScriptVerb.ProcEvaluate, world, onHit);

  const effects = world.get(wearer, ActiveEffects)?.effects || [];
  assert(effects.some((e) => e.key === "serpent_hide" && e.turnsLeft === 8), "expected serpent_hide 8t");
  assert(!effects.some((e) => e.key === "stoneskin"), "serpent breeches should not apply stoneskin");
});

Deno.test("serpent_hide contributes mitigation through combat snapshot (bridge removed)", () => {
  const world = new World({ seed: 43 });
  const actor = world.create();
  world.add(actor, Equipment, { evadeDerived: 0 });
  world.add(actor, ActiveEffects, { effects: [{ key: "serpent_hide", turnsLeft: 8, potency: 1, stacks: 1 }] });

  const snap = resolveCombatSnapshot(world, actor, { mode: "melee" });
  assertEquals(snap.armorClass, 12, "serpent_hide should grant +2 AC at potency 1");
  assert(
    snap.modifiers.some((m) => m.source === "status:serpent_hide" && m.value === 2),
    "expected serpent_hide modifier breadcrumb",
  );
});

Deno.test("serpentBoundBreeches retaliation remains active while serpent_hide is up", () => {
  const world = new World({ seed: 47 });
  const wearer = world.create();
  const attacker = world.create();
  let spawnedSpectralSnakes = false;
  world.on("proc:serpentBound:spectralSnakes", () => { spawnedSpectralSnakes = true; });
  world.add(wearer, ActiveEffects, { effects: [{ key: "serpent_hide", turnsLeft: 8, potency: 1, stacks: 1 }] });
  world.rand = () => 0.0; // force retaliation gate

  const onDamaged = makeProcContext({
    source: wearer,
    target: attacker,
    kind: "onDamaged",
    damage: { amount: 5, type: "physical", crit: false },
  });
  runScript(PROC_PACKAGE_KEYS.SerpentBoundBreeches, ScriptVerb.ProcEvaluate, world, onDamaged);

  assert(
    onDamaged.directDamage.some((d) => d.target === attacker && d.type === "nature" && d.amount === 2),
    "expected nature retaliation damage while serpent_hide active",
  );
  assertEquals(spawnedSpectralSnakes, false, "spectral snakes should require serpent_specters state");
});

// DEPRECATED: snakes now spawn from ability activation, not proc
// Deno.test("serpent_specters emits spectral snake spawn signal on damaged retaliation", () => {
//   const world = new World({ seed: 49 });
//   const wearer = world.create();
//   const attacker = world.create();
//   let snakeSignalCount = 0;
//   /** @type {any} */
//   let snakeSignal = null;
//   world.on("proc:serpentBound:spectralSnakes", (payload) => {
//     snakeSignalCount += 1;
//     snakeSignal = payload;
//   });
//   world.add(wearer, Position, { x: 5, y: 5 });
//   world.add(attacker, Position, { x: 6, y: 5 });
//   world.add(wearer, ActiveEffects, {
//     effects: [
//       { key: "serpent_hide", turnsLeft: 8, potency: 1, stacks: 1 },
//       { key: "serpent_specters", turnsLeft: 10, potency: 1, stacks: 1 },
//     ],
//   });
//   world.rand = () => 0.0;
//
//   const onDamaged = makeProcContext({
//     source: wearer,
//     target: attacker,
//     kind: "onDamaged",
//     damage: { amount: 5, type: "physical", crit: false },
//   });
//   runScript(PROC_PACKAGE_KEYS.SerpentBoundBreeches, ScriptVerb.ProcEvaluate, world, onDamaged);
//
//   assertEquals(snakeSignalCount, 1, "expected spectral snake spawn signal");
//   assertEquals(snakeSignal?.from, { x: 5, y: 5 }, "expected spectral snakes to originate at the wearer");
//   assertEquals(snakeSignal?.to, { x: 6, y: 5 }, "expected spectral snakes to target the attacker position");
//   assertEquals(snakeSignal?.direction, { dx: 1, dy: 0 }, "expected stable wearer-to-attacker direction");
//   assert(
//     onDamaged.statusesToApply.some((s) => s.target === attacker && s.key === "poison"),
//     "expected poison application during serpent_specters retaliation",
//   );
// });

// DEPRECATED: snakes now spawn from ability activation, not proc
// Deno.test("serpent_specters spawns three summoned spectral snakes with 10-turn lifespan", () => {
//   const world = new World({ seed: 51 });
//   clearAll();
//   loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
//   const wearer = world.create();
//   const attacker = world.create();
//   world.add(wearer, Position, { x: 5, y: 5 });
//   world.add(attacker, Position, { x: 6, y: 5 });
//   world.add(wearer, Vitality, { maxHp: 20, hp: 20 });
//   world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
//   world.add(wearer, ActiveEffects, {
//     effects: [
//       { key: "serpent_hide", turnsLeft: 8, potency: 1, stacks: 1 },
//       { key: "serpent_specters", turnsLeft: 10, potency: 1, stacks: 1 },
//     ],
//   });
//   world.rand = () => 0.0;
//
//   const onDamaged = makeProcContext({
//     source: wearer,
//     target: attacker,
//     kind: "onDamaged",
//     damage: { amount: 5, type: "physical", crit: false },
//   });
//   runScript(PROC_PACKAGE_KEYS.SerpentBoundBreeches, ScriptVerb.ProcEvaluate, world, onDamaged);
//
//   const spawned = [];
//   for (const [id, named, fac, owner, life] of world.query(NamedIdentity, Faction, Owner, Lifespan)) {
//     if (named.identity !== "spectral_snake") continue;
//     spawned.push({ id, fac, owner, life });
//   }
//
//   assertEquals(spawned.length, 3, "expected exactly three spectral snakes");
//   assert(spawned.every((entry) => String(entry.fac?.key || "") === "summoned"), "spectral snakes should be allied summons");
//   assert(spawned.every((entry) => Number(entry.owner?.ownerId || 0) === wearer), "spectral snakes should be owned by wearer");
//   assert(spawned.every((entry) => Number(entry.life?.turnsLeft || 0) === 10), "spectral snakes should last 10 turns");
// });

// DEPRECATED: snakes now spawn from ability activation, not proc
// Deno.test("serpent_specters prefers attacker-adjacent tiles before falling back to wearer", () => {
//   const world = new World({ seed: 57 });
//   clearAll();
//   const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_WALL);
//   const at = (x, y) => (y * CHUNK_SIZE) + x;
//   tiles[at(5, 5)] = TILE_FLOOR;
//   tiles[at(6, 5)] = TILE_FLOOR;
//   tiles[at(7, 4)] = TILE_FLOOR;
//   tiles[at(7, 5)] = TILE_FLOOR;
//   tiles[at(7, 6)] = TILE_FLOOR;
//   loadChunk(0, 0, tiles);
//
//   const wearer = world.create();
//   const attacker = world.create();
//   world.add(wearer, Position, { x: 5, y: 5 });
//   world.add(attacker, Position, { x: 6, y: 5 });
//   world.add(wearer, Vitality, { maxHp: 20, hp: 20 });
//   world.add(attacker, Vitality, { maxHp: 20, hp: 20 });
//   world.add(wearer, ActiveEffects, {
//     effects: [
//       { key: "serpent_hide", turnsLeft: 8, potency: 1, stacks: 1 },
//       { key: "serpent_specters", turnsLeft: 10, potency: 1, stacks: 1 },
//     ],
//   });
//   world.rand = () => 0.0;
//
//   const onDamaged = makeProcContext({
//     source: wearer,
//     target: attacker,
//     kind: "onDamaged",
//     damage: { amount: 5, type: "physical", crit: false },
//   });
//   runScript(PROC_PACKAGE_KEYS.SerpentBoundBreeches, ScriptVerb.ProcEvaluate, world, onDamaged);
//
//   const spawned = [];
//   for (const [id, named, pos] of world.query(NamedIdentity, Position)) {
//     if (named.identity !== "spectral_snake") continue;
//     spawned.push({ id, pos });
//   }
//
//   assertEquals(spawned.length, 3, "expected fallback search to find three spawn tiles");
//   assert(spawned.every((entry) => Number(entry.pos?.x || 0) === 7), "expected snakes to spawn from the attacker side lane");
// });

Deno.test("serpent_specters does not emit spawn signal when no snakes can be placed", () => {
  const world = new World({ seed: 61 });
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_WALL));
  const wearer = world.create();
  const attacker = world.create();
  let snakeSignalCount = 0;
  world.on("proc:serpentBound:spectralSnakes", () => { snakeSignalCount += 1; });
  world.add(wearer, Position, { x: 5, y: 5 });
  world.add(attacker, Position, { x: 6, y: 5 });
  world.add(wearer, ActiveEffects, {
    effects: [
      { key: "serpent_hide", turnsLeft: 8, potency: 1, stacks: 1 },
      { key: "serpent_specters", turnsLeft: 10, potency: 1, stacks: 1 },
    ],
  });
  world.rand = () => 0.0;

  const onDamaged = makeProcContext({
    source: wearer,
    target: attacker,
    kind: "onDamaged",
    damage: { amount: 5, type: "physical", crit: false },
  });
  runScript(PROC_PACKAGE_KEYS.SerpentBoundBreeches, ScriptVerb.ProcEvaluate, world, onDamaged);

  assertEquals(snakeSignalCount, 0, "expected no spawn signal when placement fails");
});

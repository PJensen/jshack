import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { children, World } from '../src/lib/ecs-js/index.js';
import { Position } from '../src/rules/components/Position.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { Equipment } from '../src/rules/components/Equipment.js';
import { Inventory } from '../src/rules/components/Inventory.js';
import { ItemInfo } from '../src/rules/components/ItemInfo.js';
import { Stamina } from '../src/rules/components/Stamina.js';
import { Faction } from '../src/rules/components/Faction.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { Facing } from '../src/rules/components/Facing.js';
import { ActiveEffects } from '../src/rules/components/ActiveEffects.js';
import { HazardArea } from '../src/rules/components/HazardArea.js';
import { Resistances } from '../src/rules/components/Resistences.js';
import { ProcPackageNode } from '../src/rules/components/ProcPackageNode.js';
import { AttackIntent } from '../src/rules/components/Intents/AttackIntent.js';
import { RangedAttackIntent } from '../src/rules/components/Intents/RangedAttackIntent.js';
import { combatSystem } from '../src/rules/systems/combatSystem.js';
import { rangedAttackSystem } from '../src/rules/systems/rangedAttackSystem.js';
import { inventoryContains, addToInventory, inventoryItems } from '../src/rules/utils/inventoryFacade.js';
import { loadChunk, clearAll } from '../src/rules/environment/dungeon/tileMap.js';
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL } from '../src/rules/environment/dungeon/constants.js';
import { STAMINA_REGEN_COOLDOWN } from '../src/rules/data/regenConstants.js';
import { buildCatalogItem } from '../src/rules/data/itemCatalogLoader.js';

function makeBow(world) {
  const id = world.create();
  world.add(id, ItemInfo, {
    type: 'equip', slot: 'ranged', weight: 1, value: 0, description: 'Short Bow',
    count: 1, bonuses: { attack: 1 }, rarity: 1, rarityName: 'common', affixes: [],
    damageDice: '1d6', subtype: 'bow', range: 8,
  });
  return id;
}

function makeAmmo(world, countOrOpts = 10) {
  const opts = (countOrOpts && typeof countOrOpts === 'object')
    ? countOrOpts
    : { count: countOrOpts };
  const count = Number(opts.count ?? 10) | 0;
  const id = world.create();
  const subtype = opts.subtype ? String(opts.subtype) : null;
  world.add(id, ItemInfo, {
    type: 'ammo', slot: '', weight: 0, value: 0, description: 'Arrows',
    count, bonuses: {}, rarity: 1, rarityName: 'common', affixes: [],
    subtype,
  });
  if (opts.identity) {
    world.add(id, NamedIdentity, {
      name: String(opts.name || 'Arrows'),
      identity: String(opts.identity),
    });
  }
  return id;
}

function makeSword(world) {
  const id = world.create();
  world.add(id, ItemInfo, {
    type: 'equip', slot: 'weapon', weight: 1, value: 0, description: 'Sword',
    count: 1, bonuses: { attack: 2 }, rarity: 1, rarityName: 'common', affixes: [],
    damageDice: '1d6', subtype: null, range: null,
  });
  return id;
}

/** Place a wall tile in the tileMap at (x,y) within a floor-filled chunk. */
function placeWallInTileMap(x, y) {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  tiles[y * CHUNK_SIZE + x] = TILE_WALL;
  loadChunk(0, 0, tiles);
}

function setup(opts = {}) {
  clearAll(); // Reset tileMap between tests
  const world = new World({ seed: opts.seed || 99 });
  world.step = opts.step || 1;

  const bowId = makeBow(world);
  const ammoId = makeAmmo(world, {
    count: opts.ammoCount ?? 10,
    subtype: opts.ammoSubtype,
    identity: opts.ammoIdentity,
    name: opts.ammoName,
  });

  const archer = world.create();
  world.add(archer, Position, { x: opts.ax ?? 0, y: opts.ay ?? 0 });
  world.add(archer, Vitality, { maxHp: 20, hp: 20 });
  world.add(archer, Equipment, { ranged: bowId, accuracyDerived: 1, damagePowerDerived: 1 });
  world.add(archer, Inventory, { capacity: 20 });
  addToInventory(world, archer, bowId);
  addToInventory(world, archer, ammoId);
  world.add(archer, Faction, { key: opts.archerFaction || 'player' });

  const target = world.create();
  world.add(target, Position, { x: opts.tx ?? 5, y: opts.ty ?? 0 });
  world.add(target, Vitality, { maxHp: opts.targetHp ?? 10, hp: opts.targetHp ?? 10 });
  world.add(target, Equipment, { evadeDerived: 0 });
  world.add(target, Faction, { key: opts.targetFaction || 'enemy' });

  return { world, archer, target, bowId, ammoId };
}

function trackEvents(world, events) {
  events.length = 0;
  for (const ev of ['ranged:shot', 'ranged:no-ammo', 'ranged:blocked', 'ranged:out-of-range', 'ranged:insufficient-stamina', 'attack:insufficient-stamina', 'ranged:miss-behind-hit', 'damaged', 'died', 'proc:burning', 'proc:stunned']) {
    world.on(ev, (data) => events.push({ _event: ev, ...data }));
  }
}

Deno.test("ranged: hit with bow, ammo, LOS clear, in range", () => {
  const events = [];
  const { world, archer, target } = setup({ seed: 42 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  const tv = world.get(target, Vitality);
  assert(tv.hp < 10, `target took damage (hp=${tv.hp})`);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  assert(events.some(e => e._event === 'ranged:shot'), 'ranged:shot emitted');
  assert(events.some(e => e._event === 'damaged'), 'damaged emitted');
  const hit = events.find(e => e._event === 'damaged');
  assert((hit?.projectileDelay || 0) > 0, 'ranged hits should carry projectileDelay');
  assertEquals(String(hit?.projectileKind || ''), 'arrow');
  assert(Math.abs(Number(hit?.impactVector?.dx || 0) - 1) < 1e-6, `impactVector.dx should face target, got ${Number(hit?.impactVector?.dx || 0)}`);
  assert(Math.abs(Number(hit?.impactVector?.dy || 0)) < 1e-6, `impactVector.dy should be 0 for horizontal shot, got ${Number(hit?.impactVector?.dy || 0)}`);
});

Deno.test("ranged: coordinate shot resolves empty endpoint as ground impact", () => {
  const events = [];
  const { world, archer, ammoId } = setup({ ammoIdentity: "ammo_chalk_arrows", ammoName: "Chalk Arrows" });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: 0, toX: 6, toY: 1 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), "intent removed");
  assertEquals(world.get(ammoId, ItemInfo)?.count, 9);
  const shot = events.find((event) => event._event === "ranged:shot");
  assert(shot, "ground impacts should emit ranged:shot for VFX/audio");
  assertEquals(shot.hit, false);
  assertEquals(shot.impact?.kind, "ground");
  assertEquals(shot.to, { x: 6, y: 1 });
  const marks = [...world.query(Position, HazardArea)].map(([, pos]) => `${pos.x},${pos.y}`);
  assert(marks.includes("6,1"), "ground impact should author a hazard at the endpoint");
});

Deno.test("ranged: fire arrows leave a single-tile fire impact", () => {
  const { world, archer, ammoId } = setup({ ammoIdentity: "ammo_fire_arrows", ammoName: "Fire Arrows" });
  world.add(archer, RangedAttackIntent, { targetId: 0, toX: 6, toY: 1 });
  rangedAttackSystem(world);
  const fire = [...world.query(Position, HazardArea)].find(([, pos, hazard]) =>
    pos.x === 6 && pos.y === 1 && hazard.kind === "fire" && hazard.cause === "fire_arrows:ground"
  );
  assert(fire, "fire arrows should leave fire at the ground impact");
  assertEquals(fire[2].radius, 0, "fire arrow ground impact should remain a single tile");
  assertEquals(world.get(ammoId, ItemInfo)?.count, 9);
});

Deno.test("ranged: bomb arrows leave a radius-one blast zone", () => {
  const { world, archer, ammoId } = setup({ ammoIdentity: "ammo_bomb_arrows", ammoName: "Bomb Arrows" });
  world.add(archer, RangedAttackIntent, { targetId: 0, toX: 6, toY: 1 });
  rangedAttackSystem(world);
  const blast = [...world.query(Position, HazardArea)].find(([, pos, hazard]) =>
    pos.x === 6 && pos.y === 1 && hazard.kind === "fire" && hazard.cause === "bomb_arrows:blast"
  );
  assert(blast, "bomb arrows should leave a blast zone at the ground impact");
  assertEquals(blast[2].radius, 1);
  assertEquals(blast[2].tickDamage, 4);
  assertEquals(world.get(ammoId, ItemInfo)?.count, 9);
});

Deno.test("ranged: hits do not apply implicit bleed without explicit proc source", () => {
  let validated = false;
  for (let seed = 1; seed <= 64; seed++) {
    const { world, archer, target } = setup({ seed, targetHp: 30 });
    world.mutate(archer, Equipment, (eq) => {
      eq.accuracyDerived = 20;
      eq.damagePowerDerived = 8;
    });
    world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
    rangedAttackSystem(world);
    const damage = 30 - (world.get(target, Vitality)?.hp || 30);
    if (damage <= 0) continue;
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(!effects.some((e) => String(e?.key || "") === "bleed"), "ranged hit should not auto-apply bleed");
    validated = true;
    break;
  }
  assert(validated, "expected at least one deterministic landed ranged hit");
});

Deno.test("ranged: no bow (sword equipped) → silent no-op", () => {
  const events = [];
  const { world, archer, target } = setup();
  const swordId = makeSword(world);
  world.set(archer, Equipment, { ranged: swordId, accuracyDerived: 1, damagePowerDerived: 1 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  assert(events.length === 0, 'no events emitted');
  const tv = world.get(target, Vitality);
  assert(tv.hp === 10, 'target undamaged');
});

Deno.test("ranged: no ammo → ranged:no-ammo emitted", () => {
  const events = [];
  const { world, archer, target } = setup();
  // Remove ammo from inventory — keep only bow
  const ammoItems = inventoryItems(world, archer).filter(id => {
    const info = world.get(id, ItemInfo);
    return info && info.type === 'ammo';
  });
  for (const id of ammoItems) world.destroy(id);
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  assert(events.some(e => e._event === 'ranged:no-ammo'), 'ranged:no-ammo emitted');
  const tv = world.get(target, Vitality);
  assert(tv.hp === 10, 'target undamaged');
});

Deno.test("ranged: LOS blocked by wall → ranged:blocked emitted", () => {
  const events = [];
  const { world, archer, target } = setup();
  placeWallInTileMap(3, 0); // Place wall after setup() since setup calls clearAll()
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  assert(events.some(e => e._event === 'ranged:blocked'), 'ranged:blocked emitted');
  const tv = world.get(target, Vitality);
  assert(tv.hp === 10, 'target undamaged');
});

Deno.test("ranged: target outside facing cone → ranged:blocked emitted and no ammo spent", () => {
  const events = [];
  const { world, archer, target, ammoId } = setup({ seed: 42 });
  world.add(archer, Facing, { dx: -1, dy: 0 }); // facing west while target is east
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), "intent removed");
  assert(events.some((e) => e._event === "ranged:blocked" && e.reason === "facing"), "facing block event emitted");
  assertEquals(world.get(target, Vitality)?.hp, 10, "target should remain undamaged");
  assertEquals(world.get(ammoId, ItemInfo)?.count, 10, "ammo should not be consumed");
});

Deno.test("ranged: out of range → ranged:out-of-range emitted", () => {
  const events = [];
  const { world, archer, target } = setup({ tx: 15, ty: 0 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 15, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  assert(events.some(e => e._event === 'ranged:out-of-range'), 'ranged:out-of-range emitted');
});

Deno.test("ranged: ammo count decrements", () => {
  const events = [];
  const { world, archer, target, ammoId } = setup({ seed: 42 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  const ammoInfo = world.get(ammoId, ItemInfo);
  assert(ammoInfo && ammoInfo.count === 9, `ammo decremented (count=${ammoInfo?.count})`);
});

Deno.test("ranged: spends stamina and applies regen cooldown on attack", () => {
  const events = [];
  const { world, archer, target } = setup({ seed: 42 });
  world.add(archer, Stamina, { maxStamina: 20, stamina: 20, staminaRegen: 1, regenCooldown: 0 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  const stamina = world.get(archer, Stamina);
  assertEquals(stamina?.stamina, 14, "short bow should spend 6 stamina");
  assertEquals(stamina?.regenCooldown, STAMINA_REGEN_COOLDOWN, "spending stamina should set regen cooldown");
  assert(events.some((e) => e._event === 'ranged:shot'), "attack should proceed when stamina is sufficient");
});

Deno.test("ranged: insufficient stamina cancels attack before ammo consumption", () => {
  const events = [];
  const { world, archer, target, ammoId } = setup({ seed: 42, ammoCount: 3 });
  world.add(archer, Stamina, { maxStamina: 5, stamina: 5, staminaRegen: 1, regenCooldown: 0 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);

  assert(!world.has(archer, RangedAttackIntent), "intent should be removed on insufficient stamina");
  assert(events.some((e) => e._event === 'attack:insufficient-stamina'), "generic insufficient stamina event expected");
  assert(events.some((e) => e._event === 'ranged:insufficient-stamina'), "ranged-specific insufficient stamina event expected");
  assert(!events.some((e) => e._event === 'ranged:shot'), "no shot should be fired");
  assertEquals(world.get(target, Vitality)?.hp, 10, "target should remain undamaged");
  assertEquals(world.get(ammoId, ItemInfo)?.count, 3, "ammo should not be consumed");
});

Deno.test("ranged: last ammo → entity destroyed", () => {
  const events = [];
  const { world, archer, target, ammoId } = setup({ seed: 42, ammoCount: 1 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.isAlive(ammoId), 'ammo entity destroyed');
  assert(!inventoryContains(world, archer, ammoId), 'ammo removed from inventory');
});

Deno.test("ranged: successful hits can occasionally embed ammo into the monster inventory", () => {
  let recoveredCount = 0;
  const trials = 64;

  for (let seed = 1; seed <= trials; seed++) {
    const { world, archer, target } = setup({
      seed,
      ammoIdentity: 'ammo_fire_arrows',
      ammoSubtype: 'fire',
      ammoName: 'Fire Arrows',
    });
    world.add(target, Inventory, { capacity: 20 });
    world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
    rangedAttackSystem(world);

    const recoveredAmmo = inventoryItems(world, target).filter((id) => {
      const info = world.get(id, ItemInfo);
      return info && info.type === 'ammo';
    });
    if (recoveredAmmo.length <= 0) continue;

    recoveredCount += 1;
    const ni = world.get(recoveredAmmo[0], NamedIdentity);
    assertEquals(ni?.identity, 'ammo_fire_arrows', 'recovered ammo should match fired ammo type');
  }

  assert(recoveredCount > 0, "expected at least one recovered arrow across deterministic trials");
  assert(recoveredCount < trials, "ammo recovery should be occasional, not guaranteed");
});

Deno.test("ranged: kill target → died emitted", () => {
  const events = [];
  const { world, archer, target } = setup({ seed: 42, targetHp: 1 });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(events.some(e => e._event === 'died' && e.id === target), 'died emitted');
});

Deno.test("ranged: same faction → no damage", () => {
  const events = [];
  const { world, archer, target } = setup({ archerFaction: 'player', targetFaction: 'player' });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  const tv = world.get(target, Vitality);
  assert(tv.hp === 10, 'same faction undamaged');
  assert(!events.some(e => e._event === 'damaged'), 'no damage event');
});

Deno.test("ranged: player to pet faction is non-hostile", () => {
  const events = [];
  const { world, archer, target } = setup({ archerFaction: 'player', targetFaction: 'pet' });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  const tv = world.get(target, Vitality);
  assert(tv.hp === 10, 'pet faction undamaged');
  assert(!events.some(e => e._event === 'damaged'), 'no damage event');
});

Deno.test("ranged: non-adjacent invisible target is untargetable", () => {
  const events = [];
  const { world, archer, target } = setup({ seed: 142, tx: 5, ty: 0 });
  world.add(target, ActiveEffects, {
    effects: [{ key: 'invisible', turnsLeft: 10, potency: 1, stacks: 1 }],
  });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  const tv = world.get(target, Vitality);
  assertEquals(tv.hp, 10, 'invisible target should not take ranged damage at range');
  assert(events.some(e => e._event === 'ranged:blocked' && e.reason === 'invisible'), 'blocked due to invisibility');
});

Deno.test("ranged: adjacent invisible target remains targetable", () => {
  const events = [];
  const { world, archer, target } = setup({ seed: 143, tx: 1, ty: 0 });
  world.add(target, ActiveEffects, {
    effects: [{ key: 'invisible', turnsLeft: 10, potency: 1, stacks: 1 }],
  });
  trackEvents(world, events);
  world.add(archer, RangedAttackIntent, { targetId: target, toX: 1, toY: 0 });
  rangedAttackSystem(world);
  assert(!world.has(archer, RangedAttackIntent), 'intent removed');
  assert(!events.some(e => e._event === 'ranged:blocked' && e.reason === 'invisible'), 'adjacent invisible target should not be invis-blocked');
});

Deno.test("buildCatalogItem attaches proc packages for mirror bow", () => {
  const world = new World({ seed: 55 });
  const bowId = buildCatalogItem(world, "bow_mirror");
  const packageChildren = [...children(world, bowId)].filter((id) => world.get(id, ProcPackageNode));
  assertEquals(packageChildren.length, 1);
  assertEquals(world.get(packageChildren[0], ProcPackageNode)?.packageId, "ricochetTheology");
});

Deno.test("ranged: physical projectile collision stops at an intervening actor", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  tiles[3 * CHUNK_SIZE + 4] = TILE_WALL;
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 13 });
  world.step = 1;
  const projectileEvents = [];
  world.on("projectile:spawn", (payload) => projectileEvents.push(payload));
  const shots = [];
  world.on("ranged:shot", (payload) => shots.push(payload));

  const bowId = buildCatalogItem(world, "bow_mirror");
  const ammoId = makeAmmo(world, 10);
  const archer = world.create();
  world.add(archer, Position, { x: 2, y: 4 });
  world.add(archer, Vitality, { maxHp: 20, hp: 20 });
  world.add(archer, Equipment, { ranged: bowId, ammo: ammoId, accuracyDerived: 1, damagePowerDerived: 1 });
  world.add(archer, Inventory, { capacity: 20 });
  world.add(archer, Faction, { key: "player" });
  addToInventory(world, archer, bowId);
  addToInventory(world, archer, ammoId);

  const target = world.create();
  world.add(target, Position, { x: 4, y: 4 });
  world.add(target, Vitality, { maxHp: 20, hp: 20 });
  world.add(target, Equipment, { evadeDerived: 0 });
  world.add(target, Faction, { key: "enemy" });

  const bystanderA = world.create();
  world.add(bystanderA, Position, { x: 5, y: 4 });
  world.add(bystanderA, Vitality, { maxHp: 20, hp: 20 });
  world.add(bystanderA, Faction, { key: "enemy" });
  world.add(bystanderA, ActiveEffects, { effects: [] });

  const bystanderB = world.create();
  world.add(bystanderB, Position, { x: 5, y: 5 });
  world.add(bystanderB, Vitality, { maxHp: 20, hp: 20 });
  world.add(bystanderB, ActiveEffects, { effects: [] });

  const backward = world.create();
  world.add(backward, Position, { x: 3, y: 4 });
  world.add(backward, Vitality, { maxHp: 20, hp: 20 });
  world.add(backward, Faction, { key: "enemy" });
  world.add(backward, ActiveEffects, { effects: [] });

  world.add(archer, RangedAttackIntent, { targetId: target, toX: 4, toY: 4 });
  rangedAttackSystem(world);

  assertEquals(projectileEvents.length, 0);
  assertEquals(shots[0]?.target, backward, "intervening actor should resolve as the impact target");
  assertEquals(world.get(target, Vitality).hp, 20, "locked target behind an actor should not be hit");
  assertEquals(world.get(bystanderA, Vitality).hp, 20, "actors beyond the first collision should be ignored");
  assertEquals(world.get(bystanderB, Vitality).hp, 20, "actors beyond the first collision should be ignored");
});

Deno.test("combat: mirror bow proc does not fire on melee hits", () => {
  clearAll();
  const world = new World({ seed: 42 });
  world.step = 1;
  const projectileEvents = [];
  world.on("projectile:spawn", (payload) => projectileEvents.push(payload));

  const bowId = buildCatalogItem(world, "bow_mirror");
  const swordId = makeSword(world);
  const hero = world.create();
  world.add(hero, Position, { x: 1, y: 1 });
  world.add(hero, Vitality, { maxHp: 20, hp: 20 });
  world.add(hero, Equipment, { weapon: swordId, ranged: bowId });
  world.add(hero, Faction, { key: "player" });

  const foe = world.create();
  world.add(foe, Position, { x: 1, y: 2 });
  world.add(foe, Vitality, { maxHp: 20, hp: 20 });
  world.add(foe, Equipment, { evadeDerived: 0 });
  world.add(foe, Faction, { key: "enemy" });

  const spectator = world.create();
  world.add(spectator, Position, { x: 1, y: 3 });
  world.add(spectator, Vitality, { maxHp: 20, hp: 20 });
  world.add(spectator, Faction, { key: "enemy" });

  world.add(hero, AttackIntent, { targetId: foe });
  combatSystem(world);

  assertEquals(projectileEvents.length, 0);
  assertEquals(world.get(spectator, Vitality).hp, 20, "melee should not trigger bow ricochet");
});

Deno.test("ranged: held ember knife flaming affix does not proc on bow shots", () => {
  let sawLandedShot = false;

  for (let seed = 1; seed <= 96; seed++) {
    const { world, archer, target, bowId, ammoId } = setup({ seed, targetHp: 40 });
    const emberKnife = buildCatalogItem(world, "ember_knife");
    world.set(archer, Equipment, {
      weapon: emberKnife,
      ranged: bowId,
      ammo: ammoId,
      accuracyDerived: 12,
      damagePowerDerived: 4,
    });
    world.add(target, ActiveEffects, { effects: [] });

    let flamingEvents = 0;
    world.on("proc:flaming", () => {
      flamingEvents += 1;
    });

    world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
    rangedAttackSystem(world);

    const hp = world.get(target, Vitality)?.hp || 0;
    if (hp < 40) sawLandedShot = true;
    const effects = world.get(target, ActiveEffects)?.effects || [];
    const burning = effects.some((e) => e.key === "burn" || e.key === "burning");
    assert(!burning, `seed ${seed}: ranged shot should not apply ember_knife burning to target`);
    assertEquals(flamingEvents, 0, `seed ${seed}: proc:flaming should not fire from held melee weapon`);
  }

  assert(sawLandedShot, "expected at least one deterministic seed with a landed ranged hit");
});

Deno.test("ranged: fire ammo actor-impact hooks add damage and burning", () => {
  const baseline = setup({ seed: 42, targetHp: 30 });
  baseline.world.add(baseline.archer, RangedAttackIntent, { targetId: baseline.target, toX: 5, toY: 0 });
  rangedAttackSystem(baseline.world);
  const baselineHp = baseline.world.get(baseline.target, Vitality).hp;

  const events = [];
  const fire = setup({
    seed: 42,
    targetHp: 30,
    ammoSubtype: 'fire',
    ammoIdentity: 'ammo_fire_arrows',
    ammoName: 'Fire Arrows',
  });
  trackEvents(fire.world, events);
  fire.world.add(fire.archer, RangedAttackIntent, { targetId: fire.target, toX: 5, toY: 0 });
  rangedAttackSystem(fire.world);

  const fireHp = fire.world.get(fire.target, Vitality).hp;
  const ae = fire.world.get(fire.target, ActiveEffects);
  const hasBurn = !!(ae && Array.isArray(ae.effects) && ae.effects.some((e) => e.key === 'burn'));

  assert(fireHp <= baselineHp - 1, `fire ammo should add at least +1 damage (baselineHp=${baselineHp}, fireHp=${fireHp})`);
  assert(hasBurn, 'fire ammo should apply burn via actor-impact hook');
  assert(events.some((e) => e._event === 'proc:burning'), 'fire ammo should emit proc:burning');
});

Deno.test("ranged: attacker pierce penetration increases damage against DR", () => {
  const baseline = setup({ seed: 42, targetHp: 30 });
  baseline.world.set(baseline.archer, Equipment, {
    ranged: baseline.bowId,
    ammo: baseline.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
    piercePenetrationDerived: 0,
  });
  baseline.world.add(baseline.target, Resistances, { kinetic: { DR: 6, bluntMult: 1, slashMult: 1, pierceMult: 1 } });
  baseline.world.add(baseline.archer, RangedAttackIntent, { targetId: baseline.target, toX: 5, toY: 0 });
  rangedAttackSystem(baseline.world);
  const baselineDamage = 30 - baseline.world.get(baseline.target, Vitality).hp;

  const piercing = setup({ seed: 42, targetHp: 30 });
  piercing.world.set(piercing.archer, Equipment, {
    ranged: piercing.bowId,
    ammo: piercing.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
    piercePenetrationDerived: 3,
  });
  piercing.world.add(piercing.target, Resistances, { kinetic: { DR: 6, bluntMult: 1, slashMult: 1, pierceMult: 1 } });
  piercing.world.add(piercing.archer, RangedAttackIntent, { targetId: piercing.target, toX: 5, toY: 0 });
  rangedAttackSystem(piercing.world);
  const piercingDamage = 30 - piercing.world.get(piercing.target, Vitality).hp;

  assert(
    piercingDamage > baselineDamage,
    `pierce penetration should improve ranged damage vs DR (baseline=${baselineDamage}, piercing=${piercingDamage})`,
  );
});

Deno.test("ranged: blinded defenders are easier to hit based on blindness strength", () => {
  function runOne(seed, blindPotency = 0) {
    const { world, archer, target } = setup({ seed, targetHp: 20, tx: 5, ty: 0 });
    world.set(archer, Equipment, {
      ranged: world.get(archer, Equipment)?.ranged || null,
      ammo: world.get(archer, Equipment)?.ammo || null,
      accuracyDerived: 0,
      damagePowerDerived: 4,
    });
    world.set(target, Equipment, { evadeDerived: 10 });
    if (blindPotency > 0) {
      world.add(target, ActiveEffects, {
        effects: [{ key: 'blinded', turnsLeft: 5, potency: blindPotency, stacks: 1 }],
      });
    }
    world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
    rangedAttackSystem(world);
    return 20 - world.get(target, Vitality).hp;
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
  assert(compared, "expected at least one deterministic seed where blinded defender is hit while baseline misses");
  assert(scaled, "expected stronger blindness to create a ranged hit opportunity not present at lower blindness potency");
});

Deno.test("ranged: blinded defenders take more direct-hit physical projectile damage", () => {
  function runOne(seed, blindPotency = 0) {
    const { world, archer, target, bowId, ammoId } = setup({ seed, targetHp: 30, tx: 5, ty: 0 });
    world.set(archer, Equipment, {
      ranged: bowId,
      ammo: ammoId,
      accuracyDerived: 20,
      damagePowerDerived: 12,
    });
    world.set(target, Equipment, { evadeDerived: 0 });
    if (blindPotency > 0) {
      world.add(target, ActiveEffects, {
        effects: [{ key: 'blinded', turnsLeft: 5, potency: blindPotency, stacks: 1 }],
      });
    }
    world.add(archer, RangedAttackIntent, { targetId: target, toX: 5, toY: 0 });
    rangedAttackSystem(world);
    return 30 - world.get(target, Vitality).hp;
  }

  const baseline = runOne(42, 0);
  const blinded = runOne(42, 4);
  assert(
    blinded > baseline,
    `blinded ranged target should take higher direct-hit physical damage (baseline=${baseline}, blinded=${blinded})`,
  );
});

Deno.test("ranged: piercing arrows add armor penetration on hit", () => {
  const baseline = setup({ seed: 42, targetHp: 30 });
  baseline.world.set(baseline.archer, Equipment, {
    ranged: baseline.bowId,
    ammo: baseline.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
  });
  baseline.world.add(baseline.target, Resistances, { kinetic: { DR: 6, bluntMult: 1, slashMult: 1, pierceMult: 1 } });
  baseline.world.add(baseline.archer, RangedAttackIntent, { targetId: baseline.target, toX: 5, toY: 0 });
  rangedAttackSystem(baseline.world);
  const baselineDamage = 30 - baseline.world.get(baseline.target, Vitality).hp;

  const piercingAmmo = setup({
    seed: 42,
    targetHp: 30,
    ammoSubtype: 'piercing',
    ammoIdentity: 'ammo_piercing_arrows',
    ammoName: 'Piercing Arrows',
  });
  piercingAmmo.world.set(piercingAmmo.archer, Equipment, {
    ranged: piercingAmmo.bowId,
    ammo: piercingAmmo.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
  });
  piercingAmmo.world.add(piercingAmmo.target, Resistances, { kinetic: { DR: 6, bluntMult: 1, slashMult: 1, pierceMult: 1 } });
  piercingAmmo.world.add(piercingAmmo.archer, RangedAttackIntent, { targetId: piercingAmmo.target, toX: 5, toY: 0 });
  rangedAttackSystem(piercingAmmo.world);
  const piercingAmmoDamage = 30 - piercingAmmo.world.get(piercingAmmo.target, Vitality).hp;

  assert(
    piercingAmmoDamage > baselineDamage,
    `piercing arrows should improve ranged damage vs DR (baseline=${baselineDamage}, piercingAmmo=${piercingAmmoDamage})`,
  );
});

Deno.test("ranged: bodkin arrows trade base damage for stronger armor punch", () => {
  let sawImprovement = false;
  let compared = false;
  for (let seed = 1; seed <= 96; seed++) {
    const baseline = setup({ seed, targetHp: 30 });
    baseline.world.set(baseline.archer, Equipment, {
      ranged: baseline.bowId,
      ammo: baseline.ammoId,
      accuracyDerived: 8,
      damagePowerDerived: 4,
    });
    baseline.world.add(baseline.target, Resistances, { kinetic: { DR: 8, bluntMult: 1, slashMult: 1, pierceMult: 1 } });
    baseline.world.add(baseline.archer, RangedAttackIntent, { targetId: baseline.target, toX: 5, toY: 0 });
    rangedAttackSystem(baseline.world);
    const baselineDamage = 30 - baseline.world.get(baseline.target, Vitality).hp;

    const bodkin = setup({
      seed,
      targetHp: 30,
      ammoSubtype: 'bodkin',
      ammoIdentity: 'ammo_bodkin_arrows',
      ammoName: 'Bodkin Arrows',
    });
    bodkin.world.set(bodkin.archer, Equipment, {
      ranged: bodkin.bowId,
      ammo: bodkin.ammoId,
      accuracyDerived: 8,
      damagePowerDerived: 4,
    });
    bodkin.world.add(bodkin.target, Resistances, { kinetic: { DR: 8, bluntMult: 1, slashMult: 1, pierceMult: 1 } });
    bodkin.world.add(bodkin.archer, RangedAttackIntent, { targetId: bodkin.target, toX: 5, toY: 0 });
    rangedAttackSystem(bodkin.world);
    const bodkinDamage = 30 - bodkin.world.get(bodkin.target, Vitality).hp;

    if (baselineDamage === 0 && bodkinDamage === 0) continue;
    compared = true;
    assert(
      bodkinDamage >= baselineDamage,
      `bodkin arrows should not underperform baseline ammo into high DR (seed=${seed}, baseline=${baselineDamage}, bodkin=${bodkinDamage})`,
    );
    if (bodkinDamage > baselineDamage) sawImprovement = true;
  }
  assert(compared, "expected at least one deterministic seed with a landed ranged hit");
  assert(sawImprovement, "expected at least one deterministic seed where bodkin arrows improve damage");
});

Deno.test("ranged: blunt-head arrows can apply stun and emit proc:stunned", () => {
  let sawProc = false;
  let sawNoProc = false;

  for (let seed = 1; seed <= 128; seed++) {
    const events = [];
    const blunt = setup({
      seed,
      targetHp: 30,
      ammoSubtype: 'blunt',
      ammoIdentity: 'ammo_blunt_arrows',
      ammoName: 'Blunt-Head Arrows',
    });
    trackEvents(blunt.world, events);
    blunt.world.set(blunt.archer, Equipment, {
      ranged: blunt.bowId,
      ammo: blunt.ammoId,
      accuracyDerived: 8,
      damagePowerDerived: 4,
    });
    blunt.world.add(blunt.target, ActiveEffects, { effects: [] });
    blunt.world.add(blunt.archer, RangedAttackIntent, { targetId: blunt.target, toX: 5, toY: 0 });
    rangedAttackSystem(blunt.world);

    const ae = blunt.world.get(blunt.target, ActiveEffects);
    const hasStun = !!(ae && Array.isArray(ae.effects) && ae.effects.some((e) => e.key === 'stun'));
    if (hasStun) {
      sawProc = true;
      assert(events.some((e) => e._event === 'proc:stunned'), 'stun proc should emit proc:stunned');
    } else {
      sawNoProc = true;
    }
    if (sawProc && sawNoProc) break;
  }

  assert(sawProc, 'expected at least one deterministic seed with blunt-head stun proc');
  assert(sawNoProc, 'expected at least one deterministic seed without blunt-head stun proc');
});

Deno.test("ranged: blunt-head arrows resolve as blunt damage against skeleton resistance profiles", () => {
  let compared = false;
  let sawImprovement = false;

  for (let seed = 1; seed <= 96; seed++) {
    const baseline = setup({ seed, targetHp: 30 });
    baseline.world.set(baseline.archer, Equipment, {
      ranged: baseline.bowId,
      ammo: baseline.ammoId,
      accuracyDerived: 8,
      damagePowerDerived: 4,
    });
    baseline.world.add(baseline.target, Resistances, {
      kinetic: { DR: 4, bluntMult: 1.5, slashMult: 0.7, pierceMult: 0.5 },
    });
    baseline.world.add(baseline.archer, RangedAttackIntent, { targetId: baseline.target, toX: 5, toY: 0 });
    rangedAttackSystem(baseline.world);
    const baselineDamage = 30 - baseline.world.get(baseline.target, Vitality).hp;

    const blunt = setup({
      seed,
      targetHp: 30,
      ammoSubtype: 'blunt',
      ammoIdentity: 'ammo_blunt_arrows',
      ammoName: 'Blunt-Head Arrows',
    });
    blunt.world.set(blunt.archer, Equipment, {
      ranged: blunt.bowId,
      ammo: blunt.ammoId,
      accuracyDerived: 8,
      damagePowerDerived: 4,
    });
    blunt.world.add(blunt.target, Resistances, {
      kinetic: { DR: 4, bluntMult: 1.5, slashMult: 0.7, pierceMult: 0.5 },
    });
    blunt.world.add(blunt.archer, RangedAttackIntent, { targetId: blunt.target, toX: 5, toY: 0 });
    rangedAttackSystem(blunt.world);
    const bluntDamage = 30 - blunt.world.get(blunt.target, Vitality).hp;

    if (baselineDamage === 0 && bluntDamage === 0) continue;
    compared = true;
    assert(
      bluntDamage >= baselineDamage,
      `blunt-head arrows should not underperform baseline arrows vs skeleton profile (seed=${seed}, baseline=${baselineDamage}, blunt=${bluntDamage})`,
    );
    if (bluntDamage > baselineDamage) sawImprovement = true;
  }

  assert(compared, "expected at least one deterministic seed with a landed ranged hit");
  assert(sawImprovement, "expected at least one deterministic seed where blunt-head arrows improve damage vs skeleton profile");
});

Deno.test("ranged: blunt-head arrows travel slower than plain arrows", () => {
  const baselineEvents = [];
  const baseline = setup({ seed: 42, targetHp: 30, tx: 5, ty: 0 });
  trackEvents(baseline.world, baselineEvents);
  baseline.world.set(baseline.archer, Equipment, {
    ranged: baseline.bowId,
    ammo: baseline.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
  });
  baseline.world.add(baseline.archer, RangedAttackIntent, { targetId: baseline.target, toX: 5, toY: 0 });
  rangedAttackSystem(baseline.world);

  const bluntEvents = [];
  const blunt = setup({
    seed: 42,
    targetHp: 30,
    tx: 5,
    ty: 0,
    ammoSubtype: 'blunt',
    ammoIdentity: 'ammo_blunt_arrows',
    ammoName: 'Blunt-Head Arrows',
  });
  trackEvents(blunt.world, bluntEvents);
  blunt.world.set(blunt.archer, Equipment, {
    ranged: blunt.bowId,
    ammo: blunt.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
  });
  blunt.world.add(blunt.archer, RangedAttackIntent, { targetId: blunt.target, toX: 5, toY: 0 });
  rangedAttackSystem(blunt.world);

  const baselineDamaged = baselineEvents.find((e) => e._event === 'damaged');
  const bluntDamaged = bluntEvents.find((e) => e._event === 'damaged');
  const baselineDelay = Number(baselineDamaged?.projectileDelay || 0);
  const bluntDelay = Number(bluntDamaged?.projectileDelay || 0);
  assert(baselineDelay > 0, `baseline projectile delay should be positive, got ${baselineDelay}`);
  assert(bluntDelay > baselineDelay, `blunt arrows should have longer projectile delay (baseline=${baselineDelay}, blunt=${bluntDelay})`);
});

Deno.test("ranged: piercing arrows travel faster than plain arrows", () => {
  const baselineEvents = [];
  const baseline = setup({ seed: 42, targetHp: 30, tx: 5, ty: 0 });
  trackEvents(baseline.world, baselineEvents);
  baseline.world.set(baseline.archer, Equipment, {
    ranged: baseline.bowId,
    ammo: baseline.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
  });
  baseline.world.add(baseline.archer, RangedAttackIntent, { targetId: baseline.target, toX: 5, toY: 0 });
  rangedAttackSystem(baseline.world);

  const piercingEvents = [];
  const piercing = setup({
    seed: 42,
    targetHp: 30,
    tx: 5,
    ty: 0,
    ammoSubtype: 'piercing',
    ammoIdentity: 'ammo_piercing_arrows',
    ammoName: 'Piercing Arrows',
  });
  trackEvents(piercing.world, piercingEvents);
  piercing.world.set(piercing.archer, Equipment, {
    ranged: piercing.bowId,
    ammo: piercing.ammoId,
    accuracyDerived: 8,
    damagePowerDerived: 4,
  });
  piercing.world.add(piercing.archer, RangedAttackIntent, { targetId: piercing.target, toX: 5, toY: 0 });
  rangedAttackSystem(piercing.world);

  const baselineDamaged = baselineEvents.find((e) => e._event === 'damaged');
  const piercingDamaged = piercingEvents.find((e) => e._event === 'damaged');
  const baselineDelay = Number(baselineDamaged?.projectileDelay || 0);
  const piercingDelay = Number(piercingDamaged?.projectileDelay || 0);
  assert(baselineDelay > 0, `baseline projectile delay should be positive, got ${baselineDelay}`);
  assert(piercingDelay < baselineDelay, `piercing arrows should have shorter projectile delay (baseline=${baselineDelay}, piercing=${piercingDelay})`);
});

Deno.test("ranged: miss emits directional missTo with forward overshoot", () => {
  const events = [];
  const { world, archer, target } = setup({ seed: 0x51aa, ax: 2, ay: 2, tx: 7, ty: 2 });
  trackEvents(world, events);

  world.mutate(archer, Equipment, (eq) => {
    eq.accuracyDerived = 0;
    eq.damagePowerDerived = 0;
  });
  world.mutate(target, Equipment, (eq) => {
    eq.evadeDerived = 200;
  });

  world.add(archer, RangedAttackIntent, { targetId: target, toX: 7, toY: 2 });
  rangedAttackSystem(world);

  const shot = events.find((e) => e._event === "ranged:shot");
  assert(shot, "expected ranged:shot event");
  assertEquals(shot.hit, false);
  assert(Number.isFinite(shot.from?.x) && Number.isFinite(shot.from?.y), "miss shot should include from");
  assert(Number.isFinite(shot.to?.x) && Number.isFinite(shot.to?.y), "miss shot should include to");
  assert(Number.isFinite(shot.missTo?.x) && Number.isFinite(shot.missTo?.y), "miss shot should include missTo");

  const from = shot.from;
  const to = shot.to;
  const missTo = shot.missTo;
  const vx = Number(to.x) - Number(from.x);
  const vy = Number(to.y) - Number(from.y);
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const forward = ((Number(missTo.x) - Number(from.x)) * ux) + ((Number(missTo.y) - Number(from.y)) * uy);
  assert(forward > (len * 1.1), `missTo should overshoot forward (forward=${forward}, len=${len})`);
});

Deno.test("ranged: deterministic miss ray can hit hostile behind the missed target", () => {
  let validated = false;
  for (let seed = 1; seed <= 1024; seed++) {
    const events = [];
    const { world, archer, target } = setup({
      seed,
      ax: 2,
      ay: 2,
      tx: 7,
      ty: 2,
      targetHp: 20,
    });
    trackEvents(world, events);

    world.mutate(archer, Equipment, (eq) => {
      eq.accuracyDerived = 0;
      eq.damagePowerDerived = 4;
    });
    world.mutate(target, Equipment, (eq) => {
      eq.evadeDerived = 200; // force miss on intended target
    });

    const behind = world.create();
    world.add(behind, Position, { x: 9, y: 2 });
    world.add(behind, Vitality, { maxHp: 20, hp: 20 });
    world.add(behind, Equipment, { evadeDerived: 0 });
    world.add(behind, Faction, { key: "enemy" });

    world.add(archer, RangedAttackIntent, { targetId: target, toX: 7, toY: 2 });
    rangedAttackSystem(world);

    const shot = events.find((e) => e._event === "ranged:shot");
    if (!shot || shot.hit !== false) continue;
    const behindHit = events.find((e) => e._event === "ranged:miss-behind-hit" && (e.target | 0) === behind);
    if (!behindHit) continue;

    const intendedHp = world.get(target, Vitality)?.hp || 0;
    const behindHp = world.get(behind, Vitality)?.hp || 0;
    assertEquals(intendedHp, 20, "intended target should remain unharmed on miss");
    assert(behindHp < 20, "hostile behind target should take stray miss-ray damage");
    validated = true;
    break;
  }
  assert(validated, "expected at least one deterministic seed where miss ray hits a hostile behind target");
});

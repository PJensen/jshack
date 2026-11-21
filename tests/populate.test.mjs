import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { createRng } from '../src/lib/ecs-js/rng.js';
import { World } from '../src/lib/ecs-js/index.js';
import { generateChunk } from '../src/rules/environment/dungeon/chunk.js';
import { populateChunk, materializeSpawn } from '../src/rules/environment/dungeon/populate.js';
import { pickMonster, pickItem, pickSpawner, pickSpecificSpawner } from '../src/rules/environment/dungeon/tables.js';
import { getMonstersByTier, getMonster } from '../src/rules/data/monsters.js';
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_STAIR_DOWN, TILE_STAIR_UP } from '../src/rules/environment/dungeon/constants.js';
import { Position } from '../src/rules/components/Position.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { ItemInfo } from '../src/rules/components/ItemInfo.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { Equipment } from '../src/rules/components/Equipment.js';
import { MonsterSpawner } from '../src/rules/components/MonsterSpawner.js';
import { Player } from '../src/rules/components/Player.js';
import { Collider } from '../src/rules/components/Collider.js';
import { Interactable } from '../src/rules/components/Interactable.js';
import { Polymorph } from '../src/rules/components/Polymorph.js';
import { buildWorldView } from '../src/bridge/schema/worldView.js';
import { buildPalette } from '../src/display/palette/index.js';
import { clearAll as clearTileMap } from '../src/rules/environment/dungeon/tileMap.js';
import { clearExplored } from '../src/rules/environment/dungeon/exploredMap.js';
import { getCatalogItem } from '../src/rules/data/itemCatalog.js';
import { inventoryItems } from '../src/rules/utils/inventoryFacade.js';

Deno.test("pickMonster returns valid params", () => {
  const rng = createRng(42);
  for (const depth of [1, 5, 10, 20]) {
    const m = pickMonster(rng, depth);
    assert(typeof m.name === 'string' && m.name.length > 0, 'has name');
    assert(typeof m.identity === 'string', 'has identity');
    assert(m.maxHp > 0, 'has positive HP');
    assert(m.faction === 'enemy', 'is enemy');
  }
});

Deno.test("materializeSpawn equips humanoid monster ranged loadout", () => {
  const world = new World({ seed: 42 });
  const archerDef = getMonster('goblin_archer');
  const id = materializeSpawn(world, {
    x: 5,
    y: 5,
    kind: 'monster',
    params: {
      name: archerDef.name,
      identity: archerDef.id,
      maxHp: archerDef.baseHp,
      faction: 'enemy',
      equipment: { ranged: 'bow_short', ammo: 'arrows' },
    },
  });

  const eq = world.get(id, Equipment);
  assert(eq, 'monster should have equipment component');
  assert(eq.ranged !== null, 'humanoid archer should receive ranged weapon');
  assert(eq.ammo !== null, 'humanoid archer should receive ammo');
});

Deno.test("materializeSpawn does not equip non-humanoid monster loadout", () => {
  const world = new World({ seed: 42 });
  const batDef = getMonster('bat');
  const id = materializeSpawn(world, {
    x: 6,
    y: 6,
    kind: 'monster',
    params: {
      name: batDef.name,
      identity: batDef.id,
      maxHp: batDef.baseHp,
      faction: 'enemy',
      equipment: { ranged: 'bow_short', ammo: 'arrows' },
    },
  });

  const eq = world.get(id, Equipment);
  assert(eq, 'monster should have equipment component');
  assertEquals(eq.ranged, null, 'non-humanoid should not receive ranged weapon');
  assertEquals(eq.ammo, null, 'non-humanoid should not receive ammo');
});

Deno.test("materializeSpawn equips authored non-humanoid monster ranged loadout", () => {
  const world = new World({ seed: 42 });
  const archerDef = getMonster('skeleton_archer');
  const id = materializeSpawn(world, {
    x: 8,
    y: 8,
    kind: 'monster',
    params: {
      name: archerDef.name,
      identity: archerDef.id,
      maxHp: archerDef.baseHp,
      faction: 'enemy',
      equipped: Array.isArray(archerDef.equipped) ? archerDef.equipped.slice() : [],
    },
  });

  const eq = world.get(id, Equipment);
  assert(eq, 'monster should have equipment component');
  assert(eq.ranged !== null, 'authored ranged kit should equip on non-humanoid archer');
  assert(eq.ammo !== null, 'authored ammo kit should equip on non-humanoid archer');
});

Deno.test("materializeSpawn goblin wielding picks authored shiv variants", () => {
  const seen = new Set();
  const goblinDef = getMonster("goblin");
  assert(goblinDef, "goblin definition should exist");

  for (let seed = 1; seed <= 80; seed++) {
    const world = new World({ seed });
    const id = materializeSpawn(world, {
      x: 5,
      y: 5,
      kind: "monster",
      params: {
        name: goblinDef.name,
        identity: goblinDef.id,
        maxHp: goblinDef.baseHp,
        faction: "enemy",
        wielding: goblinDef.wielding,
      },
    });

    const eq = world.get(id, Equipment);
    assert(eq, "goblin should have equipment");
    assert(eq.weapon > 0, "goblin should wield a weapon");
    assertEquals(eq.armor, null, "goblin should not auto-equip armor");

    const ni = world.get(eq.weapon, NamedIdentity);
    const weaponIdentity = String(ni?.identity || "");
    assert(weaponIdentity === "goblin_shiv" || weaponIdentity === "goblin_jagged_shiv");
    seen.add(weaponIdentity);
  }

  assert(seen.has("goblin_shiv"), "expected plain shiv variant");
  assert(seen.has("goblin_jagged_shiv"), "expected jagged shiv variant");
});

Deno.test("materializeSpawn equipped duplicates roll one item per slot", () => {
  const seenArmor = new Set();

  for (let seed = 1; seed <= 80; seed++) {
    const world = new World({ seed });
    const id = materializeSpawn(world, {
      x: 6,
      y: 6,
      kind: "monster",
      params: {
        name: "Goblin Tester",
        identity: "goblin",
        maxHp: 8,
        faction: "enemy",
        equipped: [
          { slot: "armor", itemId: "leather_armor" },
          { slot: "armor", itemId: "chain_armor" },
        ],
      },
    });

    const eq = world.get(id, Equipment);
    assert(eq, "monster should have equipment");
    assert(eq.armor > 0, "one armor should be equipped");
    const armorIdentity = String(world.get(eq.armor, NamedIdentity)?.identity || "");
    seenArmor.add(armorIdentity);
  }

  assert(seenArmor.has("leather_armor"), "should sometimes pick leather armor");
  assert(seenArmor.has("chain_armor"), "should sometimes pick chain armor");
});

Deno.test("pickMonster scales HP with depth", () => {
  const rng1 = createRng(42);
  const rng2 = createRng(42);
  const m1 = pickMonster(rng1, 1);
  // Use same seed to get same monster type
  const m20 = pickMonster(rng2, 20);
  // Same monster template but different HP due to depth
  assert(m20.maxHp > m1.maxHp, `deeper monsters have more HP: ${m1.maxHp} vs ${m20.maxHp}`);
});

Deno.test("pickSpawner uses tier pool on shallow depth", () => {
  const rng = createRng(42);
  const sp = pickSpawner(rng, 1);
  // Spawners at depth 1 use the tier 0 pool — same as pickMonster
  const tier0 = getMonstersByTier(0);
  const tier0Ids = new Set(tier0.map(m => m.id));
  assert(tier0Ids.has(sp.monsterType.identity), `expected tier 0 monster, got ${sp.monsterType.identity}`);
  assert(sp.monsterType.identity !== 'kobold_shaman', 'kobold shaman must not be selected for spawners');
});

Deno.test("pickSpecificSpawner excludes kobold shaman", () => {
  const rng = createRng(42);
  const sp = pickSpecificSpawner(rng, 'kobold_shaman', 1);
  assertEquals(sp, null);
});

Deno.test("pickSpawner uses nesting whitelist", () => {
  const rng = createRng(1337);
  const allowed = new Set([
    'rat',
    'bat',
    'cave_spider',
    'spider',
    'cave_snake',
    'snake',
    // Rare upgrades from whitelisted bases in pickMonster.
    'pit_viper',
    'cave_bear',
    'dragon_whelp',
  ]);

  for (let i = 0; i < 200; i++) {
    const sp = pickSpawner(rng, 1);
    const identity = sp.monsterType.identity;
    assert(allowed.has(identity), `spawner monster must be whitelisted nesting type, got ${identity}`);
  }
});

Deno.test("pickItem returns valid kinds", () => {
  const rng = createRng(42);
  const validKinds = new Set([
    'gold', 'potion', 'equipment', 'scroll', 'book',
    'arrows', 'fire_arrows', 'piercing_arrows', 'bodkin_arrows', 'blunt_arrows',
  ]);
  for (let i = 0; i < 20; i++) {
    const item = pickItem(rng, 5);
    assert(validKinds.has(item.kind), `valid kind: ${item.kind}`);
  }
});

Deno.test("populateChunk generates spawns in rooms", () => {
  const chunk = generateChunk(42, 1, 0, 0);
  const rng = createRng(123);
  const floorPlan = { depth: 1, difficultyMult: 1.0 };
  const spawns = populateChunk(chunk, floorPlan, rng);

  assert(Array.isArray(spawns), 'returns array');
  // With default density, a 32x32 chunk should generate some spawns
  assert(spawns.length > 0, `generated ${spawns.length} spawns`);

  for (const sp of spawns) {
    assert(Number.isInteger(sp.x) && Number.isInteger(sp.y), `spawn at integers (${sp.x},${sp.y})`);
    assert(typeof sp.kind === 'string', 'has kind');
  }
});

Deno.test("populateChunk uses arcade-forward room density", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
    }
  }

  const chunk = {
    chunkX: 0,
    chunkY: 0,
    tiles,
    rooms: [{ x: 2, y: 2, w: 12, h: 12 }],
    doors: [],
  };
  const rng = {
    next: () => 0.99,
    int: (_min, max) => max,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, { depth: 1, difficultyMult: 1.0 }, rng);
  const monsterCount = spawns.filter((sp) => sp.kind === "monster").length;
  const floorLootCount = spawns.filter((sp) => (
    sp.kind === "gold"
    || sp.kind === "potion"
    || sp.kind === "equipment"
    || sp.kind === "scroll"
    || sp.kind === "book"
    || sp.kind.endsWith("_arrows")
    || sp.kind === "arrows"
  )).length;

  assert(monsterCount >= 6, `expected at least 6 monsters in a large room, got ${monsterCount}`);
  assert(floorLootCount >= 4, `expected at least 4 visible floor loot spawns, got ${floorLootCount}`);
});

Deno.test("populateChunk keeps wall torches sparse across rooms", () => {
  const chunk = generateChunk(1337, 1, 0, 0);
  const rng = createRng(2337);
  const floorPlan = { depth: 1, difficultyMult: 1.0 };
  const spawns = populateChunk(chunk, floorPlan, rng);

  const roomCount = chunk.rooms.length;
  const torchCount = spawns.filter((s) => s.kind === "torch").length;
  const cap = Math.ceil(roomCount * 0.5);
  assert(
    torchCount <= cap,
    `expected sparse torches (<= ${cap} for ${roomCount} rooms), got ${torchCount}`,
  );
});

Deno.test("populateChunk scales monster count with depth", () => {
  const chunk = generateChunk(42, 1, 0, 0);
  // Use independent seeds so conditional rng branches in one run don't corrupt the other.
  // Sum across multiple seeds to smooth out per-seed variance.
  let total1 = 0, total5 = 0;
  for (let s = 1; s <= 20; s++) {
    total1 += populateChunk(chunk, { depth: 1, difficultyMult: 1.0 }, createRng(s * 7)).filter(sp => sp.kind === 'monster').length;
    total5 += populateChunk(chunk, { depth: 5, difficultyMult: 1.6 }, createRng(s * 7 + 1)).filter(sp => sp.kind === 'monster').length;
  }
  assert(total5 >= total1, `depth 5 total (${total5}) >= depth 1 total (${total1}) across 20 seeds`);
});

Deno.test("populateChunk can generate a shallow spawner", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 2; y < 12; y++) {
    for (let x = 2; x < 12; x++) {
      tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
    }
  }

  const chunk = {
    chunkX: 1,
    chunkY: 1,
    tiles,
    rooms: [{ x: CHUNK_SIZE + 2, y: CHUNK_SIZE + 2, w: 10, h: 10 }],
    doors: [],
  };
  const floorPlan = { depth: 1, difficultyMult: 1.0 };
  const rng = {
    next: () => 0, // Always pass chance gates.
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const spawners = spawns.filter((s) => s.kind === 'spawner');
  assert(spawners.length > 0, 'expected at least one spawner');
  const tier0Ids = new Set(getMonstersByTier(0).map((monster) => monster.id));
  assert(tier0Ids.has(spawners[0].params?.monsterType?.identity), 'expected shallow spawner monster to come from the tier-0 pool');
});

Deno.test("populateChunk shallow spawners draw from tier pool", () => {
  const seen = new Set();
  const tier0 = getMonstersByTier(0);
  const tier0Ids = new Set(tier0.map(m => m.id));
  // Rare upgrades are valid at T0
  if (getMonster('pit_viper')) tier0Ids.add('pit_viper');
  if (getMonster('cave_bear')) tier0Ids.add('cave_bear');
  if (getMonster('dragon_whelp')) tier0Ids.add('dragon_whelp');
  for (let seed = 1; seed <= 200; seed++) {
    const chunk = generateChunk(seed, 1, 0, 0);
    const rng = createRng(seed * 1337);
    const spawns = populateChunk(chunk, { depth: 1, difficultyMult: 1.0 }, rng);
    for (const sp of spawns) {
      if (sp.kind !== 'spawner') continue;
      const identity = sp.params?.monsterType?.identity;
      assert(tier0Ids.has(identity), `spawner monster should be tier 0, got ${identity}`);
      seen.add(identity);
    }
  }
  assert(seen.size > 1, 'expected spawners to vary across seeds');
});

Deno.test("pickMonster can rare-upgrade a bat into a dragon whelp", () => {
  const rng = {
    choice(arr) {
      return arr.find((def) => def.id === "bat") || arr[0];
    },
    next() {
      return 0;
    },
  };

  const picked = pickMonster(rng, 1);
  assertEquals(picked.identity, "dragon_whelp");
});

Deno.test("spawner wiring: kind -> identity -> worldView -> palette", () => {
  // Keep singleton maps from prior tests from affecting visibility assertions.
  clearTileMap();
  clearExplored();

  const world = new World({ seed: 42 });

  const playerId = world.create();
  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 0, y: 0 });

  const spawnerId = materializeSpawn(world, {
    x: 1,
    y: 0,
    kind: 'spawner',
    params: {
      monsterType: {
        name: 'Rat',
        identity: 'rat',
        maxHp: 5,
        faction: 'enemy',
        accuracyDerived: 0,
        damagePowerDerived: 0,
        evadeDerived: 0,
        naturalDamageDice: '1d3',
        sizeClass: 'S',
        massKg: 2,
        resistances: { kinetic: { DR: 0 } },
        speed: 1,
      },
      packSize: 3,
      depth: 1,
    },
  });

  assert(spawnerId != null, 'spawner entity should be created');
  const ni = world.get(spawnerId, NamedIdentity);
  assert(ni?.identity === 'spawner', `expected identity 'spawner', got ${ni?.identity}`);

  const spawner = world.get(spawnerId, MonsterSpawner);
  assert(spawner && spawner.spawnParams?.identity === 'rat', 'spawner should keep monster spawn identity');

  const view = buildWorldView(world);
  const viewRec = view.entities.find((e) => e.id === spawnerId);
  assert(viewRec?.kind === 'spawner', `expected worldView kind 'spawner', got ${viewRec?.kind}`);

  const palette = buildPalette();
  const spawnerLook = palette.spawner;
  assert(
    spawnerLook && typeof spawnerLook.glyph === 'string' && spawnerLook.glyph.length > 0,
    'palette should include a spawner glyph'
  );
});

Deno.test("materializeSpawn creates monster entity", () => {
  const world = new World({ seed: 42 });
  const id = materializeSpawn(world, {
    x: 5, y: 10, kind: 'monster',
    params: { name: 'Goblin', identity: 'monster', maxHp: 8, faction: 'enemy' },
  });
  assert(id != null, 'created entity');
  const pos = world.get(id, Position);
  assert(pos.x === 5 && pos.y === 10, 'correct position');
  const vit = world.get(id, Vitality);
  assert(vit && vit.hp > 0, 'has HP');
});

Deno.test("materializeSpawn resolves authored monsterId shorthand", () => {
  const world = new World({ seed: 42 });
  const id = materializeSpawn(world, {
    x: 5, y: 10, kind: "monster",
    params: { monsterId: "bandit_archer", depth: 1 },
  });

  assert(id != null, "created entity");
  assertEquals(world.get(id, NamedIdentity)?.identity, "bandit_archer");
  assert(world.get(id, Vitality)?.hp > 0, "resolved monster should have HP");
  assertEquals(world.get(id, Position), { x: 5, y: 10 });
});

Deno.test("materializeSpawn creates gold entity", () => {
  const world = new World({ seed: 42 });
  const id = materializeSpawn(world, {
    x: 3, y: 7, kind: 'gold',
    params: { kind: 'gold', count: 25 },
  });
  assert(id != null, 'created entity');
  const pos = world.get(id, Position);
  assert(pos.x === 3 && pos.y === 7, 'correct position');
  const info = world.get(id, ItemInfo);
  assert(info.count === 25, `gold count: ${info.count}`);
});

Deno.test("materializeSpawn creates potion entity", () => {
  const world = new World({ seed: 42 });
  const id = materializeSpawn(world, {
    x: 1, y: 2, kind: 'potion',
    params: { kind: 'potion' },
  });
  assert(id != null, 'created entity');
  const pos = world.get(id, Position);
  assert(pos.x === 1 && pos.y === 2, 'correct position');
});

Deno.test("materializeSpawn creates equipment entity", () => {
  const world = new World({ seed: 42 });
  const id = materializeSpawn(world, {
    x: 4, y: 6, kind: 'equipment',
    params: { kind: 'equipment', equipId: 'sword_plain' },
  });
  assert(id != null, 'created entity');
  const pos = world.get(id, Position);
  assert(pos.x === 4 && pos.y === 6, 'correct position');
  const info = world.get(id, ItemInfo);
  assert(info.type === 'equip', 'is equipment');
});

function countRoomEntrances(room, chunk) {
  const rx = room.x - chunk.chunkX * CHUNK_SIZE;
  const ry = room.y - chunk.chunkY * CHUNK_SIZE;
  const rw = room.w;
  const rh = room.h;
  const tiles = chunk.tiles;
  function getTile(x, y) {
    if (x < 0 || y < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE) return -1;
    return tiles[y * CHUNK_SIZE + x];
  }
  function isPassable(tile) {
    return tile === TILE_FLOOR || tile === TILE_DOOR || tile === TILE_STAIR_DOWN || tile === TILE_STAIR_UP;
  }
  let entrances = 0;
  let prev = false;
  for (let y = ry; y < ry + rh; y++) {
    const open = isPassable(getTile(rx - 1, y));
    if (open && !prev) entrances++;
    prev = open;
  }
  prev = false;
  for (let y = ry; y < ry + rh; y++) {
    const open = isPassable(getTile(rx + rw, y));
    if (open && !prev) entrances++;
    prev = open;
  }
  prev = false;
  for (let x = rx; x < rx + rw; x++) {
    const open = isPassable(getTile(x, ry - 1));
    if (open && !prev) entrances++;
    prev = open;
  }
  prev = false;
  for (let x = rx; x < rx + rw; x++) {
    const open = isPassable(getTile(x, ry + rh));
    if (open && !prev) entrances++;
    prev = open;
  }
  return entrances;
}

function countRoomOpeningTiles(room, chunk) {
  const rx = room.x - chunk.chunkX * CHUNK_SIZE;
  const ry = room.y - chunk.chunkY * CHUNK_SIZE;
  const rw = room.w;
  const rh = room.h;
  const tiles = chunk.tiles;
  function getTile(x, y) {
    if (x < 0 || y < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE) return -1;
    return tiles[y * CHUNK_SIZE + x];
  }
  function isPassable(tile) {
    return tile === TILE_FLOOR || tile === TILE_DOOR || tile === TILE_STAIR_DOWN || tile === TILE_STAIR_UP;
  }
  function roomHas(x, y) {
    return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
  }

  let openings = 0;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const isPerimeter = (x === rx || x === rx + rw - 1 || y === ry || y === ry + rh - 1);
      if (!isPerimeter) continue;
      if (!isPassable(getTile(x, y))) continue;
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      let opensOut = false;
      for (const [nx, ny] of neighbors) {
        if (roomHas(nx, ny)) continue;
        if (isPassable(getTile(nx, ny))) {
          opensOut = true;
          break;
        }
      }
      if (opensOut) openings++;
    }
  }

  return openings;
}

Deno.test("shopkeeper spawns only in small dead-end rooms with exactly one opening", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const chunk = generateChunk(seed, 1, 0, 0);
    const rng = createRng(seed * 1337);
    const floorPlan = { depth: 1, difficultyMult: 1.0 };
    const spawns = populateChunk(chunk, floorPlan, rng);

    const shopkeepers = spawns.filter(s => s.kind === 'shopkeeper');
    for (const sk of shopkeepers) {
      const room = sk.params?.room;
      assert(room, "shopkeeper spawn should include room metadata");
      const entrances = countRoomEntrances(room, chunk);
      assert(entrances === 1, `shop room must have exactly one perimeter entrance, got ${entrances}`);
      const openings = countRoomOpeningTiles(room, chunk);
      assert(openings === 1, `shop room must have exactly one opening tile, got ${openings}`);
      assert(room.w <= 6 && room.h <= 6, `shop room must be small (<=6x6), got ${room.w}x${room.h}`);
    }
  }
});

Deno.test("3x3 dead-end rooms are not eligible shop rooms", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);

  // Tiny room with only one interior tile.
  for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  // One opening from the tiny room.
  tiles[3 * CHUNK_SIZE + 5] = TILE_FLOOR;

  const chunk = {
    chunkX: 1,
    chunkY: 1,
    tiles,
    rooms: [{ x: CHUNK_SIZE + 2, y: CHUNK_SIZE + 2, w: 3, h: 3 }],
    doors: [],
  };
  const floorPlan = { depth: 2, difficultyMult: 1.0, profile: { shopChance: 1.0 } };
  const rng = {
    next: () => 0,
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const shopkeeper = spawns.find((s) => s.kind === "shopkeeper");
  assertEquals(shopkeeper, undefined, "tiny 3x3 room should never be selected as a shop room");
});

Deno.test("origin chunk spawn room is never selected as a shop room", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  // Room 0 (spawn room)
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  // Room 1 (eligible shop room)
  for (let y = 20; y < 26; y++) for (let x = 20; x < 26; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  // Exactly one entrance for each room
  tiles[2 * CHUNK_SIZE + 6] = TILE_FLOOR;   // east opening from room 0
  tiles[22 * CHUNK_SIZE + 19] = TILE_FLOOR; // west opening for room 1

  const chunk = {
    chunkX: 0,
    chunkY: 0,
    tiles,
    rooms: [
      // This mirrors the starting room convention (rooms[0] in origin chunk)
      { x: 0, y: 0, w: 6, h: 6 },
      { x: 20, y: 20, w: 6, h: 6 },
    ],
    doors: [],
  };
  const floorPlan = { depth: 1, difficultyMult: 1.0 };
  const rng = {
    next: () => 0, // always pass chance gates
    int: (min) => min, // deterministic pick first eligible
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const shopkeeper = spawns.find((s) => s.kind === 'shopkeeper');
  assert(shopkeeper, 'expected a shopkeeper to spawn for this deterministic setup');
  const room = shopkeeper.params?.room;
  assert(room, 'shopkeeper must include room metadata');
  assert(
    !(room.x === chunk.rooms[0].x && room.y === chunk.rooms[0].y && room.w === chunk.rooms[0].w && room.h === chunk.rooms[0].h),
    'shopkeeper must not be placed in origin chunk spawn room',
  );
});

Deno.test("shop rooms never keep normal monster/spawner spawns, but can host a mimic", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  // Room 0 (origin spawn room; must be excluded from shop selection).
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[3 * CHUNK_SIZE + 7] = TILE_FLOOR;
  // Room 1 (eligible shop room).
  for (let y = 14; y < 20; y++) for (let x = 14; x < 20; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[17 * CHUNK_SIZE + 13] = TILE_FLOOR;

  const chunk = {
    chunkX: 0,
    chunkY: 0,
    tiles,
    rooms: [
      { x: 1, y: 1, w: 6, h: 6 },
      { x: 14, y: 14, w: 6, h: 6 },
    ],
    doors: [],
  };
  const floorPlan = { depth: 3, difficultyMult: 1.2 };
  const rng = {
    next: () => 0, // force all chance-gates for deterministic coverage
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const shopkeeper = spawns.find((s) => s.kind === "shopkeeper");
  assert(shopkeeper, "expected a shopkeeper in deterministic shop test");
  const shopRoom = shopkeeper.params?.room;
  assert(shopRoom, "shopkeeper should include room metadata");

  const inShopRoom = (s) =>
    s.x >= shopRoom.x && s.x < shopRoom.x + shopRoom.w
    && s.y >= shopRoom.y && s.y < shopRoom.y + shopRoom.h;

  const normalHostiles = spawns.filter((s) => inShopRoom(s) && (s.kind === "monster" || s.kind === "spawner"));
  assert(normalHostiles.length === 0, "shop room must not contain normal monster/spawner spawns");

  const mimics = spawns.filter((s) => inShopRoom(s) && s.kind === "mimic");
  assert(mimics.length === 1, "shop room should allow a rare mimic spawn");
  const disguiseId = String(mimics[0].params?.disguiseIdentity || '');
  const disguiseDef = getCatalogItem(disguiseId);
  assert(disguiseDef, `shop mimic should disguise as a catalog item, got ${disguiseId || '(empty)'}`);
  const rarity = Number(disguiseDef.rarity || 1);
  const rarityName = String(disguiseDef.rarityName || '').toLowerCase();
  assert(
    rarity >= 2 || /rare|epic|legendary|magic/.test(rarityName),
    `shop mimic should prefer premium-looking items, got rarity=${rarity}, rarityName=${rarityName}`,
  );
});

Deno.test("shop rooms are scrubbed of dead-end feature clutter before shop layout", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  // Room 0 (origin spawn room; excluded from shop selection).
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[3 * CHUNK_SIZE + 7] = TILE_FLOOR;
  // Room 1 (eligible shop room).
  for (let y = 14; y < 20; y++) for (let x = 14; x < 20; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[17 * CHUNK_SIZE + 13] = TILE_FLOOR;

  const chunk = {
    chunkX: 0,
    chunkY: 0,
    tiles,
    rooms: [
      { x: 1, y: 1, w: 6, h: 6 },
      { x: 14, y: 14, w: 6, h: 6 },
    ],
    doors: [],
  };
  const floorPlan = { depth: 3, difficultyMult: 1.2 };
  const rng = {
    next: () => 0, // force feature placement before shop sanitation
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const shopkeeper = spawns.find((s) => s.kind === "shopkeeper");
  assert(shopkeeper, "expected a shopkeeper in deterministic shop test");
  const shopRoom = shopkeeper.params?.room;
  assert(shopRoom, "shopkeeper should include room metadata");

  const inShopRoom = (s) =>
    s.x >= shopRoom.x && s.x < shopRoom.x + shopRoom.w
    && s.y >= shopRoom.y && s.y < shopRoom.y + shopRoom.h;

  const forbiddenKinds = new Set([
    "fountain",
    "altar",
    "shrine",
    "sarcophagus",
    "statue",
    "pillar",
    "weapon_rack",
    "mushrooms",
    "torch",
    "urn",
  ]);
  const clutter = spawns.filter((s) => inShopRoom(s) && forbiddenKinds.has(s.kind));
  assertEquals(clutter.length, 0, "shop room should not keep dead-end room feature clutter");
});

Deno.test("shopkeeper, mimic, and shop items never overlap in shop room", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  // Room 0 (origin spawn room; excluded from shop selection).
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[3 * CHUNK_SIZE + 7] = TILE_FLOOR;
  // Room 1 (eligible shop room).
  for (let y = 14; y < 20; y++) for (let x = 14; x < 20; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[17 * CHUNK_SIZE + 13] = TILE_FLOOR;

  const chunk = {
    chunkX: 0,
    chunkY: 0,
    tiles,
    rooms: [
      { x: 1, y: 1, w: 6, h: 6 },
      { x: 14, y: 14, w: 6, h: 6 },
    ],
    doors: [],
  };
  const floorPlan = { depth: 3, difficultyMult: 1.2 };
  const rng = {
    next: () => 0,
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const shopkeeper = spawns.find((s) => s.kind === 'shopkeeper');
  assert(shopkeeper, 'expected a shopkeeper in deterministic shop setup');
  const shopRoom = shopkeeper.params?.room;
  assert(shopRoom, 'shopkeeper should include room metadata');

  const inShopRoom = (s) =>
    s.x >= shopRoom.x && s.x < shopRoom.x + shopRoom.w
    && s.y >= shopRoom.y && s.y < shopRoom.y + shopRoom.h;

  const shopItems = spawns.filter((s) => inShopRoom(s) && s.kind === 'shop_item');
  const mimics = spawns.filter((s) => inShopRoom(s) && s.kind === 'mimic');
  assert(shopItems.length > 0, 'shop should still place shop_item spawns');
  assert(mimics.length === 1, 'deterministic shop setup should include one mimic');

  const occupied = new Set();
  const mark = (s, label) => {
    const key = `${s.x},${s.y}`;
    assert(!occupied.has(key), `${label} overlaps on ${key}`);
    occupied.add(key);
  };

  mark(shopkeeper, 'shopkeeper');
  mark(mimics[0], 'mimic');
  for (const item of shopItems) mark(item, 'shop_item');
});

Deno.test("materializeSpawn supports mimic disguised as catalog item", () => {
  const world = new World({ seed: 2026 });
  const id = materializeSpawn(world, {
    x: 12,
    y: 9,
    kind: 'mimic',
    params: { depth: 4, disguiseIdentity: 'axe_heavy' },
  });

  assert(id > 0, 'mimic spawn should materialize an entity');
  const ni = world.get(id, NamedIdentity);
  assertEquals(ni?.identity, 'axe_heavy', 'mimic should use catalog disguise identity');
  const pos = world.get(id, Position);
  assertEquals(pos?.x, 12);
  assertEquals(pos?.y, 9);
  assert(world.has(id, Collider), 'mimic should remain solid while disguised');
  assert(world.has(id, Interactable), 'mimic disguise should be touch-interactable');
  assert(world.has(id, Polymorph), 'mimic disguise should carry polymorph reveal data');
});

Deno.test("dead-end rooms always receive reward content", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);

  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  for (let y = 14; y < 20; y++) for (let x = 14; x < 20; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;

  // One opening out of the spawn room and one opening out of the dead-end room.
  tiles[3 * CHUNK_SIZE + 7] = TILE_FLOOR;
  tiles[16 * CHUNK_SIZE + 13] = TILE_FLOOR;

  const chunk = {
    chunkX: 0,
    chunkY: 0,
    tiles,
    rooms: [
      { x: 1, y: 1, w: 6, h: 6 },
      { x: 14, y: 14, w: 6, h: 6 },
    ],
    doors: [],
  };
  const floorPlan = {
    depth: 4,
    difficultyMult: 1.2,
    profile: { doorFeatureRate: 0, shopChance: 0, featurePool: null, monsterFilter: null },
  };
  const rng = {
    next: () => 0.99,
    int: (min) => min,
    choice: (arr) => arr[arr.length - 1],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const deadEndRoom = chunk.rooms[1];
  const rewardKinds = new Set([
    'chest', 'gold', 'book', 'potion', 'equipment', 'scroll',
    'arrows', 'fire_arrows', 'piercing_arrows', 'bodkin_arrows', 'blunt_arrows',
  ]);
  const roomRewards = spawns.filter((spawn) =>
    spawn.x >= deadEndRoom.x && spawn.x < deadEndRoom.x + deadEndRoom.w
    && spawn.y >= deadEndRoom.y && spawn.y < deadEndRoom.y + deadEndRoom.h
    && rewardKinds.has(spawn.kind)
  );

  assert(roomRewards.length > 0, 'dead-end room should always contain a reward');
});

Deno.test("dead-end rooms can receive curated treasure content", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 10; y < 16; y++) for (let x = 10; x < 16; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[12 * CHUNK_SIZE + 9] = TILE_FLOOR; // one west entrance

  const room = { x: 10, y: 10, w: 6, h: 6 };
  room.x = CHUNK_SIZE + 10;
  const chunk = {
    chunkX: 1,
    chunkY: 0,
    tiles,
    rooms: [room],
    doors: [],
  };
  const floorPlan = { depth: 2, difficultyMult: 1.0, profile: { shopChance: 0, doorFeatureRate: 0 } };
  const rng = {
    next: () => 0,
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const chest = spawns.find((spawn) => spawn.kind === "chest");
  assert(chest, "expected a treasure chest in deterministic dead-end room");
  assert(
    chest.x >= room.x && chest.x < room.x + room.w && chest.y >= room.y && chest.y < room.y + room.h,
    "dead-end chest should be placed inside the terminal room",
  );
});

Deno.test("obliiette dead-end rooms place flayed man and hanging chains decorations", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 10; y < 16; y++) for (let x = 10; x < 16; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[12 * CHUNK_SIZE + 9] = TILE_FLOOR; // one west entrance

  const room = { x: CHUNK_SIZE + 10, y: 10, w: 6, h: 6 };
  const chunk = {
    chunkX: 1,
    chunkY: 0,
    tiles,
    rooms: [room],
    doors: [],
  };
  const floorPlan = {
    depth: 4,
    difficultyMult: 1.2,
    profile: { shopChance: 0, doorFeatureRate: 0, featurePool: null, monsterFilter: null },
  };
  const rng = {
    next: () => 0.67, // picks obliiette in DEAD_END_ROOM_THEMES
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const inRoom = (s) =>
    s.x >= room.x && s.x < room.x + room.w
    && s.y >= room.y && s.y < room.y + room.h;

  const flayed = spawns.filter((s) => inRoom(s) && s.kind === "flayed_man");
  const chains = spawns.filter((s) => inRoom(s) && s.kind === "hanging_chains");
  const shopkeepers = spawns.filter((s) => inRoom(s) && s.kind === "shopkeeper");

  assertEquals(flayed.length, 1, "obliiette should place one flayed man decoration");
  assert(chains.length >= 1, "obliiette should place hanging chains");
  assertEquals(shopkeepers.length, 0, "obliiette should not place shopkeepers");
});

Deno.test("kitchen dead-end rooms place cooking fire, ingredient chest, and pantry clutter", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 10; y < 18; y++) for (let x = 10; x < 18; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[13 * CHUNK_SIZE + 9] = TILE_FLOOR; // one west entrance

  const room = { x: CHUNK_SIZE + 10, y: 10, w: 8, h: 8 };
  const chunk = {
    chunkX: 1,
    chunkY: 0,
    tiles,
    rooms: [room],
    doors: [],
  };
  const floorPlan = {
    depth: 4,
    difficultyMult: 1.2,
    profile: { shopChance: 0, doorFeatureRate: 0, featurePool: null, monsterFilter: null },
  };
  const rng = {
    next: () => 0.72, // picks kitchen in DEAD_END_ROOM_THEMES
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const inRoom = (s) =>
    s.x >= room.x && s.x < room.x + room.w
    && s.y >= room.y && s.y < room.y + room.h;

  const fire = spawns.find((s) => inRoom(s) && s.kind === "cooking_fire");
  const chest = spawns.find((s) => inRoom(s) && s.kind === "chest");
  const pantry = spawns.filter((s) => inRoom(s) && s.kind === "catalog_item");
  const shopkeepers = spawns.filter((s) => inRoom(s) && s.kind === "shopkeeper");
  const chestDrops = new Set(chest?.params?.fixedDrops || []);
  const pantryIds = new Set(pantry.map((s) => String(s.params?.itemId || "")));
  const allKitchenIds = new Set([...chestDrops, ...pantryIds]);

  assert(fire, "kitchen should include a working cooking fire");
  assert(chest, "kitchen should include a chest");
  assert(pantry.length >= 2, "kitchen should include multiple pantry items");
  assert(!allKitchenIds.has("food_ration"), "kitchen should stock ingredients instead of ready-made rations");
  assert(!allKitchenIds.has("food_iron_ration"), "kitchen should not stock preserved rations");
  assert(chestDrops.has("food_flour"), "ingredient chest should include flour");
  assert(chestDrops.has("food_wild_herbs"), "ingredient chest should include herbs");
  assert(chestDrops.has("food_raw_fish"), "ingredient chest should include raw fish");
  assert(chestDrops.has("water_bucket"), "ingredient chest should include water");
  assert(chestDrops.has("fuel_firewood"), "ingredient chest should include fuel");
  assert(chestDrops.has("tool_kitchen_knife"), "ingredient chest should include a cooking tool");
  for (const itemId of allKitchenIds) {
    const def = getCatalogItem(itemId);
    const tags = Array.isArray(def?.tags) ? def.tags : [];
    if (itemId === "tool_kitchen_knife") {
      assert(tags.includes("cooking_tool"), "kitchen knife should be tagged as a cooking tool");
    } else {
      assert(tags.includes("cooking_ingredient"), `${itemId} should be tagged as a cooking ingredient`);
    }
  }
  assertEquals(shopkeepers.length, 0, "kitchen should not place shopkeepers");
});

Deno.test("materializeSpawn chest fixedDrops includes requested ration/food items", () => {
  const world = new World({ seed: 4242 });
  const chestId = materializeSpawn(world, {
    x: 11,
    y: 9,
    kind: "chest",
    params: {
      depth: 3,
      lootTable: "chest:basic",
      fixedDrops: ["food_ration", "food_iron_ration"],
    },
  });

  assert(chestId > 0, "chest should materialize");
  const itemIds = inventoryItems(world, chestId);
  const identities = new Set(itemIds.map((id) => String(world.get(id, NamedIdentity)?.identity || "")));
  assert(identities.has("food_ration"), "fixedDrops should include food_ration");
  assert(identities.has("food_iron_ration"), "fixedDrops should include food_iron_ration");
});

Deno.test("materializeSpawn chest chooses from authored lootTableChoices", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const world = new World({ seed });
    const chestId = materializeSpawn(world, {
      x: 11,
      y: 9,
      kind: "chest",
      params: {
        depth: 3,
        lootTableChoices: ["chest:epic", "chest:legendary"],
      },
    });

    const identity = String(world.get(chestId, NamedIdentity)?.identity || "");
    assert(
      identity === "epic_chest" || identity === "legendary_chest",
      `expected epic or legendary chest identity, got ${identity}`,
    );
  }
});

Deno.test("dead-end rooms with stairs are excluded from dead-end themes", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);

  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  for (let y = 14; y < 20; y++) for (let x = 14; x < 20; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;

  // One opening out of the spawn room and one opening out of the dead-end room.
  tiles[3 * CHUNK_SIZE + 7] = TILE_FLOOR;
  tiles[16 * CHUNK_SIZE + 13] = TILE_FLOOR;

  // Stair inside the dead-end room: this room must not receive dead-end themes.
  tiles[16 * CHUNK_SIZE + 16] = TILE_STAIR_DOWN;

  const chunk = {
    chunkX: 0,
    chunkY: 0,
    tiles,
    rooms: [
      { x: 1, y: 1, w: 6, h: 6 },
      { x: 14, y: 14, w: 6, h: 6 },
    ],
    doors: [],
  };
  const floorPlan = {
    depth: 4,
    difficultyMult: 1.2,
    profile: { doorFeatureRate: 0, shopChance: 0, featurePool: null, monsterFilter: null },
  };
  const rng = {
    next: () => 0.99,
    int: (min) => min,
    choice: (arr) => arr[arr.length - 1],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const stairRoom = chunk.rooms[1];
  const inStairRoom = (spawn) =>
    spawn.x >= stairRoom.x && spawn.x < stairRoom.x + stairRoom.w
    && spawn.y >= stairRoom.y && spawn.y < stairRoom.y + stairRoom.h;

  const themedContent = spawns.filter((spawn) =>
    inStairRoom(spawn)
    && (
      spawn.kind === "alchemy_bench"
      || spawn.kind === "chest"
      || spawn.kind === "gold"
      || spawn.kind === "book"
      || spawn.kind === "flayed_man"
      || spawn.kind === "hanging_chains"
      || spawn.kind === "cooking_fire"
      || spawn.kind === "catalog_item"
    )
  );

  assertEquals(themedContent.length, 0, "stair room should be excluded from dead-end themed content");
});

Deno.test("dragon hoard dead-end rooms only keep the lair guardian as a monster spawn", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 10; y < 16; y++) for (let x = 10; x < 16; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[12 * CHUNK_SIZE + 9] = TILE_FLOOR; // one west entrance

  const room = { x: CHUNK_SIZE + 10, y: 10, w: 6, h: 6 };
  const chunk = {
    chunkX: 1,
    chunkY: 0,
    tiles,
    rooms: [room],
    doors: [],
  };
  const floorPlan = {
    depth: 5,
    difficultyMult: 1.3,
    profile: { shopChance: 0, doorFeatureRate: 0, featurePool: null, monsterFilter: null },
  };
  const rng = {
    next: () => 0.99, // pick dragon_hoard theme while still spawning baseline room monsters first
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const inRoom = (s) =>
    s.x >= room.x && s.x < room.x + room.w
    && s.y >= room.y && s.y < room.y + room.h;
  const roomHostiles = spawns.filter((s) =>
    inRoom(s)
    && (s.kind === "monster" || s.kind === "centipede" || s.kind === "spawner" || s.kind === "mimic")
  );

  assertEquals(roomHostiles.length, 1, "dragon hoard room should have exactly one hostile spawn");
});

Deno.test("hydraulics dead ends align a linked gate and wall valve without overlapping a door", () => {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 10; y < 16; y++) for (let x = 10; x < 16; x++) tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
  tiles[12 * CHUNK_SIZE + 9] = TILE_DOOR;
  tiles[12 * CHUNK_SIZE + 8] = TILE_FLOOR;

  const room = { x: CHUNK_SIZE + 10, y: 10, w: 6, h: 6 };
  const chunk = {
    chunkX: 1,
    chunkY: 0,
    tiles,
    rooms: [room],
    doors: [{ x: CHUNK_SIZE + 9, y: 12 }],
  };
  const floorPlan = {
    depth: 6,
    difficultyMult: 1.2,
    profile: { shopChance: 0, doorFeatureRate: 0, featurePool: null, monsterFilter: null },
  };
  const rng = {
    next: () => 0.8,
    int: (min) => min,
    choice: (arr) => arr[0],
    float: (min) => min,
  };

  const spawns = populateChunk(chunk, floorPlan, rng);
  const gate = spawns.find((spawn) => spawn.kind === "portcullis");
  const valve = spawns.find((spawn) => spawn.kind === "flood_gate_wheel");

  assert(gate, "hydraulics room should gate its approach corridor");
  assert(valve, "hydraulics room should place a flood-gate wheel");
  assertEquals(gate.params.linkId, valve.params.linkId, "gate and valve should share one mechanism link");
  assertEquals(gate.x, CHUNK_SIZE + 8, "gate should sit beyond the existing doorway");
  assertEquals(gate.y, 12);
  assert(valve.x >= room.x && valve.x < room.x + room.w, "valve should be mounted inside the room");
  assert(valve.y >= room.y && valve.y < room.y + room.h, "valve should be mounted inside the room");
});

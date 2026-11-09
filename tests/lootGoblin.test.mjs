import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildPalette } from "../src/display/palette/index.js";
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from "../src/rules/components/AggroState.js";
import { Faction } from "../src/rules/components/Faction.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { LOOT_TABLES } from "../src/rules/data/lootTables.js";
import { getMonster } from "../src/rules/data/monsters.js";
import { pickMonster } from "../src/rules/environment/dungeon/tables.js";
import { aiChaseSystem } from "./helpers/runChaseTactics.mjs";
import { dealDamage } from "../src/rules/utils/dealDamage.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";

Deno.test("loot_goblin monster definition is present and uses on-damaged spill/blink hooks", () => {
  const def = getMonster("loot_goblin");
  assert(def, "loot_goblin should exist");
  assert(def.baseHp >= 50, "loot_goblin should have high health");
  assert(def.tags.includes("rare"), "loot_goblin should be marked rare");
  assert(def.tags.includes("elite"), "loot_goblin should carry the elite label tag");
  assert((def.retreatHpPct || 0) > 1, "loot_goblin should retreat at all health values");
  assert(Array.isArray(def.hooks?.onDamaged) && def.hooks.onDamaged.length > 0, "loot_goblin should react on damage");
});

Deno.test("goblin-family spawns can rare-upgrade into loot_goblin", () => {
  const rng = {
    choice(arr) {
      return arr.find((def) => def.id === "goblin_archer") || arr[0];
    },
    next() {
      return 0;
    },
  };

  const picked = pickMonster(rng, 3);
  assertEquals(picked.identity, "loot_goblin");
});

Deno.test("loot_goblin flees from the player while hunting", () => {
  const world = new World({ seed: 0xC0FFEE });
  world.rand = () => 0.99; // avoid blink cast chance in whileLOS for deterministic movement assertion

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 5, y: 5 });

  const goblin = world.create();
  world.add(goblin, NamedIdentity, { name: "Loot Goblin", identity: "loot_goblin" });
  world.add(goblin, Position, { x: 7, y: 5 });
  world.add(goblin, Faction, { key: "enemy" });
  world.add(goblin, Vitality, { hp: 64, maxHp: 64 });
  world.add(goblin, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: 5,
    lastKnownY: 5,
    searchTurnsLeft: SEARCH_TURNS_HUNTING_GRACE,
    retreating: false,
  });

  aiChaseSystem(world);

  const intent = world.get(goblin, MoveIntent);
  assert(intent, "loot_goblin should queue movement");
  assertEquals(intent.dx, 1, "loot_goblin should move away on x-axis");
  assertEquals(intent.dy, 0, "loot_goblin should flee cardinally");
});

Deno.test("loot_goblin drops loot when hit and short-blinks", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 0xa77a77 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, Vitality, { hp: 50, maxHp: 50 });

  const goblin = world.create();
  world.add(goblin, NamedIdentity, { name: "Loot Goblin", identity: "loot_goblin" });
  world.add(goblin, Position, { x: 8, y: 8 });
  world.add(goblin, Vitality, { hp: 64, maxHp: 64 });
  world.add(goblin, Faction, { key: "enemy" });

  const start = world.get(goblin, Position);
  const startX = start.x | 0;
  const startY = start.y | 0;

  let blinked = null;
  world.on("loot_goblin:blinked", (evt) => { blinked = evt; });

  let sawDropOnStartTile = false;
  for (let step = 1; step <= 16; step++) {
    world.step = step;
    const vit = world.get(goblin, Vitality);
    vit.hp = vit.maxHp;
    dealDamage(world, {
      target: goblin,
      amount: 2,
      source: player,
      type: "physical",
      cause: "test:loot_goblin_hit",
      bypassResist: true,
    });

    for (const [, , pos] of world.query(ItemInfo, Position)) {
      if ((pos.x | 0) === startX && (pos.y | 0) === startY) {
        sawDropOnStartTile = true;
      }
    }
    if (blinked) break;
  }

  assert(sawDropOnStartTile, "loot_goblin should drop loot on hit");
  assert(blinked, "loot_goblin should eventually short-blink when hit repeatedly");
  const dx = Math.abs((blinked.to.x | 0) - (blinked.from.x | 0));
  const dy = Math.abs((blinked.to.y | 0) - (blinked.from.y | 0));
  assert(dx + dy <= 4, "loot_goblin blink should be short-range");
  clearAll();
});

Deno.test("loot_goblin loot tables include gold and rare+epic+legendary pathways", () => {
  const death = LOOT_TABLES["drop:loot_goblin"];
  const hit = LOOT_TABLES["hit:loot_goblin"];
  assert(death, "drop:loot_goblin table should exist");
  assert(hit, "hit:loot_goblin table should exist");

  const deathEntries = Array.isArray(death.entries) ? death.entries : [];
  const hitEntries = Array.isArray(hit.entries) ? hit.entries : [];

  assert(deathEntries.some((e) => e?.type === "gold"), "death table should include gold");
  assert(hitEntries.some((e) => e?.type === "gold"), "hit table should include gold");

  for (const tableId of ["sub:equip_rare", "sub:equip_epic", "sub:equip_legendary"]) {
    assert(
      deathEntries.some((e) => e?.type === "table" && e.tableId === tableId),
      `death table should include ${tableId}`,
    );
    assert(
      hitEntries.some((e) => e?.type === "table" && e.tableId === tableId),
      `hit table should include ${tableId}`,
    );
  }
});

Deno.test("palette contains loot_goblin key", () => {
  const palette = buildPalette();
  assert(palette.loot_goblin, "palette should include loot_goblin");
});

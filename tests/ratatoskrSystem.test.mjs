import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Beatitude } from "../src/rules/components/Beatitude.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { ScriptState } from "../src/rules/components/ScriptState.js";
import { ShopInventory } from "../src/rules/components/ShopInventory.js";
import { Unpaid } from "../src/rules/components/Unpaid.js";
import { PuffSpawned } from "../src/events/PuffSpawned.js";
import { Teleported } from "../src/events/Teleported.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { installDialogRuntime } from "../src/rules/dialogues/runtime.js";
import { getMonster } from "../src/rules/data/monsters.js";
import { installRatatoskrListeners, ratatoskrSystem } from "../src/rules/systems/ratatoskrSystem.js";
import { toMonsterSpawnParams } from "../src/rules/utils/monsterSpawnParams.js";
import { inventoryContains, inventoryItems } from "../src/rules/utils/inventoryFacade.js";
import { spawnMonsterEntity } from "../src/rules/utils/spawnMonsterEntity.js";
import { effectStrength } from "../src/rules/utils/statusFacade.js";
import "../src/rules/dialogues/ratatoskrDialog.js";

function loadFloor() {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
}

function setupWorld() {
  loadFloor();
  const world = new World({ seed: 0x5a17 });
  const player = world.create();
  world.add(player, Player);
  world.add(player, Inventory, { capacity: 20 });
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

  const def = getMonster("ratatoskr");
  const ratatoskr = spawnMonsterEntity(world, {
    ...toMonsterSpawnParams(def, 0),
    x: 20,
    y: 20,
  });

  const dungeon = world.create();
  world.add(dungeon, DungeonState, {
    worldSeed: 0x5a17,
    currentDepth: 0,
    profileType: "overworld",
    floorEntityIds: [player, ratatoskr],
  });
  return { world, player, ratatoskr };
}

Deno.test("ratatoskrSystem makes Ratatoskr conversational and teleports him near the player", () => {
  const { world, player, ratatoskr } = setupWorld();
  world.step = 50;

  ratatoskrSystem(world);

  const inter = world.get(ratatoskr, Interactable);
  assertEquals(inter?.action, "talkToNPC");
  assertEquals(inter?.params?.dialogId, "norse:ratatoskr");
  assert(world.has(ratatoskr, ShopInventory), "Ratatoskr should carry commerce terms for dialog-gated cache opens");

  const pos = world.get(ratatoskr, Position);
  const ppos = world.get(player, Position);
  const dist = Math.max(Math.abs(pos.x - ppos.x), Math.abs(pos.y - ppos.y));
  assert(dist >= 4 && dist <= 9, `Ratatoskr should appear near the player, got distance ${dist}`);
  assert((world.get(ratatoskr, ScriptState)?.data?.ratatoskr?.visits || 0) >= 1);
});

Deno.test("Ratatoskr dialog opens a legendary unpaid cache", () => {
  const { world, player, ratatoskr } = setupWorld();
  installDialogRuntime(world);
  world.set(ratatoskr, Position, { x: 6, y: 5 });
  ratatoskrSystem(world);

  const opened = [];
  const shops = [];
  world.on("dialog:opened", (payload) => opened.push(payload));
  world.on("shop:open", (payload) => shops.push(payload));

  world.emit("dialog:openRequest", { actorId: player, targetId: ratatoskr, dialogId: "norse:ratatoskr" });
  const sessionId = opened.at(-1)?.sessionId;
  assert(sessionId > 0, "Ratatoskr dialog should open");
  assertEquals(opened.at(-1)?.presentation, "bubble");
  assert((opened.at(-1)?.choices?.length || 0) <= 4, "Ratatoskr should fit compact mobile dialog");
  world.emit("dialog:choose", { sessionId, choiceId: "open_cache" });

  assertEquals(shops.at(-1)?.vendorKind, "travellingVendor");
  assertEquals(shops.at(-1)?.vendorLabel, "Ratatoskr");
  const stock = [];
  for (const [itemId, unpaid] of world.query(Unpaid)) {
    if (unpaid.shopkeeperId === ratatoskr) stock.push(itemId);
  }
  assertEquals(stock.length, 4);
  assert(stock.every((itemId) => (world.get(itemId, Unpaid)?.price || 0) >= 777));
  assert(stock.every((itemId) => inventoryContains(world, ratatoskr, itemId)), "Ratatoskr should carry his cache");
  assert(stock.every((itemId) => !world.has(itemId, Position)), "Ratatoskr cache should not be floor stock");
});

Deno.test("Ratatoskr branch bargain curses the player and grants a cursed legend", () => {
  const { world, player, ratatoskr } = setupWorld();
  installDialogRuntime(world);
  world.set(ratatoskr, Position, { x: 6, y: 5 });
  ratatoskrSystem(world);

  const opened = [];
  world.on("dialog:opened", (payload) => opened.push(payload));
  world.emit("dialog:openRequest", { actorId: player, targetId: ratatoskr, dialogId: "norse:ratatoskr" });
  world.emit("dialog:choose", { sessionId: opened.at(-1).sessionId, choiceId: "branch_bargain" });

  assertEquals(effectStrength(world, player, "cursed"), 2);
  const cursedItems = inventoryItems(world, player).filter((itemId) => world.get(itemId, Beatitude)?.state === "cursed");
  assertEquals(cursedItems.length, 1);
});

Deno.test("Ratatoskr quest omens teleport him in with puff and teleport events", () => {
  const { world, player, ratatoskr } = setupWorld();
  installRatatoskrListeners(world);
  world.step = 0;
  ratatoskrSystem(world);
  assert(!world.has(ratatoskr, Position), "dormant Ratatoskr should be offstage before a trigger");

  const puffs = [];
  const teleports = [];
  world.on(PuffSpawned, (event) => puffs.push(event));
  world.on(Teleported, (event) => teleports.push(event));

  world.emit("quest:completed", { questId: "starter.priest_fetch", playerId: player });
  world.step = 2;
  ratatoskrSystem(world);

  const pos = world.get(ratatoskr, Position);
  const ppos = world.get(player, Position);
  const dist = Math.max(Math.abs(pos.x - ppos.x), Math.abs(pos.y - ppos.y));
  assert(dist >= 4 && dist <= 9, `Ratatoskr should appear near the player, got distance ${dist}`);
  assertEquals(teleports.at(-1)?.source, "ratatoskr");
  assertEquals(puffs.at(-1)?.source, "ratatoskr");
});

Deno.test("Ratatoskr vanishes several turns after interaction in a puff", () => {
  const { world, player, ratatoskr } = setupWorld();
  installDialogRuntime(world);
  installRatatoskrListeners(world);
  world.set(ratatoskr, Position, { x: 6, y: 5 });
  ratatoskrSystem(world);

  const opened = [];
  const puffs = [];
  const teleports = [];
  world.on("dialog:opened", (payload) => opened.push(payload));
  world.on(PuffSpawned, (event) => puffs.push(event));
  world.on(Teleported, (event) => teleports.push(event));

  world.emit("dialog:openRequest", { actorId: player, targetId: ratatoskr, dialogId: "norse:ratatoskr" });
  world.emit("dialog:choose", { sessionId: opened.at(-1).sessionId, choiceId: "leave" });
  const state = world.get(ratatoskr, ScriptState)?.data?.ratatoskr;
  assert((state?.vanishTurn || 0) > world.step, "interaction should schedule a delayed vanish");

  world.step = state.vanishTurn;
  ratatoskrSystem(world);

  assert(!world.has(ratatoskr, Position), "Ratatoskr should be offstage after vanishing");
  assertEquals(teleports.at(-1)?.source, "ratatoskr");
  assertEquals(puffs.at(-1)?.source, "ratatoskr");
});

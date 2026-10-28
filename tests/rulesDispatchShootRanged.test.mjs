import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { makeRulesDispatcher } from "../src/main/input/rulesDispatch.js";
import { Position } from "../src/rules/components/Position.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { RangedAttackIntent } from "../src/rules/components/Intents/RangedAttackIntent.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { TargetLock } from "../src/rules/components/TargetLock.js";
import { setFovDisabled } from "../src/rules/environment/dungeon/exploredMap.js";

function withVisibilityDisabled(fn) {
  setFovDisabled(true);
  try {
    fn();
  } finally {
    setFovDisabled(false);
  }
}

Deno.test("rulesDispatch: shootRanged fires at the persistent bow target", () => withVisibilityDisabled(() => {
  const world = new World({ seed: 91 });
  const actor = world.create();
  world.add(actor, Position, { x: 5, y: 5 });

  const bowId = world.create();
  world.add(bowId, ItemInfo, { type: "equip", subtype: "bow", range: 8, count: 1 });
  world.add(actor, Equipment, { ranged: bowId });

  const nearEnemy = world.create();
  world.add(nearEnemy, Position, { x: 6, y: 5 });
  world.add(nearEnemy, Faction, { key: "enemy" });
  world.add(nearEnemy, Vitality, { hp: 9, maxHp: 9 });
  world.add(actor, TargetLock, { targetId: nearEnemy });

  const farEnemy = world.create();
  world.add(farEnemy, Position, { x: 8, y: 5 });
  world.add(farEnemy, Faction, { key: "enemy" });
  world.add(farEnemy, Vitality, { hp: 9, maxHp: 9 });

  let tickCount = 0;
  world.tick = () => { tickCount += 1; };

  const dispatch = makeRulesDispatcher(world, () => actor);
  dispatch({ type: "rules.shootRanged" });

  const intent = world.get(actor, RangedAttackIntent);
  assertEquals(!!intent, true);
  assertEquals(intent.targetId, nearEnemy);
  assertEquals(tickCount, 1);
}));

Deno.test("rulesDispatch: shootRanged fires a wand at the persistent target", () => withVisibilityDisabled(() => {
  const world = new World({ seed: 92 });
  const actor = world.create();
  world.add(actor, Position, { x: 10, y: 10 });

  const wandId = world.create();
  world.add(wandId, ItemInfo, { type: "wand", range: 6, count: 1 });
  world.add(wandId, NamedIdentity, { name: "Wand of Frost", identity: "wand_frost" });
  world.add(actor, Equipment, { ranged: wandId });

  const enemy = world.create();
  world.add(enemy, Position, { x: 12, y: 10 });
  world.add(enemy, Faction, { key: "enemy" });
  world.add(enemy, Vitality, { hp: 12, maxHp: 12 });
  world.add(actor, TargetLock, { targetId: enemy });

  let tickCount = 0;
  world.tick = () => { tickCount += 1; };

  const dispatch = makeRulesDispatcher(world, () => actor);
  dispatch({ type: "rules.shootRanged" });

  const intent = world.get(actor, UseIntent);
  assertEquals(!!intent, true);
  assertEquals(intent.itemId, wandId);
  assertEquals(intent.targetId, enemy);
  assertEquals(intent.x, 12);
  assertEquals(intent.y, 10);
  assertEquals(tickCount, 1);
}));

Deno.test("rulesDispatch: shootRanged without a target opens point targeting without a turn", () => withVisibilityDisabled(() => {
  const world = new World({ seed: 93 });
  const actor = world.create();
  world.add(actor, Position, { x: 2, y: 2 });

  const bowId = world.create();
  world.add(bowId, ItemInfo, { type: "equip", subtype: "bow", range: 5, count: 1 });
  world.add(actor, Equipment, { ranged: bowId });

  let tickCount = 0;
  world.tick = () => { tickCount += 1; };

  const dispatch = makeRulesDispatcher(world, () => actor);
  dispatch({ type: "rules.shootRanged" });

  assertEquals(world.has(actor, RangedAttackIntent), false);
  assertEquals(world.has(actor, UseIntent), false);
  assertEquals(tickCount, 0);
}));

Deno.test("rulesDispatch: aimed ranged shots preserve the hostile target lock", () => withVisibilityDisabled(() => {
  const world = new World({ seed: 94 });
  const actor = world.create();
  world.add(actor, Position, { x: 2, y: 2 });

  const bowId = world.create();
  world.add(bowId, ItemInfo, { type: "equip", subtype: "bow", range: 6, count: 1 });
  world.add(actor, Equipment, { ranged: bowId });

  const enemy = world.create();
  world.add(enemy, Position, { x: 5, y: 2 });
  world.add(enemy, Faction, { key: "enemy" });
  world.add(enemy, Vitality, { hp: 9, maxHp: 9 });

  world.tick = () => {};
  const dispatch = makeRulesDispatcher(world, () => actor);
  dispatch({ type: "rules.rangedAttack", payload: { targetId: enemy, toX: 5, toY: 2 } });

  assertEquals(world.get(actor, TargetLock)?.targetId, enemy);
}));

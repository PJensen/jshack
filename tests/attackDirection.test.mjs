import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { makeRulesDispatcher } from "../src/main/input/rulesDispatch.js";
import { AttackDirectionIntent } from "../src/rules/components/Intents/AttackDirectionIntent.js";
import { AttackIntent } from "../src/rules/components/Intents/AttackIntent.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { Faction } from "../src/rules/components/Faction.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { attackDirectionSystem } from "../src/rules/systems/attackDirectionSystem.js";
import { combatSystem } from "../src/rules/systems/combatSystem.js";
import { installDispositionOffenseListeners } from "../src/rules/utils/disposition.js";

function addActor(world, faction, x, y, name = faction) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Faction, { key: faction });
  world.add(id, Vitality, { hp: 30, maxHp: 30 });
  world.add(id, NamedIdentity, { name, identity: name.toLowerCase() });
  return id;
}

Deno.test("attackDirectionSystem queues melee intent for adjacent hostile target", () => {
  const world = new World({ seed: 1 });
  const player = addActor(world, "player", 5, 5, "Player");
  const enemy = addActor(world, "enemy", 6, 5, "Goblin");

  world.add(player, AttackDirectionIntent, { dx: 1, dy: 0, confirmed: false });
  attackDirectionSystem(world);

  const intent = world.get(player, AttackIntent);
  assert(intent, "hostile target should receive AttackIntent");
  assertEquals(intent.targetId, enemy);
  assertEquals(intent.allowNonHostile, false);
});

Deno.test("attackDirectionSystem requires confirmation for protected non-hostile NPC", () => {
  const world = new World({ seed: 2 });
  const player = addActor(world, "player", 5, 5, "Player");
  const shopkeeper = addActor(world, "shopkeeper", 6, 5, "Shopkeeper");
  const events = [];
  world.on("attack:confirm-required", (ev) => events.push(ev));

  world.add(player, AttackDirectionIntent, { dx: 1, dy: 0, confirmed: false });
  attackDirectionSystem(world);

  assertEquals(world.has(player, AttackIntent), false);
  assertEquals(events.length, 1);
  assertEquals(events[0].targetId, shopkeeper);
});

Deno.test("confirmed attack direction can attack protected non-hostile NPC", () => {
  const world = new World({ seed: 3 });
  const player = addActor(world, "player", 5, 5, "Player");
  const shopkeeper = addActor(world, "shopkeeper", 6, 5, "Shopkeeper");
  let attempted = false;
  world.on("combat:melee:attack", ({ attacker, defender }) => {
    if (attacker === player && defender === shopkeeper) attempted = true;
  });

  world.add(player, AttackDirectionIntent, { dx: 1, dy: 0, confirmed: true });
  attackDirectionSystem(world);
  const intent = world.get(player, AttackIntent);
  assert(intent?.allowNonHostile === true, "confirmed NPC attack should explicitly bypass hostility gate");
  combatSystem(world);

  assert(attempted, "combat should attempt the confirmed non-hostile attack");
});

Deno.test("confirmed hostility removes confirmation from subsequent attacks on that NPC", () => {
  const world = new World({ seed: 7 });
  const player = addActor(world, "player", 5, 5, "Player");
  const shopkeeper = addActor(world, "shopkeeper", 6, 5, "Shopkeeper");
  installDispositionOffenseListeners(world);

  world.add(player, AttackDirectionIntent, { dx: 1, dy: 0, confirmed: true });
  attackDirectionSystem(world);
  combatSystem(world);

  assertEquals(world.get(shopkeeper, AggroState)?.alertLevel, AGGRO_LEVELS.hunting);
  assertEquals(world.get(shopkeeper, AggroState)?.targetId, player);
  world.add(player, AttackDirectionIntent, { dx: 1, dy: 0, confirmed: false });
  attackDirectionSystem(world);
  assert(world.get(player, AttackIntent), "established combat should not prompt again");
});

Deno.test("attack direction must be cardinal", () => {
  const world = new World({ seed: 4 });
  const player = addActor(world, "player", 5, 5, "Player");

  let threw = false;
  try {
    world.add(player, AttackDirectionIntent, { dx: 1, dy: 1, confirmed: false });
  } catch {
    threw = true;
  }

  assert(threw, "diagonal attack directions should be rejected by the component validator");
});

Deno.test("rulesDispatch attackDirection prompts for protected target confirmation", () => {
  const world = new World({ seed: 5 });
  const player = addActor(world, "player", 5, 5, "Player");
  addActor(world, "townfolk", 6, 5, "Villager");
  let tickCount = 0;
  world.tick = () => { tickCount += 1; };
  let prompt = null;
  const onPrompt = (ev) => { prompt = ev.detail; };
  globalThis.addEventListener("ui:confirmAction", onPrompt, { once: true });

  const dispatch = makeRulesDispatcher(world, () => player);
  dispatch({ type: "rules.attackDirection", payload: { dx: 1, dy: 0 } });

  assertEquals(world.has(player, AttackDirectionIntent), false);
  assertEquals(tickCount, 0);
  assert(prompt, "protected attack should request a UI confirmation");
  assertEquals(prompt.action.type, "rules.attackDirection");
  assertEquals(prompt.action.payload.confirmed, true);
  assertEquals(prompt.offense.offenseKind, "assault");
});

Deno.test("rulesDispatch attackDirection accepts explicit confirmation", () => {
  const world = new World({ seed: 6 });
  const player = addActor(world, "player", 5, 5, "Player");
  addActor(world, "townfolk", 6, 5, "Villager");
  let tickCount = 0;
  world.tick = () => { tickCount += 1; };

  const dispatch = makeRulesDispatcher(world, () => player);
  dispatch({ type: "rules.attackDirection", payload: { dx: 1, dy: 0, confirmed: true } });

  const intent = world.get(player, AttackDirectionIntent);
  assert(intent, "confirmed action should queue the direction intent");
  assertEquals(intent.confirmed, true);
  assertEquals(tickCount, 1);
});

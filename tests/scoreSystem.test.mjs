import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Owner } from "../src/rules/components/Owner.js";
import { Player } from "../src/rules/components/Player.js";
import { Pet } from "../src/rules/components/Pet.js";
import { Score } from "../src/rules/components/Score.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { scoreSystem } from "../src/rules/systems/scoreSystem.js";
import { recordDeathApplied } from "../src/rules/utils/deathApplied.js";

Deno.test("scoreSystem awards player kills from DeathApplied records", () => {
  const world = new World({ seed: 1 });

  const dungeon = world.create();
  world.add(dungeon, DungeonState, { currentDepth: 3 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Score, { current: 10 });

  const monster = world.create();
  world.add(monster, Vitality, { hp: 0, maxHp: 7 });

  recordDeathApplied(world, { target: monster, killer: player });
  scoreSystem(world);

  assertEquals(world.get(player, Score).current, 31);
});

Deno.test("scoreSystem ignores non-player kills and player deaths", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Score, { current: 5 });
  world.add(player, Vitality, { hp: 0, maxHp: 20 });

  const monster = world.create();
  world.add(monster, Vitality, { hp: 10, maxHp: 10 });

  recordDeathApplied(world, { target: monster, killer: 0 });
  recordDeathApplied(world, { target: player, killer: monster });
  scoreSystem(world);

  assertEquals(world.get(player, Score).current, 5);
});

Deno.test("scoreSystem credits pet kills to the owning player", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Score, { current: 10 });

  const pet = world.create();
  world.add(pet, Pet);
  world.add(pet, Owner, { ownerId: player });

  const monster = world.create();
  world.add(monster, Vitality, { hp: 0, maxHp: 7 });

  recordDeathApplied(world, { target: monster, killer: pet });
  scoreSystem(world);

  assertEquals(world.get(player, Score).current, 17);
});

Deno.test("scoreSystem credits spell kills sourced by the player", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Score, { current: 10 });

  const monster = world.create();
  world.add(monster, Vitality, { hp: 0, maxHp: 7 });

  recordDeathApplied(world, {
    target: monster,
    killer: player,
    cause: "spell:lightning",
    damageType: "lightning",
  });
  scoreSystem(world);

  assertEquals(world.get(player, Score).current, 17);
});

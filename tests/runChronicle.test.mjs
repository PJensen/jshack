import { assert, assertEquals } from "jsr:@std/assert@1";
import { World } from "../src/lib/ecs-js/index.js";
import { Player } from "../src/rules/components/Player.js";
import { RunState } from "../src/rules/components/RunState.js";
import { installRunChronicle, runChronicleSystem } from "../src/rules/systems/runChronicleSystem.js";
import { ensureRunState } from "../src/rules/utils/deathModes.js";
import { makeDeathShareLink } from "../src/cloud/wiring/deathShareWiring.js";
import { DeathApplied } from "../src/rules/components/DeathApplied.js";

function setup() {
  const world = new World({ seed: 0x1234 });
  const player = world.create();
  world.add(player, Player);
  ensureRunState(world);
  installRunChronicle(world);
  return { world, player };
}

Deno.test("run chronicle records counters without a declared vow", () => {
  const { world, player } = setup();
  world.emit("castSpell", { actor: player, spellId: "blink" });
  const [, state] = [...world.query(RunState)][0];
  assertEquals(state.spellsCast, 1);
  assertEquals(state.spellsCast, 1);
});

Deno.test("run chronicle records only observed actions", () => {
  const { world, player } = setup();
  world.emit("castSpell", { actor: player, spellId: "blink" });
  const [, state] = [...world.query(RunState)][0];
  assertEquals(state.spellsCast, 1);
});

Deno.test("run chronicle consumes canonical death records for kills", () => {
  const { world, player } = setup();
  const victim = world.create();
  const death = world.create();
  world.add(death, DeathApplied, { target: victim, killer: player, cause: "melee" });
  runChronicleSystem(world);
  const [, state] = [...world.query(RunState)][0];
  assertEquals(state.kills, 1);
  assertEquals(state.kills, 1);
  assert(world.has(death, DeathApplied));
});

Deno.test("death share fields can omit optional chronicle details", () => {
  const full = makeDeathShareLink({
    depth: 4, score: 80, seed: 12, cause: "trap", turns: 40,
    playerName: "Ada", className: "Mage", chronicle: {
      honors: [{ label: "Spellless" }], kills: 2, prayers: 0, petsLost: 0,
    },
  });
  const minimal = makeDeathShareLink({
    depth: 4, score: 80, seed: 12, cause: "trap", turns: 40,
    playerName: "Ada", className: "Mage", chronicle: {
      honors: [{ label: "Spellless" }], kills: 2, prayers: 0, petsLost: 0,
    },
    shareFields: { honors: false, chronicle: false },
  });
  assert(full.includes("Honors"));
  assert(full.includes("kills"));
  assert(!minimal.includes("Honors"));
  assert(!minimal.includes("kills"));
});

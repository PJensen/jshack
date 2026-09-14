import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { BarkeepStoryRequested } from "../src/events/BarkeepStoryRequested.js";
import { buildBarkeepStoryContext, createBarkeepStoryWiringExtension, normalizeBarkeepStory, splitBarkeepStory } from "../src/main/wiring/barkeepStoryWiring.js";
import { AIResource } from "../src/rules/resources/AI.js";
import { AudioEmitter } from "../src/rules/components/AudioEmitter.js";
import { CalendarState } from "../src/rules/components/CalendarState.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Position } from "../src/rules/components/Position.js";
import { TownState } from "../src/rules/components/TownState.js";
import { WeatherState } from "../src/rules/components/WeatherState.js";
import { clearAll as clearTileMap, setRoofed } from "../src/rules/environment/dungeon/tileMap.js";

function buildStoryWorld() {
  clearTileMap();
  const world = new World({ seed: 0x51a7 });
  const player = world.create();
  world.add(player, NamedIdentity, { name: "Runa", identity: "player" });
  world.add(player, Position, { x: 10, y: 10 });
  const barkeep = world.create();
  world.add(barkeep, NamedIdentity, { name: "Haldor", identity: "townfolk_barkeep" });
  world.add(barkeep, Position, { x: 11, y: 10 });
  const state = world.create();
  world.add(state, DungeonState, { worldSeed: 0x51a7, currentDepth: 0, profileType: "overworld" });
  world.add(state, CalendarState, { startDay: 70, startYear: 847 });
  world.add(state, TownState, { morale: 38, threatLevel: 2, lowFood: true });
  world.add(state, WeatherState, { current: "rain" });
  const tavernAnchor = world.create();
  world.add(tavernAnchor, Position, { x: 12, y: 10 });
  world.add(tavernAnchor, AudioEmitter, { emitters: [{ profile: "tavern", interior: true }] });
  for (let x = 9; x <= 13; x++) {
    for (let y = 9; y <= 11; y++) setRoofed(x, y, true);
  }
  return { world, player, barkeep };
}

Deno.test("barkeep story completion is optional and uses an authored fallback when AI is disabled", () => {
  const { world, player, barkeep } = buildStoryWorld();
  const queued = [];
  const sceneRuntime = {
    canActorAddressPlayer: () => true,
    queueSpeechBubble: (detail) => queued.push(detail),
  };
  world.setResource(AIResource, {
    isEnabled: () => false,
    complete: () => { throw new Error("disabled AI must not be called"); },
  });
  world.install(createBarkeepStoryWiringExtension({ sceneRuntime }));

  world.emit(new BarkeepStoryRequested({ actor: player, targetId: barkeep }));

  assert(queued.length > 1);
  assert(queued.every((beat) => beat.entityId === barkeep));
  assert(queued.every((beat) => beat.text.length <= 145));
});

Deno.test("barkeep story completion receives world flavor context and queues its lines after an opener", async () => {
  const { world, player, barkeep } = buildStoryWorld();
  const queued = [];
  const sceneRuntime = {
    canActorAddressPlayer: () => true,
    queueSpeechBubble: (detail) => queued.push(detail),
  };
  let request = null;
  world.setResource(AIResource, {
    isEnabled: () => true,
    complete: (opts) => {
      request = opts;
      return Promise.resolve("```text\nThe moon owed the miller a silver tooth.\nIt promised to pay before winter.\nWinter came wearing the miller's coat.\nThe moon still drinks here on credit.\n```");
    },
  });
  world.install(createBarkeepStoryWiringExtension({ sceneRuntime }));

  world.emit(new BarkeepStoryRequested({ actor: player, targetId: barkeep }));
  assertEquals(queued.map((beat) => beat.text), ["Now then... let me remember how this one begins."]);
  await Promise.resolve();

  assertEquals(queued.slice(1).map((beat) => beat.text), [
    "The moon owed the miller a silver tooth.",
    "It promised to pay before winter.",
    "Winter came wearing the miller's coat.",
    "The moon still drinks here on credit.",
  ]);
  assertEquals(request.maxTokens, 192);
  assertEquals(request.temperature, 0.95);
  assert(String(request.messages[1].content).includes('"weather":"rain"'));
  assert(String(request.messages[1].content).includes('"speaker":"Haldor"'));
  assert(String(request.messages[1].content).includes('"insideTavern":true'));
  assert(String(request.messages[1].content).includes('"location":"inside the overworld tavern"'));
  assert(String(request.messages[0].content).includes("4 to 7 speakable lines"));
});

Deno.test("barkeep story context distinguishes an outdoor listener", () => {
  const { world, player, barkeep } = buildStoryWorld();
  world.set(player, Position, { x: 20, y: 20 });
  const context = buildBarkeepStoryContext(world, new BarkeepStoryRequested({ actor: player, targetId: barkeep }));

  assertEquals(context.insideTavern, false);
  assertEquals(context.location, "outside the overworld tavern");
});

Deno.test("barkeep story normalization removes fences and bounds runaway output", () => {
  assertEquals(normalizeBarkeepStory("```text\nA short tale.\n```"), "A short tale.");
  assert(normalizeBarkeepStory("A sentence. ".repeat(300)).length <= 1600);
  const beats = splitBarkeepStory("One short line.\nA very long sentence about a traveler who carried a silver door through the rain because nobody had told him that doors usually prefer to remain attached to houses and castles.", 100);
  assert(beats.length >= 2);
  assert(beats.every((beat) => beat.length <= 100));
});

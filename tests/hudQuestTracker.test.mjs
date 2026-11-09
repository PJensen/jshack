import { assert, assertEquals } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { World } from "../src/lib/ecs-js/index.js";
import { createHudFeeds } from "../src/main/ui/hudFeeds.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { DungeonEntrance } from "../src/rules/components/DungeonEntrance.js";
import { installQuestRuntime, instantiateQuest, STARTER_PRIEST_FETCH_QUEST_ID } from "../src/rules/quests/runtime.js";
import { RAT_INFESTATION_QUEST_ID } from "../src/rules/quests/definitions/ratInfestation.js";
import { ROOTBOUND_GROTTO_QUEST_ID } from "../src/rules/quests/definitions/rootboundGrotto.js";
import { QuestVars } from "../src/rules/components/QuestVars.js";
import "../src/rules/quests/definitions/ratInfestation.js";
import "../src/rules/quests/definitions/graveyardWatch.js";
import "../src/rules/quests/definitions/rootboundGrotto.js";

function installTestWindow() {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prevWindow = globalThis.window;
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
    writable: true,
  });
  return () => {
    if (hadWindow) {
      Object.defineProperty(globalThis, "window", {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
    } else {
      delete globalThis.window;
    }
  };
}

Deno.test("hud quest tracker prioritizes accepted measurable progress quests", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 21 });
    installQuestRuntime(world);

    const player = world.create();
    world.add(player, Player, {});
    world.add(player, Position, { x: 3, y: 4 });
    const dungeon = world.create();
    world.add(dungeon, DungeonState, { currentDepth: 0, activeTemplateId: "overworld" });
    const entrance = world.create();
    world.add(entrance, Position, { x: 12, y: 9 });
    world.add(entrance, DungeonEntrance, { questId: RAT_INFESTATION_QUEST_ID, label: "Tavern Cellar" });

    const ratQuest = instantiateQuest(world, RAT_INFESTATION_QUEST_ID, {
      player,
      giver: 11,
      target: 11,
    }, {}, { node: "hunt" });
    world.set(ratQuest, QuestVars, { data: { accepted: true, killCount: 3, reported: false } });

    const acceptedPriestQuest = instantiateQuest(world, STARTER_PRIEST_FETCH_QUEST_ID, {
      player,
      giver: 12,
      target: 12,
    }, {}, { node: "recover" });
    world.set(acceptedPriestQuest, QuestVars, { data: { accepted: true, recovered: false, delivered: false } });

    const unacceptedRatQuest = instantiateQuest(world, RAT_INFESTATION_QUEST_ID, {
      player,
      giver: 13,
      target: 13,
    }, {}, { node: "hunt", allowDuplicate: true });
    world.set(unacceptedRatQuest, QuestVars, { data: { accepted: false, killCount: 5, reported: false } });

    const hudFeeds = createHudFeeds(world, {
      getPlayerMana: () => ({ mana: 10, maxMana: 10 }),
      ensureActiveSpell: () => null,
      updateActiveSpellLabel: () => {},
      knownSpellIds: () => [],
      getActionBarSlots: () => [],
      getPinnedSpellSlots: () => [],
      autoAssignSlot: () => -1,
      autoAssignPinnedSlot: () => -1,
    });

    const payloads = [];
    const onUpdate = (ev) => payloads.push(ev?.detail || null);
    window.addEventListener("ui:updateQuestTracker", onUpdate);
    hudFeeds.updateQuestTrackerHUD();
    window.removeEventListener("ui:updateQuestTracker", onUpdate);

    assert(payloads.length > 0, "expected quest tracker payload");
    const detail = payloads.at(-1);
    assert(detail?.focused, "expected a focused quest");
    assertEquals(detail.focused.questId, RAT_INFESTATION_QUEST_ID);
    assertEquals(detail.focused.progress, 3);
    assertEquals(detail.focused.target, 5);
    assertEquals(detail.focused.icon, "🐀");
    assertEquals(detail.focused.summary, "Clear the tavern cellar");
    assertEquals(detail.focused.targetPosition.label, "Tavern Cellar");
    assertEquals(detail.focused.targetPosition.x, 12);
    assertEquals(detail.focused.targetPosition.y, 9);
    assert(String(detail.focused.rewardPreview || "").includes("Mirror Bow"));
    assert(String(detail.focused.rewardPreview || "").includes("wall-side impacts"));
    assertEquals("moreCount" in detail, false);
  } finally {
    restoreWindow();
  }
});

Deno.test("hud quest tracker resolves rootbound entrance by its destination template", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 22 });
    installQuestRuntime(world);

    const player = world.create();
    world.add(player, Player, {});
    world.add(player, Position, { x: 3, y: 4 });
    const dungeon = world.create();
    world.add(dungeon, DungeonState, { currentDepth: 0, activeTemplateId: "overworld" });
    const entrance = world.create();
    world.add(entrance, Position, { x: 18, y: 11 });
    world.add(entrance, DungeonEntrance, { templateId: "rootbound_grotto", label: "Rootbound Grotto" });

    const quest = instantiateQuest(world, ROOTBOUND_GROTTO_QUEST_ID, {
      player,
      giver: 11,
    }, {}, { node: "hunt" });
    world.set(quest, QuestVars, { data: { accepted: true, defeated: false, rewardGranted: false } });

    const hudFeeds = createHudFeeds(world, {
      getPlayerMana: () => ({ mana: 10, maxMana: 10 }),
      ensureActiveSpell: () => null,
      updateActiveSpellLabel: () => {},
      knownSpellIds: () => [],
      getActionBarSlots: () => [],
      getPinnedSpellSlots: () => [],
      autoAssignSlot: () => -1,
      autoAssignPinnedSlot: () => -1,
    });

    const payloads = [];
    const onUpdate = (ev) => payloads.push(ev?.detail || null);
    window.addEventListener("ui:updateQuestTracker", onUpdate);
    hudFeeds.updateQuestTrackerHUD();
    window.removeEventListener("ui:updateQuestTracker", onUpdate);

    const target = payloads.at(-1)?.focused?.targetPosition;
    assertEquals(payloads.at(-1)?.focused?.destinationTemplateId, "rootbound_grotto");
    assertEquals(target?.label, "Rootbound Grotto");
    assertEquals(target?.x, 18);
    assertEquals(target?.y, 11);
  } finally {
    restoreWindow();
  }
});

import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { Devotion } from "../src/rules/components/Devotion.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Owner } from "../src/rules/components/Owner.js";
import { Pet } from "../src/rules/components/Pet.js";
import { Status } from "../src/rules/components/Status.js";
import { Traits } from "../src/rules/components/Traits.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Hunger } from "../src/rules/components/Hunger.js";
import { dealDamage } from "../src/rules/utils/dealDamage.js";
import {
  deitySystem,
  getDeityInstance,
  initDeity,
} from "../src/rules/systems/deitySystem.js";

Deno.test("deity wrath is applied in rules and emitted on world bus", () => {
  const world = new World({ seed: 0xC0FFEE });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Vitality)) {
    world.set(playerId, Vitality, { hp: 100, maxHp: 100 });
  } else world.add(playerId, Vitality, { hp: 100, maxHp: 100 });
  if (world.has(playerId, Status)) {
    world.set(playerId, Status, { statuses: [] });
  } else world.add(playerId, Status, { statuses: [] });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "molkhar" });
  } else world.add(playerId, Devotion, { deityId: "molkhar" });

  const deity = initDeity("molkhar", world);
  assert(deity, "deity should initialize");
  world.rand = () => 0;

  const damageEvents = [];
  const wrathEvents = [];
  world.on("damaged", (e) => damageEvents.push(e));
  world.on("deity:wrath", (e) => wrathEvents.push(e));

  deity._emit("wrath", { intensity: 1.0, tick: 100 });

  const vit = world.get(playerId, Vitality);
  const st = world.get(playerId, Status);
  assert(vit.hp < 100, "wrath should reduce hp");
  assert(vit.hp >= 5, "wrath should leave the player alive");
  assert(
    st.statuses.some((s) => s.type === "weakened"),
    "wrath should apply weakened",
  );
  assert(
    st.statuses.some((s) => s.type === "cursed"),
    "high wrath should apply cursed",
  );

  assertEquals(damageEvents.length, 1, "should emit one damage event");
  assertEquals(wrathEvents.length, 1, "should emit one deity:wrath event");
  assertEquals(wrathEvents[0].playerId, playerId);
  assertEquals(wrathEvents[0].cursed, true);
  assertEquals(wrathEvents[0].deityId, "molkhar");
});

Deno.test("deity demand and utterance are cooldown-gated and forwarded", () => {
  const world = new World({ seed: 0xa77a77 });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "molkhar" });
  } else world.add(playerId, Devotion, { deityId: "molkhar" });
  const deity = initDeity("molkhar", world);
  assert(deity, "deity should initialize");

  const demandEvents = [];
  const utteranceEvents = [];
  const moodEvents = [];
  world.on("deity:demand", (e) => demandEvents.push(e));
  world.on("deity:utterance", (e) => utteranceEvents.push(e));
  world.on("deity:moodShift", (e) => moodEvents.push(e));

  deity._emit("demand", { tick: 31, intensity: 0.8 });
  deity._emit("demand", { tick: 40, intensity: 0.8 }); // blocked by cooldown
  deity._emit("demand", { tick: 70, intensity: 0.8 }); // allowed

  deity._emit("utterance", {
    tick: 31,
    dominant: { dimension: "wrath", value: 0.7 },
  });
  deity._emit("utterance", {
    tick: 40,
    dominant: { dimension: "wrath", value: 0.7 },
  }); // blocked
  deity._emit("utterance", {
    tick: 70,
    dominant: { dimension: "serenity", value: 0.9 },
  }); // allowed

  deity._emit("moodShift", { to: "wrath" });

  assertEquals(demandEvents.length, 2);
  assertEquals(demandEvents[0].deityId, "molkhar");
  assertEquals(utteranceEvents.length, 2);
  assertEquals(moodEvents.length, 1);
  assertEquals(moodEvents[0].to, "wrath");
});

Deno.test("killing your own pet is a grave deity offense", () => {
  const world = new World({ seed: 0xFA11 });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "seraphine" });
  } else world.add(playerId, Devotion, { deityId: "seraphine" });

  initDeity("seraphine", world);
  deitySystem(world); // install listeners + baseline tick
  const deity = getDeityInstance("seraphine");
  assert(deity, "deity should initialize");
  const wrathBefore = deity._queryPrecise().wrath;

  const kittyId = world.create();
  world.add(kittyId, Pet);
  world.add(kittyId, Owner, { ownerId: playerId });
  world.add(kittyId, NamedIdentity, { name: "Kitty", identity: "kitty" });
  world.add(kittyId, Vitality, { hp: 1, maxHp: 1 });

  const offenses = [];
  world.on("deity:offense", (ev) => offenses.push(ev));

  const result = dealDamage(world, {
    target: kittyId,
    source: playerId,
    amount: 1,
    type: "physical",
    cause: "test_pet_murder",
    bypassInvuln: true,
    bypassResist: true,
  });
  assert(result.killed, "pet should die from killing blow");

  deitySystem(world); // process added desecration load
  const wrathAfter = deity._queryPrecise().wrath;

  assertEquals(offenses.length, 1, "should emit one deity offense");
  assertEquals(offenses[0].offense, "pet_murder");
  assertEquals(offenses[0].playerId, playerId);
  assert(wrathAfter > wrathBefore, "pet murder should increase wrath");
  assert(
    wrathAfter >= 0.45,
    "pet murder should be severe enough to enter danger territory",
  );
});

Deno.test("wrath damage scales from severity and can remove mercy floor", () => {
  const world = new World({ seed: 0x51A1 });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "molkhar" });
  } else world.add(playerId, Devotion, { deityId: "molkhar" });
  if (world.has(playerId, Vitality)) {
    world.set(playerId, Vitality, { hp: 100, maxHp: 100 });
  } else world.add(playerId, Vitality, { hp: 100, maxHp: 100 });
  if (world.has(playerId, Status)) {
    world.set(playerId, Status, { statuses: [] });
  } else world.add(playerId, Status, { statuses: [] });

  const deity = initDeity("molkhar", world);
  assert(deity, "deity should initialize");
  world.rand = () => 0;
  deitySystem(world); // install listeners

  const damageEvents = [];
  const wrathEvents = [];
  world.on("damaged", (e) => damageEvents.push(e));
  world.on("deity:wrath", (e) => wrathEvents.push(e));

  world.step = 100;
  deity._emit("wrath", { intensity: 1.0, tick: 100 });
  const baseDamage = Number(damageEvents[0]?.amount || 0);
  assert(baseDamage > 0, "baseline wrath should deal damage");
  assert(
    (world.get(playerId, Vitality)?.hp || 0) > 0,
    "baseline wrath should keep mercy floor",
  );

  // Reset health/status, then apply a horrifying offense severity payload.
  world.set(playerId, Vitality, { hp: 100, maxHp: 100 });
  world.set(playerId, Status, { statuses: [] });
  world.emit("deity:offense", {
    playerId,
    deityId: "molkhar",
    offense: "pet_corpse_desecration",
    severity: "horrifying",
    desecrateStacks: 48,
  });

  world.step = 140;
  deity._emit("wrath", { intensity: 1.0, tick: 140 });
  const scaledDamage = Number(damageEvents[1]?.amount || 0);
  const vit = world.get(playerId, Vitality);

  assert(
    scaledDamage > baseDamage,
    "severity should scale wrath damage above baseline",
  );
  assertEquals(
    vit?.hp || 0,
    0,
    "horrifying severity should remove mercy floor on high-intensity wrath",
  );
  assertEquals(wrathEvents.length, 2, "should emit both wrath events");
  assert(
    Number(wrathEvents[1]?.severityScale || 1) > 1,
    "scaled wrath event should report multiplier",
  );
  assert(
    Number(wrathEvents[1]?.wrathDebt || 0) > 0,
    "scaled wrath event should report wrath debt",
  );
});

Deno.test("fresh deity offense adds a short grace window before wrath lands", () => {
  const world = new World({ seed: 0x611ACE });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "molkhar" });
  } else world.add(playerId, Devotion, { deityId: "molkhar" });
  if (world.has(playerId, Vitality)) {
    world.set(playerId, Vitality, { hp: 100, maxHp: 100 });
  } else world.add(playerId, Vitality, { hp: 100, maxHp: 100 });
  if (world.has(playerId, Status)) {
    world.set(playerId, Status, { statuses: [] });
  } else world.add(playerId, Status, { statuses: [] });

  const deity = initDeity("molkhar", world);
  assert(deity, "deity should initialize");
  deitySystem(world);

  const wrathEvents = [];
  world.on("deity:wrath", (e) => wrathEvents.push(e));

  world.emit("deity:offense", {
    playerId,
    deityId: "molkhar",
    offense: "pet_corpse_desecration",
    severity: "horrifying",
    desecrateStacks: 48,
  });

  deity._emit("wrath", { intensity: 1.0, tick: 100 });

  assertEquals(
    world.get(playerId, Vitality)?.hp || 0,
    100,
    "wrath should not strike in the offense turn",
  );
  assertEquals(
    wrathEvents.length,
    0,
    "grace window should suppress immediate wrath events",
  );
});

Deno.test("wrath rolls begin on turn four, cap at ten percent, and recover after a hit", () => {
  const world = new World({ seed: 0x180 });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) world.set(playerId, Devotion, { deityId: "molkhar" });
  else world.add(playerId, Devotion, { deityId: "molkhar" });
  if (world.has(playerId, Vitality)) world.set(playerId, Vitality, { hp: 100, maxHp: 100 });
  else world.add(playerId, Vitality, { hp: 100, maxHp: 100 });
  if (world.has(playerId, Status)) world.set(playerId, Status, { statuses: [] });
  else world.add(playerId, Status, { statuses: [] });
  const deity = initDeity("molkhar", world);
  assert(deity, "deity should initialize");
  deitySystem(world);

  const wrathEvents = [];
  world.on("deity:wrath", (event) => wrathEvents.push(event));
  let rolls = 0;
  world.rand = () => {
    rolls++;
    return 0;
  };

  world.emit("deity:offense", {
    playerId,
    deityId: "molkhar",
    offense: "pet_corpse_desecration",
    severity: "horrifying",
    desecrateStacks: 48,
  });

  for (let turn = 0; turn <= 3; turn++) {
    world.step = turn;
    deity._emit("wrath", { intensity: 1, tick: turn + 1 });
  }
  assertEquals(rolls, 0, "offense grace should cover turns zero through three");
  assertEquals(wrathEvents.length, 0, "grace should prevent early lightning");

  world.step = 4;
  deity._emit("wrath", { intensity: 1, tick: 5 });
  deity._emit("wrath", { intensity: 1, tick: 6 });
  assertEquals(rolls, 1, "a committed turn should receive only one wrath roll");
  assertEquals(wrathEvents.length, 1, "the eligible high-wrath turn should strike");

  for (let turn = 5; turn <= 8; turn++) {
    world.step = turn;
    deity._emit("wrath", { intensity: 1, tick: turn + 1 });
  }
  assertEquals(rolls, 1, "successful wrath should recover for four turns");

  world.step = 9;
  deity._emit("wrath", { intensity: 1, tick: 10 });
  assertEquals(rolls, 2, "wrath should resume rolling after recovery");
  assertEquals(wrathEvents.length, 2, "recovered wrath should be able to strike again");
});

Deno.test("wrath odds are nonzero near threshold and capped at ten percent", () => {
  const makeWorld = (seed) => {
    const world = new World({ seed });
    const playerId = createPlayer(world, { name: "Hero" });
    if (world.has(playerId, Devotion)) world.set(playerId, Devotion, { deityId: "molkhar" });
    else world.add(playerId, Devotion, { deityId: "molkhar" });
    if (world.has(playerId, Vitality)) world.set(playerId, Vitality, { hp: 100, maxHp: 100 });
    else world.add(playerId, Vitality, { hp: 100, maxHp: 100 });
    if (world.has(playerId, Status)) world.set(playerId, Status, { statuses: [] });
    else world.add(playerId, Status, { statuses: [] });
    const deity = initDeity("molkhar", world);
    deitySystem(world);
    return { world, deity };
  };

  const near = makeWorld(0x181);
  const nearEvents = [];
  near.world.on("deity:wrath", (event) => nearEvents.push(event));
  near.world.rand = () => 0.009;
  near.world.step = 4;
  near.deity._emit("wrath", {
    intensity: near.deity._thresholds.wrath + 0.0001,
    tick: 1,
  });
  assertEquals(nearEvents.length, 1, "wrath just above threshold should have a nonzero chance");

  const capped = makeWorld(0x182);
  const cappedEvents = [];
  capped.world.on("deity:wrath", (event) => cappedEvents.push(event));
  capped.world.rand = () => 0.1;
  capped.world.step = 4;
  capped.deity._emit("wrath", { intensity: 1, tick: 1 });
  assertEquals(cappedEvents.length, 0, "the maximum strike chance must not exceed ten percent");
  capped.world.rand = () => 0;
  capped.world.step = 5;
  capped.deity._emit("wrath", { intensity: 1, tick: 2 });
  assertEquals(cappedEvents.length, 1, "a missed roll must not start recovery");

  const below = makeWorld(0x183);
  let belowRolls = 0;
  below.world.rand = () => {
    belowRolls++;
    return 0;
  };
  below.world.step = 4;
  below.deity._emit("wrath", {
    intensity: below.deity._thresholds.wrath - 0.01,
    tick: 1,
  });
  assertEquals(belowRolls, 0, "wrath below threshold must not roll");
});

Deno.test("shrine touch records deity communion on the deity ledger", () => {
  const world = new World({ seed: 0xC0DE });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "seraphine" });
  } else world.add(playerId, Devotion, { deityId: "seraphine" });

  const deity = initDeity("seraphine", world);
  assert(deity, "deity should initialize");
  deitySystem(world); // install listeners + baseline tick

  const communionEvents = [];
  world.on("shrine:communion", (e) => communionEvents.push(e));

  world.emit("shrine:touch", { actor: playerId, targetId: 321 });
  assertEquals(communionEvents.length, 1);
  assertEquals(communionEvents[0].effect, "blessing");
  assertEquals(communionEvents[0].deityId, "seraphine");
  assertEquals(
    deity.ledger.ticksSinceLast("pray"),
    0,
    "shrine should register an immediate prayer",
  );
  assertEquals(
    deity.ledger.ticksSinceLast("offer"),
    0,
    "shrine should register an immediate offering",
  );
});

Deno.test("shrine touch is cooldown-gated to prevent spam", () => {
  const world = new World({ seed: 0x5A11 });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "seraphine" });
  } else world.add(playerId, Devotion, { deityId: "seraphine" });

  initDeity("seraphine", world);
  deitySystem(world); // install listeners

  const communionEvents = [];
  world.on("shrine:communion", (e) => communionEvents.push(e));

  world.emit("shrine:touch", { actor: playerId, targetId: 900 });
  world.emit("shrine:touch", { actor: playerId, targetId: 900 });

  assertEquals(
    communionEvents.length,
    2,
    "both shrine touches should emit outcome events",
  );
  assertEquals(communionEvents[0].effect, "blessing");
  assertEquals(communionEvents[1].effect, "cooldown");
  assert(
    Number(communionEvents[1].cooldownRemaining || 0) > 0,
    "cooldown event should report remaining turns",
  );
});

Deno.test("gluttonous trait slightly boosts deity food miracle output", () => {
  function hungerAfterMiracle(gluttonous) {
    const world = new World({ seed: gluttonous ? 0xA11CE : 0xBEEF });
    const playerId = createPlayer(world, {
      name: gluttonous ? "Glutton" : "Normal",
    });
    if (world.has(playerId, Devotion)) {
      world.set(playerId, Devotion, { deityId: "seraphine" });
    } else world.add(playerId, Devotion, { deityId: "seraphine" });
    if (world.has(playerId, Hunger)) {
      world.set(playerId, Hunger, { hunger: 900, satiation: 0 });
    } else world.add(playerId, Hunger, { hunger: 900, satiation: 0 });
    if (gluttonous) {
      if (world.has(playerId, Traits)) {
        world.set(playerId, Traits, { gluttonous: true });
      } else world.add(playerId, Traits, { gluttonous: true });
    }

    const deity = initDeity("seraphine", world);
    deitySystem(world); // install listeners
    deity._emit("miracle", { serenity: 1, tick: 100 });
    return Number(world.get(playerId, Hunger)?.hunger || 0);
  }

  const normalAfter = hungerAfterMiracle(false);
  const gluttonAfter = hungerAfterMiracle(true);
  assert(
    gluttonAfter < normalAfter,
    "gluttonous miracle should reduce hunger more than normal",
  );
  assert(
    (normalAfter - gluttonAfter) >= 70,
    "gluttonous bonus should be a meaningful but modest bump",
  );
});

Deno.test("deity reads food events and records approval/offense actions", () => {
  const world = new World({ seed: 0xF00D });
  const playerId = createPlayer(world, { name: "Hero" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "seraphine" });
  } else world.add(playerId, Devotion, { deityId: "seraphine" });
  if (world.has(playerId, Traits)) {
    world.set(playerId, Traits, { gluttonous: true });
  } else world.add(playerId, Traits, { gluttonous: true });

  initDeity("seraphine", world);
  deitySystem(world); // install listeners
  const deity = getDeityInstance("seraphine");
  assert(deity, "deity should initialize");

  world.emit("hunger:ate", { actor: playerId, nutrition: 700 });
  world.emit("hunger:sickened", { actor: playerId, type: "decay" });

  const actions = deity.ledger.ofType("action");
  const createFood = actions.some((e) =>
    e?.meta?.actionType === "create" && e?.meta?.target === "food"
  );
  const betrayFood = actions.some((e) =>
    e?.meta?.actionType === "betray" &&
    String(e?.meta?.target || "").startsWith("food_")
  );
  assert(createFood, "hunger:ate should register a deity create(food) action");
  assert(
    betrayFood,
    "hunger:sickened should register a deity betray(food_*) action",
  );
});

Deno.test("ascetic milestone can please deities that value restraint", () => {
  const world = new World({ seed: 0xA5C37 });
  const playerId = createPlayer(world, { name: "Ascetic" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "seraphine" });
  } else world.add(playerId, Devotion, { deityId: "seraphine" });
  if (world.has(playerId, Hunger)) {
    world.set(playerId, Hunger, { hunger: 900, satiation: 0 });
  } else world.add(playerId, Hunger, { hunger: 900, satiation: 0 });

  initDeity("seraphine", world);
  deitySystem(world);
  const deity = getDeityInstance("seraphine");
  assert(deity, "deity should initialize");

  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });

  const offers = deity.ledger.ofType("offer");
  assert(
    offers.some((e) => e?.meta?.offeringType === "discipline"),
    "disciplined hunger behavior should trigger Seraphine ascetic milestone hook",
  );
});

Deno.test("ascetic lapses can displease restraint-focused deities", () => {
  const world = new World({ seed: 0xA5C38 });
  const playerId = createPlayer(world, { name: "Glutton" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "seraphine" });
  } else world.add(playerId, Devotion, { deityId: "seraphine" });
  if (world.has(playerId, Hunger)) {
    world.set(playerId, Hunger, { hunger: 0, satiation: 120 });
  } else world.add(playerId, Hunger, { hunger: 0, satiation: 120 });

  initDeity("seraphine", world);
  deitySystem(world);
  const deity = getDeityInstance("seraphine");
  assert(deity, "deity should initialize");

  world.emit("hunger:ate", { actor: playerId, nutrition: 80 });

  const actions = deity.ledger.ofType("action");
  assert(
    actions.some((e) =>
      e?.meta?.actionType === "betray" && e?.meta?.target === "gluttony"
    ),
    "overeating should trigger Seraphine ascetic lapse hook",
  );
});

Deno.test("loki treats ascetic discipline as boring and lapses as amusing", () => {
  const world = new World({ seed: 0x10A1 });
  const playerId = createPlayer(world, { name: "Trickster" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "loki" });
  } else world.add(playerId, Devotion, { deityId: "loki" });
  if (world.has(playerId, Hunger)) {
    world.set(playerId, Hunger, { hunger: 900, satiation: 0 });
  } else world.add(playerId, Hunger, { hunger: 900, satiation: 0 });

  initDeity("loki", world);
  deitySystem(world);
  const deity = getDeityInstance("loki");
  assert(deity, "deity should initialize");

  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });

  let actions = deity.ledger.ofType("action");
  assert(
    actions.some((e) =>
      e?.meta?.actionType === "betray" && e?.meta?.target === "austerity"
    ),
    "Loki should dislike strict ascetic discipline",
  );

  world.set(playerId, Hunger, { hunger: 0, satiation: 80 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 80 });

  actions = deity.ledger.ofType("action");
  assert(
    actions.some((e) =>
      e?.meta?.actionType === "steal" && e?.meta?.target === "indulgent_prank"
    ),
    "Loki should enjoy indulgent lapses",
  );
});

Deno.test("molkhar rewards lapses and disdains ascetic restraint", () => {
  const world = new World({ seed: 0xA01C });
  const playerId = createPlayer(world, { name: "Raider" });
  if (world.has(playerId, Devotion)) {
    world.set(playerId, Devotion, { deityId: "molkhar" });
  } else world.add(playerId, Devotion, { deityId: "molkhar" });
  if (world.has(playerId, Hunger)) {
    world.set(playerId, Hunger, { hunger: 900, satiation: 0 });
  } else world.add(playerId, Hunger, { hunger: 900, satiation: 0 });

  initDeity("molkhar", world);
  deitySystem(world);
  const deity = getDeityInstance("molkhar");
  assert(deity, "deity should initialize");

  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 100 });

  let actions = deity.ledger.ofType("action");
  assert(
    actions.some((e) =>
      e?.meta?.actionType === "betray" && e?.meta?.target === "austerity"
    ),
    "Mol'Khar should disdain ascetic restraint",
  );

  world.set(playerId, Hunger, { hunger: 0, satiation: 80 });
  world.emit("hunger:ate", { actor: playerId, nutrition: 80 });

  const offers = deity.ledger.ofType("offer");
  assert(
    offers.some((e) => e?.meta?.offeringType === "indulgence"),
    "Mol'Khar should treat indulgent lapses as offerings",
  );
});

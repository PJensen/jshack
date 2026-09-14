import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getMonster } from "../src/rules/data/monsters.js";
import { CombatCallbackContext, bonusDamageIfTargetAfflicted, phaseOutOnDamaged } from "../src/rules/data/callbacks/combat.js";
import { runCallbackList } from "../src/rules/interaction/dispatch.js";
import { hasEffect } from "../src/rules/utils/statusFacade.js";

Deno.test("bonusDamageIfTargetAfflicted adds damage and emits when defender is afflicted", () => {
  const world = new World({ seed: 77 });
  const attacker = world.create();
  const defender = world.create();
  world.add(defender, ActiveEffects, { effects: [{ key: "bleed", turnsLeft: 3, potency: 1, stacks: 1 }] });

  let payload = null;
  world.on("proc:shade_feed", (evt) => { payload = evt; });

  const frame = { attacker, defender, damage: 5 };
  const ctx = new CombatCallbackContext(world, frame);
  runCallbackList([bonusDamageIfTargetAfflicted(3, ["bleed", "poison", "disease", "burn"], "proc:shade_feed")], ctx);

  assertEquals(frame.damage, 8);
  assert(payload && payload.actor === attacker && payload.target === defender);
});

Deno.test("bonusDamageIfTargetAfflicted does nothing when defender has no matching effects", () => {
  const world = new World({ seed: 78 });
  const attacker = world.create();
  const defender = world.create();
  world.add(defender, ActiveEffects, { effects: [{ key: "regen", turnsLeft: 3, potency: 1, stacks: 1 }] });

  const frame = { attacker, defender, damage: 5 };
  const ctx = new CombatCallbackContext(world, frame);
  runCallbackList([bonusDamageIfTargetAfflicted(3, ["bleed", "poison", "disease", "burn"], "proc:shade_feed")], ctx);

  assertEquals(frame.damage, 5);
});

Deno.test("phaseOutOnDamaged heals, adds invulnerable, emits, and cancels later callbacks", () => {
  const world = new World({ seed: 79 });
  const attacker = world.create();
  const defender = world.create();
  world.add(defender, Vitality, { maxHp: 20, hp: 10 });

  let payload = null;
  world.on("proc:phased", (evt) => { payload = evt; });

  const frame = {
    attacker,
    defender,
    damage: 4,
    heal: (entity, amount) => {
      const vit = world.get(entity, Vitality);
      if (!vit) return;
      vit.hp = Math.min(vit.maxHp, vit.hp + Math.max(0, amount | 0));
    },
  };
  const ctx = new CombatCallbackContext(world, frame);
  let tailRan = false;
  runCallbackList([
    phaseOutOnDamaged(100, 0xdead0102),
    () => { tailRan = true; },
  ], ctx);

  const vit = world.get(defender, Vitality);
  assert(vit, "defender vitality should exist");
  assertEquals(vit.hp, 14);
  assertEquals(ctx.cancelled, true);
  assertEquals(tailRan, false);
  assert(payload && payload.actor === defender && payload.attacker === attacker && payload.amount === 4);

  assertEquals(hasEffect(world, defender, "invulnerable"), true, "phase out should apply invulnerable");
});

Deno.test("carrion shade hooks chain affliction setup into next pre-hit bonus", () => {
  const shade = getMonster("carrion_shade");
  assert(shade, "carrion shade must exist");
  assert(Array.isArray(shade.hooks?.onHit) && shade.hooks.onHit.length === 2, "shade should chain two onHit callbacks");
  assert(Array.isArray(shade.hooks?.onBeforeHit) && shade.hooks.onBeforeHit.length === 1, "shade should have one onBeforeHit callback");
  assert(Array.isArray(shade.hooks?.onDamaged) && shade.hooks.onDamaged.length === 1, "shade should have one onDamaged callback");

  let foundBleedThenFeed = false;
  for (let seed = 0; seed < 4096; seed++) {
    const world = new World({ seed });
    const attacker = world.create();
    const defender = world.create();

    const onHitCtx = new CombatCallbackContext(world, { attacker, defender, damage: 6 });
    runCallbackList(shade.hooks.onHit, onHitCtx);

    const ae = world.get(defender, ActiveEffects);
    const bled = !!(ae && Array.isArray(ae.effects) && ae.effects.some((e) => e.key === "bleed"));
    if (!bled) continue;

    const beforeCtxFrame = { attacker, defender, damage: 6 };
    const beforeCtx = new CombatCallbackContext(world, beforeCtxFrame);
    runCallbackList(shade.hooks.onBeforeHit, beforeCtx);

    assertEquals(beforeCtxFrame.damage, 9);
    foundBleedThenFeed = true;
    break;
  }

  assert(foundBleedThenFeed, "expected at least one deterministic seed where bleed enables shade feed");
});

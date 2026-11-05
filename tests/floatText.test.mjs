import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { FloatText } from "../src/display/passes/vfx/text/floatText.js";
import { installFloatTextWiring } from "../src/display/ui/wiring/floatTextWiring.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { applyHealing } from "../src/rules/utils/applyHealing.js";

Deno.test("floatText addStatus respects caller overrides", () => {
  const ftext = new FloatText();
  const rec = ftext.addStatus(4, 5, "GAZE 4/5", {
    color: "#ff5fd2",
    life: 1.25,
    scaleStart: 1.4,
    scaleEnd: 0.9,
  });

  assertEquals(rec.color, "#ff5fd2");
  assertEquals(rec.life, 1.25);
  assertEquals(rec.scaleStart, 1.4);
  assertEquals(rec.scaleEnd, 0.9);
});

Deno.test("floatText addBanner uses large banner flavor", () => {
  const ftext = new FloatText();
  const rec = ftext.addBanner(4, 5, "QUEST COMPLETE!", {
    color: "#ffd85a",
    life: 2.5,
    scaleStart: 1.8,
    scaleEnd: 1.0,
  });

  assertEquals(rec.color, "#ffd85a");
  assertEquals(rec.life, 2.5);
  assertEquals(rec.scaleStart, 1.8);
  assertEquals(rec.scaleEnd, 1.0);
  assertEquals(rec.flavor, "banner");
});

Deno.test("floatText wiring restores damage number emission with crit and delay", () => {
  const world = new World({ seed: 7 });
  const target = world.create();
  const source = world.create();
  const calls = [];
  const ftext = {
    addStatus() {},
    addHeal() {},
    addDamage(x, y, amount, opts) { calls.push({ x, y, amount, opts }); },
  };
  const fx = { pool: { spawn() {} } };
  const getPosition = (id) => {
    if (id === target) return { x: 3, y: 4 };
    if (id === source) return { x: 1, y: 4 };
    return null;
  };

  installFloatTextWiring({
    world,
    ftext,
    fx,
    getPosition,
    isPet: () => false,
    isPlayer: (id) => id === target,
  });

  world.emit("damaged", {
    target,
    source,
    amount: 12,
    rawAmount: 14,
    type: "pierce",
    cause: "ranged",
    critical: true,
    projectileDelay: 0.25,
    goreType: "blood",
    targetKind: "player",
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].x, 3.5);
  assertEquals(calls[0].y, 3.7);
  assertEquals(calls[0].amount, 12);
  assertEquals(calls[0].opts?.crit, true);
  assertEquals(calls[0].opts?.delay, 0.25);
  assertEquals(calls[0].opts?.color, "#ff6060");
});

Deno.test("floatText wiring shows canonical healing at target with actual amount", () => {
  const world = new World({ seed: 10 });
  const target = world.create();
  world.add(target, Position, { x: 3, y: 4 });
  world.add(target, Vitality, { hp: 7, maxHp: 10 });
  const calls = [];
  const ftext = {
    addStatus() {},
    addHeal(x, y, amount, opts) { calls.push({ x, y, amount, opts }); },
    addDamage() {},
  };

  installFloatTextWiring({
    world,
    ftext,
    fx: { pool: { spawn() {} } },
    getPosition: (id) => (id === target ? { x: 3, y: 4 } : null),
    isVisibleAt: () => true,
    isPet: () => false,
    isPlayer: () => false,
  });

  const result = applyHealing(world, { target, amount: 9, cause: "potion" });

  assertEquals(result.amount, 3);
  assertEquals(calls.length, 1);
  assertEquals(calls[0], { x: 3, y: 4, amount: 3, opts: { color: "#7BFF7B" } });
});

Deno.test("floatText healing contract supports legacy id and filters hidden or zero outcomes", () => {
  const world = new World({ seed: 11 });
  const target = world.create();
  const calls = [];
  const ftext = {
    addStatus() {},
    addHeal(...args) { calls.push(args); },
    addDamage() {},
  };

  installFloatTextWiring({
    world,
    ftext,
    fx: { pool: { spawn() {} } },
    getPosition: (id) => (id === target ? { x: 6, y: 7 } : null),
    isVisibleAt: (x, y) => x === 6 && y === 7,
    isPet: () => false,
    isPlayer: () => false,
  });

  world.emit("healed", { id: target, amount: 2 });
  world.emit("healed", { target, id: target + 1, amount: 4 });
  world.emit("healed", { target, amount: 0 });
  world.emit("healed", { target, amount: -1 });
  world.emit("healed", { target: target + 1, amount: 5 });

  assertEquals(calls.length, 2);
  assertEquals(calls[0], [6, 7, 2, { color: "#7BFF7B" }]);
  assertEquals(calls[1], [6, 7, 4, { color: "#7BFF7B" }]);
});

Deno.test("floatText healing installation is idempotent and damage stays on damage path", () => {
  const world = new World({ seed: 12 });
  const target = world.create();
  const heals = [];
  const damages = [];
  const ftext = {
    addStatus() {},
    addHeal(...args) { heals.push(args); },
    addDamage(...args) { damages.push(args); },
  };
  const deps = {
    world,
    ftext,
    fx: { pool: { spawn() {} } },
    getPosition: (id) => (id === target ? { x: 2, y: 3 } : null),
    isVisibleAt: () => true,
    isPet: () => false,
    isPlayer: () => false,
  };

  installFloatTextWiring(deps);
  installFloatTextWiring(deps);
  world.emit("healed", { target, amount: 1 });
  world.emit("damaged", { target, amount: 4, at: { x: 2, y: 3 } });

  assertEquals(heals.length, 1);
  assertEquals(damages.length, 1);
});

Deno.test("floatText wiring shows quest progress status text", () => {
  const world = new World({ seed: 8 });
  const player = world.create();
  const calls = [];
  const ftext = {
    addStatus(x, y, text, opts) { calls.push({ x, y, text, opts }); },
    addHeal() {},
    addDamage() {},
    addGold() {},
  };
  const fx = { pool: { spawn() {} } };

  installFloatTextWiring({
    world,
    ftext,
    fx,
    getPosition: (id) => (id === player ? { x: 6, y: 7 } : null),
    isPet: () => false,
    isPlayer: (id) => id === player,
  });

  world.emit("quest:progress", {
    questId: "starter.rat_infestation",
    playerId: player,
    progress: 3,
    target: 5,
    label: "RATS",
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].x, 6);
  assertEquals(calls[0].y, 6.05);
  assertEquals(calls[0].text, "RATS 3/5");
  assertEquals(calls[0].opts?.color, "#ffd85a");
});

Deno.test("floatText wiring shows quest completion banner text", () => {
  const world = new World({ seed: 9 });
  const player = world.create();
  const calls = [];
  const ftext = {
    addStatus() {},
    addBanner(x, y, text, opts) { calls.push({ x, y, text, opts }); },
    addHeal() {},
    addDamage() {},
    addGold() {},
  };
  const fx = { pool: { spawn() {} } };

  installFloatTextWiring({
    world,
    ftext,
    fx,
    getPosition: (id) => (id === player ? { x: 8, y: 5 } : null),
    isPet: () => false,
    isPlayer: (id) => id === player,
  });

  world.emit("quest:completed", {
    questId: "starter.rat_infestation",
    playerId: player,
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].x, 8);
  assertEquals(calls[0].y, 4.1);
  assertEquals(calls[0].text, "QUEST COMPLETE!");
  assertEquals(calls[0].opts?.color, "#ffd85a");
});

import { assert, assertEquals } from "jsr:@std/assert";

import {
  eventStats,
  filterRows,
  scanText,
  toCsv,
} from "../.agents/skills/agent-tools/scripts/event-bus-explorer.mjs";
import { parseImports, parseRegistrations } from "../.agents/skills/agent-tools/scripts/system-map.mjs";
import {
  classify as classifyImportBoundary,
  layerOf,
  normalizeImport,
} from "../.agents/skills/agent-tools/scripts/import-boundary-report.mjs";
import {
  classify as classifyTarget,
  scoreMatch,
} from "../.agents/skills/agent-tools/scripts/agent-target.mjs";
import { classify as classifyContentId } from "../.agents/skills/agent-tools/scripts/content-id-audit.mjs";
import {
  auditItems,
  filterItems,
  formatReport,
} from "../.agents/skills/agent-tools/scripts/item-rarity-audit.mjs";
import {
  classifyNondeterminism,
  classifySystemCall,
  formatHealthReport,
  normalizeImport as normalizeHealthImport,
} from "../.agents/skills/agent-tools/scripts/agent-health.mjs";

Deno.test("event-bus explorer extracts literal producers, consumers, payload keys, and dynamic calls", () => {
  const rows = scanText(
    "src/rules/systems/exampleSystem.js",
    `
    world.emit("damaged", { target, amount, source });
    world.on("damaged", ({ target, amount }) => {});
    ctx.io.emit("spell:miss", { actor, targetId });
    world.emit(eventName, payload);
  `,
  );

  assertEquals(rows.map((r) => [r.event, r.kind, r.api, r.payloadKeys]), [
    ["damaged", "producer", "world.emit", "target|amount|source"],
    ["damaged", "consumer", "world.on", "target|amount"],
    ["spell:miss", "producer", "ctx.io.emit", "actor|targetId"],
    ["(dynamic:eventName)", "producer", "world.emit", ""],
  ]);

  const stats = eventStats(rows);
  assertEquals(stats.find((r) => r.event === "damaged")?.producers, 1);
  assertEquals(stats.find((r) => r.event === "damaged")?.consumers, 1);
});

Deno.test("event-bus explorer orphan filters are stable", () => {
  const rows = scanText(
    "src/main/wiring/example.js",
    `
    world.emit("producer:only", {});
    world.on("consumer:only", () => {});
    world.emit("paired", {});
    world.on("paired", () => {});
  `,
  );

  const producerOnly = filterRows(rows, {
    producerOnly: true,
    consumerOnly: false,
    orphans: false,
  });
  const consumerOnly = filterRows(rows, {
    producerOnly: false,
    consumerOnly: true,
    orphans: false,
  });
  const orphans = filterRows(rows, {
    producerOnly: false,
    consumerOnly: false,
    orphans: true,
  });

  assertEquals(producerOnly.map((r) => r.event), ["producer:only"]);
  assertEquals(consumerOnly.map((r) => r.event), ["consumer:only"]);
  assertEquals(orphans.map((r) => r.event).sort(), [
    "consumer:only",
    "producer:only",
  ]);
  assert(
    toCsv(producerOnly).startsWith(
      "event,kind,api,layer,file,line,payload_keys,dynamic",
    ),
  );
});

Deno.test("system-map parses imports and scheduler registrations", () => {
  const schedulerText = `
    import { movementSystem } from "../rules/systems/movementSystem.js";
    import { castSpellSystem as cast } from "../rules/systems/castSpellSystem.js";
    registerSystem(movementSystem, "intents");
    registerSystem(cast, 'intents');
  `;
  const imports = parseImports(schedulerText);
  const rows = parseRegistrations(schedulerText, imports);

  assertEquals(imports.get("movementSystem"), "movementSystem.js");
  assertEquals(imports.get("cast"), "castSpellSystem.js");
  assertEquals(rows, [
    { name: "movementSystem", phase: "intents", file: "movementSystem.js" },
    { name: "cast", phase: "intents", file: "castSpellSystem.js" },
  ]);
});

Deno.test("import-boundary report classifies forbidden and suspicious layer edges", () => {
  assertEquals(layerOf("src/rules/systems/foo.js"), "rules");
  assertEquals(
    normalizeImport("src/rules/systems/foo.js", "../../display/ui/hud.js"),
    "src/display/ui/hud.js",
  );
  assertEquals(
    classifyImportBoundary("rules", "src/display/ui/hud.js"),
    "violation",
  );
  assertEquals(
    classifyImportBoundary("display", "src/rules/components/Position.js"),
    "violation",
  );
  assertEquals(
    classifyImportBoundary("main", "src/rules/components/Position.js"),
    "main-cross-layer",
  );
  assertEquals(
    classifyImportBoundary("bridge", "src/rules/components/Position.js"),
    "",
  );
});

Deno.test("agent-target ranks exact event hits before loose text hits", () => {
  const eventRow = {
    kind: classifyTarget(`world.on("damaged", () => {})`, "damaged"),
    file: "src/display/a.js",
    line: 1,
    text: `world.on("damaged", () => {})`,
  };
  const looseRow = {
    kind: classifyTarget("damageDice: '1d6'", "damaged"),
    file: "src/content/items.js",
    line: 1,
    text: "damageDice: '1d6'",
  };

  assertEquals(eventRow.kind, "event");
  assertEquals(looseRow.kind, "text");
  assert(scoreMatch(eventRow, "damaged") < scoreMatch(looseRow, "damaged"));
});

Deno.test("content-id audit classifies definitions, tests, visuals, and references", () => {
  assertEquals(
    classifyContentId(
      "src/content/monsters/humanoids.js",
      "defineMonster('goblin', {",
      "goblin",
    ),
    "definition",
  );
  assertEquals(
    classifyContentId(
      "src/display/palette/monsters.js",
      "goblin: { glyph: 'g' }",
      "goblin",
    ),
    "visual",
  );
  assertEquals(
    classifyContentId(
      "tests/monsterVariety.test.mjs",
      "assert(getMonster('goblin'))",
      "goblin",
    ),
    "test",
  );
  assertEquals(
    classifyContentId(
      "src/rules/data/lootTables.js",
      "drop: 'goblin_shiv'",
      "goblin",
    ),
    "spawn-loot",
  );
});

Deno.test("item-rarity audit sorts, filters, and flags legacy slots deterministically", () => {
  const items = auditItems([
    { id: "zeta", name: "Zeta", catalogKind: "magic", type: "potion", rarity: 2, rarityName: "magic", tags: ["artifact"] },
    { id: "alpha", name: "Alpha", catalogKind: "equipment", type: "equip", slot: "weapon", rarity: 2, rarityName: "uncommon", tags: ["unique"] },
  ]);
  assertEquals(items.map((item) => item.id), ["alpha", "zeta"]);
  assertEquals(filterItems(items, { kind: "equipment", rarity: "", gearOnly: true, issues: false }).length, 1);
  assertEquals(filterItems(items, { kind: "", rarity: "", gearOnly: false, issues: true }).map((item) => item.id), ["zeta"]);
  assert(formatReport(items, "csv").startsWith("id,name,catalogKind,type,slot,rarity,rarityName"));
  assert(formatReport(items, "csv").includes("unique"));
});

Deno.test("agent-health formatting and path normalization are import-safe", () => {
  assertEquals(
    normalizeHealthImport("src/rules/systems/foo.js", "../utils/bar.js"),
    "src/rules/utils/bar.js",
  );
  const text = formatHealthReport({
    src: ["src/a.js", "src/b.js"],
    systems: { registered: 2, files: 3 },
    emitSafe: [],
    rulesNondeterminism: [{
      file: "src/rules/x.js",
      line: 1,
      text: "Math.random()",
    }],
    generationAsync: [{
      file: "src/rules/environment/dungeon/index.js",
      line: 1,
      text: "await generateFloor()",
    }],
    directSystemCalls: [],
    systemCallNotes: [{
      file: "src/rules/systems/plasmaCloudSystem.js",
      line: 10,
      text: "hazardSystem(world);",
      kind: "compatibility-shim",
    }],
    boundaries: [],
  });
  assert(text.includes("files scanned: 2"));
  assert(text.includes("emitSafe refs: 0"));
  assert(text.includes("rules nondeterminism hazards: 1"));
  assert(text.includes("generation async allowances: 1"));
  assert(text.includes("[compatibility-shim]"));
});

Deno.test("agent-health classifies known health leads before reporting", () => {
  assertEquals(
    classifyNondeterminism({
      file: "src/rules/environment/dungeon/index.js",
      line: 1,
      text: "await generateFloor()",
    }),
    "generation-async",
  );
  assertEquals(
    classifyNondeterminism({
      file: "src/rules/systems/badSystem.js",
      line: 1,
      text: "Math.random()",
    }),
    "rules-hazard",
  );
  assertEquals(
    classifySystemCall({
      file: "src/rules/systems/interactionSystem.js",
      line: 40,
      text: "InteractionSystem(world, actor, target);",
    }),
    "local-dispatch-helper",
  );
  assertEquals(
    classifySystemCall({
      file: "src/rules/systems/plasmaCloudSystem.js",
      line: 10,
      text: "hazardSystem(world);",
    }),
    "compatibility-shim",
  );
  assertEquals(
    classifySystemCall({
      file: "src/rules/systems/fooSystem.js",
      line: 10,
      text: "barSystem(world);",
    }),
    "possible-violation",
  );
});

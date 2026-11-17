import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { getParent } from "../src/lib/ecs-js/hierarchy.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { Disposition } from "../src/rules/components/Disposition.js";
import { Faction } from "../src/rules/components/Faction.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Position } from "../src/rules/components/Position.js";
import { ShopInventory } from "../src/rules/components/ShopInventory.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { OFFENSE_ATTRIBUTION, OFFENSE_KINDS, OFFENSE_SEVERITY } from "../src/rules/data/offenses.js";
import { AttackDirectionIntent } from "../src/rules/components/Intents/AttackDirectionIntent.js";
import { attackDirectionSystem } from "../src/rules/systems/attackDirectionSystem.js";
import { combatSystem } from "../src/rules/systems/combatSystem.js";
import {
  applyOffenseDisposition,
  getDispositionRecord,
  installDispositionOffenseListeners,
  shopDispositionTerms,
} from "../src/rules/utils/disposition.js";
import { recordShopClaim } from "../src/rules/utils/shopClaims.js";

function addActor(world, faction, x = 0, y = 0, name = faction) {
  const id = world.create();
  world.add(id, Faction, { key: faction });
  world.add(id, Position, { x, y });
  world.add(id, Vitality, { hp: 30, maxHp: 30 });
  world.add(id, NamedIdentity, { name, identity: name.toLowerCase() });
  return id;
}

Deno.test("offense disposition creates durable victim and witness opinions", () => {
  const world = new World({ seed: 4101 });
  const player = addActor(world, "player");
  const shopkeeper = addActor(world, "shopkeeper");
  const witness = addActor(world, "townfolk");

  const result = applyOffenseDisposition(world, {
    actorId: player,
    victimId: shopkeeper,
    witnessIds: [witness],
    offense: { offenseKind: OFFENSE_KINDS.assault, severity: OFFENSE_SEVERITY.serious },
    collectWitnesses: false,
  });

  assert(result, "offense should apply disposition");
  const victimDisposition = getDispositionRecord(world, shopkeeper, player);
  const witnessDisposition = getDispositionRecord(world, witness, player);
  assert(victimDisposition, "victim should remember offense");
  assert(witnessDisposition, "witness should remember offense");
  assertEquals(victimDisposition.score, -18);
  assertEquals(witnessDisposition.score, -9);
  assertEquals(getParent(world, victimDisposition.id), shopkeeper);
  assertEquals(world.has(victimDisposition.id, Disposition), true);
});

Deno.test("serious disposition can request and seed tactical aggro", () => {
  const world = new World({ seed: 4102 });
  const player = addActor(world, "player", 4, 5);
  const shopkeeper = addActor(world, "shopkeeper", 5, 5);
  world.add(shopkeeper, AggroState, { alertLevel: AGGRO_LEVELS.unaware });
  const requests = [];
  world.on("disposition:aggro-requested", (ev) => requests.push(ev));

  applyOffenseDisposition(world, {
    actorId: player,
    victimId: shopkeeper,
    offense: { offenseKind: OFFENSE_KINDS.assault, severity: OFFENSE_SEVERITY.serious },
    collectWitnesses: false,
  });

  const aggro = world.get(shopkeeper, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.hunting);
  assertEquals(aggro.lastKnownX, 4);
  assertEquals(aggro.lastKnownY, 5);
  assertEquals(requests.length, 1);
});

Deno.test("shop claims feed shopkeeper disposition and worsen shop terms", () => {
  const world = new World({ seed: 4103 });
  const player = addActor(world, "player");
  const shopkeeper = addActor(world, "shopkeeper");
  world.add(shopkeeper, ShopInventory, { buyMarkup: 1.3, sellDiscount: 0.5 });
  installDispositionOffenseListeners(world);

  recordShopClaim(world, {
    actorId: player,
    shopkeeperId: shopkeeper,
    amount: 120,
    claimKind: "learned_unpaid",
    reason: "knowledge_theft",
    severity: 2,
  });

  const disposition = getDispositionRecord(world, shopkeeper, player);
  assert(disposition, "shopkeeper should remember the shop claim");
  assertEquals(disposition.score, -18);

  const terms = shopDispositionTerms(world, {
    actorId: player,
    shopkeeperId: shopkeeper,
    buyMarkup: 1.3,
    sellDiscount: 0.5,
  });
  assertEquals(terms.band, "wary");
  assertEquals(terms.buyMarkup, 1.4300000000000002);
  assertEquals(terms.sellDiscount, 0.45);
});

Deno.test("thrown shop merchandise records disposition without hunting the player", () => {
  const world = new World({ seed: 4107 });
  const player = addActor(world, "player", 4, 5);
  const shopkeeper = addActor(world, "shopkeeper", 5, 5);
  world.add(shopkeeper, AggroState, { alertLevel: AGGRO_LEVELS.unaware });
  installDispositionOffenseListeners(world);

  const pursuit = [];
  const aggroRequests = [];
  world.on("shop:pursuit-requested", (ev) => pursuit.push(ev));
  world.on("disposition:aggro-requested", (ev) => aggroRequests.push(ev));
  recordShopClaim(world, {
    actorId: player,
    shopkeeperId: shopkeeper,
    amount: 500,
    claimKind: "thrown_out",
    reason: "thrown_out",
    severity: 4,
    createsDebt: false,
  });

  assert(getDispositionRecord(world, shopkeeper, player), "shopkeeper should remember the theft");
  assertEquals(pursuit.length, 0);
  assertEquals(aggroRequests.length, 0);
  assertEquals(world.get(shopkeeper, AggroState).alertLevel, AGGRO_LEVELS.unaware);
});

Deno.test("confirmed protected attack emits offense that disposition listeners consume", () => {
  const world = new World({ seed: 4104 });
  const player = addActor(world, "player", 5, 5, "Player");
  const shopkeeper = addActor(world, "shopkeeper", 6, 5, "Shopkeeper");
  installDispositionOffenseListeners(world);

  world.add(player, AttackDirectionIntent, { dx: 1, dy: 0, confirmed: true });
  attackDirectionSystem(world);
  assertEquals(getDispositionRecord(world, shopkeeper, player), null);
  combatSystem(world);

  const disposition = getDispositionRecord(world, shopkeeper, player);
  assert(disposition, "confirmed protected attack should be remembered");
  assertEquals(disposition.score, -18);
});

Deno.test("unknown-attribution offense does not create disposition", () => {
  const world = new World({ seed: 4105 });
  const player = addActor(world, "player", 5, 5, "Player");
  const shopkeeper = addActor(world, "shopkeeper", 6, 5, "Shopkeeper");
  const events = [];
  world.on("offense:unattributed", (ev) => events.push(ev));

  applyOffenseDisposition(world, {
    actorId: player,
    victimId: shopkeeper,
    offense: {
      offenseKind: OFFENSE_KINDS.assault,
      severity: OFFENSE_SEVERITY.serious,
      attribution: OFFENSE_ATTRIBUTION.unknown,
    },
    collectWitnesses: false,
  });

  assertEquals(getDispositionRecord(world, shopkeeper, player), null);
  assertEquals(events.length, 1);
});

Deno.test("invisible protected melee attempt is unattributed socially", () => {
  const world = new World({ seed: 4106 });
  const player = addActor(world, "player", 5, 5, "Player");
  const shopkeeper = addActor(world, "shopkeeper", 6, 5, "Shopkeeper");
  world.add(player, ActiveEffects, {
    effects: [{ key: "invisible", turnsLeft: 10, potency: 1, stacks: 1 }],
  });
  const events = [];
  world.on("offense:unattributed", (ev) => events.push(ev));
  installDispositionOffenseListeners(world);

  world.add(player, AttackDirectionIntent, { dx: 1, dy: 0, confirmed: true });
  attackDirectionSystem(world);
  combatSystem(world);

  assertEquals(getDispositionRecord(world, shopkeeper, player), null);
  assertEquals(events.length, 1);
  assertEquals(events[0].offense.attribution, OFFENSE_ATTRIBUTION.unknown);
});

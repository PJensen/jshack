import { DistrictProfile } from "../components/DistrictProfile.js";
import { DistrictState } from "../components/DistrictState.js";
import { QuestBindings } from "../components/QuestBindings.js";
import { QuestDefRef } from "../components/QuestDefRef.js";
import { Position } from "../components/Position.js";
import { QuestState } from "../components/QuestState.js";
import { QuestVars } from "../components/QuestVars.js";
import { incVar, emit, setVar } from "./actions.js";
import { getQuestDef } from "./registry.js";
import { registerQuest } from "./registry.js";
import { createRng } from "../utils/rng.js";
import { addToInventory } from "../utils/inventoryFacade.js";
import { createItemById } from "../utils/itemFactory.js";
import { currentDepth, firstPlayerId } from "../utils/worldAccess.js";
import { ensureQuestRuntimeEventRoutes, findQuestEntity, instantiateQuest } from "./runtime.js";
import { getDistrictBulletinVirtual, getPlayerOpportunityViewVirtual } from "../utils/townInterpretationVirtuals.js";

const LOCAL_QUEST_VERSION = 1;
const LOCAL_TEMPLATE_POOL = Object.freeze([
  {
    key: "scout",
    weight: 3,
    titles: Object.freeze([
      "Street Survey",
      "Watch the Roads",
      "Scout the Quarter",
    ]),
  },
  {
    key: "patrol",
    weight: 2,
    titles: Object.freeze([
      "Quiet Patrol",
      "Town Rounds",
      "Eyes Open",
    ]),
  },
  {
    key: "trail",
    weight: 1,
    titles: Object.freeze([
      "Trace the Path",
      "Follow the Footing",
      "Mapped Steps",
    ]),
  },
]);

const OPPORTUNITY_OFFER_DEFS = Object.freeze({
  smith_repairs: Object.freeze({
    title: "Supply the Smithy",
    objective: "Deliver repair supplies where shortages are rising.",
    urgency: "medium",
  }),
  escort_work: Object.freeze({
    title: "Road Escort",
    objective: "Keep roads clear for traders and workers.",
    urgency: "high",
  }),
  graveyard_watch: Object.freeze({
    title: "Graveyard Watch",
    objective: "Patrol grave-adjacent routes and report pressure spikes.",
    urgency: "high",
  }),
  mason_repairs: Object.freeze({
    title: "Mason Repair Crew",
    objective: "Assist with wall and structure repairs.",
    urgency: "medium",
  }),
});

const FALLBACK_OFFER_POOL = Object.freeze([
  Object.freeze({
    offerId: "town:scout_routes",
    sourceDistrict: "town",
    sourceLabel: "Town",
    tag: "scout_routes",
    title: "Scout the Town Routes",
    objective: "Patrol the streets and map safe lanes for workers.",
    urgency: "low",
  }),
  Object.freeze({
    offerId: "town:watch_rotation",
    sourceDistrict: "town",
    sourceLabel: "Town",
    tag: "watch_rotation",
    title: "Watch Rotation",
    objective: "Cover rotation points while the watch is thin.",
    urgency: "medium",
  }),
  Object.freeze({
    offerId: "town:supply_errand",
    sourceDistrict: "town",
    sourceLabel: "Town",
    tag: "supply_errand",
    title: "Supply Errand",
    objective: "Run urgent supplies across town districts.",
    urgency: "low",
  }),
]);

function clampInt(value, min, max) {
  const n = Number(value) | 0;
  return Math.max(min, Math.min(max, n));
}

function computeQuestGoldReward({ target, urgency }) {
  const goal = Math.max(1, Number(target || 1) | 0);
  const u = String(urgency || "low");
  const urgencyBonus = u === "high" ? 30 : (u === "medium" ? 16 : 8);
  return clampInt(18 + goal * 3 + urgencyBonus, 25, 150);
}

function grantQuestGold(world, playerId, amount) {
  const ownerId = Number(playerId || 0) | 0;
  const qty = Math.max(0, Number(amount || 0) | 0);
  if (!(ownerId > 0) || qty <= 0) return 0;
  const goldId = createItemById(world, "gold", { count: qty });
  if (!(goldId > 0)) return 0;
  if (!addToInventory(world, ownerId, goldId)) {
    try { world.destroy(goldId); } catch {}
    return 0;
  }
  return qty;
}

function selectWeightedTemplate(rng) {
  let total = 0;
  for (const entry of LOCAL_TEMPLATE_POOL) total += Math.max(1, Number(entry.weight || 1) | 0);
  const roll = rng.int(1, Math.max(1, total));
  let acc = 0;
  for (const entry of LOCAL_TEMPLATE_POOL) {
    acc += Math.max(1, Number(entry.weight || 1) | 0);
    if (roll <= acc) return entry;
  }
  return LOCAL_TEMPLATE_POOL[0];
}

function makeLocalQuestId(worldSeed, playerId, depth) {
  const seedHex = (Number(worldSeed || 0) >>> 0).toString(16).padStart(8, "0");
  return `local.generated.${seedHex}.p${playerId}.d${depth}`;
}

function listDefEventNames(def) {
  const names = new Set();
  const nodes = def && typeof def === "object" ? def.nodes : null;
  if (!nodes || typeof nodes !== "object") return [];
  for (const nodeDef of Object.values(nodes)) {
    const on = nodeDef && typeof nodeDef === "object" ? nodeDef.on : null;
    if (!on || typeof on !== "object") continue;
    for (const eventName of Object.keys(on)) names.add(String(eventName || ""));
  }
  return Array.from(names.values()).filter(Boolean);
}

function activeQuestRows(world, playerId) {
  const rows = [];
  for (const [, defRef, state, vars, bindings] of world.query(QuestDefRef, QuestState, QuestVars, QuestBindings)) {
    if (Number(bindings?.player || 0) !== Number(playerId || 0)) continue;
    const def = getQuestDef(defRef?.id);
    const title = String(def?.title || defRef?.id || "Quest");
    const progress = Number(vars?.data?.progress || 0) | 0;
    const target = Number(vars?.data?.target || 0) | 0;
    rows.push({
      questId: String(defRef?.id || ""),
      title,
      status: String(state?.status || "active"),
      node: String(state?.node || ""),
      progress,
      target,
      summary: String(vars?.data?.objective || ""),
      checklist: Array.isArray(vars?.data?.checklist)
        ? vars.data.checklist.map((entry) => ({
          text: String(entry?.text || ""),
          done: !!entry?.done,
        }))
        : [],
      source: String(vars?.data?.templateKey || "local"),
      sourceDistrict: String(vars?.data?.sourceDistrict || ""),
      offerTag: String(vars?.data?.offerTag || ""),
    });
  }
  rows.sort((a, b) => a.title.localeCompare(b.title));
  return rows;
}

function districtUrgency(bulletin) {
  const pressure = String(bulletin?.pressureBand || "quiet");
  const danger = String(bulletin?.dangerBand || "safe");
  const shortage = String(bulletin?.shortageBand || "stable");
  if (danger === "closed" || danger === "dangerous" || pressure === "bleeding") return "high";
  if (shortage === "panic" || shortage === "scarce" || pressure === "active") return "medium";
  return "low";
}

function targetStepsForUrgency(urgency) {
  const u = String(urgency || "low");
  if (u === "high") return 14;
  if (u === "medium") return 10;
  return 7;
}

function buildOfferQuestId(world, playerId, offer) {
  const depth = currentDepth(world);
  const district = String(offer?.sourceDistrict || "town").replace(/[^a-z0-9_\-]/gi, "").toLowerCase() || "town";
  const tag = String(offer?.tag || "work").replace(/[^a-z0-9_\-]/gi, "").toLowerCase() || "work";
  return `local.offer.${district}.${tag}.p${Number(playerId || 0) | 0}.d${depth}`;
}

function buildOfferQuestDef(world, playerId, offer) {
  const urgency = String(offer?.urgency || "low");
  const target = targetStepsForUrgency(urgency);
  const title = String(offer?.title || "Town Contract");
  const sourceDistrict = String(offer?.sourceDistrict || "town");
  const sourceLabel = String(offer?.sourceLabel || sourceDistrict || "Town");
  const tag = String(offer?.tag || "work");
  const questId = buildOfferQuestId(world, playerId, offer);
  const rewardGold = computeQuestGoldReward({ target, urgency });

  const def = {
    id: questId,
    title,
    version: LOCAL_QUEST_VERSION,
    journal: {
      flavorText: `A posted contract from ${sourceLabel}. The work is routine, but the district needs someone reliable to finish it cleanly.`,
    },
    vars: {
      accepted: true,
      progress: 0,
      target,
      completed: false,
      objective: String(offer?.objective || "Complete posted town work."),
      urgency,
      rewardGold,
      sourceDistrict,
      sourceLabel,
      offerTag: tag,
    },
    nodes: {
      survey: {
        on: {
          moved: [
            {
              guard: (ctx) => {
                if (Number(ctx.payload?.id || 0) !== Number(ctx.bind.player || 0)) return false;
                const progress = Number(ctx.vars?.progress || 0) | 0;
                const goal = Math.max(1, Number(ctx.vars?.target || 1) | 0);
                return (progress + 1) >= goal;
              },
              actions: [
                setVar("progress", (ctx) => Math.max(1, Number(ctx.vars?.target || 1) | 0)),
                setVar("completed", true),
                (ctx) => {
                  const reward = Math.max(0, Number(ctx.vars?.rewardGold || rewardGold) | 0);
                  grantQuestGold(ctx.world, ctx.bind.player, reward);
                },
                emit("quest:completed", (ctx) => ({
                  questId,
                  playerId,
                  title,
                  rewardGold: Math.max(0, Number(ctx.vars?.rewardGold || rewardGold) | 0),
                  at: (() => {
                    const p = ctx.world.get(Number(ctx.bind.player || 0) | 0, Position);
                    return p ? { x: Number(p.x) | 0, y: Number(p.y) | 0 } : null;
                  })(),
                  district: String(ctx.vars?.sourceDistrict || sourceDistrict),
                })),
              ],
              to: "complete",
            },
            {
              guard: (ctx) => Number(ctx.payload?.id || 0) === Number(ctx.bind.player || 0),
              actions: [incVar("progress", 1)],
              to: "survey",
            },
          ],
        },
      },
      complete: { terminal: true },
    },
  };

  return { def, questId, target };
}

export function buildNoticeBoardQuestData(world, actor, districts = [], opportunityView = null) {
  const playerId = Number(actor || firstPlayerId(world)) | 0;
  if (!(playerId > 0)) return Object.freeze({ active: [], offers: [], generatedAt: Number(world?.step || 0) });

  const active = activeQuestRows(world, playerId);
  const acceptedOfferIds = new Set();
  for (const quest of active) {
    const sourceDistrict = String(quest?.sourceDistrict || "");
    const offerTag = String(quest?.offerTag || "");
    if (!sourceDistrict || !offerTag) continue;
    acceptedOfferIds.add(`${sourceDistrict}:${offerTag}`);
  }
  const offers = [];
  const seenOfferIds = new Set();
  for (const bulletin of Array.isArray(districts) ? districts : []) {
    const district = String(bulletin?.district || "");
    const districtLabel = String(bulletin?.label || district || "District");
    const urgencyFromDistrict = districtUrgency(bulletin);
    for (const tag of Array.isArray(bulletin?.opportunities) ? bulletin.opportunities : []) {
      const key = String(tag || "");
      if (!key) continue;
      const base = OPPORTUNITY_OFFER_DEFS[key] || {
        title: key.replace(/_/g, " "),
        objective: "Investigate current district demand.",
        urgency: urgencyFromDistrict,
      };
      const offerId = `${district || "town"}:${key}`;
      if (seenOfferIds.has(offerId)) continue;
      seenOfferIds.add(offerId);
      offers.push({
        offerId,
        sourceDistrict: district,
        sourceLabel: districtLabel,
        tag: key,
        title: String(base.title || "Town Work"),
        objective: String(base.objective || "Help where needed."),
        urgency: String(base.urgency || urgencyFromDistrict || "low"),
        accepted: acceptedOfferIds.has(offerId),
      });
    }
  }

  if (offers.length <= 0) {
    const depth = currentDepth(world);
    const worldSeed = Number(world?.seed || 0) >>> 0;
    const rngSeed = (worldSeed ^ ((playerId * 0x9e3779b9) >>> 0) ^ ((depth * 0x85ebca6b) >>> 0) ^ 0x51455354) >>> 0;
    const rng = createRng(rngSeed);
    const idx = rng.int(0, FALLBACK_OFFER_POOL.length - 1);
    const pick = FALLBACK_OFFER_POOL[Math.max(0, Math.min(FALLBACK_OFFER_POOL.length - 1, idx))];
    offers.push({
      ...pick,
      accepted: acceptedOfferIds.has(String(pick.offerId || "")),
    });
  }

  const sectors = Array.isArray(opportunityView?.profitableSectors)
    ? opportunityView.profitableSectors.map((value) => String(value || "")).filter(Boolean)
    : [];
  const leverage = Array.isArray(opportunityView?.highLeverageActions)
    ? opportunityView.highLeverageActions.map((value) => String(value || "")).filter(Boolean)
    : [];

  return Object.freeze({
    generatedAt: Number(world?.step || 0),
    offers: Object.freeze(offers),
    sectors: Object.freeze(sectors),
    leverage: Object.freeze(leverage),
  });
}

export function buildNoticeBoardPayload(world, actor) {
  const districtBulletinVirtual = getDistrictBulletinVirtual(world);
  const playerOpportunityVirtual = getPlayerOpportunityViewVirtual(world);
  const districts = [];
  for (const [districtId] of world.query(DistrictProfile, DistrictState)) {
    const bulletin = districtBulletinVirtual ? world.vget(districtId, districtBulletinVirtual) : null;
    if (bulletin) districts.push(bulletin);
  }
  districts.sort((a, b) => String(a?.label || "").localeCompare(String(b?.label || "")));
  const opportunityView = playerOpportunityVirtual
    ? world.vget(Number(actor || 0) | 0, playerOpportunityVirtual)
    : null;

  return Object.freeze({
    districts: Object.freeze(districts),
    opportunityView: opportunityView && typeof opportunityView === "object"
      ? opportunityView
      : null,
    questBoard: buildNoticeBoardQuestData(world, actor, districts, opportunityView),
  });
}

export function acceptNoticeBoardOffer(world, actor, offer) {
  const playerId = Number(actor || firstPlayerId(world)) | 0;
  if (!(playerId > 0) || !offer || typeof offer !== "object") return 0;

  const built = buildOfferQuestDef(world, playerId, offer);
  registerQuest(built.def);
  ensureQuestRuntimeEventRoutes(world, listDefEventNames(built.def));

  const existing = findQuestEntity(world, built.questId, playerId);
  if (existing > 0) return existing;

  const qid = instantiateQuest(
    world,
    built.questId,
    { player: playerId, giver: 0, target: 0 },
    {},
    { node: "survey", status: "active" },
  );
  if (qid > 0) {
    world.emit?.("quest:started", {
      questId: built.questId,
      playerId,
      giverId: 0,
      title: String(built.def.title || "Town Contract"),
    });
  }
  return qid;
}

export function buildLocalGeneratedQuest(world, opts = {}) {
  const playerId = Number(opts.playerId || firstPlayerId(world)) | 0;
  if (!(playerId > 0)) return null;

  const depth = Number(opts.depth ?? currentDepth(world)) | 0;
  const worldSeed = Number(opts.worldSeed ?? world.seed ?? 0) >>> 0;
  const rngSeed = (worldSeed ^ ((playerId * 0x9e3779b9) >>> 0) ^ ((depth * 0x85ebca6b) >>> 0)) >>> 0;
  const rng = createRng(rngSeed);

  const template = selectWeightedTemplate(rng);
  const title = String(rng.choice(template.titles) || "Local Patrol");
  const target = Number(opts.targetSteps ?? rng.int(6, 12)) | 0;
  const questId = String(opts.questId || makeLocalQuestId(worldSeed, playerId, depth));
  const rewardGold = computeQuestGoldReward({ target, urgency: "low" });

  const def = {
    id: questId,
    title,
    version: LOCAL_QUEST_VERSION,
    journal: {
      flavorText: `A locally generated patrol order for floor ${depth}. Walk the route, keep notes, and come back with the work done.`,
    },
    vars: {
      accepted: true,
      progress: 0,
      target,
      rewardGold,
      completed: false,
      templateKey: String(template.key || "scout"),
      depth,
    },
    nodes: {
      survey: {
        on: {
          moved: [
            {
              guard: (ctx) => {
                if (Number(ctx.payload?.id || 0) !== Number(ctx.bind.player || 0)) return false;
                const progress = Number(ctx.vars?.progress || 0) | 0;
                const goal = Math.max(1, Number(ctx.vars?.target || 1) | 0);
                return (progress + 1) >= goal;
              },
              actions: [
                setVar("progress", (ctx) => Math.max(1, Number(ctx.vars?.target || 1) | 0)),
                setVar("completed", true),
                (ctx) => {
                  const reward = Math.max(0, Number(ctx.vars?.rewardGold || rewardGold) | 0);
                  grantQuestGold(ctx.world, ctx.bind.player, reward);
                },
                emit("quest:completed", (ctx) => ({
                  questId,
                  playerId,
                  title,
                  rewardGold,
                  at: (() => {
                    const p = ctx.world.get(Number(ctx.bind.player || 0) | 0, Position);
                    return p ? { x: Number(p.x) | 0, y: Number(p.y) | 0 } : null;
                  })(),
                })),
              ],
              to: "complete",
            },
            {
              guard: (ctx) => Number(ctx.payload?.id || 0) === Number(ctx.bind.player || 0),
              actions: [
                incVar("progress", 1),
              ],
              to: "survey",
            },
          ],
        },
      },
      complete: {
        terminal: true,
      },
    },
  };

  return {
    def,
    bindings: {
      player: playerId,
      giver: 0,
      target: 0,
    },
    startNode: "survey",
  };
}

export function ensureLocalGeneratedQuest(world, opts = {}) {
  const generated = buildLocalGeneratedQuest(world, opts);
  if (!generated) return 0;

  registerQuest(generated.def);
  ensureQuestRuntimeEventRoutes(world, listDefEventNames(generated.def));

  const existing = findQuestEntity(world, generated.def.id, generated.bindings.player);
  if (existing > 0) return existing;

  const qid = instantiateQuest(
    world,
    generated.def.id,
    generated.bindings,
    {},
    { node: generated.startNode, status: "active" },
  );

  if (qid > 0) {
    world.emit?.("quest:started", {
      questId: generated.def.id,
      playerId: generated.bindings.player,
      giverId: 0,
      title: generated.def.title,
    });
  }

  return qid;
}

import { attach, children } from "../../lib/ecs-js/hierarchy.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { ShopClaim, SHOP_CLAIM_CONFIDENCE, SHOP_CLAIM_STATUS } from "../components/ShopClaim.js";
import { ShopIncident } from "../components/ShopIncident.js";
import { Unpaid } from "../components/Unpaid.js";
import { classifyShopClaimOffense } from "./offenseClassifier.js";
import { recordShopDebt } from "./shopDebt.js";

function normId(value) {
  return Number(value || 0) | 0;
}

function normTurn(world, turn) {
  return Number.isFinite(turn) ? (Number(turn) | 0) : (Number(world?.step || 0) | 0);
}

function itemIdentity(world, itemId) {
  return String(world.get(itemId, NamedIdentity)?.identity || "").toLowerCase();
}

function itemName(world, itemId) {
  const name = String(world.get(itemId, NamedIdentity)?.name || "");
  if (name) return name;
  return String(world.get(itemId, ItemInfo)?.name || "");
}

function normalizeConfidence(value) {
  const confidence = String(value || SHOP_CLAIM_CONFIDENCE.known);
  return Object.hasOwn(SHOP_CLAIM_CONFIDENCE, confidence)
    ? confidence
    : SHOP_CLAIM_CONFIDENCE.known;
}

function inferValueKind(kind, reason) {
  const key = String(kind || reason || "");
  if (key.includes("knowledge") || key.includes("learn")) return "knowledge";
  if (key.includes("consum") || key.includes("drink")) return "consumption";
  if (key.includes("teleport") || key.includes("blink")) return "position";
  if (key.includes("polymorph") || key.includes("transform")) return "transformation";
  if (key.includes("carried") || key.includes("thrown") || key.includes("item")) return "goods";
  return "unknown";
}

function incidentReasonForClaim(kind, reason) {
  const raw = String(reason || kind || "unauthorized_use");
  if (raw === "consumption_theft") return "consumed";
  return raw;
}

function inferSeverity(amount, reason, confidence) {
  const value = Math.max(0, Number(amount || 0));
  let severity = value >= 500
    ? 4
    : value >= 150
    ? 3
    : value >= 50
    ? 2
    : value > 0
    ? 1
    : 0;
  const r = String(reason || "");
  if (r === "teleport_exit" || r === "thrown_out" || r === "destroyed") severity += 1;
  if (r === "shopkeeper_transformed" || r === "keeper_transformed") severity += 3;
  if (confidence === SHOP_CLAIM_CONFIDENCE.suspicious) severity = Math.max(0, severity - 1);
  return Math.max(0, Math.min(5, severity));
}

export function evaluateShopLawResponse(_world, spec = {}) {
  const confidence = normalizeConfidence(spec.confidence);
  const severity = Number.isFinite(spec.severity)
    ? (Number(spec.severity) | 0)
    : inferSeverity(spec.amount, spec.reason || spec.claimKind, confidence);
  const reason = String(spec.reason || spec.claimKind || "");
  const escaped = reason === "teleport_exit" || reason === "thrown_out" ||
    reason === "destroyed";
  return Object.freeze({
    severity,
    alarm: confidence !== SHOP_CLAIM_CONFIDENCE.suspicious && severity >= 4,
    pursuit: reason !== "thrown_out" &&
      confidence !== SHOP_CLAIM_CONFIDENCE.suspicious &&
      (severity >= 3 || reason === "teleport_exit"),
    escaped,
  });
}

export function recordShopIncident(world, spec = {}) {
  const shopkeeperId = normId(spec.shopkeeperId);
  const actorId = normId(spec.actorId ?? spec.actor);
  if (!(shopkeeperId > 0) || !(actorId > 0)) return null;
  if (!world?.isAlive?.(shopkeeperId)) return null;

  const amount = Math.max(0, Math.ceil(Number(spec.amount || 0)));
  const reason = String(spec.reason || "carried_out");
  const severity = Number.isFinite(spec.severity)
    ? Math.max(0, Number(spec.severity) | 0)
    : inferSeverity(amount, reason, normalizeConfidence(spec.confidence));
  const offense = classifyShopClaimOffense({
    reason,
    claimKind: spec.claimKind || reason,
    severity,
  });
  const incident = {
    shopkeeperId,
    actorId,
    itemId: normId(spec.itemId),
    amount,
    reason,
    evidence: String(spec.evidence || "ledger"),
    severity,
    createdTurn: normTurn(world, spec.turn),
    resolved: spec.resolved === true,
  };

  const incidentId = world.create();
  world.add(incidentId, ShopIncident, incident);
  attach(world, incidentId, shopkeeperId);

  const rec = Object.freeze({ id: incidentId | 0, ...incident, offense });
  world.emit("shop:incident-recorded", rec);
  return rec;
}

export function shopIncidentRecords(world, shopkeeperId = 0) {
  const owner = normId(shopkeeperId);
  const out = [];
  if (owner > 0) {
    for (const incidentId of children(world, owner)) {
      const incident = world.get(incidentId, ShopIncident);
      if (incident) out.push(Object.freeze({ id: incidentId | 0, ...incident }));
    }
    return out;
  }

  for (const [incidentId, incident] of world.query(ShopIncident)) {
    out.push(Object.freeze({ id: incidentId | 0, ...incident }));
  }
  return out;
}

export function shopClaimRecords(world, shopkeeperId = 0) {
  const owner = normId(shopkeeperId);
  const out = [];
  if (owner > 0 && world?.isAlive?.(owner)) {
    for (const claimId of children(world, owner)) {
      const claim = world.get(claimId, ShopClaim);
      if (claim) out.push(Object.freeze({ id: claimId | 0, ...claim }));
    }
    return out;
  }

  for (const [claimId, claim] of world.query(ShopClaim)) {
    if (owner > 0 && normId(claim.shopkeeperId) !== owner) continue;
    out.push(Object.freeze({ id: claimId | 0, ...claim }));
  }
  return out;
}

export function recordShopClaim(world, spec = {}) {
  const shopkeeperId = normId(spec.shopkeeperId);
  const actorId = normId(spec.actorId ?? spec.actor);
  if (!(shopkeeperId > 0) || !(actorId > 0)) return null;

  const itemId = normId(spec.itemId);
  const amount = Math.max(0, Math.ceil(Number(spec.amount || 0)));
  const claimKind = String(spec.claimKind || spec.reason || "unauthorized_use");
  const reason = String(spec.reason || claimKind);
  const confidence = normalizeConfidence(spec.confidence);
  const severity = Number.isFinite(spec.severity)
    ? Math.max(0, Number(spec.severity) | 0)
    : inferSeverity(amount, reason, confidence);
  const valueKind = String(spec.valueKind || inferValueKind(claimKind, reason));
  const evidence = String(spec.evidence || "ledger");
  const createdTurn = normTurn(world, spec.turn);
  const identity = String(spec.identity ?? (itemId > 0 ? itemIdentity(world, itemId) : ""));
  const name = String(spec.name ?? (itemId > 0 ? itemName(world, itemId) : ""));
  const offense = classifyShopClaimOffense({ reason, claimKind, severity });

  const createsDebt = spec.createsDebt !== false && amount > 0;
  const debt = createsDebt
    ? recordShopDebt(world, {
      actorId,
      shopkeeperId,
      amount,
      reason,
      itemId,
      identity,
      name,
      turn: createdTurn,
    })
    : null;

  const shouldRecordIncident = spec.recordIncident !== false;
  const incident = shouldRecordIncident
    ? recordShopIncident(world, {
      actorId,
      shopkeeperId,
      itemId,
      amount,
      reason: incidentReasonForClaim(claimKind, reason),
      evidence,
      severity,
      claimKind,
      confidence,
      turn: createdTurn,
    })
    : null;

  const claim = {
    shopkeeperId,
    actorId,
    itemId,
    amount,
    claimKind,
    valueKind,
    evidence,
    confidence,
    severity,
    debtId: debt?.id || 0,
    incidentId: incident?.id || 0,
    createdTurn,
    status: SHOP_CLAIM_STATUS.open,
  };

  const claimId = world.create();
  world.add(claimId, ShopClaim, claim);
  if (world?.isAlive?.(shopkeeperId)) attach(world, claimId, shopkeeperId);

  const response = evaluateShopLawResponse(world, {
    amount,
    reason,
    claimKind,
    confidence,
    severity,
  });
  const event = Object.freeze({
    id: claimId | 0,
    actor: actorId,
    actorId,
    shopkeeperId,
    itemId,
    amount,
    reason,
    claimKind,
    valueKind,
    evidence,
    confidence,
    severity,
    offense,
    debt,
    incident,
    response,
  });

  world.emit("shop:claim-recorded", event);
  if (debt) {
    world.emit("shop:debt-created", {
      debtorId: actorId,
      shopkeeperId,
      amount: debt.amount,
      reason: debt.reason,
      itemId: debt.itemId,
      identity: debt.identity,
      claimId: claimId | 0,
    });
  }
  if (response.escaped) world.emit("shop:theft-escaped", event);
  if (response.pursuit) world.emit("shop:pursuit-requested", event);
  if (response.alarm) world.emit("shop:alarm", event);
  return event;
}

export function recordUnpaidExtraction(world, spec = {}) {
  const claim = recordShopClaim(world, {
    ...spec,
    claimKind: spec.claimKind || spec.reason || "carried_out",
    createsDebt: spec.createsDebt !== false,
    recordIncident: spec.recordIncident !== false,
    confidence: spec.confidence || SHOP_CLAIM_CONFIDENCE.known,
  });
  return claim;
}

function unauthorizedUseLine(reason, amount) {
  const charge = Math.max(0, Number(amount || 0) | 0);
  if (String(reason || "") === "knowledge_theft") {
    return `That knowledge is not free. You owe me ${charge} gold.`;
  }
  if (String(reason || "") === "consumption_theft") {
    return `You drink it, you buy it. That is ${charge} gold.`;
  }
  return `That is not free. You owe me ${charge} gold.`;
}

/**
 * Queue persistent shop debt for value extracted from unpaid merchandise.
 * This is intentionally interaction-context shaped so item verbs share one
 * commerce path without mutating from content hooks.
 */
export function queueShopDebtForUnauthorizedUse(ctx, spec = {}) {
  const actorId = Number(spec.actorId || ctx?.actor || 0) | 0;
  const itemId = Number(spec.itemId || ctx?.primary || 0) | 0;
  if (!(actorId > 0) || !(itemId > 0)) return null;

  const unpaid = ctx?.query?.get?.(itemId, Unpaid);
  if (!unpaid || !(Number(unpaid.shopkeeperId || 0) > 0)) return null;

  const amount = Math.max(0, Math.ceil(Number(spec.amount ?? unpaid.price ?? 0)));
  if (amount <= 0) return null;

  const identity = String(spec.identity ?? ctx?.query?.identity?.(itemId) ?? "").toLowerCase();
  const reason = String(spec.reason || "unauthorized_use");
  const record = {
    type: "recordShopClaim",
    actorId,
    shopkeeperId: unpaid.shopkeeperId | 0,
    amount,
    reason,
    claimKind: reason,
    valueKind: inferValueKind(reason, reason),
    evidence: reason === "consumption_theft" ? "arcane_mark" : "ledger",
    confidence: SHOP_CLAIM_CONFIDENCE.known,
    createsDebt: true,
    recordIncident: true,
    itemId,
    identity,
    name: String(spec.name ?? ctx?.query?.name?.(itemId) ?? ""),
  };

  ctx.mutate.queue(record);
  ctx.io.emit("shop:unauthorized-use", {
    actor: actorId,
    shopkeeperId: record.shopkeeperId,
    itemId,
    identity,
    amount,
    reason,
  });
  ctx.io.emit("npc:dialogue", {
    actor: record.shopkeeperId,
    targetId: actorId,
    text: unauthorizedUseLine(reason, amount),
    source: "shop:unauthorized-use",
  });

  return record;
}

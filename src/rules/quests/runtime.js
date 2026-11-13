import { ScriptRef as EcsScriptRef, installScriptsAPI } from "../../lib/ecs-js/index.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Position } from "../components/Position.js";
import { QuestBindings } from "../components/QuestBindings.js";
import { QuestDefRef } from "../components/QuestDefRef.js";
import { QuestLog } from "../components/QuestLog.js";
import { QuestState } from "../components/QuestState.js";
import { QuestVars } from "../components/QuestVars.js";
import { compileQuest, listQuestEventNames } from "./registry.js";
import { chebyshevScalar } from "../utils/distance.js";
import { firstPlayerId } from "../utils/worldAccess.js";

const QUEST_RUNTIME_KEY = Symbol.for("jshack:quests:runtime:installed");
const QUEST_EVENT_ROUTES_KEY = Symbol.for("jshack:quests:runtime:eventRoutes");
const QUEST_SCRIPT_ID = "quest.runtime";
export const STARTER_PRIEST_FETCH_QUEST_ID = "starter.priest_fetch";
export const STARTER_GRAVEYARD_QUEST_ID = STARTER_PRIEST_FETCH_QUEST_ID;
export const STARTER_RAT_QUEST_ID = "starter.rat_infestation";

function cloneVars(data) {
  const v = data || {};
  if (typeof structuredClone === 'function') {
    try { return structuredClone(v); } catch {}
  }
  return JSON.parse(JSON.stringify(v));
}

function buildContext(world, qid, compiled, state, bindings, vars, payload, eventName) {
  return {
    world,
    qid,
    def: compiled,
    state,
    bind: bindings,
    vars,
    payload,
    event: eventName,
  };
}

function setQuestLog(world, qid, patch) {
  const log = world.get(qid, QuestLog) || { lastEvent: "", lastFrom: "", lastTo: "", lastError: "", transitions: 0 };
  world.set(qid, QuestLog, { ...log, ...patch });
}

function handleQuestEvent(world, qid, eventName, payload, compiled) {
  const state = world.get(qid, QuestState);
  const bindings = world.get(qid, QuestBindings);
  const varsRec = world.get(qid, QuestVars);
  if (!state || state.status !== "active" || !bindings || !varsRec) return;

  const candidates = compiled.edgesByEvent.get(eventName) || [];
  if (!candidates.length) return;

  const ctx = buildContext(world, qid, compiled, state, bindings, cloneVars(varsRec.data), payload, eventName);
  for (const edge of candidates) {
    if (edge.from !== state.node) continue;
    if (edge.guard && !edge.guard(ctx)) continue;

    // Rebuild the context so actions see the actual payload.
    const actionCtx = buildContext(world, qid, compiled, state, bindings, cloneVars(varsRec.data), payload, eventName);
    for (const action of edge.actions || []) {
      if (action(actionCtx) === false) {
        setQuestLog(world, qid, {
          lastEvent: eventName,
          lastFrom: String(state.node || ""),
          lastTo: String(state.node || ""),
          transitions: Number(world.get(qid, QuestLog)?.transitions || 0),
          lastError: `Quest action rejected event '${eventName}'`,
        });
        return;
      }
    }

    const currentState = world.get(qid, QuestState) || state;
    if (!edge.to || !compiled.nodes[edge.to]) {
      setQuestLog(world, qid, {
        lastEvent: eventName,
        lastFrom: String(state.node || ""),
        lastTo: String(currentState.node || state.node || ""),
        transitions: Number(world.get(qid, QuestLog)?.transitions || 0),
        lastError: `Quest '${compiled.id}' missing target node '${String(edge.to || "")}'`,
      });
      return;
    }

    const nodeDef = compiled.nodes[edge.to];
    const log = world.get(qid, QuestLog) || { transitions: 0 };
    world.set(qid, QuestState, {
      ...currentState,
      node: edge.to,
      status: nodeDef?.terminal ? "complete" : currentState.status || "active",
    });
    world.set(qid, QuestLog, {
      ...log,
      lastEvent: eventName,
      lastFrom: String(state.node || ""),
      lastTo: String(edge.to),
      transitions: Number(log.transitions || 0) + 1,
      lastError: "",
    });
    return;
  }
}

function buildQuestHandlers(world, qid, args) {
  const questId = String(args?.questId || "");
  const compiled = compileQuest(questId);
  const handlers = {};
  for (const eventName of compiled.eventNames) {
    handlers[eventName] = (w, eid, payload) => {
      handleQuestEvent(w, eid, eventName, payload, compiled);
    };
  }
  return handlers;
}

function routeQuestEvent(world, eventName, payload) {
  for (const [id, state, ref, def] of world.query(QuestState, EcsScriptRef, QuestDefRef)) {
    if (String(ref.id || "") !== QUEST_SCRIPT_ID) continue;
    if (String(state.status || "active") !== "active") continue;
    const compiled = compileQuest(def.id);
    if (!compiled.edgesByEvent.has(eventName)) continue;
    handleQuestEvent(world, id, eventName, payload, compiled);
  }
}

export function ensureQuestRuntimeEventRoutes(world, eventNames = null) {
  if (!world[QUEST_EVENT_ROUTES_KEY]) world[QUEST_EVENT_ROUTES_KEY] = new Set();
  const routes = world[QUEST_EVENT_ROUTES_KEY];
  const names = Array.isArray(eventNames) ? eventNames : listQuestEventNames();
  for (const eventName of names) {
    const key = String(eventName || "");
    if (!key || routes.has(key)) continue;
    routes.add(key);
    world.on(key, (payload) => routeQuestEvent(world, key, payload));
  }
}

export function installQuestRuntime(world) {
  if (world[QUEST_RUNTIME_KEY]) return;
  world[QUEST_RUNTIME_KEY] = true;

  if (!world.scripts) installScriptsAPI(world);
  world.scripts.register(QUEST_SCRIPT_ID, buildQuestHandlers);
  ensureQuestRuntimeEventRoutes(world);
}

function findQuestInstance(world, questId, bindings = {}) {
  const wantedId = String(questId || "");
  const wantedPlayer = Number(bindings.player || 0) | 0;
  const wantedGiver = Number(bindings.giver || 0) | 0;
  const wantedTarget = Number(bindings.target || 0) | 0;

  for (const [id, def, bind] of world.query(QuestDefRef, QuestBindings)) {
    if (String(def.id || "") !== wantedId) continue;
    if (wantedPlayer > 0 && Number(bind.player || 0) !== wantedPlayer) continue;
    if (wantedGiver > 0 && Number(bind.giver || 0) !== wantedGiver) continue;
    if (wantedTarget > 0 && Number(bind.target || 0) !== wantedTarget) continue;
    return id;
  }
  return 0;
}

export function instantiateQuest(world, questId, bindings = {}, varsOverrides = {}, opts = {}) {
  const compiled = compileQuest(questId);
  if (opts.allowDuplicate !== true) {
    const existing = findQuestInstance(world, compiled.id, bindings);
    if (existing > 0) return existing;
  }
  const id = world.create();
  const startNode = String(opts.node || "offer");
  const startStatus = String(opts.status || "active");
  const t0 = Number.isFinite(opts.t0) ? Number(opts.t0) : Number(world.step || 0);

  world.add(id, QuestDefRef, { id: compiled.id, version: compiled.version });
  world.add(id, QuestState, { node: startNode, status: startStatus, t0 });
  world.add(id, QuestVars, { data: { ...cloneVars(compiled.vars), ...cloneVars(varsOverrides) } });
  world.add(id, QuestBindings, {
    player: Number(bindings.player || 0) | 0,
    giver: Number(bindings.giver || 0) | 0,
    target: Number(bindings.target || 0) | 0,
  });
  world.add(id, QuestLog, { lastEvent: "", lastFrom: "", lastTo: "", lastError: "", transitions: 0 });
  world.add(id, EcsScriptRef, { id: QUEST_SCRIPT_ID, args: { questId: compiled.id } });
  return id;
}

export function findQuestEntity(world, questId, playerId = 0) {
  const wantedId = String(questId || "");
  for (const [id, def, bind] of world.query(QuestDefRef, QuestBindings)) {
    if (String(def.id || "") !== wantedId) continue;
    if (playerId > 0 && Number(bind.player || 0) !== Number(playerId || 0)) continue;
    return id;
  }
  return 0;
}

export function getQuestRecord(world, questId, playerId = 0) {
  const qid = findQuestEntity(world, questId, playerId);
  if (!(qid > 0)) return null;
  return {
    id: qid,
    def: world.get(qid, QuestDefRef),
    state: world.get(qid, QuestState),
    vars: world.get(qid, QuestVars),
    bindings: world.get(qid, QuestBindings),
    log: world.get(qid, QuestLog),
  };
}

export function ensureStarterQuests(world) {
  const playerId = firstPlayerId(world, 0);
  if (!(playerId > 0)) return 0;

  if (findQuestEntity(world, STARTER_PRIEST_FETCH_QUEST_ID, playerId) > 0) {
    return findQuestEntity(world, STARTER_PRIEST_FETCH_QUEST_ID, playerId);
  }

  let priestId = 0;
  let barkeepId = 0;
  for (const [id, ni] of world.query(NamedIdentity)) {
    const identity = String(ni.identity || "");
    if (identity === "townfolk_priest") priestId = id;
    if (identity === "townfolk_barkeep") barkeepId = id;
  }

  let lastId = 0;
  if (priestId > 0 && findQuestEntity(world, STARTER_PRIEST_FETCH_QUEST_ID, playerId) <= 0) {
    lastId = instantiateQuest(world, STARTER_PRIEST_FETCH_QUEST_ID, {
      player: playerId,
      giver: priestId,
      target: priestId,
    }, {}, { node: "offer" });
  }

  if (barkeepId > 0 && findQuestEntity(world, STARTER_RAT_QUEST_ID, playerId) <= 0) {
    lastId = instantiateQuest(world, STARTER_RAT_QUEST_ID, {
      player: playerId,
      giver: barkeepId,
      target: barkeepId,
    }, {}, { node: "offer" });
  }

  return lastId;
}

export function isPlayerNearIdentity(world, playerId, identity, radius = 1) {
  const pos = world.get(playerId, Position);
  if (!pos) return false;
  const want = String(identity || "");
  for (const [, otherPos, ni] of world.query(Position, NamedIdentity)) {
    if (String(ni.identity || "") !== want) continue;
    const dist = chebyshevScalar(otherPos.x, otherPos.y, pos.x, pos.y);
    if (dist <= radius) return true;
  }
  return false;
}

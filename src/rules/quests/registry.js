const QUEST_DEFS = new Map();
const COMPILED_QUESTS = new Map();

function cacheKey(id, version = 1) {
  return `${String(id || "")}::${Number(version || 1)}`;
}

export function registerQuest(def) {
  if (!def || typeof def !== "object") throw new Error("registerQuest: quest def must be an object");
  if (!def.id) throw new Error("registerQuest: quest def requires an id");
  QUEST_DEFS.set(String(def.id), def);
  COMPILED_QUESTS.delete(cacheKey(def.id, def.version || 1));
  return def;
}

export function getQuestDef(id) {
  return QUEST_DEFS.get(String(id || "")) || null;
}

export function listQuestDefs() {
  return Array.from(QUEST_DEFS.values());
}

export function clearQuestRegistry() {
  QUEST_DEFS.clear();
  COMPILED_QUESTS.clear();
}

export function compileQuest(id) {
  const def = getQuestDef(id);
  if (!def) throw new Error(`compileQuest: unknown quest '${id}'`);
  const key = cacheKey(def.id, def.version || 1);
  if (COMPILED_QUESTS.has(key)) return COMPILED_QUESTS.get(key);

  const nodes = Object.freeze({ ...(def.nodes || {}) });
  const edgesByEvent = new Map();
  const eventNames = new Set();

  for (const [nodeId, nodeDef] of Object.entries(nodes)) {
    const on = (nodeDef && typeof nodeDef === "object" && nodeDef.on && typeof nodeDef.on === "object")
      ? nodeDef.on
      : {};
    for (const [eventName, rawEdges] of Object.entries(on)) {
      if (!Array.isArray(rawEdges) || rawEdges.length <= 0) continue;
      eventNames.add(eventName);
      // A multi-leg quest may intentionally reuse an event at several nodes
      // (for example, reporting to two different quest givers). Clone the
      // prior route before appending because compiled route lists are frozen.
      const list = edgesByEvent.has(eventName)
        ? Array.from(edgesByEvent.get(eventName))
        : [];
      for (const edge of rawEdges) {
        list.push(Object.freeze({
          from: nodeId,
          to: String(edge?.to || ""),
          guard: typeof edge?.guard === "function" ? edge.guard : null,
          actions: Array.isArray(edge?.actions) ? edge.actions.filter((fn) => typeof fn === "function") : [],
        }));
      }
      edgesByEvent.set(eventName, Object.freeze(list));
    }
  }

  const compiled = Object.freeze({
    id: String(def.id),
    version: Number(def.version || 1),
    title: String(def.title || def.id),
    vars: Object.freeze({ ...(def.vars || {}) }),
    nodes,
    edgesByEvent,
    eventNames: Object.freeze(Array.from(eventNames)),
    bindings: Object.freeze({ ...(def.bindings || {}) }),
  });
  COMPILED_QUESTS.set(key, compiled);
  return compiled;
}

export function listQuestEventNames() {
  const out = new Set();
  for (const def of QUEST_DEFS.values()) {
    const compiled = compileQuest(def.id);
    for (const eventName of compiled.eventNames) out.add(eventName);
  }
  return Array.from(out.values());
}

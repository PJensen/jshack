function readStoredNumber(key, fallback = 0) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readStoredString(key, fallback = "") {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return typeof raw === "string" ? raw : fallback;
  } catch {
    return fallback;
  }
}

function parsePositiveFloat(raw, fallback = null) {
  const value = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseUnitFloat(raw, fallback = null) {
  const value = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function parsePositiveInt(raw, fallback = null) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseNonNegativeInt(raw, fallback = null) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseBooleanish(raw, fallback = false) {
  if (raw == null) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === "1" || value === "true" || value === "on" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "off" || value === "no") return false;
  return fallback;
}

function defaultFacingTurnCostByDevice() {
  if (typeof window === "undefined") return false;
  try {
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const narrow = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches;
    const touchPoints = Number(window.navigator?.maxTouchPoints || 0);
    // Mobile/touch-first default: facing changes consume a turn.
    return coarse || narrow || touchPoints > 0;
  } catch {
    return false;
  }
}

export function buildPerfConfig(params) {
  const q = (
    params.get("quality") ||
    readStoredString("jshack.quality", "high") ||
    "high"
  ).toLowerCase();
  const defaultCap = 1.5;
  const dprCapArg = Number(params.get("dprCap")) || readStoredNumber("jshack.dprCap", 0);
  const dprCap = Number.isFinite(dprCapArg) && dprCapArg > 0 ? dprCapArg : defaultCap;
  const isLow = q === "low";
  const isHigh = q === "high";
  return {
    quality: q,
    dprCap: isHigh ? 3 : (isLow ? 1 : dprCap),
    glowLayers: isLow ? 0 : 2,
    particleCapacity: isLow ? 512 : 4096,
    cameraLerp: params.get("cameraLerp") !== null ? Number(params.get("cameraLerp")) : 0,
  };
}

function parseSeedParam(raw) {
  if (raw == null) return null;
  const s = raw.trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16) >>> 0;
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10) >>> 0;
  return null;
}

export function readRuntimeConfig() {
  const params = new URLSearchParams(window.location.search || "");
  const disableFovConeParam = params.get("disableFovCone");
  const disableFovConeStored = readStoredString("jshack.disableFovCone", "");
  const disableFovParam = params.get("disableFov");
  const disableFovStored = readStoredString("jshack.disableFov", "");
  const facingTurnCostParam = params.get("facingTurnCost");
  const facingTurnCostStored = readStoredString("jshack.facingTurnCost", "");
  const facingTurnCostDeviceDefault = defaultFacingTurnCostByDevice();
  return {
    params,
    perf: buildPerfConfig(params),
    startDepth: parseNonNegativeInt(params.get("floor"), 0) ?? 0,
    dungeonScale: parsePositiveFloat(params.get("dungeonScale"), null),
    sparsity: parseUnitFloat(params.get("sparsity"), null),
    chosenDeityId: params.get("deity") || "molkhar",
    seed:         parseSeedParam(params.get("seed")),
    giveParam:    params.get("give")    || "",
    effectsParam: params.get("effects") || "",
    debug:        params.has("debug"),
    renderProfile: parseBooleanish(params.get("renderProfile"), parseBooleanish(readStoredString("jshack.renderProfile", ""), false)),
    disableFov: parseBooleanish(disableFovParam, parseBooleanish(disableFovStored, false)),
    disableFovCone: parseBooleanish(disableFovConeParam, parseBooleanish(disableFovConeStored, true)),
    facingTurnCost: parseBooleanish(facingTurnCostParam, parseBooleanish(facingTurnCostStored, false)),
    identifyItems: params.has("audio") ? false : params.get("identify") !== "off",
    dungeonType:  params.get("dungeonType") || null,
    audioMode:    params.has("audio") || params.has("spellreel"),
    spellReelMode: params.has("spellreel"),
  };
}

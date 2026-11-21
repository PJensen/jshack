// display/camera/openingFlyover.js
// Display-only opening flight from the overworld into the player.

const DEFAULT_DURATION = 8.2;
const MIN_SECONDS_PER_LEG = 1.5;
const LANDMARK_HOLD_SECONDS = 1.1;
const LANDMARK_ZOOM = 2;
const NPC_STOP_SPACING = 8;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothStep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function validPosition(pos) {
  return Number.isFinite(Number(pos?.x)) && Number.isFinite(Number(pos?.y));
}

function asPosition(pos) {
  return { x: Number(pos.x), y: Number(pos.y) };
}

function selectWaypoints(view, player) {
  const entities = Array.isArray(view?.entities) ? view.entities : [];
  const preferred = entities.filter((entity) => {
    if (!validPosition(entity?.pos) || Number(entity.id) === Number(view?.player?.id)) return false;
    const tags = Array.isArray(entity.tags) ? entity.tags : [];
    return tags.includes("dungeon_entrance") || tags.includes("landmark") || tags.includes("quest_giver");
  });
  const fallback = entities.filter((entity) => {
    if (!validPosition(entity?.pos) || Number(entity.id) === Number(view?.player?.id)) return false;
    return String(entity.kind || "") !== "default";
  });
  const pool = preferred.length > 0 ? preferred : fallback;
  const selected = [];
  for (const entity of pool) {
    const point = { ...asPosition(entity.pos), title: String(entity.title || "").trim() };
    if (entity.tags?.includes("quest_giver")) {
      const overlaps = selected.some((chosen) => distanceSquared(point, chosen) < NPC_STOP_SPACING ** 2);
      if (overlaps || distanceSquared(point, player) < NPC_STOP_SPACING ** 2) continue;
    }
    selected.push(point);
  }
  return selected;
}

function findFarCorner(player, points, worldBounds) {
  if (worldBounds) {
    const inset = 12;
    const corners = [
      { x: worldBounds.minX + inset, y: worldBounds.minY + inset },
      { x: worldBounds.minX + inset, y: worldBounds.maxY - inset },
      { x: worldBounds.maxX - inset, y: worldBounds.minY + inset },
      { x: worldBounds.maxX - inset, y: worldBounds.maxY - inset },
    ];
    return corners.reduce((best, point) => (
      distanceSquared(point, player) > distanceSquared(best, player) ? point : best
    ));
  }
  const all = [player, ...points];
  const bounds = all.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    maxX: Math.max(result.maxX, point.x),
    minY: Math.min(result.minY, point.y),
    maxY: Math.max(result.maxY, point.y),
  }), { minX: player.x, maxX: player.x, minY: player.y, maxY: player.y });
  const pad = 20;
  const corners = [
    { x: bounds.minX - pad, y: bounds.minY - pad },
    { x: bounds.minX - pad, y: bounds.maxY + pad },
    { x: bounds.maxX + pad, y: bounds.minY - pad },
    { x: bounds.maxX + pad, y: bounds.maxY + pad },
  ];
  return corners.reduce((best, point) => (
    distanceSquared(point, player) > distanceSquared(best, player) ? point : best
  ));
}

function buildRoute(view) {
  const player = validPosition(view?.player?.pos) ? asPosition(view.player.pos) : null;
  if (!player) return null;
  const waypoints = selectWaypoints(view, player);
  const route = [findFarCorner(player, waypoints, view.bounds)];
  while (waypoints.length > 0) {
    const from = route[route.length - 1];
    let nearest = 0;
    for (let i = 1; i < waypoints.length; i++) {
      if (distanceSquared(from, waypoints[i]) < distanceSquared(from, waypoints[nearest])) nearest = i;
    }
    route.push(waypoints.splice(nearest, 1)[0]);
  }
  route.push(player);

  // Keep both endpoints fixed and undo crossings and long returns left by
  // the nearest-neighbor pass.
  for (let improved = true; improved;) {
    improved = false;
    for (let first = 1; first < route.length - 2; first++) {
      for (let last = first + 1; last < route.length - 1; last++) {
        const a = route[first - 1], b = route[first], c = route[last], d = route[last + 1];
        const before = Math.sqrt(distanceSquared(a, b)) + Math.sqrt(distanceSquared(c, d));
        const after = Math.sqrt(distanceSquared(a, c)) + Math.sqrt(distanceSquared(b, d));
        if (after >= before - 0.001) continue;
        route.splice(first, last - first + 1, ...route.slice(first, last + 1).reverse());
        improved = true;
      }
    }
  }
  return route;
}

function timeRoute(route, duration, holdSeconds, namedStops) {
  const distances = route.slice(1).map((point, i) => Math.sqrt(distanceSquared(route[i], point)));
  const totalDistance = distances.reduce((sum, length) => sum + length, 0);
  // Short hops still get time for a label. Longer crossings get more time
  // so the camera does not have to race to keep up with the next stop.
  const travelSeconds = duration - holdSeconds * namedStops;
  const legTimes = distances.map((length) => travelSeconds * (
    0.6 / distances.length + 0.4 * (totalDistance ? length / totalDistance : 1 / distances.length)
  ));
  let departure = 0;
  return route.map((point, i) => {
    const time = i === distances.length ? duration : departure + (legTimes[i - 1] ?? 0);
    departure = time + (point.title ? holdSeconds : 0);
    let vx = 0, vy = 0;
    const incoming = distances[i - 1], outgoing = distances[i];
    if (!point.title && incoming > 0 && outgoing > 0) {
      const prev = route[i - 1], next = route[i + 1];
      const speed = Math.min(incoming / legTimes[i - 1], outgoing / legTimes[i]) * 0.5;
      vx = ((point.x - prev.x) / incoming + (next.x - point.x) / outgoing) * speed;
      vy = ((point.y - prev.y) / incoming + (next.y - point.y) / outgoing) * speed;
    }
    return { ...point, time, departure, vx, vy };
  });
}

function interpolate(a, b, t, seconds) {
  const blend = smoothStep(t);
  const outgoing = t * (1 - t) ** 2 * seconds;
  const incoming = -t * t * (1 - t) * seconds;
  return {
    x: a.x + (b.x - a.x) * blend + a.vx * outgoing + b.vx * incoming,
    y: a.y + (b.y - a.y) * blend + a.vy * outgoing + b.vy * incoming,
  };
}

/**
 * @param {{ startScale:number, endScale:number, duration?:number, onComplete?:() => void }} opts
 */
export function createOpeningFlyover(opts = {}) {
  const startScale = Math.max(1, Number(opts.startScale) || 1);
  const endScale = Math.max(1, Number(opts.endScale) || startScale);
  let duration = DEFAULT_DURATION;
  let route = null;
  let elapsed = 0;
  let segment = 0;
  let active = false;

  function start(cam, view) {
    if (active) return true;
    route = buildRoute(view);
    if (!route) return false;
    const namedStops = route.filter((point) => point.title).length;
    const travelSeconds = Math.max(DEFAULT_DURATION, (route.length - 1) * MIN_SECONDS_PER_LEG);
    duration = Math.max(1, Number(opts.duration) || travelSeconds + namedStops * LANDMARK_HOLD_SECONDS);
    const holdSeconds = Math.min(LANDMARK_HOLD_SECONDS, duration / (Math.max(1, namedStops) * 3));
    route = timeRoute(route, duration, holdSeconds, namedStops);
    elapsed = 0;
    segment = 0;
    active = true;
    cam._detached = true;
    cam.x = route[0].x;
    cam.y = route[0].y;
    cam.targetX = route[0].x;
    cam.targetY = route[0].y;
    cam.scale = startScale;
    cam.targetScale = startScale;
    return true;
  }

  function update(cam, view, dt) {
    if (!active && !start(cam, view)) return false;
    elapsed += Math.max(0, Number(dt) || 0);
    const progress = clamp01(elapsed / duration);
    while (segment < route.length - 2 && elapsed >= route[segment + 1].time) segment++;
    const from = route[segment], to = route[segment + 1];
    const legSeconds = to.time - from.departure;
    const legProgress = clamp01((elapsed - from.departure) / legSeconds);
    const position = interpolate(from, to, legProgress, legSeconds);
    cam.x = position.x;
    cam.y = position.y;
    const departure = from.title ? 1 - smoothStep(legProgress * 2) : 0;
    const approach = to.title ? smoothStep(legProgress * 2 - 1) : 0;
    const landing = segment === route.length - 2 ? smoothStep(legProgress * 2 - 0.5) : 0;
    const surveyScale = startScale * (1 + (LANDMARK_ZOOM - 1) * Math.max(departure, approach));
    cam.scale = surveyScale + (endScale - surveyScale) * landing;
    cam.targetX = cam.x;
    cam.targetY = cam.y;
    cam.targetScale = cam.scale;

    if (progress < 1) return true;
    const player = validPosition(view?.player?.pos) ? view.player.pos : route[route.length - 1];
    cam.x = cam.targetX = Number(player.x);
    cam.y = cam.targetY = Number(player.y);
    cam.scale = cam.targetScale = endScale;
    cam._detached = false;
    active = false;
    route = null;
    if (typeof opts.onComplete === "function") opts.onComplete();
    return false;
  }

  function getMapLabel() {
    if (!active) return null;
    const a = route[segment], b = route[segment + 1];
    const sinceDeparture = Math.max(0, elapsed - a.departure);
    const untilArrival = b.time - elapsed;
    const point = sinceDeparture < untilArrival ? a : b;
    if (!point.title) return null;
    const distance = Math.min(sinceDeparture, untilArrival);
    const window = Math.min(0.9, (b.time - a.departure) * 0.45);
    if (distance >= window) return null;
    return { title: point.title, x: point.x, y: point.y, alpha: smoothStep((window - distance) / (window * 0.45)) };
  }

  return { start, update, getMapLabel, isActive: () => active };
}


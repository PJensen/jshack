// display/camera/openingFlyover.js
// Display-only opening flight from the overworld into the player.

const DEFAULT_DURATION = 8.2;
const LANDMARK_HOLD_SECONDS = 1.1;
const LANDMARK_ZOOM = 2;
const NPC_STOP_SPACING = 8;
const MAX_FEATURED_STOPS = 4;

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
    const point = {
      ...asPosition(entity.pos),
      title: String(entity.title || "").trim(),
      mapTitle: String(entity.title || "").trim(),
    };
    if (entity.tags?.includes("quest_giver")) {
      const overlaps = selected.some((chosen) => distanceSquared(point, chosen) < NPC_STOP_SPACING ** 2);
      if (overlaps || distanceSquared(point, player) < NPC_STOP_SPACING ** 2) continue;
    }
    selected.push(point);
  }
  return selected;
}

function projectAlong(start, end, point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return 0;
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
}

function chooseFeaturedStops(points, start, player) {
  const candidates = points.filter((point) => point.mapTitle);
  if (candidates.length <= MAX_FEATURED_STOPS) return new Set(candidates);
  const ordered = [...candidates].sort((a, b) => (
    projectAlong(start, player, a) - projectAlong(start, player, b)
  ));
  const selected = [];
  for (let i = 0; i < MAX_FEATURED_STOPS; i++) {
    const index = Math.round(i * (ordered.length - 1) / (MAX_FEATURED_STOPS - 1));
    const point = ordered[index];
    if (point && !selected.includes(point)) selected.push(point);
  }
  return new Set(selected);
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
  const start = findFarCorner(player, waypoints, view.bounds);
  const featured = chooseFeaturedStops(waypoints, start, player);
  // Keep the actual flight on one nearly straight A->B segment. Places are
  // presentation influences only; forcing the camera through every landmark
  // makes even eased legs read as a series of bounces.
  const route = [start, player];
  route.mapPoints = waypoints;
  route.featured = featured;
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
  let camera = null;

  function start(cam, view) {
    if (active) return true;
    route = buildRoute(view);
    if (!route) return false;
    const namedStops = 0;
    const travelSeconds = Math.max(DEFAULT_DURATION, 5.4 + namedStops * 0.55);
    duration = Math.max(1, Number(opts.duration) || travelSeconds + namedStops * LANDMARK_HOLD_SECONDS);
    const holdSeconds = Math.min(LANDMARK_HOLD_SECONDS, duration / (Math.max(1, namedStops) * 3));
    const mapPoints = route.mapPoints;
    const featured = route.featured;
    route = timeRoute(route, duration, holdSeconds, namedStops);
    route.mapPoints = mapPoints;
    route.featured = featured;
    elapsed = 0;
    segment = 0;
    active = true;
    camera = cam;
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
    const nearestFeatured = [...(route.featured || [])].reduce((best, point) => (
      Math.min(best, Math.sqrt(distanceSquared(point, cam)))
    ), Infinity);
    const placeZoom = smoothStep(clamp01(1 - nearestFeatured / 42));
    const landing = segment === route.length - 2 ? smoothStep(legProgress * 2 - 0.5) : 0;
    const surveyScale = startScale * (1 + (LANDMARK_ZOOM - 1) * placeZoom);
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
    camera = null;
    if (typeof opts.onComplete === "function") opts.onComplete();
    return false;
  }

  function getMapLabel() {
    if (!active || !route?.featured?.size) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const point of route.featured) {
      const distance = Math.sqrt(distanceSquared(point, camera));
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
    if (!nearest || nearestDistance >= 26) return null;
    return { title: nearest.mapTitle, x: nearest.x, y: nearest.y, alpha: smoothStep(1 - nearestDistance / 26) };
  }

  function getMapLabels() {
    if (!active || !route || !camera) return [];
    const labels = [];
    for (const point of route.mapPoints || []) {
      if (!point.mapTitle) continue;
      const distance = Math.sqrt(distanceSquared(point, camera));
      const alpha = smoothStep(clamp01(1 - distance / 42));
      if (alpha > 0) labels.push({ title: point.mapTitle, x: point.x, y: point.y, alpha });
    }
    return labels;
  }

  return { start, update, getMapLabel, getMapLabels, isActive: () => active };
}


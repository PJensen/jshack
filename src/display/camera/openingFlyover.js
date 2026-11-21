// display/camera/openingFlyover.js
// Display-only opening flight from the overworld into the player.

const DEFAULT_DURATION = 8.2;
const MIN_WAYPOINT_SEPARATION = 18;

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
    return tags.includes("dungeon_entrance") || tags.includes("quest_giver");
  });
  const fallback = entities.filter((entity) => {
    if (!validPosition(entity?.pos) || Number(entity.id) === Number(view?.player?.id)) return false;
    return String(entity.kind || "") !== "default";
  });
  const pool = preferred.length > 0 ? preferred : fallback;
  const selected = [];
  const remaining = pool.map((entity) => asPosition(entity.pos));

  while (selected.length < 3 && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const point = remaining[i];
      const separation = selected.length === 0
        ? distanceSquared(point, player)
        : Math.min(...selected.map((chosen) => distanceSquared(point, chosen)));
      if (separation > bestScore) {
        bestScore = separation;
        bestIndex = i;
      }
    }
    if (selected.length > 0 && bestScore < MIN_WAYPOINT_SEPARATION ** 2) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
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
  return [findFarCorner(player, waypoints, view.bounds), ...waypoints, player];
}

function interpolate(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * @param {{ startScale:number, endScale:number, duration?:number, onComplete?:() => void }} opts
 */
export function createOpeningFlyover(opts = {}) {
  const startScale = Math.max(1, Number(opts.startScale) || 1);
  const endScale = Math.max(1, Number(opts.endScale) || startScale);
  const duration = Math.max(1, Number(opts.duration) || DEFAULT_DURATION);
  let route = null;
  let elapsed = 0;
  let active = false;

  function start(cam, view) {
    if (active) return true;
    route = buildRoute(view);
    if (!route) return false;
    elapsed = 0;
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
    const segmentCount = route.length - 1;
    const segmentProgress = progress * segmentCount;
    const segmentIndex = Math.min(segmentCount - 1, Math.floor(segmentProgress));
    const localProgress = segmentProgress - segmentIndex;
    const position = interpolate(route[segmentIndex], route[segmentIndex + 1], smoothStep(localProgress));
    cam.x = position.x;
    cam.y = position.y;
    cam.scale = startScale + (endScale - startScale) * smoothStep(progress);
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

  return { start, update, isActive: () => active };
}


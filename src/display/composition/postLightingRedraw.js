const OVERWORLD_POST_LIGHTING_REDRAW_KINDS = new Set([
  "mountain",
  "mountain_b",
  "mountain_c",
  "tree",
  "door_closed",
  "door_open",
  "stair_down",
  "stair_up",
]);

export function shouldPostLightingRedrawKind(palette, kind, opts = {}) {
  if (typeof kind !== "string" || kind.length === 0) return false;
  const layer = Number.isFinite(opts?.layer) ? (opts.layer | 0) : 300;
  const isPlayer = layer === 400;
  if (!isPlayer && !opts?.isOverworld) return false;
  if (!isPlayer && !OVERWORLD_POST_LIGHTING_REDRAW_KINDS.has(kind)) return false;

  const look = palette?.[kind];
  if (!look || Array.isArray(look.layers)) return false;
  if (!isPlayer && !look.bg) return false;

  return true;
}

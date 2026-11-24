// Shared display anchor for ground items.
// Rules position stays on the landing tile; callers may provide a transient
// presentation position for loot arcs or other display-only motion.

/**
 * @param {{ pos?: { x?: number, y?: number }, visualOff?: { dx?: number, dy?: number } }} entity
 * @param {{ x?: number, y?: number }|null} [transientPos]
 * @returns {{ x:number, y:number }}
 */
export function groundItemPresentationPosition(entity, transientPos = null) {
  if (Number.isFinite(Number(transientPos?.x)) && Number.isFinite(Number(transientPos?.y))) {
    return { x: Number(transientPos.x), y: Number(transientPos.y) };
  }
  return {
    x: Number(entity?.pos?.x || 0) + Number(entity?.visualOff?.dx || 0),
    y: Number(entity?.pos?.y || 0) + Number(entity?.visualOff?.dy || 0),
  };
}

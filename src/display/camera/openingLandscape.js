import { applyCamera } from "./controller.js";

const TILE_PIXELS = 8;

/**
 * Bake a static overview in strips so setup can yield between batches.
 * Bounds are inclusive tile centers.
 */
export async function bakeOpeningLandscape(surface, bounds, drawStrip, yieldFrame) {
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  surface.width = width * TILE_PIXELS;
  surface.height = height * TILE_PIXELS;
  const context = surface.getContext("2d", { alpha: false });
  if (!context) return null;
  context.fillStyle = "#0b0e16";
  context.fillRect(0, 0, surface.width, surface.height);
  context.setTransform(
    TILE_PIXELS, 0, 0, TILE_PIXELS,
    (0.5 - minX) * TILE_PIXELS, (0.5 - minY) * TILE_PIXELS,
  );
  const stripHeight = 12;
  for (let y = minY; y <= maxY; y += stripHeight) {
    drawStrip(context, minX, y, maxX, Math.min(maxY, y + stripHeight - 1));
    if (y + stripHeight <= maxY) await yieldFrame();
  }
  return { surface, x: minX - 0.5, y: minY - 0.5, width, height };
}

export function drawOpeningLandscape(ctx, canvas, cam, landscape, alpha = 1) {
  ctx.save();
  if (alpha === 1) {
    ctx.fillStyle = "#0b0e16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  applyCamera(ctx, cam, canvas);
  ctx.drawImage(landscape.surface, landscape.x, landscape.y, landscape.width, landscape.height);
  ctx.restore();
}

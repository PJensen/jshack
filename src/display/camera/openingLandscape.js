import { applyCamera, worldToScreen } from "./controller.js";

const TILE_PIXELS = 8;
const MAX_LANDSCAPE_PIXELS = 1344;

/**
 * Bake a static overview in strips so setup can yield between batches.
 * Bounds are inclusive tile centers.
 */
export async function bakeOpeningLandscape(surface, bounds, drawStrip, yieldFrame) {
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const tilePixels = Math.max(1, Math.min(TILE_PIXELS, Math.floor(MAX_LANDSCAPE_PIXELS / Math.max(width, height))));
  surface.width = width * tilePixels;
  surface.height = height * tilePixels;
  const context = surface.getContext("2d", { alpha: false });
  if (!context) return null;
  context.fillStyle = "#0b0e16";
  context.fillRect(0, 0, surface.width, surface.height);
  context.setTransform(
    tilePixels, 0, 0, tilePixels,
    (0.5 - minX) * tilePixels, (0.5 - minY) * tilePixels,
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

export function drawOpeningMapLabel(ctx, viewport, cam, label) {
  if (!label) return;
  const [x, y] = worldToScreen(cam, label.x, label.y, viewport);
  const { width, height } = viewport;
  const edge = Math.min(x, y - 30, width - x, height - y);
  if (edge <= 0) return;
  const size = Math.max(16, Math.min(27, width * 0.042));
  const textY = y - 15 - size * 0.5;
  ctx.save();
  ctx.globalAlpha = label.alpha * Math.min(1, edge / 20);
  ctx.font = `${size}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.12);
  ctx.strokeStyle = "#101017";
  ctx.fillStyle = "#fff2d5";
  ctx.strokeText(label.title, x, textY, width * 0.8);
  ctx.fillText(label.title, x, textY, width * 0.8);
  ctx.fillRect(x - 0.5, y - 12, 1, 10);
  ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  ctx.restore();
}

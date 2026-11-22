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

export function drawOpeningMapLabel(ctx, viewport, cam, labels) {
  const entries = Array.isArray(labels) ? labels : (labels ? [labels] : []);
  if (entries.length === 0) return;
  const { width, height } = viewport;
  ctx.save();
  for (const label of entries) {
    const [x, y] = worldToScreen(cam, label.x, label.y, viewport);
    const edge = Math.min(x, y - 30, width - x, height - y);
    if (edge <= 0) continue;
    const size = Math.max(17, Math.min(30, width * 0.05));
    const textY = y - 24 - size * 0.5;
    const paddingX = Math.max(8, size * 0.38);
    const paddingY = Math.max(4, size * 0.2);
    ctx.globalAlpha = label.alpha * Math.min(1, edge / 20);
    ctx.font = `600 ${size}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const textWidth = Math.min(width * 0.8, ctx.measureText(label.title).width);
    const plateWidth = textWidth + paddingX * 2;
    const plateHeight = size + paddingY * 2;
    ctx.fillStyle = "rgba(12, 15, 24, 0.78)";
    ctx.fillRect(x - plateWidth * 0.5, textY - plateHeight * 0.5, plateWidth, plateHeight);
    ctx.strokeStyle = "rgba(255, 214, 132, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - plateWidth * 0.5, textY - plateHeight * 0.5, plateWidth, plateHeight);
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeStyle = "#101017";
    ctx.fillStyle = "#fff2d5";
    ctx.strokeText(label.title, x, textY, width * 0.8);
    ctx.fillText(label.title, x, textY, width * 0.8);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "#ffd684";
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(x, textY + plateHeight * 0.5);
    ctx.lineTo(x, y - 5);
    ctx.stroke();
    ctx.fillStyle = "#ffd684";
    ctx.beginPath();
    ctx.arc(x, y - 2, Math.max(2.5, size * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

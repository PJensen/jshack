// display/camera/controller.js
// Core camera resource (pure data + helpers)

export function createCamera() {
  return {
    x: 0,
    y: 0,
    scale: 1,
    targetX: 0,
    targetY: 0,
    targetScale: 1,
    lerpSpeed: 4.0,
    shakeX: 0,
    shakeY: 0
  };
}

function smoothStep(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/**
 * Temporarily focus the camera on a world-space impact, then return to the
 * camera's previous follow target. Presentation-only; gameplay coordinates
 * and targeting are unaffected.
 */
export function startCameraFocus(cam, x, y, opts = {}) {
  const targetX = Number(x);
  const targetY = Number(y);
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
  cam._cameraFocus = {
    fromX: Number(cam.x) || 0,
    fromY: Number(cam.y) || 0,
    targetX,
    targetY,
    returnX: Number.isFinite(Number(cam.targetX)) ? Number(cam.targetX) : Number(cam.x) || 0,
    returnY: Number.isFinite(Number(cam.targetY)) ? Number(cam.targetY) : Number(cam.y) || 0,
    inDur: Math.max(0.001, Number(opts.inDur) || 0.24),
    holdDur: Math.max(0, Number(opts.holdDur) || 0.08),
    outDur: Math.max(0.001, Number(opts.outDur) || 0.50),
    time: 0,
  };
  cam._detached = true;
}

export function updateCamera(cam, dt) {
  const t = Math.min(1, cam.lerpSpeed * dt);
  const focus = cam._cameraFocus;
  if (focus) {
    focus.time += Math.max(0, Number(dt) || 0);
    const holdEnd = focus.inDur + focus.holdDur;
    const outEnd = holdEnd + focus.outDur;
    if (focus.time < focus.inDur) {
      const k = smoothStep(focus.time / focus.inDur);
      cam.x = focus.fromX + (focus.targetX - focus.fromX) * k;
      cam.y = focus.fromY + (focus.targetY - focus.fromY) * k;
    } else if (focus.time < holdEnd) {
      cam.x = focus.targetX;
      cam.y = focus.targetY;
    } else if (focus.time < outEnd) {
      const k = smoothStep((focus.time - holdEnd) / focus.outDur);
      cam.x = focus.targetX + (focus.returnX - focus.targetX) * k;
      cam.y = focus.targetY + (focus.returnY - focus.targetY) * k;
    } else {
      cam.x = focus.returnX;
      cam.y = focus.returnY;
      cam.targetX = focus.returnX;
      cam.targetY = focus.returnY;
      cam._cameraFocus = null;
      cam._detached = false;
    }
  } else {
    cam.x += (cam.targetX - cam.x) * t;
    cam.y += (cam.targetY - cam.y) * t;
  }
  cam.scale += (cam.targetScale - cam.scale) * t;
}

export function applyCamera(ctx, cam, canvas) {
  // Respect any pre-existing base scale (e.g., DPR transform)
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : { a: 1, d: 1 };
  const baseX = m?.a || 1;
  const baseY = m?.d || 1;
  const sx = baseX * cam.scale;
  const sy = baseY * cam.scale;
  let tx = canvas.width / 2  - cam.x * sx + cam.shakeX * baseX;
  let ty = canvas.height / 2 - cam.y * sy + cam.shakeY * baseY;
  // Pixel-snapping translation avoids subpixel blur and improves mobile perf
  tx = Math.round(tx);
  ty = Math.round(ty);
  ctx.setTransform(sx, 0, 0, sy, tx, ty);
}

export function worldToScreen(cam, wx, wy, canvas) {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  const sx = cx + (wx - cam.x) * cam.scale + cam.shakeX;
  const sy = cy + (wy - cam.y) * cam.scale + cam.shakeY;
  return [sx, sy];
}

export function screenToWorld(cam, sx, sy, canvas) {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  const wx = (sx - cx - cam.shakeX) / cam.scale + cam.x;
  const wy = (sy - cy - cam.shakeY) / cam.scale + cam.y;
  return [wx, wy];
}

/**
 * Convert a pointer/touch client point (CSS px) into world coordinates.
 * Keeps targeting stable across DPR by using the canvas CSS viewport size.
 */
export function clientToWorld(cam, clientX, clientY, canvas) {
  if (!canvas || typeof canvas.getBoundingClientRect !== "function") {
    return [cam.x, cam.y];
  }
  const rect = canvas.getBoundingClientRect();
  // offsetWidth/Height give the CSS layout size *before* CSS transforms,
  // matching the coordinate space the canvas buffer is rendered into.
  // getBoundingClientRect reflects transforms (e.g. page-zoom compensation),
  // so we scale pointer coords from rendered space back to logical space.
  const logicalW = canvas.offsetWidth || rect.width;
  const logicalH = canvas.offsetHeight || rect.height;
  const sx = (Number(clientX) - rect.left) * (logicalW / rect.width);
  const sy = (Number(clientY) - rect.top) * (logicalH / rect.height);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    return [cam.x, cam.y];
  }
  return screenToWorld(cam, sx, sy, { width: logicalW, height: logicalH });
}

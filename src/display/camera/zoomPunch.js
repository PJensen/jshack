// display/camera/zoomPunch.js
// Brief camera scale pulse on critical hits — "zoom punch".
// Snaps scale up by a small amount, then eases back to 1.0.
// Additive: applies on top of the camera's normal scale, just like shake.

/** Peak zoom boost (fraction above 1.0). 0.02 = 2% zoom-in. */
const PUNCH_PEAK = 0.02;

/** Duration of the full punch cycle (seconds of real time). */
const PUNCH_DURATION = 0.12;

/** Ease-out: time spent ramping back to 1.0 (as fraction of duration). */
const EASE_FRAC = 0.7;

export function startZoomPunch(cam, peak = PUNCH_PEAK, dur = PUNCH_DURATION) {
  cam._zpPeak = peak;
  cam._zpDur = dur;
  cam._zpTime = 0;
}

/**
 * Start a smooth reward camera envelope: ease in, briefly hold, then ease out.
 * Unlike zoom punch this never snaps to the peak, making it suitable for loot
 * reveals and other camera emphasis that should feel luxurious rather than
 * impactful.
 */
export function startZoomLerp(cam, peak = 0.02, inDur = 0.18, holdDur = 0.08, outDur = 0.38) {
  cam._zlPeak = Math.max(0, Number(peak) || 0);
  cam._zlIn = Math.max(0.001, Number(inDur) || 0.18);
  cam._zlHold = Math.max(0, Number(holdDur) || 0);
  cam._zlOut = Math.max(0.001, Number(outDur) || 0.38);
  cam._zlTime = 0;
}

function smoothStep(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

export function updateZoomPunch(cam, dt) {
  if (cam._zpDur) {
    cam._zpTime += dt;
    const k = cam._zpTime / cam._zpDur;
    if (k >= 1) {
      cam._zpScale = 0;
      cam._zpDur = 0;
    } else {
      const attackEnd = 1 - EASE_FRAC;
      let intensity;
      if (k < attackEnd) {
        intensity = k / attackEnd;
      } else {
        const t = (k - attackEnd) / EASE_FRAC;
        intensity = 1 - t * t;
      }
      cam._zpScale = cam._zpPeak * intensity;
    }
  }

  if (cam._zlPeak > 0) {
    cam._zlTime += Math.max(0, Number(dt) || 0);
    const inEnd = cam._zlIn;
    const holdEnd = inEnd + cam._zlHold;
    const outEnd = holdEnd + cam._zlOut;
    if (cam._zlTime >= outEnd) {
      cam._zlScale = 0;
      cam._zlPeak = 0;
    } else if (cam._zlTime < inEnd) {
      cam._zlScale = cam._zlPeak * smoothStep(cam._zlTime / inEnd);
    } else if (cam._zlTime < holdEnd) {
      cam._zlScale = cam._zlPeak;
    } else {
      cam._zlScale = cam._zlPeak * (1 - smoothStep((cam._zlTime - holdEnd) / cam._zlOut));
    }
  }
}

/** Get the additive scale offset to apply this frame. */
export function getZoomPunchScale(cam) {
  return Math.max(cam._zpScale || 0, cam._zlScale || 0);
}

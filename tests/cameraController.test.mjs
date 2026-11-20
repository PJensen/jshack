import { assert, assertEquals } from "jsr:@std/assert";
import {
  clientToWorld,
  createCamera,
  screenToWorld,
  startCameraFocus,
  updateCamera,
} from "../src/display/camera/controller.js";

Deno.test("camera controller: clientToWorld maps viewport center to camera center", () => {
  const cam = { x: 12, y: -7, scale: 28, shakeX: 0, shakeY: 0 };
  const rect = { left: 100, top: 200, width: 560, height: 420 };
  const canvas = {
    getBoundingClientRect() {
      return rect;
    },
  };

  const [wx, wy] = clientToWorld(
    cam,
    rect.left + rect.width * 0.5,
    rect.top + rect.height * 0.5,
    canvas,
  );

  assertEquals(wx, cam.x);
  assertEquals(wy, cam.y);
});

Deno.test("camera controller: clientToWorld is stable across DPR-scaled backing stores", () => {
  const cam = { x: 20, y: 8, scale: 28, shakeX: 0, shakeY: 0 };
  const rect = { left: 40, top: 60, width: 560, height: 420 };
  const canvas = {
    // Backing store at DPR 2x
    width: 1120,
    height: 840,
    getBoundingClientRect() {
      return rect;
    },
  };

  // One tile to the right of the viewport center in CSS px.
  const clientX = rect.left + rect.width * 0.5 + cam.scale;
  const clientY = rect.top + rect.height * 0.5;
  const [wx, wy] = clientToWorld(cam, clientX, clientY, canvas);

  assertEquals(Math.floor(wx), 21);
  assertEquals(Math.floor(wy), 8);

  // Legacy conversion path (backing-store px into screenToWorld) mis-targets by DPR.
  const sxBacking = (clientX - rect.left) * (canvas.width / rect.width);
  const syBacking = (clientY - rect.top) * (canvas.height / rect.height);
  const [legacyWx] = screenToWorld(cam, sxBacking, syBacking, canvas);
  assertEquals(Math.floor(legacyWx), 22);
});

Deno.test("camera controller: impact focus returns to the previous follow target", () => {
  const cam = createCamera();
  cam.x = 2;
  cam.y = 3;
  cam.targetX = 2;
  cam.targetY = 3;

  startCameraFocus(cam, 12, 15, { inDur: 0.2, holdDur: 0.1, outDur: 0.3 });
  updateCamera(cam, 0.1);
  assert(cam.x > 2 && cam.x < 12, "camera should travel toward impact");
  updateCamera(cam, 0.1);
  assertEquals({ x: cam.x, y: cam.y }, { x: 12, y: 15 });
  updateCamera(cam, 0.1);
  updateCamera(cam, 0.3);
  assertEquals({ x: cam.x, y: cam.y }, { x: 2, y: 3 });
  assertEquals(cam._detached, false);
});

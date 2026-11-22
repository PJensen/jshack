import { defineComponent } from "../../lib/ecs-js/index.js";

/**
 * SecretDoor — rules-side metadata for a hidden branch entrance.
 * Unrevealed secret doors remain wall tiles and are hidden from WorldView.
 */
export const SecretDoor = defineComponent("SecretDoor", {
  fromRoomId: "",
  toRoomId: "",
  revealed: false,
  bumpCount: 0,
  difficulty: 0,
  hintKind: "hollow",
});

// =============================================================================
//  RegenerateCodeButtonTyped.ts  —  "Regenerate code" -> mint a fresh arena_id
// -----------------------------------------------------------------------------
//  Drop this on a button that sits next to your Edit and Reload buttons. When
//  pinched, it asks ArenaStreamerTyped to begin a fresh run: the server mints a
//  NEW arena_id + session_ID (each one unit above the previous highest), writes
//  a new row into the Arenas table, and replies with "arenaStarted". The
//  streamer then updates the on-screen "Arena ID: 0000-XXXX" label and reloads
//  the layout automatically — so this button only needs to make the one call.
//
//  Wiring (Inspector):
//    • pinchButton   -> the Regenerate button's PinchButton component
//    • arenaStreamer -> the SceneObject/component running ArenaStreamerTyped
//                       (the same one Start / Edit / Reload already point at)
//
//  This is intentionally a twin of StartArenaButtonTyped.ts — regenerating the
//  code and pressing Start are the same server action (startNewArena). Wanting a
//  separate, clearly-labelled button just makes the intent obvious in the scene.
// =============================================================================

import { ArenaStreamerTyped } from "./ArenaStreamerTyped";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

@component
export class RegenerateCodeButtonTyped extends BaseScriptComponent {
  @input @allowUndefined @hint("The Regenerate button's PinchButton component.") pinchButton: PinchButton;
  @input @allowUndefined @hint("The object running ArenaStreamerTyped (same one Start / Edit / Reload use).") arenaStreamer: ArenaStreamerTyped;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.pinchButton || !this.arenaStreamer) {
        print("[RegenerateCodeButtonTyped] Assign pinchButton and arenaStreamer on '"
              + this.getSceneObject().name + "'.");
        return;
      }
      this.pinchButton.onButtonPinched.add(() => {
        print("[RegenerateCodeButtonTyped] Regenerate pressed — minting a new arena code.");
        this.arenaStreamer.startNewArena();
      });
    });
  }
}

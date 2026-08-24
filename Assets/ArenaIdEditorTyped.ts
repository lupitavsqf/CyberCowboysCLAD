// =============================================================================
//  ArenaIdEditorTyped.ts  —  Edit the on-screen arena_id with a text box
// -----------------------------------------------------------------------------
//  Sits next to the arena_id label. Pressing the Edit button opens the
//  Spectacles system keyboard (number pad), pre-filled with the current arena
//  code. As you type, an optional preview label updates; pressing Done applies
//  it, and ArenaStreamerTyped switches to following THAT arena's main session.
//
//  You only need to wire two things:
//    • Arena Streamer -> the object running ArenaStreamerTyped
//    • Edit Button    -> a PinchButton you press to open the keyboard
//  Optional:
//    • Draft Label    -> a Text that shows the code live while you type
//                        (if left empty, the keyboard's own preview is used)
//
//  Note: the on-glasses keyboard appears on the device (and in Preview where
//  supported). Everything ultimately calls arenaStreamer.setArenaId(<number>).
// =============================================================================

import { ArenaStreamerTyped } from "./ArenaStreamerTyped";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

@component
export class ArenaIdEditorTyped extends BaseScriptComponent {
  @input @allowUndefined arenaStreamer: ArenaStreamerTyped;
  @input @allowUndefined editButton: PinchButton;

  @input @allowUndefined
  @hint("OPTIONAL: a Text (Zilla Slab) that previews the code as you type. If empty, the keyboard's built-in preview is used.")
  draftLabel: Text;

  private draft = "";
  private editing = false;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.wire());
  }

  private wire() {
    if (!this.arenaStreamer || !this.editButton) {
      print("[ArenaIdEditorTyped] Not wired (Arena Streamer / Edit Button empty) on object: '"
            + this.getSceneObject().name + "'. Fill its fields or delete this copy.");
      return;
    }
    this.editButton.onButtonPinched.add(() => this.openKeyboard());
  }

  private openKeyboard() {
    // Pre-fill with the arena number itself so the whole thing is editable.
    // The "0000-" prefix is just display decoration, not part of what you type.
    const current = this.arenaStreamer.getArenaId();
    this.draft = current > 0 ? String(current) : "";
    this.editing = true;
    this.refreshDraft();

    const opts = new TextInputSystem.KeyboardOptions();
    opts.keyboardType = TextInputSystem.KeyboardType.Num;   // digits only
    opts.returnKeyType = TextInputSystem.ReturnKeyType.Done;
    opts.enablePreview = true;
    opts.initialText = this.draft;

    opts.onTextChanged = (text: string, range: vec2) => {
      this.draft = (text || "").replace(/[^0-9]/g, "").slice(0, 8);
      this.refreshDraft();
    };
    opts.onReturnKeyPressed = () => this.finish();
    opts.onKeyboardStateChanged = (open: boolean) => { if (!open) this.finish(); };
    opts.onError = (code: number, desc: string) => {
      print("[ArenaIdEditorTyped] Keyboard error " + code + ": " + desc);
    };

    global.textInputSystem.requestKeyboard(opts);
  }

  // Apply the typed code exactly once (whether the user pressed Done or just
  // closed the keyboard), then dismiss it.
  private finish() {
    if (!this.editing) return;
    this.editing = false;
    const n = parseInt(this.draft, 10);
    if (n > 0) {
      this.arenaStreamer.setArenaId(n);
    } else {
      print("[ArenaIdEditorTyped] No valid code entered — keeping the current arena.");
    }
    global.textInputSystem.dismissKeyboard();
  }

  private refreshDraft() {
    if (this.draftLabel) this.draftLabel.text = this.formatDraft(this.draft);
  }

  // Live preview while typing: 8 digits split 4-4 like the website
  // (10017 -> "0001-0017"). What goes over the socket is the plain number.
  private formatDraft(digits: string): string {
    const clean = (digits || "").replace(/[^0-9]/g, "").slice(0, 8);
    if (!clean) return "____-____";
    const s = ("00000000" + clean).slice(-8);
    return s.slice(0, 4) + "-" + s.slice(4);
  }
}
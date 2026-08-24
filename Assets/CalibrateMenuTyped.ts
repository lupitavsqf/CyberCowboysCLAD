// =============================================================================
//  CalibrateMenuTyped.ts  —  Calibrate button -> panel with ONLY the arena id
// -----------------------------------------------------------------------------
//  Press "calibratebutton" and a floating panel (a twin of LessonPanel) appears
//  showing just two things:
//
//        0000-1011        <- the arena the glasses are CURRENTLY tracking,
//        [X]                 in the same 4-4 form as ArenaIdLabel on the
//                            start screen
//
//  ...and the close button. No cards, no scrolling, no image, no extra text.
//
//  Everything is positioned BY HAND in the scene — this script only opens and
//  closes the panel and keeps the number up to date.
//
//  Wiring (Inspector):
//    • openButton    -> calibratebutton's PinchButton
//    • closeButton   -> the close button's PinchButton (a child of the panel)
//    • panelRoot     -> calibratepanel. Keep it a SIBLING of LessonPanel under
//                       the Camera Object — do NOT put it inside LessonList, or
//                       the lesson menu's scrolling and clipping will move/hide it.
//    • arenaIdLabel  -> the Text inside the panel. Duplicate ArenaIdLabel and
//                       drag the copy's Text here, so it looks identical to the
//                       one on the start screen.
//    • arenaStreamer -> GameRoot/ArenaRoot
//
//  Why not just reuse ArenaIdLabel itself? ArenaStreamerTyped's own arenaIdLabel
//  input is a single Text reference, so it can only drive ONE label. Moving it
//  into the panel would take it off the start screen. This panel gets its own
//  copy, and this script keeps it in sync.
// =============================================================================

import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { ArenaStreamerTyped } from "./ArenaStreamerTyped";

@component
export class CalibrateMenuTyped extends BaseScriptComponent {
  @input @allowUndefined @hint("calibratebutton's PinchButton. Press = open/close.") openButton: PinchButton;
  @input @allowUndefined @hint("The close button's PinchButton, sitting on the panel.") closeButton: PinchButton;
  @input @allowUndefined @hint("calibratepanel — the panel background. Hidden until Calibrate is pressed.") panelRoot: SceneObject;
  @input @allowUndefined @hint("The Text inside the panel that shows the arena id. Duplicate ArenaIdLabel and drag the copy's Text here.") arenaIdLabel: Text;
  @input @allowUndefined @hint("GameRoot/ArenaRoot — the ArenaStreamerTyped that knows the current arena. Without it the label stays as the placeholder.") arenaStreamer: ArenaStreamerTyped;
  @input @hint("Shown while no arena is being tracked yet.") placeholder: string = "--------";
  @input @allowUndefined @hint("Buttons that should also CLOSE this panel (e.g. Choose Lesson, Home). Drag them here.") closeOnButtons: PinchButton[];

  private open = false;
  private lastId = -1;   // -1 = "never written", so the first refresh always draws

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.wire());
    // ArenaStreamerTyped has no "arena changed" callback (it only exposes
    // onCourses), so we re-read getArenaId() while the panel is open. The value
    // is cached against lastId, so the Text is only touched when it actually
    // changes — no per-frame string work.
    this.createEvent("UpdateEvent").bind(() => { if (this.open) this.refresh(); });
  }

  private wire() {
    if (this.panelRoot) this.panelRoot.enabled = false;   // closed at launch
    if (this.openButton) this.openButton.onButtonPinched.add(() => this.toggle());
    if (this.closeButton) this.closeButton.onButtonPinched.add(() => this.close());
    (this.closeOnButtons || []).forEach((b) => {
      if (b) b.onButtonPinched.add(() => { if (this.open) this.close(); });
    });
    if (!this.openButton || !this.panelRoot) {
      print("[CalibrateMenu] Assign Open Button and Panel Root on '" + this.getSceneObject().name + "'.");
    }
  }

  private toggle() { if (this.open) this.close(); else this.openPanel(); }

  private openPanel() {
    this.open = true;
    if (this.panelRoot) this.panelRoot.enabled = true;
    this.lastId = -1;          // re-read even if the id hasn't changed since last open
    this.refresh();
  }

  private close() { this.open = false; if (this.panelRoot) this.panelRoot.enabled = false; }

  /** Open/close from other scripts if you ever need to. */
  public setOpen(v: boolean) { if (v) this.openPanel(); else this.close(); }
  public isOpen(): boolean { return this.open; }

  private refresh() {
    if (!this.arenaIdLabel) return;
    let id = 0;
    try { if (this.arenaStreamer) id = Number(this.arenaStreamer.getArenaId()) || 0; } catch (e) {}
    if (id === this.lastId) return;
    this.lastId = id;
    try { this.arenaIdLabel.text = this.formatArenaId(id); } catch (e) {}
  }

  // The wearer-facing form: 8 digits split 4-4, e.g. 1011 -> "0000-1011".
  // ArenaStreamerTyped has the same helper but it's private, so this mirrors it.
  // Display only — the hyphen is never sent over the websocket.
  private formatArenaId(n: number): string {
    if (!(n > 0)) return this.placeholder || "--------";
    const s = ("00000000" + String(Math.floor(n))).slice(-8);
    return s.slice(0, 4) + "-" + s.slice(4);
  }
}
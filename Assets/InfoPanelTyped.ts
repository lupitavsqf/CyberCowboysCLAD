// =============================================================================
//  InfoPanelTyped.ts  —  ONE shared panel, content swapped per button
// -----------------------------------------------------------------------------
//  Lives on calibratepanel. Owns the panel and everything in it:
//
//        TOP TEXT          <- set by whichever button opened the panel
//         [ IMAGE ]        <- set by whichever button opened the panel
//       BOTTOM TEXT        <- set by whichever button opened the panel
//        0000-1011         <- the CURRENT arena id, same for every button
//        [X]
//
//  Each opener button carries an InfoPanelButtonTyped holding its own text and
//  image, and calls show() here. Because this script is the SINGLE owner of the
//  panel's open/closed state, two buttons can share the panel with no race
//  between one instance hiding it and another showing it.
//
//  Everything is positioned BY HAND in the scene — this script only shows/hides
//  the panel and writes the text/texture into the objects you point it at.
//
//  Wiring (Inspector), all on calibratepanel:
//    • panelRoot     -> calibratepanel itself
//    • closeButton   -> the close button's PinchButton (a child of the panel)
//    • topLabel / image / bottomLabel / arenaIdLabel -> the objects in the panel
//    • arenaStreamer -> GameRoot/ArenaRoot
//    • closeOnButtons-> ChooseLessonButton's + homebutton's PinchButtons
//                       (do NOT put the opener buttons in here — they open it)
// =============================================================================

import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { ArenaStreamerTyped } from "./ArenaStreamerTyped";

@component
export class InfoPanelTyped extends BaseScriptComponent {
  @input @allowUndefined @hint("calibratepanel — the panel background. Hidden until a button opens it.") panelRoot: SceneObject;
  @input @allowUndefined @hint("The close button's PinchButton, sitting on the panel.") closeButton: PinchButton;
  @input @allowUndefined @hint("The Text ABOVE the image. Each button supplies its own words.") topLabel: Text;
  @input @allowUndefined @hint("The Image component in the middle of the panel. Each button supplies its own picture.") image: Image;
  @input @allowUndefined @hint("The Text BELOW the image. Each button supplies its own words.") bottomLabel: Text;
  @input @allowUndefined @hint("The arena id Text (a copy of ArenaIdLabel). Shown the same for every button.") arenaIdLabel: Text;
  @input @hint("Shown while no arena is being tracked yet.") placeholder: string = "--------";
  @input @allowUndefined @hint("Buttons that CLOSE this panel (ChooseLessonButton, homebutton). NOT the buttons that open it.") closeOnButtons: PinchButton[];
  // NOTE: arenaStreamer is declared LAST on purpose. The AssignableType_N tags in
  // the scene file are numbered by the declaration order of assignable inputs, so
  // adding one above closeOnButtons would renumber it and can silently blank out
  // wiring already saved in the scene.
  @input @allowUndefined @hint("GameRoot/ArenaRoot — the ArenaStreamerTyped that knows the current arena.") arenaStreamer: ArenaStreamerTyped;

  private open = false;
  private owner: any = null;   // which InfoPanelButtonTyped opened it
  private lastId = -1;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.wire());
    // ArenaStreamerTyped has no "arena changed" callback (it only exposes
    // onCourses), so we re-read getArenaId() while the panel is open, cached
    // against lastId so the Text is only touched when the number changes.
    this.createEvent("UpdateEvent").bind(() => { if (this.open) this.refresh(); });
  }

  private wire() {
    if (this.panelRoot) this.panelRoot.enabled = false;   // closed at launch
    if (this.closeButton) this.closeButton.onButtonPinched.add(() => this.close());

    // Counts only NON-EMPTY slots. An array element added in the Inspector but
    // never assigned is skipped by the `if (b)` guard, so a list showing "1 item"
    // can still hook up nothing.
    let wiredClose = 0;
    (this.closeOnButtons || []).forEach((b) => {
      if (b) { wiredClose++; b.onButtonPinched.add(() => this.close()); }
    });

    // The image swaps baseTex per button, so give it its own material copy first.
    // Without this, writing baseTex would change every other object sharing the
    // same material asset.
    try { if (this.image && this.image.mainMaterial) this.image.mainMaterial = this.image.mainMaterial.clone(); } catch (e) {}

    print("[InfoPanel] panelRoot=" + (this.panelRoot ? "ok" : "MISSING")
        + "  closeButton=" + (this.closeButton ? "ok" : "MISSING")
        + "  topLabel=" + (this.topLabel ? "ok" : "MISSING")
        + "  image=" + (this.image ? "ok" : "MISSING")
        + "  bottomLabel=" + (this.bottomLabel ? "ok" : "MISSING")
        + "  arenaIdLabel=" + (this.arenaIdLabel ? "ok" : "MISSING")
        + "  arenaStreamer=" + (this.arenaStreamer ? "ok" : "MISSING")
        + "  closeOnButtons=" + wiredClose + " wired");
  }

  /** Called by InfoPanelButtonTyped. `owner` is the button asking. */
  public show(owner: any, top: string, bottom: string, tex: Texture) {
    this.owner = owner;
    this.open = true;
    try { if (this.topLabel) this.topLabel.text = top || ""; } catch (e) {}
    try { if (this.bottomLabel) this.bottomLabel.text = bottom || ""; } catch (e) {}
    // No texture on a button = leave whatever the Image already has.
    if (tex && this.image) { try { this.image.mainPass.baseTex = tex; } catch (e) {} }
    if (this.panelRoot) this.panelRoot.enabled = true;
    this.lastId = -1;          // force a re-read of the arena id
    this.refresh();
  }

  public close() { this.open = false; this.owner = null; if (this.panelRoot) this.panelRoot.enabled = false; }

  /** True only if the panel is open AND this exact button is the one showing. */
  public isShowing(owner: any): boolean { return this.open && this.owner === owner; }
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
  private formatArenaId(n: number): string {
    if (!(n > 0)) return this.placeholder || "--------";
    const s = ("00000000" + String(Math.floor(n))).slice(-8);
    return s.slice(0, 4) + "-" + s.slice(4);
  }
}

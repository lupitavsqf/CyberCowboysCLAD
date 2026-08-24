// =============================================================================
//  InfoPanelButtonTyped.ts  —  one opener button for the shared InfoPanel
// -----------------------------------------------------------------------------
//  Put one of these on EVERY button that should open the shared panel
//  (calibratebutton, newbutton, ...). Each carries its own text and image; the
//  panel itself is owned by InfoPanelTyped on calibratepanel.
//
//  Pressing a button:
//    • panel closed          -> opens it with THIS button's content
//    • open with MY content  -> closes it (toggle)
//    • open with ANOTHER's   -> swaps straight over to MY content
//
//  Wiring (Inspector):
//    • openButton -> this button's own PinchButton
//    • panel      -> the InfoPanelTyped on calibratepanel
//    • topText / bottomText / image -> what THIS button shows
// =============================================================================

import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { InfoPanelTyped } from "./InfoPanelTyped";

@component
export class InfoPanelButtonTyped extends BaseScriptComponent {
  @input @allowUndefined @hint("This button's own PinchButton.") openButton: PinchButton;
  @input @allowUndefined @hint("The InfoPanelTyped component on calibratepanel.") panel: InfoPanelTyped;
  @input @hint("The line ABOVE the image, for THIS button.") topText: string = "";
  @input @hint("The line BELOW the image, for THIS button. Use \\n for a manual line break.") bottomText: string = "";
  @input @allowUndefined @hint("The picture THIS button shows. Leave empty to keep whatever the Image already has.") image: Texture;

  onAwake() { this.createEvent("OnStartEvent").bind(() => this.wire()); }

  private wire() {
    if (!this.openButton || !this.panel) {
      print("[InfoPanelButton] Assign Open Button and Panel on '" + this.getSceneObject().name + "'.");
      return;
    }
    this.openButton.onButtonPinched.add(() => this.toggle());
  }

  private toggle() {
    if (!this.panel) return;
    if (this.panel.isShowing(this)) this.panel.close();
    else this.panel.show(this, this.topText, this.bottomText, this.image);
  }
}

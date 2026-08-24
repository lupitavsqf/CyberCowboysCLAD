// =============================================================================
//  ChooseLessonMenuTyped.ts  —  In-AR "Choose Lesson" menu  (STABLE LAYOUT)
// -----------------------------------------------------------------------------
//  Floating dark panel, header, lessons grouped by level with a gold section
//  label, one card per lesson (thumbnail, tag, name, points/obstacles, Load).
//  Everything is positioned in real-world CENTIMETRES from the panel centre;
//  the script converts cm to local units using the panel's world scale.
// =============================================================================

import { ArenaStreamerTyped } from "./ArenaStreamerTyped";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

@component
export class ChooseLessonMenuTyped extends BaseScriptComponent {
  // ── Wiring ──────────────────────────────────────────────────────────────────
  @input @allowUndefined arenaStreamer: ArenaStreamerTyped;
  @input @allowUndefined openButton: PinchButton;
  @input @allowUndefined closeButton: PinchButton;
  @input @allowUndefined panelRoot: SceneObject;
  @input @allowUndefined listContainer: SceneObject;
  @input @allowUndefined cardPrefab: ObjectPrefab;
  @input @allowUndefined @hint("Font for the header + section labels.") uiFont: Font;

  // ── Layout — all in real-world CENTIMETRES ──────────────────────────────────
  @input @hint("SIZE DIAL. Height of one card in cm. Everything scales from this.") cardHeightCm: number = 8;
  @input @hint("Cards per row.") columns: number = 2;
  @input @hint("Total width across all columns, in cm.") panelWidthCm: number = 30;
  @input @hint("Gap between columns, in cm.") colGapCm: number = 1.5;
  @input @hint("Gap between rows, in cm.") rowGapCm: number = 1.5;
  @input @hint("Where the first section starts, in cm ABOVE the panel centre.") topStartCm: number = 11;
  @input @hint("Header height above the panel centre, in cm.") headerTopCm: number = 15;
  @input @hint("Move the header (CHOOSE LESSON) left/right, in cm from the panel centre. Negative = left, e.g. to line it up with the NOVICE labels.") headerXCm: number = 0;
  @input @allowUndefined @hint("OPTIONAL: if your header is an IMAGE object (e.g. the metallic CHOOSE LESSON), drag it here so Header X/Top Cm move it too.") headerObject: SceneObject;
  @input @hint("Scroll buttons: X of the UP button, in cm from the panel centre (put it to the right of the header).") scrollBtnXCm: number = 12;
  @input @hint("Scroll buttons: Y in cm above the panel centre (match Header Top Cm to line up with the header).") scrollBtnYCm: number = 15;
  @input @hint("Gap between the up and down scroll buttons, in cm.") scrollBtnGapCm: number = 5;
  @input @hint("How far cards/text sit in FRONT of the panel background, in cm.") cardForwardCm: number = 1.2;
  // Depth / parallax. These are EXTRA cm on top of Card Forward Cm, so the header
  // and the level labels float above the card plane instead of sharing it.
  // 0 = old behaviour (everything flat on one plane).
  @input @hint("DEPTH: extra cm the CHOOSE A LESSON header floats in FRONT of the cards. 0 = flat with everything else.") headerForwardCm: number = 0.8;
  @input @hint("DEPTH: extra cm the NOVICE / ELEMENTARY / ... labels float in FRONT of the cards. 0 = flat with everything else.") labelForwardCm: number = 0.5;
  @input @hint("Fine-tune of all card text size (1 = default).") textScale: number = 1.0;
  @input @hint("Wrap titles and tags onto a new line after this many characters (breaks at spaces).") titleWrapChars: number = 18;
  @input @hint("Wrap the meta line (points / obstacles) after this many characters.") metaWrapChars: number = 24;
  @input @hint("LEFT EDGE of the level labels, in cm from the panel centre. Labels are left-aligned. 0 = starts at centre; negative = further left.") labelXCm: number = 0;
  @input @hint("Vertical nudge of the level labels, in cm. Positive = higher above its group; negative = lower.") labelYCm: number = 0;
  @input @hint("Size of the level labels (1 = default). Lower it, e.g. 0.8, to make them smaller.") labelScale: number = 1.0;

  // ── Scrolling (Y axis) ──────────────────────────────────────────────────────
  @input @allowUndefined @hint("Optional PinchButton that scrolls the list UP.") scrollUpButton: PinchButton;
  @input @allowUndefined @hint("Optional PinchButton that scrolls the list DOWN.") scrollDownButton: PinchButton;
  @input @hint("How far each scroll press moves the list, in cm.") scrollStepCm: number = 8;
  @input @hint("Visible height of the list area inside the panel, in cm. Taller content can be scrolled.") viewHeightCm: number = 26;
  @input @hint("Leave OFF to place the Up/Down buttons BY HAND in the scene (drag them where you want and they stay put). Turn ON only if you'd rather auto-position them from the Scroll Btn X/Y/Gap Cm values.") autoPlaceScrollButtons: boolean = false;

  // ── Clipping (hide cards that scroll past the panel edges) ───────────────────
  // Because the cards are a real 3D layout (no Screen Transform), they aren't
  // masked by a UI rectangle. Instead we HIDE any card/label whose centre rises
  // above the TOP cutoff or drops below the BOTTOM cutoff, and show it again when
  // it scrolls back in. Cutoffs are in cm measured from the panel centre (up = +).
  @input @hint("TOP CLIP: cards whose centre goes ABOVE this many cm from the panel centre are hidden. Leave 0 to auto-use Top Start Cm as the top edge.") clipTopCm: number = 0;
  @input @hint("BOTTOM CLIP: cards whose centre drops BELOW this many cm from the panel centre are hidden. Leave 0 to auto-use (Top Start Cm − View Height Cm).") clipBottomCm: number = 0;
  @input @hint("CLIP SLACK, in cm. Added outside both cutoffs so a card that is only slightly over the edge still shows. Negative tightens (hides sooner, so nothing pokes out); e.g. set to −(half a card) for no overflow.") clipMarginCm: number = 0;

  // ── Auto-close ──────────────────────────────────────────────────────────────
  @input @allowUndefined @hint("Buttons that should CLOSE this panel when pressed (e.g. Home, Edit, Reload). Drag them here.") closeOnButtons: PinchButton[];

  // ── Header + section labels ─────────────────────────────────────────────────
  @input showHeader: boolean = false;
  @input showSectionLabels: boolean = false;
  @input headerText: string = "CHOOSE A LESSON";
  @input @allowUndefined @hint("OPTIONAL gradient image for the gold texts (CHOOSE LESSON header + NOVICE/ELEMENTARY/... labels). Leave EMPTY to use the built-in dark-brown -> rust -> yellow -> beige gradient. Drop any vertical gradient PNG here to restyle them.") labelGradient: Texture;

  // ── Thumbnails (local first) ────────────────────────────────────────────────
  @input showThumbnails: boolean = true;
  @input @allowUndefined @hint("OPTIONAL: only needed to download lessons you didn't bundle.") remoteMedia: any;
  @input @allowUndefined @hint("Novice thumbnails IN ORDER: novice1, novice2, ...") noviceThumbs: Texture[];
  @input @allowUndefined @hint("Elementary thumbnails IN ORDER") elementaryThumbs: Texture[];
  @input @allowUndefined @hint("Intermediate thumbnails IN ORDER") intermediateThumbs: Texture[];
  @input @allowUndefined @hint("Advanced thumbnails IN ORDER") advancedThumbs: Texture[];

  // ── Child names inside the card prefab ──────────────────────────────────────
  @input titleChildName: string = "Title";
  @input tagChildName: string = "Tag";
  @input metaChildName: string = "Meta";
  @input thumbChildName: string = "Thumb";
  @input loadButtonChildName: string = "LoadButton";

  // ── internals ───────────────────────────────────────────────────────────────
  private readonly CARD_UNIT = 1.0;
  private cards: SceneObject[] = [];
  private labels: SceneObject[] = [];
  private header: SceneObject = null;
  private content: SceneObject = null;
  private scrollY = 0;
  private scrollMaxCm = 0;
  private open = false;
  private warnedST = false;
  private thumbCache: { [slug: string]: Texture } = {};
  private readonly LEVELS = ["novice", "elementary", "intermediate", "advanced"];
  private readonly LEVEL_ORDER: { [k: string]: number } = { novice: 0, elementary: 1, intermediate: 2, advanced: 3 };
  private readonly COL_GOLD = new vec4(1.0, 0.843, 0.0, 1.0);
  private gradientTex: Texture = null;
  // Built-in themed gradient (top->bottom: beige -> gold -> rust -> dark brown),
  // baked as a tiny 16x256 PNG so the gold texts get a gradient fill with no asset
  // setup. Decoded once at startup; override it any time via the Label Gradient input.
  private readonly GRAD_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAEACAYAAAC6UvZOAAAA8klEQVR42u2a0Q3DUAgDaZX958oqHaCfgQzhJwHWdQDkB4dxpH7+v7tC+F1RGVqBUAug4KoBPXgYIwoGKCia6KGg3VAMdgGQJiigiSMy0gNIgIQCDotPQglxjFVqgVCfgIL+MYq7BEgo8GliMkZAQoHJMjFGEz9QI46BggQkQDqigDH2f/IAEn5gMka9QKzPiQd60A2SRQ/aLQ2ULVDeTyKurBf4BiiDMq48JGz3PyFAGUfyQBlXPrHOoDygB7mfxNz/0dX/hNz/j6gcsEz4gewHuT9kJbtwwBP354PkNnIbR+TEflPlNpKVZ9xGAz9ov40vw/jferz+7CQAAAAASUVORK5CYII=";

  onAwake() { this.createEvent("OnStartEvent").bind(() => this.wire()); }

  private wire() {
    this.decodeGradient();
    if (this.panelRoot) this.panelRoot.enabled = false;
    if (this.openButton) this.openButton.onButtonPinched.add(() => this.toggle());
    if (this.closeButton) this.closeButton.onButtonPinched.add(() => this.close());
    if (this.arenaStreamer) this.arenaStreamer.onCourses((rows) => { if (this.open) this.build(rows); });
    if (this.scrollUpButton) this.scrollUpButton.onButtonPinched.add(() => this.scroll(-1));
    if (this.scrollDownButton) this.scrollDownButton.onButtonPinched.add(() => this.scroll(1));
    (this.closeOnButtons || []).forEach((b) => { if (b) b.onButtonPinched.add(() => { if (this.open) this.close(); }); });
    if (!this.arenaStreamer || !this.openButton) {
      print("[ChooseLessonMenu] Assign Arena Streamer and Open Button on '" + this.getSceneObject().name + "'.");
    }
  }

  private toggle() { if (this.open) this.close(); else this.openMenu(); }

  private openMenu() {
    this.open = true;
    this.scrollY = 0;
    if (this.panelRoot) this.panelRoot.enabled = true;
    this.ensureHeader();
    this.placeChrome();
    if (this.arenaStreamer) { this.build(this.arenaStreamer.getCourses()); this.arenaStreamer.requestCourses(); }
  }

  private close() { this.open = false; if (this.panelRoot) this.panelRoot.enabled = false; }

  // ── Scale helpers ───────────────────────────────────────────────────────────
  private cScale(): vec3 {
    const s = this.listContainer ? this.listContainer.getTransform().getWorldScale() : vec3.one();
    return new vec3(Math.abs(s.x) > 1e-6 ? s.x : 1, Math.abs(s.y) > 1e-6 ? s.y : 1, Math.abs(s.z) > 1e-6 ? s.z : 1);
  }
  private pScale(): vec3 {
    const s = this.panelRoot ? this.panelRoot.getTransform().getWorldScale() : vec3.one();
    return new vec3(Math.abs(s.x) > 1e-6 ? s.x : 1, Math.abs(s.y) > 1e-6 ? s.y : 1, Math.abs(s.z) > 1e-6 ? s.z : 1);
  }
  private cardLocalScale(cellWcm: number): number {
    const cs = this.cScale();
    const byH = this.cardHeightCm / (this.CARD_UNIT * cs.y);
    const byW = (cellWcm - this.colGapCm) / (this.CARD_UNIT * cs.x);
    const s = Math.min(byH, byW);
    return s > 0 ? s : 0.1;
  }

  // ── Build the list ──────────────────────────────────────────────────────────
  private build(rows: any[]) {
    if (!this.cardPrefab || !this.listContainer) return;
    if (this.content) { this.content.destroy(); this.content = null; }
    this.cards = []; this.labels = [];
    this.content = global.scene.createSceneObject("ScrollContent");
    this.content.setParent(this.listContainer);
    this.content.getTransform().setLocalPosition(vec3.zero());

    const byLevel: { [lvl: string]: any[] } = {};
    (rows || []).forEach((c) => {
      const lvl = String(c.level || "").toLowerCase();
      if (this.LEVEL_ORDER[lvl] === undefined) return;
      (byLevel[lvl] = byLevel[lvl] || []).push(c);
    });
    this.LEVELS.forEach((lvl) => { if (byLevel[lvl]) byLevel[lvl].sort((a, b) => (Number(a.course_ID) || 0) - (Number(b.course_ID) || 0)); });

    const cs = this.cScale();
    const cols = Math.max(1, Math.floor(this.columns));
    const cellWcm = this.panelWidthCm / cols;
    const cardScale = this.cardLocalScale(cellWcm);

    const cellWL = cellWcm / cs.x;
    const rowStepL = (this.cardHeightCm + this.rowGapCm) / cs.y;
    const forwardL = this.cardForwardCm / cs.z;
    // Labels ride in front of the card plane so the sections read as raised.
    const labelForwardL = (this.cardForwardCm + this.labelForwardCm) / cs.z;
    const leftX = -(this.panelWidthCm / cs.x) / 2 + cellWL / 2;
    let cursorY = this.topStartCm / cs.y;

    this.LEVELS.forEach((lvl) => {
      const list = byLevel[lvl];
      if (!list || list.length === 0) return;

      if (this.showSectionLabels) {
        this.makeLabel(this.cap(lvl), this.labelXCm / cs.x, cursorY + this.labelYCm / cs.y, labelForwardL, cardScale);
        cursorY -= (this.cardHeightCm * 0.55) / cs.y;
      }

      list.forEach((c, j) => {
        const col = j % cols, row = Math.floor(j / cols);
        const x = leftX + col * cellWL;
        const y = cursorY - (this.cardHeightCm / 2) / cs.y - row * rowStepL;
        this.makeCard(c, lvl, j + 1, new vec3(x, y, forwardL), cardScale);
      });

      const rowsUsed = Math.ceil(list.length / cols);
      cursorY -= rowsUsed * rowStepL + this.rowGapCm / cs.y;
    });

    const bottomCm = cursorY * cs.y;
    const spanCm = this.topStartCm - bottomCm;
    this.scrollMaxCm = Math.max(0, spanCm - this.viewHeightCm);
    this.scrollY = Math.min(this.scrollY, this.scrollMaxCm);
    this.applyScroll();
  }

  private applyScroll() {
    if (!this.content) return;
    const sy = this.cScale().y;
    this.content.getTransform().setLocalPosition(new vec3(0, this.scrollY / sy, 0));
    this.updateClip(sy);
  }

  // Top/bottom cutoff lines in cm from the panel centre. Left at 0, each auto-
  // derives from the fields that already define the visible list area.
  private clipBand(): { top: number; bottom: number } {
    const topEdge = this.clipTopCm !== 0 ? this.clipTopCm : this.topStartCm;
    const bottomEdge = this.clipBottomCm !== 0 ? this.clipBottomCm : this.topStartCm - this.viewHeightCm;
    return { top: topEdge + this.clipMarginCm, bottom: bottomEdge - this.clipMarginCm };
  }

  // Hide every card/label that has scrolled outside the band; show the rest.
  // effCm = the item's live Y in cm, panel frame = (its local Y in cm) + scrollY,
  // because scrolling moves the whole ScrollContent, not the items individually.
  private updateClip(sy?: number) {
    const csy = sy || this.cScale().y;
    const band = this.clipBand();
    const items = this.cards.concat(this.labels);
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (!o) continue;
      const effCm = o.getTransform().getLocalPosition().y * csy + this.scrollY;
      const show = effCm <= band.top && effCm >= band.bottom;
      if (o.enabled !== show) o.enabled = show;
    }
  }

  private scroll(dir: number) {
    if (!this.open || this.scrollMaxCm <= 0) return;
    this.scrollY = Math.max(0, Math.min(this.scrollMaxCm, this.scrollY + dir * this.scrollStepCm));
    this.applyScroll();
  }

  private makeCard(c: any, lvl: string, idx1: number, posLocal: vec3, cardScale: number) {
    const card = this.cardPrefab.instantiate(this.content || this.listContainer);
    this.cards.push(card);

    if (!this.warnedST && (card.getComponent("Component.ScreenTransform") as any)) {
      this.warnedST = true;
      print("[ChooseLessonMenu] Card had a Screen Transform — removing it so 3D layout works.");
    }
    const st = card.getComponent("Component.ScreenTransform") as any;
    if (st) { try { st.destroy(); } catch (e) {} }

    const tr = card.getTransform();
    tr.setLocalRotation(quat.quatIdentity());
    tr.setLocalScale(new vec3(cardScale, cardScale, cardScale));
    tr.setLocalPosition(posLocal);

    const thumbObj = this.findChild(card, this.thumbChildName);
    const tagObj = this.findChild(card, this.tagChildName);
    const titleObj = this.findChild(card, this.titleChildName);
    const metaObj = this.findChild(card, this.metaChildName);
    const btnObj = this.findChild(card, this.loadButtonChildName);

    this.place(thumbObj, 0, 0.24, 0.04, 0.6);     // thumbnail: upper half
    this.place(tagObj, 0.08, 0.02, 0.02, null);    // gold level tag — shifted right
    this.place(titleObj, 0.00, 0.005, 0.02, null); // lesson name — shifted right
    this.place(metaObj, 0.0, -0.18, 0.02, null);  // points · obstacles — shifted right
    this.place(btnObj, 0, -0.360, 0.02, 0.26);      // Load button: bottom

    const title = titleObj ? (titleObj.getComponent("Component.Text") as Text) : null;
    if (title) title.text = this.wrap(String(c.course_name || "Lesson"), this.titleWrapChars);
    this.fitText(titleObj, 0.105);

    const tag = tagObj ? (tagObj.getComponent("Component.Text") as Text) : null;
    if (tag) tag.text = this.wrap(this.cap(lvl), this.titleWrapChars);
    this.fitText(tagObj, 0.070);

    const meta = metaObj ? (metaObj.getComponent("Component.Text") as Text) : null;
    if (meta) {
      // Prefer the lesson's `description` column from savedCourses. If the server
      // hasn't sent one for this row, fall back to the old points/obstacles line
      // so the card is never blank.
      const desc = String(c.description ?? c.Description ?? "").trim();
      const fallback = (c.point_count ?? "?") + " points \u00B7 " + (c.obstacle_count ?? "?") + " obstacles";
      meta.text = this.wrap(desc.length > 0 ? desc : fallback, this.metaWrapChars);
    }
    this.fitText(metaObj, 0.060);

    if (this.showThumbnails) {
      const img = thumbObj ? (thumbObj.getComponent("Component.Image") as Image) : null;
      if (img) {
        // IMPORTANT: give THIS card its own material copy first. Every instantiated
        // card shares the prefab's one material, so writing baseTex below would
        // change the thumbnail on ALL cards at once (that's why you saw the same
        // picture everywhere). Cloning makes each card's thumbnail independent.
        try { if (img.mainMaterial) img.mainMaterial = img.mainMaterial.clone(); } catch (e) {}
        const local = this.localThumbFor(lvl, idx1);
        if (local) { try { img.mainPass.baseTex = local; } catch (e) {} }
        else this.applyThumb(img, lvl + idx1);
      }
    }

    const arenaId = Number(c.arena_id ?? c.course_ID) || 0;
    const btn = btnObj ? (btnObj.getComponent(PinchButton.getTypeName()) as PinchButton) : null;
    if (btn && arenaId > 0) {
      // loadCourse(), NOT setArenaId(): a lesson is poured into our own session
      // and rendered, while the arena code minted at Start stays on screen.
      btn.onButtonPinched.add(() => { if (this.arenaStreamer) this.arenaStreamer.loadCourse(arenaId); this.close(); });
    }
  }

  private place(obj: SceneObject, x: number, y: number, z: number, scale: number | null) {
    if (!obj) return;
    const tr = obj.getTransform();
    tr.setLocalPosition(new vec3(x, y, z));
    if (scale !== null) tr.setLocalScale(new vec3(scale, scale, scale));
  }

  private fitText(obj: SceneObject, targetH: number) {
    if (!obj) return;
    const t = obj.getComponent("Component.Text") as any;
    let fs = 6;
    try { if (t && typeof t.size === "number" && t.size > 0) fs = t.size; } catch (e) {}
    const s = (targetH * this.textScale) / fs;
    obj.getTransform().setLocalScale(new vec3(s, s, s));
  }

  private ensureHeader() {
    if (!this.showHeader || this.header || !this.panelRoot) return;
    const so = global.scene.createSceneObject("Header");
    so.setParent(this.panelRoot);
    const t = so.createComponent("Component.Text") as Text;
    if (this.uiFont) t.font = this.uiFont;
    t.text = (this.headerText || "").toUpperCase();
    this.align(t, true, true);
    this.applyGoldFill(t);
    const ps = this.pScale();
    so.getTransform().setLocalPosition(new vec3(this.headerXCm / ps.x, this.headerTopCm / ps.y, (this.cardForwardCm + this.headerForwardCm) / ps.z));
    const headerWorldCm = Math.max(1, this.cardHeightCm * 0.22);
    this.fitText(so, headerWorldCm / ps.y);
    this.header = so;
  }

  // Position the header (text and/or image) and the scroll buttons on the panel.
  // Runs each time the menu opens so they follow Header X/Top Cm and the button fields.
  private placeChrome() {
    const ps = this.pScale();
    const z = this.cardForwardCm / ps.z;
    // The header (text and/or the metallic image) floats forward; the scroll
    // buttons stay on the base plane so they keep hugging the panel.
    const hz = (this.cardForwardCm + this.headerForwardCm) / ps.z;
    const hx = this.headerXCm / ps.x, hy = this.headerTopCm / ps.y;
    if (this.header) this.header.getTransform().setLocalPosition(new vec3(hx, hy, hz));
    if (this.headerObject) {
      if (this.panelRoot && this.headerObject.getParent() !== this.panelRoot) this.headerObject.setParent(this.panelRoot);
      this.headerObject.getTransform().setLocalPosition(new vec3(hx, hy, hz));
    }
    // Only auto-move the scroll buttons if you asked for it. When OFF (default),
    // the buttons stay wherever you placed them in the scene — the script just
    // hooks up their clicks (see wire()).
    if (this.autoPlaceScrollButtons) {
      this.placeBtn(this.scrollUpButton, this.scrollBtnXCm, this.scrollBtnYCm, z, ps);
      this.placeBtn(this.scrollDownButton, this.scrollBtnXCm + this.scrollBtnGapCm, this.scrollBtnYCm, z, ps);
    }
  }

  // Parent a scroll button under the panel (so it shows/hides with it) and place it.
  private placeBtn(btn: PinchButton, xCm: number, yCm: number, z: number, ps: vec3) {
    if (!btn) return;
    const o = btn.getSceneObject();
    if (!o) return;
    if (this.panelRoot && o.getParent() !== this.panelRoot) o.setParent(this.panelRoot);
    o.getTransform().setLocalPosition(new vec3(xCm / ps.x, yCm / ps.y, z));
  }

  private makeLabel(txt: string, xL: number, yL: number, forwardL: number, cardScale: number) {
    if (!this.listContainer) return;
    const so = global.scene.createSceneObject("Label_" + txt);
    so.setParent(this.content || this.listContainer);
    const t = so.createComponent("Component.Text") as Text;
    if (this.uiFont) t.font = this.uiFont;
    t.text = txt.toUpperCase();
    this.align(t, false, true);
    this.applyGoldFill(t);
    so.getTransform().setLocalPosition(new vec3(xL, yL, forwardL));
    const labelWorldCm = Math.max(0.3, this.cardHeightCm * 0.16 * this.labelScale);
    this.fitText(so, labelWorldCm / this.cScale().y);
    this.labels.push(so);
  }

  // ── Thumbnails ──────────────────────────────────────────────────────────────
  private localThumbFor(lvl: string, idx1: number): Texture {
    let arr: Texture[] = null;
    if (lvl === "novice") arr = this.noviceThumbs;
    else if (lvl === "elementary") arr = this.elementaryThumbs;
    else if (lvl === "intermediate") arr = this.intermediateThumbs;
    else if (lvl === "advanced") arr = this.advancedThumbs;
    if (arr && idx1 >= 1 && idx1 <= arr.length) return arr[idx1 - 1] || null;
    return null;
  }
  private applyThumb(img: Image, slug: string) {
    const cached = this.thumbCache[slug];
    if (cached) { try { img.mainPass.baseTex = cached; } catch (e) {} return; }
    if (!this.remoteMedia || !this.arenaStreamer) return;
    const url = this.arenaStreamer.getHttpBase() + "/icons/" + slug + ".png";
    try {
      const res = this.arenaStreamer.makeResource(url);
      if (!res) return;
      this.remoteMedia.loadResourceAsImageTexture(
        res,
        (tex: Texture) => { this.thumbCache[slug] = tex; try { img.mainPass.baseTex = tex; } catch (e) {} },
        (_e: string) => {}
      );
    } catch (e) {}
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  // Word-wrap so no line exceeds maxChars; the "\n" breaks are honored by Text.
  private wrap(str: string, maxChars: number): string {
    if (!str) return "";
    if (!(maxChars > 0)) return String(str);
    const words = String(str).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (let w of words) {
      while (w.length > maxChars) {
        if (line.length > 0) { lines.push(line); line = ""; }
        lines.push(w.substring(0, maxChars));
        w = w.substring(maxChars);
      }
      if (line.length === 0) line = w;
      else if (line.length + 1 + w.length <= maxChars) line += " " + w;
      else { lines.push(line); line = w; }
    }
    if (line.length > 0) lines.push(line);
    return lines.join("\n");
  }

  private cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
  private align(t: Text, center: boolean, middle: boolean) {
    try { t.horizontalAlignment = center ? HorizontalAlignment.Center : HorizontalAlignment.Left; } catch (e) {}
    try { t.verticalAlignment = middle ? VerticalAlignment.Center : VerticalAlignment.Top; } catch (e) {}
  }
  private setColor(t: Text, c: vec4) {
    try { (t as any).textFill.color = c; } catch (e) {}
    try { (t as any).textFill.enabled = true; } catch (e) {}
  }

  // The gradient to fill the gold texts with: the artist override wins, otherwise
  // the built-in themed one (once it has finished decoding).
  private goldTexture(): Texture { return this.labelGradient || this.gradientTex || null; }

  // Decode the built-in base64 gradient once, then restyle anything already drawn.
  private decodeGradient() {
    if (this.gradientTex || this.labelGradient) return;
    try {
      Base64.decodeTextureAsync(
        this.GRAD_B64,
        (tex: Texture) => { this.gradientTex = tex; this.refreshGoldFills(); },
        () => {}
      );
    } catch (e) {}
  }

  // Fill a Text with the gradient (letters take on the gradient, like CSS
  // background-clip:text). Falls back to flat gold if no texture is ready yet.
  private applyGoldFill(t: Text) {
    if (!t) return;
    const tex = this.goldTexture();
    if (!tex) { this.setColor(t, this.COL_GOLD); return; }
    try {
      const f = (t as any).textFill;
      f.mode = TextFillMode.Texture;   // switch from solid colour to textured fill
      f.texture = tex;                 // the gradient image
      f.textureStretch = StretchMode.Stretch; // cover the whole word, both axes
      f.tileCount = 1;                 // one gradient across the text, not tiled
      f.colorTint = new vec4(1, 1, 1, 1); // no extra tint over the gradient
      f.enabled = true;
    } catch (e) { this.setColor(t, this.COL_GOLD); }
  }

  // Re-apply the fill to the header + level labels (used once the gradient decodes).
  private refreshGoldFills() {
    if (this.header) {
      const ht = this.header.getComponent("Component.Text") as Text;
      if (ht) this.applyGoldFill(ht);
    }
    for (let i = 0; i < this.labels.length; i++) {
      const o = this.labels[i];
      if (!o) continue;
      const t = o.getComponent("Component.Text") as Text;
      if (t) this.applyGoldFill(t);
    }
  }
  private findChild(root: SceneObject, name: string): SceneObject {
    if (!name || !root) return null;
    if (root.name === name) return root;
    const n = root.getChildrenCount();
    for (let i = 0; i < n; i++) { const f = this.findChild(root.getChild(i), name); if (f) return f; }
    return null;
  }
}
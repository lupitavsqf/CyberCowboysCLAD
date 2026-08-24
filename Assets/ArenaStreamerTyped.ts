// =============================================================================
// ArenaStreamerTyped.ts — Cyber Cowboys typed obstacle + path renderer
// -----------------------------------------------------------------------------
// Uses DB snapshots from wss://cybercowboys-back.fly.dev and renders:
//   Obstacles.OBJECT_TYPE -> matching prefab (cone, pole, barrel, vertical,
//                            cavaletti, pause/stop, startline, finishline)
//   OBJECT_TYPE 'numbertag' -> floating text of the `number_tag` column value,
//                            drawn in the assigned font and lifted to sight level
//                            (NOT placed on the floor, no FBX).
//   OBJECT_TYPE 'stop'     -> the floor decal PLUS a floating "STOP" label at
//                            sight level (same trick as the number tags). Stand
//                            on the decal and the label counts 5-4-3-2-1 and
//                            finishes on "GO" with a chime. Step off early and
//                            it resets to "STOP".
//   Paths -> pathTrianglePrefab, blue-triangle.png floor decal (all waypoints),
//            drawn smaller than the prefab asks for and with extra dots filled in
//            between the stored waypoints so the course reads as one continuous
//            line rather than a row of separate markers. See PATH_DOT_SCALE_MULT
//            and PATH_DOT_SPACING_M, and densifyPath().
//
// Lens Studio units: centimetres. Your DB/editor units are canvas pixels.
// =============================================================================

@component
export class ArenaStreamerTyped extends BaseScriptComponent {
  // Connection
  @input internetModule: InternetModule;
  @input websocketUrl: string = "wss://cybercowboys-back.fly.dev/";

  // Scene
  @input arenaRoot: SceneObject;
  @input @allowUndefined camera: SceneObject;

  // Typed obstacle prefabs. Create prefabs from the FBX assets, then drag them here.
  @input @allowUndefined conePrefab: ObjectPrefab;
  @input @allowUndefined polePrefab: ObjectPrefab;
  @input @allowUndefined barrelPrefab: ObjectPrefab;
  @input @allowUndefined verticalPrefab: ObjectPrefab;
  @input @allowUndefined cavalettiPrefab: ObjectPrefab;
  @input @allowUndefined pauseZonePrefab: ObjectPrefab; // flat stop-arena.png floor decal
  @input @allowUndefined
  @hint("FBX prefab for the START line. Import startline.fbx, make a prefab, drag it here. Placed on the floor like any obstacle.")
  startLinePrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("FBX prefab for the FINISH line. Import finishline.fbx, make a prefab, drag it here. Placed on the floor like any obstacle.")
  finishLinePrefab: ObjectPrefab;
  @input @allowUndefined defaultObstaclePrefab: ObjectPrefab;
  @input
  @hint("Extra size multiplier applied ONLY to the start/finish line prefabs, on top of their own baked-in scale and obstacleBaseScale/arenaScale. Bump this up if the lines still look too small.")
  startFinishLineExtraScale: number = 10.0;

  // ── Path colour -> prefab ──────────────────────────────────────────────────
  // ONE PREFAB PER COLOUR. This script never touches materials: it only decides
  // WHICH prefab to instantiate, and each prefab carries its own colour baked
  // into its own Render Mesh Visual.
  //
  // That means the four slots below MUST be four genuinely different prefabs.
  // Duplicating PathDot.prefab four times and renaming the copies is NOT enough —
  // a renamed clone still points at the blue material, so all four colours come
  // out blue and it looks like this code is broken. auditPathPrefabs() checks for
  // exactly that on the first path draw and shouts if it finds it.
  //
  // The website only offers four swatches (blue / green / yellow / red — see
  // PATH_COLORS in index.html), so these four cover everything the editor can
  // produce today. Any colour with no prefab of its own (or an empty/unknown
  // value in the DB) falls back to the blue one, so the arena never silently
  // loses a waypoint.
  @input @allowUndefined
  @hint("Prefab for BLUE path points (Paths.color = 'blue'). Also the FALLBACK for any colour with no prefab of its own.")
  pathTrianglePrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("Prefab for GREEN path points (Paths.color = 'green'). Must be its OWN prefab with a green material — not a renamed copy of the blue one.")
  pathTriangleGreenPrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("Prefab for YELLOW path points (Paths.color = 'yellow'). Must be its OWN prefab with a yellow material — not a renamed copy of the blue one.")
  pathTriangleYellowPrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("Prefab for RED path points (Paths.color = 'red'). Must be its OWN prefab with a red material — not a renamed copy of the blue one.")
  pathTriangleRedPrefab: ObjectPrefab;

  // Optional: add colours WITHOUT editing this file. If the website ever grows a
  // fifth swatch, type its Paths.color value here and drop a prefab in the
  // matching slot. Matched case-insensitively; these win over the four above.
  @input
  @hint("Extra Paths.color values from the DB, e.g. purple, orange. Case-insensitive. Leave empty unless the website has gained new swatches.")
  pathColorNames: string[] = [];
  @input
  @hint("Prefabs matching pathColorNames 1:1 — same order, same length.")
  pathColorPrefabs: ObjectPrefab[] = [];

  // ── Continuous ribbon path ─────────────────────────────────────────────────
  // Instead of (or as well as) a line of separate dot prefabs, lay a single flat
  // 3D strip along the course — a painted racing line on the floor.
  //
  // It is built from exactly the same densified points the dots use, so it
  // follows precisely the same route, and each stretch takes the colour of the
  // dot it replaces: the strip is cut into runs of one colour, and each run's
  // material is CLONED from that colour's PathDot prefab. Nothing new to wire —
  // whatever the dots looked like, the ribbon matches, and it keeps matching if
  // you re-colour a prefab later.
  //
  // The mesh is generated at runtime with MeshBuilder, in arenaRoot-local
  // centimetres, so it inherits the arena's placement, heading and scale for
  // free, exactly like every dot did.
  @input
  @hint("Draw the course as one continuous 3D strip along the floor instead of a line of separate dots.")
  pathRibbonEnabled: boolean = true;

  @input
  @hint("With the ribbon on, skip the dot prefabs entirely — the ribbon REPLACES them. Turn this off to draw the dots on top of the ribbon as well.")
  pathRibbonHidesDots: boolean = true;

  @input
  @hint("How wide the strip is, in arena-metres. Rides arenaScale like every other length here, so it stays in proportion when the course is scaled.")
  pathRibbonWidthMeters: number = 0.4;

  @input
  @hint("How far the strip floats above the floor, in cm, ON TOP of groundOffsetCm. A few millimetres is enough to stop it fighting with the floor for the same depth and flickering.")
  pathRibbonLiftCm: number = 0.5;

  @input @allowUndefined
  @hint("OPTIONAL. Leave EMPTY and the ribbon clones each colour's PathDot material, so it always matches the dots. Assign a material here to use your own instead — it gets tinted per path colour.")
  pathRibbonMaterial: Material;

  @input
  @hint("Scale the path dots with the arena when you resize it in calibration. The Paths table has no scale column of its own, so the factor is read off the obstacles in the same session. Turn OFF to keep dots a fixed size regardless of calibration.")
  pathScaleFollowsArena: boolean = true;

  // ── Number tags ────────────────────────────────────────────────────────────
  // 'numbertag' rows are NOT given an FBX. Instead we render the value of the
  // DB column `number_tag` as floating text, lifted to sight level.
  @input @allowUndefined
  @hint("Zilla Slab font asset. Import ZillaSlab-Bold.ttf into Assets, then drag the Font asset here.")
  numberTagFont: Font;
  @input
  @hint("How high the number floats off the floor, in arena-metres. ~1.5 ≈ eye / sight level at full arenaScale. NUMBER_TAG_EXTRA_LIFT_M is added on top of this.")
  numberTagHeightMeters: number = 1.5;
  @input
  @hint("Overall size multiplier for the floating number. Increase if the digits read too small. NUMBER_TAG_EXTRA_SCALE multiplies this again.")
  numberTagScale: number = 1.0;
  @input
  @hint("Keep each number turned toward the wearer (yaw only, stays upright). Off = the number faces into the arena.")
  numberTagFaceCamera: boolean = true;
  @input
  @hint("Spin the number by this many degrees if it ends up facing away from you (try 180).")
  numberTagYawOffsetDeg: number = 0;
  @input
  @hint("How far the number bobs up and down, in arena-metres, from its resting height. 0 = no float.")
  numberTagFloatAmplitudeMeters: number = 0.15;
  @input
  @hint("How fast the number bobs up and down, in cycles per second.")
  numberTagFloatSpeed: number = 0.6;

  // ── Stop zones ─────────────────────────────────────────────────────────────
  // A 'stop' row gets its floor decal like any obstacle, AND a floating label
  // above it built exactly like a number tag (same font, same bob, same
  // billboarding). The label reads STOP until the wearer stands on the decal,
  // then counts down and finishes on GO.
  @input @allowUndefined
  @hint("Font for the floating STOP / countdown label. Normally the same Zilla Slab font as the number tags — leave empty to reuse numberTagFont.")
  stopLabelFont: Font;
  @input
  @hint("How high the STOP label floats off the floor, in arena-metres. Match numberTagHeightMeters to keep it at the same eye level as the numbers.")
  stopLabelHeightMeters: number = 1.5;
  @input
  @hint("Overall size multiplier for the STOP / countdown label.")
  stopLabelScale: number = 1.0;
  @input
  @hint("What the label reads before the wearer steps on the sign.")
  stopLabelText: string = "STOP";
  @input
  @hint("What the label reads once the hold is complete.")
  stopGoText: string = "GO";
  @input
  @hint("How many seconds the wearer must stand on the sign. The label counts this down, one number per second.")
  stopHoldSeconds: number = 5;
  @input
  @hint("How close to the middle of the stop sign the wearer's head must be to count as standing on it, in arena-metres. Roughly the radius of the decal.")
  stopTriggerRadiusMeters: number = 0.75;
  @input
  @hint("Once the wearer is standing on the sign the label slides this far out in front of them, in arena-metres, so the countdown isn't sitting on their nose. It returns over the sign when they step off. 0 = always stay over the sign.")
  stopLabelWearerOffsetMeters: number = 1.2;
  @input
  @hint("How long the label takes to slide between the sign and in front of the wearer, in seconds. ~0.25 glides; 0 = snap instantly.")
  stopLabelFollowSmoothing: number = 0.25;
  @input
  @hint("Tick ONLY if the countdown appears behind you instead of in front. Flips which way the label is pushed out.")
  stopLabelFlipForward: boolean = false;
  @input @allowUndefined
  @hint("AudioComponent played when the wearer completes the full stop — wire it to CalibrationComplete.mp3, the same chime as finishing calibration.")
  stopCompleteAudio: AudioComponent;

  // ── Wearer dot ─────────────────────────────────────────────────────────────
  // A path dot that isn't part of any path: it rides on the floor under the
  // wearer, marking where they are standing in the arena.
  @input @allowUndefined
  @hint("Prefab for the dot that follows the wearer around, drawn on the floor under their feet. Any of the PathDot prefabs works, or give it its own cowboy marker so it reads apart from the path. Leave EMPTY to turn the follower off.")
  wearerDotPrefab: ObjectPrefab;
  @input
  @hint("Size of the wearer's dot at 100%, in arena-metres. Matches triangleSizeMeters by default so it sits alongside the path dots.")
  wearerDotSizeMeters: number = 0.75;
  @input
  @hint("Turn the dot to point where the wearer is facing. Pointless for a round dot; matters if the prefab is an arrow or a cowboy that has a front.")
  wearerDotFaceHeading: boolean = true;
  @input
  @hint("Spin the wearer's dot by this many degrees if it ends up pointing the wrong way (try 180).")
  wearerDotYawOffsetDeg: number = 0;
  @input
  @hint("Smoothing in seconds for the dot's slide. Head tracking sways even when you stand still, and a dot copying that exactly looks nervous. ~0.1 settles it without feeling laggy; 0 = glued exactly under the head.")
  wearerDotSmoothing: number = 0.1;

  // ── Step prediction ────────────────────────────────────────────────────────
  // Where the next four footfalls will land. The wearer's head dips to a low point
  // once per step — that trough IS the footfall (heel strike) — so timing the
  // troughs gives the cadence, and cadence + velocity gives the next spots.
  // NOTE ON AXES: the head's vertical coordinate is Y in Lens Studio, not Z (Z is
  // forward/back here). The troughs hunted below are minima of camera Y.
  @input @allowUndefined
  @hint("Marker dropped where the NEXT footfall is predicted to land. Leave EMPTY to reuse wearerDotPrefab, so one prefab covers the wearer's dot and all four step markers. Step prediction is off only if BOTH this and wearerDotPrefab are empty.")
  stepMarkerPrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("Marker for the 2nd step ahead. Empty = reuse the 1st marker's prefab.")
  stepMarkerSecondPrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("Marker for the 3rd step ahead. Empty = reuse the 1st marker's prefab. Colouring the four differently (e.g. green/yellow/orange/red) reads as how far ahead each guess is — and how much less each is worth trusting.")
  stepMarkerThirdPrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("Marker for the 4th step ahead. Empty = reuse the 1st marker's prefab. This one lands about two seconds out, so it swings wide whenever the wearer turns.")
  stepMarkerFourthPrefab: ObjectPrefab;
  @input
  @hint("Size of the step markers at 100%, in arena-metres.")
  stepMarkerSizeMeters: number = 0.4;
  @input
  @hint("Hide the markers below this speed, in real m/s. Standing still there is no stride to extrapolate, so the prediction would just pile up under the wearer. ~0.4 keeps them for walking only.")
  stepMinSpeedMps: number = 0.4;
  @input
  @hint("How deep a dip must be, from the head's high point down to its low point, to count as a footfall — in centimetres. Walking bobs the head roughly 1-2cm each step. Raise this if markers fire while standing, lower it if slow walking is missed.")
  stepBobThresholdCm: number = 0.5;
  @input
  @hint("Seconds per step to assume until enough footfalls have been timed to measure the real cadence. ~0.55 is an ordinary walking pace.")
  stepCadenceSeconds: number = 0.55;
  @input
  @hint("Smoothing in seconds on the wearer's velocity. Higher = steadier markers but slower to swing round when they turn.")
  stepVelocitySmoothingSeconds: number = 0.3;
  @input
  @hint("Spin the step markers by this many degrees if they point the wrong way (try 180).")
  stepMarkerYawOffsetDeg: number = 0;

  // Tuning
  @input targetSession: number = 0; // 0 = newest session
  @input arenaScale: number = 1.0;
  @input obstacleBaseScale: number = 1.0;
  @input triangleSizeMeters: number = 0.75;
  @input groundOffsetCm: number = 0.8;
  @input flipHandedness: boolean = false;
  // NOTE: there is deliberately no `mirrorArena` input any more. Change Direction is
  // not a way of LOOKING at the arena, it is a real edit to the course, so it lives on
  // the server (changeDirectionInPlace) and reaches us as rewritten rows like any other
  // edit. The old flag reflected about the RIDER (local X = 0) while the website
  // reflected about the LAYOUT's own centre line — so an off-centre course jumped
  // across the arena here and stayed put there. See changeDirection() below.
  @input triangleYawOffsetDeg: number = 0;
  @input obstacleYawOffsetDeg: number = 0;
  @input enableLogging: boolean = true;
  @input logTypes: boolean = true;

  // ── Slow / flaky connection handling ───────────────────────────────────────
  // Everything here exists because the link to the server is the one part of this
  // Lens nobody controls. On a good network none of it fires.
  @input
  @hint("Wait this long before actually asking the server for fresh tables, so a burst of triggers (open, start, retrieve, reload) becomes ONE pull instead of four. 0.25-0.5 is right; 0 restores the old behaviour.")
  snapshotCoalesceSeconds: number = 0.35;
  @input
  @hint("First reconnect wait, in seconds. Each further failure doubles it (with jitter) up to the maximum below, so a server that is down doesn't get hammered every 3s by every pair of glasses in the room.")
  reconnectBaseSeconds: number = 1.5;
  @input
  @hint("Longest the reconnect wait is allowed to grow to, in seconds.")
  reconnectMaxSeconds: number = 30.0;
  @input
  @hint("Give up on a connection attempt that hasn't opened after this many seconds and start a fresh one. On a slow network a socket can sit half-open forever; without this the Lens waits with it.")
  connectTimeoutSeconds: number = 12.0;
  @input @allowUndefined
  @hint("OPTIONAL screen-space Text showing the link state (CONNECTING / LIVE / OFFLINE). Worth wiring: on a slow network the difference between 'still loading' and 'broken' is the whole of the user's experience.")
  connectionLabel: Text;

  // Optional proximity sound
  @input @allowUndefined alertAudio: AudioComponent;
  @input proximityRadiusMeters: number = 1.5;

  // ── On-screen arena ID (top-right, Zilla Slab) ──────────────────────────────
  @input
  @hint("Generate a new arena automatically the first time the glasses connect, so the arena code fills in without needing a Start button wired. Turn off to drive it only from the Start button.")
  autoStartArenaOnConnect: boolean = true;

  @input @allowUndefined
  @hint("Screen-space Text (top-right corner) that shows the active arena_id, dashed for the wearer, e.g. 0000-1000. Use the Zilla Slab font. The Edit button (ArenaIdEditorTyped) changes which arena_id this points at.")
  arenaIdLabel: Text;

  private socket: WebSocket | null = null;
  private isOpen = false;
  // True from createWebSocket() until onopen/onclose. Without this, two button
  // presses while the link is slow opened two sockets, and every snapshot then
  // arrived (and rebuilt the floor) twice.
  private isConnecting = false;
  private reconnectEvent: DelayedCallbackEvent | null = null;
  private reconnectPending = false;
  private reconnectAttempts = 0;
  // Bumped on every connect attempt so a timeout that fires late can tell whether
  // it still refers to the attempt in flight.
  private connectGen = 0;
  private connectTimeoutEvent: DelayedCallbackEvent | null = null;
  // Requests made while the socket was down. They are sent, in order, the moment
  // it comes back — a press that lands during a dropout used to vanish silently.
  private outbox: string[] = [];
  private readonly OUTBOX_MAX = 24;
  // One pending "give me fresh tables" request, coalesced.
  private snapshotEvent: DelayedCallbackEvent | null = null;
  private snapshotPending = false;
  // Fingerprint of the last snapshot accepted for each table, so a re-broadcast of
  // data we already have costs nothing.
  private snapSig: { [table: string]: number } = {};
  // ── Tables exempt from that fingerprint check ──────────────────────────────
  // savedCourses is not data — it is a nudge meaning "the lesson list moved", and
  // the list itself comes back separately as `coursesList`. So an IDENTICAL
  // savedCourses frame is still worth acting on: it may well be the second nudge
  // after the reply to the first was lost to a dropout, which is exactly what a
  // slow link does. Deduplicating it would leave the Choose Lesson menu empty
  // until the rider happened to press something else. The refetch is a few dozen
  // rows, so honouring every one of these is cheap; being stale here is visible.
  // Add any other table that must never be skipped.
  private readonly ALWAYS_FRESH_TABLES: string[] = ["savedCourses"];
  // Set when something changed; the floor is redrawn once, in onUpdate().
  private rebuildDirty = false;
  // Last "path rows exist but none match this session" message printed. Held so
  // the warning repeats only when the situation actually changes.
  private pathMissLog = "";
  // Timestamp of the last rebuild that had to give up because no session had been
  // resolved yet. Drives the retry in rebuild().
  private sessionWaitAt = -1;
  // Last arena calibration scale logged, so the line prints on change only.
  private lastArenaCal = -1;
  // Set true when Start is pressed while the socket is still connecting, so the
  // startArena request is sent as soon as the connection opens.
  private pendingStartArena = false;

  private obstacleRows: any[] = [];
  private pathRows: any[] = [];
  private dimsBySession: { [sid: number]: { dx: number; dy: number } } = {};
  private highWaterSession = 0;

  // ── The arena we're locked onto. ────────────────────────────────────────────
  // currentArenaId is the single source of truth (shown on screen, editable via
  // the Edit button). We render the CURRENT main session of that arena_id, looked
  // up live from arenaRows — so if the website moves "main" to another session,
  // or another session joins the arena, the glasses follow it automatically.
  // currentSessionId is only a fallback used before the Arenas snapshot arrives.
  private currentArenaId = 0;
  private currentSessionId = 0;
  private arenaRows: any[] = [];   // latest snapshot of the Arenas table

  // Codes 1..999 (shown 0000-0001..0000-0999) are the reserved band: saved
  // courses, which are read-only and viewed by RETRIEVING them (copied into our
  // own session) rather than followed like a live arena.
  private reservedMax = 999;
  // The glasses' own session, minted on Start / auto-start. Used as the scratch
  // session to retrieve saved courses into so they can be rendered.
  private mySession = 0;
  // Loading a saved course NEVER changes currentArenaId — the code minted at the
  // start of this Spectacles session stays on screen. These only track WHICH
  // course was poured into mySession, for logging / UI.
  private lastCourseId = 0;
  // Diagnostics for the colour -> prefab routing.
  private warnedColors: { [key: string]: boolean } = {};
  private wiringReported = false;
  // A course asked for before our arena existed (or before the socket opened);
  // fired as soon as we have a session.
  private pendingCourseId = 0;

  private liveObstacles: { [id: number]: { so: SceneObject; inside: boolean; type: string; prefabScale: vec3 } } = {};
  // Floating number-tag text objects, kept apart from liveObstacles so they never
  // trigger the proximity sound (they're labels, not solid obstacles).
  // `scale` is that tag's own labelScaleFor() result, remembered so the per-frame
  // bob can be scaled by it too — the amplitude used to be one shared number, which
  // is exactly the sort of thing that stays put while everything around it grows.
  private liveNumberTags: { [id: number]: { so: SceneObject; text: Text; baseHeightCm: number; floatPhase: number; scale: number } } = {};
  // Floating STOP / countdown labels, one per 'stop' row.
  //
  // Two objects per sign, and the split matters: the ANCHOR stays parked over the
  // decal forever and is what the trigger test measures against, while the LABEL
  // (its child, carrying the Text) is free to slide out in front of the wearer so
  // it's readable while they're standing on the sign. Measuring the zone from the
  // label instead would mean the zone follows you around the arena and the
  // countdown could never reset.
  private liveStopZones: {
    [id: number]: {
      so: SceneObject;        // anchor over the sign — never moves
      labelSo: SceneObject;   // child holding the Text — this is the part that drifts
      text: Text;
      floatPhase: number;
      scale: number;         // labelScaleFor() for this sign — drives height, size, bob, offset
      radiusCm: number;      // how close the head must get, tracks the decal's scale
      inside: boolean;       // last frame's answer, for exit hysteresis
      state: string;         // "idle" | "counting" | "done"
      startTime: number;     // getTime() when the countdown began
      smoothedX: number;     // label position mid-slide, bob excluded
      smoothedY: number;
      smoothedZ: number;
      havePos: boolean;      // false until the first frame seeds the position
    };
  } = {};
  private pathContainer: SceneObject | null = null;
  // The dot that follows the wearer. Parented straight to arenaRoot, NOT to
  // pathContainer. The container itself now survives snapshots (only the dots
  // inside it are diffed), but keeping the follower out of it means a course
  // change can never take the wearer's own marker with it.
  private wearerDotSo: SceneObject | null = null;
  private wearerDotHavePos = false;
  private wearerDotX = 0;
  private wearerDotZ = 0;

  // ── Gait tracking ──────────────────────────────────────────────────────────
  // Head velocity across the floor, smoothed, in cm/s.
  private wearerHavePrev = false;
  private wearerPrevX = 0;
  private wearerPrevZ = 0;
  private wearerPrevTime = 0;
  private wearerVelX = 0;
  private wearerVelZ = 0;

  // Head-height bob. fastY strips per-frame tracking noise; the detector then
  // works on the SHAPE of that signal — peak down to trough — rather than on its
  // absolute value, so walking up a ramp or slow tracking drift can't bias it.
  private stepHaveHeight = false;
  private stepFastY = 0;
  private stepFalling = false;
  private stepExtreme = 0;        // running low while falling, running high while rising
  private stepExtremeTime = 0;    // when that extreme was reached — the true footfall time
  private stepLastPeak = 0;
  private stepHavePeak = false;
  private stepLastTime = 0;
  private stepHaveLast = false;
  private stepPeriod = 0;              // measured seconds per step; 0 until timed
  private stepMarkerSos: SceneObject[] = [];

  private readonly STEP_FAST_TAU = 0.06;       // s — noise filter, must not eat the bob
  private readonly STEP_MIN_INTERVAL = 0.25;   // s — refractory; nobody steps 4x a second
  private readonly STEP_MAX_INTERVAL = 1.2;    // s — longer than this is a pause, not a stride
  private readonly STEP_GLITCH_MPS = 25;       // matches SpeedReadoutTyped's teleport reject
  private readonly STEP_MARKER_COUNT = 4;      // how many footfalls ahead to draw

  // ── Number-tag lift + size ─────────────────────────────────────────────────
  // Number tags sit this much higher than numberTagHeightMeters asks for, and are
  // drawn this much bigger. Deliberately constants rather than new @inputs, and
  // deliberately NOT just new defaults on the two inputs above: Lens Studio bakes
  // Inspector values into the scene when the component is added, so changing a
  // default in this file does nothing to the component that's actually wired up.
  // Applied inside updateNumberTag() only, so STOP labels are untouched.
  private readonly NUMBER_TAG_EXTRA_LIFT_M = 1.0;   // arena-metres, on top of numberTagHeightMeters
  private readonly NUMBER_TAG_EXTRA_SCALE = 2.0;    // 2x the size the Inspector asks for

  // ── Path dot size + spacing ────────────────────────────────────────────────
  // Two numbers that together turn a row of separate markers into something that
  // reads as one continuous path.
  //
  // PATH_DOT_SCALE_MULT shrinks every path dot on top of triangleSizeMeters. Like
  // the number-tag constants above it is deliberately a constant and not a new
  // @input, and deliberately not a changed default on triangleSizeMeters: Lens
  // Studio bakes Inspector values into the scene when the component is added, so
  // editing that default here would do nothing to the component already wired up.
  // Applied in placePathTriangle() only, so the wearer dot and step markers keep
  // their own sizes.
  //
  // PATH_DOT_SPACING_M is how far apart the dots are ALLOWED to be, in
  // arena-metres. The DB only stores the waypoints the editor drew, which can be
  // metres apart; densifyPath() fills each gap wider than this with extra dots
  // along the straight line between the two waypoints. Nothing is written back —
  // it is a render-time expansion, so the DB, the website and Change Direction all
  // still see exactly the waypoints they always did.
  //
  // Smaller spacing = denser line = more prefab instances. PATH_DOT_MAX_FILL caps
  // how many can be inserted into any ONE gap, so a course with two waypoints at
  // opposite ends of the arena can't quietly ask for a thousand objects.
  private readonly PATH_DOT_SCALE_MULT = 0.45;   // 45% of the size triangleSizeMeters asks for
  private readonly PATH_DOT_SPACING_M = 0.35;    // arena-metres between dots
  private readonly PATH_DOT_MAX_FILL = 24;       // most dots inserted into a single gap

  onAwake() {
    if (this.alertAudio) this.alertAudio.playbackMode = Audio.PlaybackMode.LowLatency;
    this.updateArenaIdLabel();
    this.createEvent("OnStartEvent").bind(() => this.connect());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  // Public: reload the arena currently on screen. Pull fresh snapshots and
  // re-render from the CURRENT arena_id's main session — whether that arena was
  // auto-generated on Start or typed in via Edit. Wired to the Reload button
  // (see RefreshButtonTyped.ts). Does NOT change which arena is shown.
  refresh() {
    const main = this.mainSessionForArena(this.currentArenaId);
    this.log("Reload — arena " + this.formatArenaId(this.currentArenaId)
             + ", main session " + (main > 0 ? main : "(pending)") + ". Re-syncing from server.");
    this.requestSnapshot();
    this.requestRebuild();
  }

  // ── Saved-course list (for the Choose Lesson menu) ──────────────────────────
  // Same data + endpoint the website's Choose Lesson menu uses, over the socket.
  private courseRows: any[] = [];
  private onCoursesCb: ((rows: any[]) => void) | null = null;

  // Ask the server for the saved-course list. Reply arrives as "coursesList".
  requestCourses() {
    // send() queues this and connects if the link is down, so a lesson menu opened
    // during a dropout fills in as soon as the connection returns instead of
    // staying empty until the user presses something again.
    this.send({ type: "listCourses" });
  }

  // The lessons the server last sent us. Empty until "coursesList" arrives.
  getCourses(): any[] { return this.courseRows; }

  onCourses(cb: (rows: any[]) => void) { this.onCoursesCb = cb; }

  // Base https URL of the server, derived from the websocket URL, so we can build
  // image URLs like <base>/icons/novice1.png.
  getHttpBase(): string {
    let u = this.websocketUrl.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
    const m = u.match(/^(https?:\/\/[^\/]+)/i);
    return m ? m[1] : u;
  }
  // Turn a URL into a DynamicResource (for RemoteMediaModule). null if no module.
  makeResource(url: string): any {
    return this.internetModule ? this.internetModule.makeResourceFromUrl(url) : null;
  }

  // Public: ask the server to begin a fresh run — mint a new arena_id + session_ID
  // (each one unit above the previous highest) and record them in the Arenas
  // table. Call this from the Start button (see StartArenaButtonTyped.ts).
  // If the socket isn't up yet, connect first and fire once it opens.
  startNewArena() {
    this.log(this.isOpen
      ? "Start pressed — requesting a new arena from the server."
      : "Start pressed — link is down; queued, and it will fire the moment it's back.");
    // No isOpen branch needed any more: send() delivers it now if it can and
    // queues it if it can't. pendingStartArena is kept only so an auto-start
    // doesn't also fire on the same connection.
    this.pendingStartArena = !this.isOpen;
    this.send({ type: "startArena" });
  }

  // Public: point the glasses at a specific arena_id (called by the Edit button —
  // see ArenaIdEditorTyped.ts). From now on we render that arena's current main
  // session. We clear the Start-time session fallback so the live main lookup
  // wins, refresh the on-screen label, and pull fresh snapshots.
  setArenaId(arenaId: number | string) {
    // Normalize ANY form to the same integer: "0000-0001", "0001", "1", and 1
    // all become 1. Strip everything that isn't a digit, then parse.
    const id = this.parseId(arenaId);
    if (!(id > 0)) { this.log("setArenaId: ignoring invalid id '" + arenaId + "'"); return; }

    // ── Saved course (reserved band, 1..999) ────────────────────────────────
    // NOT an arena we can join — it's a read-only lesson. Pour it into our own
    // session and keep OUR arena_id on screen. See loadCourse().
    if (id <= this.reservedMax) { this.loadCourse(id); return; }

    // ── Live arena (1000+) ──────────────────────────────────────────────────
    // Follow its current main session; create it on the server if it's new.
    // This is the only path that may change the code on screen.
    this.currentArenaId = id;
    this.currentSessionId = 0;      // force the live main-session lookup
    this.highWaterSession = 0;
    this.updateArenaIdLabel();
    const main = this.mainSessionForArena(id);
    this.log("Joined arena " + this.formatArenaId(id) + " — main session "
             + (main > 0 ? main : "(not received yet)") + ". Loading its layout.");
    this.send({ type: "ensureArena", arena_id: id });
    this.requestSnapshot();
    this.requestRebuild();
  }

  // Public: load saved course N (1..999) into OUR session and render it.
  // Called by the Choose Lesson menu's Load button, and by setArenaId() when a
  // reserved code is typed on the keypad.
  //
  // Our arena_id is deliberately left alone: the server copies the course's
  // obstacles + path rows into mySession, and mySession is already the main
  // session of our arena, so resolveSession() lands on it and the new rows
  // render — while the label keeps showing the code minted at Start.
  loadCourse(courseId: number | string) {
    const id = this.parseId(courseId);
    if (!(id > 0) || id > this.reservedMax) {
      this.log("loadCourse: '" + courseId + "' isn't a saved-course code (1.." + this.reservedMax + ").");
      return;
    }
    if (!(this.mySession > 0)) {
      // Our arena hasn't been minted yet — remember the course and fire it the
      // moment the server answers with arenaStarted.
      this.pendingCourseId = id;
      this.log("Course " + this.formatArenaId(id) + " queued — waiting for our own arena/session.");
      if (!this.isOpen) this.connect();
      return;
    }
    this.lastCourseId = id;
    this.log("Loading course " + this.formatArenaId(id) + " into session " + this.mySession
             + " — arena stays " + this.formatArenaId(this.currentArenaId) + ".");
    // Queued by send() if the link is down, so a lesson tapped mid-dropout still
    // loads when the connection returns.
    if (!this.isOpen) this.pendingCourseId = id;
    this.send({ type: "retrieveArena", arena_id: id, session_ID: this.mySession });
  }

  // The saved course currently poured into our session (0 if none yet).
  getLoadedCourseId(): number { return this.lastCourseId; }

  // "0000-0001", "0001", "1" and 1 all become 1.
  private parseId(v: number | string): number {
    const digits = String(v).replace(/[^0-9]/g, "");
    return digits.length ? parseInt(digits, 10) : 0;
  }

  // Public: the arena_id currently shown / tracked (0 if none yet).
  getArenaId(): number { return this.currentArenaId; }

  // ── Change Direction (chiral image, in place) ───────────────────────────────
  // Called by the "Change Direction" button. Exactly what index.html's and the
  // calibrate page's buttons do: ask the SERVER to flip the layout to its mirror
  // ("chiral") image without moving it. The arrangement comes back down on exactly
  // the footprint it already occupied — the corner coordinates of its bounding box
  // are unchanged, only which content sits in which corner swaps over. Headings go
  // θ → π−θ; forward distance is untouched, so every object stays the same distance
  // down the arena.
  //
  // The reflection maths deliberately does NOT live here. It used to: we kept a
  // private view flag that reflected about the RIDER, index.html reflected about the
  // layout's own centre line, and calibrate.html asked the server — three
  // implementations of one reflection, which is three chances to disagree, and they
  // did. Now all three buttons land on the same changeDirectionInPlace() over the
  // same 'changeDirection' message.
  //
  // A flip is a real edit to the course, not a calibration term and not a way of
  // looking at it: the server rewrites the raw rows, recomputes cal_* through the
  // normal pipeline, and pushes the result to everyone in the arena — so the website
  // sees the flip too, instead of it living only behind these lenses. We don't
  // re-render here; the rewritten rows arrive as the usual Obstacles/Paths dbSnapshot
  // and rebuild() runs off those, so we draw what the server actually stored rather
  // than mirroring our own copy and trusting the two to agree.
  //
  // We flip by arena_id — our single source of truth — and the server resolves that
  // to the arena's current main session. It remains its own inverse: press it twice
  // and you are back where you started.
  changeDirection(): boolean {
    if (!(this.currentArenaId > 0)) {
      this.log("Change Direction — no arena yet; press Start (or Edit to point at one) first.");
      return false;
    }
    if (!this.isOpen) {
      this.log("Change Direction — not connected to the server; reconnecting, try again in a moment.");
      this.connect();
      return false;
    }
    this.log("Change Direction — asking the server to flip arena "
             + this.formatArenaId(this.currentArenaId) + " in place.");
    this.send({ type: "changeDirection", arena_id: this.currentArenaId });
    return true;
  }

  // The wearer-facing form: the 8-digit code split 4-4 with a hyphen, e.g.
  // 1011 -> "0000-1011", 10001011 -> "1000-1011". Display ONLY — the hyphen is
  // never used over the websocket; matching/comms use the raw number.
  private formatArenaId(n: number): string {
    if (!(n > 0)) return "--------";
    const s = ("00000000" + String(Math.floor(n))).slice(-8);
    return s.slice(0, 4) + "-" + s.slice(4);
  }

  private updateArenaIdLabel() {
    if (this.arenaIdLabel) this.arenaIdLabel.text = this.formatArenaId(this.currentArenaId);
  }

  // Resolve an arena_id to its current main session_ID from the Arenas snapshot.
  // "main" = 'yes'; if several qualify (shouldn't happen), the newest row wins.
  private mainSessionForArena(arenaId: number): number {
    let bestSession = 0;
    let bestRow = -1;
    for (const r of this.arenaRows) {
      const aid = Number(this.get(r, "arena_id", "ARENA_ID"));
      if (aid !== arenaId) continue;
      const main = String(this.get(r, "main", "MAIN") || "no").toLowerCase();
      if (main !== "yes") continue;
      const rowId = Number(this.get(r, "row_ID", "ROW_ID")) || 0;
      if (rowId >= bestRow) { bestRow = rowId; bestSession = Number(this.get(r, "session_ID", "SESSION_ID")) || 0; }
    }
    return bestSession;
  }

  private connect() {
    if (!this.internetModule) { this.log("ERROR: assign Internet Module."); return; }
    // One socket at a time. connect() is called from a dozen places (every button,
    // every queued send, the reconnect timer) and on a slow link several of those
    // land while the first attempt is still in flight. Without this guard each one
    // opened its own socket, so every snapshot arrived two or three times over and
    // rebuilt the floor two or three times with it — the exact opposite of what you
    // want when bandwidth is already scarce.
    if (this.isOpen || this.isConnecting) return;

    this.isConnecting = true;
    const gen = ++this.connectGen;
    this.setConnectionStatus("CONNECTING");
    this.log("Connecting: " + this.websocketUrl + " (attempt " + (this.reconnectAttempts + 1) + ")");
    this.socket = this.internetModule.createWebSocket(this.websocketUrl);
    this.socket.binaryType = "blob";

    this.socket.onopen = () => {
      this.isConnecting = false;
      this.isOpen = true;
      this.reconnectAttempts = 0;      // the ladder resets on every success
      this.setConnectionStatus("LIVE");
      this.log("WebSocket open. Subscribing to DB.");
      // Anything the user asked for while we were down goes out first, in order.
      this.flushOutbox();
      this.requestSnapshot();
      // And the lesson list, every time. A `coursesList` reply that was in flight
      // when the link dropped is simply gone — nothing retries it, and no further
      // savedCourses nudge is coming unless somebody edits a lesson. Asking again
      // on reconnect is what makes "always have savedCourses" actually hold across
      // a dropout rather than only while the connection stays up.
      this.requestCourses();
      // If Start was pressed before the socket was ready, fire it now.
      if (this.pendingStartArena) {
        this.pendingStartArena = false;
        this.send({ type: "startArena" });
      } else if (this.autoStartArenaOnConnect && this.currentArenaId === 0) {
        // No arena chosen yet — generate one automatically so the on-screen code
        // fills in and the glasses have an arena to follow. (Set the toggle off if
        // you'd rather drive this only from a Start button.)
        this.log("Auto-starting a new arena on connect.");
        this.send({ type: "startArena" });
      }
      // Socket dropped while a course was waiting, but we already have a session.
      if (this.pendingCourseId > 0 && this.mySession > 0) {
        const c = this.pendingCourseId;
        this.pendingCourseId = 0;
        this.loadCourse(c);
      }
    };

    this.socket.onmessage = async (event: WebSocketMessageEvent) => {
      let text = "";
      if (event.data instanceof Blob) text = await event.data.text();
      else text = event.data as string;
      this.handleMessage(text);
    };

    this.socket.onerror = () => this.log("WebSocket error.");
    this.socket.onclose = (event: WebSocketCloseEvent) => {
      this.isOpen = false;
      this.isConnecting = false;
      this.setConnectionStatus("OFFLINE");
      this.log("WebSocket closed code " + event.code + ".");
      this.scheduleReconnect();
    };

    // ── Half-open guard ──────────────────────────────────────────────────────
    // A socket on a bad link can be created and then never open and never close.
    // Nothing else in this class would ever notice: isConnecting stays true, the
    // guard above refuses every later attempt, and the Lens sits there looking
    // broken. So we give the attempt a deadline and start over if it misses it.
    if (!this.connectTimeoutEvent) {
      this.connectTimeoutEvent = this.createEvent("DelayedCallbackEvent");
      this.connectTimeoutEvent.bind(() => this.onConnectTimeout());
    }
    this.connectTimeoutDeadlineGen = gen;
    this.connectTimeoutEvent.reset(Math.max(2, this.connectTimeoutSeconds));
  }

  // Which connect attempt the pending timeout belongs to. A timeout that fires
  // after its attempt already succeeded (or was superseded) is ignored.
  private connectTimeoutDeadlineGen = 0;

  private onConnectTimeout() {
    if (this.connectTimeoutDeadlineGen !== this.connectGen) return;  // stale
    if (this.isOpen || !this.isConnecting) return;                   // it made it
    this.log("Connection attempt timed out after " + this.connectTimeoutSeconds
             + "s — dropping it and trying again.");
    this.isConnecting = false;
    try { if (this.socket) this.socket.close(); } catch (e) {}
    this.socket = null;
    this.setConnectionStatus("OFFLINE");
    this.scheduleReconnect();
  }

  // Exponential backoff with jitter. A fixed 3s retry is fine for one pair of
  // glasses and a brief blip; it is not fine for a server that is genuinely down
  // and a room full of riders, who between them then produce a steady drum of
  // connection attempts that keeps the link busy doing nothing. The jitter is what
  // stops them all retrying on the same beat.
  private scheduleReconnect() {
    if (this.reconnectPending) return;
    this.reconnectPending = true;
    const step = Math.min(this.reconnectAttempts, 5);
    this.reconnectAttempts++;
    let delay = Math.max(0.5, this.reconnectBaseSeconds) * Math.pow(2, step);
    if (delay > this.reconnectMaxSeconds) delay = this.reconnectMaxSeconds;
    delay = delay * (0.7 + Math.random() * 0.6);     // ±30% jitter
    if (!this.reconnectEvent) {
      this.reconnectEvent = this.createEvent("DelayedCallbackEvent");
      this.reconnectEvent.bind(() => { this.reconnectPending = false; this.connect(); });
    }
    this.log("Reconnecting in " + delay.toFixed(1) + "s.");
    this.reconnectEvent.reset(delay);
  }

  // ── Outbound ───────────────────────────────────────────────────────────────
  // send() used to be `if (open) send`, which meant every request made while the
  // link was down was thrown away without a word. On a slow network that is most
  // of them: the rider presses Change Direction, nothing happens, and there is
  // nothing on screen to say why. Now they queue and go out on reconnect.
  private send(obj: object) {
    const s = JSON.stringify(obj);
    if (this.socket && this.isOpen) {
      try { this.socket.send(s); return; }
      catch (e) { this.isOpen = false; this.setConnectionStatus("OFFLINE"); }
    }
    // Identical pending requests collapse — holding a button during a dropout
    // shouldn't produce twenty copies of the same pull when it comes back.
    if (this.outbox.indexOf(s) === -1) this.outbox.push(s);
    while (this.outbox.length > this.OUTBOX_MAX) this.outbox.shift();
    this.log("Link down — queued '" + ((obj as any).type || "?") + "' ("
             + this.outbox.length + " waiting).");
    this.connect();
  }

  private flushOutbox() {
    if (!this.socket || !this.isOpen || this.outbox.length === 0) return;
    const queued = this.outbox;
    this.outbox = [];
    this.log("Link back — sending " + queued.length + " queued request(s).");
    for (let i = 0; i < queued.length; i++) {
      try { this.socket.send(queued[i]); } catch (e) { this.isOpen = false; break; }
    }
  }

  // ── Snapshot pulls, coalesced ──────────────────────────────────────────────
  // Starting an arena fires one; the reply fires another; joining fires another;
  // retrieving a course fires another. Each one is a full copy of four tables. On
  // a fast link the duplicates are invisible; on a slow one they are the wait.
  // Ask for them through here and a burst becomes a single pull.
  private requestSnapshot() {
    if (this.snapshotPending) return;
    if (!(this.snapshotCoalesceSeconds > 0)) { this.send({ type: "subscribeDb" }); return; }
    this.snapshotPending = true;
    if (!this.snapshotEvent) {
      this.snapshotEvent = this.createEvent("DelayedCallbackEvent");
      this.snapshotEvent.bind(() => {
        this.snapshotPending = false;
        this.send({ type: "subscribeDb" });
      });
    }
    this.snapshotEvent.reset(this.snapshotCoalesceSeconds);
  }

  // Mark the floor as needing a redraw. The redraw itself happens once, at the
  // top of onUpdate(). Four tables arriving together used to mean four full
  // rebuilds back to back, each one destroying and re-instantiating every path
  // dot — several hundred prefabs — for the same final picture.
  private requestRebuild() { this.rebuildDirty = true; }

  // FNV-1a. Cheap enough to run over a whole snapshot frame, and it lets us throw
  // away a re-broadcast of data we already hold without touching the scene.
  private hashString(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  }

  private setConnectionStatus(state: string) {
    if (!this.connectionLabel) return;
    try { this.connectionLabel.text = state; } catch (e) {}
  }

  private handleMessage(text: string) {
    let msg: any;
    try { msg = JSON.parse(text); } catch (e) { this.log("Bad JSON from server."); return; }

    // Server's confirmation that a new arena+session were created on Start.
    if (msg.type === "arenaStarted") {
      const d = msg.data || {};
      // Lock onto the freshly-minted arena. It's now the single source of truth:
      // we render its current main session (which, right now, is the session the
      // server just created and marked main='yes'). currentSessionId is kept only
      // as a fallback until the Arenas snapshot arrives and the live lookup works.
      this.currentArenaId = Number(d.arena_id) || 0;
      this.currentSessionId = Number(d.session_ID) || 0;
      this.mySession = Number(d.session_ID) || this.mySession;   // our scratch session
      this.highWaterSession = this.currentSessionId;
      this.updateArenaIdLabel();
      this.log(
        "New arena started — arena_id " + d.prev_arena_id + " -> " + d.arena_id +
        ", session_ID " + d.prev_session_ID + " -> " + d.session_ID +
        ". Showing " + this.formatArenaId(this.currentArenaId) + "."
      );
      // Pull fresh snapshots (incl. the Arenas mapping) so we can resolve and
      // render this arena's main session, then rebuild the floor.
      this.requestSnapshot();
      // A lesson was tapped before we had a session — load it now.
      if (this.pendingCourseId > 0) {
        const c = this.pendingCourseId;
        this.pendingCourseId = 0;
        this.loadCourse(c);
      }
      return;
    }
    if (msg.type === "arenaEnsured") {
      const d = msg.data || {};
      if (d.ok === false) {
        this.log("Arena " + this.formatArenaId(Number(d.arena_id)) + " can't be used ("
                 + (d.reason || "invalid") + ").");
      } else if (d.created) {
        this.log("Arena " + this.formatArenaId(Number(d.arena_id))
                 + " didn't exist — created it (session " + d.session_ID + "). Ready to receive info.");
      } else {
        this.log("Arena " + this.formatArenaId(Number(d.arena_id)) + " already exists — joined it.");
      }
      return;
    }
    if (msg.type === "arenaRetrieved") {
      // The server copied a saved course into our session — pull the fresh
      // obstacle/path rows and render them.
      const sid = Number(msg.session_ID) || this.mySession;
      if (sid > 0) this.currentSessionId = sid;
      // Our arena_id is untouched by a retrieve — repaint the label anyway so it
      // can never drift to the course code.
      this.updateArenaIdLabel();
      this.log("Course " + this.formatArenaId(Number(msg.arena_id))
               + " retrieved into session " + sid + " — rendering it under arena "
               + this.formatArenaId(this.currentArenaId) + ".");
      this.requestSnapshot();
      this.requestRebuild();
      return;
    }
    if (msg.type === "changeDirectionResult") {
      // The receipt for changeDirection(). The rewritten rows themselves arrive
      // separately as the usual Obstacles/Paths dbSnapshot broadcast, which rebuilds
      // the floor — so there is nothing to re-render here, only to report.
      const n = Number(msg.rows_recalculated) || 0;
      this.log(n === 0
        ? "Change Direction — nothing to flip; arena " + this.formatArenaId(Number(msg.arena_id))
          + " has an empty layout."
        : "Directions changed — chiral image of arena " + this.formatArenaId(Number(msg.arena_id))
          + " in exactly the same spot (its own centre line, x = " + msg.pivot_x + " · "
          + n + " row(s) rewritten). Everyone in this arena sees it.");
      return;
    }
    if (msg.type === "coursesList") {
      this.courseRows = msg.rows || [];
      this.log("Course list received: " + this.courseRows.length + " lessons.");
      if (this.onCoursesCb) this.onCoursesCb(this.courseRows);
      return;
    }
    if (msg.type === "error") { this.log("Server error: " + msg.message); return; }

    if (msg.type !== "dbSnapshot") return;

    // ── Is this actually news? ────────────────────────────────────────────────
    // The server broadcasts whole tables, and several paths above ask for a fresh
    // copy. Most of what arrives is byte-for-byte what we already have. Comparing
    // a fingerprint costs one pass over the text; acting on it costs a full
    // teardown and re-instantiation of the arena, which is why an identical
    // snapshot used to produce a visible hitch for no change on screen at all.
    if (this.ALWAYS_FRESH_TABLES.indexOf(msg.table) === -1) {
      const sig = this.hashString(text);
      if (this.snapSig[msg.table] === sig) return;
      this.snapSig[msg.table] = sig;
    }

    if (msg.table === "Obstacles") {
      this.obstacleRows = msg.rows || [];
      if (this.logTypes) this.printObjectTypes();
    } else if (msg.table === "Paths") {
      this.pathRows = msg.rows || [];
      if (this.logTypes) this.printPointTypes();
    } else if (msg.table === "arenaDimensions") {
      this.dimsBySession = {};
      (msg.rows || []).forEach((r: any) => {
        this.dimsBySession[this.sessionOf(r)] = {
          dx: Number(r.dimension_x) || 60,
          dy: Number(r.dimension_y) || 20,
        };
      });
    } else if (msg.table === "Arenas") {
      // The arena_id -> main session_ID mapping. Rebuilding after this makes the
      // glasses follow "main" when the website moves it to another session.
      this.arenaRows = msg.rows || [];
    } else if (msg.table === "savedCourses") {
      // The website changed the saved-course list (added/edited/removed a lesson).
      // Re-fetch the full list (with point/obstacle counts) so the Choose Lesson
      // menu stays in sync. Deliberately NOT gated on a listener being attached:
      // the menu registers its callback on start but only reads the rows when it
      // opens, and gating meant the first thing it ever showed was whatever the
      // cache happened to hold. getCourses() is now always current.
      this.requestCourses();
      return;   // no floor rebuild needed for a course-list change
    } else {
      return;
    }
    this.requestRebuild();
  }

  private printObjectTypes() {
    const counts: { [key: string]: number } = {};
    this.obstacleRows.forEach((o) => {
      const t = this.norm(o.object_type || o.OBJECT_TYPE || "none");
      counts[t] = (counts[t] || 0) + 1;
    });
    this.log("OBJECT_TYPE values: " + Object.keys(counts).map(k => k + " x" + counts[k]).join(", "));
  }

  private printPointTypes() {
    const counts: { [key: string]: number } = {};
    this.pathRows.forEach((p) => {
      const t = this.norm(p.point_type || p.POINT_TYPE || "point");
      counts[t] = (counts[t] || 0) + 1;
    });
    this.log("POINT_TYPE values: " + Object.keys(counts).map(k => k + " x" + counts[k]).join(", "));
    // Colours too — if everything here says "blue", the DB is the problem, not
    // the prefab wiring.
    const cols: { [key: string]: number } = {};
    this.pathRows.forEach((p) => {
      const c = this.norm(this.get(p, "color", "COLOR") || "blue");
      cols[c] = (cols[c] || 0) + 1;
    });
    this.log("COLOR values: " + Object.keys(cols).map(k => k + " x" + cols[k]).join(", "));
  }

  private rebuild() {
    if (!this.arenaRoot) { this.log("ERROR: assign arenaRoot."); return; }
    const session = this.resolveSession();
    if (session === 0) {
      // No session yet — usually the Arenas snapshot hasn't landed, so we can't
      // tell which session this arena_id points at.
      //
      // Returning here used to lose the redraw outright. onUpdate() clears
      // rebuildDirty BEFORE calling this, so the request is spent; the arena then
      // depends on some later snapshot to ask again. But handleSnapshot()
      // fingerprints each table and drops frames identical to the last one, and a
      // course that isn't being edited re-broadcasts byte-for-byte the same Paths
      // table forever. So the one rebuild that mattered was thrown away and the
      // next one never came — a course that renders on one run and stays blank on
      // the next, purely on snapshot timing.
      //
      // Re-arm instead, throttled to twice a second so resolveSession() isn't
      // walking every row each frame while we wait.
      const now = getTime();
      if (this.sessionWaitAt < 0 || now - this.sessionWaitAt > 0.5) {
        this.sessionWaitAt = now;
        this.rebuildDirty = true;
      }
      return;
    }
    this.sessionWaitAt = -1;
    const dims = this.dimsFor(session);
    this.updateObstacles(session, dims.dx, dims.dy);
    this.updatePaths(session, dims.dx, dims.dy);
  }

  private resolveSession(): number {
    // An explicit pin typed into the Inspector always wins.
    if (this.targetSession > 0) return this.targetSession;
    // Primary path: render the CURRENT main session of the arena we're tracking.
    // arena_id is the single source of truth; the main session is looked up live
    // from the Arenas snapshot, so we follow it wherever the website moves it.
    if (this.currentArenaId > 0) {
      const main = this.mainSessionForArena(this.currentArenaId);
      if (main > 0) return main;
      // Arenas snapshot not here yet — fall back to the Start-time session.
      if (this.currentSessionId > 0) return this.currentSessionId;
      return 0;   // nothing to show for this arena yet
    }
    // No arena chosen yet (Start never pressed): follow the newest session seen.
    let s = 0;
    for (const k in this.dimsBySession) { const id = Number(k); if (id > s) s = id; }
    this.obstacleRows.forEach((o) => { const id = this.sessionOf(o); if (id > s) s = id; });
    this.pathRows.forEach((p) => { const id = this.sessionOf(p); if (id > s) s = id; });
    if (s > this.highWaterSession) this.highWaterSession = s;
    return this.highWaterSession;
  }

  private dimsFor(session: number): { dx: number; dy: number } {
    return this.dimsBySession[session] || { dx: 60, dy: 20 };
  }

  // For a center-pivoted mesh (e.g. a barrel) placed at floor level, returns how
  // far to raise it (in arenaRoot-local cm) so its BOTTOM sits on the floor
  // instead of its middle. Measured from the mesh bounds, so it self-adjusts to
  // the barrel's size and the scale we applied. Returns 0 if it can't measure or
  // the mesh is already bottom-pivoted.
  private bottomLift(so: SceneObject): number {
    const rmv = this.findRenderMesh(so);
    if (!rmv || !this.arenaRoot) return 0;
    const minY = rmv.localAabbMin().y;                 // mesh's lowest point (object space)
    if (!(minY < 0)) return 0;                          // already bottom-pivoted
    const meshWorldY = rmv.getSceneObject().getTransform().getWorldScale().y;
    const rootWorldY = this.arenaRoot.getTransform().getWorldScale().y || 1;
    return (-minY) * meshWorldY / rootWorldY;
  }

  private findRenderMesh(so: SceneObject): RenderMeshVisual {
    const c = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (c) return c;
    const n = so.getChildrenCount();
    for (let i = 0; i < n; i++) {
      const found = this.findRenderMesh(so.getChild(i));
      if (found) return found;
    }
    return null;
  }

  // DB rows can arrive as lower-case or upper-case depending on your server serialization.
  private get(row: any, lower: string, upper: string): any {
    const v = row[lower];
    return (v === undefined || v === null) ? row[upper] : v;
  }

  private num(row: any, lower: string, upper: string, fallback: number = 0): number {
    const v = this.get(row, lower, upper);
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    return isNaN(n) ? fallback : n;
  }

  // The session a row belongs to, whatever the server chose to call the column.
  //
  // This used to be written inline as `Number(row.session_ID || row.SESSION_ID)`,
  // which recognises exactly two spellings. Anything else — session_id, sessionID,
  // sessionId, or the value arriving as a string with whitespace — came back
  // undefined, Number(undefined) is NaN, and NaN never equals the session we're
  // rendering. Every row then silently failed the filter: for Paths that means
  // rows.length === 0, which clears the dots and returns, so a table full of
  // waypoints draws nothing at all and logs nothing about why.
  //
  // Obstacles and paths are separate tables and nothing guarantees they are
  // serialised by the same code path, so one of them can start disagreeing about
  // the column name while the other keeps working — obstacles on screen, path
  // dots gone. Accepting every spelling here removes that whole failure mode, and
  // routing all four call sites through one helper keeps them from drifting apart
  // again.
  private sessionOf(row: any): number {
    const keys = ["session_ID", "SESSION_ID", "session_id", "sessionID", "sessionId", "Session_ID"];
    for (let i = 0; i < keys.length; i++) {
      const v = row[keys[i]];
      if (v !== undefined && v !== null && v !== "") {
        const n = Number(v);
        if (!isNaN(n)) return n;
      }
    }
    return 0;
  }

  private coord(row: any, calLower: string, calUpper: string, rawLower: string, rawUpper: string): number {
    const cal = this.get(row, calLower, calUpper);
    if (cal !== undefined && cal !== null && cal !== "") return Number(cal) || 0;
    return this.num(row, rawLower, rawUpper, 0);
  }

  // A row's OWN calibration scale, or null if the row doesn't carry one.
  //
  // The distinction matters and `coord(...) || 1` destroys it: that returns 1 both
  // for a row calibrated to 100% and for a row with no scale column at all, so the
  // caller can't tell "this really is full size" from "nobody told me". Path rows
  // are the second case — a waypoint is a coordinate, it has no size of its own to
  // record, so the Paths table has no scale to read and every dot silently
  // resolved to 1 while the obstacles around it grew.
  private rowScaleOrNull(row: any): number | null {
    const keys = ["cal_scale_x", "CAL_SCALE_X", "scale_x", "SCALE_X"];
    for (let i = 0; i < keys.length; i++) {
      const v = row[keys[i]];
      if (v !== undefined && v !== null && v !== "") {
        const n = Number(v);
        if (!isNaN(n) && n > 0) return n;
      }
    }
    return null;
  }

  // The calibration scale of the ARENA itself, for one session.
  //
  // Calibration scales the whole course, so this factor is a property of the
  // arena, not of any one thing standing in it — but it's only ever WRITTEN onto
  // the rows that have somewhere to put it, which is the obstacles. Recovering it
  // from them gives the path dots the same number the obstacles are already using,
  // which is exactly what "scales with the arena" means.
  //
  // Median rather than average: one obstacle deliberately resized in the editor
  // would drag an average off and quietly mis-scale the entire path, while the
  // median ignores it as long as most of the course agrees.
  private arenaCalScaleFor(session: number): number {
    const vals: number[] = [];
    for (let i = 0; i < this.obstacleRows.length; i++) {
      const o = this.obstacleRows[i];
      if (this.sessionOf(o) !== session) continue;
      const s = this.rowScaleOrNull(o);
      if (s !== null) vals.push(s);
    }
    if (vals.length === 0) return 1;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  }

  private toLocalCm(px: number, py: number, dx: number, dy: number): vec3 {
    const CANVAS_W = 600;
    const ratio = Math.max(0.2, Math.min(1.2, dy / dx));
    const canvasH = Math.round(CANVAS_W * ratio);
    const metresPerPxX = dx / CANVAS_W;
    const metresPerPxY = dy / canvasH;
    const rightM = px * metresPerPxX - dx / 2;
    let forwardM = py * metresPerPxY;
    if (this.flipHandedness) forwardM = -forwardM;
    const u = 100 * this.arenaScale;
    // Local X = 0 is ArenaRoot's origin: the spot FloorPlacer calibrated on — your
    // (0,0). Nothing is reflected here: Change Direction is an edit to the stored
    // rows (see changeDirection()), so a flipped course arrives already flipped and
    // is plotted like any other. Reflecting again at render time would flip it about
    // YOU rather than about the layout's own centre line, throwing an off-centre
    // course across the arena — which is precisely what it used to do.
    const localX = rightM * u;
    return new vec3(localX, this.groundOffsetCm, -forwardM * u);
  }

  // Turn a DB heading (degrees in the editor's rider frame, measured from "right"
  // toward "forward") into a yaw about up.
  //
  // The SIGN must match the handedness of the position mapping in toLocalCm(), or the
  // arena and the things standing in it disagree. toLocalCm maps forward -> -Z normally,
  // and -> +Z when flipHandedness reflects the forward axis. A reflection reverses the
  // sense of every angle, so the yaw has to negate exactly when the position map does:
  //
  //     flipHandedness = false  ->  forward = -Z  ->  yaw = +heading
  //     flipHandedness = true   ->  forward = +Z  ->  yaw = -heading
  //
  // This used to be the other way round in BOTH branches, and that was the calibration
  // rotation bug: the server folds the arena's heading into every row (cal_rotate_z =
  // rotate_z + rotation_deg, exactly as index.html's canvas draws it), so rotating the
  // arena by φ swung the positions by +φ while the obstacles standing on them turned by
  // -φ — they counter-rotated, ending up 2φ out and, at φ = 90°, facing backwards.
  // Objects rotated IN RELATION to the arena instead of WITH it.
  //
  // It hid for so long because rotate_z is 0 for most placements and cones/barrels/poles
  // are rotationally symmetric: with heading 0 the sign cannot show. A calibration
  // heading makes cal_rotate_z non-zero for EVERY row at once, which is why the whole
  // arena visibly came apart the moment the Calibration page was rotated.
  private yRotation(degFromDb: number): quat {
    let deg = this.flipHandedness ? -degFromDb : degFromDb;
    deg += this.obstacleYawOffsetDeg;
    return quat.angleAxis((deg * Math.PI) / 180, vec3.up());
  }

  private updateObstacles(session: number, dx: number, dy: number) {
    const rows = this.obstacleRows.filter((o) => this.sessionOf(o) === session);
    const seen: { [id: number]: boolean } = {};

    rows.forEach((o) => {
      const id = Number(o.obstacle_ID || o.OBSTACLE_ID);
      if (!id) return;
      seen[id] = true;

      const type = this.norm(o.object_type || o.OBJECT_TYPE || "");

      // Number tags get floating text instead of an FBX — handle and bail out.
      if (type === "numbertag" || type === "number-tag" || type === "tag") {
        this.updateNumberTag(id, o, dx, dy);
        return;
      }

      // Stop signs keep their floor decal AND get a floating label above them.
      // Done before the prefab lookup so the label still shows up if the decal
      // prefab slot is ever left empty.
      if (this.isStopType(type)) this.updateStopLabel(id, o, dx, dy);

      const prefab = this.prefabForObjectType(type);
      if (!prefab) { this.log("No prefab for OBJECT_TYPE='" + type + "'."); return; }

      let entry = this.liveObstacles[id];
      // If the same DB row changes type, destroy and recreate with the right prefab.
      if (entry && entry.type !== type) {
        entry.so.destroy();
        delete this.liveObstacles[id];
        entry = null;
      }
      if (!entry) {
        const so = prefab.instantiate(this.arenaRoot);
        so.name = (o.object_name || o.OBJECT_NAME || type || "obstacle") + " #" + id;
        // Capture whatever scale the prefab was authored with (e.g. start/finish
        // line prefabs are baked at 10x) BEFORE we touch it, so calibration data
        // multiplies on top of that instead of overwriting it with a flat 1x.
        const prefabScale = so.getTransform().getLocalScale();
        entry = { so: so, inside: false, type: type, prefabScale: prefabScale };
        this.liveObstacles[id] = entry;
      }

      const pos = this.toLocalCm(
        this.coord(o, "cal_position_x", "CAL_POSITION_X", "position_x", "POSITION_X"),
        this.coord(o, "cal_position_y", "CAL_POSITION_Y", "position_y", "POSITION_Y"),
        dx, dy
      );
      const rotZ = this.coord(o, "cal_rotate_z", "CAL_ROTATE_Z", "rotate_z", "ROTATE_Z");
      const isStartOrFinishLine = type === "startline" || type === "start-line" || type === "start"
        || type === "finishline" || type === "finish-line" || type === "finish";
      const extraScale = isStartOrFinishLine ? this.startFinishLineExtraScale : 1.0;
      const calScale = new vec3(
        this.coord(o, "cal_scale_x", "CAL_SCALE_X", "scale_x", "SCALE_X") || 1,
        this.coord(o, "cal_scale_y", "CAL_SCALE_Y", "scale_y", "SCALE_Y") || 1,
        this.coord(o, "cal_scale_z", "CAL_SCALE_Z", "scale_z", "SCALE_Z") || 1
      ).uniformScale(this.obstacleBaseScale * this.arenaScale * extraScale);
      const scale = new vec3(
        calScale.x * entry.prefabScale.x,
        calScale.y * entry.prefabScale.y,
        calScale.z * entry.prefabScale.z
      );

      const tr = entry.so.getTransform();
      tr.setLocalScale(scale);
      tr.setLocalRotation(this.yRotation(rotZ));
      // Barrels are modelled with their pivot at the CENTER, so placing them at
      // floor level buries the bottom half. Raise them by their half-height so the
      // bottom rests on the floor. (Self-measuring, so it tracks size + scale.)
      let posY = pos.y;
      if (type === "barrel" || type === "wooden-barrel") {
        posY += this.bottomLift(entry.so);
      }
      tr.setLocalPosition(new vec3(pos.x, posY, pos.z));
    });

    Object.keys(this.liveObstacles).forEach((k) => {
      const id = Number(k);
      if (!seen[id]) {
        this.liveObstacles[id].so.destroy();
        delete this.liveObstacles[id];
      }
    });

    // Remove number tags whose rows are gone from this session too.
    Object.keys(this.liveNumberTags).forEach((k) => {
      const id = Number(k);
      if (!seen[id]) {
        this.liveNumberTags[id].so.destroy();
        delete this.liveNumberTags[id];
      }
    });

    // Same for STOP labels: if the sign is deleted in the editor, its label goes
    // with it instead of hanging in mid-air.
    Object.keys(this.liveStopZones).forEach((k) => {
      const id = Number(k);
      if (!seen[id]) {
        this.liveStopZones[id].so.destroy();
        delete this.liveStopZones[id];
      }
    });
  }

  // Live path dots, keyed by their position in the sorted waypoint list. Kept so a
  // snapshot can UPDATE the arena instead of rebuilding it. The old code destroyed
  // the whole container and re-instantiated every dot on every snapshot: for a
  // three-hundred-point course that is three hundred prefab instantiations and
  // three hundred destroys, and it happened once per table, several times per
  // reconnect. That is the hitch riders were seeing whenever the link wobbled —
  // and it got worse exactly when the network got worse, because a bad link means
  // more reconnects and more repeat snapshots.
  //
  // NOTE: the index is into the DENSIFIED list (waypoints plus the dots filled in
  // between them), not into the DB rows. That keeps the reuse working exactly as
  // before — same index, same dot, only its position changes — as long as the same
  // course densifies to the same number of dots, which it does.
  private livePathDots: { [index: number]: { so: SceneObject; color: string } } = {};

  private clearPathDots() {
    Object.keys(this.livePathDots).forEach((k) => {
      const e = this.livePathDots[Number(k)];
      if (e && e.so) e.so.destroy();
    });
    this.livePathDots = {};
  }

  // ── Continuous ribbon path ─────────────────────────────────────────────────
  // One SceneObject per single-colour run of the course, each holding a
  // runtime-built RenderMeshVisual. Rebuilt wholesale on every path change:
  // MeshBuilder is cheap next to instantiating a few hundred prefabs, which is
  // what the dots were costing for the same picture.
  private ribbonSos: SceneObject[] = [];
  // Cloned materials, one per colour, kept between rebuilds. Cloning is what
  // stops two runs of the same colour sharing a live material with the dot
  // prefabs — writing a tint into the prefab's own material would recolour every
  // dot in the scene.
  private ribbonMats: { [color: string]: Material } = {};

  private clearPathRibbon() {
    for (let i = 0; i < this.ribbonSos.length; i++) {
      if (this.ribbonSos[i]) this.ribbonSos[i].destroy();
    }
    this.ribbonSos = [];
  }

  // Rough RGB for the website's swatch names. Only used when pathRibbonMaterial
  // is supplied — without it the colour arrives for free in the cloned prefab
  // material and nothing needs tinting.
  private rgbForColorName(color: string): vec4 {
    if (color === "green")  return new vec4(0.25, 0.85, 0.35, 1);
    if (color === "yellow") return new vec4(1.00, 0.85, 0.20, 1);
    if (color === "red")    return new vec4(1.00, 0.30, 0.25, 1);
    if (color === "blue")   return new vec4(0.20, 0.55, 1.00, 1);
    return new vec4(1, 1, 1, 1);
  }

  // The material a run of `color` is drawn with.
  //
  // Default route: instantiate that colour's PathDot prefab under a disabled
  // probe, read its material, clone it, throw the probe away — the same trick
  // auditPathPrefabs() already uses to inspect the wiring. The ribbon therefore
  // inherits the exact look of the dots it replaces, including their texture,
  // blend mode and depth settings, with no extra assets to wire and nothing to
  // keep in sync by hand.
  private ribbonMaterialFor(color: string): Material | null {
    if (this.ribbonMats[color]) return this.ribbonMats[color];

    let mat: Material | null = null;

    if (this.pathRibbonMaterial) {
      mat = this.pathRibbonMaterial.clone();
      // Only tint when the material is the caller's own. A cloned dot material is
      // already the right colour and writing baseColor over it would double-tint.
      try { mat.mainPass.baseColor = this.rgbForColorName(color); } catch (e) {}
    } else {
      const prefab = this.prefabForPathColor(color);
      if (!prefab || !this.pathContainer) return null;
      const probe = global.scene.createSceneObject("RibbonMatProbe");
      probe.setParent(this.pathContainer);
      probe.enabled = false;          // never rendered, not even for a frame
      const inst = prefab.instantiate(probe);
      const rmv = this.findRenderMeshVisual(inst);
      // Clone BEFORE the probe goes away, so the source is guaranteed alive.
      if (rmv && rmv.mainMaterial) mat = rmv.mainMaterial.clone();
      probe.destroy();
      if (!mat) {
        this.log("!! Colour '" + color + "' has no material to copy for the ribbon "
                 + "(its prefab has no RenderMeshVisual). That run won't be drawn.");
        return null;
      }
    }

    this.ribbonMats[color] = mat;
    return mat;
  }

  // Lay the strip along `points`, cut into runs of a single colour.
  //
  // Each run is extended by ONE point into the next colour, so consecutive runs
  // share an edge and the colour change is a clean seam rather than a gap in the
  // floor.
  private buildPathRibbon(points: { pos: vec3; rot: number; calScale: number; color: string }[]) {
    this.clearPathRibbon();
    if (!this.pathContainer || points.length < 2) return;

    // Width is quoted in arena-metres, so it rides arenaScale exactly like
    // triangleSizeMeters and PATH_DOT_SPACING_M do — and the arena's calibration
    // scale on top of it, which arrives per-point in calScale. Taken from the
    // FIRST point rather than recomputed, so the ribbon is guaranteed to be using
    // the same factor as the dots it replaces.
    const cal = points[0].calScale > 0 ? points[0].calScale : 1;
    const halfW = Math.max(0.5, this.pathRibbonWidthMeters * 100 * this.arenaScale * cal * 0.5);
    const y = this.groundOffsetCm + this.pathRibbonLiftCm;

    let s = 0;
    while (s < points.length - 1) {
      let e = s;
      while (e + 1 < points.length && points[e + 1].color === points[s].color) e++;
      const geomEnd = Math.min(e + 1, points.length - 1);   // bridge into the next colour
      this.buildRibbonRun(points, s, geomEnd, halfW, y);
      if (geomEnd === e) break;                             // that was the last run
      s = geomEnd;
    }
  }

  // Build one single-colour stretch, from point i0 to point i1 inclusive.
  private buildRibbonRun(
    points: { pos: vec3; rot: number; calScale: number; color: string }[],
    i0: number, i1: number, halfW: number, y: number
  ) {
    const n = i1 - i0 + 1;
    if (n < 2) return;

    const color = points[i0].color;
    const mat = this.ribbonMaterialFor(color);
    if (!mat) return;

    const verts: number[] = [];
    const idx: number[] = [];
    let travelled = 0;

    for (let k = i0; k <= i1; k++) {
      const p = points[k].pos;
      // Direction through this point, taken from its NEIGHBOURS rather than from
      // the next point alone. Averaging both sides mitres the corner, so the
      // outer edge of a turn doesn't step and leave a notch in the strip. The
      // ends clamp to themselves, which just gives a square cap.
      const prev = points[Math.max(i0, k - 1)].pos;
      const next = points[Math.min(i1, k + 1)].pos;
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      let len = Math.sqrt(tx * tx + tz * tz);
      if (len < 0.0001) { tx = 1; tz = 0; len = 1; }   // degenerate: two points on top of each other
      tx /= len; tz /= len;

      // Left-hand perpendicular, on the floor plane. Y is untouched: the strip is
      // flat on the ground like the decals it replaces.
      const lx = -tz;
      const lz = tx;

      if (k > i0) {
        const q = points[k - 1].pos;
        travelled += Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z));
      }
      // V runs in units of ribbon width, so a texture on the cloned dot material
      // repeats as squares along the course instead of being smeared down its
      // whole length.
      const v = travelled / (halfW * 2);

      verts.push(p.x + lx * halfW, y, p.z + lz * halfW,  0, 1, 0,  0, v);
      verts.push(p.x - lx * halfW, y, p.z - lz * halfW,  0, 1, 0,  1, v);
    }

    for (let k = 0; k < n - 1; k++) {
      const a = k * 2, b = k * 2 + 1, c = k * 2 + 2, d = k * 2 + 3;
      // Both windings. The cloned material came off a floor decal and nothing here
      // knows whether its shader culls back faces or which way it considers front:
      // emitting the quad twice makes the strip visible either way. The cost is
      // two extra triangles per segment, which is nothing next to guessing wrong
      // and drawing an invisible path.
      idx.push(a, b, c,  b, d, c);
      idx.push(c, b, a,  c, d, b);
    }

    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal",   components: 3 },
      { name: "texture0", components: 2 },
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(verts);
    builder.appendIndices(idx);

    if (!builder.isValid()) {
      this.log("!! Ribbon run for '" + color + "' built an invalid mesh (" + n + " points) — skipped.");
      return;
    }
    builder.updateMesh();

    const so = global.scene.createSceneObject("PathRibbon " + color);
    so.setParent(this.pathContainer);
    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = builder.getMesh();
    // addMaterial, not mainMaterial: a freshly created RenderMeshVisual has an
    // EMPTY material list, and mainMaterial only reassigns slot 0 — there is no
    // slot 0 yet to reassign.
    rmv.addMaterial(mat);
    this.ribbonSos.push(so);
  }

  // ── Path densification ─────────────────────────────────────────────────────
  // The DB stores one row per waypoint the editor drew, and consecutive waypoints
  // can be metres apart — far enough that the course reads as a line of separate
  // markers rather than a path. Rather than asking the website for more points,
  // the gaps are filled here: walk each pair of consecutive waypoints and drop
  // extra dots along the straight line between them until no two are further apart
  // than PATH_DOT_SPACING_M.
  //
  // Heading and calibrated scale are carried along with them — the heading by
  // shortest-arc interpolation, so a dot inserted between 350° and 10° passes
  // through 0° rather than sweeping the long way round — which means an inserted
  // dot points and sizes like the stretch of path it sits on. Colour is taken from
  // the waypoint the segment STARTS at, so a colour change lands on the waypoint
  // that declares it instead of a step early.
  //
  // Nothing is written back: this is a render-time expansion only, so the DB, the
  // website, and Change Direction all still see exactly the waypoints they always
  // did.
  private densifyPath(rows: any[], dx: number, dy: number, arenaCal: number = 1):
      { pos: vec3; rot: number; calScale: number; color: string }[] {
    const base: { pos: vec3; rot: number; calScale: number; color: string }[] = [];

    rows.forEach((p) => {
      const pos = this.toLocalCm(
        this.coord(p, "cal_position_x", "CAL_POSITION_X", "position_x", "POSITION_X"),
        this.coord(p, "cal_position_y", "CAL_POSITION_Y", "position_y", "POSITION_Y"),
        dx, dy
      );
      // The arrow's heading, calibrated. cal_rotate_z is arrow_rotation with the arena's
      // calibration heading folded in — the same relationship an obstacle's cal_rotate_z
      // has to its rotate_z. Reading the raw arrow_rotation here (as this line used to)
      // meant a calibrated arena turned the course but left every direction marker in it
      // pointing where the editor drew it, off by exactly the arena's heading. Falls back
      // to the raw column, so a database written before cal_rotate_z carried this still
      // renders exactly as it did.
      const rot = this.coord(p, "cal_rotate_z", "CAL_ROTATE_Z", "arrow_rotation", "ARROW_ROTATION");
      const color = this.norm(this.get(p, "color", "COLOR") || "blue");
      // The arena's calibration scale. A path row that carries its own cal_scale_x
      // wins; otherwise fall back to the scale the ARENA was calibrated to, taken
      // from the obstacles in the same session.
      //
      // This used to read `coord(...) || 1` and stop there. The Paths table has no
      // scale column — a waypoint is a coordinate, it has no size — so that always
      // landed on 1, and the dots sat at a fixed size while everything else in the
      // course grew and shrank around them. Note the FALLBACK is what does the
      // work here: it isn't a safety net for odd data, it's the normal path.
      const own = this.rowScaleOrNull(p);
      const calScale = own !== null ? own : arenaCal;
      base.push({ pos: pos, rot: rot, calScale: calScale, color: color });
    });

    // Spacing is quoted in arena-metres, so it has to ride arenaScale exactly like
    // every other length here — otherwise scaling the course up would leave the
    // fill spacing behind and the gaps would open back up.
    //
    // arenaCal belongs in this product for the same reason. Spacing and dot size
    // have to move together: grow the dots on a fixed spacing and they overlap
    // into a solid stripe, shrink them and the line breaks into specks.
    const spacingCm = Math.max(1, this.PATH_DOT_SPACING_M * 100 * this.arenaScale * arenaCal);

    const out: { pos: vec3; rot: number; calScale: number; color: string }[] = [];
    for (let i = 0; i < base.length; i++) {
      const a = base[i];
      out.push(a);
      if (i === base.length - 1) break;

      const b = base[i + 1];
      const segX = b.pos.x - a.pos.x;
      const segZ = b.pos.z - a.pos.z;
      const gapCm = Math.sqrt(segX * segX + segZ * segZ);
      if (!(gapCm > spacingCm)) continue;      // already close enough, nothing to fill

      let fill = Math.ceil(gapCm / spacingCm) - 1;
      if (fill > this.PATH_DOT_MAX_FILL) fill = this.PATH_DOT_MAX_FILL;

      // Shortest way round between the two headings, so an inserted dot never
      // spins the long way through 359°.
      const turn = ((((b.rot - a.rot) % 360) + 540) % 360) - 180;

      for (let j = 1; j <= fill; j++) {
        const f = j / (fill + 1);
        out.push({
          pos: new vec3(a.pos.x + segX * f, a.pos.y, a.pos.z + segZ * f),
          rot: a.rot + turn * f,
          calScale: a.calScale + (b.calScale - a.calScale) * f,
          color: a.color
        });
      }
    }
    return out;
  }

  private updatePaths(session: number, dx: number, dy: number) {
    const rows = this.pathRows
      .filter((p) => this.sessionOf(p) === session)
      .sort((a, b) => Number(a.point_number || a.POINT_NUMBER) - Number(b.point_number || b.POINT_NUMBER));
    if (rows.length === 0) {
      // Nothing to draw. Two very different situations end up here and they used
      // to be indistinguishable from the outside, because both just wiped the
      // dots and returned without a word:
      //
      //   a) the course genuinely has no waypoints — correct, nothing to say;
      //   b) the Paths table is FULL, but every row belongs to some other
      //      session, so the filter above threw all of them away.
      //
      // (b) is the one that looks like "the path feature broke": obstacles for
      // this session render normally beside a course with no line through it.
      // Name the sessions we actually hold so the mismatch is visible in the
      // Logger instead of having to be guessed at. Latched on the message text,
      // so it says its piece once per distinct situation rather than on every
      // snapshot.
      if (this.pathRows.length > 0) {
        const have: { [key: number]: number } = {};
        this.pathRows.forEach((p) => {
          const s = this.sessionOf(p);
          have[s] = (have[s] || 0) + 1;
        });
        const msg = "!! " + this.pathRows.length + " path rows held, but NONE for session "
                  + session + " — they belong to session(s): "
                  + Object.keys(have).map(k => k + " x" + have[Number(k)]).join(", ")
                  + ". The dots are not missing, they are filtered out: the arena is"
                  + " resolving to a session the waypoints were not written under."
                  + " Pin targetSession in the Inspector to one of the above to confirm.";
        if (this.pathMissLog !== msg) {
          this.pathMissLog = msg;
          this.log(msg);
        }
      }
      this.clearPathDots();
      this.clearPathRibbon();
      return;
    }
    this.pathMissLog = "";

    // The container is made once and then kept. Only the dots inside it change.
    if (!this.pathContainer) {
      this.pathContainer = global.scene.createSceneObject("TypedPath");
      this.pathContainer.setParent(this.arenaRoot);
    }
    this.auditPathPrefabs();

    // What the arena itself was calibrated to. Read once per rebuild and threaded
    // through everything below, so dot size, gap filling and ribbon width are all
    // derived from ONE number — the moment any of them is computed separately they
    // drift apart, and "the path doesn't match the arena" comes straight back.
    const arenaCal = this.pathScaleFollowsArena ? this.arenaCalScaleFor(session) : 1;
    if (this.enableLogging && Math.abs(arenaCal - this.lastArenaCal) > 0.001) {
      this.lastArenaCal = arenaCal;
      this.log("Arena calibration scale for session " + session + " is " + arenaCal.toFixed(3)
               + " — path dots, spacing and ribbon width now follow it."
               + (arenaCal === 1 ? " (1.000 means no obstacle in this session carries a"
                                 + " cal_scale_x, so there is nothing to follow.)" : ""));
    }

    // The waypoints from the DB, plus the dots filled in between them so the line
    // reads as continuous. Everything below works off this list, not the rows.
    const points = this.densifyPath(rows, dx, dy, arenaCal);

    // Exactly what the DB handed us for these rows. If this says "blue xN" and
    // nothing else, no prefab wiring on earth will make them another colour.
    // Guarded: building this tally and its string is wasted work when the log is
    // off, and it ran on every single snapshot.
    if (this.enableLogging) {
      const seen: { [key: string]: number } = {};
      rows.forEach((p) => {
        const c = this.norm(this.get(p, "color", "COLOR") || "blue");
        seen[c] = (seen[c] || 0) + 1;
      });
      this.log("Painting " + rows.length + " path points for session " + session
               + " -> " + points.length + " dots after filling gaps to "
               + this.PATH_DOT_SPACING_M + "m — colours: "
               + Object.keys(seen).map(k => k + " x" + seen[k]).join(", "));
    }

    // The continuous strip, laid along the very same points the dots use.
    if (this.pathRibbonEnabled) {
      this.buildPathRibbon(points);
      if (this.pathRibbonHidesDots) {
        // The ribbon IS the path now. Drop any dots left over from before the
        // toggle was flipped and stop here — instantiating a few hundred prefabs
        // to hide them under an opaque strip is pure cost.
        this.clearPathDots();
        return;
      }
    } else {
      this.clearPathRibbon();
    }

    // Every path waypoint is now rendered as a directional triangle decal,
    // regardless of POINT_TYPE. The colour comes from the row's `color` column,
    // so the arena mirrors the swatches picked in the website's editor.
    points.forEach((pt, index) => {
      // Reuse the dot already sitting at this index. Only a colour change needs a
      // different prefab, and only then do we destroy anything.
      let entry = this.livePathDots[index];
      if (entry && entry.color !== pt.color) {
        entry.so.destroy();
        delete this.livePathDots[index];
        entry = null;
      }
      if (!entry) {
        const so = this.spawnPathTriangle(pt.color);
        if (!so) return;
        entry = { so: so, color: pt.color };
        this.livePathDots[index] = entry;
      }
      this.placePathTriangle(entry.so, pt.pos, pt.rot, pt.calScale);
    });

    // A shorter course than last time leaves dots hanging off the end — drop them.
    Object.keys(this.livePathDots).forEach((k) => {
      const i = Number(k);
      if (i >= points.length) {
        this.livePathDots[i].so.destroy();
        delete this.livePathDots[i];
      }
    });
  }

  // Every colour slot, in priority order: the custom name/prefab pairs first,
  // then the four the website's swatches produce. One list so routing and the
  // startup audit can never drift apart.
  private pathColorSlots(): { color: string; prefab: ObjectPrefab }[] {
    const slots: { color: string; prefab: ObjectPrefab }[] = [];
    for (let i = 0; i < this.pathColorNames.length; i++) {
      const name = this.norm(this.pathColorNames[i]);
      if (name && this.pathColorPrefabs[i]) slots.push({ color: name, prefab: this.pathColorPrefabs[i] });
    }
    slots.push({ color: "blue",   prefab: this.pathTrianglePrefab });
    slots.push({ color: "green",  prefab: this.pathTriangleGreenPrefab });
    slots.push({ color: "yellow", prefab: this.pathTriangleYellowPrefab });
    slots.push({ color: "red",    prefab: this.pathTriangleRedPrefab });
    return slots;
  }

  // Pick the prefab for a Paths.color value. Unknown / empty colours fall back to
  // the blue prefab rather than dropping the waypoint — but the fallback is NOISY,
  // because a silent fallback looks exactly like "the feature doesn't work".
  private prefabForPathColor(color: string): ObjectPrefab {
    const slots = this.pathColorSlots();
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].color === color && slots[i].prefab) return slots[i].prefab;
    }
    if (color !== "blue" && !this.warnedColors[color]) {
      this.warnedColors[color] = true;
      this.log("!! No prefab for colour '" + color + "' -> drawing it with the BLUE prefab. "
               + "Either that Inspector slot is empty, or the DB sent a colour you have no prefab for.");
    }
    return this.pathTrianglePrefab;
  }

  // First RenderMeshVisual on an object or anywhere beneath it. Prefabs put it on
  // the root, but a wrapper object is a normal way to build them, so search down.
  private findRenderMeshVisual(so: SceneObject): RenderMeshVisual | null {
    const own = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (own) return own;
    for (let i = 0; i < so.getChildrenCount(); i++) {
      const found = this.findRenderMeshVisual(so.getChild(i));
      if (found) return found;
    }
    return null;
  }

  // Run once, on the first path draw. Prints the colour -> prefab -> material
  // chain, then checks the one thing that silently defeats this whole feature:
  // two colour slots holding prefabs that share a material. That happens when the
  // colour prefabs are duplicates of the blue one whose material was never
  // swapped — the routing below works perfectly and every dot still comes out
  // blue. Instantiate one of each under a disabled probe, read the materials,
  // compare, destroy. Costs one frame, once, and turns an invisible asset bug
  // into a line in the Logger.
  private auditPathPrefabs() {
    if (this.wiringReported) return;
    this.wiringReported = true;

    const slots = this.pathColorSlots();
    const probe = global.scene.createSceneObject("PathPrefabAudit");
    probe.setParent(this.arenaRoot);
    probe.enabled = false;   // never rendered, not even for a frame

    const seenMats: { color: string; mat: Material }[] = [];
    const lines: string[] = [];
    const clashes: string[] = [];

    slots.forEach((slot) => {
      if (!slot.prefab) {
        lines.push("    " + slot.color + " = *** EMPTY -> falls back to blue ***");
        return;
      }
      const inst = slot.prefab.instantiate(probe);
      const rmv = this.findRenderMeshVisual(inst);
      const mat = rmv ? rmv.mainMaterial : null;
      lines.push("    " + slot.color + " = " + (slot.prefab.name || "(unnamed)")
                 + "   material: " + (mat ? (mat.name || "(unnamed)") : "*** NO RenderMeshVisual ***"));
      if (mat) {
        seenMats.forEach((prev) => {
          if (prev.mat === mat) clashes.push(prev.color + " and " + slot.color);
        });
        seenMats.push({ color: slot.color, mat: mat });
      }
      inst.destroy();
    });
    probe.destroy();

    this.log("Path colour -> prefab -> material:\n" + lines.join("\n"));

    if (clashes.length > 0) {
      this.log("!! SAME MATERIAL SHARED BY: " + clashes.join(", ")
               + "\n!! Those slots hold different prefabs but the SAME material, so they draw the"
               + "\n!! same colour. The routing is fine — the prefabs are clones whose material was"
               + "\n!! never swapped. Open each prefab in the Asset Browser and set its Render Mesh"
               + "\n!! Visual -> Materials[0] to its own colour material.");
    }
  }

  // Keep the wearer's dot on the floor directly underneath them.
  //
  // The dot is placed in arenaRoot's LOCAL space, exactly like every path dot, so
  // it shares their floor height (groundOffsetCm) and rides along with whatever
  // FloorPlacer did to the arena — no assumptions about where the real floor is.
  // The head's world position is converted into that space the same way SIK's
  // View.ts does it.
  private updateWearerDot(camPos: vec3, lookX: number, lookZ: number, inv: mat4) {
    if (!this.wearerDotPrefab || !this.arenaRoot) return;

    if (!this.wearerDotSo) {
      this.wearerDotSo = this.wearerDotPrefab.instantiate(this.arenaRoot);
      this.wearerDotSo.name = "WearerDot";
    }

    const local = inv.multiplyPoint(camPos);

    if (!this.wearerDotHavePos || this.wearerDotSmoothing <= 0) {
      this.wearerDotX = local.x;
      this.wearerDotZ = local.z;
      this.wearerDotHavePos = true;
    } else {
      const k = 1 - Math.exp(-getDeltaTime() / this.wearerDotSmoothing);
      this.wearerDotX += (local.x - this.wearerDotX) * k;
      this.wearerDotZ += (local.z - this.wearerDotZ) * k;
    }

    const tr = this.wearerDotSo.getTransform();
    // local.y is the wearer's HEAD height — deliberately thrown away. The dot sits
    // on the floor at the same height as the path dots, under their feet.
    tr.setLocalPosition(new vec3(this.wearerDotX, this.groundOffsetCm, this.wearerDotZ));
    const s = this.wearerDotSizeMeters * 100 * this.arenaScale;
    tr.setLocalScale(new vec3(s, s, s));

    // Lay the quad flat, then spin it to the wearer's heading — the same two-part
    // rotation spawnPathTriangle builds, so a dot and an arrow sit identically.
    // The heading has to be converted into the arena's space too: this rotation is
    // LOCAL, so feeding it a world direction would skew the dot by whatever yaw
    // FloorPlacer gave arenaRoot.
    let yaw = this.wearerDotYawOffsetDeg * Math.PI / 180;
    if (this.wearerDotFaceHeading && (lookX !== 0 || lookZ !== 0)) {
      const localLook = inv.multiplyDirection(new vec3(lookX, 0, lookZ));
      yaw += Math.atan2(localLook.x, localLook.z);
    }
    tr.setLocalRotation(
      quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(-Math.PI / 2, vec3.right()))
    );
  }

  // Track the wearer's floor velocity and watch the head bob for footfalls. Runs
  // every frame whether or not any marker is wired, so cadence is already
  // measured by the time the markers are asked to draw.
  private trackWearerMotion(camPos: vec3) {
    const now = getTime();

    if (!this.wearerHavePrev) {
      this.wearerPrevX = camPos.x; this.wearerPrevZ = camPos.z;
      this.wearerPrevTime = now;
      this.wearerHavePrev = true;
      return;
    }

    const dt = now - this.wearerPrevTime;
    if (dt <= 1e-4) return;

    const rawVx = (camPos.x - this.wearerPrevX) / dt;
    const rawVz = (camPos.z - this.wearerPrevZ) / dt;
    // Advance the sample point even if the reading is rejected below, so a glitch
    // isn't re-measured as an even bigger jump next frame.
    this.wearerPrevX = camPos.x; this.wearerPrevZ = camPos.z;
    this.wearerPrevTime = now;

    // Tracking resets teleport the head; that's not the wearer sprinting.
    if (Math.sqrt(rawVx * rawVx + rawVz * rawVz) / 100 > this.STEP_GLITCH_MPS) return;

    const kv = this.stepVelocitySmoothingSeconds > 0
      ? 1 - Math.exp(-dt / this.stepVelocitySmoothingSeconds)
      : 1;
    this.wearerVelX += (rawVx - this.wearerVelX) * kv;
    this.wearerVelZ += (rawVz - this.wearerVelZ) * kv;

    this.detectFootfall(camPos.y, dt, now);
  }

  // Find the low points of the head's vertical travel. Y here, not Z: Z is
  // forward/back in Lens Studio and a minimum in it would mean nothing.
  //
  // The trigger is the DEPTH of each dip — the drop from the last high point down
  // to the low point — not the head's height itself. That distinction matters:
  // measuring against a running average sounds equivalent but isn't, because the
  // average always lags a steady climb, and that lag biases the signal by roughly
  // (drift x lag) — enough to suppress every footfall on a gentle up-slope or
  // during slow tracking drift. A peak-to-trough depth cancels any such drift.
  //
  // Hysteresis does the noise rejection: the head must come back up off the bottom
  // before the trough is believed, so a wobble at the bottom of one dip can't read
  // as a second step.
  private detectFootfall(y: number, dt: number, now: number) {
    if (!this.stepHaveHeight) {
      this.stepFastY = y;
      this.stepExtreme = y;
      this.stepExtremeTime = now;
      this.stepFalling = false;
      this.stepHaveHeight = true;
      return;
    }
    this.stepFastY += (y - this.stepFastY) * (1 - Math.exp(-dt / this.STEP_FAST_TAU));

    const v = this.stepFastY;
    const hyst = this.stepBobThresholdCm * 0.5;

    if (this.stepFalling) {
      if (v < this.stepExtreme) {
        this.stepExtreme = v;
        this.stepExtremeTime = now;
      } else if (v > this.stepExtreme + hyst) {
        // Back up off the bottom: that low point was a real trough. It's timed at
        // stepExtremeTime, when the head was actually lowest — not now, a few
        // frames later when we became sure of it.
        if (this.stepHavePeak && (this.stepLastPeak - this.stepExtreme) >= this.stepBobThresholdCm) {
          this.registerFootfall(this.stepExtremeTime);
        }
        this.stepFalling = false;
        this.stepExtreme = v;
        this.stepExtremeTime = now;
      }
    } else {
      if (v > this.stepExtreme) {
        this.stepExtreme = v;
        this.stepExtremeTime = now;
      } else if (v < this.stepExtreme - hyst) {
        this.stepLastPeak = this.stepExtreme;
        this.stepHavePeak = true;
        this.stepFalling = true;
        this.stepExtreme = v;
        this.stepExtremeTime = now;
      }
    }
  }

  // Time one footfall and fold the gap since the last one into the running cadence.
  // `at` is when the head was lowest, not when the trough was confirmed.
  private registerFootfall(at: number) {
    if (this.stepHaveLast) {
      const interval = at - this.stepLastTime;
      // One footfall, one detection: a wobble at the bottom of the same dip isn't
      // a second step.
      if (interval < this.STEP_MIN_INTERVAL) return;
      // A long gap means they stopped and set off again. Take the step, but don't
      // let the pause poison the cadence.
      if (interval <= this.STEP_MAX_INTERVAL) {
        this.stepPeriod = this.stepPeriod > 0
          ? this.stepPeriod + (interval - this.stepPeriod) * 0.4
          : interval;
      }
    }
    this.stepLastTime = at;
    this.stepHaveLast = true;
  }

  // Put the markers where the next STEP_MARKER_COUNT footfalls are predicted to
  // land: current position carried forward along the velocity vector for as long
  // as it is until each of the coming head-bob troughs.
  //
  // Each marker is one step-period further out than the last, so error compounds
  // along the line: the 1st is a near-certainty, the 4th is ~2s of dead reckoning
  // and swings wide the moment the wearer turns.
  private updateStepMarkers(camPos: vec3, inv: mat4) {
    // One prefab is enough: if the step slots are left empty this borrows the
    // wearer's own dot, so the markers read as "you, N steps from now".
    const base = this.stepMarkerPrefab || this.wearerDotPrefab;
    if (!base || !this.arenaRoot) return;

    if (this.stepMarkerSos.length === 0) {
      // Slot i draws step i+1, falling back to the base prefab when left empty.
      const slots = [
        this.stepMarkerPrefab,
        this.stepMarkerSecondPrefab,
        this.stepMarkerThirdPrefab,
        this.stepMarkerFourthPrefab
      ];
      for (let i = 0; i < this.STEP_MARKER_COUNT; i++) {
        const so = (slots[i] || base).instantiate(this.arenaRoot);
        so.name = "StepMarker " + (i + 1);
        this.stepMarkerSos.push(so);
      }
    }

    // Standing still there is no stride to extrapolate — the markers would just
    // stack up under the wearer's feet and mean nothing. Hide them instead.
    const speedMps = Math.sqrt(this.wearerVelX * this.wearerVelX + this.wearerVelZ * this.wearerVelZ) / 100;
    if (speedMps < this.stepMinSpeedMps) {
      for (let i = 0; i < this.stepMarkerSos.length; i++) this.stepMarkerSos[i].enabled = false;
      return;
    }

    const now = getTime();
    const period = this.stepPeriod > 0 ? this.stepPeriod : this.stepCadenceSeconds;
    // The next trough is a whole number of steps on from the last one timed. Solved
    // directly rather than by looping, so a long pause can't spin.
    const t1 = this.stepHaveLast
      ? this.stepLastTime + (Math.floor((now - this.stepLastTime) / period) + 1) * period
      : now + period;

    // Heading comes from the velocity, not from gaze: the markers should follow
    // where the wearer is actually travelling, even walking backwards or sideways.
    const localDir = inv.multiplyDirection(new vec3(this.wearerVelX, 0, this.wearerVelZ));
    let yaw = this.stepMarkerYawOffsetDeg * Math.PI / 180;
    if (localDir.x !== 0 || localDir.z !== 0) yaw += Math.atan2(localDir.x, localDir.z);
    const rot = quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(-Math.PI / 2, vec3.right()));
    const s = this.stepMarkerSizeMeters * 100 * this.arenaScale;

    for (let i = 0; i < this.stepMarkerSos.length; i++) {
      const lead = (t1 + i * period) - now;
      const world = new vec3(
        camPos.x + this.wearerVelX * lead,
        camPos.y,
        camPos.z + this.wearerVelZ * lead
      );
      const local = inv.multiplyPoint(world);
      const so = this.stepMarkerSos[i];
      so.enabled = true;
      const tr = so.getTransform();
      // local.y is head height and is dropped: the prediction is a spot on the
      // floor, at the same height as every other dot.
      tr.setLocalPosition(new vec3(local.x, this.groundOffsetCm, local.z));
      tr.setLocalScale(new vec3(s, s, s));
      tr.setLocalRotation(rot);
    }
  }

  // Split in two so a snapshot that only MOVES a waypoint can reposition the dot
  // that's already there instead of throwing it away and making another one.
  private spawnPathTriangle(color: string): SceneObject | null {
    const prefab = this.prefabForPathColor(color);
    if (!prefab || !this.pathContainer) return null;
    const so = prefab.instantiate(this.pathContainer);
    // Name every instance "<colour from DB> <- <prefab that drew it>" so the
    // running hierarchy tells you which half of the chain is broken.
    so.name = (color || "blue") + " <- " + (prefab.name || "?");
    return so;
  }

  private placePathTriangle(so: SceneObject, pos: vec3, arrowRotationDeg: number, calScale: number = 1) {
    // triangleSizeMeters is the size at 100%; calScale is the arena's calibrated scale,
    // so the arrows grow and shrink with the course instead of floating at a fixed size.
    // PATH_DOT_SCALE_MULT then shrinks them all so a densified line of dots reads as a
    // path rather than a row of overlapping triangles — it multiplies in here rather
    // than being a smaller triangleSizeMeters default because that default is already
    // baked into the wired component and editing it would change nothing.
    const s = this.triangleSizeMeters * 100 * this.arenaScale * calScale * this.PATH_DOT_SCALE_MULT;

    // ARROW_ROTATION is already calculated by your server/editor (atan2 in the rider
    // frame). Same rule as yRotation(): the sign follows toLocalCm's handedness, so the
    // arrows turn WITH the arena when it is calibrated to a heading instead of against
    // it. cal_rotate_z here is arrow_rotation + rotation_deg, so getting this backwards
    // left every direction marker 2φ out of true on a rotated arena.
    let yawDeg = this.flipHandedness ? -arrowRotationDeg : arrowRotationDeg;
    yawDeg += this.triangleYawOffsetDeg;
    const floorRot = quat.angleAxis((yawDeg * Math.PI) / 180, vec3.up())
      .multiply(quat.angleAxis(-Math.PI / 2, vec3.right()));

    const tr = so.getTransform();
    tr.setLocalPosition(new vec3(pos.x, this.groundOffsetCm, pos.z));
    tr.setLocalRotation(floorRot);
    tr.setLocalScale(new vec3(s, s, s));
  }

  // The ONE number every floating label is measured in — heights, glyph size, bob
  // amplitude, trigger radius, slide-out distance, all of it.
  //
  // It's exactly the product updateObstacles() scales a prefab by (arenaScale x
  // obstacleBaseScale x cal_scale_x), so a label and the obstacle it stands over
  // are always the same multiple of their authored size. That single shared factor
  // is the whole point: proportion is not something each length can be given
  // separately and be trusted to keep, because the moment one of them is derived
  // from a different product it drifts — which is how the numbers ended up floating
  // at a fixed height over a course that had doubled, and how the bob stayed a
  // 15cm twitch on lettering three times its old size.
  private labelScaleFor(o: any): number {
    const calScale = this.coord(o, "cal_scale_x", "CAL_SCALE_X", "scale_x", "SCALE_X") || 1;
    return this.arenaScale * this.obstacleBaseScale * calScale;
  }

  // Render (or refresh) one floating number tag. No FBX: a Text component shows
  // the `number_tag` column value, lifted to sight level instead of the floor.
  private updateNumberTag(id: number, o: any, dx: number, dy: number) {
    // Prefer the dedicated column; fall back to the first digits in the name.
    let value = this.get(o, "number_tag", "NUMBER_TAG");
    if (value === undefined || value === null || (value + "") === "") {
      const name = (o.object_name || o.OBJECT_NAME || "") + "";
      const m = name.match(/\d+/);
      value = m ? m[0] : "";
    }
    const label = (value + "").trim();

    let entry = this.liveNumberTags[id];
    if (!entry) {
      const so = global.scene.createSceneObject("numbertag #" + id);
      so.setParent(this.arenaRoot);
      const text = so.createComponent("Component.Text") as Text;
      if (this.numberTagFont) text.font = this.numberTagFont;
      // Centre the glyphs on the anchor so the number sits over its map spot.
      try { text.horizontalAlignment = HorizontalAlignment.Center; } catch (e) {}
      try { text.verticalAlignment = VerticalAlignment.Center; } catch (e) {}
      entry = { so: so, text: text, baseHeightCm: 0, floatPhase: Math.random() * Math.PI * 2, scale: 1 };
      this.liveNumberTags[id] = entry;
    }
    if (this.numberTagFont && entry.text.font !== this.numberTagFont) {
      entry.text.font = this.numberTagFont;
    }
    entry.text.text = label;

    // Same X/Z as any obstacle, but Y is the sight-level float height, not the floor.
    const pos = this.toLocalCm(
      this.coord(o, "cal_position_x", "CAL_POSITION_X", "position_x", "POSITION_X"),
      this.coord(o, "cal_position_y", "CAL_POSITION_Y", "position_y", "POSITION_Y"),
      dx, dy
    );
    // One factor, every length. NUMBER_TAG_EXTRA_LIFT_M sits inside it on purpose,
    // so the extra metre is an arena-metre and grows along with the rest; if you
    // want it to stay one fixed real-world metre however the course is scaled, add
    // it outside instead: `... * 100 * labelScale + this.NUMBER_TAG_EXTRA_LIFT_M * 100`.
    const labelScale = this.labelScaleFor(o);
    const heightCm = (this.numberTagHeightMeters + this.NUMBER_TAG_EXTRA_LIFT_M) * 100 * labelScale;
    const s = this.numberTagScale * this.NUMBER_TAG_EXTRA_SCALE * labelScale;

    // baseHeightCm is what animateFloatingLabel() bobs around, so the float rides at
    // the new height automatically — nothing else needs to know about the lift.
    // scale goes with it so the bob is a proportion of the number, not a fixed twitch.
    entry.baseHeightCm = heightCm;
    entry.scale = labelScale;
    const tr = entry.so.getTransform();
    tr.setLocalPosition(new vec3(pos.x, heightCm, pos.z));
    tr.setLocalScale(new vec3(s, s, s));
    // When not billboarding, leave the number facing the arena's forward axis.
    if (!this.numberTagFaceCamera) tr.setLocalRotation(quat.quatIdentity());
  }

  // True for every OBJECT_TYPE spelling that means "stop zone". Kept in step with
  // the stop line in prefabForObjectType below.
  private isStopType(type: string): boolean {
    // norm() already turned any underscores into dashes, so 'pause_zone' arrives
    // here as 'pause-zone'.
    return type === "stop" || type === "pause" || type === "pause-zone"
      || type === "stop-zone";
  }

  // Create (or refresh) the anchor + floating label for one stop sign. The anchor
  // is placed exactly like a number tag — same eye level, same arena scaling. The
  // label rides along as its child until the wearer steps on, at which point
  // placeStopLabel() slides it out where they can read it.
  //
  // NOTE: the number tags' extra lift/scale is deliberately NOT applied here, so
  // STOP labels sit where stopLabelHeightMeters says. Add the same two constants
  // below if you'd rather they stayed level with the numbers.
  private updateStopLabel(id: number, o: any, dx: number, dy: number) {
    const font = this.stopLabelFont || this.numberTagFont;

    let entry = this.liveStopZones[id];
    if (!entry) {
      const so = global.scene.createSceneObject("stopzone #" + id);
      so.setParent(this.arenaRoot);

      const labelSo = global.scene.createSceneObject("stoplabel #" + id);
      labelSo.setParent(so);

      const text = labelSo.createComponent("Component.Text") as Text;
      if (font) text.font = font;
      try { text.horizontalAlignment = HorizontalAlignment.Center; } catch (e) {}
      try { text.verticalAlignment = VerticalAlignment.Center; } catch (e) {}
      text.text = this.stopLabelText;
      entry = {
        so: so, labelSo: labelSo, text: text, floatPhase: Math.random() * Math.PI * 2,
        scale: 1, radiusCm: 0, inside: false, state: "idle", startTime: 0,
        smoothedX: 0, smoothedY: 0, smoothedZ: 0, havePos: false
      };
      this.liveStopZones[id] = entry;
    }
    if (font && entry.text.font !== font) entry.text.font = font;

    const pos = this.toLocalCm(
      this.coord(o, "cal_position_x", "CAL_POSITION_X", "position_x", "POSITION_X"),
      this.coord(o, "cal_position_y", "CAL_POSITION_Y", "position_y", "POSITION_Y"),
      dx, dy
    );
    // Same one factor the numbers use, so a STOP label and a number tag standing at
    // the same authored height stay level with each other at every scale. The height
    // was previously on arenaScale ALONE — no cal_scale, no obstacleBaseScale — so
    // scaling the course pushed the numbers up and left the STOP text behind.
    const labelScale = this.labelScaleFor(o);
    const heightCm = this.stopLabelHeightMeters * 100 * labelScale;
    const s = this.stopLabelScale * labelScale;

    entry.scale = labelScale;
    // The trigger circle rides the same factor as the decal it represents, so the
    // stand-on area always matches the sign you can actually see. If this used a
    // different product from the decal's, a scaled-up sign would show a big target
    // with a small circle hidden inside it and the countdown would refuse to start
    // where the sign clearly says it should.
    entry.radiusCm = this.stopTriggerRadiusMeters * 100 * labelScale;
    // Only the anchor is positioned from the DB. The label's position is owned by
    // placeStopLabel() every frame, so it isn't set here — otherwise a snapshot
    // arriving mid-countdown would yank the text back over the sign.
    const tr = entry.so.getTransform();
    tr.setLocalPosition(new vec3(pos.x, heightCm, pos.z));
    tr.setLocalScale(new vec3(s, s, s));
    if (!this.numberTagFaceCamera) entry.labelSo.getTransform().setLocalRotation(quat.quatIdentity());
  }

  private prefabForObjectType(type: string): ObjectPrefab {
    if (type === "cone" && this.conePrefab) return this.conePrefab;
    if ((type === "pole" || type === "equestrian-pole") && this.polePrefab) return this.polePrefab;
    if ((type === "barrel" || type === "wooden-barrel") && this.barrelPrefab) return this.barrelPrefab;
    if ((type === "vertical" || type === "jump" || type === "fence" || type === "equestrian-vertical") && this.verticalPrefab) return this.verticalPrefab;
    if ((type === "cavaletti" || type === "equestrian-cavaletti") && this.cavalettiPrefab) return this.cavalettiPrefab;
    if ((type === "stop" || type === "pause" || type === "pause-zone" || type === "stop-zone" || type === "pause_zone") && this.pauseZonePrefab) return this.pauseZonePrefab;
    if ((type === "startline" || type === "start-line" || type === "start") && this.startLinePrefab) return this.startLinePrefab;
    if ((type === "finishline" || type === "finish-line" || type === "finish") && this.finishLinePrefab) return this.finishLinePrefab;
    if (this.defaultObstaclePrefab) return this.defaultObstaclePrefab;
    return null;
  }

  private norm(v: any): string {
    return (v === undefined || v === null ? "" : (v + "")).trim().toLowerCase().replace(/_/g, "-");
  }

  private onUpdate() {
    // The single, coalesced redraw. Everything that changes the arena marks it
    // dirty rather than redrawing on the spot, so a burst of four table snapshots
    // costs one rebuild instead of four.
    if (this.rebuildDirty) {
      this.rebuildDirty = false;
      this.rebuild();
    }
    if (!this.camera) return;
    const camPos = this.camera.getTransform().getWorldPosition();

    // Float and billboard the number tags. The amplitude is now the UNSCALED base —
    // each label multiplies it by its own scale below, so the bob is a proportion of
    // the lettering rather than one fixed distance shared by labels of every size.
    // As a single shared value it was the last thing left out of proportion: at a
    // large obstacleBaseScale the numbers were three times the size and still
    // twitching through the same 15cm.
    const amplitudeBaseCm = this.numberTagFloatAmplitudeMeters * 100;
    const t = getTime();
    for (const k in this.liveNumberTags) {
      const tag = this.liveNumberTags[k];
      this.animateFloatingLabel(tag, camPos, t, amplitudeBaseCm * tag.scale);
    }

    // Countdowns first: they set each zone's inside/state, which placeStopLabel
    // then reads to decide whether the text belongs over the sign or in front of
    // the wearer.
    this.updateStopCountdowns(camPos, t);

    // Which way is the wearer looking, flattened onto the floor? In Lens Studio a
    // camera looks down its NEGATIVE z, so the viewing direction is the
    // transform's `back` vector, not `forward` — the same thing SIK's
    // getForwardPosition() relies on when it scales `forward` by -x.
    // Kept raw here: stopLabelFlipForward is applied inside placeStopLabel, so it
    // can't leak out and spin the wearer's dot too.
    let lookX = 0, lookZ = 0;
    const look = this.camera.getTransform().back;
    const lookLen = Math.sqrt(look.x * look.x + look.z * look.z);
    // Straight up or straight down leaves nothing to flatten; the label just holds
    // its last spot for those frames rather than snapping to an arbitrary heading.
    if (lookLen > 0.001) {
      lookX = look.x / lookLen;
      lookZ = look.z / lookLen;
    }
    for (const k in this.liveStopZones) {
      const zone = this.liveStopZones[k];
      this.placeStopLabel(zone, camPos, lookX, lookZ, t, amplitudeBaseCm * zone.scale);
    }

    // Velocity + footfall timing. Runs every frame regardless of what's wired, so
    // the cadence is already warm whenever the markers do get switched on.
    this.trackWearerMotion(camPos);

    // One matrix inversion shared by both floor followers, and only when at least
    // one of them is actually in use.
    // Must stay ABOVE the alertAudio early-out below, or they would quietly stop
    // following whenever no proximity sound is wired up.
    if (this.arenaRoot && (this.wearerDotPrefab || this.stepMarkerPrefab)) {
      const inv = this.arenaRoot.getTransform().getInvertedWorldTransform();
      this.updateWearerDot(camPos, lookX, lookZ, inv);
      this.updateStepMarkers(camPos, inv);
    }

    // Proximity sound — solid obstacles only; number tags are intentionally excluded.
    if (!this.alertAudio) return;
    const radius = this.proximityRadiusMeters * 100;
    const exitRadius = radius * 1.4;

    for (const k in this.liveObstacles) {
      const entry = this.liveObstacles[k];
      const p = entry.so.getTransform().getWorldPosition();
      const dx = camPos.x - p.x;
      const dz = camPos.z - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (!entry.inside && dist < radius) {
        entry.inside = true;
        this.alertAudio.play(1);
      } else if (entry.inside && dist > exitRadius) {
        entry.inside = false;
      }
    }
  }

  // Bob one label around its resting height and turn it to face the wearer (yaw
  // only, so it never tips over). Shared by number tags and STOP labels.
  private animateFloatingLabel(
    entry: { so: SceneObject; baseHeightCm: number; floatPhase: number },
    camPos: vec3, t: number, amplitudeCm: number
  ) {
    const tr = entry.so.getTransform();

    if (amplitudeCm > 0) {
      const p = tr.getLocalPosition();
      const offset = Math.sin(t * this.numberTagFloatSpeed * Math.PI * 2 + entry.floatPhase) * amplitudeCm;
      tr.setLocalPosition(new vec3(p.x, entry.baseHeightCm + offset, p.z));
    }

    if (this.numberTagFaceCamera) {
      const p = tr.getWorldPosition();
      const dx = camPos.x - p.x;
      const dz = camPos.z - p.z;
      if (dx * dx + dz * dz > 0.0001) {
        const yaw = Math.atan2(dx, dz) + (this.numberTagYawOffsetDeg * Math.PI) / 180;
        tr.setWorldRotation(quat.angleAxis(yaw, vec3.up()));
      }
    }
  }

  // Decide where one STOP label should sit this frame and put it there.
  //
  // Off the sign it rests over the anchor, so you can see from across the arena
  // which spot you have to stop on. On the sign it slides out to a point in front
  // of the wearer's face — at the anchor's eye height, not the floor — so the
  // countdown is readable while they stand there. The slide is smoothed, so the
  // text glides out as they arrive and drifts back when they leave.
  private placeStopLabel(
    entry: {
      so: SceneObject; labelSo: SceneObject; inside: boolean; floatPhase: number;
      scale: number;
      smoothedX: number; smoothedY: number; smoothedZ: number; havePos: boolean;
    },
    camPos: vec3, lookX: number, lookZ: number, t: number, amplitudeCm: number
  ) {
    const anchorPos = entry.so.getTransform().getWorldPosition();

    let targetX = anchorPos.x;
    let targetZ = anchorPos.z;
    if (entry.inside && this.stopLabelWearerOffsetMeters > 0 && (lookX !== 0 || lookZ !== 0)) {
      // Pushed out by the label's own scale, so bigger lettering is held further off
      // and takes up the same amount of your view. On arenaScale alone, a scaled-up
      // STOP slid out the same short distance and filled your face.
      const offCm = this.stopLabelWearerOffsetMeters * 100 * entry.scale
        * (this.stopLabelFlipForward ? -1 : 1);
      targetX = camPos.x + lookX * offCm;
      targetZ = camPos.z + lookZ * offCm;
    }

    if (!entry.havePos) {
      entry.smoothedX = targetX; entry.smoothedY = anchorPos.y; entry.smoothedZ = targetZ;
      entry.havePos = true;
    } else if (this.stopLabelFollowSmoothing > 0) {
      // Frame-rate-independent easing, same shape as SpeedReadoutTyped's smoothing.
      const k = 1 - Math.exp(-getDeltaTime() / this.stopLabelFollowSmoothing);
      entry.smoothedX += (targetX - entry.smoothedX) * k;
      entry.smoothedY += (anchorPos.y - entry.smoothedY) * k;
      entry.smoothedZ += (targetZ - entry.smoothedZ) * k;
    } else {
      entry.smoothedX = targetX; entry.smoothedY = anchorPos.y; entry.smoothedZ = targetZ;
    }

    const bob = amplitudeCm > 0
      ? Math.sin(t * this.numberTagFloatSpeed * Math.PI * 2 + entry.floatPhase) * amplitudeCm
      : 0;
    const tr = entry.labelSo.getTransform();
    tr.setWorldPosition(new vec3(entry.smoothedX, entry.smoothedY + bob, entry.smoothedZ));

    if (this.numberTagFaceCamera) {
      const dx = camPos.x - entry.smoothedX;
      const dz = camPos.z - entry.smoothedZ;
      if (dx * dx + dz * dz > 0.0001) {
        const yaw = Math.atan2(dx, dz) + (this.numberTagYawOffsetDeg * Math.PI) / 180;
        tr.setWorldRotation(quat.angleAxis(yaw, vec3.up()));
      }
    }
  }

  // The stop-and-hold rule, run once per frame per stop sign:
  //   idle     — wearer is off the sign, label reads STOP.
  //   counting — wearer stepped on; label reads the whole seconds still to serve
  //              (5, 4, 3, 2, 1). Stepping off early drops straight back to idle
  //              and the next attempt starts from a full 5 again.
  //   done     — the hold was served: label reads GO and the chime has played.
  //              Stepping off re-arms the sign for the next lap.
  // Distance is measured on the floor plane only (X/Z), so ducking or looking
  // down never counts as leaving.
  private updateStopCountdowns(camPos: vec3, t: number) {
    for (const k in this.liveStopZones) {
      const entry = this.liveStopZones[k];
      if (entry.radiusCm <= 0) continue;

      // Measured from the ANCHOR, which never leaves the sign — not from the
      // label, which by now may be floating in front of the wearer's face.
      const p = entry.so.getTransform().getWorldPosition();
      const dx = camPos.x - p.x;
      const dz = camPos.z - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Wider circle to leave than to enter, so standing right on the edge can't
      // flicker the countdown on and off frame to frame.
      const threshold = entry.inside ? entry.radiusCm * 1.25 : entry.radiusCm;
      const inside = dist < threshold;
      entry.inside = inside;

      if (!inside) {
        if (entry.state !== "idle") {
          entry.state = "idle";
          entry.text.text = this.stopLabelText;
        }
        continue;
      }

      if (entry.state === "idle") {
        entry.state = "counting";
        entry.startTime = t;
      }

      if (entry.state === "counting") {
        const remaining = this.stopHoldSeconds - (t - entry.startTime);
        if (remaining <= 0) {
          entry.state = "done";
          entry.text.text = this.stopGoText;
          if (this.stopCompleteAudio) this.stopCompleteAudio.play(1);
          this.log("Stop zone #" + k + " held for " + this.stopHoldSeconds + "s -> GO");
        } else {
          // ceil: the label shows 5 the instant they arrive and 1 through the
          // final second, so the numbers read the way a countdown is spoken.
          entry.text.text = "" + Math.ceil(remaining);
        }
      }
    }
  }

  private log(m: string) {
    if (this.enableLogging) print("[ArenaStreamerTyped] " + m);
  }
}
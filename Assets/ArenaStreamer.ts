// =============================================================================
//  ArenaStreamer.ts  —  Cyber Cowboys equestrian arena, live in Spectacles
// -----------------------------------------------------------------------------
//  Connects to your fly.io server over WebSocket, subscribes to the live DB,
//  and lays every obstacle + path point onto the floor inside `arenaRoot`.
//  Updates in real time (server pushes a snapshot within ~1s of any DB change).
//  Plays a sound the moment the wearer walks within range of any obstacle.
//
//  Requires: Lens Studio 5.9+  (WebSocket lives on InternetModule).
//  World units in Lens Studio are CENTIMETRES, so 1 metre = 100 units.
//
//  Pixel -> metre transform is copied verbatim from your server's
//  calibrateObject() / index.html storeCal(): canvas is a fixed 600px wide,
//  the rider origin is the midpoint of the arena's top (C1-C2) edge,
//  +x = right, +y(forward) = into the arena.
// =============================================================================

@component
export class ArenaStreamer extends BaseScriptComponent {
  // ── Connection ────────────────────────────────────────────────────────────
  @input internetModule: InternetModule;
  @input
  @hint("Your fly.io WebSocket endpoint")
  websocketUrl: string = "wss://cybercowboys-back.fly.dev/";

  // ── Scene anchors ─────────────────────────────────────────────────────────
  @input
  @hint("Empty SceneObject placed on the floor. Everything is parented here. Add an InteractableManipulation (SIK) to drag/rotate it onto the floor.")
  arenaRoot: SceneObject;
  @input
  @hint("The device Camera object (the wearer's head). Used for the proximity sound.")
  camera: SceneObject;

  // ── Obstacle prefabs ──────────────────────────────────────────────────────
  @input
  @hint("START HERE: assign your cone prefab. Used for EVERY obstacle until you add type-specific prefabs below. Cones-only works with just this set.")
  defaultObstaclePrefab: ObjectPrefab;
  @input
  @hint("Obstacle type names from the server's object_type, e.g. cone, pole, vertical, cavaletti, barrel, stop. Case-insensitive. A 'stop'/'pause' entry can point at a flat stop-arena decal prefab.")
  obstacleTypeNames: string[] = [];
  @input
  @hint("Prefabs matching obstacleTypeNames 1:1 - same order, same length. Drag a Wooden Barrel / Equestrian Pole FBX (or a flat StopZone decal prefab) straight into each slot.")
  obstacleTypePrefabs: ObjectPrefab[] = [];

  // ── Path prefabs (one per colour) ─────────────────────────────────────────
  //  The server sends p.color as "blue" | "green" | "yellow" | "red".
  //  Each colour gets its OWN prefab — no runtime material swapping.
  @input @allowUndefined
  @hint("PathDot.prefab — the BLUE dot. Also the fallback for any colour whose slot below is empty. If empty, path points are skipped.")
  pathPointPrefab: ObjectPrefab;
  @input @allowUndefined
  @hint("PathDotGreen.prefab. Falls back to the blue dot if empty.")
  pathPointPrefabGreen: ObjectPrefab;
  @input @allowUndefined
  @hint("PathDotYellow.prefab. Falls back to the blue dot if empty.")
  pathPointPrefabYellow: ObjectPrefab;
  @input @allowUndefined
  @hint("PathDotRed.prefab. Falls back to the blue dot if empty.")
  pathPointPrefabRed: ObjectPrefab;

  @input @allowUndefined
  @hint("Optional: a 1x1x1 cube (pivot centred) stretched between consecutive waypoints to draw the connecting line. If empty, no cube line is drawn.")
  pathLinePrefab: ObjectPrefab;

  // ── Path TRIANGLES (blue-triangle.png) ────────────────────────────────────
  @input @allowUndefined
  @hint("Flat triangle decal laid between consecutive waypoints, pointing along the path. Duplicate PathDot.prefab, swap its material to the blue-triangle material, then assign it here. If empty, no triangles are drawn.")
  pathTrianglePrefab: ObjectPrefab;
  @input
  @hint("Edge length of each path triangle, in arena-metres.")
  pathTriangleSizeMeters: number = 0.6;
  @input
  @hint("0 = one triangle at the MIDPOINT of every segment. >0 = tile a triangle every N arena-metres along each segment (e.g. 1.5).")
  pathTriangleSpacingMeters: number = 0;
  @input
  @hint("Spin every triangle by this many degrees if the arrow points the wrong way (try 90 / 180 / -90).")
  triangleYawOffsetDeg: number = 0;

  // ── Sound ─────────────────────────────────────────────────────────────────
  @input @allowUndefined
  @hint("AudioComponent that plays when the wearer reaches an obstacle.")
  alertAudio: AudioComponent;

  // ── Tuning ────────────────────────────────────────────────────────────────
  @input
  @hint("1 = real size (60x20 m). Lower it to shrink the whole arena to fit a room/table (0.1 is tabletop). Scales positions AND object sizes together.")
  arenaScale: number = 1.0;
  @input
  @hint("Extra multiplier on every obstacle's size, on top of its DB scale.")
  obstacleBaseScale: number = 1.0;
  @input
  @hint("Diameter of the path-point dots / line thickness, in arena-metres.")
  pathPointSizeMeters: number = 0.4;
  @input
  @hint("How close (in REAL metres) the wearer's head must get to an obstacle to trigger the sound. At small arenaScale, lower this (e.g. 0.3).")
  proximityRadiusMeters: number = 1.5;
  @input
  @hint("0 = show the newest session automatically. Set a session_ID to pin one arena.")
  targetSession: number = 0;
  @input
  @hint("Lift everything off the floor by this many cm (avoids z-fighting with the ground).")
  groundOffsetCm: number = 0.5;
  @input
  @hint("Tick if the arena comes out mirrored (flips forward axis + rotation direction).")
  flipHandedness: boolean = false;
  @input enableLogging: boolean = true;
  @input
  @hint("Logs the distinct object_type strings the server sends, once per snapshot. Use it to find the EXACT name your server uses for pause zones, then add that name to obstacleTypeNames.")
  logObstacleTypes: boolean = true;

  // ── Internal state ────────────────────────────────────────────────────────
  private socket: WebSocket | null = null;
  private reconnectEvent: DelayedCallbackEvent | null = null;
  private isOpen = false;   // true while the WebSocket is connected (used by refresh())

  private obstacleRows: any[] = [];
  private pathRows: any[] = [];
  private dimsBySession: { [sid: number]: { dx: number; dy: number } } = {};

  // Live obstacle scene objects, keyed by obstacle_ID, with proximity state.
  private liveObstacles: {
    [id: number]: { so: SceneObject; inside: boolean };
  } = {};
  private pathContainer: SceneObject | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onAwake() {
    if (this.alertAudio) {
      // LowLatency = instant feedback the moment you reach an obstacle.
      this.alertAudio.playbackMode = Audio.PlaybackMode.LowLatency;
    }
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnStartEvent").bind(() => this.connect());
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  private connect() {
    if (!this.internetModule) {
      this.log("ERROR: assign the InternetModule input.");
      return;
    }
    this.log("Connecting to " + this.websocketUrl);
    this.socket = this.internetModule.createWebSocket(this.websocketUrl);
    this.socket.binaryType = "blob";

    this.socket.onopen = () => {
      this.isOpen = true;
      this.log("WebSocket open — subscribing to DB.");
      this.send({ type: "subscribeDb" });
    };

    this.socket.onmessage = async (event: WebSocketMessageEvent) => {
      let text: string;
      if (event.data instanceof Blob) {
        text = await event.data.text();
      } else {
        text = event.data as string;
      }
      this.handleMessage(text);
    };

    this.socket.onclose = (event: WebSocketCloseEvent) => {
      this.isOpen = false;
      this.log("WebSocket closed (code " + event.code + "). Reconnecting in 3s.");
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.log("WebSocket error.");
    };
  }

  // ── Public: force a fresh pull of all data ────────────────────────────────
  // Re-subscribing makes the server immediately resend every table snapshot
  // (arenaDimensions, Obstacles, Paths, savedCourses). If the socket is down,
  // reconnect instead — onopen will re-subscribe automatically. Call this from
  // a button (see RefreshButton.ts).
  refresh() {
    if (this.isOpen) {
      this.log("Manual refresh — re-requesting snapshots.");
      this.send({ type: "subscribeDb" });
    } else {
      this.log("Manual refresh — socket not open, reconnecting.");
      this.connect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectEvent) return;
    this.reconnectEvent = this.createEvent("DelayedCallbackEvent");
    this.reconnectEvent.bind(() => {
      this.reconnectEvent = null;
      this.connect();
    });
    this.reconnectEvent.reset(3.0);
  }

  private send(obj: object) {
    if (this.socket) this.socket.send(JSON.stringify(obj));
  }

  // ── Incoming snapshots ────────────────────────────────────────────────────
  private handleMessage(text: string) {
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch (e) {
      this.log("Bad JSON from server.");
      return;
    }
    if (msg.type !== "dbSnapshot") return; // we only care about DB pushes

    if (msg.table === "Obstacles") {
      this.obstacleRows = msg.rows || [];
      this.log("Obstacles snapshot: " + this.obstacleRows.length + " rows.");
      if (this.logObstacleTypes) {
        const types: { [t: string]: number } = {};
        this.obstacleRows.forEach((o: any) => {
          const t = (o.object_type || "(none)") + "";
          types[t] = (types[t] || 0) + 1;
        });
        const summary = Object.keys(types)
          .map((t) => t + " x" + types[t])
          .join(", ");
        this.log("object_type values seen: " + (summary || "none"));
      }
    } else if (msg.table === "Paths") {
      this.pathRows = msg.rows || [];
      this.log("Paths snapshot: " + this.pathRows.length + " rows.");
    } else if (msg.table === "arenaDimensions") {
      this.dimsBySession = {};
      (msg.rows || []).forEach((r: any) => {
        this.dimsBySession[r.session_ID] = {
          dx: Number(r.dimension_x) || 60,
          dy: Number(r.dimension_y) || 20,
        };
      });
    } else {
      return; // savedCourses etc. — ignore
    }
    this.rebuild();
  }

  // ── Which session to show ─────────────────────────────────────────────────
  private highWaterSession = 0;

  private resolveSession(): number {
    if (this.targetSession && this.targetSession > 0) return this.targetSession;
    // The live working session is the newest row in arenaDimensions: every "new
    // session" (and every loaded course, with the server fix) writes one there,
    // so it stays stable even when that session currently has ZERO obstacles.
    // This stops the view from snapping back to an OLD session when you delete
    // the last obstacle in the current one.
    let s = 0;
    for (const k in this.dimsBySession) { const id = Number(k); if (id > s) s = id; }
    if (s === 0) this.obstacleRows.forEach((o) => { if (o.session_ID > s) s = o.session_ID; });
    if (s > this.highWaterSession) this.highWaterSession = s; // never go backwards
    return this.highWaterSession;
  }

  private dimsFor(session: number): { dx: number; dy: number } {
    return this.dimsBySession[session] || { dx: 60, dy: 20 };
  }

  // ── Pixel (canvas) -> local position under arenaRoot, in cm ───────────────
  //  Mirrors the server: canvas fixed 600px wide; rider origin = top-edge mid.
  private toLocalCm(px: number, py: number, dx: number, dy: number): vec3 {
    const CANVAS_W = 600;
    const ratio = Math.max(0.2, Math.min(1.2, dy / dx));
    const canvasH = Math.round(CANVAS_W * ratio);
    const sX = dx / CANVAS_W;       // metres per pixel, horizontal
    const sY = dy / canvasH;        // metres per pixel, vertical
    const rightM = px * sX - dx / 2;          // +x = right
    let forwardM = py * sY;                    // +y = into the arena
    if (this.flipHandedness) forwardM = -forwardM;

    const u = 100 * this.arenaScale;          // metres -> world cm, with shrink
    // forward maps to -Z so the arena lays out in front of the wearer
    return new vec3(rightM * u, this.groundOffsetCm, -forwardM * u);
  }

  // The server keeps cal_* in the SAME editor-pixel space as the raw columns
  // (cal = c(raw); identity until a calibration is saved, a heading rotation after),
  // so the calibrated feed goes through the very same toLocalCm() as the raw one.
  // Falls back to the raw column when a row predates cal_*.
  private px(row: any, calKey: string, rawKey: string): number {
    const v = row[calKey];
    return (v === null || v === undefined) ? Number(row[rawKey]) || 0 : Number(v) || 0;
  }

  private yRotation(rotateZdeg: number): quat {
    let deg = this.flipHandedness ? rotateZdeg : -rotateZdeg;
    return quat.angleAxis((deg * Math.PI) / 180, vec3.up());
  }

  // ── Rebuild the scene from current rows ───────────────────────────────────
  private rebuild() {
    if (!this.arenaRoot) {
      this.log("ERROR: assign the arenaRoot input.");
      return;
    }
    const session = this.resolveSession();
    if (session === 0) return;
    const { dx, dy } = this.dimsFor(session);

    this.updateObstacles(session, dx, dy);
    this.updatePaths(session, dx, dy);
  }

  private prefabForType(type: string): ObjectPrefab {
    const t = (type || "").toLowerCase();
    for (let i = 0; i < this.obstacleTypeNames.length; i++) {
      if ((this.obstacleTypeNames[i] || "").toLowerCase() === t) {
        const p = this.obstacleTypePrefabs[i];
        if (p) return p;
      }
    }
    return this.defaultObstaclePrefab;
  }

  // Incremental: keeps existing objects (so proximity state survives updates).
  private updateObstacles(session: number, dx: number, dy: number) {
    const rows = this.obstacleRows.filter((o) => o.session_ID === session);
    const seen: { [id: number]: boolean } = {};

    rows.forEach((o) => {
      const id = o.obstacle_ID;
      seen[id] = true;
      // Calibrated coords (pixels, like raw). cal_rotate_z includes the heading.
      const pos = this.toLocalCm(this.px(o, "cal_position_x", "position_x"),
                                 this.px(o, "cal_position_y", "position_y"), dx, dy);
      const rot = this.yRotation(this.px(o, "cal_rotate_z", "rotate_z"));
      const s = this.obstacleBaseScale * this.arenaScale;
      const scale = new vec3(
        (this.px(o, "cal_scale_x", "scale_x") || 1) * s,
        (this.px(o, "cal_scale_y", "scale_y") || 1) * s,
        (this.px(o, "cal_scale_z", "scale_z") || 1) * s
      );

      let entry = this.liveObstacles[id];
      if (!entry) {
        const prefab = this.prefabForType(o.object_type);
        if (!prefab) { this.log("No prefab for type '" + o.object_type + "'."); return; }
        const so = prefab.instantiate(this.arenaRoot);
        so.name = (o.object_name || o.object_type || "obstacle") + " #" + id;
        entry = { so: so, inside: false };
        this.liveObstacles[id] = entry;
      }
      const t = entry.so.getTransform();
      t.setLocalPosition(pos);
      t.setLocalRotation(rot);
      t.setLocalScale(scale);
    });

    // Remove obstacles that no longer exist in this session.
    Object.keys(this.liveObstacles).forEach((k) => {
      const id = Number(k);
      if (!seen[id]) {
        this.liveObstacles[id].so.destroy();
        delete this.liveObstacles[id];
      }
    });
  }

  // ── Colour -> prefab ──────────────────────────────────────────────────────
  //  Picks the pre-built dot prefab for the colour the server sent. Anything
  //  unrecognised (or an unassigned slot) falls back to the blue PathDot.
  private prefabForColor(color: string): ObjectPrefab | null {
    const c = (color || "blue").toLowerCase().trim();
    if (c === "green"  && this.pathPointPrefabGreen)  return this.pathPointPrefabGreen;
    if (c === "yellow" && this.pathPointPrefabYellow) return this.pathPointPrefabYellow;
    if (c === "red"    && this.pathPointPrefabRed)    return this.pathPointPrefabRed;
    return this.pathPointPrefab || null;
  }

  // Paths are cheap and have no proximity state, so we rebuild them wholesale.
  private updatePaths(session: number, dx: number, dy: number) {
    if (this.pathContainer) { this.pathContainer.destroy(); this.pathContainer = null; }
    if (!this.pathPointPrefab) return;

    const pts = this.pathRows
      .filter((p) => p.session_ID === session)
      .sort((a, b) => a.point_number - b.point_number);
    if (pts.length === 0) return;

    this.pathContainer = global.scene.createSceneObject("PathPoints");
    this.pathContainer.setParent(this.arenaRoot);

    const dotSize = this.pathPointSizeMeters * 100 * this.arenaScale;
    const localPositions: vec3[] = [];

    pts.forEach((p) => {
      const pos = this.toLocalCm(this.px(p, "cal_position_x", "position_x"),
                                 this.px(p, "cal_position_y", "position_y"), dx, dy);
      localPositions.push(pos);

      const prefab = this.prefabForColor(p.color);
      if (!prefab) return;

      const dot = prefab.instantiate(this.pathContainer);
      dot.name = "pt " + p.point_number + " (" + (p.color || "blue") + ")";
      const t = dot.getTransform();
      t.setLocalPosition(pos);
      t.setLocalScale(new vec3(dotSize, dotSize, dotSize));
    });

    // Optional connecting line between consecutive waypoints (legacy cube).
    if (this.pathLinePrefab) {
      const thickness = this.pathPointSizeMeters * 0.5 * 100 * this.arenaScale;
      for (let i = 0; i < localPositions.length - 1; i++) {
        this.makeSegment(localPositions[i], localPositions[i + 1], thickness);
      }
    }

    // Triangle decals laid flat between consecutive waypoints, pointing along
    // the path (blue-triangle.png on the floor).
    if (this.pathTrianglePrefab) {
      const triSize = this.pathTriangleSizeMeters * 100 * this.arenaScale;
      const spacingCm = this.pathTriangleSpacingMeters * 100 * this.arenaScale;
      for (let i = 0; i < localPositions.length - 1; i++) {
        this.layTriangles(localPositions[i], localPositions[i + 1], triSize, spacingCm);
      }
    }
  }

  // Place one or more flat triangles along the segment a -> b.
  // spacingCm <= 0 => a single triangle at the midpoint.
  private layTriangles(a: vec3, b: vec3, triSize: number, spacingCm: number) {
    const dir = b.sub(a);
    const len = dir.length;
    if (len < 0.001) return;
    const ndir = dir.normalize();

    // Heading so the triangle's texture-up points from a -> b, plus a flat tilt.
    const yaw = Math.atan2(ndir.x, -ndir.z) + (this.triangleYawOffsetDeg * Math.PI) / 180;
    const rot = quat.angleAxis(yaw, vec3.up())
      .multiply(quat.angleAxis(-Math.PI / 2, vec3.right()));

    let positions: vec3[] = [];
    if (spacingCm > 0.001) {
      // Tile from a little inside the start to a little inside the end.
      const count = Math.max(1, Math.floor(len / spacingCm));
      for (let k = 0; k <= count; k++) {
        const t = count === 0 ? 0.5 : k / count;
        positions.push(a.add(dir.uniformScale(t)));
      }
    } else {
      positions.push(a.add(b).uniformScale(0.5)); // midpoint only
    }

    positions.forEach((p) => {
      const tri = this.pathTrianglePrefab.instantiate(this.pathContainer);
      tri.name = "tri";
      const tr = tri.getTransform();
      tr.setLocalPosition(new vec3(p.x, this.groundOffsetCm, p.z));
      tr.setLocalRotation(rot);
      tr.setLocalScale(new vec3(triSize, triSize, triSize));
    });
  }

  // Stretch a unit cube between two points to form a path segment.
  // (Uses whatever material is baked into pathLinePrefab — no runtime swap.)
  private makeSegment(a: vec3, b: vec3, thickness: number) {
    const seg = this.pathLinePrefab.instantiate(this.pathContainer);
    const dir = b.sub(a);
    const len = dir.length;
    if (len < 0.001) { seg.destroy(); return; }
    const mid = a.add(b).uniformScale(0.5);
    const t = seg.getTransform();
    t.setLocalPosition(mid);
    // orient the cube's +Z (assumed length axis) along the segment direction
    t.setLocalRotation(quat.lookAt(dir.normalize(), vec3.up()));
    t.setLocalScale(new vec3(thickness, thickness, len));
  }

  // ── Proximity sound ───────────────────────────────────────────────────────
  private onUpdate() {
    if (!this.camera || !this.alertAudio) return;
    const camPos = this.camera.getTransform().getWorldPosition();
    const radius = this.proximityRadiusMeters * 100; // real-world cm (1 unit = 1 cm)
    const exitRadius = radius * 1.4; // hysteresis so it doesn't retrigger on the edge

    for (const k in this.liveObstacles) {
      const entry = this.liveObstacles[k];
      const p = entry.so.getTransform().getWorldPosition();
      const dxw = camPos.x - p.x;
      const dzw = camPos.z - p.z;
      const dist = Math.sqrt(dxw * dxw + dzw * dzw); // horizontal only

      if (!entry.inside && dist < radius) {
        entry.inside = true;
        this.alertAudio.play(1);
      } else if (entry.inside && dist > exitRadius) {
        entry.inside = false; // re-armed for next approach
      }
    }
  }

  private log(m: string) {
    if (this.enableLogging) print("[ArenaStreamer] " + m);
  }
}
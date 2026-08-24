Barrel asset
=============

Same package structure as your other assets:

barrel-1/
├── textures/                       <- drop-in PBR texture set
│   ├── M_Barrel_BaseColor.png      (wood staves + 5 metal bands + rivets)
│   ├── M_Barrel_Normal.png
│   ├── M_Barrel_Roughness.png      (wood rough, bands smoother)
│   ├── M_Barrel_Metallic.png       (0 on wood, metallic on the bands)
│   ├── M_Barrel_Height.png
│   └── M_Barrel_OcclusionRoughnessMetallic.png
└── source/
    └── Barrel/
        ├── barrel.obj              <- lathe-revolved bulge profile,
        ├── barrel.mtl                 open top rim, solid wood bottom
        ├── barrel.glb              <- same mesh, textures embedded
        └── (same texture set, copied alongside the mesh)

Notes:
- Sized to a real American Standard Barrel (whiskey/bourbon): 0.914 m
  (36 in) tall, ~0.70 m bung (bulge) diameter, ~0.57 m head (top/bottom)
  diameter — assuming your engine uses 1 unit = 1 meter. Rescale the mesh
  if your project uses different units.
- Texture is 1648x720 (~2.29:1), matching this mesh's circumference/height
  ratio so the staves and bands wrap around without stretching — same
  fix used on the finish/start line banners.
- Band positions (paired near the top, single at the middle, paired near
  the bottom) mirror the reference photo's spacing.
- Top is left open with a slightly recessed dark interior disc, like the
  reference; bottom is a solid wood cap. Swap in a second BaseColor or
  flip the mesh if you need a fully sealed barrel instead.
- If a viewer shows a checkerboard instead of the wood texture, open
  barrel.glb instead — it has every map embedded, no external file
  references to break.

Lens Studio:
- Confirmed supported: Lens Studio imports glTF (.glb), FBX, and OBJ
  directly. Use the .glb in this folder — textures are embedded, so it'll
  show up correctly on import with no manual relinking needed.

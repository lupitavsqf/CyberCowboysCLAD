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
- Texture is 2072x720 (~2.88:1), matching the mesh's circumference/height
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

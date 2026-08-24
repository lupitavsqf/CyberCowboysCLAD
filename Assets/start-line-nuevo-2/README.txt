Start Line asset
=================

Same structure and geometry as finish-line-3, just green checkers and
"START" text instead of black checkers and "FINISH":

start-line-1/
├── textures/                          <- drop-in PBR texture set
│   ├── M_Start_Line_BaseColor.png
│   ├── M_Start_Line_Normal.png
│   ├── M_Start_Line_Roughness.png
│   ├── M_Start_Line_Metallic.png
│   ├── M_Start_Line_Height.png
│   └── M_Start_Line_OcclusionRoughnessMetallic.png
└── source/
    └── Start Line/
        ├── start_line.obj             <- mesh: two poles, sagging checkered
        ├── start_line.mtl                banner, and a ground decal strip
        └── (same texture set, copied alongside the mesh)

Notes:
- Texture is 2016x480 (4.2:1), matching the banner's world-space aspect
  ratio so the checkers stay square and "START" doesn't stretch — same
  fix applied after the finish-line distortion issue.
- Ground decal geometry uses the same 4.2:1 aspect ratio as the texture
  for the same reason.
- OBJ/MTL (not FBX) so it imports into any engine; re-save there to get
  engine-specific .meta/import files, same as your other assets.

EQUESTRIAN SHOW-JUMPING POLE  -  Blender asset
================================================

source/Equestrian Pole.fbx    Self-contained FBX (binary, FBX 2014/2015 v7400,
                              the most widely compatible version; textures are
                              EMBEDDED, so it imports with materials intact into
                              Blender, Unity, Unreal, etc.).
source/Equestrian Pole.blend  Editable Blender scene.
source/build_pole.py          The script that generates everything. Re-run with
                              `blender --background --python build_pole.py`
                              (run it from a folder that contains ./textures).

textures/  PBR set, 2048x2048:
  EQ_Pole_BaseColor.png                    colour (sRGB)  <- the colourful map
  EQ_Pole_Roughness.png                    (Non-Color)
  EQ_Pole_Metallic.png                     (Non-Color)
  EQ_Pole_OcclusionRoughnessMetallic.png   packed ORM (R=AO, G=Rough, B=Metal)
  EQ_Pole_Normal.png                       tangent-space normal (Non-Color)

MODEL
  Round pole laid along +X, length 3.5 m, radius 0.07 m, 96 radial segments.
  Layout along the length: galvanised cap | white | brown | white | brown |
  white | galvanised cap. The end caps are metal (metallic=1); the painted
  bands are matte (metallic=0).

UV LAYOUT
  The pole length maps to U (0->1) so the texture's vertical stripes wrap as
  rings. Each flat end cap is mapped to a small disc inside the metal stripe at
  its end of the texture. To recolour, just repaint the bands in
  EQ_Pole_BaseColor.png - positions are fixed by the UVs.

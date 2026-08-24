STOP BASE  -  octagonal step-on pad  -  game-ready asset
==================================================

source/Stop Base.fbx         Self-contained FBX (ASCII, FBX 7.4 / version 7400 -
                             widely compatible with Blender, Unity, Unreal, Maya,
                             3ds Max). BaseColor + Normal maps are EMBEDDED, so it
                             imports with a usable material and no missing-texture
                             prompts. Authored in centimetres, Y-up, sitting on the
                             floor (base at y=0).
source/build_base.py         Builds the mesh + FBX. Re-run with
                             `python build_base.py` from a folder that has
                             ./textures (it calls tex_stop.py to (re)make the atlas
                             if it is missing).
source/tex_stop.py           Procedural generator for the PBR texture atlas.

textures/  PBR texture ATLAS, 2048x2048:
  Stop_BaseColor.png                       colour (sRGB)        <- embedded in FBX
  Stop_Normal.png                          tangent-space normal <- embedded in FBX
  Stop_Roughness.png                       (Non-Color)
  Stop_Metallic.png                        (Non-Color)
  Stop_AO.png                              ambient occlusion
  Stop_OcclusionRoughnessMetallic.png      packed ORM (R=AO, G=Rough, B=Metal)

MODEL
  A low octagonal platform lying flat on the floor - an octagonal base the user
  steps on top of. 120 cm across the flats, 10 cm tall. The TOP face shows the red
  STOP graphic reading upright; the BOTTOM face carries the same graphic; the short
  vertical rim around the edge is brushed steel (the step-up). Very light mesh:
  18 verts / 24 polys (8 top tris + 8 bottom tris + 8 rim quads). Flat-shaded so
  the platform faces stay crisp. The base sits on y=0, centred on X/Z, ready to
  drop into a scene as a trigger pad / podium.

UV ATLAS LAYOUT
  One material, one atlas, two regions:
    STOP  region (square)      : red plate, inset white octagon border, white
                                 "STOP". The top and bottom faces map here.
    METAL region (lower strip) : brushed galvanised steel; the rim maps here.
  The metallic/roughness maps already carry the right values per region (STOP face
  matte/non-metal, rim metal=1), so no per-face material setup is needed.

USING THE FULL PBR SET
  A legacy FBX material auto-wires only Base Color + Normal, which is what is
  embedded. For a physically-based look, plug the remaining maps into your shader:
  Roughness -> Roughness, Metallic -> Metallic, AO/ORM into ambient occlusion. In
  Blender: import the FBX, add Image Texture nodes for Roughness/Metallic (set to
  Non-Color) and wire them into the Principled BSDF.

ADJUSTING
  Edit ACROSS_FLATS (width) and H (step height) at the top of build_base.py and
  re-run to resize the pad.

NOTE
  Generated with a pure-Python pipeline (no Blender dependency), so no .blend is
  included; re-run build_base.py to regenerate the FBX and textures from scratch.

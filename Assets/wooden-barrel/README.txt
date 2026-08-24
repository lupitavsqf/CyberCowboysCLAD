WOODEN BARREL  -  game-ready asset
==================================================

source/Wooden Barrel.fbx     Self-contained FBX (ASCII, FBX 7.4 / version 7400 -
                             widely compatible with Blender, Unity, Unreal, Maya,
                             3ds Max). The BaseColor and Normal maps are EMBEDDED,
                             so the mesh imports with a usable wood material with
                             no missing-texture prompts. Geometry is authored in
                             centimetres, Y-up, so it lands upright at real-world
                             scale (about 90 cm tall, 72 cm across the belly).
source/build_barrel.py       The script that builds the mesh + FBX. Re-run with
                             `python build_barrel.py` from a folder that has
                             ./textures (it will call tex_barrel.py to (re)make
                             the maps if they are missing).
source/tex_barrel.py         Procedural generator for the PBR texture set.

textures/  PBR set, 2048x2048:
  Barrel_BaseColor.png                     colour (sRGB)        <- embedded in FBX
  Barrel_Normal.png                        tangent-space normal <- embedded in FBX
  Barrel_Roughness.png                     (Non-Color)
  Barrel_Metallic.png                      (Non-Color)
  Barrel_AO.png                            ambient occlusion
  Barrel_OcclusionRoughnessMetallic.png    packed ORM (R=AO, G=Rough, B=Metal)

MODEL
  Upright barrel along +Y. Parabolic "bilge" bulge: radius 27 cm at the flat
  heads, 36 cm at the belly. 96 radial segments, 64 height segments, smooth-
  shaded round body with flat wood heads top and bottom. Five galvanised-steel
  hoops stand slightly proud of the staves (top chime hoop, upper, bilge, lower,
  bottom chime hoop); the three accessible hoops carry rivets.
  ~6.2k verts, 6144 quads + 192 cap tris.

UV LAYOUT
  Body: U (0->1) wraps around the circumference so the texture's vertical
  stripes read as wood staves; V (0->1) runs up the height so the horizontal
  bands read as steel hoops at fixed heights. Each flat head is mapped into a
  clean wood window of the texture, giving the parallel-plank look of a barrel
  lid. To recolour, repaint in Barrel_BaseColor.png - positions are fixed by
  the UVs and by the HOOPS list shared between build_barrel.py and tex_barrel.py.

USING THE FULL PBR SET
  A legacy FBX material auto-wires only Base Color + Normal, which is what is
  embedded. For a physically-based look, plug the remaining maps into your
  shader: Roughness -> Roughness, Metallic -> Metallic (the hoops are metal=1,
  the wood is metal=0), and AO/ORM into ambient occlusion. In Blender: import
  the FBX, then add Image Texture nodes for Roughness/Metallic (set to
  Non-Color) and wire them into the Principled BSDF.

NOTE
  This asset was generated with a pure-Python pipeline (no Blender dependency),
  so no .blend file is included; re-run build_barrel.py to regenerate the FBX
  and textures from scratch.

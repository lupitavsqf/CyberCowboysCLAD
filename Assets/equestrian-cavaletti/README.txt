EQUESTRIAN CAVALETTI  -  Blender asset
======================================
A single brown/white striped rail resting in two natural-oak X-supports.
The support boards are cut to an elongated hexagon (chamfered, pointed ends),
matching the reference photo.

CONTENTS
  source/Equestrian Cavaletti.fbx    Self-contained FBX (binary v7400; textures
                                     EMBEDDED). Imports with materials intact into
                                     Blender, Unity, Unreal, etc.
  source/Equestrian Cavaletti.blend  Editable Blender scene.
  source/build_cavaletti.py          Generator script:
                                     blender --background --python build_cavaletti.py
  textures/  2048x2048 PBR sets:
     EQ_Cav_Pole_*  (BaseColor sRGB / Roughness / Metallic / ORM / Normal)  the rail
     EQ_Cav_Oak_*   (BaseColor sRGB / Roughness / Normal)                    the wood

SCENE OBJECTS
  Pole         striped rail, flat-cut ends, bands driven by the BaseColor PNG.
  Support_L/R  two crossed oak planks each (hexagonal pointed ends) forming an X;
               the rail sits in the top V, legs splayed to the ground.

DIMENSIONS (metres)
  Rail length 2.60 | Rail diameter 0.09 | Rail height ~0.25 (low setting)
  Board 0.58 x 0.11 x 0.034, hex chamfer 0.04 | Board angle 52 deg

NOTES
  Recolour the rail by repainting EQ_Cav_Pole_BaseColor.png (geometry/UVs fixed).
  Rotating a Support about the rail axis raises/lowers the rail (low/medium/high).

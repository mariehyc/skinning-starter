Team Members:
Marie Cho (mhc2323)
Harini Majety (hpm385)

Extra Credit:

 Root Joint Translation

Description
In addition to rotating joints, the GUI now allows translation of the root joint. This enables full repositioning of the character in world space, rather than only manipulating pose through rotations.

Implementation Details

* The root joint transform now includes both rotation and translation components.
* Translation is applied before hierarchical transformations propagate to child joints.
* The transformation pipeline ensures all child joints correctly inherit the updated root position.

How to Use

* Open the GUI panel.
* Select the root joint.
* Use the translation sliders to move the character.
* Rotations still work as before and can be combined with translation.

---

 Texture Mapping

Description
Texture mapping has been implemented to allow surfaces to display bitmap images instead of flat colors. This enhances visual realism, especially for test scenes like the cube.

Implementation Details

* Bitmap images are loaded using the provided image loader utilities.
* Textures are uploaded to the GPU via the `RenderPass` texture interface.
* A custom fragment shader samples the texture using UV coordinates.
* Meshes include UV mappings to correctly map image data onto surfaces.

How to Use

* Run the program normally.
* Load a scene that includes texture coordinates 
* The texture will automatically be applied if the scene supports it.

 Shadow Mapping

 ---

Description
Shadow mapping has been implemented to render realistic shadows cast by the character onto itself and the ground plane.

Implementation Details

* A depth map is generated from the light’s point of view.
* During rendering, fragments are compared against the depth map to determine whether they are in shadow.
* Shadows are applied in the fragment shader using depth comparison.
* Supports both:

  * Self-shadowing (character casting shadows on itself)
  * Ground shadows

How to Use

* Run the program.
* Ensure lighting is enabled in the scene.
* Shadows will render automatically.
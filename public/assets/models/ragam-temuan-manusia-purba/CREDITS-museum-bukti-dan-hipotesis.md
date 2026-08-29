# Attribution - museum-bukti-dan-hipotesis.glb

This model combines real photogrammetry/CT scans sourced from Sketchfab (used under CC Attribution) with simple original geometry (museum platform, pedestals, scientific tools) built for this project.

## Sketchfab sources (CC Attribution - https://creativecommons.org/licenses/by/4.0/)

- **LB1 - Homo floresiensis [skull]** by nebulousflynn
  https://sketchfab.com/3d-models/4e424b65d4804a6f9be00215e5172128
  Used as the CENTER focal specimen.

- **LB-1 (Flores) - Skull** by VirtualAnthropologyUnipi
  https://sketchfab.com/3d-models/71ff6fd96ce248d2863c89372250a171
  Used as the RIGHT comparative specimen.

- ~~Human Skull (Homo sapiens) - Cráneo humano~~ by caiarqueometriaucm - **replaced 2026-08-21**, see below.

- **Human Male Skull** by Ruslan Gadzhiev (https://sketchfab.com/ruslangadzhiev)
  https://sketchfab.com/3d-models/human-male-skull-f1eaaef50e5845c796d6834fd1b702e5
  License: CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
  Used as the Homo sapiens comparison specimen (`HomoSapiens_Skull` node). Replaces the original caiarqueometriaucm scan, which shipped with no texture data and rendered as a flat/undefined color. This scan also had no texture, but its geometry is much higher-detail (cranium + mandible + teeth); a procedural fossil-bone material (Noise/Voronoi in Blender) was baked to a 1024px JPEG base color texture to match the tan/brown mottled look of the other two specimens, then the mesh was decimated (~83k → ~25k verts) for WebAR.

All specimens were decimated/optimized (geometry simplified and textures resized to ≤1024px JPEG) for WebAR use; the museum platform, pedestals, and scientific tools (caliper, magnifier, measuring scale, fossil fragments) are original low-poly geometry built for HistoAR.

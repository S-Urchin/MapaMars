# Resources

Put images, data files, textures, and other static resources here.

Files in this folder are served as-is at `/resources/<file name>`, so you can reference them directly:

```tsx
<img src="/resources/mars-map.jpg" alt="Mars map" />
```

```ts
const data = await fetch('/resources/sites.json').then((r) => r.json());
```

## Mars globe model

`mars-nasa.glb` is NASA's 3D model of Mars (credit: NASA/JPL-Caltech), downloaded from
https://science.nasa.gov/resource/planet-mars-3d-model/. The globe loads it in `src/components/marsModel.ts`,
turns it to match the globe's latitude and longitude, and smooths its outline. If the file is missing or
fails to load, the globe falls back to a generated surface.

## Phobos and Deimos shapes

`phobos-shape.bin` and `deimos-shape.bin` are the measured shape models of Ernst et al. (2023), "High-resolution
shape models of Phobos and Deimos from stereophotoclinometry" (Earth, Planets and Space 75:103), downloaded
from the Small Body Mapping Tool at https://sbmt.jhuapl.edu/shared-files/ (Phobos `phobos_g_148m_spc_obj_0000n00000_v004`,
Deimos `deimos_g_083m_spc_obj_0000n00000_v002`, 196,608 triangles each). They are packed into a small gzipped
binary; the format is described in `src/components/moonModel.ts`. If a file is missing, the globe shows a
plain ellipsoid of the moon's size instead.

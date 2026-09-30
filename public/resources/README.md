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

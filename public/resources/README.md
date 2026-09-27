# Resources

Put images, data files, textures, and other static resources here.

Files in this folder are served as-is at `/resources/<file name>`, so you can reference them directly:

```tsx
<img src="/resources/mars-map.jpg" alt="Mars map" />
```

```ts
const data = await fetch('/resources/sites.json').then((r) => r.json());
```

## Mars globe texture

The 3D globe loads `mars.jpg` from this folder if it exists. Use an equirectangular (2:1) color map of Mars, with 180°W on the left edge and north at the top, such as a Viking or MGS color mosaic. If the file is missing, the globe falls back to a generated surface.

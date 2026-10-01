# Mapa Mars

A Marswalk planning app built with React, TypeScript and three.js. Plan a walk on a 2D map of Mars by picking a start and end point, share it with a crew using a mission code, and keep a permanent mission log. A 3D globe gives an overview of NASA landing sites. Accounts and missions are stored in Supabase.

## ⚠ NASA data: placeholders to connect

No NASA data API is connected yet. Every data source MAPA needs is listed in [`src/config/nasaData.ts`](src/config/nasaData.ts) with an empty URL. Until a URL is filled in, the app uses the placeholder shown below.

To connect one, set its environment variable in `.env.local` (and in Vercel's Environment Variables), or fill in `url` in `nasaData.ts`. Then document the exact dataset, product ID and resolution for the data-provenance label.

| Data | Likely source | Used for | Env variable | Placeholder today |
|---|---|---|---|---|
| Surface imagery | CTX / Viking MDIM mosaics (e.g. via NASA Mars Trek) | 2D map background and 3D globe | `VITE_NASA_IMAGERY_URL` | Generated texture, or `public/resources/mars.jpg` |
| Elevation | MOLA, Mars Global Surveyor | Elevation layer, elevation profile, gain/loss | `VITE_NASA_ELEVATION_URL` | Not shown |
| Terrain model (DTM) | HiRISE / CTX DTMs for the demo region | Walking-scale elevation and slope (MOLA is too coarse for a few-km walk) | `VITE_NASA_DTM_URL` | Not shown |
| Slope | Derived by MAPA from elevation / DTM | Steep-terrain layer, hazards, max slope on a route | `VITE_NASA_SLOPE_URL` | Not shown; distance is straight-line only |
| Geological units | USGS Geologic Map of Mars (SIM 3292) | Science layer, site-card geology | `VITE_NASA_GEOLOGY_URL` | Not shown |
| Mineralogy | CRISM, Mars Reconnaissance Orbiter | Science layer, science opportunities | `VITE_NASA_MINERALOGY_URL` | Not shown |
| Thermal | THEMIS, Mars Odyssey | Surface-condition layer | `VITE_NASA_THERMAL_URL` | Not shown |
| Rover traverses | Perseverance, Curiosity, Opportunity, Spirit (PDS) | Historical mission layer | `VITE_NASA_TRAVERSES_URL` | Landing-site points in `src/data/mars.ts` |
| Place names | IAU / USGS Gazetteer of Planetary Nomenclature | Searching Mars by name | `VITE_NASA_PLACENAMES_URL` | Short landmark list in `src/data/mars.ts` |

Notes:

- Only surface imagery is wired up so far: once `VITE_NASA_IMAGERY_URL` is set, the 2D map uses it. It currently expects a single equirectangular image URL; tiled imagery (WMTS / XYZ) needs map-tile support added first.
- Verify each source can be loaded from a browser (CORS) before relying on it.
- The site marks every value as **Observed** (straight from NASA), **Derived** (calculated by MAPA from NASA data) or **Estimated** (based on assumptions). Keep that labelling when adding layers.

## Moon positions: JPL Horizons

The globe places Phobos and Deimos from [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html), accurate to well under a kilometre. Horizons can't be called from a browser (it sends no CORS headers), so [`api/horizons.ts`](api/horizons.ts) fetches it on the server: as a Vercel function in production, and through the Vite dev server locally (`npm run dev` / `npm run preview`). It needs no API key. The function accepts only a moon name and a start day and caches each answer for a day.

If Horizons can't be reached, or the site is hosted somewhere that doesn't run `api/` functions, the globe falls back to the built-in orbit model in `src/data/marsSky.ts` and drops the "Moon positions: JPL Horizons" credit.

## Requirements

- Node.js 20 or newer
- A Supabase project

## Setup

1. In the Supabase dashboard, open **SQL Editor**, paste in [`supabase/schema.sql`](supabase/schema.sql) and run it.
2. Under **Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` and add `http://localhost:5173/**` to the Redirect URLs.
3. Copy `.env.example` to `.env.local` and fill in your project's URL and anon (publishable) key from **Project Settings → API**:

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```

## Run

```powershell
.\Launch.ps1
```

This installs dependencies on first run, starts the dev server, and opens http://localhost:5173. Add `-Share` to let other devices on your network open the site.

## Commands

```bash
npm run dev       # Start the dev server
npm run build     # Type-check and build for production
npm run preview   # Preview the production build
npm run lint      # Run Oxlint
```

## Admins

Admins can edit or delete anyone's missions. In the Supabase dashboard, open **Table Editor → profiles** and set `is_admin` to true for the account.

## Custom Mars texture

Put an equirectangular (2:1) Mars image at `public/resources/mars.jpg` to replace the generated surface. See [`public/resources/README.md`](public/resources/README.md).

## Git and GitHub

The project lives at https://github.com/S-Urchin/MapaMars on the `main` branch.

Get a copy on a new machine:

```powershell
git clone https://github.com/S-Urchin/MapaMars.git
cd MapaMars
```

Then follow [Setup](#setup). `.env.local` is not in the repository, so create it again.

Push your changes:

```powershell
git add .
git commit -m "Describe what you changed"
git push
```

Get the latest changes from others:

```powershell
git pull
```

`.gitignore` keeps `node_modules`, build output and `.env.local` (your Supabase keys) out of the repository.

## Project structure

```text
src/
  config/       NASA data sources (placeholders until connected)
  pages/        Home, Globe, Missions and Account pages
  components/   2D Marswalk map, 3D globe and procedural Mars texture
  auth/         Signed-in user state
  services/     Supabase calls for accounts and missions
  data/         Landing sites, landmarks and Mars time formulas
  lib/          Supabase client
supabase/
  schema.sql    Tables and access rules
```

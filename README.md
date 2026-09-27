# Mapa Mars

An interactive 3D Mars globe built with React, TypeScript and three.js. Explore NASA landing sites, see the local time on Mars, and log your own missions to a shared log backed by Supabase.

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
  pages/        Home, Globe, Missions and Account pages
  components/   3D globe and procedural Mars texture
  auth/         Signed-in user state
  services/     Supabase calls for accounts and missions
  data/         Landing sites, landmarks and Mars time formulas
  lib/          Supabase client
supabase/
  schema.sql    Tables and access rules
```

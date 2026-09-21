# ORBIT

Orbit is a React and TypeScript front end for exploring NASA mission and Earth observation data.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

Check your installed versions:

```bash
node --version
npm --version
```

## Start Locally

From the project root, install the dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

The page supports hot reload, so changes in `src/` appear in the browser automatically.

## Available Commands

```bash
npm run dev       # Start the local development server
npm run build     # Type-check and create a production build
npm run preview   # Preview the production build locally
npm run lint      # Run Oxlint
```

## Project Structure

```text
src/
  App.tsx                 Main dashboard UI
  App.css                 Dashboard styles and responsive layout
  index.css               Global styles and fonts
  services/nasaApi.ts     NASA data types, mock data, and API boundary
```

## NASA Backend Integration

The front end currently uses mock data from `src/services/nasaApi.ts`. The `getMissions()` function is ready to call:

```text
/api/missions
```

When the backend is added, replace the mock data with the backend response while keeping the `Mission` type as the shared front-end contract.

## Push to GitHub

This project does not have Git history configured yet. Create an empty repository on GitHub first, then run these commands from the project root:

```powershell
git init
git add .
git commit -m "Initial Orbit frontend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPOSITORY` with your GitHub username and repository name. The existing `.gitignore` keeps `node_modules` and build output out of the repository.

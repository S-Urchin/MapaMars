// NASA data sources MAPA will use. None are connected yet: each `url` is empty until the
// team picks and verifies an endpoint. The README lists the same placeholders as a reminder.
//
// Fill in a URL (or set it through the matching VITE_ environment variable) and the feature
// that uses it switches from the placeholder to real data.

export type DataCategory = 'observed' | 'derived'

export type NasaDataSource = {
  id: string
  name: string
  /** Instrument / mission, for the data-provenance label. */
  source: string
  /** What MAPA uses it for. */
  purpose: string
  category: DataCategory
  /** Endpoint or tile template. Empty = not connected yet (placeholder in use). */
  url: string
  /** Where the placeholder currently lives in the app. */
  placeholder: string
}

const env = import.meta.env

export const nasaData = {
  surfaceImagery: {
    id: 'surface-imagery',
    name: 'Surface imagery (map tiles)',
    source: 'e.g. CTX / Viking MDIM mosaics via NASA Mars Trek',
    purpose: 'Background image for the 2D Marswalk map and the 3D globe',
    category: 'observed',
    url: env.VITE_NASA_IMAGERY_URL ?? '',
    placeholder: 'Generated Mars texture (src/components/marsTexture.ts), or public/resources/mars.jpg',
  },
  elevation: {
    id: 'elevation',
    name: 'Elevation (MOLA)',
    source: 'Mars Orbiter Laser Altimeter, Mars Global Surveyor',
    purpose: 'Elevation layer, elevation profile, elevation gain/loss',
    category: 'observed',
    url: env.VITE_NASA_ELEVATION_URL ?? '',
    placeholder: 'Not shown yet',
  },
  terrainModel: {
    id: 'terrain-model',
    name: 'High-resolution terrain model (DTM)',
    source: 'HiRISE / CTX digital terrain models for the demo region',
    purpose: 'Walking-scale elevation and slope (MOLA is too coarse for a few-km Marswalk)',
    category: 'observed',
    url: env.VITE_NASA_DTM_URL ?? '',
    placeholder: 'Not shown yet',
  },
  slope: {
    id: 'slope',
    name: 'Slope',
    source: 'MAPA-derived from the elevation / terrain model above',
    purpose: 'Steep-terrain layer, hazard checks, maximum slope along a route',
    category: 'derived',
    url: env.VITE_NASA_SLOPE_URL ?? '',
    placeholder: 'Not shown yet',
  },
  geology: {
    id: 'geology',
    name: 'Geological units',
    source: 'USGS Geologic Map of Mars (SIM 3292)',
    purpose: 'Science layer and site-card geology',
    category: 'observed',
    url: env.VITE_NASA_GEOLOGY_URL ?? '',
    placeholder: 'Not shown yet',
  },
  mineralogy: {
    id: 'mineralogy',
    name: 'Mineralogy / hydrated minerals',
    source: 'CRISM, Mars Reconnaissance Orbiter',
    purpose: 'Science layer and science-opportunity suggestions',
    category: 'observed',
    url: env.VITE_NASA_MINERALOGY_URL ?? '',
    placeholder: 'Not shown yet',
  },
  thermal: {
    id: 'thermal',
    name: 'Thermal inertia / surface temperature',
    source: 'THEMIS, Mars Odyssey',
    purpose: 'Terrain and surface-condition layer',
    category: 'observed',
    url: env.VITE_NASA_THERMAL_URL ?? '',
    placeholder: 'Not shown yet',
  },
  roverTraverses: {
    id: 'rover-traverses',
    name: 'Rover traverses',
    source: 'Perseverance, Curiosity, Opportunity, Spirit mission data (PDS)',
    purpose: 'Historical mission layer',
    category: 'observed',
    url: env.VITE_NASA_TRAVERSES_URL ?? '',
    placeholder: 'Landing-site points only (src/data/mars.ts)',
  },
  placeNames: {
    id: 'place-names',
    name: 'Place names',
    source: 'IAU / USGS Gazetteer of Planetary Nomenclature',
    purpose: 'Searching for Martian locations by name',
    category: 'observed',
    url: env.VITE_NASA_PLACENAMES_URL ?? '',
    placeholder: 'Short hand-written list of landmarks (src/data/mars.ts)',
  },
} satisfies Record<string, NasaDataSource>

export const isConnected = (source: NasaDataSource) => source.url.trim() !== ''

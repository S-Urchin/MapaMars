// Close-up 3D scenes for landing sites. Positions are in meters from the lander: x east, z south.
// Heights are added from the terrain, and `lift` raises a point above the ground (e.g. onto the lander).

export type SitePoi = {
  id: string
  title: string
  text: string
  x: number
  z: number
  lift: number
  /** Where the callout card sits relative to its dot, in pixels. */
  card: [number, number]
}

export type SiteScene = {
  siteId: string
  /** Seed for the procedural terrain, so each site keeps its own layout. */
  seed: number
  boulders: { x: number; z: number; size: [number, number, number] }[]
  trenches: { from: [number, number]; to: [number, number] }[]
  pois: SitePoi[]
}

export const siteScenes: Record<string, SiteScene> = {
  vl1: {
    siteId: 'vl1',
    seed: 1976,
    boulders: [{ x: -6.2, z: -5, size: [1.1, 0.75, 0.9] }], // Big Joe
    trenches: [
      { from: [2.2, 1.2], to: [3.5, 2.1] },
      { from: [2.6, 0.2], to: [3.8, 0.7] },
    ],
    pois: [
      {
        id: 'touchdown',
        title: 'Touchdown · 20 July 1976',
        text: 'Viking 1 set down on the western slope of Chryse Planitia, the first successful US landing on Mars.',
        x: 0, z: 0, lift: 2.4,
        card: [-60, -170],
      },
      {
        id: 'panoramas',
        title: 'First surface panoramas captured here',
        text: 'Two scanning cameras on the lander deck sent back the first image from the surface within minutes of landing, then full 360° views of a rock-strewn plain.',
        x: 0.7, z: 0.6, lift: 1.9,
        card: [70, -130],
      },
      {
        id: 'trench',
        title: 'Trench dug for soil composition analysis',
        text: 'The sampler arm scooped soil into the lander: an X-ray fluorescence spectrometer measured its elements, and three biology experiments tested it for signs of life.',
        x: 3.1, z: 1.6, lift: 0.1,
        card: [110, 40],
      },
      {
        id: 'big-joe',
        title: '“Big Joe” boulder',
        text: 'A boulder about 2 m across, some 8 m from the lander — one of the most photographed rocks of the mission.',
        x: -6.2, z: -5, lift: 0.8,
        card: [-200, -30],
      },
      {
        id: 'weather',
        title: 'First weather reports from Mars',
        text: 'A meteorology boom logged temperature, pressure and wind every sol, from pre-dawn lows near −85 °C to afternoon highs near −30 °C.',
        x: -1.1, z: 0.9, lift: 1.7,
        card: [-210, 80],
      },
      {
        id: 'drifts',
        title: 'Wind-blown drift deposits',
        text: 'Fine sediment banked into drifts between the rocks, showing that wind is still reshaping the surface today.',
        x: 9, z: -7, lift: 0.1,
        card: [60, -90],
      },
    ],
  },
}

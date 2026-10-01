import type { MoonId } from './marsSky'

export type MoonInfo = {
  id: MoonId
  name: string
  designation: string
  meaning: string
  size: string
  mass: string
  density: string
  distance: string
  escapeSpeed: string
  discovered: string
  /** Short paragraphs of background, shown in order */
  background: string[]
  /** How it looks and moves from the surface */
  fromSurface: string
}

export const moonInfo: Record<MoonId, MoonInfo> = {
  phobos: {
    id: 'phobos',
    name: 'Phobos',
    designation: 'Mars I',
    meaning: 'Greek for "fear" or "panic"; in myth a son of Ares, the Greek Mars.',
    size: '27 × 22 × 18 km',
    mass: '1.07 × 10¹⁶ kg',
    density: '≈ 1.9 g/cm³',
    distance: '9,375 km from Mars’s centre (about 6,000 km above the surface)',
    escapeSpeed: '≈ 11 m/s',
    discovered: 'August 1877, Asaph Hall, US Naval Observatory',
    background: [
      'Phobos is the larger and inner moon. It orbits closer to its planet than any other moon in the Solar System and goes round Mars faster than Mars turns, about three times per sol.',
      'It is one of the darkest objects in the Solar System, reflecting only about 7% of the light that hits it. Its low density suggests a porous, rubble-like interior.',
      'Its biggest feature is Stickney, a crater about 9 km across, nearly a third of the moon’s width. Long parallel grooves cross much of the surface.',
      'Tides from Mars are slowly pulling Phobos inward, by roughly 2 m per century. In some tens of millions of years it is expected to break apart into a ring or hit the planet.',
      'Its origin is still debated: a captured asteroid, or debris thrown up by a giant impact on Mars. JAXA’s Martian Moons eXploration (MMX) mission is designed to bring a sample back to Earth to settle it.',
    ],
    fromSurface: 'Rises in the west and sets in the east, about twice a sol. From the equator it looks about a third as wide as our full Moon. It stays below the horizon for anyone above about 70° latitude.',
  },
  deimos: {
    id: 'deimos',
    name: 'Deimos',
    designation: 'Mars II',
    meaning: 'Greek for "dread" or "terror"; the twin brother of Phobos in myth.',
    size: '15 × 12 × 11 km',
    mass: '1.48 × 10¹⁵ kg',
    density: '≈ 1.5 g/cm³',
    distance: '23,457 km from Mars’s centre (about 20,000 km above the surface)',
    escapeSpeed: '≈ 6 m/s',
    discovered: 'August 1877, Asaph Hall, a week before Phobos',
    background: [
      'Deimos is the smaller, outer moon. It orbits a little farther out than the height where an orbit would keep pace with Mars’s spin, so it drifts slowly across the sky.',
      'Its surface is smoother than Phobos’s: a thick blanket of fine dust fills in most craters. Only two craters are named, Swift and Voltaire.',
      'Because it orbits outside that keep-pace height, tides push Deimos very slowly outward rather than pulling it in.',
      'Like Phobos it is dark and low in density, and it shares the same open question about where the moons came from.',
    ],
    fromSurface: 'Looks like a bright star rather than a disk. It rises in the east and, because it only just outruns the planet’s spin, stays above the horizon for about two and a half sols.',
  },
}

export const rotationInfo = [
  'Mars spins once every 24 h 37 min 23 s relative to the stars (a sidereal day). A solar day, called a sol, is a little longer at 24 h 39 min 35 s because Mars also moves along its orbit.',
  'Its axis is tilted about 25°, close to Earth’s 23.4°, so Mars has seasons. They last roughly twice as long as Earth’s because a Mars year is 687 Earth days. Seasons are tracked with Ls, the Sun’s position along Mars’s orbit (0° is northern spring).',
]

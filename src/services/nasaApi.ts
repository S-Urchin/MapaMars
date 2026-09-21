export type Mission = {
  title: string
  agency: string
  updated: string
  type: string
  status: string
  category: string
  description: string
  imageClass: string
}

// Replace this mock with fetch calls to the backend once the API is available.
export const featuredMissions: Mission[] = [
  {
    title: 'Earth at night',
    agency: 'NASA Earthdata',
    updated: 'Updated 12 min ago',
    type: 'Earth science',
    status: 'Live feed',
    category: 'Earth science',
    description: 'A satellite view of human activity after dark, stitched from global observations.',
    imageClass: 'earth',
  },
  {
    title: 'Europa Clipper',
    agency: 'JPL / NASA',
    updated: 'Updated 26 min ago',
    type: 'Deep space',
    status: 'En route',
    category: 'Deep space',
    description: 'Following the spacecraft on its journey to study the icy moon and its hidden ocean.',
    imageClass: 'orbit',
  },
  {
    title: 'Solar dynamics',
    agency: 'NASA Heliophysics',
    updated: 'Updated 41 min ago',
    type: 'Deep space',
    status: 'Monitoring',
    category: 'Deep space',
    description: 'Tracking an active solar region as it rotates into view of Earth-facing instruments.',
    imageClass: 'solar',
  },
]

export async function getMissions(): Promise<Mission[]> {
  const response = await fetch('/api/missions')
  if (!response.ok) throw new Error('Unable to load mission data')
  return response.json() as Promise<Mission[]>
}

import { useEffect, useState } from 'react'

/** The current location hash, e.g. "#/missions/ABC-123", kept in sync with navigation. */
export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

// Set just before the home page jumps to the globe, so the globe page knows to play its arrival.
let arrivedByWarp = false

export const markWarpArrival = () => { arrivedByWarp = true }
export const isWarpArrival = () => arrivedByWarp
export const clearWarpArrival = () => { arrivedByWarp = false }

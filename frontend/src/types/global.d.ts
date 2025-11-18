declare global {
  interface WindowEventMap {
    dronePositionUpdate: CustomEvent<{
      lat: number
      lng: number
      alt: number
      speed: number
      battery: number
    }>
  }
}

export {}

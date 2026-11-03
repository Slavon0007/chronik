import L from 'leaflet'

declare global {
  interface Window {
    L: typeof L
  }
}

// leaflet.markercluster ships as a UMD plugin that expects a global L.
window.L = L

export {}

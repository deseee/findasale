// leafletSafePatch.ts: one-time guard for a Leaflet inertia race (Sentry FINDASALE-NEXTJS-15).
//
// After a touch drag, Leaflet's Map.Drag handler schedules map.panBy() in a
// requestAnimationFrame for inertia. If the map is removed before that frame runs
// (route change, modal close, component unmount), this._mapPane is undefined and
// DomUtil.addClass throws "Cannot read properties of undefined (reading 'classList')".
// Wrapping panBy so it is a no-op on a torn-down map removes the crash without
// changing behavior for a live map.
//
// Side-effect module: import it from every component that renders a Leaflet map.
// Those components are loaded with next/dynamic ssr:false, and the window check
// below keeps this safe even if it is ever imported during server render.

if (typeof window !== 'undefined') {
  // Leaflet is CJS: fall back to the module itself if .default is undefined.
  const leafletModule = require('leaflet');
  const L: any = leafletModule.default ?? leafletModule;
  const proto: any = L?.Map?.prototype;

  if (proto && !proto.__findasaleSafePanByPatched) {
    const originalPanBy = proto.panBy;
    proto.panBy = function safePanBy(this: any, ...args: any[]) {
      if (!this._mapPane) return this;
      return originalPanBy.apply(this, args);
    };
    proto.__findasaleSafePanByPatched = true;
  }
}

export {};

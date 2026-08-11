// Single source of truth for the rapidfire-capture crop rectangle (2026-08-11).
//
// Extracted from cropTo4x3() in pages/organizer/add-items/[saleId].tsx so the
// RapidCapture crop-preview guide overlay and the REAL post-capture crop can
// never drift apart again. Two rounds of guide-overlay fixes (CSS aspect-ratio,
// then JS-measured computeContainBox against the viewfinder container) both
// failed because the guide was sized against the on-screen DISPLAY container
// (what object-cover shows) instead of this rectangle (what cropTo4x3 actually
// keeps from the native captured frame). This function is the only place that
// math should ever live — both call sites import it.
//
// Math is a byte-identical port of the pre-existing cropTo4x3 logic (do not
// "improve" the rounding or ratio choice here without updating both call sites
// and re-verifying real capture output).
export function computeCropRect(
  sourceWidth: number,
  sourceHeight: number
): { sx: number; sy: number; sw: number; sh: number; targetRatio: number } {
  const isPortraitSource = sourceHeight > sourceWidth;
  const targetRatio = isPortraitSource ? 3 / 4 : 4 / 3;
  const srcRatio = sourceWidth / sourceHeight;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (srcRatio > targetRatio) {
    sw = Math.floor(sourceHeight * targetRatio);
    sx = Math.floor((sourceWidth - sw) / 2);
  } else {
    sh = Math.floor(sourceWidth / targetRatio);
    sy = Math.floor((sourceHeight - sh) / 2);
  }
  return { sx, sy, sw, sh, targetRatio };
}

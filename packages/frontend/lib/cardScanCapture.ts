/**
 * cardScanCapture (ADR-138 batch B6): the "steady and clear" capture machine for the card stand, plus the camera and
 * JPEG parameters the camera pane uses.
 *
 * Pure. No DOM, no React, no timers, no env reads: every function takes plain numbers and arrays and returns new plain
 * objects. The camera pane (batch B7) draws the video into a 32 by 24 canvas about 8 times a second, turns the pixels
 * into gray values with rgbaToGray(), and feeds each sample to stepCapture(). Tests feed synthetic arrays.
 * Run: npm test   (node:test through tsx)
 *
 * Why this exists (ADR-138 section 3.5): the duplicate-scan complaint comes from reading a card again while it is being
 * taken away. The machine has four phases:
 *
 *   EMPTY       the stand looks like the empty stand we learned. Waiting for something to arrive.
 *   SETTLING    the scene moved or is no longer empty. Waiting for it to hold still.
 *   CAPTURED    one sample long: a picture was just asked for (action CAPTURE).
 *   WAIT_CLEAR  the card has been captured. No new capture until the stand is seen empty again for clearSamples in a row.
 *
 * Safety choices (a missed capture is safe because the shutter button always works; a double count is not):
 *  - Nothing is captured until an empty stand has been learned (emptyRef), either by holding still for N samples or by
 *    teachEmptyStand(). Starting with a card already on the stand teaches the wrong scene: that card is ignored, and taking
 *    it away then captures the empty stand (which comes back as "no card found"). So the screen asks the seller to start
 *    with the stand empty, and can call teachEmptyStand() when the seller says it is.
 *  - After a capture the machine only re-arms after the stand matches the empty scene for clearSamples samples in a row.
 *    A hand that hovers over the card, or the card sitting still, never re-arms it.
 *  - Every capture bumps placementSeq. The camera pane sends it as placementId, so the server treats a second frame for
 *    the same placement as the same card (ADR-138 layer L2).
 *
 * UNVERIFIED: the thresholds in DEFAULT_CAPTURE_CONFIG are starting values. They must be tuned on a real phone in a real
 * stand (ADR-138 section 13.3, item 1). Auto capture ships OFF; the shutter button is the primary way to take a picture (D9).
 */

// ---------------------------------------------------------------------------
// Camera and JPEG parameters (RapidCapture.tsx getUserMedia constraints are the pattern)
// ---------------------------------------------------------------------------

/** The longest edge of the picture that is uploaded, in pixels (ADR-138 section 2.1). */
export const JPEG_LONG_EDGE = 1024;
/** JPEG quality for the first try. */
export const JPEG_QUALITY = 0.8;
/** Lower qualities to try, in order, when a picture is still over the size limit. */
export const JPEG_QUALITY_STEPS: readonly number[] = [0.8, 0.7, 0.6, 0.5];
/** The server refuses a frame above this many bytes (1.5 MB, ADR-138 section 11). */
export const MAX_FRAME_BYTES = 1572864;

/** Size of the small gray sample used to judge steadiness. */
export const SAMPLE_WIDTH = 32;
export const SAMPLE_HEIGHT = 24;
/** About 8 samples a second. */
export const SAMPLE_INTERVAL_MS = 125;
/** A second shutter tap sooner than this after the last picture is ignored (an accidental double tap). */
export const MANUAL_MIN_GAP_MS = 800;

export interface CameraConstraints {
  video: {
    facingMode: { ideal: string };
    width: { ideal: number };
    height: { ideal: number };
  };
  audio: false;
}

/** The same ideal size and facing mode as components/RapidCapture.tsx. Pass the result to navigator.mediaDevices.getUserMedia. */
export function buildCameraConstraints(facingMode: 'environment' | 'user' = 'environment'): CameraConstraints {
  return {
    video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1440 } },
    audio: false,
  };
}

export interface Downscale {
  width: number;
  height: number;
  scale: number;
}

/**
 * Output size for the uploaded picture: the long edge becomes `longEdge` (default 1024), the other edge keeps the ratio.
 * A picture already smaller than that is never enlarged. Returns null for a source size that is not usable.
 */
export function computeDownscale(srcWidth: number, srcHeight: number, longEdge: number = JPEG_LONG_EDGE): Downscale | null {
  if (!isFinite(srcWidth) || !isFinite(srcHeight) || srcWidth <= 0 || srcHeight <= 0) return null;
  if (!isFinite(longEdge) || longEdge <= 0) return null;
  const longest = Math.max(srcWidth, srcHeight);
  if (longest <= longEdge) return { width: Math.round(srcWidth), height: Math.round(srcHeight), scale: 1 };
  const scale = longEdge / longest;
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
    scale,
  };
}

/** True when a picture of this many bytes can be sent. */
export function frameFitsLimit(byteLength: number, maxBytes: number = MAX_FRAME_BYTES): boolean {
  return isFinite(byteLength) && byteLength > 0 && byteLength <= maxBytes;
}

/** The next lower JPEG quality to try after `current`, or null when there is none left. */
export function nextJpegQuality(current: number): number | null {
  for (let i = 0; i < JPEG_QUALITY_STEPS.length; i += 1) {
    if (JPEG_QUALITY_STEPS[i] < current - 0.0001) return JPEG_QUALITY_STEPS[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Frame metrics (pure functions over gray samples)
// ---------------------------------------------------------------------------

/** Gray values 0..255 from RGBA pixel data (for example ImageData.data). One value per pixel. */
export function rgbaToGray(rgba: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    out.push(Math.round((rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000));
  }
  return out;
}

/**
 * Mean absolute difference between two gray samples, scaled to 0..1 (0 is identical, 1 is black against white).
 * Samples of different length (the camera changed size) or empty samples count as fully different.
 */
export function meanAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d < 0 ? -d : d;
  }
  const v = sum / (a.length * 255);
  return v > 1 ? 1 : v;
}

function copyGray(g: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.length; i += 1) out.push(g[i]);
  return out;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export type CapturePhase = 'EMPTY' | 'SETTLING' | 'CAPTURED' | 'WAIT_CLEAR';

export interface CaptureConfig {
  /** Mean difference between two neighbouring samples above which the scene counts as moving. */
  motionThreshold: number;
  /** Consecutive still samples that count as holding still (N). */
  stillSamples: number;
  /** Mean difference from the empty scene at or above which something is on the stand. */
  presenceThreshold: number;
  /** Consecutive samples that must look like the empty scene before the machine arms again (M). */
  clearSamples: number;
  /** Samples spent in WAIT_CLEAR after which the screen should offer a reset (about 10 seconds). */
  stuckSamples: number;
}

/** UNVERIFIED starting values: tune on a real phone in a real stand. */
export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  motionThreshold: 0.03,
  stillSamples: 6,
  presenceThreshold: 0.08,
  clearSamples: 4,
  stuckSamples: 80,
};

export interface CaptureSample {
  /** Gray values 0..255 (see rgbaToGray). The same length every time for one camera. */
  gray: ArrayLike<number>;
  /** A millisecond clock reading, used only for the shutter debounce. */
  atMs: number;
}

export interface CaptureState {
  phase: CapturePhase;
  /** Text put in front of the sequence number so ids stay unique after a page reload within one session. */
  idPrefix: string;
  /** Number of placements issued so far. The first capture is 1. */
  placementSeq: number;
  prev: number[] | null;
  /** The learned look of the empty stand, or null until the stand has held still once. */
  emptyRef: number[] | null;
  stillCount: number;
  /** WAIT_CLEAR: consecutive samples that look like the empty stand. */
  emptyCount: number;
  /** WAIT_CLEAR: samples spent waiting. */
  waitSamples: number;
  lastCaptureAtMs: number | null;
}

export type CaptureAction = 'NONE' | 'CAPTURE';

export interface CaptureStep {
  state: CaptureState;
  action: CaptureAction;
  /** Set when action is CAPTURE. */
  placementId: string | null;
  placementSeq: number | null;
  /** The motion measured for this sample (0 for the first sample). Handy for a debug meter. */
  motion: number;
}

/** The id sent to the server for one placement. Unique per session as long as the prefix is unique per page load. */
export function formatPlacementId(idPrefix: string, seq: number): string {
  return idPrefix === '' ? String(seq) : idPrefix + '-' + String(seq);
}

/** A short prefix from a clock reading and a random number in [0, 1). Both are passed in so the function stays pure. */
export function makeIdPrefix(nowMs: number, random01: number): string {
  const r = random01 >= 0 && random01 < 1 ? random01 : 0;
  return Math.floor(nowMs).toString(36) + Math.floor(r * 1296).toString(36);
}

export function createCaptureState(idPrefix = ''): CaptureState {
  return {
    phase: 'EMPTY',
    idPrefix,
    placementSeq: 0,
    prev: null,
    emptyRef: null,
    stillCount: 0,
    emptyCount: 0,
    waitSamples: 0,
    lastCaptureAtMs: null,
  };
}

/** Back to a fresh machine. Keeps the id prefix and the placement count so ids never repeat. */
export function resetCapture(state: CaptureState): CaptureState {
  const fresh = createCaptureState(state.idPrefix);
  fresh.placementSeq = state.placementSeq;
  fresh.lastCaptureAtMs = state.lastCaptureAtMs;
  return fresh;
}

/** The seller says the stand is empty right now: learn this scene as the empty one and wait for a card. */
export function teachEmptyStand(state: CaptureState, sample: CaptureSample): CaptureState {
  const gray = copyGray(sample.gray);
  return {
    phase: 'EMPTY',
    idPrefix: state.idPrefix,
    placementSeq: state.placementSeq,
    prev: gray.length > 0 ? gray : state.prev,
    emptyRef: gray.length > 0 ? gray : state.emptyRef,
    stillCount: 0,
    emptyCount: 0,
    waitSamples: 0,
    lastCaptureAtMs: state.lastCaptureAtMs,
  };
}

/** The placement id of the most recent capture, or null before the first one. Use it to retake the same card. */
export function currentPlacementId(state: CaptureState): string | null {
  return state.placementSeq > 0 ? formatPlacementId(state.idPrefix, state.placementSeq) : null;
}

/** True when the machine has waited a long time for the stand to be clear, so the screen can offer a reset. */
export function isWaitingTooLong(state: CaptureState, config: CaptureConfig = DEFAULT_CAPTURE_CONFIG): boolean {
  return state.phase === 'WAIT_CLEAR' && state.waitSamples >= config.stuckSamples;
}

/**
 * Feeds one sample to the machine and returns the next state plus what to do.
 * The input state is never changed.
 */
export function stepCapture(state: CaptureState, sample: CaptureSample, config: CaptureConfig = DEFAULT_CAPTURE_CONFIG): CaptureStep {
  const gray = copyGray(sample.gray);
  const motion = state.prev ? meanAbsDiff(state.prev, gray) : 0;
  const moving = motion > config.motionThreshold;

  let phase: CapturePhase = state.phase;
  let emptyRef = state.emptyRef;
  let stillCount = state.stillCount;
  let emptyCount = state.emptyCount;
  let waitSamples = state.waitSamples;
  let placementSeq = state.placementSeq;
  let lastCaptureAtMs = state.lastCaptureAtMs;
  let action: CaptureAction = 'NONE';

  // The one-sample CAPTURED phase hands over to WAIT_CLEAR, and this sample already counts there.
  if (phase === 'CAPTURED') {
    phase = 'WAIT_CLEAR';
    stillCount = 0;
    emptyCount = 0;
    waitSamples = 0;
  }

  if (phase === 'EMPTY') {
    const present = emptyRef !== null && meanAbsDiff(emptyRef, gray) >= config.presenceThreshold;
    if (moving || present) {
      phase = 'SETTLING';
      stillCount = moving ? 0 : 1;
    } else {
      stillCount = stillCount + 1;
      if (stillCount >= config.stillSamples) {
        // The stand has held still and looks clear: remember it as the empty scene.
        emptyRef = gray;
        stillCount = config.stillSamples;
      }
    }
  } else if (phase === 'SETTLING') {
    stillCount = moving ? 0 : stillCount + 1;
    if (stillCount >= config.stillSamples) {
      if (emptyRef === null) {
        // Nothing to compare with yet: learn this scene as the empty stand and do not capture.
        emptyRef = gray;
        phase = 'EMPTY';
        stillCount = config.stillSamples;
      } else if (meanAbsDiff(emptyRef, gray) >= config.presenceThreshold) {
        placementSeq = placementSeq + 1;
        lastCaptureAtMs = sample.atMs;
        action = 'CAPTURE';
        phase = 'CAPTURED';
        stillCount = 0;
        emptyCount = 0;
        waitSamples = 0;
      } else {
        // It settled back to the empty look (a hand went by). No capture.
        phase = 'EMPTY';
        stillCount = config.stillSamples;
      }
    }
  } else if (phase === 'WAIT_CLEAR') {
    waitSamples = waitSamples + 1;
    stillCount = moving ? 0 : stillCount + 1;
    const looksEmpty = emptyRef !== null && meanAbsDiff(emptyRef, gray) < config.presenceThreshold;
    emptyCount = looksEmpty ? emptyCount + 1 : 0;
    if (emptyCount >= config.clearSamples) {
      phase = 'EMPTY';
      stillCount = 0;
      emptyCount = 0;
      waitSamples = 0;
    }
  }

  const next: CaptureState = {
    phase,
    idPrefix: state.idPrefix,
    placementSeq,
    prev: gray,
    emptyRef,
    stillCount,
    emptyCount,
    waitSamples,
    lastCaptureAtMs,
  };
  return {
    state: next,
    action,
    placementId: action === 'CAPTURE' ? formatPlacementId(state.idPrefix, placementSeq) : null,
    placementSeq: action === 'CAPTURE' ? placementSeq : null,
    motion,
  };
}

export interface ManualCaptureResult {
  state: CaptureState;
  accepted: boolean;
  /** Why a tap was refused. Only TOO_SOON exists today. */
  reason: 'TOO_SOON' | null;
  placementId: string | null;
  placementSeq: number | null;
}

/**
 * The seller tapped the shutter. A tap always starts a new placement (so a second copy of the same card is a second entry),
 * except that a tap within MANUAL_MIN_GAP_MS of the last picture is refused as an accidental double tap. To take the SAME
 * card again, reuse currentPlacementId() instead of calling this.
 *
 * The machine moves to WAIT_CLEAR, so auto capture (when it is on) does not take the same card a second time.
 * With auto capture off, pass the latest sample if there is one, or { gray: [], atMs } when nothing is being sampled.
 */
export function registerManualCapture(state: CaptureState, sample: CaptureSample, minGapMs: number = MANUAL_MIN_GAP_MS): ManualCaptureResult {
  if (state.lastCaptureAtMs !== null && sample.atMs - state.lastCaptureAtMs < minGapMs) {
    return { state, accepted: false, reason: 'TOO_SOON', placementId: null, placementSeq: null };
  }
  const seq = state.placementSeq + 1;
  const gray = copyGray(sample.gray);
  const next: CaptureState = {
    phase: 'WAIT_CLEAR',
    idPrefix: state.idPrefix,
    placementSeq: seq,
    prev: gray.length > 0 ? gray : state.prev,
    emptyRef: state.emptyRef,
    stillCount: 0,
    emptyCount: 0,
    waitSamples: 0,
    lastCaptureAtMs: sample.atMs,
  };
  return { state: next, accepted: true, reason: null, placementId: formatPlacementId(state.idPrefix, seq), placementSeq: seq };
}

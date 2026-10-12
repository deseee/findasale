/**
 * cardScanCapture (ADR-138 batch B6, AT-31): the steady and clear capture machine, with synthetic gray samples.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CAPTURE_CONFIG,
  JPEG_LONG_EDGE,
  JPEG_QUALITY,
  MANUAL_MIN_GAP_MS,
  MAX_FRAME_BYTES,
  buildCameraConstraints,
  computeDownscale,
  createCaptureState,
  currentPlacementId,
  formatPlacementId,
  frameFitsLimit,
  isWaitingTooLong,
  makeIdPrefix,
  meanAbsDiff,
  nextJpegQuality,
  registerManualCapture,
  resetCapture,
  rgbaToGray,
  stepCapture,
  teachEmptyStand,
  type CaptureConfig,
  type CaptureState,
} from '../cardScanCapture';

const SIZE = 32 * 24;

/** A flat scene at one brightness. `tick` adds a tiny flicker (1 level) that stays far below the motion threshold. */
function scene(level: number, tick = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < SIZE; i += 1) out.push(level + (tick % 2));
  return out;
}

const EMPTY = 100;
const CARD_A = 200;
const CARD_B = 30;
const HAND = 60;

interface Feeder {
  state: CaptureState;
  clock: number;
  tick: number;
  /** Sample index (0 based, over the whole run) of every CAPTURE action. */
  captureAt: number[];
  seqs: number[];
  ids: Array<string | null>;
  count: number;
}

function newFeeder(config?: CaptureConfig, prefix = 'p'): Feeder & { config: CaptureConfig } {
  return {
    state: createCaptureState(prefix),
    clock: 0,
    tick: 0,
    captureAt: [],
    seqs: [],
    ids: [],
    count: 0,
    config: config || DEFAULT_CAPTURE_CONFIG,
  };
}

function feed(f: Feeder & { config: CaptureConfig }, level: number, n: number): void {
  for (let i = 0; i < n; i += 1) {
    f.clock += 125;
    f.tick += 1;
    const step = stepCapture(f.state, { gray: scene(level, f.tick), atMs: f.clock }, f.config);
    f.state = step.state;
    if (step.action === 'CAPTURE') {
      f.captureAt.push(f.count);
      f.seqs.push(step.placementSeq as number);
      f.ids.push(step.placementId);
    }
    f.count += 1;
  }
}

test('a card that holds still is captured exactly once, and staying still never captures again', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10); // the empty stand is learned
  assert.equal(f.captureAt.length, 0);
  feed(f, CARD_A, 8);
  assert.equal(f.captureAt.length, 1, 'one capture after the card settled');
  // First card sample is the move; then six still samples; the capture is on the sixth.
  assert.equal(f.captureAt[0], 10 + 6);
  assert.deepEqual(f.seqs, [1]);
  assert.deepEqual(f.ids, ['p-1']);
  feed(f, CARD_A, 200);
  assert.equal(f.captureAt.length, 1, 'no second capture while the same card stays there');
  assert.equal(f.state.phase, 'WAIT_CLEAR');
});

test('removing the card and placing a new one gives a second capture with the next placement id', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  feed(f, CARD_A, 12);
  feed(f, EMPTY, 12); // card taken away, stand seen empty
  assert.equal(f.state.phase, 'EMPTY');
  feed(f, CARD_B, 12);
  assert.equal(f.captureAt.length, 2);
  assert.deepEqual(f.seqs, [1, 2], 'placementSeq goes up by one');
  assert.deepEqual(f.ids, ['p-1', 'p-2']);
});

test('the same card put down twice, one after the other, is two placements', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  for (let copy = 0; copy < 4; copy += 1) {
    feed(f, CARD_A, 12);
    feed(f, EMPTY, 10);
  }
  assert.deepEqual(f.seqs, [1, 2, 3, 4]);
});

test('motion never captures', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  // A scene that changes on every sample never holds still.
  for (let i = 0; i < 300; i += 1) feed(f, i % 2 === 0 ? CARD_A : CARD_B, 1);
  assert.equal(f.captureAt.length, 0);
  assert.equal(f.state.phase, 'SETTLING');
});

test('a hand that hovers over the captured card, then leaves, does not capture it again', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  feed(f, CARD_A, 12);
  assert.equal(f.captureAt.length, 1);
  feed(f, HAND, 40); // hand over the card: not the empty stand
  feed(f, CARD_A, 40); // hand gone, card still there
  assert.equal(f.captureAt.length, 1);
  assert.equal(f.state.phase, 'WAIT_CLEAR');
});

test('a hand that passes over the empty stand and leaves does not capture', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  feed(f, HAND, 4);
  feed(f, EMPTY, 20);
  assert.equal(f.captureAt.length, 0);
  assert.equal(f.state.phase, 'EMPTY');
});

test('nothing is captured before an empty stand has been learned', () => {
  const f = newFeeder();
  feed(f, CARD_A, 3); // moving in from nothing, never held still on an empty stand
  feed(f, CARD_B, 3);
  assert.equal(f.captureAt.length, 0);
});

test('teachEmptyStand lets the seller say the stand is empty right now', () => {
  const f = newFeeder();
  f.state = teachEmptyStand(f.state, { gray: scene(EMPTY), atMs: 0 });
  assert.equal(f.state.phase, 'EMPTY');
  feed(f, CARD_A, 8);
  assert.equal(f.captureAt.length, 1);
});

test('thresholds are injectable', () => {
  // Quicker: 3 still samples and a loose presence test.
  const quick: CaptureConfig = { ...DEFAULT_CAPTURE_CONFIG, stillSamples: 3 };
  const a = newFeeder(quick);
  feed(a, EMPTY, 6);
  feed(a, CARD_A, 6);
  assert.equal(a.captureAt[0], 6 + 3, 'captures after three still samples');

  // Presence threshold above anything the scene can reach: never a card.
  const deaf: CaptureConfig = { ...DEFAULT_CAPTURE_CONFIG, presenceThreshold: 0.99 };
  const b = newFeeder(deaf);
  feed(b, EMPTY, 10);
  feed(b, CARD_A, 30);
  assert.equal(b.captureAt.length, 0);

  // A low motion threshold treats the flicker as motion and never settles.
  const jumpy: CaptureConfig = { ...DEFAULT_CAPTURE_CONFIG, motionThreshold: 0.001 };
  const c = newFeeder(jumpy);
  feed(c, EMPTY, 10);
  feed(c, CARD_A, 30);
  assert.equal(c.captureAt.length, 0);

  // More clear samples needed before the machine arms again.
  const slow: CaptureConfig = { ...DEFAULT_CAPTURE_CONFIG, clearSamples: 10 };
  const d = newFeeder(slow);
  feed(d, EMPTY, 10);
  feed(d, CARD_A, 12);
  feed(d, EMPTY, 6);
  assert.equal(d.state.phase, 'WAIT_CLEAR', 'six empty samples are not enough for ten');
  feed(d, EMPTY, 6);
  assert.equal(d.state.phase, 'EMPTY');
});

test('stepCapture never changes the state it was given', () => {
  const s0 = createCaptureState('x');
  const frozen = JSON.stringify(s0);
  const step = stepCapture(s0, { gray: scene(EMPTY), atMs: 1 });
  assert.equal(JSON.stringify(s0), frozen);
  assert.notEqual(step.state, s0);
});

test('a camera that changes size counts as motion, not a crash', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  const step = stepCapture(f.state, { gray: [1, 2, 3], atMs: 9999 });
  assert.equal(step.motion, 1);
  assert.equal(step.action, 'NONE');
});

test('the shutter: a tap is a new placement, a quick second tap is refused, and auto capture does not repeat the card', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  feed(f, CARD_A, 3);
  const t0 = f.clock + 10;
  const first = registerManualCapture(f.state, { gray: scene(CARD_A), atMs: t0 });
  assert.equal(first.accepted, true);
  assert.equal(first.placementSeq, 1);
  assert.equal(first.placementId, 'p-1');
  assert.equal(first.state.phase, 'WAIT_CLEAR');

  const tooSoon = registerManualCapture(first.state, { gray: scene(CARD_A), atMs: t0 + MANUAL_MIN_GAP_MS - 1 });
  assert.equal(tooSoon.accepted, false);
  assert.equal(tooSoon.reason, 'TOO_SOON');
  assert.equal(tooSoon.state.placementSeq, 1, 'a refused tap does not use up a placement');

  const second = registerManualCapture(first.state, { gray: scene(CARD_A), atMs: t0 + MANUAL_MIN_GAP_MS });
  assert.equal(second.accepted, true);
  assert.equal(second.placementSeq, 2);

  // Auto capture keeps quiet for a card the shutter already took.
  f.state = first.state;
  feed(f, CARD_A, 50);
  assert.equal(f.captureAt.length, 0);
  assert.equal(currentPlacementId(first.state), 'p-1', 'a retake of the same card reuses this id');
});

test('the shutter works with no sampling at all (auto capture off)', () => {
  const s0 = createCaptureState('q');
  const r = registerManualCapture(s0, { gray: [], atMs: 5 });
  assert.equal(r.accepted, true);
  assert.equal(r.placementId, 'q-1');
  assert.equal(currentPlacementId(createCaptureState('q')), null);
});

test('waiting too long for a clear stand is reported, and a reset keeps ids moving forward', () => {
  const f = newFeeder();
  feed(f, EMPTY, 10);
  feed(f, CARD_A, 12);
  assert.equal(isWaitingTooLong(f.state), false);
  feed(f, CARD_A, DEFAULT_CAPTURE_CONFIG.stuckSamples);
  assert.equal(isWaitingTooLong(f.state), true);
  const again = resetCapture(f.state);
  assert.equal(again.phase, 'EMPTY');
  assert.equal(again.emptyRef, null);
  assert.equal(again.placementSeq, 1, 'ids are never reused');
  assert.equal(again.idPrefix, 'p');
});

test('ids: placement ids and the per-load prefix', () => {
  assert.equal(formatPlacementId('', 3), '3');
  assert.equal(formatPlacementId('abc', 3), 'abc-3');
  assert.equal(makeIdPrefix(0, 0), '00');
  assert.notEqual(makeIdPrefix(1700000000000, 0.1), makeIdPrefix(1700000000001, 0.1));
  assert.equal(makeIdPrefix(36, 5), '100', 'a bad random value is treated as zero');
});

test('frame metrics', () => {
  assert.equal(meanAbsDiff([0, 0], [255, 255]), 1);
  assert.equal(meanAbsDiff([10, 20], [10, 20]), 0);
  assert.equal(meanAbsDiff([], []), 1);
  assert.equal(meanAbsDiff([1, 2], [1]), 1);
  assert.deepEqual(rgbaToGray([255, 255, 255, 255, 0, 0, 0, 255]), [255, 0]);
  assert.deepEqual(rgbaToGray([255, 0, 0, 255]), [76]);
  assert.deepEqual(rgbaToGray([1, 2, 3]), [], 'a partial pixel is ignored');
});

test('JPEG parameters: long edge 1024, quality 0.8, no enlarging', () => {
  assert.equal(JPEG_LONG_EDGE, 1024);
  assert.equal(JPEG_QUALITY, 0.8);
  assert.deepEqual(computeDownscale(1920, 1440), { width: 1024, height: 768, scale: 1024 / 1920 });
  assert.deepEqual(computeDownscale(1440, 1920), { width: 768, height: 1024, scale: 1024 / 1920 });
  assert.deepEqual(computeDownscale(800, 600), { width: 800, height: 600, scale: 1 });
  assert.deepEqual(computeDownscale(1024, 1024), { width: 1024, height: 1024, scale: 1 });
  assert.equal(computeDownscale(0, 100), null);
  assert.equal(computeDownscale(NaN, 100), null);
  assert.equal(computeDownscale(100, 100, 0), null);
  const tall = computeDownscale(4000, 10);
  assert.ok(tall && tall.width === 1024 && tall.height === 3, 'the short edge never reaches zero');
  const sliver = computeDownscale(100000, 10);
  assert.ok(sliver && sliver.height === 1);
});

test('frame size limit and the quality steps', () => {
  assert.equal(MAX_FRAME_BYTES, 1572864);
  assert.equal(frameFitsLimit(MAX_FRAME_BYTES), true);
  assert.equal(frameFitsLimit(MAX_FRAME_BYTES + 1), false);
  assert.equal(frameFitsLimit(0), false);
  assert.equal(nextJpegQuality(0.8), 0.7);
  assert.equal(nextJpegQuality(0.7), 0.6);
  assert.equal(nextJpegQuality(0.5), null);
  assert.equal(nextJpegQuality(0.65), 0.6);
});

test('camera constraints match the RapidCapture pattern', () => {
  assert.deepEqual(buildCameraConstraints(), {
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
    audio: false,
  });
  assert.equal(buildCameraConstraints('user').video.facingMode.ideal, 'user');
});
